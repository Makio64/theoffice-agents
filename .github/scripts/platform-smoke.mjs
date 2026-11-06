// The CLI end to end on the runner's own paths: a fake home (USERPROFILE on Windows, HOME elsewhere) with a git repo
// and Claude transcripts, then every view the skill and the pane ask for. On Windows it also checks what only happens
// there: a drive letter typed in either case is one project, and a session on a drive that is gone neither hangs
// the run nor breaks it.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assistant, enc, human, text, writeLines } from '../../test/helpers/fake-claude.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OFFICE = path.join(ROOT, 'plugin', 'scripts', 'office.mjs')
const isWin = process.platform === 'win32'

// the long names (RUNNER~1 is runneradmin): Claude names its folders from the cwd as the shell spells it
const home = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'office-home-')))
const cache = path.join(home, 'cache')
const repo = path.join(home, 'code', 'demo')
const claude = path.join(home, '.claude')
fs.mkdirSync(repo, { recursive: true })
fs.mkdirSync(path.join(claude, 'sessions'), { recursive: true })

const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
git('init', '-q', '-b', 'main')
git('config', 'user.email', 'office@example.com')
git('config', 'user.name', 'Office')
fs.writeFileSync(path.join(repo, 'a.txt'), 'hello\n')
git('add', '.')
git('commit', '-q', '-m', 'first desk')

const now = Date.now()
const iso = (minAgo) => new Date(now - minAgo * 60e3).toISOString()
let n = 0
function session(cwd, prompt) {
  const sid = `0000000${++n}-0000-4000-8000-00000000000${n}`
  writeLines(path.join(claude, 'projects', enc(cwd), `${sid}.jsonl`), [
    human(iso(40), prompt, cwd),
    assistant(iso(30), cwd, { blocks: [text('done')], stop: 'end_turn' }),
  ])
  return sid
}
session(repo, 'build the demo')
const lower = isWin ? repo[0].toLowerCase() + repo.slice(1) : null
if (lower) session(lower, 'the same demo from a shell that spells c: small')
// a drive no runner has: its git walk once looped for ever
const gone = isWin ? 'Q:\\gone\\app' : null
if (gone) session(gone, 'work on a drive since unplugged')

const env = {
  ...process.env, HOME: home, USERPROFILE: home, THEOFFICE_CACHE_DIR: cache, THEOFFICE_NO_NOVI: '1', THEOFFICE_NO_OPEN: '1',
}
delete env.CLAUDE_CONFIG_DIR
delete env.THEOFFICE_HOME
delete env.THEOFFICE_CLAUDE_DIR

function office(...args) {
  const t = performance.now()
  const r = spawnSync(process.execPath, [OFFICE, ...args], { env, encoding: 'utf8', timeout: 60e3, windowsHide: true })
  const ms = Math.round(performance.now() - t)
  assert.ok(!r.error, `office ${args.join(' ')}: ${r.error?.code === 'ETIMEDOUT' ? 'still running after 60 s (a hang)' : r.error}`)
  assert.equal(r.status, 0, `office ${args.join(' ')} exited ${r.status}:\n${r.stderr}`)
  console.log(`ok  office ${args.join(' ')}  (${ms} ms, ${r.stdout.length} chars)`)
  return r.stdout
}

const facts = JSON.parse(office('week', '--json'))
const demos = facts.projects.filter((p) => p.name === 'demo')
console.log(facts.projects.map((p) => `    ${p.name}  ${p.path}  sessions ${p.sessions}  commits ${p.commits}`).join('\n'))
assert.equal(demos.length, 1, `one demo project, not ${demos.length}: ${demos.map((p) => p.path).join(' | ')}`)
assert.equal(path.resolve(demos[0].path), repo, 'the demo project is the repo itself')
assert.equal(demos[0].sessions, lower ? 2 : 1, 'both spellings of the drive are its sessions')
assert.ok(demos[0].commits >= 1, 'its commit is counted')
if (gone) assert.ok(facts.projects.some((p) => p.name === 'app'), 'the session on a gone drive is still a project')

// every view and output the skill, the pane and the dashboard ask for
for (const view of ['live', 'today', 'week', 'month', 'work', 'all']) {
  const art = office(view, '--no-color')
  assert.ok(art.length > 100, `${view} drew text`)
}
office('all', '--json')
office('timelapse', 'week', '--json')
office('timelapse', 'week', '--no-color')
for (const args of [['live', '--pixel'], ['week', '--pixel'], ['timelapse', 'week', '--pixel']]) {
  const file = office(...args, '--no-color').trim()
  assert.ok(path.isAbsolute(file) && fs.statSync(file).size > 1000, `${args.join(' ')} wrote ${file}`)
}
const page = office('month', '--html', '--no-color').trim()
assert.ok(fs.statSync(page).size > 1000, `month --html wrote ${page}`)
const exported = office('timelapse', 'week', '--export').trim().split(/\r?\n/)
assert.equal(exported.length, 2, 'the page and the drawing')
for (const file of exported) assert.ok(fs.existsSync(file), `exported ${file}`)

// a second run reads the cache the first one left, and agrees with it
const again = JSON.parse(office('week', '--json'))
assert.deepEqual(again.projects.map((p) => [p.name, p.sessions, p.commits]), facts.projects.map((p) => [p.name, p.sessions, p.commits]))
const saved = fs.readdirSync(cache).filter((f) => /^cache-v\d+\.json$/.test(f))
assert.equal(saved.length, 1, 'one cache file')
const repos = Object.keys(JSON.parse(fs.readFileSync(path.join(cache, saved[0]), 'utf8')).repos ?? {})
assert.ok(repos.some((p) => path.resolve(p) === repo), `the repo is remembered in the cache: ${repos.join(' | ') || 'none'}`)

console.log(`\nall good on ${process.platform} (${os.release()}), node ${process.version}`)
