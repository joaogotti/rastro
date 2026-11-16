import assert from 'node:assert/strict'
import test from 'node:test'
import { fromDatabaseTransaction, toTransactionInsert, toTransactionUpdate } from '../src/adapters/transaction.ts'
import type { DatabaseTransactionRow } from '../src/types/database.ts'
import type { TransactionWriteInput } from '../src/types/transaction.ts'
import { centsToDatabaseAmount, databaseAmountToCents, MAX_MONEY_CENTS } from '../src/utils/money.ts'
import { summarizeTransactions } from '../src/utils/transactions.ts'

const row: DatabaseTransactionRow = {
  id: 'b9d75b7b-3978-4216-a765-8ccf72cfb3bc',
  user_id: 'af4c602b-42fe-4761-9e56-236eed45c20e',
  category_id: null,
  type: 'expense',
  amount: '123.45',
  description: 'Compra de teste',
  transaction_date: '2026-11-03',
  notes: 'Observação já existente',
  created_at: '2026-11-03T12:00:00Z',
  updated_at: '2026-11-03T13:00:00Z',
}

const input: TransactionWriteInput = {
  type: 'expense', name: 'Compra de teste', amount: 12345, date: '2026-11-03', categoryId: null,
}

test('numeric em reais é convertido em centavos exatos sem multiplicação de ponto flutuante', () => {
  for (const [value, cents] of [[0.29, 29], [1.1, 110], ['123.45', 12345], ['0.01', 1], ['12.3400', 1234], ['1.000', 100], ['99999999.99', MAX_MONEY_CENTS]] as const) {
    assert.equal(databaseAmountToCents(value), cents)
  }
})

test('numeric com fração de centavo não é arredondado silenciosamente', () => {
  for (const value of ['1.005', '0.001', '12.3450', 0.1 + 0.2]) {
    assert.throws(() => databaseAmountToCents(value), /fração de centavo/)
  }
})

test('conversão do banco rejeita formatos localizados, não finitos, zero e valores fora do limite', () => {
  for (const value of ['1,23', '1.234,56', '', 'NaN', 'Infinity', '1e3', '-1.00', '0.00', '100000000.00', NaN, Infinity, -1, 0]) {
    assert.throws(() => databaseAmountToCents(value), Error, String(value))
  }
})

test('centavos são serializados como decimal em reais com duas casas', () => {
  for (const [cents, decimal] of [[1, '0.01'], [29, '0.29'], [100, '1.00'], [12345, '123.45'], [MAX_MONEY_CENTS, '99999999.99']] as const) {
    assert.equal(centsToDatabaseAmount(cents), decimal)
    assert.equal(databaseAmountToCents(centsToDatabaseAmount(cents)), cents)
  }
})

test('escrita rejeita valores fracionários em centavos ou fora da faixa suportada', () => {
  for (const cents of [0, -1, 1.5, NaN, Infinity, MAX_MONEY_CENTS + 1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => centsToDatabaseAmount(cents), /inteiro positivo/)
  }
})

test('leitura preserva proprietário, categoria opcional, observações e timestamps', () => {
  assert.deepEqual(fromDatabaseTransaction(row), {
    id: row.id, userId: row.user_id, categoryId: null, type: 'expense', name: row.description,
    amount: 12345, date: '2026-11-03', notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at,
  })
  assert.equal(row.amount, '123.45')
})

test('leitura usa o ID da categoria e não depende dos nomes demonstrativos', () => {
  const categoryId = '603b2689-13aa-4c4e-bbca-f50620b8e3be'
  const transaction = fromDatabaseTransaction({ ...row, category_id: categoryId, type: 'income', notes: null, created_at: null, updated_at: null })
  assert.equal(transaction.categoryId, categoryId)
  assert.equal(transaction.type, 'income')
  assert.equal(transaction.notes, null)
  assert.equal(transaction.createdAt, null)
})

test('cadastro recebe proprietário separadamente e não envia IDs ou timestamps locais', () => {
  const withExtraFields = { ...input, id: 'local-1', user_id: 'outro-usuario', created_at: 'timestamp-do-cliente' }
  assert.deepEqual(toTransactionInsert(withExtraFields, row.user_id), {
    type: 'expense', description: 'Compra de teste', amount: '123.45', transaction_date: '2026-11-03', category_id: null, user_id: row.user_id,
  })
  assert.throws(() => toTransactionInsert(input, ''), /user_id/)
})

test('edição não envia proprietário, ID ou timestamps e preserva notes quando omitido', () => {
  const withExtraFields = { ...input, user_id: 'outro-usuario', id: row.id, updated_at: 'timestamp-do-cliente' }
  const update = toTransactionUpdate(withExtraFields)
  assert.deepEqual(Object.keys(update).sort(), ['amount', 'category_id', 'description', 'transaction_date', 'type'])
  assert.equal(Object.hasOwn(update, 'notes'), false)
  assert.equal(toTransactionUpdate({ ...input, notes: null }).notes, null)
  assert.equal(toTransactionUpdate({ ...input, notes: 'Nova observação' }).notes, 'Nova observação')
})

test('edição mapeia todos os campos sem alterar o objeto de entrada', () => {
  const categoryId = '603b2689-13aa-4c4e-bbca-f50620b8e3be'
  const changed = { ...input, type: 'income' as const, name: '  Reembolso  ', amount: 2900, date: '2026-12-01', categoryId }
  assert.deepEqual(toTransactionUpdate(changed), {
    type: 'income', description: 'Reembolso', amount: '29.00', transaction_date: '2026-12-01', category_id: categoryId,
  })
  assert.equal(changed.name, '  Reembolso  ')
})

test('adaptadores rejeitam datas impossíveis e descrições vazias antes de produzir payload', () => {
  assert.throws(() => toTransactionUpdate({ ...input, date: '2026-02-29' }), /Data/)
  assert.throws(() => toTransactionUpdate({ ...input, name: '  ' }), /description/)
  assert.throws(() => toTransactionUpdate({ ...input, name: 'a'.repeat(121) }), /120/)
  assert.throws(() => toTransactionUpdate({ ...input, categoryId: '' }), /category_id/)
  assert.throws(() => fromDatabaseTransaction({ ...row, id: '' }), /id/)
})

test('registros adaptados mantêm cálculos financeiros em centavos', () => {
  const transactions = [
    fromDatabaseTransaction({ ...row, amount: '0.29' }),
    fromDatabaseTransaction({ ...row, id: 'outro-id', amount: '0.01' }),
    fromDatabaseTransaction({ ...row, id: 'receita-id', type: 'income', amount: '1.00' }),
  ]
  assert.deepEqual(summarizeTransactions(transactions), { income: 100, expenses: 30 })
})
