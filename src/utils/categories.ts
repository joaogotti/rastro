import type { CategoryWriteInput } from '../types/category.ts'

// Contrato confirmado pelo responsável na inspeção real do Supabase.
export const CATEGORY_NAME_LIMIT = 50
export function validateCategory(input: CategoryWriteInput): CategoryWriteInput {
  if (typeof input.name !== 'string' || !input.name.trim()) throw new Error('Informe o nome da categoria.')
  const name = input.name.trim()
  if (name.length > CATEGORY_NAME_LIMIT) throw new Error(`Use no máximo ${CATEGORY_NAME_LIMIT} caracteres no nome.`)
  if (input.type !== 'income' && input.type !== 'expense') throw new Error('Selecione receita ou despesa.')
  return { name, type: input.type }
}
