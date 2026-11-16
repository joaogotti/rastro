import { useEffect, useState } from 'react'
import { toDashboardTransactions } from '../adapters/dashboard.ts'
import DeleteTransaction from '../components/dashboard/delete-transaction.tsx'
import RecentTransactions from '../components/dashboard/recent-transactions.tsx'
import TransactionForm from '../components/dashboard/transaction-form.tsx'
import TransactionHistoryFilters from '../components/dashboard/transaction-history-filters.tsx'
import { useTransactionHistory } from '../hooks/use-transaction-history.ts'
import type { TransactionView } from '../types/transaction.ts'
import { formatCurrency } from '../utils/format.ts'
import { monthRange, normalizeHistoryFilters } from '../utils/transaction-history.ts'
import type { HistoryCursor, HistoryFilters } from '../utils/transaction-history.ts'

const button = 'min-h-12 rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-50'
const defaults = (): HistoryFilters => ({ ...monthRange(), search: '', type: 'all', categoryId: '', ascending: false })
export default function Transactions({ userId }: { userId: string }) {
  return <HistoryContent key={userId} userId={userId} />
}
function HistoryContent({ userId }: { userId: string }) {
  const [query, setQuery] = useState<{ filters: HistoryFilters; cursors: (HistoryCursor | null)[] }>(() => ({ filters: defaults(), cursors: [null] }))
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState('current')
  const [revision, setRevision] = useState(0)
  const [editor, setEditor] = useState<TransactionView | 'new' | null>(null)
  const [deleting, setDeleting] = useState<TransactionView | null>(null)
  const [notice, setNotice] = useState('')
  const { filters, cursors } = query
  const { page, totals, categories } = useTransactionHistory(userId, filters, cursors.at(-1)!, revision)
  useEffect(() => {
    const timer = setTimeout(() => {
      const value = search.trim().replace(/\s+/g, ' ')
      setQuery((current) => current.filters.search === value ? current : { filters: { ...current.filters, search: value }, cursors: [null] })
    }, 300)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => {
    const refresh = () => { setQuery((current) => ({ ...current, cursors: [null] })); setRevision((value) => value + 1) }
    window.addEventListener('rastro:categories-changed', refresh)
    window.addEventListener('rastro:transactions-changed', refresh)
    return () => { window.removeEventListener('rastro:categories-changed', refresh); window.removeEventListener('rastro:transactions-changed', refresh) }
  }, [])
  function changed(patch: Partial<HistoryFilters>) { setQuery((current) => ({ filters: { ...current.filters, ...patch }, cursors: [null] })) }
  function saved(message: string) {
    setEditor(null); setDeleting(null); setNotice(message)
    window.dispatchEvent(new Event('rastro:transactions-changed'))
  }
  let validation = ''
  try { normalizeHistoryFilters(filters) } catch (error: unknown) { validation = error instanceof Error ? error.message : 'Revise os filtros.' }
  const views = page?.data && categories?.data ? toDashboardTransactions(page.data.transactions, categories.data, userId) : []
  const searchPending = search.trim().replace(/\s+/g, ' ') !== filters.search
  const loading = !page || !categories || searchPending
  const error = page?.error || categories?.error
  const summary = totals?.data
  const active = filters.search || filters.type !== 'all' || filters.categoryId
  return <>
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-xs font-medium text-slate-500">Seu espaço / Transações</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Suas transações.</h1><p className="mt-2 text-sm text-slate-500">Acompanhe e organize todas as suas movimentações financeiras.</p></div><button type="button" onClick={() => setEditor('new')} className="min-h-12 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">+ Nova transação</button></header>
    <section aria-label="Resumo do período" className="mb-3 grid gap-3 sm:grid-cols-3">{[{ name: 'Receitas', value: summary?.income }, { name: 'Despesas', value: summary?.expenses }, { name: 'Resultado', value: summary ? summary.income - summary.expenses : undefined }].map((card) => <article key={card.name} className={`min-w-0 rounded-xl border p-5 ${card.name === 'Resultado' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white'}`}><h2 className="text-sm font-medium">{card.name}</h2><p className={`mt-3 text-2xl font-semibold tracking-tight wrap-anywhere tabular-nums ${card.name === 'Receitas' ? 'text-emerald-700' : ''}`}>{validation || card.value === undefined ? '—' : formatCurrency(card.value)}</p><p className="mt-2 text-xs opacity-70">{validation ? 'Período inválido' : totals?.error ? 'Totais indisponíveis' : !summary ? 'Calculando todo o período…' : 'Todo o período selecionado'}</p></article>)}</section>
    <p className="mb-6 text-xs leading-relaxed text-slate-500">Os indicadores consideram todas as transações do período, independentemente da pesquisa, do tipo, da categoria ou da página. Valores atualizados ao consultar.</p>
    {totals?.error && !validation && <p role="alert" className="mb-4 text-sm text-red-700">Não foi possível confirmar os totais completos do período. Nenhum total parcial foi exibido. <button type="button" onClick={() => setRevision((value) => value + 1)} className="min-h-11 underline">Tentar novamente</button></p>}
    <TransactionHistoryFilters filters={filters} categories={categories?.data ?? []} mode={mode} onMode={setMode} search={search} onSearch={setSearch} onChange={changed} onClear={() => { setSearch(''); setMode('current'); setQuery({ filters: defaults(), cursors: [null] }) }} />
    <p role="status" className="mb-4 text-sm text-emerald-800">{notice}</p>
    {validation ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{validation}</p> : error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><p>{error}</p><button type="button" onClick={() => setRevision((value) => value + 1)} className={`${button} mt-3`}>Tentar novamente</button></div> : loading ? <p role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Carregando histórico…</p> : views.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center"><h2 className="font-semibold">{active ? 'Nenhuma transação encontrada.' : 'Nenhuma transação cadastrada.'}</h2><p className="mt-2 text-sm text-slate-500">{active ? 'Tente ajustar a pesquisa ou os filtros.' : 'Você ainda não registrou movimentações neste período.'}</p><button type="button" onClick={() => setEditor('new')} className={`${button} mt-4`}>Nova transação</button>{cursors.length > 1 && <button type="button" onClick={() => setQuery((current) => ({ ...current, cursors: [null] }))} className={`${button} mt-4 ml-2`}>Voltar à primeira página</button>}</div> : <RecentTransactions history transactions={views} filter="all" onFilter={() => {}} onEdit={setEditor} onDelete={setDeleting} />}
    {!validation && <nav aria-label="Paginação de transações" className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Página {cursors.length}{page?.data ? ` · ${page.data.count} ${page.data.count === 1 ? "resultado" : "resultados"}` : ''}</p><div className="flex gap-2"><button type="button" disabled={loading || cursors.length === 1} onClick={() => setQuery((current) => ({ ...current, cursors: current.cursors.slice(0, -1) }))} className={button}>Anterior</button><button type="button" disabled={loading || !page?.data?.next} onClick={() => { const next = page?.data?.next; if (next) setQuery((current) => ({ ...current, cursors: [...current.cursors, next] })) }} className={button}>Próxima</button></div></nav>}
    {editor && <TransactionForm key={editor === 'new' ? 'new' : editor.id} userId={userId} transaction={editor === 'new' ? undefined : editor} defaultDate={filters.start} onClose={() => setEditor(null)} onSaved={() => saved(editor === 'new' ? 'Transação cadastrada.' : 'Transação atualizada.')} />}
    {deleting && <DeleteTransaction key={deleting.id} transaction={deleting} userId={userId} onClose={() => setDeleting(null)} onDeleted={() => saved('Transação excluída.')} />}
  </>
}
