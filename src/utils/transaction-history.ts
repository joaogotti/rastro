import type { TransactionFilter } from '../types/transaction.ts'
import { currentPeriod, shiftPeriod } from './periods.ts'
import { isValidTransactionDate } from './transactions.ts'

export type HistoryPeriod = { start: string; end: string }
export type HistoryFilters = HistoryPeriod & { search: string; type: TransactionFilter; categoryId: string; ascending: boolean }
export type HistoryCursor = { date: string; id: string }
export const HISTORY_PAGE_SIZE = 20
export const isUuid = (value: string) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
export function monthRange(previous = false): HistoryPeriod {
  const period = previous ? shiftPeriod(currentPeriod(), -1) : currentPeriod()
  const date = new Date(`${period}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + 1, 0)
  return { start: `${period}-01`, end: date.toISOString().slice(0, 10) }
}
export function validateHistoryPeriod(period: HistoryPeriod) {
  if (!isValidTransactionDate(period.start) || !isValidTransactionDate(period.end) || period.start > period.end) throw new Error('Informe uma data inicial e final válidas, na ordem correta.')
  return period
}
export function normalizeHistoryFilters(filters: HistoryFilters): HistoryFilters {
  validateHistoryPeriod(filters)
  if (!['all', 'income', 'expense'].includes(filters.type)) throw new Error('Selecione um tipo válido.')
  if (filters.categoryId && filters.categoryId !== 'none' && !isUuid(filters.categoryId)) throw new Error('Selecione uma categoria válida.')
  const search = filters.search.trim().replace(/\s+/g, ' ')
  if (search.length > 120) throw new Error('Use até 120 caracteres na pesquisa.')
  return { ...filters, search }
}
// Expressão regular literal, sem padrões fornecidos pelo usuário ou alias * de LIKE.
export function literalSearch(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
