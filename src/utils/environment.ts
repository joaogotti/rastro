type PublicEnvironment = {
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

// Compartilhado pelo build e navegador; nunca incluir valores nas mensagens.
export function validatePublicEnvironment(env: PublicEnvironment) {
  const url = env.VITE_SUPABASE_URL?.trim()
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url) throw new Error('Configuração: defina VITE_SUPABASE_URL.')
  if (!key) throw new Error('Configuração: defina VITE_SUPABASE_PUBLISHABLE_KEY.')
  let endpoint: URL
  try { endpoint = new URL(url) } catch { throw new Error('Configuração: VITE_SUPABASE_URL inválida.') }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
  if ((endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:')) ||
    endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw new Error('Configuração: use a URL base HTTPS do Supabase (HTTP somente em localhost).')
  }
  let anonymousJwt = false
  if (key.startsWith('eyJ')) {
    try {
      const payload = key.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')
      anonymousJwt = key.split('.').length === 3 && JSON.parse(atob(payload)).role === 'anon'
    } catch { /* Formato inválido: rejeitar abaixo. A assinatura cabe ao Supabase. */ }
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && !anonymousJwt) {
    throw new Error('Configuração: use somente chave pública publishable ou anon. Chaves secretas são proibidas no frontend.')
  }
  return { url: endpoint.origin, key }
}
