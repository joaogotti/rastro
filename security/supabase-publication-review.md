# Revisão de acesso no Supabase — Rastro

## Antes da execução

- Confirme o projeto e o ambiente no painel do Supabase. Execute [supabase-publication-review.sql](./supabase-publication-review.sql) inteiro no SQL Editor, com uma conta autorizada.
- O arquivo abre uma transação somente leitura, consulta catálogos e a configuração de buckets e encerra com `ROLLBACK`. Os resultados mostram metadados. Restrinja o acesso às evidências e omita identificadores internos ao compartilhá-las.
- Registre data, ambiente e resultado por tabela, função e bucket. Trate tabelas ausentes como itens a reconciliar com a versão implantada.

## O que conferir

- **Dados financeiros:** conferir isolamento por proprietário em `transactions`, `investment_totals` e `investments`. Revisar todas as operações oferecidas; a atualização por upsert em `investment_totals` depende das permissões e políticas de inserção e atualização.
- **Perfis e categorias:** conferir acesso restrito ao próprio perfil e às categorias particulares. Categorias globais podem ser lidas conforme o contrato do app e devem permanecer protegidas contra escrita por usuários comuns.
- **Funções:** conferir os papéis que podem executar funções financeiras e as funções vinculadas a triggers. Compare com o que está realmente implantado; a presença de SQL local da campanha de investimentos não significa que ela esteja ativa.
- **Storage:** o cliente auditado não depende de bucket. Confira se o ambiente contém buckets e se a exposição observada é intencional, especialmente para qualquer arquivo financeiro.

- Compare as políticas de cada operação com os privilégios efetivos. Confira herança, acesso de `PUBLIC`, grants por coluna e a composição de políticas permissivas e restritivas. A presença de RLS, isoladamente, não comprova isolamento.
- Analise no painel o corpo das funções indicadas. Para cada `SECURITY DEFINER`, documente a necessidade, o proprietário, a validação de identidade e autorização, o `search_path` e os papéis com `EXECUTE`. Revise também schemas expostos pela Data API e permissões padrão para objetos novos.
- Em uma etapa posterior autorizada, confira a matriz de acesso de visitante e de duas contas de teste isoladas. Use somente registros fictícios e a chave publicável com sessões normais. Uma execução administrativa no SQL Editor serve para inventariar a configuração, pois o papel administrativo pode ignorar a RLS.

## Critério para concluir

Marque a revisão como concluída quando as tabelas e funções usadas pelo aplicativo tiverem uma regra documentada por papel, o acesso entre contas estiver delimitado e o acesso a Storage corresponder à finalidade de cada bucket. Registre qualquer divergência para correção em etapa separada.

## Revisão manual do ambiente ativo

As correções abaixo foram aplicadas e verificadas pelo responsável no Supabase ativo. A [migration de segurança](./migrations/20261126_supabase_publication_hardening.sql) registra essas mudanças para versionamento. Ela está fora do deploy da aplicação e não deve ser reaplicada em produção.

- RLS habilitada em `categories`, `investment_totals`, `investments`, `profiles` e `transactions`.
- Revogados `TRUNCATE`, `REFERENCES` e `TRIGGER` de `anon` e `authenticated` nas cinco tabelas. Revogados também `SELECT`, `INSERT`, `UPDATE` e `DELETE` de `anon`.
- Revogado o `EXECUTE` direto de `anon` e `authenticated` em `handle_new_user`, `rls_auto_enable`, `update_updated_at` e `validate_transaction_category`.
- A migration conserva as políticas existentes, os triggers e os grants dos demais papéis. Ela descreve as quatro funções de trigger em `public` com assinatura sem argumentos. Em outro ambiente, confira as assinaturas e o papel executor antes de qualquer aplicação autorizada. As verificações abortam se algum privilégio alvo continuar efetivo, inclusive via `PUBLIC` ou herança.

### Testes e configurações confirmados

| Item | Resultado informado |
| --- | --- |
| Testes manuais com duas contas | Isolamento dos dados financeiros confirmado e fluxos exercitados funcionando. |
| Cadastro de uma nova conta | **Pendente de reteste** após a revogação de `EXECUTE` nas funções. Validar também a criação do perfil e a confirmação do e-mail. |
| Confirmação de e-mail e login anônimo | Confirmação habilitada e login anônimo desabilitado. |
| Limites de autenticação | Rate limits configurados. |
| Sessão | Access token com validade de 3.600 segundos e proteção contra reutilização indevida de refresh tokens habilitada. |
| Storage | Nenhum bucket no ambiente ativo. |

### Pendências

- Manter fora do commit o resultado bruto do preflight, a configuração local de laboratório e suas saídas de execução e recuperação. Revisar separadamente os scripts e propostas da etapa de investimentos.
- Confirmar a exposição do e-mail de autoria antes de publicar o histórico do Git.
- Retestar o cadastro completo com conta de teste antes da publicação.
- Integrar CAPTCHA futuramente e configurar as URLs autorizadas de autenticação quando houver deploy.
- A proteção contra senhas vazadas está indisponível no plano gratuito utilizado.
- A definição do Atalho do iPhone e o código de um eventual endpoint correspondente não estavam disponíveis no repositório. Esta revisão não valida a integração.
