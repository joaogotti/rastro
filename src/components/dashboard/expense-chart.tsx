import { useId, useState } from 'react'
import type { TransactionView } from '../../types/transaction.ts'
import { groupExpenses, rankExpenses, summarizeTransactions } from '../../utils/transactions.ts'
import { formatCurrency } from '../../utils/format.ts'

function ExpenseRanking({ expenses }: { expenses: TransactionView[] }) {
  const [showAll, setShowAll] = useState(false)
  const listId = useId()
  const visibleExpenses = showAll ? expenses : expenses.slice(0, 5)
  const largest = expenses[0]?.amount ?? 0

  return (
    <figure className="mt-6">
      <figcaption className="mb-5 text-xs leading-relaxed text-slate-500">
        {expenses.length > 5 && !showAll ? `As 5 maiores de ${expenses.length} despesas.` : `${expenses.length} ${expenses.length === 1 ? 'despesa' : 'despesas'} no mês.`}{' '}
        Barras proporcionais à maior despesa.
      </figcaption>
      <ol id={listId} aria-label="Despesas individuais, do maior para o menor valor" className="space-y-5">
        {visibleExpenses.map((expense) => (
          <li key={expense.id}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
              <span className="min-w-0 flex-1 basis-32 leading-relaxed wrap-anywhere text-slate-600">{expense.name}</span>
              <span className="font-medium text-slate-900 tabular-nums">{formatCurrency(expense.amount)}</span>
            </div>
            <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-600" style={{ width: `${largest > 0 ? expense.amount / largest * 100 : 0}%` }} />
            </div>
          </li>
        ))}
      </ol>
      {expenses.length > 5 && (
        <button type="button" aria-expanded={showAll} aria-controls={listId} onClick={() => setShowAll(!showAll)} className="mt-5 min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
          {showAll ? 'Ver menos' : 'Ver todas'}
        </button>
      )}
    </figure>
  )
}

export default function ExpenseChart({ transactions, period }: { transactions: TransactionView[]; period: string }) {
  const titleId = useId()
  const [view, setView] = useState<'category' | 'expense'>('category')
  const categories = groupExpenses(transactions)
  const total = summarizeTransactions(transactions).expenses

  return (
    <section aria-labelledby={titleId} className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 id={titleId} className="text-base font-semibold">{view === 'category' ? 'Despesas por categoria' : 'Despesas individuais'}</h2>
      <p className="mt-1 text-xs text-slate-500">Distribuição das despesas do mês selecionado</p>
      <div role="group" aria-label="Visualização de despesas" className="mt-4 flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
        {([{ value: 'category', label: 'Por categoria' }, { value: 'expense', label: 'Por despesa' }] as const).map((option) => (
          <button key={option.value} type="button" aria-pressed={view === option.value} onClick={() => setView(option.value)} className={`min-h-11 flex-1 rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-emerald-600 ${view === option.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'}`}>
            {option.label}
          </button>
        ))}
      </div>
      {total === 0 ? <p className="py-16 text-center text-sm text-slate-500">Nenhuma despesa neste mês.</p> : view === 'expense' ? <ExpenseRanking key={period} expenses={rankExpenses(transactions)} /> : <figure className="mt-4">
        <svg viewBox="0 0 240 210" role="img" aria-label={`Gráfico de rosca. Despesas totais: ${formatCurrency(total)}. Distribuição detalhada na legenda abaixo.`} className="mx-auto w-full max-w-60">
          {categories.map((category, index) => {
            const share = category.amount / total * 100
            const gap = Math.min(0.8, share * 0.2)
            const offset = categories.slice(0, index).reduce((sum, item) => sum + item.amount, 0) / total * 100
            return <circle key={category.id} cx="120" cy="100" r="75" fill="none" stroke={category.color} strokeWidth="22" pathLength="100" strokeDasharray={`${share - gap} ${100 - share + gap}`} strokeDashoffset={-offset} transform="rotate(-90 120 100)" />
          })}
          <text x="120" y="94" textAnchor="middle" fill="#64748b" fontSize="12">Total de despesas</text>
          <text x="120" y="119" textAnchor="middle" fill="#0f172a" fontSize={total > 99999999 ? '13' : '19'} fontWeight="600">{formatCurrency(total)}</text>
        </svg>
        <figcaption>
          <ul className="space-y-3 text-sm">
            {categories.map((category) => (
              <li key={category.id} className="flex flex-wrap items-center gap-2.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                <span className="min-w-0 flex-1 wrap-anywhere text-slate-600">{category.name}</span>
                <span className="text-xs text-slate-500">{Math.round(category.amount / total * 100)}%</span>
                <span className="min-w-25 text-right font-medium tabular-nums">{formatCurrency(category.amount)}</span>
              </li>
            ))}
          </ul>
        </figcaption>
      </figure>}
    </section>
  )
}
