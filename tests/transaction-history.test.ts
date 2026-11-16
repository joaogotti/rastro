import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'vite'
import { literalSearch, normalizeHistoryFilters } from '../src/utils/transaction-history.ts'

const id = (index: number) => `603b2689-13aa-4c4e-bbca-${String(index).padStart(12, '0')}`
let user: string | null = 'user-a'
let rows: Record<string, unknown>[] = []
let mode = ''; let cap = 1000; let heads = 0
let onRequest: (() => void) | undefined
const requests: { method: string; url: URL }[] = []
const filters = { start: '2026-11-01', end: '2026-11-30', search: '', type: 'all' as const, categoryId: '', ascending: false }
function reset(size = 47) {
  user = 'user-a'; mode = ''; cap = 1000; heads = 0; onRequest = undefined; requests.length = 0
  rows = Array.from({ length: size }, (_, index) => ({ id: id(index), user_id: 'user-a', category_id: index % 2 ? id(9000) : null, type: index % 2 ? 'income' : 'expense', description: index === size - 1 ? 'Pesquisa.* (literal)' : `Registro ${index}`, amount: '0.29', transaction_date: '2026-11-04', notes: 'Preservar', created_at: null, updated_at: null }))
}
const sdk = createClient('https://history-test.supabase.co', 'public-test-key', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init) => {
    const url = new URL(String(input)); const method = init?.method ?? 'GET'
    assert.equal(url.pathname, '/rest/v1/transactions', 'Nenhuma operação em categorias ou outros registros')
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token-user-a')
    requests.push({ method, url })
    let visible = rows.filter((row) => row.user_id === url.searchParams.get('user_id')?.slice(3))
    for (const [field, filter] of url.searchParams) {
      if (['id', 'type', 'category_id', 'transaction_date'].includes(field)) {
        const value = filter.slice(filter.indexOf('.') + 1)
        if (filter.startsWith('eq.')) visible = visible.filter((row) => row[field] === value)
        if (filter.startsWith('gt.')) visible = visible.filter((row) => String(row[field]) > value)
        if (filter.startsWith('gte.')) visible = visible.filter((row) => String(row[field]) >= value)
        if (filter.startsWith('lte.')) visible = visible.filter((row) => String(row[field]) <= value)
        if (filter === 'is.null') visible = visible.filter((row) => row[field] === null)
      }
    }
    const search = url.searchParams.get('description')
    if (search) visible = visible.filter((row) => new RegExp(search.slice(7), 'i').test(String(row.description)))
    const cursor = url.searchParams.get('or')
    if (cursor) {
      const match = /transaction_date\.(gt|lt)\.([^,]+),and\(transaction_date.eq.([^,]+),id\.(?:gt|lt)\.([^()]+)\)/.exec(cursor)!
      assert.ok(match, 'Cursor contém somente data/UUID validados')
      visible = visible.filter((row) => { const comparison = String(row.transaction_date).localeCompare(match[2]) || String(row.id).localeCompare(match[4]); return match[1] === 'gt' ? comparison > 0 : comparison < 0 })
    }
    if (method === 'HEAD') {
      heads++
      onRequest?.()
      return new Response(null, { status: mode === 'head-error' ? 403 : 200, headers: mode === 'no-count' ? {} : { 'Content-Range': `*/${visible.length + (mode === 'changed' && heads > 1 ? 1 : 0)}` } })
    }
    if (method === 'DELETE') {
      assert.equal(url.searchParams.get('id'), `eq.${id(0)}`)
      onRequest?.()
      if (mode === 'error') return Response.json({ code: '42501', message: 'segredo' }, { status: 403 })
      if (mode === 'missing' || !visible.length) return Response.json(null)
      if (mode !== 'retained') rows = rows.filter((row) => !visible.includes(row))
      return Response.json(mode === 'wrong-owner' ? { ...visible[0], user_id: 'user-b' } : visible[0])
    }
    assert.equal(method, 'GET')
    const order = url.searchParams.get('order')!
    visible.sort((a, b) => order.startsWith('transaction_date') ? (String(a.transaction_date).localeCompare(String(b.transaction_date)) || String(a.id).localeCompare(String(b.id))) * (order.includes('.asc') ? 1 : -1) : String(a.id).localeCompare(String(b.id)))
    if (mode === 'later-error' && url.searchParams.get('id')?.startsWith('gt.')) return Response.json({ message: 'segredo' }, { status: 500 })
    if (mode === 'truncated' && url.searchParams.has('id')) visible = []
    visible = visible.slice(0, Math.min(Number(url.searchParams.get('limit')), cap))
    if (mode === 'wrong-owner' && visible.length) visible[0] = { ...visible[0], user_id: 'user-b' }
    onRequest?.()
    return Response.json(visible)
  } },
})
Object.defineProperty(globalThis, '__rastroHistoryClient', { configurable: true, value: {
  from: sdk.from.bind(sdk), auth: {
    getSession: async () => ({ data: { session: user ? { user: { id: user }, access_token: `token-${user}` } : null }, error: null }),
    getUser: async () => ({ data: { user: { id: user, email_confirmed_at: '2026-11-04' } }, error: null }),
  },
} })
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false, hmr: false }, plugins: [{ name: 'history-client', enforce: 'pre',
  resolveId(source) { if (source.endsWith('/lib/supabase.ts')) return '\0history-client' },
  load(moduleId) { if (moduleId === '\0history-client') return 'export const supabase = globalThis.__rastroHistoryClient' },
}] })
const history = await server.ssrLoadModule('/src/services/transaction-history.ts') as typeof import('../src/services/transaction-history.ts')
const { deleteTransaction } = await server.ssrLoadModule('/src/services/transactions.ts') as typeof import('../src/services/transactions.ts')
const options = { expectedUserId: 'user-a' }
test('histórico e exclusão — SDK real, transporte inteiramente simulado', async (t) => {
  try {
    await t.test('páginas limitadas, ordenação estável, cursor e servidor limitado a 7 registros', async () => {
      reset(); cap = 7
      const all: string[] = []; let cursor = null
      do {
        const result = await history.readTransactionPage(filters, cursor, options)
        assert.ok(result.transactions.length <= 20); assert.equal(result.count, 47)
        all.push(...result.transactions.map((row) => row.id)); cursor = result.next
      } while (cursor)
      assert.deepEqual(all, rows.map((row) => String(row.id)).reverse())
      assert.equal(new Set(all).size, 47)
      assert.ok(requests.filter((r) => r.method === 'GET').every((r) => Number(r.url.searchParams.get('limit')) <= 21))
      const oldest = await history.readTransactionPage({ ...filters, ascending: true }, null, options)
      assert.equal(oldest.transactions[0].id, id(0))
    })
    await t.test('pesquisa literal em todas as páginas e filtros combinados incluindo Sem categoria', async () => {
      reset()
      const result = await history.readTransactionPage({ ...filters, search: '  pesquisa.*   (literal) ' }, null, options)
      assert.equal(result.transactions.length, 1)
      const expense = await history.readTransactionPage({ ...filters, type: 'expense', categoryId: 'none' }, null, options)
      assert.ok(expense.transactions.every((row) => row.type === 'expense' && row.categoryId === null))
      assert.equal((await history.readTransactionPage({ ...filters, search: 'inexistente' }, null, options)).count, 0)
      assert.equal((await history.readTransactionPage({ ...filters, categoryId: id(9000), type: 'income' }, null, options)).count, 23)
    })
    await t.test('totais de 1507 registros ultrapassam limites de API sem truncar centavos', async () => {
      reset(1507); cap = 37
      const result = await history.readPeriodTotals(filters, options)
      assert.deepEqual(result, { income: 753 * 29, expenses: 754 * 29 })
      assert.ok(requests.filter((r) => r.method === 'GET').every((r) => r.url.searchParams.get('select') === 'id,user_id,type,amount,transaction_date'))
    })
    await t.test('totais falham inteiramente com truncamento, mudança de contagem, falha posterior ou contagem ausente', async () => {
      for (const state of ['truncated', 'changed', 'later-error', 'no-count', 'head-error', 'wrong-owner']) {
        reset(83); cap = 17; mode = state
        await assert.rejects(history.readPeriodTotals(filters, options))
      }
    })
    await t.test('validação recusa período, categoria ou cursor forjados antes de consultar', async () => {
      reset()
      assert.throws(() => normalizeHistoryFilters({ ...filters, end: '2026-02-30' }))
      assert.equal(literalSearch('.*%_()'), '\\.\\*%_\\(\\)')
      await assert.rejects(history.readTransactionPage({ ...filters, categoryId: 'id,or(user_id)' }))
      await assert.rejects(history.readTransactionPage(filters, { date: filters.start, id: 'id,forjado' }))
      assert.equal(requests.length, 0)
    })
    await t.test('sessão ausente/expirada ou trocada não publica página nem totais', async () => {
      reset(); user = null
      await assert.rejects(history.readTransactionPage(filters, null, options))
      await assert.rejects(history.readPeriodTotals(filters, options)); assert.equal(requests.length, 0)
      reset(); onRequest = () => { user = 'user-b' }
      await assert.rejects(history.readTransactionPage(filters, null, options))
    })
    await t.test('DELETE individual confirma retorno e ausência, sem tocar categorias', async () => {
      reset(); await deleteTransaction(id(0), options)
      assert.equal(rows.length, 46)
      assert.equal(requests.filter((r) => r.method === 'DELETE').length, 1)
      assert.equal(requests.at(-1)?.method, 'HEAD')
    })
    await t.test('DELETE não confirma erro, resposta vazia, registro ainda presente ou outra conta', async () => {
      for (const state of ['error', 'missing', 'retained', 'wrong-owner', 'head-error', 'no-count']) {
        reset(); mode = state
        await assert.rejects(deleteTransaction(id(0), options))
      }
      reset(); rows[0].user_id = 'user-b'
      await assert.rejects(deleteTransaction(id(0), options)); assert.equal(rows.length, 47)
    })
    await t.test('DELETE recusa ID forjado, logout, cancelamento e troca de conta durante envio', async () => {
      reset(); await assert.rejects(deleteTransaction('local-id', options)); assert.equal(requests.length, 0)
      user = null; await assert.rejects(deleteTransaction(id(0), options)); assert.equal(requests.length, 0)
      reset(); const controller = new AbortController(); controller.abort()
      await assert.rejects(deleteTransaction(id(0), { ...options, signal: controller.signal })); assert.equal(requests.length, 0)
      reset(); onRequest = () => { user = 'user-b' }
      await assert.rejects(deleteTransaction(id(0), options))
    })
  } finally { await server.close(); delete (globalThis as Record<string, unknown>).__rastroHistoryClient }
})
