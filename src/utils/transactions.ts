import { categoryAppearance, transactionCategories } from '../data/transaction-categories.ts'
import type { Category } from '../types/category.ts'
import type { TransactionWriteInput, Transaction, TransactionDraft, TransactionFilter } from '../types/transaction.ts'
import { parseMoney } from './money.ts'
import { shiftPeriod } from './periods.ts'

export function parseAmount(value: string): number | null {
  const cents = parseMoney(value)
  return cents !== null && cents > 0 ? cents : null
}

export type TransactionFields = {
  type: string
  name: string
  amount: string
  date: string
  category: string
}

export function isValidTransactionDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function validateFields(fields: TransactionFields) {
  const errors: Partial<Record<keyof TransactionFields, string>> = {}
  const amount = parseAmount(fields.amount)
  if (fields.type !== 'income' && fields.type !== 'expense') errors.type = 'Selecione receita ou despesa.'
  if (!fields.name.trim()) errors.name = 'Informe uma descrição.'
  else if (fields.name.trim().length > 120) errors.name = 'Use no máximo 120 caracteres.'
  if (amount === null) errors.amount = 'Informe um valor positivo, com até duas casas decimais, de até R$ 99.999.999,99.'

  if (!isValidTransactionDate(fields.date)) {
    errors.date = 'Informe uma data válida.'
  }
  return { errors, amount }
}

export function validateTransaction(fields: TransactionFields): {
  errors: Partial<Record<keyof TransactionFields, string>>
  draft?: TransactionDraft
} {
  const { errors, amount } = validateFields(fields)
  const category = transactionCategories.find((item) => item.name === (fields.category || 'Sem categoria'))
  if (!category) errors.category = 'Selecione uma categoria válida ou Sem categoria.'

  if (Object.keys(errors).length || amount === null || !category || (fields.type !== 'income' && fields.type !== 'expense')) return { errors }
  return { errors, draft: { type: fields.type, name: fields.name.trim(), amount, date: fields.date, category: category.name } }
}

export function validateTransactionWrite(fields: TransactionFields, categories: Category[]): {
  errors: Partial<Record<keyof TransactionFields, string>>
  input?: TransactionWriteInput
} {
  const { errors, amount } = validateFields(fields)
  if (fields.category && !categories.some((category) => category.id === fields.category && category.type === fields.type)) {
    errors.category = 'Selecione uma categoria compatível com o tipo ou Sem categoria.'
  }
  if (Object.keys(errors).length || amount === null || (fields.type !== 'income' && fields.type !== 'expense')) return { errors }
  return { errors, input: { type: fields.type, name: fields.name.trim(), amount, date: fields.date, categoryId: fields.category || null } }
}

export function saveTransaction(transactions: Transaction[], draft: TransactionDraft, id: string): Transaction[] {
  const transaction = { ...draft, id }
  return transactions.some((item) => item.id === id)
    ? transactions.map((item) => item.id === id ? transaction : item)
    : [...transactions, transaction]
}

type FinancialTransaction = Pick<Transaction, 'id' | 'date' | 'type' | 'amount'>

export function filterTransactions<T extends FinancialTransaction>(transactions: T[], period: string, filter: TransactionFilter = 'all'): T[] {
  return transactions
    .filter((item) => item.date.startsWith(`${period}-`) && (filter === 'all' || item.type === filter))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
}

export function summarizeTransactions(transactions: Pick<Transaction, 'type' | 'amount'>[]) {
  return transactions.reduce((summary, item) => {
    if (!Number.isSafeInteger(item.amount) || item.amount <= 0 || !['income', 'expense'].includes(item.type)) throw new Error('Valor financeiro inválido.')
    if (item.type === 'income') summary.income += item.amount
    else summary.expenses += item.amount
    if (!Number.isSafeInteger(summary.income) || !Number.isSafeInteger(summary.expenses)) throw new Error('O total financeiro excede a precisão suportada.')
    return summary
  }, { income: 0, expenses: 0 })
}

export function groupExpenses(transactions: (Pick<Transaction, 'type' | 'amount'> & { category: string; categoryId?: string | null })[]) {
  const groups = new Map<string, { id: string; name: string; color: string; amount: number }>()
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue
    const id = transaction.categoryId === undefined ? `name:${transaction.category}` : transaction.categoryId === null ? 'uncategorized' : `id:${transaction.categoryId}`
    const group = groups.get(id) ?? { id, name: transaction.category, color: categoryAppearance(transaction.category).color, amount: 0 }
    group.amount += transaction.amount
    groups.set(id, group)
  }
  return [...groups.values()].filter((group) => group.amount > 0).sort((a, b) => b.amount - a.amount)
}

export function rankExpenses<T extends FinancialTransaction>(transactions: T[]): T[] {
  return transactions.filter((item) => item.type === 'expense')
    .sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
}

export function getEvolution(transactions: FinancialTransaction[], period: string) {
  const periods = [...new Set(Array.from({ length: 6 }, (_, index) => shiftPeriod(period, index - 5)))].sort()
  return periods.map((key) => {
    const date = new Date(`${key}-01T12:00:00Z`)
    return {
      period: key,
      month: new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(date),
      ...summarizeTransactions(filterTransactions(transactions, key)),
    }
  })
}
