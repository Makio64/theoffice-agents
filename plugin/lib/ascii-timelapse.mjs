// PURE: the timelapse in block glyphs, the text office's backup of the pixel replay (lib/svg-timelapse.mjs): a terminal
// pane and the CLI's `timelapse` mode draw it. renderTimelapseText(facts, opts) → Line[]
// (Line = Array<[text, role]>, as lib/ascii.mjs), timelapseFrames(facts) says how many frames one loop of it takes.
// No node:* imports: the desktop mod's hooks module imports this file.
//
// What it draws, from facts.timeline: one strip per project, one column per few slots, each cell as dark as the most
// desks that project had at work at once in those slots, under a ruler of days (hours for yesterday); then the whole
// office, its interns, its meetings and its commits on the same columns. Given a frame, a playhead walks the strips and a
// line under them says who was at work at that moment; without one it is the whole range, still, and names its busiest
// slot.
//
// Invariants, whatever the facts: each line is at most `width` columns (20..140; below 60 the narrow form), line 1
// starts with `THE OFFICE`, no control chars, `ascii: true` is printable 7-bit only, the same facts and options give the
// same lines (no clock is read), and every frame of one replay has the same line count, so the pane never jumps.
import { AGENT_IDS, agentId, castOf } from './cast.mjs'
import { displayWidth, fmtMinutes, truncate } from './format.mjs'
import {
  LAPSE_WORDS, SEP, castRole, cellText, clipLine, cropTimeline, dayInfo, finishLines, fitGroups, lapseSlot, lineWidth as lw, normalizeFacts, num, padL, padR, plural,
  projectRoles, shortName,
} from './model.mjs'

// ---------------------------------------------------------------- pace

/** The frame clock the text replay is paced for, in ms: the pane in a terminal and the CLI's --watch tick at it. */
export const TEXT_FRAME_MS = 700
// a loop plays at most about this many frames whatever the range (ceil(slots / 48) slots a frame), so yesterday, the
// week and the month each replay in up to about half a minute, less when what happened was brief (cropTimeline)
const PLAY_FRAMES = 48
// frames held on the last slot before the loop starts over: about the 2.5 s the pixel replay holds it
const HOLD_FRAMES = 4

/** One loop of `S` slots: `step` slots a frame, `play` frames walking them (the last one on the last slot), `frames` in all. */
function pace(S) {
  const step = Math.max(1, Math.ceil(S / PLAY_FRAMES))
  const play = Math.ceil((S - 1) / step) + 1
  return { step, play, frames: play + HOLD_FRAMES }
}

/** The slot a frame shows: frames count up forever, the replay wraps after one loop. */
function slotAt(S, frame) {
  const { step, play, frames } = pace(S)
  const n = Math.floor(num(frame))
  const f = ((n % frames) + frames) % frames
  return f < play ? Math.min(S - 1, f * step) : S - 1
}

// ---------------------------------------------------------------- the timeline, slot by slot

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)
const list = (v) => (Array.isArray(v) ? v : [])
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(num(v))))
// a broken slot count must not allocate the world: a month of quarters is more than any range replays
const MAX_SLOTS = 31 * 96

/** Prefix sums of a difference array: per slot counts, `S` long. */
function settle(diff, S) {
  const out = new Array(S)
  let n = 0
  for (let i = 0; i < S; i++) out[i] = n += diff[i]
  return out
}

/**
 * facts.timeline as the strips read it, every number checked and clamped (a partial or hand-made timeline draws, never
 * throws), or null when the facts carry none. Per slot: desks at work in each project and in all, interns at work,
 * meetings running, commits made. Projects come busiest first (desk-slots, then sessions, then name), so the rows that
 * do not fit are the quiet ones. `shape` is what lapseSlot reads to name a slot.
 */
function readTimeline(raw) {
  // cut to where something happened, as the drawing is: `start` the slots of the range before the replay
  const t = obj(cropTimeline(raw))
  if (!t) return null
  const start = Math.max(0, Math.floor(num(t.start)))
  const kind = Object.hasOwn(LAPSE_WORDS, t.kind) ? t.kind : null
  const days = list(t.days).filter((d) => typeof d === 'string')
  const slotMin = Math.max(1, num(t.slot_min) || 60)
  const perDay = Math.max(1, Math.round(1440 / slotMin))
  const S = clampInt(t.slots, 0, Math.min(MAX_SLOTS, Math.max(1, days.length) * perDay))
  const zeros = () => new Array(S + 1).fill(0)
  const byName = new Map()
  const total = zeros()
  const interns = zeros()
  let sessions = 0
  let internsTotal = 0
  for (const d of list(t.desks)) {
    if (!obj(d)) continue
    sessions++
    const name = cellText(d.project ?? 'unknown') || 'unknown'
    let p = byName.get(name)
    if (!p) byName.set(name, (p = { name, sessions: 0, diff: zeros(), desks: [] }))
    const runs = list(d.runs).filter(Array.isArray).map(([a, b]) => [clampInt(a, 0, S), clampInt(b, 0, S)]).filter(([a, b]) => b > a)
    p.sessions++
    p.desks.push({ agent: agentId(d.agent), runs })
    for (const [a, b] of runs) {
      p.diff[a]++
      p.diff[b]--
      total[a]++
      total[b]--
    }
    // change points [slot, count]: that many interns from that slot until the next point (the last one says 0)
    const pts = list(d.interns).filter(Array.isArray).map(([s, n]) => [clampInt(s, 0, S), Math.max(0, Math.floor(num(n)))]).sort((x, y) => x[0] - y[0])
    let peak = 0
    pts.forEach(([s, n], j) => {
      const e = j + 1 < pts.length ? pts[j + 1][0] : S
      if (!n || e <= s) return
      interns[s] += n
      interns[e] -= n
      peak = Math.max(peak, n)
    })
    internsTotal += peak
  }
  const meetings = zeros()
  let meetingsTotal = 0
  for (const m of list(t.meetings)) {
    if (!obj(m)) continue
    const a = clampInt(m.from, 0, S)
    const b = clampInt(m.to, 0, S)
    if (b <= a) continue
    meetings[a]++
    meetings[b]--
    meetingsTotal++
  }
  const commits = new Array(S).fill(0)
  let commitsTotal = 0
  for (const x of list(t.commits)) {
    const s = Math.floor(num(x?.slot))
    const n = Math.max(0, Math.floor(num(x?.n)))
    if (s < 0 || s >= S || !n) continue
    commits[s] += n
    commitsTotal += n
  }
  const projects = [...byName.values()].map((p) => {
    const at = settle(p.diff, S)
    return { name: p.name, sessions: p.sessions, desks: p.desks, at, busy: at.reduce((s, v) => s + v, 0) }
  }).sort((a, b) => b.busy - a.busy || b.sessions - a.sessions || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return {
    kind, days, slotMin, perDay, start, S, shape: { kind, days, slot_min: slotMin, start }, label: cellText(t.label ?? ''),
    projects, total: settle(total, S), interns: settle(interns, S), meetings: settle(meetings, S), commits,
    sessions: sessions + Math.max(0, Math.floor(num(t.more))), internsTotal, meetingsTotal, commitsTotal,
    empty: !S || (!projects.some((p) => p.busy > 0) && !meetingsTotal && !commitsTotal),
  }
}

// ---------------------------------------------------------------- layout

// project rows: from 60 columns, then in the narrow form; past it the quiet ones fold into one `+N more` row
const ROWS = 16
const ROWS_NARROW = 8
// a cell: nobody, then 1, 2, 3, 4+ desks at work at once
const LEVEL = [' ', '░', '▒', '▓', '█']
const LEVEL_7BIT = [' ', '.', ':', '+', '#']
const SPARK = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

/**
 * Slots per column: the smallest `k` from `min` up that divides a day or is whole days (a quarter, half an hour, three
 * hours, twelve hours, a day…), so a column is always a stretch of clock a person can name and days start on a column.
 */
function cellSlots(perDay, min) {
  for (let k = 1; k <= perDay; k++) if (perDay % k === 0 && k >= min) return k
  return perDay * Math.ceil(min / perDay)
}

/**
 * The rows and their columns: name column, strip of `cols` cells of `k` slots each, then the count column (40 columns
 * up). Names get the room the strip leaves, up to 20 (12 narrow). Each row's cells hold the most at once over its
 * column (desks, interns, meetings) or the sum (commits); `max` scales the bar rows. The columns keep to the clock's
 * grid: a replay cut to start off it (tl.start) has its first `off` slots of a column before it, so slot i is in
 * column floor((i + off) / k).
 */
function layout(c, tl) {
  const { W, narrow } = c
  const cap = narrow ? ROWS_NARROW : ROWS
  const shown = tl.projects.length > cap ? tl.projects.slice(0, cap - 1) : tl.projects
  const rest = tl.projects.slice(shown.length)
  const short = narrow && W < 45
  const rows = shown.map((p) => ({ name: p.name, role: c.colors.get(p.name) ?? 'title', cell: c.colors.get(p.name) ?? 'title', vals: p.at, count: p.sessions }))
  if (rest.length) {
    const vals = new Array(tl.S).fill(0)
    for (const p of rest) p.at.forEach((v, i) => { vals[i] += v })
    rows.push({ more: rest.length, role: 'dim', cell: null, vals, count: rest.reduce((s, p) => s + p.sessions, 0), countRole: 'dim' })
  }
  // the whole office, then its interns, meetings and commits, each a bar in its own role; a range without any of one has no row for it
  const bars = [
    ['all', 'all', 'title', 'busy', tl.total, tl.sessions],
    ['interns', 'int', 'intern', 'intern', tl.interns, tl.internsTotal],
    ['meetings', 'mtg', 'meeting', 'meeting', tl.meetings, tl.meetingsTotal],
    ['commits', 'ship', 'ship', 'ship', tl.commits, tl.commitsTotal],
  ]
  for (const [long, abbr, role, cell, vals, count] of bars) {
    if (long !== 'all' && !vals.some((v) => v > 0)) continue
    rows.push({ label: short ? abbr : long, role, cell, vals, bar: true, sum: long === 'commits', count, countRole: role })
  }

  const cw = W >= 40 ? Math.max(...rows.map((r) => String(r.count).length)) : 0
  const base = narrow ? (W < 30 ? 5 : W < 45 ? 8 : 10) : 14
  const avail = Math.max(1, W - base - 1 - (cw ? cw + 1 : 0))
  let k = cellSlots(tl.perDay, Math.ceil(tl.S / avail))
  while (Math.ceil((tl.S + (tl.start % k)) / k) > avail && k < tl.S) k = cellSlots(tl.perDay, k + 1)
  const off = tl.start % k
  const cols = Math.ceil((tl.S + off) / k)
  const longest = Math.max(0, ...rows.filter((r) => r.name).map((r) => displayWidth(r.name)))
  const nameW = Math.max(base, Math.min(narrow ? 12 : 20, longest, base + avail - cols))
  for (const r of rows) {
    if (r.name) r.label = narrow ? shortName(r.name, nameW) : truncate(r.name, nameW)
    else if (r.more) r.label = displayWidth(`+${r.more} more`) <= nameW ? `+${r.more} more` : `+${r.more}`
    // every label fits its column, so the strips start on one column whatever the names
    r.label = truncate(r.label, nameW)
    r.cols = new Array(cols).fill(0)
    r.vals.forEach((v, i) => {
      const j = Math.floor((i + off) / k)
      r.cols[j] = r.sum ? r.cols[j] + v : Math.max(r.cols[j], v)
    })
    r.max = Math.max(1, ...r.cols)
  }
  return { rows, k, off, cols, nameW, cw, x0: nameW + 1 }
}

// ---------------------------------------------------------------- lines

const pad2 = (n) => String(n).padStart(2, '0')

/** A cell's glyph: desks at once as shades (projects), else a bar scaled to the row's busiest column. */
function glyphOf(c, r, v) {
  if (v <= 0) return ' '
  if (!r.bar) return (c.A ? LEVEL_7BIT : LEVEL)[Math.min(4, v)]
  return SPARK[Math.min(7, Math.max(0, Math.ceil((v / r.max) * 8) - 1))]
}

/**
 * Line 1, as every view's: `THE OFFICE · timelapse · this week · Tue 20 Oct → Mon 26 Oct`, and while it plays the
 * replayed time at the right end (`▶ Tue 14:00`). The time stays when the width is short and the range label goes.
 */
function title(c, tl, i) {
  const { W, A } = c
  const words = c.kind ? LAPSE_WORDS[c.kind] : ''
  const groups = [[SEP, ['timelapse', 'title']], ...(words ? [[SEP, [words, 'title']]] : []), ...(c.label ? [[SEP, [c.label, null]]] : [])]
  let clock = ''
  if (i != null) {
    const s = lapseSlot(tl.shape, i)
    clock = [`${A ? '>' : '▶'} ${s.label}`, s.label, `${s.d} ${s.hm}`, s.hm].find((t) => displayWidth(t) <= W - 11) ?? ''
  }
  const cw = displayWidth(clock)
  const { line } = fitGroups(groups, W - (cw ? cw + 1 : 0), { sep: null, lead: [['THE OFFICE', 'accent']] })
  return cw ? [...line, [' '.repeat(W - lw(line) - cw), null], [clock, 'accent']] : line
}

/**
 * Ruler marks: days (`Tu20`, or `Tu` / `20` when short) for a week or a month, hours (`06`) for one day, at their slot
 * of the replay (the range's less `start`): an hour before the replay has none, a day it begins inside marks its start.
 */
function rulerMarks(c, tl) {
  if (tl.days.length <= 1) {
    const marks = Array.from({ length: 24 }, (_, h) => ({ slot: Math.round((h * 60) / tl.slotMin) - tl.start, forms: { h: pad2(h) }, role: 'dim' }))
      .filter((m) => m.slot >= 0)
    return { marks, tries: [['h', 1], ['h', 2], ['h', 3], ['h', 6], ['h', 12]] }
  }
  const week = tl.days.length <= 7
  const marks = tl.days.map((d, n) => {
    const di = dayInfo(d)
    const forms = { long: `${di.wd.slice(0, 2)}${pad2(di.d)}`, short: week ? di.wd.slice(0, 2) : String(di.d) }
    const slot = n * tl.perDay - tl.start
    return { slot: Math.max(0, slot), end: slot + tl.perDay, isPartial: slot < 0, forms, role: d === c.today ? 'accent' : 'dim' }
  }).filter((m) => m.end > 0)
  const tries = week ? [['long', 1], ['short', 1], ['short', 2], ['short', 3], ['short', 7]]
    : [['long', 1], ['long', 2], ['long', 3], ['long', 7], ['short', 1], ['short', 2], ['short', 3], ['short', 5], ['short', 7], ['short', 10], ['short', 15]]
  return { marks, tries }
}

/**
 * The ruler over the strips: how long a column is in the name column (`3h a column`), then the marks over the columns
 * where their day or hour starts, every one when they fit with a blank between, else every 2nd, 3rd… in the longest
 * wording that does.
 */
function ruler(c, tl, L) {
  const span = L.k * tl.slotMin
  const dur = span % 1440 === 0 ? `${span / 1440}d` : span % 60 === 0 ? `${span / 60}h` : span < 60 ? `${span}m` : fmtMinutes(span)
  const head = [`${dur} a column`, `${dur}/col`, dur].find((t) => displayWidth(t) <= L.nameW) ?? ''
  const { marks, tries } = rulerMarks(c, tl)
  const place = (form, step) => {
    const out = []
    let end = -1
    for (const [n, m] of marks.entries()) {
      const col = Math.floor((m.slot + L.off) / L.k)
      if (n % step || col >= L.cols) continue
      const text = m.forms[form]
      // the day the replay begins inside goes unmarked when what is left of it is too narrow for its mark
      if (m.isPartial && Math.ceil((m.end + L.off) / L.k) - col < displayWidth(text) + 1) continue
      if (col <= end) return null
      if (L.x0 + col + displayWidth(text) > c.W) break
      out.push([col, text, m.role])
      end = col + displayWidth(text)
    }
    return out.length ? out : null
  }
  const placed = tries.reduce((got, [form, step]) => got ?? place(form, step), null) ?? []
  const line = [[padR(head, L.nameW), 'dim'], [' ', null]]
  let x = 0
  for (const [col, text, role] of placed) {
    line.push([' '.repeat(col - x), null], [text, role])
    x = col + displayWidth(text)
  }
  return line
}

/**
 * A strip row: its name, one cell per column, its count. Still, every cell in the row's color. Playing, the columns the
 * replay has passed are in color, the playhead's column in the accent (`│` where nobody is at work, else what was at
 * work at that very slot, commits so far in its column), the columns still to come dim: the whole range stays in view.
 */
function stripRow(c, L, r, i) {
  const pc = i == null ? -1 : Math.floor((i + L.off) / L.k)
  const line = [[padR(r.label, L.nameW), r.role], [' ', null]]
  for (let j = 0; j < L.cols; j++) {
    if (j === pc) {
      const v = r.sum ? r.vals.slice(Math.max(0, j * L.k - L.off), i + 1).reduce((s, x) => s + x, 0) : r.vals[i]
      const g = glyphOf(c, r, v)
      line.push([g === ' ' ? (c.A ? '|' : '│') : g, 'accent'])
      continue
    }
    const g = glyphOf(c, r, r.cols[j])
    line.push([g, g === ' ' ? null : pc >= 0 && j > pc ? 'dim' : r.cell])
  }
  if (L.cw) line.push([' ', null], [padL(String(r.count), L.cw), r.countRole ?? null])
  return line
}

/** The playhead's mark, under the strips at its column. */
function marker(c, L, i) {
  return [[' '.repeat(L.x0 + Math.floor((i + L.off) / L.k)), null], [c.A ? '^' : '▲', 'accent']]
}

/** A project's people at work at slot `i`, as heads (`▛█▜ ▐>▌`): one of each character first, at most 3, then `+`. */
function headsAt(c, p, i) {
  const agents = p.desks.filter((d) => d.runs.some(([a, b]) => a <= i && i < b)).map((d) => d.agent)
  const firsts = AGENT_IDS.filter((a) => agents.includes(a))
  const rest = AGENT_IDS.flatMap((a) => new Array(Math.max(0, agents.filter((x) => x === a).length - 1)).fill(a))
  const shown = [...firsts, ...rest].slice(0, 3)
  const face = (a) => castOf(a).face.front[c.A ? 1 : 0]
  return [...shown.flatMap((a) => [[' ', null], [face(a), castRole(a)]]), ...(agents.length > shown.length ? [['+', 'dim']] : [])]
}

/**
 * Under the playhead, what the office was doing then: `Tue 14:00 · 4 at work · harborledger ×2 ▛█▜ ▐>▌ · md2epub ×1
 * ▛█▜ · +3 interns · 1 meeting`. When it does not fit the heads go, then the quietest projects one by one (`+2 more`),
 * each time with heads again if they fit; the time leads from 40 columns (narrower, the title says it).
 */
function nowLine(c, tl, i) {
  const { W } = c
  const n = tl.total[i]
  const lead = W >= 40 ? [[[lapseSlot(tl.shape, i).label, 'accent']]] : []
  const at = [[n ? `${n} at work` : 'nobody at work', n ? 'busy' : 'dim']]
  const tail = []
  if (tl.interns[i]) tail.push([[`+${plural(tl.interns[i], 'intern')}`, 'intern']])
  if (tl.meetings[i]) tail.push([[plural(tl.meetings[i], 'meeting'), 'meeting']])
  const here = tl.projects.filter((p) => p.at[i] > 0).sort((a, b) => b.at[i] - a.at[i])
  const name = (p) => (c.narrow ? shortName(p.name, 10) : truncate(p.name, 18))
  const group = (p, heads) => [[name(p), c.colors.get(p.name) ?? 'title'], [` ×${p.at[i]}`, 'dim'], ...(heads ? headsAt(c, p, i) : [])]
  const whole = (groups) => {
    const r = fitGroups(groups, W)
    return r.n === groups.length ? r.line : null
  }
  for (let m = here.length; m >= 0; m--) {
    const more = m < here.length ? [[[m ? `+${here.length - m} more` : plural(here.length, 'project'), 'dim']]] : []
    for (const heads of m ? [true, false] : [false]) {
      const line = whole([...lead, at, ...here.slice(0, m).map((p) => group(p, heads)), ...more, ...tail])
      if (line) return line
    }
  }
  return fitGroups([...lead, at, ...tail], W).line
}

/** The still's last line: the first slot with the most desks at work, and what the shades mean when there is room. */
function busiestLine(c, tl) {
  let b = 0
  for (let i = 1; i < tl.S; i++) if (tl.total[i] > tl.total[b]) b = i
  const n = tl.total[b]
  if (!n) return clipLine([['nobody was at a desk', 'dim']], c.W)
  const s = lapseSlot(tl.shape, b)
  const lv = c.A ? LEVEL_7BIT : LEVEL
  const legend = [[`desks at once: ${lv[1]}=1 ${lv[2]}=2 ${lv[3]}=3 ${lv[4]}=4+`, 'dim']]
  const forms = [
    [['busiest: ', 'dim'], [s.label, 'accent'], [`, ${n} at work`, 'dim']],
    [['busiest ', 'dim'], [s.label, 'accent'], [` (${n})`, 'dim']],
    [['peak ', 'dim'], [s.label, 'accent'], [` (${n})`, 'dim']],
    [[s.label, 'accent'], [` (${n})`, 'dim']],
    [[s.hm, 'accent'], [` (${n})`, 'dim']],
  ]
  const r = fitGroups([forms[0], legend], c.W)
  if (r.n === 2) return r.line
  return clipLine(forms.find((g) => lw(g) <= c.W) ?? forms.at(-1), c.W)
}

/** No timeline, or one where nobody worked: the title and one line that says there is nothing to replay. */
function nothing(c, tl) {
  const why = tl ? `nobody worked ${c.kind ? LAPSE_WORDS[c.kind] : 'in this range'}` : 'no timeline in these facts'
  const text = [`nothing to replay: ${why}`, 'nothing to replay'].find((t) => displayWidth(t) <= c.W) ?? 'nothing to replay'
  return [title(c, null, null), [[text, 'dim']]]
}

// ---------------------------------------------------------------- render

function context(facts, tl, { width, ascii }) {
  const asked = Math.floor(Number(width) || 100)
  const raw = obj(facts) ?? {}
  const kind = tl?.kind ?? (Object.hasOwn(LAPSE_WORDS, raw.range?.kind) ? raw.range.kind : null)
  return {
    W: asked < 60 ? Math.max(20, asked) : Math.min(140, asked),
    narrow: asked < 60,
    A: !!ascii,
    kind,
    // the label as the facts give it (never one made up from the clock, so the same facts always give the same title)
    label: tl?.label || cellText(raw.range?.label ?? ''),
    today: cellText(raw.now?.local_date ?? ''),
  }
}

/**
 * Project → role `p0`..`p7`, in readFacts' order (live desks → projects → coat rack), so a project keeps the color
 * the week view and the pixel office give it; projects only the timeline knows come after and take the slots left.
 */
function palette(facts, tl) {
  const f = normalizeFacts(facts)
  return projectRoles([
    ...f.live.desks.map((d) => d.project), ...f.projects.map((p) => p.name), ...f.live.recently_left.map((l) => l.project), ...tl.projects.map((p) => p.name),
  ])
}

/**
 * Draw facts.timeline as lines of `[text, role]` spans. `width` is 20..140 (below 60 the narrow form: fewer rows,
 * short names), `ascii` folds every glyph to printable 7-bit. `frame` null (the default) draws the still: the whole
 * range and its busiest slot. A frame number draws that frame of the replay (timelapseFrames frames a loop, then it
 * wraps; the frame clock ticks every TEXT_FRAME_MS): the playhead on its slot and who was at work then. Pure: the same
 * facts and options give the same lines.
 */
export function renderTimelapseText(facts, { width = 100, frame = null, ascii = false } = {}) {
  const tl = readTimeline(obj(facts)?.timeline)
  const c = context(facts, tl, { width, ascii })
  if (!tl || tl.empty) return finishLines(nothing(c, tl), c.W, c.A)
  c.colors = palette(facts, tl)
  const i = frame == null ? null : slotAt(tl.S, frame)
  const L = layout(c, tl)
  const out = [title(c, tl, i), ruler(c, tl, L), ...L.rows.map((r) => stripRow(c, L, r, i))]
  if (i == null) out.push(busiestLine(c, tl))
  else out.push(marker(c, L, i), nowLine(c, tl, i))
  return finishLines(out, c.W, c.A)
}

/**
 * Frames one loop of the text replay takes at the frame clock (TEXT_FRAME_MS): ceil(slots / 48) slots a frame up to
 * the last slot of the range cut to where something happened (cropTimeline), then that slot held 4 frames. Up to
 * about half a minute for yesterday, the week and the month, less when what happened was brief; 1 when there is
 * nothing to replay.
 */
export function timelapseFrames(facts) {
  const tl = readTimeline(obj(facts)?.timeline)
  return !tl || tl.empty ? 1 : pace(tl.S).frames
}

/**
 * The slot of the replay a frame of the text replay shows (frames wrap after timelapseFrames), or null when there is
 * none: a slot of the range cut to where something happened (lapseSlot of cropTimeline's timeline names it).
 */
export function timelapseFrameSlot(facts, frame) {
  const tl = readTimeline(obj(facts)?.timeline)
  return !tl || tl.empty ? null : slotAt(tl.S, frame)
}
