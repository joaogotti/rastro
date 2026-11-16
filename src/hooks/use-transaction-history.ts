import { useCallback, useEffect, useState } from 'react'
import { readCategories } from '../services/categories.ts'
import { readPeriodTotals, readTransactionPage } from '../services/transaction-history.ts'
import type { HistoryCursor, HistoryFilters } from '../utils/transaction-history.ts'

function useResource<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<{ key: string; data: T; error?: never } | { key: string; error: string; data?: never } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setResult({ key, data }) },
      () => { if (!controller.signal.aborted) setResult({ key, error: 'Não foi possível carregar estes dados. Tente novamente.' }) },
    )
    return () => controller.abort()
  }, [key, load])
  return result?.key === key ? result : null
}
export function useTransactionHistory(userId: string, filters: HistoryFilters, cursor: HistoryCursor | null, revision: number) {
  const options = useCallback((signal: AbortSignal) => ({ signal, expectedUserId: userId }), [userId])
  const loadPage = useCallback((signal: AbortSignal) => readTransactionPage(filters, cursor, options(signal)), [filters, cursor, options])
  const loadTotals = useCallback((signal: AbortSignal) => readPeriodTotals({ start: filters.start, end: filters.end }, options(signal)), [filters.start, filters.end, options])
  const loadCategories = useCallback((signal: AbortSignal) => readCategories(options(signal)), [options])
  const page = useResource(JSON.stringify([userId, filters, cursor, revision]), loadPage)
  const totals = useResource(JSON.stringify([userId, filters.start, filters.end, revision]), loadTotals)
  const categories = useResource(JSON.stringify([userId, revision]), loadCategories)
  return { page, totals, categories }
}
