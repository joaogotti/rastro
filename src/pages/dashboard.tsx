import { useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { Fragment } from 'react'
import EvolutionChart from '../components/dashboard/evolution-chart.tsx'
import ExpenseChart from '../components/dashboard/expense-chart.tsx'
import InvestmentForm from '../components/dashboard/investment-form.tsx'
import RecentTransactions from '../components/dashboard/recent-transactions.tsx'
import TransactionForm from '../components/dashboard/transaction-form.tsx'
import SummaryCards from '../components/dashboard/summary-cards.tsx'
import { useInvestmentTotal } from '../hooks/use-investment-total.ts'
import { useDashboardData } from '../hooks/use-dashboard-data.ts'
import DashboardLayout from '../layouts/dashboard-layout.tsx'
import type { TransactionFilter, TransactionView } from '../types/transaction.ts'
import { formatPeriod } from '../utils/format.ts'
import { availablePeriods, currentPeriod, shiftPeriod } from '../utils/periods.ts'
import { filterTransactions, getEvolution, summarizeTransactions } from '../utils/transactions.ts'

export default function Dashboard({ user, embedded = false, active = true }: { user: User; embedded?: boolean; active?: boolean }) {
  // Cada conta tem sua própria árvore de estado, incluindo investimentos.
  return <DashboardContent key={user.id} user={user} embedded={embedded} active={active} />
}

function DashboardContent({ user, embedded, active }: { user: User; embedded: boolean; active: boolean }) {
  const Container = embedded ? Fragment : DashboardLayout
  const { state, retry } = useDashboardData(user.id, active)
  const [transactionModalOpen, setTransactionModalOpen] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<TransactionView | undefined>()
  const investments = useInvestmentTotal(user.id, active)
  const [investmentModalOpen, setInvestmentModalOpen] = useState(false)
  const [period, setPeriod] = useState(currentPeriod)
  const [filter, setFilter] = useState<TransactionFilter>('all')
  const [notice, setNotice] = useState('')
  const transactions = state.status === 'success' ? state.transactions : []
  const monthlyTransactions = filterTransactions(transactions, period)
  const totals = summarizeTransactions(monthlyTransactions)
  const summary = state.status === 'success' ? totals : undefined
  const periods = availablePeriods(transactions, period)
  const fullName = typeof user.user_metadata.full_name === 'string' ? user.user_metadata.full_name.trim() : ''
  const displayName = fullName || user.email || 'Sua conta'
  const firstName = fullName.split(/\s+/)[0]
  const initials = fullName ? fullName.split(/\s+/).slice(0, 2).map((name) => name[0]).join('').toUpperCase() : 'R'

  return (
    <Container>
      <header className="mb-7 flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 max-w-full">
          <p className="mb-2 text-xs font-medium text-slate-500">Seu espaço / Visão geral</p>
          <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere sm:text-3xl">{firstName ? `Olá, ${firstName}.` : 'Olá!'}</h1>
          <p className="mt-2 text-sm text-slate-500">Uma visão clara do seu dinheiro, em um só lugar.</p>
        </div>
        <div className="flex min-w-0 max-w-full items-center gap-3">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-semibold text-slate-600">{initials}</span>
          <div className="min-w-0">
            <p className="max-w-60 truncate text-sm font-medium" title={displayName}>{displayName}</p>
            <p className="max-w-60 truncate text-xs text-slate-500" title={user.email}>{user.email ?? 'Conta autenticada'}</p>
          </div>
        </div>
      </header>

      <div className="mb-7 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <p className="text-sm leading-relaxed text-emerald-900">Os indicadores refletem o mês selecionado. Investimentos são informados separadamente e salvos na sua conta.</p>
      </div>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-full">
          <label htmlFor="dashboard-period" className="mb-2 block text-xs font-medium text-slate-600">Período dos indicadores e transações</label>
          <div className="flex w-90 max-w-full gap-2">
            <button type="button" aria-label="Mês anterior" onClick={() => setPeriod(shiftPeriod(period, -1))} className="h-12 w-11 shrink-0 rounded-lg border border-slate-300 bg-white text-xl focus-visible:outline-2 focus-visible:outline-emerald-600">‹</button>
            <select id="dashboard-period" value={period} onChange={(event) => setPeriod(event.target.value)} className="min-h-12 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-base focus-visible:outline-2 focus-visible:outline-emerald-600">{periods.map((value) => <option key={value} value={value}>{formatPeriod(value)}</option>)}</select>
            <button type="button" aria-label="Próximo mês" onClick={() => setPeriod(shiftPeriod(period, 1))} className="h-12 w-11 shrink-0 rounded-lg border border-slate-300 bg-white text-xl focus-visible:outline-2 focus-visible:outline-emerald-600">›</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => setTransactionModalOpen(true)} className="min-h-12 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">Nova transação</button>
        <button type="button" onClick={retry} disabled={state.status === 'loading'} className="min-h-12 rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-60">{state.status === 'loading' ? 'Carregando…' : 'Atualizar dados'}</button>
        </div>
      </div>

      {state.status === 'error' && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{state.message}</p><button type="button" onClick={retry} className="mt-2 min-h-11 rounded px-1 font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-red-700">Tentar novamente</button></div>}
      {state.status === 'loading' && <p role="status" className="mb-4 text-sm text-slate-600">Carregando suas transações e categorias…</p>}
      {state.status === 'success' && transactions.length === 0 && <p role="status" className="mb-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Você ainda não tem transações registradas. Os meses sem lançamentos aparecem com valores zerados.</p>}
      <p role="status" className="mb-4 text-sm text-emerald-800">{notice}</p>
      {investments.state.status === 'error' && <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{investments.state.message}</p><button type="button" onClick={investments.retry} className="mt-2 min-h-11 font-semibold underline">Tentar carregar investimentos novamente</button></div>}
      <SummaryCards summary={summary} status={state.status} investmentTotal={investments.state.amount} investmentStatus={investments.state.status} onEditInvestments={() => setInvestmentModalOpen(true)} />
      {state.status === 'success' ? <>
        <div className="my-5 grid items-stretch gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">
          <ExpenseChart transactions={monthlyTransactions} period={period} />
          <EvolutionChart data={getEvolution(transactions, period)} result={totals.income - totals.expenses} />
        </div>
        <RecentTransactions transactions={filterTransactions(transactions, period, filter)} filter={filter} onFilter={setFilter} onEdit={setEditingTransaction} />
      </> : <>
        <div className="my-5 grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)]">{['Despesas por categoria', 'Seu dinheiro ao longo do tempo'].map((title) => <section key={title} className="min-w-0 rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-base font-semibold">{title}</h2><p className="py-16 text-center text-sm text-slate-500">{state.status === 'loading' ? 'Carregando dados…' : 'Dados indisponíveis. Tente carregar novamente.'}</p></section>)}</div>
        <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-base font-semibold">Transações do mês</h2><p className="py-10 text-sm text-slate-500">{state.status === 'loading' ? 'Carregando transações…' : 'Não foi possível carregar a lista de transações.'}</p></section>
      </>}
      <footer className="mt-6 pb-2 text-xs leading-relaxed text-slate-500">Rastro · Receitas e despesas sincronizadas com sua conta. O total de investimentos é informado por você e salvo na sua conta.</footer>
      {transactionModalOpen && <TransactionForm userId={user.id} defaultDate={`${period}-01`} onSaved={() => { setTransactionModalOpen(false); setNotice('Transação cadastrada. Atualizando os dados do período selecionado.'); retry() }} onClose={() => setTransactionModalOpen(false)} />}
      {editingTransaction && <TransactionForm key={editingTransaction.id} userId={user.id} transaction={editingTransaction} defaultDate={`${period}-01`} onSaved={() => { setEditingTransaction(undefined); setNotice('Transação atualizada. Atualizando os dados do período selecionado.'); retry() }} onClose={() => setEditingTransaction(undefined)} />}
      {investmentModalOpen && investments.state.status === 'success' && <InvestmentForm amount={investments.state.amount ?? 0} onSave={async (amount) => { await investments.save(amount); setInvestmentModalOpen(false); setNotice('Valor de investimentos salvo na sua conta.') }} onClose={() => setInvestmentModalOpen(false)} />}
    </Container>
  )
}
