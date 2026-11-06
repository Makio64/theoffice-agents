import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { startDashboard, renderDashboard } from '../plugin/lib/dashboard.mjs'
import { monthStats } from '../plugin/lib/month-stats.mjs'
import { dashboardArgs, detachDashboard } from '../plugin/scripts/dashboard.mjs'
import { emptyFacts, monthFacts, timelapseFacts } from './helpers/facts.mjs'
import { fileURLToPath } from 'node:url'
import { permits } from './helpers/permits.mjs'

const drawing = (view = 'live') => ({ svg: `<svg xmlns="http://www.w3.org/2000/svg"><text>${view}</text></svg>`, text: `${view} text`, label: 'This week', status: 'Office empty', generatedAt: '2026-11-05T00:00:00Z' })
function endpoint(url, query = {}) {
  const target = new URL(url)
  target.pathname = '/snapshot'
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, String(value))
  return target
}
async function rawRequest(url, { host, origin, method = 'GET', requestPath } = {}) {
  const target = new URL(url)
  return new Promise((resolve, reject) => {
    const req = http.request(target, { method, path: requestPath ?? `${target.pathname}${target.search}`, headers: { ...(host ? { Host: host } : {}), ...(origin ? { Origin: origin } : {}) } }, (res) => {
      let body = ''
      res.setEncoding('utf8').on('data', (chunk) => { body += chunk }).on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }))
    })
    req.on('error', reject).end()
  })
}

test('the capability URL serves the dashboard and existing renderer outputs, with no external assets', async (t) => {
  const seen = []
  const app = await startDashboard({ renderer: async (selection) => { seen.push(selection);return drawing(selection.view) } })
  t.after(() => app.close())
  const page = await fetch(app.url)
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /What they did/)
  assert.match(html, /Timelapse/)
  assert.match(html, /Text version/)
  assert.doesNotMatch(html, /<(?:script|link|img)\b[^>]*(?:src|href)=/)
  const script = /<script nonce="[^"]+">([\s\S]*)<\/script>/.exec(html)[1]
  assert.doesNotThrow(() => new vm.Script(script))
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/)
  assert.doesNotMatch(page.headers.get('content-security-policy'), /frame-ancestors/)
  assert.equal(page.headers.get('x-frame-options'), null, 'the editor may embed this capability URL')
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(page.headers.get('access-control-allow-origin'), null)
  assert.equal(page.headers.get('cache-control'), 'no-store')
  const { revision, ...snapshot } = await (await fetch(endpoint(app.url, { view: 'today', back: 2 }))).json()
  assert.match(revision, /^[\w-]{16}$/)
  assert.deepEqual(snapshot, drawing('today'))
  assert.deepEqual(seen, [{ view: 'today', range: 'week', back: 2 }])
})

test('foreign origins, rebinding hosts, missing tokens, mutations and arbitrary queries are rejected before rendering', async (t) => {
  let calls = 0
  const app = await startDashboard({ renderer: async () => { calls++;return drawing() } })
  t.after(() => app.close())
  const target = endpoint(app.url)
  assert.equal((await rawRequest(target, { host: 'attacker.invalid' })).status, 403)
  assert.equal((await rawRequest(target, { origin: 'https://attacker.invalid' })).status, 403)
  assert.equal((await rawRequest(target, { requestPath: `http://attacker.invalid${target.pathname}${target.search}` })).status, 403)
  assert.equal((await fetch(new URL('/snapshot', app.url))).status, 403)
  assert.equal((await fetch(endpoint(app.url, { token: 'wrong' }))).status, 403)
  assert.equal((await rawRequest(target, { method: 'POST' })).status, 405)
  for (const query of [{ file: '/etc/passwd' }, { command: 'echo bad' }, { view: '../week' }, { view: 'unknown' }, { range: 'today' }, { back: '-1' }, { back: 'NaN' }, { back: '9999999' }, { back: '1;pwd' }, { view: 'live', back: 1 }]) {
    assert.equal((await fetch(endpoint(app.url, query))).status, 400, JSON.stringify(query))
  }
  const duplicate = endpoint(app.url);duplicate.searchParams.append('view', 'week');duplicate.searchParams.append('view', 'today')
  assert.equal((await fetch(duplicate)).status, 400)
  assert.equal((await fetch(new URL(`/unknown?${target.searchParams}`, app.url))).status, 404)
  assert.equal(calls, 0)
  assert.equal((await rawRequest(app.url, { method: 'HEAD' })).body, '')
})

test('concurrent requests share one render and different tabs never run collectors together', async (t) => {
  let release
  let announce
  const started = new Promise((resolve) => { announce = resolve })
  const gate = new Promise((resolve) => { release = resolve })
  let active = 0
  let maximum = 0
  const calls = []
  const app = await startDashboard({ renderer: async ({ view }) => {
    active++;maximum = Math.max(maximum, active);calls.push(view)
    if (view === 'live') { announce();await gate }
    active--;return drawing(view)
  } })
  t.after(() => app.close())
  const first = fetch(endpoint(app.url))
  await started
  const duplicate = fetch(endpoint(app.url))
  const other = fetch(endpoint(app.url, { view: 'month', back: 1 }))
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.deepEqual(calls, ['live'])
  release()
  const responses = await Promise.all([first, duplicate, other])
  for (const response of responses) assert.equal(response.status, 200)
  await Promise.all(responses.map((response) => response.json()))
  assert.equal(maximum, 1)
  assert.deepEqual(calls, ['live', 'month'])
  await (await fetch(endpoint(app.url))).json()
  assert.deepEqual(calls, ['live', 'month'], 'fresh snapshots are shared')
})

test('cached snapshots serialize once and gzip preserves the public drawing without caching private facts', async t => {
  let serializations = 0
  const data = { ...drawing(), svg: `<svg>${'<path d="M0 0h10v10z"/>'.repeat(1000)}</svg>`, facts: { secret: '/private/session' }, metadata: { toJSON() { serializations++;return 'same revision' } } }
  const app = await startDashboard({ renderer: async () => data })
  t.after(() => app.close())
  const target = endpoint(app.url)
  const plain = await (await fetch(target, { headers: { 'Accept-Encoding': 'identity' } })).json()
  const compressed = await new Promise((resolve, reject) => {
    const req = http.get(target, { headers: { 'Accept-Encoding': 'gzip' } }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk)).on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
  })
  assert.equal(serializations, 1, 'the fresh revision shares its serialized response across readers')
  assert.equal(compressed.headers['content-encoding'], 'gzip')
  assert.equal(compressed.headers['cache-control'], 'no-store')
  assert.equal(compressed.headers.etag, undefined)
  assert.deepEqual(JSON.parse(gunzipSync(compressed.body).toString()), plain)
  assert.equal(plain.svg, data.svg)
  assert.equal(plain.facts, undefined)
  assert.doesNotMatch(gunzipSync(compressed.body).toString(), /private\/session/)
})

test('a failed render returns a generic error and the next request can recover', async (t) => {
  let calls = 0
  const app = await startDashboard({ cacheMs: 0, renderer: async () => {
    if (++calls === 2) throw new Error('private session title and /private/path')
    return drawing()
  } })
  t.after(() => app.close())
  assert.equal((await fetch(endpoint(app.url))).status, 200)
  const failure = await fetch(endpoint(app.url))
  assert.equal(failure.status, 503)
  assert.doesNotMatch(await failure.text(), /private/)
  assert.equal((await fetch(endpoint(app.url))).status, 200)
})

test('all six views reuse the office renderers without collecting real machine activity', async () => {
  for (const view of ['live', 'today', 'week', 'month', 'work', 'timelapse']) {
    const options = []
    const result = await renderDashboard({ view, range: 'yesterday', back: 0 }, { collectFacts: async (opts) => { options.push(opts);return emptyFacts() } })
    assert.match(result.svg, /^<svg /, view)
    assert.equal(typeof result.text, 'string')
    assert.ok(result.text.length > 20)
    assert.ok(result.status)
    assert.equal(options.length, 1)
    if (view === 'timelapse') assert.deepEqual(options[0], { view: 'all', range: 'yesterday', timeline: true, novi: false, series: true })
    else assert.equal(options[0].view, view === 'live' ? 'all' : view)
  }
  let calls = 0
  await renderDashboard({ view: 'live', range: 'week', back: 0 }, { collectFacts: async (opts) => {
    if (++calls === 1) throw new Error('bad cache')
    assert.equal(opts.resetCache, true)
    return emptyFacts()
  } })
  assert.equal(calls, 2)
})

test('foreground startup prints the capability URL first and SIGTERM closes the server', async (t) => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../plugin/scripts/dashboard.mjs', import.meta.url)), '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] })
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill() })
  const url = await new Promise((resolve, reject) => {
    let stdout = ''
    const timer = setTimeout(() => reject(new Error('startup timed out')), 5000)
    child.stdout.on('data', (chunk) => { stdout += chunk;if (stdout.includes('\n')) { clearTimeout(timer);resolve(stdout.split('\n')[0]) } })
    child.once('error', reject)
  })
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+$/)
  assert.equal((await fetch(url)).status, 200)
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  // Windows has no SIGTERM to catch: the kill ends the process there, so only that it stopped is asked
  if (process.platform === 'win32') await exited
  else assert.deepEqual(await exited, [0, null])
  await assert.rejects(fetch(url))
})

test('detached startup reports readiness over IPC, releases the parent, and keeps a reachable server', async (t) => {
  const { url, pid } = await detachDashboard()
  t.after(() => { try { process.kill(pid, 'SIGTERM') } catch {} })
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+$/)
  assert.ok(Number.isInteger(pid))
  assert.equal((await fetch(url)).status, 200)
})

test('only a capability-protected same-origin POST can stop its own dashboard', async (t) => {
  const app = await startDashboard({ renderer: async () => drawing() })
  t.after(() => app.close())
  assert.equal(app.isClosed, false)
  const url = new URL(app.url);url.pathname = '/shutdown'
  assert.equal((await fetch(url)).status, 405)
  assert.equal((await fetch(url, { method: 'POST' })).status, 403)
  assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'https://attacker.invalid' } })).status, 403)
  assert.equal((await fetch(app.url)).status, 200, 'unauthorized attempts leave the dashboard running')
  assert.equal(app.isClosed, false)
  const response = await fetch(url, { method: 'POST', headers: { Origin: url.origin } })
  assert.equal(response.status, 200)
  assert.match(await response.text(), /stopped/)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(app.isClosed, true, 'the Stop route updates authoritative local state')
  await app.close()
  await assert.rejects(fetch(app.url))
})

test('the launcher rejects malformed ports and unsupported flags', () => {
  assert.deepEqual(dashboardArgs(['--port', '0', '--open', '--detach']), { port: 0, open: true, detach: true, child: false })
  for (const args of [['--port'], ['--port', '1;echo'], ['--port', '-1'], ['--port', '65536'], ['--host', '0.0.0.0'], ['--child']]) assert.throws(() => dashboardArgs(args))
})

test('explicit start views, calendar pages and quiet mode survive detached startup', async (t) => {
  const options = dashboardArgs(['--view', 'month', '--back', '2'])
  assert.deepEqual(options.selection, { view: 'month', range: 'week', back: 2 })
  assert.deepEqual(dashboardArgs(['--view', 'timelapse', '--range', 'yesterday']).selection, { view: 'timelapse', range: 'yesterday', back: 0 })
  assert.equal(dashboardArgs(['--quiet']).selection.quiet, true)
  for (const args of [['--view'], ['--view', '../month'], ['--view', 'month', '--back', '-1'], ['--back', '1'], ['--range', 'today']]) assert.throws(() => dashboardArgs(args))
  const { url, pid } = await detachDashboard(0, options.selection)
  t.after(() => { try { process.kill(pid, 'SIGTERM') } catch {} })
  const parsed = new URL(url)
  assert.equal(parsed.searchParams.get('view'), 'month')
  assert.equal(parsed.searchParams.get('back'), '2')
  assert.equal((await fetch(url)).status, 200)
})

function versionUrl(url, route, revision, extra = {}) {
  const target = new URL(url)
  target.pathname = route
  target.searchParams.set('revision', revision)
  for (const [key, value] of Object.entries(extra)) target.searchParams.set(key, value)
  return target
}
function assertPlayerPolicy(response, html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  assert.equal(scripts.length, 1)
  const hash = createHash('sha256').update(scripts[0][1]).digest('base64')
  assert.ok(response.headers.get('content-security-policy').includes(`'sha256-${hash}'`), 'HTTP policy permits the exact existing player script')
  assert.match(response.headers.get('content-security-policy'), /img-src blob: data:/)
  assert.match(response.headers.get('content-security-policy'), /media-src blob:/)
}

test('month exports keep the visible revision, crop rooms, and never expose source facts or arbitrary files', async (t) => {
  const firstFacts = monthFacts()
  firstFacts.sources = { privateTranscript: '/private/session/transcript.jsonl' }
  let facts = firstFacts
  let calls = 0
  const app = await startDashboard({ cacheMs: 0, renderer: async (selection) => {
    calls++
    return renderDashboard(selection, { collectFacts: async () => facts })
  } })
  t.after(() => app.close())
  const first = await (await fetch(endpoint(app.url, { view: 'month', back: 1 }))).json()
  assert.equal(first.facts, undefined)
  assert.doesNotMatch(JSON.stringify(first), /privateTranscript|\/private\/session/)
  const exportUrl = (extra = {}) => versionUrl(app.url, '/export', first.revision, extra)
  const json = await fetch(exportUrl({ part: 'stats', format: 'json' }))
  assert.equal(json.status, 200)
  assert.match(json.headers.get('content-disposition'), /^attachment; filename="theoffice-month-[\w-]+-stats\.json"$/)
  assert.deepEqual(await json.json(), monthStats(firstFacts))
  facts = { ...monthFacts(), totals: { ...monthFacts().totals, agent_minutes: 999999 } }
  const newer = await (await fetch(endpoint(app.url, { view: 'month', back: 1 }))).json()
  assert.notEqual(newer.revision, first.revision)
  const original = await (await fetch(exportUrl({ part: 'stats', format: 'json' }))).json()
  assert.equal(original.totals.agent_minutes, firstFacts.totals.agent_minutes)
  assert.notEqual(original.totals.agent_minutes, facts.totals.agent_minutes)
  const csv = await fetch(exportUrl({ part: 'stats', format: 'csv' }))
  assert.match(csv.headers.get('content-type'), /^text\/csv/)
  assert.match(await csv.text(), /date,weekday,agent_hours/)
  for (const part of ['calendar', 'directory', 'whole']) {
    const svg = await fetch(exportUrl({ part, format: 'svg' }))
    assert.equal(svg.status, 200, part)
    assert.match(svg.headers.get('content-type'), /^image\/svg\+xml/)
    const markup = await svg.text()
    assert.match(markup, /^<svg /)
    assert.match(svg.headers.get('content-disposition'), /\.svg"$/)
    const page = await fetch(exportUrl({ part, format: 'html' }))
    const html = await page.text()
    assert.equal(page.status, 200)
    assert.match(html, /Save PNG/)
    assert.match(html, /Save GIF/)
    assert.match(html, /Save video/)
    assertPlayerPolicy(page, html)
  }
  for (const query of [{ part: '../secrets' }, { format: 'exe' }, { file: '/etc/passwd' }, { command: 'cat /etc/passwd' }, { part: 'stats', format: 'gif' }]) assert.equal((await fetch(exportUrl(query))).status, 400)
  assert.equal((await fetch(versionUrl(app.url, '/export', 'abcdefghijklmnop'))).status, 410)
  const withoutToken = exportUrl();withoutToken.searchParams.delete('token')
  assert.equal((await fetch(withoutToken)).status, 403)
  assert.equal((await fetch(exportUrl(), { method: 'POST' })).status, 405)
  assert.equal(calls, 2, 'exports reuse retained facts without collecting again')
})

test('the timelapse route serves the existing scrubber, speed controls and GIF/video/SVG exporter', async (t) => {
  const app = await startDashboard({ renderer: (selection) => renderDashboard(selection, { collectFacts: async () => timelapseFacts('week') }) })
  t.after(() => app.close())
  const snapshot = await (await fetch(endpoint(app.url, { view: 'timelapse', range: 'week' }))).json()
  const response = await fetch(versionUrl(app.url, '/player', snapshot.revision))
  assert.equal(response.status, 200)
  const html = await response.text()
  for (const element of ['tl-play', 'tl-scrub', 'tl-gif', 'tl-video', 'tl-svg']) assert.ok(html.includes(`id="${element}"`))
  assertPlayerPolicy(response, html)
  assert.equal((await fetch(versionUrl(app.url, '/player', snapshot.revision, { file: '/etc/passwd' }))).status, 400)
  assert.equal((await fetch(versionUrl(app.url, '/export', snapshot.revision, { part: 'stats', format: 'json' }))).status, 400)
})

test('native pane preferences survive a changed server port in private cache storage', async (t) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-preferences-'))
  const preferenceFile = path.join(folder, 'private', 'dashboard-preferences.json')
  let app = await startDashboard({ preferenceFile, renderer: async () => drawing() })
  t.after(async () => { await app.close();fs.rmSync(folder, { recursive: true, force: true }) })
  const target = new URL(app.url);target.pathname = '/preferences'
  const preferences = { view: 'month', range: 'yesterday', quiet: true, backs: { today: 3, week: 1, month: 2 } }
  assert.equal(await (await fetch(target)).json(), null)
  assert.equal((await fetch(target, { method: 'POST', body: JSON.stringify(preferences) })).status, 403)
  assert.equal(fs.existsSync(preferenceFile), false)
  const post = (body, url = target) => fetch(url, { method: 'POST', headers: { Origin: url.origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal((await post(preferences)).status, 200)
  assert.equal(permits(path.dirname(preferenceFile), 0o700), 0o700)
  assert.equal(permits(preferenceFile, 0o600), 0o600)
  assert.deepEqual(JSON.parse(fs.readFileSync(preferenceFile, 'utf8')), preferences)
  for (const invalid of [{ ...preferences, command: 'pwd' }, { ...preferences, file: '/etc/passwd' }, { ...preferences, view: '../month' }, { ...preferences, backs: { today: -1, week: 0, month: 0 } }, { ...preferences, quiet: 'yes' }, { ...preferences, filler: 'x'.repeat(5000) }]) assert.equal((await post(invalid)).status, 400)
  const arbitrary = new URL(target);arbitrary.searchParams.set('file', '/etc/passwd')
  assert.equal((await post(preferences, arbitrary)).status, 400)
  await app.close()
  app = await startDashboard({ preferenceFile, renderer: async () => drawing() })
  const restored = new URL(app.url);restored.pathname = '/preferences'
  assert.deepEqual(await (await fetch(restored)).json(), preferences)
})
