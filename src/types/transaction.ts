import type { TransactionCategory } from '../data/transaction-categories.ts'

export type TransactionType = 'income' | 'expense'

export type Transaction = {
  id: string
  name: string
  category: TransactionCategory
  date: string
  type: TransactionType
  amount: number
}

export type TransactionDraft = Omit<Transaction, 'id'>
export type TransactionFilter = 'all' | Transaction['type']

// Modelo para a integração futura, sem limitar categorias à lista demonstrativa.
export type PersistedTransaction = Omit<Transaction, 'category'> & {
  userId: string
  categoryId: string | null
  notes: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type TransactionWriteInput = Pick<PersistedTransaction,
  'type' | 'name' | 'amount' | 'date' | 'categoryId'
> & {
  notes?: string | null
}

export type TransactionView = PersistedTransaction & { category: string }
