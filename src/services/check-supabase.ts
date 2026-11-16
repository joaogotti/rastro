import { supabase } from '../lib/supabase.ts'

type SupabaseCheckResult = {
  status: 'success' | 'error'
  message: string
  httpStatus?: number
}

export async function checkSupabase(signal: AbortSignal): Promise<SupabaseCheckResult> {
  try {
    // HEAD verifica os registros visíveis sem transferir dados dos perfis.
    const { count, error, status } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .abortSignal(signal)

    if (error) {
      const permissionDenied = status === 401 || status === 403 || error.code === '42501'

      return {
        status: 'error',
        httpStatus: status || undefined,
        message: permissionDenied
          ? 'A API recusou o acesso. Verifique a chave pública e as permissões aplicáveis à sessão atual, sem desativar o RLS.'
          : status === 0
            ? 'Não foi possível obter uma resposta da API. Verifique a conexão, a URL do projeto ou um possível bloqueio de rede/CORS.'
            : 'A API retornou um erro ao consultar profiles. Verifique a configuração do projeto e a disponibilidade da tabela na Data API.',
      }
    }

    return {
      status: 'success',
      httpStatus: status,
      message: count === 0
        ? 'Consulta concluída com sucesso: zero registros visíveis para a sessão atual. Isso pode ocorrer por causa do RLS ou porque a tabela está vazia.'
        : count === null
          ? 'Consulta concluída com sucesso, mas a API não informou a contagem de registros visíveis.'
          : `Consulta concluída com sucesso: ${count} registro(s) visível(is) para a sessão atual.`,
    }
  } catch {
    return {
      status: 'error',
      message: 'A verificação não pôde ser concluída. Verifique a conexão e a configuração do cliente Supabase.',
    }
  }
}
