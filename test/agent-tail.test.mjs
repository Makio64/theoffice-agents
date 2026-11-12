process.env.THEOFFICE_SKIP_CWD_CHECK = '1'   // fake sessions have no process (liveness by cwd)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { READERS } from '../plugin/lib/agents.mjs'
import { collect } from '../plugin/lib/collect.mjs'

const NOW = Date.parse('2026-11-05T12:00:00Z')
const row = (type, payload, seconds = 1) => JSON.stringify({ timestamp: new Date(NOW - seconds * 1000).toISOString(), type, payload })
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'office-tail-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const directory = path.join(root, '.codex/sessions/2026/11/05')
  fs.mkdirSync(directory, { recursive: true })
  const file = path.join(directory, 'rollout-2026-11-05T11-50-00-00000000-0000-4000-8000-000000000001.jsonl')
  const content = command => [row('session_meta', { id: '00000000-0000-4000-8000-000000000001', cwd: root }, 600), row('event_msg', { type: 'task_started' }, 599), row('response_item', { type: 'function_call', name: 'exec_command', call_id: 'pending', arguments: JSON.stringify({ cmd: command }) }, 30)].join('\n') + '\n'
  fs.writeFileSync(file, content('npm test'))
  fs.utimesSync(file, NOW / 1000 - 30, NOW / 1000 - 30)
  const read = (size = fs.statSync(file).size) => READERS.codex.tail(file, size)
  return { root, file, read, content }
}

test('unchanged tails retain nested caller isolation while completed calls invalidate immediately', t => {
  const { file, read } = fixture(t)
  const first = read()
  assert.equal(first.pending.input.command, 'npm test')
  first.open = false;first.pending.input.command = 'Caller edit'
  assert.equal(read().open, true)
  assert.equal(read().pending.input.command, 'npm test')
  const oldSize = fs.statSync(file).size
  fs.appendFileSync(file, row('response_item', { type: 'function_call_output', call_id: 'pending', output: 'ok' }) + '\n' + row('event_msg', { type: 'task_complete' }) + '\n')
  assert.equal(read().pending, null)
  assert.equal(read().open, false)
  assert.equal(read(oldSize).open, true, 'a caller requesting an earlier prefix receives that prefix')
  assert.equal(read().open, false, 'the prefix cannot replace the full-file revision')
})

test('tails follow same-sized rewrites, atomic replacements, deletion and recreation', async t => {
  const { root, file, read, content } = fixture(t)
  assert.equal(read().pending.input.command, 'npm test')
  const original = fs.statSync(file)
  // Windows stamps a change by a clock that moves every ~16 ms: a rewrite in the same tick as the fixture's last
  // change would keep its ctime, which no agent rewriting a session could do
  if (process.platform === 'win32') await new Promise((resolve) => setTimeout(resolve, 40))
  fs.writeFileSync(file, content('npm lint'))
  fs.utimesSync(file, original.atime, original.mtime)
  assert.equal(read().pending.input.command, 'npm lint')
  const replacement = path.join(root, 'replacement.jsonl')
  fs.writeFileSync(replacement, content('npm unit'))
  fs.utimesSync(replacement, original.atime, original.mtime)
  fs.renameSync(replacement, file)
  assert.equal(read().pending.input.command, 'npm unit')
  fs.unlinkSync(file)
  const missing = READERS.codex.tail(file, original.size)
  assert.equal(missing.open, false)
  assert.equal(missing.pending, null)
  fs.writeFileSync(file, content('npm test'))
  assert.equal(read().pending.input.command, 'npm test')
})

test('a failed tail read is retried when the same unchanged file becomes readable', t => {
  const { file, read } = fixture(t)
  const original = fs.openSync
  fs.openSync = function (input, ...args) { if (input === file) throw Object.assign(new Error('temporary read failure'), { code: 'EIO' });return original.call(this, input, ...args) }
  try { assert.equal(read().open, false) } finally { fs.openSync = original }
  assert.equal(read().pending.input.command, 'npm test')
})

test('an unchanged parsed tail still ages from working to stalled using each collection clock', async t => {
  const { root } = fixture(t)
  const options = { home: root, agents: ['codex'], cacheDir: null, git: false, novi: false }
  const first = await collect({ ...options, now: NOW })
  assert.equal(first.live.desks[0].state, 'working')
  const later = await collect({ ...options, now: NOW + 11 * 60_000 })
  assert.equal(later.live.desks[0].state, 'idle')
  assert.equal(later.live.desks[0].idle_reason, 'stalled')
  assert.equal(later.live.desks[0].activity.kind, 'idle')
})
