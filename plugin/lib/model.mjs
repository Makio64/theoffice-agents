// PURE: what every drawing of the office agrees on, in one place: the views, the role colors, how a facts string
// becomes one column per char, a project's palette slot, a desk's class, Clawd and the verbs on its caption. The
// text office, the SVG and the HTML page import these instead of keeping copies, so the same facts can never give a
// project two colors or a desk two classes on one page. The text office (lib/ascii.mjs) also takes from here how
// facts are read (defaults, sanitizing, the project filter), the count wordings, the totals, staff and visitor lines,
// the award formulas and the Line helpers.
// No node:* imports (the desktop mod's hooks module loads it).
import { KINDS, jobTitle } from './activity.mjs'
import { AGENT_IDS, CAST, CLAWD_HEX, agentId } from './cast.mjs'
import { charWidth, displayWidth, fmtCount, fmtMinutes, safeText, truncate } from './format.mjs'

/** Clawd's colors, sprite and terminal glyphs live with the rest of the cast (cast.mjs); here for their old readers. */
export { CLAWD_HEX, CLAWD_SPRITE, CLAWD_TERM } from './cast.mjs'

// ---------------------------------------------------------------- views

/**
 * Views the CLI, the collector and the ASCII renderer understand; anything else renders `all`. `work` is "what they
 * did" on its own (the departments of the week's tool calls), so it collects the week like `all`.
 */
export const VIEWS = ['live', 'today', 'week', 'month', 'work', 'all']
/** The title of the `all` view (a bare /office): it stacks the live floor, the week tower and what they did. */
export const ALL_LABEL = 'live · week · what they did'

// ---------------------------------------------------------------- colors

/**
 * Hex colors per role for every surface that is not a 16-color terminal (desktop pane, SVG, HTML page):
 * `{ dark, light }`, one tuned for a dark background and one for a light one, same hues as the ANSI codes.
 * `p0`..`p7` are the project palette; none is red, because red always means "needs you".
 */
export const ROLE_HEX = {
  wall: { dark: '#6b6458', light: '#a39a88' },
  floor: { dark: '#9a7b4f', light: '#8a6a3a' },
  title: { dark: '#ece2cd', light: '#2b2620' },
  accent: { dark: '#eec96f', light: '#a87a12' },
  dim: { dark: '#a4977c', light: '#7a6f5c' },
  busy: { dark: '#9ab86a', light: '#4f7a1f' },
  idle: { dark: '#55c5b1', light: '#1f8a78' },
  wait: { dark: '#b48ead', light: '#7d4f8a' },
  ask: { dark: '#e07a61', light: '#b8432a' },
  intern: { dark: '#8fb0ff', light: '#3f63c9' },
  meeting: { dark: '#c678dd', light: '#9a3fb5' },
  ship: { dark: '#b5d67f', light: '#3d6e12' },
  night: { dark: '#6f91dc', light: '#3557a8' },
  day: { dark: '#f2d36b', light: '#b08a00' },
  warn: { dark: '#ff8a73', light: '#c0392b' },
  clawd: { dark: '#d77757', light: '#c4623f' },
  // the rest of the cast (cast.mjs), one role each, named by agent id
  ...Object.fromEntries(AGENT_IDS.filter((a) => a !== 'claude').map((a) => [a, CAST[a].hex])),
  p0: { dark: '#55c5b1', light: '#1f8a78' },
  p1: { dark: '#d4a94f', light: '#9a6f10' },
  p2: { dark: '#c58fd8', light: '#8a4aa0' },
  p3: { dark: '#9ab86a', light: '#4f7a1f' },
  p4: { dark: '#6f91dc', light: '#3557a8' },
  p5: { dark: '#7fd6e8', light: '#1d7f99' },
  p6: { dark: '#eec96f', light: '#a87a12' },
  p7: { dark: '#e08fc0', light: '#b0407e' },
}

// ---------------------------------------------------------------- the cast

/**
 * Every agent in the office is a character of the cast (cast.mjs): Clawd for Claude, and one each for the other agents
 * (Dex for Codex, Gem for Gemini, Caret for Cursor, Mooni for Kimi, Rok for Grok). A character is always in its own
 * colors: a project's color may go on its desk, nameplate, mug or a tiny accessory, never on it. Its text role is
 * `clawd` for Clawd (the role every drawing has always used for him) and the agent id for the others.
 */
export const castRole = (agent) => (agentId(agent) === 'claude' ? 'clawd' : agentId(agent))

/** Every character's text role (castRole), Clawd's first. */
export const CAST_ROLES = AGENT_IDS.map(castRole)

/**
 * Agent-minutes per agent id, busiest first, agents at zero left out: `[['claude', 812], ['codex', 95]]`. Reads raw facts
 * (`totals.agents` or a project's `agents`); an office whose facts say nothing of agents is all Claude.
 */
export function agentShares(agents, fallbackMinutes = 0) {
  const o = agents && typeof agents === 'object' && !Array.isArray(agents) ? agents : {}
  const list = AGENT_IDS.map((a) => [a, Math.max(0, Number(o[a]) || 0)]).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1])
  return list.length || !(fallbackMinutes > 0) ? list : [['claude', fallbackMinutes]]
}

// ---------------------------------------------------------------- text

const PICTO_RE = /\p{Extended_Pictographic}/u

/**
 * Facts text (titles, labels, project names, commit subjects) → exactly one column per char, so a canvas can count
 * columns by code points: ANSI and controls stripped (safeText), NFC, zero-width marks dropped, backtick → ' (the art
 * is pasted inside code fences), East-Asian wide chars, emoji and lone surrogates → '?'. A transcript title can never
 * break a wall. Idempotent.
 */
export function cellText(s) {
  const t = safeText(String(s ?? '').normalize('NFC')).replace(/`/g, "'")
  let out = ''
  for (const ch of t) {
    const cp = ch.codePointAt(0)
    const w = charWidth(cp)
    if (w === 0) continue
    out += w === 2 || (cp >= 0xd800 && cp <= 0xdfff) || PICTO_RE.test(ch) ? '?' : ch
  }
  return out
}

// ---------------------------------------------------------------- project palette

/** FNV-1a 32-bit over code points: a project's color is stable by name across renders and surfaces. */
export function fnv1a(s) {
  let h = 2166136261
  for (const ch of String(s ?? '')) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0
  return h
}

/**
 * Palette slot (0..7) per project name, in the order given (desks, then projects, then the coat rack): `fnv1a % 8`
 * over the name as the art prints it (cellText), and a later name whose slot is taken moves to the next free one
 * (repeats after 8). Keyed by the name as given, so raw and cleaned spellings of one name share a slot.
 */
export function projectSlots(names) {
  const used = new Set()
  const byKey = new Map()
  const out = new Map()
  for (const name of names) {
    if (name == null || out.has(name)) continue
    const key = cellText(name)
    let slot = byKey.get(key)
    if (slot == null) {
      slot = fnv1a(key) % 8
      for (let i = 0; i < 8 && used.has(slot); i++) slot = (slot + 1) % 8
      used.add(slot)
      byKey.set(key, slot)
    }
    out.set(name, slot)
  }
  return out
}

// ---------------------------------------------------------------- desks

const DOZE_MS = 60 * 60e3

/**
 * One class per desk, from the derived state (never live.counts: an asking desk has raw status idle or waiting):
 * working | thinking | waiting | asking | error | stopped | break | done | dozing. Idle splits on why (idle_reason):
 * an API error, stopped (by the user, or gone quiet), a break (something will start the next turn by itself: a
 * figure in the kitchen), else done (its turn ended with an answer, at its desk). Done or on a break for an hour, the
 * agent dozes at its desk; an error or a stop keeps saying so, it never finished.
 */
export function deskClass(d, nowMs) {
  if (d.state === 'asking') return 'asking'
  if (d.state === 'waiting_on_agents') return 'waiting'
  if (d.state === 'idle') {
    const why = d.idle_reason
    if (why === 'error') return 'error'
    if (why === 'stopped' || why === 'stalled') return 'stopped'
    const since = Date.parse(d.activity?.since ?? d.last_seen ?? '')
    if (Number.isFinite(since) && nowMs - since >= DOZE_MS) return 'dozing'
    return why === 'break' ? 'break' : 'done'
  }
  return d.activity?.kind === 'thinking' ? 'thinking' : 'working'
}

/** Headcount strip order: working → waiting → asking → error → stopped → break → done → dozing. */
export const STRIP_ORDER = { working: 0, thinking: 0, waiting: 1, asking: 2, error: 3, stopped: 4, break: 5, done: 6, dozing: 7 }
/** Classes of an idle desk. */
export const IDLE_CLASSES = new Set(['error', 'stopped', 'break', 'done', 'dozing'])

/** An idle desk's caption in office words (`k` its class: deskClass), for the text office and the drawing alike. */
export function idleDoing(d, k) {
  if (k === 'error') return d.activity?.label ? `error: ${d.activity.label}` : 'stopped on an error'
  if (k === 'stopped') return d.idle_reason === 'stalled' ? 'went quiet' : 'stopped by you'
  if (k === 'break') return 'on break'
  if (k === 'dozing') return 'dozing at the desk'
  return 'done, your turn'
}

/**
 * Caption verbs: the tool's own word when it has one, else the activity kind's. Null-prototype tables, because they are
 * indexed by strings from the facts: a tool named `constructor` must miss, not print Object's own function.
 */
export const TOOL_VERB = Object.assign(Object.create(null), {
  Edit: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit', Write: 'write', Read: 'read', Grep: 'grep', Glob: 'find', WebSearch: 'search',
  WebFetch: 'fetch',
})
export const KIND_VERB = Object.assign(Object.create(null), {
  coding: 'edit', reading: 'read', terminal: '$', testing: 'test', web: 'browse', delegating: 'delegate', planning: 'plan', talking: 'say',
  design: 'draw', tools: 'use',
})

// ---------------------------------------------------------------- lines (Line = Array<[text, role]>)

/** The separator between the groups of a sentence: ` · ` in the dim role. */
export const SEP = [' · ', 'dim']

/** `1 desk`, `3 desks`: counts in sentences. */
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

/** Display width of a line of spans. */
export function lineWidth(line) {
  let n = 0
  for (const [t] of line) n += displayWidth(t)
  return n
}

/** Drop empty spans and trailing blanks (lines are never right-padded). Returns a new line. */
export function trimLine(line) {
  const out = line.filter((sp) => sp && sp[0] !== '').map(([t, r]) => [t, r ?? null])
  while (out.length) {
    const [t, r] = out[out.length - 1]
    const tt = t.replace(/ +$/, '')
    if (tt) { out[out.length - 1] = [tt, r]; break }
    out.pop()
  }
  return out
}

/** Join adjacent spans of the same role: fewer SGR codes, same text. */
export function mergeSpans(line) {
  const out = []
  for (const sp of line) {
    if (!sp || sp[0] === '') continue
    const r = sp[1] ?? null
    const last = out[out.length - 1]
    if (last && last[1] === r) last[0] += sp[0]
    else out.push([sp[0], r])
  }
  return out
}

/**
 * A blank run between two spans of the same role joins them: spaces show no foreground color, so the text is identical
 * with far fewer SGR codes (and fewer <Text> nodes in the desktop pane).
 */
export function bridgeSpans(line) {
  const out = []
  line.forEach(([t, r], i) => {
    const last = out[out.length - 1]
    if (last && r === null && last[1] !== null && line[i + 1]?.[1] === last[1] && /^ +$/.test(t)) { last[0] += t; return }
    if (last && last[1] === r) last[0] += t
    else out.push([t, r])
  })
  return out
}

/**
 * Whole groups, left to right, until one does not fit: a sentence of counts loses its last groups instead of being cut
 * mid-word. `n` says how many groups made it, so callers can add a "+N more" tail.
 */
export function fitGroups(groups, W, { sep = SEP, lead = [] } = {}) {
  const out = [...lead]
  let used = lineWidth(lead)
  let n = 0
  for (const g of groups) {
    const need = lineWidth(g) + (n && sep ? displayWidth(sep[0]) : 0)
    if (used + need > W) break
    if (n && sep) out.push(sep)
    out.push(...g)
    used += need
    n++
  }
  return { line: trimLine(out), n }
}

/** Hard cut at W columns with … : the last resort for free-text lines. */
export function clipLine(line, W) {
  const out = []
  let used = 0
  for (const [t, r] of line) {
    const tw = displayWidth(t)
    if (used + tw <= W) { out.push([t, r]); used += tw; continue }
    if (W - used > 0) out.push([truncate(t, W - used), r])
    break
  }
  return trimLine(out)
}

// ---------------------------------------------------------------- text and layout helpers

/** `s` padded with blanks to `n` columns on the right (padR) or the left (padL); never cut. */
export const padR = (s, n) => s + ' '.repeat(Math.max(0, n - displayWidth(s)))
export const padL = (s, n) => ' '.repeat(Math.max(0, n - displayWidth(s))) + s

/** Section rule `-- title · sub ----…` spanning exactly W columns, in the given dash (the text office passes `─`). */
export function rule(title, W, sub = '', dash = '-') {
  const head = clipLine([[`${dash}${dash} `, 'wall'], [title, 'title'], ...(sub ? [[` · ${sub}`, 'dim']] : [])], W - 2)
  const fill = W - lineWidth(head) - 1
  return fill > 0 ? [...head, [` ${dash.repeat(fill)}`, 'wall']] : head
}

/** Time since `iso` in fmtMinutes words (`1h32`); a time that does not parse or lies ahead reads `0m`. */
export const minutesSince = (nowMs, iso) => fmtMinutes(Math.max(0, Math.floor((nowMs - timeMs(iso, nowMs)) / 60e3)))

/** First `-`/`_`/`.` segment of a long project name, cut to `max` columns: kitchen tallies stay short. */
export const shortName = (p, max = 12) => {
  const s = String(p ?? '')
  return displayWidth(s) <= max ? s : truncate(s.split(/[-_.]/)[0] || s, max)
}

/** Meeting labels as one phrase: `review:a`, `review: b` → `review: a · b` (a shared prefix is said once). */
export function sharedLabels(labels) {
  if (!labels.length) return ''
  const pre = labels[0].split(':')[0]
  if (labels.every((l) => l.includes(':') && l.split(':')[0] === pre)) return `${pre}: ${labels.map((l) => l.slice(pre.length + 1).trim()).join(' · ')}`
  return labels.join(' · ')
}

/**
 * A seeded generator of numbers in [0, 1): fnv1a of the seed, then an LCG. Scenery seeded by the date (stars, clouds)
 * stays put all day and every surface agrees on it.
 */
export function seeded(seed) {
  let s = fnv1a(seed)
  return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296
}

/** Weekday names, Monday first: the calendar's columns (dayInfo's `wdi` indexes them). */
export const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Every replacement is exactly one column, so layouts never shift between unicode and --ascii.
const FOLD = {
  '─': '-', '│': '|', '║': '|', '╨': '|', '═': '=',
  '┌': '+', '┐': '+', '└': '+', '┘': '+', '├': '+', '┤': '+', '┬': '+', '┴': '+', '┼': '+', '╔': '+', '╗': '+', '╚': '+', '╝': '+',
  '╟': '+', '╢': '+', '╤': '+', '╧': '+', '╡': '+', '╞': '+', '╘': '+', '╛': '+',
  '█': '#', '▓': '%', '▒': '+', '░': ':', '▀': '=', '▌': ']', '▐': '[', '▕': '[', '▏': ']',
  '▁': '_', '▂': ',', '▃': ':', '▄': '-', '▅': '=', '▆': '+', '▇': '*', '▉': '#', '▊': '#', '▋': '#', '▍': '|', '▎': '|',
  '·': '.', '°': "'", '×': 'x', '…': '~', '→': '>', '✓': 'v', '■': 'x', '•': '*', '★': '*',
  // Clawd's quadrants: CLAWD_TERM carries hand-made 7-bit forms; this is only the safety net
  '▖': '.', '▗': '.', '▘': "'", '▝': "'", '▙': '#', '▛': '#', '▜': '#', '▟': '#', '▚': '\\', '▞': '/',
}

/** 7-bit fold for --ascii: glyph table, then accents dropped via NFD (`é` → `e`), anything else `?`. */
export function fold7(s) {
  let out = ''
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    if (cp >= 0x20 && cp < 0x7f) { out += ch === '`' ? "'" : ch; continue }
    if (FOLD[ch]) { out += FOLD[ch]; continue }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '')
    out += /^[\x20-\x7e]$/.test(base) ? base : '?'
  }
  return out
}

const LINE_CTRL_RE = /[\x00-\x1f\x7f-\x9f]/g
// Letters of the right-to-left scripts (Hebrew, Arabic, Syriac, Thaana, N'Ko… and their presentation forms)
const RTL_RE = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc\u{10800}-\u{10fff}\u{1e800}-\u{1efff}]/gu

/**
 * The last pass the text office gives its lines: control chars out, right-to-left letters → `?`, same-role spans
 * joined (blank runs bridged), hard-clipped to W, then folded to 7-bit with `ascii`. A renderer bug can never emit a
 * cursor move or a wide line. Text art is a grid of cells: a terminal that orders each row by its bidi rules would lay
 * a row holding a Hebrew or Arabic title out right to left, mirroring the walls and desks around it, so those letters
 * fold like a wide char does (the SVG and the HTML page's own text keep them).
 */
export function finishLines(lines, W, ascii) {
  return lines.map((l) => {
    const line = clipLine(bridgeSpans(mergeSpans(l.map(([t, r]) => [String(t ?? '').replace(LINE_CTRL_RE, '').replace(RTL_RE, '?'), r ?? null]))), W)
    return ascii ? line.map(([t, r]) => [fold7(t), r]) : line
  })
}

// ---------------------------------------------------------------- facts: defaults, sanitizing, project filter

/** A facts number, or 0 for anything that is not one (hand-made or partial facts must render, not throw). */
export const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null) : [])
const hours24 = (v) => Array.from({ length: 24 }, (_, h) => num(arr(v)[h]))
const NUM_KEYS = ['sessions', 'subagents', 'workflows', 'desk_minutes', 'agent_minutes', 'prompts', 'tool_calls', 'files_edited', 'commits', 'additions', 'deletions']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const pad2 = (n) => String(n).padStart(2, '0')

/** ISO time → epoch ms, or `fallback` when it does not parse (a bad timestamp must not throw or print NaN). */
export function timeMs(iso, fallback) {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : fallback
}

/**
 * A local `YYYY-MM-DD` day as calendar parts: `d` 26, `wd` 'Mon', `wdi` 0 (Monday-first index), `mon` 'Oct'. Computed
 * in UTC from the date string alone, so the machine's time zone can never shift a facts day.
 */
export function dayInfo(ymd) {
  const [y, m, d] = String(ymd ?? '').split('-').map(Number)
  let dt = new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1))
  if (!Number.isFinite(dt.getTime())) dt = new Date(0)
  const wd = dt.getUTCDay()
  return { d: dt.getUTCDate(), wd: WEEKDAYS[wd], wdi: (wd + 6) % 7, mon: MONTHS[dt.getUTCMonth()] }
}

// ---------------------------------------------------------------- the timelapse

/** What a timelapse range is called in a sentence: yesterday, this week (the last 7 days), this month (the last 30). */
export const LAPSE_WORDS = { yesterday: 'yesterday', week: 'this week', month: 'this month' }

/**
 * Slot `i` of a timelapse (facts.timeline) as the drawings name it: its day (`date` 'YYYY-MM-DD', `d` 27, `wd` 'Tue',
 * `mon` 'Oct'), its local start time `hm` ('14:00'), and `label`, what a clock says while the replay is in it: 'Sun
 * 09:15' for yesterday and the week, 'Tue 27 16:00' for the month. Slot i is slot `start + i` of the range (`start`:
 * the slots cropTimeline left out before it, 0 when none), which starts on day `days[floor(n / per_day)]` at minute
 * `(n % per_day) * slot_min` of its wall clock. A slot out of the range clamps to its first or its last slot.
 */
export function lapseSlot(timeline, i) {
  const t = obj(timeline)
  const days = arr(t.days).length ? arr(t.days) : ['1970-01-01']
  const slotMin = Math.max(1, num(t.slot_min) || 60)
  const perDay = Math.max(1, Math.round(1440 / slotMin))
  const n = Math.min(days.length * perDay - 1, Math.max(0, Math.floor(num(t.start)) + Math.floor(num(i))))
  const date = String(days[Math.min(days.length - 1, Math.floor(n / perDay))])
  const min = (n % perDay) * slotMin
  const hm = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
  const day = dayInfo(date)
  const label = t.kind === 'month' ? `${day.wd} ${day.d} ${hm}` : `${day.wd} ${hm}`
  return { date, ...day, hm, label }
}

/**
 * Slots of quiet a cropped timelapse keeps on each side of its first and last activity: room for the first character
 * to walk up to the door before it starts and the last to walk out and away (a walk takes 4 slots, done before the
 * last slot holds; svg-timelapse's walkers).
 */
export const CROP_MARGIN = 5

/**
 * A timelapse's timeline (facts.timeline) cut to where something happened: from a little before the first desk at
 * work, meeting or commit to a little after the last (CROP_MARGIN slots), so a yesterday that began at 08:00 replays
 * from 06:45.
 * Every slot index moves with it (runs, interns, meetings, commits), `slots` is the window's, and `start` says how many
 * slots of the range lie before it (lapseSlot adds them back to name a slot's time). The same timeline when there is
 * nothing to cut (no activity at all, or activity at both ends); never throws on a broken one. Every renderer of the
 * replay reads it through here, so the drawing, the text and the export page show the same window.
 */
export function cropTimeline(timeline) {
  const t = obj(timeline)
  const slots = Math.max(0, Math.floor(num(t.slots)))
  const pair = (r) => (Array.isArray(r) ? [Math.floor(num(r[0])), Math.floor(num(r[1]))] : [0, 0])
  let lo = Infinity
  let hi = -Infinity
  const seen = (a, b) => {
    if (b > a && b > 0 && a < slots) [lo, hi] = [Math.min(lo, Math.max(0, a)), Math.max(hi, Math.min(slots, b))]
  }
  for (const d of arr(t.desks)) for (const r of arr(d.runs)) seen(...pair(r))
  for (const m of arr(t.meetings)) seen(Math.floor(num(m.from)), Math.floor(num(m.to)))
  for (const c of arr(t.commits)) seen(Math.floor(num(c.slot)), Math.floor(num(c.slot)) + 1)
  if (!(hi > lo)) return timeline
  const from = Math.max(0, lo - CROP_MARGIN)
  const to = Math.min(slots, hi + CROP_MARGIN)
  if (from === 0 && to === slots) return timeline
  const span = to - from
  const inside = (a, b) => [Math.max(0, a - from), Math.min(span, b - from)]
  const desks = arr(t.desks).map((d) => {
    const runs = arr(d.runs).map(pair).map(([a, b]) => inside(a, b)).filter(([a, b]) => b > a)
    if (!Array.isArray(d.interns)) return { ...d, runs }
    // interns are change points: the count at the window's first slot opens it
    let open = 0
    const points = []
    for (const [s, n] of arr(d.interns).map(pair).sort((x, y) => x[0] - y[0])) {
      if (s <= from) open = n
      else if (s < to) points.push([s - from, n])
    }
    return { ...d, runs, interns: [...(open > 0 ? [[0, open]] : []), ...points] }
  })
  const meetings = arr(t.meetings).map((m) => {
    const [a, b] = inside(Math.floor(num(m.from)), Math.floor(num(m.to)))
    return { ...m, from: a, to: b }
  }).filter((m) => m.to > m.from)
  const commits = arr(t.commits).map((c) => ({ ...c, slot: Math.floor(num(c.slot)) - from })).filter((c) => c.slot >= 0 && c.slot < span)
  return { ...t, slots: span, start: Math.max(0, Math.floor(num(t.start))) + from, desks, meetings, commits }
}

function normMeeting(m) {
  const running = Math.max(0, num(m.agents_running))
  const done = Math.max(0, num(m.agents_done))
  const failed = Math.max(0, num(m.agents_failed))
  return {
    ...m, name: cellText(m.name || 'meeting'), phase: cellText(m.phase || 'meeting'), labels: arr(m.labels).slice(0, 6).map(cellText),
    agents_running: running, agents_done: done, agents_failed: failed, agents_total: Math.max(num(m.agents_total), running + done + failed),
  }
}

// Activity kinds a desk may carry; the renderers index sprite and verb tables by it, so anything else draws as tools
const DESK_KINDS = new Set([...KINDS, 'thinking', 'idle'])
// Why an idle desk is idle (deskClass): anything else, or none, is done
const IDLE_REASONS = new Set(['done', 'stopped', 'error', 'stalled', 'break'])

function normDesk(d, nowIso) {
  const a = obj(d.activity)
  const agent = agentId(d.agent)
  return {
    ...d,
    agent,
    account: d.account ? cellText(d.account) || null : null,
    id: String(d.id ?? ''),
    project: cellText(d.project ?? 'unknown') || 'unknown',
    title: cellText(d.title || d.project || 'untitled'),
    worktree: d.worktree ? cellText(d.worktree) : null,
    branch: d.branch ? cellText(d.branch) : null,
    idle_reason: d.state !== 'idle' ? null : IDLE_REASONS.has(d.idle_reason) ? d.idle_reason : 'done',
    activity: { ...a, kind: DESK_KINDS.has(a.kind) ? a.kind : 'tools', label: a.label == null ? null : cellText(a.label) },
    started_at: d.started_at ?? d.last_seen ?? nowIso,
    last_seen: d.last_seen ?? d.started_at ?? nowIso,
    interns: arr(d.interns).map((i) => ({ ...i, agent: agentId(i.agent ?? agent), description: cellText(i.description ?? '') })),
    meetings: arr(d.meetings).map(normMeeting),
  }
}

/** Agent-minutes per agent id with known ids only (an unknown id is nobody's: it is dropped, never drawn). */
function normAgents(v) {
  const out = {}
  for (const [k, m] of Object.entries(obj(v))) if (AGENT_IDS.includes(k) && num(m) > 0) out[k] = num(m)
  return out
}

function normProject(p) {
  const out = { ...p, name: cellText(p.name) || 'unknown' }
  for (const k of NUM_KEYS) out[k] = num(p[k])
  out.agents = normAgents(p.agents)
  out.worktrees = arr(p.worktrees).map(cellText)
  out.activity = obj(p.activity)
  out.intern_types = obj(p.intern_types)
  out.models = obj(p.models)
  out.per_day = obj(p.per_day)
  out.per_hour = hours24(p.per_hour)
  out.titles = arr(p.titles).map(cellText)
  out.top_commits = arr(p.top_commits).map((c) => ({ ...c, subject: cellText(c.subject ?? '') }))
  return out
}

/**
 * Fill every field a view reads, so partial or hand-made facts render instead of throwing, and sanitize every string
 * that came from a transcript or a repo once, up front (cellText: one column per char).
 */
export function normalizeFacts(facts) {
  const f = obj(facts)
  const n = obj(f.now)
  const nowMs = timeMs(n.iso, timeMs(f.generated_at, Date.now()))
  const at = new Date(nowMs)
  const hour = Number.isInteger(n.hour) ? n.hour : at.getHours()
  const now = {
    iso: n.iso ?? at.toISOString(),
    local_date: cellText(n.local_date ?? `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`),
    local_time: cellText(n.local_time ?? `${pad2(at.getHours())}:${pad2(at.getMinutes())}`),
    hour,
    weekday: cellText(n.weekday ?? WEEKDAYS[at.getDay()]),
    is_night: typeof n.is_night === 'boolean' ? n.is_night : hour >= 20 || hour < 7,
  }
  const r = obj(f.range)
  const days = arr(r.days).length ? arr(r.days).map(String) : [now.local_date]
  const dl = (d) => { const i = dayInfo(d); return `${i.wd} ${i.d} ${i.mon}` }
  const range = {
    kind: r.kind ?? 'week', from: r.from ?? now.iso, to: r.to ?? now.iso, days,
    label: cellText(r.label || (days.length > 1 ? `${dl(days[0])} → ${dl(days[days.length - 1])}` : dl(days[0]))),
  }
  const live = obj(f.live)
  const t = obj(f.totals)
  const totals = { ...t, activity: obj(t.activity), intern_types: obj(t.intern_types), models: obj(t.models), agents: normAgents(t.agents) }
  for (const k of NUM_KEYS) totals[k] = num(t[k])
  return {
    ...f,
    now,
    range,
    live: {
      ...live,
      desks: arr(live.desks).map((d) => normDesk(d, now.iso)),
      recently_left: arr(live.recently_left).map((l) => ({ ...l, agent: agentId(l.agent), title: cellText(l.title ?? ''), project: cellText(l.project ?? '') })),
    },
    projects: arr(f.projects).filter((p) => p.name != null).map(normProject),
    projects_more: num(f.projects_more),
    contractors: arr(f.contractors).map((x) => ({ ...x, tool: cellText(x.tool ?? 'agent'), project: cellText(x.project ?? ''), minutes: num(x.minutes) })),
    accounts: arr(f.accounts).filter((a) => typeof a === 'object').map((a) => ({
      ...a, agent: agentId(a.agent), label: a.label ? cellText(a.label) || null : null, minutes: num(a.minutes), sessions: num(a.sessions), live: num(a.live),
    })),
    totals,
    per_day: obj(f.per_day),
    per_hour: hours24(f.per_hour),
  }
}

function addInto(dst, src) {
  for (const [k, v] of Object.entries(obj(src))) dst[k] = (dst[k] ?? 0) + num(v)
}

/**
 * `--project` on facts that were collected unfiltered (the desktop mod keeps one snapshot): keep matching desks,
 * projects, departures and visitors, then rebuild totals, per_day and per_hour from the kept projects. Facts that the
 * collector already filtered come back unchanged. Takes normalized facts.
 */
export function filterFacts(f, query) {
  const q = cellText(query).toLowerCase()
  if (!q) return f
  const keep = (name) => String(name ?? '').toLowerCase().includes(q)
  const projects = f.projects.filter((p) => keep(p.name))
  const out = {
    ...f,
    live: { ...f.live, desks: f.live.desks.filter((d) => keep(d.project)), recently_left: f.live.recently_left.filter((l) => keep(l.project)) },
    contractors: f.contractors.filter((x) => keep(x.project)),
  }
  if (projects.length === f.projects.length && !f.projects_more) return out
  const totals = { ...f.totals, projects: projects.length, activity: {}, intern_types: {}, models: {}, agents: {} }
  for (const k of NUM_KEYS) totals[k] = 0
  const per_day = Object.fromEntries(f.range.days.map((d) => [d, { minutes: 0, desk_minutes: 0, sessions: 0, subagents: 0, workflows: 0, prompts: 0, commits: 0 }]))
  const per_hour = new Array(24).fill(0)
  for (const p of projects) {
    for (const k of NUM_KEYS) totals[k] += p[k]
    addInto(totals.activity, p.activity)
    addInto(totals.intern_types, p.intern_types)
    addInto(totals.models, p.models)
    addInto(totals.agents, p.agents)
    for (const d of f.range.days) addInto(per_day[d], p.per_day[d])
    p.per_hour.forEach((v, h) => { per_hour[h] += v })
  }
  return { ...out, projects, projects_more: 0, totals, per_day, per_hour }
}

/** Project → role `p0`..`p7` (projectSlots), so every surface gives a project the same color. */
export function projectRoles(names) {
  return new Map([...projectSlots(names)].map(([name, slot]) => [name, `p${slot}`]))
}

/**
 * Everything a text renderer reads from facts, once per render: the normalized (and `project`-filtered) facts, now in
 * ms, each project's palette role (names in the order live desks → projects → coat rack) and each desk's class
 * (classified once, so a desk can never be counted in one class and drawn in another).
 */
export function readFacts(facts, { project } = {}) {
  let f = normalizeFacts(facts)
  if (project) f = filterFacts(f, project)
  const nowMs = timeMs(f.now.iso, 0)
  const names = [...f.live.desks.map((d) => d.project), ...f.projects.map((p) => p.name), ...f.live.recently_left.map((l) => l.project)]
  return {
    f,
    nowMs,
    colors: projectRoles(names),
    classes: new Map(f.live.desks.map((d) => [d, deskClass(d, nowMs)])),
    project: project ? cellText(project) : '',
  }
}

// ---------------------------------------------------------------- people: counts and their words

/** Classes that keep a room busy (working, thinking, waiting on helpers). */
export const BUSY_CLASSES = new Set(['working', 'thinking', 'waiting'])
/** Classes of an agent awake at its desk (busy, or hand up). */
export const AWAKE_CLASSES = new Set(['working', 'thinking', 'waiting', 'asking'])

/** Seat order: who sat down first, then id, so desks keep their seats between refreshes. */
export const bySeat = (a, b) => timeMs(a.started_at, 0) - timeMs(b.started_at, 0) || a.id.localeCompare(b.id)

/**
 * Headcount strip: one `[glyph, role]` per desk class, in STRIP_ORDER (the caller brings the glyphs), capped at `max`
 * with a dim `+` as the last cell.
 */
export function stripGlyphs(classes, glyphs, max = 20) {
  const g = [...classes].sort((a, b) => STRIP_ORDER[a] - STRIP_ORDER[b]).map((k) => glyphs[k])
  return mergeSpans(g.length > max ? [...g.slice(0, Math.max(0, max - 1)), ['+', 'dim']] : g)
}

/**
 * Counts by class (thinking counts as working, dozing as done), plus interns, meetings and their agents. `idle` is
 * every idle desk: errors, stopped, on a break and done.
 */
export function deskCounts(desks, classOf) {
  const n = { working: 0, waiting: 0, waitingMtg: 0, asking: 0, errors: 0, stopped: 0, onBreak: 0, done: 0, idle: 0, interns: 0, meetings: 0, mtgAgents: 0 }
  for (const d of desks) {
    const k = classOf(d)
    if (k === 'working' || k === 'thinking') n.working++
    else if (k === 'waiting') { n.waiting++; if (d.meetings.length) n.waitingMtg++ }
    else if (k === 'asking') n.asking++
    else if (k === 'error') n.errors++
    else if (k === 'stopped') n.stopped++
    else if (k === 'break') n.onBreak++
    else n.done++
    n.interns += d.interns.length
    n.meetings += d.meetings.length
    for (const m of d.meetings) n.mtgAgents += m.agents_running
  }
  n.idle = n.errors + n.stopped + n.onBreak + n.done
  return n
}

/**
 * The idle desks' count groups as `[text, role]`, the ones that never finished first: `1 error`, `1 stopped`,
 * `2 on break`, `9 done` (a dozer is done). Every surface counts idle desks in these words (counts from deskCounts or
 * svg-kit tally).
 */
export function idleGroups(n) {
  return [
    n.errors && [plural(n.errors, 'error'), 'warn'], n.stopped && [`${n.stopped} stopped`, 'accent'],
    n.onBreak && [`${n.onBreak} on break`, 'idle'], n.done && [`${n.done} done`, 'idle'],
  ].filter(Boolean)
}

/** `in a meeting` when every waiting desk has a meeting, else `waiting on helpers` (`waiting` when short). */
export const waitWord = (n, short) => (n.waitingMtg === n.waiting ? 'in a meeting' : short ? 'waiting' : 'waiting on helpers')
/** '1 hand up', '2 hands up' (the SVG kit says it with this too). */
export const handsUp = (n) => `${n} hand${n === 1 ? '' : 's'} up`

/** The glance's count groups: full wording (`1 in a meeting (+3 agents)`) or short; interns last. */
export function glanceGroups(n, short) {
  const g = []
  if (n.working) g.push([[`${n.working} working`, 'busy']])
  const agents = n.mtgAgents ? ` (+${plural(n.mtgAgents, 'agent')})` : ''
  if (n.waiting) g.push([[short ? `${n.waiting} ${waitWord(n, true)}` : `${n.waiting} ${waitWord(n, false)}${agents}`, 'wait']])
  if (n.asking) g.push([[handsUp(n.asking), 'ask']])
  for (const s of idleGroups(n)) g.push([s])
  if (n.interns) g.push([[`+${plural(n.interns, 'intern')}`, 'intern']])
  return g
}

/** A nameplate's count groups: short wordings, then `N interns`. */
export function roomGroups(n, withInterns = true) {
  const g = []
  if (n.working) g.push([[`${n.working} working`, 'busy']])
  if (n.waiting) g.push([[`${n.waiting} ${waitWord(n, true)}`, 'wait']])
  if (n.asking) g.push([[handsUp(n.asking), 'ask']])
  for (const s of idleGroups(n)) g.push([s])
  if (withInterns && n.interns) g.push([[plural(n.interns, 'intern'), 'intern']])
  return g
}

// ---------------------------------------------------------------- history: totals, departments, staff, visitors

/** Awards and section titles speak in the range's unit: 1 day → today, up to 7 → week, more → month. */
export function rangeUnit(f) {
  const n = f.range.days.length
  return n > 7 ? 'month' : n > 1 ? 'week' : 'today'
}

/** Whether the range ended before today: a page of the past (the collector's `back`, period.mjs). */
export function isPastRange(f) {
  const last = Array.isArray(f?.range?.days) ? f.range.days.at(-1) : null
  return typeof last === 'string' && typeof f?.now?.local_date === 'string' && last < f.now.local_date
}

/** A range's word for what is drawn over it: 'today', 'this week', 'this month', or 'that day', 'that week', 'that month' on a past page. */
export function rangeWord(f) {
  const kind = f?.range?.kind
  const unit = kind === 'month' ? 'month' : kind === 'live' || kind === 'today' || kind === 'yesterday' ? 'day' : 'week'
  return isPastRange(f) ? `that ${unit}` : unit === 'day' ? 'today' : `this ${unit}`
}

/** Contractors folded per tool + project (novi lists one row per session), busiest first. */
export function visitors(f) {
  const by = new Map()
  for (const x of f.contractors) {
    const key = `${x.tool}\u0000${x.project}`
    const v = by.get(key) ?? { tool: x.tool, project: x.project, minutes: 0, live: false }
    v.minutes += x.minutes
    v.live ||= !!x.live
    by.set(key, v)
  }
  return [...by.values()].sort((a, b) => b.minutes - a.minutes || a.tool.localeCompare(b.tool))
}

/**
 * Agent-minutes of the projects not drawn: the listed ones exactly, plus whatever totals hold beyond the list when
 * projects were capped (a couple of minutes of per-project rounding is not "more"). `shown` is the drawn projects or
 * their count. One rule for the text tower and every SVG scene; it reads raw facts too (the SVG does not normalize).
 */
export function restMinutes(f, shown) {
  const am = (p) => Math.max(0, num(p?.agent_minutes))
  const list = arr(f?.projects)
  const listed = list.reduce((s, p) => s + am(p), 0)
  const hiddenListed = list.slice(Array.isArray(shown) ? shown.length : num(shown)).reduce((s, p) => s + am(p), 0)
  const beyond = f?.projects_more ? Math.max(0, num(f.totals?.agent_minutes)) - listed : 0
  return hiddenListed + (beyond > 5 ? beyond : 0)
}

/** Activity kind → office department, in the order departments are named when counts tie. */
export const DEPARTMENTS = [
  ['terminal', 'server room'], ['coding', 'typing pool'], ['reading', 'library'], ['planning', 'whiteboard'], ['tools', 'gadget shop'],
  ['web', 'internet café'], ['testing', 'QA lab'], ['delegating', 'management'], ['talking', 'phone booth'], ['design', 'art studio'],
]

/**
 * Activity kind → the kind of work its department stands for, in a word or two. The text names it next to every
 * department (`server room/terminal 61%`), because a department name alone does not say what was counted: people
 * read "server room" and wonder which server. The SVG's rooms say it in longer words (svg-work.mjs WORK_ROOMS).
 */
export const DEPARTMENT_WORK = {
  terminal: 'terminal', coding: 'coding', reading: 'reading', planning: 'planning', tools: 'other tools', web: 'web',
  testing: 'tests', delegating: 'delegating', talking: 'talking to you', design: 'design',
}

/**
 * Activity kind → its kind of work in plain words, where there is room for them: the caption under each room of the
 * pixel-art "what they did" (svg-work.mjs) and the legend of the text `work` view. One table, so both say the same.
 */
export const DEPARTMENT_WORDS = {
  terminal: 'terminal commands', testing: 'running tests', reading: 'reading code', coding: 'writing code', web: 'browsing the web',
  tools: 'other tools', planning: 'planning', talking: 'talking to you', delegating: 'delegating to helpers', design: 'design tools',
}

/** A share as `39%`; a share that rounds to 0 but is not 0 reads `<1%`. */
export function pct(v, total) {
  const p = Math.round((v / (total || 1)) * 100)
  return p === 0 && v > 0 ? '<1%' : `${p}%`
}

/**
 * Departments with tool calls, busiest first (`{ k, name, work, v }`: kind, department, the kind of work in words,
 * calls), and the total of every activity count, which is what the shares are of.
 */
export function departmentRows(activity) {
  const act = obj(activity)
  const total = Object.values(act).reduce((a, b) => a + num(b), 0)
  const rows = DEPARTMENTS.map(([k, name]) => ({ k, name, work: DEPARTMENT_WORK[k], v: num(act[k]) }))
    .filter((r) => r.v > 0).sort((a, b) => b.v - a.v || a.name.localeCompare(b.name))
  return { rows, total }
}

/**
 * "What they did" in the `all` view, explaining itself: `what they did (share of 51k tool calls): server room/terminal
 * 39% · typing pool/coding 14% · …`, each department with its kind of work, wrapped onto at most two lines. The busiest
 * come first, so what does not fit is the smallest; a `+N more` tail says it was left out.
 */
export function departmentSentence(activity, W) {
  const { rows, total } = departmentRows(activity)
  if (!rows.length) return []
  const lead = [['what they did', 'title'], [` (share of ${fmtCount(total)} tool calls): `, 'dim']]
  const groups = rows.map((r) => [[r.name, 'title'], [`/${r.work} `, 'dim'], [pct(r.v, total), 'accent']])
  const l1 = fitGroups(groups, W, { lead })
  const more = (n) => [[` +${n} more`, 'dim']]
  // the second line keeps room for its `+N more` tail when the list does not end there
  let l2 = fitGroups(groups.slice(l1.n), W)
  let left = rows.length - l1.n - l2.n
  if (left > 0) {
    l2 = fitGroups(groups.slice(l1.n), W - 9)
    left = rows.length - l1.n - l2.n
  }
  const tail = left > 0 ? more(left) : []
  if (!l2.n) return [trimLine([...l1.line, ...tail])]
  return [l1.line, trimLine([...l2.line, ...tail])]
}

/**
 * `528h agent-time (95h35 at desks) · 163 sessions · …`: the longest wording that keeps every group (with the commit
 * diff, then without it, then without desk time), then groups drop from the right. `dropZero` leaves out `0 interns`
 * and `0 meetings`; `commitRole` colors the commit count.
 */
export function totalsLine(t, W, { commitRole = 'ship', dropZero = false } = {}) {
  const forms = [2, 1, 0].map((lvl) => [
    [[fmtMinutes(t.agent_minutes), 'title'], [' agent-time', 'dim'], ...(lvl >= 1 ? [[' (', 'dim'], [fmtMinutes(t.desk_minutes), null], [' at desks)', 'dim']] : [])],
    [[`${t.sessions}`, null], [t.sessions === 1 ? ' session' : ' sessions', 'dim']],
    ...(dropZero && !t.subagents ? [] : [[[`${t.subagents}`, 'intern'], [t.subagents === 1 ? ' intern' : ' interns', 'dim']]]),
    ...(dropZero && !t.workflows ? [] : [[[`${t.workflows}`, 'meeting'], [t.workflows === 1 ? ' meeting' : ' meetings', 'dim']]]),
    [[`${t.commits}`, commitRole], [t.commits === 1 ? ' commit' : ' commits', 'dim'], ...(lvl >= 2 ? [[` +${fmtCount(t.additions)} -${fmtCount(t.deletions)}`, 'dim']] : [])],
  ])
  for (const g of forms) {
    const r = fitGroups(g, W)
    if (r.n === g.length) return r.line
  }
  return fitGroups(forms[2], W).line
}

/**
 * The crew, one row per AI that worked, busiest first: `{ a, min, n, share }`, its agent-time (totals.agents, all
 * Claude's when the facts say nothing of agents), its agents (its accounts' sessions, summed; the range's sessions when
 * it worked alone and no account says; else null) and its share of the agent-time. `totals` can be other facts' (a
 * live drawing's exact ones, when `f` holds its steps).
 */
export function crewRows(f, totals = f.totals) {
  const t = totals ?? {}
  const sessions = new Map()
  for (const acc of arr(f.accounts)) {
    if (acc && typeof acc === 'object') sessions.set(agentId(acc.agent), (sessions.get(agentId(acc.agent)) ?? 0) + num(acc.sessions))
  }
  const mins = new Map(agentShares(t.agents, num(t.agent_minutes)))
  const ids = AGENT_IDS.filter((a) => mins.has(a) || sessions.get(a) > 0)
  const total = [...mins.values()].reduce((s, m) => s + m, 0)
  const alone = ids.length === 1 && !sessions.size
  return ids.map((a) => {
    const min = mins.get(a) ?? 0
    const n = alone ? num(f.totals?.sessions) : sessions.has(a) ? sessions.get(a) : null
    return { a, min, n, share: total ? min / total : 0 }
  }).sort((x, y) => y.min - x.min || (y.n ?? 0) - (x.n ?? 0))
}

/**
 * `crew: Claude 392h · Codex 193h · Gemini 107h` (agent-time by agent, busiest first) when more than Claude worked, then
 * `accounts: claude@main 300h · claude@work 92h` when an agent worked from more than one account. `crew: false` leaves
 * the first line to a view that draws the crew as its own table (the month's, ascii.mjs crewTable).
 */
export function crewLines(f, W, { crew = true } = {}) {
  const out = []
  const shares = agentShares(f.totals?.agents)
  if (crew && (shares.length > 1 || (shares.length === 1 && shares[0][0] !== 'claude'))) {
    const groups = shares.map(([a, m]) => [[CAST[a].name, castRole(a)], [` ${fmtMinutes(m)}`, 'dim']])
    out.push(fitGroups(groups, W, { lead: [['crew: ', 'dim']] }).line)
  }
  const accounts = arr(f.accounts).filter((a) => a.label)
  if (accounts.length > 1) {
    const groups = accounts.map((a) => [[`${a.agent}@${a.label}`, castRole(a.agent)], [` ${fmtMinutes(num(a.minutes))}`, 'dim']])
    out.push(fitGroups(groups, W, { lead: [['accounts: ', 'dim']] }).line)
  }
  return out
}

/**
 * `interns: 559 consultants, …   staff: opus-5-5 ×141, …`, the crew (crewLines, `crew` passed on), then `visitors: codex
 * 3h00 @ project (other agents, via novi)`.
 */
export function staffLines(f, W, { crew = true } = {}) {
  const t = f.totals
  // per job title: two custom agents are both specialists, so they make one group
  const jobs = new Map()
  for (const [k, v] of Object.entries(t.intern_types)) if (num(v) > 0) jobs.set(jobTitle(k), (jobs.get(jobTitle(k)) ?? 0) + num(v))
  const interns = [...jobs].sort((a, b) => b[1] - a[1]).map(([title, v]) => plural(v, title))
  const models = Object.entries(t.models).filter(([, v]) => num(v) > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${cellText(k).replace(/^claude-/, '')} ×${num(v)}`)
  const out = []
  const parts = []
  if (interns.length) parts.push(['interns: ', 'dim'], [interns.join(', '), 'intern'])
  if (models.length) parts.push([parts.length ? '   staff: ' : 'staff: ', 'dim'], [models.join(', '), null])
  if (parts.length) out.push(clipLine(parts, W))
  out.push(...crewLines(f, W, { crew }))
  const vis = visitors(f)
  if (vis.length) {
    const tail = [' (other agents, via novi)', 'dim']
    const groups = vis.map((v) => [[`${v.tool}${v.minutes ? ` ${fmtMinutes(v.minutes)}` : ''} @ ${v.project}`, 'accent']])
    const r = fitGroups(groups, W - displayWidth(tail[0]) - (vis.length > 1 ? 4 : 0), { lead: [['visitors: ', 'dim']] })
    if (r.n) out.push(trimLine([...r.line, ...(r.n < vis.length ? [[` +${vis.length - r.n}`, 'dim']] : []), tail]))
  }
  return out
}

// ---------------------------------------------------------------- awards (facts only, never about the human)

const NIGHT_HOURS = [20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6]
const quoteTitle = (d) => `"${truncate(cellText(d.title), 26)}"`

/**
 * History awards in table order (`{ k, who | subj, val, short? }`); each names a project, a day or a visitor, never
 * the human. Ties go to the alphabetically first name. Takes normalized facts.
 */
export function historyAwards(f, kind) {
  const P = f.projects
  const out = []
  if (!P.length) return out
  const best = (fn, min) => {
    let b = null
    for (const p of P) {
      const v = fn(p)
      if (v >= min && (!b || v > b.v || (v === b.v && p.name < b.p.name))) b = { p, v }
    }
    return b
  }
  const unit = kind === 'today' ? 'day' : kind
  let b
  if ((b = best((p) => p.agent_minutes, 1))) {
    out.push({ k: `employee of the ${unit}`, who: b.p.name, val: `${fmtMinutes(b.v)} agent-time`, short: fmtMinutes(b.v) })
  }
  if ((b = best((p) => p.commits, 1))) out.push({ k: 'shipping dept', who: b.p.name, val: plural(b.v, 'commit') })
  if ((b = best((p) => p.subagents, 3))) out.push({ k: 'intern magnet', who: b.p.name, val: plural(b.v, 'intern') })
  if ((b = best((p) => p.workflows, 2))) out.push({ k: 'meeting addict', who: b.p.name, val: plural(b.v, 'meeting') })
  if (kind !== 'today') {
    const share = (p) => {
      const all = p.per_hour.reduce((a, v) => a + v, 0)
      return all >= 120 ? NIGHT_HOURS.reduce((a, h) => a + p.per_hour[h], 0) / all : 0
    }
    if ((b = best(share, 0.25))) out.push({ k: 'night owl', who: b.p.name, val: `${Math.round(b.v * 100)}% at night` })
  }
  if ((b = best((p) => p.worktrees.length, 2))) out.push({ k: 'branch manager', who: b.p.name, val: plural(b.v, 'worktree') })
  if ((b = best((p) => (p.desk_minutes >= 60 ? p.agent_minutes / p.desk_minutes : 0), 2))) {
    out.push({ k: 'force multiplier', who: b.p.name, val: `${b.v.toFixed(1)}× desk time` })
  }
  const days = f.range.days
  if (days.length > 1) {
    const top = days.reduce((a, d) => (num(f.per_day[d]?.minutes) > num(f.per_day[a]?.minutes) ? d : a), days[0])
    const m = num(f.per_day[top]?.minutes)
    if (m > 0) {
      const di = dayInfo(top)
      out.push({ k: 'busiest day', subj: `${di.wd} ${di.d}`, val: `${fmtMinutes(m)} agent-time`, short: fmtMinutes(m) })
    }
    const last = days[days.length - 1]
    const fresh = P.filter((p) => num(p.per_day[last]?.minutes) > 0 && days.slice(0, -1).every((d) => !num(p.per_day[d]?.minutes)))
    if (fresh.length) out.push({ k: 'new tenant', who: fresh[0].name, val: 'moved in today' })
  }
  const v = visitors(f)[0]
  if (v && v.minutes >= 30) out.push({ k: `visitor of the ${unit}`, subj: v.tool, val: `${fmtMinutes(v.minutes)} @ ${v.project}` })
  return out
}

/** Live awards (busiest desk, marathon, longest hand up), from the desks and their classes. */
export function liveAwards(f, nowMs, classOf) {
  const D = f.live.desks
  const out = []
  if (!D.length) return out
  const since = (d) => timeMs(d.activity.since ?? d.last_seen, nowMs)
  const helpers = (d) => d.interns.length + d.meetings.reduce((s, m) => s + m.agents_running, 0)
  const top = D.reduce((a, d) => (helpers(d) > helpers(a) || (helpers(d) === helpers(a) && timeMs(d.started_at, 0) < timeMs(a.started_at, 0)) ? d : a))
  if (helpers(top)) out.push({ k: 'busiest desk', who: top.project, subj: quoteTitle(top), val: plural(helpers(top), 'helper'), live: true })
  const busy = D.filter((d) => BUSY_CLASSES.has(classOf(d)))
  if (busy.length) {
    const l = busy.reduce((a, d) => (timeMs(d.started_at, 0) < timeMs(a.started_at, 0) ? d : a))
    out.push({ k: 'marathon', who: l.project, subj: quoteTitle(l), val: `on shift ${minutesSince(nowMs, l.started_at)}`, live: true })
  }
  const asking = D.filter((d) => classOf(d) === 'asking')
  if (asking.length) {
    const a = asking.reduce((x, d) => (since(d) < since(x) ? d : x))
    out.push({ k: 'longest hand up', who: a.project, subj: quoteTitle(a), val: minutesSince(nowMs, a.activity.since ?? a.last_seen), live: true })
  }
  return out
}

/** Spread the spotlight: an award whose project already holds a history award is skipped (never handed to the runner-up). */
export function pickAwards(list, maxLive) {
  const picked = []
  const holders = new Set()
  let lives = 0
  for (const a of list) {
    if (a.live) {
      if (lives >= maxLive) continue
      lives++
      picked.push(a)
      continue
    }
    if (a.who && holders.has(a.who)) continue
    if (a.who) holders.add(a.who)
    picked.push(a)
  }
  return picked
}
