import { categoryAppearance } from '../../data/transaction-categories.ts'

const paths = {
  cart: 'M3 3h2l3 12h10l3-9H6 M9 20h.01 M18 20h.01',
  car: 'm5 9 2-5h10l2 5 M3 10h18v7H3z M6 17v3 M18 17v3 M6 13h.01 M18 13h.01',
  home: 'm3 11 9-8 9 8 M5 10v11h14V10 M9 21v-7h6v7',
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  ticket: 'M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4Z M15 5v3 M15 11v2 M15 16v3',
  briefcase: 'M8 6V3h8v3 M3 6h18v15H3z M3 11l9 3 9-3 M10 13v3h4v-3',
  tv: 'M3 7h18v14H3z M8 3l4 4 4-4',
  question: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4 M12 17h.01 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  pencil: 'm15 4 5 5 M4 15 16 3a2 2 0 0 1 5 5L9 20l-6 1Z',
}

export default function TransactionIcon({ category, edit = false }: { category?: string; edit?: boolean }) {
  const icon = edit ? 'pencil' : categoryAppearance(category ?? '').icon
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0"><path d={paths[icon]} /></svg>
}
