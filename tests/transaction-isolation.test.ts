import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'vite'

// Modelo de autorização em memória. Não lê políticas nem acessa o banco real.
const accounts = ['account-a', 'account-b']
const ids = ['603b2689-13aa-4c4e-bbca-f50620b8e3be', '703b2689-13aa-4c4e-bbca-f50620b8e3be']
let session: string | null = accounts[0]
let rls = true
let rows: Record<string, unknown>[] = []
let categories: Record<string, unknown>[] = []
let onRequest: (() => void) | undefined
const requests: { method: string; url: URL }[] = []
function reset() {
  session = accounts[0]; rls = true; requests.length = 0; onRequest = undefined
  rows = accounts.map((user, index) => ({ id: ids[index], user_id: user, type: 'expense', description: `Privada ${index}`, amount: '10.00', transaction_date: '2026-11-04', category_id: null, notes: 'Privado', created_at: null, updated_at: null }))
  categories = [{ id: 'global', user_id: null, type: 'expense', name: 'Global' }, ...accounts.map((user, index) => ({ id: `private-${index}`, user_id: user, type: 'expense', name: `Particular ${index}` }))]
}
const sdk = createClient('https://isolation-test.supabase.co', 'public-test-key', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    requests.push({ method, url })
    const jwt = new Headers(init?.headers).get('Authorization')
    const actor = accounts.find((account) => jwt === `Bearer token-${account}`)
    if (!actor) return Response.json({ code: '42501' }, { status: 401 })
    const isCategory = url.pathname === '/rest/v1/categories'
    assert.ok(isCategory || url.pathname === '/rest/v1/transactions')
    if (isCategory) assert.equal(method, 'GET', 'Serviço de categorias desta etapa só faz leitura')
    // USING: a visibilidade depende da identidade do token, não do filtro enviado.
    let visible = (isCategory ? categories : rows).filter((row) => !rls || row.user_id === actor || (isCategory && row.user_id === null))
    for (const field of ['id', 'user_id']) {
      const filter = url.searchParams.get(field)
      if (filter?.startsWith('eq.')) visible = visible.filter((row) => row[field] === filter.slice(3))
      if (filter?.startsWith('gt.')) visible = visible.filter((row) => String(row[field]) > filter.slice(3))
    }
    if (method === 'PATCH') {
      const patch = JSON.parse(String(init?.body))
      // WITH CHECK: mesmo uma linha própria não pode trocar de proprietário.
      if (rls && visible.some((row) => ({ ...row, ...patch }).user_id !== actor)) return Response.json({ code: '42501' }, { status: 403 })
      visible.forEach((row) => Object.assign(row, patch))
    } else assert.equal(method, 'GET')
    onRequest?.()
    if (new Headers(init?.headers).get('Accept')?.includes('vnd.pgrst.object+json')) {
      return visible.length === 1 ? Response.json(visible[0]) : Response.json({ code: 'PGRST116' }, { status: 406 })
    }
    return Response.json(visible)
  } },
})
Object.defineProperty(globalThis, '__rastroIsolationClient', { configurable: true, value: {
  from: sdk.from.bind(sdk),
  auth: {
    getSession: async () => ({ data: { session: session ? { access_token: `token-${session}`, user: { id: session } } : null }, error: null }),
    getUser: async (token: string) => ({ data: { user: accounts.includes(token.slice(6)) ? { id: token.slice(6), email_confirmed_at: '2026-11-04' } : null }, error: null }),
  },
} })
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false, hmr: false }, plugins: [{
  name: 'isolation-client', enforce: 'pre',
  resolveId(source) { if (source.endsWith('/lib/supabase.ts')) return '\0isolation-client' },
  load(id) { if (id === '\0isolation-client') return 'export const supabase = globalThis.__rastroIsolationClient' },
}] })
const { readTransactions, updateTransaction } = await server.ssrLoadModule('/src/services/transactions.ts') as typeof import('../src/services/transactions.ts')
const { readCategories } = await server.ssrLoadModule('/src/services/categories.ts') as typeof import('../src/services/categories.ts')
const change = { type: 'expense' as const, name: 'Alterada', amount: 2590, date: '2026-11-04', categoryId: null }
const raw = (actor: string) => sdk.from('transactions').select('id,user_id').setHeader('Authorization', `Bearer token-${actor}`)
const patch = (actor: string, id: string) => sdk.from('transactions').update({ description: 'Ataque' }).eq('id', id).select('id').setHeader('Authorization', `Bearer token-${actor}`)

test('isolamento entre duas contas — políticas inteiramente simuladas', async (t) => {
  try {
    for (const [index, actor] of accounts.entries()) {
      const otherIndex = 1 - index
      await t.test(`${actor}: SELECT direto sem filtro e com ID/proprietário alheio (modelo RLS)`, async () => {
        reset()
        assert.deepEqual((await raw(actor)).data, [rows[index]])
        assert.deepEqual((await raw(actor).eq('id', ids[otherIndex])).data, [])
        assert.deepEqual((await raw(actor).eq('user_id', accounts[otherIndex])).data, [])
        assert.equal((await raw(actor).eq('id', ids[index])).data?.length, 1, 'controle positivo: linha própria existe e é visível')
      })
      await t.test(`${actor}: PATCH direto sem filtro de proprietário não modifica linha alheia (modelo RLS)`, async () => {
        reset()
        const before = structuredClone(rows[otherIndex])
        const denied = await patch(actor, ids[otherIndex])
        assert.equal(denied.error, null)
        assert.deepEqual(denied.data, [], 'HTTP bem-sucedido com zero linhas não confirma edição')
        assert.deepEqual(rows[otherIndex], before)
        const allowed = await patch(actor, ids[index])
        assert.equal(allowed.data?.length, 1, 'controle positivo: edição própria permitida')
      })
      await t.test(`${actor}: transferência de proprietário pela API direta é recusada (modelo WITH CHECK)`, async () => {
        reset()
        const before = structuredClone(rows)
        const result = await sdk.from('transactions').update({ user_id: accounts[otherIndex] }).eq('id', ids[index]).select().setHeader('Authorization', `Bearer token-${actor}`)
        assert.equal(result.error?.code, '42501')
        assert.deepEqual(rows, before)
      })
      await t.test(`${actor}: serviços reais restringem leitura/edição e não confirmam ID alheio`, async () => {
        reset(); session = actor
        const before = structuredClone(rows[otherIndex])
        const result = await readTransactions({ expectedUserId: actor })
        assert.deepEqual(result.map((row) => row.id), [ids[index]])
        await assert.rejects(updateTransaction(ids[otherIndex], change, { expectedUserId: actor }))
        assert.deepEqual(rows[otherIndex], before)
        assert.ok(requests.every(({ url }) => url.searchParams.get('user_id') === `eq.${actor}`))
      })
      await t.test(`${actor}: serviço de categorias preserva globais e próprias, ocultando particulares da outra conta (RLS simulado)`, async () => {
        reset(); session = actor
        const result = await readCategories({ expectedUserId: actor })
        assert.deepEqual(result.map((row) => row.id), ['global', `private-${index}`])
        const own = await sdk.from('categories').select('id').eq('id', `private-${index}`).setHeader('Authorization', `Bearer token-${actor}`)
        assert.equal(own.data?.length, 1, 'controle positivo: categoria particular própria existe')
        const foreign = await sdk.from('categories').select('id').eq('id', `private-${otherIndex}`).setHeader('Authorization', `Bearer token-${actor}`)
        assert.deepEqual(foreign.data, [])
      })
      await t.test(`${actor}: categoria particular alheia impede gravação antes do PATCH`, async () => {
        reset(); session = actor
        const before = structuredClone(rows)
        await assert.rejects(updateTransaction(ids[index], { ...change, categoryId: `private-${otherIndex}` }, { expectedUserId: actor }), /categoria compatível/)
        assert.ok(requests.every(({ method }) => method === 'GET'))
        assert.deepEqual(rows, before)
      })
      await t.test(`${actor}: categoria própria e global são aceitas sem mudar o proprietário da transação`, async () => {
        for (const categoryId of [`private-${index}`, 'global']) {
          reset(); session = actor
          const saved = await updateTransaction(ids[index], { ...change, categoryId }, { expectedUserId: actor })
          assert.equal(saved.categoryId, categoryId)
          assert.equal(saved.userId, actor)
          assert.equal(rows[otherIndex].category_id, null)
        }
      })
    }
    await t.test('controle negativo: RLS desativado no modelo expõe linha alheia pela API direta mesmo com serviços filtrando', async () => {
      reset(); rls = false
      assert.equal((await readTransactions()).length, 1, 'filtro do app ainda mascara ausência de RLS')
      assert.equal((await raw(accounts[0])).data?.length, 2, 'ataque direto ignora o filtro do app')
      assert.equal((await patch(accounts[0], ids[1])).data?.length, 1)
      assert.equal(rows[1].description, 'Ataque', 'apenas memória: prova de que o cenário detecta ausência de proteção')
    })
    await t.test('sem sessão não há leitura nem PATCH pelo serviço', async () => {
      reset(); session = null
      await assert.rejects(readTransactions())
      await assert.rejects(readCategories())
      await assert.rejects(updateTransaction(ids[1], change))
      assert.equal(requests.length, 0)
    })
    await t.test('troca de conta durante consulta de categorias descarta a resposta da sessão antiga', async () => {
      reset()
      onRequest = () => { session = accounts[1] }
      await assert.rejects(readCategories({ expectedUserId: accounts[0] }), /sessão/)
    })
    await t.test('categoria alheia devolvida com RLS desativado no modelo é recusada pelo serviço', async () => {
      reset(); rls = false
      await assert.rejects(readCategories({ expectedUserId: accounts[0] }), /formato esperado/)
    })
  } finally { await server.close(); delete (globalThis as Record<string, unknown>).__rastroIsolationClient }
})
