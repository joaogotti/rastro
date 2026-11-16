import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { readConfirmationError, subscribeToAuth, validateSession } from '../services/auth.ts'
import { authErrorMessage } from '../utils/auth-validation.ts'

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous'; message?: string }
  | { status: 'authenticated'; user: User }

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const callbackError = useRef<string | undefined>(undefined)
  const revision = useRef(0)
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const lifecycle = new AbortController()
    callbackError.current ??= readConfirmationError()
    const confirmationError = callbackError.current

    // O SDK emite INITIAL_SESSION após processar o retorno do e-mail e o armazenamento.
    const unsubscribe = subscribeToAuth((session) => {
      if (lifecycle.signal.aborted) return
      const current = ++revision.current
      clearTimeout(pending.current)

      if (!session) {
        setState({ status: 'anonymous', message: confirmationError })
        return
      }

      setState({ status: 'loading' })
      // Chamadas Auth ficam fora do callback para não disputar o lock do SDK.
      pending.current = setTimeout(() => {
        void validateSession(session).then(
          (user) => {
            if (!lifecycle.signal.aborted && current === revision.current) setState({ status: 'authenticated', user })
          },
          (error: unknown) => {
            if (!lifecycle.signal.aborted && current === revision.current) {
              setState({ status: 'anonymous', message: authErrorMessage(error) })
            }
          },
        )
      }, 0)
    })

    return () => {
      lifecycle.abort()
      clearTimeout(pending.current)
      unsubscribe()
    }
  }, [])

  return state
}
