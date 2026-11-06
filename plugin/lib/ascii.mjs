// PURE: the text office, laid out as Today's timesheet in every view (a row per room, a line per desk, aligned
// columns), with each agent as its one-row figure, Clawd for Claude: renderOffice(facts, opts) → Line[]
// (Line = Array<[text, role]>), toAnsi / toPlain turn lines into terminal text, renderStatus gives the one-line status.
// No node:* imports: the desktop mod's hooks module (no Node, no DOM) imports this file, and the html page embeds its
// lines.
//
// Invariants every view keeps, whatever the facts: each line is at most `width` columns (20..140; below 60 every view
// is the narrow list), line 1 starts with `THE OFFICE` (the skill's `!` block trims leading whitespace), no control
// chars, `ascii: true` is printable 7-bit only, and animation frames only swap glyphs in place (same line count, same
// widths, desks never move): a thinking bubble and a snore on the live floor, the rest holds still.
import { CAST, castOf } from './cast.mjs'
import { displayWidth, fmtAgentTime, fmtCount, fmtHours, fmtMinutes, truncate } from './format.mjs'
import {
  ALL_LABEL, AWAKE_CLASSES as AWAKE, BUSY_CLASSES as BUSY, CAST_ROLES, CLAWD_TERM, DEPARTMENTS, castRole, DEPARTMENT_WORDS, IDLE_CLASSES, KIND_VERB, ROLE_HEX, SEP, TOOL_VERB, VIEWS, bySeat, cellText, clipLine, crewRows,
  dayInfo, departmentRows, departmentSentence, deskClass, deskCounts, finishLines, fitGroups, fold7 as fold, glanceGroups as glanceGroupsOf,
  handsUp, historyAwards, idleDoing, idleGroups, isPastRange, lineWidth as lw, liveAwards, mergeSpans as merge, minutesSince, num, padL, padR, pct, pickAwards, plural, rangeUnit, rangeWord,
  readFacts, restMinutes, roomGroups as roomGroupsOf, rule as ruleOf, seeded, sharedLabels, staffLines as staffLinesOf, stripGlyphs,
  timeMs as ms, totalsLine as totalsLineOf, trimLine, visitors, waitWord,
} from './model.mjs'

// ---------------------------------------------------------------- roles

/** Views renderOffice understands (VIEWS), and hex colors per role for the desktop pane, svg and html (ROLE_HEX). */
export { ROLE_HEX, VIEWS }

/**
 * SGR codes per role. The basic + bright 16-color palette, so every terminal theme remaps them sensibly, except Clawd:
 * Claude orange is 256-color 173 (`ROLE_ANSI_16` holds a 16-color fallback for terminals without it). No meaning is
 * carried by color alone (every state also has its own glyph, pose or word), so NO_COLOR output reads the same.
 * No project color (p0..p7) is red: red always means "needs you".
 */
export const ROLE_ANSI = {
  wall: '90', floor: '2;33', title: '1', accent: '1;33', dim: '2', busy: '32', idle: '36', wait: '35', ask: '1;31',
  intern: '94', meeting: '95', ship: '1;32', night: '34', day: '93', warn: '91', clawd: '38;5;173',
  // the rest of the cast (cast.mjs), each in its own 256-color
  ...Object.fromEntries(CAST_ROLES.slice(1).map((r) => [r, CAST[r].ansi])),
  p0: '36', p1: '33', p2: '35', p3: '32', p4: '34', p5: '96', p6: '93', p7: '95',
}

/**
 * ROLE_ANSI with 16-color codes only (`toAnsi(lines, { colors: 16 })`): Clawd falls back to yellow, the nearest orange,
 * and every other character to its nearest basic color.
 */
export const ROLE_ANSI_16 = { ...ROLE_ANSI, clawd: '33', ...Object.fromEntries(CAST_ROLES.slice(1).map((r) => [r, CAST[r].ansi16])) }

/**
 * Text props per role for a terminal that Claude Code draws itself (the desktop mod's pane, where Text takes no ANSI):
 * ROLE_ANSI again, as theme keys (`text`, `claude`, `warning`…) and the basic color names, which follow the person's
 * theme and the terminal's palette. ROLE_HEX's dark-background hexes would put a pale title on a light terminal.
 */
export const ROLE_TERM = {
  wall: { color: 'inactive' }, floor: { color: 'yellow' }, title: { color: 'text' }, accent: { color: 'warning' }, dim: { dimColor: true },
  busy: { color: 'success' }, idle: { color: 'cyan' }, wait: { color: 'magenta' }, ask: { color: 'error' }, intern: { color: 'suggestion' },
  meeting: { color: 'merged' }, ship: { color: 'success' }, night: { color: 'blue' }, day: { color: 'warning' }, warn: { color: 'error' },
  clawd: { color: 'claude' },
  ...Object.fromEntries(CAST_ROLES.slice(1).map((r) => [r, { color: CAST[r].term }])),
  p0: { color: 'cyan' }, p1: { color: 'yellow' }, p2: { color: 'magenta' }, p3: { color: 'green' }, p4: { color: 'blue' }, p5: { color: 'planMode' },
  p6: { color: 'warning' }, p7: { color: 'merged' },
}

// ---------------------------------------------------------------- text

/** Facts text → one column per char (model.mjs cellText): a transcript title can never break a wall. */
const clean = cellText

/** clean() + cut to `n` columns with a trailing … (folded to ~ in ascii mode). */
function clip(s, n) {
  return n > 0 ? truncate(clean(s), n) : ''
}

/** Section rule `── title · sub ───…` spanning exactly W columns (model.mjs rule in the box dash). */
const rule = (title, W, sub = '') => ruleOf(title, W, sub, '─')

// ---------------------------------------------------------------- numbers & dates

const fmtMin = fmtMinutes

const fmtH = fmtHours

// ---------------------------------------------------------------- people

const CLASS_ROLE = {
  working: 'busy', thinking: 'busy', waiting: 'wait', asking: 'ask', error: 'warn', stopped: 'accent', break: 'idle', done: 'idle', dozing: 'idle',
}
// the strip stays quiet for a turn that is over (`░`) and marks the ones that never finished
const STRIP_GLYPH = { working: '█', thinking: '█', waiting: '▒', asking: '?', error: '!', stopped: '■', break: '░', done: '░', dozing: '░' }
const STRIP = Object.fromEntries(Object.entries(STRIP_GLYPH).map(([k, g]) => [k, [g, CLASS_ROLE[k]]]))

const classify = deskClass
const cls = (c, d) => c.classes.get(d) ?? classify(d, c.nowMs)

/** Headcount strip `█████▒?░░░`: one glyph per desk, working → waiting → asking → idle; capped with a dim `+`. */
function strip(c, desks, max = 20) {
  return stripGlyphs(desks.map((d) => cls(c, d)), STRIP, max)
}

/** Counts by class for these desks (model.mjs deskCounts, with this render's classes). */
function counts(c, desks) {
  return deskCounts(desks, (d) => cls(c, d))
}

/** Nameplate / crowd groups: short wordings. */
function roomGroups(c, desks, withInterns = true) {
  return roomGroupsOf(counts(c, desks), withInterns)
}

// ---------------------------------------------------------------- people

/**
 * A character's text look (cast.mjs): its head glyphs (`face`: Clawd's, or `▐>▌` and the like) and its role, the color
 * it is drawn in.
 */
const lookOf = (agent) => ({ face: castOf(agent).face, who: castRole(agent) })

/** A CLAWD_TERM `[unicode, 7-bit]` pair in this render's alphabet. */
const glyph = (c, pair) => pair[c.A ? 1 : 0]

/**
 * One-row figure, 4 columns: the agent's head plus a mark (every desk line, the legend); Clawd unless `agent` says
 * otherwise. Working looks at the monitor, thinking `°`, the boss puts his feet up `▄▛█▜`, a hand up `?`, done `✓`,
 * stopped `■`, an error `!`, dozing sinks his head `▄▄▄z`, a break holds a cup `c`. The only things that move: the
 * thinking bubble grows (`° o O`) and the snore comes and goes (`z Z`), one glyph in place, on frame % 3.
 */
function clawdRow(c, k, agent) {
  const { face, who } = lookOf(agent)
  const head = (pair) => [glyph(c, pair), who]
  const fr = c.frame % 3
  if (k === 'thinking') return [head(face.right), [['°', 'o', 'O'][fr], 'busy']]
  if (k === 'waiting') return [[glyph(c, CLAWD_TERM.feet) + glyph(c, face.front), who]]
  if (k === 'asking') return [head(face.front), ['?', 'ask']]
  if (k === 'dozing') return [head(face.sunk), [['z', 'Z', ' '][fr], 'dim']]
  if (k === 'break') return [head(face.front), ['c', 'idle']]
  if (k === 'done') return [head(face.front), ['✓', 'idle']]
  if (k === 'stopped') return [head(face.front), ['■', 'accent']]
  if (k === 'error') return [head(face.front), ['!', 'warn']]
  return [head(face.left), [' ', null]]
}

/** What the agent at the desk is doing, in office words. */
function deskDoing(c, d) {
  const k = cls(c, d)
  const a = d.activity
  if (k === 'asking') return `asks: ${a.label || 'a question'}`
  if (IDLE_CLASSES.has(k)) return idleDoing(d, k)
  if (k === 'thinking') return 'thinking…'
  if (k === 'waiting') return d.meetings[0] ? `meeting ${d.meetings[0].name}` : `${plural(d.interns.length, 'intern')} at work`
  return `${TOOL_VERB[a.tool] ?? KIND_VERB[a.kind] ?? 'use'} ${a.label ?? ''}`.trim()
}

// with no time column, an idle desk says what it is and for how long (`done 12m`, `dozing 2h05`); an error keeps its
// words instead
const ROW_WORD = { done: 'done', stopped: 'stopped', break: 'on break', dozing: 'dozing' }
const rowDoing = (c, d, k) => (ROW_WORD[k] ? `${ROW_WORD[k]} ${minutesSince(c.nowMs, d.activity.since ?? d.last_seen)}` : deskDoing(c, d))

/** How long, in the desk's words: `shift 2h35` at work, `hand up 25m`, `idle 1h32` once its turn is over. */
function deskTime(c, d, k) {
  const since = d.activity.since ?? d.last_seen
  if (k === 'asking') return `hand up ${minutesSince(c.nowMs, since)}`
  if (IDLE_CLASSES.has(k)) return `idle ${minutesSince(c.nowMs, since)}`
  return `shift ${minutesSince(c.nowMs, d.started_at)}`
}

/** Whiteboard strip, 12 cells: ✓ done, × failed, o running, · pending; past 12 agents it switches to counts. */
function meetingStrip(m) {
  const pending = Math.max(0, m.agents_total - m.agents_done - m.agents_failed - m.agents_running)
  if (m.agents_total <= 12) {
    return merge([
      ['✓'.repeat(m.agents_done), 'ship'], ['×'.repeat(m.agents_failed), 'warn'], ['o'.repeat(m.agents_running), 'meeting'], ['·'.repeat(pending), 'dim'],
    ])
  }
  const groups = [[`✓${m.agents_done}`, 'ship'], [`o${m.agents_running}`, 'meeting']]
  if (m.agents_failed) groups.push([`×${m.agents_failed}`, 'warn'])
  if (pending) groups.push([`·${pending}`, 'dim'])
  const out = []
  let used = 0
  for (const [t, r] of groups) {
    const need = displayWidth(t) + (out.length ? 1 : 0)
    if (used + need > 12) break
    if (out.length) out.push([' ', null])
    out.push([t, r])
    used += need
  }
  return out
}

// ---------------------------------------------------------------- the floor: a row per room, a line per desk

// a quiet desk (its turn is over and nothing is wrong) folds into its room's `+N more` line when the floor runs long
const QUIET = new Set(['done', 'break', 'dozing'])

/** The rooms with someone in, the most desks first: every desk of the project, on a break too, in seat order. */
function floorRooms(c) {
  const by = new Map()
  for (const d of c.f.live.desks) {
    if (!by.has(d.project)) by.set(d.project, [])
    by.get(d.project).push(d)
  }
  const rooms = [...by].map(([name, all]) => ({ name, all: [...all].sort(bySeat), busy: all.filter((d) => BUSY.has(cls(c, d))).length }))
  return rooms.sort((a, b) => b.all.length - a.all.length || b.busy - a.busy || a.name.localeCompare(b.name))
}

/**
 * The floor's columns: the timesheet's room name and `now`, then the desks' figure, title, what it is doing and how
 * long. The titles are as wide as the longest needs, up to under half the line, so every desk's work starts in one
 * column; below 72 columns the time goes into what it is doing.
 */
function floorLayout(c, desks) {
  const { W } = c
  const wide = W >= 72
  const nameW = W >= 86 ? 18 : wide ? 14 : Math.max(8, Math.min(12, W - 26))
  const gap = wide ? '  ' : ' '
  const indent = wide ? 4 : 2
  const timeW = wide ? Math.max(0, ...desks.map((d) => displayWidth(deskTime(c, d, cls(c, d))))) : 0
  const text = W - indent - 5 - gap.length - (timeW ? gap.length + timeW : 0)
  const want = Math.max(1, ...desks.map((d) => displayWidth(clean(d.title)) + (d.account ? displayWidth(clean(d.account)) + 2 : 0)))
  const titleW = Math.max(1, Math.min(want, Math.floor(text * 0.45)))
  return { nameW, gap, indent, timeW, titleW, doW: Math.max(0, text - titleW) }
}

/** `• island-tour-3d      ███?░░  3 working · 1 hand up · 2 interns`: the room's live mark, name, strip and counts. */
function roomRow(c, r, L) {
  const mark = r.all.some((d) => AWAKE.has(cls(c, d))) ? ['•', 'busy'] : ['•', 'idle']
  const cell = nowCell(c, r.all)
  const lead = [mark, [' ', null], [padR(clip(r.name, L.nameW), L.nameW), c.colors.get(r.name) ?? 'title'], [L.gap, null],
    ...cell, [' '.repeat(Math.max(0, 6 - lw(cell))), null], [L.gap, null]]
  return trimLine(fitGroups(roomGroups(c, r.all), c.W, { lead }).line)
}

/** `    ▛▛█  Coconut drum @work     edit rhythm.ts · 2 interns     shift 2h35`: one desk, in the floor's columns. */
function deskLine(c, d, L) {
  const k = cls(c, d)
  const role = k === 'dozing' ? 'dim' : CLASS_ROLE[k]
  const acc = d.account ? ` @${clean(d.account)}` : ''
  const title = clip(d.title, Math.max(1, L.titleW - displayWidth(acc)))
  const out = [[' '.repeat(L.indent), null], ...clawdRow(c, k, d.agent), [' ', null], [title, k === 'dozing' ? 'dim' : 'title'], [acc, 'dim'],
    [' '.repeat(Math.max(0, L.titleW - displayWidth(title) - displayWidth(acc))), null], [L.gap, null]]
  const doing = clean(L.timeW ? deskDoing(c, d) : rowDoing(c, d, k))
  const helpers = d.interns.length ? ` · ${plural(d.interns.length, 'intern')}` : ''
  const hw = displayWidth(helpers)
  const said = displayWidth(doing) + hw <= L.doW ? [[doing, role], [helpers, 'intern']]
    : helpers && L.doW - hw >= 8 ? [[clip(doing, L.doW - hw), role], [helpers, 'intern']]
      : [[clip(doing, L.doW), role]]
  out.push(...said)
  if (L.timeW) out.push([' '.repeat(Math.max(0, L.doW - lw(said))), null], [L.gap, null], [padL(deskTime(c, d, k), L.timeW), 'dim'])
  return trimLine(merge(out))
}

/** `    +3 more: 2 dozing · 1 done`: the quiet desks of a room on a long floor. */
function foldedLine(c, desks, L) {
  const by = new Map()
  for (const d of desks) by.set(ROW_WORD[cls(c, d)], (by.get(ROW_WORD[cls(c, d)]) ?? 0) + 1)
  return clipLine([[' '.repeat(L.indent), null], [`+${desks.length} more: ${[...by].map(([w, n]) => `${n} ${w}`).join(' · ')}`, 'dim']], c.W)
}

/**
 * The meeting room (running workflows): its row, as a room's, then one line per meeting, three at most and then
 * `+N more meetings`: the whiteboard (✓ done, × failed, o running, · to go), the name, how far along, its labels.
 */
function meetingLines(c, meetings, L) {
  const inRoom = meetings.reduce((s, m) => s + m.agents_running, 0)
  const lead = [['  ', null], [padR('meeting room', L.nameW), 'meeting'], [L.gap, null], [' '.repeat(6), null], [L.gap, null]]
  const out = [trimLine(fitGroups([[[`${meetings.length} running`, 'meeting']], [[`${inRoom} in the room`, 'meeting']]], c.W, { lead }).line)]
  const shown = meetings.slice(0, meetings.length > 3 ? 2 : 3)
  const nameW = Math.max(1, Math.min(Math.max(...shown.map((m) => displayWidth(clean(m.name)))), Math.floor((c.W - L.indent - 13) * 0.45)))
  for (const m of shown) {
    const st = meetingStrip(m)
    const pending = Math.max(0, m.agents_total - m.agents_done - m.agents_failed - m.agents_running)
    const line = [[' '.repeat(L.indent), null], ...st, [' '.repeat(Math.max(1, 13 - lw(st))), null], [padR(clip(m.name, nameW), nameW), 'title'], [L.gap, null],
      [`${m.agents_done}/${m.agents_total} done`, 'ship'], [` · ${m.agents_running} running`, 'meeting'],
      ...(m.agents_failed ? [[` · ${m.agents_failed} failed`, 'warn']] : []), [` · ${pending} to go`, 'dim']]
    const labels = sharedLabels(m.labels)
    if (labels) line.push([`${L.gap}${labels}`, 'dim'])
    out.push(trimLine(clipLine(merge(line), c.W)))
  }
  const hidden = meetings.slice(shown.length)
  if (hidden.length) {
    const agents = hidden.reduce((s, m) => s + m.agents_running, 0)
    out.push(clipLine([[' '.repeat(L.indent), null], [`+${plural(hidden.length, 'more meeting')} (${plural(agents, 'agent')})`, 'meeting']], c.W))
  }
  return out
}

/** `── the floor · room by room, desk by desk ──`: the rule over the live floor. */
function floorRule(c) {
  return rule('the floor', c.W, c.W >= 80 ? 'room by room, desk by desk' : 'room by room')
}

/**
 * The live floor, drawn as the timesheet draws a day: one row per room with someone in (its strip and its counts), one
 * line per desk under it, then the meeting room. Past `budget` lines the quiet desks of each room fold into one line,
 * then the last rooms keep their row alone, then the last rooms go to one `+N more rooms` line.
 */
function floorLines(c, budget = Infinity) {
  const meetings = c.f.live.desks.flatMap((d) => d.meetings.map((m) => ({ ...m, project: d.project })))
  const L = floorLayout(c, c.f.live.desks)
  const plan = floorRooms(c).map((r) => ({ r, desks: r.all, folded: [] }))
  const mtg = meetings.length ? 1 + Math.min(3, meetings.length) : 0
  const height = (cut) => plan.reduce((s, p) => s + 1 + p.desks.length + (p.folded.length ? 1 : 0), 0) + mtg + (cut ? 1 : 0)
  if (height() > budget) {
    for (const p of plan) {
      const quiet = p.r.all.filter((d) => QUIET.has(cls(c, d)))
      if (quiet.length < 2) continue
      p.desks = p.r.all.filter((d) => !QUIET.has(cls(c, d)))
      p.folded = quiet
    }
  }
  for (let i = plan.length - 1; i >= 0 && height() > budget; i--) Object.assign(plan[i], { desks: [], folded: [] })
  const cut = []
  while (plan.length > 1 && height(true) > budget) cut.unshift(plan.pop().r)
  const out = []
  for (const p of plan) {
    out.push(roomRow(c, p.r, L))
    for (const d of p.desks) out.push(deskLine(c, d, L))
    if (p.folded.length) out.push(foldedLine(c, p.folded, L))
  }
  if (cut.length) {
    const n = counts(c, cut.flatMap((r) => r.all))
    const tally = [...(n.working ? [`${n.working} working`] : []), ...idleGroups(n).map(([s]) => s)].join(' · ')
    out.push(clipLine([[`  +${plural(cut.length, 'more room')}: ${cut.map((r) => clean(r.name)).join(' · ')}${tally ? ` (${tally})` : ''}`, 'dim']], c.W))
  }
  if (meetings.length) out.push(...meetingLines(c, meetings, L))
  return out
}

// ---------------------------------------------------------------- header, glance, lobby, legend

/** Header sky: stars + moon at night, clouds + sun by day. Seeded by the date, so it only moves with the hour. */
function sky(c, n) {
  const { now } = c.f
  const rnd = seeded(now.local_date)
  const out = []
  for (let i = 0; i < n; i++) {
    const r = rnd()
    if (now.is_night) out.push(r < 0.12 ? ['·', 'night'] : r < 0.18 ? ['*', 'night'] : [' ', null])
    else out.push(r < 0.1 ? ['~', 'day'] : [' ', null])
  }
  if (now.is_night) {
    out[Math.round((Math.min(10, (now.hour - 20 + 24) % 24) / 10) * (n - 1))] = ['(', 'night']
  } else {
    const x = Math.max(1, Math.min(n - 2, Math.round(((now.hour - 7) / 12) * (n - 1))))
    out[x - 1] = ['-', 'day']
    out[x] = ['O', 'day']
    out[x + 1] = ['-', 'day']
  }
  return merge(out)
}

/** Line 1: `THE OFFICE · live · Mon 26 Oct · 01:40 · night shift` + the sky. Groups drop from the right when narrow. */
function header(c, view) {
  const { f, W } = c
  const hist = view === 'week' || view === 'month' || view === 'work' || isPastRange(f)
  const di = dayInfo(f.now.local_date)
  const when = hist ? f.range.label : `${di.wd} ${di.d} ${di.mon} · ${f.now.local_time}`
  const weekend = f.now.weekday === 'Sat' || f.now.weekday === 'Sun'
  const empty = !f.live.desks.length
  const shift = hist ? `as of ${f.now.weekday} ${f.now.local_time}`
    : empty ? (f.now.is_night ? 'lights off' : 'nobody in')
      : f.now.is_night ? 'night shift' : weekend ? 'weekend shift' : 'office hours'
  const shiftRole = hist ? 'dim' : f.now.is_night ? 'night' : 'day'
  const label = ({ all: ALL_LABEL, work: 'what they did', ...(hist ? { today: 'that day' } : {}) }[view] ?? view) + (c.project ? ` · ${c.project}` : '')
  const groups = [[SEP, [clip(label, W - 13), 'title']], [SEP, [when, null]], [SEP, [shift, shiftRole]]]
  const { line } = fitGroups(groups, W, { sep: null, lead: [['THE OFFICE', 'accent']] })
  const used = lw(line)
  const n = Math.min(30, W - used - 4)
  if (n < 8) return line
  return trimLine([...line, [' '.repeat(W - used - n), null], ...sky(c, n)])
}

function glanceGroups(c, short) {
  return glanceGroupsOf(counts(c, c.f.live.desks), short)
}

/** A mixed office's headcount by character, `4 Clawd · 2 Dex · 1 Gem`: the glance adds it where its line has room. */
function castGroups(c) {
  const D = c.f.live.desks
  const cast = castOn(D)
  return cast.length > 1 ? cast.map((a) => [[`${D.filter((d) => d.agent === a).length} ${CAST[a].who}`, castRole(a)]]) : []
}

/** The agents at desks, in the cast's order (Clawd first). */
const castOn = (desks) => Object.keys(CAST).filter((a) => desks.some((d) => d.agent === a))

/** `███?░░ 3 working · 1 hand up`: the strip, a space, then whole groups that fit. */
function stripAndGroups(st, groups, W) {
  if (lw(st) > W) return { line: [], n: 0 }
  const out = [...st]
  let used = lw(st)
  let n = 0
  for (const g of groups) {
    const need = lw(g) + (n ? 3 : 1)
    if (used + need > W) break
    out.push(n ? SEP : [' ', null], ...g)
    used += need
    n++
  }
  return { line: out, n }
}

/** Line 2: `10 desks █████▒?░░░ 5 working · …`; full wording, else short, else short wrapped under the first group. */
function glance(c) {
  const D = c.f.live.desks
  const lead = [[plural(D.length, 'desk'), 'title'], [' ', null], ...strip(c, D, 20)]
  const who = castGroups(c)
  for (const short of [false, true]) {
    const g = glanceGroups(c, short)
    const r = stripAndGroups(lead, g, c.W)
    if (r.n !== g.length) continue
    // who is in by character, when the whole of it fits after the counts (the legend under the floor says it anyway)
    const all = who.length ? stripAndGroups(lead, [...g, ...who], c.W) : null
    return [all?.n === g.length + who.length ? all.line : r.line]
  }
  const g = glanceGroups(c, true)
  const l1 = stripAndGroups(lead, g, c.W)
  const indent = lw(lead) + 1
  const l2 = fitGroups(g.slice(l1.n), c.W - indent).line
  return l2.length ? [l1.line, [[' '.repeat(indent), null], ...l2]] : [l1.line]
}

/** Lines under the floor: the projects with their lights off (live), the coat rack and the live visitors. */
function lobbyLines(c, view) {
  const { f, W, A, colors } = c
  const out = []
  if (view === 'live') {
    const lit = new Set(f.live.desks.map((d) => d.project))
    const dark = f.projects.filter((p) => !lit.has(p.name))
    if (dark.length) {
      const r = fitGroups(dark.map((p) => [[p.name, 'dim']]), W - 11, { lead: [['lights off: ', 'dim']] })
      const rest = dark.length - r.n + f.projects_more
      out.push(rest > 0 ? [...r.line, [`${r.n ? ' · ' : ' '}+${rest} more`, 'dim']] : r.line)
    }
  }
  const left = f.live.recently_left
  const parts = []
  if (left.length) {
    parts.push(['coat rack ', 'dim'], [A ? '-+-' : '─┼─', 'floor'], [' ', null])
    left.slice(0, 2).forEach((l, i) => {
      if (i) parts.push(SEP)
      parts.push([l.project, colors.get(l.project) ?? 'title'], [` "${clip(l.title, 26)}" left ${minutesSince(c.nowMs, l.left_at)} ago`, 'dim'])
    })
    if (left.length > 2) parts.push([` +${left.length - 2}`, 'dim'])
  }
  const visiting = visitors(f).filter((v) => v.live)
  if (visiting.length) parts.push(...(parts.length ? [['   ', null]] : []), ['visitors: ', 'dim'], [visiting.map((v) => `${v.tool} @ ${v.project}`).join(' · '), 'accent'])
  if (parts.length) out.push(clipLine(parts, W))
  return out
}

/**
 * Live view's last line: every pose of the figures on the desk lines and what it means, an error's and a stop's only
 * when a desk shows one; pairs drop from the right when narrow.
 */
function legend(c) {
  const still = { ...c, frame: 0 }
  const pose = (k) => trimLine(clawdRow(still, k))
  const on = new Set(c.f.live.desks.map((d) => cls(c, d)))
  const rare = [['error', 'error'], ['stopped', 'stopped']].filter(([k]) => on.has(k)).map(([k, t]) => [pose(k), t])
  const pairs = [[pose('working'), 'working'], [pose('waiting'), 'waiting on helpers'], [pose('asking'), 'hand up'], ...rare, [pose('done'), 'done'],
    [pose('dozing'), 'dozing'], [pose('break'), 'on break']]
  return fitGroups(pairs.map(([g, t]) => [...g, [` ${t}`, 'dim']]), c.W, { sep: ['  ', null] }).line
}

/**
 * Who is who, under a floor where more than Clawd works: each character's head with its name and agent
 * (`▐>▌ Dex/Codex`), then the accounts the desks carry (`@main @work`). Nothing for an all-Clawd office of one account.
 */
function castLegend(c) {
  const D = c.f.live.desks
  const cast = castOn(D)
  const accounts = [...new Set(D.map((d) => d.account).filter(Boolean))]
  if ((cast.length <= 1 && !cast.some((a) => a !== 'claude')) && !accounts.length) return []
  const pairs = cast.map((a) => [[glyph(c, CAST[a].face.front), castRole(a)], [` ${CAST[a].who}/${CAST[a].name}`, 'dim']])
  const line = fitGroups(pairs, c.W, { sep: ['  ', null] }).line
  if (accounts.length) {
    const rest = c.W - lw(line) - 1
    const acc = fitGroups(accounts.map((a) => [[`@${a}`, 'accent']]), rest - 10, { sep: [' ', null], lead: [['   accounts: ', 'dim']] })
    if (acc.n) return [trimLine([...line, ...acc.line])]
  }
  return [line]
}

// ---------------------------------------------------------------- the now column

/** `now` cell: the project's live strip, then one `i` per intern in the cells left (`+` when cut). */
function nowCell(c, desks, cells = 6) {
  const st = strip(c, desks, cells)
  const ni = desks.reduce((s, d) => s + d.interns.length, 0)
  const room = cells - lw(st)
  const ii = ni && room > 0 ? (ni > room ? `${'i'.repeat(room - 1)}+` : 'i'.repeat(ni)) : ''
  return [...st, [ii, 'intern']]
}

// ---------------------------------------------------------------- departments, totals, staff, visitors

const SPARK = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

function spark(vals) {
  const max = Math.max(0, ...vals)
  return vals.map((v) => (v <= 0 || !max ? '·' : SPARK[Math.min(7, Math.max(0, Math.ceil((v / max) * 8) - 1))])).join('')
}

/** Eighth-block bar of n cells; --ascii recomputes it as whole `#` cells instead of folding the partial glyph. */
function bar(v, max, n, A) {
  if (!max || n <= 0 || v <= 0) return ''
  if (A) return '#'.repeat(Math.min(n, Math.round((v / max) * n)))
  const e = Math.min(n * 8, Math.round((v / max) * n * 8))
  return '█'.repeat(Math.floor(e / 8)) + EIGHTHS[e % 8]
}

// the kind-of-work column: wide enough for the longest of model.mjs DEPARTMENT_WORK (`talking to you`) and a blank
const WORK_COL = 15
// one-column charts list this many departments, then name the rest on one `+N more` line
const ONE_COL_ROWS = 6

/**
 * "What they did": every tool call of the range sorted by kind of work into office departments, as a chart that says
 * what it shows (a dim line naming the columns, then department, kind of work, a bar and the share of all tool calls,
 * the calls), or in `all` one wrapped sentence that names the kind of work next to each department. Two columns of
 * departments from 96 columns, one column below (60 or less drops the bar, under 40 the kind of work).
 */
function departments(c, sentence = false) {
  const { f, W, A } = c
  if (sentence) return departmentSentence(f.totals.activity, W)
  const { rows, total } = departmentRows(f.totals.activity)
  if (!rows.length) return [[['no tool calls in this range yet', 'dim']]]
  const max = rows[0].v
  const two = W >= 96
  const colW = two ? Math.floor((W - 2) / 2) : W
  const workW = colW >= 40 ? WORK_COL : 0
  const barW = Math.max(0, colW - 14 - workW - 11)
  const cell = (r) => [
    [padR(r.name, 14), 'title'], ...(workW ? [[padR(r.work, workW), 'dim']] : []), ...(barW ? [[padR(bar(r.v, max, barW, A), barW), 'accent']] : []),
    [padL(pct(r.v, total), 4), null], [padL(fmtCount(r.v), 7), 'dim'],
  ]
  // the column names, in as many words as fit
  const heads = workW ? ['department · kind of work · share of tool calls · calls', 'department · kind of work · share · calls', 'department · kind · share · calls']
    : ['department · share of tool calls · calls', 'department · share · calls']
  const head = [heads.find((h) => displayWidth(h) <= W) ?? heads.at(-1), 'dim']
  const out = []
  if (two) {
    const half = Math.ceil(rows.length / 2)
    for (let i = 0; i < half; i++) out.push([...cell(rows[i]), ...(rows[i + half] ? [['  ', null], ...cell(rows[i + half])] : [])])
  } else {
    for (const r of rows.slice(0, ONE_COL_ROWS)) out.push(cell(r))
    const rest = rows.slice(ONE_COL_ROWS)
    if (rest.length) {
      const groups = rest.map((r) => [[`${r.name} ${pct(r.v, total)}`, 'dim']])
      const lead = [[`+${rest.length} more: `, 'dim']]
      const all = fitGroups(groups, W, { lead })
      const some = all.n < rest.length ? fitGroups(groups, W - 2, { lead }) : all
      out.push(some.n < rest.length ? [...some.line, [' …', 'dim']] : some.line)
    }
  }
  return [[head], ...out].map((l) => clipLine(merge(l), W))
}

/**
 * The `work` view's legend: what each department counts, in plain words (`server room = terminal commands · QA lab =
 * running tests · …`), wrapped over as many lines as the width needs. Every department is named, used or not, so the
 * office's vocabulary reads the same week after week.
 */
function departmentLegend(c) {
  const groups = DEPARTMENTS.map(([k, name]) => [[name, 'title'], [` = ${DEPARTMENT_WORDS[k]}`, 'dim']])
  const out = []
  for (let i = 0; i < groups.length;) {
    const r = fitGroups(groups.slice(i), c.W)
    if (!r.n) { out.push(clipLine(groups[i], c.W)); i++; continue }
    out.push(r.line)
    i += r.n
  }
  return out
}

/** `528h agent-time (95h35 at desks) · 163 sessions · …` (model.mjs totalsLine). */
function totalsLine(c) {
  return totalsLineOf(c.f.totals, c.W)
}

function staffLines(c, crew = true) {
  return staffLinesOf(c.f, c.W, { crew })
}

// ---------------------------------------------------------------- awards (facts only, never about the human)

/**
 * `★ award subject (value)` pieces, greedily bin-packed into ≤ 3 lines with 3 spaces between. Hours say they are
 * agent-time (they can pass wall time) where space allows: when the long values would cost an award, the short ones go.
 */
function awardLines(c, list, max = 3) {
  const long = packAwards(c, list, max, false)
  if (long.placed === list.length || !list.some((a) => a.short)) return long.lines
  const short = packAwards(c, list, max, true)
  return short.placed > long.placed ? short.lines : long.lines
}

function packAwards(c, list, max, short) {
  const { W, colors } = c
  const pieces = list
    .map((a) => [
      ['★ ', 'accent'], [`${a.k} `, 'title'], [a.subj ?? a.who, a.subj ? null : colors.get(a.who) ?? null], [` (${(short && a.short) || a.val})`, 'dim'],
    ])
    .filter((p) => lw(p) <= W)
  const total = pieces.length
  const lines = []
  while (pieces.length && lines.length < max) {
    const cur = []
    let used = 0
    for (let i = 0; i < pieces.length;) {
      const pw = lw(pieces[i])
      if (used + (used ? 3 : 0) + pw > W) { i++; continue }
      if (used) { cur.push(['   ', null]); used += 3 }
      cur.push(...pieces[i])
      used += pw
      pieces.splice(i, 1)
    }
    lines.push(cur)
  }
  return { lines, placed: total - pieces.length }
}

// ---------------------------------------------------------------- the timesheet: today, the week, the month

// the agent-h column, as wide as its name: `14h25` today, `394h` in a week, `1274h` in a month
const HOURS_W = 7

/**
 * One sparkline cell for `v` against `max`; a dim `·` for nothing. `soft` scales by the square root, so one room's
 * long days leave the others their shape (a day strip, on one scale for every room).
 */
function sparkCell(v, max, soft = false) {
  const x = soft ? Math.sqrt(v / max) : v / max
  return v > 0 ? [SPARK[Math.min(7, Math.max(0, Math.ceil(x * 8) - 1))], 'accent'] : ['·', 'dim']
}

/** 24 cells, one per local hour: a sparkline up to now, the `▕` marker on the next hour, blank after (still to come). */
function hourStrip(c, perHour, max) {
  const H = isPastRange(c.f) ? 23 : c.f.now.hour
  const out = []
  for (let h = 0; h < 24; h++) {
    if (h <= H) out.push(sparkCell(perHour[h], max))
    else if (h === H + 1) out.push([c.A ? '|' : '▕', 'accent'])
    else out.push([' ', null])
  }
  return merge(out)
}

/**
 * The days a strip shows in `room` columns: a week (10 days or fewer) gets two cells a day under its weekdays (`Mo`),
 * a month one a day under the dates of its Mondays, and only its last days when all of them do not fit.
 */
function dayPlan(days, room) {
  const wide = days.length <= 10 && days.length * 3 - 1 <= room
  if (wide) return { days, wide, w: Math.max(0, days.length * 3 - 1), head: days.map((d) => dayInfo(d).wd.slice(0, 2)).join(' ') }
  const shown = days.slice(-Math.max(1, Math.min(days.length, room)))
  const head = new Array(shown.length).fill(' ')
  shown.forEach((d, i) => {
    const { d: date, wdi } = dayInfo(d)
    const t = String(date)
    if (wdi === 0 && i + t.length <= head.length) [...t].forEach((ch, j) => { head[i + j] = ch })
  })
  return { days: shown, wide, w: shown.length, head: head.join('').trimEnd() }
}

/** The strip of a dayPlan: each day's agent-time as a sparkline cell (twice over in a week), against `max`. */
function dayStrip(plan, perDay, max) {
  const out = []
  plan.days.forEach((d, i) => {
    const [g, r] = sparkCell(num(perDay[d]?.minutes), max, true)
    if (plan.wide && i) out.push([' ', null])
    out.push([plan.wide ? g + g : g, r])
  })
  return merge(out)
}

/** `── timesheet · since midnight · ▕ now 01:40 ──`, or `day by day` over a week or a month. */
function sheetRule(c) {
  const unit = rangeUnit(c.f)
  if (unit === 'today') return rule('timesheet', c.W, isPastRange(c.f) ? 'midnight to midnight' : `since midnight · ${c.A ? '|' : '▕'} now ${c.f.now.local_time}`)
  return rule('timesheet', c.W, unit === 'month' && c.W >= 80 ? 'day by day · the dates are Mondays' : 'day by day')
}

/**
 * The timesheet every history view draws (today, the week, the month, and the week in `all`): one row per room,
 * busiest first, with its live mark, who is in now, the range as a strip on one scale for every room (hour by hour
 * today, day by day over a week or a month), its agent-time with a bar, its interns and its ships, and under it what
 * was on its desk and the last thing it shipped. Then the all-rooms row, and the rooms left out with their agent-time.
 */
function sheet(c, rows = 8) {
  const { f, W, A, colors } = c
  const unit = rangeUnit(f)
  const nameW = W >= 86 ? 18 : W >= 72 ? 14 : 12
  const gap = ' '.repeat(W >= 72 ? 2 : 1)
  const showInterns = W >= 86
  const lead = 2 + nameW + 2 * gap.length + 6
  const tail = HOURS_W + (showInterns ? 8 : 0) + 6
  const P = f.projects.slice(0, Math.max(1, rows))
  // a week floors whole hours as its pixel tower does (fmtHours, `h` kept past 999); today and a month keep minutes
  const fmt = unit === 'week' ? fmtAgentTime : fmtMin
  let st
  if (unit === 'today') {
    const H = isPastRange(f) ? 23 : f.now.hour
    const max = Math.max(1, ...P.flatMap((p) => p.per_hour.slice(0, H + 1)))
    const all = Math.max(1, ...f.per_hour.slice(0, H + 1))
    st = { w: 24, head: '00    06    12    18', row: (p) => hourStrip(c, p.per_hour, max), all: () => hourStrip(c, f.per_hour, all) }
  } else {
    const plan = dayPlan(f.range.days, W - lead - gap.length - tail - 1)
    const max = Math.max(1, ...P.flatMap((p) => plan.days.map((d) => num(p.per_day[d]?.minutes))))
    const all = Math.max(1, ...plan.days.map((d) => num(f.per_day[d]?.minutes)))
    st = { w: plan.w, head: plan.head, row: (p) => dayStrip(plan, p.per_day, max), all: () => dayStrip(plan, f.per_day, all) }
  }
  const barW = Math.min(20, W - lead - st.w - gap.length - tail - 1)
  const showBar = barW >= 8
  const amax = Math.max(1, ...P.map((p) => p.agent_minutes))
  const cols = (interns, ships) => [...(showBar ? [[' '.repeat(barW + 1), null]] : []), ...(showInterns ? [interns] : []), ships]
  const head = `  ${padR('room', nameW)}${gap}${padR('now', 6)}${gap}${padR(st.head, st.w)}${gap}${padL('agent-h', HOURS_W)}`
  const lines = [clipLine(merge([[head, 'dim'], ...cols([padL('interns', 8), 'dim'], [padL('ships', 6), 'dim'])]), W)]
  for (const p of P) {
    const desks = f.live.desks.filter((d) => d.project === p.name)
    const mark = desks.some((d) => AWAKE.has(cls(c, d))) ? ['•', 'busy'] : desks.length ? ['•', 'idle'] : [' ', null]
    const cell = desks.length ? nowCell(c, desks) : [['·', 'dim']]
    const row = [mark, [' ', null], [padR(clip(p.name, nameW), nameW), colors.get(p.name) ?? 'title'], [gap, null], ...cell,
      [' '.repeat(Math.max(0, 6 - lw(cell))), null], [gap, null], ...st.row(p), [gap, null],
      [padL(p.agent_minutes ? fmt(p.agent_minutes) : '·', HOURS_W), p.agent_minutes ? null : 'dim']]
    if (showBar) row.push([' ', null], [padR(bar(p.agent_minutes, amax, barW, A), barW), colors.get(p.name) ?? 'accent'])
    if (showInterns) row.push([padL(String(p.subagents), 8), 'intern'])
    row.push([padL(String(p.commits), 6), p.commits ? 'ship' : 'dim'])
    lines.push(clipLine(merge(row), W))
    const commit = p.top_commits[0]
    const shipped = commit && ms(commit.time, 0) >= ms(f.range.from, Infinity)
    const note = [p.titles[0], shipped ? `shipped "${commit.subject}"` : null].filter(Boolean).join(' · ')
    if (note) lines.push([[' '.repeat(lead), null], [clip(note, W - lead), 'dim']])
  }
  lines.push(clipLine(merge([['  ', null], [padR('all rooms', nameW), 'title'], [gap, null], [padR(String(f.live.desks.length || '·'), 6), 'title'], [gap, null],
    ...st.all(), [gap, null], [padL(fmt(f.totals.agent_minutes), HOURS_W), 'title'],
    ...cols([padL(String(f.totals.subagents), 8), 'intern'], [padL(String(f.totals.commits), 6), 'ship'])]), W))
  const more = f.projects.length - P.length + f.projects_more
  if (more > 0) {
    const rest = restMinutes(f, P)
    lines.push([[`  +${plural(more, 'more room')}${rest ? ` · ${fmt(rest)} agent-time` : ''}`, 'dim']])
  }
  return lines
}

// ---------------------------------------------------------------- empty office

/**
 * Nobody at a desk: how the office is (the cat is in charge at night), the rooms worked in today with their
 * agent-time and when the last one left, the coat rack, and outside `all` what they did and today's totals.
 */
function emptyOffice(c, inAll) {
  const { f, W, A, colors } = c
  const D = f.now.local_date
  const night = f.now.is_night
  const todayMin = (p) => num(p.per_day[D]?.minutes)
  const out = [header(c, inAll ? 'all' : 'live')]
  const dayMood = num(f.per_day[D]?.minutes) ? 'everyone stepped out · the desks are tidy' : 'nobody in yet · the desks are tidy'
  out.push(clipLine([['0 desks', 'title'], SEP, [night ? 'everyone clocked out · the office cat is in charge' : dayMood, 'dim']], W), [])
  out.push(rule('the floor', W, night ? 'lights off' : 'nobody in'))
  const lit = f.projects.filter((p) => todayMin(p) > 0).sort((a, b) => todayMin(b) - todayMin(a) || a.name.localeCompare(b.name))
  const nameW = W >= 86 ? 18 : W >= 72 ? 14 : 12
  const gap = W >= 72 ? '  ' : ' '
  const shown = lit.slice(0, inAll ? 4 : 8)
  for (const p of shown) {
    const left = f.live.recently_left.find((l) => l.project === p.name)
    const note = [`${fmtMin(todayMin(p))} agent-time today`, left ? `last out ${minutesSince(c.nowMs, left.left_at)} ago` : null].filter(Boolean).join(' · ')
    out.push(clipLine([['  ', null], [padR(clip(p.name, nameW), nameW), colors.get(p.name) ?? 'title'], [gap, null], [note, 'dim']], W))
  }
  if (!shown.length) out.push([['  no room was lit today', 'dim']])
  if (lit.length > shown.length) out.push([[`  +${plural(lit.length - shown.length, 'more room')} lit today`, 'dim']])
  const last = f.live.recently_left[0]
  const lobby = [['coat rack ', 'dim'], [A ? '-+-' : '─┼─', 'floor'], [' ', null]]
  if (last) {
    const ago = minutesSince(c.nowMs, last.left_at)
    lobby.push(['last one out: ', 'dim'], [last.project, colors.get(last.project) ?? 'title'], [` "${clip(last.title, 30)}" ${ago} ago`, 'dim'])
  }
  else lobby.push(['empty hooks', 'dim'])
  out.push([], clipLine(lobby, W))
  if (!inAll) {
    out.push(...basementLine(c))
    const t = f.per_day[D]
    const week = [['/theoffice week', 'accent'], [' for the week', 'dim']]
    const groups = t
      ? [[[fmtMin(num(t.minutes)), 'title'], [' agent-time', 'dim']], [[`${num(t.sessions)}`, null], [' sessions', 'dim']],
          [[`${num(t.subagents)}`, 'intern'], [' interns', 'dim']], [[`${num(t.commits)}`, 'ship'], [' commits', 'dim']], week]
      : [week]
    out.push(fitGroups(groups, W, { lead: [['today so far: ', 'dim']] }).line)
  }
  return out
}

// ---------------------------------------------------------------- narrow (under 60 columns)

/**
 * Below 60 columns the timesheet's strip does not fit, so every view becomes a list that does: the header, the
 * headcount, the floor in its narrow columns (one line per desk under its room, the meetings); history views list the
 * rooms with a sparkline and their agent-time. The desktop dock is often this narrow.
 */
function viewNarrow(c, view) {
  const { f } = c
  const out = [header(c, view)]
  if (view === 'work') return [...out, totalsLine(c), [], ...whatTheyDid(c)]
  const live = view === 'live' || view === 'all' || (view === 'today' && !isPastRange(f) && f.live.desks.length)
  if (live) out.push(...narrowLive(c, view))
  if (view === 'live') return out
  if (live) out.push([])
  const unit = rangeUnit(f)
  if (view === 'all') out.push(rule(rangeWord(f), c.W))
  out.push(totalsLine(c), ...narrowTenants(c, view === 'all' ? 8 : 12))
  if (view === 'month') out.push([], ...crewTable(c))
  return out
}

function narrowLive(c, view) {
  const { f, W } = c
  const D = f.live.desks
  if (!D.length) {
    const m = num(f.per_day[f.now.local_date]?.minutes)
    const groups = [[['0 desks', 'title']], [[f.now.is_night ? 'lights off' : 'nobody in yet', 'dim']], [[`${fmtMin(m)} agent-time today`, 'dim']]]
    return [fitGroups(groups, W).line]
  }
  const lead = [[plural(D.length, 'desk'), 'title'], [' ', null]]
  const out = [[...lead, ...strip(c, D, Math.max(4, Math.min(20, W - lw(lead))))]]
  let g = glanceGroups(c, true)
  while (g.length) {
    const r = fitGroups(g, W - 1, { lead: [[' ', null]] })
    if (!r.n) break
    out.push(r.line)
    g = g.slice(r.n)
  }
  out.push(rule('the floor', W), ...floorLines(c, view === 'all' ? 16 : 30), ...lobbyLines(c, view === 'all' ? 'all' : 'live'))
  return out.map((l) => clipLine(l, W))
}

/** One row per tenant: live mark, name, the range's last days as a sparkline, agent-time. */
function narrowTenants(c, max) {
  const { f, W, colors } = c
  const nameW = Math.max(8, Math.min(18, W - 24))
  const days = f.range.days.slice(-Math.max(1, Math.min(f.range.days.length, W - nameW - 10)))
  const out = []
  for (const p of f.projects.slice(0, max)) {
    const desks = f.live.desks.filter((d) => d.project === p.name)
    const mark = desks.some((d) => AWAKE.has(cls(c, d))) ? ['•', 'busy'] : desks.length ? ['•', 'idle'] : [' ', null]
    const role = colors.get(p.name) ?? 'title'
    const sp = spark(days.map((d) => num(p.per_day[d]?.minutes)))
    const hours = [padL(p.agent_minutes ? fmtH(p.agent_minutes) : '·', 6), p.agent_minutes ? null : 'dim']
    out.push(clipLine([mark, [' ', null], [padR(clip(p.name, nameW), nameW), role], [' ', null], [sp, role], hours], W))
  }
  const more = f.projects.length - Math.min(max, f.projects.length) + f.projects_more
  if (more > 0) out.push([[`  +${plural(more, 'more tenant')}`, 'dim']])
  return out
}

// ---------------------------------------------------------------- views

/** `live`: the headcount, the floor room by room and desk by desk, who left, what they did, and what the figures mean. */
function viewLive(c) {
  if (!c.f.live.desks.length) return emptyOffice(c, false)
  return [header(c, 'live'), ...glance(c), [], floorRule(c), ...floorLines(c, 34), [], ...lobbyLines(c, 'live'), ...basementLine(c), legend(c), ...castLegend(c)]
}

/**
 * The live view's basement, as the pixel Office draws it (B1, what they did): one line, the busiest departments first
 * with their share of the range's tool calls, `what they did (share of 51k tool calls): server room/terminal 40% ·
 * typing pool/coding 14% · … +4 more`. When that keeps fewer than three, a shorter lead and then the department names
 * alone (`what they did: server room 40% · …`). Nothing without tool calls, or when not even one fits: one clean line
 * or none.
 */
function basementLine(c) {
  const { rows, total } = departmentRows(c.f.totals.activity)
  if (!rows.length) return []
  const long = [['what they did', 'title'], [` (share of ${fmtCount(total)} tool calls): `, 'dim']]
  const short = [['what they did', 'title'], [': ', 'dim']]
  const full = rows.map((r) => [[r.name, 'title'], [`/${r.work} `, 'dim'], [pct(r.v, total), 'accent']])
  const bare = rows.map((r) => [[`${r.name} `, 'title'], [pct(r.v, total), 'accent']])
  const fit = (lead, groups) => {
    const r = fitGroups(groups, c.W, { lead })
    // a list that does not end there keeps room for its `+N more` tail
    return r.n < rows.length ? fitGroups(groups, c.W - 9, { lead }) : r
  }
  const tries = [[long, full], [short, full], [short, bare]].map(([lead, groups]) => fit(lead, groups))
  const r = tries.find((t) => t.n >= Math.min(3, rows.length)) ?? tries.at(-1)
  if (!r.n) return []
  const more = rows.length - r.n
  return [trimLine([...r.line, ...(more ? [[` +${more} more`, 'dim']] : [])])]
}

/** The tool calls the departments share: every activity count (what the percentages are of), else the facts' total. */
function toolCalls(c) {
  return departmentRows(c.f.totals.activity).total || c.f.totals.tool_calls
}

/** The departments, then the interns, staff and visitors; `crew: false` when the view draws the crew's own table. */
function whatTheyDid(c, crew = true) {
  return [rule('what they did', c.W, `${fmtCount(toolCalls(c))} tool calls`), ...departments(c), ...staffLines(c, crew)]
}

/** whatTheyDid and a blank line, unless the caller draws it elsewhere (`departments: false`, the HTML page). */
function whatTheyDidBlock(c, crew = true) {
  return c.dep ? [...whatTheyDid(c, crew), []] : []
}

/**
 * The month's crew, as the pixel month's last room: one row per AI that worked, busiest first, with its name and
 * character, its agents (its sessions), its agent-time with a bar on one scale and its share of the agent-time, then
 * the all-AIs row. Narrower, the character goes first, then the bar, then the share.
 */
function crewTable(c) {
  const { f, W, A } = c
  const rows = crewRows(f)
  const sub = W >= 72 && rows.length ? `${plural(rows.length, 'AI')} · an agent is one session` : rows.length ? plural(rows.length, 'AI') : ''
  if (!rows.length) return [rule('the crew', W, sub), [['  nobody on the crew yet', 'dim']]]
  const who = W >= 60
  const nameW = who ? 15 : 8
  const showPct = W >= 36
  const barW = Math.min(20, W - 2 - nameW - 7 - (HOURS_W + 1) - 2 - (showPct ? 5 : 0))
  const showBar = barW >= 6
  const max = Math.max(1, ...rows.map((r) => r.min))
  const total = rows.reduce((s, r) => s + r.min, 0)
  const fmtN = (n) => (n == null ? '·' : String(n))
  const head = `  ${padR('AI', nameW)}${padL('agents', 7)}${padL('agent-h', HOURS_W + 1)}${showBar || showPct ? `  ${showBar ? padR('share', barW) : ''}` : ''}`
  const out = [rule('the crew', W, sub), [[head, 'dim']]]
  for (const r of rows) {
    const ch = CAST[r.a]
    const role = castRole(r.a)
    const name = who ? [[padR(ch.name, 8), role], [padR(ch.who, nameW - 8), 'dim']] : [[padR(ch.name, nameW), role]]
    const row = [['  ', null], ...name, [padL(fmtN(r.n), 7), r.n == null ? 'dim' : null], [padL(fmtMin(r.min), HOURS_W + 1), null]]
    if (showBar || showPct) row.push(['  ', null])
    if (showBar) row.push([padR(bar(r.min, max, barW, A), barW), role])
    if (showPct) row.push([padL(pct(r.min, total), showBar ? 5 : 4), null])
    out.push(row)
  }
  if (rows.length > 1) {
    // the agents add up only when every AI's are known
    const n = rows.every((r) => r.n != null) ? String(rows.reduce((s, r) => s + r.n, 0)) : '·'
    out.push([['  ', null], [padR('all AIs', nameW), 'title'], [padL(n, 7), n === '·' ? 'dim' : 'title'], [padL(fmtMin(total), HOURS_W + 1), 'title']])
  }
  return out.map((l) => clipLine(merge(l), W))
}

// the most lines a history view prints, so the skill's paste stays short: rooms go first (three at least)
const SHEET_LINES = { today: 40, week: 40, month: 46 }

/** `today`, `week` and `month`: the range's totals, its timesheet, what they did and a few awards. */
function viewSheet(c, view) {
  const top = [header(c, view), totalsLine(c)]
  const isToday = view === 'today' && !isPastRange(c.f)
  if (isToday && c.f.live.desks.length) top.push(...glance(c))
  const live = isToday ? liveAwards(c.f, c.nowMs, (d) => cls(c, d)) : []
  // the month's crew is a table of its own, under what they did (the pixel month's last room)
  const crew = view === 'month' ? [...crewTable(c), []] : []
  const awards = awardLines(c, pickAwards([...live, ...historyAwards(c.f, rangeUnit(c.f))], isToday ? 1 : 0))
  const tail = [[], ...whatTheyDidBlock(c, view !== 'month'), ...crew, ...awards]
  // the timesheet is a head, two lines a room, the all-rooms row and the rooms left out
  const room = SHEET_LINES[view] - top.length - 2 - 3 - tail.length
  return [...top, [], sheetRule(c), ...sheet(c, Math.max(3, Math.min(8, Math.floor(room / 2)))), ...tail]
}

/**
 * `work`, what they did: the range's totals, the departments chart (department, kind of work, share of all tool calls,
 * calls), the interns, staff and visitors, then a legend saying what every department counts in plain words.
 */
function viewWork(c) {
  return [
    header(c, 'work'), totalsLine(c), [],
    ...whatTheyDid(c), [],
    rule('the departments', c.W, c.W >= 80 ? 'every tool call an agent made, by kind of work' : 'by kind of work'), ...departmentLegend(c),
  ]
}

/**
 * Default view (`all`): the live floor (18 lines at most) over the week's timesheet, one departments sentence and ≤ 3
 * award lines, ≤ 50 lines: the timesheet gives rooms back first (three at least).
 */
function viewAll(c) {
  const out = []
  if (c.f.live.desks.length) out.push(header(c, 'all'), ...glance(c), [], floorRule(c), ...floorLines(c, 18), ...lobbyLines(c, 'all'))
  else out.push(...emptyOffice(c, true))
  const dep = departments(c, true)
  const unit = rangeUnit(c.f)
  const aw = awardLines(c, pickAwards([...liveAwards(c.f, c.nowMs, (d) => cls(c, d)), ...historyAwards(c.f, unit)], 1))
  // the timesheet is a head, two lines a room, the all-rooms row and the rooms left out
  const room = 50 - out.length - 3 - 3 - (dep.length ? dep.length + 1 : 0) - (aw.length ? aw.length + 1 : 0)
  out.push([], rule(rangeWord(c.f), c.W, c.f.range.label), totalsLine(c), ...sheet(c, Math.max(3, Math.min(8, Math.floor(room / 2)))))
  if (dep.length) out.push([], ...dep)
  if (aw.length) out.push([], ...aw)
  return out
}

const VIEW_FN = { live: viewLive, today: viewSheet, week: viewSheet, month: viewSheet, work: viewWork, all: viewAll }

function context(facts, { width, frame, ascii, project, departments = true }) {
  const asked = Math.floor(Number(width) || 100)
  return {
    ...readFacts(facts, { project }),
    W: asked < 60 ? Math.max(20, asked) : Math.min(140, asked),
    narrow: asked < 60,
    A: !!ascii,
    frame: Math.abs(Math.floor(Number(frame) || 0)),
    dep: departments !== false,
  }
}

/**
 * Draw the office as lines of `[text, role]` spans. `view` ∈ VIEWS (`all` = live floor + the week's timesheet +
 * awards, `work` = what they did), `width` is at most 140; from 60 up every view draws its columns, below 60 (down to
 * 20) the narrow list, so a narrow pane gets lines that fit. `frame` moves the live floor's thinking bubbles and
 * snores (static output uses 0), `ascii` folds every glyph to printable 7-bit, `project` filters by substring.
 * `departments: false` leaves "what they did" out of today, week and month, for a page that draws it under its own
 * picture. Pure: the same facts and options give the same lines.
 */
export function renderOffice(facts, { view = 'all', width = 100, frame = 0, ascii = false, project, departments = true } = {}) {
  const c = context(facts, { width, frame, ascii, project, departments })
  const v = VIEW_FN[view] ? view : 'all'
  return finishLines(c.narrow ? viewNarrow(c, v) : VIEW_FN[v](c, v), c.W, c.A)
}

// ---------------------------------------------------------------- status line

/**
 * One line for the desktop status bar: `🏢 1 hand up · 5 working · 1 in a meeting · 1 on break · 2 done · 2 interns`.
 * Hands up and errors come first because they need the human; groups drop from the right to fit `width` columns (the
 * emoji counts 2).
 */
export function renderStatus(facts, { width = 80, ascii = false } = {}) {
  const c = context(facts, { width: 100, frame: 0, ascii, project: null })
  const lead = ascii ? '[office] ' : '🏢 '
  const sep = ascii ? ' . ' : ' · '
  const D = c.f.live.desks
  let groups
  if (!D.length) {
    const m = num(c.f.per_day[c.f.now.local_date]?.minutes)
    groups = ['office empty', c.f.now.is_night ? 'lights off' : 'nobody in yet', `${fmtMin(m)} agent-time today`]
  } else {
    const n = counts(c, D)
    groups = []
    if (n.asking) groups.push(handsUp(n.asking))
    if (n.errors) groups.push(plural(n.errors, 'error'))
    if (n.working) groups.push(`${n.working} working`)
    if (n.waiting) groups.push(`${n.waiting} ${waitWord(n, true)}`)
    for (const [s] of idleGroups({ ...n, errors: 0 })) groups.push(s)
    if (n.interns) groups.push(plural(n.interns, 'intern'))
    // a mixed office: who is in, by character, last (`2 Dex`), when it fits
    const cast = castOn(D)
    if (cast.length > 1) groups.push(...cast.map((a) => `${D.filter((d) => d.agent === a).length} ${CAST[a].who}`))
  }
  const max = Math.max(1, Math.floor(Number(width) || 80))
  let s = lead + groups[0]
  for (const g of groups.slice(1)) {
    if (displayWidth(s + sep + g) > max) break
    s += sep + g
  }
  return ascii ? fold(s) : s
}

/**
 * The status line's counts, for a host that colors its own status item (the editor's status bar lights it while a hand
 * is up): every desk at work now, and how many of them need the human (`asking`, `errors`), are at work or are interns.
 */
export function statusCounts(facts) {
  const c = context(facts, { width: 100, frame: 0, ascii: false, project: null })
  const D = c.f.live.desks
  const n = counts(c, D)
  return { desks: D.length, asking: n.asking, errors: n.errors, working: n.working, interns: n.interns }
}

// ---------------------------------------------------------------- output

/** Lines → plain text (no color, no control chars), joined with \n, no trailing newline. */
export function toPlain(lines) {
  return lines.map((l) => l.map(([t]) => t).join('')).join('\n')
}

/**
 * Lines → terminal text with one SGR per role (reset after every colored span): 16-color codes, plus 256-color 173
 * for Clawd. `colors: 16` keeps to the 16-color palette (ROLE_ANSI_16).
 */
export function toAnsi(lines, { colors = 256 } = {}) {
  const codes = colors < 256 ? ROLE_ANSI_16 : ROLE_ANSI
  return lines.map((l) => l.map(([t, r]) => (r && codes[r] ? `\x1b[${codes[r]}m${t}\x1b[0m` : t)).join('')).join('\n')
}
