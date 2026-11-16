import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { validateInvestmentTotal } from '../../utils/investments.ts'
import Modal from '../modal.tsx'

type Props = {
  amount: number
  onSave: (amount: number) => Promise<void>
  onClose: () => void
}

export default function InvestmentForm({ amount, onSave, onClose }: Props) {
  const id = useId()
  const submitted = useRef(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitted.current) return
    const form = event.currentTarget
    const result = validateInvestmentTotal(String(new FormData(form).get('investmentTotal') ?? ''))
    if (result.amount === undefined) {
      setError(result.error)
      form.querySelector<HTMLInputElement>('[name="investmentTotal"]')?.focus()
      return
    }
    submitted.current = true
    setSaving(true)
    setError('')
    try {
      await onSave(result.amount)
    } catch (error: unknown) {
      if (mounted.current) setError(error instanceof Error ? error.message : 'Não foi possível salvar seus investimentos.')
    } finally {
      submitted.current = false
      if (mounted.current) setSaving(false)
    }
  }

  return (
    <Modal title="Editar investimentos" description="Informe seu total investido. O valor será salvo na sua conta." onClose={() => { if (!submitted.current) onClose() }}>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label htmlFor={id} className="mb-2 block text-sm font-medium">Total investido (R$)</label>
          <input id={id} name="investmentTotal" disabled={saving} type="text" inputMode="decimal" required maxLength={20} defaultValue={(amount / 100).toFixed(2).replace('.', ',')} placeholder="0,00" aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} className="min-h-12 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20" />
          <p id={`${id}-hint`} className="mt-2 text-xs text-slate-500">Zero é permitido. Use vírgula ou ponto para separar os centavos.</p>
          {error && <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        </div>
        <p className="text-sm leading-relaxed text-slate-600">Este valor não altera o saldo disponível e não cria uma receita ou despesa.</p>
        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <button type="button" disabled={saving} onClick={onClose} className="min-h-12 rounded-lg border border-slate-300 px-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-emerald-600">Cancelar</button>
          <button type="submit" disabled={saving} className="min-h-12 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">{saving ? 'Salvando…' : 'Salvar investimentos'}</button>
        </div>
      </form>
    </Modal>
  )
}
