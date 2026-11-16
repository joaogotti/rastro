export function currentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function shiftPeriod(period: string, offset: number) {
  const date = new Date(`${period}-01T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return period
  return date.toISOString().slice(0, 7)
}

export function availablePeriods(transactions: { date: string }[], selected: string) {
  return [...new Set([selected, ...Array.from({ length: 25 }, (_, index) => shiftPeriod(selected, index - 12)), ...transactions.map((transaction) => transaction.date.slice(0, 7))])].sort().reverse()
}
