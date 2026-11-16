import { fromDatabaseTransaction, toTransactionInsert, toTransactionUpdate } from '../adapters/transaction.ts'
import { supabase } from '../lib/supabase.ts'
import type { DatabaseTransactionRow } from '../types/database.ts'
import type { PersistedTransaction, TransactionWriteInput } from '../types/transaction.ts'
import { checkReadSession, createReadContext, FinancialReadError, readAllPages, READ_PAGE_SIZE } from './read-utils.ts'
import { readCategories } from './categories.ts'
import type { ReadOptions } from './read-utils.ts'
import { isUuid } from '../utils/transaction-history.ts'

export class TransactionDeleteError extends Error {
  constructor(message = 'Não foi possível confirmar a exclusão. Atualize o histórico e confira o lançamento antes de tentar novamente.') {
    super(message); this.name = 'TransactionDeleteError'
  }
}
export async function deleteTransaction(id: string, options: ReadOptions = {}): Promise<void> {
  try {
    if (!isUuid(id)) throw new TransactionDeleteError('Identificador inválido. Atualize o histórico.')
    const context = await createReadContext(options)
    await checkReadSession(context)
    let query = supabase.from('transactions').delete().eq('id', id).eq('user_id', context.userId)
      .select('id,user_id').setHeader('Authorization', `Bearer ${context.accessToken}`)
    if (context.signal) query = query.abortSignal(context.signal)
    const { data, error } = await query.single<{ id: string; user_id: string }>()
    await checkReadSession(context)
    if (error || !data || data.id !== id || data.user_id !== context.userId) throw new TransactionDeleteError()
    let verification = supabase.from('transactions').select('id', { count: 'exact', head: true })
      .eq('id', id).eq('user_id', context.userId).setHeader('Authorization', `Bearer ${context.accessToken}`)
    if (context.signal) verification = verification.abortSignal(context.signal)
    const result = await verification
    await checkReadSession(context)
    if (result.error || result.count !== 0) throw new TransactionDeleteError()
  } catch (error: unknown) {
    if (error instanceof TransactionDeleteError) throw error
    throw new TransactionDeleteError()
  }
}

export class TransactionCreateError extends Error {
  constructor(message = 'Não foi possível confirmar o cadastro. Atualize os dados antes de tentar novamente para evitar duplicidade.') {
    super(message)
    this.name = 'TransactionCreateError'
  }
}

export class TransactionUpdateError extends Error {
  constructor(message = 'Não foi possível confirmar a atualização. Atualize os dados e confira o lançamento antes de tentar novamente.') {
    super(message)
    this.name = 'TransactionUpdateError'
  }
}

async function hasCompatibleCategory(input: TransactionWriteInput, options: ReadOptions, userId: string) {
  if (input.categoryId === null) return true
  const categories = await readCategories({ ...options, expectedUserId: userId })
  return categories.some((category) => category.id === input.categoryId && category.type === input.type)
}

export async function updateTransaction(id: string, input: TransactionWriteInput, options: ReadOptions = {}): Promise<PersistedTransaction> {
  try {
    const context = await createReadContext(options)
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) throw new TransactionUpdateError('O identificador da transação é inválido. Atualize os dados.')
    // O formulário desta etapa não edita notes. Somente estes cinco campos saem na atualização.
    const { type, name, amount, date, categoryId } = input
    const payload = toTransactionUpdate({ type, name, amount, date, categoryId })
    if (!await hasCompatibleCategory(input, options, context.userId)) throw new TransactionUpdateError('Selecione uma categoria compatível com o tipo ou Sem categoria.')
    await checkReadSession(context)
    let query = supabase.from('transactions').update(payload)
      .eq('id', id).eq('user_id', context.userId)
      .select('id,user_id,category_id,type,amount,description,transaction_date,notes,created_at,updated_at')
      .setHeader('Authorization', `Bearer ${context.accessToken}`)
    if (options.signal) query = query.abortSignal(options.signal)
    const { data, error } = await query.single<DatabaseTransactionRow>()
    await checkReadSession(context)
    if (error || !data) throw new TransactionUpdateError()
    const saved = fromDatabaseTransaction(data)
    if (saved.id !== id || saved.userId !== context.userId || saved.type !== payload.type || saved.name !== payload.description ||
      saved.amount !== amount || saved.date !== payload.transaction_date || saved.categoryId !== categoryId) throw new TransactionUpdateError()
    return saved
  } catch (error: unknown) {
    if (error instanceof TransactionUpdateError) throw error
    if (error instanceof FinancialReadError && error.kind === 'auth') throw new TransactionUpdateError('Sua sessão não é válida ou mudou. Entre novamente e confira o lançamento.')
    throw new TransactionUpdateError()
  }
}

export async function createTransaction(input: TransactionWriteInput, options: ReadOptions = {}): Promise<PersistedTransaction> {
  try {
    const context = await createReadContext(options)
    const payload = toTransactionInsert(input, context.userId)
    if (!await hasCompatibleCategory(input, options, context.userId)) throw new TransactionCreateError('Selecione uma categoria compatível com o tipo ou Sem categoria.')
    await checkReadSession(context)
    let query = supabase.from('transactions').insert(payload)
      .select('id,user_id,category_id,type,amount,description,transaction_date,notes,created_at,updated_at')
      .setHeader('Authorization', `Bearer ${context.accessToken}`)
    if (options.signal) query = query.abortSignal(options.signal)
    const { data, error } = await query.single<DatabaseTransactionRow>()
    await checkReadSession(context)
    if (error || !data) throw new TransactionCreateError()
    const saved = fromDatabaseTransaction(data)
    if (saved.userId !== context.userId || saved.type !== payload.type || saved.name !== payload.description ||
      saved.amount !== input.amount || saved.date !== payload.transaction_date || saved.categoryId !== payload.category_id) {
      throw new TransactionCreateError()
    }
    return saved
  } catch (error: unknown) {
    if (error instanceof TransactionCreateError) throw error
    if (error instanceof FinancialReadError && error.kind === 'auth') {
      throw new TransactionCreateError('Sua sessão não é válida ou mudou. Entre novamente e confira seus lançamentos antes de tentar outra vez.')
    }
    throw new TransactionCreateError()
  }
}

export async function readTransactions(options: ReadOptions = {}): Promise<PersistedTransaction[]> {
  const context = await createReadContext(options)
  const rows = await readAllPages<DatabaseTransactionRow>(context, (afterId) => {
    let query = supabase.from('transactions')
      .select('id,user_id,category_id,type,amount,description,transaction_date,notes,created_at,updated_at')
      .eq('user_id', context.userId)
      .setHeader('Authorization', `Bearer ${context.accessToken}`)
      .order('id', { ascending: true })
      .limit(READ_PAGE_SIZE)

    if (afterId !== null) query = query.gt('id', afterId)
    if (options.signal) query = query.abortSignal(options.signal)
    return query.returns<DatabaseTransactionRow[]>()
  })

  try {
    return rows.map((row) => {
      if (row.user_id !== context.userId) throw new FinancialReadError('data')
      return fromDatabaseTransaction(row)
    })
  } catch {
    // Nunca devolver uma lista parcial ou detalhes brutos do servidor/adaptador.
    throw new FinancialReadError('data')
  }
}
