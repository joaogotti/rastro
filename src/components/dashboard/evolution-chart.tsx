import { useId } from 'react'
import type { getEvolution } from '../../utils/transactions.ts'
import { formatCurrency } from '../../utils/format.ts'

const width = 600
const left = 48
const right = 580
const top = 20
const bottom = 195
export default function EvolutionChart({ data, result }: { data: ReturnType<typeof getEvolution>; result: number }) {
  const titleId = useId()
  const maximum = Math.max(0, ...data.flatMap((month) => [month.income, month.expenses]))
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, maximum)))
  const ceiling = Math.max(3, Math.ceil(maximum / magnitude) * magnitude)
  const x = (index: number) => left + index * (right - left) / Math.max(1, data.length - 1)
  const y = (value: number) => bottom - value / ceiling * (bottom - top)

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-base font-semibold">Seu dinheiro ao longo do tempo</h2>
          <p className="mt-1 text-xs text-slate-500">Receitas e despesas · seis meses até o período selecionado</p>
        </div>
        <div className="flex gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-2"><span aria-hidden="true" className="w-4 border-t-2 border-emerald-600" />Receitas</span>
          <span className="flex items-center gap-2"><span aria-hidden="true" className="w-4 border-t-2 border-dashed border-slate-600" />Despesas</span>
        </div>
      </div>
      <figure className="my-auto pt-8">
        {data.every((month) => month.income === 0 && month.expenses === 0) && <p className="mb-4 text-sm text-slate-500">Nenhuma movimentação nos seis meses deste gráfico.</p>}
        <svg viewBox={`0 0 ${width} 230`} role="img" aria-label="Evolução financeira mensal. Receitas em linha contínua e despesas em linha tracejada. Valores disponíveis abaixo do gráfico." className="w-full">
          {[0, 1, 2, 3].map((tick) => {
            const value = ceiling * tick / 3
            return (
              <g key={tick}>
                <line x1={left} y1={y(value)} x2={right} y2={y(value)} stroke="#e2e8f0" strokeDasharray="3 5" />
                <text x="0" y={y(value) + 4} fill="#64748b" fontSize="12">{new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 2 }).format(value / 100)}</text>
              </g>
            )
          })}
          {(['income', 'expenses'] as const).map((type) => (
            <g key={type}>
              <polyline points={data.map((month, index) => `${x(index)},${y(month[type])}`).join(' ')} fill="none" stroke={type === 'income' ? '#059669' : '#475569'} strokeWidth="2.5" strokeDasharray={type === 'expenses' ? '6 5' : undefined} strokeLinejoin="round" />
              {data.map((month, index) => (
                <circle key={month.month} cx={x(index)} cy={y(month[type])} r="4" fill="white" stroke={type === 'income' ? '#059669' : '#475569'} strokeWidth="2">
                  <title>{`${month.month}: ${type === 'income' ? 'receitas' : 'despesas'} de ${formatCurrency(month[type])}`}</title>
                </circle>
              ))}
            </g>
          ))}
          {data.map((month, index) => <text key={month.period} x={x(index)} y="223" textAnchor="middle" fill="#64748b" fontSize="12">{month.month}</text>)}
        </svg>
        <figcaption>
          <details className="mt-4 text-xs text-slate-600">
            <summary className="flex min-h-11 cursor-pointer items-center rounded font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-emerald-600">Ver valores por mês</summary>
            <dl className="space-y-2 pb-4">
              {data.map((month) => <div key={month.period} className="flex flex-wrap justify-between gap-1"><dt>{month.month} {month.period.slice(0, 4)}</dt><dd>Receitas {formatCurrency(month.income)} · Despesas {formatCurrency(month.expenses)}</dd></div>)}
            </dl>
          </details>
        </figcaption>
      </figure>
      <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">Resultado do mês: <span className={`font-semibold ${result < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatCurrency(result)}</span></p>
    </section>
  )
}
