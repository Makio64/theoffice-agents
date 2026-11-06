// Builds a fake ~/.claude tree (+ two git checkouts) in a temp dir for the collector tests.
// Every timestamp is relative to a frozen "now" (pass it to collect / THEOFFICE_NOW); file and dir mtimes
// are set explicitly so mtime-based filters behave as on a real machine.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export const FROZEN = '2026-10-26T00:40:00.000Z'   // Mon 26 Oct 01:40 in Europe/Paris (CET, the day after DST ended)
export const NOW = Date.parse(FROZEN)

export const SID = {
  A: 'aaaaaaaa-0000-4000-8000-000000000001',   // live, busy, editing; Explore intern + running workflow
  B: 'bbbbbbbb-0000-4000-8000-000000000002',   // worktree session (repo/.claude/worktrees/feat-x)
  C: 'cccccccc-0000-4000-8000-000000000003',   // scratchpad cwd rolled up to repo
  D: 'dddddddd-0000-4000-8000-000000000004',   // otherproj: prompt rules, token dedupe, gaps, day buckets
  E: 'eeeeeeee-0000-4000-8000-000000000005',   // live, busy, turn ended, background intern → waiting_on_agents
  F: 'ffffffff-0000-4000-8000-000000000006',   // live, idle
  G: '99999999-0000-4000-8000-000000000007',   // live, busy, pending AskUserQuestion → asking
  H: '88888888-0000-4000-8000-000000000008',   // clone checkout (same commits as repo → dedupe)
  OLD: '77777777-0000-4000-8000-000000000009', // two weeks old: outside the week
}

export const enc = (p) => p.replace(/[^a-zA-Z0-9]/g, '-')
export const at = (iso) => Date.parse(iso)
export const ago = (ms) => new Date(NOW - ms).toISOString()

// ---------------------------------------------------------------- line builders

function envelope(o) {
  // key order matters: the collector's byte prefilter expects lines to start with {"parentUuid"
  return { parentUuid: null, isSidechain: false, ...o }
}

export function human(ts, text, cwd, extra = {}) {
  return envelope({ type: 'user', message: { role: 'user', content: text }, uuid: randomUUID(), timestamp: ts, origin: { kind: 'human' },
    entrypoint: 'claude-desktop', cwd, gitBranch: 'main', ...extra })
}

export function userRaw(ts, content, cwd, extra = {}) {
  return envelope({ type: 'user', message: { role: 'user', content }, uuid: randomUUID(), timestamp: ts, entrypoint: 'claude-desktop', cwd, gitBranch: 'main', ...extra })
}

export function assistant(ts, cwd, { id = `msg_${randomUUID()}`, requestId = `req_${id}`, model = 'claude-opus-5-5', blocks = [], usage, stop = null, extra = {} } = {}) {
  return envelope({
    ...extra,
    message: { model, id, type: 'message', role: 'assistant', content: blocks, stop_reason: stop, usage: usage ?? { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 } },
    requestId, type: 'assistant', uuid: randomUUID(), timestamp: ts, entrypoint: 'claude-desktop', cwd, gitBranch: 'main',
  })
}

export const toolUse = (id, name, input) => ({ type: 'tool_use', id, name, input })
export const text = (t) => ({ type: 'text', text: t })

export function toolResult(ts, toolUseId, cwd, toolUseResult = null, extra = {}) {
  return envelope({
    ...extra,
    type: 'user',
    message: { role: 'user', content: [{ tool_use_id: toolUseId, type: 'tool_result', content: 'ok '.repeat(50) }] },
    uuid: randomUUID(), timestamp: ts, ...(toolUseResult ? { toolUseResult } : {}), entrypoint: 'claude-desktop', cwd, gitBranch: 'main',
  })
}

export function stopHook(ts, cwd) {
  return envelope({ type: 'system', subtype: 'stop_hook_summary', hookCount: 1, uuid: randomUUID(), timestamp: ts, cwd })
}

export const customTitle = (sid, t) => ({ type: 'custom-title', customTitle: t, sessionId: sid })
export const aiTitle = (sid, t) => ({ type: 'ai-title', aiTitle: t, sessionId: sid })
export const lastPrompt = (sid) => ({ type: 'last-prompt', lastPrompt: 'never surface me', sessionId: sid })

export function sideLine(o, agentId) {
  const { parentUuid, isSidechain, ...rest } = o
  return { parentUuid, isSidechain: true, agentId, ...rest }
}

// ---------------------------------------------------------------- fs helpers

export function writeLines(file, lines, mtimeMs) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n')
  if (mtimeMs != null) setMtime(file, mtimeMs)
}

export function appendLines(file, lines, mtimeMs, { newline = true } = {}) {
  fs.appendFileSync(file, lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + (newline ? '\n' : ''))
  if (mtimeMs != null) setMtime(file, mtimeMs)
}

export function writeJson(file, obj, mtimeMs) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(obj))
  if (mtimeMs != null) setMtime(file, mtimeMs)
}

export function setMtime(p, ms) {
  fs.utimesSync(p, new Date(ms), new Date(ms))
}

function git(cwd, args, env = {}) {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', '-c', 'init.defaultBranch=main', ...args],
    { cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', ...env }, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
}

function commit(cwd, file, msg, iso, email = 'test@example.com') {
  fs.writeFileSync(path.join(cwd, file), `${msg}\n${'line\n'.repeat(3)}`)
  git(cwd, ['add', file])
  git(cwd, ['-c', `user.email=${email}`, '-c', 'user.name=Tester', 'commit', '-q', '-m', msg],
    { GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso })
}

/** Set every directory under `dir` to `ms` (children first: writing files bumps their parent's mtime). */
function touchDirs(dir, ms) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) touchDirs(path.join(dir, e.name), ms)
  setMtime(dir, ms)
}

// ---------------------------------------------------------------- the tree

/**
 * @returns {{ root, claudeDir, cacheDir, repo, clone, other, wt, scratch, proj: (cwd) => string, main: (cwd, sid) => string }}
 */
export function buildFakeClaude({ withGit = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-test-'))
  const claudeDir = path.join(root, 'claude')
  const cacheDir = path.join(root, 'cache')
  const repo = path.join(root, 'repo')
  const clone = path.join(root, 'clone')
  const other = path.join(root, 'otherproj')
  const wt = path.join(repo, '.claude', 'worktrees', 'feat-x')
  const scratch = `/private/tmp/claude-501/${enc(repo)}/0f0e0d0c-0b0a-4908-8706-050403020100/scratchpad`
  const proj = (cwd) => path.join(claudeDir, 'projects', enc(cwd))
  const main = (cwd, sid) => path.join(proj(cwd), `${sid}.jsonl`)
  fs.mkdirSync(other, { recursive: true })
  fs.mkdirSync(path.join(claudeDir, 'sessions'), { recursive: true })

  // ---- git: repo with 2 commits by test@example.com (+1 by someone else), and a clone of it
  fs.mkdirSync(repo, { recursive: true })
  if (withGit) {
    git(repo, ['init', '-q'])
    git(repo, ['config', 'user.email', 'test@example.com'])
    git(repo, ['config', 'user.name', 'Tester'])
    commit(repo, 'a.txt', 'feat: first desk', '2026-10-24T09:00:00Z')
    commit(repo, 'b.txt', 'chore: someone else', '2026-10-24T09:30:00Z', 'other@example.com')
    commit(repo, 'c.txt', 'fix: second desk', '2026-10-25T16:00:00Z')
    git(root, ['clone', '-q', repo, clone])
    git(clone, ['config', 'user.email', 'test@example.com'])
  } else fs.mkdirSync(clone, { recursive: true })

  // ---- live sessions (pid of A is this test process; the others are fake and need THEOFFICE_SKIP_PID_CHECK)
  const sess = (pid, sid, cwd, status, name, nameSource = 'user') =>
    writeJson(path.join(claudeDir, 'sessions', `${pid}.json`), {
      pid, sessionId: sid, cwd, startedAt: NOW - 3600e3 + pid % 1000, procStart: 'Mon Oct 26 00:00:00 2026', version: '2.1.308',
      kind: 'interactive', entrypoint: 'claude-desktop', name, nameSource, status, updatedAt: NOW - 600e3,
    })
  sess(process.pid, SID.A, repo, 'busy', 'Office plugin')
  sess(2147483001, SID.E, repo, 'busy', 'repo-12', 'derived')
  sess(2147483002, SID.F, repo, 'idle', 'Idle desk')
  sess(2147483003, SID.G, repo, 'busy', 'Asking desk')
  fs.writeFileSync(path.join(claudeDir, 'sessions', `${process.pid}.deadbeef.key`), 'not json, never read')
  fs.writeFileSync(path.join(claudeDir, 'sessions', '12345.json'), '{ broken json')

  // ---- A: busy, editing, background Explore intern, finished foreground intern, running workflow
  const A = main(repo, SID.A)
  writeLines(A, [
    customTitle(SID.A, 'Build the office'),
    human('2026-10-26T00:30:00.000Z', 'build me an office', repo),
    assistant('2026-10-26T00:30:10.000Z', repo, { blocks: [toolUse('toolu_a1', 'Agent', { description: 'Survey assets', subagent_type: 'Explore', run_in_background: true })] }),
    toolResult('2026-10-26T00:30:11.000Z', 'toolu_a1', repo, { isAsync: true, status: 'async_launched', agentId: 'a1111111111111111' }),
    assistant('2026-10-26T00:30:12.000Z', repo, { blocks: [toolUse('toolu_fg', 'Agent', { description: 'Quick check', subagent_type: 'general-purpose' })] }),
    toolResult('2026-10-26T00:31:00.000Z', 'toolu_fg', repo, { status: 'completed' }),
    assistant('2026-10-26T00:31:10.000Z', repo, { blocks: [toolUse('toolu_wf', 'Workflow', { scriptPath: '/x/review-flow.js' })] }),
    toolResult('2026-10-26T00:31:11.000Z', 'toolu_wf', repo, { status: 'async_launched', workflowName: 'review-flow', runId: 'wf_aaaaaaaa-111' }),
    customTitle(SID.A, 'Build the office'),
    assistant('2026-10-26T00:39:00.000Z', repo, { blocks: [toolUse('toolu_ed', 'Edit', { file_path: `${repo}/lib/collect.mjs`, old_string: 'a', new_string: 'b' })] }),
  ], NOW - 5e3)
  const aSub = path.join(proj(repo), SID.A, 'subagents')
  const sub = (dir, id, meta, startIso, endIso, mtime) => {
    writeLines(path.join(dir, `agent-${id}.jsonl`), [
      sideLine(userRaw(startIso, 'do the thing', repo), id),
      sideLine(assistant(startIso, repo, { blocks: [toolUse(`toolu_${id}_1`, 'Read', { file_path: `${repo}/README.md` })] }), id),
      sideLine(toolResult(startIso, `toolu_${id}_1`, repo), id),
      sideLine(assistant(endIso, repo, { blocks: [text('done')], stop: 'end_turn' }), id),
    ], mtime)
    if (meta) writeJson(path.join(dir, `agent-${id}.meta.json`), meta)
  }
  sub(aSub, 'a1111111111111111', { agentType: 'Explore', description: 'Survey assets', toolUseId: 'toolu_a1', spawnDepth: 1, requestShape: 'background' },
    '2026-10-26T00:30:12.000Z', '2026-10-26T00:39:50.000Z', NOW - 10e3)
  sub(aSub, 'a2222222222222222', { agentType: 'Plan', description: 'Old plan', spawnDepth: 1, requestShape: 'background' },
    '2026-10-25T23:30:00.000Z', '2026-10-25T23:40:00.000Z', NOW - 3600e3)
  sub(aSub, 'a5555555555555555', { agentType: 'general-purpose', description: 'Quick check', toolUseId: 'toolu_fg', spawnDepth: 1, requestShape: 'foreground' },
    '2026-10-26T00:30:13.000Z', '2026-10-26T00:38:00.000Z', NOW - 20e3)
  // running workflow: journal, no workflows/<runId>.json yet
  const runA = path.join(aSub, 'workflows', 'wf_aaaaaaaa-111')
  writeLines(path.join(runA, 'journal.jsonl'), [
    { type: 'launched' },
    { type: 'started', key: 'v2:1', agentId: 'aw000000000000001', label: 'read:engine', phase: 'Understand' },
    { type: 'started', key: 'v2:2', agentId: 'aw000000000000002', label: 'read:docs', phase: 'Understand' },
    { type: 'result', key: 'v2:1', agentId: 'aw000000000000001', result: 'secret result text' },
    { type: 'started', key: 'v2:3', agentId: 'aw000000000000003', label: 'design:1', phase: 'Design' },
  ], NOW - 20e3)
  for (const [i, id] of ['aw000000000000001', 'aw000000000000002', 'aw000000000000003'].entries()) {
    sub(runA, id, { agentType: 'workflow-subagent', description: `agent ${i}`, workflowPhase: 'Understand', spawnDepth: 1 },
      `2026-10-26T00:3${2 + i}:00.000Z`, `2026-10-26T00:3${5 + i}:00.000Z`, NOW - 30e3)
  }
  writeLines(path.join(proj(repo), SID.A, 'workflows', 'scripts', 'review-flow-wf_aaaaaaaa-111.js'), ['export default 1'])
  // finished workflow (json present) with two agents yesterday
  const runB = path.join(aSub, 'workflows', 'wf_bbbbbbbb-222')
  writeLines(path.join(runB, 'journal.jsonl'), [{ type: 'launched' }], at('2026-10-25T10:30:00Z'))
  sub(runB, 'aw000000000000004', { agentType: 'workflow-subagent' }, '2026-10-25T10:00:00.000Z', '2026-10-25T10:10:00.000Z', at('2026-10-25T10:10:00Z'))
  sub(runB, 'aw000000000000005', { agentType: 'workflow-subagent' }, '2026-10-25T10:00:00.000Z', '2026-10-25T10:20:00.000Z', at('2026-10-25T10:20:00Z'))
  writeJson(path.join(proj(repo), SID.A, 'workflows', 'wf_bbbbbbbb-222.json'), {
    runId: 'wf_bbbbbbbb-222', timestamp: '2026-10-25T10:30:00.000Z', script: '// big script', workflowName: 'old-flow', status: 'completed',
    agentCount: 2, startTime: at('2026-10-25T10:00:00Z'), workflowProgress: [],
  }, at('2026-10-25T10:30:00Z'))

  // ---- E: busy, turn ended (stop_hook_summary), background intern running → waiting_on_agents
  const E = main(repo, SID.E)
  writeLines(E, [
    aiTitle(SID.E, 'Probe the API'),
    human('2026-10-26T00:20:00.000Z', 'probe', repo),
    assistant('2026-10-26T00:20:05.000Z', repo, { blocks: [toolUse('toolu_e1', 'Agent', { description: 'Probe API', subagent_type: 'general-purpose', run_in_background: true })] }),
    toolResult('2026-10-26T00:20:06.000Z', 'toolu_e1', repo, { isAsync: true, status: 'async_launched', agentId: 'a3333333333333333' }),
    userRaw('2026-10-26T00:20:08.000Z', '<task-notification><task-id>a4444444444444444</task-id><status>completed</status></task-notification>', repo,
      { isMeta: true, origin: { kind: 'task-notification' } }),
    assistant('2026-10-26T00:20:10.000Z', repo, { blocks: [text('Waiting for the probe.')], stop: 'end_turn' }),
    stopHook('2026-10-26T00:20:11.000Z', repo),
  ], NOW - 60e3)
  const eSub = path.join(proj(repo), SID.E, 'subagents')
  sub(eSub, 'a3333333333333333', { agentType: 'general-purpose', description: 'Probe API', toolUseId: 'toolu_e1', requestShape: 'background' },
    '2026-10-26T00:20:07.000Z', '2026-10-26T00:39:30.000Z', NOW - 30e3)
  sub(eSub, 'a4444444444444444', { agentType: 'general-purpose', description: 'Already done', requestShape: 'background' },
    '2026-10-26T00:19:00.000Z', '2026-10-26T00:20:00.000Z', NOW - 40e3)

  // ---- F: idle
  writeLines(main(repo, SID.F), [
    human('2026-10-26T00:30:00.000Z', 'hi', repo),
    assistant('2026-10-26T00:30:30.000Z', repo, { blocks: [text('Hello!')], stop: 'end_turn' }),
    stopHook('2026-10-26T00:30:31.000Z', repo),
  ], NOW - 120e3)

  // ---- G: busy, pending AskUserQuestion
  writeLines(main(repo, SID.G), [
    human('2026-10-26T00:34:00.000Z', 'choose', repo),
    assistant('2026-10-26T00:35:00.000Z', repo, { blocks: [toolUse('toolu_q', 'AskUserQuestion', { questions: [{ header: 'Pick one', question: 'Which layout?' }] })] }),
  ], NOW - 300e3)

  // ---- B: worktree session (Fri 23 Oct)
  writeLines(main(wt, SID.B), [
    { type: 'worktree-state', worktreeSession: { originalCwd: repo, worktreePath: wt, worktreeName: 'feat-x', worktreeBranch: 'claude/feat-x' }, sessionId: SID.B },
    human('2026-10-23T08:00:00.000Z', 'work in a worktree', wt),
    assistant('2026-10-23T08:01:00.000Z', wt, { blocks: [toolUse('toolu_b1', 'Bash', { command: 'ls', description: 'List files' })] }),
    toolResult('2026-10-23T08:01:05.000Z', 'toolu_b1', wt),
    customTitle(SID.B, 'Worktree feature'),
  ], at('2026-10-23T08:01:05Z'))

  // ---- C: scratchpad cwd (Thu 22 Oct) → repo
  writeLines(main(scratch, SID.C), [
    human('2026-10-22T08:00:00.000Z', 'scratch work', scratch),
    assistant('2026-10-22T08:02:00.000Z', scratch, { blocks: [toolUse('toolu_c1', 'Write', { file_path: `${scratch}/notes.md`, content: 'x' })] }),
  ], at('2026-10-22T08:02:00Z'))

  // ---- H: clone checkout (Sat 24 Oct)
  writeLines(main(clone, SID.H), [
    human('2026-10-24T12:00:00.000Z', 'clone work', clone),
    assistant('2026-10-24T12:03:00.000Z', clone, { blocks: [text('ok')], stop: 'end_turn' }),
  ], at('2026-10-24T12:03:00Z'))

  // ---- OLD: two weeks ago
  writeLines(main(other, SID.OLD), [
    human('2026-10-10T08:00:00.000Z', 'old', other),
    assistant('2026-10-10T08:02:00.000Z', other, { blocks: [text('ok')], stop: 'end_turn' }),
  ], at('2026-10-10T08:02:00Z'))

  // ---- D: otherproj — prompt rules, token dedupe, gap cap, local-day buckets, junk lines
  const usageA = { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 5000, output_tokens: 50 }
  writeLines(main(other, SID.D), [
    human('2026-10-24T10:00:00.000Z', 'first real prompt', other),                                                     // prompt 1
    assistant('2026-10-24T10:01:00.000Z', other, { id: 'msg_1', blocks: [{ type: 'thinking', thinking: '…' }], usage: usageA }),
    assistant('2026-10-24T10:01:01.000Z', other, { id: 'msg_1', blocks: [text('Running tests')], usage: usageA }),
    assistant('2026-10-24T10:01:02.000Z', other, { id: 'msg_1', blocks: [toolUse('toolu_d1', 'Bash', { command: 'npm test', description: 'Run the suite' })], usage: usageA }),
    toolResult('2026-10-24T10:01:30.000Z', 'toolu_d1', other),
    assistant('2026-10-24T10:02:00.000Z', other, { id: 'msg_2', blocks: [toolUse('toolu_d2', 'Edit', { file_path: '/x/a.js' })], usage: { input_tokens: 2, output_tokens: 7 } }),
    toolResult('2026-10-24T10:02:10.000Z', 'toolu_d2', other),
    lastPrompt(SID.D),
    { type: 'bridge-session', sessionId: SID.D, ownerAccountUuid: 'acct-never', ownerOrganizationUuid: 'org-never' },
    userRaw('2026-10-24T10:30:00.000Z', 'skill body', other, { isMeta: true }),                                         // 27m50s gap → 5 min
    userRaw('2026-10-24T10:31:00.000Z', '<task-notification><task-id>x</task-id></task-notification>', other, { origin: { kind: 'task-notification' } }),
    userRaw('2026-10-24T10:32:00.000Z', 'hello there (legacy line, no origin)', other),                                // prompt 2
    userRaw('2026-10-24T10:33:00.000Z', '<command-name>/clear</command-name>', other),
    userRaw('2026-10-24T10:34:00.000Z', '[Request interrupted by user]', other),
    userRaw('2026-10-24T10:35:00.000Z', 'This session is being continued…', other, { isCompactSummary: true }),
    human('2026-10-24T10:36:00.000Z', '<system-reminder>ctx</system-reminder> a real question', other),                 // prompt 3
    assistant('2026-10-24T10:37:00.000Z', other, { model: '<synthetic>', blocks: [text('API error')], usage: { input_tokens: 999, output_tokens: 999 } }),
    '{"parentUuid":"broken line without end',
    'not json at all',
    '',
    assistant('2026-10-24T10:38:00.000Z', other, { id: 'msg_3', blocks: [toolUse('toolu_d3', 'Edit', { file_path: '/x/a.js' }), toolUse('toolu_d4', 'Write', { file_path: '/x/b.js' })], usage: { input_tokens: 3, output_tokens: 11 } }),
    customTitle(SID.D, 'Other project work'),
    human('2026-10-25T22:30:00.000Z', 'late sunday prompt', other),                                                    // 23:30 CET Sun → 10-25
    assistant('2026-10-25T23:10:00.000Z', other, { id: 'msg_4', blocks: [toolUse('toolu_d5', 'Read', { file_path: '/x/a.js' })], usage: { input_tokens: 1, output_tokens: 1 } }), // 00:10 Mon → 10-26
    human('2026-10-25T23:12:00.000Z', 'after midnight prompt', other),                                                 // → 10-26
  ], at('2026-10-25T23:12:00Z'))

  touchDirs(claudeDir, NOW - 5e3)
  return { root, claudeDir, cacheDir, repo, clone, other, wt, scratch, proj, main }
}

export function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }) } catch {}
}
