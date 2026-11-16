import { lazy, Suspense } from 'react'
import ErrorBoundary from './components/error-boundary.tsx'

const App = lazy(() => import('./app.tsx'))

export default function Root() {
  return <ErrorBoundary>
    <Suspense fallback={<p role="status" className="flex min-h-svh items-center justify-center bg-slate-950 px-6 text-slate-200">Carregando Rastro…</p>}>
      <App />
    </Suspense>
  </ErrorBoundary>
}
