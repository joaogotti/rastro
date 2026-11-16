export const transactionCategories = [
  { name: 'Alimentação', icon: 'cart', color: '#34d399' },
  { name: 'Transporte', icon: 'car', color: '#a7f3d0' },
  { name: 'Moradia', icon: 'home', color: '#0f766e' },
  { name: 'Saúde', icon: 'heart', color: '#94a3b8' },
  { name: 'Lazer', icon: 'ticket', color: '#334155' },
  { name: 'Trabalho', icon: 'briefcase', color: '#2563eb' },
  { name: 'Assinaturas', icon: 'tv', color: '#7c3aed' },
  { name: 'Sem categoria', icon: 'question', color: '#a8a29e' },
] as const

export type TransactionCategory = typeof transactionCategories[number]['name']

export function categoryAppearance(name: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  return transactionCategories.find((category) => normalize(category.name) === normalize(name)) ?? { color: '#64748b', icon: 'question' as const }
}
