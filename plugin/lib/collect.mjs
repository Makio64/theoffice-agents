// Node collector: reads ~/.claude (sessions, transcripts, subagents, workflows), local git and optionally
// novi, and produces the `theoffice/1` facts object the renderers draw. Read-only on ~/.claude, always.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile, execFileSync, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { EDIT_TOOLS, KINDS, emptyActivity, kindOf, labelOf } from './activity.mjs'
import { GAP_MS, addEdit, fnv1a, iso, localDay, readJson, readdirSafe, statSafe, topCwd, topKey, touch, touchedDay } from './buckets.mjs'
import { pageBack, pageDays, pageLabel } from './period.mjs'
import { clip, redact, safeText } from './format.mjs'
import {
  ARCHIVE_EVERY_MS, COLD_EVERY_MS, COLD_MS, GIT_KEEP_MS, HOT_MS, REPO_MS, SAVE_BYTES, SAVE_EVERY_MS, bytesLeft, cacheFile, defaultCacheDir, emptyCache, keptSessions,
  loadArchiveInto, loadCache, loadColdInto, loadKeptInto, loadWalks, pruneCache,
  isNewFile, readTail, saveCache, saveWalks, sessionKey, syncFile, tierOf,
} from './cache.mjs'
import { AGENT_IDS } from './cast.mjs'
import { READERS, agentHomes, readOtherAgents } from './agents.mjs'
import { VIEWS } from './model.mjs'

const execFileRaw = promisify(execFile)
// windowsHide: a run started without a console (the desktop pane's) would flash a window on Windows for every git call
const execFileP = (cmd, args, opts) => execFileRaw(cmd, args, { windowsHide: true, ...opts })

export const SPEC = 'theoffice/1'
export { VIEWS }
const INTERN_FRESH_MS = 150e3
const MEETING_FRESH_MS = 180e3
const LEFT_MS = 15 * 60e3
/** A Claude desk whose turn has been done this long goes home, though its session is still open (collectLive). */
const DONE_MS = 15 * 60e3
const PROJECT_CAP = 40
const WORKTREE_CAP = 6
const CWD_CAP = 16
const GIT_TTL = 5 * 60e3
/** Repos asked at once: a machine's 60 repos at once were a burst of 60 processes, each with its own timeout running. */
const GIT_JOBS = 6
const GIT_RETRY_MS = 30 * 60e3
/**
 * Line stats are asked NUMSTAT_BATCH commits at a time: 400 of one repo's heavy commits took 14 to 20 s, past the 6 s a
 * batch may take, so they failed on every retry. A run of a range that reaches today spends at most NUMSTAT_BUDGET_MS a
 * repo on them, and a run of the pane none on a repo it lists for the first time, the rest left to its next runs; a
 * page of the past, read once with a long wait, gets them all.
 */
const NUMSTAT_BATCH = 50
const NUMSTAT_BUDGET_MS = 3000
/**
 * A page of the past is read once, behind the waiting room, and looks in every repo Claude Code was opened in (this
 * machine: 133 folders in 88 repos, a second or two of git for a first read): so many repos are asked at once, so many at
 * most, and what a page's listing found stands a day, its days being over, then as long as no ref moves.
 */
const PAST_GIT_JOBS = 12
const PAST_REPO_CAP = 200
const PAST_GIT_TTL = 864e5
const NOVI_TTL = 60e3
/** novi's names for the agents the office reads under another id: Antigravity is Gemini's app. */
const NOVI_AGENT = { antigravity: 'gemini' }
/** Minutes per slot of a timelapse: yesterday by the quarter of an hour, the week by the hour, the month by 4 hours. */
const LAPSE_SLOT_MIN = { yesterday: 15, week: 60, month: 240 }
const LAPSE_DESKS = 600
/** A workflow run with no json yet whose agents and folder have been quiet this long has stopped (a killed run never ends). */
const RUN_QUIET_MS = 30 * 60e3
/** How long a throwaway `cat` or `ls` in a project folder may take (guarded), and how soon a stalled `.git` file is tried again. */
const GUARD_MS = 1000
const STALL_RETRY_MS = 10 * 60e3
/** A long read saves what it has this often: the pane stops a run at 20 s, and one stopped with nothing saved starts over for ever. */
const CHECKPOINT_MS = 5000
/** How often a run of the pane says how far it has read (progressOf). */
const PROGRESS_MS = 500
/** Where the desktop app's sessions run (a transcript's `entrypoint`): Claude Code keeps theirs at any age unless settings say (retentionOf). */
const DESKTOP_ENTRYPOINTS = new Set(['claude-desktop', 'claude-desktop-3p', 'local-agent', 'local_agent'])
/** How many days Claude Code keeps a transcript after its last write when no settings say (cleanupPeriodDays). */
const CLEANUP_DAYS = 30
/** Claude Code's managed settings, whose cleanupPeriodDays wins over the person's own. */
const MANAGED_SETTINGS = {
  darwin: '/Library/Application Support/ClaudeCode/managed-settings.json', linux: '/etc/claude-code/managed-settings.json',
  win32: 'C:\\Program Files\\ClaudeCode\\managed-settings.json',
}[process.platform] ?? null
/** What the desktop app leaves of a session deleted in it, beside where its transcript was: `<sid>.desktop-released.json`. */
const RELEASED = '.desktop-released.json'

// ---------------------------------------------------------------- time & range

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad2 = (n) => String(n).padStart(2, '0')

export { localDay }

function dayLabel(d) {
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`
}

/**
 * Local-calendar range for a view. Built with the local Date constructor (y, m, d − i) so DST days are
 * 23/25 hours long instead of shifting every bucket by an hour. `all` = the week (+ live floor).
 * `yesterday` (a timelapse's) is the whole day before today, from its midnight to today's.
 * `back` (0 and up, with no limit) turns a view's range that many pages into the past (period.mjs): the day that many days
 * ago, the Monday-to-Sunday week or the calendar month that many before this one, from its first midnight to the one
 * after its last day, its `back` said in the range. The live view is now, whatever `back` says. The month as it runs
 * now is last month and this one so far (period.mjs pageDays); a timelapse's (`lapse`) replays the last 30 days.
 */
export function resolveRange(view, nowMs, back = 0, { lapse = false } = {}) {
  const n = new Date(nowMs)
  if (view === 'yesterday') {
    const y = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1)
    const to = new Date(n.getFullYear(), n.getMonth(), n.getDate())
    return { kind: 'yesterday', from: y.toISOString(), to: to.toISOString(), days: [localDay(y.getTime())], label: dayLabel(y) }
  }
  const kind = view === 'live' || view === 'today' || view === 'month' ? view : 'week'
  const unit = kind === 'month' || kind === 'week' ? kind : 'day'
  const page = kind === 'live' ? 0 : pageBack(back)
  const today = localDay(nowMs)
  const midnight = (day) => {
    const [y, m, d] = day.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  if (page) {
    const days = pageDays(unit, page, today)
    const last = midnight(days.at(-1))
    const to = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1)
    return { kind, back: page, from: midnight(days[0]).toISOString(), to: to.toISOString(), days, label: pageLabel(unit, page, today) }
  }
  if (kind === 'month' && !lapse) {
    const days = pageDays(unit, 0, today)
    const from = midnight(days[0])
    return { kind, from: from.toISOString(), to: n.toISOString(), days, label: `${dayLabel(from)} → ${dayLabel(n)}` }
  }
  const length = kind === 'week' ? 7 : kind === 'month' ? 30 : 1
  const day = (i) => new Date(n.getFullYear(), n.getMonth(), n.getDate() - i)
  const from = day(length - 1)
  const days = []
  for (let i = length - 1; i >= 0; i--) days.push(localDay(day(i).getTime()))
  const label = length === 1 ? dayLabel(n) : `${dayLabel(from)} → ${dayLabel(day(0))}`
  return { kind, from: from.toISOString(), to: n.toISOString(), days, label }
}

function nowInfo(nowMs) {
  const d = new Date(nowMs)
  const hour = d.getHours()
  return {
    iso: d.toISOString(),
    local_date: localDay(nowMs),
    local_time: `${pad2(hour)}:${pad2(d.getMinutes())}`,
    hour,
    weekday: DOW[d.getDay()],
    is_night: hour >= 20 || hour < 7,
  }
}

// ---------------------------------------------------------------- small fs helpers

function envFlag(v) {
  return !!v && v !== '0' && v !== 'false'
}

/** Claude Code's project dir name for a cwd (lossy: every non-alphanumeric char becomes `-`). */
export function enc(p) {
  return String(p ?? '').replace(/[^a-zA-Z0-9]/g, '-')
}

/**
 * What a throwaway command prints, or null when it could not. On macOS nothing inside a project folder is opened in this
 * process: the system holds an open() under ~/Documents, ~/Desktop or ~/Downloads for as long as its privacy prompt waits
 * for an answer, no timer of ours can fire meanwhile, and a run killed for it saves nothing, so the next one would stop at
 * the same file. A child can be killed, and after one stall the run asks for nothing more there (ctx.stalled): one wait a
 * run at most. A command that fails after printing (`ls` on a dangling link) still answers what it printed.
 */
export function guarded(ctx, cmd, args) {
  if (ctx.stalled) return null
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: GUARD_MS, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (err) {
    if (err?.code !== 'ETIMEDOUT') return typeof err?.stdout === 'string' ? err.stdout : null
    ctx.stalled = true
    ctx.log(`${cmd} ${args.at(-1)}: stalled`)
    return null
  }
}

/** A small file in a project folder (guarded), or null when it could not be read. */
function projectFile(ctx, file) {
  if (process.platform === 'darwin') return guarded(ctx, '/bin/cat', [file])
  try { return fs.readFileSync(file, 'utf8') } catch { return null }
}

/** A folder's entries, or null when it could not be listed. */
function listDir(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }) } catch { return null }
}

function realpathSafe(p) {
  try { return fs.realpathSync(p) } catch { return null }
}

/** The folders in a folder, links to folders too (guarded). */
function foldersIn(ctx, dir) {
  if (process.platform === 'darwin') return (guarded(ctx, '/bin/ls', ['-1ApL', dir]) ?? '').split('\n').filter((n) => n.endsWith('/')).map((n) => n.slice(0, -1))
  return readdirSafe(dir).filter((x) => x.isDirectory() || (x.isSymbolicLink() && statSafe(path.join(dir, x.name))?.isDirectory())).map((x) => x.name)
}

// ---------------------------------------------------------------- transcript line rules

/**
 * Real human prompt. Task notifications, peer messages, scheduled prompts, skill bodies (`isMeta`),
 * compaction summaries and tool results are all `type:"user"` too (claude-data gotcha 7, novi fix c).
 */
export function isHumanPrompt(o) {
  if (o?.type !== 'user' || o.isSidechain || o.isMeta || o.isCompactSummary) return false
  const c = o.message?.content
  let text = ''
  if (typeof c === 'string') text = c
  else if (Array.isArray(c)) {
    if (c.some((x) => x?.type === 'tool_result')) return false
    text = c.find((x) => x?.type === 'text')?.text ?? ''
  }
  if (o.origin && typeof o.origin === 'object') return o.origin.kind === 'human'
  return !!text && !text.startsWith('<') && !text.startsWith('[')
}

function contentText(c) {
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.find((x) => x?.type === 'text')?.text ?? ''
  return ''
}

const B_ENV = Buffer.from('{"parentUuid"')
const B_TOOL_RESULT = Buffer.from('"tool_result"')
const B_ATTACHMENT = Buffer.from('"attachment":{')
const B_TS = Buffer.from('","timestamp":"')
const B_META = [Buffer.from('{"type":"custom-title"'), Buffer.from('{"type":"ai-title"'), Buffer.from('{"type":"worktree-state"')]

function hasPrefix(buf, s, e, p) {
  if (e - s < p.length) return false
  for (let i = 0; i < p.length; i++) if (buf[s + i] !== p[i]) return false
  return true
}

/**
 * A resumed session can re-write a run of old lines into the same file (same uuid, older timestamp:
 * claude-data gotcha 5). Repeats always go back in time, so only a line not newer than `e.prev` is looked
 * up in this pass's uuid set. In an appended chunk the originals may sit before the checkpoint: a line that
 * goes back more than a gap (5 min) and is not in the set asks for a full re-parse instead (rare: a few a day).
 * @returns {boolean} true when the line must be skipped
 */
function replayed(e, o, ms, seen, ctl) {
  if (typeof o.uuid !== 'string') return false
  if (e.prev != null && ms <= e.prev) {
    if (seen.has(o.uuid)) return true
    if (ctl.incremental && e.prev - ms >= GAP_MS) {
      ctl.rescan = true
      return true
    }
  }
  seen.add(o.uuid)
  return false
}

function onEnvelope(e, o, seen, ctl) {
  // where the session runs (judgeGone): 1 the desktop app, on any of its lines, 0 anything else
  if (e.kind === 'main' && e.dt !== 1 && typeof o.entrypoint === 'string') e.dt = DESKTOP_ENTRYPOINTS.has(o.entrypoint) ? 1 : 0
  const t = o.type
  if (t !== 'user' && t !== 'assistant') return
  const ms = typeof o.timestamp === 'string' ? Date.parse(o.timestamp) : Number.NaN
  if (seen && replayed(e, o, ms, seen, ctl)) return
  const prevMs = e.prev
  const b = touch(e, ms)
  if (!b) return
  const day = touchedDay()
  if (typeof o.cwd === 'string' && o.cwd && (e.cwds[o.cwd] != null || Object.keys(e.cwds).length < CWD_CAP)) e.cwds[o.cwd] = (e.cwds[o.cwd] ?? 0) + 1
  // connected-office patch: the time of each gap, per cwd and day, so a session's time can be split across the repos it
  // worked in (same gap as touch(): capped at GAP_MS). Upstream books the whole session to its most frequent cwd.
  const gapMs = prevMs != null && ms > prevMs ? Math.min(ms - prevMs, GAP_MS) : 0
  if (gapMs && typeof o.cwd === 'string' && o.cwd && (e.cm?.[o.cwd] != null || Object.keys(e.cm ?? {}).length < CWD_CAP)) {
    const byDay = ((e.cm ??= {})[o.cwd] ??= {})
    byDay[day] = (byDay[day] ?? 0) + gapMs
  }
  if (typeof o.gitBranch === 'string' && o.gitBranch) e.branch = o.gitBranch
  if (t === 'user') {
    if (isHumanPrompt(o)) b.p++
    return
  }
  const msg = o.message
  if (!msg || typeof msg !== 'object' || msg.model === '<synthetic>') return
  // One API message is written as one line per content block, each repeating the same usage: count it once
  // per message.id+requestId (the last line of a message wins), not once per line (novi fix a).
  const key = msg.id ? `${msg.id}:${o.requestId ?? ''}` : (o.uuid ?? null)
  const u = msg.usage
  const tin = (Number(u?.input_tokens) || 0) + (Number(u?.cache_creation_input_tokens) || 0)
  const tout = Number(u?.output_tokens) || 0
  if (key && key === e.mk) {
    const lb = e.days[e.md]
    if (lb) {
      lb.i += tin - e.mi
      lb.o += tout - e.mo
    }
  } else {
    b.i += tin
    b.o += tout
    e.md = day
    if (typeof msg.model === 'string' && msg.model) e.models[msg.model] = (e.models[msg.model] ?? 0) + 1
  }
  e.mk = key
  e.mi = tin
  e.mo = tout
  if (!Array.isArray(msg.content)) return
  for (const c of msg.content) {
    if (c?.type !== 'tool_use') continue
    b.t++
    const k = kindOf(c.name, c.input)
    b.k[k] = (b.k[k] ?? 0) + 1
    if (EDIT_TOOLS.has(c.name)) addEdit(e, b, c.input?.file_path || c.input?.notebook_path)
  }
}

function onMeta(e, o) {
  if (o.type === 'custom-title' && o.customTitle) e.ct = clip(redact(o.customTitle), 80)
  else if (o.type === 'ai-title' && o.aiTitle) e.at = clip(redact(o.aiTitle), 80)
  else if (o.type === 'worktree-state' && o.worktreeSession?.worktreePath) {
    const w = o.worktreeSession
    e.wt = { path: String(w.worktreePath), name: w.worktreeName ? String(w.worktreeName) : null, orig: w.originalCwd ? String(w.originalCwd) : null }
  }
}

/**
 * Byte-level line handler. Only envelope lines (`{"parentUuid"`) and the three metadata types we need are
 * JSON.parsed; user tool_result lines (~66% of all bytes) only lend their timestamp, read straight from the
 * bytes; attachments, api-request blobs and `bridge-session` lines (account ids) are never parsed.
 * `ctl` comes from syncFile: `{ incremental }` in, `rescan` out (see replayed()).
 */
function lineHandler(e, ctl = { incremental: false, rescan: false }) {
  const seen = new Set()
  return (buf, s, end) => {
    if (ctl.rescan) return
    if (hasPrefix(buf, s, end, B_ENV)) {
      const head = buf.subarray(s, Math.min(end, s + 400))
      if (head.indexOf(B_TOOL_RESULT) !== -1) {
        const line = buf.subarray(s, end)
        const i = line.indexOf(B_TS)
        if (i !== -1) {
          const q = line.indexOf(34, i + 15)
          if (q > i + 15 && q - i < 60) touch(e, Date.parse(line.toString('latin1', i + 15, q)))
        }
        return
      }
      if (head.subarray(0, 200).indexOf(B_ATTACHMENT) !== -1) return
      let o
      try { o = JSON.parse(buf.toString('utf8', s, end)) } catch { return }
      if (o && typeof o === 'object') onEnvelope(e, o, seen, ctl)
      return
    }
    if (end - s > 16_384) return
    for (const p of B_META) {
      if (!hasPrefix(buf, s, end, p)) continue
      let o
      try { o = JSON.parse(buf.toString('utf8', s, end)) } catch { return }
      if (o && typeof o === 'object') onMeta(e, o)
      return
    }
  }
}

// ---------------------------------------------------------------- project resolution

const WORKTREE_RE = /^(.+?)[\\/]\.claude[\\/]worktrees[\\/]([^\\/]+)/
const SCRATCH_RE = /^(?:\/private)?\/tmp\/claude-\d+\/(-[^/]+)\/[0-9a-f-]{36}(?:\/|$)/

// The temp folders a script makes its throwaway folders in, whatever account or machine wrote the transcript
const TMP_ROOT_RE = /^(?:\/private)?(?:\/tmp|\/var\/tmp|\/var\/folders\/[^/]+\/[^/]+\/T)$/
// `<prefix>-<6 to 10 random characters>`, as mkdtemp, Python's tempfile (its characters count `_`) and mktemp name one
const TMP_NAME_RE = /^(.*?[A-Za-z0-9])[-.]+([A-Za-z0-9_]{6,10})$/

/**
 * A throwaway folder made for one run, right under a temp folder, as the family it is one of:
 * `…/T/data-factory-SB2Np4` → `{ path: '…/T/data-factory', name: 'data-factory', sure }`, null for any other
 * folder. A script that hands each of its workers a folder of its own would otherwise open a room per worker. `sure`:
 * its end looks drawn at random (a digit, both cases or a `_`). One in twenty is all letters, as `/tmp/my-server` is, a
 * folder somebody named: that one is of a family only once a sure one was seen in it (makeResolver keeps them).
 */
export function tempFamily(dir, tmp = os.tmpdir()) {
  const root = path.dirname(dir)
  if (!TMP_ROOT_RE.test(root) && root !== tmp.replace(/[\\/]+$/, '')) return null
  const m = TMP_NAME_RE.exec(path.basename(dir))
  if (!m) return null
  const sure = /\d/.test(m[2]) || m[2].includes('_') || (/[a-z]/.test(m[2]) && /[A-Z]/.test(m[2]))
  // one family whichever of macOS's two names for the folder the agent wrote (`/private/var/…` is `/var/…`)
  return { path: path.join(root.replace(/^\/private(?=\/(?:tmp|var)\/)/, ''), m[1]), name: m[1], sure }
}

/** A Windows path's drive letter in capitals (`c:\app` → `C:\app`); any other path as it is. */
function winDrive(p, platform = process.platform) {
  return platform === 'win32' && /^[a-z]:/.test(p) ? p[0].toUpperCase() + p.slice(1) : p
}

/**
 * Where the walk of a slug starts, and what is left of the slug there. On Windows a slug opens with its drive: Claude
 * names `C:\Users\me\app` `C--Users-me-app`, and a `-` comes before it when the folder name is taken as a slug
 * (`-c-Users-me-app`); elsewhere every slug walks from `/`.
 */
export function slugRoot(slug, platform = process.platform) {
  const m = platform === 'win32' ? /^-?([A-Za-z])-+(?=[^-])/.exec(slug) : null
  return m ? { dir: `${m[1].toUpperCase()}:\\`, rest: `-${slug.slice(m[0].length)}` } : { dir: '/', rest: slug }
}

/** Decode a project slug against the filesystem (DFS from `/`, or from its drive on Windows; longest matching dir name first). */
function pathFromSlug(ctx, slug) {
  const dirs = new Map()
  const list = (d) => {
    if (!dirs.has(d)) dirs.set(d, foldersIn(ctx, d))
    return dirs.get(d)
  }
  let budget = 400
  // Windows names folders in any case: `c:\users\me` is `C:\Users\me`
  const fold = process.platform === 'win32' ? (s) => s.toLowerCase() : (s) => s
  function dfs(dir, rest, depth) {
    if (!rest) return dir
    if (depth > 12 || --budget < 0) return null
    const cands = list(dir).filter((n) => {
      const e = fold(`-${enc(n)}`)
      return fold(rest).startsWith(e) && (rest.length === e.length || rest[e.length] === '-')
    }).sort((a, b) => b.length - a.length)
    for (const n of cands) {
      const r = dfs(path.join(dir, n), rest.slice(n.length + 1), depth + 1)
      if (r) return r
    }
    return null
  }
  const { dir, rest } = slugRoot(slug)
  return dfs(dir, rest, 0)
}

/**
 * A linked worktree's `gitdir:` → its main checkout, or null. `<repo>/.git/worktrees/<name>` for a repo,
 * `<super>/.git/modules/<sub>/worktrees/<name>` for a submodule's (connected-office fork: those stood as projects of their own).
 */
export function mainOfGitdir(gd) {
  const m = /^(.+?)[\\/]\.git[\\/](?:modules[\\/](.+?)[\\/])?worktrees[\\/][^\\/]+[\\/]?$/.exec(gd ?? '')
  if (!m) return null
  return m[2] ? path.join(m[1], ...m[2].split(/[\\/]modules[\\/]/)) : m[1]
}

/**
 * cwd → { path, name, worktree, git } rollup (same rules as novibenolife's util.mjs):
 *  1. `<repo>/.claude/worktrees/<name>` → repo + worktree (35 such cwds no longer exist, so regex first);
 *  2. scratchpads `/(private/)tmp/claude-<uid>/<enc>/<uuid>/…` → the project whose enc() is `<enc>`;
 *  3. else the git toplevel found by walking up for `.git` (a `.git` FILE is a worktree → its main repo),
 *     starting from the nearest existing ancestor when the dir was deleted;
 *  4. else a throwaway folder's family (tempFamily, `temp: true`: its sessions are a script's workers); else the cwd itself.
 */
function makeResolver(ctx) {
  const memo = new Map()
  const tops = new Map()
  // the families of throwaway folders seen so far (tempFamily), kept from run to run
  const families = (ctx.cache.families ??= {})
  const home = os.homedir()
  let known = null
  let knownGen = -1

  // A `.git` file (a linked worktree's, naming its main repo) is read once and remembered by its mtime; one that stalled
  // stands as a repo of its own, and is tried again after a while
  function linkedRepo(dir, st) {
    const known = ctx.cache.links[dir]
    if (known?.m === st.mtimeMs && (known.p || ctx.nowMs - known.at < STALL_RETRY_MS)) return { path: known.p ?? dir, worktree: known.w ?? null }
    const txt = projectFile(ctx, path.join(dir, '.git'))
    if (txt == null && !ctx.stalled) return { path: dir, worktree: null }
    const m = /gitdir:\s*(.+)/.exec(txt ?? '')
    const gd = m ? path.resolve(dir, m[1].trim()) : ''
    const main = mainOfGitdir(gd)
    ctx.cache.links[dir] = txt == null ? { m: st.mtimeMs, at: ctx.nowMs } : { m: st.mtimeMs, at: ctx.nowMs, p: main ?? dir, w: main ? path.basename(dir) : null }
    ctx.dirty = true
    return main ? { path: main, worktree: path.basename(dir) } : { path: dir, worktree: null }
  }

  function gitTop(dir) {
    if (!path.isAbsolute(dir)) return null   // a relative path would be resolved against the CLI's own cwd
    // a worktree removed since it was seen stays with its repo, not with the folder that held it
    const gone = ctx.cache.links[dir]
    if (gone?.w && !statSafe(dir)) return { path: gone.p, worktree: gone.w }
    let d = dir
    // a root that is not there (a Windows drive or share gone: `E:\` is its own dirname) ends the walk
    while (d && d !== '/' && !statSafe(d)) {
      const up = path.dirname(d)
      if (up === d) return null
      d = up
    }
    const chain = []
    let found = null
    for (let cur = d; cur && cur !== '/' && cur !== home; cur = path.dirname(cur)) {
      if (tops.has(cur)) { found = tops.get(cur); break }
      chain.push(cur)
      let st = null
      try { st = fs.statSync(path.join(cur, '.git')) } catch {}
      if (st?.isDirectory()) { found = { path: cur, worktree: null }; break }
      if (st?.isFile()) { found = linkedRepo(cur, st); break }
      if (path.dirname(cur) === cur) break
    }
    for (const c of chain) tops.set(c, found)
    return found
  }

  // rebuilt whenever the collector learnt new project paths (ctx.knownGen bumps after sync / live)
  function knownPaths() {
    if (known && knownGen === ctx.knownGen) return known
    knownGen = ctx.knownGen
    known = new Map()
    const add = (p) => { if (p && path.isAbsolute(p) && !SCRATCH_RE.test(p)) known.set(enc(p), p) }
    for (const e of Object.values(ctx.cache.files)) if (e.kind === 'main') add(topCwd(e))
    for (const p of ctx.extraKnown ?? []) add(p)
    for (const r of memo.values()) if (r.git) add(r.path)
    return known
  }

  function slugOwner(slug) {
    const k = knownPaths().get(slug)
    if (k) return k
    if (slug in ctx.cache.slugs) return ctx.cache.slugs[slug]
    const owner = pathFromSlug(ctx, slug)
    // a walk that stalled proves nothing: asked again next run, unlike a slug that matches no folder
    if (owner || !ctx.stalled) {
      ctx.cache.slugs[slug] = owner
      ctx.dirty = true
    }
    return owner
  }

  // a project dir slug (`-Users-me-git-app`): the project whose enc() it is, else a weak name from its last segment
  function fromSlug(slug) {
    const owner = slugOwner(slug)
    if (owner && path.isAbsolute(owner) && !SCRATCH_RE.test(owner)) return { ...resolve(owner), worktree: null }
    return { path: slug, name: slug.split('-').filter(Boolean).pop() ?? slug, worktree: null, git: false, weak: true, gen: ctx.knownGen }
  }

  function resolve(cwd) {
    // one project whatever case its drive letter was typed in (`c:\app` from one shell, `C:\app` from another)
    const c = winDrive(String(cwd ?? '').replace(/[\\/]+$/, ''))
    const m = memo.get(c)
    if (m && (!m.weak || m.gen === ctx.knownGen) && !(m.kin && families[m.kin])) return m
    let r
    let wt = WORKTREE_RE.exec(c)
    if (wt && wt[1] === home) wt = null   // ~/.claude/worktrees/<x> is not a worktree of the home folder
    const sc = !wt && SCRATCH_RE.exec(c)
    if (!c) r = { path: '(unknown)', worktree: null, git: false }
    else if (wt) r = { path: wt[1], worktree: wt[2], git: !!statSafe(path.join(wt[1], '.git')) }
    else if (sc) r = fromSlug(sc[1])
    else if (!path.isAbsolute(c)) {
      // never stat a relative path: it would resolve against whatever folder the CLI was started in
      r = /^-[^\\/]+$/.test(c) ? fromSlug(c) : { path: c, name: path.basename(c) || c, worktree: null, git: false }
    } else {
      const top = gitTop(c)
      const fam = top ? null : tempFamily(c)
      if (fam?.sure && !families[fam.path]) {
        families[fam.path] = 1
        ctx.dirty = true
      }
      if (top) r = { path: top.path, worktree: top.worktree, git: true }
      else if (fam && families[fam.path]) r = { path: fam.path, name: fam.name, worktree: null, git: false, temp: true }
      // `kin`: the family it would be of, asked again once that family is known
      else r = { path: c, worktree: null, git: false, ...(fam ? { kin: fam.path } : {}) }
    }
    r.name ??= path.basename(r.path) || r.path
    memo.set(c, r)
    return r
  }

  return {
    resolve,
    /** The path a Claude-style folder name (`-Users-me-git-app`) stands for, or null. */
    slugPath: (slug) => {
      const owner = slugOwner(slug)
      return owner && path.isAbsolute(owner) && !SCRATCH_RE.test(owner) ? owner : null
    },
    /** Every project path the collector knows of (Claude's transcripts, live desks, git checkouts). */
    knownPaths: () => knownPaths().values(),
  }
}

// ---------------------------------------------------------------- live floor

function pidAlive(pid) {
  if (!(pid > 0)) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM'
  }
}

/**
 * Parse a transcript tail: pending tools, last delegation, titles, model, whether the turn ended and how (`end`: done,
 * stopped by the user, or an API error, with its words in `error`), and what will start the next turn by itself: a
 * background shell of this turn that has not reported back (`bg`), a scheduled wakeup (`wakeAt`).
 */
function parseTail(text) {
  const info = {
    envelopes: 0, pending: null, lastDelegate: null, lastTs: null, model: null, branch: null, ct: null, at: null,
    cwd: null, entrypoint: null, ended: false, last: 'none', end: null, error: null, bg: new Set(), wakeAt: null,
    notified: new Set(), resolved: new Set(), wfNames: new Map(),
  }
  const pending = new Map()
  const notify = (s) => { for (const m of s.matchAll(/<task-id>([^<]{1,80})<\/task-id>/g)) info.notified.add(m[1].trim()) }
  let last = 'none'
  let end = null
  for (const line of text.split('\n')) {
    if (line.charCodeAt(0) !== 123) continue
    if (line.startsWith('{"type":"bridge-session"')) continue
    let o
    try { o = JSON.parse(line) } catch { continue }
    if (!o || typeof o !== 'object') continue
    if (o.type === 'custom-title') { if (o.customTitle) info.ct = String(o.customTitle); continue }
    if (o.type === 'ai-title') { if (o.aiTitle) info.at = String(o.aiTitle); continue }
    // a finished background job queues its notification before the turn it starts (if it ever starts one)
    if (o.type === 'queue-operation') { if (typeof o.content === 'string') notify(o.content); continue }
    const ts = typeof o.timestamp === 'string' ? Date.parse(o.timestamp) : Number.NaN
    if (o.type === 'system') {
      if (o.subtype === 'stop_hook_summary') {
        last = 'stop'
        end ??= 'done'
        pending.clear()
        if (ts > (info.lastTs ?? 0)) info.lastTs = ts
      }
      continue
    }
    if (o.type !== 'user' && o.type !== 'assistant') continue
    info.envelopes++
    if (ts > (info.lastTs ?? 0)) info.lastTs = ts
    if (typeof o.cwd === 'string' && o.cwd) info.cwd = o.cwd
    if (typeof o.gitBranch === 'string' && o.gitBranch) info.branch = o.gitBranch
    if (typeof o.entrypoint === 'string') info.entrypoint = o.entrypoint
    const msg = o.message
    const content = msg?.content
    if (o.type === 'assistant') {
      if (typeof msg?.model === 'string' && msg.model !== '<synthetic>') info.model = msg.model
      if (!Array.isArray(content)) continue
      for (const c of content) {
        if (c?.type === 'tool_use') {
          const t = { id: c.id, name: String(c.name ?? ''), input: c.input, ts, label: labelOf(c.name, c.input) }
          pending.set(c.id, t)
          if (kindOf(t.name) === 'delegating') info.lastDelegate = t
          if (t.name === 'ScheduleWakeup') {
            const s = Number(c.input?.delaySeconds)
            info.wakeAt = c.input?.stop || !Number.isFinite(s) || !Number.isFinite(ts) ? null : ts + s * 1e3
          }
          last = 'tool_use'
          end = null
        } else if (c?.type === 'text') {
          last = msg.stop_reason === 'end_turn' || msg.stop_reason === 'stop_sequence' ? 'end' : 'text'
          end = o.isApiErrorMessage ? 'error' : last === 'end' ? 'done' : null
          if (o.isApiErrorMessage) info.error = clip(redact(String(c.text ?? '')), 40)
        } else if (c?.type === 'thinking' || c?.type === 'redacted_thinking') {
          last = 'thinking'
          end = null
        }
      }
      continue
    }
    if (Array.isArray(content) && content.some((c) => c?.type === 'tool_result')) {
      for (const c of content) {
        if (c?.type !== 'tool_result') continue
        const t = pending.get(c.tool_use_id)
        pending.delete(c.tool_use_id)
        info.resolved.add(c.tool_use_id)
        const r = o.toolUseResult
        if (r && typeof r === 'object' && typeof r.workflowName === 'string') {
          if (t) t.label = clip(redact(r.workflowName), 40)
          if (typeof r.runId === 'string') info.wfNames.set(r.runId, r.workflowName)
        }
        if (r && typeof r === 'object' && typeof r.backgroundTaskId === 'string') info.bg.add(r.backgroundTaskId)
      }
      last = 'tool_result'
      end = null
      continue
    }
    const text = contentText(content)
    if (o.origin?.kind === 'task-notification' || text.startsWith('<task-notification>')) {
      notify(text)
      continue
    }
    if (text.startsWith('[Request interrupted by user')) {
      end = 'stopped'
      continue
    }
    if (isHumanPrompt(o)) {
      last = 'human'
      end = null
      info.bg.clear()
      info.error = null
    }
  }
  info.pending = [...pending.values()].pop() ?? null
  info.last = last
  info.ended = last === 'stop' || last === 'end'
  info.end = end
  return info
}

/** Tail of a transcript; widens 64 KB → 512 KB → 4 MB when the tail is one giant line. */
function scanTail(abs, size) {
  let info = parseTail('')
  for (const bytes of [65_536, 524_288, 4_194_304]) {
    const t = readTail(abs, size, bytes)
    info = parseTail(t.text)
    if (info.envelopes > 0 || !t.truncated) break
  }
  return info
}

function liveInterns(ctx, sAbs, tail) {
  const dir = path.join(sAbs, 'subagents')
  const out = []
  for (const ent of readdirSafe(dir)) {
    if (!ent.isFile() || !ent.name.startsWith('agent-') || !ent.name.endsWith('.jsonl')) continue
    const st = statSafe(path.join(dir, ent.name))
    if (!st || ctx.nowMs - st.mtimeMs > INTERN_FRESH_MS) continue
    const id = ent.name.slice(6, -6)
    if (tail.notified.has(id)) continue
    const meta = readJson(path.join(dir, `agent-${id}.meta.json`)) ?? {}
    if (meta.agentType === 'workflow-subagent') continue
    // a foreground agent is done once its Agent tool_use got its tool_result
    if (meta.toolUseId && meta.requestShape === 'foreground' && tail.resolved.has(meta.toolUseId)) continue
    const born = Math.min(st.birthtimeMs || st.mtimeMs, st.mtimeMs)
    out.push({
      id: id.slice(0, 8),
      type: clip(meta.agentType || 'general-purpose', 40),
      description: clip(redact(meta.description ?? ''), 40),
      started_at: iso(born),
      last_seen: iso(st.mtimeMs),
    })
  }
  return out.sort((a, b) => a.started_at.localeCompare(b.started_at))
}

function liveMeetings(ctx, sAbs, tail) {
  const root = path.join(sAbs, 'subagents', 'workflows')
  const out = []
  let scripts = null
  for (const ent of readdirSafe(root)) {
    if (!ent.isDirectory() || !ent.name.startsWith('wf_')) continue
    const runId = ent.name
    // the run's json is written only when the workflow ends: no json yet = still in the meeting room
    if (statSafe(path.join(sAbs, 'workflows', `${runId}.json`))) continue
    const rdir = path.join(root, runId)
    const jst = statSafe(path.join(rdir, 'journal.jsonl'))
    if (!jst) continue
    let fresh = ctx.nowMs - jst.mtimeMs <= MEETING_FRESH_MS
    if (!fresh) {
      for (const f of readdirSafe(rdir)) {
        if (!f.isFile() || !f.name.startsWith('agent-') || !f.name.endsWith('.jsonl')) continue
        const s = statSafe(path.join(rdir, f.name))
        if (s && ctx.nowMs - s.mtimeMs <= MEETING_FRESH_MS) { fresh = true; break }
      }
    }
    if (!fresh) continue
    const started = new Map()
    const done = new Set()
    const failed = new Set()
    let phase = null
    let text = ''
    try { text = fs.readFileSync(path.join(rdir, 'journal.jsonl'), 'utf8') } catch {}
    for (const line of text.split('\n')) {
      if (!line) continue
      let o
      try { o = JSON.parse(line) } catch { continue }
      if (!o?.agentId) continue
      if (o.type === 'started') {
        started.set(o.agentId, { label: o.label, phase: o.phase })
        if (o.phase) phase = o.phase
      } else if (o.type === 'result') done.add(o.agentId)
      else if (o.type === 'failed') failed.add(o.agentId)
    }
    const running = [...started.entries()].filter(([id]) => !done.has(id) && !failed.has(id))
    scripts ??= readdirSafe(path.join(sAbs, 'workflows', 'scripts')).map((x) => x.name)
    const script = scripts.find((n) => n.endsWith(`-${runId}.js`))
    const name = script ? script.slice(0, -(runId.length + 4)) : (tail.wfNames.get(runId) ?? runId)
    out.push({
      id: runId,
      name: clip(redact(name), 40),
      phase: phase ? clip(phase, 40) : null,
      agents_running: running.length,
      agents_done: [...started.keys()].filter((id) => done.has(id)).length,
      agents_failed: [...started.keys()].filter((id) => failed.has(id) && !done.has(id)).length,
      agents_total: started.size,
      started_at: iso(Math.min(jst.birthtimeMs || jst.mtimeMs, jst.mtimeMs)),
      labels: running.slice(0, 6).map(([, v]) => clip(redact(v.label ?? ''), 32)),
    })
  }
  return out.sort((a, b) => a.started_at.localeCompare(b.started_at))
}

function sessionTitle(rec, tail, sAbs, projName) {
  // a `derived` session name is a slug like "acme-shop-88": prefer the real titles over it
  const named = rec.name && rec.nameSource !== 'derived' ? rec.name : null
  const t = named || tail.ct || tail.at || readJson(path.join(sAbs, 'custom-title.json'))?.customTitle || rec.name || projName
  return clip(redact(t), 60)
}

/**
 * Live desks of one Claude home (an account's config folder): one per `sessions/<pid>.json` whose pid is alive (EPERM
 * counts as alive). `updatedAt` is not a heartbeat (gotcha 2), so `last_seen` is the transcript mtime; state comes from
 * the transcript tail. The desktop app keeps every session it opened running, so a desk whose turn has been done for
 * DONE_MS goes home all the same: its coat is in `left` for LEFT_MS, and `open` names every session alive, at a desk or
 * not. A stop, an error, a break or a hand up stays at its desk.
 */
function collectLive(ctx, home) {
  const sessDir = path.join(home.dir, 'sessions')
  const bySid = new Map()
  for (const ent of readdirSafe(sessDir)) {
    if (!/^\d+\.json$/.test(ent.name)) continue   // never touch <pid>.<hash>.key files
    const r = readJson(path.join(sessDir, ent.name))
    const pid = Number(r?.pid)
    if (!r || typeof r.sessionId !== 'string' || !Number.isInteger(pid)) continue
    if (!ctx.skipPid && !pidAlive(pid)) continue
    const prev = bySid.get(r.sessionId)
    if (!prev || (r.updatedAt ?? 0) > (prev.updatedAt ?? 0)) bySid.set(r.sessionId, { ...r, pid })
  }
  const desks = []
  const left = []
  for (const r of bySid.values()) {
    try {
      const d = buildDesk(ctx, home, r)
      const since = Date.parse(d.activity.since)
      const done = d.idle_reason === 'done' ? ctx.nowMs - since : NaN
      if (!(done >= DONE_MS)) desks.push(d)
      else if (done < DONE_MS + LEFT_MS) left.push({ title: d.title, project: d.project, left_at: d.activity.since, agent: 'claude', _ms: since })
    } catch (err) { ctx.log(`live desk ${r.pid}: ${err?.message}`) }
  }
  desks.sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? '') || a.pid - b.pid)
  return { desks, left, open: [...bySid.keys()] }
}

function findTranscript(home, cwd, sid) {
  const first = path.join(home.projectsDir, enc(cwd), `${sid}.jsonl`)
  const st = cwd ? statSafe(first) : null
  if (st) return { abs: first, st, pd: enc(cwd) }
  for (const d of readdirSafe(home.projectsDir)) {
    if (!d.isDirectory()) continue
    const p = path.join(home.projectsDir, d.name, `${sid}.jsonl`)
    const s = statSafe(p)
    if (s) return { abs: p, st: s, pd: d.name }
  }
  return null
}

function buildDesk(ctx, home, r) {
  const sid = r.sessionId
  const cwd = typeof r.cwd === 'string' ? r.cwd : ''
  const tr = findTranscript(home, cwd, sid)
  const tail = tr ? scanTail(tr.abs, tr.st.size) : parseTail('')
  const sAbs = path.join(home.projectsDir, tr?.pd ?? enc(cwd), sid)
  const interns = liveInterns(ctx, sAbs, tail)
  const meetings = liveMeetings(ctx, sAbs, tail)
  // connected-office patch: a live desk sits in the repo the session works in now (last cwd), not where it started
  const proj = ctx.resolver.resolve(tail.cwd || cwd || '')
  const status = ['busy', 'idle', 'waiting', 'shell'].includes(r.status) ? r.status : 'idle'
  const p = tail.pending
  // helpers still at work wake their boss when they are done, whether or not the turn is over
  const helpers = interns.length > 0 || meetings.length > 0
  let state = 'working'
  if (status === 'idle') state = helpers ? 'waiting_on_agents' : 'idle'
  else if (status === 'waiting' || p?.name === 'AskUserQuestion') state = 'asking'
  else if (tail.ended && helpers) state = 'waiting_on_agents'
  const lastTs = tail.lastTs ?? tr?.st.mtimeMs ?? ctx.nowMs
  let activity
  let idleReason = null
  if (state === 'idle') {
    // on a break only when something will start the next turn by itself; otherwise how the last turn ended
    const resumes = tail.wakeAt > ctx.nowMs || [...tail.bg].some((id) => !tail.notified.has(id))
    idleReason = resumes ? 'break' : tail.end ?? 'done'
    activity = { kind: 'idle', tool: null, label: idleReason === 'error' ? tail.error : null, since: iso(lastTs) }
  }
  else if (state === 'asking') {
    // status `waiting` can also be a permission prompt on any tool: name the tool that is actually pending
    const label = p?.name === 'AskUserQuestion' ? p.label || 'question' : p?.label || clip(redact(r.waitingFor ?? ''), 40) || 'question'
    activity = { kind: 'talking', tool: p?.name || null, label, since: iso(p?.ts ?? lastTs) }
  }
  else if (state === 'waiting_on_agents') {
    const d = tail.lastDelegate
    activity = { kind: 'delegating', tool: d?.name ?? null, label: d?.label ?? meetings[0]?.name ?? interns[0]?.description ?? null, since: iso(d?.ts ?? lastTs) }
  } else if (p) activity = { kind: kindOf(p.name, p.input), tool: p.name, label: p.label || null, since: iso(p.ts ?? lastTs) }
  else activity = { kind: 'thinking', tool: null, label: null, since: iso(lastTs) }
  return {
    id: sid.slice(0, 8),
    pid: r.pid,
    agent: 'claude',
    account: home.label,
    title: sessionTitle(r, tail, sAbs, proj.name),
    project: clip(proj.name, 60),
    project_path: safeText(proj.path),
    worktree: proj.worktree ? clip(proj.worktree, 40) : null,
    branch: tail.branch ? clip(redact(tail.branch), 60) : null,
    status,
    state,
    idle_reason: idleReason,
    activity,
    model: tail.model ? clip(tail.model, 40) : null,
    started_at: iso(Number(r.startedAt) || tr?.st.birthtimeMs || lastTs),
    last_seen: iso(tr?.st.mtimeMs ?? (Number(r.updatedAt) || lastTs)),
    entrypoint: r.entrypoint ?? tail.entrypoint ?? null,
    interns,
    meetings,
    ...(proj.temp ? { worker: true } : {}),
    _sid: sid,
  }
}

function recentlyLeft(ctx, mains, liveSids) {
  const out = []
  for (const m of mains) {
    if (liveSids.has(m.sid) || ctx.nowMs - m.st.mtimeMs > LEFT_MS || m.st.mtimeMs - ctx.nowMs > LEFT_MS) continue
    const e = ctx.cache.files[m.key]
    let title = e?.ct || e?.at || null
    let cwd = topCwd(e)
    if (!title || !cwd) {
      const t = scanTail(m.abs, m.st.size)
      title ||= t.ct || t.at
      cwd ||= t.cwd
    }
    const proj = ctx.resolver.resolve(cwd ?? '')
    out.push({ title: clip(redact(title || proj.name), 60), project: clip(proj.name, 60), left_at: iso(m.st.mtimeMs), agent: 'claude', _ms: m.st.mtimeMs })
  }
  return out
}

// ---------------------------------------------------------------- history walk

/**
 * Walk `projects/` for transcripts touched since the range start. Main transcripts are stat'ed (cheap).
 * A session's `subagents/` and `workflows/` are listed when its main transcript is in range, when it is a
 * live desk, or when its `subagents/` (or `subagents/workflows/`) dir changed since a day before the range
 * start: a parent waiting on a background run past midnight writes nothing until the run ends. A workflow
 * run dir is only listed when its mtime is recent. (Dir mtimes move when files are created, not appended.)
 */
function walkHistory(ctx, home) {
  const mains = []
  const files = []
  const wfs = []
  const runs = []
  const indexes = []
  // a plain join: thousands of these a run, of names that need no normalizing
  const join = (dir, name) => `${dir}${path.sep}${name}`
  const abs = (rel) => join(home.projectsDir, rel)
  const key = (rel) => home.prefix + rel
  const pushSub = (dirRel, name, sid, pd, runId) => {
    const rel = join(dirRel, name)
    ctx.seen.add(key(rel))
    const st = statSafe(abs(rel))
    if (!st || st.mtimeMs < ctx.fromMs) return
    files.push({ rel, key: key(rel), home, abs: abs(rel), st, kind: 'sub', sid, pd, runId, agent: name.slice(6, -6), dirAbs: abs(dirRel) })
  }
  const since = ctx.fromMs - 864e5
  const recentSubDirs = (subRel) => {
    const st = statSafe(abs(subRel))
    if (!st) return false
    if (st.mtimeMs >= since) return true
    return (statSafe(abs(join(subRel, 'workflows')))?.mtimeMs ?? 0) >= since
  }
  // what went is told only by a listing that answered (judgeGone): `projects` has a home's folders when its projects were
  // listed, `listed` a folder when it was
  const pds = listDir(home.projectsDir)
  if (pds) ctx.projects.set(home.prefix, new Set(pds.filter((x) => x.isDirectory()).map((x) => x.name)))
  for (const pdEnt of pds ?? []) {
    if (!pdEnt.isDirectory()) continue
    const pd = pdEnt.name
    const ents = listDir(abs(pd))
    if (!ents) continue
    ctx.listed.add(key(pd))
    const sessDirs = new Set(ents.filter((x) => x.isDirectory()).map((x) => x.name))
    for (const ent of ents) {
      if (ent.name === INDEX_FILE && ent.isFile()) indexes.push({ home, pd, abs: abs(join(pd, ent.name)) })
      if (ent.name.endsWith(RELEASED) && ent.isFile()) ctx.released.add(key(join(pd, `${ent.name.slice(0, -RELEASED.length)}.jsonl`)))
      if (!ent.isFile() || !ent.name.endsWith('.jsonl')) continue
      const rel = join(pd, ent.name)
      ctx.seen.add(key(rel))
      const st = statSafe(abs(rel))
      if (!st) continue
      const sid = ent.name.slice(0, -6)
      mains.push({ rel, key: key(rel), home, abs: abs(rel), st, sid, pd })
      const sRel = join(pd, sid)
      const subRel = join(sRel, 'subagents')
      // a page of the past reads nothing of a session begun after its last day: not a line, subagent or run of it is in it
      // (nor a day: one cut in another zone, as the cold tier keeps them, may fall on the page all the same)
      const e = ctx.cache.files[key(rel)]
      if (ctx.range.back && begunAt(e, st) >= ctx.toMs && Object.keys(e.days).every((d) => d > ctx.range.days.at(-1))) continue
      if (st.mtimeMs >= ctx.fromMs) files.push({ rel, key: key(rel), home, abs: abs(rel), st, kind: 'main', sid, pd })
      if (!sessDirs.has(sid)) continue
      if (st.mtimeMs < ctx.fromMs && !ctx.liveSids?.has(sid) && !recentSubDirs(subRel)) continue
      const subEnts = readdirSafe(abs(subRel))
      if (subEnts.length) ctx.listed.add(key(subRel))
      const runsHere = new Set()
      for (const se of subEnts) {
        if (se.isFile() && se.name.startsWith('agent-') && se.name.endsWith('.jsonl')) pushSub(subRel, se.name, sid, pd, null)
        else if (se.isDirectory() && se.name === 'workflows') {
          const wRel = join(subRel, 'workflows')
          for (const run of readdirSafe(abs(wRel))) {
            if (!run.isDirectory() || !run.name.startsWith('wf_')) continue
            const rRel = join(wRel, run.name)
            const rst = statSafe(abs(rRel))
            if (!rst || rst.mtimeMs < ctx.fromMs - 864e5) continue
            ctx.listed.add(key(rRel))
            runsHere.add(run.name)
            runs.push({ runId: run.name, sid, pd, home, start: Math.min(rst.birthtimeMs || rst.mtimeMs, rst.mtimeMs), last: rst.mtimeMs })
            for (const f of readdirSafe(abs(rRel))) {
              if (f.isFile() && f.name.startsWith('agent-') && f.name.endsWith('.jsonl')) pushSub(rRel, f.name, sid, pd, run.name)
            }
          }
        }
      }
      const wfRel = join(sRel, 'workflows')
      const wfEnts = readdirSafe(abs(wfRel))
      if (wfEnts.length) ctx.listed.add(key(wfRel))
      for (const we of wfEnts) {
        if (!we.isFile() || !we.name.startsWith('wf_') || !we.name.endsWith('.json')) continue
        const wrel = join(wfRel, we.name)
        ctx.seen.add(key(wrel))
        const wst = statSafe(abs(wrel))
        const runId = we.name.slice(0, -5)
        // a run dir we counted above takes its start from the json when there is one (dir birthtimes are not everywhere)
        if (wst && (wst.mtimeMs >= ctx.fromMs || runsHere.has(runId))) wfs.push({ rel: wrel, key: key(wrel), home, abs: abs(wrel), st: wst, sid, pd, runId })
      }
    }
  }
  return { mains, files, wfs, runs, indexes }
}

/** The session index older Claude Code versions kept in each project folder (no version since early 2026 writes it). */
const INDEX_FILE = 'sessions-index.json'

/**
 * The sessions a page of the past finds only in Claude Code's old session index (walkHistory `indexes`): their
 * transcripts are gone, deleted by its cleanup before the cache knew them, yet the index says when each began and was
 * last written, and in which folder. One with a transcript known (`known`: the sids of Claude's sessions on disk or in
 * the cache) counts from it instead. Each counts on the days of its two ends that are in the page, with no agent-time:
 * the index never had any. Its first prompt and summary are the person's words, and are never read.
 */
function indexedSessions(ctx, indexes, known) {
  const out = []
  const days = new Set(ctx.range.days)
  for (const ix of indexes) {
    const entries = readJson(ix.abs)?.entries
    if (!Array.isArray(entries)) continue
    for (const x of entries) {
      const sid = typeof x?.sessionId === 'string' ? x.sessionId : null
      const start = Date.parse(x?.created)
      const end = Date.parse(x?.modified)
      if (!sid || known.has(sid) || x.isSidechain === true || !(end >= start) || end < ctx.fromMs || start >= ctx.toMs) continue
      const on = [...new Set([localDay(start), localDay(end)])].filter((d) => days.has(d))
      if (!on.length) continue
      known.add(sid)
      const cwd = typeof x.projectPath === 'string' && path.isAbsolute(x.projectPath) ? x.projectPath : ctx.resolver.slugPath(ix.pd)
      out.push({ sid, home: ix.home, r: ctx.resolver.resolve(cwd ?? ''), days: on, ts: end })
    }
  }
  return out
}

/**
 * When a session began: its earliest line, once the cache has read the whole file (a copy of an older session's lines
 * begins when they do). NaN before that, which never skips anything: for a file replaced or cut since, or one whose head
 * was never read (`partial`: its earliest line read is not its first); and a file's birth is no clock for its lines,
 * since a copy or a restore keeps their times and is born that day, while its mtime is the session's end.
 */
function begunAt(e, st) {
  return Number.isFinite(e?.fts) && e.partial == null && e.ino === st.ino && st.size >= e.off ? e.fts : NaN
}

const B_ENTRYPOINT = Buffer.from('"entrypoint":"')

/**
 * Where a session ran, from its transcript's first `entrypoint` (1 the desktop app, 0 anything else, -1 none in its first
 * 4 MB; null when it could not be read): an entry cached before the collector kept it (onEnvelope) learns it once, while
 * the transcript is there. The first lines may be queued prompts a megabyte long.
 */
function entrypointOf(file, size) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    for (const want of [65_536, 1 << 20, 4 << 20]) {
      const buf = Buffer.allocUnsafe(Math.min(want, size))
      const view = buf.subarray(0, fs.readSync(fd, buf, 0, buf.length, 0))
      const i = view.indexOf(B_ENTRYPOINT)
      const q = i === -1 ? -1 : view.indexOf(34, i + B_ENTRYPOINT.length)
      if (q !== -1) return DESKTOP_ENTRYPOINTS.has(view.toString('latin1', i + B_ENTRYPOINT.length, q)) ? 1 : 0
      if (view.length >= size) break
    }
    return -1
  } catch {
    return null
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd) } catch {}
  }
}

/**
 * How long Claude Code keeps a home's transcripts after their last write, in ms. `cli`: its `cleanupPeriodDays`, the
 * managed settings' (`managed`), which none of the person's override, else the home's settings.json's, else
 * CLEANUP_DAYS. `desktop`, the desktop app's sessions': at any age (Infinity), unless `desktopSessionCleanupPeriodDays`
 * (the managed settings', else the home's; 0 is no limit) says a number of days, or the managed settings say a
 * cleanupPeriodDays: then once older than both. Null when one of them is there but does not read, or says a number of
 * days that is not one (Claude Code then holds its cleanup): nothing is decided on a guess.
 */
function retentionOf(home, managed) {
  const said = []
  for (const file of [managed, path.join(home.dir, 'settings.json')]) {
    let o = {}
    if (file && statSafe(file)) {
      try { o = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return null }
      if (!o || typeof o !== 'object' || Array.isArray(o)) return null
    }
    const { cleanupPeriodDays: days, desktopSessionCleanupPeriodDays: desktop } = o
    if (days !== undefined && !(Number.isInteger(days) && days >= 1)) return null
    if (desktop !== undefined && !(Number.isInteger(desktop) && desktop >= 0)) return null
    said.push({ days, desktop })
  }
  const [theirs, mine] = said
  const days = theirs.days ?? mine.days ?? CLEANUP_DAYS
  const desktop = theirs.desktop ?? mine.desktop ?? 0
  return { cli: days * 864e5, desktop: (theirs.days !== undefined || desktop > 0 ? Math.max(days, desktop) : Infinity) * 864e5 }
}

/** The home among Claude's `homes` a cache key is of: keys without a prefix are the one whose prefix is '' (none in a run of another folder). */
function homeOfKey(homes, k) {
  return (k.startsWith('@') ? homes.find((h) => h.prefix && k.startsWith(h.prefix)) : homes.find((h) => h.prefix === '')) ?? null
}

/**
 * What became of each of Claude's sessions whose transcript went, decided once: by the first run that sees it gone with
 * the cold tier loaded (the archive's entries, with the archive) and its home's facts at hand. A transcript is gone when
 * its project folder was listed without it, or a listing of its home's projects that answered has no such folder.
 * - Kept, stamped `kept` (when), if Claude Code's cleanup deleted it: last written longer ago than its home keeps the
 *   transcripts of where it ran (retentionOf: the CLI's, the SDK's or an IDE's, `dt` 0, or the desktop app's, `dt` 1,
 *   kept at any age unless settings say), with no release marker of the desktop app. Its subagents stay, and its
 *   workflow runs move into it (`runs`), their jsons gone with its folder.
 * - Dropped otherwise, with every entry of its folder: one the desktop app or a hand deleted, one gone before it aged,
 *   one whose source was never read.
 * A subagent or a run that went counts only while its session is kept: it goes with a session dropped, or with none
 * (once every tier is loaded: its session may be in the archive). Nothing is decided for a home whose settings do not
 * read or whose projects were not listed, nor for keys of another account or folder (homeOfKey). Marks the tiers whose
 * entries changed (`ctx.touched`): a decision the run does not save would be taken again.
 */
function judgeGone(ctx, homes, { archiveLoaded, managed }) {
  const touch = (e) => {
    const t = tierOf(e)
    if (t) ctx.touched[t] = true
    ctx.dirty = true
  }
  const keeps = new Map()
  for (const h of homes) {
    const keep = ctx.projects.has(h.prefix) ? retentionOf(h, managed) : null
    if (keep) keeps.set(h, keep)
  }
  if (!keeps.size) return
  const files = ctx.cache.files
  /** The home of a key judged this run, and the session it is of (sessionKey). */
  const placeOf = (k) => {
    const h = homeOfKey(homes, k)
    const s = h && keeps.has(h) ? sessionKey(k) : null
    return s ? { h, s } : null
  }
  // a session whose main transcript was not seen is gone when its project folder was listed without it, or is not in its
  // home's listing
  const isGone = ({ h, s }) => {
    const pd = s.slice(h.prefix.length, s.lastIndexOf(path.sep))
    return ctx.listed.has(h.prefix + pd) || !ctx.projects.get(h.prefix).has(pd)
  }
  const dropped = new Set()
  let stamped = 0
  for (const [k, e] of Object.entries(files)) {
    if (e.ag || e.kind !== 'main' || Number.isFinite(e.kept) || ctx.seen.has(k) || !k.endsWith('.jsonl')) continue
    const at = placeOf(k)
    if (!at || `${at.s}.jsonl` !== k || !isGone(at)) continue
    touch(e)
    // how long Claude Code keeps it, by where it ran: one of no known source, for ever
    const { cli, desktop } = keeps.get(at.h)
    if (!ctx.released.has(k) && e.mtime < ctx.nowMs - (e.dt === 0 ? cli : e.dt === 1 ? desktop : Infinity)) {
      e.kept = ctx.nowMs
      stamped++
    } else {
      delete files[k]
      dropped.add(at.s)
    }
  }
  // the subagents and runs of a session decided now are loaded but for the archive's; one whose session is not loaded
  // waits for a run with the archive: with nothing decided and no archive, there is nothing to do for any
  if (!stamped && !dropped.size && !archiveLoaded) return
  const kept = keptSessions(ctx.cache)
  /** What becomes of a subagent's or a run's entry whose session went: its session's fate ('drop' when it has none left). */
  const fateOf = (k) => {
    const s = ctx.seen.has(k) ? null : sessionKey(k)
    // most are of a session that is there: told first, by its main transcript
    if (!s || ctx.seen.has(`${s}.jsonl`)) return null
    const at = placeOf(k)
    if (!at) return null
    if (dropped.has(s)) return 'drop'
    if (kept.has(s)) return 'kept'
    return isGone(at) && (files[`${s}.jsonl`] || archiveLoaded) ? 'drop' : null
  }
  for (const k of Object.keys(files)) {
    const e = files[k]
    if (e.ag || e.kind !== 'sub' || fateOf(k) !== 'drop') continue
    touch(e)
    delete files[k]
  }
  for (const [k, w] of Object.entries(ctx.cache.wf)) {
    const fate = fateOf(k)
    if (!fate) continue
    if (fate === 'kept') {
      const main = files[`${sessionKey(k)}.jsonl`]
      main.runs = [...(main.runs ?? []), { id: path.basename(k, '.json'), start: w.start, end: w.mtime, name: w.name, agents: w.agents }]
      touch(main)
    }
    delete ctx.cache.wf[k]
    ctx.dirty = true
  }
}

/**
 * The kept sessions' entries (judgeGone) of this run's Claude `homes` (homeOfKey), to count as the files read: their main
 * transcripts and subagents with a day in the range (`days`), as `{ f, e }`, and the workflow runs the main transcripts
 * carry, as walkHistory's `runs`. None was seen: the walk lists no session folder without its main transcript.
 */
function keptFiles(ctx, homes, days) {
  const files = []
  const runs = []
  const kept = keptSessions(ctx.cache)
  if (!kept.size) return { files, runs }
  for (const [k, e] of Object.entries(ctx.cache.files)) {
    if (e.ag) continue
    const s = sessionKey(k)
    const home = s && kept.has(s) ? homeOfKey(homes, k) : null
    if (!home) continue
    const rel = k.slice(home.prefix.length)
    const pd = rel.slice(0, rel.indexOf(path.sep))
    if (e.kind === 'main') for (const r of e.runs ?? []) runs.push({ runId: r.id, sid: e.sid, pd, home, start: r.start, end: r.end, name: r.name, agents: r.agents })
    if (Object.keys(e.days).some((d) => days.has(d))) files.push({ f: { rel, key: k, home, pd, sid: e.sid, kind: e.kind }, e })
  }
  return { files, runs }
}

/** `dt` -1: no line has said where the session runs yet (onEnvelope); an entry cached before it was read has none (entrypointOf). */
function initEntry(f) {
  if (f.kind === 'main') return { kind: 'main', sid: f.sid, dt: -1, cwds: {}, models: {}, days: {} }
  let type = 'workflow-subagent'
  if (!f.runId) type = readJson(path.join(f.dirAbs, `agent-${f.agent}.meta.json`))?.agentType || 'general-purpose'
  return { kind: 'sub', sid: f.sid, agent: f.agent, type: clip(type, 40) || 'general-purpose', run: f.runId ?? undefined, cwds: {}, models: {}, days: {} }
}

/** Workflow run json (written once, at the end): only the four fields we need, cached by size+mtime. */
function workflowInfo(ctx, w) {
  const c = ctx.cache.wf[w.key]
  if (c && c.size === w.st.size && c.mtime === w.st.mtimeMs) return c
  const o = readJson(w.abs)
  const info = {
    size: w.st.size,
    mtime: w.st.mtimeMs,
    status: typeof o?.status === 'string' ? o.status : null,
    name: clip(redact(o?.workflowName ?? ''), 60),
    agents: Number(o?.agentCount) || 0,
    start: Number(o?.startTime) || Date.parse(o?.timestamp) || w.st.mtimeMs,
  }
  ctx.cache.wf[w.key] = info
  ctx.dirty = true
  return info
}

// ---------------------------------------------------------------- git

async function gitEmail(ctx, repo) {
  const key = `email|${repo}`
  const c = ctx.cache.git[key]
  if (c && Date.now() - c.at < 864e5) return c.email
  let email = ''
  let at = Date.now()
  try {
    const { stdout } = await execFileP('git', ['-C', repo, 'config', 'user.email'], { timeout: 4000, encoding: 'utf8' })
    email = stdout.trim()
  } catch (err) {
    // no email set is an answer for the day; no answer (a stalled folder) keeps the last one, and is asked again soon
    if (err?.killed) {
      email = c?.email ?? ''
      at += STALL_RETRY_MS - 864e5
    }
  }
  ctx.cache.git[key] = { at, email }
  ctx.dirty = true
  return email
}

/** `keep(ms)`: the author times wanted, checked before a subject is cleaned (a page of the past lists months for a few). */
function parseGitList(stdout, email, keep = null) {
  const out = []
  for (const rec of stdout.split('\x01')) {
    if (!rec.trim()) continue
    const [sha, short, ad, subject = '', ae = ''] = rec.replace(/\n+$/, '').split('\x1f')
    if (!/^[0-9a-f]{40}$/.test(sha)) continue
    if (ae && email && ae.trim().toLowerCase() !== email.toLowerCase()) continue
    if (/^(index on|untracked files on|WIP on) [^:]*: /.test(subject)) continue
    const ms = Date.parse(ad)
    if (!Number.isFinite(ms) || (keep && !keep(ms))) continue
    out.push({ sha, short: short || sha.slice(0, 7), ms, subject: clip(redact(subject), 72), add: 0, del: 0, stat: false })
  }
  return out
}

function parseNumstat(stdout) {
  const stats = new Map()
  for (const rec of stdout.split('\x01')) {
    const nl = rec.indexOf('\n')
    const sha = (nl === -1 ? rec : rec.slice(0, nl)).trim()
    if (!/^[0-9a-f]{40}$/.test(sha)) continue
    let add = 0
    let del = 0
    for (const l of rec.slice(nl + 1).split('\n')) {
      const m = /^(\d+|-)\t(\d+|-)\t/.exec(l)
      if (!m) continue
      if (m[1] !== '-') add += Number(m[1])
      if (m[2] !== '-') del += Number(m[2])
    }
    stats.set(sha, [add, del])
  }
  return stats
}

/**
 * What moves when a repo's branches or tags do, for a stat each and no process: packed-refs, and the folders refs live
 * in, since git writes a ref by a rename in its folder (`dirs`: those below refs/heads and refs/tags, as last listed).
 * Null when `.git` is no folder (a submodule): such a repo is left to the TTL. Stats only: a list here could stall.
 */
function refsStamp(repo, dirs) {
  const git = path.join(repo, '.git')
  if (!statSafe(git)?.isDirectory()) return null
  return ['packed-refs', path.join('reftable', 'tables.list'), path.join('refs', 'heads'), path.join('refs', 'tags'), ...dirs]
    .map((p) => statSafe(path.join(git, p))?.mtimeMs ?? '-').join(',')
}

/** The folders below a repo's refs/heads and refs/tags (`feature/x` lives in one of its own), relative to `.git`. */
function refFolders(repo) {
  const out = []
  const walk = (rel, depth) => {
    for (const ent of readdirSafe(path.join(repo, '.git', rel))) {
      if (!ent.isDirectory()) continue
      const sub = path.join(rel, ent.name)
      out.push(sub)
      if (depth < 3) walk(sub, depth + 1)
    }
  }
  walk(path.join('refs', 'heads'), 0)
  walk(path.join('refs', 'tags'), 0)
  return out
}

/**
 * Commits by the configured author in the range (`--branches --tags`: `--all` drags in stash/snapshot refs).
 * Two phases because one repo here takes 9 s for `--numstat` (huge generated files): the commit list is
 * cheap (50 ms for a month of 2,000 commits), and line stats are computed once per sha (big files count as
 * binary) and carried over between refreshes.
 * One commit store per repo serves every range: `wins` records when each window start was last listed, a
 * re-list replaces only the commits inside its own window and keeps older ones with their stats, so a week
 * refresh never throws away the month's line counts. Lists are fresh for 5 min (30 min for the live view,
 * which must stay under 100 ms); failures are cached too so a slow repo cannot stall every run. Past that a list is
 * made only if a ref moved since the last (refsStamp): no ref, no new commit, and a machine's quiet repos cost no process.
 */
async function gitLog(ctx, repo) {
  const key = `log|${repo}`
  const c = ctx.cache.git[key]
  const toDay = localDay(ctx.nowMs)
  const ttl = ctx.view === 'live' ? 30 * 60e3 : GIT_TTL
  const store = c?.commits ?? []
  const pick = (list) => list.filter((cm) => cm.ms >= ctx.fromMs && cm.ms <= ctx.nowMs)
  // window start (ms) → list time; a month list also answers week and today. (pre-store entries had one {from, at})
  const claimed = c?.wins ?? (c?.from != null ? { [c.from]: c.at } : {})
  // a store saved before `kept` dropped the commits of its windows further back than REPO_MS: those answer for nothing
  const listed = c?.kept ? claimed : Object.fromEntries(Object.entries(claimed).filter(([from]) => Number(from) >= ctx.nowMs - REPO_MS))
  const wins = c?.toDay !== toDay ? {} : listed
  if (Object.entries(wins).some(([from, at]) => Number(from) <= ctx.fromMs && Date.now() - at < ttl)) return pick(store)
  const refDirs = c?.refDirs ?? []
  const refs = refsStamp(repo, refDirs)
  const reaches = Object.keys(listed).filter((from) => Number(from) <= ctx.fromMs)
  if (refs != null && refs === c?.refs && reaches.length && !(Date.now() - c.failedAt >= GIT_RETRY_MS)) {
    for (const from of reaches) listed[from] = Date.now()
    c.wins = listed
    c.toDay = toDay
    ctx.dirty = true
    return pick(store)
  }
  const email = await gitEmail(ctx, repo)
  if (!email) return []
  const save = (commits, failedAt, seenRefs = { refs, refDirs }) => {
    const w = { [ctx.fromMs]: Date.now() }
    for (const [from, at] of Object.entries(wins)) if (Number(from) < ctx.fromMs) w[from] = at
    // the windows kept still answer for their commits (a page of the past listed today among them): those stay
    const keepFrom = Math.min(ctx.nowMs - REPO_MS, ...Object.keys(w).map(Number))
    const older = store.filter((cm) => cm.ms < ctx.fromMs && cm.ms >= keepFrom)
    ctx.cache.git[key] = { at: Date.now(), toDay, wins: w, kept: true, commits: [...older, ...commits], ...(failedAt ? { failedAt } : {}), ...seenRefs }
    ctx.dirty = true
  }
  let commits
  try {
    const { stdout } = await execFileP('git', ['-C', repo, 'log', '--branches', '--tags', '--no-merges', `--since=${iso(ctx.fromMs)}`,
      `--until=${iso(ctx.nowMs)}`, `--author=${email}`, '--date=iso-strict', '--pretty=format:%x01%H%x1f%h%x1f%ad%x1f%s%x1f%ae'],
    { timeout: 4000, maxBuffer: 16 << 20, encoding: 'utf8' })
    commits = parseGitList(stdout, email)
  } catch (err) {
    ctx.log(`git log ${repo}: ${err?.message?.split('\n')[0]}`)
    ctx.gitErrors++
    save(store.filter((cm) => cm.ms >= ctx.fromMs), Date.now())
    return pick(store)
  }
  const known = new Map(store.filter((cm) => cm.stat).map((cm) => [cm.sha, cm]))
  for (const cm of commits) {
    const k = known.get(cm.sha)
    if (k) Object.assign(cm, { add: k.add, del: k.del, stat: true })
  }
  // a numstat failure is not retried for 30 min: commits still count, their line stats stay 0
  const recentFail = c?.failedAt && Date.now() - c.failedAt < GIT_RETRY_MS ? c.failedAt : 0
  if (!recentFail) {
    const need = commits.filter((cm) => !cm.stat)
    const statsFrom = performance.now()
    // in the pane's runs a repo listed for the first time (a new machine's first run: 60 repos, seconds of it) shows its
    // commits at once and their line stats from a later run; a page of the past, read once, waits for them all
    const budget = ctx.range.back ? Infinity : c || !ctx.series ? NUMSTAT_BUDGET_MS : 0
    for (let i = 0; i < need.length; i += NUMSTAT_BATCH) {
      const batch = need.slice(i, i + NUMSTAT_BATCH)
      if (performance.now() - statsFrom >= budget) {
        // the rest by a run a minute from now (the failure's retry, sooner), so a run of the pane stays within its wait
        if (c) ctx.gitStatsPartial = true
        save(commits, Date.now() - GIT_RETRY_MS + 60e3)
        return pick(commits)
      }
      try {
        const { stdout } = await execFileP('git', ['-C', repo, '-c', 'core.bigFileThreshold=256k', 'show', '--no-renames', '--numstat',
          '--format=%x01%H', ...batch.map((cm) => cm.sha)], { timeout: 6000, maxBuffer: 32 << 20, encoding: 'utf8' })
        const stats = parseNumstat(stdout)
        for (const cm of batch) {
          const st = stats.get(cm.sha)
          if (st) Object.assign(cm, { add: st[0], del: st[1], stat: true })
        }
      } catch (err) {
        ctx.log(`git numstat ${repo}: ${err?.message?.split('\n')[0]}`)
        ctx.gitStatsPartial = true
        save(commits, Date.now())
        return pick(commits)
      }
    }
  }
  // the list worked, so the folder can be listed: refs/heads may have new folders since
  const dirs = refs == null ? [] : refFolders(repo)
  save(commits, recentFail, { refs: dirs.join() === refDirs.join() ? refs : refsStamp(repo, dirs), refDirs: dirs })
  return pick(commits)
}

/**
 * A page of the past's commits in `repo`: those written in its days, from its first midnight to the one after its last,
 * in a store of pages of its own (`page|<repo>`) that the store of now never touches. git is asked from the page's first
 * day on, with no end: its dates are when a commit was last made (an amend, a rebase), the page's when it was written.
 * Its days are over, so a page listed less than PAST_GIT_TTL ago stands, then as long as no ref moves. Line stats carry
 * over by sha from both stores, and the rest are all asked: a page is read once, with the longest wait. A page whose
 * stats stopped half way is asked again after GIT_RETRY_MS.
 */
async function gitPage(ctx, repo) {
  const key = `page|${repo}`
  const c = ctx.cache.git[key]
  const win = `${ctx.fromMs}-${ctx.toMs}`
  const inPage = (cm) => cm.ms >= ctx.fromMs && cm.ms < ctx.toMs
  const store = c?.commits ?? []
  const page = c?.pages?.[win]
  const refDirs = c?.refDirs ?? []
  const refs = refsStamp(repo, refDirs)
  if (page && (Date.now() - page.at < PAST_GIT_TTL || (refs != null && refs === page.refs))) return store.filter(inPage)
  const email = await gitEmail(ctx, repo)
  if (!email) return []
  let commits
  try {
    const { stdout } = await execFileP('git', ['-C', repo, 'log', '--branches', '--tags', '--no-merges', `--since=${iso(ctx.fromMs)}`,
      `--author=${email}`, '--date=iso-strict', '--pretty=format:%x01%H%x1f%h%x1f%ad%x1f%s%x1f%ae'],
    { timeout: 4000, maxBuffer: 16 << 20, encoding: 'utf8' })
    commits = parseGitList(stdout, email, (ms) => ms >= ctx.fromMs && ms < ctx.toMs)
  } catch (err) {
    ctx.log(`git log ${repo}: ${err?.message?.split('\n')[0]}`)
    ctx.gitErrors++
    return store.filter(inPage)
  }
  const known = new Map([...(ctx.cache.git[`log|${repo}`]?.commits ?? []), ...store].filter((cm) => cm.stat).map((cm) => [cm.sha, cm]))
  for (const cm of commits) {
    const k = known.get(cm.sha)
    if (k) Object.assign(cm, { add: k.add, del: k.del, stat: true })
  }
  let isPartial = false
  const need = commits.filter((cm) => !cm.stat)
  for (let i = 0; i < need.length && !isPartial; i += NUMSTAT_BATCH) {
    const batch = need.slice(i, i + NUMSTAT_BATCH)
    try {
      const { stdout } = await execFileP('git', ['-C', repo, '-c', 'core.bigFileThreshold=256k', 'show', '--no-renames', '--numstat',
        '--format=%x01%H', ...batch.map((cm) => cm.sha)], { timeout: 6000, maxBuffer: 32 << 20, encoding: 'utf8' })
      const stats = parseNumstat(stdout)
      for (const cm of batch) {
        const st = stats.get(cm.sha)
        if (st) Object.assign(cm, { add: st[0], del: st[1], stat: true })
      }
    } catch (err) {
      ctx.log(`git numstat ${repo}: ${err?.message?.split('\n')[0]}`)
      ctx.gitStatsPartial = true
      isPartial = true
    }
  }
  // the pages listed in the last GIT_KEEP_MS stay, each with its commits, and this one replaces its own
  const now = Date.now()
  const dirs = refs == null ? [] : refFolders(repo)
  const pages = {
    [win]: isPartial ? { at: now - PAST_GIT_TTL + GIT_RETRY_MS, refs: null } : { at: now, refs: dirs.join() === refDirs.join() ? refs : refsStamp(repo, dirs) },
  }
  for (const [w, p] of Object.entries(c?.pages ?? {})) if (w !== win && now - p.at < GIT_KEEP_MS) pages[w] = p
  const spans = Object.keys(pages).map((w) => w.split('-').map(Number))
  const kept = store.filter((cm) => !inPage(cm) && spans.some(([from, to]) => cm.ms >= from && cm.ms < to))
  ctx.cache.git[key] = { at: now, pages, commits: [...kept, ...commits], refDirs: dirs }
  ctx.dirty = true
  return commits
}

/**
 * Every folder Claude Code was opened in, from the `projects` of its config: `~/.claude.json` beside the default home,
 * `.claude.json` inside one run with CLAUDE_CONFIG_DIR. Claude Code keeps them when it deletes their transcripts
 * (cleanupPeriodDays), so they still name the repos of a month whose sessions are gone. Only the folders are kept: the
 * file holds secrets.
 */
function claudeFolders(homes) {
  const out = new Set()
  for (const h of homes) {
    for (const file of [path.join(h.dir, '.claude.json'), ...(h.def ? [path.join(path.dirname(h.dir), '.claude.json')] : [])]) {
      const projects = readJson(file)?.projects
      if (projects && typeof projects === 'object') for (const p of Object.keys(projects)) if (path.isAbsolute(p)) out.add(p)
    }
  }
  return out
}

/**
 * When a repo's refs last moved, by stats alone (a list in a project folder could stall): what refsStamp watches, the
 * folders below refs/heads last listed (`dirs`), and HEAD's reflog, which every commit of its checkout grows. Infinity
 * when stats cannot tell: `.git` no folder (a submodule), or linked worktrees, whose commits may move only a folder below
 * refs/heads that was never listed.
 */
function refsMovedAt(repo, dirs = []) {
  const git = path.join(repo, '.git')
  if (!statSafe(git)?.isDirectory() || statSafe(path.join(git, 'worktrees'))) return Infinity
  const watched = ['packed-refs', path.join('reftable', 'tables.list'), path.join('refs', 'heads'), path.join('refs', 'tags'), path.join('logs', 'HEAD'), ...dirs]
  return Math.max(0, ...watched.map((p) => statSafe(path.join(git, p))?.mtimeMs ?? 0))
}

/**
 * The repos a page of the past looks in besides `have` (those it lists anyway): the repo of every folder Claude Code was
 * opened in (claudeFolders) that can hold a commit of the page, PAST_REPO_CAP at most. One listed before whose refs have
 * not moved since the page began holds none (refsMovedAt); one never listed is asked, since the folders below its
 * refs/heads (a worktree's `claude/x`, the worktree since removed) are not known yet.
 */
function pastRepos(ctx, homes, have) {
  const out = []
  for (const dir of claudeFolders(homes)) {
    if (out.length >= PAST_REPO_CAP) break
    const r = ctx.resolver.resolve(dir)
    if (!r.git || !path.isAbsolute(r.path) || have.has(r.path)) continue
    have.add(r.path)
    const dirs = ctx.cache.git[`page|${r.path}`]?.refDirs ?? ctx.cache.git[`log|${r.path}`]?.refDirs
    if (!Array.isArray(dirs) || refsMovedAt(r.path, dirs) >= ctx.fromMs) out.push(r.path)
  }
  return out
}

/** `fn` of each item, `limit` at a time, the answers in the items' order. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/** Same sha in several checkouts (clones, scratch copies): keep the best-ranked repo (not tmp, shortest path). */
function rankRepo(p) {
  return (/^(?:\/private)?\/(?:tmp|var\/folders)\//.test(p) ? 1e6 : 0) + p.length
}

/** `active`: repos with agent activity in the range win a shared sha over repos that are only remembered. */
async function collectGit(ctx, repos, active = new Set(repos)) {
  const isPage = !!ctx.range.back
  const lists = await mapLimit(repos, isPage ? PAST_GIT_JOBS : GIT_JOBS, async (r) => {
    const list = await (isPage ? gitPage : gitLog)(ctx, r)
    ctx.progress?.advance(1)
    return list
  })
  const rank = (repo) => (active.has(repo) ? 0 : 1e7) + rankRepo(repo)
  const bySha = new Map()
  repos.forEach((repo, i) => {
    for (const cm of lists[i]) {
      const prev = bySha.get(cm.sha)
      if (!prev || rank(repo) < rank(prev.repo)) bySha.set(cm.sha, { ...cm, repo })
    }
  })
  return [...bySha.values()]
}

// ---------------------------------------------------------------- novi contractors

/** A program on PATH. Windows runs no extensionless script: npm's shim there is `<bin>.cmd` (the bare `<bin>` beside it is for sh). */
export function findOnPath(bin, platform = process.platform, env = process.env) {
  const names = platform === 'win32' ? [`${bin}.exe`, `${bin}.cmd`] : [bin]
  for (const dir of String(env.PATH ?? env.Path ?? '').split(platform === 'win32' ? ';' : ':')) {
    if (!dir) continue
    for (const name of names) {
      const p = path.join(dir, name)
      try {
        fs.accessSync(p, fs.constants.X_OK)
        if (statSafe(p)?.isFile()) return p
      } catch {}
    }
  }
  return null
}

function mapNovi(ctx, stdout) {
  const f = JSON.parse(stdout)
  if (!String(f?.spec ?? '').startsWith('novibenolife-facts/')) throw new Error('unexpected novi output')
  const list = []
  for (const p of Array.isArray(f.projects) ? f.projects : []) {
    for (const s of Array.isArray(p?.sessions) ? p.sessions : []) {
      if (!s || typeof s.tool !== 'string' || s.tool === 'claude-code') continue
      list.push({
        tool: clip(s.tool, 20),
        project: clip(ctx.resolver.resolve(String(p.path ?? p.name ?? '')).name, 60),
        title: clip(redact(s.title ?? ''), 60) || null,
        minutes: Math.max(0, Math.round(Number(s.active_minutes) || 0)),
        start: iso(Date.parse(s.start)),
        end: iso(Date.parse(s.end)),
      })
    }
  }
  return list
}

/**
 * Other coding agents (Codex, Cursor…) via the author's novi CLI. Only ever `novi <today|week|month> --facts
 * --no-ingest`: a bare `novi` (or an unknown flag) falls through to a full ingest.
 * Spawned before the (synchronous) history scan so its ~100 ms startup overlaps ours; the 5 s timeout is
 * armed only afterwards, because a timer cannot fire fairly while the event loop is busy parsing.
 * @returns {{ arm: (ms?: number) => void, result: Promise<{ status: string, list: object[] }> }}
 */
function startNovi(ctx) {
  const done = (r) => ({ arm() {}, result: Promise.resolve(r) })
  if (!ctx.useNovi) return done({ status: 'absent', list: [] })
  const arg = ctx.range.kind === 'month' ? 'month' : ctx.range.kind === 'week' ? 'week' : 'today'
  const c = ctx.cache.novi[arg]
  const ttl = ctx.view === 'live' ? 5 * 60e3 : NOVI_TTL
  if (c && Date.now() - c.at < ttl) return done({ status: c.status, list: c.list })
  const bin = findOnPath('novi')
  if (!bin) return done({ status: 'absent', list: [] })
  let child = null
  let timer = null
  const raw = new Promise((resolve) => {
    const chunks = []
    let size = 0
    try {
      // a .cmd shim runs only through cmd (Node refuses it otherwise); its quoted path and our three fixed words are all it gets
      const isCmd = /\.cmd$/i.test(bin)
      child = spawn(isCmd ? `"${bin}"` : bin, [arg, '--facts', '--no-ingest'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, shell: isCmd })
    } catch (err) {
      resolve({ ok: false, err })
      return
    }
    child.stdout.on('data', (d) => {
      size += d.length
      if (size > 32 << 20) child.kill('SIGKILL')
      else chunks.push(d)
    })
    child.on('error', (err) => resolve({ ok: false, err }))
    child.on('close', (code, signal) => resolve({ ok: code === 0, err: code === 0 ? null : new Error(`exit ${code ?? signal}`), stdout: Buffer.concat(chunks).toString('utf8') }))
  })
  const result = raw.then((r) => {
    clearTimeout(timer)
    let res
    try {
      if (!r.ok) throw r.err ?? new Error('novi failed')
      res = { status: 'used', list: mapNovi(ctx, r.stdout) }
    } catch (err) {
      ctx.log(`novi: ${err?.message?.split('\n')[0]}`)
      res = { status: 'error', list: [] }
    }
    ctx.cache.novi[arg] = { at: Date.now(), ...res }
    ctx.dirty = true
    return res
  })
  return { arm(ms = 5000) { timer ??= setTimeout(() => child?.kill('SIGKILL'), ms) }, result }
}

// ---------------------------------------------------------------- aggregation

function newProject(r) {
  return {
    name: r.name, path: r.path, git: !!r.git, worktrees: new Set(), lastTs: 0,
    live: { desks: 0, busy: 0, idle: 0, waiting: 0, interns: 0, meetings: 0 },
    sessions: new Set(), subagents: 0, workflows: new Set(), deskMs: 0, agentMs: 0, prompts: 0, tools: 0,
    edits: new Set(), commits: [], tokIn: 0, tokOut: 0, activity: emptyActivity(), intern_types: {}, models: {},
    days: {}, hours: new Array(24).fill(0), titles: new Map(), byAgent: {},
  }
}

function dayRec(P, d) {
  return (P.days[d] ??= { ms: 0, deskMs: 0, sessions: 0, subagents: 0, workflows: 0, prompts: 0, commits: 0 })
}

/** connected-office patch: a bucket scaled to a fraction of its time; edited files only on the session's own project. */
export function scaleBucket(b, f, keepEdits) {
  if (f >= 1) return b
  const s = (n) => Math.round(n * f)
  const h = {}
  for (const [k, ms] of Object.entries(b.h)) h[k] = ms * f
  const k = {}
  for (const [n, c] of Object.entries(b.k)) k[n] = s(c)
  return { ...b, a: b.a * f, p: s(b.p), t: s(b.t), i: s(b.i), o: s(b.o), k, h, e: keepEdits ? b.e : [] }
}

/**
 * connected-office patch: per day, the fraction of a session's time spent in each repo, from its per-cwd gaps (`e.cm`).
 * `main[d]` is the main project's fraction; `others` maps a repo path to { r, f: { day: fraction } }. A session cached
 * before the patch has no `cm`: everything stays on the main project, as upstream does.
 */
export function splitShares(cm, dkeys, resolver, main) {
  const out = { main: {}, others: new Map() }
  if (!cm) return out
  for (const d of dkeys) {
    const byRepo = new Map()
    let all = 0
    for (const [cwd, days] of Object.entries(cm)) {
      const ms = days[d] ?? 0
      if (!ms) continue
      const r = resolver.resolve(cwd)
      all += ms
      const x = byRepo.get(r.path) ?? { r, ms: 0 }
      x.ms += ms
      byRepo.set(r.path, x)
    }
    if (!all) continue
    out.main[d] = 0
    for (const [p, x] of byRepo) {
      if (p === main.path) { out.main[d] += x.ms / all; continue }
      const o = out.others.get(p) ?? { r: x.r, f: {} }
      o.f[d] = x.ms / all
      out.others.set(p, o)
    }
  }
  return out
}

function addBucket(P, d, b, isMain, agent = 'claude') {
  const pd = dayRec(P, d)
  P.agentMs += b.a
  P.byAgent[agent] = (P.byAgent[agent] ?? 0) + b.a
  pd.ms += b.a
  if (isMain) {
    P.deskMs += b.a
    pd.deskMs += b.a
    P.prompts += b.p
    pd.prompts += b.p
  }
  P.tools += b.t
  for (const [k, n] of Object.entries(b.k)) if (k in P.activity) P.activity[k] += n
  for (const h of b.e) P.edits.add(h)
  P.tokIn += b.i
  P.tokOut += b.o
  for (const [h, ms] of Object.entries(b.h)) P.hours[h] += ms
}

const minutes = (ms) => Math.round(ms / 60_000)

function addCounts(into, from) {
  for (const [k, n] of Object.entries(from)) into[k] = (into[k] ?? 0) + n
}

function cleanKeys(obj, n = 40) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const c = clip(k, n)
    if (c) out[c] = (out[c] ?? 0) + v
  }
  return out
}

function finishProject(P, days) {
  const titles = [...P.titles.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 5)
  const wts = [...P.worktrees]
  const per_day = {}
  for (const d of days) {
    const r = P.days[d]
    per_day[d] = { minutes: minutes(r?.ms ?? 0), desk_minutes: minutes(r?.deskMs ?? 0), sessions: r?.sessions ?? 0, subagents: r?.subagents ?? 0, prompts: r?.prompts ?? 0, commits: r?.commits ?? 0 }
  }
  return {
    name: clip(P.name, 60),
    path: safeText(P.path),
    worktrees: wts.slice(0, WORKTREE_CAP).map((w) => clip(w, 40)),
    worktrees_more: Math.max(0, wts.length - WORKTREE_CAP),
    live: P.live,
    sessions: P.sessions.size,
    subagents: P.subagents,
    workflows: P.workflows.size,
    desk_minutes: minutes(P.deskMs),
    agent_minutes: minutes(P.agentMs),
    agents: Object.fromEntries(Object.entries(P.byAgent).map(([a, ms]) => [a, minutes(ms)]).filter(([, m]) => m > 0)),
    prompts: P.prompts,
    tool_calls: P.tools,
    files_edited: P.edits.size,
    commits: P.commits.length,
    additions: P.commits.reduce((s, c) => s + c.add, 0),
    deletions: P.commits.reduce((s, c) => s + c.del, 0),
    tokens_in: P.tokIn,
    tokens_out: P.tokOut,
    activity: P.activity,
    intern_types: cleanKeys(P.intern_types),
    models: cleanKeys(P.models),
    per_day,
    per_hour: P.hours.map(minutes),
    titles,
    top_commits: [...P.commits].sort((a, b) => b.ms - a.ms).slice(0, 3).map((c) => ({ sha: c.short.slice(0, 7), subject: c.subject, time: iso(c.ms) })),
  }
}

// ---------------------------------------------------------------- timelapse

/**
 * Whether a bucket's quarters hold all of its active time. touch() books every gap into `a`, `h` and `q` together, so
 * they always add up, unless a version from before quarters (sharing the cache) appended to the day after this one began
 * it: those quarters miss what it booked.
 */
function wholeQuarters(b) {
  if (!b.q) return false
  let ms = 0
  for (const v of Object.values(b.q)) ms += v
  return Math.abs(ms - b.a) <= 1
}

/**
 * The stale predicate of a yesterday timelapse: a cached entry with a bucket on `day` whose quarters are missing (parsed
 * before quarters existed) or short (see wholeQuarters) is read again once. Workflow agents are left as they are: a
 * meeting is drawn from its run's start and end, never from its agents' quarters.
 */
function lacksQuarters(day) {
  return (e) => {
    const b = e.days?.[day]
    return b != null && !wholeQuarters(b) && !(e.kind === 'sub' && (e.run || e.type === 'workflow-subagent'))
  }
}

/**
 * The slot grid of a timelapse range: `slotAt(ms)` is the slot an instant falls in, by its local day and its wall-clock
 * time on that day (so a 23- or 25-hour day keeps its 96, 24 or 6 slots); -1 before the range, past the last slot after.
 */
function lapseGrid(range, nowMs) {
  const slotMin = LAPSE_SLOT_MIN[range.kind]
  const perDay = 1440 / slotMin
  const n = new Date(nowMs)
  const nowSlot = Math.floor((n.getHours() * 60 + n.getMinutes()) / slotMin)
  const slots = range.kind === 'yesterday' ? perDay : (range.days.length - 1) * perDay + nowSlot + 1
  const dayIx = new Map(range.days.map((d, i) => [d, i]))
  const fromMs = Date.parse(range.from)
  const slotAt = (ms) => {
    const i = dayIx.get(localDay(ms))
    if (i === undefined) return ms < fromMs ? -1 : range.days.length * perDay
    const d = new Date(ms)
    return i * perDay + Math.floor((d.getHours() * 60 + d.getMinutes()) / slotMin)
  }
  return { slotMin, perDay, slotMs: slotMin * 60e3, slots, dayIx, slotAt }
}

/**
 * Active ms per slot of one session's days (`{ date: bucket }`, days out of the range skipped): quarters read `q`, hours
 * and 4-hour slots read `h`. A bucket whose `q` is missing or short (wholeQuarters; not read again) spreads each hour
 * evenly.
 */
function slotTime(g, days) {
  const out = new Map()
  const add = (s, ms) => out.set(s, (out.get(s) ?? 0) + ms)
  for (const [d, b] of Object.entries(days)) {
    const base = g.dayIx.get(d)
    if (base === undefined) continue
    const at = base * g.perDay
    if (g.slotMin === 15 && wholeQuarters(b)) for (const [q, ms] of Object.entries(b.q)) add(at + Number(q), ms)
    else if (g.slotMin === 15) for (const [h, ms] of Object.entries(b.h)) for (let k = 0; k < 4; k++) add(at + Number(h) * 4 + k, ms / 4)
    else for (const [h, ms] of Object.entries(b.h)) add(at + Math.floor(Number(h) * 60 / g.slotMin), ms)
  }
  return out
}

/** The slots a session worked in, ascending: active at least `min` ms there, and within the replay. */
function workedSlots(g, days, min) {
  const out = []
  for (const [s, ms] of slotTime(g, days)) if (ms >= min && s >= 0 && s < g.slots) out.push(s)
  return out.sort((a, b) => a - b)
}

/** Ascending slots as [from, to) runs, consecutive slots in one run (so two runs never touch). */
function runsOf(slots) {
  const runs = []
  for (const s of slots) {
    const last = runs.at(-1)
    if (last && last[1] === s) last[1]++
    else runs.push([s, s + 1])
  }
  return runs
}

/** Slot → count (counts > 0) as change points [slot, count]: each one where the count changes, the last at count 0. */
function changePoints(counts) {
  const out = []
  let cur = 0
  let prev = -2
  for (const s of [...counts.keys()].sort((a, b) => a - b)) {
    if (cur && s > prev + 1) { out.push([prev + 1, 0]); cur = 0 }
    const c = counts.get(s)
    if (c !== cur) { out.push([s, c]); cur = c }
    prev = s
  }
  if (cur) out.push([prev + 1, 0])
  return out
}

/** One session's days in the range, its copies merged (the same sid in two project dirs): per day the bigger bucket. */
function mergedDays(g, entries) {
  const days = {}
  for (const e of entries) for (const [d, b] of Object.entries(e.days)) if (g.dayIx.has(d) && (!days[d] || b.a > days[d].a)) days[d] = b
  return days
}

/**
 * facts.timeline (types/index.d.ts OfficeTimeline): the range slot by slot, from the entries this run synced and the
 * projects it booked them into, never a file. A desk is a main session that worked in a slot (active a twentieth of it,
 * a minute at least), its interns the subagents it had at work (half that, 30 s at least; workflow agents are meetings,
 * not interns), a meeting a workflow run that overlaps the range, and commits are counted per project and slot.
 * `src`: Claude's main sessions by sid (`mains`) and every file it synced (`claude`), the other agents' (`others`), the
 * workflow runs (`runs`: runId → { start, end?, last?, name?, agents?, sid, pd, home }), the live desks (`live`, which
 * name the runs still going), `projects` with their commits, `projectOfSid` / `resolve` for a session's project,
 * `nameOf(r)` for the name the facts give it, and `match`, the project filter.
 */
function buildTimeline(range, nowMs, src) {
  const g = lapseGrid(range, nowMs)
  const deskMin = Math.max(60e3, g.slotMs / 20)
  const internMin = Math.max(30e3, g.slotMs / 40)
  const all = new Map()
  const seat = (key, slots, r, home, title) => {
    const name = src.nameOf(r)
    if (!src.match(name)) return
    all.set(key, { id: fnv1a(key).toString(36), project: clip(name, 60), agent: home.agent, account: home.label ?? null, title, slots, counts: new Map() })
  }
  for (const [sid, list] of src.mains) {
    const slots = workedSlots(g, mergedDays(g, list.map((x) => x.e)), deskMin)
    if (!slots.length) continue
    const p = list.reduce((a, b) => (b.e.size > a.e.size ? b : a))
    seat(sid, slots, src.projectOfSid(sid, p.f.pd, p.f.home), p.f.home, p.e.ct || p.e.at)
  }
  const otherMains = new Map()
  for (const x of src.others) {
    if (x.e.kind !== 'main') continue
    const key = `${x.home.agent}:${x.e.sid}`
    const list = otherMains.get(key)
    if (list) list.push(x)
    else otherMains.set(key, [x])
  }
  for (const [key, list] of otherMains) {
    const slots = workedSlots(g, mergedDays(g, list.map((x) => x.e)), deskMin)
    if (!slots.length) continue
    const p = list.reduce((a, b) => (b.e.size > a.e.size ? b : a))
    seat(key, slots, src.resolve(topCwd(p.e) ?? ''), p.home, p.e.ct)
  }

  // interns: on the desk of their parent session, when it has one
  const bench = (key, days) => {
    const desk = all.get(key)
    if (desk) for (const s of workedSlots(g, days, internMin)) desk.counts.set(s, (desk.counts.get(s) ?? 0) + 1)
  }
  for (const { e } of src.claude) if (e.kind === 'sub' && !e.run && e.type !== 'workflow-subagent') bench(e.sid, e.days)
  for (const { f, e, home } of src.others) {
    const par = e.kind === 'sub' ? e.par ?? f.par : null
    if (par) bench(`${home.agent}:${par}`, e.days)
  }

  // the cap keeps the desks that worked the most slots, then they sit by their first slot
  const order = (a, b) => a.slots[0] - b.slots[0] || a.project.localeCompare(b.project) || a.id.localeCompare(b.id)
  let kept = [...all.values()]
  const more = Math.max(0, kept.length - LAPSE_DESKS)
  if (more) kept = kept.sort((a, b) => b.slots.length - a.slots.length || order(a, b)).slice(0, LAPSE_DESKS)
  const desks = kept.sort(order).map((d) => {
    const out = { id: d.id, project: d.project }
    if (d.agent !== 'claude') out.agent = d.agent
    if (d.account != null) out.account = d.account
    if (d.title) out.title = clip(d.title, 80)
    out.runs = runsOf(d.slots)
    if (d.counts.size) out.interns = changePoints(d.counts)
    return out
  })

  // meetings: a run is in the room from its start to its json (its end); one with no json yet until its agents go quiet
  const fromMs = Date.parse(range.from)
  const toMs = Date.parse(range.to)
  const crew = new Map()
  for (const { e } of src.claude) {
    if (e.kind !== 'sub' || !e.run) continue
    const c = crew.get(e.run) ?? { n: 0, last: 0 }
    c.n++
    if (e.lts > c.last) c.last = e.lts
    crew.set(e.run, c)
  }
  const liveRuns = new Map()
  for (const d of src.live) for (const m of d.meetings ?? []) liveRuns.set(m.id, m)
  const meetings = []
  for (const [runId, run] of src.runs) {
    const c = crew.get(runId)
    const live = liveRuns.get(runId)
    let end = run.end
    if (end == null) {
      const last = Math.max(run.last ?? run.start, c?.last ?? 0)
      end = live || nowMs - last <= RUN_QUIET_MS ? nowMs : last
    }
    end = Math.max(end, run.start)
    if (!(run.start < toMs && end > fromMs)) continue
    const name = src.nameOf(src.projectOfSid(run.sid, run.pd, run.home))
    if (!src.match(name)) continue
    const from = Math.max(0, g.slotAt(run.start))
    if (from >= g.slots) continue
    const to = Math.max(from + 1, Math.min(g.slots, g.slotAt(end) + 1))
    const agents = (run.end != null ? run.agents : live?.agents_total) || c?.n || 0
    meetings.push({ project: clip(name, 60), name: run.name || live?.name || 'workflow', from, to, agents })
  }
  meetings.sort((a, b) => a.from - b.from || a.to - b.to || a.project.localeCompare(b.project) || a.name.localeCompare(b.name))

  // commits: per project and slot, as the projects booked them
  const bySlot = new Map()
  for (const P of src.projects.values()) {
    if (!P.commits.length || !src.match(P.name)) continue
    const project = clip(P.name, 60)
    for (const cm of P.commits) {
      const s = g.slotAt(cm.ms)
      if (s < 0 || s >= g.slots) continue
      const k = `${s}|${project}`
      const x = bySlot.get(k)
      if (x) x.n++
      else bySlot.set(k, { project, slot: s, n: 1 })
    }
  }
  const commits = [...bySlot.values()].sort((a, b) => a.slot - b.slot || a.project.localeCompare(b.project))

  return {
    kind: range.kind, label: range.label, days: [...range.days], slot_min: g.slotMin, per_day: g.perDay, slots: g.slots, desks, meetings, commits, more,
  }
}

// ---------------------------------------------------------------- collect

function toMs(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const ms = Date.parse(String(v))
  return Number.isFinite(ms) ? ms : null
}

/**
 * The agents to read: `opts.agents` or THEOFFICE_AGENTS (a list or a comma-separated string of ids), every agent of the
 * cast by default. Unknown ids are ignored; an empty pick reads Claude alone.
 */
function pickAgents(v) {
  if (v == null || v === '' || v === 'all') return AGENT_IDS
  const list = (Array.isArray(v) ? v : String(v).split(',')).map((a) => String(a).trim().toLowerCase())
  const out = AGENT_IDS.filter((a) => list.includes(a))
  return out.length ? out : ['claude']
}

/** How often a run of the pane's progress is said again with nothing new, so a long git step still reads as alive. */
const PROGRESS_BEAT_MS = 2000

/**
 * How far a run of the pane has read, for the pane to show while it waits: `file` (scripts/office.mjs sharedRun's
 * `<key>.progress.json`, beside its shared answer) holds `{ v, began, at, step, steps, done, total }`. Step 1 is
 * Claude's sessions and 2 the other agents', in bytes left to read (the total grows as each home is walked and settles
 * as each file is read: one that turned out cached reads nothing), 3 is git, in repos. Rewritten at most every
 * PROGRESS_MS and once as each step ends, atomically, and every PROGRESS_BEAT_MS with nothing new (an unref'd timer: a
 * step that reads nothing for a while, a slow repo, still reads as going); a write that fails costs the pane only its
 * numbers. `stop()` before the file is removed: nothing is written after it. Null without a file.
 */
export function progressOf(file) {
  if (!file) return null
  const p = { v: 1, began: Date.now(), at: 0, step: 0, steps: 3, done: 0, total: 0 }
  let ended = false
  let stopped = false
  const write = (isNow) => {
    const at = Date.now()
    if (stopped || (!isNow && at - p.at < PROGRESS_MS)) return
    p.at = at
    const tmp = `${file}.${process.pid}.tmp`
    try {
      fs.writeFileSync(tmp, JSON.stringify(p), { mode: 0o600 })
      fs.renameSync(tmp, file)
    } catch {
      try { fs.unlinkSync(tmp) } catch {}
    }
  }
  const beat = setInterval(() => write(true), PROGRESS_BEAT_MS)
  beat.unref?.()
  return {
    step(n, total = 0) {
      Object.assign(p, { step: n, done: 0, total })
      ended = false
      write(true)
    },
    expect(n) { p.total += n },
    advance(n, expected = n) {
      // a file that turned out cached moves nothing: no write for it, however many there are
      if (n === 0 && expected === 0) return
      p.done += n
      p.total += n - expected
      // the end of a step is said, once
      const isEnd = !ended && p.done >= p.total
      if (isEnd) ended = true
      write(isEnd)
    },
    stop() {
      stopped = true
      clearInterval(beat)
    },
  }
}

/**
 * Collect the facts for one view. Never throws for missing/odd data: each phase degrades to empty and
 * leaves a note. Options default from the environment (THEOFFICE_* overrides, see SPEC).
 * Every account of every agent is read (agents.mjs agentHomes): Claude's config folders (~/.claude and the
 * ~/.claude-<name> of other accounts), then Codex, Gemini, Cursor, Kimi and Grok, looked for in `home` (THEOFFICE_HOME,
 * else $HOME). A Claude folder given explicitly (`claudeDir`, THEOFFICE_CLAUDE_DIR) is read alone, with the other agents
 * only when `home` is given too. `agents` limits which agents are read.
 * `resetCache` ignores whatever the cache holds and rewrites the hot tier from this run (the CLI's retry after a failed
 * run, so a cache that breaks the collector heals itself instead of failing every refresh), and the cold tier too when
 * the range reaches it: a week says nothing about a month that took a minute and gigabytes to read. It keeps the kept
 * sessions (judgeGone), taken back from every tier: they are the only copy of what Claude Code's cleanup deleted.
 * `managedSettings`: where Claude Code's managed settings are (retentionOf), the system's own place by default.
 * `range` ('yesterday', 'week' or 'month') picks the range the view's would be, and `timeline` adds the timelapse of
 * it (facts.timeline, buildTimeline). A timelapse never asks novi, which has no slots and no yesterday.
 * `back` turns a view's range that many pages into the past (resolveRange, period.mjs): the pane's pages of the past are
 * the `today`, `week` and `month` views with a `back`. `now` stays now, so the live floor is today's.
 * `series`: one run of many (the pane's), so a hot tier that only learnt that transcripts grew can wait for a later one,
 * and the walks of the other agents' files are kept a minute (agents.mjs readOtherAgents).
 * `stopsWithParent`: a run for the pane, which no one reads once its session is gone.
 * `firstLight`: the live floor alone (`facts.first_light`), for a machine's first open, which would otherwise wait for
 * every session of the week to be read: no transcript of Claude's, no git, no novi, of the other agents only the
 * sessions written in the last minutes, which their desks need; it reads the cache and writes nothing to it. Its
 * totals are not counted yet, and the drawings say so.
 * `progress`: what says how far the run has read (progressOf), for the pane's wait.
 * @param {{ view?: string, now?: Date|number|string, claudeDir?: string, home?: string, agents?: string|string[],
 *           cacheDir?: string|null|false, git?: boolean, novi?: boolean, project?: string, debug?: boolean,
 *           resetCache?: boolean, range?: 'yesterday'|'week'|'month', timeline?: boolean, back?: number, series?: boolean,
 *           stopsWithParent?: boolean, firstLight?: boolean, progress?: ReturnType<typeof progressOf>, managedSettings?: string|null }} [opts]
 */
export async function collect(opts = {}) {
  const t0 = performance.now()
  const env = process.env
  const view = VIEWS.includes(opts.view) ? opts.view : 'all'
  const nowMs = toMs(opts.now) ?? toMs(env.THEOFFICE_NOW) ?? Date.now()
  const firstLight = opts.firstLight === true
  const explicitClaude = opts.claudeDir || env.THEOFFICE_CLAUDE_DIR || null
  const claudeDir = explicitClaude || path.join(os.homedir(), '.claude')
  const root = opts.home || env.THEOFFICE_HOME || (explicitClaude ? null : os.homedir())
  const cacheDir = opts.cacheDir === undefined ? defaultCacheDir(env) : opts.cacheDir || null
  const range = LAPSE_SLOT_MIN[opts.range] ? resolveRange(opts.range, nowMs, 0, { lapse: true }) : resolveRange(view, nowMs, opts.back)
  const lapse = opts.timeline === true && LAPSE_SLOT_MIN[range.kind] ? range.kind : null
  const notes = []
  // `def`: Claude's folder of keys without a prefix, ~/.claude or the one given (its prefix may change below)
  const homes = agentHomes({ root, env, agents: pickAgents(opts.agents ?? env.THEOFFICE_AGENTS), claudeDir: explicitClaude })
    .map((h) => (h.agent === 'claude' ? { ...h, projectsDir: path.join(h.dir, 'projects'), def: h.prefix === '' } : h))
  const claudeHomes = homes.filter((h) => h.agent === 'claude')
  const ctx = {
    view, nowMs, claudeDir, range, notes,
    // a first light reads no history: of the other agents only the sessions recent enough to be at a desk
    fromMs: firstLight ? nowMs : Date.parse(range.from),
    toMs: Date.parse(range.to),
    skipPid: envFlag(env.THEOFFICE_SKIP_PID_CHECK),
    // novi answers for a range up to now: never for one that ended before today (yesterday's, a month back)
    useNovi: !firstLight && (opts.novi ?? true) && !envFlag(env.THEOFFICE_NO_NOVI) && opts.timeline !== true && range.days.at(-1) === localDay(nowMs),
    cache: opts.resetCache ? emptyCache() : loadCache(cacheDir),
    dirty: !!opts.resetCache,
    /** Bytes of transcripts read this run, and whether any file moved: all a run may leave unsaved (SAVE_EVERY_MS). */
    grew: 0,
    changed: false,
    knownGen: 0,
    listed: new Set(),
    seen: new Set(),
    /** A folder of a home listed in full this run (the cache forgets the files that vanished from it). */
    listedKey: (home, rel) => ctx.listed.add(home.prefix + rel),
    /** Claude's homes whose projects were listed, by prefix, with their folders; and the sessions the desktop app released (judgeGone). */
    projects: new Map(),
    released: new Set(),
    /** The tiers whose entries this run changed for good, which it must rewrite (judgeGone, entrypointOf). */
    touched: { cold: false, archive: false },
    gitErrors: 0,
    log: opts.debug ? (m) => process.stderr.write(`[theoffice] ${m}\n`) : () => {},
    /** A cached entry to read again from scratch (syncFile `stale`, Claude's files and the other agents' alike). */
    stale: lapse === 'yesterday' ? lacksQuarters(range.days[0]) : undefined,
    /** One run of many, the pane's, with a cache the next ones read: what can wait for them does. */
    series: !!opts.series && !!cacheDir,
    progress: firstLight ? null : opts.progress ?? null,
    walks: opts.series && cacheDir ? loadWalks(cacheDir, nowMs, Date.parse(range.from)) : null,
    walked: opts.series && cacheDir ? {} : null,
  }
  // a cache started over takes back the kept sessions, of which it holds the only copy, and the folder of its keys
  if (opts.resetCache && cacheDir && !firstLight) {
    const owner = loadKeptInto(cacheDir, ctx.cache)
    if (owner) ctx.cache.claude = owner
  }
  // the keys without a prefix are one Claude folder's (`claude`, its real path), the first to write them, unless it was
  // given explicitly to a cache that has some: a run of another keys its files with a prefix of its own (`@claude=<hash>/`),
  // and neither counts nor judges that folder's
  const def = claudeHomes.find((h) => h.def)
  const real = def && realpathSafe(def.dir)
  if (real) {
    if (ctx.cache.claude == null && (!explicitClaude || !Object.keys(ctx.cache.files).some((k) => !k.startsWith('@')))) {
      ctx.cache.claude = real
      ctx.dirty = true
    }
    if (ctx.cache.claude !== real) def.prefix = `@claude=${fnv1a(real).toString(36)}/`
  }
  const useGit = !firstLight && (opts.git ?? true) && !envFlag(env.THEOFFICE_NO_GIT)
  // this range reaches further back than the hot tier holds
  const reachesCold = ctx.fromMs < nowMs - HOT_MS + 864e5
  // reset: the cold tier is not read, and only a range that reads as far rewrites it
  let coldAsked = !!opts.resetCache
  let coldLoaded = !!opts.resetCache && reachesCold
  ctx.ensureCold = () => {
    if (coldAsked || !cacheDir) return
    coldAsked = true
    coldLoaded = loadColdInto(cacheDir, ctx.cache) >= 0
  }
  // a page of the past further back than the cold tier holds reads the archive; a range of now never does
  const reachesArchive = ctx.fromMs < nowMs - COLD_MS + 864e5
  let archiveAsked = !!opts.resetCache
  let archiveLoaded = !!opts.resetCache && reachesArchive
  ctx.ensureArchive = () => {
    if (archiveAsked || !cacheDir) return
    ctx.ensureCold()
    archiveAsked = true
    archiveLoaded = loadArchiveInto(cacheDir, ctx.cache) >= 0
  }
  // what aged out of the hot tier moves to the cold one now and then, whatever the range, and what aged out of the
  // cold tier to the archive once a day
  const coldDue = !(nowMs - ctx.cache.coldAt < COLD_EVERY_MS)
  const archiveDue = !(nowMs - ctx.cache.archiveAt < ARCHIVE_EVERY_MS)
  if (coldDue || archiveDue) ctx.dirty = true
  // it may be what broke the last run: not asked again for a while, so a bad tier costs a retry an hour, not one a run
  if (opts.resetCache) ctx.cache.coldAt = ctx.cache.archiveAt = nowMs
  // a first light writes nothing, so it has no upkeep to do
  if (!firstLight && (coldDue || reachesCold)) ctx.ensureCold()
  if (!firstLight && (archiveDue || reachesArchive)) ctx.ensureArchive()
  let checkpointAt = performance.now()
  let checkpointGrew = 0
  const parent = process.ppid
  ctx.checkpoint = () => {
    if (!cacheDir || firstLight || performance.now() - checkpointAt < CHECKPOINT_MS) return
    if (ctx.grew > checkpointGrew) saveCache(cacheDir, ctx.cache, { nowMs })
    checkpointAt = performance.now()
    checkpointGrew = ctx.grew
    // the session that asked is gone, and no one reads the answer (the mod cannot stop a run): the next one goes on from here.
    // Windows never gives an orphan a new parent, so there the parent's own pid is asked
    if (opts.stopsWithParent && (process.platform === 'win32' ? !pidAlive(parent) : process.ppid !== parent)) process.exit(0)
  }
  const coldCache = Object.keys(ctx.cache.files).length === 0
  ctx.resolver = makeResolver(ctx)
  const noviJob = startNovi(ctx)   // spawned early: its startup overlaps the sync scan below

  // live floor: Claude's desks, every account
  const tLive = performance.now()
  let desks = []
  const wentHome = []
  const openSids = new Set()
  for (const home of claudeHomes) {
    try {
      const live = collectLive(ctx, home)
      desks.push(...live.desks)
      wentHome.push(...live.left)
      for (const sid of live.open) openSids.add(sid)
    } catch (err) { ctx.log(`live: ${err?.message}`); notes.push('live sessions unreadable') }
  }
  ctx.liveSids = new Set(desks.map((d) => d._sid))
  const msLive = performance.now() - tLive

  // history: Claude's transcripts, every account
  const tHist = performance.now()
  const walk = { mains: [], files: [], wfs: [], runs: [], indexes: [] }
  let fromCache = 0
  const synced = []
  ctx.progress?.step(1)
  for (const home of firstLight ? [] : claudeHomes) {
    try {
      const w = walkHistory(ctx, home)
      for (const k of Object.keys(walk)) walk[k].push(...w[k])
      // where a session cached before the collector kept it ran, read once while its transcript is there (judgeGone)
      for (const m of w.mains) {
        const e = ctx.cache.files[m.key]
        if (!e || typeof e.dt === 'number') continue
        const dt = entrypointOf(m.abs, m.st.size)
        if (dt == null) continue
        e.dt = dt
        const t = tierOf(e)
        if (t) ctx.touched[t] = true
        ctx.dirty = true
      }
      const left = w.files.map((f) => bytesLeft(ctx.cache, f.key, f.st))
      for (const n of left) ctx.progress?.expect(n)
      for (const [i, f] of w.files.entries()) {
        // a file the hot tier does not know: a days-old session resumed today, unless it was only just born
        if (!ctx.cache.files[f.key] && !isNewFile(f.st, nowMs)) ctx.ensureCold()
        const r = syncFile(ctx.cache, f.key, f.abs, f.st, { init: () => initEntry(f), handler: lineHandler, fromMs: ctx.fromMs, stale: ctx.stale })
        ctx.progress?.advance(r.bytes, left[i])
        ctx.grew += r.bytes
        if (r.cached) fromCache++
        else ctx.changed = true
        synced.push({ f, e: r.entry })
        ctx.checkpoint()
      }
    } catch (err) {
      ctx.log(`history: ${err?.stack ?? err}`)
      notes.push('history partially unreadable')
      // a walk cut short did not see all that is there: nothing of this home is judged gone
      ctx.projects.delete(home.prefix)
    }
  }
  if (!firstLight && !claudeHomes.some((h) => statSafe(h.projectsDir))) notes.push(`no transcripts found under ${claudeDir}`)
  // what became of Claude's sessions whose transcript went, then the kept ones with a day in the range, counted as read
  if (coldLoaded && !firstLight) judgeGone(ctx, claudeHomes, { archiveLoaded, managed: opts.managedSettings === undefined ? MANAGED_SETTINGS : opts.managedSettings })
  const kept = firstLight ? { files: [], runs: [] } : keptFiles(ctx, claudeHomes, new Set(range.days))
  synced.push(...kept.files)

  // the other agents (Codex, Gemini, Cursor, Kimi, Grok): their sessions into the same cache, the live ones at desks.
  const otherHomes = homes.filter((h) => h.agent !== 'claude' && READERS[h.agent])
  let others = { synced: [], desks: [], left: [], watch: [], read: new Set() }
  if (otherHomes.length) {
    ctx.progress?.step(2)
    ctx.extraKnown = desks.map((d) => d.project_path)
    ctx.knownGen++
    try { others = await readOtherAgents(ctx, otherHomes) } catch (err) { ctx.log(`agents: ${err?.stack ?? err}`); notes.push('other agents unreadable') }
    desks.push(...others.desks)
    // a first light counts nothing: their sessions were read for their desks, and the week of them comes with Claude's
    if (firstLight) others.synced = []
  }
  const msHist = performance.now() - tHist
  noviJob.arm(5000)
  if (coldCache && cacheDir && !firstLight && msHist > 1000) notes.push(`first run: built cache in ${(msHist / 1000).toFixed(1)} s`)

  // projects
  const inRange = new Set(range.days)
  const items = []   // { r: resolved project, ts: last activity ms, apply(P) }
  const mainBySid = new Map()
  for (const s of synced) {
    if (s.e.kind !== 'main') continue
    const list = mainBySid.get(s.e.sid) ?? []
    list.push(s)
    mainBySid.set(s.e.sid, list)
  }
  const projectOfMain = (e) => {
    const cwd = topCwd(e)
    if (!cwd) return null
    const r = ctx.resolver.resolve(cwd)
    if (e.wt?.orig && cwd === e.wt.path.replace(/[\\/]+$/, '')) return { ...ctx.resolver.resolve(e.wt.orig), worktree: e.wt.name ?? r.worktree }
    return r
  }
  let pdCwd = null   // a home's project dir (by cache key) → a cwd seen in one of its cached main transcripts (built on first need)
  const cwdOfPd = (pdKey) => {
    if (!pdCwd) {
      pdCwd = new Map()
      for (const [k, e] of Object.entries(ctx.cache.files)) {
        if (e.kind !== 'main' || e.ag) continue
        const d = path.dirname(k)
        if (!pdCwd.has(d)) { const c = topCwd(e); if (c) pdCwd.set(d, c) }
      }
    }
    return pdCwd.get(pdKey) ?? null
  }
  // project of a session (subagents and workflow runs inherit their parent's): its main transcript's
  // most frequent cwd, else the caller's own cwd, else any cwd seen in the same project dir
  const sidProject = new Map()
  const projectOfSid = (sid, pd, home, ownCwd) => {
    if (sidProject.has(sid)) return sidProject.get(sid)
    const list = mainBySid.get(sid)
    const primary = list ? list.reduce((a, b) => (b.e.size > a.e.size ? b : a)).e : ctx.cache.files[home.prefix + path.join(pd, `${sid}.jsonl`)]
    const r = (primary && projectOfMain(primary)) || (ownCwd ? ctx.resolver.resolve(ownCwd) : ctx.resolver.resolve(cwdOfPd(home.prefix + pd) ?? ''))
    sidProject.set(sid, r)
    return r
  }
  // non-scratch first so scratchpad slugs can match the projects seen this run
  ctx.extraKnown = desks.map((d) => d.project_path)
  ctx.knownGen++
  for (const [sid, list] of mainBySid) {
    // the same sessionId can exist in two project dirs as diverging copies (gotcha 5): per day keep the bigger bucket
    const primary = list.reduce((a, b) => (b.e.size > a.e.size ? b : a))
    const days = {}
    for (const { e } of list) for (const [d, b] of Object.entries(e.days)) if (inRange.has(d) && (!days[d] || b.a > days[d].a)) days[d] = b
    const dkeys = Object.keys(days).sort()
    if (!dkeys.length) continue
    const r = projectOfSid(sid, primary.f.pd, primary.f.home)
    const ts = Math.max(...list.map((x) => x.e.lts ?? 0))
    // connected-office patch: the other repos this session worked in get their share of each day's bucket; the
    // session itself (count, model, title, edited files) stays with its main project, so totals never count it twice.
    const share = splitShares(primary.e.cm, dkeys, ctx.resolver, r)
    for (const [, x] of share.others) items.push({ r: x.r, ts, apply: (P) => {
      for (const d of dkeys) if (x.f[d] > 0) addBucket(P, d, scaleBucket(days[d], x.f[d], false), true)
    } })
    items.push({ r, ts, apply: (P) => {
      P.sessions.add(sid)
      let ms = 0
      // per_day.sessions = sessions active that day (a 3-day session counts on all three), like the today view
      for (const d of dkeys) { const own = scaleBucket(days[d], share.main[d] ?? 1, true); dayRec(P, d).sessions++; addBucket(P, d, own, true); ms += own.a }
      const model = topKey(primary.e.models)
      if (model) P.models[model] = (P.models[model] ?? 0) + 1
      const title = primary.e.ct || primary.e.at
      if (title) P.titles.set(title, (P.titles.get(title) ?? 0) + ms + 1)
      if (r.worktree) P.worktrees.add(r.worktree)
    } })
  }
  for (const { f, e } of synced) {
    if (e.kind !== 'sub') continue
    const dkeys = Object.keys(e.days).filter((d) => inRange.has(d)).sort()
    if (!dkeys.length) continue
    const r = projectOfSid(e.sid, f.pd, f.home, topCwd(e))
    items.push({ r, ts: e.lts ?? 0, apply: (P) => {
      P.subagents++
      P.intern_types[e.type] = (P.intern_types[e.type] ?? 0) + 1
      for (const d of dkeys) { dayRec(P, d).subagents++; addBucket(P, d, e.days[d], false) }
    } })
  }
  // the other agents' sessions: a session is a desk's worth of work like Claude's, a subagent an intern's, each booked
  // under its own agent (a project's `agents` says how much of its agent-time was whose); a subagent works in its
  // parent's project
  const otherMain = new Map(others.synced.filter((x) => x.e.kind === 'main').map((x) => [`${x.home.agent}:${x.e.sid}`, x.e]))
  for (const { e, home } of others.synced) {
    const dkeys = Object.keys(e.days).filter((d) => inRange.has(d)).sort()
    if (!dkeys.length) continue
    const parent = e.kind === 'sub' && e.par ? otherMain.get(`${home.agent}:${e.par}`) : null
    const r = ctx.resolver.resolve(topCwd(parent ?? e) ?? topCwd(e) ?? '')
    const sid = `${home.agent}:${e.sid}`
    items.push({ r, ts: e.lts ?? 0, apply: (P) => {
      if (e.kind === 'sub') {
        P.subagents++
        P.intern_types['general-purpose'] = (P.intern_types['general-purpose'] ?? 0) + 1
        for (const d of dkeys) { dayRec(P, d).subagents++; addBucket(P, d, e.days[d], false, home.agent) }
        return
      }
      P.sessions.add(sid)
      let ms = 0
      for (const d of dkeys) { dayRec(P, d).sessions++; addBucket(P, d, e.days[d], true, home.agent); ms += e.days[d].a }
      const model = topKey(e.models) ?? home.agent
      P.models[model] = (P.models[model] ?? 0) + 1
      if (e.ct) P.titles.set(e.ct, (P.titles.get(e.ct) ?? 0) + ms + 1)
    } })
  }
  // a page of the past: the sessions Claude Code's old index names, whose transcripts went before the cache knew them
  let indexed = []
  if (range.back && walk.indexes.length) {
    const known = new Set(walk.mains.map((m) => m.sid))
    for (const e of Object.values(ctx.cache.files)) if (e.kind === 'main' && !e.ag) known.add(e.sid)
    indexed = indexedSessions(ctx, walk.indexes, known)
  }
  for (const s of indexed) {
    items.push({ r: s.r, ts: s.ts, apply: (P) => {
      P.sessions.add(s.sid)
      for (const d of s.days) dayRec(P, d).sessions++
    } })
  }
  const runStarts = new Map()
  for (const w of walk.wfs) {
    try {
      const info = workflowInfo(ctx, w)
      // the json is written when the run ends: its mtime is the end of the meeting
      runStarts.set(w.runId, { start: info.start, sid: w.sid, pd: w.pd, home: w.home, end: info.mtime, name: info.name, agents: info.agents })
    } catch {}
  }
  for (const run of [...walk.runs, ...kept.runs]) if (!runStarts.has(run.runId)) runStarts.set(run.runId, run)
  for (const [runId, run] of runStarts) {
    const d = localDay(run.start)
    if (!inRange.has(d)) continue
    const r = projectOfSid(run.sid, run.pd, run.home)
    items.push({ r, ts: run.start, apply: (P) => { P.workflows.add(runId); dayRec(P, d).workflows++ } })
  }
  for (const desk of desks) {
    const r = ctx.resolver.resolve(desk.project_path)
    items.push({ r, ts: nowMs, apply: (P) => {
      P.live.desks++
      // same split as live.counts: an asking desk is waiting on the user, not busy
      if (desk.state === 'idle') P.live.idle++
      else if (desk.state === 'asking') P.live.waiting++
      else P.live.busy++
      P.live.interns += desk.interns.length
      P.live.meetings += desk.meetings.length
    } })
  }

  // a non-git cwd under a known project (deleted subdir, `output/…`) belongs to that project
  const gitPaths = [...new Set(items.filter((i) => i.r.git).map((i) => i.r.path))]
  const rollUp = (r) => {
    if (r.git) return r
    const anc = gitPaths.filter((p) => r.path.startsWith(`${p}/`) || r.path.startsWith(`${p}${path.sep}`)).sort((a, b) => b.length - a.length)[0]
    return anc ? { ...r, path: anc, name: path.basename(anc), git: true } : r
  }
  const projects = new Map()
  for (const it of items) {
    const r = rollUp(it.r)
    let P = projects.get(r.path)
    if (!P) projects.set(r.path, (P = newProject(r)))
    if (it.ts > P.lastTs) P.lastTs = it.ts
    it.apply(P)
  }

  // git + novi (parallel)
  const tGit = performance.now()
  let commitCount = 0
  if (useGit) {
    // every repo Claude worked in during the last 63 days is listed, not only this range's: a repo that got
    // commits today but no session today is still a project of today (SPEC: active = any session…/commit)
    const remember = (p, ts) => {
      if (!path.isAbsolute(p) || !(ts >= nowMs - REPO_MS)) return
      const at = Math.min(ts, nowMs)
      if (ctx.cache.repos[p] >= at) return
      if (ctx.cache.repos[p] == null) ctx.dirty = true
      ctx.cache.repos[p] = at
    }
    for (const P of projects.values()) if (P.git) remember(P.path, P.lastTs)
    // the repos of the sessions outside this range: each was remembered while it was in one, a run with the cold tier checks
    if (coldLoaded) {
      for (const e of Object.values(ctx.cache.files)) {
        if (e.kind !== 'main' || !(e.lts >= nowMs - REPO_MS)) continue
        const r = projectOfMain(e)
        if (r?.git) remember(r.path, e.lts)
      }
    }
    const active = [...projects.values()].filter((P) => P.git && path.isAbsolute(P.path)).map((P) => P.path)
    const extra = Object.entries(ctx.cache.repos)
      .filter(([p, at]) => at >= nowMs - REPO_MS && !projects.has(p) && statSafe(path.join(p, '.git')))
      .sort((a, b) => b[1] - a[1]).map(([p]) => p)
    const repos = [...active, ...extra].slice(0, 60)
    try {
      // a page of the past looks in every repo Claude Code was opened in: a month whose sessions are gone left only commits
      if (range.back) repos.push(...pastRepos(ctx, claudeHomes, new Set(repos)))
      ctx.progress?.step(3, repos.length)
      const commits = await collectGit(ctx, repos, new Set(active))
      for (const cm of commits) {
        const d = localDay(cm.ms)
        if (!inRange.has(d)) continue
        let P = projects.get(cm.repo)
        if (!P) projects.set(cm.repo, (P = newProject({ name: path.basename(cm.repo), path: cm.repo, git: true })))
        P.commits.push(cm)
        dayRec(P, d).commits++
        commitCount++
      }
    } catch (err) {
      ctx.log(`git: ${err?.message}`)
    }
    if (ctx.gitErrors) notes.push(`git failed in ${ctx.gitErrors} repo${ctx.gitErrors > 1 ? 's' : ''}`)
    if (ctx.gitStatsPartial) notes.push('git line stats partial (slow repo)')
  } else notes.push('git skipped')
  const msGit = performance.now() - tGit
  const novi = await noviJob.result.catch(() => ({ status: 'error', list: [] }))
  if (novi.status === 'error') notes.push('novi unavailable')

  // filter, finish, sort
  const pf = opts.project ? String(opts.project).toLowerCase() : null
  const match = (name) => !pf || String(name ?? '').toLowerCase().includes(pf)
  // a page of the past lists the rooms that worked in it, busiest first, sessions with no agent-time left (indexed) before
  // commits: a desk open now says nothing of January (its project still asked git, above, and the floor of now is drawn
  // over the page by name)
  const isPage = !!range.back
  const worked = (P) => P.sessions.size > 0 || P.subagents > 0 || P.workflows.size > 0 || P.commits.length > 0
  const all = [...projects.values()].filter((P) => match(P.name) && (!isPage || worked(P))).map((P) => finishProject(P, range.days))
  all.sort(isPage
    ? (a, b) => b.agent_minutes - a.agent_minutes || b.sessions - a.sessions || b.commits - a.commits || b.live.desks - a.live.desks || a.name.localeCompare(b.name)
    : (a, b) => b.agent_minutes - a.agent_minutes || b.live.desks - a.live.desks || b.commits - a.commits || a.name.localeCompare(b.name))

  // the timelapse, from what this run synced and booked: a session's project is the one the facts booked it into
  let timeline = null
  let msLapse = 0
  if (lapse) {
    const tLapse = performance.now()
    const names = new Map()
    const nameOf = (r) => {
      if (!names.has(r)) {
        const x = rollUp(r)
        names.set(r, projects.get(x.path)?.name ?? x.name)
      }
      return names.get(r)
    }
    try {
      timeline = buildTimeline(range, nowMs, {
        mains: mainBySid, claude: synced, others: others.synced, runs: runStarts, live: desks, projects,
        projectOfSid, resolve: ctx.resolver.resolve, nameOf, match,
      })
    } catch (err) {
      ctx.log(`timeline: ${err?.stack ?? err}`)
      notes.push('timeline unreadable')
    }
    msLapse = performance.now() - tLapse
  }

  // a session still open is not one that just left, at its desk or gone home (its coat is in wentHome)
  let left = []
  try { left = recentlyLeft(ctx, walk.mains, openSids) } catch (err) { ctx.log(`recently_left: ${err?.message}`) }
  left = [...left, ...wentHome, ...others.left].sort((a, b) => b._ms - a._ms).slice(0, 5).map(({ _ms, ...x }) => x)
  const shownDesks = desks.filter((d) => match(d.project)).map(({ _sid, ...d }) => d)
  const counts = { desks: shownDesks.length, busy: 0, idle: 0, waiting: 0, interns: 0, meetings: 0, meeting_agents: 0 }
  for (const d of shownDesks) {
    if (d.state === 'idle') counts.idle++
    else if (d.state === 'asking') counts.waiting++
    else counts.busy++
    counts.interns += d.interns.length
    counts.meetings += d.meetings.length
    counts.meeting_agents += d.meetings.reduce((s, m) => s + m.agents_running, 0)
  }

  const totals = {
    projects: all.length, sessions: 0, subagents: 0, workflows: 0, desk_minutes: 0, agent_minutes: 0, prompts: 0, tool_calls: 0,
    files_edited: 0, commits: 0, additions: 0, deletions: 0, tokens_in: 0, tokens_out: 0, activity: emptyActivity(), intern_types: {}, models: {},
    agents: {},
  }
  const per_day = {}
  for (const d of range.days) per_day[d] = { minutes: 0, desk_minutes: 0, sessions: 0, subagents: 0, workflows: 0, prompts: 0, commits: 0 }
  const per_hour = new Array(24).fill(0)
  let deskMs = 0
  let agentMs = 0
  const dayMs = {}
  const edits = new Set()
  for (const P of projects.values()) {
    if (!match(P.name)) continue
    deskMs += P.deskMs
    agentMs += P.agentMs
    for (const h of P.edits) edits.add(h)
    for (const [d, r] of Object.entries(P.days)) {
      if (!per_day[d]) continue
      const x = (dayMs[d] ??= { ms: 0, deskMs: 0 })
      x.ms += r.ms
      x.deskMs += r.deskMs
      per_day[d].sessions += r.sessions
      per_day[d].subagents += r.subagents
      per_day[d].workflows += r.workflows
      per_day[d].prompts += r.prompts
      per_day[d].commits += r.commits
    }
    P.hours.forEach((ms, h) => { per_hour[h] += ms })
  }
  for (const [d, x] of Object.entries(dayMs)) {
    per_day[d].minutes = minutes(x.ms)
    per_day[d].desk_minutes = minutes(x.deskMs)
  }
  for (const p of all) {
    for (const k of ['sessions', 'subagents', 'workflows', 'prompts', 'tool_calls', 'commits', 'additions', 'deletions', 'tokens_in', 'tokens_out']) totals[k] += p[k]
    addCounts(totals.activity, p.activity)
    addCounts(totals.intern_types, p.intern_types)
    addCounts(totals.models, p.models)
  }
  // agent-time per agent over every matching project (the list is capped, the split is not)
  const byAgent = {}
  for (const P of projects.values()) if (match(P.name)) addCounts(byAgent, P.byAgent)
  totals.agents = Object.fromEntries(Object.entries(byAgent).map(([a, ms]) => [a, minutes(ms)]).filter(([, m]) => m > 0))
  totals.desk_minutes = minutes(deskMs)
  totals.agent_minutes = minutes(agentMs)
  totals.files_edited = edits.size

  // cache upkeep (a first light writes nothing: the run that reads the week right after it does)
  if (cacheDir && !firstLight) {
    if (coldLoaded && pruneCache(ctx.cache, nowMs, ctx.listed, ctx.seen)) ctx.dirty = true
    const isBig = ctx.grew >= SAVE_BYTES
    const canWait = opts.series && !isBig && !ctx.dirty && nowMs - ctx.cache.savedAt < SAVE_EVERY_MS
    // a tier whose entries were decided for good (judgeGone) is rewritten with them, or the next run would decide again
    const withArchive = coldLoaded && archiveLoaded && (!!opts.resetCache || archiveDue || isBig || ctx.touched.archive)
    const withCold = coldLoaded && (!!opts.resetCache || coldDue || isBig || withArchive || ctx.touched.cold)
    if ((ctx.dirty || ctx.changed) && !canWait && !saveCache(cacheDir, ctx.cache, { withCold, withArchive, nowMs })) notes.push('cache not writable')
    if (Object.keys(ctx.walked ?? {}).length) saveWalks(cacheDir, { at: ctx.walks?.at ?? nowMs, from: ctx.walks?.from ?? ctx.fromMs, homes: { ...ctx.walks?.homes, ...ctx.walked } })
  } else if (!cacheDir) notes.push('cache disabled')

  // novi's visitors are the agents the office has no reader for (Aider, Amp, Cline…): one it reads itself is a tenant
  const noviAgent = (tool) => NOVI_AGENT[String(tool).toLowerCase()] ?? String(tool).toLowerCase()
  const contractors = novi.list
    .filter((c) => match(c.project) && !others.read.has(noviAgent(c.tool)))
    .map((c) => ({ ...c, live: !!c.end && nowMs - Date.parse(c.end) < 5 * 60e3 }))
    .sort((a, b) => Number(b.live) - Number(a.live) || (b.end ?? '').localeCompare(a.end ?? ''))
    .slice(0, 12)

  const facts = {
    spec: SPEC,
    generated_at: iso(nowMs),
    range,
    now: nowInfo(nowMs),
    live: { counts, desks: shownDesks, recently_left: left.filter((l) => match(l.project)) },
    projects: all.slice(0, PROJECT_CAP),
    projects_more: Math.max(0, all.length - PROJECT_CAP),
    contractors,
    accounts: accountsOf(homes, synced, others, desks, inRange, pf ? match : null, ctx.resolver, indexed),
    totals,
    per_day,
    per_hour: per_hour.map(minutes),
    ...(timeline ? { timeline } : {}),
    sources: {
      claude_dir: claudeDir,
      homes: homes.map((h) => ({ agent: h.agent, label: h.label, dir: h.dir })),
      watch: others.watch.slice(0, 32),
      files_scanned: walk.files.length,
      files_from_cache: fromCache,
      // Claude's sessions counted from Claude Code's old index alone, and from what the cache kept of the ones its cleanup
      // deleted (judgeGone): their transcripts are gone
      sessions_indexed: indexed.length,
      sessions_kept: kept.files.filter((x) => x.e.kind === 'main').length,
      cache_path: cacheDir ? cacheFile(cacheDir) : null,
      git_repos: useGit ? [...projects.values()].filter((P) => P.git && match(P.name)).length : 0,
      novi: novi.status,
      ms: {
        total: Math.round(performance.now() - t0), live: Math.round(msLive), history: Math.round(msHist), git: Math.round(msGit),
        ...(lapse ? { timeline: Math.round(msLapse) } : {}),
      },
    },
    notes,
    ...(firstLight ? { first_light: true } : {}),
  }
  ctx.log(`view=${view} files=${walk.files.length} cached=${fromCache} commits=${commitCount} ms=${JSON.stringify(facts.sources.ms)}`)
  return facts
}

/**
 * The accounts the office read, one per home (`{ agent, label, minutes, sessions, live }`, label null when the agent has
 * one account): agent-time and sessions in the range, desks open now. Homes that did nothing in the range are left out,
 * unless they are the agent's only one and have a desk.
 */
function accountsOf(homes, claudeSynced, others, desks, inRange, match, resolver, indexed = []) {
  const by = new Map(homes.map((h) => [h, { agent: h.agent, label: h.label, ms: 0, sessions: new Set(), live: 0 }]))
  const book = (home, e) => {
    const a = by.get(home)
    if (!a || (match && !match(resolver.resolve(topCwd(e) ?? '').name))) return
    for (const [d, b] of Object.entries(e.days)) {
      if (!inRange.has(d)) continue
      a.ms += b.a
      if (e.kind === 'main') a.sessions.add(e.sid)
    }
  }
  for (const { f, e } of claudeSynced) book(f.home, e)
  for (const { e, home } of others.synced) book(home, e)
  // a session only Claude Code's old index names: its account's, with no agent-time
  for (const s of indexed) if (by.has(s.home) && (!match || match(s.r.name))) by.get(s.home).sessions.add(s.sid)
  for (const d of desks) {
    const h = homes.find((x) => x.agent === (d.agent ?? 'claude') && x.label === (d.account ?? null))
    if (h && (!match || match(d.project))) by.get(h).live++
  }
  return [...by.values()].filter((a) => a.ms > 0 || a.live > 0 || a.sessions.size > 0)
    .map((a) => ({ agent: a.agent, label: a.label, minutes: Math.round(a.ms / 60_000), sessions: a.sessions.size, live: a.live }))
    .sort((x, y) => y.minutes - x.minutes || y.live - x.live)
}

export { KINDS }
