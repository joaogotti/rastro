import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'vite'

let user: string | null = 'user-a'
let token = 'token-a'
let rows: Record<string, unknown>[] = []
let fail = false
let responseOverride: Record<string, unknown> | undefined
let duringRequest: (() => void) | undefined
const requests: { url: URL; method: string; body: Record<string, unknown> | null }[] = []
const client = createClient('https://investments-test.supabase.co', 'public-test-key', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : null
    requests.push({ url, method, body })
    assert.equal(url.pathname, '/rest/v1/investment_totals')
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${token}`)
    duringRequest?.()
    if (fail) return Response.json({ code: '42501', message: 'internal' }, { status: 403 })
    if (method === 'POST') {
      assert.equal(url.searchParams.get('on_conflict'), 'user_id')
      assert.ok(new Headers(init?.headers).get('Prefer')?.includes('resolution=merge-duplicates'))
      rows = [...rows.filter((row) => row.user_id !== body.user_id), body]
      return Response.json(responseOverride ?? body)
    }
    assert.equal(url.searchParams.get('user_id'), 'eq.user-a')
    return Response.json(responseOverride ? [responseOverride] : rows.filter((row) => row.user_id === 'user-a'))
  } },
})
Object.defineProperty(globalThis, '__investmentTestClient', { configurable: true, value: {
  from: client.from.bind(client),
  auth: {
    getSession: async () => ({ data: { session: user ? { user: { id: user }, access_token: token } : null }, error: null }),
    getUser: async () => ({ data: { user: { id: user, email_confirmed_at: '2026-11-13' } }, error: null }),
  },
} })
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false, hmr: false }, plugins: [{
  name: 'investment-tests', enforce: 'pre',
  resolveId(source) { if (source.endsWith('/lib/supabase.ts')) return '\0investment-client' },
  load(id) { if (id === '\0investment-client') return 'export const supabase = globalThis.__investmentTestClient' },
}] })
const { readInvestmentTotal, saveInvestmentTotal } = await server.ssrLoadModule('/src/services/investments.ts') as typeof import('../src/services/investments.ts')

test('investment_totals: SDK oficial com transporte simulado', async (t) => {
  function reset() {
    user = 'user-a'; token = 'token-a'; rows = []; fail = false
    responseOverride = undefined; duringRequest = undefined; requests.length = 0
  }
  try {
    await t.test('ausência é null; upsert persiste 100 reais e zero sem duplicar', async () => {
      reset()
      assert.equal(await readInvestmentTotal(), null)
      assert.equal(await saveInvestmentTotal(10000), 10000)
      assert.equal(await readInvestmentTotal(), 10000)
      assert.equal(await saveInvestmentTotal(0), 0)
      assert.equal(await readInvestmentTotal(), 0)
      assert.equal(rows.length, 1)
      assert.equal(requests.find((request) => request.method === 'POST')?.body?.user_id, 'user-a')
    })
    await t.test('bigint textual é convertido com segurança; dados inválidos são rejeitados', async () => {
      reset()
      responseOverride = { user_id: user, amount_cents: '9999999999' }
      assert.equal(await readInvestmentTotal(), 9999999999)
      for (const value of [-1, 0.1, '1e3', null, '10000000000', 'NaN']) {
        responseOverride = { user_id: user, amount_cents: value }
        await assert.rejects(readInvestmentTotal())
      }
      responseOverride = { user_id: 'user-b', amount_cents: 100 }
      await assert.rejects(readInvestmentTotal())
      await assert.rejects(saveInvestmentTotal(100))
    })
    await t.test('falha preserva registro anterior; confirmação ausente ou divergente é recusada', async () => {
      reset()
      await saveInvestmentTotal(10000)
      fail = true
      await assert.rejects(saveInvestmentTotal(20000), /confirmar/)
      await assert.rejects(readInvestmentTotal(), /carregar/)
      fail = false
      assert.equal(await readInvestmentTotal(), 10000)
      responseOverride = { user_id: user, amount_cents: 1 }
      await assert.rejects(saveInvestmentTotal(20000))
    })
    await t.test('sem sessão, usuário inesperado e valores inválidos não enviam gravação', async () => {
      reset(); user = null
      await assert.rejects(saveInvestmentTotal(100))
      user = 'user-a'
      await assert.rejects(saveInvestmentTotal(100, { expectedUserId: 'user-b' }))
      for (const value of [-1, 1.5, NaN, Infinity, 10000000000]) await assert.rejects(saveInvestmentTotal(value))
      assert.equal(requests.length, 0)
    })
    await t.test('resposta após troca de usuário, sessão ou cancelamento é descartada', async () => {
      for (const mutation of [() => { user = 'user-b' }, () => { token = 'new-session' }]) {
        reset(); duringRequest = mutation
        await assert.rejects(readInvestmentTotal())
        reset(); duringRequest = mutation
        await assert.rejects(saveInvestmentTotal(100))
      }
      reset()
      const controller = new AbortController()
      duringRequest = () => controller.abort()
      await assert.rejects(saveInvestmentTotal(100, { signal: controller.signal }))
    })
  } finally { await server.close() }
})
