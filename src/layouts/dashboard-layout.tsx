import { useState } from 'react'
import type { ReactNode } from 'react'
import SignOutButton from '../components/sign-out-button.tsx'

export default function DashboardLayout({ children, section = 'overview' }: { children: ReactNode; section?: 'overview' | 'categories' | 'transactions' }) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-svh bg-[#f5f7f8] text-slate-900 lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <a href="#conteudo" className="sr-only z-50 rounded-lg bg-emerald-300 p-3 text-slate-950 focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Pular para o conteúdo</a>
      <aside className="bg-slate-950 text-slate-100 lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col">
        <div className="flex items-center justify-between px-6 py-5 lg:px-7 lg:py-9">
          <a href="#visao-geral" aria-label="Rastro — visão geral" className="inline-flex shrink-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400">
            <img src={`${import.meta.env.BASE_URL}images/rastro-logo.png`} alt="Rastro" width="48" height="48" className="h-12 w-12 rounded-xl object-contain" />
          </a>
          <button type="button" aria-expanded={menuOpen} aria-controls="dashboard-navigation" onClick={() => setMenuOpen(!menuOpen)} className="min-h-11 rounded-lg border border-slate-600 px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400 lg:hidden">
            {menuOpen ? 'Fechar menu' : 'Menu'}
          </button>
        </div>
        <div id="dashboard-navigation" className={`${menuOpen ? 'flex' : 'hidden'} flex-col gap-8 px-4 pb-6 lg:flex lg:flex-1 lg:pb-7`}>
          <nav aria-label="Navegação principal">
            <p className="mb-3 px-3 text-[11px] font-semibold tracking-widest text-slate-400 uppercase">Seu espaço</p>
            {([{ key: 'overview', label: 'Visão geral', href: '#visao-geral' }, { key: 'transactions', label: 'Transações', href: '#transacoes' }, { key: 'categories', label: 'Categorias', href: '#categorias' }] as const).map((item) => <a key={item.key} href={item.href} aria-current={section === item.key ? 'page' : undefined} onClick={() => setMenuOpen(false)} className={`mt-1 flex min-h-12 items-center rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${section === item.key ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-transparent text-slate-300 hover:bg-slate-900'}`}>{item.label}</a>)}
          </nav>
          <div className="mt-auto px-2">
            <p className="mb-5 border-t border-slate-800 pt-5 text-xs leading-relaxed text-slate-400">Mais clareza para suas<br />próximas escolhas.</p>
            <SignOutButton />
          </div>
        </div>
      </aside>
      <main id="conteudo" tabIndex={-1} className="min-w-0 px-4 py-7 outline-none sm:px-7 lg:px-8 lg:py-9 xl:px-12">
        <div id={section === 'categories' ? 'categorias' : section === 'transactions' ? 'transacoes' : 'visao-geral'} className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  )
}
