// Collector tests against a fake ~/.claude tree (see helpers/fake-claude.mjs). Time is frozen at
// Mon 26 Oct 2026 01:40 Europe/Paris, so the week (Tue 20 → Mon 26) spans the Oct 25 DST change.
process.env.TZ = 'Europe/Paris'
process.env.THEOFFICE_SKIP_PID_CHECK = '1'
process.env.THEOFFICE_NO_NOVI = '1'

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { collect, findOnPath, guarded, isHumanPrompt, localDay, resolveRange, slugRoot } from '../plugin/lib/collect.mjs'
import { ARCHIVE_EVERY_MS, COLD_EVERY_MS, HOT_MS, NEW_FILE_MS, SAVE_EVERY_MS, emptyCache, isNewFile, loadCache, saveCache, tzSignature } from '../plugin/lib/cache.mjs'
import { progressOf } from '../plugin/lib/collect.mjs'
import { collectWithRetry, looks16Color, parseArgs, pixelFile, render } from '../plugin/scripts/office.mjs'
import { renderOffice, toPlain } from '../plugin/lib/ascii.mjs'
import {
  FROZEN, NOW, SID, appendLines, assistant, at, buildFakeClaude, cleanup, enc, human, setMtime, sideLine, stopHook, text, toolResult, toolUse, userRaw,
  writeJson, writeLines,
} from './helpers/fake-claude.mjs'
import { permits } from './helpers/permits.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OFFICE = path.join(ROOT, 'plugin', 'scripts', 'office.mjs')
const run = (fx, opts = {}) => collect({ view: 'week', claudeDir: fx.claudeDir, cacheDir: null, now: FROZEN, novi: false, ...opts })
const byName = (facts, name) => facts.projects.find((p) => p.name === name)

/** A bare fake ~/.claude (sessions/ + projects/) for one-off scenarios; `cwd(name)` makes a project folder. */
function miniClaude(parent) {
  const root = fs.mkdtempSync(path.join(parent, 'mini-'))
  const claudeDir = path.join(root, 'claude')
  fs.mkdirSync(path.join(claudeDir, 'sessions'), { recursive: true })
  fs.mkdirSync(path.join(claudeDir, 'projects'), { recursive: true })
  const cwd = (name) => {
    const p = path.join(root, name)
    fs.mkdirSync(p, { recursive: true })
    return p
  }
  const transcript = (cwdPath, sid) => path.join(claudeDir, 'projects', enc(cwdPath), `${sid}.jsonl`)
  const desk = (pid, sid, cwdPath, extra = {}) =>
    writeJson(path.join(claudeDir, 'sessions', `${pid}.json`), { pid, sessionId: sid, cwd: cwdPath, status: 'busy', startedAt: NOW - 600e3, updatedAt: NOW - 60e3, ...extra })
  return { root, claudeDir, cwd, transcript, desk, run: (opts = {}) => collect({ view: 'week', claudeDir, cacheDir: null, now: FROZEN, novi: false, git: false, ...opts }) }
}

function gitIn(cwd, args, env = {}) {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'init.defaultBranch=main', ...args],
    { cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', ...env }, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
}

function commitIn(cwd, file, msg, isoDate) {
  fs.writeFileSync(path.join(cwd, file), `${msg}\n${'line\n'.repeat(3)}`)   // 4 added lines
  gitIn(cwd, ['add', file])
  gitIn(cwd, ['-c', 'user.email=test@example.com', '-c', 'user.name=Tester', 'commit', '-q', '-m', msg], { GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate })
}

let fx
let week
before(async () => {
  fx = buildFakeClaude()
  week = await run(fx)
})
after(() => cleanup(fx?.root))

// ---------------------------------------------------------------- range & time

describe('range', () => {
  test('week = 7 local days ending today, across the DST change', () => {
    const r = resolveRange('week', NOW)
    assert.deepEqual(r.days, ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'])
    assert.equal(r.from, '2026-10-19T22:00:00.000Z')   // Tue 20 00:00 CEST
    assert.equal(r.kind, 'week')
    assert.equal(r.label, 'Tue 20 Oct → Mon 26 Oct')
  })
  test('today/live = 1 day from local midnight, month = last month and this one so far, all = week', () => {
    assert.equal(resolveRange('today', NOW).from, '2026-10-25T23:00:00.000Z')   // Mon 26 00:00 CET
    assert.deepEqual(resolveRange('live', NOW).days, ['2026-10-26'])
    const m = resolveRange('month', NOW)
    assert.deepEqual([m.days.length, m.days[0], m.days.at(-1), m.back], [56, '2026-09-01', '2026-10-26', undefined])
    assert.deepEqual([m.from, m.to, m.label], ['2026-08-31T22:00:00.000Z', new Date(NOW).toISOString(), 'Tue 1 Sep → Mon 26 Oct'])   // Tue 1 Sep 00:00 CEST → now
    assert.equal(resolveRange('month', Date.parse('2026-11-01T09:00:00Z')).days.length, 32, 'on the 1st: October whole, and the 1st')
    assert.deepEqual(resolveRange('month', Date.parse('2027-01-31T20:00:00Z')).days.slice(0, 1), ['2026-12-01'], 'across the year')
    assert.equal(resolveRange('month', Date.parse('2027-01-31T20:00:00Z')).days.length, 62, 'two months of 31 days: the most it holds')
    assert.equal(resolveRange('month', NOW, 0, { lapse: true }).days.length, 30, "a timelapse's month is the last 30 days")
    assert.equal(resolveRange('all', NOW).kind, 'week')
  })
  test('back turns a range whole pages into the past, with no limit: a day, a Monday-to-Sunday week, a calendar month', () => {
    const r = resolveRange('month', NOW, 1)
    assert.deepEqual([r.kind, r.back, r.days.length, r.days[0], r.days.at(-1)], ['month', 1, 30, '2026-09-01', '2026-09-30'])
    assert.deepEqual([r.from, r.to], ['2026-08-31T22:00:00.000Z', '2026-09-30T22:00:00.000Z'])   // Tue 1 Sep 00:00 → Thu 1 Oct 00:00 CEST
    assert.equal(r.label, 'September 2026')
    assert.deepEqual([resolveRange('month', NOW, 9).label, resolveRange('month', NOW, 9).days.length], ['January 2026', 31])
    assert.equal(resolveRange('month', NOW, 34).label, 'December 2023', 'no limit')
    assert.deepEqual(resolveRange('week', NOW, 2).days, ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'])
    const day = resolveRange('today', NOW, 3)
    assert.deepEqual([day.kind, day.days, day.label], ['today', ['2026-10-23'], 'Fri 23 Oct'])
    assert.deepEqual(resolveRange('live', NOW, 3), resolveRange('live', NOW), 'the live floor is now')
    for (const odd of [0, -1, 'x', null, undefined, Number.NaN]) assert.deepEqual(resolveRange('month', NOW, odd), resolveRange('month', NOW), String(odd))
  })
  test('the month before (back 1) counts its own days and leaves this month out, now stays now, and novi is never asked', async () => {
    const m = miniClaude(fx.root)
    const cwd = m.cwd('pages')
    const OLDER = 'd0d0d0d0-0000-4000-8000-00000000000d'   // Thu 20 Aug: before them both
    const OLD = 'd1d1d1d1-0000-4000-8000-00000000000e'   // Wed 9 Sep: on the month before
    const NEW = 'd2d2d2d2-0000-4000-8000-00000000000f'   // Tue 20 Oct: on this month
    writeLines(m.transcript(cwd, OLDER), [human('2026-08-20T10:00:00.000Z', 'older work', cwd),
      assistant('2026-08-20T10:20:00.000Z', cwd, { blocks: [text('done')], stop: 'end_turn' })], at('2026-08-20T10:20:00.000Z'))
    writeLines(m.transcript(cwd, OLD), [human('2026-09-09T10:00:00.000Z', 'old work', cwd),
      assistant('2026-09-09T10:20:00.000Z', cwd, { blocks: [text('done')], stop: 'end_turn' })], at('2026-09-09T10:20:00.000Z'))
    writeLines(m.transcript(cwd, NEW), [human('2026-10-20T10:00:00.000Z', 'new work', cwd),
      assistant('2026-10-20T10:20:00.000Z', cwd, { blocks: [text('done')], stop: 'end_turn' })], at('2026-10-20T10:20:00.000Z'))
    const before = await m.run({ view: 'month', back: 1 })
    const now = await m.run({ view: 'month' })
    assert.deepEqual([before.range.days[0], before.range.days.at(-1), before.now.local_date], ['2026-09-01', '2026-09-30', '2026-10-26'])
    assert.deepEqual([before.totals.sessions, before.per_day['2026-09-09'].sessions, before.per_day['2026-10-20']], [1, 1, undefined])
    // the month of now is last month and this one so far: September whole, and nothing of August
    assert.deepEqual([now.totals.sessions, now.per_day['2026-10-20'].sessions, now.per_day['2026-09-09'].sessions, now.per_day['2026-08-20']], [2, 1, 1, undefined])
    // novi answers for a range up to now: a novi on PATH that notes each call is asked for this month, never the one before
    if (process.platform === 'win32') return
    const bin = path.join(m.root, 'bin')
    const calls = path.join(m.root, 'novi-calls')
    fs.mkdirSync(bin)
    fs.writeFileSync(path.join(bin, 'novi'), `#!/bin/sh\necho "$@" >> '${calls}'\n`, { mode: 0o755 })
    const { PATH, THEOFFICE_NO_NOVI } = process.env
    process.env.PATH = `${bin}${path.delimiter}${PATH}`
    delete process.env.THEOFFICE_NO_NOVI
    try {
      assert.equal((await m.run({ view: 'month', back: 1, novi: true })).sources.novi, 'absent')
      assert.ok(!fs.existsSync(calls))
      await m.run({ view: 'month', novi: true })
      assert.equal(fs.readFileSync(calls, 'utf8').trim(), 'month --facts --no-ingest')
    } finally {
      process.env.PATH = PATH
      process.env.THEOFFICE_NO_NOVI = THEOFFICE_NO_NOVI
    }
  })
  test('localDay uses the local calendar', () => {
    assert.equal(localDay(Date.parse('2026-10-25T22:30:00Z')), '2026-10-25')
    assert.equal(localDay(Date.parse('2026-10-25T23:10:00Z')), '2026-10-26')
  })
  test('facts.now and facts.range', () => {
    assert.equal(week.spec, 'theoffice/1')
    assert.equal(week.generated_at, FROZEN)
    assert.deepEqual(week.now, { iso: FROZEN, local_date: '2026-10-26', local_time: '01:40', hour: 1, weekday: 'Mon', is_night: true })
    assert.equal(week.range.days.length, 7)
  })
})

// ---------------------------------------------------------------- live floor

describe('live floor', () => {
  const desk = (id) => week.live.desks.find((d) => d.id === id.slice(0, 8))

  test('counts', () => {
    assert.deepEqual(week.live.counts, { desks: 4, busy: 2, idle: 1, waiting: 1, interns: 2, meetings: 1, meeting_agents: 2 })
  })

  test('busy desk with a pending Edit is working/coding, with its intern and meeting', () => {
    const a = desk(SID.A)
    assert.equal(a.pid, process.pid)
    assert.equal(a.title, 'Office plugin')
    assert.equal(a.project, 'repo')
    assert.equal(a.project_path, fx.repo)
    assert.equal(a.worktree, null)
    assert.equal(a.branch, 'main')
    assert.equal(a.status, 'busy')
    assert.equal(a.state, 'working')
    assert.deepEqual(a.activity, { kind: 'coding', tool: 'Edit', label: 'collect.mjs', since: '2026-10-26T00:39:00.000Z' })
    assert.equal(a.model, 'claude-opus-5-5')
    assert.equal(a.entrypoint, 'claude-desktop')
    assert.equal(a.last_seen, new Date(NOW - 5e3).toISOString())
    // Explore intern is fresh; the Plan intern is an hour old; the foreground agent already returned
    assert.deepEqual(a.interns.map((i) => [i.id, i.type, i.description]), [['a1111111', 'Explore', 'Survey assets']])
    assert.equal(a.meetings.length, 1)
    const m = a.meetings[0]
    assert.equal(m.id, 'wf_aaaaaaaa-111')
    assert.equal(m.name, 'review-flow')
    assert.equal(m.phase, 'Design')
    assert.deepEqual([m.agents_running, m.agents_done, m.agents_failed, m.agents_total], [2, 1, 0, 3])
    assert.deepEqual(m.labels, ['read:docs', 'design:1'])
  })

  test('busy desk whose turn ended with a running intern is waiting_on_agents', () => {
    const e = desk(SID.E)
    assert.equal(e.title, 'Probe the API')   // derived session name loses to the ai-title
    assert.equal(e.state, 'waiting_on_agents')
    assert.equal(e.activity.kind, 'delegating')
    assert.equal(e.activity.tool, 'Agent')
    assert.equal(e.activity.label, 'Probe API')
    // a4444… got its <task-notification>, so only a3333… is still at work
    assert.deepEqual(e.interns.map((i) => i.id), ['a3333333'])
  })

  test('idle and asking desks', () => {
    const f = desk(SID.F)
    assert.equal(f.state, 'idle')
    assert.deepEqual(f.activity, { kind: 'idle', tool: null, label: null, since: '2026-10-26T00:30:31.000Z' })
    const g = desk(SID.G)
    assert.equal(g.status, 'busy')
    assert.equal(g.state, 'asking')
    assert.equal(g.activity.kind, 'talking')
    assert.equal(g.activity.tool, 'AskUserQuestion')
    assert.equal(g.activity.label, 'Pick one')
  })

  test('dead pids are not desks; their fresh transcripts are recently_left', async () => {
    delete process.env.THEOFFICE_SKIP_PID_CHECK
    try {
      const f = await run(fx, { view: 'live' })
      assert.deepEqual(f.live.desks.map((d) => d.pid), [process.pid])
      assert.deepEqual(f.live.recently_left.map((l) => [l.title, l.project]), [['Probe the API', 'repo'], ['repo', 'repo'], ['repo', 'repo']])
      assert.equal(f.live.recently_left[0].left_at, new Date(NOW - 60e3).toISOString())
    } finally {
      process.env.THEOFFICE_SKIP_PID_CHECK = '1'
    }
  })

  test('project live counters split like live.counts (asking desks are waiting, not busy)', () => {
    assert.deepEqual(byName(week, 'repo').live, { desks: 4, busy: 2, idle: 1, waiting: 1, interns: 2, meetings: 1 })
    const c = week.live.counts
    const sum = (k) => week.projects.reduce((s, p) => s + p.live[k], 0)
    assert.deepEqual([sum('busy'), sum('idle'), sum('waiting')], [c.busy, c.idle, c.waiting])
  })

  test('a waiting desk names the tool that is actually pending (permission prompt ≠ question)', async () => {
    const m = miniClaude(fx.root)
    const cwd = m.cwd('perm')
    const S1 = 'c7c7c7c7-0000-4000-8000-00000000000c'
    const S2 = 'c8c8c8c8-0000-4000-8000-00000000000d'
    m.desk(2147483100, S1, cwd, { status: 'waiting', waitingFor: 'input needed' })
    writeLines(m.transcript(cwd, S1), [
      human('2026-10-26T00:38:00.000Z', 'clean up', cwd),
      assistant('2026-10-26T00:38:10.000Z', cwd, { blocks: [toolUse('toolu_rm', 'Bash', { command: 'rm -rf build', description: 'Clean build dir' })] }),
    ], NOW - 20e3)
    m.desk(2147483101, S2, cwd, { status: 'waiting', waitingFor: 'input needed' })
    writeLines(m.transcript(cwd, S2), [human('2026-10-26T00:39:00.000Z', 'hello', cwd)], NOW - 10e3)
    const f = await m.run({ view: 'live' })
    const a = f.live.desks.find((d) => d.id === S1.slice(0, 8))
    assert.equal(a.state, 'asking')
    assert.deepEqual([a.activity.kind, a.activity.tool, a.activity.label], ['talking', 'Bash', 'Clean build dir'])
    const b = f.live.desks.find((d) => d.id === S2.slice(0, 8))
    assert.deepEqual([b.activity.kind, b.activity.tool, b.activity.label], ['talking', null, 'input needed'])
  })

  test('relative or undecodable cwds never resolve against the folder the CLI runs in', async () => {
    const m = miniClaude(fx.root)
    const here = m.cwd('cli-cwd')
    gitIn(here, ['init', '-q'])
    const home = m.cwd('home')
    fs.mkdirSync(path.join(home, '.claude', 'worktrees'), { recursive: true })
    const gone = '/private/tmp/claude-501/-Users-nobody-gone-project-xyz/0f0e0d0c-0b0a-4908-8706-050403020101/tasks'
    m.desk(2147483110, 'd1d1d1d1-0000-4000-8000-000000000001', gone)
    m.desk(2147483111, 'd2d2d2d2-0000-4000-8000-000000000002', 'relative/path')
    m.desk(2147483112, 'd3d3d3d3-0000-4000-8000-000000000003', path.join(home, '.claude', 'worktrees', 'foo'))
    const cwd0 = process.cwd()
    const home0 = process.env.HOME
    const profile0 = process.env.USERPROFILE
    let f
    try {
      process.chdir(here)
      process.env.HOME = home
      // os.homedir() reads USERPROFILE on Windows
      if (process.platform === 'win32') process.env.USERPROFILE = home
      f = await m.run({ view: 'live' })
    } finally {
      process.chdir(cwd0)
      process.env.HOME = home0
      if (process.platform === 'win32') process.env.USERPROFILE = profile0
    }
    assert.ok(!f.projects.some((p) => p.path === '.' || p.name === '.' || p.name === 'cli-cwd'), JSON.stringify(f.projects.map((p) => p.path)))
    const desk = (id) => f.live.desks.find((d) => d.id === id)
    assert.equal(desk('d1d1d1d1').project, 'xyz')
    assert.ok(byName(f, 'xyz'), 'the undecodable scratchpad slug is project xyz, as on the desk')
    assert.ok(!byName(f, '-Users-nobody-gone-project-xyz'))
    assert.deepEqual([desk('d2d2d2d2').project, desk('d2d2d2d2').project_path], ['path', 'relative/path'])
    assert.equal(desk('d3d3d3d3').project, 'foo')   // ~/.claude/worktrees/foo is not a worktree of the home folder
    assert.ok(!byName(f, 'home'))
  })

  test('an idle desk says how its turn ended, and is on a break only when something will start the next one', async () => {
    const m = miniClaude(fx.root)
    const cwd = m.cwd('ends')
    const ask = (ts) => human(ts, 'go', cwd)
    const answer = (ts) => assistant(ts, cwd, { blocks: [text('All set.')], stop: 'end_turn' })
    const bgShell = (ts, id, task) => [
      assistant(ts, cwd, { blocks: [toolUse(id, 'Bash', { command: 'npm run build', run_in_background: true })] }),
      toolResult(ts, id, cwd, { stdout: '', stderr: '', interrupted: false, backgroundTaskId: task }),
    ]
    const notice = (ts, task) => ({ type: 'queue-operation', operation: 'enqueue', timestamp: ts, content: `<task-notification>\n<task-id>${task}</task-id>\n<status>completed</status>\n</task-notification>` })
    const wakeup = (ts, id, delaySeconds) => [
      assistant(ts, cwd, { blocks: [toolUse(id, 'ScheduleWakeup', { delaySeconds, prompt: 'check the deploy', reason: 'watching the deploy' })] }),
      toolResult(ts, id, cwd),
    ]
    const T = (min) => `2026-10-26T00:${String(min).padStart(2, '0')}:00.000Z`
    const S = (n) => `e${n}e${n}e${n}e${n}-0000-4000-8000-00000000000${n}`
    const scenes = {
      1: [ask(T(30)), answer(T(31)), stopHook(T(31), cwd)],
      2: [ask(T(20)), assistant(T(21), cwd, { blocks: [toolUse('toolu_e', 'Edit', { file_path: `${cwd}/a.js` })] }), userRaw(T(22), [text('[Request interrupted by user]')], cwd)],
      3: [ask(T(20)), assistant(T(21), cwd, { model: '<synthetic>', blocks: [text("You've hit your session limit · resets 8pm")], stop: 'stop_sequence', extra: { isApiErrorMessage: true } }), stopHook(T(21), cwd)],
      4: [ask(T(20)), ...bgShell(T(21), 'toolu_b4', 'bjob4'), answer(T(22)), stopHook(T(22), cwd)],
      5: [ask(T(30)), ...bgShell(T(31), 'toolu_b5', 'bjob5'), answer(T(32)), stopHook(T(32), cwd), notice(T(35), 'bjob5')],
      6: [ask(T(30)), ...wakeup(T(31), 'toolu_w6', 900), answer(T(31)), stopHook(T(31), cwd)],
      7: [ask(T(30)), ...wakeup(T(31), 'toolu_w7', 300), answer(T(31)), stopHook(T(31), cwd)],
      // a job from the turn before the last prompt does not start this one
      8: [ask(T(20)), ...bgShell(T(21), 'toolu_b8', 'bjob8'), answer(T(22)), stopHook(T(22), cwd), ask(T(30)), answer(T(31)), stopHook(T(31), cwd)],
    }
    for (const [n, lines] of Object.entries(scenes)) {
      m.desk(2147483200 + Number(n), S(n), cwd, { status: 'idle' })
      writeLines(m.transcript(cwd, S(n)), lines, NOW - 60e3)
    }
    const f = await m.run({ view: 'live' })
    const why = (n) => f.live.desks.find((d) => d.id === S(n).slice(0, 8))
    assert.deepEqual(Object.keys(scenes).map((n) => [n, why(n).state, why(n).idle_reason]), [
      ['1', 'idle', 'done'], ['2', 'idle', 'stopped'], ['3', 'idle', 'error'], ['4', 'idle', 'break'], ['5', 'idle', 'done'], ['6', 'idle', 'break'],
      ['7', 'idle', 'done'], ['8', 'idle', 'done'],
    ])
    assert.equal(why(3).activity.label, "You've hit your session limit · resets…")   // a label's 40 columns
    assert.equal(why(1).activity.label, null)
    // a desk at work has no reason to be idle
    assert.equal(week.live.desks.find((d) => d.state === 'working').idle_reason, null)
  })

  test('a desk done for 15 minutes goes home though its session is open, its coat on the rack 15 minutes more', async () => {
    const m = miniClaude(fx.root)
    const cwd = m.cwd('home-time')
    const ago = (min) => new Date(NOW - min * 60e3).toISOString()
    const ask = (min) => human(ago(min + 1), 'go', cwd)
    const answer = (min) => [assistant(ago(min), cwd, { blocks: [text('All set.')], stop: 'end_turn' }), stopHook(ago(min), cwd)]
    const S = (n) => `a${n}a${n}a${n}a${n}-0000-4000-8000-00000000000${n}`
    const scenes = {
      1: [ask(10), ...answer(10)],
      2: [ask(16), ...answer(16)],
      // the app wrote to it a minute ago (a session opened again), its turn done 40 minutes ago: no desk, no coat
      3: [ask(40), ...answer(40)],
      4: [ask(40), assistant(ago(40), cwd, { blocks: [toolUse('toolu_e', 'Edit', { file_path: `${cwd}/a.js` })] }), userRaw(ago(40), [text('[Request interrupted by user]')], cwd)],
      5: [ask(40), assistant(ago(40), cwd, { model: '<synthetic>', blocks: [text("You've hit your session limit")], stop: 'stop_sequence', extra: { isApiErrorMessage: true } }), stopHook(ago(40), cwd)],
      6: [ask(40), assistant(ago(40), cwd, { blocks: [toolUse('toolu_w', 'ScheduleWakeup', { delaySeconds: 3 * 3600, prompt: 'check', reason: 'later' })] }), toolResult(ago(40), 'toolu_w', cwd), ...answer(40)],
    }
    for (const [n, lines] of Object.entries(scenes)) {
      m.desk(2147483400 + Number(n), S(n), cwd, { status: 'idle' })
      writeLines(m.transcript(cwd, S(n)), lines, NOW - 60e3)
    }
    const f = await m.run({ view: 'live' })
    const at = (n) => f.live.desks.find((d) => d.id === S(n).slice(0, 8))
    assert.deepEqual(Object.keys(scenes).map((n) => [n, at(n)?.idle_reason ?? 'home']), [
      ['1', 'done'], ['2', 'home'], ['3', 'home'], ['4', 'stopped'], ['5', 'error'], ['6', 'break'],
    ])
    assert.deepEqual(f.live.recently_left, [{ title: 'home-time', project: 'home-time', left_at: ago(16), agent: 'claude' }])
    assert.equal(f.live.counts.desks, 4)
  })

  test('an idle desk whose interns are still at work is waiting on them', async () => {
    const m = miniClaude(fx.root)
    const cwd = m.cwd('helpers')
    const sid = 'f1f1f1f1-0000-4000-8000-000000000001'
    m.desk(2147483300, sid, cwd, { status: 'idle' })
    writeLines(m.transcript(cwd, sid), [
      human('2026-10-26T00:30:00.000Z', 'survey it', cwd),
      assistant('2026-10-26T00:30:10.000Z', cwd, { blocks: [toolUse('toolu_bg_agent', 'Agent', { description: 'Survey', subagent_type: 'Explore', run_in_background: true })] }),
      toolResult('2026-10-26T00:30:11.000Z', 'toolu_bg_agent', cwd),
      assistant('2026-10-26T00:30:20.000Z', cwd, { blocks: [text('Surveying in the background.')], stop: 'end_turn' }),
      stopHook('2026-10-26T00:30:21.000Z', cwd),
    ], NOW - 60e3)
    const dir = path.join(m.claudeDir, 'projects', enc(cwd), sid, 'subagents')
    writeLines(path.join(dir, 'agent-b1111111111111111.jsonl'), [sideLine(userRaw('2026-10-26T00:30:12.000Z', 'survey', cwd), 'b1111111111111111')], NOW - 5e3)
    writeJson(path.join(dir, 'agent-b1111111111111111.meta.json'), { agentType: 'Explore', description: 'Survey', toolUseId: 'toolu_bg_agent', requestShape: 'background' })
    const f = await m.run({ view: 'live' })
    const d = f.live.desks.find((x) => x.id === sid.slice(0, 8))
    assert.deepEqual([d.state, d.idle_reason, d.interns.length], ['waiting_on_agents', null, 1])
  })
})

// ---------------------------------------------------------------- history

describe('history', () => {
  test('human prompt rules (origin, isMeta, compact summaries, wrappers, tool results)', () => {
    const base = { type: 'user', message: { content: 'x' } }
    assert.equal(isHumanPrompt({ ...base, origin: { kind: 'human' } }), true)
    assert.equal(isHumanPrompt({ ...base, origin: { kind: 'peer' } }), false)
    assert.equal(isHumanPrompt({ ...base, origin: { kind: 'human' }, isMeta: true }), false)
    assert.equal(isHumanPrompt({ ...base, isSidechain: true }), false)
    assert.equal(isHumanPrompt({ ...base, isCompactSummary: true }), false)
    assert.equal(isHumanPrompt({ type: 'user', message: { content: '<command-name>/x</command-name>' } }), false)
    assert.equal(isHumanPrompt({ type: 'user', message: { content: '[Request interrupted by user]' } }), false)
    assert.equal(isHumanPrompt({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't' }] } }), false)
    assert.equal(isHumanPrompt({ type: 'user', message: { content: [{ type: 'text', text: 'hi' }] } }), true)
    assert.equal(isHumanPrompt({ type: 'user', origin: { kind: 'human' }, message: { content: '<system-reminder>a</system-reminder> b' } }), true)
    const o = byName(week, 'otherproj')
    assert.equal(o.prompts, 5)
    assert.deepEqual(Object.values(o.per_day).map((d) => d.prompts), [0, 0, 0, 0, 3, 1, 1])
  })

  test('tokens are counted once per message.id (streamed chunks), <synthetic> skipped', () => {
    const o = byName(week, 'otherproj')
    assert.equal(o.tokens_in, 110 + 2 + 3 + 1)
    assert.equal(o.tokens_out, 50 + 7 + 11 + 1)
  })

  test('active minutes: gaps capped at 5 min, booked on the local day/hour of the later event', () => {
    const o = byName(week, 'otherproj')
    // Sat: 910 s (one 27m50s gap capped to 5 min); Sun 23:30 CET: 5 min; Mon 00:10 + 00:12: 5 + 2 min
    assert.deepEqual(Object.fromEntries(Object.entries(o.per_day).map(([d, v]) => [d, v.minutes])),
      { '2026-10-20': 0, '2026-10-21': 0, '2026-10-22': 0, '2026-10-23': 0, '2026-10-24': 15, '2026-10-25': 5, '2026-10-26': 7 })
    assert.equal(o.desk_minutes, 27)
    assert.equal(o.agent_minutes, 27)
    assert.equal(o.per_hour[12], 15)   // 10:xx UTC = 12:xx CEST
    assert.equal(o.per_hour[23], 5)
    assert.equal(o.per_hour[0], 7)
    assert.equal(o.per_hour.length, 24)
  })

  test('tool kinds, edited files, sessions, models, titles', () => {
    const o = byName(week, 'otherproj')
    assert.equal(o.tool_calls, 5)
    assert.equal(o.activity.testing, 1)   // Bash "npm test"
    assert.equal(o.activity.coding, 3)
    assert.equal(o.activity.reading, 1)
    assert.deepEqual(Object.keys(o.activity), ['coding', 'reading', 'terminal', 'testing', 'web', 'delegating', 'planning', 'talking', 'design', 'tools'])
    assert.equal(o.files_edited, 2)
    assert.equal(o.sessions, 1)           // the Oct 10 session is outside the week
    assert.equal(o.per_day['2026-10-24'].sessions, 1)
    assert.deepEqual(o.models, { 'claude-opus-5-5': 1 })
    assert.deepEqual(o.titles, ['Other project work'])
    assert.equal(o.commits, 0)
  })

  test('worktree and scratchpad sessions roll up to their repo', () => {
    const r = byName(week, 'repo')
    assert.deepEqual(r.worktrees, ['feat-x'])
    assert.equal(r.worktrees_more, 0)
    // the scratchpad is macOS's (/private/tmp/claude-<uid>/<slug>/…): a Windows slug in it (C--Users-…) is no scratchpad of Claude's
    const isMac = process.platform !== 'win32'
    assert.equal(r.sessions, isMac ? 6 : 5)           // A E F G (today) + worktree B + scratchpad C
    if (isMac) assert.equal(r.per_day['2026-10-22'].sessions, 1)
    assert.equal(r.per_day['2026-10-23'].sessions, 1)
    assert.ok(!week.projects.some((p) => ['feat-x', ...(isMac ? ['scratchpad'] : []), 'worktrees'].includes(p.name)))
    assert.ok(r.titles.includes('Worktree feature'))
    assert.ok(r.titles.includes('Build the office'))
  })

  test('subagents, intern types and workflows', () => {
    const r = byName(week, 'repo')
    assert.equal(r.subagents, 10)
    assert.equal(r.intern_types['workflow-subagent'], 5)
    assert.equal(r.intern_types.Explore, 1)
    assert.equal(r.intern_types.Plan, 1)
    assert.equal(r.intern_types['general-purpose'], 3)
    assert.equal(r.workflows, 2)          // finished wf_bbbb (json) + running wf_aaaa (journal only)
    assert.equal(week.per_day['2026-10-25'].workflows, 1)
    assert.equal(week.per_day['2026-10-26'].workflows, 1)
    assert.ok(r.agent_minutes > r.desk_minutes)
  })

  test('git: only the configured author, deduped across checkouts', () => {
    const r = byName(week, 'repo')
    assert.equal(r.commits, 2)
    assert.deepEqual(r.top_commits.map((c) => c.subject), ['fix: second desk', 'feat: first desk'])
    assert.equal(r.top_commits[0].sha.length, 7)
    assert.equal(r.per_day['2026-10-24'].commits, 1)
    assert.equal(r.per_day['2026-10-25'].commits, 1)
    assert.ok(r.additions >= 8)
    const c = byName(week, 'clone')
    assert.ok(c, 'clone is its own project')
    assert.equal(c.commits, 0)            // same shas as repo: counted once, on the best-ranked repo
    assert.equal(week.totals.commits, 2)
  })

  test('totals and top-level per_day add up', () => {
    const t = week.totals
    assert.equal(t.projects, week.projects.length + week.projects_more)
    assert.equal(t.sessions, week.projects.reduce((s, p) => s + p.sessions, 0))
    assert.equal(t.prompts, week.projects.reduce((s, p) => s + p.prompts, 0))
    assert.ok(Object.values(week.per_day).every((d) => d.sessions <= t.sessions && d.subagents <= t.subagents))
    assert.equal(Object.values(week.per_day).reduce((s, d) => s + d.prompts, 0), t.prompts)
    assert.equal(Object.values(week.per_day).reduce((s, d) => s + d.commits, 0), t.commits)
    assert.equal(week.projects[0].name, 'repo')   // most agent-minutes first
  })

  test('per_day sessions/subagents = active that day, so the week\'s today column matches the today view', async () => {
    const t = await run(fx, { view: 'today' })
    const d = '2026-10-26'
    for (const k of ['sessions', 'subagents', 'prompts', 'minutes', 'workflows']) assert.equal(week.per_day[d][k], t.per_day[d][k], k)
    assert.equal(t.per_day[d].sessions, t.totals.sessions)
    assert.equal(t.per_day[d].subagents, t.totals.subagents)
    // D runs Sat → Mon: active (and counted) on all three days
    assert.deepEqual(['2026-10-24', '2026-10-25', '2026-10-26'].map((x) => byName(week, 'otherproj').per_day[x].sessions), [1, 1, 1])
  })

  test('replayed transcript lines (same uuid, older timestamp) are counted once, cold and incremental', async () => {
    const m = miniClaude(fx.root)
    const cwd = m.cwd('dup')
    const sid = 'd0d0d0d0-0000-4000-8000-0000000000d0'
    const file = m.transcript(cwd, sid)
    const orig = [
      human('2026-10-25T10:00:00.000Z', 'p1', cwd),
      assistant('2026-10-25T10:10:00.000Z', cwd, { blocks: [toolUse('t1', 'Read', { file_path: '/a' })], usage: { input_tokens: 10, output_tokens: 5 } }),
      human('2026-10-25T10:20:00.000Z', 'p2', cwd),
      assistant('2026-10-25T10:30:00.000Z', cwd, { blocks: [toolUse('t2', 'Edit', { file_path: '/b' })], usage: { input_tokens: 10, output_tokens: 5 } }),
    ]
    const replay = [...orig.slice(0, 3), human('2026-10-26T00:30:00.000Z', 'p3', cwd)]
    const expect = (f) => {
      const p = byName(f, 'dup')
      assert.deepEqual([p.prompts, p.tool_calls, p.tokens_out, p.files_edited], [3, 2, 10, 1])
    }
    writeLines(file, [...orig, ...replay], NOW - 50e3)
    expect(await m.run())
    // incremental: the originals were parsed by an earlier run, the replay arrives in an appended chunk
    const cacheDir = path.join(m.root, 'cache')
    writeLines(file, orig, NOW - 100e3)
    assert.equal(byName(await m.run({ cacheDir }), 'dup').prompts, 2)
    appendLines(file, replay, NOW - 50e3)
    expect(await m.run({ cacheDir }))
  })

  test('today counts subagent work past midnight while the parent transcript stays quiet', async () => {
    const m = miniClaude(fx.root)
    const cwd = m.cwd('bg')
    const sid = 'b1b1b1b1-0000-4000-8000-00000000000b'
    const pdir = path.dirname(m.transcript(cwd, sid))
    // parent launched a background agent at 23:41 Sun (CET) and has written nothing since
    writeLines(m.transcript(cwd, sid), [
      human('2026-10-25T22:40:00.000Z', 'start a long run', cwd),
      assistant('2026-10-25T22:41:00.000Z', cwd, { blocks: [toolUse('t1', 'Agent', { description: 'Long run', run_in_background: true })] }),
    ], at('2026-10-25T22:41:00Z'))
    const sub = path.join(pdir, sid, 'subagents')
    const id = 'abcabcabcabcabcab'
    writeLines(path.join(sub, `agent-${id}.jsonl`), [
      sideLine(userRaw('2026-10-25T22:41:00.000Z', 'go', cwd), id),
      sideLine(assistant('2026-10-26T00:30:00.000Z', cwd, { blocks: [toolUse('x1', 'Read', { file_path: '/r' })] }), id),
      sideLine(assistant('2026-10-26T00:33:00.000Z', cwd, { blocks: [toolUse('x2', 'Read', { file_path: '/s' })] }), id),
    ], NOW - 10e3)
    writeJson(path.join(sub, `agent-${id}.meta.json`), { agentType: 'Explore', description: 'Long run' })
    setMtime(sub, at('2026-10-25T22:41:00Z'))
    setMtime(path.join(pdir, sid), at('2026-10-25T22:41:00Z'))
    const t = await m.run({ view: 'today' })
    assert.equal(byName(t, 'bg')?.subagents, 1, 'subagents/ changed within a day of the range start')
    assert.equal(byName(t, 'bg').agent_minutes, 8)   // 23:41 → 01:30 capped to 5 min, then 3 min
    // an agent born days ago is still found when its session is a live desk
    setMtime(sub, NOW - 3 * 864e5)
    setMtime(path.join(pdir, sid), NOW - 3 * 864e5)
    assert.equal(byName(await m.run({ view: 'today' }), 'bg'), undefined)
    m.desk(process.pid, sid, cwd)
    assert.equal(byName(await m.run({ view: 'live' }), 'bg')?.subagents, 1)
  })

  test('git can be disabled', async () => {
    const f = await run(fx, { git: false })
    assert.equal(f.totals.commits, 0)
    assert.ok(f.notes.includes('git skipped'))
  })

  test('--project filter', async () => {
    const f = await run(fx, { project: 'OTHER', git: false })
    assert.deepEqual(f.projects.map((p) => p.name), ['otherproj'])
    assert.equal(f.live.counts.desks, 0)
    assert.equal(f.totals.sessions, 1)
  })

  test('month view reaches the old session', async () => {
    const f = await run(fx, { view: 'month', git: false })
    assert.equal(f.range.days.length, 56)
    assert.equal(byName(f, 'otherproj').sessions, 2)
  })
})

// ---------------------------------------------------------------- cache

describe('progress', () => {
  test('a run told where says how far it has read, its steps and bytes, rewritten as it goes; a warm run writes it a handful of times', async (t) => {
    const file = path.join(fx.root, 'month.progress.json')
    const cacheDir = path.join(fx.root, 'progress-cache')
    let progress = progressOf(file)
    const facts = await run(fx, { view: 'month', cacheDir, progress })
    progress.stop()
    const p = JSON.parse(fs.readFileSync(file, 'utf8'))
    // the last step it said: git, every repo asked (Claude's sessions before it, none of the other agents' here)
    assert.deepEqual([p.v, p.step, p.steps], [1, 3, 3])
    assert.ok(p.total > 0 && p.done === p.total, `${p.done} of ${p.total} repos`)
    assert.ok(p.began <= p.at)
    assert.ok(facts.projects.length > 0)
    assert.deepEqual(fs.readdirSync(fx.root).filter((n) => /^month\.progress\.json\..*\.tmp$/.test(n)), [], 'no temp file left behind')
    // the same month again, from the cache: every file cached, so it says its steps and little else
    let writes = 0
    const rename = fs.renameSync
    t.mock.method(fs, 'renameSync', function (from, to) {
      if (String(to) === file) writes++
      return rename.call(this, from, to)
    })
    progress = progressOf(file)
    await run(fx, { view: 'month', cacheDir, progress })
    progress.stop()
    assert.ok(writes <= 8, `${writes} writes`)
  })
})

describe('first light', () => {
  test('the live floor alone, in a run that reads no history, counts nothing, asks no git and writes no cache', async () => {
    const cacheDir = path.join(fx.root, 'light-cache')
    const light = await run(fx, { cacheDir, view: 'all', firstLight: true })
    assert.equal(light.first_light, true)
    assert.deepEqual(light.live.desks.map((d) => [d.id, d.state]), week.live.desks.map((d) => [d.id, d.state]))
    assert.deepEqual([light.totals.agent_minutes, light.totals.tool_calls, light.totals.commits, light.totals.sessions], [0, 0, 0, 0])
    assert.deepEqual([light.sources.files_scanned, light.sources.git_repos], [0, 0])
    assert.ok(!light.notes.some((n) => n.startsWith('first run')))
    assert.ok(!fs.existsSync(cacheDir), 'the run after it writes the cache')
    assert.equal(week.first_light, undefined)
  })
})

describe('cache', () => {
  let cx
  before(() => { cx = buildFakeClaude({ withGit: false }) })
  after(() => cleanup(cx?.root))
  const runC = (opts = {}) => run(cx, { cacheDir: cx.cacheDir, git: false, ...opts })
  const D = () => cx.main(cx.other, SID.D)

  test('first run parses, second run is served from cache with identical numbers', async () => {
    const a = await runC()
    assert.equal(a.sources.files_from_cache, 0)
    assert.ok(a.sources.files_scanned > 10)
    assert.ok(fs.existsSync(path.join(cx.cacheDir, 'cache-v1.json')))
    const b = await runC()
    assert.equal(b.sources.files_from_cache, b.sources.files_scanned)
    assert.deepEqual(b.projects, a.projects)
    assert.deepEqual(b.totals, a.totals)
  })

  test('cache files are owner-only (they hold titles, paths and the git email)', async () => {
    const dir = path.join(cx.root, 'private-cache', 'theoffice')
    await run(cx, { cacheDir: dir, git: false })
    assert.equal(permits(dir, 0o700), 0o700)
    for (const f of fs.readdirSync(dir)) assert.equal(permits(path.join(dir, f), 0o600), 0o600, f)
  })

  test('appended lines are parsed incrementally (counts grow, other files stay cached)', async () => {
    const before = await runC()
    appendLines(D(), [
      human('2026-10-26T00:20:00.000Z', 'one more', cx.other),
      assistant('2026-10-26T00:21:00.000Z', cx.other, { id: 'msg_5', blocks: [toolUse('t5', 'Grep', { pattern: 'x' })], usage: { input_tokens: 4, output_tokens: 6 } }),
    ], NOW - 1000e3)
    const after = await runC()
    assert.equal(after.sources.files_from_cache, after.sources.files_scanned - 1)
    const o0 = byName(before, 'otherproj')
    const o1 = byName(after, 'otherproj')
    assert.equal(o1.prompts, o0.prompts + 1)
    assert.equal(o1.tool_calls, o0.tool_calls + 1)
    assert.equal(o1.tokens_out, o0.tokens_out + 6)
    // 00:12 → 00:20 is an 8-min gap (capped 5) + 1 min: the gap bridges the checkpoint via the cached prevTs
    assert.equal(o1.per_day['2026-10-26'].minutes, o0.per_day['2026-10-26'].minutes + 6)
  })

  test('a message split across a checkpoint is not double counted', async () => {
    const usage = { input_tokens: 5, cache_creation_input_tokens: 0, output_tokens: 20 }
    appendLines(D(), [assistant('2026-10-26T00:22:00.000Z', cx.other, { id: 'msg_6', blocks: [{ type: 'thinking', thinking: '…' }], usage })], NOW - 990e3)
    const a = byName(await runC(), 'otherproj')
    appendLines(D(), [assistant('2026-10-26T00:22:01.000Z', cx.other, { id: 'msg_6', blocks: [text6()], usage })], NOW - 980e3)
    const b = byName(await runC(), 'otherproj')
    assert.equal(b.tokens_out, a.tokens_out)
  })

  test('an unfinished last line is not consumed until it is complete', async () => {
    const a = byName(await runC(), 'otherproj')
    const line = JSON.stringify(human('2026-10-26T00:25:00.000Z', 'half written', cx.other))
    appendLines(D(), [line.slice(0, 40)], NOW - 970e3, { newline: false })
    const b = byName(await runC(), 'otherproj')
    assert.equal(b.prompts, a.prompts)
    appendLines(D(), [line.slice(40)], NOW - 960e3)
    const c = byName(await runC(), 'otherproj')
    assert.equal(c.prompts, a.prompts + 1)
  })

  test('a file that shrank is rescanned from scratch', async () => {
    writeLines(D(), [
      human('2026-10-24T10:00:00.000Z', 'rewritten', cx.other),
      assistant('2026-10-24T10:01:00.000Z', cx.other, { blocks: [toolUse('t1', 'Read', { file_path: '/y' })] }),
    ], NOW - 900e3)
    const f = byName(await runC(), 'otherproj')
    assert.equal(f.prompts, 1)
    assert.equal(f.tool_calls, 1)
    assert.equal(f.per_day['2026-10-24'].minutes, 1)
  })

  test('live view reads the hot tier only and stays consistent', async () => {
    const f = await runC({ view: 'live' })
    assert.equal(f.range.kind, 'live')
    assert.equal(f.live.counts.desks, 4)
    assert.equal(byName(f, 'repo').sessions, 4)   // only today's sessions
    assert.equal(f.sources.files_from_cache, f.sources.files_scanned)
  })

  test('corrupt cache file is ignored', async () => {
    fs.writeFileSync(path.join(cx.cacheDir, 'cache-v1.json'), '{"v":1,"files":')
    fs.writeFileSync(path.join(cx.cacheDir, 'cache-v1-cold.json'), 'garbage')
    const f = await runC()
    assert.equal(f.sources.files_from_cache, 0)
    assert.equal(byName(f, 'otherproj').prompts, 1)
  })

  test('a cache that is valid JSON but the wrong shape is dropped entry by entry, then rewritten', async () => {
    const good = await runC()
    const bad = {
      v: 1, tz: tzSignature(),
      files: { x: null, y: { kind: 'main', days: { '2026-10-26': 5 } }, z: { kind: 'sub', days: {}, cwds: 'nope', models: {} } },
      wf: { w: null }, git: { 'log|/x': { at: Date.now(), commits: 'no' }, 'email|/x': { at: 'soon' } }, novi: 's', slugs: 3, repos: { '/r': 'yesterday' },
    }
    fs.writeFileSync(path.join(cx.cacheDir, 'cache-v1.json'), JSON.stringify(bad))
    fs.writeFileSync(path.join(cx.cacheDir, 'cache-v1-cold.json'), JSON.stringify({ v: 1, tz: tzSignature(), files: { q: [], r: { kind: 'main' } } }))
    const f = await runC()
    assert.equal(f.error, undefined)
    assert.deepEqual(f.projects, good.projects)
    assert.deepEqual(f.totals, good.totals)
    const again = await runC()   // the bad cache was overwritten by a valid one
    assert.equal(again.sources.files_from_cache, again.sources.files_scanned)
  })

  test('the CLI retries once with a fresh cache when a run throws', async () => {
    const calls = []
    const flaky = async (o) => {
      calls.push(o.resetCache ?? false)
      if (!o.resetCache) throw new Error('bad cache')
      return { spec: 'theoffice/1' }
    }
    assert.deepEqual(await collectWithRetry({ view: 'week' }, flaky), { spec: 'theoffice/1' })
    assert.deepEqual(calls, [false, true])
    await assert.rejects(collectWithRetry({ view: 'week', cacheDir: null }, flaky), /bad cache/)   // --no-cache: nothing to reset
  })

  test('resetCache starts the hot tier over, and leaves alone a cold tier its range does not reach', async () => {
    const ghost = { kind: 'main', sid: 'x', ino: 1, size: 1, mtime: NOW - 3 * 864e5, off: 1, cwds: {}, models: {}, days: {} }   // well-formed: a normal run keeps it
    const coldFile = path.join(cx.cacheDir, 'cache-v1-cold.json')
    fs.writeFileSync(coldFile, JSON.stringify({ v: 1, tz: tzSignature(), files: { 'ghost/x.jsonl': ghost } }))
    await runC()
    const week = await runC({ resetCache: true })
    assert.equal(week.sources.files_from_cache, 0)
    assert.ok('ghost/x.jsonl' in JSON.parse(fs.readFileSync(coldFile, 'utf8')).files, 'a week says nothing about a month')
    assert.equal(JSON.parse(fs.readFileSync(path.join(cx.cacheDir, 'cache-v1.json'), 'utf8')).coldAt, NOW, 'and it is not asked again for a while')
    const month = await runC({ view: 'month', resetCache: true })
    assert.equal(month.sources.files_from_cache, 0)
    assert.ok(!('ghost/x.jsonl' in JSON.parse(fs.readFileSync(coldFile, 'utf8')).files), 'a range that reads it rewrites it')
  })
})

// ---------------------------------------------------------------- git cache & quiet repos

describe('git store', () => {
  let gx
  const QSID = '66666666-0000-4000-8000-00000000000a'
  before(() => {
    gx = buildFakeClaude()
    // quiet: Claude worked here on Oct 15 (inside the month, outside the week); commits on Oct 12 and today
    gx.quiet = path.join(gx.root, 'quiet')
    fs.mkdirSync(gx.quiet)
    gitIn(gx.quiet, ['init', '-q'])
    gitIn(gx.quiet, ['config', 'user.email', 'test@example.com'])
    commitIn(gx.quiet, 'q1.txt', 'feat: quiet old', '2026-10-12T09:00:00Z')
    commitIn(gx.quiet, 'q2.txt', 'fix: quiet today', '2026-10-26T00:20:00Z')
    writeLines(gx.main(gx.quiet, QSID), [
      human('2026-10-15T08:00:00.000Z', 'quiet work', gx.quiet),
      assistant('2026-10-15T08:05:00.000Z', gx.quiet, { blocks: [text('ok')], stop: 'end_turn' }),
    ], at('2026-10-15T08:05:00Z'))
  })
  after(() => cleanup(gx?.root))
  const runG = (opts = {}) => run(gx, { cacheDir: gx.cacheDir, ...opts })
  const hot = () => JSON.parse(fs.readFileSync(path.join(gx.cacheDir, 'cache-v1.json'), 'utf8'))
  const hotEdit = (edit) => {
    const c = hot()
    edit(c)
    fs.writeFileSync(path.join(gx.cacheDir, 'cache-v1.json'), JSON.stringify(c))
  }

  test('a repo with commits in range but no session in range is still a project', async () => {
    const m = await runG({ view: 'month' })
    assert.deepEqual([byName(m, 'quiet').sessions, byName(m, 'quiet').commits], [1, 2])
    const t = await runG({ view: 'today' })
    const q = byName(t, 'quiet')
    assert.ok(q, 'quiet is a project of today')
    assert.deepEqual([q.sessions, q.commits, q.agent_minutes, q.additions], [0, 1, 0, 4])
    assert.deepEqual(q.top_commits.map((c) => c.subject), ['fix: quiet today'])
    assert.equal(t.per_day['2026-10-26'].commits, t.totals.commits)
    const w = await runG({ view: 'week' })
    assert.deepEqual([byName(w, 'quiet').sessions, byName(w, 'quiet').commits], [0, 1])
  })

  test('a shorter re-list keeps the longer window\'s commits and their line stats', async () => {
    await runG({ view: 'month' })
    const c = hot()
    const key = Object.keys(c.git).find((k) => k.startsWith('log|') && k.endsWith(`${path.sep}quiet`))
    const old = c.git[key].commits.find((cm) => cm.subject === 'feat: quiet old')
    assert.ok(old?.stat)
    old.add = 999   // marker: survives only if line stats are carried over by sha, never recomputed
    for (const k of Object.keys(c.git[key].wins)) c.git[key].wins[k] -= 6 * 60e3   // every list is 6 min old
    c.git[key].refs = 'a ref moved since'
    fs.writeFileSync(path.join(gx.cacheDir, 'cache-v1.json'), JSON.stringify(c))
    await runG({ view: 'week' })   // re-lists the week window only
    const g = hot().git[key]
    assert.ok(g.commits.some((cm) => cm.subject === 'feat: quiet old' && cm.add === 999), 'month commits survive a week refresh')
    assert.equal(Object.keys(g.wins).length, 2)   // month start (6 min old) + week start (fresh)
    hotEdit((h) => { h.git[key].refs = 'a ref moved since' })
    const m = await runG({ view: 'month' })   // stale month window: re-listed, stats reused by sha
    assert.equal(byName(m, 'quiet').additions, 999 + 4)
  })

  /** A quiet repo's cached list, every window of it 6 min old (past the TTL), its subjects marked to tell a new list. */
  const staleList = (name) => {
    let key
    hotEdit((h) => {
      key = Object.keys(h.git).find((k) => k.startsWith('log|') && k.endsWith(`${path.sep}${name}`))
      for (const w of Object.keys(h.git[key].wins)) h.git[key].wins[w] -= 6 * 60e3
      for (const cm of h.git[key].commits) cm.subject = 'as listed before'
    })
    return key
  }
  const subjects = (f, name) => byName(f, name).top_commits.map((c) => c.subject)

  test('a repo no ref of which moved is not listed again, however old its list', async () => {
    await runG({ view: 'month' })
    const key = staleList('quiet')
    const f = await runG({ view: 'month' })
    assert.deepEqual([...new Set(subjects(f, 'quiet'))], ['as listed before'], 'the cached commits, no new list')
    assert.ok(Object.values(hot().git[key].wins).every((at) => Date.now() - at < 60e3), 'the list counts as fresh again')
  })

  test('a commit, on any branch, makes the next run list the repo again', async () => {
    await runG({ view: 'month' })
    staleList('quiet')
    gitIn(gx.quiet, ['checkout', '-q', '-b', 'feature/nested'])
    commitIn(gx.quiet, 'q3.txt', 'feat: on a nested branch', '2026-10-26T00:21:00Z')
    gitIn(gx.quiet, ['checkout', '-q', '-'])
    const f = await runG({ view: 'month' })
    assert.ok(subjects(f, 'quiet').includes('feat: on a nested branch'), 'the new branch folder moved refs/heads')
    staleList('quiet')
    gitIn(gx.quiet, ['checkout', '-q', 'feature/nested'])
    commitIn(gx.quiet, 'q4.txt', 'feat: a second one there', '2026-10-26T00:22:00Z')
    gitIn(gx.quiet, ['checkout', '-q', '-'])
    const g = await runG({ view: 'month' })
    assert.ok(subjects(g, 'quiet').includes('feat: a second one there'), 'refs/heads/feature moved, not refs/heads')
  })

  test('in the pane\'s runs a repo listed for the first time shows its commits at once, and their line stats a run later', async () => {
    const cacheDir = path.join(gx.root, 'series-cache')
    const first = await run(gx, { cacheDir, view: 'month', series: true })
    const q = byName(first, 'quiet')
    assert.ok(q.commits > 0)
    assert.equal(q.additions, 0)
    assert.ok(!first.notes.includes('git line stats partial (slow repo)'), 'nothing is slow about it')
    // a minute later, its list past the TTL
    const file = path.join(cacheDir, 'cache-v1.json')
    const c = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const g of Object.values(c.git)) {
      for (const k of Object.keys(g.wins ?? {})) g.wins[k] -= 6 * 60e3
      if (g.failedAt) g.failedAt -= 61e3
    }
    fs.writeFileSync(file, JSON.stringify(c))
    const later = await run(gx, { cacheDir, view: 'month', series: true })
    assert.equal(byName(later, 'quiet').additions, byName(later, 'quiet').commits * 4)
    // a one-shot run (the skill's) has no run after it: it reads them all at once
    const once = await run(gx, { cacheDir: path.join(gx.root, 'once-cache'), view: 'month' })
    assert.equal(byName(once, 'quiet').additions, byName(once, 'quiet').commits * 4)
  })

  test('a page of the past keeps the commits of its window: a run of the week listing again in between drops none of them', async () => {
    commitIn(gx.quiet, 'q-aug.txt', 'feat: quiet in August', '2026-08-12T09:00:00Z')
    await runG({ view: 'month' })   // the repo is remembered by its session of Oct 15
    const august = await runG({ view: 'month', back: 2 })
    assert.deepEqual([august.range.label, subjects(august, 'quiet')], ['August 2026', ['feat: quiet in August']])
    // minutes later a ref moved: the week lists its own window again, and saves the store
    hotEdit((h) => {
      const key = Object.keys(h.git).find((k) => k.startsWith('log|') && k.endsWith(`${path.sep}quiet`))
      for (const w of Object.keys(h.git[key].wins)) h.git[key].wins[w] -= 6 * 60e3
      h.git[key].refs = 'a ref moved since'
    })
    await runG({ view: 'week' })
    const again = await runG({ view: 'month', back: 2 })
    assert.deepEqual(subjects(again, 'quiet'), ['feat: quiet in August'], 'more than REPO_MS back, yet its window answers for it')
  })
})

describe('pages of the past', () => {
  let px
  const SUMMER = '55555555-0000-4000-8000-00000000000b'   // August, in summer/: a session with a subagent and a workflow run
  const AUTUMN = '55555555-0000-4000-8000-00000000000f'   // October 10, in autumn/: the same, after August, at no desk
  /** A session of `cwd` from `startIso` to `endIso`, with a subagent and a finished workflow run in the same hour. */
  const session = (cwd, sid, startIso, endIso) => {
    fs.mkdirSync(cwd, { recursive: true })
    const main = px.main(cwd, sid)
    writeLines(main, [human(startIso, 'work of the past', cwd), assistant(endIso, cwd, { blocks: [text('ok')], stop: 'end_turn' })], at(endIso))
    const dir = path.join(px.proj(cwd), sid)
    writeLines(path.join(dir, 'subagents', 'agent-a7777777777777777.jsonl'), [
      sideLine(userRaw(startIso, 'look around', cwd), 'a7777777777777777'),
      sideLine(assistant(endIso, cwd, { blocks: [text('done')], stop: 'end_turn' }), 'a7777777777777777'),
    ], at(endIso))
    writeJson(path.join(dir, 'workflows', `wf_${sid.slice(-8)}-1.json`), {
      runId: `wf_${sid.slice(-8)}-1`, workflowName: 'past-flow', status: 'completed', agentCount: 1, startTime: at(startIso), timestamp: endIso,
    }, at(endIso))
    return { main, dir }
  }
  before(() => {
    px = buildFakeClaude()
    px.summer = path.join(px.root, 'summer')
    px.autumn = path.join(px.root, 'autumn')
    session(px.summer, SUMMER, '2026-08-20T09:00:00.000Z', '2026-08-20T09:30:00.000Z')
    session(px.autumn, AUTUMN, '2026-10-10T09:00:00.000Z', '2026-10-10T09:30:00.000Z')
    // away/: a repo Claude Code was opened in, with no session left and none lately; stale/: one whose refs last moved in June
    px.away = path.join(px.root, 'away')
    px.stale = path.join(px.root, 'stale')
    for (const repo of [px.away, px.stale]) {
      fs.mkdirSync(repo)
      gitIn(repo, ['init', '-q'])
      gitIn(repo, ['config', 'user.email', 'test@example.com'])
    }
    commitIn(px.away, 'a1.txt', 'feat: away in August', '2026-08-12T09:00:00Z')
    commitIn(px.away, 'a2.txt', 'feat: away in October', '2026-10-20T09:00:00Z')
    commitIn(px.stale, 's1.txt', 'feat: stale in June', '2026-06-10T09:00:00Z')
    for (const p of [['refs', 'heads'], ['refs', 'tags'], ['logs', 'HEAD']]) setMtime(path.join(px.stale, '.git', ...p), at('2026-06-10T09:00:00Z'))
    // Claude Code's own config beside its folder: the folders it was opened in, and secrets the collector never keeps
    writeJson(path.join(px.root, '.claude.json'), {
      projects: { [px.away]: {}, [px.stale]: {}, [path.join(px.root, 'nowhere')]: {} }, mcpServers: { x: { env: { KEY: 'never-kept-secret' } } },
    })
  })
  after(() => cleanup(px?.root))
  const runP = (opts = {}) => run(px, { cacheDir: px.cacheDir, ...opts })
  const tier = (name) => {
    try { return JSON.parse(fs.readFileSync(path.join(px.cacheDir, name), 'utf8')) } catch { return { files: {}, git: {} } }
  }
  const hotEdit = (edit) => {
    const c = tier('cache-v1.json')
    edit(c)
    fs.writeFileSync(path.join(px.cacheDir, 'cache-v1.json'), JSON.stringify(c))
  }
  const subjects = (f, name) => byName(f, name)?.top_commits.map((c) => c.subject) ?? []
  const counts = (f, name) => {
    const p = byName(f, name)
    return p ? [p.sessions, p.subagents, p.workflows] : [0, 0, 0]
  }

  /** The git commands a run gives, by GIT_TRACE: the lines of `git log` and the repos they asked. */
  const traced = async (opts) => {
    const trace = path.join(px.root, `git-trace-${Math.random().toString(36).slice(2)}.log`)
    process.env.GIT_TRACE = trace
    let f
    try {
      f = await runP(opts)
    } finally {
      delete process.env.GIT_TRACE
    }
    const lines = fs.existsSync(trace) ? fs.readFileSync(trace, 'utf8').split('\n') : []
    return { f, logs: lines.filter((l) => / log --branches/.test(l)), lines }
  }

  test('a page of the past finds the commits of every repo Claude Code was opened in, and asks git from its own first day', async () => {
    const { f: aug, logs } = await traced({ view: 'month', back: 2 })
    assert.equal(aug.range.label, 'August 2026')
    assert.deepEqual([subjects(aug, 'away'), byName(aug, 'away').additions], [['feat: away in August'], 4])
    // from the page's first day, with no end: an amend or a rebase after it dates the commit after it, not its writing
    assert.ok(logs.length > 0 && logs.every((l) => l.includes('--since=2026-07-31T22:00:00.000Z') && !l.includes('--until=')), logs.join('\n'))
    const store = tier('cache-v1.json').git[`page|${px.away}`]
    assert.deepEqual(store.commits.map((cm) => cm.subject), ['feat: away in August'], 'nothing written after August is kept for it')
    assert.ok(tier('cache-v1.json').git[`page|${px.stale}`], 'a repo never listed is asked, whatever its refs say: their folders are not known yet')
    assert.ok(!fs.readFileSync(path.join(px.cacheDir, 'cache-v1.json'), 'utf8').includes('never-kept-secret'))
  })

  test('a commit written in a page and amended after it counts on the page', async () => {
    fs.writeFileSync(path.join(px.away, 'a4.txt'), 'amended\n')
    gitIn(px.away, ['add', 'a4.txt'])
    gitIn(px.away, ['-c', 'user.email=test@example.com', '-c', 'user.name=Tester', 'commit', '-q', '-m', 'fix: away, written in August, amended in September'],
      { GIT_AUTHOR_DATE: '2026-08-30T20:00:00Z', GIT_COMMITTER_DATE: '2026-09-02T09:00:00Z' })
    hotEdit((h) => { for (const p of Object.values(h.git[`page|${px.away}`].pages)) p.at -= 2 * 864e5 })
    const aug = await runP({ view: 'month', back: 2 })
    assert.deepEqual(subjects(aug, 'away'), ['fix: away, written in August, amended in September', 'feat: away in August'])
    assert.equal(aug.per_day['2026-08-30'].commits, 1)
  })

  test('a page listed stands a day, then as long as no ref moves', async () => {
    await runP({ view: 'month', back: 2 })
    const key = `page|${px.away}`
    const mark = () => hotEdit((h) => { for (const cm of h.git[key].commits) cm.subject = 'as listed before' })
    const age = () => hotEdit((h) => { for (const p of Object.values(h.git[key].pages)) p.at -= 2 * 864e5 })
    const august = async () => [...new Set(subjects(await runP({ view: 'month', back: 2 }), 'away'))]
    mark()
    assert.deepEqual(await august(), ['as listed before'], 'within the day, no git')
    commitIn(px.away, 'a2b.txt', 'feat: away this morning', '2026-10-25T08:00:00Z')
    assert.deepEqual(await august(), ['as listed before'], 'within the day, a ref moved: still no git')
    age()
    assert.ok((await august()).includes('feat: away in August'), 'a day on, that ref moved: listed again')
    mark()
    age()
    assert.deepEqual(await august(), ['as listed before'], 'a day on, no ref moved')
    commitIn(px.away, 'a3.txt', 'feat: away today', '2026-10-25T09:00:00Z')
    assert.ok((await august()).includes('feat: away in August'), 'a ref moved: listed again')
  })

  test('a repo listed before whose refs have not moved since a page began is not asked for it', async () => {
    assert.deepEqual(subjects(await runP({ view: 'month', back: 4 }), 'stale'), ['feat: stale in June'])
    const july = await runP({ view: 'month', back: 3 })
    assert.equal(july.range.label, 'July 2026')
    assert.equal(byName(july, 'stale'), undefined)
    const pages = tier('cache-v1.json').git[`page|${px.stale}`].pages
    assert.ok(!(`${Date.parse(july.range.from)}-${Date.parse(july.range.to)}` in pages), 'no git for it')
    assert.ok(`${Date.parse(july.range.from)}-${Date.parse(july.range.to)}` in tier('cache-v1.json').git[`page|${px.away}`].pages)
  })

  test('a store of pages the wrong shape is listed again, never the end of the run', async () => {
    hotEdit((h) => {
      for (const k of [`page|${px.away}`, `page|${px.stale}`]) h.git[k].refDirs = { not: 'a list' }
      for (const p of Object.values(h.git[`page|${px.away}`].pages)) p.at -= 2 * 864e5
    })
    const aug = await runP({ view: 'month', back: 2 })
    assert.ok(subjects(aug, 'away').includes('feat: away in August'))
    assert.ok(!aug.notes.some((n) => /git failed/.test(n)), aug.notes.join('; '))
  })

  test('a page lists the rooms that worked in it, busiest first, and none that only has a desk open now', async () => {
    const aug = await runP({ view: 'month', back: 2 })
    assert.ok(aug.live.desks.length > 0, 'the floor of now is in the facts')
    assert.deepEqual(aug.projects.map((p) => p.name), ['summer', 'away'])
    assert.equal(aug.totals.projects, 2)
  })

  test('a page of the past reads nothing of a session begun after it, and all of one begun in it', async (t) => {
    await runP({ view: 'month' })   // the cache knows when the month's sessions began
    const listed = []
    const readdir = fs.readdirSync
    t.mock.method(fs, 'readdirSync', function (dir, ...more) {
      listed.push(String(dir))
      return readdir.call(this, dir, ...more)
    })
    const aug = await runP({ view: 'month', back: 2 })
    assert.ok(!listed.includes(path.join(px.proj(px.autumn), AUTUMN, 'subagents')), 'a session of October: not a folder of it is listed')
    assert.ok(listed.includes(path.join(px.proj(px.summer), SUMMER, 'subagents')))
    assert.deepEqual(counts(aug, 'summer'), [1, 1, 1])
    assert.equal(byName(aug, 'autumn'), undefined)
    // a day cut in another zone (the cold tier keeps them as they were lived) may fall on the page however late it began
    const file = ['cache-v1.json', 'cache-v1-cold.json'].find((name) => Object.keys(tier(name).files).some((k) => k.endsWith(`${AUTUMN}.jsonl`)))
    const c = tier(file)
    const k = Object.keys(c.files).find((x) => x.endsWith(`${AUTUMN}.jsonl`))
    c.files[k].days['2026-08-31'] = c.files[k].days['2026-10-10']
    fs.writeFileSync(path.join(px.cacheDir, file), JSON.stringify(c))
    assert.equal(byName(await runP({ view: 'month', back: 2 }), 'autumn')?.sessions, 1)
  })

  test('a page of the past counts the sessions Claude Code\'s old index names, with no agent-time, and none twice', async () => {
    const winter = path.join(px.root, 'winter')
    fs.mkdirSync(winter)
    const entry = (sessionId, created, modified, extra = {}) => ({
      sessionId, fullPath: path.join(px.proj(winter), `${sessionId}.jsonl`), fileMtime: at(modified), firstPrompt: 'never-shown-prompt',
      messageCount: 12, created, modified, gitBranch: 'main', projectPath: winter, isSidechain: false, ...extra,
    })
    writeJson(path.join(px.proj(winter), 'sessions-index.json'), { version: 1, originalPath: winter, entries: [
      entry('11111111-0000-4000-8000-0000000000a1', '2026-01-14T22:58:41.962Z', '2026-01-15T05:26:02.381Z'),   // Paris: 14th → 15th
      entry('11111111-0000-4000-8000-0000000000a2', '2026-01-20T09:00:00.000Z', '2026-01-20T10:00:00.000Z', { isSidechain: true }),
      entry(SUMMER, '2026-01-21T09:00:00.000Z', '2026-01-21T10:00:00.000Z'),   // its transcript is there: it counts from that
      entry('11111111-0000-4000-8000-0000000000a3', '2025-12-30T09:00:00.000Z', '2025-12-30T10:00:00.000Z'),
      entry('11111111-0000-4000-8000-0000000000a4', '2026-10-21T09:00:00.000Z', '2026-10-21T10:00:00.000Z'),   // in the week of now
      { sessionId: 42, created: 'never' },
    ] })
    // ledger/: a room of January with a commit and no session
    const ledger = path.join(px.root, 'ledger')
    fs.mkdirSync(ledger)
    gitIn(ledger, ['init', '-q'])
    gitIn(ledger, ['config', 'user.email', 'test@example.com'])
    commitIn(ledger, 'l1.txt', 'feat: ledger in January', '2026-01-22T09:00:00Z')
    const config = JSON.parse(fs.readFileSync(path.join(px.root, '.claude.json'), 'utf8'))
    writeJson(path.join(px.root, '.claude.json'), { ...config, projects: { ...config.projects, [ledger]: {} } })
    const jan = await runP({ view: 'month', back: 9 })
    assert.equal(jan.range.label, 'January 2026')
    const w = byName(jan, 'winter')
    assert.deepEqual([w.sessions, w.agent_minutes, jan.totals.sessions, jan.sources.sessions_indexed], [1, 0, 1, 1])
    assert.deepEqual(['2026-01-14', '2026-01-15', '2026-01-21'].map((d) => jan.per_day[d].sessions), [1, 1, 0])
    assert.deepEqual(jan.projects.map((p) => [p.name, p.sessions, p.commits]), [['winter', 1, 0], ['ledger', 0, 1]], 'no agent-time: sessions, then commits')
    assert.equal(jan.accounts.find((a) => a.agent === 'claude')?.sessions, 1, 'the crew has its sessions')
    assert.ok(!JSON.stringify(jan).includes('never-shown-prompt'))
    const week = await runP({ view: 'week' })
    assert.deepEqual([week.sources.sessions_indexed, byName(week, 'winter')], [0, undefined], 'a range of now never reads it')
  })

})

describe('what Claude Code\'s cleanup deleted', () => {
  let kx
  const sid = (n) => `44444444-0000-4000-8000-${String(n).padStart(12, '0')}`
  const AUG = sid(1)      // the CLI's, August (the archive tier): deleted by the cleanup
  const SEPT = sid(2)     // the CLI's, September (the cold tier): deleted by the cleanup
  const DESK = sid(3)     // the desktop app's, August: deleted
  const MARKED = sid(4)   // the CLI's, August, with the desktop app's release marker beside it
  const MIXED = sid(5)    // begun in the desktop app, resumed in the CLI, August
  const NOSRC = sid(6)    // August, no line says where it ran
  const YOUNG = sid(7)    // the CLI's, six days old: deleted by hand
  const saved = process.env.CLAUDE_CONFIG_DIR
  /**
   * A session of `<name>/` from `startIso` to `endIso` in the Claude folder `dir`, with a subagent and a finished workflow
   * run; its lines say they ran in `entrypoint` (a list: line by line, the last for the rest; null: they say nothing).
   */
  const session = (name, id, startIso, endIso, { entrypoint = 'cli', dir = kx.claudeDir } = {}) => {
    const cwd = path.join(kx.root, name)
    fs.mkdirSync(cwd, { recursive: true })
    const eps = [entrypoint].flat()
    const ep = (o, i) => {
      const { entrypoint: _, ...rest } = o
      const to = eps[Math.min(i, eps.length - 1)]
      return to === null ? rest : { ...o, entrypoint: to }
    }
    const pd = path.join(dir, 'projects', enc(cwd))
    const main = path.join(pd, `${id}.jsonl`)
    writeLines(main, [ep(human(startIso, 'work of the past', cwd), 0), ep(assistant(endIso, cwd, { blocks: [text('ok')], stop: 'end_turn' }), 1)], at(endIso))
    const folder = path.join(pd, id)
    writeLines(path.join(folder, 'subagents', 'agent-a7777777777777777.jsonl'), [
      sideLine(ep(userRaw(startIso, 'look around', cwd), 0), 'a7777777777777777'),
      sideLine(ep(assistant(endIso, cwd, { blocks: [text('done')], stop: 'end_turn' }), 1), 'a7777777777777777'),
    ], at(endIso))
    writeJson(path.join(folder, 'workflows', `wf_${id.slice(-8)}-1.json`), {
      runId: `wf_${id.slice(-8)}-1`, workflowName: 'past-flow', status: 'completed', agentCount: 1, startTime: at(startIso), timestamp: endIso,
    }, at(endIso))
    // its folders were written then too: a range after it lists none of them
    for (const dir of [path.join(folder, 'subagents'), path.join(folder, 'workflows'), folder]) setMtime(dir, at(endIso))
    return { id, pd, main, folder }
  }
  /** What Claude Code's cleanup, or a hand, does: the transcript and the session's folder go. */
  const erase = (s) => {
    fs.rmSync(s.main)
    fs.rmSync(s.folder, { recursive: true })
  }
  const release = (s) => writeJson(path.join(s.pd, `${s.id}.desktop-released.json`), { v: 1, releasedAt: FROZEN, reason: 'delete' })
  before(() => {
    // a Claude folder of the person's environment would be read as one more account
    delete process.env.CLAUDE_CONFIG_DIR
    kx = buildFakeClaude({ withGit: false })
    kx.managed = path.join(kx.root, 'managed-settings.json')
    kx.settings = path.join(kx.claudeDir, 'settings.json')
  })
  after(() => {
    if (saved !== undefined) process.env.CLAUDE_CONFIG_DIR = saved
    cleanup(kx?.root)
  })
  const runK = (opts = {}) => run(kx, { cacheDir: kx.cacheDir, git: false, managedSettings: kx.managed, ...opts })
  const TIERS = ['cache-v1.json', 'cache-v1-cold.json', 'cache-v1-archive.json']
  const tier = (name, cacheDir = kx.cacheDir) => {
    try { return JSON.parse(fs.readFileSync(path.join(cacheDir, name), 'utf8')) } catch { return { files: {}, wf: {} } }
  }
  /** Every key of the cache's three files that names `id`. */
  const keysOf = (id, cacheDir = kx.cacheDir) => TIERS.map((n) => tier(n, cacheDir))
    .flatMap((c) => [...Object.keys(c.files ?? {}), ...Object.keys(c.wf ?? {})]).filter((k) => k.includes(id))
  /** The entry of a session's main transcript, and the file of the cache it is in. */
  const mainOf = (id, cacheDir = kx.cacheDir) => {
    for (const name of TIERS) {
      const c = tier(name, cacheDir)
      const k = Object.keys(c.files ?? {}).find((x) => x.endsWith(`${id}.jsonl`))
      if (k) return { name, k, e: c.files[k] }
    }
    return null
  }
  const counts = (f, name) => {
    const p = byName(f, name)
    return p ? [p.sessions, p.subagents, p.workflows] : [0, 0, 0]
  }
  /** A copy of the cache, for runs at another time that must not move this one's tiers. */
  const copyCache = (name) => {
    const dir = path.join(kx.root, name)
    fs.cpSync(kx.cacheDir, dir, { recursive: true })
    return dir
  }
  /** The next run's upkeep moves what aged out of the cold tier to the archive. */
  const archiveDue = () => {
    const hot = path.join(kx.cacheDir, 'cache-v1.json')
    fs.writeFileSync(hot, JSON.stringify({ ...JSON.parse(fs.readFileSync(hot, 'utf8')), archiveAt: NOW - ARCHIVE_EVERY_MS - 1 }))
  }

  test('a session Claude Code\'s cleanup deleted still counts where it was lived; one the desktop app or a hand deleted, or of no known source, is gone for good', async () => {
    const august = [
      session('august', AUG, '2026-08-05T09:00:00.000Z', '2026-08-05T09:40:00.000Z'),
      session('deskapp', DESK, '2026-08-06T09:00:00.000Z', '2026-08-06T09:40:00.000Z', { entrypoint: 'claude-desktop' }),
      session('marked', MARKED, '2026-08-07T09:00:00.000Z', '2026-08-07T09:40:00.000Z'),
      session('mixed', MIXED, '2026-08-08T09:00:00.000Z', '2026-08-08T09:40:00.000Z', { entrypoint: ['claude-desktop', 'cli'] }),
      session('nosource', NOSRC, '2026-08-09T09:00:00.000Z', '2026-08-09T09:40:00.000Z', { entrypoint: null }),
    ]
    const sept = session('september', SEPT, '2026-09-10T09:00:00.000Z', '2026-09-10T09:30:00.000Z')
    const names = ['august', 'deskapp', 'marked', 'mixed', 'nosource']
    const first = await runK({ view: 'month', back: 2 })
    assert.deepEqual(names.map((n) => counts(first, n)), names.map(() => [1, 1, 1]))
    assert.deepEqual(counts(await runK({ view: 'month', back: 1 }), 'september'), [1, 1, 1])
    for (const s of [...august, sept]) erase(s)
    release(august[2])
    // September alone (the cold tier): decided, and saved with its tier
    const sep = await runK({ view: 'month', back: 1 })
    assert.deepEqual(counts(sep, 'september'), [1, 1, 1])
    assert.deepEqual([mainOf(SEPT).name, Number.isFinite(mainOf(SEPT).e.kept)], ['cache-v1-cold.json', true])
    const aug = await runK({ view: 'month', back: 2 })
    assert.deepEqual(names.map((n) => counts(aug, n)), [[1, 1, 1], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]])
    assert.equal(byName(aug, 'august').agent_minutes, byName(first, 'august').agent_minutes, 'its agent-time with it')
    assert.equal(aug.sources.sessions_kept, 1)
    const crew = aug.accounts.find((a) => a.agent === 'claude')
    assert.deepEqual([crew.sessions, crew.minutes], [1, byName(first, 'august').agent_minutes], 'the crew has it')
    assert.deepEqual([mainOf(AUG).name, Number.isFinite(mainOf(AUG).e.kept), mainOf(AUG).e.runs.length], ['cache-v1-archive.json', true, 1],
      'its workflow run moved into it, its json gone with its folder')
    for (const id of [DESK, MARKED, MIXED, NOSRC]) assert.deepEqual(keysOf(id), [], `${id}: nothing of it is left to come back`)
    assert.deepEqual(counts(await runK({ view: 'week' }), 'august'), [0, 0, 0], 'a range of now has none of August')
  })

  test('every entrypoint of the desktop app is the desktop app\'s; any other, the cleanup\'s to take', async () => {
    const eps = { 'claude-desktop-3p': 0, 'local-agent': 0, local_agent: 0, 'sdk-ts': 1, 'sdk-cli': 1, 'claude-vscode': 1 }
    const made = Object.keys(eps).map((ep, i) => session(`ep-${ep}`, sid(40 + i), `2026-08-2${i}T09:00:00.000Z`, `2026-08-2${i}T09:30:00.000Z`, { entrypoint: ep }))
    await runK({ view: 'month', back: 2 })
    for (const s of made) erase(s)
    const aug = await runK({ view: 'month', back: 2 })
    assert.deepEqual(Object.keys(eps).map((ep) => counts(aug, `ep-${ep}`)[0]), Object.values(eps))
  })

  test('a session deleted by hand before it aged never comes back, however old it gets', async () => {
    const young = session('young', YOUNG, '2026-10-20T09:00:00.000Z', '2026-10-20T09:20:00.000Z')
    session('staying', sid(8), '2026-09-02T09:00:00.000Z', '2026-09-02T09:30:00.000Z')
    await runK({ view: 'month', back: 1 })
    assert.deepEqual(counts(await runK({ view: 'month' }), 'young'), [1, 1, 1])
    erase(young)
    assert.deepEqual(counts(await runK({ view: 'month' }), 'young'), [0, 0, 0])
    assert.deepEqual(keysOf(YOUNG), [])
    assert.equal(keysOf(sid(8)).length, 3, 'a session that is there keeps its subagent and run, out of the range as it is')
    const oct = await runK({ view: 'month', back: 2, now: NOW + 40 * 864e5, cacheDir: copyCache('cache-later') })
    assert.equal(oct.range.label, 'October 2026')
    assert.deepEqual(counts(oct, 'young'), [0, 0, 0])
  })

  test('raising cleanupPeriodDays later drops nothing the cleanup took', async () => {
    writeJson(kx.settings, { cleanupPeriodDays: 400 })
    try {
      assert.deepEqual(counts(await runK({ view: 'month', back: 1 }), 'september'), [1, 1, 1])
      assert.deepEqual(counts(await runK({ view: 'month', back: 2 }), 'august'), [1, 1, 1])
    } finally {
      fs.rmSync(kx.settings)
    }
  })

  let short = 100
  const put = (file, o) => (o == null ? fs.rmSync(file, { force: true }) : fs.writeFileSync(file, typeof o === 'string' ? o : JSON.stringify(o)))
  const KEPT = [1, 1, 1]
  const GONE = [0, 0, 0]
  /**
   * A session six days old run in `entrypoint`, read, then deleted, under these settings (the folder's, the managed ones):
   * what the next run counts of it, and with `fixed`, what one counts once the folder's settings say that and the managed
   * ones nothing.
   */
  const fate = async (mine, managed, { entrypoint = 'cli', fixed = null } = {}) => {
    const name = `short-${short}`
    const cacheDir = path.join(kx.root, `cache-${short}`)
    put(kx.settings, mine)
    put(kx.managed, managed)
    try {
      const s = session(name, sid(short++), '2026-10-20T09:00:00.000Z', '2026-10-20T09:20:00.000Z', { entrypoint })
      await runK({ view: 'month', cacheDir })
      erase(s)
      const out = [counts(await runK({ view: 'month', cacheDir }), name)]
      if (fixed) {
        // nothing was decided: the entry waits, counted nowhere, for settings that read
        assert.deepEqual([mainOf(s.id, cacheDir)?.e.kept, keysOf(s.id, cacheDir).length], [undefined, 3])
        put(kx.settings, fixed)
        put(kx.managed, null)
        out.push(counts(await runK({ view: 'month', cacheDir }), name))
      }
      return out
    } finally {
      put(kx.settings, null)
      put(kx.managed, null)
    }
  }

  test('how long a folder keeps transcripts: the managed settings\' cleanupPeriodDays, else its own, else 30 days; settings that do not read decide nothing', async () => {
    const fixed = { cleanupPeriodDays: 3 }
    assert.deepEqual(await fate({ cleanupPeriodDays: 3 }, null), [KEPT])
    assert.deepEqual(await fate(null, null), [GONE], '30 days by default')
    assert.deepEqual(await fate({ cleanupPeriodDays: 30 }, { cleanupPeriodDays: 3 }), [KEPT], 'the managed settings win')
    assert.deepEqual(await fate({ cleanupPeriodDays: 3 }, { cleanupPeriodDays: 60 }), [GONE], 'however long they keep them')
    assert.deepEqual(await fate('{ "cleanupPeriodDays": 3', null, { fixed }), [GONE, KEPT])
    assert.deepEqual(await fate({ cleanupPeriodDays: 3 }, '[]', { fixed }), [GONE, KEPT], 'settings that are not an object do not read')
    assert.deepEqual(await fate({ cleanupPeriodDays: 0 }, null, { fixed }), [GONE, KEPT], 'a number of days Claude Code refuses holds its cleanup')
  })

  test('the desktop app\'s sessions are kept at any age, unless desktopSessionCleanupPeriodDays or the managed settings say how long', async () => {
    const desk = (mine, managed, fixed = null) => fate(mine, managed, { entrypoint: 'claude-desktop', fixed })
    assert.deepEqual(await desk({ cleanupPeriodDays: 3 }, null), [GONE], 'kept at any age: one that went was deleted')
    assert.deepEqual(await desk({ cleanupPeriodDays: 3, desktopSessionCleanupPeriodDays: 5 }, null), [KEPT])
    assert.deepEqual(await desk({ cleanupPeriodDays: 3, desktopSessionCleanupPeriodDays: 7 }, null), [GONE])
    assert.deepEqual(await desk({ desktopSessionCleanupPeriodDays: 5 }, null), [GONE], 'once older than cleanupPeriodDays too')
    assert.deepEqual(await desk(null, { cleanupPeriodDays: 3 }), [KEPT], 'a cleanupPeriodDays of the managed settings ends the exemption')
    assert.deepEqual(await desk({ cleanupPeriodDays: 3, desktopSessionCleanupPeriodDays: 5 }, { desktopSessionCleanupPeriodDays: 0 }), [GONE],
      'the managed settings win, and 0 is no limit')
    assert.deepEqual(await desk({ cleanupPeriodDays: 3, desktopSessionCleanupPeriodDays: -1 }, null, { cleanupPeriodDays: 3, desktopSessionCleanupPeriodDays: 5 }),
      [GONE, KEPT], 'a number of days Claude Code refuses decides nothing')
  })

  test('a project folder removed by hand: what had aged as the cleanup takes it stays, the rest goes', async () => {
    const old = session('removed', sid(10), '2026-08-12T09:00:00.000Z', '2026-08-12T09:30:00.000Z')
    session('removed', sid(11), '2026-10-21T09:00:00.000Z', '2026-10-21T09:30:00.000Z')
    assert.deepEqual(counts(await runK({ view: 'month', back: 2 }), 'removed'), [1, 1, 1])
    assert.deepEqual(counts(await runK({ view: 'month' }), 'removed'), [1, 1, 1])
    fs.rmSync(old.pd, { recursive: true })
    assert.deepEqual(counts(await runK({ view: 'month', back: 2 }), 'removed'), [1, 1, 1])
    assert.deepEqual(counts(await runK({ view: 'month' }), 'removed'), [0, 0, 0])
    assert.deepEqual(keysOf(sid(11)), [])
  })

  test('a subagent left in the archive by a session deleted since goes once the archive is read', async () => {
    const id = sid(25)
    const cwd = path.join(kx.root, 'resumed')
    fs.mkdirSync(cwd, { recursive: true })
    const main = kx.main(cwd, id)
    const cli = (o) => ({ ...o, entrypoint: 'cli' })
    const done = (iso) => cli(assistant(iso, cwd, { blocks: [text('ok')], stop: 'end_turn' }))
    // begun in August with a subagent, resumed last week, then deleted by hand
    writeLines(main, [cli(human('2026-08-15T09:00:00.000Z', 'begin', cwd)), done('2026-08-15T09:10:00.000Z'),
      cli(human('2026-10-21T09:00:00.000Z', 'resume', cwd)), done('2026-10-21T09:10:00.000Z')], at('2026-10-21T09:10:00.000Z'))
    writeLines(path.join(kx.proj(cwd), id, 'subagents', 'agent-a7777777777777777.jsonl'), [
      sideLine(cli(userRaw('2026-08-15T09:01:00.000Z', 'look', cwd)), 'a7777777777777777'), sideLine(done('2026-08-15T09:05:00.000Z'), 'a7777777777777777'),
    ], at('2026-08-15T09:05:00.000Z'))
    archiveDue()
    await runK({ view: 'month', back: 2 })
    erase({ main, folder: path.join(kx.proj(cwd), id) })
    await runK({ view: 'month' })
    assert.deepEqual(keysOf(id).map((k) => path.basename(k)), ['agent-a7777777777777777.jsonl'], 'its subagent waits in the archive, counted nowhere')
    await runK({ view: 'month', back: 2 })
    assert.deepEqual(keysOf(id), [])
  })

  test('a subagent or a run deleted from a session that is there goes from the cache', async () => {
    const json = path.join(kx.proj(kx.repo), SID.A, 'workflows', 'wf_bbbbbbbb-222.json')
    const sub = path.join(kx.proj(kx.repo), SID.A, 'subagents', 'agent-a2222222222222222.jsonl')
    await runK({ view: 'month' })
    assert.deepEqual([keysOf('wf_bbbbbbbb-222.json').length, keysOf('agent-a2222222222222222.jsonl').length], [1, 1])
    fs.rmSync(json)
    fs.rmSync(sub)
    await runK({ view: 'month' })
    assert.deepEqual([keysOf('wf_bbbbbbbb-222.json'), keysOf('agent-a2222222222222222.jsonl')], [[], []])
  })

  test('a listing that does not answer, or a walk cut short, takes nothing for gone', { skip: process.getuid?.() === 0 }, async (t) => {
    const projects = path.join(kx.claudeDir, 'projects')
    const nothingDropped = async (why) => {
      const f = await runK({ view: 'month' })
      assert.equal(f.sources.files_from_cache, f.sources.files_scanned, `${why}: nothing was dropped, nothing read again`)
    }
    await runK({ view: 'month' })
    for (const dir of [projects, kx.proj(kx.repo)]) {
      const mode = fs.statSync(dir).mode & 0o777
      fs.chmodSync(dir, 0o000)
      try { await runK({ view: 'month' }) } finally { fs.chmodSync(dir, mode) }
      await nothingDropped(path.basename(dir))
    }
    // the walk stops in the folder of repo/, which it had just listed
    const readdir = fs.readdirSync
    const cut = t.mock.method(fs, 'readdirSync', function (dir, ...more) {
      const out = readdir.call(this, dir, ...more)
      if (String(dir) !== kx.proj(kx.repo)) return out
      return out.map((d) => Object.assign(Object.create(Object.getPrototypeOf(d)), d, { isDirectory() { throw new Error('cut short') } }))
    })
    await runK({ view: 'month' })
    cut.mock.restore()
    await nothingDropped('a walk cut short')
  })

  test('a run of another Claude folder on the same cache neither counts nor judges this one\'s sessions, nor this one its', async () => {
    const other = path.join(kx.root, 'other-claude')
    fs.mkdirSync(path.join(other, 'sessions'), { recursive: true })
    const theirs = session('elsewhere', sid(20), '2026-08-14T09:00:00.000Z', '2026-08-14T09:30:00.000Z', { dir: other })
    const runO = (opts = {}) => runK({ view: 'month', back: 2, claudeDir: other, ...opts })
    await runK({ view: 'month', back: 2 })
    const o1 = await runO()
    assert.deepEqual([counts(o1, 'august'), counts(o1, 'elsewhere')], [[0, 0, 0], [1, 1, 1]])
    assert.ok(keysOf(sid(20)).length > 0 && keysOf(sid(20)).every((k) => k.startsWith('@claude=')), 'its files are keyed apart')
    const mine = await runK({ view: 'month', back: 2 })
    assert.deepEqual([counts(mine, 'august'), counts(mine, 'elsewhere')], [[1, 1, 1], [0, 0, 0]])
    assert.equal(mine.sources.files_from_cache, mine.sources.files_scanned, 'nothing of this folder was taken for gone')
    // the other folder's own session, deleted by its cleanup: kept for its runs
    erase(theirs)
    assert.deepEqual(counts(await runO(), 'elsewhere'), [1, 1, 1])
    assert.deepEqual(counts(await runK({ view: 'month', back: 2 }), 'elsewhere'), [0, 0, 0])
    // a cache from before folders were recorded: the default folder takes it, one given explicitly only if it has no such keys
    const legacy = copyCache('cache-legacy')
    const hot = path.join(legacy, 'cache-v1.json')
    fs.writeFileSync(hot, JSON.stringify({ ...JSON.parse(fs.readFileSync(hot, 'utf8')), claude: undefined }))
    assert.deepEqual(counts(await runO({ cacheDir: legacy }), 'august'), [0, 0, 0])
    fs.symlinkSync(kx.claudeDir, path.join(kx.root, '.claude'))
    try {
      const def = await runK({ view: 'month', back: 2, cacheDir: legacy, claudeDir: undefined, home: kx.root, agents: ['claude'] })
      assert.deepEqual(counts(def, 'august'), [1, 1, 1])
    } finally {
      fs.rmSync(path.join(kx.root, '.claude'))
    }
  })

  test('a kept session of another account counts in the runs that read that account', async () => {
    const root = fs.mkdtempSync(path.join(kx.root, 'accounts-'))
    const work = path.join(root, '.claude-work')
    fs.mkdirSync(path.join(work, 'sessions'), { recursive: true })
    fs.symlinkSync(kx.claudeDir, path.join(root, '.claude'))
    const s = session('worked', sid(21), '2026-08-15T09:00:00.000Z', '2026-08-15T09:30:00.000Z', { dir: work })
    const cacheDir = path.join(root, 'cache')
    const both = () => runK({ view: 'month', back: 2, cacheDir, claudeDir: undefined, home: root, agents: ['claude'] })
    assert.deepEqual(counts(await both(), 'worked'), [1, 1, 1])
    erase(s)
    const f = await both()
    assert.deepEqual(counts(f, 'worked'), [1, 1, 1])
    assert.equal(f.accounts.find((a) => a.label === 'work')?.sessions, 1)
    assert.ok(keysOf(sid(21), cacheDir).every((k) => k.startsWith('@claude.work/')))
    assert.deepEqual(counts(await runK({ view: 'month', back: 2, cacheDir }), 'worked'), [0, 0, 0], 'a run of the main folder alone')
  })

  test('a cache started over keeps what the cleanup took, from every tier: the only copy there is', async () => {
    // one kept in the hot tier too: a cleanup of three days took a session of six
    writeJson(kx.settings, { cleanupPeriodDays: 3 })
    try {
      const s = session('hotkept', sid(22), '2026-10-20T09:00:00.000Z', '2026-10-20T09:20:00.000Z')
      await runK({ view: 'month' })
      erase(s)
      assert.deepEqual(counts(await runK({ view: 'month' }), 'hotkept'), [1, 1, 1])
    } finally {
      fs.rmSync(kx.settings)
    }
    assert.equal(mainOf(sid(22)).name, 'cache-v1.json')
    assert.deepEqual(counts(await runK({ view: 'week', resetCache: true }), 'hotkept'), [1, 1, 1])
    assert.deepEqual([mainOf(SEPT).name, mainOf(AUG).name], ['cache-v1-cold.json', 'cache-v1-archive.json'], 'each stays in its tier')
    assert.deepEqual(counts(await runK({ view: 'month', back: 1, resetCache: true }), 'september'), [1, 1, 1])
    assert.deepEqual(counts(await runK({ view: 'month', back: 2, resetCache: true }), 'august'), [1, 1, 1])
    assert.deepEqual(counts(await runK({ view: 'week' }), 'hotkept'), [1, 1, 1])
    assert.deepEqual(counts(await runK({ view: 'month', back: 1 }), 'september'), [1, 1, 1])
    assert.deepEqual(counts(await runK({ view: 'month', back: 2 }), 'august'), [1, 1, 1])
    // a hot tier cut in other offsets is read again, but for what no file can give back: its days stay as they were lived
    const hot = path.join(kx.cacheDir, 'cache-v1.json')
    fs.writeFileSync(hot, JSON.stringify({ ...JSON.parse(fs.readFileSync(hot, 'utf8')), tz: 'Somewhere/Else|1|2' }))
    assert.deepEqual(counts(await runK({ view: 'week' }), 'hotkept'), [1, 1, 1])
  })

  test('a kept session of the wrong shape is dropped, never the end of the run', async () => {
    const cacheDir = copyCache('cache-shapes')
    const file = path.join(cacheDir, 'cache-v1-archive.json')
    const c = JSON.parse(fs.readFileSync(file, 'utf8'))
    const k = Object.keys(c.files).find((x) => x.endsWith(`${AUG}.jsonl`))
    c.files[k].runs = [null]
    fs.writeFileSync(file, JSON.stringify(c))
    const aug = await runK({ view: 'month', back: 2, cacheDir })
    assert.deepEqual(counts(aug, 'august'), [0, 0, 0])
  })

  test('a transcript read whole is never opened again to learn where it ran, even one that does not say', async (t) => {
    const quiet = session('quiet', sid(24), '2026-10-22T09:00:00.000Z', '2026-10-22T09:30:00.000Z', { entrypoint: null })
    await runK({ view: 'month' })
    const opened = []
    const open = fs.openSync
    t.mock.method(fs, 'openSync', function (file, ...more) {
      if (String(file) === quiet.main) opened.push(String(file))
      return open.call(this, file, ...more)
    })
    await runK({ view: 'month' })
    assert.deepEqual(opened, [])
  })

  test('what the cleanup took moves to the archive in its daily rewrite, and stays past the year the cache keeps what is there', async () => {
    const cacheDir = copyCache('cache-years')
    const sep = await runK({ view: 'month', back: 2, now: NOW + 30 * 864e5, cacheDir })
    assert.equal(sep.range.label, 'September 2026')
    assert.deepEqual(counts(sep, 'september'), [1, 1, 1])
    assert.equal(mainOf(SEPT, cacheDir).name, 'cache-v1-archive.json')
    const aug = await runK({ view: 'month', back: 19, now: NOW + 500 * 864e5, cacheDir })
    assert.equal(aug.range.label, 'August 2026')
    assert.deepEqual(counts(aug, 'august'), [1, 1, 1])
    assert.ok(keysOf(AUG, cacheDir).some((k) => k.includes('subagents')), 'its subagent with it')
  })

  test('a session cached before the collector kept where it ran learns it once from its transcript, a megabyte in if need be', async () => {
    const s = session('legacy', sid(23), '2026-08-16T09:00:00.000Z', '2026-08-16T09:30:00.000Z')
    // its first line a prompt queued with a pasted image
    const queued = JSON.stringify({ type: 'queue-operation', operation: 'enqueue', timestamp: '2026-08-16T09:00:00.000Z', content: 'x'.repeat(300_000) })
    fs.writeFileSync(s.main, `${queued}\n${fs.readFileSync(s.main, 'utf8')}`)
    setMtime(s.main, at('2026-08-16T09:30:00.000Z'))
    archiveDue()
    await runK({ view: 'month', back: 2 })
    const { name, k } = mainOf(s.id)
    assert.equal(name, 'cache-v1-archive.json')
    // as an older version cached it: nothing says where it ran
    const file = path.join(kx.cacheDir, name)
    const c = JSON.parse(fs.readFileSync(file, 'utf8'))
    delete c.files[k].dt
    fs.writeFileSync(file, JSON.stringify(c))
    await runK({ view: 'month', back: 2 })
    assert.equal(mainOf(s.id).e.dt, 0, 'read once, and saved with its tier')
    erase(s)
    assert.deepEqual(counts(await runK({ view: 'month', back: 2 }), 'legacy'), [1, 1, 1])
  })
})

function text6() {
  return { type: 'text', text: 'second chunk of msg_6' }
}

// ---------------------------------------------------------------- what a run reads and writes

describe('cache tiers', () => {
  let cx
  const FRESH = () => cx.main(cx.other, SID.D)
  const hotFile = () => path.join(cx.cacheDir, 'cache-v1.json')
  const coldFile = () => path.join(cx.cacheDir, 'cache-v1-cold.json')
  const archiveFile = () => path.join(cx.cacheDir, 'cache-v1-archive.json')
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))
  const edit = (file, change) => {
    const c = read(file)
    change(c)
    fs.writeFileSync(file, JSON.stringify(c))
  }
  const runC = (opts = {}) => run(cx, { cacheDir: cx.cacheDir, git: false, ...opts })
  /** A marker in the cold tier: gone or changed only if the file is rewritten. */
  const markCold = () => edit(coldFile(), (c) => { c.mark = 'as it was' })
  const coldIsUntouched = () => read(coldFile()).mark === 'as it was'
  // entries of an account these runs do not read: nothing tells whether their files went, they only move between tiers
  const AWAY_AGED = '@claude.away/ghost/aged.jsonl'
  const AWAY_ARCHIVED = '@claude.away/ghost/archived.jsonl'
  let line = 0
  const grow = () => appendLines(FRESH(), [human(`2026-10-26T00:30:${String(line++ % 60).padStart(2, '0')}.000Z`, `one more ${line}`, cx.other)], NOW - 500e3 + line * 1e3)
  before(async () => {
    cx = buildFakeClaude()
    await runC({ view: 'month' })
  })
  after(() => cleanup(cx?.root))

  test('the week and today read and write the hot tier alone, even when a transcript grew', async () => {
    markCold()
    grow()
    const week = await runC({ view: 'week' })
    assert.equal(week.sources.files_from_cache, week.sources.files_scanned - 1)
    grow()
    await runC({ view: 'today' })
    assert.ok(coldIsUntouched())
  })

  test('the week holds entries nine days back in the hot tier, so it never meets a miss', async () => {
    const hot = read(hotFile())
    const old = Object.entries(read(coldFile()).files).filter(([, e]) => e.mtime >= NOW - HOT_MS)
    assert.deepEqual(old.map(([k]) => k).filter((k) => !(k in hot.files)), [])
    assert.ok(Object.keys(hot.files).length > 0)
  })

  test('an entry an older version moved to the cold tier is found there, not parsed again', async () => {
    const first = await runC({ view: 'week' })
    const key = Object.keys(read(hotFile()).files).find((k) => k.endsWith(`${SID.B}.jsonl`))   // three days old
    let moved
    edit(hotFile(), (c) => { moved = c.files[key]; delete c.files[key] })
    edit(coldFile(), (c) => { c.files[key] = moved })
    const f = await runC({ view: 'week' })
    assert.equal(f.sources.files_from_cache, f.sources.files_scanned, 'the cold tier answered')
    assert.deepEqual(f.totals, first.totals)
  })

  test('the month reads the cold tier and leaves it alone while nothing aged', async () => {
    await runC({ view: 'month' })
    edit(coldFile(), (c) => { c.mark = 'as it was' })
    const m = await runC({ view: 'month' })
    assert.ok(m.projects.length > 0)
    assert.ok(coldIsUntouched())
    assert.ok(!Object.keys(read(hotFile()).files).some((k) => k in read(coldFile()).files && read(hotFile()).files[k].mtime < NOW - HOT_MS), 'what came from the cold tier stayed out of the hot one')
  })

  test('once an hour what aged out of the hot tier moves to the cold one, and a killed run\'s temp files go', async () => {
    const hot = read(hotFile())
    const key = Object.keys(hot.files)[0]
    edit(hotFile(), (c) => {
      c.files[AWAY_AGED] = { ...c.files[key], mtime: NOW - HOT_MS - 864e5 }
      c.coldAt = NOW - COLD_EVERY_MS - 1
    })
    const left = (name) => path.join(cx.cacheDir, name)
    const orphans = ['cache-v1-cold.json.99999.tmp', 'walks-v1.json.99999.tmp', 'shared/.all.json.99999.x.tmp', 'pixel/.office-all.svg.99999.x.tmp'].map(left)
    const notOurs = left('notes.tmp')
    for (const file of [...orphans, notOurs]) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, 'half a file')
      fs.utimesSync(file, new Date(NOW - 2 * 3600e3), new Date(NOW - 2 * 3600e3))
    }
    grow()
    await runC({ view: 'week' })
    assert.ok(AWAY_AGED in read(coldFile()).files)
    assert.ok(!(AWAY_AGED in read(hotFile()).files))
    assert.equal(read(hotFile()).coldAt, NOW)
    assert.deepEqual(orphans.filter((file) => fs.existsSync(file)), [])
    assert.ok(fs.existsSync(notOurs), 'the folder may be one the person picked')
    fs.unlinkSync(notOurs)
  })

  test('an hour with nothing to move still counts as the hour\'s upkeep: the next run does not read the cold tier again', async () => {
    edit(hotFile(), (c) => { c.coldAt = NOW - COLD_EVERY_MS - 1 })
    await runC({ view: 'week' })
    assert.equal(read(hotFile()).coldAt, NOW)
  })

  test('in a series of runs a hot tier that only grew waits for a later run; what it read is in the facts all the same', async () => {
    grow()
    const saved = await runC({ series: true, now: NOW + 40e3 })
    assert.equal(read(hotFile()).savedAt, NOW + 40e3, 'its last write is older than the wait')
    grow()
    const before = read(hotFile())
    const soon = await runC({ series: true, now: NOW + 41e3 })
    assert.equal(byName(soon, 'otherproj').prompts, byName(saved, 'otherproj').prompts + 1)
    assert.deepEqual(read(hotFile()), before, 'nothing written')
    const later = await runC({ series: true, now: NOW + 40e3 + SAVE_EVERY_MS })
    assert.equal(byName(later, 'otherproj').prompts, byName(soon, 'otherproj').prompts)
    assert.equal(read(hotFile()).savedAt, NOW + 40e3 + SAVE_EVERY_MS)
  })

  test('a one-shot run always saves what it read', async () => {
    grow()
    await runC({ now: NOW + 42e3 })
    assert.equal(read(hotFile()).savedAt, NOW + 42e3)
  })

  test('a cache of another zone name with the same offsets is kept', async () => {
    const keep = (await runC()).sources
    assert.equal(keep.files_from_cache, keep.files_scanned)
    edit(hotFile(), (c) => { c.tz = `Somewhere/Else${c.tz.slice(c.tz.indexOf('|'))}` })
    const same = (await runC()).sources
    assert.equal(same.files_from_cache, same.files_scanned)
  })

  test('other offsets read the hot tier again and keep the rest: a flight costs seconds, not the month', async () => {
    await runC({ view: 'month' })
    edit(hotFile(), (c) => {
      c.tz = 'Somewhere/Else|1|2'
      c.repos['/a/repo'] = NOW
      delete c.coldAt   // the riskier way: the hour's upkeep rewrites the cold tier in the same run
    })
    edit(coldFile(), (c) => { c.tz = 'Somewhere/Else|1|2' })
    const old = Object.keys(read(coldFile()).files)
    assert.ok(old.length > 0)
    const week = (await runC({ view: 'week' })).sources
    assert.equal(week.files_from_cache, 0, 'the week is cut again in this zone')
    assert.equal(read(hotFile()).tz, tzSignature())
    assert.equal(read(hotFile()).repos['/a/repo'], NOW)
    assert.deepEqual(old.filter((k) => !(k in read(coldFile()).files)), [], 'the cold tier is whole')
    const month = (await runC({ view: 'month' })).sources
    assert.equal(month.files_from_cache, month.files_scanned, 'and the month reads nothing')
  })

  test('a hot tier cut again in a new zone is saved by the first run, however little it read', async () => {
    edit(hotFile(), (c) => { c.tz = 'Somewhere/Else|1|2'; c.savedAt = NOW; c.coldAt = NOW })
    await runC({ view: 'today', series: true })
    assert.equal(read(hotFile()).tz, tzSignature())
  })

  test('a cold tier that cannot be read is not replaced', { skip: process.getuid?.() === 0 }, async () => {
    edit(hotFile(), (c) => { delete c.coldAt })   // its hour is up
    const before = fs.readFileSync(coldFile(), 'utf8')
    fs.chmodSync(coldFile(), 0o000)
    try {
      await runC({ view: 'week' })
    } finally {
      fs.chmodSync(coldFile(), 0o600)
    }
    assert.equal(fs.readFileSync(coldFile(), 'utf8'), before)
  })

  test('once a day what aged out of the cold tier moves to the archive, which only a page further back reads, never the month or the hour', async (t) => {
    const [key, entry] = Object.entries({ ...read(hotFile()).files, ...read(coldFile()).files })[0]
    assert.ok(key)
    // a file 100 days old waits in the cold tier for the day's upkeep
    edit(coldFile(), (c) => { c.files[AWAY_ARCHIVED] = { ...entry, mtime: NOW - 100 * 864e5 } })
    edit(hotFile(), (c) => { c.archiveAt = NOW - ARCHIVE_EVERY_MS - 1 })
    await runC({ view: 'week' })
    assert.ok(AWAY_ARCHIVED in read(archiveFile()).files)
    assert.ok(!(AWAY_ARCHIVED in read(coldFile()).files))
    assert.equal(read(hotFile()).archiveAt, NOW)
    const reads = []
    const readFile = fs.readFileSync
    t.mock.method(fs, 'readFileSync', function (file, ...more) {
      reads.push(String(file))
      return readFile.call(this, file, ...more)
    })
    const tiers = () => reads.filter((file) => /cache-v1-(cold|archive)\.json$/.test(file)).map((file) => path.basename(file))
    edit(hotFile(), (c) => { c.coldAt = NOW - COLD_EVERY_MS - 1 })
    await runC({ view: 'month' })
    assert.deepEqual(tiers(), ['cache-v1-cold.json'], 'the month and the hour\'s upkeep read the cold tier alone')
    reads.length = 0
    const june = await runC({ view: 'month', back: 4 })
    assert.equal(june.range.label, 'June 2026')
    assert.deepEqual(tiers(), ['cache-v1-cold.json', 'cache-v1-archive.json'])
    assert.ok(AWAY_ARCHIVED in read(archiveFile()).files, 'what it did not read again stays')
  })

  test('an archive that cannot be read is not replaced', { skip: process.getuid?.() === 0 }, async () => {
    edit(hotFile(), (c) => { delete c.archiveAt })   // its day is up
    const before = fs.readFileSync(archiveFile(), 'utf8')
    fs.chmodSync(archiveFile(), 0o000)
    try {
      await runC({ view: 'month', back: 4 })
    } finally {
      fs.chmodSync(archiveFile(), 0o600)
    }
    assert.equal(fs.readFileSync(archiveFile(), 'utf8'), before)
  })

  test('a run of the pane whose session is gone saves what it has and stops: no one reads the answer', async (t) => {
    let clock = 0
    t.mock.method(performance, 'now', () => (clock += 6000))
    const asked = process.ppid
    let isGone = false
    const ppid = Object.getOwnPropertyDescriptor(process, 'ppid')
    Object.defineProperty(process, 'ppid', { configurable: true, get: () => (isGone ? 1 : asked) })
    t.after(() => Object.defineProperty(process, 'ppid', ppid))
    // Windows gives an orphan no new parent: there the run asks for its parent's pid, which is gone too
    const kill = process.kill
    t.mock.method(process, 'kill', function (pid, signal) {
      if (isGone && pid === asked) throw Object.assign(new Error('kill ESRCH'), { code: 'ESRCH' })
      return kill.call(this, pid, signal)
    })
    const stops = []
    t.mock.method(process, 'exit', (code) => { stops.push(code) })
    const rename = fs.renameSync
    t.mock.method(fs, 'renameSync', function (from, to) {
      const r = rename.call(this, from, to)
      if (to.endsWith('cache-v1.json')) isGone = true   // the first checkpoint is saved, then the session goes
      return r
    })
    await run(cx, { cacheDir: path.join(cx.root, 'orphan-cache'), git: false, view: 'month', stopsWithParent: true })
    assert.ok(stops.length > 0)
    assert.equal(stops[0], 0)
    stops.length = 0
    isGone = false
    await run(cx, { cacheDir: path.join(cx.root, 'cli-cache'), git: false, view: 'month' })
    assert.deepEqual(stops, [], 'a run from a shell goes to its end: its output may be going to a file')
  })

  test('a long read saves what it has as it goes: a run stopped halfway keeps it', async (t) => {
    let clock = 0
    t.mock.method(performance, 'now', () => (clock += 6000))   // every file read takes longer than a checkpoint's wait
    const saved = []
    const rename = fs.renameSync
    t.mock.method(fs, 'renameSync', function (from, to) {
      if (to.endsWith('cache-v1.json')) saved.push(Object.keys(read(from).files).length)
      return rename.call(this, from, to)
    })
    await run(cx, { cacheDir: path.join(cx.root, 'first-cache'), git: false, view: 'month' })
    assert.ok(saved.length > 2, `${saved.length} saves`)
    assert.ok(saved[0] > 0 && saved[0] < saved.at(-1), saved.join())
    saved.length = 0
    await run(cx, { cacheDir: path.join(cx.root, 'first-cache'), git: false, view: 'month' })
    assert.ok(saved.length <= 1, 'a slow run that reads nothing has nothing to save on the way')
  })
})

describe('project folders that may not answer', () => {
  test('a command that does not return in time is killed, and the run asks nothing more there', { skip: process.platform === 'win32' && 'guarded runs on macOS only, through /bin' }, () => {
    const ctx = { log: () => {} }
    const t = performance.now()
    assert.equal(guarded(ctx, '/bin/sleep', ['5']), null)
    assert.ok(performance.now() - t < 3000)
    assert.equal(ctx.stalled, true)
    const t2 = performance.now()
    assert.equal(guarded(ctx, '/bin/sleep', ['5']), null)
    assert.ok(performance.now() - t2 < 50, 'one wait a run at most')
  })

  test('a command that fails after printing still answers what it printed; one that printed nothing, an empty answer', { skip: process.platform === 'win32' && 'guarded runs on macOS only, through /bin' }, () => {
    const ctx = { log: () => {} }
    assert.equal(guarded(ctx, '/bin/sh', ['-c', 'echo partly; exit 1']), 'partly\n')
    assert.equal(guarded(ctx, '/usr/bin/false', []), '')
    assert.equal(ctx.stalled, undefined)
  })

  test('a worktree\'s .git file is read once: it holds on the cache, remembered by its mtime', async () => {
    const cx = buildFakeClaude()
    try {
      const runC = () => run(cx, { cacheDir: cx.cacheDir, git: false })
      const linked = path.join(cx.root, 'linked')
      const file = path.join(linked, '.git')
      fs.mkdirSync(linked)
      fs.writeFileSync(file, `gitdir: ${cx.repo}/.git/worktrees/linked\n`)
      const when = new Date(NOW - 864e5)
      fs.utimesSync(file, when, when)
      writeLines(cx.main(linked, SID.OLD), [human('2026-10-25T10:00:00.000Z', 'in a linked worktree', linked)], NOW - 3600e3)
      const projectOf = (f) => f.projects.find((p) => p.worktrees.includes('linked'))?.name
      const first = await runC()
      assert.equal(projectOf(first), 'repo')
      const cache = JSON.parse(fs.readFileSync(path.join(cx.cacheDir, 'cache-v1.json'), 'utf8'))
      assert.equal(cache.links[linked]?.p, cx.repo)
      fs.writeFileSync(file, 'gitdir: /nowhere/.git/worktrees/gone\n')
      fs.utimesSync(file, when, when)
      assert.equal(projectOf(await runC()), 'repo')
    } finally {
      cleanup(cx.root)
    }
  })
})

// ---------------------------------------------------------------- robustness & CLI

describe('robustness', () => {
  test('missing claude dir → empty but valid facts', async () => {
    const f = await collect({ view: 'week', claudeDir: path.join(fx.root, 'nope'), cacheDir: null, now: FROZEN, novi: false, git: false })
    assert.equal(f.spec, 'theoffice/1')
    assert.equal(f.live.counts.desks, 0)
    assert.deepEqual(f.projects, [])
    assert.equal(f.totals.sessions, 0)
    assert.equal(Object.keys(f.per_day).length, 7)
    assert.ok(f.notes.some((n) => n.startsWith('no transcripts found')))
  })

  test('empty projects dir, garbage session files, transcript of only junk', async () => {
    const root = fs.mkdtempSync(path.join(fx.root, 'junk-'))
    fs.mkdirSync(path.join(root, 'sessions'), { recursive: true })
    fs.writeFileSync(path.join(root, 'sessions', `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: 'zzzzzzzz-1', cwd: '/nowhere', status: 'busy' }))
    fs.writeFileSync(path.join(root, 'sessions', '1.json'), 'null')
    writeLines(path.join(root, 'projects', '-junk', 'x.jsonl'), ['{', '[]', 'null', '{"parentUuid":1,"type":"assistant","message":null,"timestamp":5}', '{"parentUuid":null,"type":"user"}'], NOW - 1e3)
    setMtime(path.join(root, 'projects', '-junk', 'x.jsonl'), NOW - 1e3)
    const f = await collect({ view: 'week', claudeDir: root, cacheDir: null, now: FROZEN, novi: false, git: false })
    assert.equal(f.live.counts.desks, 1)
    assert.equal(f.live.desks[0].state, 'working')
    assert.equal(f.live.desks[0].activity.kind, 'thinking')
    assert.equal(f.totals.sessions, 0)
  })

  test('cli --json prints valid facts: integers only, no prompt text, nothing on stderr', () => {
    const env = {
      ...process.env, THEOFFICE_CLAUDE_DIR: fx.claudeDir, THEOFFICE_CACHE_DIR: path.join(fx.root, 'cli-cache'), THEOFFICE_NOW: FROZEN,
      TZ: 'Europe/Paris', THEOFFICE_SKIP_PID_CHECK: '1', THEOFFICE_NO_NOVI: '1', THEOFFICE_NO_GIT: '1',
    }
    const res = spawnSync(process.execPath, [path.join(ROOT, 'plugin', 'scripts', 'office.mjs'), 'week', '--json'], { env, encoding: 'utf8' })
    assert.equal(res.status, 0)
    assert.equal(res.stderr, '')
    const out = res.stdout
    const f = JSON.parse(out)
    assert.equal(f.spec, 'theoffice/1')
    for (const k of ['generated_at', 'range', 'now', 'live', 'projects', 'projects_more', 'contractors', 'totals', 'per_day', 'per_hour', 'sources', 'notes']) assert.ok(k in f, k)
    const walk = (v, p) => {
      if (typeof v === 'number') assert.ok(Number.isInteger(v), `${p} = ${v} is not an integer`)
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${p}.${k}`)
    }
    walk(f, 'facts')
    for (const secret of ['build me an office', 'first real prompt', 'never surface me', 'acct-never', 'org-never', 'secret result text', 'do the thing']) {
      assert.ok(!out.includes(secret), `leaked: ${secret}`)
    }
    // --no-color: a FORCE_COLOR exported by the shell or CI must not turn this into ANSI
    const txt = execFileSync(process.execPath, [path.join(ROOT, 'plugin', 'scripts', 'office.mjs'), '/week', 'unknown-word', '--width', '80', '--no-color'], { env, stdio: ['ignore', 'pipe', 'pipe'] }).toString()
    assert.ok(!/^\s/.test(txt), 'output never starts with whitespace')
    assert.ok(txt.startsWith('THE OFFICE'))
    for (const l of txt.split('\n')) assert.ok(l.length <= 80, `line too wide: ${l}`)
  })

  test('cli exits 0 without a stack trace when its reader goes away (EPIPE)', async () => {
    const env = {
      ...process.env, THEOFFICE_CLAUDE_DIR: fx.claudeDir, THEOFFICE_CACHE_DIR: path.join(fx.root, 'cli-cache-epipe'), THEOFFICE_NOW: FROZEN,
      TZ: 'Europe/Paris', THEOFFICE_SKIP_PID_CHECK: '1', THEOFFICE_NO_NOVI: '1', THEOFFICE_NO_GIT: '1',
    }
    const child = spawn(process.execPath, [OFFICE, 'week', '--json'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.destroy()   // like `| head -c 20` exiting before we write
    let err = ''
    child.stderr.on('data', (d) => { err += d })
    const code = await new Promise((resolve) => child.on('close', resolve))
    assert.equal(err, '')
    assert.equal(code, 0)
  })

  test('cli --html to a folder that does not exist says the file could not be written', () => {
    const env = { ...process.env, THEOFFICE_CLAUDE_DIR: fx.claudeDir, THEOFFICE_NOW: FROZEN, THEOFFICE_NO_NOVI: '1', THEOFFICE_NO_GIT: '1', THEOFFICE_SKIP_PID_CHECK: '1' }
    const file = path.join(fx.root, 'no-such-dir', 'x.html')
    const res = spawnSync(process.execPath, [OFFICE, 'live', '--no-cache', '--html', file], { env, encoding: 'utf8' })
    assert.equal(res.status, 0)
    assert.equal(res.stderr, '')
    assert.equal(res.stdout, `The Office could not write ${file} (ENOENT).\n`)
  })

  test('cli --html writes only new .html files or its own earlier page, never through a symlink', () => {
    const env = { ...process.env, THEOFFICE_CLAUDE_DIR: fx.claudeDir, THEOFFICE_NOW: FROZEN, THEOFFICE_NO_NOVI: '1', THEOFFICE_NO_GIT: '1', THEOFFICE_SKIP_PID_CHECK: '1' }
    const dir = fs.mkdtempSync(path.join(fx.root, 'html-'))
    const run = (file) => spawnSync(process.execPath, [OFFICE, 'live', '--no-cache', '--html', file], { env, encoding: 'utf8' }).stdout
    const page = path.join(dir, 'office.html')
    assert.equal(run(page), `${page}\n`)
    assert.match(fs.readFileSync(page, 'utf8'), /^<!doctype html>/)
    assert.equal(run(page), `${page}\n`, 'its own earlier page is replaced')
    const rc = path.join(dir, 'fake-rc')
    fs.writeFileSync(rc, 'export PATH=/usr/bin\n')
    assert.equal(run(rc), `The Office did not write ${rc}: only .html files.\n`)
    const other = path.join(dir, 'notes.html')
    fs.writeFileSync(other, '<p>mine</p>\n')
    assert.equal(run(other), `The Office did not write ${other}: exists and is not a The Office page.\n`)
    const link = path.join(dir, 'link.html')
    fs.symlinkSync(page, link)
    assert.equal(run(link), `The Office did not write ${link}: a symlink.\n`)
    assert.equal(fs.readFileSync(rc, 'utf8'), 'export PATH=/usr/bin\n')
    assert.equal(fs.readFileSync(other, 'utf8'), '<p>mine</p>\n')
  })

  test('cli --svg draws the asked view itself: today the time clock, month the calendar, work what they did, all the live building', () => {
    const env = { ...process.env, THEOFFICE_CLAUDE_DIR: fx.claudeDir, THEOFFICE_NOW: FROZEN, THEOFFICE_NO_NOVI: '1', THEOFFICE_NO_GIT: '1', THEOFFICE_SKIP_PID_CHECK: '1' }
    const svg = (view) => {
      const res = spawnSync(process.execPath, [OFFICE, view, '--no-cache', '--svg'], { env, encoding: 'utf8' })
      assert.equal(res.stderr, '', view)
      assert.ok(res.stdout.startsWith('<svg ') && res.stdout.endsWith('</svg>\n'), view)
      assert.match(res.stdout, /^<svg [^>]*width="960"/, `${view}: drawn 960 px wide`)
      return res.stdout
    }
    const scenes = (out) => ['s', 'tw', 'td', 'mo', 'wk'].filter((k) => out.includes(`href="#to-${k}-`))
    const month = svg('month')
    assert.deepEqual(scenes(month), ['mo'])
    assert.match(month, /aria-label="The Office, the month on the wall calendar/)
    assert.deepEqual(scenes(svg('today')), ['td'])
    assert.deepEqual(scenes(svg('work')), ['wk'])
    assert.match(svg('work'), /aria-label="The Office, what they did/)
    const all = svg('all')
    // the Office: the live building (its screens, s-) with what they did in its basement (wk-), no week tower (the Week
    // tab's); the commits line under the basement
    assert.deepEqual(scenes(all), ['s', 'wk'])
    assert.ok(all.includes('>WHAT THEY DID<'), 'all: B1, what they did')
    assert.ok(!all.includes('agent-time per day, all floors'), 'all: no week tower')
    assert.ok(all.includes('COMMITS LINE'), 'all: the commits line under the street')
    // --svg is a file with no page behind it: opaque, its ground color behind it all
    assert.match(all, /^<svg [^>]*style="background:#14120f"/)
    assert.ok(svg('week').includes('agent-time per day, all floors'))
  })

  test('cli --pixel writes the asked view to <cache dir>/pixel/office-<view>.svg and prints only its path', () => {
    const cache = fs.mkdtempSync(path.join(fx.root, 'pixel-cache-'))
    const env = {
      ...process.env, THEOFFICE_CLAUDE_DIR: fx.claudeDir, THEOFFICE_CACHE_DIR: cache, THEOFFICE_NOW: FROZEN, THEOFFICE_NO_NOVI: '1',
      THEOFFICE_NO_GIT: '1', THEOFFICE_SKIP_PID_CHECK: '1',
    }
    const run = (...args) => spawnSync(process.execPath, [OFFICE, ...args], { env, encoding: 'utf8' })
    const dir = path.join(cache, 'pixel')
    for (const view of ['live', 'today', 'week', 'month', 'work', 'all']) {
      const res = run('--no-color', view, '--pixel')
      const file = path.join(dir, `office-${view}.svg`)
      assert.equal(res.status, 0, view)
      assert.equal(res.stderr, '', view)
      assert.equal(res.stdout, `${file}\n`, `${view}: one line, the absolute path`)
      assert.equal(pixelFile(view, env), file)
      const svg = fs.readFileSync(file, 'utf8')
      assert.ok(svg.startsWith('<svg ') && svg.includes('<animate'), view)
      assert.equal(permits(file, 0o600), 0o600, `${view}: the file is the person's alone`)
    }
    assert.equal(permits(dir, 0o700), 0o700)
    // the skill runs it with the same words as the text command: --pixel wins over --json and --html
    assert.equal(run('week --json --pixel').stdout, `${path.join(dir, 'office-week.svg')}\n`)
    assert.equal(run('--pixel', '--html', path.join(cache, 'x.html')).stdout, `${path.join(dir, 'office-all.svg')}\n`)
    assert.ok(!fs.existsSync(path.join(cache, 'x.html')))
    // replaced in place: no temp file is left behind, and a folder opened up by hand is made private again
    fs.chmodSync(dir, 0o755)
    run('work', '--pixel')
    assert.deepEqual(fs.readdirSync(dir).sort(), ['live', 'today', 'week', 'month', 'work', 'all'].map((v) => `office-${v}.svg`).sort())
    assert.equal(permits(dir, 0o700), 0o700)
    // a pixel folder that is a symlink is refused, never followed
    const elsewhere = fs.mkdtempSync(path.join(fx.root, 'pixel-elsewhere-'))
    const cache2 = fs.mkdtempSync(path.join(fx.root, 'pixel-cache-'))
    fs.symlinkSync(elsewhere, path.join(cache2, 'pixel'))
    const res = spawnSync(process.execPath, [OFFICE, 'live', '--pixel'], { env: { ...env, THEOFFICE_CACHE_DIR: cache2 }, encoding: 'utf8' })
    assert.equal(res.status, 0)
    assert.equal(res.stderr, '')
    assert.equal(res.stdout, `The Office could not write ${path.join(cache2, 'pixel', 'office-live.svg')} (a symlink).\n`)
    assert.deepEqual(fs.readdirSync(elsewhere), [])
  })

  test('cli survives an unreadable environment and still exits 0', () => {
    const env = { ...process.env, THEOFFICE_CLAUDE_DIR: '/dev/null/nope', THEOFFICE_CACHE_DIR: '/dev/null/nope', THEOFFICE_NO_NOVI: '1', THEOFFICE_NO_GIT: '1' }
    const out = execFileSync(process.execPath, [path.join(ROOT, 'plugin', 'scripts', 'office.mjs'), 'live', '--json'], { env, stdio: ['ignore', 'pipe', 'pipe'] }).toString()
    assert.equal(JSON.parse(out).spec, 'theoffice/1')
  })
})

// ---------------------------------------------------------------- the drawing

describe('cli drawing', () => {
  const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'facts-sample.json'), 'utf8'))
  /** The fake ~/.claude, with none of the shell's color settings (a set FORCE_COLOR forces color even when empty). */
  const envFor = (extra = {}) => {
    const env = {
      ...process.env, THEOFFICE_CLAUDE_DIR: fx.claudeDir, THEOFFICE_NOW: FROZEN, TZ: 'Europe/Paris', THEOFFICE_SKIP_PID_CHECK: '1',
      THEOFFICE_NO_NOVI: '1', THEOFFICE_NO_GIT: '1',
    }
    for (const k of ['FORCE_COLOR', 'NO_COLOR', 'COLORTERM']) delete env[k]
    return { ...env, ...extra }
  }

  test('there is one style: the old style words and --style are ignored like any unknown word', () => {
    const o = parseArgs(['pixel week'], { env: {} })
    assert.equal(o.view, 'week')
    assert.ok(!('style' in o))
    assert.deepEqual(parseArgs(['/ASCII', '--style', 'pixel', 'month'], { env: {} }), parseArgs(['month'], { env: {} }))
    assert.equal(parseArgs(['--style week'], { env: {} }).view, 'week', 'an unknown flag never eats the view')
    assert.deepEqual(parseArgs([], { env: { THEOFFICE_STYLE: 'ascii' } }), parseArgs([], { env: {} }))
    // --ascii is the 7-bit switch; --html never takes a view word as its file
    assert.equal(parseArgs(['--ascii pixel'], { env: {} }).ascii, true)
    assert.deepEqual([parseArgs(['--html week'], { env: {} }).html, parseArgs(['--html week'], { env: {} }).view], [true, 'week'])
    assert.equal(parseArgs(['--html', 'mine.html', 'pixel'], { env: {} }).html, 'mine.html')
    // --pixel (with dashes) is the picture-file switch; `work` is a view, never an --html file name
    assert.deepEqual([parseArgs(['work --pixel'], { env: {} }).view, parseArgs(['work --pixel'], { env: {} }).pixel], ['work', true])
    assert.equal(parseArgs(['pixel'], { env: {} }).pixel, false)
    assert.deepEqual([parseArgs(['--html work'], { env: {} }).html, parseArgs(['--html work'], { env: {} }).view], [true, 'work'])
  })

  test('--first-light asks for the live floor alone', () => {
    assert.equal(parseArgs(['all --json --first-light'], { env: {} }).firstLight, true)
    assert.equal(parseArgs(['all --json'], { env: {} }).firstLight, false)
  })

  test('--back N asks for a page N back, with no limit; anything else leaves it at 0', () => {
    assert.deepEqual([parseArgs(['month --back 1 --json'], { env: {} }).back, parseArgs(['month', '--back=2'], { env: {} }).view], [1, 'month'])
    assert.equal(parseArgs(['month'], { env: {} }).back, 0)
    for (const [arg, back] of [['--back 40', 40], ['--back -3', 0], ['--back x', 0], ['--back', 0]]) assert.equal(parseArgs([`month ${arg}`], { env: {} }).back, back, arg)
  })

  test('a 16-color terminal keeps Clawd out of the 256-color palette', () => {
    for (const TERM of ['xterm', 'linux', 'vt100', 'vt220', 'screen', 'screen.linux', 'dumb', 'xterm-color', 'xterm-16color']) {
      assert.equal(looks16Color({ TERM }), true, TERM)
    }
    for (const TERM of ['xterm-256color', 'screen-256color', 'screen.xterm-256color', 'tmux-256color', 'xterm-kitty-256color', '', 'alacritty',
      'xterm-kitty', 'xterm-ghostty', 'xterm-direct', 'xterm-24bit']) {
      assert.equal(looks16Color({ TERM }), false, TERM)
    }
    assert.equal(looks16Color({ TERM: 'xterm', COLORTERM: 'truecolor' }), false)
    assert.equal(parseArgs([], { env: { TERM: 'linux' } }).colors, 16)
    assert.equal(parseArgs([], { env: { TERM: 'xterm-256color' } }).colors, 256)

    const rich = render(SAMPLE, { view: 'live', width: 100, color: true, colors: 256 })
    const poor = render(SAMPLE, { view: 'live', width: 100, color: true, colors: 16 })
    assert.match(rich, /\x1b\[38;5;173m/)
    assert.doesNotMatch(poor, /38;5;/)
    assert.equal(poor.replace(/\x1b\[[0-9;]*m/g, ''), rich.replace(/\x1b\[[0-9;]*m/g, ''))
  })

  test('render draws the block-glyph office for every view, whatever style is asked', () => {
    for (const view of ['all', 'live', 'today', 'week', 'month', 'work']) {
      const opts = { view, width: 90, frame: 2 }
      assert.equal(render(SAMPLE, opts), `${toPlain(renderOffice(SAMPLE, opts))}\n`, view)
      assert.equal(render(SAMPLE, { ...opts, style: 'ascii' }), render(SAMPLE, opts), view)
    }
  })

  test('cli prints the office: exit 0, nothing on stderr, first line THE OFFICE, lines within the width', () => {
    const run = (args, extra) => spawnSync(process.execPath, [OFFICE, ...args], { env: envFor(extra), encoding: 'utf8' })
    const looks = {}
    for (const [name, args, extra] of [
      ['plain', ['live --width 72 --no-cache']],
      ['pixel', ['live pixel --width 72 --no-cache']],
      ['ascii', ['ascii live --width 72 --no-cache']],
      ['flag', ['--style', 'ascii', 'live', '--width', '72', '--no-cache']],
      ['env', ['live --width 72 --no-cache'], { THEOFFICE_STYLE: 'ascii' }],
    ]) {
      const res = run(args, extra)
      assert.equal(res.status, 0, name)
      assert.equal(res.stderr, '', name)
      assert.ok(res.stdout.startsWith('THE OFFICE · live'), name)
      for (const l of res.stdout.split('\n')) assert.ok([...l].length <= 72, `${name}: line too wide: ${l}`)
      looks[name] = res.stdout
    }
    for (const name of ['pixel', 'ascii', 'flag', 'env']) assert.equal(looks[name], looks.plain, `${name} changes nothing`)
    assert.ok(looks.plain.includes('── the floor'), 'the floor, room by room')
    assert.ok(looks.plain.includes('▛▛█'), 'Clawd at his desk')

    // color: Clawd orange in 256 colors, 16-color codes on a bare xterm
    const rich = run(['live', '--width', '100', '--no-cache'], { FORCE_COLOR: '1', TERM: 'xterm-256color' }).stdout
    const poor = run(['live', '--width', '100', '--no-cache'], { FORCE_COLOR: '1', TERM: 'xterm' }).stdout
    assert.match(rich, /^\x1b\[/)
    assert.match(rich, /38;5;173/)
    assert.doesNotMatch(poor, /38;5;/)
  })

  test('cli --html: every pixel scene of the view, each over its own text, self-contained', () => {
    const dir = fs.mkdtempSync(path.join(fx.root, 'html-page-'))
    const write = (name, args) => {
      const file = path.join(dir, name)
      const res = spawnSync(process.execPath, [OFFICE, ...args, '--no-cache', '--html', file], { env: envFor(), encoding: 'utf8' })
      assert.equal(res.status, 0)
      assert.equal(res.stderr, '')
      assert.equal(res.stdout, `${file}\n`)
      return fs.readFileSync(file, 'utf8')
    }
    const pages = { all: ['all'], pixel: ['pixel'], live: ['live'], today: ['today'], week: ['week'], month: ['month'], work: ['work'] }
    // scene → the label of its text, the words its text starts with, a part of that text, and the id prefix of its drawing
    const SCENE = {
      live: ['the floor', /^THE OFFICE · live · /, 'done, your turn', 'tl'],
      today: ['today', /^THE OFFICE · today · /, 'timesheet', 'tt'],
      week: ['this week', /^THE OFFICE · week · /, 'timesheet · day by day', 'tw'],
      month: ['this month', /^THE OFFICE · month · /, 'the dates are Mondays', 'tm'],
      work: ['what they did', /^THE OFFICE · what they did · /, 'department · kind of work · share of tool calls · calls', 'tk'],
    }
    const scenesOf = { all: ['live', 'week', 'work'], pixel: ['live', 'week', 'work'], live: ['live', 'today'], today: ['live', 'today'],
      week: ['live', 'week', 'work'], month: ['live', 'month', 'work'], work: ['work'] }
    for (const [view, args] of Object.entries(pages)) {
      const name = `${view}.html`
      const page = write(name, args)
      const want = scenesOf[view]
      assert.ok(page.includes('<meta name="generator" content="theoffice">'), `${name}: the mark --html looks for`)
      // drawing, text, drawing, text…: each scene's picture over its own text
      const at = [...page.matchAll(/<svg |<pre /g)].map((m) => m[0].trim())
      assert.deepEqual(at, want.flatMap(() => ['<svg', '<pre']), name)
      const texts = [...page.matchAll(/<pre aria-label="([^"]*)">([^]*?)<\/pre>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '')])
      want.forEach((scene, i) => {
        const [label, start, part, id] = SCENE[scene]
        assert.equal(texts[i][0], `${label}, as text`, `${name}: ${scene}`)
        assert.match(texts[i][1], start, `${name}: ${scene}`)
        assert.ok(texts[i][1].includes(part), `${name}: ${scene} has ${part}`)
        assert.ok(page.includes(`id="${id}-`), `${name}: the ${scene} drawing`)
      })
      // what they did is written once: under its own picture when it has one, else in the range's text
      const allText = texts.map((t) => t[1]).join('\n')
      assert.equal((allText.match(/── what they did · /g) ?? []).length, 1, `${name}: what they did once`)
      // each drawing gets its own text, so the awards are listed once
      assert.ok((allText.match(/employee of the/g) ?? []).length <= 1, `${name}: awards once`)
      if (want.includes('live')) assert.match(page, /<h2>live · <b>the floor<\/b><\/h2>/)
      assert.doesNotMatch(page, /ASCII/, `${name}: the art is block glyphs, not ASCII`)
      if (want.includes('live')) assert.ok(allText.includes('── the floor'), `${name}: the block-glyph office, room by room`)
      if (want.includes('live')) assert.ok(page.includes('class="r-clawd"'), `${name}: Clawd is colored`)
      assert.doesNotMatch(page, /<pre class=|pre\.scene|<h2>(ascii|pixel) ·/)
      assert.doesNotMatch(page, /<script|<link|<img|https?:\/\//i, `${name}: no external requests`)
    }
  })
})

describe('windows', () => {
  test("a slug walks from its drive: Claude's `C--Users-me-app`, a folder taken as one `-c-Users-me-app`", () => {
    assert.deepEqual(slugRoot('C--Users-me-app', 'win32'), { dir: 'C:\\', rest: '-Users-me-app' })
    assert.deepEqual(slugRoot('-c-Users-me-app', 'win32'), { dir: 'C:\\', rest: '-Users-me-app' })
    assert.deepEqual(slugRoot('D--work', 'win32'), { dir: 'D:\\', rest: '-work' })
    // a share has no drive: it walks from the root and finds nothing, as before
    assert.deepEqual(slugRoot('--server-share-app', 'win32'), { dir: '/', rest: '--server-share-app' })
    // elsewhere every slug walks from /
    assert.deepEqual(slugRoot('-Users-me-app', 'darwin'), { dir: '/', rest: '-Users-me-app' })
    assert.deepEqual(slugRoot('-c-app', 'linux'), { dir: '/', rest: '-c-app' })
  })

  test('a remembered repo outlives a reload at any absolute path (C:\\… on Windows), a relative one does not', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-repos-'))
    try {
      const repo = path.join(dir, 'app')
      const c = emptyCache()
      c.repos[repo] = Date.now()
      c.repos['relative/app'] = Date.now()
      assert.ok(saveCache(dir, c))
      assert.deepEqual(Object.keys(loadCache(dir).repos), [repo])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  test("a copy that kept its times is as old as its mtime: Linux and Windows keep the copy's birth, macOS moves it back", () => {
    const now = NOW
    const hour = 3600e3
    assert.equal(isNewFile({ birthtimeMs: now - hour, mtimeMs: now }, now), true, 'born an hour ago')
    assert.equal(isNewFile({ birthtimeMs: now - hour, mtimeMs: now - 72 * hour }, now), false, 'copied an hour ago, written three days ago')
    assert.equal(isNewFile({ birthtimeMs: now - NEW_FILE_MS - hour, mtimeMs: now }, now), false, 'born days ago, written now: a session resumed')
    assert.equal(isNewFile({ birthtimeMs: 0, mtimeMs: now }, now), false, 'no birth time: never new')
  })

  test("novi on Windows is npm's .cmd shim, never the sh script beside it", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-path-'))
    try {
      fs.writeFileSync(path.join(dir, 'novi'), '#!/bin/sh\n', { mode: 0o755 })
      assert.equal(findOnPath('novi', 'win32', { PATH: dir }), null)
      fs.writeFileSync(path.join(dir, 'novi.cmd'), '@echo off\r\n', { mode: 0o755 })
      assert.equal(findOnPath('novi', 'win32', { PATH: `C:\\nowhere;${dir}` }), path.join(dir, 'novi.cmd'))
      // elsewhere the bare name, from a PATH split on ':' (which a Windows folder, C:\\…, cannot be in)
      if (process.platform === 'win32') return
      assert.equal(findOnPath('novi', 'darwin', { PATH: `/nowhere:${dir}` }), path.join(dir, 'novi'))
      // a folder of that name is no program
      fs.rmSync(path.join(dir, 'novi'))
      fs.mkdirSync(path.join(dir, 'novi'))
      assert.equal(findOnPath('novi', 'darwin', { PATH: dir }), null)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
