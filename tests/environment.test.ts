import assert from 'node:assert/strict'
import test from 'node:test'
import { validatePublicEnvironment } from '../src/utils/environment.ts'

const valid = { VITE_SUPABASE_URL: 'https://project.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`

test('configuração aceita publishable, anon legado e HTTP somente local', () => {
  assert.deepEqual(validatePublicEnvironment(valid), { url: valid.VITE_SUPABASE_URL, key: valid.VITE_SUPABASE_PUBLISHABLE_KEY })
  assert.equal(validatePublicEnvironment({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }).key, jwt('anon'))
  assert.equal(validatePublicEnvironment({ ...valid, VITE_SUPABASE_URL: 'http://127.0.0.1:54321' }).url, 'http://127.0.0.1:54321')
})

test('configuração rejeita chaves privilegiadas e inválidas sem expor o valor', () => {
  for (const key of ['sb_secret_private', jwt('service_role'), jwt('authenticated'), 'eyJbroken', 'invalid', '']) {
    assert.throws(() => validatePublicEnvironment({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: key }), (error: unknown) => {
      assert.ok(error instanceof Error)
      if (key) assert.ok(!error.message.includes(key))
      return true
    })
  }
})

test('configuração rejeita endpoint inseguro, credenciais embutidas e variáveis ausentes', () => {
  for (const url of ['', 'invalid', 'http://project.supabase.co', 'https://user:password@project.supabase.co', 'https://project.supabase.co/rest/v1', 'https://project.supabase.co/?token=secret']) {
    assert.throws(() => validatePublicEnvironment({ ...valid, VITE_SUPABASE_URL: url }))
  }
  assert.throws(() => validatePublicEnvironment({}), /VITE_SUPABASE_URL/)
})
