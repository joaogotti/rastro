export type AuthMode = 'login' | 'signup'

export type AuthFields = {
  fullName: string
  email: string
  password: string
  confirmPassword: string
}

export type AuthErrors = Partial<Record<keyof AuthFields, string>>

export function validateAuthFields(mode: AuthMode, fields: AuthFields): AuthErrors {
  const errors: AuthErrors = {}

  if (mode === 'signup' && fields.fullName.trim().split(/\s+/).length < 2) {
    errors.fullName = 'Informe seu nome e sobrenome.'
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
    errors.email = 'Informe um e-mail válido.'
  }
  if (!fields.password) {
    errors.password = 'Informe sua senha.'
  } else if (mode === 'signup' && fields.password.length < 8) {
    errors.password = 'Use pelo menos 8 caracteres.'
  }
  if (mode === 'signup' && fields.confirmPassword !== fields.password) {
    errors.confirmPassword = 'As senhas precisam ser iguais.'
  }

  return errors
}

export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? error.code
    : error instanceof Error ? error.message : undefined

  switch (code) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos. Confira os dados e tente novamente.'
    case 'email_not_confirmed':
      return 'Confirme seu e-mail pelo link recebido antes de entrar.'
    case 'weak_password':
      return 'A senha não atende aos requisitos de segurança do servidor. Use uma senha mais forte, com pelo menos 8 caracteres.'
    case 'email_address_invalid':
    case 'validation_failed':
      return 'Confira os dados informados e use um e-mail válido.'
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'
    case 'signup_disabled':
      return 'O cadastro está temporariamente indisponível. Tente novamente mais tarde.'
    case 'user_already_exists':
    case 'email_exists':
      return 'Não foi possível concluir o cadastro com estes dados. Se já possui uma conta, tente entrar.'
    case 'email_confirmation_disabled':
      return 'O servidor não exigiu confirmação por e-mail. Ative a confirmação de e-mail no Supabase antes de testar este fluxo.'
    case 'session_missing':
    case 'session_not_found':
    case 'refresh_token_not_found':
      return 'Sua sessão não é válida. Entre novamente.'
    default:
      return 'Não foi possível concluir a autenticação. Confira sua conexão e tente novamente.'
  }
}
