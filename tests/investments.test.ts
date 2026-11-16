import assert from 'node:assert/strict'
import test from 'node:test'
import { validateInvestmentTotal } from '../src/utils/investments.ts'
import { parseAmount } from '../src/utils/transactions.ts'

test('investimentos aceitam valores em reais e retornam centavos exatos', () => {
  for (const [input, cents] of [['14800', 1480000], ['14.800,00', 1480000], ['14800.50', 1480050], [' 123,45 ', 12345], ['0,01', 1], ['1,2', 120]] as const) {
    assert.deepEqual(validateInvestmentTotal(input), { amount: cents })
  }
})

test('total investido aceita zero, enquanto receita e despesa continuam exigindo valor positivo', () => {
  for (const input of ['0', '0,00', '0.00']) {
    assert.deepEqual(validateInvestmentTotal(input), { amount: 0 })
    assert.equal(parseAmount(input), null)
  }
})

test('investimentos rejeitam campos vazios e valores negativos, incluindo zero com sinal', () => {
  for (const input of ['', '   ', '-1', '-0', '-0,01', '-1.000,00']) {
    const result = validateInvestmentTotal(input)
    assert.equal(result.amount, undefined, input)
    assert.ok(result.error, input)
  }
})

test('investimentos rejeitam formatos inválidos sem arredondar valores', () => {
  for (const input of ['1e3', 'NaN', 'Infinity', '0,001', '1.234', '1.23,45', '1,234.56', 'R$ 100', '1,23,45', '+10', 'dez']) {
    assert.ok(validateInvestmentTotal(input).error, input)
  }
})

test('limite monetário de investimentos é respeitado', () => {
  assert.deepEqual(validateInvestmentTotal('99.999.999,99'), { amount: 9999999999 })
  for (const input of ['100000000', '100.000.000,00', '99999999999999999999999']) {
    assert.ok(validateInvestmentTotal(input).error, input)
  }
})
