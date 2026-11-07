// Local browser host for the same collector and drawings as the Claude pane. No agent settings are changed.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { collect } from './collect.mjs'
import { renderOffice, renderStatus, toPlain } from './ascii.mjs'
import { renderTimelapseText } from './ascii-timelapse.mjs'
import { cropRoom, onBeat, renderLoading, renderSvg, renderTimelapse } from './svg.mjs'
import { claudeDirsOf, othersOf, watchOffice } from './dashboard-watch.mjs'
import { renderTimelapsePage, PLAYER_JS } from './timelapse-page.mjs'
import { renderMonthPage, MONTH_JS } from './month-page.mjs'
import { monthStats, statsCsv, statsJson, statsPage } from './month-stats.mjs'
import { dashboardPage } from './dashboard-page.mjs'
import { defaultCacheDir } from './cache.mjs'
import { httpRepresentation, sendHttpRepresentation } from './http-response.mjs'

const VIEWS = ['live', 'today', 'week', 'month', 'work', 'timelapse']
const RANGES = ['yesterday', 'week', 'month']
const QUERY = new Set(['token', 'view', 'range', 'back', 'quiet', 'zoom', 'width'])
const HOST = '127.0.0.1'
const MAX_PENDING = 12
/** The pane's Zoom: every tab's art drawn bigger (hooks/register.tsx ZOOM_SCALE; renderSvg's own scale is 2). */
const ZOOM_SCALE = 2.5
/** The drawing's width when the page names none, and the bounds of one it names (the pane's svgWidth stops at 2400). */
const WIDTH = { default: 960, min: 320, max: 2400 }
/** A drawing whose desks only changed what they are doing waits this long to be drawn again (the pane's ACTIVITY_MS). */
const ACTIVITY_MS = 60_000
/** A comment line on the event stream this often, so no proxy or browser takes it for dead. */
const PING_MS = 25_000
/**
 * The console's parts the page draws in the browser, as the desktop draws them in its pane (hooks/menu.tsx and
 * hooks/period.tsx): pure modules that import only each other, served as they are. Nothing else under lib/ is served.
 */
const PAGE_MODULES = ['svg-console.mjs', 'svg-menu.mjs', 'svg-period.mjs', 'period.mjs']
const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))

/** Only harmless view preferences are persisted; storage is fixed by the host, never selected by an HTTP request. */
export function dashboardPreferences(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some((key) => !['view', 'range', 'quiet', 'zoom', 'backs'].includes(key))) throw new Error('Invalid preferences')
  const { view, range, quiet, zoom, backs } = raw
  if (!VIEWS.includes(view) || !RANGES.includes(range) || typeof quiet !== 'boolean' || (zoom !== undefined && typeof zoom !== 'boolean') || !backs || typeof backs !== 'object' || Array.isArray(backs) || Object.keys(backs).some((key) => !['today', 'week', 'month'].includes(key))) throw new Error('Invalid preferences')
  for (const [unit, max] of [['today', 3660], ['week', 520], ['month', 1200]]) if (!Number.isInteger(backs[unit]) || backs[unit] < 0 || backs[unit] > max) throw new Error('Invalid calendar page')
  return { view, range, quiet, ...(zoom === undefined ? {} : { zoom }), backs: { today: backs.today, week: backs.week, month: backs.month } }
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
  const zoom = params.get('zoom') ?? '0'
  const width = params.get('width')
  if (!VIEWS.includes(view) || !RANGES.includes(range) || !/^(0|[1-9]\d{0,3})$/.test(raw) || !['0', '1'].includes(quiet) || !['0', '1'].includes(zoom)) throw new Error('Invalid selection')
  if (width !== null && (!/^[1-9]\d{2,3}$/.test(width) || Number(width) < WIDTH.min || Number(width) > WIDTH.max)) throw new Error('Invalid width')
  const back = Number(raw)
  if (back > (view === 'month' ? 1200 : view === 'today' ? 3660 : 520)) throw new Error('Page is too old')
  if ((view === 'live' || view === 'timelapse') && back) throw new Error('This view has no calendar pages')
  // Quiet is the Live tab's alone, as in the pane: elsewhere it draws nothing different, so it is not a selection of its own
  return {
    view, range: view === 'timelapse' ? range : 'week', back, ...(quiet === '1' && view === 'live' ? { quiet: true } : {}),
    ...(zoom === '1' ? { zoom: true } : {}), ...(width === null ? {} : { width: Number(width) }),
  }
}

export function dashboardSelectionParams(selection) {
  return new URLSearchParams(Object.entries(selection).map(([key, value]) => [key, key === 'quiet' || key === 'zoom' ? (value ? '1' : '0') : String(value)]))
}

/** What each tab shows, for a reader that cannot see it (the pane's own words, hooks/register.tsx TABS). */
const ALT = {
  live: "the live office of your coding agents in pixel art, floor by floor, one room per project, every desk and what it is doing, what they did this week in the basement, and today's commits on a train under it",
  today: 'today in pixel art, the time clock and the timesheets',
  week: 'this week in pixel art, the office tower',
  month: 'this month in pixel art, the wall calendar and the building directory',
  work: 'what they did in pixel art, one room per kind of work',
  timelapse: 'a timelapse in pixel art, every desk coming and going slot by slot, on a loop',
}
const PAST_ALT = { today: 'the time clock and the timesheets', week: 'the office tower', month: 'the wall calendar and the building directory', work: 'what they did, one room per kind of work' }

/**
 * The facts with every busy desk doing one and the same thing and no tool call counted: what changes with every tool
 * call (the pane's calmFacts). Two facts whose calm drawings match differ only in that.
 */
export function calmFacts(facts) {
  const desks = (facts.live?.desks ?? []).map((d) => (d.state === 'working' ? { ...d, activity: { kind: 'tools' } } : d))
  const projects = Array.isArray(facts.projects) ? facts.projects.map((p) => ({ ...p, tool_calls: 0, activity: {} })) : facts.projects
  return { ...facts, live: { ...facts.live, desks }, projects, totals: { ...facts.totals, tool_calls: 0, activity: {} } }
}

/** The moment a drawing's clocks are phased from: now, when the facts are of now; else the facts' own now. */
function anchorOf(facts, now) {
  const at = Date.parse(facts.now?.iso ?? '')
  if (Number.isFinite(now) && Number.isFinite(at) && now >= at - 60_000 && now <= at + 86_400_000) return now
  return Number.isFinite(at) ? at : undefined
}

/**
 * Shared pure renderers keep the browser's office identical to the other hosts' office: the pane's card, its Quiet and
 * its Zoom, at the width the page asks for. `previous` is the drawing the page shows of this selection: when the new
 * facts draw the same (its clocks phased as they were), or only change what busy desks are doing within ACTIVITY_MS,
 * it is handed back as it is, so a page never reloads a drawing (and restarts its walkers) for nothing.
 */
export async function renderDashboard(selection, { collectFacts = collect, previous = null, now = Date.now() } = {}) {
  const { view, range, back } = selection
  const lapse = view === 'timelapse'
  const options = lapse ? { view: 'all', range, timeline: true, novi: false } : { view: view === 'live' ? 'all' : view, back }
  let facts
  try { facts = await collectFacts({ ...options, series: true }) } catch {
    // The CLI makes the same recovery from a broken incremental cache.
    facts = await collectFacts({ ...options, series: true, resetCache: true })
  }
  if (!facts || facts.error) throw new Error('Could not read agent activity')
  const width = selection.width ?? WIDTH.default
  const scale = selection.zoom ? { scale: ZOOM_SCALE } : {}
  const status = renderStatus(facts, { width: 120 })
  const scene = facts.range?.back && PAST_ALT[view] ? `${facts.range.label} in pixel art, ${PAST_ALT[view]}` : ALT[view]
  const said = {
    text: toPlain(lapse ? renderTimelapseText(facts, { width: 100 }) : renderOffice(facts, { view, width: 100 })),
    label: facts.range?.label ?? 'The Office',
    status,
    alt: `The Office, ${scene}. Right now: ${status.replace(/^\S+ /u, '')}`,
    generatedAt: facts.generated_at ?? new Date().toISOString(),
    // today's date as the strip's calendar counts its pages (the pane's dayNow)
    today: /^\d{4}-\d\d-\d\d$/.test(facts.now?.local_date ?? '') ? facts.now.local_date : '',
    // Kept only by the server: exports use this exact revision, without sending raw session facts to the browser.
    facts,
  }
  if (lapse) {
    const svg = renderTimelapse(facts, { width, card: true, ...scale })
    return previous?.svg === svg ? previous : { svg, ...said }
  }
  const draw = (f, clockAt) => renderSvg(f, {
    view: view === 'live' ? 'all' : view, width, card: true, liveClock: true, ...(clockAt === undefined ? {} : { clockAt }),
    ...(selection.quiet === true ? { quiet: true } : {}), ...scale,
  })
  if (typeof previous?.plain === 'string' && previous.facts) {
    if (draw(facts, previous.clockAt) === previous.plain) return previous
    if (now - previous.at < ACTIVITY_MS) {
      previous.calm ??= draw(calmFacts(previous.facts), previous.clockAt)
      if (draw(calmFacts(facts), previous.clockAt) === previous.calm) return previous
    }
  }
  const clockAt = anchorOf(facts, now)
  const plain = draw(facts, clockAt)
  // on the beat as the pane puts it (lib/svg-beat.mjs): its animations aligned, so a browser repaints less
  return { svg: onBeat(plain), plain, clockAt, at: now, ...said }
}

/** Today's date here, YYYY-MM-DD, as the collector names a day. */
function localDate(at = new Date()) {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

/** What the server keeps of a drawing and never sends: the facts and what it compares the next facts against. */
const PRIVATE = new Set(['facts', 'plain', 'calm', 'clockAt', 'at', 'player'])
const publicOf = (version) => Object.fromEntries(Object.entries(version).filter(([key]) => !PRIVATE.has(key)))

/** The waiting room the pane shows while a tab's facts are read the first time (svg-loading.mjs), as a card. */
export function waitingDrawing(selection, { night = false } = {}) {
  const kind = selection.back ? 'past' : selection.view === 'today' ? 'today' : selection.view === 'month' ? 'month' : 'week'
  return onBeat(renderLoading(kind, { width: selection.width ?? WIDTH.default, card: true, night }), 'ld-')
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
 * While a page listens on /events, `watcher` (lib/dashboard-watch.mjs) looks at the agents' files and each change it
 * sees is pushed to the pages, which ask for their drawing again; the cached drawings of now are dropped at once.
 * `idleMs` (0: never) stops a server no page has listened to or asked anything of for that long.
 */
export async function startDashboard({ port = 0, renderer = renderDashboard, cacheMs = 5000, initialSelection = null, preferenceFile = path.join(defaultCacheDir(), 'dashboard-preferences.json'), hostTokens = [], hostParams = [], localhostAlias = false, stoppable = true, watcher = watchOffice, idleMs = 0 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535')
  if (!Number.isInteger(idleMs) || idleMs < 0) throw new Error('idleMs must be a whole number of milliseconds')
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
  let resolveClosed
  const whenClosed = new Promise((resolve) => { resolveClosed = resolve })
  // what changed since: a watcher's nudge moves it, and a drawing of now cached before it is not handed out again
  let generation = 0
  // the facts of now last read, whose folders and files the watcher looks at
  let latest = null
  const clients = new Set()
  let watching = null
  let ping = null
  let lastSeen = Date.now()
  let idle = null

  const snapshot = (selection) => {
    const key = JSON.stringify(selection)
    // a page of the past and a replay stay as they were read: no nudge drops them
    const isNow = selection.view !== 'timelapse' && !selection.back
    const gen = isNow ? generation : -1
    const saved = cache.get(key)
    if (saved && saved.gen === gen && Date.now() - saved.at < cacheMs) return Promise.resolve(saved.data)
    const job = `${gen}:${key}`
    if (pending.has(job)) return pending.get(job)
    if (pending.size >= MAX_PENDING) return Promise.reject(new Error('Busy'))
    const task = queue.then(async () => {
      if (closed) throw new Error('Closed')
      const kept = cache.get(key)?.data
      const previous = kept?.data ?? null
      const data = await renderer(selection, previous ? { previous } : {})
      if (isNow && data?.facts && !selection.back) latest = data.facts
      // the same drawing as the page shows: the same revision, kept fresh
      if (previous && data === previous) {
        cache.delete(key)
        cache.set(key, { at: Date.now(), gen, data: kept })
        return kept
      }
      if (!data || typeof data.svg !== 'string' || typeof data.text !== 'string') throw new Error('Invalid drawing')
      const revision = randomBytes(12).toString('base64url')
      const version = { ...data, revision }
      const response = httpRepresentation(JSON.stringify(publicOf(version)))
      versions.set(revision, { data: version, selection })
      while (versions.size > MAX_PENDING) versions.delete(versions.keys().next().value)
      cache.delete(key)
      const snapshot = { data: version, response }
      cache.set(key, { at: Date.now(), gen, data: snapshot })
      while (cache.size > MAX_PENDING) cache.delete(cache.keys().next().value)
      return snapshot
    })
    pending.set(job, task)
    queue = task.catch(() => {}).finally(() => pending.delete(job))
    return task
  }

  // ---- the event stream: a nudge to every listening page when the watcher sees the office move
  const broadcast = (event, data) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const res of clients) if (!res.destroyed) res.write(frame)
  }
  const changed = (why) => {
    generation++
    broadcast('change', { why })
  }
  const listen = (req, res, headers) => {
    res.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no' })
    res.write('retry: 3000\n\n')
    clients.add(res)
    req.socket.setTimeout(0)
    if (!watching && watcher) {
      watching = watcher({ onChange: changed, sources: () => ({ claudeDirs: claudeDirsOf(latest), others: othersOf(latest) }) })
    }
    ping ??= setInterval(() => { for (const client of clients) if (!client.destroyed) client.write(': ping\n\n') }, PING_MS)
    ping.unref?.()
    const leave = () => {
      if (!clients.delete(res)) return
      lastSeen = Date.now()
      if (clients.size) return
      watching?.stop()
      watching = null
      clearInterval(ping)
      ping = null
    }
    req.once('close', leave)
    res.once('close', leave)
  }

  // ---- the console's modules, read once, served to any page of this server (public code, no token: they name nothing)
  const modules = new Map(PAGE_MODULES.map((name) => [name, httpRepresentation(fs.readFileSync(path.join(LIB_DIR, name), 'utf8'))]))

  const server = http.createServer(async (req, res) => {
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}' 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'`,
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
      lastSeen = Date.now()
      const lib = /^\/lib\/([\w-]+\.mjs)$/.exec(url.pathname)?.[1]
      if (lib && url.origin === here && modules.has(lib) && !url.search) {
        if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'Method not allowed')
        return await sendHttpRepresentation(req, res, { ...headers, 'Content-Type': 'text/javascript; charset=utf-8' }, modules.get(lib))
      }
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
          // the page's own drawing, opaque and 960 px as `office.mjs timelapse --export` draws it, not the pane's card
          saved.data.player ??= renderTimelapse(saved.data.facts, { width: WIDTH.default })
          return send(200, renderTimelapsePage({ svg: saved.data.player, facts: saved.data.facts, scriptHash: scriptHash(PLAYER_JS) }), 'text/html; charset=utf-8', { 'Content-Security-Policy': exportCsp(PLAYER_JS) })
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
      if (url.pathname === '/events') {
        if (req.method !== 'GET') return send(405, 'Method not allowed')
        if ([...url.searchParams.keys()].some((key) => key !== 'token')) return send(400, 'Invalid query')
        if (closed) return send(503, 'The Office is closing')
        return listen(req, res, headers)
      }
      if (url.pathname === '/shutdown') {
        if (req.method !== 'POST') return send(405, 'Method not allowed')
        if (req.headers.origin !== here || [...url.searchParams.keys()].some((key) => key !== 'token')) return send(403, 'Forbidden')
        send(200, 'The Office is stopped')
        setImmediate(() => { close().catch(() => {}) })
        return
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'Method not allowed')
      if (url.pathname === '/') return send(200, dashboardPage({ nonce, selection, restore: !url.searchParams.has('view'), preferences: readPreferences(preferenceFile), stoppable, today: latest?.now?.local_date ?? localDate() }), 'text/html; charset=utf-8')
      if (url.pathname === '/waiting') {
        if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'Method not allowed')
        return send(200, waitingDrawing(selection, { night: latest?.now?.is_night === true }), 'image/svg+xml; charset=utf-8')
      }
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
    watching?.stop()
    watching = null
    clearInterval(ping)
    clearInterval(idle)
    // the pages are told, and their streams end: an open stream would hold the server open
    broadcast('bye', {})
    for (const res of clients) res.end()
    clients.clear()
    const stopped = new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
    server.closeIdleConnections()
    // a connection a client opened ahead and never used (browsers and fetch both do) is not idle to node, and would
    // hold the close until it times out: what is left after a moment, a last answer written, is dropped
    setTimeout(() => server.closeAllConnections(), 300).unref()
    closing = Promise.all([stopped, queue]).then(() => { cache.clear();versions.clear() })
    closing.then(resolveClosed, resolveClosed)
    return closing
  }
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, HOST, () => { server.off('error', reject); resolve() })
  })
  // the loopback address written out (HOST): the page is served on this computer only, never on a remote host
  origin = `http://127.0.0.1:${server.address().port}`
  origins = localhostAlias ? [origin, `http://localhost:${server.address().port}`] : [origin]
  if (idleMs) {
    idle = setInterval(() => { if (!clients.size && Date.now() - lastSeen >= idleMs) close().catch(() => {}) }, Math.min(idleMs, 60_000))
    idle.unref?.()
  }
  return {
    url: `${origin}/?token=${token}${initial ? `&${dashboardSelectionParams(initial)}` : ''}`,
    close,
    whenClosed,
    get isClosed() { return closed },
    get listeners() { return clients.size },
  }
}
