import assert from 'node:assert/strict'
import test from 'node:test'
import { authErrorMessage, validateAuthFields } from '../src/utils/auth-validation.ts'

const validFields = {
  fullName: 'João Silva',
  email: 'joao@example.com',
  password: 'senha-segura',
  confirmPassword: 'senha-segura',
}

test('cadastro aceita nome completo, e-mail e senhas válidas', () => {
  assert.deepEqual(validateAuthFields('signup', validFields), {})
})

test('cadastro rejeita campos vazios e nome sem sobrenome', () => {
  const errors = validateAuthFields('signup', {
    fullName: 'João', email: '', password: '', confirmPassword: '',
  })
  assert.ok(errors.fullName)
  assert.ok(errors.email)
  assert.ok(errors.password)
})

test('cadastro exige oito caracteres e confirmação correspondente', () => {
  const errors = validateAuthFields('signup', {
    ...validFields, password: '1234567', confirmPassword: 'diferente',
  })
  assert.ok(errors.password)
  assert.ok(errors.confirmPassword)
  assert.deepEqual(validateAuthFields('signup', {
    ...validFields, password: '12345678', confirmPassword: '12345678',
  }), {})
})

test('login não exige nome, confirmação ou oito caracteres para contas existentes', () => {
  assert.deepEqual(validateAuthFields('login', {
    ...validFields, fullName: '', password: 'curta', confirmPassword: '',
  }), {})
})

test('e-mail tolera espaços externos e rejeita endereços inválidos', () => {
  assert.deepEqual(validateAuthFields('signup', {
    ...validFields, email: '  joao@example.com  ',
  }), {})
  for (const email of ['sem-arroba', 'a b@example.com', 'a@', '@example.com']) {
    assert.ok(validateAuthFields('signup', { ...validFields, email }).email)
  }
})

test('mensagens distinguem credenciais inválidas de e-mail não confirmado', () => {
  assert.match(authErrorMessage({ code: 'invalid_credentials' }), /incorretos/)
  assert.match(authErrorMessage({ code: 'email_not_confirmed' }), /Confirme seu e-mail/)
})

test('erros desconhecidos não expõem mensagens do servidor', () => {
  const result = authErrorMessage(new Error('informação interna sensível'))
  assert.doesNotMatch(result, /sensível|interna/)
  assert.match(result, /conexão/)
})
