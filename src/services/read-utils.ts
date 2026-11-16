import { supabase } from '../lib/supabase.ts'
import { validateSession } from './auth.ts'

type ReadErrorKind = 'auth' | 'network' | 'permission' | 'query' | 'data' | 'aborted'

const messages: Record<ReadErrorKind, string> = {
  auth: 'Sua sessão não é válida ou mudou durante a leitura. Entre novamente e tente outra vez.',
  network: 'Não foi possível comunicar com o Supabase. Confira sua conexão e tente novamente.',
  permission: 'A sessão atual não tem permissão para consultar estes dados.',
  query: 'Não foi possível consultar os dados no Supabase. Tente novamente.',
  data: 'Os dados recebidos não correspondem ao formato esperado. A leitura não foi concluída.',
  aborted: 'A consulta foi cancelada.',
}

export class FinancialReadError extends Error {
  readonly kind: ReadErrorKind

  constructor(kind: ReadErrorKind) {
    super(messages[kind])
    this.name = 'FinancialReadError'
    this.kind = kind
  }
}

export type ReadOptions = { signal?: AbortSignal; expectedUserId?: string }
type ReadContext = ReadOptions & { userId: string; accessToken: string }

function normalizeError(error: unknown, httpStatus?: number): FinancialReadError {
  if (error instanceof FinancialReadError) return error
  const object = typeof error === 'object' && error !== null ? error : {}
  const status = httpStatus ?? ('status' in object && typeof object.status === 'number' ? object.status : undefined)
  const code = 'code' in object ? object.code : error instanceof Error ? error.message : undefined
  const name = 'name' in object ? object.name : undefined

  if (name === 'AbortError') return new FinancialReadError('aborted')
  if (status === 401 || name === 'AuthSessionMissingError' || ['session_missing', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'bad_jwt', 'email_not_confirmed'].includes(String(code))) {
    return new FinancialReadError('auth')
  }
  if (status === 403 || code === '42501') return new FinancialReadError('permission')
  if (status === 0 || error instanceof TypeError || name === 'AuthRetryableFetchError') return new FinancialReadError('network')
  return new FinancialReadError('query')
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new FinancialReadError('aborted')
}

async function currentSession() {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    if (!data.session) throw new FinancialReadError('auth')
    return data.session
  } catch (error: unknown) {
    throw normalizeError(error)
  }
}

export async function createReadContext(options: ReadOptions): Promise<ReadContext> {
  checkAbort(options.signal)
  const session = await currentSession()
  checkAbort(options.signal)
  try {
    // Reutiliza a verificação no servidor e a exigência de e-mail confirmado.
    const user = await validateSession(session)
    if (options.expectedUserId !== undefined && user.id !== options.expectedUserId) throw new FinancialReadError('auth')
    checkAbort(options.signal)
    return { userId: user.id, accessToken: session.access_token, signal: options.signal }
  } catch (error: unknown) {
    throw normalizeError(error)
  }
}

export async function checkReadSession(context: ReadContext) {
  checkAbort(context.signal)
  const session = await currentSession()
  if (session.user.id !== context.userId) throw new FinancialReadError('auth')
  checkAbort(context.signal)
}

export const READ_PAGE_SIZE = 500

type Page<T> = { data: T[] | null; error: unknown; status: number }

export async function readAllPages<T extends { id: string }>(
  context: ReadContext,
  fetchPage: (afterId: string | null) => PromiseLike<Page<T>>,
): Promise<T[]> {
  const rows: T[] = []
  const seen = new Set<string>()
  let afterId: string | null = null

  while (true) {
    await checkReadSession(context)
    let page: Page<T>
    try {
      page = await fetchPage(afterId)
    } catch (error: unknown) {
      checkAbort(context.signal)
      throw normalizeError(error)
    }
    checkAbort(context.signal)
    if (page.error) throw normalizeError(page.error, page.status)
    // Mesmo uma página vazia pode ter sido recebida após trocar de conta.
    await checkReadSession(context)
    if (!Array.isArray(page.data)) throw new FinancialReadError('data')
    if (page.data.length === 0) return rows

    for (const row of page.data) {
      if (!row || typeof row.id !== 'string' || !row.id.trim() || seen.has(row.id)) {
        throw new FinancialReadError('data')
      }
      seen.add(row.id)
      rows.push(row)
    }
    afterId = page.data[page.data.length - 1].id
    // Continuar até uma página vazia: o limite do servidor pode ser menor que 500.
  }
}
