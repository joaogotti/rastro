import { useState } from 'react'
import { signOut } from '../services/auth.ts'
import { authErrorMessage } from '../utils/auth-validation.ts'

export default function SignOutButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSignOut() {
    setBusy(true)
    setError('')
    try {
      await signOut()
    } catch (cause: unknown) {
      setError(authErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <button type="button" onClick={handleSignOut} disabled={busy} className="min-h-12 w-full rounded-lg border border-slate-600 px-4 text-left text-sm text-slate-200 transition-colors hover:border-slate-400 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400 disabled:opacity-60">
        {busy ? 'Saindo…' : 'Sair da conta'}
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    </div>
  )
}
