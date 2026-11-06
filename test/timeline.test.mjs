// The timelapse's data (facts.timeline): the yesterday range, quarters of an hour in the day buckets, the slots desks,
// interns, meetings and commits fall in, the cap, and the cache (old entries without quarters are read again once, by a
// yesterday timelapse only). Time is frozen at Mon 26 Oct 2026 01:40 Europe/Paris, as in collect.test.mjs: yesterday is
// Sun 25 Oct, the 25-hour day summer time ended.
process.env.TZ = 'Europe/Paris'
process.env.THEOFFICE_SKIP_PID_CHECK = '1'
process.env.THEOFFICE_NO_NOVI = '1'

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { collect, resolveRange } from '../plugin/lib/collect.mjs'
import { fnv1a, newBucket, touch } from '../plugin/lib/buckets.mjs'
import { cacheFile, coldCacheFile } from '../plugin/lib/cache.mjs'
import {
  FROZEN, NOW, SID, assistant, at, buildFakeClaude, cleanup, customTitle, enc, human, setMtime, sideLine, userRaw, writeJson, writeLines,
} from './helpers/fake-claude.mjs'

const run = (fx, opts = {}) => collect({ view: 'all', claudeDir: fx.claudeDir, cacheDir: null, now: FROZEN, novi: false, ...opts })
const lapse = (fx, range, opts = {}) => run(fx, { range, timeline: true, ...opts })
const id = (key) => fnv1a(key).toString(36)
const YESTERDAY = '2026-10-25'

/** What every timeline promises (types/index.d.ts OfficeTimeline), whatever is in it. */
function assertShape(t) {
  assert.equal(t.per_day, 1440 / t.slot_min)
  assert.ok(Number.isInteger(t.slots) && t.slots > 0 && t.slots <= t.days.length * t.per_day)
  assert.ok(Number.isInteger(t.more) && t.more >= 0)
  t.desks.forEach((d, i) => {
    assert.match(d.id, /^[0-9a-z]+$/)
    assert.equal(typeof d.project, 'string')
    assert.ok(d.runs.length > 0, 'a desk worked in a slot at least')
    let end = -1
    for (const [a, b] of d.runs) {
      assert.ok(Number.isInteger(a) && Number.isInteger(b))
      assert.ok(a > end, `runs sorted and apart: ${JSON.stringify(d.runs)}`)
      assert.ok(a >= 0 && b > a && b <= t.slots, `runs within [0, ${t.slots}): ${JSON.stringify(d.runs)}`)
      end = b
    }
    if (d.interns) {
      assert.ok(d.interns.length >= 2)
      d.interns.forEach(([s, n], k) => {
        assert.ok(Number.isInteger(s) && s >= 0 && s <= t.slots)
        if (k) assert.ok(s > d.interns[k - 1][0] && n !== d.interns[k - 1][1], `interns change points: ${JSON.stringify(d.interns)}`)
      })
      assert.equal(d.interns.at(-1)[1], 0)
    }
    if (i) {
      const p = t.desks[i - 1]
      assert.ok((p.runs[0][0] - d.runs[0][0] || p.project.localeCompare(d.project) || p.id.localeCompare(d.id)) <= 0, 'desks by first slot, project, id')
    }
  })
  t.meetings.forEach((m, i) => {
    assert.ok(m.from >= 0 && m.to > m.from && m.to <= t.slots, JSON.stringify(m))
    if (i) assert.ok(t.meetings[i - 1].from <= m.from)
  })
  t.commits.forEach((c, i) => {
    assert.ok(c.n >= 1 && c.slot >= 0 && c.slot < t.slots)
    if (i) assert.ok(t.commits[i - 1].slot < c.slot || (t.commits[i - 1].slot === c.slot && t.commits[i - 1].project.localeCompare(c.project) < 0))
  })
}

/** Every cache entry (both tiers) of a cache folder, by key. */
function cachedEntries(dir) {
  const out = {}
  for (const file of [coldCacheFile(dir), cacheFile(dir)]) {
    try { Object.assign(out, JSON.parse(fs.readFileSync(file, 'utf8')).files) } catch {}
  }
  return out
}

/** The cache as one from before quarters: every bucket of every entry, in both tiers, loses its `q`. */
function stripQuarters(dir) {
  for (const file of [coldCacheFile(dir), cacheFile(dir)]) {
    let c
    try { c = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { continue }
    for (const e of Object.values(c.files)) for (const b of Object.values(e.days)) delete b.q
    fs.writeFileSync(file, JSON.stringify(c))
  }
}

/**
 * What a version from before quarters leaves when it appends to a day this one began: `a` and `h` grow, `q` does not.
 * Takes the busiest quarter out of each of yesterday's buckets (workflow agents' left as they are); how many it shortened.
 */
function shortQuarters(dir) {
  let n = 0
  for (const file of [coldCacheFile(dir), cacheFile(dir)]) {
    let c
    try { c = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { continue }
    for (const e of Object.values(c.files)) {
      const b = e.days[YESTERDAY]
      if (!b?.q || (e.kind === 'sub' && (e.run || e.type === 'workflow-subagent'))) continue
      const top = Object.entries(b.q).sort((x, y) => y[1] - x[1])[0]
      if (!top || !(top[1] > 1)) continue
      delete b.q[top[0]]
      n++
    }
    fs.writeFileSync(file, JSON.stringify(c))
  }
  return n
}

/** Whether each entry with a bucket on yesterday has its quarters, by key. */
const yesterdayQuarters = (dir) => Object.fromEntries(Object.entries(cachedEntries(dir))
  .filter(([, e]) => e.days[YESTERDAY]).map(([k, e]) => [k, e.days[YESTERDAY].q !== undefined]))

// ---------------------------------------------------------------- the range

describe('yesterday', () => {
  test('is the whole day before today, midnight to midnight, the 25-hour day included', () => {
    const r = resolveRange('yesterday', NOW)
    assert.equal(r.kind, 'yesterday')
    assert.deepEqual(r.days, ['2026-10-25'])
    assert.equal(r.from, '2026-10-24T22:00:00.000Z')   // Sun 25 00:00 CEST
    assert.equal(r.to, '2026-10-25T23:00:00.000Z')     // Mon 26 00:00 CET: 25 hours later
    assert.equal(r.label, 'Sun 25 Oct')
  })
  test('the 23-hour day of spring and a month boundary', () => {
    const r = resolveRange('yesterday', Date.parse('2026-03-30T10:00:00Z'))
    assert.deepEqual(r.days, ['2026-03-29'])
    assert.equal(r.from, '2026-03-28T23:00:00.000Z')   // Sun 29 Mar 00:00 CET
    assert.equal(r.to, '2026-03-29T22:00:00.000Z')     // Mon 30 00:00 CEST
    assert.equal(r.label, 'Sun 29 Mar')
    assert.deepEqual(resolveRange('yesterday', Date.parse('2026-11-01T08:00:00Z')).days, ['2026-10-31'])
  })
  test('the other kinds do not change', () => {
    assert.equal(resolveRange('week', NOW).from, '2026-10-19T22:00:00.000Z')
    assert.equal(resolveRange('month', NOW, 0, { lapse: true }).days.length, 30)
    assert.equal(resolveRange('today', NOW).from, '2026-10-25T23:00:00.000Z')
    assert.equal(resolveRange('all', NOW).kind, 'week')
  })
})

// ---------------------------------------------------------------- quarters

describe('quarters', () => {
  const local = (h, m, s = 0) => new Date(2026, 9, 25, h, m, s).getTime()
  test('touch books the gap on the later event\'s wall-clock quarter, next to its hour', () => {
    assert.deepEqual(newBucket().q, {})
    const e = { days: {} }
    touch(e, local(10, 14))
    touch(e, local(10, 16))       // 2 min, booked at 10:16: the quarter 10:15-10:30 (41), not split across the boundary
    touch(e, local(10, 29, 59))   // 13m59s capped to 5 min, still 41
    touch(e, local(10, 30))       // 1 s on 10:30-10:45 (42)
    const b = e.days[YESTERDAY]
    assert.deepEqual(b.q, { 41: 420e3, 42: 1e3 })
    assert.deepEqual(b.h, { 10: 421e3 })
    assert.equal(b.a, 421e3)
  })
  test('the hour summer time repeats is one wall-clock quarter', () => {
    const e = { days: {} }
    touch(e, Date.parse('2026-10-25T00:16:00Z'))   // 02:16 CEST
    touch(e, Date.parse('2026-10-25T00:20:00Z'))   // 02:20 CEST: 4 min
    touch(e, Date.parse('2026-10-25T01:16:00Z'))   // 02:16 CET: an hour later, capped to 5 min
    assert.deepEqual(e.days[YESTERDAY].q, { 9: 540e3 })
  })
  test('a bucket cached before quarters gets none by appending (its quarters are whole or missing)', () => {
    const { q, ...old } = newBucket()
    const e = { days: { [YESTERDAY]: old }, prev: local(9, 0) }
    touch(e, local(9, 3))
    assert.equal(e.days[YESTERDAY].q, undefined)
    assert.deepEqual(e.days[YESTERDAY].h, { 9: 180e3 })
  })
})

// ---------------------------------------------------------------- the fake office

describe('timeline of the fake office', () => {
  let fx
  let week
  before(async () => {
    fx = buildFakeClaude()
    week = await lapse(fx, 'week')
  })
  after(() => cleanup(fx?.root))

  test('the week by the hour, up to the slot of now', () => {
    const t = week.timeline
    assert.equal(week.range.kind, 'week')
    assert.equal(t.kind, 'week')
    assert.equal(t.label, week.range.label)
    assert.deepEqual(t.days, week.range.days)
    assert.equal(t.slot_min, 60)
    assert.equal(t.per_day, 24)
    assert.equal(t.slots, 6 * 24 + 1 + 1)   // Mon 01:40 is slot 145 of Tue 20 → Mon 26
    assert.equal(t.more, 0)
    assertShape(t)
  })

  test('desks: the sessions that worked a twentieth of an hour (3 min) in a slot, by their first slot', () => {
    // D: Sat 12:xx CEST 910 s (slot 4*24+12), Sun 23:30 CET 5 min (5*24+23), Mon 00:10-00:12 7 min (6*24+0);
    // H: Sat 14:00-14:03 CEST, 3 min (4*24+14); A: Mon 01:30-01:39, 371 s (6*24+1).
    // E (10 s), F (30 s), G (60 s), B (65 s), C (120 s) never worked 3 minutes in an hour: no desks.
    assert.deepEqual(week.timeline.desks, [
      { id: id(SID.D), project: 'otherproj', title: 'Other project work', runs: [[108, 109], [143, 145]] },
      { id: id(SID.H), project: 'clone', runs: [[110, 111]] },
      { id: id(SID.A), project: 'repo', title: 'Build the office', runs: [[145, 146]], interns: [[144, 1], [145, 2], [146, 0]] },
    ])
  })

  test('a desk names its project as the facts do, never its session id', () => {
    const names = new Set(week.projects.map((p) => p.name))
    for (const d of week.timeline.desks) assert.ok(names.has(d.project), d.project)
    const json = JSON.stringify(week.timeline)
    for (const sid of Object.values(SID)) assert.ok(!json.includes(sid) && !json.includes(sid.slice(0, 8)), sid)
  })

  test('interns: A\'s Plan agent at Mon 00:30, its Explore and foreground agents at 01:3x; workflow agents are not interns', () => {
    // a2222 Plan 5 min in slot 144; a1111 Explore and a5555 general-purpose 5 min each in 145; the three agents of the
    // running workflow (also in 145) sit in its meeting. E's busy intern goes with E, which has no desk.
    const a = week.timeline.desks.find((d) => d.id === id(SID.A))
    assert.deepEqual(a.interns, [[144, 1], [145, 2], [146, 0]])
  })

  test('meetings: the finished run from its start to its json, the running one until now', () => {
    assert.deepEqual(week.timeline.meetings, [
      { project: 'repo', name: 'old-flow', from: 5 * 24 + 11, to: 5 * 24 + 12, agents: 2 },   // Sun 11:00-11:30 CET
      { project: 'repo', name: 'review-flow', from: 145, to: 146, agents: 3 },                  // named by the live desk
    ])
  })

  test('commits: per project and slot, the clone\'s copies counted once', () => {
    // Sat 24 09:00Z = 11:00 CEST, Sun 25 16:00Z = 17:00 CET; the other author's commit is not ours
    assert.deepEqual(week.timeline.commits, [{ project: 'repo', slot: 4 * 24 + 11, n: 1 }, { project: 'repo', slot: 5 * 24 + 17, n: 1 }])
  })

  test('yesterday by the quarter: 96 wall-clock slots on a 25-hour day', async () => {
    const y = await lapse(fx, 'yesterday')
    assert.equal(y.range.kind, 'yesterday')
    assert.deepEqual(Object.keys(y.per_day), [YESTERDAY])
    const t = y.timeline
    assert.deepEqual([t.kind, t.label, t.days, t.slot_min, t.per_day, t.slots], ['yesterday', 'Sun 25 Oct', [YESTERDAY], 15, 96, 96])
    assertShape(t)
    // D's 5 minutes at 23:30 CET (quarter 94) are a minute and more: a desk; nobody else worked on Sunday
    assert.deepEqual(t.desks, [{ id: id(SID.D), project: 'otherproj', title: 'Other project work', runs: [[94, 95]] }])
    assert.deepEqual(t.meetings, [{ project: 'repo', name: 'old-flow', from: 44, to: 47, agents: 2 }])   // 11:00 → 11:30 (+1)
    assert.deepEqual(t.commits, [{ project: 'repo', slot: 68, n: 1 }])                                     // 17:00
  })

  test('the month in 4-hour slots: only a quarter of an hour of work in a slot counts', async () => {
    const t = (await lapse(fx, 'month', { git: false })).timeline
    assert.deepEqual([t.slot_min, t.per_day, t.slots], [240, 6, 29 * 6 + 1])
    assertShape(t)
    assert.deepEqual(t.desks.map((d) => [d.project, d.runs]), [['otherproj', [[27 * 6 + 3, 27 * 6 + 4]]]])   // Sat 12:xx, 15 min
    assert.deepEqual(t.meetings.map((m) => [m.name, m.from, m.to]), [['old-flow', 28 * 6 + 2, 28 * 6 + 3], ['review-flow', 174, 175]])
    assert.deepEqual(t.commits, [])
  })

  test('the project filter applies to desks, meetings and commits', async () => {
    const t = (await lapse(fx, 'week', { project: 'other' })).timeline
    assert.deepEqual(t.desks.map((d) => d.project), ['otherproj'])
    assert.deepEqual(t.meetings, [])
    assert.deepEqual(t.commits, [])
  })

  test('only a timeline run has a timeline; a range alone changes the range', async () => {
    const plain = await run(fx, { view: 'week' })
    assert.ok(!('timeline' in plain))
    assert.deepEqual(Object.keys(plain.sources.ms), ['total', 'live', 'history', 'git'])
    const y = await run(fx, { view: 'week', range: 'yesterday', git: false })
    assert.ok(!('timeline' in y))
    assert.equal(y.range.kind, 'yesterday')
    assert.equal(y.range.label, 'Sun 25 Oct')
    const odd = await run(fx, { view: 'week', range: 'fortnight', timeline: true, git: false })
    assert.equal(odd.range.kind, 'week')
    assert.equal(odd.timeline.kind, 'week')
    assert.ok(!('timeline' in (await run(fx, { view: 'today', timeline: true, git: false }))), 'today has no timelapse')
  })

  test('the cache round-trips: a second run is served from it and gives the same timeline', async () => {
    const dir = fs.mkdtempSync(path.join(fx.root, 'cache-'))
    for (const range of ['week', 'yesterday']) {
      const a = await lapse(fx, range, { cacheDir: dir, git: false })
      const b = await lapse(fx, range, { cacheDir: dir, git: false })
      assert.equal(b.sources.files_from_cache, b.sources.files_scanned, range)
      assert.deepEqual(b.timeline, a.timeline, range)
    }
  })

  test('quarters are read again only where the timelapse reads them: not for workflow agents, whose meeting has its times', async () => {
    const dir = fs.mkdtempSync(path.join(fx.root, 'cache-'))
    await run(fx, { view: 'week', cacheDir: dir, git: false })
    stripQuarters(dir)
    const D = path.join(enc(fx.other), `${SID.D}.jsonl`)
    const run4 = path.join(enc(fx.repo), SID.A, 'subagents', 'workflows', 'wf_bbbbbbbb-222', 'agent-aw000000000000004.jsonl')
    assert.deepEqual(Object.keys(yesterdayQuarters(dir)).sort(), [D, run4, run4.replace('4.jsonl', '5.jsonl')].sort())
    const y = await lapse(fx, 'yesterday', { cacheDir: dir, git: false })
    assert.equal(y.sources.files_scanned - y.sources.files_from_cache, 1)
    assert.deepEqual(yesterdayQuarters(dir), { [D]: true, [run4]: false, [run4.replace('4.jsonl', '5.jsonl')]: false })
    assert.deepEqual(cachedEntries(dir)[D].days[YESTERDAY].q, { 94: 300e3 })
  })
})

// ---------------------------------------------------------------- a quarter-hour day, two agents

/**
 * A home with Claude and Codex, working on Sun 25 Oct (CET after 01:00Z): Claude's X in `app` (the repeated 02:xx hour,
 * 09:10-09:40, 16:00-16:02) with three interns, its Y in a scratchpad of `app`, its Z for 50 s; Codex's C1 13:00-13:20
 * with a subagent, and an archived (zstd, read whole) C3 at 18:00-18:10.
 */
function quarterHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-lapse-'))
  const app = path.join(root, 'app')
  fs.mkdirSync(path.join(app, '.git'), { recursive: true })
  const claude = path.join(root, '.claude')
  const transcript = (cwd, sid) => path.join(claude, 'projects', enc(cwd), `${sid}.jsonl`)
  const minutes = (from, n) => Array.from({ length: n + 1 }, (_, i) => new Date(Date.parse(from) + i * 60e3).toISOString())
  const sid = { X: '1a1a1a1a-0000-4000-8000-00000000000x', Y: '2b2b2b2b-0000-4000-8000-00000000000y', Z: '3c3c3c3c-0000-4000-8000-00000000000z' }
  const X = transcript(app, sid.X)
  const xTimes = [
    ...minutes('2026-10-25T00:20:00Z', 5), ...minutes('2026-10-25T01:20:00Z', 5), ...minutes('2026-10-25T08:10:00Z', 30), ...minutes('2026-10-25T15:00:00Z', 2),
  ]
  writeLines(X, [customTitle(sid.X, 'Quarter work'), ...xTimes.map((ts, i) => (i % 2 ? assistant(ts, app) : human(ts, 'go', app)))], at(xTimes.at(-1)))
  const subs = path.join(claude, 'projects', enc(app), sid.X, 'subagents')
  const intern = (name, type, times) => {
    writeLines(path.join(subs, `agent-${name}.jsonl`), times.map((ts) => sideLine(userRaw(ts, 'look', app), name)), at(times.at(-1)))
    writeJson(path.join(subs, `agent-${name}.meta.json`), { agentType: type, description: 'look' })
  }
  intern('b0000000000000001', 'Explore', ['2026-10-25T08:20:00Z', '2026-10-25T08:20:40Z'])                           // 40 s in 37
  intern('b0000000000000002', 'general-purpose', ['2026-10-25T08:25:00Z', '2026-10-25T08:25:20Z'])                   // 20 s: no
  intern('b0000000000000003', 'Plan', ['2026-10-25T08:26:00Z', '2026-10-25T08:29:00Z', '2026-10-25T08:33:00Z'])      // 37 and 38
  const scratch = `/private/tmp/claude-501/${enc(app)}/0a0b0c0d-0e0f-4000-8000-000000000001/scratchpad`
  writeLines(transcript(scratch, sid.Y), [human('2026-10-25T15:30:00Z', 'scratch', scratch), assistant('2026-10-25T15:33:00Z', scratch)], at('2026-10-25T15:33:00Z'))
  writeLines(transcript(app, sid.Z), [human('2026-10-25T13:00:00Z', 'hi', app), assistant('2026-10-25T13:00:50Z', app)], at('2026-10-25T13:00:50Z'))

  const rl = (ts, type, payload) => ({ timestamp: ts, ordinal: 0, type, payload })
  const codex = { C1: '01a17487-0000-7000-8000-0000000000c1', C2: '01a17487-0000-7000-8000-0000000000c2', C3: '01a17487-0000-7000-8000-0000000000c3' }
  const day = path.join(root, '.codex', 'sessions', '2026', '10', '25')
  writeLines(path.join(day, `rollout-2026-10-25T13-00-00-${codex.C1}.jsonl`), [
    rl('2026-10-25T12:00:00.000Z', 'session_meta', { id: codex.C1, cwd: app, source: 'cli' }),
    ...minutes('2026-10-25T12:01:00Z', 19).map((ts) => rl(ts, 'event_msg', { type: 'agent_reasoning' })),
  ], at('2026-10-25T12:20:00Z'))
  writeLines(path.join(day, `rollout-2026-10-25T13-05-00-${codex.C2}.jsonl`), [
    rl('2026-10-25T12:05:00.000Z', 'session_meta',
      { id: codex.C2, cwd: app, thread_source: 'subagent', source: { subagent: { thread_spawn: { parent_thread_id: codex.C1 } } } }),
    rl('2026-10-25T12:05:40.000Z', 'event_msg', { type: 'agent_reasoning' }),
  ], at('2026-10-25T12:05:40Z'))
  const archived = [
    rl('2026-10-25T17:00:00.000Z', 'session_meta', { id: codex.C3, cwd: app }),
    ...minutes('2026-10-25T17:01:00Z', 9).map((ts) => rl(ts, 'event_msg', { type: 'agent_reasoning' })),
  ]
  const zst = path.join(root, '.codex', 'archived_sessions', `rollout-2026-10-25T18-00-00-${codex.C3}.jsonl.zst`)
  fs.mkdirSync(path.dirname(zst), { recursive: true })
  fs.writeFileSync(zst, zlib.zstdCompressSync(Buffer.from(archived.map((o) => JSON.stringify(o)).join('\n') + '\n')))
  setMtime(zst, at('2026-10-25T17:10:00Z'))
  const cacheDir = path.join(root, 'cache')
  const go = (opts = {}) => collect({ view: 'all', home: root, agents: 'claude,codex', cacheDir, now: FROZEN, novi: false, git: false, ...opts })
  return { root, app, sid, codex, cacheDir, go }
}

describe('a day by the quarter, two agents', () => {
  let h
  let first
  before(async () => {
    h = quarterHome()
    first = await h.go({ range: 'yesterday', timeline: true })
  })
  after(() => cleanup(h?.root))

  test('desks of Claude and Codex at quarter resolution, with their interns', () => {
    const t = first.timeline
    assertShape(t)
    assert.equal(t.slots, 96)
    assert.deepEqual(t.desks, [
      // 02:20-02:25 CEST and CET fold into quarter 9; 09:10-09:40 in 36-38; 16:00-16:02 in 64. Interns: Explore 40 s in 37,
      // Plan in 37 and 38; the general-purpose agent's 20 s is under half a minute.
      { id: id(h.sid.X), project: 'app', title: 'Quarter work', runs: [[9, 10], [36, 39], [64, 65]], interns: [[37, 2], [38, 1], [39, 0]] },
      // Codex's C1 13:01-13:20 CET, its subagent 40 s at 13:05
      { id: id(`codex:${h.codex.C1}`), project: 'app', agent: 'codex', runs: [[52, 54]], interns: [[52, 1], [53, 0]] },
      // Y's scratchpad rolls up to app (macOS's /private/tmp scratchpad: with a Windows slug in it, C--Users-…, it is a folder of its own)
      { id: id(h.sid.Y), project: process.platform === 'win32' ? 'scratchpad' : 'app', runs: [[66, 67]] },
      // the archived C3, read whole
      { id: id(`codex:${h.codex.C3}`), project: 'app', agent: 'codex', runs: [[72, 73]] },
    ])
    assert.deepEqual(t.meetings, [])
    assert.equal(first.sources.novi, 'absent')
  })

  test('a cache from before quarters is read again by a yesterday timelapse only, once', async () => {
    assert.ok(Object.values(yesterdayQuarters(h.cacheDir)).every(Boolean), 'the first run cached quarters')
    stripQuarters(h.cacheDir)
    const missing = yesterdayQuarters(h.cacheDir)
    assert.ok(Object.keys(missing).length >= 9 && Object.values(missing).every((v) => !v))
    // neither a plain run nor a week or month timelapse re-reads a file for quarters
    for (const opts of [{ view: 'week' }, { range: 'week', timeline: true }, { range: 'month', timeline: true }, { range: 'yesterday' }]) {
      const f = await h.go(opts)
      assert.equal(f.sources.files_from_cache, f.sources.files_scanned, JSON.stringify(opts))
      assert.deepEqual(yesterdayQuarters(h.cacheDir), missing, JSON.stringify(opts))
    }
    // without quarters a yesterday timeline would spread hours evenly; this one reads those files again, Codex's too
    const again = await h.go({ range: 'yesterday', timeline: true })
    assert.ok(again.sources.files_from_cache < again.sources.files_scanned)
    assert.deepEqual(yesterdayQuarters(h.cacheDir), Object.fromEntries(Object.keys(missing).map((k) => [k, true])))
    assert.deepEqual(again.timeline, first.timeline)
    const third = await h.go({ range: 'yesterday', timeline: true })
    assert.equal(third.sources.files_from_cache, third.sources.files_scanned)
    assert.deepEqual(third.timeline, first.timeline)
  })
  test('quarters a version from before them left short (it appended to the day) are read again too, once', async () => {
    const short = shortQuarters(h.cacheDir)
    assert.ok(short >= 1, 'some bucket had quarters to lose')
    const plain = await h.go({ view: 'week' })
    assert.equal(plain.sources.files_from_cache, plain.sources.files_scanned)
    const again = await h.go({ range: 'yesterday', timeline: true })
    assert.ok(again.sources.files_from_cache < again.sources.files_scanned)
    assert.deepEqual(again.timeline, first.timeline)
    const third = await h.go({ range: 'yesterday', timeline: true })
    assert.equal(third.sources.files_from_cache, third.sources.files_scanned)
  })
})

// ---------------------------------------------------------------- the cap

test('at most 600 desks: the ones that worked the most slots stay, `more` counts the others', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-cap-'))
  try {
    const claudeDir = path.join(root, 'claude')
    const cwd = path.join(root, 'busy')
    fs.mkdirSync(cwd, { recursive: true })
    const dir = path.join(claudeDir, 'projects', enc(cwd))
    const short = new Set()
    for (let i = 0; i < 605; i++) {
      const sid = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
      // 10:00 → 10:02 CET: 2 min in quarter 40; the 600 long ones go on at 10:15 → 10:17 (7 min in 41)
      const times = ['2026-10-25T09:00:00Z', '2026-10-25T09:02:00Z', ...(i < 5 ? [] : ['2026-10-25T09:15:00Z', '2026-10-25T09:17:00Z'])]
      if (i < 5) short.add(fnv1a(sid).toString(36))
      writeLines(path.join(dir, `${sid}.jsonl`), times.map((ts) => human(ts, 'go', cwd)), at(times.at(-1)))
    }
    const f = await collect({ view: 'all', range: 'yesterday', timeline: true, claudeDir, cacheDir: null, now: FROZEN, novi: false, git: false })
    const t = f.timeline
    assert.equal(t.desks.length, 600)
    assert.equal(t.more, 5)
    assertShape(t)
    assert.ok(t.desks.every((d) => d.project === 'busy' && JSON.stringify(d.runs) === '[[40,42]]' && !short.has(d.id)))
    assert.ok(f.sources.ms.timeline < 1000, `${f.sources.ms.timeline} ms`)
  } finally {
    cleanup(root)
  }
})
