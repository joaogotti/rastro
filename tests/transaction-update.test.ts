import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'vite'

const id = '603b2689-13aa-4c4e-bbca-f50620b8e3be'
let user: string | null = 'user-a'
let owner = 'user-a'
let mode = ''
let onPatch: (() => void) | undefined
let requests = 0
let payload: Record<string, unknown> | null = null
const original = { id, user_id: 'user-a', type: 'expense', description: 'Original', amount: '10.00', category_id: null, transaction_date: '2026-11-04', notes: 'Preservar observação', created_at: '2026-11-01', updated_at: null }
const client = createClient('https://rastro-test.supabase.co', 'public-test-key', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init) => {
    const url = new URL(String(input))
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token-user-a')
    if (url.pathname.endsWith('/categories')) return Response.json(url.searchParams.has('id') ? [] : [
      { id: 'private-expense', name: 'Particular', user_id: 'user-a', type: 'expense' }, { id: 'global-income', name: 'Receita', user_id: null, type: 'income' },
    ])
    requests++
    assert.equal(init?.method, 'PATCH')
    assert.equal(url.searchParams.get('id'), `eq.${id}`)
    assert.equal(url.searchParams.get('user_id'), 'eq.user-a')
    assert.ok(url.searchParams.get('select')?.includes('notes'))
    payload = JSON.parse(String(init?.body))
    assert.deepEqual(Object.keys(payload!).sort(), ['amount', 'category_id', 'description', 'transaction_date', 'type'])
    onPatch?.()
    if (mode === 'error') return Response.json({ code: '42501', message: 'detalhe secreto' }, { status: 403 })
    if (mode === 'missing' || owner !== 'user-a') return Response.json(null)
    const row = { ...original, ...payload }
    if (mode === 'wrong-id') row.id = 'outro'
    if (mode === 'wrong-owner') row.user_id = 'user-b'
    if (mode === 'wrong-value') row.amount = '0.01'
    return Response.json(row)
  } },
})
Object.defineProperty(globalThis, '__rastroUpdateClient', { configurable: true, value: {
  from: client.from.bind(client),
  auth: {
    getSession: async () => ({ data: { session: user ? { access_token: `token-${user}`, user: { id: user } } : null }, error: null }),
    getUser: async () => ({ data: { user: { id: user, email_confirmed_at: '2026-11-04' } }, error: null }),
  },
} })
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false, hmr: false }, plugins: [{
  name: 'update-test-client', enforce: 'pre',
  resolveId(source) { if (source.endsWith('/lib/supabase.ts')) return '\0update-client' },
  load(moduleId) { if (moduleId === '\0update-client') return 'export const supabase = globalThis.__rastroUpdateClient' },
}] })
const { updateTransaction, TransactionUpdateError } = await server.ssrLoadModule('/src/services/transactions.ts') as typeof import('../src/services/transactions.ts')
const input = { type: 'expense' as const, name: '  Descrição editada  ', amount: 2590, date: '2026-12-03', categoryId: null }
const options = { expectedUserId: 'user-a' }
function reset() { user = 'user-a'; owner = 'user-a'; mode = ''; onPatch = undefined; requests = 0; payload = null }

test('edição com SDK oficial e transporte simulado', async (t) => {
  try {
    await t.test('edita descrição, data e valor, usa UUID/filtro de proprietário e preserva notes e created_at', async () => {
      reset()
      const saved = await updateTransaction(id, { ...input, notes: null, id: 'forjado', user_id: 'forjado', created_at: 'forjado' } as typeof input, options)
      assert.equal(saved.name, 'Descrição editada')
      assert.equal(saved.amount, 2590)
      assert.equal(saved.date, '2026-12-03')
      assert.equal(saved.notes, original.notes)
      assert.equal(saved.createdAt, original.created_at)
      assert.equal(saved.userId, original.user_id)
      assert.equal(payload?.amount, '25.90')
    })
    await t.test('altera despesa para receita e categoria usando ID; aceita categoria particular e remoção', async () => {
      for (const change of [{ type: 'income' as const, categoryId: 'global-income' }, { categoryId: 'private-expense' }, { categoryId: null }]) {
        reset()
        const saved = await updateTransaction(id, { ...input, ...change }, options)
        assert.equal(saved.categoryId, change.categoryId)
        assert.equal(saved.type, 'type' in change ? change.type : 'expense')
      }
    })
    await t.test('categoria incompatível ou inacessível impede PATCH', async () => {
      for (const categoryId of ['global-income', 'outro-usuario']) {
        reset()
        await assert.rejects(updateTransaction(id, { ...input, categoryId }, options), /categoria compatível/)
        assert.equal(requests, 0)
      }
    })
    await t.test('sessão ausente ou diferente impede PATCH; UUID inválido não é enviado', async () => {
      for (const identity of [null, 'user-b']) {
        reset(); user = identity
        await assert.rejects(updateTransaction(id, input, options), /sessão/)
        assert.equal(requests, 0)
      }
      reset()
      await assert.rejects(updateTransaction('id-local', input, options), /identificador/)
      assert.equal(requests, 0)
    })
    await t.test('registro de outro usuário não é atualizado nem confirmado (RLS simulado)', async () => {
      reset(); owner = 'user-b'
      await assert.rejects(updateTransaction(id, input, options), TransactionUpdateError)
    })
    await t.test('falha, ausência de registro e retorno inconsistente não confirmam atualização', async () => {
      for (const state of ['error', 'missing', 'wrong-id', 'wrong-owner', 'wrong-value']) {
        reset(); mode = state
        await assert.rejects(updateTransaction(id, input, options), (error: Error) => error instanceof TransactionUpdateError && !error.message.includes('secreto'))
      }
    })
    await t.test('troca de sessão durante PATCH descarta resposta antiga', async () => {
      reset(); onPatch = () => { user = 'user-b' }
      await assert.rejects(updateTransaction(id, input, options), /sessão/)
    })
    await t.test('cancelamento durante e antes do PATCH impede confirmação', async () => {
      reset()
      const controller = new AbortController()
      onPatch = () => controller.abort()
      await assert.rejects(updateTransaction(id, input, { ...options, signal: controller.signal }))
      reset()
      await assert.rejects(updateTransaction(id, input, { ...options, signal: controller.signal }))
      assert.equal(requests, 0)
    })
  } finally { await server.close(); delete (globalThis as Record<string, unknown>).__rastroUpdateClient }
})
