import assert from 'node:assert/strict'
import { test } from 'node:test'

// Mock do módulo central: os testes não acessam a rede nem enviam e-mails.
const calls: { method: string; args: unknown }[] = []
let response: unknown
let authListener: ((event: string, session: unknown) => void) | undefined
const auth = {
  signUp: async (args: unknown) => {
    calls.push({ method: 'signUp', args })
    authListener?.('SIGNED_IN', { access_token: 'sessao-automatica-de-teste' })
    return response
  },
  signInWithPassword: async (args: unknown) => { calls.push({ method: 'signInWithPassword', args }); return response },
  getUser: async (args: unknown) => { calls.push({ method: 'getUser', args }); return response },
  signOut: async (args: unknown) => {
    calls.push({ method: 'signOut', args })
    authListener?.('SIGNED_OUT', null)
    return { error: null }
  },
  onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
    authListener = callback
    return { data: { subscription: { unsubscribe: () => { authListener = undefined } } } }
  },
}

const location = { origin: 'https://rastro.example', href: 'https://rastro.example/' }
const history = { replaceState: (_state: unknown, _unused: string, url: string) => { location.href = new URL(url, location.origin).href } }
Object.defineProperty(globalThis, 'window', { configurable: true, value: { location, history } })

// BASE_URL é fornecido pelo Vite na aplicação. O teste exercita o mesmo módulo via Vite.
const { createServer } = await import('vite')
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  plugins: [{
    name: 'test-auth-client',
    enforce: 'pre',
    resolveId(source) {
      if (source.endsWith('/lib/supabase.ts')) return '\0test-supabase'
    },
    load(id) {
      if (id === '\0test-supabase') return 'export const supabase = globalThis.__rastroTestClient'
    },
  }],
})
Object.defineProperty(globalThis, '__rastroTestClient', { configurable: true, value: { auth } })
const service = await server.ssrLoadModule('/src/services/auth.ts') as typeof import('../src/services/auth.ts')

test('serviço de autenticação', async (t) => {
  try {
    await t.test('cadastro envia metadados e retorno, sem assumir confirmação', async () => {
      response = { data: { session: null }, error: null }
      await service.signUp('  João Silva  ', '  joao@example.com  ', 'senha-segura')
      assert.deepEqual(calls.at(-1), {
        method: 'signUp', args: {
          email: 'joao@example.com', password: 'senha-segura',
          options: { data: { full_name: 'João Silva' }, emailRedirectTo: 'https://rastro.example/' },
        },
      })
    })
    await t.test('cadastro com sessão imediata é encerrado e sinaliza configuração', async () => {
      const observed: unknown[] = []
      const unsubscribe = service.subscribeToAuth((session) => observed.push(session))
      response = { data: { session: {} }, error: null }
      await assert.rejects(service.signUp('João Silva', 'joao@example.com', 'senha-segura'), /email_confirmation_disabled/)
      assert.deepEqual(calls.at(-1), { method: 'signOut', args: { scope: 'local' } })
      assert.deepEqual(observed, [null])
      unsubscribe()
    })
    await t.test('login utiliza signInWithPassword e exige sessão no retorno', async () => {
      response = { data: { session: null }, error: null }
      await assert.rejects(service.signIn('joao@example.com', 'senha'), /session_missing/)
      response = { data: { session: {} }, error: null }
      await service.signIn(' joao@example.com ', 'senha')
      assert.deepEqual(calls.at(-1), { method: 'signInWithPassword', args: { email: 'joao@example.com', password: 'senha' } })
    })
    await t.test('proteção exige usuário confirmado e validado pelo servidor', async () => {
      const session = { access_token: 'token-de-teste', user: { id: 'test-user' } } as Parameters<typeof service.validateSession>[0]
      response = { data: { user: { id: 'test-user' } }, error: null }
      await assert.rejects(service.validateSession(session), /email_not_confirmed/)
      response = { data: { user: { id: 'outro', email_confirmed_at: '2026-11-03' } }, error: null }
      await assert.rejects(service.validateSession(session), /session_missing/)
      response = { data: { user: { id: 'test-user', email_confirmed_at: '2026-11-03' } }, error: null }
      assert.equal((await service.validateSession(session)).id, 'test-user')
      assert.deepEqual(calls.at(-1), { method: 'getUser', args: 'token-de-teste' })
      response = { data: { user: null }, error: new Error('token_rejeitado') }
      await assert.rejects(service.validateSession(session), /token_rejeitado/)
    })
    await t.test('link expirado tem mensagem segura e remove parâmetros de erro', () => {
      location.href = 'https://rastro.example/#error=access_denied&error_code=otp_expired&error_description=detalhe-interno'
      assert.match(service.readConfirmationError() ?? '', /expirou/)
      assert.equal(location.href, 'https://rastro.example/')
    })
  } finally {
    await server.close()
    delete (globalThis as Record<string, unknown>).__rastroTestClient
  }
})
