import { formatCurrency } from '../../utils/format.ts'
import TransactionIcon from './transaction-icon.tsx'

type Props = {
  summary?: { income: number; expenses: number }
  status: 'loading' | 'success' | 'error'
  investmentTotal: number | null
  investmentStatus: 'loading' | 'success' | 'error'
  onEditInvestments: () => void
}

export default function SummaryCards({ summary, status, investmentTotal, investmentStatus, onEditInvestments }: Props) {
  const unavailable = status === 'loading' ? 'Carregando dados…' : 'Dados indisponíveis'
  const cards = [
    { label: 'Resultado do período', value: summary ? summary.income - summary.expenses : null, detail: summary ? 'Receitas menos despesas do mês' : unavailable, primary: true },
    { label: 'Receitas', value: summary?.income ?? null, detail: summary ? 'Entradas no mês selecionado' : unavailable },
    { label: 'Despesas', value: summary?.expenses ?? null, detail: summary ? 'Saídas no mês selecionado' : unavailable },
    { label: 'Investimentos', value: investmentTotal, detail: investmentStatus === 'loading' ? 'Carregando investimentos…' : investmentStatus === 'error' ? 'Investimentos indisponíveis' : 'Total informado · salvo na conta', editable: true },
  ]

  return (
    <section aria-label="Resumo financeiro" className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4">
      {cards.map((card) => (
        <article key={card.label} className={`min-w-0 rounded-xl border p-4 sm:p-5 ${card.primary ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900'}`}>
          <h2 className={`text-sm font-medium ${card.primary ? 'text-slate-300' : 'text-slate-600'}`}>{card.label}</h2>
          <p className={`mt-3 text-base font-semibold tracking-tight wrap-anywhere tabular-nums min-[380px]:text-xl sm:text-2xl ${card.primary ? card.value !== null && card.value < 0 ? 'text-red-300' : 'text-emerald-300' : ''}`}>{card.value === null ? card.editable && investmentStatus === 'success' ? 'Não informado' : '—' : formatCurrency(card.value)}</p>
          <div className="mt-3 flex min-h-11 items-center justify-between gap-2">
            <p className={`min-w-0 flex-1 text-xs leading-relaxed ${card.primary ? 'text-slate-400' : 'text-slate-500'}`}>{card.detail}</p>
            {card.editable && <button type="button" aria-label="Editar total investido" title="Editar total investido" disabled={investmentStatus !== 'success'} onClick={onEditInvestments} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-emerald-600"><TransactionIcon edit /></button>}
          </div>
        </article>
      ))}
    </section>
  )
}
