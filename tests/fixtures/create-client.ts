import { createClient } from '@supabase/supabase-js'

export const controls = {
  investmentRows: JSON.parse(sessionStorage.getItem('test-investment-rows') ?? '[]') as Record<string, unknown>[],
  investmentFail: false, investmentHold: false, investmentPosts: 0,
  investmentRelease: () => {},
  user: 'user-a', posts: 0, patches: 0, hold: false, fail: false, missing: false, categoriesFail: false,
  release: () => {},
  rows: [] as Record<string, unknown>[],
  categoryPosts: 0, categoryPatches: 0, categoryDeletes: 0,
  categoryCountFail: false,
  transactionDeletes: 0, historyFail: false, historyTotalsFail: false,
  transactionRequests: [] as { method: string; params: string }[],
  categoryRows: [
    { id: 'cat-expense', name: 'Categoria despesa', user_id: null, type: 'expense' },
    { id: 'cat-income', name: 'Categoria receita', user_id: null, type: 'income' },
  ] as Record<string, unknown>[],
}
const client = createClient('https://rastro-browser-test.supabase.co', 'public-test-key', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: async (input, init) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/investment_totals')) {
      const actor = new Headers(init?.headers).get('Authorization')?.replace('Bearer token-', '')
      const method = init?.method ?? 'GET'
      if (method === 'POST') controls.investmentPosts++
      if (controls.investmentHold) await new Promise<void>((resolve) => { controls.investmentRelease = resolve })
      if (controls.investmentFail) return Response.json({ code: '42501' }, { status: 403 })
      if (method === 'POST') {
        const row = JSON.parse(String(init?.body))
        if (row.user_id !== actor || url.searchParams.get('on_conflict') !== 'user_id') return Response.json(null, { status: 403 })
        controls.investmentRows = [...controls.investmentRows.filter((item) => item.user_id !== actor), row]
        sessionStorage.setItem('test-investment-rows', JSON.stringify(controls.investmentRows))
        return Response.json(row)
      }
      return Response.json(controls.investmentRows.filter((row) => row.user_id === actor && row.user_id === url.searchParams.get('user_id')?.slice(3)))
    }
    if (url.pathname.endsWith('/transactions')) controls.transactionRequests.push({ method: init?.method ?? 'GET', params: url.search })
    if (url.pathname.endsWith('/categories')) {
      const actor = new Headers(init?.headers).get('Authorization')?.replace('Bearer token-', '')
      const method = init?.method ?? 'GET'
      if (controls.categoriesFail && method === 'GET') return Response.json({ message: 'internal' }, { status: 403 })
      let rows = controls.categoryRows.filter((row) => row.user_id === null || row.user_id === actor)
      const id = url.searchParams.get('id')
      if (id?.startsWith('gt.')) rows = rows.filter((row) => String(row.id) > id.slice(3))
      if (id?.startsWith('eq.')) rows = rows.filter((row) => row.id === id.slice(3))
      const owner = url.searchParams.get('user_id')
      if (owner) rows = rows.filter((row) => row.user_id === owner.slice(3))
      rows.sort((a, b) => String(a.id).localeCompare(String(b.id)))
      if (method !== 'GET') {
        if (method === 'POST') controls.categoryPosts++
        if (method === 'PATCH') controls.categoryPatches++
        if (method === 'DELETE') controls.categoryDeletes++
        const body = JSON.parse(String(init?.body ?? '{}'))
        if (controls.hold) await new Promise<void>((resolve) => { controls.release = resolve })
        if (controls.fail) return Response.json({ code: method === 'DELETE' ? '42501' : '23505' }, { status: method === 'DELETE' ? 403 : 409 })
        if (controls.missing) return Response.json(null)
        if (method === 'POST') {
          const row = { ...body, id: crypto.randomUUID() }
          if (row.user_id !== actor) return Response.json(null, { status: 403 })
          controls.categoryRows.push(row); rows = [row]
        } else {
          rows = rows.filter((row) => row.user_id === actor)
          if (method === 'DELETE') {
            controls.categoryRows = controls.categoryRows.filter((row) => !rows.includes(row))
            controls.rows.forEach((row) => { if (rows.some((category) => category.id === row.category_id)) row.category_id = null })
          } else {
            if (Object.keys(body).some((key) => key !== 'name')) throw new Error('PATCH de categoria deve preservar tipo e proprietário')
            rows.forEach((row) => Object.assign(row, body))
          }
        }
      }
      const single = new Headers(init?.headers).get('Accept')?.includes('vnd.pgrst.object+json')
      return single ? (rows.length === 1 ? Response.json(rows[0]) : Response.json({ code: 'PGRST116' }, { status: 406 })) : Response.json(rows)
    }
    if (init?.method === 'HEAD') {
      if (controls.categoryCountFail) return new Response(null, { status: 403 })
      const actor = new Headers(init.headers).get('Authorization')?.replace('Bearer token-', '')
      if (controls.historyTotalsFail && url.searchParams.has('transaction_date')) return new Response(null, { status: 403 })
      const rows = filteredRows(url, actor)
      return new Response(null, { status: 200, headers: { 'Content-Range': `*/${rows.length}` } })
    }
    if (init?.method === 'DELETE') {
      controls.transactionDeletes++
      const row = controls.rows.find((item) => item.id === url.searchParams.get('id')?.slice(3) && item.user_id === url.searchParams.get('user_id')?.slice(3))
      if (controls.hold) await new Promise<void>((resolve) => { controls.release = resolve })
      if (controls.fail) return Response.json({ code: '42501' }, { status: 403 })
      if (controls.missing || !row) return Response.json(null)
      controls.rows = controls.rows.filter((item) => item !== row)
      return Response.json(row)
    }
    if (init?.method === 'POST') {
      controls.posts++
      const row = { ...JSON.parse(String(init.body)), id: crypto.randomUUID(), notes: null, created_at: null, updated_at: null }
      if (controls.hold) await new Promise<void>((resolve) => { controls.release = resolve })
      if (controls.fail) return Response.json({ message: 'internal' }, { status: 403 })
      controls.rows.push(row)
      return Response.json(row, { status: 201 })
    }
    if (init?.method === 'PATCH') {
      controls.patches++
      const patch = JSON.parse(String(init.body))
      if ('notes' in patch || 'id' in patch || 'user_id' in patch || 'created_at' in patch) throw new Error('Campo protegido enviado')
      const row = controls.rows.find((item) => item.id === url.searchParams.get('id')?.slice(3) && item.user_id === url.searchParams.get('user_id')?.slice(3))
      if (controls.hold) await new Promise<void>((resolve) => { controls.release = resolve })
      if (controls.fail) return Response.json({ message: 'internal' }, { status: 403 })
      if (!row || controls.missing) return Response.json(null)
      Object.assign(row, patch)
      return Response.json(row)
    }
    if (controls.historyFail && url.searchParams.has('transaction_date')) return Response.json({ message: 'internal' }, { status: 403 })
    const actor = new Headers(init?.headers).get('Authorization')?.replace('Bearer token-', '')
    let rows = filteredRows(url, actor)
    const order = url.searchParams.get('order')
    if (order) rows.sort((a, b) => order.startsWith('transaction_date') ? (String(a.transaction_date).localeCompare(String(b.transaction_date)) || String(a.id).localeCompare(String(b.id))) * (order.includes('.asc') ? 1 : -1) : String(a.id).localeCompare(String(b.id)))
    const limit = url.searchParams.get('limit')
    if (limit) rows = rows.slice(0, Number(limit))
    return Response.json(rows)
  } },
})
function filteredRows(url: URL, actor: string | undefined) {
  let rows = controls.rows.filter((row) => row.user_id === actor && row.user_id === url.searchParams.get('user_id')?.slice(3))
  for (const [field, filter] of url.searchParams) {
    if (!['id', 'type', 'category_id', 'transaction_date'].includes(field)) continue
    const value = filter.slice(filter.indexOf('.') + 1)
    if (filter.startsWith('eq.')) rows = rows.filter((row) => row[field] === value)
    if (filter.startsWith('gt.')) rows = rows.filter((row) => String(row[field]) > value)
    if (filter.startsWith('gte.')) rows = rows.filter((row) => String(row[field]) >= value)
    if (filter.startsWith('lte.')) rows = rows.filter((row) => String(row[field]) <= value)
    if (filter === 'is.null') rows = rows.filter((row) => row[field] === null)
  }
  const search = url.searchParams.get('description')
  if (search) rows = rows.filter((row) => new RegExp(search.slice(7), 'i').test(String(row.description)))
  const cursor = url.searchParams.get('or')
  if (cursor) {
    const match = /transaction_date\.(gt|lt)\.([^,]+),and\(transaction_date.eq.([^,]+),id\.(?:gt|lt)\.([^()]+)\)/.exec(cursor)
    if (!match) throw new Error('Cursor inválido')
    rows = rows.filter((row) => { const comparison = String(row.transaction_date).localeCompare(match[2]) || String(row.id).localeCompare(match[4]); return match[1] === 'gt' ? comparison > 0 : comparison < 0 })
  }
  return rows
}
export const supabase = {
  from: client.from.bind(client),
  auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: async () => ({ data: { session: { user: { id: controls.user }, access_token: `token-${controls.user}` } }, error: null }),
    getUser: async () => ({ data: { user: { id: controls.user, email_confirmed_at: '2026-11-04' } }, error: null }),
    signOut: async () => ({ error: null }),
  },
}
