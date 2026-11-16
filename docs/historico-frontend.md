# Rastro

Aplicativo de controle financeiro pessoal, com foco em uma experiência simples,
responsiva e adequada ao iPhone.

## Estado atual

Fundação do frontend configurada com React, TypeScript, Vite, Tailwind CSS 4 e
Oxlint. Cadastro e login usam azul-marinho escuro e verde-esmeralda, com layout
responsivo para desktop e dispositivos móveis.

O cliente Supabase está centralizado em `src/lib/supabase.ts`. O frontend possui
cadastro com confirmação por e-mail, login e proteção do dashboard. O dashboard
consulta transações e categorias da sessão autenticada pelos serviços Supabase,
sem valores fictícios, e permite cadastrar e editar receitas e despesas. O card principal representa o
resultado do período, e investimentos começam como não informados, com edição
somente local e claramente identificada. O cadastro real foi confirmado pelo
responsável. A edição com uma sessão real ainda está pendente; os testes
automatizados usam dados simulados.

## Desenvolvimento local

O Vite instalado exige Node.js `^20.19.0 || >=22.12.0`, além do npm.
Esta etapa foi validada com Node.js 24.14.1 e npm 11.11.0.

Em uma nova cópia do projeto, instale as versões do arquivo de lock:

```sh
npm ci
```

Se as dependências já estiverem instaladas, inicie diretamente:

```sh
npm run dev
```

Use o endereço informado pelo Vite no terminal.

## Verificações

```sh
npm run lint
npm run build
```

O lint executa o Oxlint. O build verifica os tipos com TypeScript em modo estrito
e gera a versão de produção em `dist/`.

Para servir o build localmente:

```sh
npm run preview
```

Os testes usam o executor nativo do Node.js 24 e o Vite já
instalado, sem dependências adicionais:

```sh
node --experimental-strip-types --test tests/auth-validation.test.ts tests/auth-service.test.ts tests/transactions.test.ts tests/investments.test.ts tests/transaction-adapters.test.ts tests/financial-read-services.test.ts tests/dashboard-data.test.ts
```

Eles verificam adaptadores, conversões monetárias, cálculos, filtros, edição e
serviços de leitura, além do Auth com respostas simuladas, sem acessar o
Supabase, criar contas ou enviar e-mails. Não substituem o teste do fluxo real
no navegador.

## Estrutura

```text
src/
  app.tsx       # Entrada protegida pelo estado de autenticação
  index.css     # Entrada do Tailwind CSS
  main.tsx      # Inicialização do React com StrictMode
  adapters/
    transaction.ts # Conversões puras entre contratos da API e modelo persistido
    category.ts # Validação e conversão da projeção id/name das categorias
    dashboard.ts # Associação das transações às categorias e verificação do proprietário
  components/
    auth-field.tsx # Campo acessível compartilhado pelos formulários
    modal.tsx # Diálogo acessível compartilhado por transações e investimentos
    sign-out-button.tsx # Logout compartilhado, com tratamento de erro
    dashboard/
      summary-cards.tsx # Indicadores reais, estados indisponíveis e investimento local
      expense-chart.tsx # Rosca de despesas com legenda em texto
      evolution-chart.tsx # Evolução mensal e valores acessíveis
      recent-transactions.tsx # Tabela desktop e lista mobile
      transaction-form.tsx # Formulário anterior preservado, fora do dashboard de leitura
      transaction-icon.tsx # Ícones SVG locais de categorias e edição
      investment-form.tsx # Total investido temporário informado pelo usuário
  data/
    dashboard-demo.ts # Fixtures do protótipo/testes, não importadas pelo dashboard
    transaction-categories.ts # Referências visuais de cores e ícones, não categorias do banco
  hooks/
    use-auth.ts # Estado da sessão, validação e assinatura de eventos Auth
    use-dashboard-data.ts # Carregamento, nova tentativa e descarte de respostas antigas
  lib/
    supabase.ts # Instância compartilhada do cliente Supabase
  layouts/
    dashboard-layout.tsx # Sidebar, menu mobile e estrutura da área privada
  pages/
    auth.tsx    # Cadastro, confirmação pendente e login
    dashboard.tsx # Visão geral após autenticação
    welcome.tsx # Diagnóstico anterior preservado, fora da navegação atual
  services/
    auth.ts     # Operações do Supabase Auth com o cliente compartilhado
    transactions.ts # Leitura paginada das transações da sessão validada
    categories.ts # Leitura das categorias permitidas pelo RLS
    read-utils.ts # Sessão, paginação, cancelamento e erros compartilhados
    check-supabase.ts # Verificação temporária somente de leitura
  utils/
    auth-validation.ts # Validação dos campos e mensagens seguras de erro
    format.ts # Formatação de BRL e datas pt-BR
    transactions.ts # Validação, filtros, edição e cálculos locais
    money.ts # Conversão compartilhada de reais para centavos
    investments.ts # Validação independente do total investido
    periods.ts # Mês atual, navegação e períodos sem lançamentos
  types/
    transaction.ts # Modelo demonstrativo, modelo persistido e entrada de escrita
    database.ts # Contratos manuais de leitura, cadastro e edição de transactions
    category.ts # Modelo mínimo de categoria: id e name
tests/
  auth-validation.test.ts
  auth-service.test.ts
  transactions.test.ts
  investments.test.ts
  transaction-adapters.test.ts
  financial-read-services.test.ts
  dashboard-data.test.ts
index.html      # Documento HTML em português do Brasil
vite.config.ts  # Plugins React e Tailwind
tsconfig*.json  # Configuração TypeScript do frontend e do Vite
.oxlintrc.json  # Regras de lint
```

Os arquivos e pastas usam nomes em minúsculas; os componentes React mantêm
nomes em PascalCase, como `App` e `Welcome`.

`pages/` contém as telas e `services/` concentra a comunicação com serviços.
Componentes, hooks e utilitários foram separados conforme sua utilização real.
`layouts/` contém a estrutura de navegação da área privada. `types/` define os
tipos das transações usados pela página, formulário, lista e cálculos.

## Configuração e segurança

Para configurar o cliente Supabase:

1. Copie `.env.example` para `.env.local`, caso esse arquivo ainda não exista.
2. Preencha `VITE_SUPABASE_URL` com a URL do projeto e
   `VITE_SUPABASE_PUBLISHABLE_KEY` com sua chave pública (publishable key),
   disponíveis no painel do Supabase.
3. Inicie ou reinicie o Vite com `npm run dev` após alterar as variáveis.

O módulo lê as variáveis com `import.meta.env` e, ao ser importado, valida se
estão preenchidas. Valores ausentes ou compostos apenas por espaços geram um
erro indicando o nome da variável, sem exibir seu conteúdo. Importe a instância
`supabase` desse módulo nas futuras integrações, sem criar clientes adicionais.
O módulo do cliente por si só não verifica a conexão nem o acesso ao banco.

Arquivos `.env` e suas variantes estão no `.gitignore`, com exceção de
`.env.example`, que contém somente os nomes das variáveis com valores vazios.

Variáveis com prefixo `VITE_` são expostas ao navegador. Nunca coloque chaves
privilegiadas, como `service_role`, no frontend. O acesso aos dados deverá
respeitar as políticas RLS existentes.

Referência: [inicialização do cliente Supabase](https://supabase.com/docs/reference/javascript/initializing).

## Autenticação — etapa 1

O cadastro valida nome e sobrenome, e-mail, senha de pelo menos oito caracteres
e confirmação correspondente. Envia o nome em `options.data.full_name` e usa
`emailRedirectTo` apontando para a URL base da aplicação no endereço atual.
Não insere nem atualiza registros diretamente em `profiles`.

Sucesso em `signUp()` mostra uma orientação para verificar o e-mail, sem assumir
que o endereço foi confirmado ou que uma nova conta foi criada. O Supabase pode
ocultar a existência de cadastros anteriores. Se o servidor retornar uma sessão
imediatamente no cadastro, ela é encerrada e a tela avisa que a confirmação de
e-mail precisa estar habilitada no projeto.

O login usa `signInWithPassword()`. A proteção aguarda a inicialização do SDK,
incluindo o processamento do link de confirmação, e valida o usuário no servidor
com `getUser()` usando o token da sessão. Só exibe o dashboard quando essa consulta
retorna o mesmo usuário da sessão com `email_confirmed_at` preenchido. Falhas
mantêm a área privada bloqueada. A sessão e sua renovação são gerenciadas pelo
SDK; a aplicação não persiste senhas manualmente. O botão de saída encerra a
sessão local. A proteção visual não substitui o RLS do banco.

### Preparação no painel do Supabase

Sem alterar tabelas ou políticas, confira estas configurações de Auth:

1. O provedor de e-mail e a opção **Confirm email** devem estar habilitados.
2. Em **URL Configuration**, configure a **Site URL** e autorize em **Redirect
   URLs** a URL base usada para abrir o Rastro. No desenvolvimento padrão, use
   `http://localhost:5173/`. Caso a porta seja outra, autorize o endereço real.
3. Para testar no iPhone, use uma URL da aplicação acessível pelo aparelho e
   autorizada nos redirects. `localhost` no iPhone aponta para o próprio iPhone.
4. Mantenha o link de confirmação padrão do Supabase no template de e-mail.
   Templates personalizados precisam respeitar o fluxo de confirmação e a URL
   de retorno. Em produção, use o endereço HTTPS real da aplicação.

Estas configurações não são alteradas pelo frontend. As políticas de senha,
limites de envio, SMTP e proteção contra abuso do servidor também podem afetar
o cadastro. Recuperação de senha e reenvio do e-mail ficam para uma próxima etapa.

### Como testar no navegador

1. Execute `npm run dev` com `.env.local` configurado e abra a URL autorizada.
2. Sem sessão, confirme que aparece o login, e não o dashboard.
3. Clique em **Criar conta**. Teste nome incompleto, e-mail inválido, senha curta
   e senhas diferentes: o formulário deve informar o problema antes do envio.
4. Use um e-mail que você controla e conclua o cadastro. A tela deve pedir a
   confirmação por e-mail, sem liberar a página privada.
5. Antes de confirmar, tente entrar. O servidor deve recusar com a mensagem de
   e-mail não confirmado. Se necessário, confira spam e os logs de Auth no painel.
6. Abra o link recebido com a aplicação em execução. O SDK processará o retorno;
   somente uma sessão validada e um e-mail confirmado liberam o dashboard. Se o
   link não estabelecer uma sessão, entre com o e-mail e a senha cadastrados.
7. Recarregue para verificar a persistência. Use **Sair da conta** e tente uma
   senha incorreta; a página privada deve continuar bloqueada.
8. Teste também um link expirado ou já usado: uma falha retornada à aplicação
   deve mostrar uma mensagem clara, sem exibir tokens nem detalhes internos.

Referências: [cadastro](https://supabase.com/docs/reference/javascript/auth-signup),
[validação do usuário](https://supabase.com/docs/reference/javascript/auth-getuser)
e [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).

## Histórico do protótipo: dashboard e transações locais

Esta seção registra o comportamento das etapas locais anteriores. Ela não
descreve o dashboard atual, que utiliza os serviços de leitura conforme a seção
**Integração financeira — etapa 3**. Os dados fictícios não são carregados na
interface atual, e os formulários de gravação não estão disponíveis nela.

Após o login, a aplicação exibe o dashboard com o nome e e-mail reais do usuário
validado pelo Supabase Auth. Os valores financeiros são fictícios: o aviso de
demonstração permanece no topo. O período inicial é novembro de 2026, podendo
ser alterado no seletor de mês.

`src/data/dashboard-demo.ts` contém os lançamentos de exemplo, incluindo os
meses históricos, com valores em centavos. A página mantém uma única lista em
estado React e fornece os dados aos componentes por propriedades. Receitas,
despesas, categorias e os seis meses da evolução são derivados dessa lista.
O saldo total soma uma base inicial fixa de demonstração de R$ 15.000,00 ao
resultado do mês selecionado; não é um saldo bancário acumulado. Investimentos
possuem um total ilustrativo editável, independente das transações. Não há persistência nem consultas
financeiras ao Supabase.

A sidebar desktop se transforma em menu recolhível nas telas pequenas. Somente
**Visão geral** está disponível; as demais opções estão desabilitadas e marcadas
como **Em breve**. Cadastro, edição e filtros estão disponíveis na própria visão
geral; a página dedicada de transações ainda não foi implementada. Não há exclusão.
A tabela vira uma lista no mobile, preservando nome, categoria, data, tipo e
valor, sem depender de rolagem horizontal.

Os gráficos usam SVG e CSS nativos, sem biblioteca adicional. O card de despesas
oferece **Por categoria**, preservando a rosca e sua legenda, e **Por despesa**,
com barras horizontais das despesas individuais em ordem decrescente de valor.
Cada barra mostra descrição e valor; receitas ficam fora do ranking. São exibidas
as cinco maiores despesas, com **Ver todas** e **Ver menos** quando necessário.
A expansão reinicia ao mudar o mês ou voltar à visualização por despesa.
As duas opções usam o estado compartilhado do mês selecionado e refletem cadastro
e edição imediatamente. A evolução distingue as séries também pelo traçado e
oferece os valores mensais em texto. O logout foi extraído para um componente compartilhado,
reutilizando o mesmo serviço de autenticação existente.

Para revisar, entre com uma conta confirmada, confira o aviso de demonstração,
a identificação da conta e os indicadores. Teste o menu em uma tela pequena,
a lista de transações, o foco por teclado e o logout. A proteção de sessão, o
cadastro, o processamento do link de confirmação e os serviços Auth foram
preservados.

### Cadastro, edição e filtros

- **+ Nova transação** abre o mesmo modal usado pelo lápis de edição. Informe
  tipo, descrição, valor e data. Categoria é opcional e assume **Sem categoria**.
- O valor aceita `1234,56`, `1.234,56` ou `1234.56`, é convertido para centavos
  e deve ser positivo, com até duas casas decimais e no máximo R$ 99.999.999,99.
  Datas impossíveis e descrições vazias são rejeitadas antes de salvar.
- Salvar atualiza lista, indicadores e gráficos imediatamente. Edição mantém o
  mesmo ID e não duplica o lançamento. Ao salvar em outro mês, esse período é
  selecionado automaticamente e o filtro volta para **Todas**.
- **Todas**, **Despesas** e **Receitas** afetam somente a lista. Os indicadores
  e gráficos continuam representando todas as transações do período selecionado.
- Os ícones são SVGs locais associados à categoria. Não há biblioteca adicional.
- O modal nativo mantém o foco dentro do formulário. **Cancelar**, o botão de
  fechar e **Esc** descartam as alterações e devolvem o foco ao botão de origem.
- Alterações são temporárias: recarregar ou sair da área autenticada restaura
  a demonstração inicial. Nenhum dado financeiro é enviado ao Supabase ou salvo
  em armazenamento local do navegador.

Para testar, adicione uma despesa de R$ 10,00 sem categoria em novembro, confira
o aumento de despesas e a nova fatia **Sem categoria**, e filtre por despesas.
Edite o lançamento para receita: despesas devem diminuir e receitas aumentar.
Mude a data para dezembro e confira o novo período e a evolução. Teste valores
inválidos, cancelamento, teclado e o modal em uma tela pequena. Recarregue para
confirmar o retorno aos dados iniciais.

### Total investido editável — etapa 3

O lápis no card **Investimentos** abre um modal para atualizar o total em reais.
O valor inicial de demonstração é R$ 14.800,00. Zero é permitido; valores negativos,
vazios, não numéricos, com mais de duas casas decimais ou acima de R$ 99.999.999,99
são rejeitados. Os formatos monetários aceitos são os mesmos das transações.

O total é mantido em centavos em um estado próprio de `dashboard.tsx`, separado
da lista de transações e do período selecionado. Salvar atualiza somente o card
de investimentos: não gera receita ou despesa e não altera o saldo disponível,
os filtros ou os gráficos financeiros. Cancelar ou pressionar Esc mantém o valor
anterior; recarregar restaura a demonstração inicial.

A validação fica em `utils/investments.ts`, a conversão monetária compartilhada
em `utils/money.ts`, e o formulário recebe o valor e um callback de salvamento.
Essa separação permite integrar persistência futuramente sem misturar o formulário
com acesso ao banco. Nenhum serviço, tabela, política ou consulta Supabase foi
adicionado nesta etapa. Os dois formulários reutilizam `components/modal.tsx`
para manter o mesmo comportamento de foco, teclado e rolagem.

Os rótulos **Por categoria**, **Por despesa**, **Data** e **Valor** foram conferidos
no código. Mensagens de contagem usam singular e plural naturais, e a saudação
sem nome foi ajustada para **Olá!**.

A logo oficial está em `public/images/rastro-logo.png`. O mesmo arquivo é usado
na sidebar e no cabeçalho mobile, com dimensões de 48 × 48 pixels e proporção
preservada, e como favicon do navegador. Os caminhos respeitam a URL base do
Vite. O arquivo original e o visual da autenticação foram preservados.

Para testar, altere o total investido e confira que saldo, receitas, despesas e
transações permanecem iguais. Teste zero, um valor negativo, texto inválido,
cancelamento e recarregamento. Confira também cadastro e edição de transações,
pois os formulários agora compartilham o componente de modal.

## Integração financeira — etapa 1: tipos e adaptadores

Esta etapa prepara a fronteira entre a API e o frontend sem conectar o dashboard
aos dados reais. A demonstração, os componentes visuais e a autenticação continuam
iguais. Nenhuma consulta financeira ou operação de escrita foi adicionada.

Foi considerado o contrato informado para `public.transactions`: `amount` é
`numeric` em reais, `type` aceita `income` e `expense`, e `category_id` permite
`NULL`. Os contratos de `types/database.ts` são manuais, não tipos gerados de um
esquema integralmente inspecionado. Uma consulta somente de metadados retornou
HTTP 401 para a chave pública; nenhuma credencial privilegiada foi usada.
IDs e datas são representados como strings da API; observações e timestamps
aceitam `null` conservadoramente. Tipos SQL restantes, nulabilidade, valores
padrão, relacionamentos e regras do gatilho ainda devem ser confirmados antes
de utilizar esses contratos em consultas ou gravações reais.

O modelo `Transaction` atual continua atendendo à demonstração. O novo modelo
`PersistedTransaction` preserva `userId`, `categoryId`, `notes`, `createdAt` e
`updatedAt`, além de descrição, tipo, data e valor em centavos. Ele não depende
da lista fixa de categorias. A resolução de nomes, ícones, categorias globais
e particulares será feita na integração futura, após confirmar o esquema de
`categories`; nenhum nome é convertido automaticamente em ID.

As funções de `adapters/transaction.ts` são puras:

- `fromDatabaseTransaction`: converte uma linha da API para o modelo persistido,
  mapeando `description` para `name`, `transaction_date` para `date`, e reais
  para centavos. Categoria ausente continua sendo `categoryId: null`.
- `toTransactionInsert`: recebe os campos editáveis e o ID do usuário em um
  argumento separado. Esse ID deverá vir da sessão no futuro serviço; o
  adaptador não autentica o usuário nem substitui o RLS.
- `toTransactionUpdate`: produz somente os campos editáveis. Não envia ID,
  proprietário ou timestamps. Omitir `notes` preserva observações no banco;
  enviar `null` representa uma limpeza explícita.

`databaseAmountToCents` aceita um número da API ou uma string decimal com ponto.
Exemplos: `0.29` vira `29`, `"123.45"` vira `12345` e `"123.4500"` também vira
`12345`. Frações de centavo como `"1.005"` são rejeitadas, sem arredondamento
silencioso. A entrada de banco não aceita vírgulas nem separadores de milhar.

`centsToDatabaseAmount` produz strings decimais com duas casas, como `"123.45"`,
para representar o valor de escrita em reais sem cálculos fracionários. O
contrato de escrita aceita essa representação decimal; sua utilização na API
real ficará para a etapa de serviços. Ambas as conversões exigem valores
positivos e respeitam o limite atual do frontend de R$ 99.999.999,99; esse limite
não é uma afirmação sobre a restrição existente na coluna `numeric`.

A data financeira é preservada como `YYYY-MM-DD`, e os timestamps não são
recalculados no navegador. A validação de datas foi compartilhada com o
formulário existente, sem alterar suas regras. Os testes cobrem precisão,
limites, categoria opcional, observações, campos protegidos e os cálculos em
centavos. Não há serviços de leitura ou gravação financeira nesta etapa.

## Integração financeira — etapa 2: serviços de leitura

Nesta etapa foram implementados serviços sem conexão com a interface. A etapa 3,
descrita abaixo, passou a utilizá-los no dashboard. Não há cadastro, edição ou
exclusão de transações reais.

- `readTransactions()` em `services/transactions.ts` lê as colunas explicitadas
  no contrato da etapa 1 e converte cada linha com `fromDatabaseTransaction`.
  Toda requisição contém o filtro `user_id` da sessão validada. Não há junção
  obrigatória com categorias: `category_id: null` é preservado.
- `readCategories()` em `services/categories.ts` consulta a projeção `id,name`,
  confirmada pelo usuário. Retorna as categorias visíveis pela política RLS,
  incluindo globais e particulares autorizadas, sem presumir como o banco
  representa essas duas possibilidades. O adaptador valida o formato mínimo.
- Ambos aceitam `{ signal?: AbortSignal }`, retornam listas vazias em consultas
  bem-sucedidas sem registros e nunca usam dados demonstrativos como fallback.
  RLS pode filtrar todas as linhas e retornar uma lista vazia sem erro; isso
  não comprova que a tabela inteira está vazia.

Antes de consultar, os serviços obtêm a sessão do cliente existente e reutilizam
`validateSession()` para verificar o usuário no servidor e seu e-mail confirmado.
As requisições usam o JWT dessa sessão, mantendo o RLS aplicado. Antes e depois
de cada página, verificam se ainda há sessão do mesmo usuário. Logout ou troca
de conta rejeitam a leitura; o token não é registrado ou persistido pelos serviços.
Nenhum fluxo ou configuração da autenticação existente foi alterado.

A paginação usa ordenação crescente por ID e cursor `id > último ID recebido`,
com limite solicitado de 500 por requisição. A leitura só termina em uma página
vazia, mesmo que o servidor imponha um limite menor. Isso evita truncar a lista
em 1.000 registros ou ao receber uma página menor que o tamanho solicitado.
IDs repetidos geram erro explícito, impedindo loops de paginação. A ordem de
retorno é por ID; a ordenação visual por data permanece para a próxima etapa.
Múltiplas páginas não constituem um snapshot atômico: alterações concorrentes
podem exigir uma nova leitura para refletir o estado mais recente.

`FinancialReadError`, em `services/read-utils.ts`, oferece a propriedade `kind`:
`auth`, `network`, `permission`, `query`, `data` ou `aborted`. As mensagens não
incluem tokens, dados financeiros nem os detalhes brutos do servidor. Erros de
paginação, formato, conversão ou sessão rejeitam a operação inteira, sem retorno
parcial. Uma falha na renovação/expiração do JWT durante uma leitura também pode
exigir uma nova tentativa com a sessão válida.

Os testes de serviços usam o cliente oficial para montar as consultas e um
transporte HTTP simulado, além de sessão e validação Auth simuladas. Cobrem
filtro por usuário, categorias globais/particulares, conversão em centavos,
categoria nula, mais de 1.000 registros, limite reduzido do servidor, resposta
vazia, erros, cancelamento e troca de conta. Eles não comprovam as políticas
RLS do projeto remoto.

**Validação real:** a leitura destes serviços ainda não foi validada contra o
Supabase com uma sessão autenticada real. A sessão do navegador não foi extraída,
nem foram solicitadas credenciais de usuário ou usadas chaves administrativas.
Essa validação permanece pendente para o ambiente autenticado; nenhum sucesso
simulado deve ser tratado como confirmação da integração com o banco remoto.

Referências: [filtro por cursor](https://supabase.com/docs/reference/javascript/gt),
[limite por consulta](https://supabase.com/docs/reference/javascript/limit)
e [sessão do cliente](https://supabase.com/docs/reference/javascript/auth-getsession).

## Integração financeira — etapa 3: dashboard em leitura

`useDashboardData(userId)` carrega transações e categorias em paralelo pelos
serviços existentes, associa as categorias por ID e só publica um resultado
completo. O hook não usa dados demonstrativos nem caches globais. Cada leitura
recebe `expectedUserId`, conferido pelos serviços contra o usuário validado antes
de consultar, além do filtro explícito de proprietário nas transações e do RLS.

O dashboard monta uma árvore de estado por ID de usuário. Logout/troca de conta
desmonta a árvore anterior e cancela o carregamento. O hook verifica sinal de
cancelamento, revisão da requisição, ID da conta e tentativa atual antes de
exibir dados; respostas antigas não podem preencher uma sessão posterior.
Atualizar ou tentar novamente oculta os valores anteriores durante a leitura.

Os cards mostram **Resultado do período**, **Receitas**, **Despesas** e
**Investimentos**. Não há saldo inicial fictício. O resultado é receitas menos
despesas do mês e não representa saldo bancário. Investimentos começam em
**Não informado**. O formulário existente permite informar um valor temporário,
marcado **Valor local · não sincronizado**, que não cria movimentações nem altera
o resultado financeiro. Recarregar ou trocar de conta descarta esse valor.

Há estados distintos:

- Carregamento: valores financeiros como `—` e mensagens de espera, mantendo
  a estrutura dos cards e gráficos.
- Sucesso sem registros: receitas, despesas e resultado zerados, com orientação
  de ausência de transações. A evolução continua exibindo seis meses.
- Mês vazio: indicadores mensais zerados, lista vazia e histórico real nos
  outros meses do gráfico, quando houver.
- Erro: valores indisponíveis, sem gráficos ou listas antigos, com **Tentar
  novamente**. Falha em categorias também impede publicar um resultado parcial.

O período inicial usa o mês local atual. O seletor oferece meses sem lançamentos,
e os botões de mês anterior/próximo permitem navegar além da janela exibida.
Nenhum período fictício é usado para inicialização. Os filtros de tipo afetam
somente a lista. Categorias particulares não previstas no protótipo entram nos
gráficos; categorias com mesmo nome e IDs diferentes permanecem separadas.
Ícones conhecidos são preservados, com alternativa neutra para categorias novas.
Categoria nula vira **Sem categoria**; referência não resolvida vira **Categoria
indisponível**, preservando seu ID e seu valor no gráfico.

O gráfico de evolução ajusta a escala aos dados, sem o mínimo fixo do protótipo.
Todos os cálculos continuam em centavos. As ações de nova transação, edição e
exclusão não são oferecidas no dashboard desta etapa. Os arquivos antigos de
formulário e os adaptadores de escrita permanecem preservados para etapas futuras,
sem serem usados para gravar dados reais.

Validação automatizada: testes de dados, serviços, autenticação e cálculos, além
de QA no Chrome com o App, autenticação, hook e serviços da aplicação, substituindo
apenas o cliente Supabase por transporte e sessões simulados. Foram conferidos
vazio, erro de cada serviço, nova tentativa, filtros, categorias particulares,
troca de usuário, logout durante consulta, respostas atrasadas, investimento local
e larguras de 320 a 1440 pixels. Não houve teste em iPhone físico.

**A leitura autenticada contra o Supabase real não foi comprovada nesta execução.**
A sessão do navegador do usuário não foi extraída nem credenciais foram solicitadas.
Os cenários de sucesso e isolamento do QA são simulados, não uma comprovação das
políticas RLS remotas. A validação real deve ocorrer no aplicativo com uma sessão
real disponível. Nenhuma tabela, política, gatilho ou fluxo de autenticação foi
alterado nesta integração.

## Verificação temporária anterior da integração

O diagnóstico abaixo foi preservado em `welcome.tsx`, mas não é montado pelo
dashboard nem oferecido na navegação desta etapa. Portanto, abrir o dashboard
não executa essa consulta de perfis.

Ao abrir a página `welcome` após autenticar, a função `checkSupabase` reutiliza o cliente
existente e consulta `profiles` com `select('*', { count: 'exact', head: true })`.
A requisição HEAD retorna a contagem visível, sem transferir dados de perfis ou
depender de nomes de colunas. Não há operações de escrita.

A tela diferencia sucesso com zero registros, sucesso com registros visíveis,
ausência de contagem e falhas de acesso, rede ou outros erros da API. Exibe o
status HTTP disponível, sem imprimir credenciais ou mensagens brutas do servidor.
Falhas de rede e bloqueios de CORS podem ser indistinguíveis no navegador.

Sem sessão autenticada, a chave pública usa o acesso anônimo. O RLS pode filtrar
todos os registros e ainda produzir uma resposta bem-sucedida com contagem zero:
isso não demonstra que a tabela está vazia nem valida o isolamento entre usuários.
Agora que a página é protegida, a verificação usa a sessão do usuário autenticado;
a função de verificação em si não efetua login ou logout. O resultado anterior
obtido sem sessão não deve ser confundido com o resultado após autenticar.
Nenhuma política ou permissão é alterada.

O efeito cancela sua requisição ao desmontar. Em desenvolvimento, o StrictMode
pode iniciar uma requisição extra e cancelar a anterior.

Lint e build verificam o código; o resultado real da API deve ser observado na
página, com as variáveis locais configuradas. Esta verificação temporária pode
ser removida da página sem alterar o cliente compartilhado.

## Etapa 4 — cadastro de transações

O botão **Nova transação** abre o formulário de receita/despesa. Descrição,
valor e data usam as validações existentes. As categorias são consultadas por
`id,name,type` e filtradas por tipo; a identificação usa ID, e **Sem categoria**
envia `category_id: null`. Se a consulta falhar, há nova tentativa e o cadastro
sem categoria continua disponível, sem categorias demonstrativas.

`createTransaction()` reutiliza a validação da sessão e o adaptador de escrita:
o proprietário vem da sessão verificada, centavos são serializados como reais
decimais e a categoria escolhida é novamente conferida antes do POST. O JWT é
fixado à operação, e a sessão é conferida antes e depois da resposta. O banco
continua responsável pelas políticas RLS e pelo gatilho de compatibilidade.

Durante o envio, o formulário bloqueia novos envios e fechamento. Falhas
preservam os campos e liberam nova tentativa. Respostas vazias, inválidas ou de
outra conta não confirmam sucesso. Uma falha de comunicação pode acontecer após
a gravação: a mensagem orienta atualizar os dados antes de repetir para evitar
duplicidade; não há repetição automática do POST.

Após receber o registro confirmado, o formulário fecha e chama a recarga de
`useDashboardData`. Indicadores, gráficos e lista são recalculados a partir de
uma nova leitura, mantendo o mês e os filtros selecionados. Desmontagem e troca
de conta cancelam operações e impedem callbacks antigos de atualizar a nova
sessão. Não foram adicionadas edição, exclusão nem sincronização de investimentos.

Execute `npm test`, `npm run lint` e `npm run build`. Os testes de serviços usam
o SDK oficial com transporte simulado. Os testes de interface usam Chrome/Edge
local em modo headless, perfil temporário isolado e dados simulados; não usam
credenciais pessoais. `RASTRO_TEST_BROWSER` permite indicar outro executável
Chromium; sem navegador instalado, esse teste é marcado como ignorado. Ambientes
com sandbox podem precisar permitir a execução do navegador local.

Validação desta etapa: 83 testes aprovados, incluindo cinco cenários de interface
(mais os testes agrupadores), lint sem avisos e build aprovado. Em 04/11/2026,
consultas reais ao esquema `public`, sem sessão e com `limit=0`, retornaram HTTP
200 para `categories(id,name,type)` e `transactions(id)`. Isso confirma a aceitação
das projeções, mas não valida visibilidade por usuário, RLS ou o gatilho. A leitura
autenticada relatada nas etapas anteriores foi informada pelo responsável; não
foi repetida nesta etapa. O cadastro real com sessão autenticada permanece
pendente de autorização para criar registros de teste. Nenhuma transação real,
migração, alteração de políticas, commit ou push foi realizada.

## Etapa 5 — edição de transações

A ação **Editar** está disponível por transação na tabela desktop e na lista
mobile, com nome acessível que identifica o lançamento. Ela abre o mesmo
formulário com descrição, centavos formatados em reais, data, tipo e categoria
atuais. Cancelar não faz requisição de gravação. Trocar tipo limpa a categoria
anterior; apenas categorias compatíveis são oferecidas. Falhas na consulta de
categorias não removem automaticamente uma categoria existente.

`updateTransaction(id, input, options)` exige sessão validada e ID em formato
UUID, faz PATCH com filtros de `id` e `user_id` autenticado e solicita o registro
atualizado. Reutiliza o adaptador e a verificação de categoria do cadastro. A
lista explícita de campos contém somente descrição, valor, data, tipo e ID da
categoria: `notes`, proprietário, ID e data de criação nunca são enviados na
edição. As observações existentes permanecem no banco.

Resposta ausente, erro ou divergência entre o registro devolvido e a atualização
solicitada impedem confirmação. O formulário mantém os campos em caso de falha,
bloqueia envio repetido e fechamento durante a operação e só fecha após a
confirmação. Depois disso, o dashboard relê os dados pelo hook existente,
recalculando resumo, gráficos e lista, sem mudar mês ou filtros. Datas alteradas
para outro mês e despesas convertidas em receitas passam a aparecer nos
períodos e totais correspondentes. A chave por usuário e o cancelamento dos
efeitos descartam respostas anteriores após desmontagem ou troca de conta.

Validação da Etapa 5: lint sem avisos, build aprovado e 99 testes aprovados.
Os testes de serviço usam SDK oficial e transporte simulado. A interface foi
testada no Chrome headless com perfil temporário. Foram verificados
preenchimento, cancelamento, alterações dos campos, preservação de observações,
filtros de proprietário, categorias, erros, resposta sem registro, envio
duplicado, recálculo e troca de usuário com PATCH pendente. Os testes incluem
viewports de 390 e 1440 pixels, sem teste em iPhone físico. Execute `npm test`,
`npm run lint` e `npm run build` para repetir as verificações.

O cadastro real de R$ 10,00 e sua persistência após recarregar foram confirmados
pelo responsável ao iniciar esta etapa. Nenhuma atualização foi executada no
Supabase real durante a implementação da edição. A edição real e a validação
das políticas RLS/gatilho com sessão autenticada continuam pendentes de
autorização para alterar um registro. Não houve alteração de esquema, políticas,
autenticação ou persistência de investimentos, nem exclusão, commit ou push.
Como em qualquer gravação remota, falha de comunicação pode ocorrer depois da
alteração no servidor; a mensagem orienta atualizar os dados antes de repetir.
Edições simultâneas seguem o comportamento existente do banco, sem controle de
versão adicional nesta etapa.

## Etapa 6 — validação de segurança

A validação de isolamento está documentada em
[`security/rls-validation.md`](security/rls-validation.md), com evidências reais,
simulações automatizadas, instruções para repetir e limitações. Nenhum dado real
foi modificado. A consulta anônima real retornou zero linhas visíveis; os
catálogos de políticas e permissões não estão expostos pela API. Posteriormente,
o responsável confirmou inspeção manual real no SQL Editor: RLS habilitado em
`profiles`, `transactions`, `categories` e `investments`, com as restrições de
proprietário e categorias globais descritas no relatório. Testes dinâmicos reais
entre duas contas permanecem pendentes; as simulações não os substituem.

## Etapa 7 — gerenciamento de categorias

**Categorias** está ativa na sidebar. A página separa receitas e despesas,
identifica globais/particulares e permite criar, renomear e excluir categorias próprias.
As alterações confirmadas recarregam o dashboard, preservando seus filtros e
mês, e aparecem nos formulários de transações.

A inspeção real informada pelo responsável confirmou `ON DELETE SET NULL`:
excluir uma categoria preserva os lançamentos, que ficam sem categoria. O modal
mostra a contagem e exige confirmação. Nomes aceitam de 1 a 50 caracteres.
A troca de tipo continua bloqueada. Detalhes, evidências, testes e limitações estão em
[`security/category-management.md`](security/category-management.md). A consulta
somente de leitura preparada para o SQL Editor está em
[`security/inspect-category-contract.sql`](security/inspect-category-contract.sql).
Não foram realizadas operações reais de escrita para validar esta etapa.

## Etapa 8 — gerenciamento completo de transações

**Transações** está ativa na sidebar, com pesquisa no servidor, filtros combinados,
paginação por cursor de 20 registros, ordenação e resumo de todo o período.
Cadastro/edição reutilizam o formulário existente. Exclusão individual exige
confirmação, retorno do registro e leitura posterior comprovando sua ausência.
As operações confirmadas invalidam o dashboard e recarregam os indicadores.

Os totais leem todos os lotes do período com projeção mínima e verificam a
quantidade contra contagens exatas antes/depois. Falhas ou divergências não
publicam totais parciais. Limites de desempenho e de snapshot concorrente,
arquivos e verificações estão em
[`security/transaction-management.md`](security/transaction-management.md).
Nenhuma escrita real ou alteração de banco/RLS foi executada nesta etapa.

## Versionamento

Antes de cada marco, execute lint e build e revise os arquivos que entrarão no
commit. `node_modules/`, `dist/` e arquivos de ambiente não devem ser enviados.
Commits e push serão feitos mediante autorização do responsável pelo projeto.
