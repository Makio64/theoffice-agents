// PURE: formatting + safe text helpers shared by the collector, the renderers and the desktop mod.
// No node:* imports here — the mod hooks module (no Node, no DOM) imports this file.

// ---------------------------------------------------------------- numbers & durations

/**
 * Minutes as a compact clock-ish string: `45m`, `1h05`, `321h`.
 * Hours stop showing minutes past 100h because "321h07" is noise in a tower label.
 */
export function fmtMinutes(min) {
  const m = Math.max(0, Math.round(Number(min) || 0))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h >= 100) return `${h}h`
  return `${h}h${String(m % 60).padStart(2, '0')}`
}

/**
 * Tight-column hours: `45m`, `7.4h`, `43h`, `321h`, `1.2k`. Whole hours floor, like fmtMinutes, so the ASCII tower,
 * the SVG facade and every totals row print the same number for the same minutes (13369 min is 222h everywhere).
 */
export function fmtHours(min) {
  const m = Math.max(0, Math.round(Number(min) || 0))
  if (m < 60) return `${m}m`
  const h = m / 60
  if (h < 9.95) return `${h.toFixed(1)}h`
  if (h < 1000) return `${Math.floor(h)}h`
  return `${(Math.floor(h / 100) / 10).toFixed(1)}k`
}

/**
 * fmtHours that never drops the unit: `7.4h`, `321h`, then `2239h` where fmtHours says `1.2k`. For a total printed
 * among counts (`2239h agent-time · 543 sessions`), where a bare `2.2k` reads as a count of something.
 */
export function fmtAgentTime(min) {
  const s = fmtHours(min)
  return s.endsWith('k') ? fmtMinutes(min) : s
}

/** Integers as `950`, `1.2k`, `12.3k`, `123k`, `1.2M` — fits narrow ASCII columns. */
export function fmtInt(n) {
  const v = Math.round(Number(n) || 0)
  if (v < 0) return `-${fmtInt(-v)}`
  if (v < 1000) return String(v)
  const unit = (x, s) => {
    const r = x < 100 ? Math.round(x * 10) / 10 : Math.round(x)
    return `${String(r).replace(/\.0$/, '')}${s}`
  }
  if (v < 999_500) return unit(v / 1000, 'k')
  if (v < 999_500_000) return unit(v / 1e6, 'M')
  return unit(v / 1e9, 'G')
}

/** fmtInt, but whole k from 10k on (`20k`, not `20.3k`): art columns and the totals sentence are tight. */
export function fmtCount(n) {
  return n >= 10_000 && n < 999_500 ? `${Math.round(n / 1000)}k` : fmtInt(n)
}

/**
 * A duration that only says what it is at least, for a drawing that must not change every minute (renderSvg
 * `liveClock`): the desktop pane keeps one SVG on screen until something in it changes, so its durations move in a few
 * coarse steps, each crossed once by a desk: `<20m`, `10m+`, `1h+`, `3h+`, `12h+`, then whole days (`1d+`, `2d+`).
 * Finer steps (every 10 minutes, every hour) are crossed by some desk or other in almost every window of a busy floor,
 * and each crossing reloads the pane. `min` is measured from the start of the current 10-minute window (lib/svg.mjs
 * floors now to it), so the true duration is `min` to `min` + 10 and every word stays true for the whole window. The
 * hour step is also when a done desk (or one on a break) starts dozing (model.mjs DOZE_MS): its words and its pose move together.
 */
export function fmtAtLeast(min) {
  const m = Number(min)
  if (!Number.isFinite(m)) return ''
  if (m < 10) return '<20m'
  if (m < 60) return '10m+'
  if (m < 180) return '1h+'
  if (m < 720) return '3h+'
  if (m < 1440) return '12h+'
  return `${Math.floor(m / 1440)}d+`
}

/** fmtAtLeast for a moment in the past: `<20m ago`, `10m+ ago`, `1h+ ago` … `12h+ ago`, `1d+ ago`, `2d+ ago`. */
export function fmtAgoAtLeast(min) {
  const m = Number(min)
  if (!Number.isFinite(m)) return ''
  return `${fmtAtLeast(m)} ago`
}

/** Relative time: `just now`, `12m ago`, `3h ago`, `4d ago`. Future times read as `just now`. */
export function fmtAgo(when, now = Date.now()) {
  const t = typeof when === 'number' ? when : Date.parse(when)
  const n = typeof now === 'number' ? now : Date.parse(now)
  if (!Number.isFinite(t) || !Number.isFinite(n)) return ''
  const s = Math.floor((n - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86_400)}d ago`
}

// ---------------------------------------------------------------- safe text

// ANSI/VT escape sequences: CSI, OSC (BEL or ST terminated), DCS/SOS/PM/APC strings, 2-byte ESC sequences, 8-bit CSI.
const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b[PX^_][^\x1b]*(?:\x1b\\)?|\x1b[@-Z\\-_]|\x9b[0-?]*[ -/]*[@-~]/g
// C0 + DEL + C1 controls, line/paragraph separators and bidi overrides (trojan-source style reordering).
const CTRL_RE = /[\x00-\x1f\x7f-\x9f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g

/**
 * Make untrusted text (titles, labels, commit subjects) safe to paint: strips ANSI/OSC sequences and
 * every C0/C1 control, collapses whitespace. A transcript title must never be able to move the cursor.
 */
export function safeText(s) {
  if (s == null) return ''
  return String(s).replace(ANSI_RE, '').replace(CTRL_RE, ' ').replace(/\s+/g, ' ').trim()
}

const SECRET_RES = [
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}/g, 'sk-…'],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, 'gh_…'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_…'],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/g, 'xox-…'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA…'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, 'AIza…'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, '[jwt]'],
  [/(:\/\/)[^\s/@:]+:[^\s/@]+@/g, '$1[redacted]@'],
  [/\b(bearer|basic)(\s+)([^\s'"]{6,})/gi, '$1$2[redacted]'],
  // the keyword may sit inside a longer name: PGPASSWORD=…, NPM_TOKEN=…, MY_API_KEY: …, --auth-token=…
  // (bounded name parts keep a 10k-char description from backtracking quadratically)
  [/\b([A-Za-z0-9_]{0,40}(?:pass(?:word|wd)?|pwd|secret|token|api[_-]?key|access[_-]?key|auth)[A-Za-z0-9_-]{0,40})(\s*[:=]\s*)(['"]?)(?!(?:bearer|basic)\s|\[redacted\])[^\s'"]{4,}/gi, '$1$2$3[redacted]'],
  [/\b(token|password|passwd|pwd|secret|api[_-]?key|access[_-]?key)(\s+)(['"]?)(?!\[redacted\])[^\s'"]{6,}/gi, '$1$2$3[redacted]'],
  // mysql -phunter2 (password glued to -p), curl -u user:pass, --user user:pass
  [/\b(mysql(?:dump|admin)?|mariadb|psql)\b([^|;&\n]*?\s)-p(?=[^\s-])(?:'[^']*'|"[^"]*"|[^\s'"]+)/g, '$1$2-p[redacted]'],
  [/(\s-u\s*|--user[=\s]\s*)(['"]?)([^\s:'"]+):(?!\[redacted\])[^\s'"]+/g, '$1$2$3:[redacted]'],
]

/**
 * Best-effort secret scrubbing for strings lifted from transcripts (Bash commands end up as desk labels).
 * Also blanks long mixed-case opaque tokens; plain hex (git shas, ids) is left alone.
 */
export function redact(s) {
  let out = String(s ?? '')
  for (const [re, rep] of SECRET_RES) out = out.replace(re, rep)
  return out.replace(/[A-Za-z0-9+/_=-]{32,}/g, (m) => (/[A-Z]/.test(m) && /[a-z]/.test(m) && /\d/.test(m) ? '[redacted]' : m))
}

/** safeText + display-width truncation with `…`. */
export function clip(s, n = 40) {
  return truncate(safeText(s), n)
}

// ---------------------------------------------------------------- display width

// Wide (2-column) ranges: East Asian Wide/Fullwidth + emoji blocks. Sorted, inclusive.
const WIDE = [
  [0x1100, 0x115f], [0x231a, 0x231b], [0x2329, 0x232a], [0x23e9, 0x23ec], [0x23f0, 0x23f0], [0x23f3, 0x23f3],
  [0x25fd, 0x25fe], [0x2614, 0x2615], [0x2648, 0x2653], [0x267f, 0x267f], [0x2693, 0x2693], [0x26a1, 0x26a1],
  [0x26aa, 0x26ab], [0x26bd, 0x26be], [0x26c4, 0x26c5], [0x26ce, 0x26ce], [0x26d4, 0x26d4], [0x26ea, 0x26ea],
  [0x26f2, 0x26f3], [0x26f5, 0x26f5], [0x26fa, 0x26fa], [0x26fd, 0x26fd], [0x2705, 0x2705], [0x270a, 0x270b],
  [0x2728, 0x2728], [0x274c, 0x274c], [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797],
  [0x27b0, 0x27b0], [0x27bf, 0x27bf], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55], [0x2e80, 0x303e],
  [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xa960, 0xa97f], [0xac00, 0xd7a3],
  [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x16fe0, 0x16fe4],
  [0x17000, 0x18cff], [0x1b000, 0x1b2ff], [0x1f004, 0x1f004], [0x1f0cf, 0x1f0cf], [0x1f18e, 0x1f18e],
  [0x1f191, 0x1f19a], [0x1f1e6, 0x1f1ff], [0x1f200, 0x1f251], [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff],
  [0x1f7e0, 0x1f7eb], [0x1f900, 0x1f9ff], [0x1fa70, 0x1faff], [0x20000, 0x2fffd], [0x30000, 0x3fffd],
]

function isWide(cp) {
  let lo = 0
  let hi = WIDE.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const [a, b] = WIDE[mid]
    if (cp < a) hi = mid - 1
    else if (cp > b) lo = mid + 1
    else return true
  }
  return false
}

// Invisible format chars (word joiner U+2060–2064, bidi controls, the Mongolian vowel separator) and Hangul medial
// vowels / final consonants (U+1160–11FF, drawn on the syllable before) take no column either.
function isZeroWidth(cp) {
  return (
    cp < 0x20 || (cp >= 0x7f && cp < 0xa0) ||
    (cp >= 0x300 && cp <= 0x36f) || (cp >= 0x1160 && cp <= 0x11ff) || cp === 0x180e || (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) || (cp >= 0x20d0 && cp <= 0x20ff) || (cp >= 0xfe00 && cp <= 0xfe0f) ||
    (cp >= 0xfe20 && cp <= 0xfe2f) || cp === 0xfeff || (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
    (cp >= 0xe0000 && cp <= 0xe01ef)
  )
}

/** Width of one code point in terminal columns (0, 1 or 2). ASCII, box drawing and blocks are 1. */
export function charWidth(cp) {
  if (cp >= 0x20 && cp < 0x7f) return 1
  if (isZeroWidth(cp)) return 0
  return isWide(cp) ? 2 : 1
}

/**
 * Terminal display width. Emoji and East-Asian wide chars count 2; combining marks, variation selectors
 * and ZWJ-joined emoji parts count 0; a VS16 (U+FE0F) upgrades a narrow symbol to emoji width 2.
 */
export function displayWidth(s) {
  const str = String(s ?? '')
  let w = 0
  let prevW = 0
  let joined = false
  for (const ch of str) {
    const cp = ch.codePointAt(0)
    if (cp === 0x200d) { joined = true; continue }
    if (cp === 0xfe0f) { if (prevW === 1) { w += 1; prevW = 2 } continue }
    const cw = charWidth(cp)
    if (joined && cw > 0) { joined = false; continue }
    joined = false
    w += cw
    if (cw > 0) prevW = cw
  }
  return w
}

/** Cut `s` to at most `width` columns, ending with `ell` when something was dropped. */
export function truncate(s, width, ell = '…') {
  const str = String(s ?? '')
  if (width <= 0) return ''
  if (displayWidth(str) <= width) return str
  const ellW = displayWidth(ell)
  if (ellW >= width) return ell.slice(0, width)
  let out = ''
  let w = 0
  for (const ch of str) {
    const cw = displayWidth(ch)
    if (w + cw + ellW > width) break
    out += ch
    w += cw
  }
  return out.trimEnd() + ell
}

/** Pad on the right to exactly `width` columns (truncating first when too long). */
export function padEnd(s, width, fill = ' ') {
  const t = truncate(s, width)
  return t + fill.repeat(Math.max(0, width - displayWidth(t)))
}

/** Pad on the left to exactly `width` columns (truncating first when too long). */
export function padStart(s, width, fill = ' ') {
  const t = truncate(s, width)
  return fill.repeat(Math.max(0, width - displayWidth(t))) + t
}

/** Center within `width` columns (extra space goes right). */
export function center(s, width, fill = ' ') {
  const t = truncate(s, width)
  const gap = Math.max(0, width - displayWidth(t))
  const left = Math.floor(gap / 2)
  return fill.repeat(left) + t + fill.repeat(gap - left)
}
