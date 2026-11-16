import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Modal from '../components/modal.tsx'
import { CategoryWriteError, deleteCategory, getCategoryTransactionCount, readCategories, saveCategory } from '../services/categories.ts'
import type { Category } from '../types/category.ts'
import { CATEGORY_NAME_LIMIT } from '../utils/categories.ts'

const field = 'min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20'
const secondary = 'min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:opacity-50'
const primary = 'min-h-12 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-60'
type Result = { status: 'success'; rows: Category[] } | { status: 'error'; message: string }

export default function Categories({ userId }: { userId: string }) {
  return <CategoryContent key={userId} userId={userId} />
}

function CategoryContent({ userId }: { userId: string }) {
  const [result, setResult] = useState<(Result & { attempt: number }) | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [editor, setEditor] = useState<Category | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    void readCategories({ expectedUserId: userId, signal: controller.signal }).then(
      (rows) => { if (!controller.signal.aborted) setResult({ status: 'success', rows, attempt }) },
      () => { if (!controller.signal.aborted) setResult({ status: 'error', message: 'Não foi possível carregar suas categorias. Tente novamente.', attempt }) },
    )
    return () => controller.abort()
  }, [userId, attempt])
  const state = result?.attempt === attempt ? result : null
  const rows = state?.status === 'success' ? state.rows : []
  function saved(message: string) {
    setEditor(null); setDeleting(null); setNotice(message); setAttempt((value) => value + 1)
    window.dispatchEvent(new Event('rastro:categories-changed'))
  }
  return <>
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-2 text-xs font-medium text-slate-500">Seu espaço / Categorias</p><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Organize do seu jeito.</h1><p className="mt-2 text-sm text-slate-500">Categorias para entender melhor suas receitas e despesas.</p></div>
      <button type="button" onClick={() => setEditor('new')} className={primary}>Nova categoria</button>
    </header>
    <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-relaxed text-emerald-900">Categorias globais estão disponíveis para todos e são protegidas. As particulares pertencem apenas à sua conta.</div>
    <p role="status" className="mb-4 text-sm text-emerald-800">{notice}</p>
    {!state && <p role="status" className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Carregando categorias…</p>}
    {state?.status === 'error' && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><p>{state.message}</p><button type="button" className={`${secondary} mt-3`} onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button></div>}
    {state?.status === 'success' && <div className="grid items-start gap-5 xl:grid-cols-2">{(['expense', 'income'] as const).map((type) => {
      const group = rows.filter((category) => category.type === type).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      return <section key={type} className="min-w-0 rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 sm:px-6"><h2 className="text-base font-semibold">{type === 'income' ? 'Receitas' : 'Despesas'}</h2><span className="text-xs text-slate-500">{group.length} {group.length === 1 ? 'categoria' : 'categorias'}</span></div>
        {group.length === 0 ? <p className="p-6 text-sm text-slate-500">Nenhuma categoria de {type === 'income' ? 'receita' : 'despesa'} disponível. Crie a primeira para organizar seus lançamentos.</p> : <ul className="divide-y divide-slate-100">{group.map((category) => <li key={category.id} className="flex flex-wrap items-center gap-3 p-5 sm:px-6">
          <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-semibold ${type === 'income' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{type === 'income' ? '↗' : '↘'}</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-medium wrap-anywhere">{category.name}</p><span className={`mt-1 inline-block rounded-md px-2 py-1 text-xs ${category.userId === null ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>{category.userId === null ? 'Global' : 'Particular'}</span></div>
          {category.userId === userId && <div className="flex w-full justify-end gap-2 sm:w-auto"><button type="button" aria-label={`Editar categoria: ${category.name}`} className={secondary} onClick={() => setEditor(category)}>Editar</button><button type="button" aria-label={`Excluir categoria: ${category.name}`} className={`${secondary} text-red-700`} onClick={() => setDeleting(category)}>Excluir</button></div>}
        </li>)}</ul>}
      </section>
    })}</div>}
    <p className="mt-6 text-xs leading-relaxed text-slate-500">Novas categorias ficam disponíveis ao abrir o formulário de transações. Os gráficos refletem as categorias dos lançamentos cadastrados.</p>
    {editor && <CategoryDialog key={editor === 'new' ? 'new' : editor.id} userId={userId} category={editor === 'new' ? null : editor} onClose={() => setEditor(null)} onSaved={() => saved(editor === 'new' ? 'Categoria criada.' : 'Categoria atualizada.')} />}
    {deleting && <CategoryDialog key={deleting.id} userId={userId} category={deleting} deleting onClose={() => setDeleting(null)} onSaved={() => saved('Categoria excluída.')} />}
  </>
}

function CategoryDialog({ userId, category, deleting = false, onClose, onSaved }: { userId: string; category: Category | null; deleting?: boolean; onClose: () => void; onSaved: () => void }) {
  const id = useId()
  const lock = useRef(false)
  const lifecycle = useRef<AbortController | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [countError, setCountError] = useState('')
  const [countAttempt, setCountAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController(); lifecycle.current = controller
    return () => controller.abort()
  }, [])
  const categoryId = category?.id
  useEffect(() => {
    if (!deleting || !categoryId) return
    const controller = new AbortController()
    void getCategoryTransactionCount(categoryId, { expectedUserId: userId, signal: controller.signal }).then(
      (value) => { if (!controller.signal.aborted) setCount(value) },
      () => { if (!controller.signal.aborted) setCountError('Não foi possível verificar as transações vinculadas. Tente novamente antes de excluir.') },
    )
    return () => controller.abort()
  }, [deleting, categoryId, userId, countAttempt])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current || !lifecycle.current || lifecycle.current.signal.aborted) return
    const data = new FormData(event.currentTarget)
    const controller = lifecycle.current
    lock.current = true; setPending(true); setError('')
    try {
      const options = { expectedUserId: userId, signal: controller.signal }
      if (category && category.userId !== userId) throw new CategoryWriteError('Apenas suas categorias particulares podem ser alteradas.')
      if (deleting && category) {
        if (count === null) throw new CategoryWriteError('Aguarde a verificação das transações vinculadas antes de confirmar.')
        await deleteCategory(category.id, options)
      }
      else await saveCategory({ name: String(data.get('name') ?? ''), type: category?.type ?? String(data.get('type') ?? '') as Category['type'] }, category?.id ?? null, options)
      if (!controller.signal.aborted) onSaved()
    } catch (reason: unknown) {
      if (!controller.signal.aborted) setError(reason instanceof CategoryWriteError ? reason.message : 'Não foi possível concluir a operação. Tente novamente.')
    } finally {
      if (!controller.signal.aborted) { lock.current = false; setPending(false) }
    }
  }
  const blocked = deleting && count === null
  return <Modal title={deleting ? 'Excluir categoria' : category ? 'Editar categoria' : 'Nova categoria'} description={deleting ? `Excluir “${category?.name}”? As transações vinculadas permanecerão registradas, mas ficarão sem categoria. Os valores, datas e demais dados dos lançamentos serão preservados.` : 'Escolha um nome claro para identificar seus lançamentos.'} onClose={() => { if (!lock.current) onClose() }}>
    <form onSubmit={submit} aria-busy={pending} noValidate><fieldset disabled={pending} className="space-y-4">
      {!deleting && <><div><label htmlFor={`${id}-name`} className="mb-2 block text-sm font-medium">Nome</label><input id={`${id}-name`} name="name" defaultValue={category?.name ?? ''} maxLength={CATEGORY_NAME_LIMIT} required className={field} placeholder="Ex.: Viagens, projetos pessoais…" /></div><div><label htmlFor={`${id}-type`} className="mb-2 block text-sm font-medium">Tipo</label><select id={`${id}-type`} name="type" defaultValue={category?.type ?? 'expense'} disabled={Boolean(category)} className={field}><option value="expense">Despesa</option><option value="income">Receita</option></select>{category && <p className="mt-2 text-xs text-slate-500">O tipo é preservado para proteger os lançamentos. Para outro tipo, crie uma nova categoria.</p>}</div></>}
      {deleting && count === null && !countError && <p role="status" className="text-sm text-slate-500">Verificando transações vinculadas…</p>}
      {deleting && count !== null && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{count === 0 ? 'Nenhuma transação vinculada neste momento.' : `${count} ${count === 1 ? 'transação ficará' : 'transações ficarão'} sem categoria. Nenhum lançamento será apagado.`} <span className="block mt-1 text-xs">A contagem reflete este momento e pode mudar se novos lançamentos forem cadastrados.</span></p>}
      {deleting && countError && <div role="alert" className="text-sm text-red-700"><p>{countError}</p><button type="button" className={`${secondary} mt-2`} onClick={() => { setCountError(''); setCount(null); setCountAttempt((value) => value + 1) }}>Tentar novamente</button></div>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {pending && <p role="status" className="text-sm text-slate-500">{deleting ? 'Excluindo…' : 'Salvando…'}</p>}
      <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end"><button type="button" className={secondary} onClick={onClose}>Cancelar</button><button type="submit" disabled={blocked} className={deleting ? `${primary} bg-red-700 hover:bg-red-800` : primary}>{pending ? 'Aguarde…' : deleting ? 'Confirmar exclusão' : category ? 'Salvar alterações' : 'Criar categoria'}</button></div>
    </fieldset></form>
  </Modal>
}
