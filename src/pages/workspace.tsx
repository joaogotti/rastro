import { lazy, Suspense, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import DashboardLayout from '../layouts/dashboard-layout.tsx'

const Categories = lazy(() => import('./categories.tsx'))
const Transactions = lazy(() => import('./transactions.tsx'))
const Dashboard = lazy(() => import('./dashboard.tsx'))

export default function Workspace({ user }: { user: User }) {
  return <WorkspaceContent key={user.id} user={user} />
}
function WorkspaceContent({ user }: { user: User }) {
  const [section, setSection] = useState<'overview' | 'categories' | 'transactions'>(() => window.location.hash === '#transacoes' ? 'transactions' : window.location.hash === '#categorias' ? 'categories' : 'overview')
  const [overviewVisited, setOverviewVisited] = useState(() => !['#transacoes', '#categorias'].includes(window.location.hash))
  useEffect(() => {
    function navigate() {
      if (window.location.hash === '#categorias') setSection('categories')
      else if (window.location.hash === '#transacoes') setSection('transactions')
      else if (window.location.hash !== '#conteudo') { setSection('overview'); setOverviewVisited(true) }
      else return
      document.getElementById('conteudo')?.focus({ preventScroll: true })
    }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  return <DashboardLayout section={section}>
    {overviewVisited && <div hidden={section !== 'overview'}><Suspense fallback={<p role="status">Carregando visão geral…</p>}><Dashboard user={user} embedded active={section === 'overview'} /></Suspense></div>}
    {section === 'categories' && <Suspense fallback={<p role="status" className="text-sm text-slate-500">Carregando categorias…</p>}><Categories userId={user.id} /></Suspense>}
    {section === 'transactions' && <Suspense fallback={<p role="status" className="text-sm text-slate-500">Carregando transações…</p>}><Transactions userId={user.id} /></Suspense>}
  </DashboardLayout>
}
