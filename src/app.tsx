import { useAuth } from './hooks/use-auth.ts'
import Auth from './pages/auth.tsx'
import Workspace from './pages/workspace.tsx'

function App() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return (
      <main className="flex min-h-svh items-center justify-center bg-slate-950 px-6 text-slate-200">
        <p role="status">Verificando sua sessão…</p>
      </main>
    )
  }

  if (auth.status === 'anonymous') return <Auth initialMessage={auth.message} />

  return <Workspace user={auth.user} />
}

export default App
