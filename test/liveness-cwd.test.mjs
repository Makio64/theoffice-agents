// Liveness of pid-less hosts by working directory: a session counts as alive only while a process of the same agent
// has the session's directory as its cwd. The process table is injected (ctx.procTable): no real process is read.
process.env.TZ = 'Europe/Paris'
process.env.THEOFFICE_SKIP_PID_CHECK = '1'   // fake pids for Claude; the cwd check stays on because a table is injected
process.env.THEOFFICE_NO_NOVI = '1'
delete process.env.THEOFFICE_SKIP_CWD_CHECK
delete process.env.THEOFFICE_AGENTS

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hostAlive, liveHostCwds } from '../plugin/lib/agents.mjs'
import { collect } from '../plugin/lib/collect.mjs'
import { FROZEN, NOW, ago, cleanup, writeLines } from './helpers/fake-claude.mjs'

const ID = '01a17487-0000-7000-8000-00000000c0de'
const SUB = '01a17487-0000-7000-8000-0000000005ab'
const rl = (ts, type, payload) => ({ timestamp: ts, ordinal: 0, type, payload })

let root, app, link
before(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-cwd-')))
  app = path.join(root, 'app')
  fs.mkdirSync(app)
  link = path.join(root, 'link')
  fs.symlinkSync(app, link)
  const day = path.join(root, '.codex', 'sessions', '2026', '10', '26')
  writeLines(path.join(day, `rollout-2026-10-26T00-30-00-${ID}.jsonl`), [
    rl(ago(600e3), 'session_meta', { id: ID, cwd: link, originator: 'codex_cli_rs', source: 'cli' }),
    rl(ago(599e3), 'turn_context', { turn_id: 't1', cwd: link, model: 'gpt-6.1-sol' }),
    rl(ago(598e3), 'event_msg', { type: 'task_started', turn_id: 't1' }),
    rl(ago(30e3), 'response_item', { type: 'custom_tool_call', call_id: 'c3', name: 'exec', input: 'await tools.exec_command({cmd:"npm test"})' }),
  ], NOW - 30e3)
  writeLines(path.join(day, `rollout-2026-10-26T00-35-00-${SUB}.jsonl`), [
    rl(ago(300e3), 'session_meta', { id: SUB, cwd: '/nowhere/else', agent_nickname: 'Euler', thread_source: 'subagent', source: { subagent: { thread_spawn: { parent_thread_id: ID } } } }),
    rl(ago(299e3), 'event_msg', { type: 'task_started', turn_id: 's1' }),
  ], NOW - 20e3)
  const cs = path.join(root, '.copilot', 'session-state', 'cafe0000-1111')
  fs.mkdirSync(cs, { recursive: true })
  fs.writeFileSync(path.join(cs, 'workspace.yaml'), `id: cafe0000-1111\ncwd: ${app}\nname: tidy\ncreated_at: ${ago(300e3)}\nupdated_at: ${ago(20e3)}\n`)
  fs.utimesSync(cs, new Date(NOW - 20e3), new Date(NOW - 20e3))
  fs.utimesSync(path.join(cs, 'workspace.yaml'), new Date(NOW - 20e3), new Date(NOW - 20e3))
})
after(() => cleanup(root))

const desks = async (procTable) => (await collect({ view: 'live', home: root, cacheDir: null, now: FROZEN, novi: false, git: false, procTable })).live.desks
const agents = (ds) => ds.map((d) => d.agent).sort()
const proc = (command, cwd, pid = 10) => ({ pid, command, cwd })

describe('liveness by working directory', () => {
  test('a process of the same agent in the directory keeps the desk (symlink and trailing slash normalised)', async () => {
    const ds = await desks([proc('/opt/bin/codex --foo', `${app}/`), proc('/x/copilot', app, 11)])
    assert.deepEqual(agents(ds), ['codex', 'copilot'])
  })

  test('a finished session (no process in its directory) is dropped, Copilot too', async () => {
    assert.deepEqual(agents(await desks([proc('/opt/bin/codex', '/elsewhere')])), [])
  })

  test("another agent's process in the same directory does not keep it alive", async () => {
    assert.deepEqual(agents(await desks([proc('/usr/bin/opencode run', app), proc('/usr/bin/omp -p x', app, 11)])), [])
    assert.deepEqual(agents(await desks([proc('node /usr/lib/node_modules/.bin/copilot', app)])), ['copilot'], 'a launcher runs the host script')
  })

  test('an intern follows its parent, whatever its own directory', async () => {
    const d = (await desks([proc('codex', app)])).find((x) => x.agent === 'codex')
    assert.equal(d.interns.length, 1)
  })

  test('a failed lookup (null) hides nothing; a table without any host process hides all', async () => {
    const ctx = { procTable: undefined, log() {} }
    const prev = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try { assert.equal(liveHostCwds(ctx), null); assert.equal(hostAlive(ctx, 'codex', app), true) } finally { Object.defineProperty(process, 'platform', { value: prev }) }
    // no process of any host at all is a real answer: everything finished
    const m = liveHostCwds({ procTable: [proc('/bin/zsh', '/')] })
    assert.deepEqual([...m.keys()].sort(), ['codex', 'copilot', 'omp', 'opencode'])
    assert.ok([...m.values()].every((s) => s.size === 0))
  })
})
