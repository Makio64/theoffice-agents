// PURE: the TIMELAPSE scene of the SVG office: a range of the agents' work (facts.timeline: yesterday in quarters of an
// hour, the last 7 days in hours, the last 30 in 4-hour slots, cut to where something happened: model.mjs
// cropTimeline) replayed as one self-animating loop of the live building.
// The same header as every view (svg-kit sceneHeader), the same rooms, desks and cast as the live floor plan: one room
// per project, as many desks as its sessions ever needed at once; at a desk the character of the session sitting there
// types while it works, dozes through a short pause, its interns hop on the bench; a room lights up while anyone works
// in it and goes dark when the last one leaves; the meeting room fills while workflows run (one row of tables, the
// meetings beyond them on its +N); the sun and the moon cross the sky with the replayed hour and the street lamps come
// on at night; the sign's clock, in gold right after the play mark, says the replayed time. Under the sidewalk runs THE
// REEL, the whole replay at a glance on a strip of film: three lanes (the sessions at work slot by slot, their interns,
// the commits), each named with the range's total in big pixel figures, the nights behind them, the days dashed and
// named under them, the busiest slot flagged; a gold playhead crosses it as the replay goes, under a tag that says the
// replayed day (the hour for yesterday). Why one looping drawing: the desktop pane
// draws a script-less sandboxed frame and a new source reloads it, so the replay must play by itself (SMIL). Every
// timeline animation shares one loop (a twentieth of a second per slot, a hold on the last one: SLOT_SECONDS,
// HOLD_SECONDS) and lists only the slots where its state changes. The street front and the desk accessories are the live
// floor's, lent by the composer (ctx.floors: scene files never import each other). No node:* imports (the desktop mod
// loads lib/svg.mjs, which imports this file).
import { clip, fmtAgentTime } from './format.mjs'
import { LAPSE_WORDS, cropTimeline, fnv1a, lapseSlot } from './model.mjs'
import {
  AGENT_IDS, CAST, CLOUD_BOX, HEAD, INFO, K, ROLE, ROW, SKY, SUN_TONES, SW, WEEKDAY, aT, agentId, backdrop, ceilingLight, clamp, cloudTint, dayOf, defineSprites,
  esc, fitGroups, floorPlate, nameplate, num0, onPage, paint, pixRuns, platesSvg, plural, pose, r1, sceneHeader, signBox, spans, textW, txt, use,
} from './svg-kit.mjs'

// ---------------------------------------------------------------- pace

/**
 * Seconds of replay per slot: the drawing and the export page keep it (the text replay keeps its own frame clock). A
 * day of quarter hours plays in under five seconds, a week of hours in under nine.
 */
export const SLOT_SECONDS = 0.05
/** Seconds the last slot holds before the replay loops. */
export const HOLD_SECONDS = 2.5
/** The loop of a replay of `slots` slots, in seconds to the millisecond: every timeline animation of the drawing lasts that long. */
export const loopSeconds = (slots) => Math.round((Math.max(0, Math.floor(num0(slots))) * SLOT_SECONDS + HOLD_SECONDS) * 1000) / 1000

// ---------------------------------------------------------------- the size ladder

/**
 * What the drawing keeps at each step of its size budget (lib/svg.mjs renderTimelapse tries them in order until the
 * SVG fits MAX_SVG): the walkers go first, then the dozing, then all interns but one a desk, then desks (24, 16, 10, 6,
 * the busiest rooms keep theirs), then the meeting room, and only then the replay itself turns coarser (`coarse`: slots
 * merged so many at a time, the loop shorter). The replay always plays: animation is never what goes.
 */
export const LAPSE_LADDER = Object.freeze([
  { seats: 24, rooms: 12, walkers: 4, doze: true, interns: 3, tables: 3, coarse: 1 },
  { seats: 24, rooms: 12, walkers: 0, doze: true, interns: 3, tables: 3, coarse: 1 },
  { seats: 24, rooms: 12, walkers: 0, doze: false, interns: 3, tables: 3, coarse: 1 },
  { seats: 24, rooms: 12, walkers: 0, doze: false, interns: 1, tables: 3, coarse: 1 },
  { seats: 16, rooms: 8, walkers: 0, doze: false, interns: 1, tables: 2, coarse: 1 },
  { seats: 10, rooms: 6, walkers: 0, doze: false, interns: 1, tables: 2, coarse: 1 },
  { seats: 6, rooms: 4, walkers: 0, doze: false, interns: 1, tables: 1, coarse: 1 },
  { seats: 6, rooms: 4, walkers: 0, doze: false, interns: 1, tables: 0, coarse: 1 },
  { seats: 6, rooms: 4, walkers: 0, doze: false, interns: 1, tables: 0, coarse: 2 },
  { seats: 6, rooms: 4, walkers: 0, doze: false, interns: 1, tables: 0, coarse: 4 },
  { seats: 4, rooms: 3, walkers: 0, doze: false, interns: 0, tables: 0, coarse: 8 },
  { seats: 3, rooms: 3, walkers: 0, doze: false, interns: 0, tables: 0, coarse: 24 },
].map((l, level) => Object.freeze({ level, ...l })))

// ---------------------------------------------------------------- the timeline as the drawing reads it

// Minutes per slot of each range when the facts do not say (types/index.d.ts OfficeTimeline).
const SLOT_MIN = { yesterday: 15, week: 60, month: 240 }
// A replay never runs longer than this many slots (a year of hours would be a drawing nobody can play).
const MAX_SLOTS = 1500
const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [])
const int = (v) => Math.floor(Number(v))

// Runs as sorted, apart [from, to) ranges inside [0, slots): touching or overlapping ones merged.
function cleanRuns(runs, slots) {
  const rs = (Array.isArray(runs) ? runs : [])
    .filter((r) => Array.isArray(r) && Number.isFinite(Number(r[0])) && Number.isFinite(Number(r[1])))
    .map(([a, b]) => [Math.max(0, int(a)), Math.min(slots, int(b))]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  const out = []
  for (const [a, b] of rs) {
    const last = out.at(-1)
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

// Intern change points [[slot, count]…] as a count per slot (null when it never had one).
function internCounts(points, slots) {
  const ps = (Array.isArray(points) ? points : []).filter((p) => Array.isArray(p) && Number.isFinite(Number(p[0])))
    .map(([s, n]) => [int(s), Math.floor(num0(n))]).sort((x, y) => x[0] - y[0])
  if (!ps.some(([, n]) => n > 0)) return null
  const out = new Array(slots).fill(0)
  let k = 0
  let n = 0
  for (let i = 0; i < slots; i++) {
    while (k < ps.length && ps[k][0] <= i) n = ps[k++][1]
    out[i] = n
  }
  return out
}

/**
 * facts.timeline as the drawing reads it, or null when the facts have none: cut to where something happened
 * (cropTimeline: `start` the slots of the range before the replay), the range's kind, days, slot length and slot count
 * checked, every desk's runs sorted and inside the replay, its interns a count per slot, meetings and commits inside
 * it. Never throws on a partial or broken timeline.
 */
export function lapseTimeline(f) {
  const t = cropTimeline(f?.timeline)
  if (!t || typeof t !== 'object') return null
  const kind = Object.hasOwn(LAPSE_WORDS, t.kind) ? t.kind : 'week'
  let slotMin = Math.round(num0(t.slot_min))
  if (!(slotMin > 0 && 1440 % slotMin === 0)) slotMin = SLOT_MIN[kind]
  const perDay = 1440 / slotMin
  const days = (Array.isArray(t.days) ? t.days : []).map(String).filter((d) => /^\d{4}-\d\d-\d\d$/.test(d))
  const start = Math.max(0, int(t.start) || 0)
  const slots = Math.min(MAX_SLOTS, Math.max(0, Math.max(1, days.length) * perDay - start), Math.max(0, int(t.slots) || 0))
  const desks = list(t.desks).map((d, i) => {
    const runs = cleanRuns(d.runs, slots)
    if (!runs.length) return null
    const title = typeof d.title === 'string' ? d.title : ''
    return {
      id: String(d.id ?? `desk${i}`), project: String(d.project ?? '?'), agent: agentId(d.agent), account: d.account ? String(d.account) : '', title, runs,
      interns: internCounts(d.interns, slots),
    }
  }).filter(Boolean)
  const meetings = list(t.meetings).map((m) => ({
    project: String(m.project ?? ''), name: String(m.name ?? 'workflow'), from: Math.max(0, int(m.from) || 0), to: Math.min(slots, int(m.to) || 0),
    agents: Math.floor(num0(m.agents)),
  })).filter((m) => m.to > m.from).sort((a, b) => a.from - b.from)
  const commits = list(t.commits).map((c) => ({ project: String(c.project ?? ''), slot: int(c.slot), n: Math.max(1, Math.floor(num0(c.n))) }))
    .filter((c) => c.slot >= 0 && c.slot < slots)
  const label = String(t.label ?? f.range?.label ?? '')
  return { kind, label, days, slot_min: slotMin, per_day: perDay, start, slots, desks, meetings, commits, more: Math.floor(num0(t.more)), coarse: 1 }
}

/**
 * The timeline replayed `c` slots at a time (the size budget's last resort): runs, meetings and commits moved to the
 * merged slots, a merged slot's interns the most it had. `c` is cut down to a divisor of the slots a day, so a merged
 * slot still starts on the wall clock's grid: a cropped replay that starts off it first takes back the slots before
 * it, quiet, to the grid's last line.
 */
export function coarsen(tl, c) {
  let k = Math.max(1, Math.min(tl.per_day, Math.floor(c)))
  while (tl.per_day % k) k--
  if (k === 1) return tl
  const back = tl.start % k
  if (back) {
    const by = (s) => s + back
    tl = {
      ...tl, start: tl.start - back, slots: tl.slots + back,
      desks: tl.desks.map((d) => ({ ...d, runs: d.runs.map(([a, b]) => [by(a), by(b)]), interns: d.interns && [...new Array(back).fill(0), ...d.interns] })),
      meetings: tl.meetings.map((m) => ({ ...m, from: by(m.from), to: by(m.to) })), commits: tl.commits.map((cm) => ({ ...cm, slot: by(cm.slot) })),
    }
  }
  const slots = Math.ceil(tl.slots / k)
  const desks = tl.desks.map((d) => {
    const runs = cleanRuns(d.runs.map(([a, b]) => [Math.floor(a / k), Math.ceil(b / k)]), slots)
    const interns = d.interns && Array.from({ length: slots }, (_, i) => Math.max(...d.interns.slice(i * k, i * k + k)))
    return { ...d, runs, interns }
  })
  const meetings = tl.meetings.map((m) => ({ ...m, from: Math.floor(m.from / k), to: Math.ceil(m.to / k) }))
  const by = new Map()
  for (const cm of tl.commits) {
    const key = `${Math.floor(cm.slot / k)}|${cm.project}`
    by.set(key, (by.get(key) ?? 0) + cm.n)
  }
  const commits = [...by].map(([key, n]) => ({ project: key.slice(key.indexOf('|') + 1), slot: Number(key.slice(0, key.indexOf('|'))), n }))
  return { ...tl, slot_min: tl.slot_min * k, per_day: tl.per_day / k, start: tl.start / k, slots, desks, meetings, commits, coarse: tl.coarse * k }
}

// ---------------------------------------------------------------- the replay's clock (SMIL)

/**
 * The replay's clock: the loop D, each slot's keyTime (slot i goes on screen at i × SLOT_SECONDS of D, to five
 * decimals, six or seven on a long loop: a slot is 50 ms, so every animation switches within a millisecond of the
 * others), whether it animates, and the slot a surface without SMIL shows (`b`, the busiest). For what moves on without
 * a slot's switch to keep, keyTimes shorter: `glide` two decimals (within 50 ms on a loop under 100 s), for the sky's
 * lights; `stride` one, for the sun and the moon, whose pace stays even over keys of a sixth of a second in a month.
 */
function replayClock(ctx, S, b) {
  const D = loopSeconds(S)
  const dec = D < 100 ? 1e5 : D < 1000 ? 1e6 : 1e7
  const at = (d) => (sec) => {
    const v = Math.round((sec / D) * d) / d
    return v <= 0 ? '0' : v >= 1 ? '1' : String(v).replace(/^0\./, '.')
  }
  const kt = at(dec)
  return { S, D, b, animate: ctx.animate && S > 1, kt, glide: at(dec / 100), stride: at(dec / 10), keys: Array.from({ length: S }, (_, i) => kt(i * SLOT_SECONDS)) }
}

/** A discrete animation of `attr` through per-slot `states`, one key where the state changes ('' when it never does). */
function discrete(R, attr, states) {
  if (!R.animate) return ''
  const keys = []
  const vals = []
  for (let i = 0; i < states.length; i++) {
    if (i && states[i] === states[i - 1]) continue
    keys.push(R.keys[i])
    vals.push(states[i])
  }
  if (vals.length < 2) return ''
  return `<animate attributeName="${attr}" values="${vals.join(';')}" keyTimes="${keys.join(';')}" dur="${R.D}s" calcMode="discrete" repeatCount="indefinite"/>`
}

const DISPLAY = (on) => on.map((v) => (v ? 'inline' : 'none'))

/**
 * Markup shown only in the slots where `on` is true: a <g> whose display the replay switches (shown as at the busiest
 * slot without SMIL). Nothing when it is never on; bare when it always is; a still keeps it only if the busiest slot
 * shows it.
 */
function shownWhen(R, on, inner, tag = 'g', attrs = '') {
  if (!inner || !on.some(Boolean)) return ''
  if (on.every(Boolean)) return tag === 'g' && !attrs ? inner : `<${tag}${attrs}>${inner}</${tag}>`
  if (!R.animate) return on[R.b] ? (tag === 'g' && !attrs ? inner : `<${tag}${attrs}>${inner}</${tag}>`) : ''
  return `<${tag}${attrs}${on[R.b] ? '' : ' display="none"'}>${inner}${discrete(R, 'display', DISPLAY(on))}</${tag}>`
}

/**
 * A linear track through `points` ([slot, value], slots in replay units, sorted; a value a number or an [x, y] pair;
 * two points at one slot jump): its value at slot `u` (`at`), and the `values` and `keyTimes` of its animation over
 * the loop, the last point holding to the loop's end, a hold's keys only at its ends ('' when it does not animate).
 * `fmt` writes a number, `kt` a keyTime.
 */
function track(R, points, fmt = r1, kt = R.kt) {
  const show = (v) => (Array.isArray(v) ? v.map(fmt).join(' ') : String(fmt(v)))
  const lerp = (a, b, t) => (Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * t) : a + (b - a) * t)
  const at = (u) => {
    if (u <= points[0][0]) return points[0][1]
    for (let i = 1; i < points.length; i++) {
      const [u1, v1] = points[i]
      if (u <= u1) {
        const [u0, v0] = points[i - 1]
        return u1 === u0 ? v1 : lerp(v0, v1, (u - u0) / (u1 - u0))
      }
    }
    return points.at(-1)[1]
  }
  if (!R.animate) return { at, show, values: '', keyTimes: '' }
  const keys = []
  const vals = []
  const push = (k, v) => {
    const s = show(v)
    if (keys.length && keys.at(-1) === k && vals.at(-1) === s) return
    // the middle key of a hold is the line between its ends
    if (vals.length > 1 && vals.at(-1) === s && vals.at(-2) === s && keys.at(-1) !== keys.at(-2)) {
      keys[keys.length - 1] = k
      return
    }
    keys.push(k)
    vals.push(s)
  }
  push('0', at(0))
  for (const [u, v] of points) if (u > 0 && u < R.S) push(kt(u * SLOT_SECONDS), v)
  push(kt(R.S * SLOT_SECONDS), at(R.S))
  push('1', at(R.S))
  return { at, show, values: vals.join(';'), keyTimes: keys.join(';') }
}

/**
 * A linear translate through `points` ([slot, x] or [slot, [x, y]], track's): the walkers, the sun and the moon (`fmt`
 * and `kt` as track's). Returns the transform a surface without SMIL shows (at slot `at`) and the animation.
 */
function slide(R, points, at, fmt, kt) {
  const t = track(R, points, fmt, kt)
  const base = ` transform="translate(${t.show(t.at(at))})"`
  if (!R.animate) return { base, anim: '' }
  const anim = `<animateTransform attributeName="transform" type="translate" values="${t.values}" keyTimes="${t.keyTimes}" dur="${R.D}s" ` +
    'repeatCount="indefinite"/>'
  return { base, anim }
}

/**
 * Markup whose opacity follows `points` ([slot, opacity], track's): the lights of the sky. Shown as at slot `at`
 * without SMIL, nothing where it is never seen.
 */
function faded(R, points, at, inner) {
  if (!inner) return ''
  const t = track(R, points, (v) => Math.round(v * 100) / 100, R.glide)
  const still = t.at(at)
  if (!R.animate) return still <= 0 ? '' : still >= 1 ? inner : `<g opacity="${t.show(still)}">${inner}</g>`
  if (!points.some(([, v]) => v > 0)) return ''
  if (t.values === '1;1') return inner
  return `<g opacity="${t.show(still)}"><animate attributeName="opacity" values="${t.values}" keyTimes="${t.keyTimes}" dur="${R.D}s" ` +
    `repeatCount="indefinite"/>${inner}</g>`
}

// ---------------------------------------------------------------- sprites ('lp-')

// The screens a desk at work shows, picked by the desk's key (the live floor shows the session's own activity).
const WORK_SCREENS = ['coding', 'terminal', 'testing']
const INTERN = 12 // intern (mini figure, 11 wide) pitch on the bench, as on the live floor
const SEAT = 27 // meeting seat pitch, as on the live floor

// A desk in a timelapse is drawn whole once (empty: the chair under it, the plaque in the project's color, the monitor
// off) and drawn whole again over it in each state it takes (a character typing behind it, a dozer): the character sits
// between the chair and the desk top, so a state that only added the character would land in front of the desk. Each
// state is one sprite, so a desk switching states costs a <use> and its animation, nothing more; the plaque and the
// mug take the project's color from the desk's group (currentColor).
const deskBase = (c) => use(c, 'desk') + use(c, 'plaque') + use(c, 'mon', 4, 9)
const SPR = {
  'lp-seat': (c) => use(c, 'chair') + deskBase(c) + use(c, 's-off', 5, 10),
  // the replay's day and night on the thing a room has many of: the desk lamps
  'lp-lamp': (c) => dayNight(c, use(c, 'lv-lampN'), use(c, 'lv-lamp')),
  // the window the clock's strips show through (clockLine): one line of 6-px text, right-aligned at 0
  'lp-clk': (c) => `<clipPath id="${c.id}lp-clkc"><path d="M-120 -6h120v8h-120z"/></clipPath>`,
  // the window a desk's strip of states shows through (seatSvg): the desk box, with room above for the dozer's z's
  'lp-clip': (c) => `<clipPath id="${c.id}lp-clipc"><path d="M-2 -14h${STRIP - 4}v51h${4 - STRIP}z"/></clipPath>`,
  // a room's ceiling light (svg-kit ceilingLight) one unit wide, on by night: a room scales it to its width and shows it
  // while anyone is in, so the night switch is this one animation for every room
  'lp-ceil': (c) => dayNight(c, paint(ceilingLight(0, 0, 1)), ''),
}
for (const a of AGENT_IDS) {
  const tag = CAST[a].tag
  for (const t of [0, 1]) {
    WORK_SCREENS.forEach((scr, k) => {
      SPR[`lp-w${tag}${t}${k}`] = (c) => use(c, pose(a, `T${t}`), 22, 12) + deskBase(c) + use(c, 'kb') + use(c, `s-${scr}`, 5, 10) +
        (c.animate ? use(c, `fl${k}`, 5, 10) : '')
    })
  }
  SPR[`lp-z${tag}`] = (c) => use(c, pose(a, 'Z'), 22, 12) + deskBase(c) + use(c, 's-doze', 5, 10) + use(c, 'mug', 18, 20) + use(c, 'zz', 41, 6)
}
// the full sky's sun and moon on their way across the sky, on the replay's loop (lapseSky puts their moves on
// ctx.lapse): one moving sprite each, placed in each light it shows in; and its clouds, in two layers, the far ones a
// drawing's width a loop, the near ones twice as fast (a timelapse's clouds race), each light tinting them its own way
SPR['lp-sun'] = (c) => orbDef(c, 'sun')
SPR['lp-moon'] = (c) => orbDef(c, 'moon')
SPR['lp-cl'] = (c) => cloudLayers(c)
// the interns' bench in front of a desk, as long as the most interns it ever seats (1 to 3)
for (const n of [1, 2, 3]) {
  const bw = INTERN * n + 1
  SPR[`lp-bench${n}`] = () => paint([[0, 26, bw, 6, '#000/.35']]) +
    paint([[0, 32, bw, 1, '#d9b27a'], [0, 33, bw, 1, '#a07a48'], [1, 34, 2, 2, '#3a2a1c'], [bw - 3, 34, 2, 2, '#3a2a1c']])
}
defineSprites(SPR)

// What a sprite looks like by the replayed night and day: the day drawing, the night one over it in the night slots
// (it covers the day one: the same shapes, lit), so the switch is one animation in <defs> for every place it is used.
// The replay's night is on ctx.lapse while the scene draws.
function dayNight(c, nightMarkup, dayMarkup) {
  const R = c.lapse?.R
  const night = c.lapse?.night
  if (!R || !night) return dayMarkup
  return (night.every(Boolean) ? '' : dayMarkup) + shownWhen(R, night, nightMarkup)
}

// ---------------------------------------------------------------- the model: who sat where, slot by slot

/** The slot's hour on the wall clock (lapseSlot's HH:MM). */
const hourOf = (tl, i) => Number(lapseSlot(tl, i).hm.slice(0, 2))

// A session's stays at its desk: its runs, with the short pauses between them kept (it dozes through them) when the
// level keeps dozing: two slots of a quarter-hour for yesterday, one hour or one 4-hour slot for the week and the month.
function staysOf(d, gap) {
  const out = []
  for (const [a, b] of d.runs) {
    const last = out.at(-1)
    if (last && a - last.to <= gap) {
      last.to = b
      last.runs.push([a, b])
    } else out.push({ d, from: a, to: b, runs: [[a, b]] })
  }
  return out
}

// The most stays that overlap at once.
function peakOf(stays) {
  const ev = stays.flatMap((s) => [[s.from, 1], [s.to, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let n = 0
  let peak = 0
  for (const [, dn] of ev) peak = Math.max(peak, (n += dn))
  return peak
}

/**
 * The replay's model at one level of the ladder: per slot the desks at work, the interns and the commits, the night,
 * the busiest slot; the rooms (one per project, busiest first, as many as the level keeps), each with its desks and
 * who sat at each slot by slot; the meeting tables; the walkers.
 */
function modelOf(ctx, tl, lv) {
  const { f } = ctx
  const S = tl.slots
  const atWork = new Array(S).fill(0)
  const interns = new Array(S).fill(0)
  const commits = new Array(S).fill(0)
  for (const d of tl.desks) {
    for (const [a, b] of d.runs) for (let i = a; i < b; i++) atWork[i]++
    if (d.interns) for (let i = 0; i < S; i++) interns[i] += d.interns[i]
  }
  for (const c of tl.commits) commits[c.slot] += c.n
  let b = 0
  for (let i = 1; i < S; i++) if (atWork[i] > atWork[b]) b = i
  const night = Array.from({ length: S }, (_, i) => {
    const h = hourOf(tl, i)
    return h >= 20 || h < 7
  })
  // ---- the rooms: projects by agent-time in the range (facts.projects' order), then by the slots their sessions worked
  const worked = new Map()
  for (const d of tl.desks) worked.set(d.project, (worked.get(d.project) ?? 0) + d.runs.reduce((a, [x, y]) => a + y - x, 0))
  const known = [...new Set(f.projects.map((p) => p?.name).filter((n) => worked.has(n)))]
  // (names compared by code point, not by locale: the same facts draw the same rooms in Node and in the desktop pane)
  const rest = [...worked.keys()].filter((n) => !known.includes(n)).sort((x, y) => worked.get(y) - worked.get(x) || (x < y ? -1 : x > y ? 1 : 0))
  const gap = lv.doze ? (tl.kind === 'yesterday' && tl.coarse === 1 ? 2 : 1) : 0
  const all = [...known, ...rest].map((name) => {
    const desks = tl.desks.filter((d) => d.project === name)
    const stays = desks.flatMap((d) => staysOf(d, gap)).sort((x, y) => x.from - y.from || x.to - y.to)
    return { name, desks, stays, peak: peakOf(stays) }
  })
  const rooms = all.slice(0, lv.rooms)
  // desks shared out busiest first, one round at a time, so a crowded project never leaves the next one without a desk
  const got = rooms.map(() => 0)
  for (let left = lv.seats, moved = true; left > 0 && moved;) {
    moved = false
    rooms.forEach((r, i) => {
      if (left > 0 && got[i] < r.peak) {
        got[i]++
        left--
        moved = true
      }
    })
  }
  const drawn = rooms.filter((_, i) => got[i] > 0).map((r) => seatRoom(r, got[rooms.indexOf(r)], S, lv))
  const hidden = all.length - drawn.length
  // ---- the meeting tables: workflows by start, each at the first free table; one finding none counts, while it runs,
  // on the meeting room's `+N`
  const tables = []
  const meetExtra = new Array(S).fill(0)
  if (lv.tables > 0) {
    for (const m of tl.meetings) {
      let t = tables.find((x) => x.free <= m.from)
      if (!t && tables.length < lv.tables) tables.push((t = { free: 0, meetings: [], on: new Array(S).fill(false) }))
      if (!t) {
        for (let i = m.from; i < m.to; i++) meetExtra[i]++
        continue
      }
      t.free = m.to
      t.meetings.push(m)
      for (let i = m.from; i < m.to; i++) t.on[i] = true
    }
  }
  // ---- the walkers: a session's character walks up to the door before its first run, and out of it and away when its
  // last run ends (a walk the replay has room to finish, gone before its last slot holds), half the level's walkers
  // each way, the earliest walks first; a walker takes its next walk a slot after its last at the soonest, so it goes
  // back for it out of sight
  const walkers = []
  if (lv.walkers > 0) {
    const walk = (agent, out, s0, s1) => {
      let w = walkers.find((x) => x.agent === agent && x.out === out && x.free < s0)
      const way = walkers.filter((x) => x.out === out).length
      if (!w && way < (out ? Math.floor(lv.walkers / 2) : Math.ceil(lv.walkers / 2))) walkers.push((w = { agent, out, right: way % 2 === 1, free: 0, walks: [] }))
      if (!w) return
      w.free = s1
      w.walks.push([s0, s1])
    }
    const first = (d) => d.runs[0][0]
    const last = (d) => d.runs.at(-1)[1]
    for (const d of [...tl.desks].sort((x, y) => first(x) - first(y))) if (first(d) > 0) walk(d.agent, false, Math.max(0, first(d) - 4), first(d))
    for (const d of [...tl.desks].sort((x, y) => last(x) - last(y))) if (last(d) + 4 < S) walk(d.agent, true, last(d), last(d) + 4)
  }
  const sessions = tl.desks.length + tl.more
  const internsIn = tl.desks.reduce((a, d) => a + (d.interns ? d.interns.reduce((n, v, i) => n + Math.max(0, v - (i ? d.interns[i - 1] : 0)), 0) : 0), 0)
  const commitsIn = tl.commits.reduce((a, c) => a + c.n, 0)
  return { S, atWork, interns, commits, night, b, rooms: drawn, hidden, tables, meetExtra, walkers, sessions, internsIn, commitsIn, projects: all.length }
}

/**
 * A room's desks and who sat at each, slot by slot: stays by start, each at the desk its session sat at last if that
 * is free, else at the first free one; a stay finding no free desk (more sessions at once than the level gives the
 * room) is counted, while it works, on the room's `+N` badge.
 */
function seatRoom(r, n, S, lv) {
  const seats = Array.from({ length: n }, (_, k) => ({
    k, free: 0, mode: new Array(S).fill(''), agent: new Array(S).fill(''), interns: new Array(S).fill(0), desks: [],
  }))
  const last = new Map()
  const extra = new Array(S).fill(0)
  for (const st of r.stays) {
    const pref = seats[last.get(st.d.id)]
    const seat = pref && pref.free <= st.from ? pref : seats.find((s) => s.free <= st.from)
    if (!seat) {
      for (const [a, b] of st.runs) for (let i = a; i < b; i++) extra[i]++
      continue
    }
    seat.free = st.to
    last.set(st.d.id, seat.k)
    if (!seat.desks.includes(st.d)) seat.desks.push(st.d)
    for (let i = st.from; i < st.to; i++) {
      seat.mode[i] = 'z'
      seat.agent[i] = st.d.agent
      seat.interns[i] = Math.min(lv.interns, st.d.interns?.[i] ?? 0)
    }
    for (const [a, b] of st.runs) for (let i = a; i < b; i++) seat.mode[i] = 'w'
  }
  const occupied = Array.from({ length: S }, (_, i) => extra[i] > 0 || seats.some((s) => s.mode[i]))
  return { ...r, seats, extra, occupied }
}

// ---------------------------------------------------------------- floors: layout

const SW_MAX = 86
/** The slab between two floors: no labels on it (who sits where changes with every slot; it is in the tooltips). */
const SLAB_TL = 8
// A meeting table's cell: the whiteboard, the table, three attendees.
const CELL_W = 56 + 3 * SEAT + 6

function roomItem(r, IW, color) {
  const n = r.seats.length
  const maxK = Math.max(1, Math.floor((IW - 6) / SW))
  let k = Math.min(n, maxK)
  const rows = Math.ceil(n / k)
  k = Math.ceil(n / rows)
  const minW = Math.max(k * SW + 6, Math.min(IW, 92, Math.round(textW(r.name, 5.5) + 40)))
  return { kind: 'room', r, name: r.name, color, k, rows, minW, h: HEAD + rows * ROW + (rows - 1) * SLAB_TL }
}

function meetingItem(tables, IW) {
  const perRow = clamp(Math.floor((IW - 6 + 4) / (CELL_W + 4)), 1, tables.length)
  const rows = Math.ceil(tables.length / perRow)
  const minW = Math.min(IW, Math.max(110, perRow * (CELL_W + 4) - 4 + 6))
  return { kind: 'meeting', tables, perRow, rows, minW, h: HEAD + rows * ROW + (rows - 1) * SLAB_TL }
}

// Bands (floors) as the live floor packs them: rooms next-fit so they keep their order, the meeting room first-fit into
// any floor, the spare width to the rooms.
function pack(items, IW, IX0) {
  const bands = []
  const need = (b, it) => b.used + (b.items.length ? 3 : 0) + it.minW
  for (const it of items) {
    let b = it.kind === 'room' ? bands.at(-1) : bands.find((x) => need(x, it) <= IW)
    if (!b || need(b, it) > IW) bands.push((b = { items: [], used: 0 }))
    b.used = need(b, it)
    b.items.push(it)
  }
  for (const b of bands) {
    const spare = IW - b.used
    let grow = b.items.filter((it) => it.kind === 'room')
    if (!grow.length) grow = b.items
    const total = grow.reduce((a, it) => a + it.minW, 0)
    let left = spare
    for (const it of b.items) it.w = it.minW
    grow.forEach((it, i) => {
      const add = i === grow.length - 1 ? left : Math.floor((spare * it.minW) / total)
      it.w += add
      left -= add
    })
    let x = IX0
    for (const it of b.items) {
      it.x = x
      x += it.w + 3
    }
    b.h = Math.max(...b.items.map((it) => it.h))
  }
  return bands
}

// ---------------------------------------------------------------- floors: drawing

/**
 * A room's top band (HEAD tall): the nameplate in the project's color, then the groups, as many as fit before
 * `reserve` (kept free at the right end for the room's `+N` badge). No clerestory windows: the header says its numbers,
 * and the windows cost the budget 1.1k to 1.9k for nothing a reader looks for.
 */
function roomHead(ctx, it, x, y, w, groups, reserve = 0) {
  const plate = nameplate(ctx, x + 3, y + 2, it.name, it.color, w - 10)
  const cx = x + 3 + plate.w + 4
  const kept = fitGroups(groups, x + w - reserve - cx - 4, 5)
  return plate.svg + (kept.length ? spans(cx + 1, y + 9, 5, kept.map(([t, c]) => [t, c ?? K.groupText])) : '')
}

// Who sat at a desk, for its tooltip: the project, its sessions' titles (three at most), the characters.
function seatTip(r, seat) {
  const titles = [...new Set(seat.desks.map((d) => d.title).filter(Boolean))]
  const shown = titles.slice(0, 3).map((t) => clip(t, 32))
  if (titles.length > 3) shown.push(`+${titles.length - 3} more`)
  const who = AGENT_IDS.filter((a) => seat.desks.some((d) => d.agent === a)).map((a) => CAST[a].who)
  const accounts = [...new Set(seat.desks.map((d) => d.account).filter(Boolean))].map((a) => `@${a}`)
  return [clip(r.name, 40), `${plural(seat.desks.length, 'session')}${shown.length ? `: ${shown.join(', ')}` : ''}`, [...who, ...accounts].join(', ')]
    .filter(Boolean).join(' · ')
}

// A desk's states side by side on a strip, STRIP apart, behind a window the size of the desk (lp-clip): the replay
// slides the strip so the state of the slot sits in the window. One animation a desk, one key a change of state,
// whatever the desk's cast: a display switch per state would cost an animation each and two keys a change.
const STRIP = 64

/**
 * One desk of the replay at (x, y) (the 48 × 36 desk box): the empty desk, then its states on a strip (lp-clip): for
 * each character that sits there, at work (typing, the keyboard out, a lit screen) or, when the level keeps it, dozing
 * (eyes shut, the screen asleep, a mug, z's), with its interns hopping on the bench in front (as many as at that slot,
 * three at most); the accessories on top (keyed by the project and the desk's place, as the live floor keys a desk by
 * its session). A still draws the busiest slot's state alone.
 */
function seatSvg(ctx, R, r, seat, x, y) {
  const key = `${r.name}#${seat.k}`
  const h = fnv1a(`lapse-desk:${key}`)
  const look = `${h % 2}${(h >>> 4) % WORK_SCREENS.length}`
  const most = Math.max(0, ...seat.interns)
  const state = seat.mode.map((m, i) => (m ? `${m}|${seat.agent[i]}|${seat.interns[i]}` : ''))
  const drawState = (st, dx) => {
    const [m, a, n] = st.split('|')
    let out = use(ctx, m === 'w' ? `lp-w${CAST[a].tag}${look}` : `lp-z${CAST[a].tag}`, dx)
    for (let k = 0; k < Number(n); k++) out += (k ? '' : use(ctx, `lp-bench${most}`, dx)) + use(ctx, pose(a, `I${k % 2}`), dx + 1 + k * INTERN, 26)
    return out
  }
  let s = `<g transform="translate(${x} ${y})" color="${ctx.color(r.name)}"><title>${esc(seatTip(r, seat))}</title>${use(ctx, 'lp-seat')}`
  const kinds = [...new Set(state.filter(Boolean))]
  if (!R.animate) s += state[R.b] ? drawState(state[R.b], 0) : ''
  else if (kinds.length === 1 && state.every(Boolean)) s += drawState(kinds[0], 0)
  else if (kinds.length) {
    use(ctx, 'lp-clip')
    const at = (st) => (st ? String(-STRIP * kinds.indexOf(st)) : String(STRIP))
    s += `<g clip-path="url(#${ctx.id}lp-clipc)"><g transform="translate(${at(state[R.b])})">${discreteSlide(R, state.map(at))}` +
      `${kinds.map((st, k) => drawState(st, k * STRIP)).join('')}</g></g>`
  }
  s += ctx.floors?.props ? ctx.floors.props(ctx, key, r.name, { coffee: false, lamp: 'lp-lamp' }) : ''
  return s + '</g>'
}

/**
 * Slot by slot `counts` as a `+N` end-anchored at (x, y), shown while N is more than 0: its values one above the
 * other on a strip behind a window one line tall (lp-clk), slid by one animation with a key where the count changes:
 * a fraction of a display switch per value (a busy month's meeting room 1.5k where those cost 4.8k, its rooms 7.9k
 * where they cost 12.4k). A still shows the busiest slot's.
 */
function countBadge(ctx, R, counts, x, y, fill) {
  const vals = counts.map((v) => Math.min(99, Math.max(0, v)))
  const kinds = [...new Set(vals.filter(Boolean))].sort((a, b) => a - b)
  if (!kinds.length) return ''
  if (!R.animate) return vals[R.b] ? txt(x, y, `+${vals[R.b]}`, 5, fill, ' text-anchor="end"') : ''
  use(ctx, 'lp-clk')
  // a count of 0 slides the strip below the window
  const at = (v) => (v ? `0 ${-8 * kinds.indexOf(v)}` : '0 8')
  const lines = kinds.map((n, i) => `<tspan x="0" y="${i * 8}">+${n}</tspan>`).join('')
  return `<g transform="translate(${r1(x)} ${r1(y)})" clip-path="url(#${ctx.id}lp-clkc)"><g transform="translate(${at(vals[R.b])})">` +
    `${discreteSlide(R, vals.map(at))}<text font-size="5" text-anchor="end" fill="${fill}">${lines}</text></g></g>`
}

/** A discrete translate through per-slot `values` (the desk strips, a clock's or a badge's glyphs), one key where the value changes. */
function discreteSlide(R, values) {
  const keys = []
  const vals = []
  for (let i = 0; i < values.length; i++) {
    if (i && values[i] === values[i - 1]) continue
    keys.push(R.keys[i])
    vals.push(values[i])
  }
  if (vals.length < 2) return ''
  return `<animateTransform attributeName="transform" type="translate" values="${vals.join(';')}" keyTimes="${keys.join(';')}" dur="${R.D}s" ` +
    'calcMode="discrete" repeatCount="indefinite"/>'
}

// The lit room and the dark one, as the replay goes: its ceiling light on by night (lp-ceil: the night switch is in
// <defs>), and while nobody is in the moonlit tint the live floor puts over a dark room, over the whole room but its
// header (drawn after it), so a room has one switch: the tint covers the light.
function roomLights(ctx, R, M, x, top, w, h, occupied) {
  const lit = R.animate ? M.night.some(Boolean) : M.night[R.b] && occupied[R.b]
  const back = lit ? use(ctx, 'lp-ceil', 0, 0, ` transform="translate(${x} ${top}) scale(${w} 1)"`) : ''
  const fore = shownWhen(R, occupied.map((o) => !o), paint([[x, top, w, h, '#0b1233/.45']]))
  return { back, fore }
}

function drawRoom(ctx, R, M, it, top, BH) {
  const { x, w, r } = it
  const sessions = r.desks.length
  const minutes = num0(ctx.f.projects.find((p) => p?.name === r.name)?.agent_minutes)
  const commits = ctx.lapse.tl.commits.filter((c) => c.project === r.name).reduce((a, c) => a + c.n, 0)
  // the agent-time first (a narrow room keeps it, so rooms compare), then the commits, then the sessions
  const groups = [minutes && [fmtAgentTime(minutes), ROLE.title], commits && [plural(commits, 'commit'), ROLE.ship], [plural(sessions, 'session')]]
    .filter(Boolean)
  const most = Math.max(0, ...r.extra)
  const reserve = most ? Math.round(textW(`+${Math.min(99, most)}`, 5)) + 6 : 0
  const head = roomHead(ctx, it, x, top, w, groups, reserve)
  let back = ''
  let fore = ''
  const sw = clamp(Math.floor((w - 6) / it.k), SW, SW_MAX)
  const x0 = x + Math.floor((w - it.k * sw) / 2)
  for (let row = 0; row < it.rows; row++) {
    const floor = top + BH - (it.rows - 1 - row) * (ROW + SLAB_TL)
    back += paint([[x, floor - 14, w, 14, K.wallLow]])
    if (row < it.rows - 1) back += paint([[x, floor, w, 2, K.wood], [x, floor + 2, w, SLAB_TL - 2, K.slab]])
    for (let i = 0; i < it.k; i++) {
      const sx = x0 + i * sw
      const seat = r.seats[row * it.k + i]
      if (!seat) fore += use(ctx, 'plant', sx + Math.floor(sw / 2) - 5, floor - 12)
      else fore += seatSvg(ctx, R, r, seat, sx + Math.floor((sw - 48) / 2), floor - ROW)
    }
  }
  if (w - it.k * sw >= 28) fore += use(ctx, 'plant', x + w - 13, top + BH - 12)
  const lights = roomLights(ctx, R, M, x, top, w, BH, r.occupied)
  // more sessions at work than the room has desks: how many more, at the right end of its header
  let badge = countBadge(ctx, R, r.extra, x + w - 4, top + 9, ROLE.busy)
  if (badge) badge = `<g><title>${esc(`${r.name}: more sessions at work than desks`)}</title>${badge}</g>`
  return { back: lights.back + back, fore: fore + lights.fore + head + badge }
}

function drawMeeting(ctx, R, M, it, top, BH) {
  const { x, w } = it
  const all = ctx.lapse.tl.meetings
  const groups = [[plural(all.length, 'meeting')], [plural(all.reduce((a, m) => a + m.agents, 0), 'agent'), ROLE.meeting]]
  // more meetings at once than the row has tables: how many more, at the right end of its header, as a room's +N
  const most = Math.min(99, Math.max(0, ...M.meetExtra))
  const reserve = most ? Math.round(textW(`+${most}`, 5)) + 6 : 0
  const badge = countBadge(ctx, R, M.meetExtra, x + w - 4, top + 9, ROLE.meeting)
  const head = roomHead(ctx, { name: 'MEETING ROOM', color: ROLE.meeting }, x, top, w, groups, reserve) +
    (badge ? `<g><title>more meetings at once than tables</title>${badge}</g>` : '')
  let back = ''
  // room to spare: a plant in each corner, as the live meeting room has
  let fore = w - it.perRow * (CELL_W + 4) >= 40 ? use(ctx, 'plant', x + 4, top + BH - 12) + use(ctx, 'plant', x + w - 14, top + BH - 12) : ''
  for (let row = 0; row < it.rows; row++) {
    const floor = top + BH - (it.rows - 1 - row) * (ROW + SLAB_TL)
    back += paint([[x, floor - 14, w, 14, K.wallLow]])
    if (row < it.rows - 1) back += paint([[x, floor, w, 2, K.wood], [x, floor + 2, w, SLAB_TL - 2, K.slab]])
    const cells = it.tables.slice(row * it.perRow, row * it.perRow + it.perRow)
    let cx = x + 3 + Math.floor((w - 6 - (cells.length * (CELL_W + 4) - 4)) / 2)
    for (const t of cells) {
      const names = [...new Set(t.meetings.map((m) => m.name))]
      const more = names.length > 3 ? ` +${names.length - 3} more` : ''
      const tip = `${plural(t.meetings.length, 'meeting')}: ${names.slice(0, 3).map((n) => clip(n, 30)).join(', ')}${more}`
      let g = `<g transform="translate(${cx} ${floor - ROW})"><title>${esc(tip)}</title>${use(ctx, 'board', 2, 4)}`
      const tx = 54
      const tw = 3 * SEAT + 4
      // the attendees behind the table, watching the whiteboard, nodding in turn, and the board's tally lit while they meet
      const seated = [0, 1, 2].map((i) => use(ctx, pose('claude', 'L'), tx + 2 + i * SEAT, 11, '', aT(ctx, '0 0;0 1;0 0;0 0', 1.6, -i * 0.45))).join('')
      const tally = [0, 1, 2, 3, 4].map((i) => [5 + i * 3, 15, 2, 2, i < 2 ? '#3d6e12' : '#9a3fb5'])
      const marks = paint([[5, 8, 12, 1, '#8a3fa8'], [5, 11, 20, 1, '#a59d8c'], ...tally])
      g += shownWhen(R, t.on, seated + marks)
      g += paint([[tx, 23, tw, 1, '#c9a26b'], [tx, 24, tw, 1, '#8f6d43'], [tx + 1, 25, tw - 2, 3, '#6e5233'], [tx + 1, 28, 2, 8, '#6e5233'],
        [tx + tw - 3, 28, 2, 8, '#6e5233']])
      fore += g + '</g>'
      cx += CELL_W + 4
    }
  }
  const lights = roomLights(ctx, R, M, x, top, w, BH, it.tables.reduce((on, t) => on.map((v, i) => v || t.on[i]), new Array(M.S).fill(false)))
  return { back: lights.back + back, fore: fore + lights.fore + head }
}

// The floors' bands over their slabs: walls and partitions, the rooms, the slab under each band.
function paintBands(ctx, R, M, bands, IX0, IW) {
  let s = ''
  ctx.plates = { rects: [], light: [], text: '' }
  for (const b of bands) {
    let back = ''
    let fore = ''
    b.items.forEach((it, i) => {
      back += paint([[it.x, b.top, it.w, b.h, K.wall]])
      if (i) back += paint([[it.x - 3, b.top, 3, b.h, K.part], [it.x - 3, b.top, 1, b.h, K.partHi]])
      const out = it.kind === 'room' ? drawRoom(ctx, R, M, it, b.top, b.h) : drawMeeting(ctx, R, M, it, b.top, b.h)
      back += out.back
      fore += out.fore
    })
    const slabY = b.top + b.h
    s += back + fore + paint([[IX0, slabY, IW, SLAB_TL, K.slab], [IX0, slabY, IW, 2, K.wood], [IX0, slabY + 2, IW, 1, K.woodD]])
  }
  return s + platesSvg(ctx)
}

// ---------------------------------------------------------------- the sky, the street, the walkers

// The sky's lights through a day, [minute, opacity] where each fade starts or ends: the dawn over the night from 05:00
// (whole at 06:30), the day over the dawn from 07:30 (whole at 08:30, the dawn let go under it), the dusk over the day
// from 16:00 (whole at 17:00, the day let go under it), fading into the night from 18:30 to 20:30. The night under them
// is whole; on the page, where no wash covers it, its stars fade out as the dawn comes and back as the dusk goes.
const LIGHTS = {
  dawn: [[300, 0], [390, 1], [510, 1], [540, 0]],
  day: [[450, 0], [510, 1], [1020, 1], [1050, 0]],
  dusk: [[960, 0], [1020, 1], [1110, 1], [1230, 0]],
  night: [[300, 1], [390, 0], [1110, 0], [1230, 1]],
}
// When the sun and the moon rise and set (minutes from the day's midnight, past 1440 the next day's)
const SUN = { rise: 420, set: 1140 }
const MOON = { rise: 1200, set: 1800 }

/**
 * A body's crossings of the sky's way (sceneHeader's `arc`), `points` ([slot, p], p the share of the way by length: 0
 * where it rises, 1 where it sets, back to 0 at once, out of sight): `{ base, anim }`, where a surface without SMIL
 * shows it (at the busiest slot) and its move, an animateMotion along the way, keyed only where it rises and sets, so
 * it goes at one even pace from one to the other, behind the sign too; three keys a day where a path of points would
 * need one for every bend. Its path is written from `base`, which the moving body has as its own place.
 */
function orbMotion(R, arc, points) {
  const t = track(R, points, (v) => Math.round(v * 1000) / 1000, R.stride)
  const base = arc.at(t.at(R.b)).map(Math.round)
  if (!R.animate) return { base, anim: '' }
  return {
    base, anim: `<animateMotion path="${arc.path(...base)}" keyPoints="${t.values}" keyTimes="${t.keyTimes}" calcMode="linear" dur="${R.D}s" ` +
      'repeatCount="indefinite"/>',
  }
}
/** A body's moving sprite (SPR's lp-sun, lp-moon): the body at its place, its move moving the sprite round it. */
function orbDef(c, name) {
  const o = c.lapse?.orbs?.[name]
  return o ? use(c, name, ...o.base) + o.anim : ''
}

// The clouds of the replay's sky: [shape, row, side of the sign (0 left, 1 right), near], each placed in the middle of
// the sky the sign leaves open on its side, so a still shows them; moving, the near ones sail twice as fast as the far
// ones. The lean sky's: its one small cloud, once each side.
const CLOUDS = [['streak', 4, 0, false], ['streak', 11, 1, false], ['puff', 22, 0, true], ['puff', 16, 1, true]]
const CLOUDS_LEAN = [['cloud', 5, 0, false], ['cloud', 26, 1, false]]
/**
 * The cloud field (SPR's lp-cl, or the lean sky's clouds as they are): each layer, and while the replay plays a copy of
 * it a width on, sliding a width a loop or two.
 */
function cloudLayers(c) {
  const R = c.lapse?.R
  if (!R) return ''
  const layer = (near) => {
    const field = (c.sky ? CLOUDS : CLOUDS_LEAN).filter((k) => k[3] === near)
    if (!field.length) return ''
    const s = signBox(c.W)
    const drawn = field.map(([shape, y, side]) => {
      const w = c.sky ? CLOUD_BOX[shape][0] : 17
      const x = Math.max(2, Math.round(side ? (s.x + s.w + c.W - 6 - w) / 2 : (6 + s.x - w) / 2))
      const name = c.sky ? `cl-${shape}` : shape
      return use(c, name, x, y) + (R.animate ? use(c, name, x + c.W, y) : '')
    }).join('')
    if (!R.animate) return drawn
    return `<g>${drawn}<animateTransform attributeName="transform" type="translate" values="0;-${c.W}" keyTimes="0;1" dur="${near ? Math.round(R.D * 500) / 1000 : R.D}s" ` +
      'repeatCount="indefinite"/></g>'
  }
  return layer(false) + layer(true)
}

// How low the sun looks in each light it is drawn in (SUN_TONES): gold by day, orange under the dawn and the dusk.
const SUN_IN = { dawn: 'low', day: 'high', dusk: 'low' }

/**
 * The sky as the replay goes (sceneHeader's `sky` option), lights that fade into each other with the replayed hour
 * (LIGHTS) as a timelapse's do: the night (its wash, the stars) under all, the dawn, the day and the dusk over it. The
 * sun from 07:00 to 19:00 and the moon from 20:00 to 06:00 rise between the roof's props, climb beside the sign, pass
 * behind it and sink behind the roof on the other side, at one even pace (orbMotion); out of sight each goes back for
 * its next rising. The full sky (ctx.sky) draws them in each light they show in, over its bands, the sun in that
 * light's colors (SUN_IN: a light coming in over another never blends it), the moon in the night's (the dawn fades it
 * as it sets), then the light's clouds in its tint, in front of them. The lean sky (a drawing near its size budget)
 * keeps the small sun and moon over all its lights and the day's clouds alone.
 */
function lapseSky(ctx, R, M, tl) {
  return ({ wash, arc, deco }) => {
    // u: the replay in slots; a wall-clock minute m of day d is at slot d × per_day + m / slot_min of the range, less
    // the slots cut before the replay (start)
    const at = (d, m) => d * tl.per_day + m / tl.slot_min - tl.start
    const d0 = Math.floor(tl.start / tl.per_day)
    const days = Array.from({ length: Math.ceil((tl.start + M.S) / tl.per_day) - d0 + 3 }, (_, k) => d0 + k - 1)
    const daily = (keys) => days.flatMap((d) => keys.map(([m, v]) => [at(d, m), v]))
    // rising at the way's start, setting at its end, then back to its start out of sight
    const way = ({ rise, set }) => [[rise, 0], [set, 1], [set, 0]]
    const orbs = (ctx.lapse.orbs = { sun: orbMotion(R, arc, daily(way(SUN))), moon: orbMotion(R, arc, daily(way(MOON))) })
    const sun = (light) => {
      const [disc, rim] = SUN_TONES[SUN_IN[light]]
      return use(ctx, 'lp-sun', 0, 0, ` color="${disc}" stroke="${rim}"`)
    }
    const clouds = (light) => (ctx.sky ? use(ctx, 'lp-cl', 0, 0, cloudTint(light)) : light === 'day' ? cloudLayers(ctx) : '')
    // the lean sky's stars clear of the strip under its top, as they always were
    const night = wash('night') + deco(true, ctx.sky ? [] : [[6, 1, ctx.W - 7, 16]]) + (ctx.sky ? onPage(ctx, use(ctx, 'lp-moon')) + clouds('night') : '')
    let s = ctx.transparent ? faded(R, daily(LIGHTS.night), R.b, night) : night
    // the dawn and the dusk with fewer bands beside the building (the sliver of sky its walls leave)
    for (const light of ['dawn', 'day', 'dusk']) {
      s += faded(R, daily(LIGHTS[light]), R.b, wash(light, light === 'day' ? undefined : 3) + (ctx.sky ? sun(light) : '') + clouds(light))
    }
    if (ctx.sky) return s
    return s + use(ctx, 'sun-s', ...orbs.sun.base, '', orbs.sun.anim) + onPage(ctx, use(ctx, 'moon-s', ...orbs.moon.base, '', orbs.moon.anim))
  }
}

/**
 * The ground floor, the live floor's street front (ctx.floors.front) in the replay's light: by day, lit at night while
 * anyone works, dark (and 'closed') at night when nobody does; its lamps on by night. The night fronts are drawn over
 * the day one (the same shapes, lit or dark), so each is one switch.
 */
function streetFront(ctx, R, M, top, h, IX0, IX1) {
  const front = ctx.floors?.front
  if (!front) return { facade: '', street: '' }
  const day = front({ ...ctx, night: false, desks: [] }, top, h, IX0, IX1)
  const lit = front({ ...ctx, night: true, desks: [{}] }, top, h, IX0, IX1)
  const dark = front({ ...ctx, night: true, desks: [] }, top, h, IX0, IX1)
  const busy = M.atWork.map((n, i) => n > 0 || M.rooms.some((r) => r.occupied[i]))
  const under = (markup) => (M.night.every(Boolean) || (!R.animate && M.night[R.b]) ? '' : markup)
  return {
    facade: under(day.facade) + shownWhen(R, M.night.map((n, i) => n && busy[i]), lit.facade) + shownWhen(R, M.night.map((n, i) => n && !busy[i]), dark.facade),
    street: under(day.street) + shownWhen(R, M.night, lit.street),
  }
}

/**
 * Who comes and goes: before a session's first run its character walks up the sidewalk to the door (four slots, from
 * the left or the right), and is gone in when its desk lights up; when its last run ends it comes out of the door and
 * walks away along the sidewalk (four slots, to the left or the right). A few walkers take turns each way (each keeps
 * one character, one side).
 */
function walkersSvg(ctx, R, M, groundY) {
  if (!R.animate || !M.walkers.length) return ''
  const door = Math.floor(ctx.W / 2) - 12
  const reach = Math.min(120, Math.floor(ctx.W / 2) - 20)
  return M.walkers.map((w) => {
    const side = w.right ? door + reach : door - reach
    const points = w.walks[0][0] > 0 ? [[0, door]] : []
    const on = new Array(M.S).fill(false)
    for (const [s0, s1] of w.walks) {
      points.push(...(w.out ? [[s0, door], [s1, side]] : [[s0, side], [s1, door]]))
      for (let i = s0; i < s1; i++) on[i] = true
    }
    const { base, anim } = slide(R, points, R.b)
    // facing the way it walks: toward the door coming in, away from it going out
    const body = use(ctx, pose(w.agent, w.right === w.out ? 'Wr' : 'Wl'), 0, groundY - 15)
    return `<g${base}${on[R.b] ? '' : ' display="none"'}>${discrete(R, 'display', DISPLAY(on))}${anim}${body}</g>`
  }).join('')
}

// ---------------------------------------------------------------- the reel

/** The empty reel's height (nothing to replay): a strip of film, sprockets along both edges. */
const REEL_H = 29
// The reel's rows, top down: the sprockets (REEL_PAD), the tag row (the playhead's tag, the busiest slot's flag), the
// three lanes (LANE tall, LANE_GAP apart), the days' names, the sprockets.
const REEL_PAD = 5
const TAG_ROW = 10
const LANE = 12
const LANE_GAP = 2
const DAY_ROW = 8
const REEL_LANES_H = 2 * REEL_PAD + TAG_ROW + 3 * LANE + 2 * LANE_GAP + DAY_ROW
// The lanes' ground, and the nights behind them in night blue.
const LANE_BG = '#221d18'
const LANE_NIGHT = '#0e1430'

// A strip of film from x0 to x1, `h` tall from `top`: dark, a row of sprocket holes along each edge.
const film = (top, x0, x1, h = REEL_H) => paint([[x0 - 2, top, x1 - x0 + 4, h, '#16110d']]) +
  `<path stroke="#3a322b" stroke-width="2" stroke-dasharray="2 4" d="M${x0} ${top + 1}H${x1}M${x0} ${top + h - 1}H${x1}"/>`

/**
 * The slots as pixel columns across [X0, X0 + CW): a slot as wide as its share of the width, or, on a width narrower
 * than the replay is long, a column showing the most of the slots that fall in it.
 */
function columnsOf(S, X0, CW) {
  const xOf = (u) => X0 + (u * CW) / S
  const cols = []
  if (S <= CW) {
    for (let i = 0; i < S; i++) cols.push({ x: Math.round(xOf(i)), w: Math.round(xOf(i + 1)) - Math.round(xOf(i)), from: i, to: i + 1 })
  } else {
    for (let c = 0; c < CW; c++) {
      const from = Math.floor((c * S) / CW)
      cols.push({ x: X0 + c, w: 1, from, to: Math.max(from + 1, Math.floor(((c + 1) * S) / CW)) })
    }
  }
  return { cols, xOf }
}

/**
 * Bars standing on `base`, one a column `h(c)` tall (0 for none), as one path: the outline of their tops, a V and an
 * H where the height changes, so a run of equal columns costs a few characters and the whole chart half what a rect a
 * run would. The columns are side by side (columnsOf), so the outline never spans a gap.
 */
function skyline(cols, h, base, fill) {
  const runs = []
  for (const c of cols) {
    if (!c.w) continue
    const v = h(c)
    const last = runs.at(-1)
    if (last && last.v === v) last.x1 = c.x + c.w
    else runs.push({ x0: c.x, x1: c.x + c.w, v })
  }
  while (runs.length && !runs[0].v) runs.shift()
  while (runs.length && !runs.at(-1).v) runs.pop()
  if (!runs.length) return ''
  let d = `M${runs[0].x0} ${base}`
  for (const r of runs) d += `V${base - r.v}H${r.x1}`
  return `<path fill="${fill}" d="${d}V${base}z"/>`
}
const mostIn = (arr, c) => Math.max(...arr.slice(c.from, c.to))
const sumIn = (arr, c) => arr.slice(c.from, c.to).reduce((a, v) => a + v, 0)

/**
 * The reel's days across the lanes [y, y + h): a dashed line where each starts (yesterday: short ticks every few hours)
 * and their names under the lanes at baseline `ly` (the weekday and the date for the week, the date for the month, gold
 * on a month's 1st; every few when narrow; none where the part of its day the replay shows is too narrow for it).
 */
function reelDays(tl, S, X0, CW, xOf, y, h, ly) {
  const X1 = X0 + CW
  const lines = []
  const ticks = []
  const labels = []
  const d0 = Math.floor(tl.start / tl.per_day)
  const d1 = Math.ceil((tl.start + S) / tl.per_day)
  for (let d = d0 + 1; d < d1; d++) lines.push(Math.round(xOf(d * tl.per_day - tl.start)))
  let size = 5
  if (tl.kind === 'yesterday') {
    const every = CW >= 300 ? 3 : 6
    for (let hr = 0; hr < 24; hr += every) {
      const u = (hr * 60) / tl.slot_min - tl.start
      if (u < 0) continue
      if (u >= S) break
      if (u > 0) ticks.push([Math.round(xOf(u)), y, 1, 2, '#a4977c/.7'], [Math.round(xOf(u)), y + h - 2, 1, 2, '#a4977c/.7'])
      // its label left-aligned at its tick, none that would run past the lanes (a cut day can end just after an hour)
      const hour = `${String(hr).padStart(2, '0')}:00`
      if (xOf(u) + 1 + textW(hour, size) <= X1) labels.push(txt(xOf(u) + 1, ly, hour, size, ROLE.dim))
    }
  } else {
    const dayW = (CW * tl.per_day) / S
    const name = (d) => {
      const dt = dayOf(tl.days[d] ?? '')
      return tl.kind === 'month' ? String(dt.getUTCDate()) : `${WEEKDAY[dt.getUTCDay()]} ${dt.getUTCDate()}`
    }
    const widest = (z) => Math.max(...Array.from({ length: d1 - d0 }, (_, k) => textW(name(d0 + k), z)))
    if (widest(5) + 3 > dayW) size = 4.5
    const step = Math.max(1, Math.ceil((widest(size) + 3) / dayW))
    for (let d = d0; d < d1; d++) {
      if ((d - d0) % step) continue
      const a = Math.max(d * tl.per_day, tl.start) - tl.start
      const b = Math.min((d + 1) * tl.per_day, tl.start + S) - tl.start
      if (((b - a) * CW) / S < textW(name(d), size) + 2) continue
      const first = tl.kind === 'month' && dayOf(tl.days[d] ?? '').getUTCDate() === 1
      labels.push(txt(xOf((a + b) / 2), ly, name(d), size, first ? ROLE.accent : ROLE.dim, ' text-anchor="middle"'))
    }
  }
  const dashed = lines.length ? `<path stroke="#a4977c" stroke-opacity=".6" stroke-dasharray="1 1" d="${lines.map((x) => `M${x + 0.5} ${y}v${h}`).join('')}"/>` : ''
  return { lines: dashed + paint(ticks), labels: labels.join('') }
}

/**
 * The busiest slot's flag: a gold pennant on a pole standing at (x, foot), 'PEAK n' beside it, kept within [lo, hi].
 * Returns its markup and the span it takes, [x0, x1].
 */
function peakFlag(x, foot, n, lo, hi, poleH) {
  const word = `PEAK ${n}`
  const tw = textW(word, 4.5)
  const left = x + 6 + tw > hi && x - 2 - tw >= lo
  const svg = paint([[x, foot - poleH, 1, poleH, '#c9a26b'], [left ? x - 3 : x + 1, foot - poleH, 3, 3, ROLE.accent]]) +
    txt(left ? x - 4 : x + 5, foot - poleH + 3.5, word, 4.5, ROLE.accent, left ? ' text-anchor="end"' : '')
  return { svg, span: left ? [x - 4 - tw, x + 1] : [x, x + 5 + tw] }
}

/**
 * The playhead's tag, by the day: what a glance reads at 20 slots a second (the hours blur; the sky and the lit rooms
 * show them). Yesterday its hour ('13:00'), the week its weekday ('WED': the dates are under the lanes), the month its
 * date ('NOV 1'), as the parts clockLine draws, each a constant or its value slot by slot, and the longest the tag
 * must hold. The hour's digits and the weekday are one width each, so they slide on strips, a key a change.
 */
function dayTagParts(tl, S) {
  const sl = Array.from({ length: S }, (_, i) => lapseSlot(tl, i))
  const part = (vals) => (vals.every((v) => v === vals[0]) ? vals[0] : vals)
  if (tl.kind === 'yesterday') {
    const hh = sl.map((s) => s.hm.slice(0, 2))
    return { parts: [part(hh.map((v) => v[0])), part(hh.map((v) => v[1])), ':00'], longest: '00:00' }
  }
  if (tl.kind === 'week') return { parts: [part(sl.map((s) => s.wd.toUpperCase()))], longest: 'WED' }
  // the month: its name, the date's tens (none under the 10th) and its ones, so the ones slide on a strip
  return {
    parts: [part(sl.map((s) => s.mon.toUpperCase())), ' ', part(sl.map((s) => (s.d >= 10 ? String(Math.floor(s.d / 10)) : ''))), part(sl.map((s) => String(s.d % 10)))],
    longest: 'MMM 00',
  }
}

/** The day tag's words (dayTagParts' parts), end-anchored at (x, y) in gold: switched glyphs and strips (clockLine), a still's alone. */
function dayTag(ctx, R, parts, x, y) {
  if (!R.animate) {
    const word = parts.map((p) => (typeof p === 'string' ? p : p[R.b])).join('')
    return `<text x="${r1(x)}" y="${r1(y)}" font-size="${INFO.size}" text-anchor="end" fill="${ROLE.accent}">${esc(word)}</text>`
  }
  return clockLine(ctx, R, parts, x, y, ROLE.accent)
}

/**
 * THE REEL from `top`, between X0 and X1: the range at a glance on a strip of film (REEL_LANES_H tall). Three lanes,
 * slot by slot, each on its own scale: the sessions at work (its busiest column fills it), their interns, the commits;
 * the nights in night blue behind them; at the left each lane's name over the range's total, in big pixel figures (the
 * 3 × 5 font at twice its size) where they fit beside the name, else in bold type; the days dashed and named under them.
 * In the row over the lanes the busiest slot's flag (out of the way while the tag passes over it), and the playhead's
 * tag with the replayed day, held inside the reel at both ends; the playhead a gold line down the lanes, haloed dark so
 * it reads over the bars; what is still to come under a light cover that shrinks as the replay goes. A still has its
 * playhead on the busiest slot.
 */
function reelSvg(ctx, R, M, tl, X0, X1, top) {
  const S = M.S
  const names = [['SESSIONS', M.sessions, ROLE.busy], ['INTERNS', M.internsIn, ROLE.intern], ['COMMITS', M.commitsIn, ROLE.ship]]
  // the left column: the widest name, a gap, the widest total; big figures only where the lanes keep 60% of the reel
  const nameW = Math.max(...names.map(([w]) => textW(w, 4.5)))
  const bigW = (n) => (String(n).length * 4 - 1) * 2
  const colW = (big) => Math.ceil(nameW + 4 + Math.max(...names.map(([, n]) => (big ? bigW(n) : textW(String(n), 6.5))))) + 2
  let big = names.every(([, n]) => n < 1e5)
  if (big && X1 - X0 - 2 * (REEL_PAD + 1) - colW(true) < 0.6 * (X1 - X0)) big = false
  const cx0 = X0 + REEL_PAD + 1
  const CX0 = cx0 + colW(big)
  const CX1 = X1 - REEL_PAD - 1
  const CW = CX1 - CX0
  const { cols, xOf } = columnsOf(S, CX0, CW)
  const ty = top + REEL_PAD
  const ly = [0, 1, 2].map((k) => ty + TAG_ROW + k * (LANE + LANE_GAP))
  const lanesTop = ly[0]
  const lanesBot = ly[2] + LANE
  // the lanes' ground, the nights down all three, the film between the lanes, then the three series
  let s = film(top, X0, X1, REEL_LANES_H) + paint([[CX0, lanesTop, CW, lanesBot - lanesTop, LANE_BG]]) +
    skyline(cols, (c) => (M.night.slice(c.from, c.to).some(Boolean) ? lanesBot - lanesTop : 0), lanesBot, LANE_NIGHT) +
    paint(ly.slice(1).map((y) => [CX0, y - LANE_GAP, CW, LANE_GAP, '#16110d']))
  const series = [(c) => mostIn(M.atWork, c), (c) => mostIn(M.interns, c), (c) => sumIn(M.commits, c)]
  series.forEach((val, k) => {
    const peak = Math.max(1, ...cols.map(val))
    s += skyline(cols, (c) => {
      const v = val(c)
      return v ? Math.max(1, Math.round((v / peak) * LANE)) : 0
    }, ly[k] + LANE, names[k][2])
  })
  const days = reelDays(tl, S, CX0, CW, xOf, lanesTop, lanesBot - lanesTop, lanesBot + 6.5)
  s += days.lines
  // each lane's name and the range's total
  names.forEach(([word, n, fill], k) => {
    if (big) s += txt(cx0, ly[k] + 4.5, word, 4.5, ROLE.dim) + `<g transform="translate(${CX0 - 4 - bigW(n)} ${ly[k] + LANE - 10}) scale(2)">${paint(pixRuns(String(n), 0, 0, fill))}</g>`
    else s += txt(cx0, ly[k] + LANE / 2 + 2, word, 4.5, ROLE.dim) + txt(CX0 - 4, ly[k] + LANE / 2 + 2.5, String(n), 6.5, fill, ' text-anchor="end" font-weight="bold"')
  })
  // the playhead's tag: its width, and where it stands slot by slot, centered over the playhead, held inside the reel
  const day = dayTagParts(tl, S)
  const TW = Math.ceil(textW(day.longest, INFO.size) + 6)
  const lo = X0 + REEL_PAD
  const hi = X1 - REEL_PAD - TW
  const tagX = (u) => clamp(CX0 + (u * CW) / S - TW / 2, lo, hi)
  // the busiest slot's flag, out of the way while the tag passes over it (a slot's travel either side to spare)
  const flag = peakFlag(Math.round(xOf(M.b + 0.5)), lanesTop, M.atWork[M.b], lo, X1 - REEL_PAD, TAG_ROW - 2)
  const room = CW / S + 1
  s += shownWhen(R, Array.from({ length: S }, (_, i) => tagX(i + 0.5) >= flag.span[1] + room || tagX(i + 0.5) + TW <= flag.span[0] - room), flag.svg)
  // the cover over what is still to come, the playhead's line
  const at = R.b + 0.5
  const pb = r1((at * CW) / S)
  let cover = `<rect x="${r1(CX0 + pb)}" y="${lanesTop}" width="${r1(CW - pb)}" height="${lanesBot - lanesTop}" fill="#000" fill-opacity=".35">`
  if (R.animate) {
    const k = R.kt(S * SLOT_SECONDS)
    cover += `<animate attributeName="x" values="${CX0};${CX1};${CX1}" keyTimes="0;${k};1" dur="${R.D}s" repeatCount="indefinite"/>` +
      `<animate attributeName="width" values="${CW};0;0" keyTimes="0;${k};1" dur="${R.D}s" repeatCount="indefinite"/>`
  }
  s += cover + '</rect>'
  const head = slide(R, [[0, 0], [S, CW]], at)
  s += `<g${head.base}>${head.anim}${paint([[CX0 - 1, lanesTop, 3, lanesBot - lanesTop, '#000/.55'], [CX0, lanesTop - 2, 1, lanesBot - lanesTop + 2, ROLE.accent]])}</g>`
  // its tag, a linear move with a key where it starts and stops following the playhead
  const pts = [[0, tagX(0)]]
  const uLo = ((lo + TW / 2 - CX0) * S) / CW
  const uHi = ((hi + TW / 2 - CX0) * S) / CW
  if (uLo > 0 && uLo < S) pts.push([uLo, lo])
  if (uHi > Math.max(0, uLo) && uHi < S) pts.push([uHi, hi])
  pts.push([S, tagX(S)])
  const tag = slide(R, pts, at)
  const mid = Math.floor(TW / 2)
  const plate = paint([[0, ty, TW, TAG_ROW - 2, ROLE.accent], [1, ty + 1, TW - 2, TAG_ROW - 4, '#241c12'], [mid - 1, ty + TAG_ROW - 2, 3, 1, ROLE.accent], [mid, ty + TAG_ROW - 1, 1, 1, ROLE.accent]])
  s += `<g${tag.base}>${tag.anim}${plate}${dayTag(ctx, R, day.parts, TW - 3, ty + 6)}</g>`
  const every = tl.slot_min < 60 ? `${tl.slot_min} min` : plural(tl.slot_min / 60, 'hour')
  const tip = `the reel: ${tl.label || LAPSE_WORDS[tl.kind]} · every ${every}: the sessions at work, their interns, the commits · ` +
    `busiest ${lapseSlot(tl, R.b).label} (${M.atWork[R.b]} at work)`
  return `<g><title>${esc(tip)}</title>${s}</g>${onPage(ctx, days.labels)}`
}

// ---------------------------------------------------------------- the sign's replayed clock

/**
 * The replayed time on the sign, in `fill` (gold) right after the play mark ('▶ Tue 14:00', 'Tue 27 16:00' for the
 * month), right-aligned to `x`, so the clock costs a few animations, not a text per slot. Its parts (the weekday, the day's digits, the hour's,
 * the minutes') are each drawn one of two ways, whichever is shorter: a <tspan> per glyph it can show, switched by a
 * discrete display animation (a hidden tspan takes no room in the line), or, for a part that changes nearly every slot, a strip of its glyphs one above the other behind a
 * window one line tall (lp-clk), slid by one animation with a key per change; the line keeps the part's room with
 * invisible glyphs, and each glyph on the strip carries the rest of the line invisible after it, so it lands on the
 * part's column in any monospace font. A digit pair is one part or two, whichever is shorter. A still says the
 * busiest slot's time.
 */
function lapseClock(ctx, R, tl, x, y, fill = ROLE.title) {
  const labels = Array.from({ length: R.S }, (_, i) => lapseSlot(tl, i).label)
  const open = `<text x="${r1(x)}" y="${r1(y)}" font-size="${INFO.size}" text-anchor="end" fill="${fill}">`
  if (!R.animate) return `${open}${esc(labels[R.b] ?? '')}</text>`
  const month = tl.kind === 'month'
  const parts = labels.map((l) => (month ? /^(\S+) (\d+) (\d\d):(\d\d)$/ : /^(\S+) ()(\d\d):(\d\d)$/).exec(l)?.slice(1) ?? ['', '', '00', '00'])
  // a part is its glyphs slot by slot, or its text when it never changes
  const part = (vals) => (vals.every((v) => v === vals[0]) ? vals[0] : vals)
  const pairs = (vals) => [[part(vals)], [part(vals.map((v) => v.slice(0, -1))), part(vals.map((v) => v.slice(-1)))]]
  const lead = [part(parts.map((p) => p[0])), ...(month ? [' ', ...pairs(parts.map((p) => p[1]))[1]] : []), ' ']
  let best = ''
  for (const hh of pairs(parts.map((p) => p[2]))) {
    for (const mm of pairs(parts.map((p) => p[3]))) {
      const out = clockLine(ctx, R, [...lead, ...hh, ':', ...mm], x, y, fill)
      if (!best || out.length < best.length) best = out
    }
  }
  return best
}

// The clock's line from its parts (lapseClock's, the reel's day tag's), in `fill`: constant text, switched tspans, or
// a slid strip for a part whose glyphs are all one width and whose line after it keeps one width too (the strip is
// end-anchored past it: the month's day has one digit on the 1st to the 9th, so the weekday before it stays tspans).
function clockLine(ctx, R, parts, x, y, fill = ROLE.title) {
  const open = `<text x="${r1(x)}" y="${r1(y)}" font-size="${INFO.size}" text-anchor="end" fill="${fill}">`
  let line = ''
  let strips = ''
  parts.forEach((p, k) => {
    if (typeof p === 'string') {
      line += esc(p)
      return
    }
    let tspans = ''
    for (const v of new Set(p)) if (v) tspans += shownWhen(R, p.map((w) => w === v), esc(v), 'tspan')
    const after = parts.slice(k + 1)
    const restW = new Set(p.map((_, i) => after.reduce((n, t) => n + (typeof t === 'string' ? t : t[i]).length, 0)))
    if (p.some((v) => v.length !== p[0].length || !v) || restW.size > 1) {
      line += tspans
      return
    }
    const kinds = [...new Set(p)]
    const rest = after.map((t) => (typeof t === 'string' ? t : t.find(Boolean) ?? '')).join('')
    const at = (v) => `0 ${-8 * kinds.indexOf(v)}`
    const glyphs = kinds.map((v, i) => `<tspan x="0" y="${i * 8}">${esc(v)}${rest ? `<tspan fill-opacity="0">${esc(rest)}</tspan>` : ''}</tspan>`).join('')
    const strip = `<g transform="translate(${r1(x)} ${r1(y)})" clip-path="url(#${ctx.id}lp-clkc)"><g transform="translate(${at(p[R.b])})">` +
      `${discreteSlide(R, p.map(at))}<text font-size="${INFO.size}" text-anchor="end" fill="${fill}">${glyphs}</text></g></g>`
    const hold = `<tspan fill-opacity="0">${esc(p[0])}</tspan>`
    if (strip.length + hold.length < tspans.length) {
      line += hold
      strips += strip
    } else line += tspans
  })
  if (strips) use(ctx, 'lp-clk')
  return `${open}${line}</text>${strips}`
}

// ---------------------------------------------------------------- floor numbers

const BX0 = 6
const plaqueW = (s) => Math.round(textW(s, 4.5) + 4)

// The floor numbers on the left pier, as the live building's: a dark plate, the number in dim 4.5 px.
function plaques(ctx, nums, x, w) {
  const text = nums.map(([s, y]) => `<text x="${r1(x + w / 2)}" y="${r1(y + 6.5)}">${esc(s)}</text>`).join('')
  return nums.map(([, y]) => floorPlate(ctx, x, y, w)).join('') + `<g font-size="4.5" fill="${ROLE.dim}" text-anchor="middle">${text}</g>`
}

// Who is who under the building, when more than Clawd sat at the desks: each character standing, its name.
function castLine(ctx, cast, x, y) {
  let s = ''
  let cx = x
  for (const a of cast) {
    const label = `${CAST[a].who} · ${CAST[a].name}`
    const w = Math.round(9 + textW(label, 5) + 8)
    if (cx + w > ctx.W - 4) break
    s += use(ctx, pose(a, 'M'), cx, y - 5) + txt(cx + 9, y, label, 5, CAST[a].hex.dark)
    cx += w
  }
  return s
}

// ---------------------------------------------------------------- scene

const STREET = 56

/**
 * The timelapse from y0 down: `(ctx, y0, level) → { svg, h, alt, kind, slots, loop }` (`level` a LAPSE_LADDER step).
 * Under the shared header (the sign's lines: the play mark and the replayed clock in gold, the range, its totals; the
 * sky of the replayed hour), the rooms in bands over their slabs (the meeting room one row of tables, as many as fit
 * the floor), the street front on the ground floor and its sidewalk with the walkers, floors numbered on the left pier;
 * under the sidewalk THE REEL, then a line for the projects left without a room and who is who. A facts answer without
 * a timeline, or one nobody worked in, draws the building closed with a sign that there is nothing to replay.
 */
export function sceneTimelapse(ctx, y0, level = LAPSE_LADDER[0]) {
  const lv = level ?? LAPSE_LADDER[0]
  const raw = lapseTimeline(ctx.f)
  if (!raw || !raw.desks.length || !raw.slots) return emptyScene(ctx, y0, raw)
  const tl = lv.coarse > 1 ? coarsen(raw, lv.coarse) : raw
  const { W } = ctx
  // ---- horizontal plan: the left pier carries the floor numbers, the rooms between the piers
  const numW = plaqueW('9F')
  const IX0 = BX0 + numW + 2
  const IX1 = W - BX0 - 4
  const IW = IX1 - IX0
  // the meeting room is one row of tables (stacked, they took a fifth of a week's drawing): as many as fit the floor,
  // the meetings beyond them on its +N
  const fitTables = clamp(Math.floor((IW - 6 + 4) / (CELL_W + 4)), 1, lv.tables || 1)
  const M = modelOf(ctx, tl, { ...lv, tables: Math.min(lv.tables, fitTables) })
  const R = replayClock(ctx, M.S, M.b)
  ctx.lapse = { R, night: M.night, tl }
  ctx.night = M.night[M.b]
  const items = M.rooms.map((r) => roomItem(r, IW, ctx.color(r.name)))
  if (M.tables.length) items.push(meetingItem(M.tables, IW))
  const bands = pack(items, IW, IX0)
  // ---- vertical plan: the floors, the street front and its sidewalk, the reel under it, the lines
  let y = y0 + SKY + 5
  for (const b of bands) {
    b.top = y
    y += b.h + SLAB_TL
  }
  const lobbyTop = y
  const groundY = lobbyTop + STREET
  const reelTop = groundY + 4 + 6
  const cast = AGENT_IDS.filter((a) => M.rooms.some((r) => r.seats.some((s) => s.agent.includes(a))))
  const lines = []
  if (M.hidden > 0) lines.push([`+${plural(M.hidden, 'more project')} without a room`, ROLE.dim])
  if (tl.more > 0) lines.push([`+${plural(tl.more, 'more session')} not drawn`, ROLE.dim])
  const castRow = cast.length > 1 || (cast.length === 1 && cast[0] !== 'claude')
  const nLines = (lines.length ? 1 : 0) + (castRow ? 1 : 0)
  const H = reelTop + REEL_LANES_H + (nLines ? nLines * 9 + 2 : 2) - y0
  // ---- the header: the sign's lines, the replayed clock in gold right after the play mark, so it reads as the
  // replay's time; the replayed sky
  ctx.clock = { hm: '', live: false }
  const clockW = Math.max(...Array.from({ length: M.S }, (_, i) => textW(lapseSlot(tl, i).label, INFO.size)))
  const clock = ['', ROLE.accent, { w: clockW, join: ' ', at: (x, y) => lapseClock(ctx, R, tl, x + clockW, y, ROLE.accent) }]
  const info = [['▶', ROLE.accent], clock, [LAPSE_WORDS[tl.kind], ROLE.title], [plural(M.sessions, 'session'), ROLE.title],
    [plural(M.internsIn, 'intern'), ROLE.intern], [plural(M.commitsIn, 'commit'), ROLE.ship]]
  let s = sceneHeader(ctx, y0, { view: 'timelapse', when: tl.label || LAPSE_WORDS[tl.kind], info, groundY, sky: lapseSky(ctx, R, M, tl), shift: '' }).svg
  // ---- the floors, the street front on its sidewalk, the walkers
  s += paintBands(ctx, R, M, bands, IX0, IW)
  const front = streetFront(ctx, R, M, lobbyTop, STREET, IX0, IX1)
  s += front.facade + paint([[0, groundY, W, 3, K.walk], [0, groundY + 3, W, 1, K.walkD]]) +
    `<path stroke="${K.walkD}" stroke-width="3" stroke-dasharray="1 11" d="M5 ${groundY + 1.5}H${W}"/>` + front.street + walkersSvg(ctx, R, M, groundY)
  s += plaques(ctx, [['1F', lobbyTop + 2], ...bands.map((b, i) => [`${bands.length - i + 1}F`, b.top + 2])], BX0 + 1, numW)
  // ---- under the sidewalk: the ground (backdrop), the reel, the lines
  s += backdrop(ctx, [[0, groundY + 4, W, y0 + H - groundY - 4, K.ground]])
  s += reelSvg(ctx, R, M, tl, 8, W - 8, reelTop)
  let ly = reelTop + REEL_LANES_H + 7
  let marks = ''
  if (lines.length) {
    marks += spans(8, ly, 5, fitGroups(lines, W - 16, 5))
    ly += 9
  }
  if (castRow) marks += castLine(ctx, cast, 8, ly)
  s += onPage(ctx, marks)
  const busiest = lapseSlot(tl, M.b).label
  const alt = `The Office timelapse, ${LAPSE_WORDS[tl.kind]}${tl.label ? ` (${tl.label})` : ''}: ` +
    `${plural(M.sessions, 'session')} in ${plural(M.projects, 'project')}, ` +
    `busiest ${busiest} with ${M.atWork[M.b]} at work`
  return { svg: s, h: H, alt, kind: tl.kind, slots: M.S, loop: R.D, busiest: M.b, atWork: M.atWork }
}

// Nothing to replay: the building closed for the range (a dark room with tidy desks, a sign), the street front by the
// facts' own hour, an empty reel.
function emptyScene(ctx, y0, raw) {
  const { W, f } = ctx
  const kind = raw?.kind ?? (Object.hasOwn(LAPSE_WORDS, f.range?.kind) ? f.range.kind : 'week')
  const label = raw?.label || String(f.range?.label ?? '')
  const S = raw?.slots ?? 0
  ctx.clock = { hm: '', live: false }
  ctx.night = Boolean(f.now?.is_night)
  const numW = plaqueW('9F')
  const IX0 = BX0 + numW + 2
  const IX1 = W - BX0 - 4
  const IW = IX1 - IX0
  const top = y0 + SKY + 5
  const BH = HEAD + ROW
  const lobbyTop = top + BH + SLAB_TL
  const groundY = lobbyTop + STREET
  const reelTop = groundY + 4 + 6
  const H = reelTop + REEL_H + 4 - y0
  const info = [['▶ timelapse', ROLE.accent], [LAPSE_WORDS[kind], ROLE.title], ['nothing to replay', ROLE.dim]]
  let s = sceneHeader(ctx, y0, { view: 'timelapse', when: label || LAPSE_WORDS[kind], info, groundY, shift: '' }).svg
  // the room: dark, its desks tidy and off, the sign on the wall
  const g = clamp(Math.floor((IW - 6) / SW), 1, 3)
  let room = paint([[IX0, top, IW, BH, K.wall], [IX0, top + BH - 14, IW, 14, K.wallLow]])
  room += nameplate(ctx, IX0 + 3, top + 2, 'NOTHING TO REPLAY', ROLE.dim, IW - 10).svg
  const x0 = IX0 + Math.floor((IW - g * SW) / 2)
  for (let i = 0; i < g; i++) room += `<g transform="translate(${x0 + i * SW + 3} ${top + BH - ROW})" color="${ROLE.dim}">${use(ctx, 'lp-seat')}</g>`
  room += use(ctx, 'plant', IX0 + IW - 13, top + BH - 12) + paint([[IX0, top + HEAD, IW, BH - HEAD, '#0b1233/.45']])
  s += `<g><title>${esc(`no sessions ${LAPSE_WORDS[kind]}: nothing to replay`)}</title>${room}</g>`
  s += paint([[IX0, top + BH, IW, SLAB_TL, K.slab], [IX0, top + BH, IW, 2, K.wood], [IX0, top + BH + 2, IW, 1, K.woodD]])
  const front = ctx.floors?.front ? ctx.floors.front({ ...ctx, desks: [] }, lobbyTop, STREET, IX0, IX1) : { facade: '', street: '' }
  s += front.facade + paint([[0, groundY, W, 3, K.walk], [0, groundY + 3, W, 1, K.walkD]]) + front.street
  s += plaques(ctx, [['1F', lobbyTop + 2], ['2F', top + 2]], BX0 + 1, numW)
  s += backdrop(ctx, [[0, groundY + 4, W, y0 + H - groundY - 4, K.ground]])
  s += film(reelTop, 8, W - 8)
  s += txt(W / 2, reelTop + REEL_H / 2 + 2, `nothing to replay ${LAPSE_WORDS[kind]}`, 5, ROLE.dim, ' text-anchor="middle"')
  const alt = `The Office timelapse, ${LAPSE_WORDS[kind]}${label ? ` (${label})` : ''}: nothing to replay`
  return { svg: s, h: H, alt, kind, slots: S, loop: loopSeconds(S), busiest: 0, atWork: [] }
}
