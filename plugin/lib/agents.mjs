// Node: the office's other tenants. Where each kind of agent keeps its sessions on this machine (its homes: one per
// account, ~/.claude and ~/.claude-work, ~/.codex and ~/.codex-perso…), and a reader per agent other than Claude
// (Codex, Gemini CLI and Antigravity, Cursor, Kimi, Grok) that books its sessions into the same per-file cache entries
// the collector makes of Claude's transcripts (buckets.mjs) and seats the ones at work right now at desks.
// Read-only, always: files are listed, stat'ed and read, never written; nothing here opens a credential file
// (auth.json, oauth tokens, .key files) or a database.
import fs from 'node:fs'
import path from 'node:path'
import { kindOf, labelOf } from './activity.mjs'
import { addEdit, fnv1a, iso, readJson, readdirSafe, statSafe, topCwd, touch } from './buckets.mjs'
import { bytesLeft, isNewFile, readTail, syncFile } from './cache.mjs'
import { AGENT_IDS } from './cast.mjs'
import { clip, redact, safeText } from './format.mjs'

/** A session of another agent is at its desk while its file was written this recently (none of them says it is open). */
export const DESK_MS = 30 * 60e3
/** An open turn whose file has not moved for this long is not working any more: the agent is idle. */
const STALL_MS = 10 * 60e3
/** After DESK_MS a session's coat stays on the rack this long. */
const LEFT_MS = 15 * 60e3
/** A sub-agent whose file moved this recently is an intern at work. */
const INTERN_FRESH_MS = 150e3
/** Time a line of a transcript with no timestamps stands for at most (Cursor, and Grok if its lines carry none). */
const LINE_MS = 30e3
/** In a run on a remembered walk (readOtherAgents), files written this recently are stat'ed all the same: they may be at it. */
const WRITTEN_MS = 3600e3
/** What an archive is read and unpacked by at a time. */
const ZST_CHUNK = 1 << 20

// ---------------------------------------------------------------- homes (accounts)

/**
 * Where each agent keeps its sessions: the default folder, an environment override, and the sibling folders another
 * account lives in by the usual convention (`~/.claude-work`, `~/.codex-perso`: run the agent with CLAUDE_CONFIG_DIR or
 * CODEX_HOME pointed there). `marks` are what makes a folder a home of that agent (one of them must exist).
 */
const HOME_SPECS = {
  claude: { base: '.claude', env: 'CLAUDE_CONFIG_DIR', marks: ['projects', 'sessions'] },
  codex: { base: '.codex', env: 'CODEX_HOME', marks: ['sessions', 'archived_sessions'] },
  gemini: { base: '.gemini', env: 'GEMINI_CLI_HOME', envIsParent: true, marks: ['tmp', 'antigravity', 'antigravity-cli', 'antigravity-ide'] },
  cursor: { base: '.cursor', marks: ['projects'] },
  grok: { base: '.grok', env: 'GROK_HOME', marks: ['sessions'] },
}
const LABEL_RE = /[^a-z0-9_-]+/g

/** An account's label from its folder: `~/.claude-work` → 'work', a folder named otherwise → its own name. */
function labelOf_(dir, base) {
  const name = path.basename(dir).replace(/^\./, '').toLowerCase()
  const b = base.replace(/^\./, '')
  const label = name === b ? '' : name.startsWith(`${b}-`) ? name.slice(b.length + 1) : name
  return label.replace(LABEL_RE, '-').replace(/^-+|-+$/g, '').slice(0, 24) || null
}

// loaded only when asked: a run seldom needs either, and each costs a few ms to load
const crypto = () => process.getBuiltinModule('node:crypto')
const zlib = () => process.getBuiltinModule('node:zlib')

const realpath = (p) => {
  try { return fs.realpathSync(p) } catch { return null }
}

/**
 * Every agent home on this machine, `{ agent, dir, label, prefix }`: `label` names the account on its desks (null when
 * the agent has only one home, else 'main' for the default folder and the suffix for the others), `prefix` keys the
 * home's files in the cache (none for ~/.claude, so a cache from before accounts stays valid). `root` is the folder the
 * homes are looked for in ($HOME), `agents` the agent ids to look for, `claudeDir` a Claude home given explicitly.
 */
export function agentHomes({ root, env = process.env, agents = AGENT_IDS, claudeDir = null } = {}) {
  const out = []
  const seen = new Set()
  const add = (agent, dir, label, def) => {
    const real = realpath(dir)
    if (!real || seen.has(real)) return
    seen.add(real)
    out.push({ agent, dir, label, def })
  }
  for (const agent of agents) {
    if (agent === 'kimi') {
      for (const r of kimiRoots(root, env)) add('kimi', r.dir, null, true)
      continue
    }
    const spec = HOME_SPECS[agent]
    if (!spec) continue
    const has = (dir) => spec.marks.some((m) => statSafe(path.join(dir, m))?.isDirectory())
    if (agent === 'claude' && claudeDir) {
      add('claude', claudeDir, null, true)
      continue
    }
    if (!root) continue
    const def = path.join(root, spec.base)
    if (has(def)) add(agent, def, null, true)
    const fromEnv = env[spec.env] ? (spec.envIsParent ? path.join(env[spec.env], spec.base) : env[spec.env]) : null
    if (fromEnv && path.isAbsolute(fromEnv) && has(fromEnv)) add(agent, fromEnv, labelOf_(fromEnv, spec.base), false)
    for (const ent of readdirSafe(root)) {
      if (!ent.name.startsWith(`${spec.base}-`) || !(ent.isDirectory() || ent.isSymbolicLink())) continue
      const dir = path.join(root, ent.name)
      if (has(dir)) add(agent, dir, labelOf_(dir, spec.base), false)
    }
  }
  // labels only where an agent has more than one account: one Claude home is just Claude
  const count = (a) => out.filter((h) => h.agent === a).length
  return out.map((h) => {
    const many = count(h.agent) > 1 && h.agent !== 'kimi'
    const label = many ? (h.def ? 'main' : h.label ?? 'other') : null
    const prefix = h.agent === 'claude' && h.def ? '' : `@${h.agent}${h.def ? '' : `.${h.label ?? path.basename(h.dir)}`}/`
    return { agent: h.agent, dir: h.dir, label, prefix }
  })
}

/** Kimi's stores: the kimi-code home (CLI and the Kimi Work app's own copy) and the older kimi-cli's. */
function kimiRoots(root, env) {
  const out = []
  const desktop = root
    ? path.join(root, ...({ darwin: ['Library', 'Application Support'], win32: ['AppData', 'Roaming'] }[process.platform] ?? ['.config']), 'kimi-desktop', 'daimon-share', 'daimon', 'runtime', 'kimi-code', 'home')
    : null
  for (const dir of [env.KIMI_CODE_HOME || (root && path.join(root, '.kimi-code')), desktop, env.KIMI_SHARE_DIR || (root && path.join(root, '.kimi'))]) {
    if (dir && statSafe(path.join(dir, 'sessions'))?.isDirectory()) out.push({ dir })
  }
  return out
}

// ---------------------------------------------------------------- shared line helpers

/** Epoch ms of a timestamp in any of the shapes agents write: ISO text, epoch ms, epoch seconds (float). */
function msOf(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? (v >= 1e12 ? v : v * 1000) : NaN
  if (typeof v !== 'string' || !v) return NaN
  if (/^\d+(\.\d+)?$/.test(v)) return msOf(Number(v))
  const s = /^\d{4}-\d\d-\d\d \d\d:\d\d/.test(v) ? `${v.replace(' ', 'T')}${/Z|[+-]\d\d:?\d\d$/.test(v) ? '' : 'Z'}` : v
  return Date.parse(s)
}

/** One tool call into the bucket: its kind (activity.mjs, from the Claude tool name it maps to) and the file it edits. */
function bookTool(e, b, name, input) {
  b.t++
  const k = kindOf(name, input)
  b.k[k] = (b.k[k] ?? 0) + 1
  if (k === 'coding') addEdit(e, b, input?.file_path)
}

const addCwd = (e, cwd, n = 1) => {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) return
  if (e.cwds[cwd] != null || Object.keys(e.cwds).length < 16) e.cwds[cwd] = (e.cwds[cwd] ?? 0) + n
}
const addModel = (e, m) => {
  if (typeof m === 'string' && m && m !== '<synthetic>') e.models[m] = (e.models[m] ?? 0) + 1
}

/** A JSON line, or null (a torn last line, a binary blob). */
function parseLine(buf, s, end) {
  if (buf[s] !== 123) return null
  try {
    const o = JSON.parse(buf.toString('utf8', s, end))
    return o && typeof o === 'object' ? o : null
  } catch {
    return null
  }
}

/** Lines (newlines) in `[from, to)` of a file. */
function countLines(abs, from, to) {
  let fd
  let n = 0
  try {
    fd = fs.openSync(abs, 'r')
    const buf = Buffer.allocUnsafe(65_536)
    for (let pos = from; pos < to;) {
      const got = fs.readSync(fd, buf, 0, Math.min(buf.length, to - pos), pos)
      if (got <= 0) break
      for (let i = buf.indexOf(10); i !== -1 && i < got; i = buf.indexOf(10, i + 1)) n++
      pos += got
    }
  } catch {} finally {
    if (fd !== undefined) try { fs.closeSync(fd) } catch {}
  }
  return n
}

/**
 * Times for the lines of a file that writes none (Cursor): the lines of a chunk are spread evenly over the time it was
 * written in (from the file's birth, or the last read, to its mtime), each standing for at most LINE_MS of work (the cap
 * touch() is given), so a session reopened days later is not booked as days of work. With no start to go by (a file
 * system without birth times, a file written at once), each line stands for LINE_MS, up to the mtime.
 */
function lineClock(e, ctl, f) {
  const t1 = f.st.mtimeMs
  const off0 = e.off ?? 0
  const n = Math.max(1, countLines(f.abs, off0, f.st.size))
  const birth = f.st.birthtimeMs > 0 && f.st.birthtimeMs < t1 ? f.st.birthtimeMs : NaN
  let t0 = ctl.incremental ? e.mtime : f.born ?? birth
  if (!(t0 < t1)) t0 = t1 - n * LINE_MS
  let i = 0
  return () => t0 + ((t1 - t0) * Math.min(n, ++i)) / n
}

/** A short id for a session of another agent: Codex's ids share their first chars (UUIDv7), Kimi's start `session_`. */
const shortId = (agent, sid) => fnv1a(`${agent}:${sid}`).toString(16).padStart(8, '0')

/** Every line of a buffer through a byte-level line handler (`(buf, start, end)`, as readLines calls it). */
function eachLine(buf, onLine) {
  let s = 0
  for (let nl = buf.indexOf(10); nl !== -1; s = nl + 1, nl = buf.indexOf(10, s)) if (nl > s) onLine(buf, s, nl)
  if (s < buf.length) onLine(buf, s, buf.length)
}

/** The tail of a session file as parsed lines, widening 64 KB → 512 KB → 4 MB when the tail is one giant line. */
function tailLines(abs, size) {
  let out = []
  for (const bytes of [65_536, 524_288, 4_194_304]) {
    const t = readTail(abs, size, bytes)
    out = []
    for (const line of t.text.split('\n')) {
      if (line.charCodeAt(0) !== 123) continue
      try {
        const o = JSON.parse(line)
        if (o && typeof o === 'object') out.push(o)
      } catch {}
    }
    if (out.length > 2 || !t.truncated) break
  }
  return out
}

/**
 * What a reader's tail says, as a desk's state and activity (the same words buildDesk gives Claude's). An idle desk
 * says why (`idle_reason`): its turn closed as the tail's `end` says (done unless it says stopped or error), or it was
 * left open and went quiet (stalled).
 */
function liveState(tail, f, nowMs) {
  const lastTs = Number.isFinite(tail.lastTs) ? tail.lastTs : f.st.mtimeMs
  const stalled = nowMs - f.st.mtimeMs > STALL_MS
  const p = tail.pending
  if (p?.asking && !stalled) {
    return { state: 'asking', status: 'waiting', activity: { kind: 'talking', tool: p.name, label: p.label || 'question', since: iso(p.ts ?? lastTs) } }
  }
  if (!tail.open || stalled) {
    const idle_reason = tail.open ? 'stalled' : tail.end ?? 'done'
    return { state: 'idle', status: 'idle', idle_reason, activity: { kind: 'idle', tool: null, label: null, since: iso(lastTs) } }
  }
  if (tail.interns && !p) {
    return { state: 'waiting_on_agents', status: 'busy', activity: { kind: 'delegating', tool: null, label: null, since: iso(lastTs) } }
  }
  if (p) return { state: 'working', status: 'busy', activity: { kind: kindOf(p.name, p.input), tool: p.name, label: p.label || null, since: iso(p.ts ?? lastTs) } }
  return { state: 'working', status: 'busy', activity: { kind: 'thinking', tool: null, label: null, since: iso(lastTs) } }
}

/** A pending tool call as the tail keeps it: the Claude tool it maps to, its label, when it started. */
const pendingOf = (name, input, ts, asking = name === 'AskUserQuestion') => ({ name, input, label: labelOf(name, input), ts, asking })

// ---------------------------------------------------------------- Codex

// Codex's tool names → the Claude tool each does the work of (kindOf and labelOf speak Claude), with its input mapped.
const CODEX_TOOLS = {
  exec_command: 'Bash', shell: 'Bash', shell_command: 'Bash', local_shell: 'Bash', container_exec: 'Bash', unified_exec: 'Bash', write_stdin: 'Bash',
  apply_patch: 'Edit', update_plan: 'TodoWrite', view_image: 'Read', web_search: 'WebSearch', web_search_call: 'WebSearch', web_fetch: 'WebFetch',
  request_user_input: 'AskUserQuestion', request_user_input_async: 'AskUserQuestion', spawn_agent: 'Agent', send_message: 'SendMessage',
  wait_agent: 'TaskOutput', followup_task: 'SendMessage', list_agents: 'TaskOutput', close_agent: 'TaskStop', sleep: 'Monitor',
}

/** A Codex call (`response_item` payload) → `{ name, input }` in Claude's words. `exec` runs code that calls the tools. */
function codexCall(p) {
  let name = String(p.name ?? (p.type === 'local_shell_call' ? 'local_shell' : p.type === 'web_search_call' ? 'web_search_call' : ''))
  let args = p.arguments ?? p.input ?? p.action ?? {}
  // function calls carry JSON arguments; freeform calls (exec's code, apply_patch's patch) carry the raw text
  if (typeof args === 'string' && name !== 'exec' && args.trimStart().startsWith('{')) {
    try { args = JSON.parse(args) } catch {}
  }
  let src = typeof args === 'string' ? args : ''
  if (name === 'exec') {
    // code mode: the first `tools.<name>(` the code calls says what it does; a `cmd:"…"` is its command
    name = /\btools\.([A-Za-z_]\w*)/.exec(src)?.[1] ?? 'exec_command'
    const cmd = /\bcmd\s*:\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/.exec(src)?.[2] ?? ''
    args = { command: cmd }
  }
  if (p.namespace && /^mcp/i.test(String(p.namespace))) return { name: `mcp__${String(p.namespace).replace(/^mcp_*/i, '')}__${name}`, input: {} }
  const mapped = CODEX_TOOLS[name]
  if (!mapped) return { name: name.startsWith('mcp__') ? name : name || 'tool', input: typeof args === 'object' && args ? args : {} }
  const a = typeof args === 'object' && args ? args : {}
  if (mapped === 'Bash') {
    const cmd = Array.isArray(a.command) ? a.command.join(' ') : a.command ?? a.cmd ?? ''
    return { name: mapped, input: { command: String(cmd).replace(/^(?:bash|zsh|sh) -lc /, ''), description: a.description } }
  }
  if (mapped === 'Edit') {
    src ||= String(a.input ?? a.patch ?? '')
    const file = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/m.exec(src)?.[1]?.trim()
    return { name: mapped, input: { file_path: file ?? '' } }
  }
  if (mapped === 'Read') return { name: mapped, input: { file_path: a.path ?? '' } }
  if (mapped === 'WebSearch') return { name: mapped, input: { query: a.query ?? a.action?.query ?? '' } }
  if (mapped === 'Agent') return { name: mapped, input: { description: a.task_name ?? a.message?.slice?.(0, 60) ?? a.agent_type ?? 'helper' } }
  if (mapped === 'AskUserQuestion') return { name: mapped, input: { questions: [{ header: a.questions?.[0]?.header ?? a.title ?? 'question' }] } }
  return { name: mapped, input: a }
}

// The head of a rollout line, read from its bytes: `{"timestamp":"…","ordinal":n,"type":"…","payload":{"type":"…"`.
const B_TS = Buffer.from('{"timestamp":"')
const B_TYPE = Buffer.from(',"type":"')
const B_PTYPE = Buffer.from('"payload":{"type":"')
const B_ITEM = Buffer.from('"item":{"type":"')
// lines worth a JSON.parse; every other line only lends its timestamp (tool outputs, reasoning, world state: most bytes)
const CODEX_PARSE = new Set(['session_meta', 'turn_context', 'event_msg:task_started', 'event_msg:task_complete', 'event_msg:turn_aborted',
  'event_msg:user_message', 'event_msg:token_count', 'event_msg:patch_apply_end', 'event_msg:item_completed', 'response_item:function_call',
  'response_item:custom_tool_call', 'response_item:local_shell_call', 'response_item:web_search_call'])

function codexHead(buf, s, end) {
  const lim = Math.min(end, s + 400)
  const head = buf.subarray(s, lim)
  let ts = NaN
  if (head.indexOf(B_TS) === 0) {
    const q = head.indexOf(34, B_TS.length)
    if (q > 0) ts = Date.parse(head.toString('latin1', B_TS.length, q))
  }
  const word = (from) => {
    const q = head.indexOf(34, from)
    return q > from ? head.toString('latin1', from, q) : ''
  }
  const ti = head.indexOf(B_TYPE)
  const type = ti === -1 ? '' : word(ti + B_TYPE.length)
  const pi = head.indexOf(B_PTYPE)
  const ptype = pi === -1 ? '' : word(pi + B_PTYPE.length)
  let item = ''
  if (ptype === 'item_completed') {
    const ii = buf.subarray(s, Math.min(end, s + 600)).indexOf(B_ITEM)
    if (ii !== -1) {
      const from = s + ii + B_ITEM.length
      const q = buf.indexOf(34, from)
      if (q > from && q < end) item = buf.toString('latin1', from, q)
    }
  }
  return { ts, key: ptype ? `${type}:${ptype}` : type, item }
}

function codexLines(e) {
  return (buf, s, end) => {
    const h = codexHead(buf, s, end)
    const parse = CODEX_PARSE.has(h.key) && (h.key !== 'event_msg:item_completed' || h.item === 'FileChange' || h.item === 'UserMessage')
    const o = parse ? parseLine(buf, s, end) : null
    const ms = Number.isFinite(h.ts) ? h.ts : msOf(o?.timestamp)
    const b = touch(e, ms)
    if (!o) return
    const p = o.payload ?? {}
    if (o.type === 'session_meta') {
      addCwd(e, p.cwd, 10)
      const parent = p.source?.subagent?.thread_spawn?.parent_thread_id ?? p.parent_thread_id
      if (parent || p.thread_source === 'subagent') {
        e.kind = 'sub'
        e.par = parent ? String(parent) : e.par
        if (p.agent_nickname) e.nick = clip(redact(String(p.agent_nickname)), 30)
      }
      return
    }
    if (o.type === 'turn_context') {
      addCwd(e, p.cwd)
      addModel(e, p.model)
      return
    }
    if (!b) return
    if (o.type === 'response_item') {
      const c = codexCall(p)
      bookTool(e, b, c.name, c.input)
      return
    }
    switch (p.type) {
      case 'user_message':
        if (!e.nf && e.kind === 'main') b.p++
        return
      case 'item_completed': {
        e.nf = 1
        const it = p.item ?? {}
        if (it.type === 'UserMessage' && e.kind === 'main') b.p++
        else if (it.type === 'FileChange') {
          const ch = it.changes
          const paths = Array.isArray(ch) ? ch.map((x) => x?.path) : ch && typeof ch === 'object' ? Object.keys(ch) : []
          for (const fp of paths) addEdit(e, b, fp)
        }
        return
      }
      case 'patch_apply_end':
        for (const m of String(p.stdout ?? '').matchAll(/^[AMD] (\/\S+)$/gm)) addEdit(e, b, m[1])
        return
      case 'token_count': {
        // cumulative per thread: book what this event adds (fresh input: cached input is not new work)
        const t = p.info?.total_token_usage
        if (!t) return
        const tin = Math.max(0, (Number(t.input_tokens) || 0) - (Number(t.cached_input_tokens) || 0))
        const tout = Number(t.output_tokens) || 0
        b.i += Math.max(0, tin - (e.ci ?? 0))
        b.o += Math.max(0, tout - (e.co ?? 0))
        e.ci = Math.max(e.ci ?? 0, tin)
        e.co = Math.max(e.co ?? 0, tout)
      }
    }
  }
}

/** A rollout's tail: is a turn open, what tool call is pending, who it was spawned by. */
function codexTail(lines) {
  const t = { open: false, pending: null, lastTs: NaN, model: null }
  const calls = new Map()
  for (const o of lines) {
    const ts = msOf(o.timestamp)
    if (ts > (t.lastTs || 0)) t.lastTs = ts
    const p = o.payload ?? {}
    if (o.type === 'turn_context' && p.model) t.model = String(p.model)
    if (o.type === 'event_msg') {
      if (p.type === 'task_started') t.open = true
      else if (p.type === 'task_complete' || p.type === 'turn_aborted') {
        t.open = false
        t.end = p.type === 'turn_aborted' ? 'stopped' : 'done'
        calls.clear()
      }
    } else if (o.type === 'response_item') {
      if (['function_call', 'custom_tool_call', 'local_shell_call', 'web_search_call'].includes(p.type)) {
        const c = codexCall(p)
        calls.set(p.call_id ?? p.id ?? `${calls.size}`, pendingOf(c.name, c.input, ts))
        t.open = true
      } else if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') calls.delete(p.call_id)
    }
  }
  t.pending = [...calls.values()].pop() ?? null
  return t
}

// Parsing an unchanged long tool-output line can widen the tail read to 4 MiB.
// Retain only the small parsed summary, never the transcript text or parsed rows.
const codexTails = new Map()
function readCodexTail(abs, size) {
  const file = path.resolve(abs)
  let stat
  try { stat = fs.statSync(file) } catch {}
  const stamp = stat?.isFile() ? `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${size}` : null
  const cached = codexTails.get(file)
  if (cached && cached.stamp === stamp) {
    codexTails.delete(file);codexTails.set(file, cached)
    return structuredClone(cached.tail)
  }
  codexTails.delete(file)
  const tail = codexTail(tailLines(abs, size))
  // Do not remember unreadable/empty tails, or large pending tool inputs.
  if (stamp && Number.isFinite(tail.lastTs) && JSON.stringify(tail).length <= 16_384) {
    codexTails.set(file, { stamp, tail })
    while (codexTails.size > 32) codexTails.delete(codexTails.keys().next().value)
    return structuredClone(tail)
  }
  return tail
}

const ROLLOUT_RE = /^rollout-.+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl(\.zst)?$/

// Long-running dashboards ask for the same rename index every refresh. Retain only
// unchanged indexes, with bounded memory; callers still receive their own mutable map.
const titleIndexes = new Map()
const TITLE_INDEX_BYTES = 8 * 1024 * 1024
let titleIndexBytes = 0
function codexTitles(home) {
  const file = path.resolve(home.dir, 'session_index.jsonl')
  let stat
  try { stat = fs.statSync(file) } catch {}
  const stamp = stat?.isFile() ? `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` : null
  const cached = titleIndexes.get(file)
  if (cached && cached.stamp === stamp) {
    titleIndexes.delete(file);titleIndexes.set(file, cached)
    return new Map(cached.titles)
  }
  if (cached) { titleIndexes.delete(file);titleIndexBytes -= cached.bytes }
  const titles = new Map()
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch { return titles }
  // session_index.jsonl: one line per rename, the last one wins.
  for (const line of text.split('\n')) {
    if (!line) continue
    try {
      const o = JSON.parse(line)
      if (o?.id && o.thread_name) titles.set(String(o.id), String(o.thread_name))
    } catch {}
  }
  if (stamp && stat.size <= TITLE_INDEX_BYTES) {
    titleIndexes.set(file, { stamp, bytes: stat.size, titles });titleIndexBytes += stat.size
    while (titleIndexes.size > 8 || titleIndexBytes > TITLE_INDEX_BYTES) {
      const oldest = titleIndexes.keys().next().value
      titleIndexBytes -= titleIndexes.get(oldest).bytes;titleIndexes.delete(oldest)
    }
    return new Map(titles)
  }
  return titles
}

const codex = {
  id: 'codex',
  walk(ctx, home) {
    const out = []
    const push = (dirRel, name) => {
      const m = ROLLOUT_RE.exec(name)
      if (!m) return
      const rel = path.join(dirRel, name)
      const st = statSafe(path.join(home.dir, rel))
      // when it began, by its name's clock (rollout-2026-08-03T14-05-09-…): a page that ended before has none of it
      const began = Date.parse(name.slice(8, 27).replace(/T(\d\d)-(\d\d)-(\d\d)$/, 'T$1:$2:$3'))
      // an archived session is compressed (zstd) once and never written again: read whole, once
      if (st) out.push({ rel, st, sid: m[1], ...(Number.isFinite(began) ? { began } : {}), ...(m[2] ? { whole: true, zst: true } : {}) })
    }
    // sessions/YYYY/MM/DD: a rollout lives in the folder of the day it began, so only the last 62 days are looked in, or
    // back to a page of the past's first day
    const oldest = Math.min(ctx.nowMs - 62 * 864e5, ctx.fromMs - 864e5)
    for (const y of readdirSafe(path.join(home.dir, 'sessions'))) {
      if (!/^\d{4}$/.test(y.name)) continue
      for (const mo of readdirSafe(path.join(home.dir, 'sessions', y.name))) {
        if (!/^\d\d$/.test(mo.name)) continue
        if (new Date(Number(y.name), Number(mo.name), 1).getTime() < oldest) continue
        for (const d of readdirSafe(path.join(home.dir, 'sessions', y.name, mo.name))) {
          if (!/^\d\d$/.test(d.name)) continue
          const rel = path.join('sessions', y.name, mo.name, d.name)
          ctx.listedKey(home, rel)
          for (const f of readdirSafe(path.join(home.dir, rel))) if (f.isFile()) push(rel, f.name)
        }
      }
    }
    ctx.listedKey(home, 'archived_sessions')
    for (const f of readdirSafe(path.join(home.dir, 'archived_sessions'))) if (f.isFile()) push('archived_sessions', f.name)
    return out
  },
  init: (f) => ({ kind: 'main', sid: f.sid, cwds: {}, models: {}, days: {} }),
  lines: (e) => codexLines(e),
  tail: readCodexTail,
  titles: codexTitles,
}

// ---------------------------------------------------------------- Cursor

// Cursor's agent tools → Claude's
const CURSOR_TOOLS = {
  Shell: 'Bash', run_terminal_cmd: 'Bash', StrReplace: 'Edit', search_replace: 'Edit', EditFile: 'Edit', edit_file: 'Edit', Delete: 'Edit', delete_file: 'Edit',
  MultiEdit: 'MultiEdit', Write: 'Write', write: 'Write', ReadFile: 'Read', read_file: 'Read', Read: 'Read', LS: 'LS', list_dir: 'LS', Grep: 'Grep',
  grep: 'Grep', codebase_search: 'Grep', SemanticSearch: 'Grep', Glob: 'Glob', glob_file_search: 'Glob', file_search: 'Glob', WebSearch: 'WebSearch',
  web_search: 'WebSearch', WebFetch: 'WebFetch', TodoWrite: 'TodoWrite', todo_write: 'TodoWrite', Task: 'Agent', CreatePlan: 'ExitPlanMode',
  AskQuestion: 'AskUserQuestion', ask_question: 'AskUserQuestion', EditNotebook: 'NotebookEdit', ReadLints: 'Read', read_lints: 'Read',
}

/** A Cursor tool_use block → `{ name, input }` in Claude's words. */
function cursorCall(c) {
  const raw = String(c.name ?? '')
  const name = CURSOR_TOOLS[raw] ?? (/dynamic|mcp/i.test(raw) ? `mcp__cursor__${raw}` : raw || 'tool')
  const a = c.input && typeof c.input === 'object' ? c.input : {}
  const file = a.file_path ?? a.path ?? a.target_file ?? a.target_notebook
  if (name === 'Bash') return { name, input: { command: a.command ?? '', description: a.description } }
  if (file != null) return { name, input: { ...a, file_path: String(file) } }
  if (name === 'Agent') return { name, input: { description: a.description ?? a.subagent_type ?? 'helper' } }
  return { name, input: a }
}

function cursorLines(e, ctl, f) {
  const clock = lineClock(e, ctl, f)
  return (buf, s, end) => {
    const ms = clock(s, end)
    const o = parseLine(buf, s, end)
    const b = touch(e, ms, LINE_MS)
    if (!o || !b) return
    if (o.type === 'turn_ended') return
    const content = o.message?.content
    if (o.role === 'user') {
      const parts = Array.isArray(content) ? content : null
      if (parts?.some((x) => x?.type === 'tool_result')) return
      // the person's words come wrapped in <user_query>; anything else in angle brackets is the editor talking
      const text = String(typeof content === 'string' ? content : parts?.find((x) => x?.type === 'text')?.text ?? '').replace(/^\s*<user_query>\s*/, '')
      if (e.kind === 'main' && text && !text.startsWith('<')) b.p++
      return
    }
    if (o.role !== 'assistant' || !Array.isArray(content)) return
    for (const c of content) if (c?.type === 'tool_use') { const t = cursorCall(c); bookTool(e, b, t.name, t.input) }
  }
}

function cursorTail(lines) {
  const t = { open: false, pending: null, lastTs: NaN }
  for (const o of lines) {
    if (o.type === 'turn_ended') {
      t.open = false
      t.pending = null
      continue
    }
    if (o.role === 'user') {
      const c = o.message?.content
      const result = Array.isArray(c) && c.some((x) => x?.type === 'tool_result')
      t.open = true
      if (result) t.pending = null
      continue
    }
    if (o.role === 'assistant') {
      t.open = true
      const uses = (Array.isArray(o.message?.content) ? o.message.content : []).filter((x) => x?.type === 'tool_use')
      if (uses.length) {
        const c = cursorCall(uses.at(-1))
        t.pending = pendingOf(c.name, c.input, NaN)
      } else t.pending = null
    }
  }
  return t
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const cursor = {
  id: 'cursor',
  walk(ctx, home) {
    const out = []
    for (const pd of readdirSafe(path.join(home.dir, 'projects'))) {
      if (!pd.isDirectory()) continue
      const tRel = path.join('projects', pd.name, 'agent-transcripts')
      const ents = readdirSafe(path.join(home.dir, tRel))
      if (!ents.length) continue
      ctx.listedKey(home, tRel)
      // the folder name is the project's path with every non-alphanumeric char a dash, as Claude names its own
      const slug = `-${pd.name}`
      for (const ent of ents) {
        if (ent.isFile() && ent.name.endsWith('.jsonl')) {
          const rel = path.join(tRel, ent.name)
          const st = statSafe(path.join(home.dir, rel))
          if (st) out.push({ rel, st, sid: ent.name.slice(0, -6), slug })
          continue
        }
        if (!ent.isDirectory() || !UUID_RE.test(ent.name)) continue
        const sRel = path.join(tRel, ent.name)
        ctx.listedKey(home, sRel)
        const main = path.join(sRel, `${ent.name}.jsonl`)
        const st = statSafe(path.join(home.dir, main))
        if (st) out.push({ rel: main, st, sid: ent.name, slug })
        const subRel = path.join(sRel, 'subagents')
        for (const sub of readdirSafe(path.join(home.dir, subRel))) {
          if (!sub.isFile() || !sub.name.endsWith('.jsonl')) continue
          const rel = path.join(subRel, sub.name)
          const sst = statSafe(path.join(home.dir, rel))
          if (sst) out.push({ rel, st: sst, sid: sub.name.slice(0, -6), par: ent.name, slug, sub: true })
        }
      }
    }
    return out
  },
  init: (f, ctx) => {
    const e = { kind: f.sub ? 'sub' : 'main', sid: f.sid, cwds: {}, models: {}, days: {} }
    if (f.par) e.par = f.par
    const cwd = ctx.resolver.slugPath(f.slug)
    if (cwd) e.cwds[cwd] = 1
    return e
  },
  lines: (e, ctl, f) => cursorLines(e, ctl, f),
  tail: (abs, size) => cursorTail(tailLines(abs, size)),
}

// ---------------------------------------------------------------- Gemini: Antigravity and the Gemini CLI

// Antigravity's and the Gemini CLI's tools → Claude's (Antigravity quotes its argument values as JSON inside the JSON)
const GEMINI_TOOLS = {
  read_file: 'Read', view_file: 'Read', read_many_files: 'Read', list_directory: 'LS', list_dir: 'LS', glob: 'Glob', search_file_content: 'Grep', grep_search: 'Grep',
  find_by_name: 'Glob', codebase_search: 'Grep', run_command: 'Bash', run_shell_command: 'Bash', edit_file: 'Edit', replace: 'Edit', smart_edit: 'Edit',
  write_file: 'Write', create_file: 'Write', write_to_file: 'Write', manage_task: 'TodoWrite', write_todos: 'TodoWrite', search_web: 'WebSearch',
  google_web_search: 'WebSearch', web_fetch: 'WebFetch', read_url_content: 'WebFetch', ask_question: 'AskUserQuestion', ask_user: 'AskUserQuestion',
  invoke_subagent: 'Agent', delegate_to_agent: 'Agent', codebase_investigator: 'Agent', send_message: 'SendMessage', schedule: 'Monitor',
  save_memory: 'TodoWrite', browser_subagent: 'mcp__browser__subagent',
}

function geminiArgs(args) {
  let a = args
  if (typeof a === 'string') {
    try { a = JSON.parse(a) } catch { a = {} }
  }
  if (!a || typeof a !== 'object') return {}
  const out = {}
  for (const [k, v] of Object.entries(a)) {
    if (typeof v === 'string' && v.startsWith('"') && v.endsWith('"')) {
      try { out[k] = JSON.parse(v) } catch { out[k] = v }
    } else out[k] = v
  }
  return out
}

/** An Antigravity or Gemini CLI tool call → `{ name, input, cwd }` in Claude's words (`cwd`: a folder it points at). */
function geminiCall(c) {
  const raw = String(c?.name ?? '')
  const a = geminiArgs(c?.args)
  if (raw === 'call_mcp_tool') return { name: `mcp__${a.ServerName ?? 'mcp'}__${a.ToolName ?? 'tool'}`, input: {} }
  const name = GEMINI_TOOLS[raw] ?? (raw || 'tool')
  const file = a.Path ?? a.AbsolutePath ?? a.file_path ?? a.absolute_path ?? a.TargetFile ?? a.path
  const cwd = a.Cwd ?? a.directory ?? a.dir_path ?? (typeof file === 'string' && path.isAbsolute(file) ? path.dirname(file) : null)
  if (name === 'Bash') return { name, input: { command: String(a.CommandLine ?? a.command ?? ''), description: a.toolSummary ?? a.description }, cwd }
  if (name === 'WebSearch') return { name, input: { query: a.query ?? a.Query ?? '' }, cwd }
  if (name === 'Agent') return { name, input: { description: a.toolSummary ?? a.description ?? 'helper' }, cwd }
  if (file != null) return { name, input: { file_path: String(file) }, cwd }
  return { name, input: { description: a.toolSummary }, cwd }
}

function antigravityLines(e, f) {
  return (buf, s, end) => {
    const o = parseLine(buf, s, end)
    if (!o) return
    const b = touch(e, msOf(o.created_at))
    if (!b) return
    if (o.type === 'USER_INPUT' && o.source === 'USER_EXPLICIT') b.p++
    if (o.type !== 'PLANNER_RESPONSE') return
    b.i += Math.max(0, Number(o.input_tokens) || 0)
    b.o += Math.max(0, Number(o.output_tokens) || 0)
    for (const c of Array.isArray(o.tool_calls) ? o.tool_calls : []) {
      const t = geminiCall(c)
      bookTool(e, b, t.name, t.input)
      // the agent's own notes and plans live in its home (brain/<conversation>/…): only a folder outside it is a project
      if (t.cwd && !t.cwd.startsWith(f.homeDir)) addCwd(e, t.cwd)
    }
  }
}

function antigravityTail(lines) {
  const t = { open: false, pending: null, lastTs: NaN }
  for (const o of lines) {
    const ts = msOf(o.created_at)
    if (ts > (t.lastTs || 0)) t.lastTs = ts
    if (o.type === 'USER_INPUT') {
      t.open = true
      t.pending = null
      t.over = false
    } else if (t.over) {
      continue   // what follows a run's last word (its `finish` reporting back) says nothing more
    } else if (o.type === 'PLANNER_RESPONSE') {
      const calls = Array.isArray(o.tool_calls) ? o.tool_calls : []
      t.open = calls.length > 0 || o.status === 'RUNNING'
      if (calls.some((c) => c?.name === 'finish')) {
        // a headless run (`agy --print`) hands in its answer with `finish` and its process ends: nobody is left at the desk
        t.open = false
        t.pending = null
        t.end = 'done'
        t.over = true
      } else if (calls.length) {
        const c = geminiCall(calls.at(-1))
        t.pending = pendingOf(c.name, c.input, ts)
      } else t.pending = null
    } else if (o.type === 'GENERIC') {
      if (o.status === 'RUNNING') t.open = true
      else if (t.pending && !t.pending.asking) t.pending = null
    } else if (o.type === 'CHECKPOINT' || o.type === 'ERROR_MESSAGE') {
      t.open = false
      t.end = o.type === 'ERROR_MESSAGE' ? 'error' : 'done'
    }
  }
  return t
}

/** A text-proto string field (`title:"…"`, octal escapes for every non-ASCII byte), decoded; null when absent. */
function pbtxtString(text, field) {
  const m = new RegExp(`(?:^|\\s|\\{)${field}:\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(text)
  if (!m) return null
  const bytes = []
  const s = m[1]
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') { bytes.push(...Buffer.from(s[i], 'utf8')); continue }
    const n = s[i + 1]
    if (/[0-7]/.test(n)) {
      const oct = /^[0-7]{1,3}/.exec(s.slice(i + 1))[0]
      bytes.push(parseInt(oct, 8))
      i += oct.length
    } else {
      bytes.push(({ n: 10, t: 9, r: 13 })[n] ?? n.charCodeAt(0))
      i++
    }
  }
  return Buffer.from(bytes).toString('utf8')
}

/** One Gemini CLI chat record (`type: user | gemini`, `toolCalls`, `tokens`) into the entry. */
function geminiRecord(e, m) {
  if (!m || typeof m !== 'object') return
  const b = touch(e, msOf(m.timestamp))
  if (!b) return
  if (m.type === 'user' && e.kind === 'main') {
    const text = typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((x) => x?.text ?? '').join('') : ''
    if (text && !text.startsWith('<')) b.p++
  } else if (m.type === 'gemini' || m.type === 'model') {
    addModel(e, m.model)
    const tk = m.tokens ?? {}
    b.i += Math.max(0, (Number(tk.input) || 0) - (Number(tk.cached) || 0))
    b.o += Math.max(0, (Number(tk.output) || 0) + (Number(tk.thoughts) || 0))
    for (const c of Array.isArray(m.toolCalls) ? m.toolCalls : []) {
      const t = geminiCall(c)
      bookTool(e, b, t.name, t.input)
      if (t.cwd) addCwd(e, t.cwd)
    }
  }
}

function geminiCliTail(records) {
  const t = { open: false, pending: null, lastTs: NaN }
  for (const m of records) {
    const ts = msOf(m?.timestamp)
    if (ts > (t.lastTs || 0)) t.lastTs = ts
    if (m?.type === 'user') t.open = true
    else if (m?.type === 'gemini' || m?.type === 'model') {
      const calls = Array.isArray(m.toolCalls) ? m.toolCalls : []
      const live = calls.filter((c) => !c?.status || /^(executing|scheduled|awaiting|validating|pending)/i.test(String(c.status)))
      t.open = live.length > 0
      if (live.length) {
        const c = geminiCall(live.at(-1))
        t.pending = pendingOf(c.name, c.input, ts, /awaiting/i.test(String(live.at(-1).status)) || c.name === 'AskUserQuestion')
      } else t.pending = null
    }
  }
  return t
}

/** Antigravity's workspaces by conversation, read once a run: run (ctx) → its file → `Map<conversation, workspace>` (cwdOf). */
const WORKSPACES = new WeakMap()

const gemini = {
  id: 'gemini',
  walk(ctx, home) {
    const out = []
    // Antigravity (App, CLI and standalone IDE): brain/<conversation>/.system_generated/logs/transcript.jsonl, titles in annotations/
    for (const app of ['antigravity', 'antigravity-cli', 'antigravity-ide']) {
      const bRel = path.join(app, 'brain')
      const ents = readdirSafe(path.join(home.dir, bRel))
      if (!ents.length) continue
      ctx.listedKey(home, bRel)
      for (const ent of ents) {
        if (!ent.isDirectory() || !UUID_RE.test(ent.name)) continue
        const rel = path.join(bRel, ent.name, '.system_generated', 'logs', 'transcript.jsonl')
        const st = statSafe(path.join(home.dir, rel))
        if (st) out.push({ rel, st, sid: ent.name, app, homeDir: home.dir })
      }
    }
    // the Gemini CLI: tmp/<project>/chats/session-*.json (a whole JSON, rewritten) or .jsonl (appended)
    for (const proj of readdirSafe(path.join(home.dir, 'tmp'))) {
      if (!proj.isDirectory()) continue
      const cRel = path.join('tmp', proj.name, 'chats')
      const chats = readdirSafe(path.join(home.dir, cRel))
      if (!chats.length) continue
      ctx.listedKey(home, cRel)
      for (const c of chats) {
        if (!c.isFile() || !/^session-.+\.jsonl?$/.test(c.name)) continue
        const rel = path.join(cRel, c.name)
        const st = statSafe(path.join(home.dir, rel))
        if (st) out.push({ rel, st, sid: c.name.replace(/\.jsonl?$/, ''), project: proj.name, whole: c.name.endsWith('.json') })
      }
    }
    return out
  },
  init(f, ctx, home) {
    const e = { kind: 'main', sid: f.sid, cwds: {}, models: {}, days: {} }
    if (f.app) {
      const ann = path.join(home.dir, f.app, 'annotations', `${f.sid}.pbtxt`)
      let text = ''
      try { text = fs.readFileSync(ann, 'utf8') } catch {}
      const title = pbtxtString(text, 'title')
      if (title) e.ct = clip(redact(title), 80)
    } else {
      const cwd = geminiProjectRoot(ctx, home, f.project)
      if (cwd) e.cwds[cwd] = 10
    }
    return e
  },
  lines: (e, ctl, f) => (f.app ? antigravityLines(e, f) : (buf, s, end) => {
    const o = parseLine(buf, s, end)
    if (!o) return
    if (o.sessionId && !o.type) {
      touch(e, msOf(o.startTime))
      return
    }
    geminiRecord(e, o)
  }),
  whole(e, text) {
    let doc = null
    try { doc = JSON.parse(text) } catch {}
    const msgs = Array.isArray(doc) ? doc : Array.isArray(doc?.messages) ? doc.messages : []
    touch(e, msOf(doc?.startTime))
    for (const m of msgs) geminiRecord(e, m)
  },
  /**
   * The folder of an Antigravity session that named none (a headless run that only answers calls no tool on a file): the
   * workspace the app has it under in `cache/last_conversations.json`, `{ <workspace>: <its last conversation> }`.
   */
  cwdOf(ctx, home, f) {
    if (!f.app) return null
    const file = path.join(home.dir, f.app, 'cache', 'last_conversations.json')
    let known = WORKSPACES.get(ctx)?.get(file)
    if (!known) {
      known = new Map()
      const last = readJson(file)
      for (const [dir, sid] of Object.entries(last && typeof last === 'object' && !Array.isArray(last) ? last : {})) {
        if (typeof sid === 'string' && path.isAbsolute(dir) && !known.has(sid)) known.set(sid, dir)
      }
      if (!WORKSPACES.has(ctx)) WORKSPACES.set(ctx, new Map())
      WORKSPACES.get(ctx).set(file, known)
    }
    return known.get(f.sid) ?? null
  },
  tail(abs, size, f) {
    if (f.app) return antigravityTail(tailLines(abs, size))
    if (!f.whole) return geminiCliTail(tailLines(abs, size).filter((o) => o.type))
    let doc = null
    try { doc = JSON.parse(fs.readFileSync(abs, 'utf8')) } catch {}
    return geminiCliTail((Array.isArray(doc?.messages) ? doc.messages : []).slice(-40))
  },
}

/**
 * The project a Gemini CLI temp folder stands for: its `.project_root` file when it has one, else the known project whose
 * path hashes (sha256, as the CLI names the folder) to the folder's name.
 */
function geminiProjectRoot(ctx, home, name) {
  let root = ''
  try { root = fs.readFileSync(path.join(home.dir, 'tmp', name, '.project_root'), 'utf8').trim() } catch {}
  if (root && path.isAbsolute(root)) return root
  if (!/^[0-9a-f]{64}$/.test(name)) return null
  for (const p of ctx.resolver.knownPaths()) if (crypto().createHash('sha256').update(p).digest('hex') === name) return p
  return null
}

// ---------------------------------------------------------------- Kimi

const KIMI_TOOLS = {
  TodoList: 'TodoWrite', SetTodoList: 'TodoWrite', StrReplace: 'Edit', StrReplaceFile: 'Edit', EditFile: 'Edit', WriteFile: 'Write', ReadFile: 'Read',
  Shell: 'Bash', RunCommand: 'Bash', Glob: 'Glob', Grep: 'Grep', SearchWeb: 'WebSearch', FetchURL: 'WebFetch', Task: 'Agent', Think: 'TodoWrite',
}

function kimiCall(name, args) {
  let a = args
  if (typeof a === 'string') {
    try { a = JSON.parse(a) } catch { a = {} }
  }
  a = a && typeof a === 'object' ? a : {}
  const raw = String(name ?? '')
  const n = KIMI_TOOLS[raw] ?? (/fetch/i.test(raw) ? 'WebFetch' : /search_web|web_search/i.test(raw) ? 'WebSearch' : raw || 'tool')
  const file = a.path ?? a.file_path ?? a.filePath
  return { name: n, input: file != null ? { ...a, file_path: String(file) } : a }
}

function kimiLines(e) {
  return (buf, s, end) => {
    const o = parseLine(buf, s, end)
    if (!o) return
    // kimi-code writes `time` (epoch ms), kimi-cli `timestamp` (seconds)
    const b = touch(e, msOf(o.time ?? o.timestamp ?? o.created_at))
    if (!b) return
    switch (o.type ?? o.message?.type) {
      case 'turn.prompt':
        if (e.kind === 'main' && (!o.origin || o.origin.kind === 'user' || o.origin.kind === 'human')) b.p++
        return
      case 'TurnBegin':
        if (e.kind === 'main') b.p++
        return
      case 'llm.request':
        addModel(e, o.model ?? o.modelAlias)
        return
      case 'usage.record': {
        if (o.usageScope !== 'turn') return
        const u = o.usage ?? {}
        b.i += (Number(u.inputOther) || 0) + (Number(u.inputCacheCreation) || 0)
        b.o += Number(u.output) || 0
        return
      }
      case 'StatusUpdate': {
        const u = o.message?.payload?.token_usage
        if (!u) return
        b.i += (Number(u.input_other) || 0) + (Number(u.input_cache_creation) || 0)
        b.o += Number(u.output) || 0
        return
      }
      case 'ToolCall': {
        const fn = o.message?.payload?.function ?? {}
        const t = kimiCall(fn.name, fn.arguments)
        bookTool(e, b, t.name, t.input)
        return
      }
      case 'context.append_loop_event': {
        const ev = o.event ?? {}
        if (ev.type !== 'tool.call') return
        const t = kimiCall(ev.name, ev.args)
        bookTool(e, b, t.name, t.input)
      }
    }
  }
}

function kimiTail(lines) {
  const t = { open: false, pending: null, lastTs: NaN }
  const calls = new Map()
  for (const o of lines) {
    const ts = msOf(o.time ?? o.timestamp)
    if (ts > (t.lastTs || 0)) t.lastTs = ts
    const type = o.type ?? o.message?.type
    if (type === 'turn.prompt' || type === 'TurnBegin') t.open = true
    else if (type === 'turn.end' || type === 'TurnEnd' || (type === 'context.append_loop_event' && o.event?.type === 'step.end' && /stop|end_turn/.test(String(o.event.finishReason)))) {
      t.open = false
      calls.clear()
    } else if (type === 'context.append_loop_event' && o.event?.type === 'tool.call') {
      const c = kimiCall(o.event.name, o.event.args)
      calls.set(o.event.toolCallId ?? `${calls.size}`, pendingOf(c.name, c.input, ts))
      t.open = true
    } else if (type === 'context.append_loop_event' && o.event?.type === 'tool.result') calls.delete(o.event.toolCallId)
  }
  t.pending = [...calls.values()].pop() ?? null
  return t
}

const kimi = {
  id: 'kimi',
  walk(ctx, home) {
    const out = []
    const sRoot = path.join(home.dir, 'sessions')
    const cfg = readJson(path.join(home.dir, 'kimi.json'))
    const md5cwd = new Map()
    for (const w of Array.isArray(cfg?.work_dirs) ? cfg.work_dirs : []) {
      if (typeof w?.path === 'string') md5cwd.set(crypto().createHash('md5').update(w.path).digest('hex'), w.path)
    }
    for (const bucket of readdirSafe(sRoot)) {
      if (!bucket.isDirectory()) continue
      const bRel = path.join('sessions', bucket.name)
      ctx.listedKey(home, bRel)
      for (const s of readdirSafe(path.join(home.dir, bRel))) {
        if (!s.isDirectory() || s.name.startsWith('ctitle-')) continue
        const sRel = path.join(bRel, s.name)
        const agents = readdirSafe(path.join(home.dir, sRel, 'agents'))
        if (!agents.length) {
          // kimi-cli, and kimi-code's first protocol: one wire.jsonl per session
          const rel = path.join(sRel, 'wire.jsonl')
          const st = statSafe(path.join(home.dir, rel))
          if (st) out.push({ rel, st, sid: s.name, sRel, cwd: md5cwd.get(bucket.name.replace(/^.*_/, '')) ?? null })
          continue
        }
        ctx.listedKey(home, path.join(sRel, 'agents'))
        for (const a of agents) {
          if (!a.isDirectory()) continue
          const rel = path.join(sRel, 'agents', a.name, 'wire.jsonl')
          const st = statSafe(path.join(home.dir, rel))
          if (st) out.push({ rel, st, sid: a.name === 'main' ? s.name : `${s.name}/${a.name}`, par: a.name === 'main' ? null : s.name, sub: a.name !== 'main', sRel })
        }
      }
    }
    return out
  },
  init(f, ctx, home) {
    const e = { kind: f.sub ? 'sub' : 'main', sid: f.sid, cwds: {}, models: {}, days: {} }
    if (f.par) e.par = f.par
    const st = readJson(path.join(home.dir, f.sRel, 'state.json'))
    const cwd = st?.workDir ?? st?.cwd ?? f.cwd
    if (typeof cwd === 'string') e.cwds[cwd] = 10
    const title = st?.title ?? st?.custom_title
    if (typeof title === 'string' && title && !f.sub) e.ct = clip(redact(title), 80)
    return e
  },
  lines: (e) => kimiLines(e),
  tail: (abs, size) => kimiTail(tailLines(abs, size)),
}

// ---------------------------------------------------------------- Grok

// ACP tool kinds (Grok Build streams its session as ACP updates) → the Claude tool each stands for
const ACP_KIND = { read: 'Read', search: 'Grep', edit: 'Edit', delete: 'Edit', move: 'Edit', execute: 'Bash', fetch: 'WebFetch', think: 'TodoWrite', switch_mode: 'ExitPlanMode' }

/** One ACP update of a line, whatever wraps it: `{ update }`, `{ params: { update } }`, or the update itself. */
const acpUpdate = (o) => o.update ?? o.params?.update ?? o

function grokCall(u) {
  const name = ACP_KIND[u.kind] ?? (/question|ask/i.test(String(u.title ?? '')) ? 'AskUserQuestion' : 'mcp__grok__tool')
  const raw = u.rawInput && typeof u.rawInput === 'object' ? u.rawInput : {}
  const file = u.locations?.[0]?.path ?? raw.path ?? raw.file_path
  if (name === 'Bash') return { name, input: { command: String(raw.command ?? raw.cmd ?? u.title ?? ''), description: u.title } }
  if (file != null) return { name, input: { file_path: String(file) } }
  if (name === 'WebFetch') return { name, input: { url: raw.url ?? '' } }
  return { name, input: { pattern: raw.pattern ?? raw.query, description: u.title } }
}

function grokLines(e, ctl, f) {
  const clock = lineClock(e, ctl, f)
  return (buf, s, end) => {
    const guess = clock(s, end)
    const o = parseLine(buf, s, end)
    if (!o) return
    const u = acpUpdate(o)
    const real = msOf(o.timestamp ?? o.ts ?? o.time ?? o.created_at ?? u.timestamp)
    const b = Number.isFinite(real) ? touch(e, real) : touch(e, guess, LINE_MS)
    if (!b) return
    const kind = u.sessionUpdate
    if (kind === 'user_message_chunk') {
      if (e.kind === 'main' && !e.um) b.p++
      e.um = 1
      return
    }
    e.um = 0
    if (kind === 'tool_call') {
      const t = grokCall(u)
      bookTool(e, b, t.name, t.input)
    } else if (kind === 'turn_completed') {
      const usage = u.usage ?? u.tokenUsage ?? Object.values(u.modelUsage ?? {})[0] ?? {}
      b.i += Math.max(0, (Number(usage.inputTokens) || 0) - (Number(usage.cachedReadTokens) || 0))
      b.o += Number(usage.outputTokens) || 0
      for (const m of Object.keys(u.modelUsage ?? {})) addModel(e, m)
    }
  }
}

function grokTail(lines) {
  const t = { open: false, pending: null, lastTs: NaN }
  const calls = new Map()
  for (const o of lines) {
    const u = acpUpdate(o)
    const ts = msOf(o.timestamp ?? o.ts ?? o.time ?? u.timestamp)
    if (ts > (t.lastTs || 0)) t.lastTs = ts
    const kind = u.sessionUpdate
    if (kind === 'turn_completed') {
      t.open = false
      calls.clear()
    } else if (kind === 'tool_call') {
      const c = grokCall(u)
      calls.set(u.toolCallId ?? `${calls.size}`, pendingOf(c.name, c.input, ts))
      t.open = true
    } else if (kind === 'tool_call_update' && /completed|failed|cancel/.test(String(u.status))) calls.delete(u.toolCallId)
    else if (kind) t.open = true
  }
  t.pending = [...calls.values()].pop() ?? null
  return t
}

const grok = {
  id: 'grok',
  walk(ctx, home) {
    const out = []
    const subs = new Map()
    for (const cw of readdirSafe(path.join(home.dir, 'sessions'))) {
      if (!cw.isDirectory()) continue
      const cRel = path.join('sessions', cw.name)
      ctx.listedKey(home, cRel)
      let cwd = null
      try { cwd = decodeURIComponent(cw.name) } catch {}
      if (!cwd || !path.isAbsolute(cwd)) {
        try { cwd = fs.readFileSync(path.join(home.dir, cRel, '.cwd'), 'utf8').trim() } catch { cwd = null }
      }
      for (const s of readdirSafe(path.join(home.dir, cRel))) {
        if (!s.isDirectory()) continue
        const sRel = path.join(cRel, s.name)
        for (const c of readdirSafe(path.join(home.dir, sRel, 'subagents'))) subs.set(c.name.replace(/\.json$/, ''), s.name)
        const rel = path.join(sRel, 'updates.jsonl')
        const st = statSafe(path.join(home.dir, rel))
        if (st) out.push({ rel, st, sid: s.name, cwd, sRel })
      }
    }
    for (const f of out) if (subs.has(f.sid)) Object.assign(f, { sub: true, par: subs.get(f.sid) })
    return out
  },
  init(f, ctx, home) {
    const e = { kind: f.sub ? 'sub' : 'main', sid: f.sid, cwds: {}, models: {}, days: {} }
    if (f.par) e.par = f.par
    const sum = readJson(path.join(home.dir, f.sRel, 'summary.json')) ?? {}
    const cwd = sum.info?.cwd ?? sum.info?.working_directory ?? sum.info?.workingDirectory ?? f.cwd
    if (typeof cwd === 'string') e.cwds[cwd] = 10
    const title = sum.generated_title ?? sum.session_summary
    if (typeof title === 'string' && title && !f.sub) e.ct = clip(redact(title), 80)
    addModel(e, sum.current_model_id)
    f.born = msOf(sum.created_at)
    return e
  },
  lines: (e, ctl, f) => grokLines(e, ctl, f),
  tail: (abs, size) => grokTail(tailLines(abs, size)),
}

/** The readers, by agent id (Claude's sessions are read by collect.mjs itself). */
export const READERS = { codex, gemini, cursor, kimi, grok }

// ---------------------------------------------------------------- reading them all

/**
 * Read every home of the other agents: their session files touched since the range start into the cache (incremental for
 * appended files, whole for rewritten ones), the sessions written in the last DESK_MS seated at desks (their subagents
 * written in the last INTERN_FRESH_MS on the bench), and the ones written just before that on the coat rack.
 * `ctx` is the collector's (cache, resolver, nowMs, fromMs, liveDays…); `ctx.listedKey(home, rel)` records a folder
 * listed in full, so the cache can forget files that vanished from it. Never throws: a reader that fails leaves a note.
 * A walk stats thousands of files that hardly ever move, so a series of runs (the pane's) keeps one for WALK_MS
 * (`ctx.walks`, the last run's; `ctx.walked`, this run's): only what was written lately is stat'ed again, and a session
 * that starts is seen by the next walk, as the pane's watcher sees it by its heartbeat.
 * @returns {{ synced: { f, e, home }[], desks: object[], left: object[], watch: string[], read: Set<string> }}
 */
export async function readOtherAgents(ctx, homes) {
  const synced = []
  const desks = []
  const left = []
  const watch = []
  const read = new Set()
  for (const home of homes) {
    const reader = READERS[home.agent]
    if (!reader) continue
    let files = ctx.walks?.homes[home.prefix]
    if (files) files = freshened(ctx, home, files)
    else {
      try { files = reader.walk(ctx, home) } catch (err) { ctx.log(`${home.agent} walk: ${err?.message}`); ctx.notes.push(`${home.agent} sessions unreadable`); continue }
      // what a run of this range or a shorter one reads: the rest of a walk it only drops again
      if (ctx.walked) ctx.walked[home.prefix] = files.filter((f) => f.st.mtimeMs >= ctx.fromMs || ctx.nowMs - f.st.mtimeMs < DESK_MS + LEFT_MS).map(plainWalked)
    }
    read.add(home.agent)
    let titles = null
    const byKey = new Map()
    // the sessions to read, and what each leaves to read (an archive is read whole), for the pane's progress
    const todo = []
    for (const f of files) {
      f.key = `${home.prefix}${f.rel}`
      f.abs = path.join(home.dir, f.rel)
      ctx.seen.add(f.key)
      // a session written in the last DESK_MS + LEFT_MS is read whatever the range (a desk at 00:10 began yesterday)
      const recent = ctx.nowMs - f.st.mtimeMs < DESK_MS + LEFT_MS
      if (f.st.mtimeMs < ctx.fromMs && !recent) continue
      // a session that began a day after a page of the past ended (its name's clock may be local) has none of its days:
      // the thousands of rollouts since January are not unpacked again for January
      if (!recent && f.began > ctx.toMs + 864e5) continue
      const left = f.zst ? (knownWhole(ctx, f) ? 0 : f.st.size) : bytesLeft(ctx.cache, f.key, f.st)
      ctx.progress?.expect(left)
      todo.push({ f, recent, left })
    }
    for (const { f, recent, left } of todo) {
      // their old sessions live in the cold tier like Claude's: a file the hot tier does not know may be one
      if (!ctx.cache.files[f.key] && !isNewFile(f.st, ctx.nowMs)) ctx.ensureCold()
      try {
        const e = f.zst ? await syncZst(ctx, reader, home, f) : syncOne(ctx, reader, home, f, recent ? 0 : ctx.fromMs)
        ctx.progress?.advance(left)
        ctx.checkpoint()
        if (!e) continue
        // a session whose lines named no folder may have one on its agent's own books (an entry read before is asked too)
        if (reader.cwdOf && e.kind === 'main' && !topCwd(e)) {
          const cwd = reader.cwdOf(ctx, home, f)
          if (cwd) {
            addCwd(e, cwd)
            ctx.changed = true
          }
        }
        byKey.set(f.key, e)
        synced.push({ f, e, home })
      } catch (err) {
        ctx.progress?.advance(left)
        ctx.log(`${home.agent} ${f.rel}: ${err?.message}`)
      }
    }
    // live: the main sessions written in the last DESK_MS sit at desks, their fresh subagents on the bench
    const recent = files.filter((f) => ctx.nowMs - f.st.mtimeMs < DESK_MS + LEFT_MS && f.st.mtimeMs - ctx.nowMs < 60e3)
    const subsOf = new Map()
    for (const f of recent) {
      const e = byKey.get(f.key)
      if (!e || e.kind !== 'sub' || ctx.nowMs - f.st.mtimeMs > INTERN_FRESH_MS) continue
      const par = e.par ?? f.par
      if (!par) continue
      if (!subsOf.has(par)) subsOf.set(par, [])
      subsOf.get(par).push({ f, e })
    }
    for (const f of recent) {
      const e = byKey.get(f.key)
      if (!e || e.kind !== 'main') continue
      titles ??= reader.titles ? reader.titles(home) : new Map()
      const title = titles.get(e.sid) ?? e.ct ?? e.at ?? null
      const proj = ctx.resolver.resolve(topCwd(e) ?? '')
      if (ctx.nowMs - f.st.mtimeMs >= DESK_MS) {
        left.push({ title: clip(redact(title || proj.name), 60), project: clip(proj.name, 60), left_at: iso(f.st.mtimeMs), agent: home.agent, _ms: f.st.mtimeMs })
        continue
      }
      try {
        const tail = reader.tail(f.abs, f.st.size, f)
        // a run that said its last word has left, as a Claude session whose process ended: seen out for LEFT_MS
        if (tail.over) {
          if (ctx.nowMs - f.st.mtimeMs < LEFT_MS) left.push({ title: clip(redact(title || proj.name), 60), project: clip(proj.name, 60), left_at: iso(f.st.mtimeMs), agent: home.agent, _ms: f.st.mtimeMs })
          continue
        }
        desks.push(deskOf(ctx, home, f, e, title, proj, subsOf.get(e.sid) ?? [], tail))
        watch.push(f.abs)
      } catch (err) {
        ctx.log(`${home.agent} desk ${f.rel}: ${err?.message}`)
      }
    }
    if (reader.nursery) watch.push(...reader.nursery(ctx, home))
  }
  return { synced, desks, left, watch, read }
}

/** A remembered walk's files, the ones written lately stat'ed again; a file gone since is gone from it. */
function freshened(ctx, home, files) {
  const out = []
  for (const f of files) {
    const st = ctx.nowMs - f.st.mtimeMs < WRITTEN_MS ? statSafe(path.join(home.dir, f.rel)) : f.st
    if (st) out.push({ ...f, st })
  }
  return out
}

/** A walked file as a walk is remembered: what a reader asks of its stat and nothing more, plain data. */
function plainWalked({ st, ...f }) {
  return { ...f, st: { mtimeMs: st.mtimeMs, size: st.size, ino: st.ino, birthtimeMs: st.birthtimeMs } }
}

/** The entry of a file read whole, as long as the file is what it read. */
function knownWhole(ctx, f) {
  const c = ctx.cache.files[f.key]
  return c && c.ino === f.st.ino && c.size === f.st.size && c.mtime === f.st.mtimeMs && !ctx.stale?.(c) ? c : null
}

/** A file read whole, into the cache. */
function keepWhole(ctx, home, f, e) {
  e.size = f.st.size
  e.mtime = f.st.mtimeMs
  e.ag = home.agent
  ctx.cache.files[f.key] = e
  ctx.grew += f.st.size
  ctx.changed = true
  return e
}

/**
 * The lines of a zstd file. A stream, off this thread: an archived rollout unpacks to half a gigabyte and more, which
 * in one piece took 1.3 GB and twice the time (and past 1 GB failed, every run).
 */
async function zstLines(abs, onLine) {
  const { pipeline } = process.getBuiltinModule('node:stream/promises')
  let line = []   // the pieces of the line still going
  await pipeline(fs.createReadStream(abs, { highWaterMark: ZST_CHUNK }), zlib().createZstdDecompress({ chunkSize: ZST_CHUNK }), async (chunks) => {
    for await (const chunk of chunks) {
      const nl = chunk.lastIndexOf(10)
      if (nl === -1) {
        line.push(chunk)
        continue
      }
      eachLine(Buffer.concat([...line, chunk.subarray(0, nl)]), onLine)
      line = [chunk.subarray(nl + 1)]
    }
  })
  eachLine(Buffer.concat(line), onLine)
}

/** An archived session into the cache, once: it is never written again. */
async function syncZst(ctx, reader, home, f) {
  const known = knownWhole(ctx, f)
  if (known) return known
  const e = { ...reader.init(f, ctx, home), ino: f.st.ino, off: f.st.size }
  try {
    await zstLines(f.abs, reader.lines(e))
  } catch (err) {
    // a broken archive counts for what could be read: a second reading would stop at the same place
    if (!String(err?.code).startsWith('ZSTD_')) throw err
    ctx.log(`${f.rel}: ${err.message}`)
  }
  return keepWhole(ctx, home, f, e)
}

/** One session file into the cache: appended JSONL from where the last run stopped, a whole JSON when it changed. */
function syncOne(ctx, reader, home, f, fromMs) {
  const init = () => reader.init(f, ctx, home)
  if (f.whole) {
    const known = knownWhole(ctx, f)
    if (known) return known
    const e = { ...init(), ino: f.st.ino, off: f.st.size }
    reader.whole(e, fs.readFileSync(f.abs, 'utf8'), f)
    return keepWhole(ctx, home, f, e)
  }
  const r = syncFile(ctx.cache, f.key, f.abs, f.st, {
    init: () => ({ ...init(), ag: home.agent }), handler: (e, ctl) => reader.lines(e, ctl, f), fromMs, stale: ctx.stale,
  })
  ctx.grew += r.bytes
  if (!r.cached) ctx.changed = true
  return r.entry
}

/** A desk for a live session of another agent: the same shape buildDesk gives Claude's, its character and account. */
function deskOf(ctx, home, f, e, title, proj, subs, tail) {
  const interns = subs.map(({ f: sf, e: se }) => ({
    id: shortId(home.agent, se.sid),
    agent: home.agent,
    type: 'general-purpose',
    description: clip(redact(se.nick ?? se.ct ?? ''), 40),
    started_at: iso(se.fts ?? sf.st.birthtimeMs),
    last_seen: iso(sf.st.mtimeMs),
  }))
  tail.interns = interns.length > 0
  const s = liveState(tail, f, ctx.nowMs)
  const model = tail.model ?? Object.keys(e.models ?? {}).sort((a, b) => e.models[b] - e.models[a])[0] ?? null
  return {
    id: shortId(home.agent, e.sid),
    pid: null,
    agent: home.agent,
    account: home.label,
    title: clip(redact(title || proj.name), 60),
    project: clip(proj.name, 60),
    project_path: safeText(proj.path),
    worktree: proj.worktree ? clip(proj.worktree, 40) : null,
    branch: null,
    status: s.status,
    state: s.state,
    idle_reason: s.idle_reason ?? null,
    activity: s.activity,
    model: model ? clip(model, 40) : null,
    started_at: iso(e.fts ?? f.st.birthtimeMs),
    last_seen: iso(f.st.mtimeMs),
    entrypoint: home.agent,
    interns: interns.sort((a, b) => String(a.started_at).localeCompare(String(b.started_at))),
    meetings: [],
    ...(proj.temp ? { worker: true } : {}),
    _sid: `${home.agent}:${e.sid}`,
  }
}
