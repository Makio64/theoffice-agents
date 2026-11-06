// The other tenants: account discovery (agentHomes) and the readers of Codex, Gemini (Antigravity and the CLI), Cursor,
// Kimi and Grok, against a fake $HOME holding one session of each and a second Claude account. Time is frozen at Mon 26
// Oct 2026 01:40 Europe/Paris, as in collect.test.mjs.
process.env.TZ = 'Europe/Paris'
process.env.THEOFFICE_SKIP_PID_CHECK = '1'
process.env.THEOFFICE_NO_NOVI = '1'

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { agentHomes } from '../plugin/lib/agents.mjs'
import { collect } from '../plugin/lib/collect.mjs'
import { fnv1a } from '../plugin/lib/model.mjs'
import { FROZEN, NOW, ago, assistant, cleanup, enc, human, toolUse, writeJson, writeLines } from './helpers/fake-claude.mjs'

/** Cursor's folder for a project: its path with every non-alphanumeric char a dash, the leading one dropped (`Users-me-app`); on Windows from its drive, `c-Users-me-app`. */
const cursorFolder = (p) => (process.platform === 'win32' ? enc(p).replace(/^([A-Za-z])-+/, (_, d) => `${d.toLowerCase()}-`) : enc(p).slice(1))

const UUID = {
  codex: '01a17487-0000-7000-8000-00000000c0de',
  codexSub: '01a17487-0000-7000-8000-0000000005ab',
  codexOld: '01a17000-0000-7000-8000-000000000a7c',
  antigravity: 'a9a9a9a9-0000-4000-8000-000000000001',
  cursor: 'c5c5c5c5-0000-4000-8000-000000000001',
  claudeMain: 'aaaaaaaa-1111-4000-8000-000000000001',
  claudeWork: 'bbbbbbbb-2222-4000-8000-000000000002',
}

/** A Codex rollout line: the keys in the order Codex writes them (its byte-level head reader relies on it). */
const rl = (ts, type, payload) => ({ timestamp: ts, ordinal: 0, type, payload })

let root
let app
let week

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-agents-'))
  // Windows' temp folder may be spelt short (RUNNER~1): the agents name their folders from the long names
  if (process.platform === 'win32') root = fs.realpathSync.native(root)
  app = path.join(root, 'work', 'app')
  fs.mkdirSync(app, { recursive: true })

  // ---- two Claude accounts: ~/.claude (main) and ~/.claude-work, a live desk in each
  for (const [dir, sid, pid] of [['.claude', UUID.claudeMain, 2147483101], ['.claude-work', UUID.claudeWork, 2147483102]]) {
    const home = path.join(root, dir)
    writeJson(path.join(home, 'sessions', `${pid}.json`), { pid, sessionId: sid, cwd: app, status: 'busy', startedAt: NOW - 1800e3, updatedAt: NOW - 60e3 })
    writeLines(path.join(home, 'projects', enc(app), `${sid}.jsonl`), [
      human(ago(1200e3), 'go', app),
      assistant(ago(1100e3), app, { blocks: [toolUse(`t-${pid}`, 'Read', { file_path: path.join(app, 'a.js') })] }),
      assistant(ago(900e3), app),
    ], NOW - 60e3)
  }

  // ---- Codex: a live rollout (a turn open, `npm test` running), its subagent, an archived (compressed) one from Saturday
  const day = path.join(root, '.codex', 'sessions', '2026', '10', '26')
  writeLines(path.join(day, `rollout-2026-10-26T00-30-00-${UUID.codex}.jsonl`), [
    rl(ago(600e3), 'session_meta', { id: UUID.codex, cwd: app, originator: 'codex_cli_rs', source: 'cli' }),
    rl(ago(599e3), 'turn_context', { turn_id: 't1', cwd: app, model: 'gpt-6.1-sol' }),
    rl(ago(598e3), 'event_msg', { type: 'task_started', turn_id: 't1' }),
    rl(ago(598e3), 'event_msg', { type: 'item_completed', item: { type: 'UserMessage', id: 'u1', content: [] } }),
    rl(ago(590e3), 'response_item', { type: 'custom_tool_call', call_id: 'c1', name: 'exec', input: 'const r = await tools.exec_command({cmd:"npm run build"})' }),
    rl(ago(560e3), 'response_item', { type: 'custom_tool_call_output', call_id: 'c1', output: 'built' }),
    rl(ago(500e3), 'response_item', { type: 'function_call', call_id: 'c2', name: 'apply_patch', arguments: JSON.stringify({ input: `*** Begin Patch\n*** Update File: ${app}/a.js\n@@\n-a\n+b\n*** End Patch` }) }),
    rl(ago(480e3), 'response_item', { type: 'function_call_output', call_id: 'c2', output: 'ok' }),
    rl(ago(470e3), 'event_msg', { type: 'token_count', info: { total_token_usage: { input_tokens: 1200, cached_input_tokens: 200, output_tokens: 80 } } }),
    rl(ago(30e3), 'response_item', { type: 'custom_tool_call', call_id: 'c3', name: 'exec', input: 'await tools.exec_command({cmd:"npm test"})' }),
  ], NOW - 30e3)
  writeLines(path.join(day, `rollout-2026-10-26T00-35-00-${UUID.codexSub}.jsonl`), [
    rl(ago(300e3), 'session_meta', { id: UUID.codexSub, cwd: app, agent_nickname: 'Euler', thread_source: 'subagent', source: { subagent: { thread_spawn: { parent_thread_id: UUID.codex } } } }),
    rl(ago(299e3), 'event_msg', { type: 'task_started', turn_id: 's1' }),
    rl(ago(60e3), 'response_item', { type: 'custom_tool_call', call_id: 's1', name: 'exec', input: 'await tools.exec_command({cmd:"rg TODO"})' }),
  ], NOW - 20e3)
  fs.writeFileSync(path.join(root, '.codex', 'session_index.jsonl'), `${JSON.stringify({ id: UUID.codex, thread_name: 'Tidy the build', updated_at: ago(1e3) })}\n`)
  const archived = [
    rl('2026-10-24T10:00:00.000Z', 'session_meta', { id: UUID.codexOld, cwd: app }),
    rl('2026-10-24T10:00:30.000Z', 'event_msg', { type: 'user_message', message: 'hi' }),
    rl('2026-10-24T10:01:00.000Z', 'response_item', { type: 'function_call', call_id: 'o1', name: 'exec_command', arguments: JSON.stringify({ cmd: 'ls' }) }),
    rl('2026-10-24T10:03:00.000Z', 'response_item', { type: 'function_call_output', call_id: 'o1', output: 'a.js' }),
  ].map((o) => JSON.stringify(o)).join('\n') + '\n'
  const zst = path.join(root, '.codex', 'archived_sessions', `rollout-2026-10-24T12-00-00-${UUID.codexOld}.jsonl.zst`)
  fs.mkdirSync(path.dirname(zst), { recursive: true })
  fs.writeFileSync(zst, zlib.zstdCompressSync(Buffer.from(archived)))
  fs.utimesSync(zst, new Date('2026-10-24T10:05:00Z'), new Date('2026-10-24T10:05:00Z'))
  // a second Codex account with nothing in the range: a home, but no account line
  fs.mkdirSync(path.join(root, '.codex-perso', 'sessions'), { recursive: true })

  // ---- Gemini: an Antigravity conversation that ended 20 minutes ago, and a Gemini CLI chat from Saturday
  const brain = path.join(root, '.gemini', 'antigravity', 'brain', UUID.antigravity)
  writeLines(path.join(brain, '.system_generated', 'logs', 'transcript.jsonl'), [
    { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: ago(1500e3), content: 'go' },
    { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: ago(1450e3), input_tokens: 900, output_tokens: 40,
      tool_calls: [{ name: 'read_file', args: JSON.stringify({ Path: JSON.stringify(path.join(app, 'a.js')) }) },
        { name: 'write_file', args: JSON.stringify({ Path: JSON.stringify(path.join(brain, 'task.md')) }) }] },
    { step_index: 2, source: 'MODEL', type: 'GENERIC', status: 'DONE', created_at: ago(1440e3), content: 'ok' },
    { step_index: 3, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: ago(1200e3), input_tokens: 100, output_tokens: 10 },
  ], NOW - 1200e3)
  fs.mkdirSync(path.join(root, '.gemini', 'antigravity', 'annotations'), { recursive: true })
  // a text proto: every non-ASCII byte is an octal escape (é is \303\251)
  fs.writeFileSync(path.join(root, '.gemini', 'antigravity', 'annotations', `${UUID.antigravity}.pbtxt`), 'title:"Pr\\303\\251parer la d\\303\\251mo" last_user_view_time:{seconds:1}')
  const hash = crypto.createHash('sha256').update(app).digest('hex')
  const chats = path.join(root, '.gemini', 'tmp', hash, 'chats')
  fs.mkdirSync(chats, { recursive: true })
  fs.writeFileSync(path.join(root, '.gemini', 'tmp', hash, '.project_root'), app)
  writeJson(path.join(chats, 'session-2026-10-24T09-00-aa.json'), {
    sessionId: 'aa', projectHash: hash, startTime: '2026-10-24T09:00:00.000Z', lastUpdated: '2026-10-24T09:06:00.000Z',
    messages: [
      { id: '1', timestamp: '2026-10-24T09:00:00.000Z', type: 'user', content: 'hello' },
      { id: '2', timestamp: '2026-10-24T09:03:00.000Z', type: 'gemini', model: 'gemini-3-pro', tokens: { input: 500, output: 20, cached: 100 },
        toolCalls: [{ name: 'run_shell_command', args: { command: 'npm test' }, status: 'success' }] },
      { id: '3', timestamp: '2026-10-24T09:06:00.000Z', type: 'gemini', model: 'gemini-3-pro', content: 'done' },
    ],
  }, Date.parse('2026-10-24T09:06:00.000Z'))

  // ---- Cursor: a live agent transcript (no timestamps), a turn open with a Shell call
  writeLines(path.join(root, '.cursor', 'projects', cursorFolder(app), 'agent-transcripts', UUID.cursor, `${UUID.cursor}.jsonl`), [
    { role: 'user', message: { content: [{ type: 'text', text: '<user_query>\nfix it\n</user_query>' }] } },
    { role: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { path: path.join(app, 'a.js') } }] } },
    { role: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] } },
    { role: 'assistant', message: { content: [{ type: 'tool_use', name: 'Shell', input: { command: 'npm run lint', description: 'Lint' } }] } },
  ], NOW - 45e3)

  // ---- Kimi (kimi-code): a session yesterday, two tool calls
  const kimi = path.join(root, '.kimi-code', 'sessions', 'wd_app_0123456789ab', 'session_k1')
  writeJson(path.join(kimi, 'state.json'), { title: 'Kimi pass', workDir: app, agents: { main: { type: 'main' } } })
  writeLines(path.join(kimi, 'agents', 'main', 'wire.jsonl'), [
    { type: 'turn.prompt', input: [{ type: 'text', text: 'go' }], origin: { kind: 'user' }, time: Date.parse('2026-10-25T10:00:00Z') },
    { type: 'llm.request', model: 'kimi-k3', time: Date.parse('2026-10-25T10:00:05Z') },
    { type: 'context.append_loop_event', event: { type: 'tool.call', toolCallId: 'k1', name: 'Bash', args: { command: 'ls' } }, time: Date.parse('2026-10-25T10:01:00Z') },
    { type: 'context.append_loop_event', event: { type: 'tool.call', toolCallId: 'k2', name: 'StrReplaceFile', args: { path: path.join(app, 'b.js') } }, time: Date.parse('2026-10-25T10:03:00Z') },
    { type: 'usage.record', usageScope: 'turn', usage: { inputOther: 300, output: 30 }, time: Date.parse('2026-10-25T10:03:30Z') },
  ], Date.parse('2026-10-25T10:03:30Z'))

  // ---- Grok Build: a live session reading a file, its title and model in summary.json
  const grok = path.join(root, '.grok', 'sessions', encodeURIComponent(app), 'g-session-1')
  writeJson(path.join(grok, 'summary.json'), { info: { id: 'g-session-1', cwd: app }, generated_title: 'Grok it', current_model_id: 'grok-5-build', created_at: ago(900e3) })
  writeLines(path.join(grok, 'updates.jsonl'), [
    { timestamp: ago(900e3), update: { sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'go' } } },
    { timestamp: ago(880e3), update: { sessionUpdate: 'tool_call', toolCallId: 'g1', kind: 'execute', title: 'npm ci', rawInput: { command: 'npm ci' } } },
    { timestamp: ago(800e3), update: { sessionUpdate: 'tool_call_update', toolCallId: 'g1', status: 'completed' } },
    { timestamp: ago(40e3), update: { sessionUpdate: 'tool_call', toolCallId: 'g2', kind: 'read', title: 'Read a.js', locations: [{ path: path.join(app, 'a.js') }] } },
  ], NOW - 40e3)

  week = await collect({ view: 'week', home: root, cacheDir: null, now: FROZEN, novi: false, git: false })
})
after(() => cleanup(root))

const deskOf = (agent) => week.live.desks.find((d) => d.agent === agent)

describe('accounts: every agent home on the machine', () => {
  test('the default folders, the sibling accounts and their labels; a prefix per home keys its files in the cache', () => {
    const homes = agentHomes({ root })
    const by = (agent) => homes.filter((h) => h.agent === agent).map((h) => [path.basename(h.dir), h.label, h.prefix])
    assert.deepEqual(by('claude'), [['.claude', 'main', ''], ['.claude-work', 'work', '@claude.work/']])
    assert.deepEqual(by('codex'), [['.codex', 'main', '@codex/'], ['.codex-perso', 'perso', '@codex.perso/']])
    assert.deepEqual(by('gemini'), [['.gemini', null, '@gemini/']])
    assert.deepEqual(by('cursor'), [['.cursor', null, '@cursor/']])
    assert.deepEqual(by('grok'), [['.grok', null, '@grok/']])
    assert.deepEqual(by('kimi'), [['.kimi-code', null, '@kimi/']])
  })

  test('a Claude folder given explicitly is read alone; `agents` limits the agents', () => {
    const only = agentHomes({ root: null, claudeDir: path.join(root, '.claude') })
    assert.deepEqual(only.map((h) => [h.agent, h.label]), [['claude', null]])
    assert.deepEqual([...new Set(agentHomes({ root, agents: ['claude', 'grok'] }).map((h) => h.agent))], ['claude', 'grok'])
  })

  test('the facts list the accounts that worked in the range or have a desk (a home with nothing to show is left out)', () => {
    const acc = week.accounts.map((a) => `${a.agent}${a.label ? `@${a.label}` : ''}`).sort()
    assert.deepEqual(acc, ['claude@main', 'claude@work', 'codex@main', 'cursor', 'gemini', 'grok', 'kimi'])
    const work = week.accounts.find((a) => a.label === 'work')
    assert.equal(work.live, 1)
    assert.ok(work.minutes > 0)
  })
})

describe('live: every agent at its own desk', () => {
  test('one desk per live session, each with its agent and, where the agent has several, its account', () => {
    const got = week.live.desks.map((d) => `${d.agent}:${d.account ?? '-'}`).sort()
    assert.deepEqual(got, ['claude:main', 'claude:work', 'codex:main', 'cursor:-', 'gemini:-', 'grok:-'])
  })

  test('Codex: an open turn running `npm test` is testing; its fresh subagent is an intern; its title from the index', () => {
    const d = deskOf('codex')
    assert.equal(d.state, 'working')
    assert.equal(d.activity.kind, 'testing')
    assert.equal(d.title, 'Tidy the build')
    assert.equal(d.model, 'gpt-6.1-sol')
    assert.equal(d.project, 'app')
    assert.equal(d.interns.length, 1)
    assert.equal(d.interns[0].agent, 'codex')
    assert.equal(d.interns[0].description, 'Euler')
    assert.equal(week.live.desks.filter((x) => x.agent === 'codex').length, 1, 'a subagent is never a desk of its own')
    assert.notEqual(d.id, d.interns[0].id, 'ids stay apart though Codex ids share their first chars')
  })

  test('Cursor: no timestamps, a turn open with a Shell call: working at the terminal', () => {
    const d = deskOf('cursor')
    assert.equal(d.state, 'working')
    assert.equal(d.activity.kind, 'terminal')
    assert.equal(d.activity.tool, 'Bash')
    assert.equal(d.project, 'app')
  })

  test('Grok: a pending read is reading; title and model from summary.json', () => {
    const d = deskOf('grok')
    assert.equal(d.state, 'working')
    assert.equal(d.activity.kind, 'reading')
    assert.equal(d.title, 'Grok it')
    assert.equal(d.model, 'grok-5-build')
  })

  test('an idle desk says why: Codex done, aborted (stopped) or left open and quiet (stalled); an Antigravity error', async () => {
    const r2 = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-ends-'))
    try {
      const cwd = path.join(r2, 'work', 'app')
      fs.mkdirSync(cwd, { recursive: true })
      const day = path.join(r2, '.codex', 'sessions', '2026', '10', '26')
      const rollout = (id, tail, mtime) => writeLines(path.join(day, `rollout-2026-10-26T00-20-00-${id}.jsonl`), [
        rl(ago(1200e3), 'session_meta', { id, cwd, originator: 'codex_cli_rs', source: 'cli' }),
        rl(ago(1199e3), 'event_msg', { type: 'task_started', turn_id: 't1' }),
        rl(ago(1190e3), 'response_item', { type: 'function_call', call_id: 'c1', name: 'shell', arguments: JSON.stringify({ command: ['ls'] }) }),
        ...tail,
      ], mtime)
      const ids = { done: '01a17487-0000-7000-8000-0000000d0e01', stopped: '01a17487-0000-7000-8000-0000000d0e02', stalled: '01a17487-0000-7000-8000-0000000d0e03' }
      rollout(ids.done, [rl(ago(120e3), 'response_item', { type: 'function_call_output', call_id: 'c1', output: 'ok' }), rl(ago(120e3), 'event_msg', { type: 'task_complete' })], NOW - 120e3)
      rollout(ids.stopped, [rl(ago(120e3), 'event_msg', { type: 'turn_aborted', reason: 'interrupted' })], NOW - 120e3)
      rollout(ids.stalled, [], NOW - 900e3)
      const brain = path.join(r2, '.gemini', 'antigravity', 'brain', UUID.antigravity)
      writeLines(path.join(brain, '.system_generated', 'logs', 'transcript.jsonl'), [
        { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: ago(300e3), content: 'go' },
        { step_index: 1, source: 'SYSTEM', type: 'ERROR_MESSAGE', status: 'DONE', created_at: ago(240e3), content: 'quota exceeded' },
      ], NOW - 240e3)
      const f = await collect({ view: 'live', home: r2, cacheDir: null, now: FROZEN, novi: false, git: false, agents: 'codex,gemini' })
      // a desk of another agent is keyed by a hash of its session id (agents.mjs shortId)
      const deskId = (id) => fnv1a(`codex:${id}`).toString(16).padStart(8, '0')
      const reason = (agent, id) => f.live.desks.filter((d) => d.agent === agent && (!id || d.id === deskId(id))).map((d) => [d.state, d.idle_reason])
      assert.deepEqual(reason('codex', ids.done), [['idle', 'done']])
      assert.deepEqual(reason('codex', ids.stopped), [['idle', 'stopped']])
      assert.deepEqual(reason('codex', ids.stalled), [['idle', 'stalled']])
      assert.deepEqual(reason('gemini'), [['idle', 'error']])
    } finally {
      cleanup(r2)
    }
  })

  test('Antigravity: its last answer came 20 minutes ago with no call pending: idle, its title decoded from the text proto', () => {
    const d = deskOf('gemini')
    assert.equal(d.state, 'idle')
    assert.equal(d.idle_reason, 'done')
    assert.equal(d.title, 'Préparer la démo')
    assert.equal(d.project, 'app', "the conversation's own notes folder (brain/<id>) is not a project")
  })
})

describe('history: every agent books into the same projects', () => {
  test("the project's agent-time is split by agent, and the totals add it up", () => {
    const p = week.projects.find((x) => x.name === 'app')
    for (const a of ['claude', 'codex', 'gemini', 'cursor', 'kimi', 'grok']) assert.ok(p.agents[a] > 0, `${a} worked on app: ${JSON.stringify(p.agents)}`)
    assert.equal(Object.values(p.agents).reduce((s, m) => s + m, 0) - p.agent_minutes <= 6, true, 'the split adds up to the agent-time (rounding)')
    assert.deepEqual(Object.keys(week.totals.agents).sort(), ['claude', 'codex', 'cursor', 'gemini', 'grok', 'kimi'])
    assert.equal(week.projects.filter((x) => /^[0-9a-f-]{36}$/.test(x.name)).length, 0, 'no project named after a conversation folder')
  })

  test('tool calls by kind: Codex code mode, apply_patch and the archive, Kimi, the Gemini CLI, Cursor, Grok', () => {
    const p = week.projects.find((x) => x.name === 'app')
    // codex: build (terminal), patch (coding), npm test (testing), archived ls (terminal); its subagent's rg (terminal);
    // kimi: Bash, StrReplaceFile; gemini cli: npm test; antigravity: read_file, write_file; cursor: Read, Shell; grok: execute, read
    assert.ok(p.activity.testing >= 2, JSON.stringify(p.activity))
    assert.ok(p.activity.coding >= 3, JSON.stringify(p.activity))
    assert.ok(p.activity.terminal >= 5, JSON.stringify(p.activity))
    assert.ok(p.activity.reading >= 3, JSON.stringify(p.activity))
    assert.ok(p.files_edited >= 2)
    assert.ok(p.subagents >= 1)
    assert.ok(week.per_day['2026-10-24'].sessions >= 2, 'the archived Codex rollout and the Gemini CLI chat count on Saturday')
    assert.ok(week.per_day['2026-10-25'].minutes > 0, "Kimi's session counts on Sunday")
    assert.ok(p.models['gpt-6.1-sol'] && p.models['gemini-3-pro'] && p.models['kimi-k3'] && p.models['grok-5-build'])
  })

  test('an archive longer than what is unpacked at a time loses no line at its seams, nor its last one', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-agents-zst-'))
    try {
      const id = '01a17000-0000-7000-8000-000000000b1c'
      const at = (i) => new Date(Date.parse('2026-10-24T10:00:00Z') + i * 100).toISOString()
      const call = (i) => ({
        timestamp: at(i), type: 'response_item',
        payload: { type: 'function_call', call_id: `c${i}`, name: 'exec_command', arguments: JSON.stringify({ cmd: 'ls', pad: crypto.randomBytes(1000).toString('hex') }) },
      })
      const calls = Array.from({ length: 2500 }, (_, i) => call(i))
      const lines = [{ timestamp: at(0), type: 'session_meta', payload: { id, cwd: '/a/app' } }, ...calls]
      const zst = path.join(dir, '.codex', 'archived_sessions', `rollout-2026-10-24T12-00-00-${id}.jsonl.zst`)
      fs.mkdirSync(path.dirname(zst), { recursive: true })
      fs.writeFileSync(zst, zlib.zstdCompressSync(Buffer.from(lines.map((o) => JSON.stringify(o)).join('\n'))))   // no newline at its end
      fs.utimesSync(zst, new Date('2026-10-24T10:05:00Z'), new Date('2026-10-24T10:05:00Z'))
      const f = await collect({ view: 'week', home: dir, cacheDir: null, now: FROZEN, novi: false, git: false, agents: 'codex' })
      assert.equal(f.totals.tool_calls, calls.length)
    } finally {
      cleanup(dir)
    }
  })

  test('a broken archive counts for what could be read, and is not unpacked again', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-agents-bad-'))
    const cacheDir = path.join(dir, 'cache')
    try {
      const id = '01a17000-0000-7000-8000-000000000b1d'
      const at = (i) => new Date(Date.parse('2026-10-24T10:00:00Z') + i * 1000).toISOString()
      const lines = [{ timestamp: at(0), type: 'session_meta', payload: { id, cwd: '/a/app' } }]
      for (let i = 0; i < 3000; i++) lines.push({ timestamp: at(i), type: 'response_item', payload: { type: 'function_call', call_id: `c${i}`, name: 'exec_command', arguments: JSON.stringify({ cmd: 'ls', pad: 'x'.repeat(40) + i }) } })
      const packed = Buffer.from(zlib.zstdCompressSync(Buffer.from(lines.map((o) => JSON.stringify(o)).join('\n'))))
      packed.fill(0xff, packed.length >> 1, (packed.length >> 1) + 64)
      const zst = path.join(dir, '.codex', 'archived_sessions', `rollout-2026-10-24T12-00-00-${id}.jsonl.zst`)
      fs.mkdirSync(path.dirname(zst), { recursive: true })
      fs.writeFileSync(zst, packed)
      fs.utimesSync(zst, new Date('2026-10-24T10:05:00Z'), new Date('2026-10-24T10:05:00Z'))
      const ask = () => collect({ view: 'week', home: dir, cacheDir, now: FROZEN, novi: false, git: false, agents: 'codex' })
      const first = await ask()
      assert.ok(first.totals.tool_calls < lines.length - 1)
      const again = await ask()
      assert.equal(again.sources.files_from_cache, again.sources.files_scanned)
      assert.equal(again.totals.tool_calls, first.totals.tool_calls)
    } finally {
      cleanup(dir)
    }
  })

  test('a page of the past finds its Codex sessions however far back their folder, and never unpacks an archive that began after it ended', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-agents-past-'))
    const cacheDir = path.join(dir, 'cache')
    try {
      const id = '01a17000-0000-7000-8000-00000000030a'
      writeLines(path.join(dir, '.codex', 'sessions', '2026', '03', '10', `rollout-2026-03-10T10-00-00-${id}.jsonl`), [
        rl('2026-03-10T10:00:00.000Z', 'session_meta', { id, cwd: '/a/app' }),
        rl('2026-03-10T10:00:30.000Z', 'event_msg', { type: 'user_message', message: 'hi' }),
        rl('2026-03-10T10:01:00.000Z', 'response_item', { type: 'function_call', call_id: 'm1', name: 'exec_command', arguments: JSON.stringify({ cmd: 'ls' }) }),
        rl('2026-03-10T10:03:00.000Z', 'response_item', { type: 'function_call_output', call_id: 'm1', output: 'a.js' }),
      ], Date.parse('2026-03-10T10:03:00Z'))
      // archived since March, as every rollout of the months after it is: written in October, begun in October
      const late = '01a17000-0000-7000-8000-00000000030b'
      const zst = path.join(dir, '.codex', 'archived_sessions', `rollout-2026-10-24T12-00-00-${late}.jsonl.zst`)
      fs.mkdirSync(path.dirname(zst), { recursive: true })
      fs.writeFileSync(zst, zlib.zstdCompressSync(Buffer.from(`${JSON.stringify(rl('2026-10-24T10:00:00.000Z', 'session_meta', { id: late, cwd: '/a/app' }))}\n`)))
      fs.utimesSync(zst, new Date('2026-10-24T10:05:00Z'), new Date('2026-10-24T10:05:00Z'))
      const page = await collect({ view: 'month', back: 7, home: dir, cacheDir, now: FROZEN, novi: false, git: false, agents: 'codex' })
      assert.deepEqual([page.range.label, page.totals.tool_calls, page.totals.agents], ['March 2026', 1, { codex: 3 }])
      const tier = (name) => (fs.existsSync(path.join(cacheDir, name)) ? Object.keys(JSON.parse(fs.readFileSync(path.join(cacheDir, name), 'utf8')).files) : [])
      const keys = [...tier('cache-v1.json'), ...tier('cache-v1-cold.json')]
      assert.ok(!keys.some((k) => k.includes(late)), 'October\'s archive is not unpacked for March')
    } finally {
      cleanup(dir)
    }
  })

  test('a second run from the cache gives the same split; the other agents\' entries are keyed by their home', async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-agents-cache-'))
    try {
      const cold = await collect({ view: 'week', home: root, cacheDir, now: FROZEN, novi: false, git: false })
      const warm = await collect({ view: 'week', home: root, cacheDir, now: FROZEN, novi: false, git: false })
      assert.deepEqual(warm.totals.agents, cold.totals.agents)
      assert.deepEqual(warm.totals.agents, week.totals.agents)
      const keys = Object.keys(JSON.parse(fs.readFileSync(path.join(cacheDir, 'cache-v1.json'), 'utf8')).files)
      for (const p of ['@codex/', '@gemini/', '@cursor/', '@kimi/', '@grok/', '@claude.work/']) assert.ok(keys.some((k) => k.startsWith(p)), `${p} in ${keys.join(', ')}`)
      assert.ok(keys.some((k) => k.startsWith(enc(app))), "~/.claude's own keys keep no prefix (a cache from before accounts stays valid)")
    } finally {
      cleanup(cacheDir)
    }
  })

  test('a rewritten whole-file session alone is enough for a run to save, so the next one does not read it again', async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-agents-cache-'))
    const hot = () => JSON.parse(fs.readFileSync(path.join(cacheDir, 'cache-v1.json'), 'utf8'))
    const ask = () => collect({ view: 'week', home: root, cacheDir, now: FROZEN, novi: false, git: false })
    try {
      await ask()
      const key = Object.keys(hot().files).find((k) => k.startsWith('@gemini/') && k.endsWith('.json'))
      const file = path.join(root, '.gemini', key.slice('@gemini/'.length))
      const text = fs.readFileSync(file, 'utf8')
      const was = hot().files[key].size
      const st = fs.statSync(file)
      fs.writeFileSync(file, `${text} `)
      fs.utimesSync(file, st.atime, st.mtime)
      await ask()
      assert.equal(hot().files[key].size, was + 1)
      fs.writeFileSync(file, text)
      fs.utimesSync(file, st.atime, st.mtime)
    } finally {
      cleanup(cacheDir)
    }
  })

  test('a series of runs keeps a walk a minute: what was written lately is stat\'ed all the same, a new session waits for the next walk', async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-agents-cache-'))
    const dir = path.join(root, '.codex', 'sessions', '2026', '10', '26')
    const copyOf = (name) => path.join(dir, `rollout-2026-10-26T00-30-00-${name}.jsonl`)
    const source = fs.readdirSync(dir).map((n) => path.join(dir, n)).find((p) => p.endsWith('.jsonl'))
    const ask = (at) => collect({ view: 'week', home: root, cacheDir, now: NOW + at, novi: false, git: false, series: true })
    const sessions = (f) => f.totals.sessions
    const walks = () => JSON.parse(fs.readFileSync(path.join(cacheDir, 'walks-v1.json'), 'utf8'))
    const fresh = copyOf('00000000-0000-4000-8000-00000000abcd')
    try {
      const first = await ask(0)
      assert.equal(walks().at, NOW)
      assert.ok(Object.keys(walks().homes).some((k) => k.startsWith('@codex')))
      assert.ok(walks().homes['@codex/'].every((f) => !('key' in f) && !('abs' in f) && Object.keys(f.st).length === 4), 'plain data')
      fs.copyFileSync(source, fresh)
      fs.utimesSync(fresh, new Date(NOW), new Date(NOW))
      assert.equal(sessions(await ask(30e3)), sessions(first), 'the walk of 30 s ago holds')
      assert.equal(walks().at, NOW)
      assert.equal(sessions(await ask(61e3)), sessions(first) + 1, 'the next walk finds it')
      assert.equal(walks().at, NOW + 61e3)
      fs.rmSync(fresh)
      const gone = await ask(62e3)
      assert.equal(sessions(gone), sessions(first), 'written lately, so stat\'ed: a file gone is gone at once')
      const oneShot = await collect({ view: 'week', home: root, cacheDir, now: NOW + 62e3, novi: false, git: false })
      assert.deepEqual(oneShot.totals.agents, gone.totals.agents, 'a run on a remembered walk draws what a real walk does')
      assert.equal((await collect({ view: 'month', home: root, cacheDir, now: NOW + 63e3, novi: false, git: false, series: true })).range.kind, 'month')
      assert.equal(walks().at, NOW + 63e3, 'a range further back than the walk walks again')
    } finally {
      fs.rmSync(fresh, { force: true })
      cleanup(cacheDir)
    }
  })

  test('the desktop pane is told which files to watch: the live sessions of the other agents', () => {
    const w = week.sources.watch
    assert.ok(w.some((p) => p.includes('.codex')) && w.some((p) => p.includes('.grok')) && w.some((p) => p.includes('.cursor')))
    assert.ok(w.every((p) => path.isAbsolute(p)))
  })

  test('THEOFFICE_AGENTS / `agents` reads only the agents asked for', async () => {
    const f = await collect({ view: 'week', home: root, cacheDir: null, now: FROZEN, novi: false, git: false, agents: 'claude,codex' })
    assert.deepEqual([...new Set(f.live.desks.map((d) => d.agent))].sort(), ['claude', 'codex'])
    assert.deepEqual(Object.keys(f.totals.agents).sort(), ['claude', 'codex'])
  })

  test("novi's visitors are the agents the office does not read: its Antigravity is Gemini's, a tenant", { skip: process.platform === 'win32' }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-novi-'))
    const s = (tool) => ({ tool, title: tool, start: ago(3600e3), end: ago(3000e3), active_minutes: 10 })
    writeJson(path.join(dir, 'facts.json'), { spec: 'novibenolife-facts/1', projects: [{ path: app, name: 'app', sessions: ['antigravity', 'Codex', 'aider'].map(s) }] })
    fs.writeFileSync(path.join(dir, 'novi'), `#!/bin/sh\ncat '${path.join(dir, 'facts.json')}'\n`, { mode: 0o755 })
    const { PATH, THEOFFICE_NO_NOVI } = process.env
    process.env.PATH = `${dir}${path.delimiter}${PATH}`
    delete process.env.THEOFFICE_NO_NOVI
    try {
      const tools = async (agents) => (await collect({ view: 'week', home: root, cacheDir: null, now: FROZEN, git: false, agents })).contractors.map((c) => c.tool).sort()
      assert.deepEqual(await tools(undefined), ['aider'])
      // an agent left unread is novi's to tell
      assert.deepEqual(await tools('claude,codex'), ['aider', 'antigravity'])
    } finally {
      process.env.PATH = PATH
      process.env.THEOFFICE_NO_NOVI = THEOFFICE_NO_NOVI
      cleanup(dir)
    }
  })
})
