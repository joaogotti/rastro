import assert from 'node:assert/strict'
import test from 'node:test'
import { toDashboardTransactions } from '../src/adapters/dashboard.ts'
import { categoryAppearance } from '../src/data/transaction-categories.ts'
import type { PersistedTransaction } from '../src/types/transaction.ts'
import { availablePeriods, currentPeriod, shiftPeriod } from '../src/utils/periods.ts'
import { filterTransactions, getEvolution, groupExpenses, rankExpenses, summarizeTransactions } from '../src/utils/transactions.ts'

const base: PersistedTransaction = {
  id: 'one', userId: 'user-a', categoryId: 'private', type: 'expense', name: 'Despesa particular',
  amount: 1250, date: '2026-11-03', notes: null, createdAt: null, updatedAt: null,
}

test('dashboard resolve categorias particulares e conserva os centavos e metadados', () => {
  const [view] = toDashboardTransactions([base], [{ id: 'private', name: 'Clube de leitura', type: 'expense' }], 'user-a')
  assert.equal(view.category, 'Clube de leitura')
  assert.equal(view.amount, 1250)
  assert.equal(view.categoryId, 'private')
  assert.equal(view.userId, 'user-a')
  assert.equal(Object.hasOwn(base, 'category'), false)
})

test('categoria nula é distinta de uma categoria indisponível', () => {
  const views = toDashboardTransactions([base, { ...base, id: 'two', categoryId: null }], [], 'user-a')
  assert.equal(views[0].category, 'Categoria indisponível')
  assert.equal(views[0].categoryId, 'private')
  assert.equal(views[1].category, 'Sem categoria')
  assert.equal(views[1].categoryId, null)
})

test('adaptador recusa qualquer transação de outra conta', () => {
  assert.throws(() => toDashboardTransactions([base, { ...base, id: 'two', userId: 'user-b' }], [], 'user-a'), /sessão atual/)
})

test('gráfico inclui categorias novas e não mistura IDs distintos com mesmo nome', () => {
  const views = toDashboardTransactions([
    base,
    { ...base, id: 'two', categoryId: 'global', amount: 100 },
    { ...base, id: 'three', categoryId: null, amount: 29 },
    { ...base, id: 'four', type: 'income', amount: 2000 },
  ], [{ id: 'private', name: 'Leitura', type: 'expense' }, { id: 'global', name: 'Leitura', type: 'expense' }], 'user-a')
  const groups = groupExpenses(views)
  assert.equal(groups.length, 3)
  assert.equal(groups.filter((group) => group.name === 'Leitura').length, 2)
  assert.equal(new Set(groups.map((group) => group.id)).size, 3)
  assert.equal(groups.reduce((sum, group) => sum + group.amount, 0), 1379)
  assert.deepEqual(summarizeTransactions(views), { income: 2000, expenses: 1379 })
  assert.deepEqual(rankExpenses(views).map((view) => view.amount), [1250, 100, 29])
})

test('meses sem lançamentos ficam disponíveis e produzem zeros sem saldo inicial fictício', () => {
  const views = toDashboardTransactions([base], [], 'user-a')
  const periods = availablePeriods(views, '2026-12')
  assert.ok(periods.includes('2026-12'))
  assert.ok(periods.includes('2026-11'))
  assert.ok(availablePeriods([], '2026-12').includes('2026-12'))
  assert.deepEqual(summarizeTransactions(filterTransactions(views, '2026-12')), { income: 0, expenses: 0 })
  assert.equal(getEvolution(views, '2026-12').find((month) => month.period === '2026-11')?.expenses, 1250)
})

test('período inicial usa o mês local, e navegação atravessa anos e limites válidos', () => {
  assert.equal(currentPeriod(new Date(2026, 10, 3)), '2026-11')
  assert.equal(shiftPeriod('2026-12', 1), '2027-01')
  assert.equal(shiftPeriod('2026-01', -1), '2025-12')
  assert.equal(shiftPeriod('0001-01', -1), '0001-01')
  assert.equal(shiftPeriod('9999-12', 1), '9999-12')
})

test('evolução não produz ano zero nem repete meses no limite inferior das datas', () => {
  assert.deepEqual(getEvolution([], '0001-01').map((month) => month.period), ['0001-01'])
  assert.deepEqual(getEvolution([], '0001-03').map((month) => month.period), ['0001-01', '0001-02', '0001-03'])
  assert.equal(getEvolution([], '9999-12').length, 6)
})

test('totais recusam perda de precisão antes de disponibilizar dados ao dashboard', () => {
  const large = { ...base, amount: Number.MAX_SAFE_INTEGER }
  assert.throws(() => summarizeTransactions([large, { ...base, amount: 1 }]), /precisão/)
  assert.throws(() => toDashboardTransactions([large, { ...base, amount: 1 }], [], 'user-a'), /precisão/)
  assert.throws(() => summarizeTransactions([{ ...base, amount: 1.5 }]), /inválido/)
  assert.deepEqual(summarizeTransactions([]), { income: 0, expenses: 0 })
})

test('apresentação das categorias preserva ícones conhecidos e oferece alternativa para nomes novos', () => {
  assert.equal(categoryAppearance('alimentacao').icon, 'cart')
  assert.equal(categoryAppearance('Clube de leitura').icon, 'question')
})
