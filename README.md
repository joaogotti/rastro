# Rastro

Aplicativo de controle financeiro pessoal, com foco em uma experiência simples,
responsiva e adequada ao iPhone.

## Estado atual

Fundação do frontend configurada com React, TypeScript, Vite, Tailwind CSS 4 e
Oxlint. A tela atual é apenas um teste do Tailwind; suas cores não representam a
identidade visual definitiva.

Autenticação, integração com Supabase, dashboard, transações e investimentos
ainda não foram implementados no frontend. O projeto Supabase existente deverá
ser inspecionado antes de qualquer integração, sem presumir seu esquema ou
recriar tabelas e políticas.

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

Ainda não há uma suíte de testes automatizados configurada.

## Estrutura

```text
src/
  App.tsx       # Componente raiz e tela temporária
  index.css     # Entrada do Tailwind CSS
  main.tsx      # Inicialização do React com StrictMode
index.html      # Documento HTML em português do Brasil
vite.config.ts  # Plugins React e Tailwind
tsconfig*.json  # Configuração TypeScript do frontend e do Vite
.oxlintrc.json  # Regras de lint
```

Pastas para páginas, componentes, serviços e outras responsabilidades serão
criadas conforme as funcionalidades precisarem delas, sem arquivos vazios ou
abstrações antecipadas.

## Configuração e segurança

Esta etapa não exige variáveis de ambiente. Na integração com Supabase, será
criado um `.env.example` apenas com os valores públicos necessários, sem
credenciais reais. Arquivos `.env` e suas variantes já estão no `.gitignore`,
com exceção de `.env.example`.

Variáveis com prefixo `VITE_` são expostas ao navegador. Nunca coloque chaves
privilegiadas, como `service_role`, no frontend. O acesso aos dados deverá
respeitar as políticas RLS existentes.

## Versionamento

Antes de cada marco, execute lint e build e revise os arquivos que entrarão no
commit. `node_modules/`, `dist/` e arquivos de ambiente não devem ser enviados.
Commits e push serão feitos mediante autorização do responsável pelo projeto.
