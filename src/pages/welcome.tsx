import { useEffect, useState } from 'react'
import { checkSupabase } from '../services/check-supabase.ts'
import SignOutButton from '../components/sign-out-button.tsx'

function Welcome() {
  const [result, setResult] = useState<Awaited<ReturnType<typeof checkSupabase>> | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    void checkSupabase(controller.signal).then((nextResult) => {
      if (!controller.signal.aborted) {
        setResult(nextResult)
      }
    })

    return () => controller.abort()
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 px-6">
      <h1 className="text-4xl font-bold text-emerald-400">
        Rastro
      </h1>
      <p className="text-slate-200">E-mail confirmado. Você entrou no Rastro.</p>
      <SignOutButton />
      <section aria-labelledby="supabase-check-title" className="w-full max-w-lg text-slate-200">
        <h2 id="supabase-check-title" className="text-lg font-semibold">
          Verificação temporária do Supabase
        </h2>
        <div role="status" aria-live="polite" className="mt-3 space-y-2 text-sm">
          <p className={result?.status === 'error' ? 'text-red-300' : 'text-slate-200'}>
            {result?.message ?? 'Consultando profiles…'}
          </p>
          {result?.httpStatus !== undefined && <p>HTTP: {result.httpStatus}</p>}
        </div>
        <p className="mt-3 text-sm text-slate-400">
          Somente leitura, com a chave pública e as políticas RLS existentes.
          Sem sessão autenticada, a consulta usa o acesso anônimo. Este teste não
          valida o isolamento entre usuários nem exibe dados dos perfis.
        </p>
      </section>
    </main>
  )
}

export default Welcome
