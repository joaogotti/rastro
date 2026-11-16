import { useEffect, useRef, useState } from 'react'
import Modal from '../modal.tsx'
import { deleteTransaction, TransactionDeleteError } from '../../services/transactions.ts'
import type { TransactionView } from '../../types/transaction.ts'
import { formatCurrency } from '../../utils/format.ts'

export default function DeleteTransaction({ transaction, userId, onClose, onDeleted }: { transaction: TransactionView; userId: string; onClose: () => void; onDeleted: () => void }) {
  const lock = useRef(false)
  const lifecycle = useRef<AbortController | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { const controller = new AbortController(); lifecycle.current = controller; return () => controller.abort() }, [])
  async function confirm() {
    const controller = lifecycle.current
    if (!controller || controller.signal.aborted || lock.current) return
    lock.current = true; setPending(true); setError('')
    try {
      if (transaction.userId !== userId) throw new TransactionDeleteError()
      await deleteTransaction(transaction.id, { expectedUserId: userId, signal: controller.signal })
      if (!controller.signal.aborted) onDeleted()
    } catch (reason: unknown) {
      if (!controller.signal.aborted) setError(reason instanceof TransactionDeleteError ? reason.message : 'Não foi possível excluir. Atualize o histórico e tente novamente.')
    } finally { if (!controller.signal.aborted) { lock.current = false; setPending(false) } }
  }
  return <Modal title="Excluir transação?" description={`Você está prestes a excluir a transação “${transaction.name}”, no valor de ${formatCurrency(transaction.amount)}. Essa ação não poderá ser desfeita.`} onClose={() => { if (!lock.current) onClose() }}>
    {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
    {pending && <p role="status" className="mb-4 text-sm text-slate-500">Excluindo e confirmando a remoção…</p>}
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={pending} onClick={onClose} className="min-h-12 rounded-lg border border-slate-300 px-5 text-sm focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-60">Cancelar</button><button type="button" disabled={pending} onClick={() => void confirm()} className="min-h-12 rounded-lg bg-red-700 px-5 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60">{pending ? 'Excluindo…' : 'Excluir transação'}</button></div>
  </Modal>
}
