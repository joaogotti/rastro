import { fromDatabaseCategory } from '../adapters/category.ts'
import { supabase } from '../lib/supabase.ts'
import type { Category, CategoryWriteInput } from '../types/category.ts'
import type { DatabaseCategoryRow } from '../types/database.ts'
import { checkReadSession, createReadContext, FinancialReadError, readAllPages, READ_PAGE_SIZE } from './read-utils.ts'
import type { ReadOptions } from './read-utils.ts'
import { validateCategory } from '../utils/categories.ts'

const columns = 'id,name,type,user_id'

export class CategoryWriteError extends Error {
  constructor(message = 'Não foi possível confirmar a operação. Atualize a lista antes de tentar novamente.') {
    super(message)
    this.name = 'CategoryWriteError'
  }
}

export async function readCategories(options: ReadOptions = {}): Promise<Category[]> {
  const context = await createReadContext(options)
  const rows = await readAllPages<DatabaseCategoryRow>(context, (afterId) => {
    // Sem filtro de proprietário: o RLS inclui as globais e as particulares permitidas.
    let query = supabase.from('categories').select(columns)
      .setHeader('Authorization', `Bearer ${context.accessToken}`)
      .order('id', { ascending: true })
      .limit(READ_PAGE_SIZE)

    if (afterId !== null) query = query.gt('id', afterId)
    if (options.signal) query = query.abortSignal(options.signal)
    return query.returns<DatabaseCategoryRow[]>()
  })

  try {
    return rows.map((row) => {
      const category = fromDatabaseCategory(row)
      if (category.userId !== null && category.userId !== context.userId) throw new FinancialReadError('data')
      return category
    })
  } catch {
    throw new FinancialReadError('data')
  }
}

type Context = Awaited<ReturnType<typeof createReadContext>>
async function ownCategory(id: string, context: Context): Promise<Category> {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) throw new CategoryWriteError('Identificador de categoria inválido. Atualize a lista.')
  let query = supabase.from('categories').select(columns).eq('id', id).eq('user_id', context.userId)
    .setHeader('Authorization', `Bearer ${context.accessToken}`)
  if (context.signal) query = query.abortSignal(context.signal)
  const { data, error } = await query.single<DatabaseCategoryRow>()
  await checkReadSession(context)
  if (error || !data) throw new CategoryWriteError('Categoria indisponível. Apenas categorias particulares da sua conta podem ser alteradas.')
  const category = fromDatabaseCategory(data)
  if (category.id !== id || category.userId !== context.userId) throw new CategoryWriteError()
  return category
}

export async function getCategoryTransactionCount(id: string, options: ReadOptions = {}): Promise<number> {
  try {
    const context = await createReadContext(options)
    await ownCategory(id, context)
    let query = supabase.from('transactions').select('id', { count: 'exact', head: true })
      .eq('category_id', id).eq('user_id', context.userId)
      .setHeader('Authorization', `Bearer ${context.accessToken}`)
    if (context.signal) query = query.abortSignal(context.signal)
    const { count, error } = await query
    await checkReadSession(context)
    if (error || count === null || !Number.isSafeInteger(count) || count < 0) throw new CategoryWriteError('Não foi possível contar as transações vinculadas. Tente novamente.')
    return count
  } catch (error: unknown) { throw writeError(error) }
}

function writeError(error: unknown): CategoryWriteError {
  if (error instanceof CategoryWriteError) return error
  if (error instanceof FinancialReadError && error.kind === 'auth') return new CategoryWriteError('Sua sessão mudou ou expirou. Entre novamente e atualize a lista.')
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if (error.code === '23505') return new CategoryWriteError('Já existe uma categoria com esses dados. Revise o nome e o tipo.')
    if (error.code === '23503') return new CategoryWriteError('A categoria possui vínculos e não pode ser excluída.')
    if (error.code === '23514' || error.code === '22001') return new CategoryWriteError('O nome ou tipo não atende às regras do banco. Revise os campos.')
  }
  return new CategoryWriteError()
}

export async function saveCategory(input: CategoryWriteInput, id: string | null, options: ReadOptions = {}): Promise<Category> {
  // Valida antes do envio, sem aceitar proprietário ou outros campos do formulário.
  let payload: CategoryWriteInput
  try { payload = validateCategory(input) } catch (error: unknown) { throw new CategoryWriteError(error instanceof Error ? error.message : 'Revise os campos.') }
  try {
    const context = await createReadContext(options)
    if (id !== null) {
      const current = await ownCategory(id, context)
      // Alteração de tipo permanece bloqueada por orientação do responsável.
      if (payload.type !== current.type) {
        throw new CategoryWriteError('A troca de tipo está indisponível. Crie uma categoria do outro tipo.')
      }
    }
    await checkReadSession(context)
    const mutation = id === null
      ? supabase.from('categories').insert({ ...payload, user_id: context.userId })
      : supabase.from('categories').update({ name: payload.name }).eq('id', id).eq('user_id', context.userId)
    let query = mutation.select(columns).setHeader('Authorization', `Bearer ${context.accessToken}`)
    if (context.signal) query = query.abortSignal(context.signal)
    const { data, error } = await query.single<DatabaseCategoryRow>()
    await checkReadSession(context)
    if (error) throw error
    if (!data) throw new CategoryWriteError()
    const saved = fromDatabaseCategory(data)
    if (saved.userId !== context.userId || saved.name !== payload.name || saved.type !== payload.type || (id !== null && saved.id !== id)) throw new CategoryWriteError()
    return saved
  } catch (error: unknown) { throw writeError(error) }
}

export async function deleteCategory(id: string, options: ReadOptions = {}): Promise<void> {
  try {
    const context = await createReadContext(options)
    await ownCategory(id, context)
    // FK real confirmada: transactions.category_id ON DELETE SET NULL.
    // Não enviar UPDATE/DELETE de transações: o banco remove só a associação.
    await checkReadSession(context)
    let query = supabase.from('categories').delete().eq('id', id).eq('user_id', context.userId)
      .select(columns).setHeader('Authorization', `Bearer ${context.accessToken}`)
    if (context.signal) query = query.abortSignal(context.signal)
    const { data, error } = await query.single<DatabaseCategoryRow>()
    await checkReadSession(context)
    if (error) throw error
    if (!data) throw new CategoryWriteError()
    const deleted = fromDatabaseCategory(data)
    if (deleted.id !== id || deleted.userId !== context.userId) throw new CategoryWriteError()
  } catch (error: unknown) { throw writeError(error) }
}
