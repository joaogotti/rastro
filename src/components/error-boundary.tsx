import { Component } from 'react'
import type { ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (this.state.failed) return (
      <main className="flex min-h-svh items-center justify-center bg-slate-950 px-6 text-slate-100">
        <div role="alert" className="w-full max-w-md">
          <h1 className="text-2xl font-semibold">Não foi possível abrir o Rastro.</h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">Confira sua conexão e recarregue a página. Se você estava salvando uma alteração, confira os dados após entrar antes de repetir a operação.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-6 min-h-12 rounded-lg bg-emerald-400 px-5 font-semibold text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400">Recarregar página</button>
        </div>
      </main>
    )
    return this.props.children
  }
}
