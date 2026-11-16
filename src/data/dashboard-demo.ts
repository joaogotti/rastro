import type { Transaction } from '../types/transaction.ts'

// Valores em centavos. Dados fictícios exclusivos da demonstração local.
export const demoInitialPeriod = '2026-11'
export const demoOpeningBalance = 1500000
export const demoInvestments = 1480000

export const demoTransactions: Transaction[] = [
  { id: 'demo-1', name: 'Projeto freelance', category: 'Trabalho', date: '2026-11-18', type: 'income', amount: 130000 },
  { id: 'demo-2', name: 'Mercado do mês', category: 'Alimentação', date: '2026-11-16', type: 'expense', amount: 85000 },
  { id: 'demo-3', name: 'Cinema e restaurantes', category: 'Lazer', date: '2026-11-14', type: 'expense', amount: 70000 },
  { id: 'demo-4', name: 'Consulta e farmácia', category: 'Saúde', date: '2026-11-12', type: 'expense', amount: 50000 },
  { id: 'demo-5', name: 'Transporte do mês', category: 'Transporte', date: '2026-11-10', type: 'expense', amount: 40000 },
  { id: 'demo-6', name: 'Aluguel', category: 'Moradia', date: '2026-11-05', type: 'expense', amount: 180000 },
  { id: 'demo-7', name: 'Salário', category: 'Trabalho', date: '2026-11-03', type: 'income', amount: 720000 },
]

// O histórico também é representado por transações, para permitir recálculo e edição.
const history = [
  { period: '2026-06', income: 720000, expense: 480000 },
  { period: '2026-07', income: 810000, expense: 530000 },
  { period: '2026-08', income: 760000, expense: 460000 },
  { period: '2026-09', income: 980000, expense: 610000 },
  { period: '2026-10', income: 790000, expense: 510000 },
]

export const demoHistoricalTransactions: Transaction[] = history.flatMap(({ period, income, expense }) => [
  { id: `demo-income-${period}`, name: 'Receitas de exemplo do mês', category: 'Sem categoria', date: `${period}-03`, type: 'income', amount: income },
  { id: `demo-expense-${period}`, name: 'Despesas de exemplo do mês', category: 'Sem categoria', date: `${period}-10`, type: 'expense', amount: expense },
])
