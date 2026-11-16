import { useEffect, useRef, useState } from 'react'
import { subscribeToAuth } from '../services/auth.ts'
import { readInvestmentTotal, saveInvestmentTotal } from '../services/investments.ts'

type State = {
  userId: string
  attempt: number
  amount: number | null
  status: 'loading' | 'success' | 'error'
  message?: string
}

export function useInvestmentTotal(userId: string, active = true) {
  const [result, setResult] = useState<State>({ userId, attempt: -1, amount: null, status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const lifecycle = useRef<AbortController | null>(null)
  const saving = useRef(false)

  useEffect(() => subscribeToAuth(() => {
    lifecycle.current?.abort()
    setAttempt((value) => value + 1)
  }), [userId])

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    lifecycle.current = controller
    saving.current = false
    void readInvestmentTotal({ expectedUserId: userId, signal: controller.signal }).then(
      (amount) => {
        if (!controller.signal.aborted) setResult({ userId, attempt, amount, status: 'success' })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ userId, attempt, amount: null, status: 'error', message: error instanceof Error ? error.message : 'Não foi possível carregar seus investimentos.' })
      },
    )
    return () => controller.abort()
  }, [userId, active, attempt])

  const state = result.userId === userId && result.attempt === attempt ? result : { userId, amount: null, status: 'loading' as const }

  async function save(amount: number) {
    const controller = lifecycle.current
    if (!controller || controller.signal.aborted || saving.current || state.status !== 'success') {
      throw new Error('Aguarde o carregamento dos investimentos e tente novamente.')
    }
    saving.current = true
    try {
      const confirmed = await saveInvestmentTotal(amount, { expectedUserId: userId, signal: controller.signal })
      if (controller.signal.aborted || lifecycle.current !== controller) throw new Error('A sessão mudou. Confira seus investimentos.')
      setResult({ userId, attempt, amount: confirmed, status: 'success' })
    } finally {
      if (lifecycle.current === controller) saving.current = false
    }
  }

  return { state, save, retry: () => setAttempt((value) => value + 1) }
}
