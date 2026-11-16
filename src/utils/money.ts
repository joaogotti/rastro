export const MAX_MONEY_CENTS = 9999999999

// Valores monetários são representados em centavos, sem arredondar entradas inválidas.
export function parseMoney(value: string): number | null {
  const text = value.trim()
  const normalized = /^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(text)
    ? text.replaceAll('.', '').replace(',', '.')
    : text.replace(',', '.')

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= MAX_MONEY_CENTS ? cents : null
}

export function databaseAmountToCents(value: number | string): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error('Valor monetário inválido recebido do banco.')
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error('Valor monetário inválido recebido do banco.')
  }

  // A API usa ponto decimal. Não interpretar separadores de milhar ou vírgulas.
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value).trim())
  if (!match) throw new Error('Valor monetário inválido recebido do banco.')
  const fraction = (match[2] ?? '').replace(/0+$/, '')
  if (fraction.length > 2) {
    throw new Error('O valor do banco contém uma fração de centavo não suportada.')
  }

  const cents = parseMoney(`${match[1]}.${fraction.padEnd(2, '0')}`)
  if (cents === null || cents <= 0) {
    throw new Error('O valor da transação deve ser positivo e respeitar o limite monetário do frontend.')
  }
  return cents
}

export function centsToDatabaseAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_MONEY_CENTS) {
    throw new Error('O valor da transação deve ser um inteiro positivo em centavos dentro do limite do frontend.')
  }
  const digits = String(cents).padStart(3, '0')
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`
}
