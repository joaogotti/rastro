import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { validatePublicEnvironment } from '../src/utils/environment.ts'
import { loadEnv } from 'vite'

// Heurística local: nunca imprime conteúdo, tokens ou valores das variáveis.
const root = process.cwd()
const issues = []
let files = 0
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.vercel'].includes(entry.name)) continue
    const filename = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) { await scan(filename); continue }
    if (!/\.(?:[cm]?[jt]sx?|json|md|txt|sql|py|csv|ya?ml|html)$/.test(entry.name) && !entry.name.startsWith('.env')) continue
    const source = await readFile(filename, 'utf8')
    files++
    const report = (kind) => issues.push({ file: path.relative(root, filename), kind })
    if (/sb_secret_[A-Za-z0-9_-]{12,}/.test(source)) report('possível chave secreta Supabase')
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(source)) report('possível chave privada')
    for (const match of source.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
      try {
        const payload = JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString())
        if (payload.role === 'service_role' || payload.role === 'authenticated') report('possível JWT privilegiado ou sessão pessoal')
      } catch { /* Não é JWT reconhecível. */ }
    }
    if (path.relative(root, filename).startsWith(`dist${path.sep}`) && /demoOpeningBalance|Projeto freelance|Receitas de exemplo do mês|testControls|rastro-browser-test/.test(source)) report('fixture ou dados demonstrativos no build')
  }
}

validatePublicEnvironment(loadEnv('production', root, 'VITE_'))
await scan(root)
await readFile(path.join(root, 'dist/index.html'))
if (issues.length) {
  console.error(JSON.stringify({ files, issues }, null, 2))
  process.exitCode = 1
} else console.log(`Verificação local: ${files} arquivos; nenhum padrão de segredo reconhecido ou fixture no build. Não substitui revisão de histórico, RLS ou teste real.`)
