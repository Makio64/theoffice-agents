// The runs of the desktop mod (`--json --since MS`): one process answers every session of the machine, through a file
// each can read with no process, and a lock so that a burst of sessions makes one run. Against a fake ~/.claude, through
// the real CLI.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { progressFile, sharedFile } from '../plugin/scripts/office.mjs'
import { buildFakeClaude, cleanup } from './helpers/fake-claude.mjs'
import { permits } from './helpers/permits.mjs'

const CLI = fileURLToPath(new URL('../plugin/scripts/office.mjs', import.meta.url))

describe('--since', () => {
  let cx
  let env
  let file
  let lock
  before(() => {
    cx = buildFakeClaude({ withGit: false })
    env = {
      ...process.env, THEOFFICE_CLAUDE_DIR: cx.claudeDir, THEOFFICE_CACHE_DIR: cx.cacheDir, THEOFFICE_NO_NOVI: '1', THEOFFICE_SKIP_PID_CHECK: '1',
      THEOFFICE_SHARE_WAIT_MS: '1500',
    }
    file = sharedFile('all', env)
    lock = `${file}.lock`
  })
  after(() => cleanup(cx?.root))

  const argv = (since, ...more) => [CLI, 'all', '--json', '--since', String(since), ...more]
  const ask = (since, ...more) => JSON.parse(spawnSync(process.execPath, argv(since, ...more), { env, encoding: 'utf8' }).stdout)
  const start = (since) => new Promise((resolve) => {
    const child = spawn(process.execPath, argv(since), { env, stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.on('close', () => resolve(JSON.parse(out)))
  })
  /** An answer left by "another session": `mark` tells it from one this process would make, its mtime `at`. */
  const leave = (at, mark = 'left') => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify({ spec: 'theoffice/1', mark, now: { iso: '' }, live: { desks: [] } })}\n`)
    fs.utimesSync(file, at / 1000, at / 1000)
  }

  test('a run leaves its answer in a private file named by the facts, dated when it began', () => {
    const t = Date.now()
    const f = ask(t)
    assert.equal(f.spec, 'theoffice/1')
    assert.equal(f.sources.shared, file)
    assert.equal(permits(file, 0o600), 0o600)
    assert.equal(permits(path.dirname(file), 0o700), 0o700)
    assert.equal(Math.round(fs.statSync(file).mtimeMs), Date.parse(f.generated_at), 'a stat tells how recent it is')
    assert.ok(Date.parse(f.generated_at) >= t)
    assert.ok(!fs.existsSync(lock), 'the lock is gone with the run')
    assert.ok(!fs.existsSync(progressFile(file)), 'and so is what it said of how far it was')
  })

  test('an answer recent enough is printed as it is, and one too old is not', () => {
    const t = Date.now()
    leave(t)
    assert.equal(ask(t - 1000).mark, 'left')
    assert.equal(ask(t).mark, 'left', 'one that began at the very moment asked for will do')
    assert.equal(ask(t + 1).mark, undefined, 'a run made one of its own')
  })

  test('a lock whose process is gone is taken over, however fresh', () => {
    fs.writeFileSync(lock, '2147483646')
    const f = ask(Date.now())
    assert.equal(f.spec, 'theoffice/1')
    assert.ok(!fs.existsSync(lock))
  })

  test('a lock with no process in it, or too old for any run, is nobody\'s', () => {
    fs.writeFileSync(lock, '')
    assert.equal(ask(Date.now()).spec, 'theoffice/1')
    fs.writeFileSync(lock, String(process.pid))
    const old = new Date(Date.now() - 12 * 60e3)
    fs.utimesSync(lock, old, old)
    assert.equal(ask(Date.now()).spec, 'theoffice/1')
    assert.ok(!fs.existsSync(lock))
  })

  test('with a run under way a session waits for its answer and makes no run of its own', async () => {
    const t = Date.now()
    leave(t - 60_000)
    fs.writeFileSync(lock, String(process.pid))   // this test is the run under way
    const asked = start(t)
    await new Promise((resolve) => setTimeout(resolve, 150))
    leave(t, 'the run under way')
    fs.unlinkSync(lock)
    assert.equal((await asked).mark, 'the run under way')
  })

  test('a run under way that began too early is followed by one run for all who waited', async () => {
    const since = Date.now()
    leave(since - 60_000)
    fs.writeFileSync(lock, String(process.pid))
    const asked = [start(since), start(since), start(since), start(since)]
    await new Promise((resolve) => setTimeout(resolve, 200))
    fs.unlinkSync(lock)   // it ended and left nothing new
    const facts = await Promise.all(asked)
    assert.ok(facts.every((f) => f.spec === 'theoffice/1' && !f.mark))
    assert.equal(new Set(facts.map((f) => f.generated_at)).size, 1, 'one run answered the four of them')
  })

  test('a held lock never takes the answer away: past the wait the last one does', async () => {
    const t = Date.now()
    leave(t - 60_000, 'the last one')
    fs.writeFileSync(lock, String(process.pid))
    try {
      assert.equal((await start(t)).mark, 'the last one')
    } finally {
      fs.unlinkSync(lock)
    }
  })

  test('only the whole office goes through the shared file: a filter, or any other output, keeps to itself', () => {
    const t = Date.now() + 60_000
    leave(t)
    const asked = (...args) => spawnSync(process.execPath, [CLI, ...args], { env, encoding: 'utf8' }).stdout
    assert.equal(JSON.parse(asked('all', '--json', '--since', String(t), '--project', 'repo')).mark, undefined)
    assert.equal(JSON.parse(asked('all', '--json', '--since', String(t), '--agents', 'claude')).mark, undefined)
    assert.equal(JSON.parse(asked('all', '--json')).mark, undefined, 'no --since, no sharing')
    assert.doesNotMatch(asked('all', '--no-color', '--since', String(t)), /"mark"/)
    assert.ok(!sameFile(sharedFile('today', env), file))
  })
})

function sameFile(a, b) {
  return path.resolve(a) === path.resolve(b)
}

test('each range has a file of its own, and a page further back too', () => {
  const env = { THEOFFICE_CACHE_DIR: path.join(os.tmpdir(), 'x') }
  assert.notEqual(sharedFile('month', env), sharedFile('month-1', env))
  assert.equal(path.basename(path.dirname(sharedFile('all', env))), 'shared')
})

describe('a page of the past', () => {
  let cx
  let env
  before(() => {
    cx = buildFakeClaude({ withGit: false })
    env = { ...process.env, THEOFFICE_CLAUDE_DIR: cx.claudeDir, THEOFFICE_CACHE_DIR: cx.cacheDir, THEOFFICE_NO_NOVI: '1', THEOFFICE_SKIP_PID_CHECK: '1' }
  })
  after(() => cleanup(cx?.root))

  const ask = (...args) => JSON.parse(spawnSync(process.execPath, [CLI, ...args, '--json', '--since', String(Date.now())], { env, encoding: 'utf8' }).stdout)

  test('is shared under its first day, so its file stays its own page whatever day it is asked on', () => {
    const f = ask('month', '--back', '1')
    assert.equal(f.range.back, 1)
    assert.equal(path.basename(f.sources.shared), `month-${f.range.days[0]}.json`)
    assert.match(f.range.days[0], /^\d{4}-\d\d-01$/)
    assert.equal(fs.readFileSync(f.sources.shared, 'utf8'), `${JSON.stringify(f)}\n`)
  })

  test('has no end, so past the newest 12 the shared answers of pages go, the oldest first, 0.8.6\'s names too', () => {
    const dir = path.dirname(sharedFile('all', env))
    fs.mkdirSync(dir, { recursive: true })
    const t = Date.now()
    const old = ['month-1.json', ...Array.from({ length: 13 }, (_, i) => `today-2025-01-${String(i + 1).padStart(2, '0')}.json`)]
    old.forEach((name, i) => {
      fs.writeFileSync(path.join(dir, name), '{}\n')
      fs.utimesSync(path.join(dir, name), (t - 3600e3 + i * 1000) / 1000, (t - 3600e3 + i * 1000) / 1000)
    })
    fs.writeFileSync(path.join(dir, 'month-1.json.lock'), '999999999')
    fs.writeFileSync(path.join(dir, 'week-2025-03-03.json.lock'), '999999999') // a stopped run's, whose page never came
    fs.writeFileSync(path.join(dir, 'week-2025-03-10.json.lock'), String(process.pid)) // a run still going
    fs.writeFileSync(path.join(dir, 'all.json'), '{}\n')
    fs.utimesSync(path.join(dir, 'all.json'), (t - 7200e3) / 1000, (t - 7200e3) / 1000)
    const f = ask('today', '--back', '2')
    const pages = fs.readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'all.json' && n !== path.basename(sharedFile('month', env)))
    const kept = pages.filter((n) => /^(month|today)-/.test(n))
    assert.ok(kept.includes(path.basename(f.sources.shared)), 'the page just read stays')
    assert.equal(kept.length, 12)
    for (const gone of ['month-1.json', 'today-2025-01-01.json', 'today-2025-01-02.json']) assert.ok(!kept.includes(gone), gone)
    assert.ok(!fs.existsSync(path.join(dir, 'month-1.json.lock')), 'a dead run\'s lock goes with its page')
    assert.ok(!fs.existsSync(path.join(dir, 'week-2025-03-03.json.lock')), 'and so does one whose page never came')
    assert.ok(fs.existsSync(path.join(dir, 'week-2025-03-10.json.lock')), 'a run still going keeps its own')
    assert.ok(fs.existsSync(path.join(dir, 'all.json')), 'the ranges of now are never pruned')
  })
})
