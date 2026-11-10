// Incremental per-file checkpoint cache. Transcripts are append-only JSONL, so a file we have seen is only
// ever re-read from its last complete line: warm runs touch a few KB instead of gigabytes.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const CACHE_VERSION = 1
/**
 * How long the cache keeps a file that is still there: a page of the past up to a year back reads its days from the
 * archive tier, not from the transcripts and the agents' archives again (August took 13 to 74 s at 62 days, 1 to 3 s so).
 */
const PRUNE_MS = 400 * 864e5
/** What the hot tier holds: 9 days, so the week (7 days, and folders a day older) never needs the cold tier. */
export const HOT_MS = 9 * 864e5
/**
 * What the cold tier holds: 63 days, all that a range of now reaches (the month's: last month and this one so far, 62
 * days at most, and a day's margin); older files go to the archive tier, which only a page further back reads, so a
 * year of it costs the Month tab nothing.
 */
export const COLD_MS = 63 * 864e5
/** Moving what aged out of the cold tier to the archive reads and rewrites the archive: once a day at most. */
export const ARCHIVE_EVERY_MS = 864e5
/**
 * A file born this recently has no entry in the cold tier, whichever version wrote it (older ones kept 36 h hot): a run
 * that meets one knows it is new, and does not load 9 MB to find that out.
 */
export const NEW_FILE_MS = 36 * 3600e3

/**
 * Whether a file was born within NEW_FILE_MS of `nowMs`. A copy that kept its times (a restore, a move to a new
 * machine) is as old as its mtime: macOS moves the birth back with the mtime, Linux and Windows keep the copy's, so
 * the older of the two is its birth. A file system with no birth time (0) never says new.
 */
export function isNewFile(st, nowMs) {
  return st.birthtimeMs > 0 && Math.min(st.birthtimeMs, st.mtimeMs) >= nowMs - NEW_FILE_MS
}
/** Rewriting the cold tier is the dearest thing a run does: what aged out of the hot tier moves there at most this often. */
export const COLD_EVERY_MS = 3600e3
/**
 * In a series of runs (the pane's), a hot tier that only learnt that transcripts grew waits this long for its next write,
 * or until this many bytes were read: the next run just reads those few lines again.
 */
export const SAVE_EVERY_MS = 30e3
export const SAVE_BYTES = 1 << 20
/** How long a series of runs keeps a walk of the other agents' files. */
const WALK_MS = 60e3
/** Commit lists (a repo's store of now, its store of pages of the past) carry line stats that cost seconds: kept a week. */
export const GIT_KEEP_MS = 7 * 864e5
/** Git repos Claude worked in during the last 63 days stay on the git list (the month view's 62 days at most, + a day). */
export const REPO_MS = 63 * 864e5
const CHUNK = 65_536

// ---------------------------------------------------------------- location & lifecycle

/** `THEOFFICE_CACHE_DIR` > `$CLAUDE_PLUGIN_DATA` (kept across plugin updates) > `~/.cache/theoffice`. */
export function defaultCacheDir(env = process.env) {
  return env.THEOFFICE_CACHE_DIR || env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(), '.cache', 'theoffice')
}

/**
 * The cache is split in three files: `cache-v1.json` (hot: files touched in the last 9 days + git/novi/workflow
 * results) is all the live, today and week views load, so they stay fast; `cache-v1-cold.json` (files up to 63 days
 * old) is only read by the month, a range further back, once an hour to take in what aged out of the hot tier, or when
 * a run meets a file older than a day and a half that has no hot entry; `cache-v1-archive.json` (older files, up to
 * PRUNE_MS, and the kept sessions for good: keptSessions) only by a page of the past further back than that, and once a
 * day to take in what aged out of the cold tier. Versions that kept 36 h hot may share these files: an entry of theirs in
 * the cold tier is found that way.
 */
export function cacheFile(dir) {
  return path.join(dir, `cache-v${CACHE_VERSION}.json`)
}

export function coldCacheFile(dir) {
  return path.join(dir, `cache-v${CACHE_VERSION}-cold.json`)
}

/** The archive tier: files older than COLD_MS, up to PRUNE_MS, read by a page of the past further back than the cold tier. */
export function archiveCacheFile(dir) {
  return path.join(dir, `cache-v${CACHE_VERSION}-archive.json`)
}

/**
 * Day buckets are local-time keys computed at parse time, so the hot tier, the week on screen, is cut again in a new
 * zone: the signature (zone name + winter/summer offsets) says which one it was cut in. Nothing else is: the cold tier's
 * days are over and stay as they were lived (rebuilding a month takes a minute and gigabytes, and a trip moves the zone
 * twice, asleep in a bag, macOS renaming it on the way: Europe/Paris, Asia/Seoul, Asia/Tokyo).
 */
export function tzSignature() {
  let name = ''
  try { name = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '' } catch {}
  return `${name}${tzOffsets()}`
}

const tzOffsets = () => `|${new Date(2026, 0, 15).getTimezoneOffset()}|${new Date(2026, 6, 15).getTimezoneOffset()}`

/** Whether a cache's signature fits this zone. Only the offsets, what a day bucket depends on: the name costs ICU ~10 ms a run. */
const sameZone = (tz) => typeof tz === 'string' && tz.endsWith(tzOffsets())

export function emptyCache() {
  return { v: CACHE_VERSION, tz: tzSignature(), files: {}, wf: {}, git: {}, novi: {}, slugs: {}, repos: {}, links: {}, families: {} }
}

// ---------------------------------------------------------------- validation

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const optStr = (v) => v == null || typeof v === 'string'

// `q` (quarters of an hour) came later: a bucket cached before it is still a good bucket, it has no quarters
function validBucket(b) {
  return isObj(b) && isNum(b.a) && isNum(b.p) && isNum(b.t) && isNum(b.i) && isNum(b.o) && isObj(b.k) && Array.isArray(b.e) && isObj(b.h) &&
    (b.q === undefined || isObj(b.q))
}

/** A workflow run a kept session carries (collect.mjs judgeGone), its json gone with the session's folder. */
const validRun = (r) => isObj(r) && typeof r.id === 'string' && isNum(r.start) && isNum(r.end) && isNum(r.agents) && optStr(r.name)

/**
 * A file entry is reused only when every field the collector dereferences has the right type: a cache
 * that is valid JSON but the wrong shape (hand-edited, or a format change without a version bump) must
 * cost a re-parse of that file, never a crash on every run.
 */
export function validEntry(e) {
  if (!isObj(e) || (e.kind !== 'main' && e.kind !== 'sub') || !isObj(e.days) || !isObj(e.cwds) || !isObj(e.models)) return false
  if (!isNum(e.ino) || !isNum(e.size) || !isNum(e.mtime) || !isNum(e.off)) return false
  if (!optStr(e.ct) || !optStr(e.at) || (e.wt != null && !(isObj(e.wt) && typeof e.wt.path === 'string'))) return false
  if (e.mk != null && !(isNum(e.mi) && isNum(e.mo))) return false
  if (e.runs != null && !(Array.isArray(e.runs) && e.runs.every(validRun))) return false
  for (const b of Object.values(e.days)) if (!validBucket(b)) return false
  return true
}

/**
 * The folder of a Claude session a cache key is of, `<home prefix><project folder>/<sid>`: its main transcript's key is
 * this + `.jsonl`, its subagents' and workflow runs' keys begin with it + `/`. Null for a key too short to be one.
 */
export function sessionKey(k) {
  const at = k.startsWith('@') ? k.indexOf('/') + 1 : 0
  const i = at === 0 && k.startsWith('@') ? -1 : k.indexOf(path.sep, at)
  if (i <= at) return null
  const j = k.indexOf(path.sep, i + 1)
  return j !== -1 ? k.slice(0, j) : k.endsWith('.jsonl') ? k.slice(0, -6) : null
}

/**
 * The sessions whose main transcript is stamped `kept` (collect.mjs judgeGone: Claude Code's cleanup deleted it), by
 * sessionKey: they and their subagents are the only copy there is, which neither a file going nor age drops.
 */
export function keptSessions(cache) {
  const out = new Set()
  for (const [k, e] of Object.entries(cache.files)) if (e.kind === 'main' && !e.ag && isNum(e.kept) && k.endsWith('.jsonl')) out.add(k.slice(0, -6))
  return out
}

/** Whether an entry is a kept session's (keptSessions `kept`): its main transcript, or a subagent of it. */
export function isKept(kept, k, e) {
  if (!kept.size || e.ag) return false
  if (e.kind === 'main') return isNum(e.kept)
  const s = sessionKey(k)
  return s != null && kept.has(s)
}

const validCommit = (cm) => isObj(cm) && typeof cm.sha === 'string' && typeof cm.short === 'string' && typeof cm.subject === 'string' &&
  isNum(cm.ms) && isNum(cm.add) && isNum(cm.del)

function validGit(k, e) {
  if (!isObj(e) || !isNum(e.at)) return null
  if (k.startsWith('email|')) return typeof e.email === 'string' ? e : null
  if (!Array.isArray(e.commits) || (e.wins != null && !isObj(e.wins))) return null
  if (e.pages != null && !isObj(e.pages)) return null
  const out = { ...e, commits: e.commits.filter(validCommit) }
  if (e.wins) out.wins = keep(e.wins, (f, at) => isNum(Number(f)) && isNum(at))
  if (e.pages) out.pages = keep(e.pages, (w, p) => /^\d+-\d+$/.test(w) && isObj(p) && isNum(p.at) && optStr(p.refs))
  // the folders below refs/heads are joined into a path each: a list of anything else is listed again
  if (e.refDirs != null && !(Array.isArray(e.refDirs) && e.refDirs.every((d) => typeof d === 'string'))) delete out.refDirs
  return out
}

function validNovi(e) {
  if (!isObj(e) || !isNum(e.at) || typeof e.status !== 'string' || !Array.isArray(e.list)) return null
  return { ...e, list: e.list.filter(isObj) }
}

const validWf = (e) => isObj(e) && isNum(e.size) && isNum(e.mtime) && isNum(e.start) && isNum(e.agents) && optStr(e.status) && optStr(e.name)

/** Copy the entries of `obj` that `check` accepts (it returns the value to keep, or a falsy value to drop). */
function keep(obj, check) {
  const out = {}
  if (!isObj(obj)) return out
  for (const [k, v] of Object.entries(obj)) {
    if (k === '__proto__') continue
    const r = check(k, v)
    if (r) out[k] = r === true ? v : r
  }
  return out
}

function sanitize(c) {
  return {
    v: CACHE_VERSION,
    tz: c.tz,
    files: keep(c.files, (_, e) => validEntry(e)),
    wf: keep(c.wf, (_, e) => validWf(e)),
    git: keep(c.git, validGit),
    novi: keep(c.novi, (_, e) => validNovi(e)),
    slugs: keep(c.slugs, (_, v) => v === null || typeof v === 'string'),
    repos: keep(c.repos, (k, v) => path.isAbsolute(k) && isNum(v)),
    links: keep(c.links, (_, e) => isObj(e) && isNum(e.m) && isNum(e.at) && optStr(e.p) && optStr(e.w)),
    families: keep(c.families, (k, v) => path.isAbsolute(k) && v === 1),
    ...(typeof c.claude === 'string' ? { claude: c.claude } : {}),
    ...(isNum(c.savedAt) ? { savedAt: c.savedAt } : {}),
    ...(isNum(c.coldAt) ? { coldAt: c.coldAt } : {}),
    ...(isNum(c.archiveAt) ? { archiveAt: c.archiveAt } : {}),
  }
}

/**
 * Load the cache; anything unreadable or from another version starts fresh; malformed entries are dropped. From another
 * time zone only the files go, to be read again in this one: commits, repos and the rest do not hang on a zone.
 */
export function loadCache(dir) {
  if (!dir) return emptyCache()
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile(dir), 'utf8'))
    if (!isObj(c) || c.v !== CACHE_VERSION) return emptyCache()
    const s = sanitize(c)
    if (sameZone(c.tz)) return s
    // savedAt 0: a hot tier cut again is saved at once, or the next run would find the old zone and cut it again; a kept
    // session has no file to read again, and its days stay as they were lived
    const kept = keptSessions(s)
    return { ...s, tz: tzSignature(), files: keep(s.files, (k, e) => isKept(kept, k, e)), savedAt: 0 }
  } catch {}
  return emptyCache()
}

// The entries that came from the cold file, and from the archive, and are there still: a save leaves them out of the
// hot file, and one that does not rewrite the archive leaves its entries where they are.
const fromCold = new WeakSet()
const fromArchive = new WeakSet()

/**
 * Merge the cold tier into `cache.files` (a hot entry with a newer mtime wins), whatever zone its days were cut in.
 * Returns entries merged, or -1 when the file is there but could not be read: a save must not replace a tier it never
 * saw. One that reads but does not parse holds nothing to keep.
 */
export function loadColdInto(dir, cache) {
  return dir ? loadTierInto(coldCacheFile(dir), cache, fromCold) : 0
}

/** Merge the archive tier into `cache.files` as loadColdInto does the cold one (a hot or cold entry with a newer mtime wins). */
export function loadArchiveInto(dir, cache) {
  return dir ? loadTierInto(archiveCacheFile(dir), cache, fromArchive) : 0
}

/** The tier file a loaded entry came from and is still in, 'cold' or 'archive'; null for the hot tier's and this run's. */
export function tierOf(e) {
  return fromArchive.has(e) ? 'archive' : fromCold.has(e) ? 'cold' : null
}

/**
 * What a cache started over (collect's resetCache) takes back from the tiers it would otherwise overwrite: the kept
 * sessions' entries (keptSessions) of the hot, cold and archive files, checked as any load checks them and marked as
 * loaded from their tier, whatever zone their days were cut in. They are the only copy. Returns the folder the hot
 * file's keys without a prefix are of (its `claude`), or null.
 */
export function loadKeptInto(dir, cache) {
  if (!dir) return null
  const tiers = []
  for (const [file, marks] of [[cacheFile(dir), null], [coldCacheFile(dir), fromCold], [archiveCacheFile(dir), fromArchive]]) {
    try {
      const c = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (isObj(c) && c.v === CACHE_VERSION && isObj(c.files)) tiers.push({ files: keep(c.files, (_, e) => validEntry(e)), marks, claude: c.claude })
    } catch {}
  }
  const kept = new Set()
  for (const t of tiers) for (const s of keptSessions(t)) kept.add(s)
  for (const t of tiers) {
    for (const [k, e] of Object.entries(t.files)) {
      if (!isKept(kept, k, e) || k in cache.files) continue
      cache.files[k] = e
      t.marks?.add(e)
    }
  }
  const owner = tiers.find((t) => t.marks === null)?.claude
  return typeof owner === 'string' ? owner : null
}

function loadTierInto(file, cache, marks) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    return err?.code === 'ENOENT' ? 0 : -1
  }
  let n = 0
  try {
    const c = JSON.parse(text)
    if (!isObj(c) || c.v !== CACHE_VERSION || !isObj(c.files)) return 0
    for (const [k, e] of Object.entries(c.files)) {
      if (k === '__proto__' || !validEntry(e)) continue
      const h = cache.files[k]
      if (!h || !(h.mtime >= e.mtime)) {
        cache.files[k] = e
        marks.add(e)
        n++
      }
    }
  } catch {}
  return n
}

/**
 * The walks a series of runs keeps (agents.mjs readOtherAgents): `{ at, from, homes: { <home prefix>: files } }`, the
 * files written since `from`. Null past WALK_MS, or for a run reaching further back than they do.
 */
export function loadWalks(dir, nowMs, fromMs) {
  try {
    const w = JSON.parse(fs.readFileSync(walksFile(dir), 'utf8'))
    return isObj(w) && isObj(w.homes) && isNum(w.at) && nowMs >= w.at && nowMs - w.at < WALK_MS && w.from <= fromMs ? w : null
  } catch {
    return null
  }
}

export function saveWalks(dir, walks) {
  try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }) } catch { return false }
  return writeAtomic(walksFile(dir), walks)
}

const walksFile = (dir) => path.join(dir, `walks-v${CACHE_VERSION}.json`)

// The cache holds titles, edited paths, commit subjects and the git email: owner-only, like the transcripts it comes
// from (~/.claude/sessions is 0700). The rename keeps the tmp file's mode, so every save leaves a 0600 file.
function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 })
    fs.renameSync(tmp, file)
    return true
  } catch {
    try { fs.unlinkSync(tmp) } catch {}
  }
  return false
}

/**
 * Atomic writes (tmp + rename) so a concurrent reader never sees half a file. Best effort.
 * With `withCold` (the cold tier was loaded) entries are re-partitioned into hot/cold and both files rewritten;
 * otherwise only the hot file is, entries that came from the cold file stay out of it, and aged entries stay hot until
 * the next run with `withCold` moves them. With `withArchive` (the archive was loaded too) what is older than COLD_MS
 * goes to the archive, rewritten with them; otherwise the archive's entries stay out of the other files, and what aged
 * past COLD_MS waits in the cold tier for the day's run that moves it.
 */
export function saveCache(dir, cache, { withCold = false, withArchive = false, nowMs = Date.now() } = {}) {
  if (!dir) return false
  try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }) } catch { return false }
  // an install from before files were private: tighten our own default folder (never a folder the user picked)
  if (dir === path.join(os.homedir(), '.cache', 'theoffice')) try { fs.chmodSync(dir, 0o700) } catch {}
  const toCold = withCold || withArchive
  const hot = {}
  const cold = {}
  const archive = {}
  for (const [k, e] of Object.entries(cache.files)) {
    if (e.mtime >= nowMs - HOT_MS) hot[k] = e
    else if (withArchive && !(e.mtime >= nowMs - COLD_MS)) archive[k] = e
    else if (!withArchive && fromArchive.has(e)) continue
    else if (toCold) cold[k] = e
    else if (!fromCold.has(e)) hot[k] = e
  }
  const stamps = { savedAt: nowMs, ...(toCold ? { coldAt: nowMs } : {}), ...(withArchive ? { archiveAt: nowMs } : {}) }
  if (!toCold) return writeAtomic(cacheFile(dir), { ...cache, ...stamps, files: hot })
  sweepTmp(dir, nowMs)
  const okArchive = !withArchive || writeAtomic(archiveCacheFile(dir), { v: cache.v, tz: cache.tz, files: archive })
  const okCold = writeAtomic(coldCacheFile(dir), { v: cache.v, tz: cache.tz, files: cold })
  return writeAtomic(cacheFile(dir), { ...cache, ...stamps, files: hot }) && okCold && okArchive
}

/**
 * A run killed in mid-write leaves its temp file, up to the size of a tier, for good: gone once an hour has passed.
 * Ours by name in the cache folder, which may be one the person picked; in shared/ and pixel/ everything is ours.
 */
function sweepTmp(dir, nowMs) {
  const sweep = (folder, isOurs) => {
    try {
      for (const name of fs.readdirSync(folder)) {
        if (!name.endsWith('.tmp') || !isOurs(name)) continue
        const file = path.join(folder, name)
        if (nowMs - fs.statSync(file).mtimeMs > 3600e3) fs.unlinkSync(file)
      }
    } catch {}
  }
  sweep(dir, (name) => name.startsWith('cache-v') || name.startsWith('walks-v'))
  for (const folder of ['shared', 'pixel']) sweep(path.join(dir, folder), () => true)
}

/**
 * Drop entries for files older than PRUNE_MS, files that vanished from a directory we fully listed this run
 * (`listedDirs` + `seen`, both relative keys), and stale git/novi results. What becomes of a Claude session whose main
 * transcript went, collect.mjs decides (judgeGone); a kept session's entries (keptSessions) stay whatever their age.
 */
export function pruneCache(cache, nowMs, listedDirs = new Set(), seen = new Set()) {
  let n = 0
  const kept = keptSessions(cache)
  for (const [k, e] of Object.entries(cache.files)) {
    if (isKept(kept, k, e)) continue
    const gone = (!!e.ag || e.kind !== 'main') && listedDirs.has(path.dirname(k)) && !seen.has(k)
    if (gone || !(e.mtime >= nowMs - PRUNE_MS)) { delete cache.files[k]; n++ }
  }
  for (const [k, e] of Object.entries(cache.wf)) {
    const gone = listedDirs.has(path.dirname(k)) && !seen.has(k)
    if (gone || !(e.mtime >= nowMs - PRUNE_MS)) { delete cache.wf[k]; n++ }
  }
  // commit lists carry line stats that cost seconds to recompute: keep them a week, not a day
  for (const [k, e] of Object.entries(cache.git)) if (!(e.at >= nowMs - (/^(?:log|page)\|/.test(k) ? GIT_KEEP_MS : 864e5))) { delete cache.git[k]; n++ }
  for (const [k, e] of Object.entries(cache.novi)) if (!(e.at >= nowMs - 864e5)) { delete cache.novi[k]; n++ }
  for (const [k, at] of Object.entries(cache.repos)) if (!(at >= nowMs - REPO_MS)) { delete cache.repos[k]; n++ }
  return n
}

// ---------------------------------------------------------------- byte-level line reading

/**
 * Read `[start, end)` of an open file with a readSync byte loop and call `onLine(buf, s, e)` for every
 * complete line (`buf[s..e)`, newline excluded). Returns the offset just past the last newline, so an
 * unfinished last line is not consumed and gets re-read next time. Never builds one string for the file;
 * the 64 KB buffer only grows when a single line is bigger than it.
 */
export function readLines(fd, start, end, onLine) {
  let buf = Buffer.allocUnsafe(CHUNK)
  let len = 0
  let pos = start
  let base = start
  let scan = 0
  while (pos < end) {
    if (len === buf.length) {
      const nb = Buffer.allocUnsafe(buf.length * 2)
      buf.copy(nb, 0, 0, len)
      buf = nb
    }
    const n = fs.readSync(fd, buf, len, Math.min(buf.length - len, end - pos), pos)
    if (n <= 0) break
    pos += n
    len += n
    const view = buf.subarray(0, len)
    let ls = 0
    let nl = view.indexOf(10, scan)
    while (nl !== -1) {
      if (nl > ls) onLine(buf, ls, nl)
      ls = nl + 1
      nl = view.indexOf(10, ls)
    }
    if (ls > 0) {
      buf.copy(buf, 0, ls, len)
      len -= ls
      base += ls
    }
    scan = len
  }
  return base
}

/**
 * Last `bytes` of a file as text, without the leading partial line; `start` is the file offset of the text.
 * `endOff` is the offset just past the last newline (where an incremental read would resume).
 */
export function readTail(file, size, bytes = CHUNK) {
  const start = Math.max(0, size - bytes)
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const buf = Buffer.allocUnsafe(size - start)
    const n = fs.readSync(fd, buf, 0, buf.length, start)
    const view = buf.subarray(0, n)
    let from = 0
    if (start > 0) {
      const i = view.indexOf(10)
      if (i === -1) return { text: '', start: size, endOff: start, truncated: true }
      from = i + 1
    }
    const last = view.lastIndexOf(10)
    return { text: view.toString('utf8', from), start: start + from, endOff: last === -1 ? start : start + last + 1, truncated: start > 0 }
  } catch {
    return { text: '', start: size, endOff: 0, truncated: false }
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd) } catch {}
  }
}

const TS_RE = /"timestamp":"(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)"/g

/** Newest `"timestamp"` found in the tail (null when the tail has none) + where complete lines end. */
export function tailTimestamp(file, size) {
  const t = readTail(file, size)
  let max = null
  for (const m of t.text.matchAll(TS_RE)) {
    const ms = Date.parse(m[1])
    if (ms > (max ?? 0)) max = ms
  }
  return { lastTs: max, endOff: t.endOff }
}

// ---------------------------------------------------------------- per-file sync

/**
 * Bring one cache entry up to date with the file on disk.
 * - unchanged (ino, size, mtime) ⇒ reuse as-is;
 * - grew with the same inode ⇒ parse only `[off, size)`;
 * - shrank / replaced ⇒ start over from byte 0.
 * A brand-new file whose newest tail timestamp is older than the range (mass-backdated mtimes, see
 * claude-data gotcha 12) is not parsed at all: it is marked `partial` and re-parsed fully only if a later
 * run asks for a range reaching back into it.
 * `handler(entry, ctl)` builds the line callback; it sets `ctl.rescan` when an appended chunk holds lines it
 * cannot judge without the earlier ones (replayed history), and the file is then parsed again from byte 0.
 * `stale(entry)`, when given, names a cached entry that lacks something this run needs (yesterday's quarters for the
 * timelapse): it is parsed again from byte 0, like an invalid one, and cached whole from then on.
 * @returns {{ entry: object, cached: boolean, bytes: number }} `bytes`, how much of the file this call read
 */
/** What syncing a file reads, at most: what follows its entry's offset, the whole file without one (syncFile). */
export function bytesLeft(cache, key, st) {
  const e = cache.files[key]
  return e && e.ino === st.ino && st.size >= e.off ? st.size - e.off : st.size
}

export function syncFile(cache, key, abs, st, { init, handler, fromMs, stale }) {
  let e = cache.files[key]
  if (e && (!validEntry(e) || (e.partial != null && fromMs <= e.partial) || stale?.(e))) e = null
  if (e && e.ino === st.ino && e.size === st.size && e.mtime === st.mtimeMs) return { entry: e, cached: true, bytes: 0 }
  const fresh = () => {
    const n = init()
    n.ino = st.ino
    n.off = 0
    return n
  }
  if (!e || e.ino !== st.ino || st.size < e.off) {
    e = fresh()
    const tail = tailTimestamp(abs, st.size)
    if (tail.lastTs != null && tail.lastTs < fromMs) {
      e.partial = tail.lastTs
      e.prev = tail.lastTs
      e.off = tail.endOff
    }
  }
  const from = e.off
  if (st.size > e.off) {
    let fd
    try {
      fd = fs.openSync(abs, 'r')
      const ctl = { incremental: e.off > 0, rescan: false }
      let off = readLines(fd, e.off, st.size, handler(e, ctl))
      if (ctl.rescan) {
        e = fresh()
        off = readLines(fd, 0, st.size, handler(e, { incremental: false, rescan: false }))
      }
      e.off = off
    } catch {
      delete cache.files[key]   // half-applied delta: rebuild this file from scratch next run
      return { entry: e, cached: false, bytes: 0 }
    } finally {
      if (fd !== undefined) try { fs.closeSync(fd) } catch {}
    }
  }
  e.size = st.size
  e.mtime = st.mtimeMs
  cache.files[key] = e
  return { entry: e, cached: false, bytes: Math.max(0, st.size - from) }
}
