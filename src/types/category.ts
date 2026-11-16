import type { TransactionType } from './transaction.ts'

export type Category = {
  id: string
  name: string
  type: TransactionType
  userId: string | null
}

export type CategoryWriteInput = Pick<Category, 'name' | 'type'>
