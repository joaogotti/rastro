import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClient } from '@supabase/supabase-js'
import { createServer } from 'vite'
import type { DatabaseTransactionRow } from '../src/types/database.ts'

const userId = 'user-a'
let currentUser: string | null = userId
let sessionError: unknown = null
let validationError: unknown = null
let confirmed = true
let serverCap = 1000
let failureStatus = 0
let failureCode = ''
let failedTable = ''
let throwNetwork = false
let malformedData = false
let ignoreCursor = false
let ignoreOwnerFilter = false
let onRequest: (() => void) | undefined
let tableRows: Record<string, Record<string, unknown>[]> = {}
const requests: URL[] = []
const checkedTokens: string[] = []

function makeTransaction(index: number, owner = userId): DatabaseTransactionRow {
  return {
    id: `transaction-${String(index).padStart(6, '0')}`,
    user_id: owner,
    category_id: null,
    type: 'expense',
    amount: '0.29',
    description: `Transação ${index}`,
    transaction_date: '2026-11-03',
    notes: 'Observação existente',
    created_at: null,
    updated_at: null,
  }
}

function reset() {
  currentUser = userId
  sessionError = null
  validationError = null
  confirmed = true
  serverCap = 1000
  failureStatus = 0
  failureCode = ''
  failedTable = ''
  throwNetwork = false
  malformedData = false
  ignoreCursor = false
  ignoreOwnerFilter = false
  onRequest = undefined
  tableRows = { transactions: [], categories: [] }
  requests.length = 0
  checkedTokens.length = 0
}

const client = createClient('https://rastro-tests.supabase.co', 'sb_publishable_tests_only', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      requests.push(url)
      assert.ok(!init?.method || init.method === 'GET', 'Somente leitura')
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-token-user-a', 'JWT fixado ao usuário validado')
      if (throwNetwork) throw new TypeError('detalhe interno da rede')
      const table = url.pathname.split('/').at(-1)!
      if (table === failedTable) {
        return new Response(JSON.stringify({ code: failureCode, message: 'detalhe interno do servidor' }), { status: failureStatus })
      }
      if (malformedData) return new Response('null', { status: 200 })

      let rows = [...(tableRows[table] ?? [])]
      const owner = url.searchParams.get('user_id')?.replace(/^eq\./, '')
      if (owner && !ignoreOwnerFilter) rows = rows.filter((row) => row.user_id === owner)
      // Simulação do RLS de categorias, não prova das políticas do banco real.
      if (table === 'categories') rows = rows.filter((row) => row.user_id === null || row.user_id === currentUser)
      const cursor = url.searchParams.get('id')?.replace(/^gt\./, '')
      if (cursor && !ignoreCursor) rows = rows.filter((row) => String(row.id) > cursor)
      rows.sort((a, b) => String(a.id).localeCompare(String(b.id)))
      rows = rows.slice(0, Math.min(Number(url.searchParams.get('limit')), serverCap))
      const columns = url.searchParams.get('select')!.split(',')
      rows = rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]])))
      onRequest?.()
      return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  },
})

const mockedClient = {
  from: client.from.bind(client),
  auth: {
    getSession: async () => ({
      data: { session: currentUser ? { access_token: `test-token-${currentUser}`, user: { id: currentUser } } : null },
      error: sessionError,
    }),
    getUser: async (token: string) => {
      checkedTokens.push(token)
      return { data: { user: { id: currentUser, email_confirmed_at: confirmed ? '2026-11-03T12:00:00Z' : null } }, error: validationError }
    },
  },
}

Object.defineProperty(globalThis, '__rastroReadTestClient', { configurable: true, value: mockedClient })
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false, hmr: false },
  plugins: [{
    name: 'financial-read-tests', enforce: 'pre',
    resolveId(source) { if (source.endsWith('/lib/supabase.ts')) return '\0financial-read-client' },
    load(id) { if (id === '\0financial-read-client') return 'export const supabase = globalThis.__rastroReadTestClient' },
  }],
})
const { readTransactions } = await server.ssrLoadModule('/src/services/transactions.ts') as typeof import('../src/services/transactions.ts')
const { readCategories } = await server.ssrLoadModule('/src/services/categories.ts') as typeof import('../src/services/categories.ts')
const { FinancialReadError } = await server.ssrLoadModule('/src/services/read-utils.ts') as typeof import('../src/services/read-utils.ts')

function hasKind(kind: string) {
  return (error: unknown) => error instanceof FinancialReadError && error.kind === kind && !error.message.includes('detalhe interno')
}

test('serviços financeiros de leitura com SDK real e transporte simulado', async (t) => {
  try {
    await t.test('sessão é validada no servidor; transações têm filtro explícito e conversão em centavos', async () => {
      reset()
      tableRows.transactions = [makeTransaction(1), makeTransaction(2, 'user-b')]
      const rows = await readTransactions()
      assert.equal(rows.length, 1)
      assert.equal(rows[0].amount, 29)
      assert.equal(rows[0].categoryId, null)
      assert.equal(rows[0].notes, 'Observação existente')
      assert.equal(rows[0].userId, userId)
      assert.deepEqual(checkedTokens, ['test-token-user-a'])
      assert.ok(requests.every((url) => url.searchParams.get('user_id') === 'eq.user-a'))
      assert.ok(requests.every((url) => url.searchParams.get('order') === 'id.asc'))
      assert.ok(requests.every((url) => !url.searchParams.get('select')?.includes('!inner')))
    })
    await t.test('categorias incluem globais e particulares permitidas, sem filtro incorreto por proprietário', async () => {
      reset()
      tableRows.categories = [
        { id: 'global', name: 'Alimentação', type: 'expense', user_id: null },
        { id: 'private', name: 'Categoria particular', type: 'income', user_id: userId },
        { id: 'other', name: 'De outro usuário', type: 'expense', user_id: 'user-b' },
      ]
      assert.deepEqual(await readCategories(), [{ id: 'global', name: 'Alimentação', type: 'expense', userId: null }, { id: 'private', name: 'Categoria particular', type: 'income', userId: userId }])
      assert.ok(requests.every((url) => !url.searchParams.has('user_id') && url.searchParams.get('select') === 'id,name,type,user_id'))
    })
    await t.test('transações acima de 1.000 são carregadas mesmo com limite menor imposto pelo servidor', async () => {
      reset()
      tableRows.transactions = Array.from({ length: 1203 }, (_, index) => makeTransaction(index))
      serverCap = 100
      const rows = await readTransactions()
      assert.equal(rows.length, 1203)
      assert.equal(new Set(rows.map((row) => row.id)).size, 1203)
      assert.equal(requests.length, 14)
      assert.equal(requests[1].searchParams.get('id'), 'gt.transaction-000099')
      assert.ok(requests.every((url) => url.searchParams.get('limit') === '500'))
    })
    await t.test('categorias também são paginadas, incluindo página final vazia', async () => {
      reset()
      tableRows.categories = Array.from({ length: 1001 }, (_, index) => ({ id: `cat-${String(index).padStart(5, '0')}`, name: 'Categoria', type: 'expense', user_id: null }))
      assert.equal((await readCategories()).length, 1001)
      assert.equal(requests.length, 4)
    })
    await t.test('resposta vazia é sucesso sem fallback demonstrativo', async () => {
      reset()
      assert.deepEqual(await readTransactions(), [])
      assert.deepEqual(await readCategories(), [])
    })
    await t.test('usuário esperado pelo dashboard deve corresponder à sessão validada', async () => {
      reset()
      await assert.rejects(readTransactions({ expectedUserId: 'user-b' }), hasKind('auth'))
      await assert.rejects(readCategories({ expectedUserId: 'user-b' }), hasKind('auth'))
      assert.equal(requests.length, 0)
    })
    await t.test('sessão ausente, expirada ou e-mail não confirmado impedem consultas', async () => {
      for (const state of ['missing', 'expired', 'unconfirmed']) {
        reset()
        if (state === 'missing') currentUser = null
        if (state === 'expired') validationError = { status: 401, code: 'bad_jwt' }
        if (state === 'unconfirmed') confirmed = false
        await assert.rejects(readTransactions(), hasKind('auth'))
        await assert.rejects(readCategories(), hasKind('auth'))
        assert.equal(requests.length, 0)
      }
    })
    await t.test('falha de comunicação na validação da sessão é distinguida de ausência de login', async () => {
      reset()
      sessionError = { name: 'AuthRetryableFetchError', status: 0 }
      await assert.rejects(readTransactions(), hasKind('network'))
      assert.equal(requests.length, 0)
    })
    await t.test('erros de autenticação, permissão e consulta são seguros para ambas as tabelas', async () => {
      for (const [table, read] of [['transactions', readTransactions], ['categories', readCategories]] as const) {
        for (const [status, kind] of [[401, 'auth'], [403, 'permission'], [400, 'query']] as const) {
          reset()
          failedTable = table
          failureStatus = status
          await assert.rejects(read(), hasKind(kind))
        }
      }
    })
    await t.test('erro de rede na consulta não retorna dados demonstrativos', async () => {
      reset()
      throwNetwork = true
      await assert.rejects(readTransactions(), hasKind('network'))
      await assert.rejects(readCategories(), hasKind('network'))
    })
    await t.test('falha em página posterior rejeita a leitura inteira', async () => {
      reset()
      tableRows.transactions = [makeTransaction(1), makeTransaction(2)]
      serverCap = 1
      onRequest = () => { failedTable = 'transactions'; failureStatus = 400 }
      await assert.rejects(readTransactions(), hasKind('query'))
      assert.equal(requests.length, 2)
    })
    await t.test('troca de usuário durante a leitura descarta resultados', async () => {
      for (const read of [readTransactions, readCategories]) {
        reset()
        tableRows.transactions = [makeTransaction(1)]
        tableRows.categories = [{ id: 'cat', name: 'Categoria', type: 'expense', user_id: null }]
        onRequest = () => { currentUser = 'user-b' }
        await assert.rejects(read(), hasKind('auth'))
      }
    })
    await t.test('dados de outro proprietário não são aceitos mesmo se a resposta violar o filtro', async () => {
      reset()
      ignoreOwnerFilter = true
      tableRows.transactions = [makeTransaction(1, 'user-b')]
      await assert.rejects(readTransactions(), hasKind('data'))
    })
    await t.test('linhas inválidas e falhas na conversão são tratadas como erro de dados', async () => {
      reset()
      tableRows.transactions = [{ ...makeTransaction(1), amount: '1.005' }]
      await assert.rejects(readTransactions(), hasKind('data'))
      reset()
      tableRows.categories = [{ id: 'cat', name: '', user_id: null }]
      await assert.rejects(readCategories(), hasKind('data'))
      reset()
      malformedData = true
      await assert.rejects(readTransactions(), hasKind('data'))
    })
    await t.test('paginação que repete IDs falha explicitamente em vez de truncar ou entrar em loop', async () => {
      reset()
      tableRows.transactions = [makeTransaction(1)]
      ignoreCursor = true
      await assert.rejects(readTransactions(), hasKind('data'))
      assert.equal(requests.length, 2)
    })
    await t.test('cancelamento antes e durante a consulta descarta resultados', async () => {
      reset()
      const aborted = new AbortController()
      aborted.abort()
      await assert.rejects(readTransactions({ signal: aborted.signal }), hasKind('aborted'))
      assert.equal(requests.length, 0)
      const pending = new AbortController()
      onRequest = () => pending.abort()
      await assert.rejects(readCategories({ signal: pending.signal }), hasKind('aborted'))
    })
  } finally {
    await server.close()
    delete (globalThis as Record<string, unknown>).__rastroReadTestClient
  }
})
