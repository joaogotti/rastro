import type { DatabaseTransactionInsert, DatabaseTransactionRow, DatabaseTransactionUpdate } from '../types/database.ts'
import type { PersistedTransaction, TransactionType, TransactionWriteInput } from '../types/transaction.ts'
import { centsToDatabaseAmount, databaseAmountToCents } from '../utils/money.ts'
import { isValidTransactionDate } from '../utils/transactions.ts'

function requireText(value: string, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Campo obrigatório inválido: ${field}.`)
  return value
}

function requireType(value: TransactionType): TransactionType {
  if (value !== 'income' && value !== 'expense') throw new Error('Tipo de transação inválido.')
  return value
}

function requireDate(value: string): string {
  if (!isValidTransactionDate(value)) throw new Error('Data da transação inválida.')
  return value
}

function requireCategoryId(value: string | null): string | null {
  return value === null ? null : requireText(value, 'category_id')
}

export function fromDatabaseTransaction(row: DatabaseTransactionRow): PersistedTransaction {
  return {
    id: requireText(row.id, 'id'),
    userId: requireText(row.user_id, 'user_id'),
    categoryId: requireCategoryId(row.category_id),
    type: requireType(row.type),
    name: requireText(row.description, 'description'),
    amount: databaseAmountToCents(row.amount),
    date: requireDate(row.transaction_date),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toTransactionUpdate(input: TransactionWriteInput): DatabaseTransactionUpdate {
  const description = requireText(input.name, 'description').trim()
  if (description.length > 120) throw new Error('A descrição deve ter no máximo 120 caracteres.')

  return {
    type: requireType(input.type),
    description,
    amount: centsToDatabaseAmount(input.amount),
    transaction_date: requireDate(input.date),
    category_id: requireCategoryId(input.categoryId),
    // Ausência significa preservar notes; null significa limpar explicitamente.
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  }
}

export function toTransactionInsert(input: TransactionWriteInput, authenticatedUserId: string): DatabaseTransactionInsert {
  return {
    ...toTransactionUpdate(input),
    user_id: requireText(authenticatedUserId, 'user_id'),
  }
}
