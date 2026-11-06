// Node: what every transcript reader books into a cache entry (Claude's in collect.mjs, the other agents' in agents.mjs):
// per local day, active time (gaps capped), prompts, tool calls by kind, edited files, tokens and active time per hour
// and per quarter of an hour; plus the small read-only fs helpers both use. Never writes.
import fs from 'node:fs'

/** Gaps between two events count as active time up to this (5 minutes); anything longer was the agent waiting. */
export const GAP_MS = 300e3
const EDIT_CAP = 200

const pad2 = (n) => String(n).padStart(2, '0')

/** Epoch ms → ISO string, or null when it is not a finite number. */
export const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null)

/** Local calendar day `YYYY-MM-DD` of an epoch-ms instant (transcript timestamps are UTC). */
export function localDay(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// Hot path: consecutive transcript lines are almost always on the same local day.
let dayLo = 0
let dayHi = -1
let dayKey = ''
function dayOf(ms) {
  if (ms >= dayLo && ms < dayHi) return dayKey
  const d = new Date(ms)
  dayLo = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  dayHi = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  dayKey = localDay(ms)
  return dayKey
}

// Cache entry shape (short keys: thousands of these live in the cache file):
//   { kind:'main'|'sub', sid, agent?, type?, run?, ino, size, mtime, off, partial?,
//     cwds:{cwd:n}, ct?, at?, wt?, branch?, models:{m:n}, prev, fts, lts, mk, mi, mo, md, ne,
//     days:{ 'YYYY-MM-DD': { a: activeMs, p: prompts, t: toolCalls, k:{kind:n}, e:[editHash], i: tokIn, o: tokOut, h:{hour:ms},
//                            q?:{quarter:ms} } } }
// `q` is the day by wall-clock quarter of an hour (hour * 4 + minute / 15, 0..95), what the timelapse replays yesterday
// in. Buckets cached before it have none and never get one by appending. A version from before quarters that shares the
// cache appends to `a` and `h` only, so a q that does not add up to `a` is short, and read as missing (collect.mjs).
// The other agents' entries add `ag` (agent id), `par` (a sub's parent session) and fields of their own reader.
export function newBucket() {
  return { a: 0, p: 0, t: 0, k: {}, e: [], i: 0, o: 0, h: {}, q: {} }
}

let lastDay = ''

/** The day the last touch() booked into (the bucket it returned is that day's). */
export const touchedDay = () => lastDay

/**
 * Register one timestamped event: active time is `min(gap, cap)` (5 minutes unless the reader knows better), booked on
 * the later event's local day/hour/quarter. Returns that day's bucket, or null for a time that is not one.
 */
export function touch(e, ms, cap = GAP_MS) {
  if (!(ms > 0)) return null
  const day = dayOf(ms)
  lastDay = day
  const b = (e.days[day] ??= newBucket())
  if (e.prev != null && ms > e.prev) {
    const gap = Math.min(ms - e.prev, cap)
    b.a += gap
    const d = new Date(ms)
    const h = d.getHours()
    b.h[h] = (b.h[h] ?? 0) + gap
    // a bucket cached without quarters keeps none: half a day of them would replay as half a day of work
    if (b.q) {
      const q = h * 4 + Math.floor(d.getMinutes() / 15)
      b.q[q] = (b.q[q] ?? 0) + gap
    }
  }
  if (e.prev == null || ms > e.prev) e.prev = ms
  if (e.fts == null || ms < e.fts) e.fts = ms
  if (e.lts == null || ms > e.lts) e.lts = ms
  return b
}

/** FNV-1a: edited paths are stored as 32-bit hashes — we only ever need distinct counts, and it keeps the cache small. */
export function fnv1a(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** One edited file into the bucket (a path counts once per day, and a file entry stops counting at 200). */
export function addEdit(e, b, p) {
  if (typeof p !== 'string' || !p || (e.ne ?? 0) >= EDIT_CAP) return
  const h = fnv1a(p)
  if (b.e.includes(h)) return
  b.e.push(h)
  e.ne = (e.ne ?? 0) + 1
}

/** The key with the highest count in a `{ key: n }` map (null when empty). */
export function topKey(obj) {
  let best = null
  let n = -1
  for (const [k, c] of Object.entries(obj ?? {})) if (c > n) { best = k; n = c }
  return best
}

/** An entry's most frequent working directory. */
export const topCwd = (e) => topKey(e?.cwds)

// ---------------------------------------------------------------- small fs helpers

export function readdirSafe(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }) } catch { return [] }
}

export function statSafe(p) {
  // a thrown ENOENT costs more than the stat: a walk asks after many a folder that is not there
  try { return fs.statSync(p, { throwIfNoEntry: false }) ?? null } catch { return null }
}

export function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return null }
}
