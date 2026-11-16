import { useEffect, useRef, useState } from 'react'
import { toDashboardTransactions } from '../adapters/dashboard.ts'
import { readCategories } from '../services/categories.ts'
import { FinancialReadError } from '../services/read-utils.ts'
import { readTransactions } from '../services/transactions.ts'
import type { TransactionView } from '../types/transaction.ts'

type LoadResult = { userId: string; attempt: number } & (
  | { status: 'success'; transactions: TransactionView[] }
  | { status: 'error'; message: string }
)

export function useDashboardData(userId: string, active = true) {
  const [result, setResult] = useState<LoadResult | null>(null)
  const [attempt, setAttempt] = useState(0)
  const revision = useRef(0)

  useEffect(() => {
    const refresh = () => setAttempt((value) => value + 1)
    window.addEventListener('rastro:categories-changed', refresh)
    window.addEventListener('rastro:transactions-changed', refresh)
    return () => { window.removeEventListener('rastro:categories-changed', refresh); window.removeEventListener('rastro:transactions-changed', refresh) }
  }, [])

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    const current = ++revision.current
    const options = { signal: controller.signal, expectedUserId: userId }

    void Promise.all([readTransactions(options), readCategories(options)])
      .then(([transactions, categories]) => {
        if (controller.signal.aborted || current !== revision.current) return
        const resolved = toDashboardTransactions(transactions, categories, userId)
        setResult({ userId, attempt, status: 'success', transactions: resolved })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || current !== revision.current) return
        controller.abort()
        setResult({ userId, attempt, status: 'error', message: error instanceof FinancialReadError ? error.message : 'Não foi possível carregar seus dados financeiros. Tente novamente.' })
      })

    return () => controller.abort()
  }, [userId, attempt, active])

  const state = result?.userId === userId && result.attempt === attempt ? result : { status: 'loading' as const }
  return { state, retry: () => setAttempt((value) => value + 1) }
}
