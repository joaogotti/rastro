import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Modal from '../modal.tsx'
import { readCategories } from '../../services/categories.ts'
import { createTransaction, updateTransaction, TransactionCreateError, TransactionUpdateError } from '../../services/transactions.ts'
import type { Category } from '../../types/category.ts'
import type { PersistedTransaction, TransactionType } from '../../types/transaction.ts'
import { centsToDatabaseAmount } from '../../utils/money.ts'
import { validateTransactionWrite } from '../../utils/transactions.ts'
import type { TransactionFields } from '../../utils/transactions.ts'

const inputClass = 'min-h-12 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20'

type Props = {
  userId: string
  transaction?: PersistedTransaction
  defaultDate: string
  onSaved: () => void
  onClose: () => void
}

export default function TransactionForm({ userId, transaction, defaultDate, onSaved, onClose }: Props) {
  const submitted = useRef(false)
  const lifecycle = useRef<AbortController | null>(null)
  const [pending, setPending] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense')
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryStatus, setCategoryStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [categoryAttempt, setCategoryAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    return () => controller.abort()
  }, [userId])
  useEffect(() => {
    const controller = new AbortController()
    void readCategories({ expectedUserId: userId, signal: controller.signal }).then(
      (rows) => { if (!controller.signal.aborted) { setCategories(rows); setCategoryStatus('success') } },
      () => { if (!controller.signal.aborted) { setCategories([]); setCategoryStatus('error') } },
    )
    return () => controller.abort()
  }, [userId, categoryAttempt])
  const id = useId()
  const [errors, setErrors] = useState<Partial<Record<keyof TransactionFields, string>>>({})

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitted.current) return
    const form = event.currentTarget
    const data = new FormData(form)
    const fields = Object.fromEntries(['type', 'name', 'amount', 'date', 'category'].map((key) => [key, String(data.get(key) ?? '')])) as TransactionFields
    // Um select desabilitado não aparece em FormData: nunca remover uma categoria
    // existente silenciosamente enquanto sua consulta carrega ou está com erro.
    if (categoryStatus !== 'success') fields.category = categoryId
    const result = validateTransactionWrite(fields, categories)
    setErrors(result.errors)
    if (!result.input) {
      form.querySelector<HTMLElement>(`[name="${Object.keys(result.errors)[0]}"]`)?.focus()
      return
    }
    submitted.current = true
    setPending(true)
    setSaveError('')
    const controller = lifecycle.current
    if (!controller || controller.signal.aborted) return
    try {
      const options = { expectedUserId: userId, signal: controller.signal }
      if (transaction) {
        if (transaction.userId !== userId) throw new TransactionUpdateError('Esta transação não pertence à sessão atual.')
        await updateTransaction(transaction.id, result.input, options)
      } else await createTransaction(result.input, options)
      if (!controller.signal.aborted) onSaved()
    } catch (error: unknown) {
      if (!controller.signal.aborted) setSaveError(error instanceof TransactionCreateError || error instanceof TransactionUpdateError ? error.message : 'Não foi possível salvar. Confira seus lançamentos antes de tentar novamente.')
    } finally {
      if (!controller.signal.aborted) { submitted.current = false; setPending(false) }
    }
  }

  function errorProps(field: keyof TransactionFields) {
    return { 'aria-invalid': Boolean(errors[field]), 'aria-describedby': errors[field] ? `${id}-${field}-error` : undefined }
  }

  function fieldError(field: keyof TransactionFields) {
    return errors[field] ? <p id={`${id}-${field}-error`} className="mt-1 text-sm text-red-700">{errors[field]}</p> : null
  }

  return (
    <Modal title={transaction ? 'Editar transação' : 'Nova transação'} description={transaction ? 'Atualize os dados desta receita ou despesa.' : 'Cadastre uma receita ou despesa na sua conta.'} onClose={() => { if (!submitted.current) onClose() }}>
      <form onSubmit={handleSubmit} noValidate aria-busy={pending}>
        <fieldset disabled={pending} className="space-y-4">
        <div>
          <label htmlFor={`${id}-type`} className="mb-2 block text-sm font-medium">Tipo</label>
          <select id={`${id}-type`} name="type" value={type} onChange={(event) => { setType(event.target.value as TransactionType); setCategoryId('') }} required {...errorProps('type')} className={inputClass}>
            <option value="expense">Despesa</option><option value="income">Receita</option>
          </select>
          {fieldError('type')}
        </div>
        <div>
          <label htmlFor={`${id}-name`} className="mb-2 block text-sm font-medium">Descrição</label>
          <input id={`${id}-name`} name="name" defaultValue={transaction?.name ?? ''} maxLength={120} required placeholder="Ex.: Compras no mercado" {...errorProps('name')} className={inputClass} />
          {fieldError('name')}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={`${id}-amount`} className="mb-2 block text-sm font-medium">Valor (R$)</label>
            <input id={`${id}-amount`} name="amount" type="text" inputMode="decimal" defaultValue={transaction ? centsToDatabaseAmount(transaction.amount).replace('.', ',') : ''} required placeholder="0,00" maxLength={20} {...errorProps('amount')} className={inputClass} />
            {fieldError('amount')}
          </div>
          <div className="min-w-0">
            <label htmlFor={`${id}-date`} className="mb-2 block text-sm font-medium">Data</label>
            <input id={`${id}-date`} name="date" type="date" defaultValue={transaction?.date ?? defaultDate} min="0001-01-01" max="9999-12-31" required {...errorProps('date')} className={inputClass} />
            {fieldError('date')}
          </div>
        </div>
        <div>
          <label htmlFor={`${id}-category`} className="mb-2 block text-sm font-medium">Categoria <span className="font-normal text-slate-500">(opcional)</span></label>
          <select id={`${id}-category`} name="category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={categoryStatus !== 'success'} {...errorProps('category')} className={inputClass}>
            <option value="">Sem categoria</option>
            {categoryId && !categories.some((item) => item.id === categoryId && item.type === type) && <option value={categoryId} disabled>{categoryStatus === 'success' ? 'Categoria indisponível' : 'Categoria atual — aguardando validação'}</option>}
            {categories.filter((item) => item.type === type).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {fieldError('category')}
          {categoryStatus === 'loading' && <p role="status" className="mt-2 text-sm text-slate-500">Carregando categorias… Você pode cadastrar sem categoria.</p>}
          {categoryStatus === 'error' && <p role="alert" className="mt-2 text-sm text-red-700">Não foi possível carregar as categorias. <button type="button" onClick={() => { setCategoryStatus('loading'); setCategoryAttempt((value) => value + 1) }} className="min-h-11 underline">Tentar novamente</button></p>}
          {categoryId && categoryStatus === 'error' && <button type="button" onClick={() => setCategoryId('')} className="min-h-11 text-sm underline">Usar sem categoria</button>}
        </div>
        {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
        {pending && <p role="status" className="text-sm text-slate-600">Salvando transação…</p>}
        {Object.keys(errors).length > 0 && <p role="alert" className="text-sm text-red-700">Revise os campos indicados antes de salvar.</p>}
        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="min-h-12 rounded-lg border border-slate-300 px-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-emerald-600">Cancelar</button>
          <button type="submit" className="min-h-12 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">{pending ? 'Salvando…' : transaction ? 'Salvar alterações' : 'Adicionar transação'}</button>
        </div>
        </fieldset>
      </form>
    </Modal>
  )
}
