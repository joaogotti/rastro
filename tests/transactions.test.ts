import assert from 'node:assert/strict'
import test from 'node:test'
import { demoTransactions, demoHistoricalTransactions } from '../src/data/dashboard-demo.ts'
import { filterTransactions, getEvolution, groupExpenses, parseAmount, rankExpenses, saveTransaction, summarizeTransactions, validateTransaction } from '../src/utils/transactions.ts'

const validFields = { type: 'expense', name: 'Mercado', amount: '123,45', date: '2026-11-20', category: 'Alimentação' }

test('conversão monetária preserva centavos e aceita formatos BR e decimal simples', () => {
  for (const [input, cents] of [['0,01', 1], ['123,45', 12345], ['1.234,56', 123456], ['1234.56', 123456], [' 12 ', 1200], ['1,2', 120], ['99.999.999,99', 9999999999]] as const) {
    assert.equal(parseAmount(input), cents)
  }
})

test('valor rejeita negativos, zero, notação científica, excesso de casas e limite excedido', () => {
  for (const input of ['', '0', '-1', '1e3', 'Infinity', '0,001', '1.234', '1,23,45', '100000000', '1.23,45']) {
    assert.equal(parseAmount(input), null, input)
  }
})

test('cadastro exige descrição, tipo, data e valor válidos', () => {
  const { errors, draft } = validateTransaction({ ...validFields, type: '', name: '  ', amount: '', date: '' })
  assert.deepEqual(Object.keys(errors).sort(), ['amount', 'date', 'name', 'type'])
  assert.equal(draft, undefined)
})

test('datas inválidas não são normalizadas silenciosamente; ano bissexto é aceito', () => {
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', '0000-01-01']) {
    assert.ok(validateTransaction({ ...validFields, date }).errors.date, date)
  }
  assert.equal(validateTransaction({ ...validFields, date: '2024-02-29' }).draft?.date, '2024-02-29')
})

test('categoria é opcional, descrição é aparada e valores internos são em centavos', () => {
  const { draft } = validateTransaction({ ...validFields, name: '  Mercado  ', category: '' })
  assert.deepEqual(draft, { type: 'expense', name: 'Mercado', amount: 12345, date: '2026-11-20', category: 'Sem categoria' })
  assert.ok(validateTransaction({ ...validFields, category: 'categoria inventada' }).errors.category)
  assert.ok(validateTransaction({ ...validFields, name: 'a'.repeat(121) }).errors.name)
})

test('cadastro adiciona uma transação sem modificar o conjunto anterior', () => {
  const draft = validateTransaction(validFields).draft!
  const saved = saveTransaction(demoTransactions, draft, 'new-test')
  assert.equal(saved.length, demoTransactions.length + 1)
  assert.equal(demoTransactions.length, 7)
  assert.equal(saved.at(-1)?.amount, 12345)
  assert.equal(summarizeTransactions(saved).expenses, 425000 + 12345)
})

test('edição substitui todos os campos, preserva ID e não duplica a transação', () => {
  const draft = validateTransaction({ ...validFields, type: 'income', name: 'Reembolso', category: '', amount: '500,50', date: '2026-12-01' }).draft!
  const saved = saveTransaction(demoTransactions, draft, 'demo-2')
  assert.equal(saved.length, demoTransactions.length)
  assert.deepEqual(saved.find((item) => item.id === 'demo-2'), { ...draft, id: 'demo-2' })
  assert.equal(demoTransactions.find((item) => item.id === 'demo-2')?.type, 'expense')
  assert.equal(summarizeTransactions(filterTransactions(saved, '2026-11')).expenses, 340000)
  assert.equal(summarizeTransactions(filterTransactions(saved, '2026-12')).income, 50050)
})

test('filtros por tipo e mês são imediatos e não alteram o resumo nem a ordem original', () => {
  assert.equal(filterTransactions(demoTransactions, '2026-11', 'all').length, 7)
  assert.equal(filterTransactions(demoTransactions, '2026-11', 'expense').length, 5)
  assert.equal(filterTransactions(demoTransactions, '2026-11', 'income').length, 2)
  assert.equal(filterTransactions(demoTransactions, '2027-01').length, 0)
  assert.deepEqual(summarizeTransactions(demoTransactions), { income: 850000, expenses: 425000 })
  assert.equal(demoTransactions[0].id, 'demo-1')
})

test('despesas sem categoria e assinaturas entram no gráfico; receitas não entram', () => {
  const uncategorized = validateTransaction({ ...validFields, category: '', amount: '10' }).draft!
  const subscription = validateTransaction({ ...validFields, category: 'Assinaturas', amount: '20' }).draft!
  const saved = saveTransaction(saveTransaction(demoTransactions, uncategorized, 'extra-1'), subscription, 'extra-2')
  const categories = groupExpenses(saved)
  assert.equal(categories.find((item) => item.name === 'Sem categoria')?.amount, 1000)
  assert.equal(categories.find((item) => item.name === 'Assinaturas')?.amount, 2000)
  assert.equal(categories.reduce((sum, item) => sum + item.amount, 0), summarizeTransactions(saved).expenses)
})

test('histórico e novos lançamentos recalculam evolução em seis meses inclusive na mudança de ano', () => {
  const transactions = [...demoHistoricalTransactions, ...demoTransactions]
  assert.equal(getEvolution(transactions, '2026-11')[0].income, 720000)
  const draft = validateTransaction({ ...validFields, type: 'income', amount: '100', date: '2026-12-20' }).draft!
  const evolution = getEvolution(saveTransaction(transactions, draft, 'december'), '2027-01')
  assert.equal(evolution.length, 6)
  assert.equal(evolution[0].period, '2026-08')
  assert.equal(evolution.find((month) => month.period === '2026-12')?.income, 10000)
  assert.deepEqual(evolution.at(-1), { period: '2027-01', month: 'jan.', income: 0, expenses: 0 })
})

test('períodos sem transações retornam totais e categorias vazios', () => {
  assert.deepEqual(summarizeTransactions([]), { income: 0, expenses: 0 })
  assert.deepEqual(groupExpenses([]), [])
  assert.ok(getEvolution([], '2026-11').every((month) => month.income === 0 && month.expenses === 0))
})

test('ranking inclui somente despesas em ordem decrescente, sem agrupar ou alterar a lista original', () => {
  const originalIds = demoTransactions.map((item) => item.id)
  const ranked = rankExpenses(demoTransactions)
  assert.deepEqual(ranked.map((item) => item.amount), [180000, 85000, 70000, 50000, 40000])
  assert.ok(ranked.every((item) => item.type === 'expense'))
  assert.deepEqual(demoTransactions.map((item) => item.id), originalIds)
  const duplicate = { ...demoTransactions[1], id: 'same-description' }
  assert.equal(rankExpenses([...demoTransactions, duplicate]).filter((item) => item.name === duplicate.name).length, 2)
})

test('ranking respeita o mês e reflete cadastro e edição de valor, tipo e data', () => {
  const draft = validateTransaction({ ...validFields, amount: '2000', date: '2026-11-22' }).draft!
  const created = saveTransaction(demoTransactions, draft, 'ranking-test')
  assert.equal(rankExpenses(filterTransactions(created, '2026-11'))[0].id, 'ranking-test')
  assert.equal(rankExpenses(filterTransactions(created, '2026-11')).length, 6)
  const edited = saveTransaction(created, { ...draft, amount: 1 }, 'ranking-test')
  assert.equal(rankExpenses(filterTransactions(edited, '2026-11')).at(-1)?.id, 'ranking-test')
  const income = saveTransaction(edited, { ...draft, type: 'income' }, 'ranking-test')
  assert.equal(rankExpenses(filterTransactions(income, '2026-11')).length, 5)
  const moved = saveTransaction(created, { ...draft, date: '2026-12-01' }, 'ranking-test')
  assert.equal(rankExpenses(filterTransactions(moved, '2026-11')).length, 5)
  assert.deepEqual(rankExpenses(filterTransactions(moved, '2026-12')).map((item) => item.id), ['ranking-test'])
})

test('ranking vazio e empates têm resultado previsível', () => {
  assert.deepEqual(rankExpenses([]), [])
  assert.deepEqual(rankExpenses(demoTransactions.filter((item) => item.type === 'income')), [])
  const expense = demoTransactions[1]
  const ranked = rankExpenses([
    { ...expense, id: 'b', date: '2026-11-01' },
    { ...expense, id: 'a', date: '2026-11-01' },
    { ...expense, id: 'c', date: '2026-11-02' },
  ])
  assert.deepEqual(ranked.map((item) => item.id), ['c', 'a', 'b'])
})
