# Auditoria de preparação do Rastro 1.0

Data: 16/11/2026. Situação: **revisão local concluída; liberação para produção pendente**.

## Escopo e evidências

Revisados o fluxo de entrada, autenticação, navegação, páginas, hooks, componentes,
adaptadores, serviços de acesso, validações monetárias/datas, tipos e configuração.
Consultada a documentação de segurança existente para distinguir funcionalidades
atuais das propostas de banco. Todas as alterações preexistentes foram preservadas.

Cadastro/login/logout, CRUD de transações/categorias, dashboard e persistência do
total investido foram informados pelo responsável como testados. Esta execução
verificou regressões com testes automatizados e transporte simulado; não repetiu
operações contra contas reais. Não foram extraídas sessões do navegador nem
solicitadas senhas. Nenhum SQL, migration, mudança RLS, exclusão de dados reais,
commit, push ou deploy foi executado. `security/`, arquivos de auditoria e campanha
`migration-v2` não foram modificados. Os executores/testes de laboratório de banco
não foram iniciados, pois a campanha está fora do escopo e permanece bloqueada.

## Funcionalidades preservadas e acabamentos finalizados

Transações continuam com validação em centavos, datas reais, categoria compatível,
confirmação de exclusão, notas preservadas na edição, filtro por proprietário e
descarte de respostas antigas. Categorias globais não são editáveis; alterações
particulares invalidam os dados financeiros. Investimentos continuam como total
informado, salvo em `investment_totals`, sem criar movimentações financeiras.

Foram finalizados a recuperação visual de falhas inesperadas/importação de módulos,
a validação de configuração no build, a navegação ao retornar ao hash vazio, a
proteção de precisão dos totais mensais e a configuração local para Vercel.
Menus sem implementação foram retirados. Investimentos permanecem acessíveis no
card funcional da visão geral; não foi criada carteira fictícia.

## Achados e correções

| Achado | Risco/efeito | Resultado |
| --- | --- | --- |
| Cliente aceitava qualquer chave não vazia | Configuração equivocada poderia incorporar chave privilegiada ao frontend | Validação compartilhada entre build/navegador, aceitando publishable ou JWT anon e recusando secret/service_role |
| URL ausente/insegura não era validada no build | Publicação quebrada ou conexão sem HTTPS | Build falha antes de empacotar; URL base HTTPS, com exceção HTTP local |
| Falha em importação lazy/renderização sem fallback global | Tela vazia sem orientação | Error boundary com recarga e mensagem sem detalhes internos; aviso sobre gravação incerta |
| Botões de Investimentos/Configurações desativados como “Em breve” | Navegação de protótipo | Removidos os placeholders; preservado o investimento real no dashboard |
| Hash vazio/desconhecido mantinha a seção anterior | URL e seção poderiam divergir | Retorno consistente à visão geral; preservado o salto para conteúdo |
| Evolução podia produzir ano zero próximo de janeiro/0001 | Meses fora da faixa aceita pelos formulários | Uso da navegação de períodos válida e remoção de meses repetidos no limite |
| Somas mensais sem checar inteiro seguro | Perda de precisão em grande volume | Somas verificadas antes de publicar dados no dashboard; falhas seguem o estado de erro |
| Mensagem de falha de investimento sugeria repetir sem conferência | Resposta pode falhar depois do salvamento | Orientação para atualizar e conferir valor persistido antes de tentar novamente |
| Teste Chrome podia aguardar indefinidamente resposta CDP | Suíte excedia timeout e retinha recursos | Timeout por comando/conexão, cancelamento do navegador e tratamento de resposta tardia |
| README descrevia investimento temporário e etapas superadas | Instruções contraditórias | README atual reescrito; cópia integral anterior preservada em `docs/historico-frontend.md` |
| Ausência de configuração Vercel/cabeçalhos | Configuração manual e proteção do navegador incompleta | `vercel.json`, Node 24.x e instruções de ambiente/Auth |

A primeira tentativa de Chrome na sandbox não recebeu resposta de `Runtime.evaluate`.
Fora da sandbox, com perfil temporário e transporte simulado, os cenários passaram.
Um novo teste de navegação inicialmente selecionou o logotipo em vez do link do menu;
o seletor foi corrigido e a suíte completa foi executada novamente.

## Segurança: o que foi conferido no código

- O App aguarda o SDK e `getUser(token)`, exige identidade correspondente e e-mail
  confirmado antes de montar a área privada. Hashes não contornam essa proteção.
- O workspace possui árvore de estado por conta. Hooks cancelam leituras e formulários
  descartam callbacks após desmontagem. Serviços fixam o JWT da operação e verificam
  a sessão e o proprietário antes/depois das respostas.
- Transações e totais de investimento restringem consultas e mutações ao usuário.
  Categorias usam o RLS para incluir globais e particulares e recusam proprietário
  alheio no retorno. Alterações globais são impedidas também no serviço.
- Os erros de API são traduzidos; não são exibidos tokens, payloads ou mensagens
  internas. Não há uso de `dangerouslySetInnerHTML` ou logs financeiros no aplicativo.
- SDK gerencia persistência/renovação; não há senha persistida manualmente. Logout
  mantém o escopo local existente. Uma renovação pode remontar a área privada e
  descartar formulário ainda não salvo; requer ensaio real antes da liberação.
- Nenhuma credencial privilegiada foi detectada pela varredura dos arquivos locais
  examinados. URL/chave pública no bundle são esperadas. `.env.local` continua ignorado.
  A varredura é heurística; não comprova ausência de todos os segredos nem audita o
  histórico Git, logs externos, configurações de CI ou valores cadastrados na Vercel.
- `dashboard-demo.ts`, diagnóstico `welcome.tsx` e `check-supabase.ts` permanecem
  preservados e sem conexão com a navegação atual. Fixtures não foram detectadas
  no build. Nenhum fallback demonstrativo foi introduzido.

## Qualidade e resultados

Ambiente: Node 24.14.1, npm 11.11.0; dependências existentes, sem instalação adicional.

| Comando | Resultado |
| --- | --- |
| `npm test` | 176 testes contabilizados: 174 aprovados, 0 falhas, 2 ignorados (Supabase real por opt-in) |
| Chrome headless incluído na suíte | 32 cenários de interface, mais o teste agrupador; Supabase simulado |
| `npm run lint` | Sem erros/avisos na verificação final |
| `npm run build` | TypeScript estrito e empacotamento aprovados |
| `npm run check:release` | Nenhum padrão reconhecido de segredo/fixture no build; validação de ambiente aprovada |
| `npm audit` | Zero vulnerabilidades conhecidas em produção/desenvolvimento no registro consultado |
| `git diff --check` | Sem erro de whitespace; Git apenas avisa sobre conversão LF/CRLF |

Também foi executado um build negativo com chave secreta fictícia: a configuração
foi recusada antes do empacotamento, sem imprimir seu valor. O ambiente foi restaurado
imediatamente. Manifesto/lock foram comparados e permanecem sincronizados.

Os testes cobrem autenticação com servidor simulado, isolamento modelado, paginação,
mais de 1.000 registros, falhas, troca de conta durante operações, envio repetido,
filtros, categorias, investimentos, dinheiro/datas, totais e fallback de erro.
Foram verificados dashboard/formulário com descrição de 120 caracteres e valor
máximo entre 320, 375, 390, 768, 1024, 1440 e 1920 px, além dos cenários anteriores
de categorias/histórico. São viewports Chromium; não substituem Safari/iPhone real.

## Pendências que impedem a liberação

1. **Crítica — Supabase real:** reunir evidências atuais de RLS, grants, funções,
   views e gatilhos expostos. Os relatos/inspeções anteriores não substituem teste
   independente. Incluir `investment_totals`, além de `profiles`, `transactions`,
   `categories` e legado `investments`. O relatório anterior de quatro tabelas não
   cobre automaticamente a tabela de total investido.
2. **Crítica — isolamento dinâmico real:** em ambiente isolado com contas de teste,
   validar A/B nos dois sentidos e acesso anônimo. Comprovar leitura própria antes
   de testar IDs/filtros alheios; testar INSERT/UPDATE/DELETE diretos, tentativa de
   trocar proprietário e proteção das categorias globais. Usar API cliente com
   JWT próprio, sem service_role/SQL Editor administrativo como prova de RLS.
   Não executar exclusão com dados reais. Falha exige correção externa revisada;
   esta tarefa não autoriza alterar esquema/políticas.
3. **Alta — Auth/ambiente:** revisar Confirm email, Site URL, Redirect URLs,
   SMTP, limites e entrega de e-mail no domínio final. Testar expiração/renovação,
   duas abas, logout durante consulta/envio e links inválidos. A suíte usa mocks.
4. **Alta — homologação da hospedagem:** validar build servido com os cabeçalhos
   Vercel, CSP, cache, retorno do e-mail e fluxos completos em desktop/Safari móvel.
   Preview local Vite não reproduz os cabeçalhos Vercel. Domínio Supabase próprio
   exige ajustar `connect-src` antes do teste. Nenhum deploy foi feito nesta tarefa.
5. **Decisão de produto/operacional:** definir recuperação de senha, reenvio de
   confirmação, suporte para acesso perdido, privacidade e ciclo de vida da conta
   antes de abrir cadastro público. Esses fluxos não foram improvisados. Remoção de
   conta com cascatas continua vinculada à revisão existente, fora deste escopo.

## Limitações conhecidas e próximos ensaios

O dashboard consulta o histórico inteiro; medir tempo/memória com volume realista.
Consultas paginadas/totais não representam snapshot atômico; edições concorrentes
com mesma contagem podem passar pelas verificações. Não há controle de versão nem
idempotência de criação no contrato atual. Não inventar garantias financeiras:
conferir dados após resposta incerta e planejar evolução do servidor se necessário.

O pacote `security/stage9` e `migration-v2` não é pré-requisito automaticamente
aprovado nem parte do deploy. Continua com seus próprios bloqueios e autorizações.
O frontend atual utiliza apenas o total informado já aprovado. Não mudar esse
contrato para implementar carteira sem decisão e revisão do banco.

## Arquivos desta execução

Criados: `src/root.tsx`, `src/components/error-boundary.tsx`,
`src/utils/environment.ts`, `tests/environment.test.ts`,
`scripts/check-release.mjs`, `vercel.json`, `docs/auditoria-v1.md` e
`docs/historico-frontend.md`.

Modificados: `.env.example`, `README.md`, `package.json`, `package-lock.json`
(apenas engines nesta execução, sem trocar dependências), `vite.config.ts`,
`src/main.tsx`, `src/lib/supabase.ts`, `src/layouts/dashboard-layout.tsx`,
`src/pages/workspace.tsx`, `src/services/investments.ts`,
`src/utils/transactions.ts`, `src/adapters/dashboard.ts`,
`tests/dashboard-data.test.ts`, `tests/transaction-browser.test.mjs` e
`tests/fixtures/create-dashboard.tsx`.

O status Git também inclui arquivos anteriores a esta execução. Essa lista descreve
somente o trabalho desta auditoria, não atribui ao agente as mudanças preexistentes.

## Publicação

Seguir o [procedimento de Vercel no README](../README.md#publicar-na-vercel) depois
de resolver as pendências. Não declarar a versão 1.0 pronta com RLS ou verificações
obrigatórias ainda inconclusivas.
