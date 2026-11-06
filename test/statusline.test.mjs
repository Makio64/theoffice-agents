// The status line every other host can run (scripts/statusline.mjs) and the editor's status bar item built from it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFile, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { FRESH_MS, readShared, sharedAll, startRefresh, statusArgs, statusLine } from '../plugin/scripts/statusline.mjs'
import { renderStatus, statusCounts } from '../plugin/lib/ascii.mjs'
import { emptyFacts, stressFacts } from './helpers/facts.mjs'

const { headcountItem, readHeadcount } = createRequire(import.meta.url)('../extensions/vscode/extension.cjs')
const SCRIPT = fileURLToPath(new URL('../plugin/scripts/statusline.mjs', import.meta.url))

function cacheWith(t, facts, ageMs = 0) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-status-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const env = { THEOFFICE_CACHE_DIR: dir }
  if (facts) {
    const file = sharedAll(env)
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    fs.writeFileSync(file, JSON.stringify(facts), { mode: 0o600 })
    const at = (Date.now() - ageMs) / 1000
    fs.utimesSync(file, at, at)
  }
  return env
}

test('arguments: width, ascii and json; anything else is ignored', () => {
  assert.deepEqual(statusArgs([]), { width: 80, ascii: false, json: false, refresh: null })
  assert.deepEqual(statusArgs(['--width', '44', '--ascii', '--json', '--bogus']), { width: 44, ascii: true, json: true, refresh: null })
  assert.equal(statusArgs(['--width', '3']).width, 20, 'a width too narrow for one group is raised')
  assert.equal(statusArgs(['--width', '-1']).width, 80)
})

test('a fresh shared answer is drawn as the pane draws its status line, with no refresh', async (t) => {
  const facts = stressFacts()
  const env = cacheWith(t, facts)
  let spawned = 0
  const line = await statusLine({ env, width: 60, spawnRefresh: () => spawned++ })
  assert.equal(line.text, renderStatus(facts, { width: 60 }))
  assert.equal(line.stale, false)
  assert.deepEqual({ desks: line.desks, asking: line.asking, errors: line.errors, working: line.working, interns: line.interns }, statusCounts(facts))
  assert.ok(line.asking > 0, 'the stress office has a hand up')
  assert.equal(spawned, 0)
})

test('a stale answer is still drawn, and starts one refresh however often the host asks', async (t) => {
  const env = cacheWith(t, emptyFacts(), FRESH_MS + 5_000)
  let spawned = 0
  const first = await statusLine({ env, spawnRefresh: () => spawned++ })
  assert.equal(first.stale, true)
  assert.match(first.text, /^🏢 office empty/)
  await statusLine({ env, spawnRefresh: () => spawned++ })
  assert.equal(spawned, 1, 'a refresh started a moment ago is not started again')
  assert.equal(fs.statSync(path.join(path.dirname(sharedAll(env)), 'statusline.refresh')).mode & 0o777, 0o600)
})

test('a run under way is never doubled by a status line', async (t) => {
  const env = cacheWith(t, emptyFacts(), FRESH_MS + 5_000)
  fs.writeFileSync(`${sharedAll(env)}.lock`, String(process.pid))
  assert.equal(startRefresh(sharedAll(env), Date.now(), { spawnRefresh: () => assert.fail('no refresh while the lock is held') }), false)
})

test('no answer yet: a line that says the office is being read, never a crash', async (t) => {
  const env = cacheWith(t, null)
  let spawned = 0
  assert.deepEqual(await statusLine({ env, spawnRefresh: () => spawned++ }), { text: '🏢 reading your agents…', at: null, stale: true, desks: 0, asking: 0, errors: 0, working: 0, interns: 0 })
  assert.equal((await statusLine({ env, ascii: true, spawnRefresh: () => spawned++ })).text, '[office] reading your agents...')
  assert.equal(spawned, 1)
  fs.mkdirSync(path.dirname(sharedAll(env)), { recursive: true })
  fs.writeFileSync(sharedAll(env), '{"not":"facts"}')
  assert.equal(readShared(sharedAll(env)), null, 'a file that is not the facts is not drawn')
})

test('the script prints one line and reads no stdin it is handed', (t) => {
  const env = { ...process.env, ...cacheWith(t, stressFacts()) }
  const out = execFileSync(process.execPath, [SCRIPT, '--width', '50'], { env, input: JSON.stringify({ session_id: 'x', model: { id: 'm' } }), encoding: 'utf8' })
  assert.equal(out, `${renderStatus(stressFacts(), { width: 50 })}\n`)
  const json = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--json'], { env, encoding: 'utf8' }))
  assert.equal(typeof json.text, 'string')
  assert.equal(json.stale, false)
})

test('the editor status bar shows the headcount, lit while an agent needs the person', async (t) => {
  assert.deepEqual(headcountItem(null), { text: '$(organization) Office', tooltip: 'Open The Office sidebar', warn: false })
  const calm = headcountItem({ text: '🏢 5 working · 2 interns', asking: 0, errors: 0 })
  assert.equal(calm.text, '$(organization) 5 working · 2 interns')
  assert.equal(calm.warn, false)
  const asked = headcountItem({ text: '🏢 1 hand up · 1 error · 5 working', asking: 1, errors: 1 })
  assert.equal(asked.warn, true)
  assert.match(asked.tooltip, /2 agents need you/)
  assert.doesNotMatch(headcountItem({ text: '🏢 $(alert) x', asking: 0 }).text.slice(2), /\$\(/, 'a project name never becomes an icon')
  const env = { ...process.env, ...cacheWith(t, stressFacts()) }
  const line = await readHeadcount(process.execPath, SCRIPT, (file, args, options, callback) => execFile(file, args, { ...options, env }, callback))
  assert.equal(line.asking, statusCounts(stressFacts()).asking)
  assert.equal(await readHeadcount('/nonexistent/node', SCRIPT), null, 'no Node: the plain button')
})
