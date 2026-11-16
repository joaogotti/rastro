# Rastro

Controle financeiro pessoal em React, TypeScript estrito, Vite, Tailwind CSS e Supabase.

A preparação local para a versão 1.0 foi revisada em **16/11/2026**. A publicação
continua condicionada às verificações de segurança e ambiente registradas no
[relatório de auditoria](docs/auditoria-v1.md). Nenhum deploy foi realizado.

## Funcionalidades atuais

- Cadastro com confirmação por e-mail, login, sessão validada no servidor e logout local.
- Transações: criar, consultar, editar e excluir com confirmação; pesquisa literal,
  filtros, paginação e totais de todo o período.
- Categorias globais protegidas e gerenciamento de categorias particulares.
- Dashboard mensal com receitas, despesas, resultado, gráficos e estados de carregamento,
  erro e vazio. O resultado do mês não representa saldo bancário.
- Total de investimentos informado pelo usuário e persistido em `investment_totals`,
  separado das receitas/despesas e do futuro módulo de carteira.
- Navegação mobile, formulários acessíveis e recuperação de falhas inesperadas.

## Executar localmente

Use **Node.js 24.x** e as versões do `package-lock.json`.

```sh
npm ci
```

Copie `.env.example` para `.env.local` e preencha somente:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA-CHAVE-PUBLICA
```

A URL deve ser a base HTTPS do projeto. HTTP só é aceito em localhost para
Supabase local. A chave deve ser `sb_publishable_...` ou JWT legado com papel
`anon`. As variáveis `VITE_` ficam públicas no JavaScript; nunca use chave secreta,
`service_role`, senha de banco ou token de usuário. O build rejeita configuração
ausente, chave incompatível e URL insegura, sem imprimir valores.

```sh
npm run dev
```

Reinicie o Vite depois de alterar o ambiente. Não versione `.env.local`.

## Verificação antes de publicar

```sh
npm test
npm run lint
npm run build
npm run check:release
npm audit
```

`npm test` usa Node e SDK oficial com respostas simuladas; o teste de interface
usa Chrome/Edge headless com perfil temporário. Pode ser necessário permitir o
navegador fora da sandbox. `RASTRO_TEST_BROWSER` define um executável Chromium;
sem navegador, essa cobertura será ignorada e precisará ser executada antes da
liberação. Os testes reais exigem opt-in e não fazem parte da comprovação local.

`check:release` requer um build já gerado. Examina os arquivos locais e `dist/`
procurando padrões conhecidos de segredos e fixtures. Não imprime conteúdo
sensível, não consulta o banco e não substitui auditoria do histórico Git ou RLS.

```sh
npm run preview
```

O preview do Vite não aplica os cabeçalhos do `vercel.json`: a CSP e os demais
cabeçalhos também precisam ser conferidos no ambiente hospedado.

## Segurança e limites

A proteção é feita pelo estado de autenticação, inclusive ao abrir os hashes
`#visao-geral`, `#transacoes` e `#categorias` diretamente. Cada serviço valida a
sessão, usa a identidade autenticada e confere respostas. A chave pública e a
proteção visual não substituem as políticas RLS. A auditoria real deve cobrir
`profiles`, `transactions`, `categories`, `investment_totals` e quaisquer outros
objetos expostos pela Data API, incluindo o legado `investments`.

O SDK gerencia armazenamento e renovação de sessão; logout encerra a sessão
neste navegador. Gravações com resposta incerta exigem conferir os dados antes
de repetir. Não há retry automático de escrita nem garantia de snapshot entre
várias consultas simultâneas. O dashboard ainda lê o histórico completo e requer
avaliação de desempenho com volume representativo.

Recuperação de senha, reenvio de confirmação e gestão de conta ainda dependem
de definição de escopo e configuração de Auth. Não existem ações fictícias para
esses fluxos. A campanha de investimentos `security/stage9`, seus bloqueios e
`migration-v2` continuam preservados e não são executados pelo build ou deploy.

## Publicar na Vercel

1. Conclua os bloqueios do [relatório](docs/auditoria-v1.md). Revise os arquivos a
   versionar: o diretório já tinha muitas alterações e arquivos não rastreados.
   Este trabalho não fez commit ou push. O repositório remoto precisa conter o
   código revisado antes de ser importado na Vercel.
2. Importe o repositório na Vercel, selecione a raiz deste projeto, framework
   **Vite** e **Node.js 24.x**. `vercel.json` define instalação `npm ci`, build
   `npm run build` e saída `dist`.
3. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nas variáveis
   do projeto. Separe Preview e Production; prefira Supabase de homologação
   no Preview. Alterações exigem novo build.
4. No Supabase Auth, revise **Site URL**, autorize a URL HTTPS exata de retorno
   em **Redirect URLs** e confirme **Confirm email**, SMTP e limites de envio.
   Não altere tabelas ou políticas por este procedimento.
5. Os cabeçalhos incluem CSP, proteção contra iframe, política de referência,
   MIME sniffing e restrição de câmera/microfone/localização. A CSP permite
   Supabase hospedado em `*.supabase.co`. Se usar domínio próprio do Supabase,
   acrescente apenas sua origem HTTPS/WSS em `connect-src` e valide novamente.
   A navegação é por hash; não requer rewrites de rotas.
6. Faça o deploy manualmente após aprovação das verificações. Teste login,
   confirmação de e-mail, atualização da página, logout, CRUD, investimentos e
   isolamento entre contas de teste. Confira os cabeçalhos e ausência de violações
   CSP nas telas públicas e privadas, em desktop e celular real.

A configuração segue as referências oficiais da
[Vercel](https://vercel.com/docs/project-configuration/vercel-json), de
[Node.js na Vercel](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions),
de [chaves públicas do Supabase](https://supabase.com/docs/guides/getting-started/api-keys)
e de [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).

## Documentação preservada

- [Auditoria e checklist de liberação](docs/auditoria-v1.md)
- [Histórico do frontend](docs/historico-frontend.md): cópia integral do README
  anterior, com descrições de etapas antigas; não descreve o estado atual.
- [Auditoria anterior de RLS](security/rls-validation.md)
- [Gerenciamento de categorias](security/category-management.md)
- [Gerenciamento de transações](security/transaction-management.md)
- [Campanha de investimentos preservada](security/stage9/README.md)
