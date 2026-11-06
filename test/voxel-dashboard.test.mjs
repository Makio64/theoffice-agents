import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { gunzipSync } from 'node:zlib'
import { normalizeVoxelFacts, startVoxelDashboard } from '../plugin/lib/voxel-dashboard.mjs'
import { voxelArgs } from '../plugin/scripts/voxel.mjs'

function fixture() {
  return {
    generated_at: '2026-11-05T00:00:00Z', range: { label: 'This week' },
    live: { desks: [
      { id: 'one', agent: 'codex', project: 'app', title: 'Build the page', status: 'busy', state: 'working', activity: { label: 'index.js' }, last_seen: '2026-11-04T23:59:00Z', started_at: '2026-11-01T00:00:00Z', project_path: '/private/project' },
      { id: 'two', agent: 'gemini', project: 'app', title: 'Which design?', status: 'idle', state: 'asking', activity: { since: '2026-11-04T23:58:00Z' } },
      { id: 'three', project: 'app', status: 'idle', state: 'idle', idle_reason: 'done' },
      { id: 'four', agent: 'cursor', project: 'app', status: 'idle', state: 'idle', idle_reason: 'break' },
    ] },
    projects: [{ name: 'app', path: '/private/project', agent_minutes: 123, commits: 4, sessions: 5, top_commits: [{ sha: 'abc123', subject: 'Ship the page', time: '2026-11-04T23:58:30Z' }] }],
    totals: { agent_minutes: 123, commits: 4, sessions: 5 },
    per_hour: [2, 4, 5], per_day: { '2026-11-03': { minutes: 23 }, '2026-11-04': { minutes: 100 } },
  }
}
async function setup(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'voxel-host-test-'))
  await fs.mkdir(path.join(directory, 'assets'))
  await fs.writeFile(path.join(directory, 'index.html'), '<!doctype html><title>Voxel office test</title><script src="./assets/app.js"></script>')
  await fs.writeFile(path.join(directory, 'assets/app.js'), 'console.log("office")')
  const app = await startVoxelDashboard({ directory, collectFacts: async () => fixture(), ...options })
  t.after(async () => { await app.close(); await fs.rm(directory, { recursive: true, force: true }) })
  return { ...app, directory }
}
function endpoint(url, pathname = '/api/snapshot') { const out = new URL(url); out.pathname = pathname; return out }
async function request(url, { host, origin, method = 'GET', requestPath, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const req = http.request(target, { method, path: requestPath ?? `${target.pathname}${target.search}`, headers: { ...headers, ...(host ? { Host: host } : {}), ...(origin ? { Origin: origin } : {}) } }, res => {
      let body = ''
      res.setEncoding('utf8').on('data', chunk => { body += chunk }).on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }))
    })
    req.on('error', reject).end()
  })
}
async function binaryRequest(url, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { headers, method }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk)).on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject).end()
  })
}

test('voxel facts retain measured activity and map every live status without private filesystem paths', () => {
  const facts = fixture()
  const before = structuredClone(facts)
  const snapshot = normalizeVoxelFacts(facts)
  assert.deepEqual(facts, before)
  assert.equal(snapshot.source, 'local')
  assert.equal(snapshot.generatedAt, '2026-11-05T00:00:00.000Z')
  assert.deepEqual(snapshot.agents.map(agent => agent.status), ['working', 'waiting', 'done', 'idle'])
  assert.deepEqual(snapshot.agents.map(agent => agent.agent), ['codex', 'gemini', 'claude', 'cursor'])
  assert.equal(snapshot.agents[0].name, 'Dex')
  assert.equal(snapshot.agents[0].minutes, 0, 'a long-running session age is not measured active time')
  assert.equal(snapshot.agents[0].task, 'index.js')
  assert.equal(snapshot.totals.minutes, 123)
  assert.equal(snapshot.totals.commits, 4)
  assert.equal(snapshot.totals.sessions, 5)
  assert.deepEqual([snapshot.totals.working,snapshot.totals.waiting,snapshot.totals.idle,snapshot.totals.done], [1,1,1,1])
  assert.deepEqual(snapshot.hourly, [2, 4, 5, ...Array(21).fill(0)])
  assert.deepEqual(snapshot.daily, [0, 0, 0, 0, 0, 23, 100])
  assert.deepEqual(snapshot.dailyDates, ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'])
  assert.deepEqual(snapshot.activity.map(entry => entry.text), ['index.js', 'Ship the page', 'Which design?'])
  assert.deepEqual(snapshot.activity.map(entry => entry.status), ['working', 'done', 'waiting'])
  assert.equal(snapshot.activity[1].kind, 'commit')
  assert.equal(snapshot.activity[0].sessionId, 'one')
  assert.doesNotMatch(JSON.stringify(snapshot), /\/private\/|project_path|started_at|"path"/)
})

test('an empty local office stays empty and non-finite counts cannot reach the client', () => {
  const empty = normalizeVoxelFacts({ totals: { commits: -3, sessions: Infinity }, per_hour: [NaN, -1, Infinity] })
  assert.deepEqual(empty.agents, [])
  assert.deepEqual(empty.projects, [])
  assert.deepEqual(empty.activity, [])
  assert.ok(Object.values(empty.totals).every(value => value === 0))
  assert.deepEqual(empty.crew, [])
  assert.ok(empty.work.every(row => row.calls === 0))
  assert.deepEqual(empty.hourly, Array(24).fill(0))
  assert.deepEqual(empty.daily, Array(7).fill(0))
})

test('the capability page and bundled assets serve without scanning any activity until requested', async t => {
  const calls = []
  const app = await setup(t, { collectFacts: async options => { calls.push(options); return fixture() } })
  const page = await fetch(app.url)
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Voxel office test/)
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/)
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(page.headers.get('access-control-allow-origin'), null)
  assert.equal((await fetch(new URL('/assets/app.js', app.url))).status, 200)
  assert.deepEqual(calls, [])
  const response = await fetch(endpoint(app.url))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).source, 'local')
  assert.deepEqual(calls, [{ view: 'all', series: true, novi: false }])
  assert.equal((await request(app.url, { method: 'HEAD' })).body, '')
})

test('missing tokens, foreign origins, rebinding and mutation attempts cannot read local activity', async t => {
  let calls = 0
  const app = await setup(t, { collectFacts: async () => { calls++; return fixture() } })
  const target = endpoint(app.url)
  assert.equal((await fetch(new URL('/', app.url))).status, 403)
  assert.equal((await fetch(new URL('/api/snapshot', app.url))).status, 403)
  assert.equal((await request(target, { host: 'evil.example' })).status, 403)
  assert.equal((await request(target, { origin: 'https://evil.example' })).status, 403)
  assert.equal((await request(target, { requestPath: `http://evil.example${target.pathname}${target.search}` })).status, 403)
  assert.equal((await request(target, { method: 'POST' })).status, 405)
  for (const key of ['file', 'command', 'view']) {
    const url = new URL(target); url.searchParams.set(key, '../private')
    assert.equal((await fetch(url)).status, 400)
  }
  const duplicated = new URL(target); duplicated.searchParams.append('token', duplicated.searchParams.get('token'))
  assert.equal((await fetch(duplicated)).status, 400)
  assert.equal(calls, 0)
})

test('static file resolution rejects traversal and symlinks outside the compiled UI', async t => {
  const app = await setup(t)
  const outside = path.join(app.directory, '..', `voxel-secret-${path.basename(app.directory)}.txt`)
  await fs.writeFile(outside, 'private outside file')
  t.after(() => fs.rm(outside, { force: true }))
  await fs.symlink(outside, path.join(app.directory, 'assets/escape.txt'))
  assert.equal((await fetch(new URL('/assets/escape.txt', app.url))).status, 404)
  assert.equal((await request(app.url, { requestPath: '/assets/%2e%2e%2f%2e%2e%2fsecret' })).status, 404)
  assert.equal((await request(app.url, { requestPath: '/assets/%00' })).status, 404)
  assert.equal((await fetch(new URL('/missing', app.url))).status, 404)
})

test('static assets compress without changing bytes and revalidate after edits or symlink replacement', async t => {
  const app = await setup(t)
  const file = path.join(app.directory, 'assets/app.js')
  const source = 'console.log("same office");\n'.repeat(500)
  await fs.writeFile(file, source)
  const url = new URL('/assets/app.js', app.url)
  const first = await binaryRequest(url, { 'Accept-Encoding': 'gzip' })
  assert.equal(first.status, 200)
  assert.equal(first.headers['content-encoding'], 'gzip')
  assert.equal(gunzipSync(first.body).toString(), source)
  assert.ok(first.body.length < Buffer.byteLength(source) / 4)
  assert.equal(first.headers.vary, 'Accept-Encoding')
  assert.match(first.headers['cache-control'], /no-cache/)
  const unchanged = await binaryRequest(url, { 'If-None-Match': `"old", ${first.headers.etag}` })
  assert.equal(unchanged.status, 304)
  assert.equal(unchanged.body.length, 0)
  const identity = await binaryRequest(url, { 'Accept-Encoding': 'gzip;q=0, *;q=1' })
  assert.equal(identity.headers['content-encoding'], undefined)
  assert.equal(identity.body.toString(), source)
  const head = await binaryRequest(url, { 'Accept-Encoding': 'gzip' }, 'HEAD')
  assert.equal(head.body.length, 0)
  assert.equal(Number(head.headers['content-length']), first.body.length)
  await fs.writeFile(file, 'console.log("updated office")')
  const changed = await binaryRequest(url, { 'If-None-Match': first.headers.etag })
  assert.equal(changed.status, 200)
  assert.equal(changed.body.toString(), 'console.log("updated office")')
  assert.notEqual(changed.headers.etag, first.headers.etag)
  const outside = path.join(app.directory, '..', `voxel-cached-secret-${path.basename(app.directory)}.txt`)
  await fs.writeFile(outside, 'private outside file')
  t.after(() => fs.rm(outside, { force: true }))
  await fs.unlink(file)
  await fs.symlink(outside, file)
  assert.equal((await binaryRequest(url, { 'If-None-Match': changed.headers.etag })).status, 404, 'a cached file cannot bypass realpath checks')
  await fs.symlink(path.join(app.directory, 'index.html'), path.join(app.directory, 'assets/page.html'))
  const alias = await binaryRequest(new URL('/assets/page.html', app.url))
  const page = await binaryRequest(app.url, { 'If-None-Match': alias.headers.etag })
  assert.equal(page.status, 200, 'public asset aliases cannot add validators to capability pages')
  assert.equal(page.headers.etag, undefined)
  assert.equal(page.headers['cache-control'], 'no-store')
  const snapshot = await fetch(endpoint(app.url))
  assert.equal(snapshot.headers.get('cache-control'), 'no-store')
  assert.equal(snapshot.headers.get('etag'), null)
})

test('concurrent snapshot requests share a single collector and reuse its fresh cache', async t => {
  let release, started
  const gate = new Promise(resolve => { release = resolve })
  const announce = new Promise(resolve => { started = resolve })
  let calls = 0
  const app = await setup(t, { collectFacts: async () => { calls++; started(); await gate; return fixture() } })
  const first = fetch(endpoint(app.url))
  await announce
  const second = fetch(endpoint(app.url))
  release()
  const responses = await Promise.all([first, second])
  for (const response of responses) assert.equal((await response.json()).agents.length, 4)
  assert.equal(calls, 1)
  await (await fetch(endpoint(app.url))).json()
  assert.equal(calls, 1)
})

test('collection retries a broken cache and returns a generic recoverable error on repeated failure', async t => {
  const seen = []
  let fail = true
  const app = await setup(t, { cacheMs: 0, collectFacts: async options => {
    seen.push(options)
    if (fail) throw new Error('/private/path and session secrets')
    return fixture()
  } })
  const response = await fetch(endpoint(app.url))
  assert.equal(response.status, 503)
  assert.doesNotMatch(await response.text(), /private|secrets/)
  assert.equal(seen.length, 2)
  assert.equal(seen[1].resetCache, true)
  fail = false
  assert.equal((await fetch(endpoint(app.url))).status, 200)
})

test('shutdown requires both the capability and an explicit same-origin POST', async t => {
  const app = await setup(t)
  const url = endpoint(app.url, '/shutdown')
  assert.equal((await fetch(url)).status, 405)
  assert.equal((await fetch(url, { method: 'POST' })).status, 403)
  assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403)
  assert.equal((await fetch(app.url)).status, 200)
  assert.equal((await fetch(url, { method: 'POST', headers: { Origin: url.origin } })).status, 200)
  await app.close()
  await assert.rejects(fetch(app.url))
})

test('voxel launcher accepts only bounded ports and supported switches', () => {
  assert.deepEqual(voxelArgs(['--port', '4519', '--open', '--demo']), { port: 4519, open: true, demo: true })
  for (const args of [['--port'], ['--port', '65536'], ['--port', '-1'], ['--port', '1;touch'], ['--host', '0.0.0.0'], ['--view'], ['--view', 'files']]) assert.throws(() => voxelArgs(args))
  assert.deepEqual(voxelArgs(['--view', 'month']), { port: 0, open: false, demo: false, view: 'month' })
})


test('an editor iframe may navigate to its private page while cross-site API fetches stay blocked', async t => {
  const app = await setup(t)
  const navigation = await request(app.url, { headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'iframe' } })
  assert.equal(navigation.status, 200)
  assert.equal((await request(endpoint(app.url), { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403)
  assert.equal((await request(endpoint(app.url), { headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, 200)
})


test('daily values and dates align across sparse activity, the local date, and a leap day', () => {
  const snapshot = normalizeVoxelFacts({
    now: { local_date: '2028-03-02' },
    per_day: { '2028-02-25': { minutes: 5 }, '2028-02-29': { minutes: 10 }, '2028-03-02': { minutes: 20 }, '2028-02-30': { minutes: 999 } },
  })
  assert.deepEqual(snapshot.dailyDates, ['2028-02-25', '2028-02-26', '2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01', '2028-03-02'])
  assert.deepEqual(snapshot.daily, [5, 0, 0, 0, 10, 0, 20])
  const range = normalizeVoxelFacts({ ...fixture(), now: { local_date: '2026-11-05' }, range: { days: ['2026-11-01', '2026-11-03'] } })
  assert.equal(range.dailyDates.at(-1), '2026-11-03', 'an explicit collected range wins over the wall clock')
  assert.equal(range.daily.at(-1), 23)
})

test('activity carries the actual session status when multiple matching agent/project sessions differ', () => {
  const snapshot = normalizeVoxelFacts({ live: { desks: [
    { id: 'working', agent: 'codex', project: 'shared', state: 'working', last_seen: '2026-11-05T00:02:00Z' },
    { id: 'asking', agent: 'codex', project: 'shared', state: 'asking', last_seen: '2026-11-05T00:01:00Z' },
  ] } })
  assert.deepEqual(snapshot.activity.map(entry => [entry.sessionId, entry.status]), [['working', 'working'], ['asking', 'waiting']])
})


test('the rich original office fixture retains project history, departments, real questions, helpers, and measured counts', async () => {
  const facts = JSON.parse(await fs.readFile(new URL('./fixtures/facts-sample.json', import.meta.url), 'utf8'))
  const snapshot = normalizeVoxelFacts(facts)
  assert.equal(snapshot.totals.toolCalls, facts.totals.tool_calls)
  for (const [normalized,original] of [['filesEdited','files_edited'],['subagents','subagents'],['prompts','prompts'],['workflows','workflows'],['additions','additions'],['deletions','deletions']]) {
    assert.equal(snapshot.totals[normalized], facts.totals[original])
    assert.equal(snapshot.projects[0][normalized], facts.projects[0][original])
  }
  assert.equal(snapshot.totals.interns, 2)
  assert.equal(snapshot.live.meetings, 1)
  assert.equal(snapshot.work.find(row => row.kind === 'coding').calls, 6888)
  assert.equal(snapshot.projects[0].work.find(row => row.kind === 'testing').calls, 1529)
  assert.deepEqual(snapshot.projects[0].dailyDates, snapshot.dailyDates)
  assert.deepEqual(snapshot.projects[0].daily, snapshot.dailyDates.map(day => facts.projects[0].per_day[day].minutes))
  assert.equal(snapshot.projects[0].dayStats[0].commits, 6)
  assert.deepEqual(snapshot.projects[0].hourly, facts.projects[0].per_hour)
  assert.equal(snapshot.projects[0].recentCommits[0].subject, 'feat: speed up invoice pdf batch exporting')
  const asking = snapshot.agents.find(agent => agent.id === '5b8f2c90')
  assert.equal(asking.question, 'Which cape anchor?')
  assert.equal(asking.waitingReason, 'Which cape anchor?')
  assert.equal(asking.tool, 'AskUserQuestion')
  assert.equal(asking.elapsedMinutes, 25)
  assert.equal(asking.elapsedLabel, 'Time in current state')
  assert.equal(asking.minutes, 0)
  assert.equal(asking.minutesAvailable, false)
  assert.notEqual(asking.question, asking.title)
  assert.equal(snapshot.agents.find(agent => agent.id === '9e60f3a8').interns[0].description, 'Sketch the lobby layout')
  const meeting = snapshot.agents.find(agent => agent.id === '5b8c2f47').meetings[0]
  assert.deepEqual([meeting.running,meeting.done,meeting.total], [3,5,9])
})

test('crew shares use explicit provider measurements and unavailable per-session time stays unavailable', () => {
  const facts = fixture()
  facts.totals.agents = { codex:100,claude:23 }
  facts.accounts = [{agent:'codex',minutes:100,sessions:3},{agent:'claude',minutes:23,sessions:2}]
  const snapshot = normalizeVoxelFacts(facts)
  assert.equal(snapshot.crew.reduce((total,row) => total + row.minutes,0), 123)
  assert.equal(snapshot.crew.find(row => row.agent === 'codex').sessions, 3)
  assert.equal(snapshot.projects[0].crew.find(row => row.agent === 'codex').minutes, null, 'missing project/provider measurements are never invented from global shares')
  assert.equal(snapshot.agents[0].elapsedMinutes, null, 'an unavailable activity timestamp does not become a zero-minute measurement')
})

test('project grouping keeps scrubbed and truncated name matches, duplicate rows, and reserved object names', () => {
  const long = 'same-name-'.repeat(12)
  const snapshot = normalizeVoxelFacts({ generated_at: '2026-11-05T00:00:00Z',
    projects: [{ name: '\u001b[31mshared\u001b[0m' }, { name: 'shared' }, { name: '__proto__' }, { name: `${long}a` }, { name: `${long}b` }, { name: 'without desks' }],
    live: { desks: [
      { id: 'one', project: 'shared', agent: 'codex', state: 'working' },
      { id: 'two', project: '\u001b[32mshared\u001b[0m', agent: 'gemini', state: 'asking' },
      { id: 'three', project: '__proto__', state: 'idle' },
      { id: 'four', project: `${long}a`, state: 'working' },
      { id: 'five', project: `${long}b`, state: 'asking' },
    ] },
  })
  assert.deepEqual(snapshot.projects.map(project => [project.live.desks, project.live.working, project.live.waiting]), [[2, 1, 1], [2, 1, 1], [1, 0, 0], [2, 1, 1], [2, 1, 1], [0, 0, 0]])
  assert.deepEqual(snapshot.projects[0].crew.map(row => [row.agent, row.live]), [['codex', 1], ['gemini', 1]])
  assert.equal(snapshot.projects[2].name, '__proto__')
  assert.deepEqual(snapshot.projects[5].crew, [])
})

test('a snapshot request names one of the pixel office views, a bounded page, and a replay range only for the replay', async () => {
  const { voxelSelection, voxelCollectOptions } = await import('../plugin/lib/voxel-dashboard.mjs')
  const select = query => voxelSelection(new URLSearchParams(query))
  assert.deepEqual(select(''), { view: 'live', back: 0, range: null })
  assert.deepEqual(select('view=month&back=3'), { view: 'month', back: 3, range: null })
  assert.deepEqual(select('view=timelapse&range=yesterday'), { view: 'timelapse', back: 0, range: 'yesterday' })
  assert.deepEqual(select('view=timelapse'), { view: 'timelapse', back: 0, range: 'week' })
  for (const bad of ['view=../private', 'view=live&back=1', 'view=week&back=01', 'view=week&back=-1', 'view=week&back=99999', 'view=today&back=3661', 'view=week&range=week', 'view=timelapse&range=year', 'view=timelapse&back=1']) assert.throws(() => select(bad), bad)
  assert.deepEqual(voxelCollectOptions({ view: 'live' }), { view: 'all', series: true, novi: false })
  assert.deepEqual(voxelCollectOptions({ view: 'week', back: 2 }), { view: 'week', series: true, novi: false, back: 2 })
  assert.deepEqual(voxelCollectOptions({ view: 'today', back: 0 }), { view: 'today', series: true, novi: false })
  assert.deepEqual(voxelCollectOptions({ view: 'timelapse', range: 'month' }), { view: 'all', range: 'month', timeline: true, series: true, novi: false })
})

test('each view and page is collected once, kept apart, and refused when out of bounds', async t => {
  const calls = []
  const app = await setup(t, { collectFacts: async options => { calls.push(options); return { ...fixture(), range: { kind: options.view, label: 'Page', days: ['2026-11-03', '2026-11-04'], back: options.back } } } })
  const page = query => { const url = endpoint(app.url); for (const [k, v] of new URLSearchParams(query)) url.searchParams.set(k, v); return fetch(url) }
  const month = await (await page('view=month&back=1')).json()
  assert.equal(month.view, 'month')
  assert.deepEqual(month.period.days, ['2026-11-03', '2026-11-04'])
  assert.equal(month.period.back, 1)
  await (await page('view=month&back=1')).json()
  await (await page('view=week')).json()
  assert.deepEqual(calls, [{ view: 'month', series: true, novi: false, back: 1 }, { view: 'week', series: true, novi: false }])
  assert.equal((await page('view=month&back=abc')).status, 400)
  assert.equal((await page('view=live&range=week')).status, 400)
  assert.equal(calls.length, 2)
})

test('the presentation model carries what every view draws: desk classes and words, the page, the coat rack and the jobs', async () => {
  const facts = JSON.parse(await fs.readFile(new URL('./fixtures/facts-sample.json', import.meta.url), 'utf8'))
  const snapshot = normalizeVoxelFacts(facts)
  assert.equal(snapshot.view, 'live')
  const kinds = new Set(snapshot.agents.map(agent => agent.kind))
  for (const kind of ['working', 'waiting', 'asking', 'break', 'dozing']) assert.ok(kinds.has(kind), kind)
  const asking = snapshot.agents.find(agent => agent.kind === 'asking')
  assert.equal(asking.words, 'asks: Which cape anchor?')
  assert.equal(asking.clock, null)
  const working = snapshot.agents.find(agent => agent.kind === 'working')
  assert.equal(working.clock.fine, true)
  assert.ok(Number.isFinite(Date.parse(working.clock.from)))
  assert.equal(snapshot.agents.find(agent => agent.kind === 'waiting').words, 'in a meeting')
  assert.deepEqual(snapshot.now, { date: '2026-10-26', time: '01:40', hour: 1, night: true, weekday: 'Mon' })
  assert.deepEqual(snapshot.period.days, facts.range.days)
  assert.equal(snapshot.period.past, false)
  assert.equal(snapshot.days.length, 7)
  assert.equal(snapshot.projects[0].days.length, 7)
  assert.deepEqual(snapshot.left.map(entry => entry.project), ['gizmo3d'])
  assert.deepEqual(snapshot.interns, [{ job: 'consultant', n: 559 }, { job: 'generalist', n: 79 }, { job: 'researcher', n: 19 }])
  // a project wears the pixel office's color for it (model.mjs projectSlots in the 2D palette)
  assert.equal(snapshot.projects.find(p => p.name === 'harborledger').color, '#c58fd8')
  assert.equal(snapshot.timeline, null)
  assert.doesNotMatch(JSON.stringify(snapshot), /project_path|"path"|\/home\/demo/)
})

test('a replay is cropped to where something happened, its slots bounded and its runs inside them', () => {
  const timeline = {
    kind: 'week', label: 'Week', days: ['2026-11-01', '2026-11-02'], slot_min: 60, per_day: 24, slots: 48,
    desks: [{ id: 'a', project: 'p', agent: 'codex', title: 'T', runs: [[10, 12], [30, 999]], interns: [[10, 2], [11, 0]] }, { id: 'b', project: 'q', runs: [[20, 21]] }],
    meetings: [{ project: 'p', name: 'm', from: 11, to: 13, agents: 3 }], commits: [{ project: 'p', slot: 12, n: 2 }], more: 0,
  }
  const snapshot = normalizeVoxelFacts({ timeline }, { view: 'timelapse' })
  const t = snapshot.timeline
  assert.equal(t.kind, 'week')
  assert.ok(t.slots <= 48 && t.slots > 0)
  assert.ok(t.start > 0, 'the quiet hours before the first run are cropped')
  for (const desk of t.desks) for (const [from, to] of desk.runs) assert.ok(from >= 0 && to <= t.slots && to > from)
  assert.equal(t.desks[1].agent, 'claude')
  assert.equal(t.meetings[0].name, 'm')
  assert.ok(t.commits.every(c => c.n > 0 && c.slot <= t.slots))
})
