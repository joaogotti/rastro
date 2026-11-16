import { useId } from 'react'
import type { TransactionView, TransactionFilter } from '../../types/transaction.ts'
import { formatCurrency, formatDate } from '../../utils/format.ts'
import TransactionIcon from './transaction-icon.tsx'

const filters: { label: string; value: TransactionFilter }[] = [
  { label: 'Todas', value: 'all' },
  { label: 'Despesas', value: 'expense' },
  { label: 'Receitas', value: 'income' },
]

type Props = {
  transactions: TransactionView[]
  filter: TransactionFilter
  onFilter: (filter: TransactionFilter) => void
  onEdit: (transaction: TransactionView) => void
  onDelete?: (transaction: TransactionView) => void
  history?: boolean
}

export default function RecentTransactions({ transactions, filter, onFilter, onEdit, onDelete, history = false }: Props) {
  const titleId = useId()
  const editButton = (transaction: TransactionView) => <button type="button" onClick={() => onEdit(transaction)} aria-label="Editar transação" title="Editar transação" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg px-2 text-slate-600 hover:bg-slate-100 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-600"><span className="h-4 w-4"><TransactionIcon edit /></span></button>
  const actions = (transaction: TransactionView) => <span className="inline-flex shrink-0">{editButton(transaction)}{onDelete && <button type="button" onClick={() => onDelete(transaction)} aria-label="Excluir transação" title="Excluir transação" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-red-700"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" /></svg></button>}</span>
  return (
    <section aria-labelledby={titleId} className="min-w-0 rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
        <div>
          <h2 id={titleId} className="text-base font-semibold">{history ? 'Histórico de transações' : 'Transações do mês'}</h2>
          <p className="mt-1 text-xs text-slate-500">{transactions.length} {transactions.length === 1 ? 'lançamento' : 'lançamentos'} neste filtro</p>
        </div>
        {!history && <div role="group" aria-label="Filtrar transações por tipo" className="flex max-w-full flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => onFilter(item.value)} className={`min-h-11 rounded-md px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-emerald-600 ${filter === item.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'}`}>{item.label}</button>)}
        </div>}
      </div>
      {transactions.length === 0 ? <p role="status" className="px-5 py-12 text-center text-sm text-slate-500">Nenhuma transação neste mês para o filtro selecionado.</p> : <>
        <table className="hidden w-full table-fixed text-left text-sm xl:table">
          <caption className="sr-only">{history ? 'Transações da página atual, na ordenação selecionada.' : 'Transações do mês selecionado, da mais recente para a mais antiga.'}</caption>
          <thead className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500"><tr>
            <th scope="col" className="w-[34%] px-4 py-3 font-medium">Nome</th>
            <th scope="col" className="w-[18%] px-3 py-3 font-medium">Categoria</th>
            <th scope="col" className="w-[15%] px-3 py-3 font-medium">Data</th>
            <th scope="col" className="w-[12%] px-3 py-3 font-medium">Tipo</th>
            <th scope="col" className="w-[21%] px-3 py-3 text-right font-medium">Valor</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{transactions.map((transaction) => <tr key={transaction.id}>
            <th scope="row" className="px-4 py-4 font-medium"><div className="flex flex-wrap items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><TransactionIcon category={transaction.category} /></span><span className="min-w-0 flex-1 wrap-anywhere">{transaction.name}</span>{actions(transaction)}</div></th>
            <td className="px-3 py-4 wrap-anywhere text-slate-500">{transaction.category}</td>
            <td className="px-3 py-4 text-slate-500"><time dateTime={transaction.date}>{formatDate(transaction.date)}</time></td>
            <td className="px-3 py-4"><span className={`inline-block rounded-md px-2 py-1 text-xs ${transaction.type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{transaction.type === 'income' ? 'Receita' : 'Despesa'}</span></td>
            <td className={`px-3 py-4 text-right font-medium wrap-anywhere tabular-nums ${transaction.type === 'income' ? 'text-emerald-700' : 'text-slate-900'}`}>{transaction.type === 'income' ? '+' : '−'} {formatCurrency(transaction.amount)}</td>
          </tr>)}</tbody>
        </table>
        <ul className="divide-y divide-slate-100 xl:hidden">{transactions.map((transaction) => <li key={transaction.id} className="flex gap-3 px-4 py-4 sm:px-5">
          <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><TransactionIcon category={transaction.category} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium wrap-anywhere">{transaction.name}</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><p className="wrap-anywhere">{transaction.category} · {transaction.type === 'income' ? 'Receita' : 'Despesa'}</p><p className={`text-sm font-semibold tabular-nums ${transaction.type === 'income' ? 'text-emerald-700' : 'text-slate-900'}`}>{transaction.type === 'income' ? '+' : '−'} {formatCurrency(transaction.amount)}</p></div>
            <div className="mt-2 flex items-center justify-between gap-2"><time dateTime={transaction.date} className="text-xs text-slate-500">{formatDate(transaction.date)}</time>{actions(transaction)}</div>
          </div>
        </li>)}</ul>
      </>}
    </section>
  )
}
