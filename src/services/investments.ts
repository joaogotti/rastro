import { supabase } from '../lib/supabase.ts'
import type { DatabaseInvestmentTotalRow } from '../types/database.ts'
import { MAX_MONEY_CENTS } from '../utils/money.ts'
import { checkReadSession, createReadContext, FinancialReadError } from './read-utils.ts'
import type { ReadOptions } from './read-utils.ts'

export class InvestmentError extends Error {
  constructor(message = 'Não foi possível confirmar o salvamento dos investimentos. Atualize os dados e confira o valor salvo antes de tentar novamente.') {
    super(message)
    this.name = 'InvestmentError'
  }
}

function validAmount(amount: number) {
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_MONEY_CENTS
}

function decode(row: DatabaseInvestmentTotalRow, userId: string): number {
  const raw = row.amount_cents
  if (row.user_id !== userId || !/^(0|[1-9]\d*)$/.test(String(raw)) ||
    !['number', 'string'].includes(typeof raw) || !validAmount(Number(raw))) {
    throw new FinancialReadError('data')
  }
  return Number(raw)
}

async function checkSession(context: Awaited<ReturnType<typeof createReadContext>>) {
  await checkReadSession(context)
  const { data, error } = await supabase.auth.getSession()
  if (error || data.session?.access_token !== context.accessToken) throw new FinancialReadError('auth')
  if (context.signal?.aborted) throw new FinancialReadError('aborted')
}

export async function readInvestmentTotal(options: ReadOptions = {}): Promise<number | null> {
  try {
    const context = await createReadContext(options)
    await checkSession(context)
    let query = supabase.from('investment_totals').select('user_id,amount_cents,updated_at')
      .eq('user_id', context.userId).setHeader('Authorization', `Bearer ${context.accessToken}`)
    if (context.signal) query = query.abortSignal(context.signal)
    const { data, error } = await query.maybeSingle<DatabaseInvestmentTotalRow>()
    await checkSession(context)
    if (error) throw error
    return data === null ? null : decode(data, context.userId)
  } catch (error: unknown) {
    if (error instanceof FinancialReadError) throw error
    throw new InvestmentError('Não foi possível carregar seus investimentos. Confira sua conexão e tente novamente.')
  }
}

export async function saveInvestmentTotal(amount: number, options: ReadOptions = {}): Promise<number> {
  try {
    if (!validAmount(amount)) throw new InvestmentError('Informe um total válido em centavos, incluindo zero.')
    const context = await createReadContext(options)
    await checkSession(context)
    let query = supabase.from('investment_totals').upsert({
      user_id: context.userId, amount_cents: amount, updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).select('user_id,amount_cents,updated_at')
      .setHeader('Authorization', `Bearer ${context.accessToken}`)
    if (context.signal) query = query.abortSignal(context.signal)
    const { data, error } = await query.single<DatabaseInvestmentTotalRow>()
    await checkSession(context)
    if (error || !data || decode(data, context.userId) !== amount) throw new InvestmentError()
    return amount
  } catch (error: unknown) {
    if (error instanceof InvestmentError) throw error
    if (error instanceof FinancialReadError && error.kind === 'auth') {
      throw new InvestmentError('Sua sessão mudou ou não é válida. Entre novamente e confira seus investimentos.')
    }
    throw new InvestmentError()
  }
}
