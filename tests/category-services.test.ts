import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'vite'
import { validateCategory } from '../src/utils/categories.ts'

const own = '603b2689-13aa-4c4e-bbca-f50620b8e3be'
const global = '703b2689-13aa-4c4e-bbca-f50620b8e3be'
const foreign = '803b2689-13aa-4c4e-bbca-f50620b8e3be'
let user: string | null = 'user-a'
let rows: Record<string, unknown>[] = []
let linked = false
let mode = ''
let onMutation: (() => void) | undefined
let transactions: Record<string, unknown>[] = []
const requests: { table: string; method: string; url: URL; body: Record<string, unknown> }[] = []
function reset() {
  user = 'user-a'; linked = false; mode = ''; onMutation = undefined; requests.length = 0
  rows = [{ id: own, name: 'Particular', type: 'expense', user_id: user }, { id: global, name: 'Global', type: 'income', user_id: null }, { id: foreign, name: 'Alheia', type: 'expense', user_id: 'user-b' }]
  transactions = [{ id: 'one', user_id: 'user-a', category_id: own, amount: '10.00', description: 'Preservar', transaction_date: '2026-11-04', notes: 'Observação' }, { id: 'two', user_id: 'user-b', category_id: foreign, amount: '20.00' }]
}
const client = createClient('https://categories-test.supabase.co', 'public-test-key', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init) => {
    const url = new URL(String(input)); const table = url.pathname.split('/').at(-1)!
    const method = init?.method ?? 'GET'; const body = JSON.parse(String(init?.body ?? '{}'))
    requests.push({ table, method, url, body })
    const actor = new Headers(init?.headers).get('Authorization')?.replace('Bearer token-', '')
    assert.equal(actor, user)
    if (table === 'transactions') {
      assert.equal(method, 'HEAD', 'Contagem sem leitura de conteúdo ou escrita nos lançamentos')
      assert.equal(url.searchParams.get('user_id'), 'eq.user-a')
      assert.equal(url.searchParams.get('category_id'), `eq.${own}`)
      if (mode === 'count-error') return new Response(null, { status: 403 })
      if (mode === 'count-missing') return new Response(null, { status: 200 })
      return new Response(null, { status: 200, headers: { 'Content-Range': `*/${linked ? 1501 : 0}` } })
    }
    let visible = rows.filter((row) => row.user_id === null || row.user_id === actor)
    for (const field of ['id', 'user_id']) {
      const filter = url.searchParams.get(field)
      if (filter?.startsWith('eq.')) visible = visible.filter((row) => row[field] === filter.slice(3))
      if (filter?.startsWith('gt.')) visible = visible.filter((row) => String(row[field]) > filter.slice(3))
    }
    if (method !== 'GET') {
      onMutation?.()
      if (mode === 'unique') return Response.json({ code: '23505', message: 'internal' }, { status: 409 })
      if (mode === 'fk') return Response.json({ code: '23503' }, { status: 409 })
      if (mode === 'error') return Response.json({ code: '42501', message: 'internal' }, { status: 403 })
      if (mode === 'missing') return Response.json(null)
      if (method === 'POST') {
        assert.deepEqual(Object.keys(body).sort(), ['name', 'type', 'user_id'])
        visible = [{ ...body, id: own }]; rows.push(visible[0])
      } else {
        assert.equal(url.searchParams.get('user_id'), `eq.${actor}`)
        assert.ok(url.searchParams.get('id')?.startsWith('eq.'))
        if (method === 'PATCH') { assert.deepEqual(Object.keys(body), ['name']); visible.forEach((row) => Object.assign(row, body)) }
        else if (method === 'DELETE') {
          rows = rows.filter((row) => !visible.includes(row))
          // Simula a FK SET NULL confirmada; nenhuma chamada altera transações.
          transactions.forEach((row) => { if (visible.some((category) => category.id === row.category_id)) row.category_id = null })
        }
      }
      if (mode === 'wrong-owner') visible = visible.map((row) => ({ ...row, user_id: 'user-b' }))
    }
    if (mode === 'leak' && method === 'GET') visible = rows
    const single = new Headers(init?.headers).get('Accept')?.includes('vnd.pgrst.object+json')
    if (single) return visible.length === 1 ? Response.json(visible[0]) : Response.json({ code: 'PGRST116' }, { status: 406 })
    return Response.json(visible)
  } },
})
Object.defineProperty(globalThis, '__rastroCategoryClient', { configurable: true, value: {
  from: client.from.bind(client),
  auth: {
    getSession: async () => ({ data: { session: user ? { user: { id: user }, access_token: `token-${user}` } : null }, error: null }),
    getUser: async () => ({ data: { user: { id: user, email_confirmed_at: '2026-11-04' } }, error: null }),
  },
} })
async function service() {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false, hmr: false }, plugins: [{
    name: 'category-client', enforce: 'pre',
    resolveId(source) {
      if (source.endsWith('/lib/supabase.ts')) return '\0category-client'
    },
    load(id) {
      if (id === '\0category-client') return 'export const supabase = globalThis.__rastroCategoryClient'
    },
  }] })
  return { server, module: await server.ssrLoadModule('/src/services/categories.ts') as typeof import('../src/services/categories.ts') }
}
const regular = await service()
const input = { name: '  Viagens  ', type: 'expense' as const }
const options = { expectedUserId: 'user-a' }
test('serviços de categorias — SDK oficial, todas as escritas em memória', async (t) => {
  try {
    await t.test('validação exige de 1 a 50 caracteres após trim e tipo reconhecido', () => {
      assert.deepEqual(validateCategory(input), { name: 'Viagens', type: 'expense' })
      assert.equal(validateCategory({ ...input, name: 'a'.repeat(50) }).name.length, 50)
      assert.equal(validateCategory({ ...input, name: 'x' }).name, 'x')
      for (const change of [{ name: '' }, { name: '   ' }, { name: 'a'.repeat(51) }, { type: 'invalid' }]) assert.throws(() => validateCategory({ ...input, ...change } as typeof input))
    })
    await t.test('cria receita e despesa com proprietário da sessão, sem aceitar campos protegidos', async () => {
      for (const type of ['income', 'expense'] as const) {
        reset()
        const result = await regular.module.saveCategory({ ...input, type, user_id: 'forjado', id: global } as typeof input, null, options)
        assert.equal(result.userId, 'user-a'); assert.equal(result.type, type)
        assert.deepEqual(requests.at(-1)?.body, { name: 'Viagens', type, user_id: 'user-a' })
      }
    })
    await t.test('renomeia categoria vinculada sem tocar transações nem proprietário/tipo', async () => {
      reset(); linked = true
      const result = await regular.module.saveCategory(input, own, options)
      assert.equal(result.name, 'Viagens')
      assert.ok(requests.every(({ table }) => table === 'categories'))
      assert.deepEqual(requests.at(-1)?.body, { name: 'Viagens' })
    })
    await t.test('categoria global ou alheia não recebe PATCH nem DELETE', async () => {
      for (const id of [global, foreign]) {
        reset(); await assert.rejects(regular.module.saveCategory(input, id, options))
        await assert.rejects(regular.module.deleteCategory(id, options))
        await assert.rejects(regular.module.getCategoryTransactionCount(id, options))
        assert.ok(requests.every(({ method }) => method === 'GET'))
      }
    })
    await t.test('troca de tipo é bloqueada com e sem vínculos até confirmar gatilhos', async () => {
      for (const inUse of [true, false]) {
        reset(); linked = inUse
        await assert.rejects(regular.module.saveCategory({ ...input, type: 'income' }, own, options))
        assert.ok(requests.every(({ method }) => method === 'GET'))
      }
    })
    await t.test('conta B não exclui categoria de A nem global e pode excluir a própria', async () => {
      reset(); user = 'user-b'
      const accountB = { expectedUserId: 'user-b' }
      await assert.rejects(regular.module.deleteCategory(own, accountB))
      await assert.rejects(regular.module.deleteCategory(global, accountB))
      assert.ok(requests.every(({ method }) => method === 'GET'))
      await regular.module.deleteCategory(foreign, accountB)
      assert.ok(rows.some((row) => row.id === own))
      assert.ok(!rows.some((row) => row.id === foreign))
    })
    await t.test('contagem exata inclui mais de uma página sem baixar transações; zero é válido', async () => {
      reset(); linked = true
      assert.equal(await regular.module.getCategoryTransactionCount(own, options), 1501)
      reset(); assert.equal(await regular.module.getCategoryTransactionCount(own, options), 0)
      for (const state of ['count-error', 'count-missing']) {
        reset(); mode = state
        await assert.rejects(regular.module.getCategoryTransactionCount(own, options))
      }
    })
    await t.test('exclusão SET NULL simulada preserva todos os campos e lançamentos, alterando só associação', async () => {
      reset(); linked = true
      const before = structuredClone(transactions)
      await regular.module.deleteCategory(own, options)
      assert.equal(rows.some((row) => row.id === own), false)
      assert.deepEqual(transactions, [{ ...before[0], category_id: null }, before[1]])
      assert.ok(requests.every(({ table }) => table === 'categories'), 'Não há PATCH/DELETE manual em transações')
    })
    await t.test('exclusão sem vínculos funciona; erro de outra FK preserva categoria', async () => {
      reset(); transactions = []
      await regular.module.deleteCategory(own, options)
      assert.equal(rows.some((row) => row.id === own), false)
      reset(); mode = 'fk'
      await assert.rejects(regular.module.deleteCategory(own, options), /possui vínculos/)
      assert.ok(rows.some((row) => row.id === own))
    })
    await t.test('DELETE sem registro, com erro ou retorno divergente nunca confirma sucesso', async () => {
      for (const state of ['missing', 'error', 'wrong-owner']) {
        reset(); mode = state
        await assert.rejects(regular.module.deleteCategory(own, options))
      }
    })
    await t.test('DELETE rejeita sessão ausente, diferente, trocada durante envio e cancelamento', async () => {
      for (const identity of [null, 'user-b']) {
        reset(); user = identity
        await assert.rejects(regular.module.deleteCategory(own, options)); assert.equal(requests.length, 0)
      }
      reset(); onMutation = () => { user = 'user-b' }
      await assert.rejects(regular.module.deleteCategory(own, options), /sessão/)
      reset()
      const controller = new AbortController(); controller.abort()
      await assert.rejects(regular.module.deleteCategory(own, { ...options, signal: controller.signal }))
      assert.equal(requests.length, 0)
    })
    await t.test('resposta vazia, erro, duplicidade e proprietário divergente não confirmam escrita', async () => {
      for (const state of ['missing', 'error', 'unique', 'wrong-owner']) {
        reset(); mode = state
        await assert.rejects(regular.module.saveCategory(input, null, options), (error: Error) => !error.message.includes('internal'))
      }
    })
    await t.test('sessão ausente ou diferente impede escrita, e troca durante envio rejeita confirmação', async () => {
      for (const identity of [null, 'user-b']) {
        reset(); user = identity
        await assert.rejects(regular.module.saveCategory(input, null, options)); assert.equal(requests.length, 0)
      }
      reset(); onMutation = () => { user = 'user-b' }
      await assert.rejects(regular.module.saveCategory(input, null, options), /sessão/)
    })
    await t.test('leitura recusa proprietário alheio mesmo quando transporte viola RLS', async () => {
      reset(); mode = 'leak'
      await assert.rejects(regular.module.readCategories(options), /formato esperado/)
    })
  } finally {
    await regular.server.close()
    delete (globalThis as Record<string, unknown>).__rastroCategoryClient
  }
})
