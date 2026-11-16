import { parseMoney } from './money.ts'

type InvestmentValidation = { amount: number; error?: never } | { amount?: never; error: string }

export function validateInvestmentTotal(value: string): InvestmentValidation {
  const amount = parseMoney(value)
  return amount === null
    ? { error: 'Informe um valor de R$ 0,00 a R$ 99.999.999,99, com no máximo duas casas decimais.' }
    : { amount }
}
