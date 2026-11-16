import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadEnv } from 'vite'

// Opt-in. Todas as requisições são GET/HEAD, inclusive os controles positivos.
// Nunca tenta PATCH: uma política vulnerável poderia modificar dados reais.
const enabled = process.env.RASTRO_RLS_LIVE_READ === '1'
const env = enabled ? { ...loadEnv('development', process.cwd(), ''), ...process.env } : {}
const url = env.VITE_SUPABASE_URL
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
function configuration() {
  assert.ok(url && key, 'Configure URL e chave pública localmente, sem colocá-las no código ou nos logs.')
  assert.equal(new URL(url).protocol, 'https:')
  let role
  if (key.startsWith('eyJ')) {
    try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role } catch { /* chave inválida é recusada abaixo */ }
  }
  assert.ok(key.startsWith('sb_publishable_') || role === 'anon', 'Somente chave pública/anon é aceita.')
}
async function visibleCount(filters = {}, token) {
  const endpoint = new URL('/rest/v1/transactions', url)
  endpoint.search = new URLSearchParams({ select: 'id', ...filters }).toString()
  const response = await fetch(endpoint, {
    method: 'HEAD', signal: AbortSignal.timeout(15000), redirect: 'error',
    headers: { apikey: key, 'Accept-Profile': 'public', Prefer: 'count=exact', Range: '0-0', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if ([401, 403].includes(response.status)) return { denied: true, count: 0 }
  assert.ok(response.ok || response.status === 416, `Falha na leitura real (HTTP ${response.status}); não comprova isolamento.`)
  const total = response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1]
  assert.notEqual(total, undefined, 'Sem contagem exata: resultado inconclusivo.')
  return { denied: false, count: Number(total) }
}
test('Supabase real: leitura anônima direta não retorna linhas (não comprova isolamento entre contas)', { skip: !enabled }, async () => {
  configuration()
  const result = await visibleCount()
  assert.equal(result.count, 0, 'VULNERABILIDADE: a API permite consultar transações sem autenticação. Nenhum registro foi impresso.')
  console.log(JSON.stringify({ verification: 'real-anonymous-read', result: result.denied ? 'denied' : 'zero-visible-rows', writes: 0 }))
})

const tokens = [env.RASTRO_RLS_USER_A_TOKEN, env.RASTRO_RLS_USER_B_TOKEN]
const ids = [env.RASTRO_RLS_USER_A_TRANSACTION_ID, env.RASTRO_RLS_USER_B_TRANSACTION_ID]
// Exige opt-in separado e autorização do responsável; não habilitar na suíte normal.
test('Supabase real: isolamento SELECT bidirecional com controles positivos', { skip: !enabled || process.env.RASTRO_RLS_LIVE_AUTH_READ !== '1' || !tokens.every(Boolean) || !ids.every(Boolean) }, async () => {
  configuration()
  const users = []
  for (const token of tokens) {
    const response = await fetch(new URL('/auth/v1/user', url), { method: 'GET', signal: AbortSignal.timeout(15000), redirect: 'error', headers: { apikey: key, Authorization: `Bearer ${token}` } })
    assert.equal(response.status, 200, 'Token de teste deve ser validado pelo servidor.')
    const user = await response.json()
    assert.ok(user.id && user.email_confirmed_at, 'Use contas de teste confirmadas.')
    users.push(user.id)
  }
  assert.notEqual(users[0], users[1], 'Os tokens devem pertencer a duas contas diferentes.')
  assert.notEqual(ids[0], ids[1], 'Use registros de teste distintos e existentes.')
  for (const [index, token] of tokens.entries()) {
    assert.deepEqual(await visibleCount({ id: `eq.${ids[index]}`, user_id: `eq.${users[index]}` }, token), { denied: false, count: 1 }, 'Controle positivo: a conta precisa enxergar seu registro existente.')
    assert.deepEqual(await visibleCount({ id: `eq.${ids[1 - index]}` }, token), { denied: false, count: 0 }, 'ID alheio deve ser invisível com sessão ainda válida; erro HTTP não comprova isolamento.')
    assert.deepEqual(await visibleCount({ user_id: `eq.${users[1 - index]}` }, token), { denied: false, count: 0 }, 'Filtro forjado deve retornar zero linhas com sessão válida.')
    assert.deepEqual(await visibleCount({ user_id: `neq.${users[index]}` }, token), { denied: false, count: 0 }, 'Consulta direta não pode expor outro proprietário.')
  }
  console.log(JSON.stringify({ verification: 'real-two-user-select', result: 'passed', writes: 0 }))
})
