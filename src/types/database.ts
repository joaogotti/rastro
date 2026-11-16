import type { TransactionType } from './transaction.ts'

export type DatabaseInvestmentTotalRow = {
  user_id: string
  amount_cents: number | string
  updated_at: string
}

// Contratos manuais da API para os campos informados de public.transactions.
// Não substituem tipos gerados do esquema completo. Timestamps aceitam null
// conservadoramente até a confirmação de sua nulabilidade na próxima etapa.
export type DatabaseTransactionRow = {
  id: string
  user_id: string
  category_id: string | null
  type: TransactionType
  amount: number | string
  description: string
  transaction_date: string
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

export type DatabaseTransactionUpdate = Pick<DatabaseTransactionRow,
  'category_id' | 'type' | 'description' | 'transaction_date'
> & {
  amount: string
  notes?: string | null
}

export type DatabaseTransactionInsert = DatabaseTransactionUpdate & {
  user_id: string
}

// O escopo global/particular é decidido pelo RLS.
export type DatabaseCategoryRow = {
  id: string
  user_id: string | null
  name: string
  type: TransactionType
}
