import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

type Props = {
  title: string
  description: string
  children: ReactNode
  onClose: () => void
}

export default function Modal({ title, description, children, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog?.showModal()
    return () => {
      dialog?.close()
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [])

  return (
    <dialog ref={dialogRef} aria-labelledby={`${id}-title`} aria-describedby={`${id}-hint`} onCancel={(event) => { event.preventDefault(); onClose() }} className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/60 sm:p-7">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h2 id={`${id}-title`} className="pt-2 text-xl font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Fechar formulário" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-xl text-slate-500 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-600">×</button>
      </div>
      <p id={`${id}-hint`} className="mb-6 text-sm leading-relaxed text-slate-500">{description}</p>
      {children}
    </dialog>
  )
}
