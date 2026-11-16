import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'vite'
import { validateTransactionWrite } from '../src/utils/transactions.ts'

let user: string | null = 'user-a'
let failure = false
let missing = false
let wrongOwner = false
let onInsert: (() => void) | undefined
let payload: Record<string, unknown> | null = null
let requests = 0
const client = createClient('https://rastro-test.supabase.co', 'public-test-key', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init) => {
    const url = new URL(String(input))
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer token-user-a')
    if (url.pathname.endsWith('/categories')) {
      return Response.json(url.searchParams.has('id') ? [] : [{ id: 'cat-expense', name: 'Categoria real', user_id: null, type: 'expense' }])
    }
    requests++
    assert.equal(init?.method, 'POST')
    payload = JSON.parse(String(init?.body))
    onInsert?.()
    if (failure) return Response.json({ code: '42501', message: 'segredo interno' }, { status: 403 })
    if (missing) return Response.json(null)
    return Response.json({ ...payload, id: 'server-id', user_id: wrongOwner ? 'user-b' : payload?.user_id, notes: null, created_at: null, updated_at: null }, { status: 201 })
  } },
})
Object.defineProperty(globalThis, '__rastroCreateClient', { configurable: true, value: {
  from: client.from.bind(client),
  auth: {
    getSession: async () => ({ data: { session: user ? { access_token: `token-${user}`, user: { id: user } } : null }, error: null }),
    getUser: async () => ({ data: { user: { id: user, email_confirmed_at: '2026-11-04' } }, error: null }),
  },
} })
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false, hmr: false }, plugins: [{
  name: 'create-test-client', enforce: 'pre',
  resolveId(source) { if (source.endsWith('/lib/supabase.ts')) return '\0create-client' },
  load(id) { if (id === '\0create-client') return 'export const supabase = globalThis.__rastroCreateClient' },
}] })
const { createTransaction } = await server.ssrLoadModule('/src/services/transactions.ts') as typeof import('../src/services/transactions.ts')
const input = { type: 'expense' as const, name: 'Mercado', amount: 29, date: '2026-11-04', categoryId: null }
const options = { expectedUserId: 'user-a' }
function reset() { user = 'user-a'; failure = false; missing = false; wrongOwner = false; onInsert = undefined; payload = null; requests = 0 }

test('cadastro com SDK oficial e transporte simulado, sem acesso ao Supabase real', async (t) => {
  try {
    for (const type of ['income', 'expense'] as const) {
      await t.test(`cadastra ${type}, converte centavos e obtém proprietário da sessão`, async () => {
        reset()
        const result = await createTransaction({ ...input, type, user_id: 'forjado' } as typeof input, options)
        assert.equal(result.id, 'server-id')
        assert.equal(result.amount, 29)
        assert.equal(result.type, type)
        assert.deepEqual(payload, { type, description: 'Mercado', amount: '0.29', transaction_date: input.date, category_id: null, user_id: 'user-a' })
      })
    }
    await t.test('categoria compatível usa ID; categoria incompatível ou inacessível impede POST', async () => {
      reset()
      assert.equal((await createTransaction({ ...input, categoryId: 'cat-expense' }, options)).categoryId, 'cat-expense')
      for (const change of [{ type: 'income' as const, categoryId: 'cat-expense' }, { categoryId: 'inexistente' }]) {
        reset()
        await assert.rejects(createTransaction({ ...input, ...change }, options), /categoria compatível/)
        assert.equal(requests, 0)
      }
    })
    await t.test('sessão ausente ou usuário diferente impede gravação', async () => {
      for (const identity of [null, 'user-b']) {
        reset(); user = identity
        await assert.rejects(createTransaction(input, options), /sessão/)
        assert.equal(requests, 0)
      }
    })
    await t.test('erro de gravação não expõe detalhes; resposta sem registro ou proprietário errado não confirma sucesso', async () => {
      for (const state of ['failure', 'missing', 'wrongOwner']) {
        reset()
        failure = state === 'failure'; missing = state === 'missing'; wrongOwner = state === 'wrongOwner'
        await assert.rejects(createTransaction(input, options), (error: Error) => /confirmar o cadastro/.test(error.message) && !error.message.includes('segredo'))
      }
    })
    await t.test('troca de usuário durante POST descarta confirmação antiga', async () => {
      reset(); onInsert = () => { user = 'user-b' }
      await assert.rejects(createTransaction(input, options), /sessão/)
    })
    await t.test('cancelamento durante POST descarta confirmação; cancelamento prévio não envia', async () => {
      reset()
      const controller = new AbortController()
      onInsert = () => controller.abort()
      await assert.rejects(createTransaction(input, { ...options, signal: controller.signal }))
      reset()
      await assert.rejects(createTransaction(input, { ...options, signal: controller.signal }))
      assert.equal(requests, 0)
    })
    await t.test('validação reutiliza moeda e data e recusa categorias pelo ID/tipo', () => {
      const fields = { type: 'expense', name: '  Mercado  ', amount: '1.234,56', date: '2026-11-04', category: '' }
      const categories = [{ id: 'cat', name: 'Mercado', type: 'expense' as const }]
      assert.deepEqual(validateTransactionWrite(fields, categories).input, { ...input, amount: 123456 })
      assert.ok(validateTransactionWrite({ ...fields, category: 'cat', type: 'income' }, categories).errors.category)
      assert.ok(validateTransactionWrite({ ...fields, category: 'Mercado' }, categories).errors.category)
      for (const change of [{ name: '' }, { amount: '1,001' }, { date: '2026-02-30' }, { type: 'investment' }]) {
        assert.equal(validateTransactionWrite({ ...fields, ...change }, categories).input, undefined)
      }
    })
  } finally { await server.close(); delete (globalThis as Record<string, unknown>).__rastroCreateClient }
})
