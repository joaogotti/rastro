import type { Category } from '../types/category.ts'
import type { DatabaseCategoryRow } from '../types/database.ts'

export function fromDatabaseCategory(row: DatabaseCategoryRow): Category {
  if (typeof row.id !== 'string' || !row.id.trim() || typeof row.name !== 'string' || !row.name.trim()) {
    throw new Error('Categoria recebida com formato inválido.')
  }
  if (row.type !== 'income' && row.type !== 'expense') throw new Error('Tipo de categoria inválido.')
  if (row.user_id !== null && (typeof row.user_id !== 'string' || !row.user_id.trim())) throw new Error('Proprietário da categoria inválido.')
  return { id: row.id, name: row.name, type: row.type, userId: row.user_id }
}
