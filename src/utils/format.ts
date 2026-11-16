const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function formatCurrency(cents: number) {
  return currencyFormatter.format(cents / 100)
}

export function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T12:00:00`))
}

export function formatPeriod(period: string) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${period}-01T12:00:00Z`))
}
