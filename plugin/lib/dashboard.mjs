// Local browser host for the same collector and drawings as the Claude pane. No agent settings are changed.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { collect } from './collect.mjs'
import { renderOffice, renderStatus, toPlain } from './ascii.mjs'
import { renderTimelapseText } from './ascii-timelapse.mjs'
import { cropRoom, renderSvg, renderTimelapse } from './svg.mjs'
import { renderTimelapsePage, PLAYER_JS } from './timelapse-page.mjs'
import { renderMonthPage, MONTH_JS } from './month-page.mjs'
import { monthStats, statsCsv, statsJson, statsPage } from './month-stats.mjs'
import { dashboardPage } from './dashboard-page.mjs'
import { defaultCacheDir } from './cache.mjs'
import { httpRepresentation, sendHttpRepresentation } from './http-response.mjs'

const VIEWS = ['live', 'today', 'week', 'month', 'work', 'timelapse']
const RANGES = ['yesterday', 'week', 'month']
const QUERY = new Set(['token', 'view', 'range', 'back', 'quiet'])
const HOST = '127.0.0.1'
const MAX_PENDING = 12

/** Only harmless view preferences are persisted; storage is fixed by the host, never selected by an HTTP request. */
export function dashboardPreferences(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some((key) => !['view', 'range', 'quiet', 'backs'].includes(key))) throw new Error('Invalid preferences')
  const { view, range, quiet, backs } = raw
  if (!VIEWS.includes(view) || !RANGES.includes(range) || typeof quiet !== 'boolean' || !backs || typeof backs !== 'object' || Array.isArray(backs) || Object.keys(backs).some((key) => !['today', 'week', 'month'].includes(key))) throw new Error('Invalid preferences')
  for (const [unit, max] of [['today', 3660], ['week', 520], ['month', 1200]]) if (!Number.isInteger(backs[unit]) || backs[unit] < 0 || backs[unit] > max) throw new Error('Invalid calendar page')
  return { view, range, quiet, backs: { today: backs.today, week: backs.week, month: backs.month } }
}

function readPreferences(file) {
  if (!file) return null
  try {
    const stat = fs.lstatSync(file)
    return stat.isFile() && stat.size <= 4096 ? dashboardPreferences(JSON.parse(fs.readFileSync(file, 'utf8'))) : null
  } catch { return null }
}

function writePreferences(file, preferences) {
  if (!file) return
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (!fs.lstatSync(dir).isDirectory()) throw new Error('Invalid cache directory')
  fs.chmodSync(dir, 0o700)
  const temporary = path.join(dir, `.dashboard-${randomBytes(8).toString('hex')}.tmp`)
  try { fs.writeFileSync(temporary, `${JSON.stringify(preferences)}\n`, { flag: 'wx', mode: 0o600 });fs.renameSync(temporary, file) } finally { try { fs.unlinkSync(temporary) } catch {} }
}

function smallJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    const cleanup = () => { req.off('data', data);req.off('end', end);req.off('error', fail) }
    const fail = (error) => { cleanup();reject(error) }
    const data = (chunk) => {
      size += chunk.length
      if (size > 4096) { cleanup();req.resume();reject(new Error('Body is too large')) } else chunks.push(chunk)
    }
    const end = () => { cleanup();try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(new Error('Invalid JSON')) } }
    req.on('data', data);req.once('end', end);req.once('error', fail)
  })
}

/** Only named views and bounded calendar pages ever reach the collector. */
export function dashboardSelection(params) {
  for (const key of params.keys()) {
    if (!QUERY.has(key) || params.getAll(key).length !== 1) throw new Error('Invalid query')
  }
  const view = params.get('view') ?? 'live'
  const range = params.get('range') ?? 'week'
  const raw = params.get('back') ?? '0'
  const quiet = params.get('quiet') ?? '0'
  if (!VIEWS.includes(view) || !RANGES.includes(range) || !/^(0|[1-9]\d{0,3})$/.test(raw) || !['0', '1'].includes(quiet)) throw new Error('Invalid selection')
  const back = Number(raw)
  if (back > (view === 'month' ? 1200 : view === 'today' ? 3660 : 520)) throw new Error('Page is too old')
  if ((view === 'live' || view === 'timelapse') && back) throw new Error('This view has no calendar pages')
  return { view, range: view === 'timelapse' ? range : 'week', back, ...(quiet === '1' ? { quiet: true } : {}) }
}

export function dashboardSelectionParams(selection) {
  return new URLSearchParams(Object.entries(selection).map(([key, value]) => [key, key === 'quiet' ? (value ? '1' : '0') : String(value)]))
}

/** Shared pure renderers keep the browser's office identical to the other hosts' office. */
export async function renderDashboard(selection, { collectFacts = collect } = {}) {
  const { view, range, back } = selection
  const lapse = view === 'timelapse'
  const options = lapse ? { view: 'all', range, timeline: true, novi: false } : { view: view === 'live' ? 'all' : view, back }
  let facts
  try { facts = await collectFacts({ ...options, series: true }) } catch {
    // The CLI makes the same recovery from a broken incremental cache.
    facts = await collectFacts({ ...options, series: true, resetCache: true })
  }
  if (!facts || facts.error) throw new Error('Could not read agent activity')
  return {
    svg: lapse ? renderTimelapse(facts, { width: 960 }) : renderSvg(facts, { view: view === 'live' ? 'all' : view, width: 960, liveClock: true, card: true, quiet: selection.quiet === true }),
    text: toPlain(lapse ? renderTimelapseText(facts, { width: 100 }) : renderOffice(facts, { view, width: 100 })),
    label: facts.range?.label ?? 'The Office',
    status: renderStatus(facts, { width: 120 }),
    generatedAt: facts.generated_at ?? new Date().toISOString(),
    // Kept only by the server: exports use this exact revision, without sending raw session facts to the browser.
    facts,
  }
}

const scriptHash = (script) => `sha256-${createHash('sha256').update(script).digest('base64')}`
const exportCsp = (script) => `default-src 'none'; style-src 'unsafe-inline'; script-src ${script ? `'${scriptHash(script)}'` : "'none'"}; img-src blob: data:; media-src blob:; base-uri 'none'; form-action 'none'`

/** The exact same pure exporters used by office.mjs. No request ever selects a filesystem path or command. */
export function dashboardExport(data, selection, { part = 'whole', format = 'html' } = {}) {
  if (selection.view !== 'month' || !data.facts) throw new Error('Month data is required')
  const formats = part === 'stats' ? ['html', 'csv', 'json'] : ['html', 'svg', 'png', 'gif', 'video']
  if (!['calendar', 'directory', 'whole', 'stats'].includes(part) || !formats.includes(format)) throw new Error('Invalid export')
  const facts = data.facts
  const date = /^\d{4}-\d\d-\d\d$/.test(facts.now?.local_date ?? '') ? facts.now.local_date : 'month'
  const name = `theoffice-month-${date}-${part}`
  let body
  let extension = format
  let script
  if (part === 'stats') {
    const stats = monthStats(facts)
    body = format === 'csv' ? statsCsv(stats) : format === 'json' ? statsJson(stats) : statsPage(stats, { svg: data.svg })
  } else {
    const whole = renderSvg(facts, { view: 'month', width: 960, rooms: part !== 'whole' })
    const svg = part === 'whole' ? whole : cropRoom(whole, part, `The Office, ${part}, ${facts.range?.label ?? ''}`)
    if (!svg) throw new Error('This month has no such room')
    if (format === 'svg') body = svg
    else {
      extension = 'html'
      script = MONTH_JS
      body = renderMonthPage({ svg, room: part, label: facts.range?.label ?? '', name, auto: format === 'html' ? undefined : format, scriptHash: scriptHash(MONTH_JS) })
    }
  }
  return {
    body,
    type: { html: 'text/html; charset=utf-8', svg: 'image/svg+xml', csv: 'text/csv; charset=utf-8', json: 'application/json; charset=utf-8' }[extension],
    headers: { 'Content-Security-Policy': exportCsp(script), ...(extension !== 'html' ? { 'Content-Disposition': `attachment; filename="${name}.${extension}"` } : {}) },
  }
}

function authorized(value, token) {
  const actual = Buffer.from(value ?? '')
  const expected = Buffer.from(token)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** A capability token a host hands us (Antigravity's pane token): printable, no spaces, long enough to guess at no cost. */
function hostToken(value) {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{16,512}$/.test(value)) throw new Error('A host token must be 16 to 512 printable characters')
  return value
}

/**
 * Starts a loopback-only capability URL. `renderer` is injectable so tests never inspect the user's transcripts.
 * All renders are serialized, including different tabs, since they share one incremental collector cache.
 * A host that frames the page in a pane of its own (Antigravity's side pane) passes the token it adds to the page's URL
 * (`hostTokens`, accepted beside our own on every route), the query fields it adds besides (`hostParams`, dropped before
 * anything reads the query), whether it may name the server `localhost` as well as 127.0.0.1 (`localhostAlias`), and
 * whether the page may stop the server (`stoppable`: not when the host owns its life).
 */
export async function startDashboard({ port = 0, renderer = renderDashboard, cacheMs = 5000, initialSelection = null, preferenceFile = path.join(defaultCacheDir(), 'dashboard-preferences.json'), hostTokens = [], hostParams = [], localhostAlias = false, stoppable = true } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535')
  const initial = initialSelection == null ? null : dashboardSelection(dashboardSelectionParams(initialSelection))
  const token = randomBytes(24).toString('base64url')
  const tokens = [token, ...hostTokens.map(hostToken)]
  const ignored = hostParams.filter((key) => /^[A-Za-z][\w-]{0,40}$/.test(key) && !QUERY.has(key))
  let origins = []
  const nonce = randomBytes(18).toString('base64url')
  const pending = new Map()
  const cache = new Map()
  const versions = new Map()
  let queue = Promise.resolve()
  let closed = false
  let closing
  let origin

  const snapshot = (selection) => {
    const key = JSON.stringify(selection)
    const saved = cache.get(key)
    if (saved && Date.now() - saved.at < cacheMs) return Promise.resolve(saved.data)
    if (pending.has(key)) return pending.get(key)
    if (pending.size >= MAX_PENDING) return Promise.reject(new Error('Busy'))
    const task = queue.then(async () => {
      if (closed) throw new Error('Closed')
      const data = await renderer(selection)
      if (!data || typeof data.svg !== 'string' || typeof data.text !== 'string') throw new Error('Invalid drawing')
      const revision = randomBytes(12).toString('base64url')
      const version = { ...data, revision }
      const { facts: _private, ...publicData } = version
      const response = httpRepresentation(JSON.stringify(publicData))
      versions.set(revision, { data: version, selection })
      while (versions.size > MAX_PENDING) versions.delete(versions.keys().next().value)
      cache.delete(key)
      const snapshot = { data: version, response }
      cache.set(key, { at: Date.now(), data: snapshot })
      while (cache.size > MAX_PENDING) cache.delete(cache.keys().next().value)
      return snapshot
    })
    pending.set(key, task)
    queue = task.catch(() => {}).finally(() => pending.delete(key))
    return task
  }

  const server = http.createServer(async (req, res) => {
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; connect-src 'self'; frame-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'`,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    }
    const send = (status, body, type = 'text/plain; charset=utf-8', extraHeaders = {}) => {
      if (res.destroyed) return
      res.writeHead(status, { ...headers, 'Content-Type': type, ...extraHeaders })
      res.end(req.method === 'HEAD' ? undefined : body)
    }
    try {
      // Bind and Host checks prevent DNS rebinding; a foreign page cannot fetch even a leaked URL.
      const here = origins.find((o) => new URL(o).host === req.headers.host)
      if (!here || (req.headers.origin && req.headers.origin !== here)) return send(403, 'Forbidden')
      const url = new URL(req.url, here)
      const given = url.searchParams.get('token')
      if (url.origin !== here || !tokens.some((t) => authorized(given, t))) return send(403, 'Forbidden')
      for (const key of ignored) url.searchParams.delete(key)
      if (url.pathname === '/player' || url.pathname === '/export') {
        if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'Method not allowed')
        const keys = new Set(url.pathname === '/player' ? ['token', 'revision'] : ['token', 'revision', 'part', 'format'])
        if ([...url.searchParams.keys()].some((key) => !keys.has(key) || url.searchParams.getAll(key).length !== 1)) return send(400, 'Invalid query')
        const revision = url.searchParams.get('revision')
        if (!/^[\w-]{16}$/.test(revision ?? '')) return send(400, 'Invalid revision')
        const saved = versions.get(revision)
        if (!saved) return send(410, 'This drawing is no longer available. Refresh The Office and try again.')
        if (url.pathname === '/player') {
          if (saved.selection.view !== 'timelapse' || !saved.data.facts) return send(400, 'This drawing has no replay')
          return send(200, renderTimelapsePage({ svg: saved.data.svg, facts: saved.data.facts, scriptHash: scriptHash(PLAYER_JS) }), 'text/html; charset=utf-8', { 'Content-Security-Policy': exportCsp(PLAYER_JS) })
        }
        try {
          const exported = dashboardExport(saved.data, saved.selection, { part: url.searchParams.get('part') ?? 'whole', format: url.searchParams.get('format') ?? 'html' })
          return send(200, exported.body, exported.type, exported.headers)
        } catch { return send(400, 'Invalid export') }
      }
      let selection
      try { selection = dashboardSelection(url.searchParams) } catch { return send(400, 'Invalid query') }
      if (url.pathname === '/preferences') {
        if ([...url.searchParams.keys()].some((key) => key !== 'token')) return send(400, 'Invalid query')
        if (req.method === 'GET') return send(200, JSON.stringify(readPreferences(preferenceFile)), 'application/json; charset=utf-8')
        if (req.method !== 'POST') return send(405, 'Method not allowed')
        if (req.headers.origin !== here) return send(403, 'Forbidden')
        try { const preferences = dashboardPreferences(await smallJson(req));writePreferences(preferenceFile, preferences);return send(200, JSON.stringify(preferences), 'application/json; charset=utf-8') } catch { return send(400, 'Invalid preferences') }
      }
      if (url.pathname === '/shutdown') {
        if (req.method !== 'POST') return send(405, 'Method not allowed')
        if (req.headers.origin !== here || [...url.searchParams.keys()].some((key) => key !== 'token')) return send(403, 'Forbidden')
        send(200, 'The Office is stopped')
        setImmediate(() => { close().catch(() => {}) })
        return
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'Method not allowed')
      if (url.pathname === '/') return send(200, dashboardPage({ nonce, selection, restore: !url.searchParams.has('view'), preferences: readPreferences(preferenceFile), stoppable }), 'text/html; charset=utf-8')
      if (url.pathname !== '/snapshot') return send(404, 'Not found')
      if (closed) return send(503, 'The Office is closing')
      try {
        const { response } = await snapshot(selection)
        await sendHttpRepresentation(req, res, { ...headers, 'Content-Type': 'application/json; charset=utf-8' }, response)
      } catch {
        send(503, JSON.stringify({ error: 'Could not refresh The Office. Try again in a moment.' }), 'application/json; charset=utf-8')
      }
    } catch { send(400, 'Invalid request') }
  })
  server.requestTimeout = 600_000
  server.headersTimeout = 10_000
  const close = () => {
    if (closing) return closing
    closed = true
    const stopped = new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    server.closeIdleConnections()
    closing = Promise.all([stopped, queue]).then(() => { cache.clear();versions.clear() })
    return closing
  }
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, HOST, () => { server.off('error', reject); resolve() })
  })
  // the loopback address written out (HOST): the page is served on this computer only, never on a remote host
  origin = `http://127.0.0.1:${server.address().port}`
  origins = localhostAlias ? [origin, `http://localhost:${server.address().port}`] : [origin]
  return {
    url: `${origin}/?token=${token}${initial ? `&${dashboardSelectionParams(initial)}` : ''}`,
    close,
    get isClosed() { return closed },
  }
}
