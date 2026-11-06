// Local-only host for the alternative WebGPU office. Only the capability API reads activity.
import http from 'node:http'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { collect } from './collect.mjs'
import { AGENT_IDS, CAST } from './cast.mjs'
import { safeText, redact } from './format.mjs'
import { KINDS, jobTitle } from './activity.mjs'
import { ROLE_HEX, cropTimeline, deskClass, projectSlots } from './model.mjs'
import { deskWords } from './voxel-model.mjs'
import { httpRepresentation, sendHttpRepresentation } from './http-response.mjs'

const HOST = '127.0.0.1'
// the built voxel app: beside lib/ in a package (dist/voxel), two folders up in this repository (plugin/lib, dist/voxel)
const DEFAULT_DIRECTORY = [new URL('../dist/voxel/', import.meta.url), new URL('../../dist/voxel/', import.meta.url)].map((url) => fileURLToPath(url)).find((dir) => existsSync(path.join(dir, 'index.html'))) ?? fileURLToPath(new URL('../dist/voxel/', import.meta.url))
// A project wears the same color here as in the pixel office: its palette slot (model.mjs projectSlots) in the 2D roles.
const PROJECT_COLORS = Array.from({ length: 8 }, (_, slot) => ROLE_HEX[`p${slot}`].dark)
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' }
const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0
const whole = value => Math.floor(number(value))
const text = (value, limit = 180) => redact(safeText(String(value ?? ''))).slice(0, limit)
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const agentId = value => AGENT_IDS.includes(value) ? value : 'claude'
const list = value => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : []
function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const time = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 10) === value
}
function deskStatus(desk) {
  if (['asking', 'needs_input', 'awaiting_approval'].includes(desk.state) || desk.status === 'waiting') return 'waiting'
  if (desk.idle_reason === 'done' || desk.state === 'done' || desk.status === 'done') return 'done'
  if (desk.status === 'busy' || ['working', 'waiting_on_agents'].includes(desk.state)) return 'working'
  return 'idle'
}

/** The views the voxel office draws, as the pixel office's tabs, and the bounds of their calendar pages (lib/dashboard.mjs). */
export const VOXEL_VIEWS = Object.freeze(['live', 'today', 'week', 'month', 'work', 'timelapse'])
export const LAPSE_RANGES = Object.freeze(['yesterday', 'week', 'month'])
const BACK_LIMIT = { today: 3660, week: 520, month: 1200, work: 520 }

/** A snapshot request's view, page and replay range, from its query: anything else is refused before it reaches the collector. */
export function voxelSelection(params) {
  const view = params.get('view') ?? 'live'
  if (!VOXEL_VIEWS.includes(view)) throw new Error('Invalid view')
  const raw = params.get('back')
  if (raw != null && (!/^(0|[1-9]\d{0,3})$/.test(raw) || !(view in BACK_LIMIT) || Number(raw) > BACK_LIMIT[view])) throw new Error('Invalid page')
  const range = params.get('range')
  if (range != null && (view !== 'timelapse' || !LAPSE_RANGES.includes(range))) throw new Error('Invalid range')
  return { view, back: raw == null ? 0 : Number(raw), range: view === 'timelapse' ? range ?? 'week' : null }
}

/** What the collector is asked for each view: the live building reads the week as the pixel office's Live tab does. */
export function voxelCollectOptions({ view = 'live', back = 0, range = 'week' } = {}) {
  if (view === 'timelapse') return { view: 'all', range, timeline: true, series: true, novi: false }
  if (view === 'live') return { view: 'all', series: true, novi: false }
  return { view, series: true, novi: false, ...(back ? { back } : {}) }
}

const WORK_LABELS = { coding: 'Writing code', reading: 'Reading code', terminal: 'Terminal commands', testing: 'Tests', web: 'Web research', delegating: 'Delegation', planning: 'Planning', talking: 'Questions and messages', design: 'Design', tools: 'Other tools' }
const workRows = activity => KINDS.map(kind => ({ kind, label: WORK_LABELS[kind], calls: number(activity?.[kind]) }))
const countFields = value => ({
  toolCalls: number(value?.tool_calls), filesEdited: number(value?.files_edited), additions: number(value?.additions), deletions: number(value?.deletions),
  prompts: number(value?.prompts), workflows: number(value?.workflows), subagents: number(value?.subagents),
})
function crewRows(minutes, agents, accounts = []) {
  const measured = minutes && typeof minutes === 'object' && !Array.isArray(minutes)
  const rows = Array.isArray(accounts) ? accounts.slice(0, 100) : []
  return AGENT_IDS.map(agent => {
    const matching = rows.filter(row => row.agent === agent)
    const live = agents.filter(row => row.agent === agent).length
    return {
      agent, name: CAST[agent].who, label: CAST[agent].name, color: CAST[agent].hex.dark,
      minutes: measured ? number(minutes[agent]) : matching.length ? matching.reduce((sum, row) => sum + number(row.minutes), 0) : null,
      sessions: matching.length ? matching.reduce((sum, row) => sum + number(row.sessions), 0) : null, live,
    }
  }).filter(row => row.minutes > 0 || row.sessions > 0 || row.live > 0).sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0) || b.live - a.live)
}
function liveCounts(agents) {
  return { desks: agents.length, working: agents.filter(a => a.status === 'working').length, waiting: agents.filter(a => a.status === 'waiting').length,
    idle: agents.filter(a => a.status === 'idle').length, done: agents.filter(a => a.status === 'done').length,
    interns: agents.reduce((sum, agent) => sum + agent.interns.length, 0), meetings: agents.reduce((sum, agent) => sum + agent.meetings.length, 0) }
}
function dayRows(days, dates) {
  return dates.map(date => ({ date, minutes: number(days?.[date]?.minutes), commits: number(days?.[date]?.commits), sessions: number(days?.[date]?.sessions),
    subagents: number(days?.[date]?.subagents), prompts: number(days?.[date]?.prompts) }))
}
function recentCommits(project) {
  return (Array.isArray(project.top_commits) ? project.top_commits : []).slice(0, 20).map(commit => ({ sha: text(commit.sha, 80), subject: text(commit.subject), time: validTime(commit.time) }))
    .sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0))
}

const cleanWords = ({ doing, words, clock }) => ({ doing: text(doing), words: text(words, 80), clock })

/** The replay's timeline cut to where something happened (model.mjs cropTimeline), bounded and scrubbed for the browser. */
function lapseTimeline(timeline) {
  if (!timeline || typeof timeline !== 'object') return null
  const t = cropTimeline(timeline)
  const slots = Math.min(whole(t.slots), 24 * 4 * 2 + 31 * 6)
  const slot = value => Math.min(slots, whole(value))
  const pairs = runs => list(runs.map?.(run => Array.isArray(run) ? { a: slot(run[0]), b: slot(run[1]) } : null) ?? []).filter(run => run.b > run.a).slice(0, 400).map(run => [run.a, run.b])
  const points = values => (Array.isArray(values) ? values : []).filter(Array.isArray).slice(0, 400).map(point => [slot(point[0]), Math.min(99, whole(point[1]))])
  return {
    kind: LAPSE_RANGES.includes(t.kind) ? t.kind : 'week', label: text(t.label, 100), days: (Array.isArray(t.days) ? t.days : []).filter(validDay).slice(0, 62),
    slotMinutes: Math.max(1, whole(t.slot_min) || 60), perDay: Math.max(1, whole(t.per_day) || 24), slots, start: whole(t.start), more: whole(t.more),
    desks: list(t.desks).slice(0, 600).map((desk, index) => ({ id: text(desk.id ?? `lapse-${index}`, 60), project: text(desk.project || 'Unassigned', 100), agent: agentId(desk.agent),
      title: text(desk.title, 80), account: text(desk.account, 40) || null, runs: pairs(Array.isArray(desk.runs) ? desk.runs : []), interns: points(desk.interns) })),
    meetings: list(t.meetings).slice(0, 300).map(meeting => ({ project: text(meeting.project || 'Unassigned', 100), name: text(meeting.name, 80), from: slot(meeting.from), to: slot(meeting.to), agents: Math.min(99, whole(meeting.agents)) })).filter(meeting => meeting.to > meeting.from),
    commits: list(t.commits).slice(0, 3000).map(commit => ({ project: text(commit.project || 'Unassigned', 100), slot: slot(commit.slot), n: Math.min(9999, whole(commit.n)) })).filter(commit => commit.n > 0),
  }
}

/** The browser gets a bounded presentation model, never transcript paths, account homes or raw tool inputs. */
export function normalizeVoxelFacts(facts = {}, { view = 'live' } = {}) {
  const generatedAt = validTime(facts.generated_at) ?? validTime(facts.now?.iso) ?? new Date().toISOString()
  const nowMs = Date.parse(validTime(facts.now?.iso) ?? generatedAt)
  const recordedDays = Object.keys(facts.per_day ?? {}).filter(validDay).sort()
  const rangeDays = Array.isArray(facts.range?.days) ? facts.range.days.filter(validDay) : []
  const lastDay = rangeDays.at(-1) ?? (validDay(facts.now?.local_date) ? facts.now.local_date : null) ?? recordedDays.at(-1) ?? generatedAt.slice(0, 10)
  const lastTime = Date.parse(`${lastDay}T00:00:00Z`)
  const dates = Array.from({ length: 7 }, (_, index) => new Date(lastTime - (6 - index) * 86_400_000).toISOString().slice(0, 10))
  // Every day of the page (a month page runs up to two calendar months), oldest first
  const pageDays = (rangeDays.length ? [...new Set(rangeDays)].sort() : dates).slice(-62)
  const desks = Array.isArray(facts.live?.desks) ? facts.live.desks.slice(0, 250) : []
  const agents = desks.map((desk, index) => {
    const agent = agentId(desk.agent), status = deskStatus(desk), since = validTime(desk.activity?.since)
    const label = text(desk.activity?.label), tool = text(desk.activity?.tool, 100) || null
    const interns = (Array.isArray(desk.interns) ? desk.interns : []).slice(0, 24).map(intern => ({ id: text(intern?.id, 100), type: text(intern?.type, 80), job: jobTitle(intern?.type), description: text(intern?.description) }))
    const meetings = (Array.isArray(desk.meetings) ? desk.meetings : []).slice(0, 12).map(meeting => ({ id: text(meeting?.id, 100), name: text(meeting?.name, 100), phase: text(meeting?.phase, 80),
      running: number(meeting?.agents_running), done: number(meeting?.agents_done), failed: number(meeting?.agents_failed), total: number(meeting?.agents_total),
      labels: (Array.isArray(meeting?.labels) ? meeting.labels : []).slice(0, 8).map(item => text(item, 60)) }))
    const kind = deskClass({ state: desk.state, idle_reason: desk.idle_reason, activity: { since: desk.activity?.since, kind: desk.activity?.kind }, last_seen: desk.last_seen }, nowMs)
    const startedAt = validTime(desk.started_at), lastSeen = validTime(desk.last_seen)
    return {
      id: text(desk.id ?? `desk-${index}`, 100), name: CAST[agent].who, agent,
      project: text(desk.project || 'Unassigned', 100), status, kind,
      task: label || text(desk.title || desk.activity?.kind || 'Session open'), color: CAST[agent].hex.light,
      // A session's age and time in a state are not measured active time.
      minutes: number(desk.agent_minutes ?? desk.minutes), minutesAvailable: desk.agent_minutes != null || desk.minutes != null,
      title: text(desk.title), updatedAt: lastSeen, state: text(desk.state, 60), activityKind: text(desk.activity?.kind, 40), tool, since, startedAt,
      elapsedMinutes: since ? Math.max(0, Math.floor((Date.parse(generatedAt) - Date.parse(since)) / 60_000)) : null,
      elapsedLabel: 'Time in current state', question: status === 'waiting' && tool === 'AskUserQuestion' ? label || null : null,
      waitingReason: status === 'waiting' ? label || null : null, idleReason: text(desk.idle_reason, 60) || null,
      branch: text(desk.branch, 100) || null, model: text(desk.model, 100) || null, account: text(desk.account, 60) || null,
      interns, meetings,
      ...cleanWords(deskWords(kind, { label, tool, activityKind: text(desk.activity?.kind, 40), idleReason: text(desk.idle_reason, 60), interns, meetings, startedAt, since, lastSeen })),
    }
  })
  // Project names are scrubbed once, then matched against the already scrubbed desk names.
  // Re-running text() inside a project × desk filter repeated every secret-scrubbing regex.
  const agentsByProject = new Map()
  for (const agent of agents) {
    const group = agentsByProject.get(agent.project)
    if (group) group.push(agent)
    else agentsByProject.set(agent.project, [agent])
  }
  const rawProjects = (Array.isArray(facts.projects) ? facts.projects : []).slice(0, 200)
  const projectNames = rawProjects.map(project => text(project?.name || 'Unassigned', 100))
  const left = list(facts.live?.recently_left).slice(0, 12).map(entry => ({ title: text(entry.title, 80), project: text(entry.project || 'Unassigned', 100), agent: agentId(entry.agent), leftAt: validTime(entry.left_at) }))
  // The palette slots in the pixel office's order: the live desks, then the projects, then the coat rack
  const slots = projectSlots([...agents.map(agent => agent.project), ...projectNames, ...left.map(entry => entry.project)])
  const colorOf = name => PROJECT_COLORS[slots.get(name) ?? 0]
  const projects = rawProjects.map((project, index) => {
    const name = projectNames[index]
    const projectAgents = agentsByProject.get(name) ?? []
    return {
      name, color: colorOf(name),
      minutes: number(project.agent_minutes), commits: number(project.commits), sessions: number(project.sessions), ...countFields(project),
      daily: dates.map(date => number(project.per_day?.[date]?.minutes)), hourly: Array.from({ length: 24 }, (_, hour) => number(project.per_hour?.[hour])), dailyDates: [...dates],
      days: pageDays.map(date => number(project.per_day?.[date]?.minutes)), dayCommits: pageDays.map(date => number(project.per_day?.[date]?.commits)),
      dayStats: dayRows(project.per_day, dates), work: workRows(project.activity), crew: crewRows(project.agents, projectAgents), live: liveCounts(projectAgents),
      recentCommits: recentCommits(project), titles: (Array.isArray(project.titles) ? project.titles : []).slice(0, 12).map(title => text(title)),
    }
  })
  const activity = agents.map(agent => ({ id: `session-${agent.id}`, agent: agent.agent, project: agent.project,
    text: agent.task, status: agent.status, kind: agent.activityKind || 'session', sessionId: agent.id, time: agent.updatedAt ?? agent.since,
  })).filter(item => item.time)
  for (const project of projects) {
    for (const commit of project.recentCommits) if (commit.time) activity.push({ id: `commit-${project.name}-${commit.sha}`, agent: null, project: project.name, text: commit.subject, time: commit.time, status: 'done', kind: 'commit' })
  }
  activity.sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
  const live = liveCounts(agents)
  const jobs = new Map()
  for (const [type, count] of Object.entries(facts.totals?.intern_types ?? {})) jobs.set(jobTitle(type), (jobs.get(jobTitle(type)) ?? 0) + whole(count))
  const now = facts.now ?? {}
  const hour = Number.isInteger(now.hour) && now.hour >= 0 && now.hour < 24 ? now.hour : new Date(nowMs).getUTCHours()
  const today = validDay(now.local_date) ? now.local_date : generatedAt.slice(0, 10)
  return {
    source: 'local', view: VOXEL_VIEWS.includes(view) ? view : 'live', generatedAt, agents, projects,
    totals: { minutes: number(facts.totals?.agent_minutes), commits: number(facts.totals?.commits), sessions: number(facts.totals?.sessions), ...countFields(facts.totals),
      projects: facts.totals?.projects != null ? number(facts.totals.projects) : projects.length, interns: number(facts.live?.counts?.interns ?? live.interns),
      working: live.working, waiting: live.waiting, idle: live.idle, done: live.done },
    work: workRows(facts.totals?.activity), crew: crewRows(facts.totals?.agents, agents, facts.accounts), live,
    activity: activity.slice(0, 60), hourly: Array.from({ length: 24 }, (_, hour) => number(facts.per_hour?.[hour])),
    daily: dates.map(day => number(facts.per_day?.[day]?.minutes)), dayStats: dayRows(facts.per_day, dates),
    dailyDates: dates, range: text(facts.range?.label || 'This week', 100), projectsMore: number(facts.projects_more),
    // What the views beyond the live floor read: the page, the clock, every day of the page, the coat rack and the interns' jobs
    now: { date: today, time: /^\d\d:\d\d$/.test(now.local_time ?? '') ? now.local_time : null, hour, night: typeof now.is_night === 'boolean' ? now.is_night : hour >= 20 || hour < 7, weekday: text(now.weekday, 12) || null },
    period: { kind: text(facts.range?.kind || 'week', 20), label: text(facts.range?.label || 'This week', 100), days: pageDays, back: whole(facts.range?.back), past: pageDays.at(-1) < today },
    days: dayRows(facts.per_day, pageDays).map(row => ({ ...row, workflows: number(facts.per_day?.[row.date]?.workflows) })),
    left, visitors: list(facts.contractors).filter(entry => entry.live).slice(0, 8).map(entry => ({ tool: text(entry.tool, 40), project: text(entry.project, 100), title: text(entry.title, 80) })),
    interns: [...jobs].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([job, n]) => ({ job, n })),
    timeline: view === 'timelapse' ? lapseTimeline(facts.timeline) : null,
  }
}
function authorized(actual, token) { const a = Buffer.from(actual ?? ''); const b = Buffer.from(token); return a.length === b.length && timingSafeEqual(a, b) }

export async function startVoxelDashboard({ port = 0, directory = DEFAULT_DIRECTORY, collectFacts = collect, cacheMs = 5000, demo = false, view = null } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535')
  const root = await fs.realpath(directory).catch(() => { throw new Error('Build the voxel office first: npm run build:voxel') })
  await fs.access(path.join(root, 'index.html')).catch(() => { throw new Error('Build the voxel office first: npm run build:voxel') })
  const token = randomBytes(24).toString('base64url')
  // Bounded per-host asset cache; metadata and real paths are checked before every reuse.
  const assets = new Map()
  let assetBytes = 0
  let origin, closing, closed = false
  // One answer per view and page. A page of the past never changes, so it is kept ten minutes; collections never overlap,
  // since every view shares the collector's incremental cache (lib/dashboard.mjs serializes its renders the same way).
  const cache = new Map(), pending = new Map()
  let queue = Promise.resolve()
  const snapshot = selection => {
    const key = `${selection.view}:${selection.back}:${selection.range ?? ''}`
    const hit = cache.get(key), ttl = selection.back > 0 ? Math.max(cacheMs, 600_000) : cacheMs
    if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value)
    if (pending.has(key)) return pending.get(key)
    const options = voxelCollectOptions(selection)
    const run = queue.then(async () => {
      let facts
      try { facts = await collectFacts(options) }
      catch { facts = await collectFacts({ ...options, resetCache: true }) }
      if (!facts || facts.error) throw new Error('Collection failed')
      const value = httpRepresentation(JSON.stringify(normalizeVoxelFacts(facts, { view: selection.view })))
      cache.delete(key); cache.set(key, { at: Date.now(), value })
      while (cache.size > 8) cache.delete(cache.keys().next().value)
      return value
    }).finally(() => { pending.delete(key) })
    queue = run.catch(() => {})
    pending.set(key, run)
    return run
  }
  const server = http.createServer(async (req, res) => {
    const headers = {
      'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'",
    }
    const send = (status, body, type = 'text/plain; charset=utf-8') => { if (!res.destroyed) res.writeHead(status, { ...headers, 'Content-Type': type }).end(req.method === 'HEAD' ? undefined : body) }
    try {
      if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) return send(403, 'Forbidden')
      const url = new URL(req.url, origin)
      if (url.origin !== origin) return send(403, 'Forbidden')
      // A VSCode webview embeds the capability page from another origin; its navigation is allowed.
      // Only the data and shutdown endpoints reject cross-site fetches.
      if (['/api/snapshot', '/shutdown'].includes(url.pathname) && req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return send(403, 'Forbidden')
      const protectedRoute = ['/', '/index.html', '/api/snapshot', '/shutdown'].includes(url.pathname)
      if (protectedRoute && !authorized(url.searchParams.get('token'), token)) return send(403, 'Forbidden')
      const page = url.pathname === '/' || url.pathname === '/index.html'
      const allowedKeys = page ? ['token', 'mode', 'view'] : url.pathname === '/api/snapshot' ? ['token', 'view', 'back', 'range'] : ['token']
      for (const key of url.searchParams.keys()) if (!allowedKeys.includes(key) || url.searchParams.getAll(key).length !== 1) return send(400, 'Invalid query')
      // the page may open on a tab (the editor's and the launcher's links), never on anything else
      if (page && url.searchParams.has('view') && !VOXEL_VIEWS.includes(url.searchParams.get('view'))) return send(400, 'Invalid query')
      let selection
      if (url.pathname === '/api/snapshot') {
        try { selection = voxelSelection(url.searchParams) } catch { return send(400, 'Invalid query') }
      }
      if (url.pathname === '/shutdown') {
        if (req.method !== 'POST') return send(405, 'Method not allowed')
        if (req.headers.origin !== origin) return send(403, 'Forbidden')
        send(200, 'The voxel office is stopped')
        setImmediate(() => { close().catch(() => {}) })
        return
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'Method not allowed')
      if (url.pathname === '/api/snapshot') {
        if (closed) return send(503, JSON.stringify({ error: 'The voxel office is closing' }), TYPES['.json'])
        try { return await sendHttpRepresentation(req, res, { ...headers, 'Content-Type': TYPES['.json'] }, await snapshot(selection)) }
        catch { return send(503, JSON.stringify({ error: 'Could not refresh local activity. Try again in a moment.' }), TYPES['.json']) }
      }
      const decoded = decodeURIComponent(url.pathname)
      if (decoded.includes('\0') || decoded.includes('\\')) return send(404, 'Not found')
      const candidate = path.resolve(root, `.${decoded === '/' ? '/index.html' : decoded}`)
      if (!candidate.startsWith(`${root}${path.sep}`)) return send(404, 'Not found')
      let file
      try { file = await fs.realpath(candidate) } catch { return send(404, 'Not found') }
      if (!file.startsWith(`${root}${path.sep}`)) return send(404, 'Not found')
      try {
        const stat = await fs.stat(file)
        if (!stat.isFile()) return send(404, 'Not found')
        const stamp = `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`
        const assetKey = `${protectedRoute ? 'page' : 'asset'}:${file}`
        let asset = assets.get(assetKey)
        if (!asset || asset.stamp !== stamp) {
          if (asset) { assets.delete(assetKey); assetBytes -= asset.response.plain.length }
          const type = TYPES[path.extname(file)] ?? 'application/octet-stream'
          asset = { stamp, type, response: httpRepresentation(await fs.readFile(file), { compressible: /^(text\/|application\/(javascript|json)|image\/svg\+xml)/.test(type), etag: !protectedRoute }) }
          // Keep large arbitrary files out of memory while retaining the compiled UI bundles.
          if (asset.response.plain.length <= 8 * 1024 * 1024) {
            // Another reader may have completed the same asynchronous read while this one waited.
            if (assets.has(assetKey)) assetBytes -= assets.get(assetKey).response.plain.length
            assets.set(assetKey, asset); assetBytes += asset.response.plain.length
            while (assets.size > 32 || assetBytes > 16 * 1024 * 1024) {
              const oldest = assets.keys().next().value
              assetBytes -= assets.get(oldest).response.plain.length; assets.delete(oldest)
            }
          }
        } else { assets.delete(assetKey); assets.set(assetKey, asset) }
        return await sendHttpRepresentation(req, res, { ...headers, ...(!protectedRoute ? { 'Cache-Control': 'private, no-cache' } : {}), 'Content-Type': asset.type }, asset.response)
      }
      catch { return send(404, 'Not found') }
    } catch { return send(400, 'Invalid request') }
  })
  server.requestTimeout = 600_000
  server.headersTimeout = 10_000
  const close = () => {
    if (closing) return closing
    closed = true
    const stopped = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    server.closeIdleConnections()
    closing = Promise.all([stopped, ...[...pending.values()].map(run => run.catch(() => {}))]).then(() => { cache.clear(); assets.clear(); assetBytes = 0 })
    return closing
  }
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, HOST, () => { server.off('error', reject); resolve() }) })
  // the loopback address written out (HOST): the page is served on this computer only, never on a remote host
  origin = `http://127.0.0.1:${server.address().port}`
  return { url: `${origin}/?token=${token}${demo ? '&mode=demo' : ''}${VOXEL_VIEWS.includes(view) && view !== 'live' ? `&view=${view}` : ''}`, close }
}
