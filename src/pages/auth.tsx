import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import AuthField from '../components/auth-field.tsx'
import { signIn, signUp } from '../services/auth.ts'
import { authErrorMessage, validateAuthFields } from '../utils/auth-validation.ts'
import type { AuthErrors, AuthMode } from '../utils/auth-validation.ts'

export default function Auth({ initialMessage }: { initialMessage?: string }) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [errors, setErrors] = useState<AuthErrors>({})
  const [message, setMessage] = useState(initialMessage ?? '')
  const [confirmationSent, setConfirmationSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const signup = mode === 'signup'

  function changeMode() {
    formRef.current?.reset()
    setMode(signup ? 'login' : 'signup')
    setErrors({})
    setMessage('')
    setConfirmationSent(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return

    const form = event.currentTarget
    const data = new FormData(form)
    const fields = {
      fullName: String(data.get('fullName') ?? ''),
      email: String(data.get('email') ?? ''),
      password: String(data.get('password') ?? ''),
      confirmPassword: String(data.get('confirmPassword') ?? ''),
    }
    const nextErrors = validateAuthFields(mode, fields)
    setErrors(nextErrors)
    setMessage('')
    setConfirmationSent(false)

    if (Object.keys(nextErrors).length) {
      const first = Object.keys(nextErrors)[0]
      form.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus()
      return
    }

    submitting.current = true
    setBusy(true)
    try {
      if (signup) {
        await signUp(fields.fullName, fields.email, fields.password)
        form.reset()
        setConfirmationSent(true)
        setMessage('Verifique sua caixa de entrada e a pasta de spam. Se o cadastro puder ser concluído com este e-mail, você receberá um link de confirmação. Confirme o endereço antes de entrar no Rastro.')
      } else {
        await signIn(fields.email, fields.password)
      }
    } catch (error: unknown) {
      setMessage(authErrorMessage(error))
    } finally {
      // As senhas ficam somente nos campos durante o envio; não são persistidas pela aplicação.
      for (const name of ['password', 'confirmPassword']) {
        const input = form.elements.namedItem(name)
        if (input instanceof HTMLInputElement) input.value = ''
      }
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <main className="min-h-svh bg-slate-950 text-slate-100 lg:grid lg:grid-cols-2">
      <section className="flex flex-col justify-between border-b border-slate-800 px-6 py-8 sm:px-12 lg:min-h-svh lg:border-r lg:border-b-0 lg:p-16">
        <a href={import.meta.env.BASE_URL} className="w-fit text-2xl font-bold tracking-tight text-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400">
          rastro<span className="text-slate-100">.</span>
        </a>
        <div className="my-10 max-w-md lg:my-20">
          <p className="mb-4 text-xs font-semibold tracking-widest text-emerald-400 uppercase">Seu dinheiro, com clareza</p>
          <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            O primeiro passo para cuidar do que é seu.
          </h1>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-slate-400">
            Um lugar para acompanhar sua vida financeira. Simples desde o começo.
          </p>
        </div>
        <p className="hidden text-sm text-slate-500 lg:block">Finanças pessoais. No seu ritmo.</p>
      </section>

      <section aria-labelledby="auth-title" className="flex items-center justify-center px-6 py-10 sm:px-12 lg:py-16">
        <div className="w-full max-w-sm">
          <p className="mb-2 text-sm text-emerald-400">{signup ? 'Comece por aqui' : 'Bom ter você por aqui'}</p>
          <h2 id="auth-title" className="text-2xl font-semibold tracking-tight">{signup ? 'Crie sua conta' : 'Entre no Rastro'}</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            {signup ? 'Cadastre seus dados e confirme seu e-mail para continuar.' : 'Use seu e-mail e senha para acessar sua conta.'}
          </p>

          {message && (
            <div role={confirmationSent ? 'status' : 'alert'} className={`mt-6 rounded-lg border p-4 text-sm leading-relaxed ${confirmationSent ? 'border-emerald-700 bg-emerald-950 text-emerald-100' : 'border-red-900 bg-red-950 text-red-200'}`}>
              {message}
            </div>
          )}

          {!confirmationSent && (
            <form ref={formRef} onSubmit={handleSubmit} noValidate className="mt-7 space-y-5" aria-busy={busy}>
              <fieldset disabled={busy} className="space-y-5">
                <legend className="sr-only">{signup ? 'Dados de cadastro' : 'Dados de acesso'}</legend>
                {signup && <AuthField id="fullName" name="fullName" label="Nome completo" autoComplete="name" placeholder="Seu nome e sobrenome" required maxLength={200} error={errors.fullName} />}
                <AuthField id="email" name="email" label="E-mail" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="voce@exemplo.com" required maxLength={254} error={errors.email} />
                <AuthField id="password" name="password" label="Senha" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 8 : undefined} error={errors.password} hint={signup ? 'Pelo menos 8 caracteres.' : undefined} />
                {signup && <AuthField id="confirmPassword" name="confirmPassword" label="Confirme sua senha" type="password" autoComplete="new-password" required minLength={8} error={errors.confirmPassword} />}
                <button type="submit" className="min-h-12 w-full rounded-lg bg-emerald-400 px-4 font-semibold text-slate-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400 disabled:cursor-wait disabled:opacity-60">
                  {busy ? 'Aguarde…' : signup ? 'Criar conta' : 'Entrar'}
                </button>
              </fieldset>
            </form>
          )}

          <p className="mt-7 text-center text-sm text-slate-400">
            {signup ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'}{' '}
            <button type="button" onClick={changeMode} disabled={busy} className="inline-flex min-h-11 items-center px-1 font-medium text-emerald-400 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-60">
              {signup ? 'Entrar' : 'Criar conta'}
            </button>
          </p>
        </div>
      </section>
    </main>
  )
}
