// Tells the dashboard when the office may have changed, without running the collector: it looks at what the Claude pane's
// watcher looks at (hooks/register.tsx `signature`), with node:fs, and the dashboard then pushes a nudge to its open
// pages (lib/dashboard.mjs /events), which ask for their drawing again. Read only: stats, a directory listing, and the
// small session records Claude Code writes (`<claude dir>/sessions/<pid>.json`), never a transcript's contents.
//
// What moves, and how soon it is told:
// - `state`: a session starting, ending or changing status (its record), an intern starting or a meeting ending (the
//   session's `subagents` and `workflows` folders). Told at once: a hand going up is the thing worth seeing.
// - `activity`: a live session's transcript growing, with every turn and tool call. Told at most every ACTIVITY_GAP_MS.
// - `others`: another agent's session files, as the facts name them (`sources.watch`). Told at most every OTHERS_GAP_MS.
// - a beat every BEAT_MS whatever moved: commits, visitors, anything that is in no file looked at here.
// Looks never overlap; a look that stalls (a blocked folder) only delays the next one.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const LOOK_MS = 1_500
export const ACTIVITY_GAP_MS = 15_000
export const OTHERS_GAP_MS = 5_000
export const BEAT_MS = 60_000

const SESSION_RE = /^\d+\.json$/
const SESSION_ID_RE = /^[A-Za-z0-9-]{1,80}$/
const WIN_ABS_RE = /^[A-Za-z]:[\\/]/
const UP_RE = /[\\/]\.\.(?:[\\/]|$)/
const MAX_SESSIONS = 64
const MAX_OTHERS = 32
const MAX_RECORD = 64 * 1024

/** A path's mtime (and size, for a file), or '-' when it is not there. */
async function stamp(file, withSize) {
  try {
    const stat = await fs.stat(file)
    return withSize ? `${stat.mtimeMs}:${stat.size}` : `${stat.mtimeMs}`
  } catch {
    return '-'
  }
}

/** A session record's id and folder, or nulls when it is not one: the watcher never guesses a path. */
async function sessionOf(file) {
  try {
    const stat = await fs.stat(file)
    if (!stat.isFile() || stat.size > MAX_RECORD) return { sessionId: null, cwd: null }
    const record = JSON.parse(await fs.readFile(file, 'utf8'))
    const sessionId = typeof record?.sessionId === 'string' && SESSION_ID_RE.test(record.sessionId) ? record.sessionId : null
    const cwd = typeof record?.cwd === 'string' && (record.cwd.startsWith('/') || WIN_ABS_RE.test(record.cwd)) ? record.cwd : null
    return { sessionId, cwd }
  } catch {
    return { sessionId: null, cwd: null }
  }
}

/**
 * The files another agent writes as it works, as the facts name them: absolute paths under `home`, no `..` step, at most
 * MAX_OTHERS. Anything else is ignored.
 */
export function othersOf(facts, home = os.homedir()) {
  const list = facts?.sources?.watch
  if (!Array.isArray(list) || !home) return []
  const isUnder = (p) => (p.startsWith(`${home}/`) || p.startsWith(`${home}\\`)) && !UP_RE.test(p)
  return list.filter((p) => typeof p === 'string' && isUnder(p)).slice(0, MAX_OTHERS)
}

/** The Claude config folders the facts read (one per account), else the default one. */
export function claudeDirsOf(facts, home = os.homedir()) {
  const dirs = Array.isArray(facts?.sources?.homes)
    ? facts.sources.homes.filter((h) => h?.agent === 'claude' && typeof h.dir === 'string' && path.isAbsolute(h.dir) && !UP_RE.test(h.dir)).map((h) => h.dir)
    : []
  if (!dirs.length && home) dirs.push(path.join(home, '.claude'))
  return [...new Set(dirs)].slice(0, 8)
}

/** One look: what the sessions of each Claude folder and the other agents' files say right now. */
export async function signature({ claudeDirs = [], others = [], records = new Map() } = {}) {
  const state = []
  const noise = []
  const seen = new Set()
  for (const root of claudeDirs) {
    const dir = path.join(root, 'sessions')
    let names
    try {
      names = (await fs.readdir(dir)).filter((name) => SESSION_RE.test(name)).sort().slice(0, MAX_SESSIONS)
    } catch {
      state.push(`${root}:none`)
      continue
    }
    const parts = await Promise.all(names.map(async (name) => {
      const file = path.join(dir, name)
      seen.add(file)
      const own = await stamp(file, true)
      let record = records.get(file)
      if (record?.stamp !== own) {
        record = { stamp: own, ...(await sessionOf(file)) }
        records.set(file, record)
      }
      if (!record.sessionId || !record.cwd) return { state: `${name}:${own}`, noise: '' }
      const base = path.join(root, 'projects', record.cwd.replace(/[^A-Za-z0-9]/g, '-'), record.sessionId)
      const [transcript, subagents, workflows] = await Promise.all([stamp(`${base}.jsonl`, true), stamp(path.join(base, 'subagents'), false), stamp(path.join(base, 'workflows'), false)])
      const meetings = subagents === '-' ? '' : await stamp(path.join(base, 'subagents', 'workflows'), false)
      return { state: `${name}:${own}>${subagents},${workflows},${meetings}`, noise: `${name}:${transcript}` }
    }))
    for (const part of parts) {
      state.push(part.state)
      noise.push(part.noise)
    }
  }
  for (const file of [...records.keys()]) if (!seen.has(file)) records.delete(file)
  const stamps = await Promise.all(others.map((file) => stamp(file, true)))
  return { state: state.join('|'), noise: noise.join('|'), others: stamps.join(',') }
}

/**
 * Starts looking every `lookMs` and calls `onChange(why)` ('state', 'activity', 'others' or 'beat') as the gaps above
 * allow. `sources()` hands the latest facts' folders and files ({ claudeDirs, others }), read at each look. The first look
 * only notes where things stand. Returns `stop()`.
 */
export function watchOffice({ onChange, sources = () => ({}), lookMs = LOOK_MS, activityGapMs = ACTIVITY_GAP_MS, othersGapMs = OTHERS_GAP_MS, beatMs = BEAT_MS, now = Date.now, look = signature } = {}) {
  const records = new Map()
  let seen = null
  let told = now()
  let timer = null
  let stopped = false
  const tell = (why, current) => {
    seen = current
    told = now()
    try { onChange(why) } catch { /* a listener's failure never stops the watch */ }
  }
  const tick = async () => {
    timer = null
    if (stopped) return
    try {
      const { claudeDirs = claudeDirsOf(null), others = [] } = sources() ?? {}
      const current = await look({ claudeDirs, others, records })
      if (stopped) return
      const since = now() - told
      if (seen === null) seen = current
      else if (current.state !== seen.state) tell('state', current)
      else if (current.noise !== seen.noise && since >= activityGapMs) tell('activity', current)
      else if (current.others !== seen.others && since >= othersGapMs) tell('others', current)
      else if (since >= beatMs) tell('beat', current)
    } catch { /* the next look tries again */ }
    if (!stopped) timer = setTimeout(tick, lookMs)
  }
  timer = setTimeout(tick, 0)
  return {
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}
