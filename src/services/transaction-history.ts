import { fromDatabaseTransaction } from '../adapters/transaction.ts'
import { supabase } from '../lib/supabase.ts'
import type { DatabaseTransactionRow } from '../types/database.ts'
import { checkReadSession, createReadContext, FinancialReadError, readAllPages, READ_PAGE_SIZE } from './read-utils.ts'
import type { ReadOptions } from './read-utils.ts'
import { databaseAmountToCents } from '../utils/money.ts'
import { HISTORY_PAGE_SIZE, isUuid, literalSearch, normalizeHistoryFilters, validateHistoryPeriod } from '../utils/transaction-history.ts'
import type { HistoryCursor, HistoryFilters, HistoryPeriod } from '../utils/transaction-history.ts'

const columns = 'id,user_id,category_id,type,amount,description,transaction_date,notes,created_at,updated_at'
type Context = Awaited<ReturnType<typeof createReadContext>>
function base(context: Context, period: HistoryPeriod, head = false) {
  let query = supabase.from('transactions').select(head ? 'id' : columns, head ? { count: 'exact', head: true } : {})
    .eq('user_id', context.userId).gte('transaction_date', period.start).lte('transaction_date', period.end)
    .setHeader('Authorization', `Bearer ${context.accessToken}`)
  if (context.signal) query = query.abortSignal(context.signal)
  return query
}
function filtered(context: Context, filters: HistoryFilters, head = false) {
  let query = base(context, filters, head)
  if (filters.type !== 'all') query = query.eq('type', filters.type)
  if (filters.categoryId === 'none') query = query.is('category_id', null)
  else if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
  if (filters.search) query = query.filter('description', 'imatch', literalSearch(filters.search))
  return query
}
async function countRows(context: Context, query: ReturnType<typeof base>): Promise<number> {
  await checkReadSession(context)
  const { error, count } = await query
  await checkReadSession(context)
  if (error) throw new FinancialReadError('query')
  if (count === null || !Number.isSafeInteger(count) || count < 0) throw new FinancialReadError('data')
  return count
}

export async function readTransactionPage(raw: HistoryFilters, cursor: HistoryCursor | null = null, options: ReadOptions = {}) {
  const filters = normalizeHistoryFilters(raw)
  if (cursor && (!isUuid(cursor.id) || !/^\d{4}-\d{2}-\d{2}$/.test(cursor.date))) throw new FinancialReadError('data')
  if (cursor) validateHistoryPeriod({ start: cursor.date, end: cursor.date })
  const context = await createReadContext(options)
  const count = await countRows(context, filtered(context, filters, true))
  const rows: DatabaseTransactionRow[] = []
  const seen = new Set<string>()
  let after = cursor
  // Preenche a página mesmo se o servidor limitar retornos a menos de 20.
  while (rows.length <= HISTORY_PAGE_SIZE) {
    await checkReadSession(context)
    let query = filtered(context, filters)
      .order('transaction_date', { ascending: filters.ascending }).order('id', { ascending: filters.ascending })
      .limit(HISTORY_PAGE_SIZE + 1 - rows.length)
    if (after) {
      const op = filters.ascending ? 'gt' : 'lt'
      query = query.or(`transaction_date.${op}.${after.date},and(transaction_date.eq.${after.date},id.${op}.${after.id})`)
    }
    const { data, error } = await query.returns<DatabaseTransactionRow[]>()
    await checkReadSession(context)
    if (error) throw new FinancialReadError('query')
    if (!Array.isArray(data)) throw new FinancialReadError('data')
    if (!data.length) break
    for (const row of data) {
      if (!row || !isUuid(row.id) || row.user_id !== context.userId || seen.has(row.id)) throw new FinancialReadError('data')
      fromDatabaseTransaction(row)
      if (row.transaction_date < filters.start || row.transaction_date > filters.end) throw new FinancialReadError('data')
      const prior = rows.at(-1) ?? (after ? { transaction_date: after.date, id: after.id } : null)
      if (prior) {
        const comparison = row.transaction_date.localeCompare(prior.transaction_date) || row.id.localeCompare(prior.id)
        if (filters.ascending ? comparison <= 0 : comparison >= 0) throw new FinancialReadError('data')
      }
      seen.add(row.id); rows.push(row)
    }
    after = { id: data.at(-1)!.id, date: data.at(-1)!.transaction_date }
  }
  if (!cursor && rows.length <= HISTORY_PAGE_SIZE && rows.length !== count) throw new FinancialReadError('data')
  const transactions = rows.slice(0, HISTORY_PAGE_SIZE).map(fromDatabaseTransaction)
  const last = transactions.at(-1)
  return { transactions, count, next: rows.length > HISTORY_PAGE_SIZE && last ? { id: last.id, date: last.date } : null }
}

export async function readPeriodTotals(period: HistoryPeriod, options: ReadOptions = {}) {
  validateHistoryPeriod(period)
  const context = await createReadContext(options)
  const expected = await countRows(context, base(context, period, true))
  type Row = Pick<DatabaseTransactionRow, 'id' | 'user_id' | 'type' | 'amount' | 'transaction_date'>
  const rows = await readAllPages<Row>(context, (after) => {
    let query = supabase.from('transactions').select('id,user_id,type,amount,transaction_date')
      .eq('user_id', context.userId).gte('transaction_date', period.start).lte('transaction_date', period.end)
      .order('id', { ascending: true }).limit(READ_PAGE_SIZE).setHeader('Authorization', `Bearer ${context.accessToken}`)
    if (after) query = query.gt('id', after)
    if (context.signal) query = query.abortSignal(context.signal)
    return query.returns<Row[]>()
  })
  const finalCount = await countRows(context, base(context, period, true))
  if (rows.length !== expected || finalCount !== expected) throw new FinancialReadError('data')
  let income = 0; let expenses = 0
  for (const row of rows) {
    if (row.user_id !== context.userId || row.transaction_date < period.start || row.transaction_date > period.end) throw new FinancialReadError('data')
    const amount = databaseAmountToCents(row.amount)
    if (row.type === 'income') income += amount
    else if (row.type === 'expense') expenses += amount
    else throw new FinancialReadError('data')
    if (!Number.isSafeInteger(income) || !Number.isSafeInteger(expenses)) throw new FinancialReadError('data')
  }
  return { income, expenses }
}
