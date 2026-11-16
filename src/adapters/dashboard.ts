import type { Category } from '../types/category.ts'
import type { PersistedTransaction, TransactionView } from '../types/transaction.ts'
import { summarizeTransactions } from '../utils/transactions.ts'

export function toDashboardTransactions(transactions: PersistedTransaction[], categories: Category[], userId: string): TransactionView[] {
  // Validar antes de publicar no hook, onde falhas viram estado de erro.
  const months = new Map<string, PersistedTransaction[]>()
  for (const transaction of transactions) {
    const period = transaction.date.slice(0, 7)
    const month = months.get(period) ?? []
    month.push(transaction)
    months.set(period, month)
  }
  for (const month of months.values()) summarizeTransactions(month)
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]))
  return transactions.map((transaction) => {
    if (transaction.userId !== userId) throw new Error('Proprietário da transação não corresponde à sessão atual.')
    return {
      ...transaction,
      category: transaction.categoryId === null ? 'Sem categoria' : categoryNames.get(transaction.categoryId) ?? 'Categoria indisponível',
    }
  })
}
