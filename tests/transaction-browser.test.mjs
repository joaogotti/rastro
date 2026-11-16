import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// Navegador local com cliente oficial e transporte simulado. Não usa sessão real.
const browserPath = process.env.RASTRO_TEST_BROWSER ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(existsSync)

test('cadastro, edição e dashboard no navegador (Supabase simulado)', { skip: !browserPath, timeout: 120000 }, async (t) => {
  const profile = await mkdtemp(path.join(tmpdir(), 'rastro-browser-'))
  const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 0, ws: false, hmr: false }, plugins: [tailwindcss(), {
    name: 'browser-fixture', enforce: 'pre',
    resolveId(source) { if (source.endsWith('/lib/supabase.ts')) return path.resolve('tests/fixtures/create-client.ts') },
    configureServer(vite) {
      vite.middlewares.use('/test-create', async (_req, res) => {
        res.setHeader('Content-Type', 'text/html')
        res.end(await vite.transformIndexHtml('/test-create', '<div id="root"></div><script type="module" src="/tests/fixtures/create-dashboard.tsx"></script>'))
      })
    },
  }] })
  let browser
  let socket
  let abortBrowser
  try {
    await server.listen()
    browser = spawn(browserPath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
    abortBrowser = () => { socket?.close(); browser?.kill() }
    t.signal.addEventListener('abort', abortBrowser, { once: true })
    let port
    for (let i = 0; i < 100; i++) {
      try { port = Number((await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break } catch { await delay(100) }
    }
    assert.ok(port, 'Navegador iniciou o protocolo de depuração')
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json()
    socket = new WebSocket(pages.find((page) => page.type === 'page').webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Tempo esgotado ao conectar ao navegador.')), 10000)
      socket.onopen = () => { clearTimeout(timer); resolve() }
      socket.onerror = () => { clearTimeout(timer); reject(new Error('Falha ao conectar ao navegador.')) }
    })
    let serial = 0
    const pending = new Map()
    socket.onmessage = ({ data }) => { const message = JSON.parse(data); if (message.id) { const callback = pending.get(message.id); pending.delete(message.id); callback?.(message) } }
    async function command(method, params = {}) {
      const id = ++serial
      let timer
      const response = new Promise((resolve, reject) => {
        timer = setTimeout(() => { pending.delete(id); reject(new Error(`Navegador não respondeu a ${method}.`)) }, 10000)
        pending.set(id, resolve)
      })
      socket.send(JSON.stringify({ id, method, params }))
      let result
      try { result = await response } finally { clearTimeout(timer) }
      if (result.error) throw new Error(JSON.stringify(result.error))
      return result.result
    }
    async function evaluate(expression) {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
      return result.result.value
    }
    async function until(expression) {
      for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50) }
      throw new Error(`Tempo esgotado: ${expression}\n${await evaluate('document.body.innerText')}`)
    }
    const click = (text) => evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)} && b.getBoundingClientRect().height > 0).click()`)
    async function openForm() { await click('Nova transação'); await until('document.querySelector("dialog select[name=category]")?.disabled === false') }
    async function fill({ type = 'expense', amount = '123,45', category = '', name = 'Compra persistida' } = {}) {
      await evaluate(`(() => {
        const type = document.querySelector('[name=type]'); type.value = ${JSON.stringify(type)}; type.dispatchEvent(new Event('change', {bubbles:true}));
        document.querySelector('[name=name]').value = ${JSON.stringify(name)};
        document.querySelector('[name=amount]').value = ${JSON.stringify(amount)};
      })()`)
      await evaluate(`document.querySelector('[name=category]').value = ${JSON.stringify(category)}`)
    }
    const submit = () => evaluate('document.querySelector("dialog form").dispatchEvent(new Event("submit", {bubbles:true,cancelable:true}))')
    async function edit(name) {
      await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.getAttribute('aria-label') === 'Editar transação' && b.closest('tr, li')?.textContent.includes(${JSON.stringify(name)}) && b.getBoundingClientRect().height > 0).click()`)
      await until('document.querySelector("dialog select[name=category]")?.disabled === false')
    }
    await command('Page.navigate', { url: `http://127.0.0.1:${server.httpServer.address().port}/test-create` })
    await until('document.body.innerText.includes("Você ainda não tem transações")')
    await evaluate('const initialPeriod = document.getElementById("dashboard-period"); initialPeriod.add(new Option("novembro de 2026", "2026-11")); initialPeriod.value="2026-11"; initialPeriod.dispatchEvent(new Event("change",{bubbles:true}))')
    await t.test('investimentos: confirmação, recarga, zero, falha e nova tentativa', async () => {
      const card = `Array.from(document.querySelectorAll('article')).find(a=>a.querySelector('h2')?.textContent==='Investimentos')`
      await until(`document.querySelector('[aria-label="Editar total investido"]')?.disabled===false`)
      assert.ok((await evaluate(`${card}.textContent`)).includes('Não informado'))
      await evaluate(`document.querySelector('[aria-label="Editar total investido"]').click();window.testControls.investmentHold=true`)
      await evaluate(`document.querySelector('[name=investmentTotal]').value='100,00'`)
      await submit(); await submit()
      await until('window.testControls.investmentPosts===1')
      assert.ok((await evaluate(`${card}.textContent`)).includes('Não informado'))
      await until('document.querySelector("dialog").textContent.includes("Salvando")')
      await evaluate('window.testControls.investmentHold=false;window.testControls.investmentRelease()')
      await until('!document.querySelector("dialog")')
      assert.ok((await evaluate(`${card}.textContent`)).includes('100,00'))
      await command('Page.reload', { ignoreCache: true })
      await until(`document.querySelector('[aria-label="Editar total investido"]')?.disabled===false`)
      assert.ok((await evaluate(`${card}.textContent`)).includes('100,00'))
      await evaluate(`window.testControls.investmentFail=true;document.querySelector('[aria-label="Editar total investido"]').click()`)
      await evaluate(`document.querySelector('[name=investmentTotal]').value='0,00'`)
      await submit(); await until('document.querySelector("dialog [role=alert]")!==null')
      assert.ok((await evaluate(`${card}.textContent`)).includes('100,00'))
      assert.equal(await evaluate('document.querySelector("[name=investmentTotal]").value'), '0,00')
      await evaluate('window.testControls.investmentFail=false')
      await submit(); await until('!document.querySelector("dialog")')
      assert.ok((await evaluate(`${card}.textContent`)).includes('R$ 0,00'))
      assert.equal(await evaluate('window.testControls.investmentRows.length'), 1)
    })
    await t.test('investimentos: erro de leitura e resposta atrasada após trocar usuário', async () => {
      const card = `Array.from(document.querySelectorAll('article')).find(a=>a.querySelector('h2')?.textContent==='Investimentos')`
      await evaluate('window.testControls.investmentFail=true;window.renderUser("investment-other")')
      await until('document.body.innerText.includes("Tentar carregar investimentos novamente")')
      assert.ok(!(await evaluate(`${card}.textContent`)).includes('Não informado'))
      await evaluate('window.testControls.investmentFail=false')
      await click('Tentar carregar investimentos novamente')
      await until(`document.querySelector('[aria-label="Editar total investido"]')?.disabled===false`)
      await evaluate(`document.querySelector('[aria-label="Editar total investido"]').click();window.testControls.investmentHold=true`)
      await evaluate(`document.querySelector('[name=investmentTotal]').value='999,00'`)
      const posts = await evaluate('window.testControls.investmentPosts')
      await submit(); await until(`window.testControls.investmentPosts===${posts+1}`)
      await evaluate('window.testControls.investmentHold=false;window.renderUser("user-a")')
      await until(`!document.querySelector('dialog') && document.querySelector('[aria-label="Editar total investido"]')?.disabled===false`)
      await evaluate('window.testControls.investmentRelease()'); await delay(100)
      assert.ok(!(await evaluate(`${card}.textContent`)).includes('999,00'))
      assert.ok(!(await evaluate('document.body.innerText')).includes('Valor de investimentos salvo na sua conta.'))
    })
    await t.test('despesa: envio duplo gera um POST; modal aguarda confirmação e dashboard recalcula', async () => {
      await openForm(); await fill({ category: 'cat-expense' })
      await evaluate('window.testControls.hold = true')
      await submit(); await submit()
      await until('window.testControls.posts === 1')
      assert.equal(await evaluate('document.querySelector("dialog").open'), true)
      assert.equal(await evaluate('document.querySelector("fieldset").disabled'), true)
      await evaluate(`document.querySelector('button[aria-label="Fechar formulário"]').click()`)
      await evaluate('document.querySelector("dialog").dispatchEvent(new Event("cancel", {cancelable:true}))')
      assert.equal(await evaluate('document.querySelector("dialog").open'), true)
      await evaluate('window.testControls.hold = false; window.testControls.release()')
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Compra persistida")')
      const text = await evaluate('document.body.innerText')
      assert.ok(text.includes('123,45'))
      assert.ok(text.includes('Categoria despesa'))
      assert.equal(await evaluate('window.testControls.posts'), 1)
      assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[aria-label="Resumo financeiro"] article > p')).slice(0,3).map(p => p.textContent.replace(/\\s/g,''))`), ['-R$123,45', 'R$0,00', 'R$123,45'])
      assert.ok((await evaluate(`document.querySelector('svg[aria-label^="Gráfico de rosca"]').getAttribute('aria-label')`)).includes('123,45'))
      assert.ok(await evaluate('Array.from(document.querySelectorAll("svg title")).some(t=>t.textContent.includes("despesas") && t.textContent.includes("123,45"))'))
    })
    await t.test('receita: filtra categorias, limpa categoria ao trocar tipo e atualiza receitas', async () => {
      await openForm(); await fill({ type: 'income', amount: '200,00', name: 'Receita persistida' })
      assert.equal(await evaluate('Array.from(document.querySelector("[name=category]").options).map(o=>o.value).join(",")'), ',cat-income')
      await submit()
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Receita persistida")')
      assert.equal(await evaluate('window.testControls.rows.at(-1).category_id'), null)
      assert.ok((await evaluate('document.body.innerText')).includes('76,55'))
    })
    await t.test('edição abre preenchida e cancelar não grava', async () => {
      await edit('Compra persistida')
      assert.equal(await evaluate('document.querySelector("dialog h2").textContent'), 'Editar transação')
      assert.deepEqual(await evaluate('Object.fromEntries(new FormData(document.querySelector("dialog form")))'), { type: 'expense', name: 'Compra persistida', amount: '123,45', date: '2026-11-01', category: 'cat-expense' })
      assert.ok((await evaluate('document.querySelector("dialog").textContent')).includes('Salvar alterações'))
      await fill({ name: 'Não salvar' })
      await click('Cancelar')
      assert.equal(await evaluate('window.testControls.patches'), 0)
      assert.equal(await evaluate('window.testControls.rows[0].description'), 'Compra persistida')
    })
    await t.test('ação de edição e formulário cabem no viewport de iPhone e desktop', async () => {
      for (const width of [390, 1440]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 })
        assert.equal(await evaluate(`Array.from(document.querySelectorAll('button[aria-label="Editar transação"]')).filter(b => b.getBoundingClientRect().height > 0).every(b => b.title === 'Editar transação' && b.textContent.trim() === '' && b.querySelector('svg') && b.getBoundingClientRect().width >= 44 && b.getBoundingClientRect().height >= 44)`), true)
        await edit('Compra persistida')
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true)
        assert.equal(await evaluate('document.querySelector("dialog").getBoundingClientRect().right <= window.innerWidth'), true)
        await click('Cancelar')
      }
    })
    await t.test('falha de categorias na edição não apaga a categoria existente silenciosamente', async () => {
      await evaluate('window.testControls.categoriesFail = true')
      await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.getAttribute('aria-label') === 'Editar transação' && b.closest('tr, li')?.textContent.includes('Compra persistida') && b.getBoundingClientRect().height > 0).click()`)
      await until('document.querySelector("dialog [role=alert]")?.textContent.includes("categorias")')
      const previous = await evaluate('window.testControls.patches')
      await submit()
      assert.equal(await evaluate('window.testControls.patches'), previous)
      assert.equal(await evaluate('window.testControls.rows[0].category_id'), 'cat-expense')
      await evaluate('window.testControls.categoriesFail = false')
      await click('Tentar novamente')
      await until('document.querySelector("dialog [name=category]")?.disabled === false')
      assert.equal(await evaluate('document.querySelector("[name=category]").value'), 'cat-expense')
      await click('Cancelar')
    })
    await t.test('edição confirma um PATCH, preserva notes e recalcula resumo e gráficos', async () => {
      await evaluate('window.testControls.rows[0].notes = "Observação preservada"; window.testControls.hold = true')
      await edit('Compra persistida')
      await fill({ name: 'Despesa editada', amount: '25,90', category: 'cat-expense' })
      await submit(); await submit()
      await until('window.testControls.patches === 1')
      assert.equal(await evaluate('document.querySelector("fieldset").disabled'), true)
      await evaluate('window.testControls.hold = false; window.testControls.release()')
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Despesa editada")')
      assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[aria-label="Resumo financeiro"] article > p')).slice(0,3).map(p => p.textContent.replace(/\\s/g,''))`), ['R$174,10', 'R$200,00', 'R$25,90'])
      assert.equal(await evaluate('window.testControls.rows[0].notes'), 'Observação preservada')
      assert.equal(await evaluate('window.testControls.rows[0].amount'), '25.90')
      assert.ok((await evaluate(`document.querySelector('svg[aria-label^="Gráfico de rosca"]').getAttribute('aria-label')`)).includes('25,90'))
      assert.ok(await evaluate('Array.from(document.querySelectorAll("svg title")).some(t=>t.textContent.includes("despesas") && t.textContent.includes("25,90"))'))
    })
    await t.test('falha e resposta vazia mantêm edição e valores preenchidos até confirmação', async () => {
      await edit('Despesa editada')
      await fill({ name: 'Despesa corrigida', amount: '25,90', category: 'cat-expense' })
      for (const failure of ['fail', 'missing']) {
        await evaluate(`window.testControls.${failure} = true`)
        await submit()
        await until('document.querySelector("dialog [role=alert]")?.textContent.includes("confirmar a atualização")')
        assert.equal(await evaluate('document.querySelector("[name=name]").value'), 'Despesa corrigida')
        assert.equal(await evaluate('window.testControls.rows[0].description'), 'Despesa editada')
        await evaluate(`window.testControls.${failure} = false`)
      }
      await submit()
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Despesa corrigida")')
    })
    await t.test('alterar tipo limpa categoria; nova data muda período sem perder mês ou filtro selecionados', async () => {
      await click('Despesas')
      await edit('Despesa corrigida')
      await evaluate('const type = document.querySelector("[name=type]"); type.value="income"; type.dispatchEvent(new Event("change", {bubbles:true}))')
      assert.equal(await evaluate('document.querySelector("[name=category]").value'), '')
      assert.equal(await evaluate('Array.from(document.querySelector("[name=category]").options).map(o=>o.value).join(",")'), ',cat-income')
      await fill({ type: 'income', amount: '25,90', name: 'Receita movida', category: 'cat-income' })
      await evaluate('document.querySelector("[name=date]").value="2026-12-05"')
      await submit()
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Nenhuma transação neste mês para o filtro")')
      assert.equal(await evaluate('document.getElementById("dashboard-period").value'), '2026-11')
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('[aria-label="Filtrar transações por tipo"] button')).find(b=>b.getAttribute('aria-pressed')==='true').textContent`), 'Despesas')
      assert.ok((await evaluate(`document.querySelector('[aria-label="Resumo financeiro"]').textContent`)).includes('200,00'))
      await evaluate('const movedPeriod = document.getElementById("dashboard-period"); movedPeriod.value="2026-12"; movedPeriod.dispatchEvent(new Event("change",{bubbles:true}))')
      await click('Receitas')
      await until('document.body.innerText.includes("Receita movida")')
      await edit('Receita movida')
      await evaluate('const category = document.querySelector("[name=category]"); category.value=""; category.dispatchEvent(new Event("change",{bubbles:true}))')
      await submit()
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Sem categoria")')
      assert.equal(await evaluate('window.testControls.rows[0].category_id'), null)
      await click('Todas')
    })
    await t.test('falha mantém campos, permite nova tentativa e respeita mês selecionado', async () => {
      await evaluate('const period = document.getElementById("dashboard-period"); period.value="2026-10"; period.dispatchEvent(new Event("change",{bubbles:true}))')
      // O mês anterior existe na lista de períodos disponíveis.
      await openForm(); await fill({ amount: '10,00', name: 'Outra competência' })
      await evaluate('window.testControls.fail = true')
      await submit()
      await until('document.querySelector("dialog [role=alert]")?.textContent.includes("confirmar")')
      assert.equal(await evaluate('document.querySelector("[name=name]").value'), 'Outra competência')
      assert.equal(await evaluate('document.querySelector("[name=amount]").value'), '10,00')
      await evaluate('window.testControls.fail = false')
      await submit()
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Outra competência")')
      assert.equal(await evaluate('document.getElementById("dashboard-period").value'), '2026-10')
      assert.ok(!(await evaluate('document.body.innerText')).includes('Compra persistida'))
    })
    await t.test('troca de usuário durante envio não altera dashboard da nova sessão', async () => {
      await openForm(); await fill({ name: 'Resposta antiga' })
      await evaluate('window.testControls.hold = true')
      await submit(); await until('window.testControls.posts === 5')
      await evaluate('window.renderUser("user-b")')
      await until('document.body.innerText.includes("Você ainda não tem transações")')
      await evaluate('window.testControls.hold = false; window.testControls.release()')
      await delay(150)
      assert.ok(!(await evaluate('document.body.innerText')).includes('Resposta antiga'))
      assert.ok(!(await evaluate('document.body.innerText')).includes('Transação cadastrada'))
    })
    await t.test('falha de categorias permite cadastro sem categoria e mostra nova tentativa', async () => {
      await evaluate('window.testControls.categoriesFail = true')
      await click('Nova transação')
      await until('document.querySelector("dialog [role=alert]")?.textContent.includes("categorias")')
      await fill({ name: 'Sem categoria real' })
      await evaluate('window.testControls.categoriesFail = false')
      await submit()
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Sem categoria real")')
      assert.equal(await evaluate('window.testControls.rows.at(-1).category_id'), null)
    })
    await t.test('troca de conta durante edição descarta sucesso da sessão anterior', async () => {
      await edit('Sem categoria real')
      await fill({ name: 'Edição de outra sessão' })
      const previous = await evaluate('window.testControls.patches')
      await evaluate('window.testControls.hold = true')
      await submit(); await until(`window.testControls.patches === ${previous + 1}`)
      await evaluate('window.renderUser("user-c")')
      await until('document.body.innerText.includes("Você ainda não tem transações")')
      await evaluate('window.testControls.hold = false; window.testControls.release()')
      await delay(150)
      assert.ok(!(await evaluate('document.body.innerText')).includes('Edição de outra sessão'))
      assert.ok(!(await evaluate('document.body.innerText')).includes('Transação atualizada'))
    })
    await t.test('Categorias: navegação, globais protegidas e layout em iPhone e desktop', async () => {
      await evaluate('window.location.hash = "#categorias"')
      await until('document.body.innerText.includes("Organize do seu jeito.") && document.body.innerText.includes("Categoria despesa")')
      assert.ok(await evaluate(`Array.from(document.querySelectorAll('#categorias li')).filter(li=>li.textContent.includes('Global')).every(li=>!li.querySelector('button'))`))
      for (const width of [390, 1440]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 })
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true)
      }
      assert.equal(await evaluate(`document.querySelector('a[href="#categorias"]').getAttribute('aria-current')`), 'page')
    })
    await t.test('Categorias: cadastro bloqueia duplicidade e aguarda confirmação', async () => {
      await click('Nova categoria')
      await evaluate('document.querySelector("dialog [name=name]").value="Viagens"; window.testControls.hold=true')
      await submit(); await submit()
      await until('window.testControls.categoryPosts === 1')
      assert.equal(await evaluate('document.querySelector("dialog fieldset").disabled'), true)
      await evaluate('window.testControls.hold=false; window.testControls.release()')
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Viagens")')
      assert.equal(await evaluate('window.testControls.categoryRows.at(-1).user_id'), 'user-c')
    })
    await t.test('Categorias: nova opção aparece na transação e nos gráficos sem perder o mês', async () => {
      await evaluate('window.location.hash="#visao-geral"')
      await until('!document.body.innerText.includes("Organize do seu jeito.")')
      const period = await evaluate('document.getElementById("dashboard-period").value')
      const category = await evaluate('window.testControls.categoryRows.at(-1).id')
      await openForm()
      assert.ok((await evaluate('document.querySelector("[name=category]").textContent')).includes('Viagens'))
      await fill({ name: 'Passeio', amount: '10,00', category })
      await submit()
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Passeio")')
      assert.equal(await evaluate('document.getElementById("dashboard-period").value'), period)
      assert.ok((await evaluate('document.body.innerText')).includes('Viagens'))
    })
    await t.test('Categorias: renomear atualiza gráfico/lista; cancelar exclusão não grava', async () => {
      const before = await evaluate('JSON.stringify(window.testControls.rows)')
      await evaluate('window.location.hash="#categorias"')
      await until('document.body.innerText.includes("Organize do seu jeito.")')
      await evaluate(`document.querySelector('button[aria-label="Editar categoria: Viagens"]').click()`)
      assert.equal(await evaluate('document.querySelector("dialog [name=name]").value'), 'Viagens')
      assert.equal(await evaluate('document.querySelector("dialog [name=type]").disabled'), true)
      await evaluate('document.querySelector("dialog [name=name]").value="Lazer e viagens"')
      await submit()
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Lazer e viagens")')
      assert.equal(await evaluate('JSON.stringify(window.testControls.rows)'), before)
      await evaluate(`document.querySelector('button[aria-label="Excluir categoria: Lazer e viagens"]').click()`)
      await until('document.querySelector("dialog").textContent.includes("1 transação ficará sem categoria")')
      assert.ok((await evaluate('document.querySelector("dialog").textContent')).includes('permanecerão registradas, mas ficarão sem categoria'))
      assert.equal(await evaluate('window.testControls.categoryDeletes'), 0)
      await click('Cancelar')
      await evaluate('window.location.hash="#visao-geral"')
      await until('document.body.innerText.includes("Passeio") && document.body.innerText.includes("Lazer e viagens")')
    })
    await t.test('Categorias: excluir com confirmação preserva lançamentos e totais, atualiza gráficos e impede duplicidade', async () => {
      const before = await evaluate('JSON.stringify(window.testControls.rows.map(({category_id,...rest})=>rest))')
      const totals = await evaluate(`document.querySelector('[aria-label="Resumo financeiro"]').textContent`)
      await evaluate('window.location.hash="#categorias"; window.testControls.categoryCountFail=true')
      await until('document.body.innerText.includes("Organize do seu jeito.")')
      await evaluate(`document.querySelector('button[aria-label="Excluir categoria: Lazer e viagens"]').click()`)
      await until('document.querySelector("dialog [role=alert]")?.textContent.includes("verificar")')
      assert.equal(await evaluate('document.querySelector("dialog button[type=submit]").disabled'), true)
      await evaluate('window.testControls.categoryCountFail=false')
      await click('Tentar novamente')
      await until('document.querySelector("dialog").textContent.includes("1 transação ficará sem categoria")')
      for (const flag of ['missing', 'fail']) {
        await evaluate(`window.testControls.${flag}=true`)
        await submit()
        await until('document.querySelector("dialog [role=alert]")?.textContent.includes("confirmar")')
        assert.ok(await evaluate('window.testControls.categoryRows.some(c=>c.name==="Lazer e viagens")'))
        await evaluate(`window.testControls.${flag}=false`)
      }
      const deletes = await evaluate('window.testControls.categoryDeletes')
      await evaluate('window.testControls.hold=true')
      await submit(); await submit()
      await until(`window.testControls.categoryDeletes === ${deletes + 1}`)
      assert.equal(await evaluate('document.querySelector("dialog fieldset").disabled'), true)
      await evaluate('window.testControls.hold=false; window.testControls.release()')
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Categoria excluída.") && !document.body.innerText.includes("Lazer e viagens")')
      assert.equal(await evaluate('JSON.stringify(window.testControls.rows.map(({category_id,...rest})=>rest))'), before)
      assert.equal(await evaluate('window.testControls.rows.find(r=>r.description==="Passeio").category_id'), null)
      await evaluate('window.location.hash="#visao-geral"')
      await until('document.body.innerText.includes("Passeio") && document.body.innerText.includes("Sem categoria")')
      assert.equal(await evaluate(`document.querySelector('[aria-label="Resumo financeiro"]').textContent`), totals)
      assert.ok(!(await evaluate('document.body.innerText')).includes('Lazer e viagens'))
      await openForm()
      assert.ok(!(await evaluate('document.querySelector("[name=category]").textContent')).includes('Lazer e viagens'))
      await click('Cancelar')
    })
    await t.test('Categorias: falha preserva campos; cancelar não grava; nova tentativa funciona', async () => {
      await evaluate('window.location.hash="#categorias"')
      await until('document.body.innerText.includes("Organize do seu jeito.")')
      await click('Nova categoria')
      await submit()
      await until('document.querySelector("dialog [role=alert]")?.textContent.includes("Informe o nome")')
      const posts = await evaluate('window.testControls.categoryPosts')
      await evaluate('document.querySelector("dialog [name=name]").value="Projetos"; window.testControls.fail=true')
      await submit()
      await until('document.querySelector("dialog [role=alert]")?.textContent.includes("Já existe")')
      assert.equal(await evaluate('document.querySelector("dialog [name=name]").value'), 'Projetos')
      await evaluate('window.testControls.fail=false')
      await submit()
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Projetos")')
      assert.equal(await evaluate('window.testControls.categoryPosts'), posts + 2)
      await click('Nova categoria'); await click('Cancelar')
      assert.equal(await evaluate('window.testControls.categoryPosts'), posts + 2)
    })
    await t.test('Categorias: troca de conta pendente descarta sucesso e particulares antigas', async () => {
      await click('Nova categoria')
      await evaluate('document.querySelector("dialog [name=name]").value="Outra sessão"; window.testControls.hold=true')
      const posts = await evaluate('window.testControls.categoryPosts')
      await submit(); await until(`window.testControls.categoryPosts === ${posts + 1}`)
      await evaluate('window.renderUser("user-d")')
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Organize do seu jeito.") && document.body.innerText.includes("Categoria despesa")')
      await evaluate('window.testControls.hold=false; window.testControls.release()')
      await delay(100)
      const text = await evaluate('document.body.innerText')
      assert.ok(!text.includes('Outra sessão') && !text.includes('Projetos') && !text.includes('Categoria criada.'))
    })
    await t.test('Categorias: erro de carregamento, recuperação e lista vazia', async () => {
      await evaluate('window.testControls.categoriesFail=true; window.location.hash="#visao-geral"')
      await until('!document.body.innerText.includes("Organize do seu jeito.")')
      await evaluate('window.location.hash="#categorias"')
      await until('document.body.innerText.includes("Não foi possível carregar suas categorias")')
      await evaluate('window.testControls.categoriesFail=false; window.testControls.categoryRows=[]')
      await click('Tentar novamente')
      await until('document.body.innerText.includes("Nenhuma categoria de receita") && document.body.innerText.includes("Nenhuma categoria de despesa")')
    })
    await t.test('Categorias: troca de conta durante DELETE descarta sucesso antigo', async () => {
      await click('Nova categoria')
      await evaluate('document.querySelector("dialog [name=name]").value="Categoria temporária"')
      await submit()
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Categoria temporária")')
      await evaluate(`document.querySelector('button[aria-label="Excluir categoria: Categoria temporária"]').click()`)
      await until('document.querySelector("dialog").textContent.includes("Nenhuma transação vinculada")')
      const deletes = await evaluate('window.testControls.categoryDeletes')
      await evaluate('window.testControls.hold=true')
      await submit(); await until(`window.testControls.categoryDeletes === ${deletes + 1}`)
      await evaluate('window.renderUser("user-e")')
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Organize do seu jeito.")')
      await evaluate('window.testControls.hold=false; window.testControls.release()')
      await delay(100)
      assert.ok(!(await evaluate('document.body.innerText')).includes('Categoria excluída.'))
    })
    const historySelect = (id, value) => evaluate(`(() => { const element = document.getElementById(${JSON.stringify(id)}); if (element instanceof HTMLInputElement) { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,${JSON.stringify(value)}); element.dispatchEvent(new Event('input',{bubbles:true})); } else { element.value=${JSON.stringify(value)}; element.dispatchEvent(new Event('change',{bubbles:true})); } })()`)
    async function searchHistory(value) {
      await evaluate(`(() => { const input = document.getElementById('history-search'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`)
    }
    const periodSummary = () => evaluate(`document.querySelector('[aria-label="Resumo do período"]').textContent`)
    await t.test('Transações: abertura direta paginada não carrega histórico completo; resumo inclui todo período', async () => {
      await evaluate(`window.location.hash='#transacoes'; window.testControls.transactionRequests=[]; window.testControls.rows=Array.from({length:45},(_,index)=>({id:'903b2689-13aa-4c4e-bbca-'+String(index).padStart(12,'0'),user_id:'history-user',category_id:null,type:index%2?'income':'expense',description:index===0?'Pesquisar.* literal':'Histórico '+index,amount:'10.00',transaction_date:new Date().getFullYear()+'-'+String(new Date().getMonth()+1).padStart(2,'0')+'-04',notes:'Preservar',created_at:null,updated_at:null})); window.renderUser('history-user')`)
      await until('document.body.innerText.includes("Suas transações.") && document.body.innerText.includes("45 resultados")')
      await until(`document.querySelector('[aria-label="Resumo do período"]').textContent.includes('230,00')`)
      assert.ok(await evaluate('window.testControls.transactionRequests.filter(r=>r.method==="GET").every(r=>new URLSearchParams(r.params).has("transaction_date"))'))
      assert.equal(await evaluate('document.querySelectorAll("#transacoes tbody tr").length'), 20)
      const summary = await periodSummary()
      assert.ok(summary.includes('220,00') && summary.includes('230,00'))
      await click('Próxima')
      await until('document.body.innerText.includes("Página 2") && document.body.innerText.includes("Histórico 24")')
      assert.equal(await periodSummary(), summary)
      await click('Anterior')
      await until('document.body.innerText.includes("Página 1") && document.body.innerText.includes("Histórico 44")')
    })
    await t.test('Transações: pesquisa literal, debounce, tipo, Sem categoria, ordenação e limpar filtros', async () => {
      await searchHistory(' pesquisar.*   literal ')
      await until('document.body.innerText.includes("1 resultado") && document.body.innerText.includes("Pesquisar.* literal")')
      await searchHistory('Não existe')
      await until('document.body.innerText.includes("Nenhuma transação encontrada.")')
      await click('Limpar filtros')
      await until('document.body.innerText.includes("45 resultados")')
      await historySelect('history-type','income'); await historySelect('history-category','none')
      await until('document.body.innerText.includes("22 resultados")')
      await historySelect('history-order','oldest')
      await until('document.querySelector("#transacoes tbody tr")?.textContent.includes("Histórico 1")')
      await click('Limpar filtros'); await until('document.body.innerText.includes("45 resultados")')
      await historySelect('history-period','previous')
      await until('document.body.innerText.includes("Nenhuma transação cadastrada.")')
      await historySelect('history-period','custom')
      await historySelect('history-start','2026-12-01'); await historySelect('history-end','2026-01-01')
      await until('document.body.innerText.includes("Informe uma data inicial e final válidas")')
      await click('Limpar filtros'); await until('document.body.innerText.includes("45 resultados")')
    })
    await t.test('Transações: controles e histórico responsivos de 375 a 1920 px', async () => {
      for (const width of [375,390,430,768,1366,1920]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500})
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'),true)
        assert.ok(await evaluate(`Array.from(document.querySelectorAll('#transacoes button[aria-label="Editar transação"],#transacoes button[aria-label="Excluir transação"]')).filter(b=>b.getBoundingClientRect().height>0).every(b=>b.getBoundingClientRect().height>=44 && b.getBoundingClientRect().width>=44 && b.textContent.trim()==='')`))
      }
    })
    await t.test('Transações: cadastro e edição reutilizam formulário e preservam notas', async () => {
      await click('+ Nova transação'); await until('document.querySelector("dialog [name=category]")?.disabled===false')
      await fill({ name:'Criada no histórico', amount:'50,00' }); await submit()
      await until('!document.querySelector("dialog") && document.body.innerText.includes("46 resultados")')
      await searchHistory('Criada no histórico'); await until('document.body.innerText.includes("1 resultado")')
      await edit('Criada no histórico')
      assert.equal(await evaluate('document.querySelector("dialog [name=amount]").value'),'50,00')
      await fill({name:'Editada no histórico',amount:'80,00'}); await submit()
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Nenhuma transação encontrada")')
      await searchHistory('Editada no histórico'); await until('document.body.innerText.includes("1 resultado")')
      await edit('Editada no histórico'); await click('Cancelar')
    })
    await t.test('Transações: excluir exige confirmação; falha mantém modal; envio duplo remove uma vez e confirma ausência', async () => {
      const categoryBefore = await evaluate('JSON.stringify(window.testControls.categoryRows)')
      const deleteButton = () => evaluate(`Array.from(document.querySelectorAll('#transacoes button[aria-label="Excluir transação"]')).find(b=>b.getBoundingClientRect().height>0).click()`)
      await deleteButton()
      assert.ok((await evaluate('document.querySelector("dialog").textContent')).includes('Essa ação não poderá ser desfeita'))
      const deletes = await evaluate('window.testControls.transactionDeletes')
      await click('Cancelar'); assert.equal(await evaluate('window.testControls.transactionDeletes'),deletes)
      await deleteButton(); await evaluate('window.testControls.fail=true')
      await click('Excluir transação'); await until('document.querySelector("dialog [role=alert]")?.textContent.includes("confirmar")')
      await evaluate('window.testControls.fail=false;window.testControls.hold=true')
      await click('Excluir transação'); await click('Excluindo…')
      await until(`window.testControls.transactionDeletes===${deletes+2}`)
      await evaluate('window.testControls.hold=false;window.testControls.release()')
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Transação excluída.") && document.body.innerText.includes("Nenhuma transação encontrada.")')
      assert.equal(await evaluate('JSON.stringify(window.testControls.categoryRows)'),categoryBefore)
      assert.ok(await evaluate('window.testControls.transactionRequests.some(r=>r.method==="HEAD" && new URLSearchParams(r.params).has("id"))'))
      await click('Limpar filtros'); await until('document.body.innerText.includes("45 resultados")')
      await evaluate('window.location.hash="#visao-geral"')
      await until('document.body.innerText.includes("Histórico 44")')
      assert.ok((await evaluate(`document.querySelector('[aria-label="Resumo financeiro"]').textContent`)).includes('230,00'))
      await evaluate('window.location.hash="#transacoes"'); await until('document.body.innerText.includes("45 resultados")')
    })
    await t.test('Transações: erro de totais não publica valores parciais, erro de histórico permite recuperação', async () => {
      await evaluate('window.testControls.historyTotalsFail=true;window.location.hash="#categorias"')
      await until('document.body.innerText.includes("Organize do seu jeito.")')
      await evaluate('window.location.hash="#transacoes"')
      await until('document.body.innerText.includes("Nenhum total parcial foi exibido")')
      assert.ok(!(await periodSummary()).includes('230,00'))
      await evaluate('window.testControls.historyTotalsFail=false;window.testControls.historyFail=true')
      await click('Tentar novamente')
      await until('document.body.innerText.includes("Não foi possível carregar estes dados")')
      await evaluate('window.testControls.historyFail=false')
      await click('Tentar novamente'); await until('document.body.innerText.includes("45 resultados")')
    })
    await t.test('Transações: troca de usuário durante exclusão descarta resposta e limpa registros anteriores', async () => {
      await evaluate(`Array.from(document.querySelectorAll('#transacoes button[aria-label="Excluir transação"]')).find(b=>b.getBoundingClientRect().height>0).click();window.testControls.hold=true`)
      const deletes=await evaluate('window.testControls.transactionDeletes')
      await click('Excluir transação');await until(`window.testControls.transactionDeletes===${deletes+1}`)
      await evaluate('window.renderUser("history-other")')
      await until('!document.querySelector("dialog") && document.body.innerText.includes("Nenhuma transação cadastrada.")')
      await evaluate('window.testControls.hold=false;window.testControls.release()');await delay(100)
      assert.ok(!(await evaluate('document.body.innerText')).includes('Transação excluída.'))
      assert.ok(!(await evaluate('document.body.innerText')).includes('Histórico 44'))
    })
    await t.test('navegação mobile, nomes e valores máximos cabem de 320 a 1920 px', async () => {
      await evaluate(`(() => {
        const date = new Date(); const period = date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
        window.testControls.rows.push({ id: crypto.randomUUID(), user_id:'release-layout', description:'L'.repeat(120), type:'expense', amount:'99999999.99', category_id:null, transaction_date:period+'-01', notes:null, created_at:null, updated_at:null });
        window.location.hash='#visao-geral'; window.renderUser('release-layout');
      })()`)
      await until('document.body.innerText.includes("99.999.999,99")')
      assert.ok(!(await evaluate('document.body.innerText')).includes('Em breve'))
      for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 })
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `dashboard ${width}px`)
        await edit('L'.repeat(120))
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `formulário ${width}px`)
        await click('Cancelar')
      }
      await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 900, deviceScaleFactor: 1, mobile: true })
      await click('Menu')
      assert.equal(await evaluate('document.querySelector("button[aria-controls=dashboard-navigation]").getAttribute("aria-expanded")'), 'true')
      await evaluate('document.querySelector("a[href=\\"#categorias\\"]").click()')
      await until('document.body.innerText.includes("Organize do seu jeito.")')
      assert.equal(await evaluate('document.querySelector("button[aria-controls=dashboard-navigation]").getAttribute("aria-expanded")'), 'false')
      await evaluate('window.location.hash=""')
      await until('document.querySelector("nav a[href=\\"#visao-geral\\"]").getAttribute("aria-current")==="page"')
      assert.equal(await evaluate('document.querySelector("nav a[href=\\"#visao-geral\\"]").getAttribute("aria-current")'), 'page')
    })
    await t.test('falha inesperada exibe recuperação sem revelar detalhes internos', async () => {
      await evaluate('window.renderBroken()')
      await until('document.body.innerText.includes("Não foi possível abrir o Rastro.")')
      assert.ok(!(await evaluate('document.body.innerText')).includes('private-diagnostic-do-not-display'))
      assert.ok((await evaluate('document.body.innerText')).includes('confira os dados'))
      assert.ok(await evaluate('Array.from(document.querySelectorAll("button")).some(b=>b.textContent==="Recarregar página")'))
    })
  } finally {
    if (abortBrowser) t.signal.removeEventListener('abort', abortBrowser)
    socket?.close()
    if (browser && browser.exitCode === null && browser.signalCode === null) {
      browser.kill()
      await Promise.race([new Promise((resolve) => browser.once('exit', resolve)), delay(2000)])
    }
    await server.close()
    // Apenas o perfil temporário criado acima; nunca usa perfil pessoal.
    if (path.dirname(path.resolve(profile)) === path.resolve(tmpdir()) && path.basename(profile).startsWith('rastro-browser-')) {
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {})
    }
  }
})
