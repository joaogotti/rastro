import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase.ts'

let registrationInProgress = false

export async function signUp(fullName: string, email: string, password: string) {
  registrationInProgress = true
  try {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).href,
      },
    })

    if (error) throw error

    // Confirmação desativada no servidor não deve virar um cadastro confirmado na UI.
    if (data.session) {
      await signOut()
      throw new Error('email_confirmation_disabled')
    }
  } finally {
    registrationInProgress = false
  }
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })

  if (error) throw error
  if (!data.session) throw new Error('session_missing')
}

export async function validateSession(session: Session) {
  const { data, error } = await supabase.auth.getUser(session.access_token)

  if (error) throw error
  if (!data.user || data.user.id !== session.user.id) throw new Error('session_missing')
  if (!data.user.email_confirmed_at) throw new Error('email_not_confirmed')

  return data.user
}

export async function signOut() {
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw error
}

export function subscribeToAuth(callback: (session: Session | null) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    // Não liberar a área privada durante a possível sessão automática do cadastro.
    if (registrationInProgress && session) return
    callback(session)
  })
  return () => data.subscription.unsubscribe()
}

export function readConfirmationError() {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.slice(1))
  if (!url.searchParams.has('error') && !hash.has('error')) return undefined

  const code = url.searchParams.get('error_code') ?? hash.get('error_code')
  for (const key of ['error', 'error_code', 'error_description']) {
    url.searchParams.delete(key)
    hash.delete(key)
  }
  url.hash = hash.toString()
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)

  return code === 'otp_expired'
    ? 'Este link de confirmação expirou ou já foi utilizado. Se já confirmou o e-mail, tente entrar.'
    : 'Não foi possível confirmar o e-mail por este link. Se já confirmou, tente entrar; caso contrário, verifique o e-mail de cadastro.'
}
