/**
 * Today: the pixel office's Today tab (lib/svg-today.mjs) in voxels, three storeys over the street lobby, read from the
 * roof down as the pixel drawing is. Upstairs the TIME CLOCK: the clock-in racks (a card per desk open now; on a page of
 * the past, a card per session of that day), the punch clock showing the time (on a page of the past, that day's date)
 * while a character punches its card in a flash of sparks, the employee of the day in a gold frame (the busiest
 * project's busiest character, its name on a plate of its color, crowned) and the tear-off calendar; on the band under
 * it the day in one line: the busiest hour, its agent-time, the night shift's. Then THE DAY'S PICTURE, the city now:
 * under the sky of the hour (the sun or the moon where it stands, stars by night, clouds drifting by), along a street
 * from midnight to midnight a building for every hour worked, as tall as its agent-time and lit by the hour (glass by
 * day, lit windows by night), the busiest crowned, the hour now under construction (the mascot on its roof, a crane on
 * the next lot), a tree where nobody worked, the hours still to come empty lots behind a fence, a car and a taxi driving
 * by; the date on a band in the month's color. Then the TIMESHEETS: the day's sheet on a clipboard, a line per project,
 * busiest first: its name on a tab of its color, who of it is at a desk now, its 24 hours as bars in its color standing
 * in their cells (as tall as the hour's agent-time, a gold star on its best one; the night shift's hours on paper tinted
 * blue, the hours still to come blank), its agent-time and commits; the hour now a red playhead under a tag with the
 * time; under a rule the line of all projects. Every hour and every line tells its figures under the pointer.
 */
import { CAST } from '../../../plugin/lib/cast.mjs'
import { fmtMinutes } from '../../../plugin/lib/format.mjs'
import { dayInfo, seeded } from '../../../plugin/lib/model.mjs'
import { CLASS_COLOR, K, MOON, ROLE, mix, plural } from '../../../plugin/lib/svg-kit.mjs'
import { stripOf } from '../office-layout.js'
import { FRONT, LOBBY_TOP } from '../building.js'

// ---------------------------------------------------------------- the storeys and their paint

export const CLOCK_STOREY = 3.9
export const CITY_STOREY = 4.0
const BAND = .62 // the dark label band at the foot of a storey, facing the street (live.js LIVE_BAND)
const CITY_BAND = .5 // the date band under the day's picture
const CAP_ROWS = 8 // project lines on the sheet; the rest are counted on its band
// live.js's walls (the kit's day palette lights them by day)
const WALL = '#17251a', WAINSCOT = '#121f14', RAIL = '#2a422f', SKIRT = '#243928'
const PLATE = '#120e0b'
const PARQUET = ['#4b3534', '#6e4d3f', '#593e35']

// The timesheet is of the month calendar's stationery (svg-today.mjs): its paper, grid and inks, the night shift's
// hours tinted as a printed calendar tints its weekends, the hours still to come blank; the red marker is the hour now.
const PAPER = '#f8f3e7'
const PAPER_NIGHT = mix(PAPER, '#6f91dc', .13)
const PAPER_NOW = mix(PAPER, '#e2392d', .16)
const LATER = '#d8cdb6'
const GRID = '#a3957b'
const RULE = '#e4dac5'
const INK = '#3a2a20'
const INK_NIGHT = '#3a63b0'
const INK_HEAD = '#6e5f48'
const INK_SHIP = '#3d6e12'
const FADED = '#857760'
const MARKER = '#e2392d'
const TOTAL_INK = '#57a333'
const PAPER_GLOW = { night: .34, day: .3 } // the paper's own light: the sheet reads under one lamp by night, in the shade by day
const capOf = c => mix(c, '#2b2118', .5) // a bar's dark top edge: a light project's bars read on the paper
const BOARD = { o: '#3d2614', b: '#8b5a32', h: '#a9784b', d: '#64401f' }
const STEEL = { o: '#3b3f46', b: '#9aa1ac', h: '#e2e6ec', d: '#6b717c' }
const BOX = ['#9fc06a', '#cfe6a0', '#6f8a45'] // a shipped parcel (one commit)
const LED = '#ff9d5c'
const MACHINE = { body: '#b9ad94', hi: '#d3c9b1', sh: '#8f846d', foot: '#5d5446', bezel: '#14100c', brass: '#c9a26b', print: '#8f6d43' }
const MONTH_BAND = ['#3c68ae', '#ad4570', '#3b8656', '#4b945c', '#a94f86', '#c4861f', '#2a80ba', '#cc6a2c', '#ad6c33', '#c0512a', '#894530', '#a52f39']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

// The day's picture shows the sky now, its hour's, top to horizon in five bands mixed toward the next hour's by the
// minutes (svg-today.mjs SKIES): the night, the blue before dawn, dawn's pinks, sunrise, the morning, noon's deep blue,
// the afternoon, the golden hour, sunset, dusk.
const SKIES = {
  night: ['#0b1029', '#111838', '#18214a', '#232c5a', '#36386c'], predawn: ['#141a3f', '#202858', '#33376a', '#55467a', '#836086'],
  dawn: ['#2f3d7a', '#4f5c98', '#8a70a2', '#d98c8c', '#f6b27c'], rise: ['#4b72ba', '#7895cb', '#c6a6b8', '#f3b98c', '#ffd68c'],
  morning: ['#4f97dc', '#67a9e4', '#85bdeb', '#a6d1f2', '#c9e5f8'], noon: ['#3c8ce0', '#56a2e8', '#77b8ef', '#9ccdf5', '#c3e3f9'],
  afternoon: ['#4891da', '#62a5e1', '#85bae7', '#acd0ec', '#d4e2e4'], gold: ['#5577c0', '#7a8fc2', '#c0a3a2', '#efbd7e', '#ffd88e'],
  set: ['#373a7a', '#674a8c', '#b2597c', '#eb7a54', '#ffb45c'], dusk: ['#151b46', '#272b5e', '#4a3b70', '#7e507c', '#b06a7c'],
}
const SKY_OF = ['night', 'night', 'night', 'night', 'night', 'predawn', 'dawn', 'rise', 'morning', 'morning', 'morning', 'noon', 'noon',
  'noon', 'noon', 'afternoon', 'afternoon', 'afternoon', 'gold', 'set', 'dusk', 'night', 'night', 'night']
const FACADES = ['#b3654c', '#cfa66e', '#8796ad', '#6a9c96', '#d7c49a', '#a07ba3']
const LIT = '#ffd27a'
const GLASS = '#3d5a80'
const CRANE = ['#f2c230', '#b08a1c']
const SCAFFOLD = '#c9a26b'
const FENCE = '#c4ab78'
const STARS = ['#f4f1dc', '#8ea4d8']
const CLOUDS = { day: '#ffffff', gold: '#ffe0c0', rose: '#ffbfae', night: '#262d5a' }
const SEASON_OF = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter']
const FOLIAGE = {
  winter: ['#ffffff', '#2f6e4c', '#1f4d36'], spring: ['#fde4ef', '#f6b3d0', '#de86ae'], summer: ['#a3db6c', '#6cbd45', '#469634'],
  autumn: ['#f8c45a', '#ee8d36', '#c75a2b'],
}

// ---------------------------------------------------------------- sprites (svg-today.mjs's, one char a pixel)

const CROWN = ['g..g..g', 'gg.g.gg', 'ggggggg', 'gGgjgGg', 'GGGGGGG']
const STAR = ['..o..', '.oso.', 'ossso', '.oso.', '.o.o.']
const BIG_STAR = ['..#..', '.###.', '#####', '.###.', '.#.#.']
const ORN_SUN = ['...c...', '.c...c.', '..ccc..', 'c.ccc.c', '..ccc..', '.c...c.', '...c...']
const ORN_MOON = ['..cccc.', '.ccc...', 'ccc....', 'ccc....', 'ccc....', '.ccc...', '..cccc.']
const TREE = ['.LLM.', 'LLMMD', 'LMMMD', '.MDD.', '..T..', '..T..']
const PUFF = ['....ccc......', '..ccccccc.cc.', '.cccccccccccc', 'ccccccccccccc', '.sssssssssss.']
const CAR = ['..rggr...', '.rrrrrrr.', 'rrrrrrrrl', '.kk...kk.']
const TAXI = ['....s....', '...yggy..', '.yyyyyyy.', 'lyyyyyyyy', '.kk...kk.']
const SUN = ['..sssss..', '.ssHHsss.', '.sssssss.', '.sssssss.', '.sssssss.', '.sssssss.', '..sssss..']
const PARCEL = ['llll', 'bddb', 'bbbb']
const PENCIL = ['ee', 'ee', 'ff', 'yY', 'yY', 'yY', 'yY', 'yY', 'yY', 'yY', 'yY', 'ww', 'w.', 'k.']
// The far city in the haze behind the hours (64 × 12, seamless): blocks of towers and a mast, windows (w) lit by night.
const FAR = (() => {
  const rows = Array.from({ length: 12 }, () => Array(64).fill('.'))
  let x = 0
  for (const [bw, bh] of [[5, 6], [7, 9], [4, 5], [6, 11], [8, 7], [5, 10], [3, 4], [6, 8], [7, 6], [5, 9], [8, 7]]) {
    for (let i = 0; i < bw; i++) for (let r = 12 - bh; r < 12; r++) rows[r][x + i] = i % 2 && i < bw - 1 && (12 - r) % 3 === 0 && (i + r + x) % 5 < 2 ? 'w' : 'S'
    x += bw
  }
  rows[0][18] = 'S'
  return rows.map(r => r.join(''))
})()

// ---------------------------------------------------------------- the day's facts (pure)

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
const num = v => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, n) : 0 }
const sum = a => a.reduce((s, v) => s + v, 0)
const darker = (hex, t = .55) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, n >> 8 & 255, n & 255].map(v => Math.round(v * t)); return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}` }
const castOf = agent => (CAST[agent] ? agent : 'claude')
/** '07' for 7. */
export const hh = h => String(h).padStart(2, '0')
/** '09:00–10:00': the hour h as the sheet says it. */
export const hourSpan = h => `${hh(h)}:00–${hh((h + 1) % 24)}:00`
/** The night shift's hours (20:00–07:00): tinted on the sheet, dark in the picture. */
export const nightHour = h => h >= 20 || h < 7
/** Any list as 24 hours of minutes (missing or bad ones 0). */
export const hours24 = v => Array.from({ length: 24 }, (_, h) => num(Array.isArray(v) ? v[h] : 0))
export const argmax = a => a.reduce((b, v, i) => (v > a[b] ? i : b), 0)
/** A bar's height in its cell, 0…1: the hour's agent-time on a square-root scale of the sheet's busiest hour, so a quiet hour still shows. */
export const barShare = (m, max) => (m > 0 && max > 0 ? clamp(Math.sqrt(m / max), .14, 1) : 0)
/** How the hour now lights the picture: dark by night (20:00–07:00), warm at sunrise and from the golden hour on, else day. */
export const lightOf = h => (nightHour(h) ? 'night' : h === 7 || h >= 18 ? 'warm' : 'day')

/**
 * What the Today view draws, from a snapshot: the page (`present` today as it runs, else a page of the past), the hour
 * now and its minutes (none on a page of the past), the day's hours (`shown`: the hours still to come hold nothing),
 * its busiest hour and the night shift's agent-time, the desks open now (today's only), and a line per project active
 * that day, busiest first, with its hours and who of it is at a desk now.
 */
export function todayModel(snapshot) {
  const period = snapshot?.period ?? {}
  const now = snapshot?.now ?? {}
  const back = Math.max(0, Math.floor(Number(period.back) || 0))
  const present = back === 0 && !period.past
  const hour = Number(now.hour)
  const nowH = present && Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : null
  const time = /^(\d{1,2}):(\d{2})$/.exec(String(now.time ?? ''))
  const mm = time ? clamp(Number(time[2]), 0, 59) : 0
  const hhmm = time ? `${hh(Number(time[1]))}:${time[2]}` : ''
  const future = h => nowH != null && h > nowH
  const perHour = hours24(snapshot?.hourly)
  const shown = perHour.map((v, h) => (future(h) ? 0 : v))
  const days = Array.isArray(period.days) ? period.days : []
  const ymd = (present ? now.date : days.at(-1)) ?? now.date ?? days.at(-1) ?? null
  const desks = present && Array.isArray(snapshot?.agents) ? snapshot.agents : []
  const live = new Map()
  for (const d of desks) {
    const k = String(d.project ?? '')
    if (!live.has(k)) live.set(k, [])
    live.get(k).push(d)
  }
  const rows = (Array.isArray(snapshot?.projects) ? snapshot.projects : []).map(p => {
    const name = String(p?.name ?? '?')
    const ph = hours24(p?.hourly).map((v, h) => (future(h) ? 0 : v))
    return {
      name, color: /^#[\da-f]{6}$/i.test(p?.color ?? '') ? p.color : ROLE.busy, ph, am: num(p?.minutes) || sum(ph), commits: num(p?.commits),
      sessions: num(p?.sessions), desks: stripOf(live.get(name) ?? []), crew: Array.isArray(p?.crew) ? p.crew : [], titles: Array.isArray(p?.titles) ? p.titles : [],
    }
  }).filter(r => r.am > 0 || r.commits > 0 || r.sessions > 0 || r.desks.length)
    .sort((a, b) => b.am - a.am || b.commits - a.commits || a.name.localeCompare(b.name))
  const total = sum(shown)
  const best = total > 0 ? argmax(shown) : -1
  const nightMin = sum(shown.filter((_, h) => nightHour(h)))
  const first = shown.findIndex(v => v > 0)
  const last = shown.findLastIndex(v => v > 0)
  const star = rows[0]?.am > 0 ? rows[0] : null
  const shownRows = rows.slice(0, CAP_ROWS)
  const more = rows.length - shownRows.length + num(snapshot?.projectsMore)
  const moreMinutes = sum(rows.slice(CAP_ROWS).map(r => r.am))
  return {
    present, back, nowH, mm, hhmm, perHour, shown, ymd, desks, rows, shownRows, more, moreMinutes, total, best, nightMin, first, last, star,
    night: Boolean(now.night), hour: Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : 13, totals: snapshot?.totals ?? {},
  }
}

/** The character of a project's busiest agent that day (its crew's), Clawd when none is known. */
export function busiestAgent(row) {
  const crew = [...(row?.crew ?? [])].filter(c => CAST[c?.agent]).sort((a, b) => num(b.minutes) - num(a.minutes))
  return crew[0]?.agent ?? castOf(row?.desks?.[0]?.agent)
}

/** The sign's two lines (svg-today.mjs's header): the day's agent-time and sessions, then its interns, meetings and commits. */
export function todaySignLines(snapshot) {
  const t = snapshot?.totals ?? {}
  return [
    [[`${fmtMinutes(num(t.minutes))} agent-time`, ROLE.title], [plural(num(t.sessions), 'session'), ROLE.title]],
    [[plural(num(t.subagents), 'intern'), ROLE.intern], [plural(num(t.workflows), 'meeting'), ROLE.meeting], [plural(num(t.commits), 'commit'), ROLE.ship]],
  ]
}

/** The time clock's header words: who is clocked in now and since when; on a page of the past, first in and last out. */
export function clockWords(m) {
  if (!m.present) return m.first >= 0 ? [[`first in ${hh(m.first)}:00`, K.groupText], [`last out ${hh(m.last + 1)}:00`, K.groupText]] : [['nobody clocked in', ROLE.dim]]
  return [
    m.desks.length ? [`${m.desks.length} clocked in now`, ROLE.busy] : [m.night ? 'everyone clocked out' : 'nobody clocked in yet', ROLE.dim],
    m.nowH != null && m.first >= 0 && [`first in ${hh(m.first)}:00`, K.groupText],
  ].filter(Boolean)
}

/** The day in one line, on the time clock's band: its busiest hour, that hour's agent-time, the night shift's. */
export function clockLine(m) {
  if (m.total <= 0) return [[m.nowH != null ? 'no agent-time yet today' : 'no agent-time that day', ROLE.dim]]
  return [[`busiest hour ${hourSpan(m.best)}`, ROLE.accent], [`${fmtMinutes(m.shown[m.best])} agent-time`, ROLE.title],
    ...(m.nightMin > 0 ? [[`${fmtMinutes(m.nightMin)} on the night shift`, ROLE.night]] : [])]
}

/** 'SATURDAY 7 NOVEMBER 2026' for a 'YYYY-MM-DD' day, '' for none; its month (0…11, April for none) and day. */
export function dateWords(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? ''))
  if (!m) return { title: '', month: 3, day: '', weekday: '' }
  const { d, wdi } = dayInfo(ymd)
  const month = clamp(Number(m[2]) - 1, 0, 11)
  return { title: `${WEEKDAYS[wdi]} ${d} ${MONTH_NAMES[month]} ${m[1]}`, month, day: String(d), weekday: WEEKDAYS[wdi] }
}

/**
 * The sheet's plan in world units: across, the name tab | the desks open now (none on a page of the past) | 24 hour
 * cells | agent-time | commits; up from the storey's base, the band, the clipboard, the totals line, the rule, the
 * project lines, the column heads, the clip and the room's header.
 */
export function sheetLayout({ present = true, rows = 1 } = {}) {
  const n = Math.max(1, rows)
  const X0 = -7.34, XR = 7.34, NW = 2.5, G = .1, NOWW = present ? 1.0 : 0, AW = 1.06, CW = .92
  const NX = X0 + NW + G
  const HX = NX + (present ? NOWW + G : 0)
  const cellsW = XR - CW - G - AW - G - HX
  const pitch = cellsW / 24
  const AX = HX + cellsW + G + AW
  const RH = .46, HEAD = .36
  const boardBottom = BAND + .3, paperBottom = boardBottom + .14
  const totalBottom = paperBottom + .16, totalTop = totalBottom + RH
  const ruleY = totalTop + .085
  const rowsBottom = ruleY + .085, rowsTop = rowsBottom + n * RH
  const headBottom = rowsTop + .05, headTop = headBottom + HEAD
  const paperTop = headTop + .12, boardTop = paperTop + .14
  return { n, X0, XR, NW, NOWW, NX, HX, pitch, cellsW, AX, CW, RH, HEAD, boardBottom, paperBottom, totalBottom, totalTop, ruleY, rowsBottom, rowsTop, headBottom, headTop, paperTop, boardTop, height: boardTop + .84 }
}

// ---------------------------------------------------------------- the building

export function buildToday(ctx, snapshot) {
  const { THREE, kit, labels, actors } = ctx
  const { box, plant, flush } = kit
  const m = todayModel(snapshot)
  const group = new THREE.Group()
  const storeys = [], pickables = [], tickers = [], owned = []
  const tag = (spec, x, y, z, parent) => { const l = labels.label(spec); l.position.set(x, y, z); parent.add(l); return l }
  const colorOf = name => (snapshot?.projects ?? []).find(p => p.name === name)?.color ?? ROLE.idle
  const dotted = (spans, dot = '#7a6e58') => spans.flatMap((span, i) => (i ? [['·', dot, { sep: ' ' }], [span[0], span[1], { ...span[2], sep: ' ' }]] : [span]))
  // the picture's paint is its own light (a painted sky reads alike by night and by day); the paper glows a little by night
  const flats = new Map(), papers = new Map()
  const flat = color => {
    if (!flats.has(color)) { const mat = new THREE.MeshBasicMaterial({ color }); flats.set(color, mat); owned.push(mat) }
    return flats.get(color)
  }
  let lit = kit.night
  const paper = color => {
    if (!papers.has(color)) {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, emissive: color, emissiveIntensity: lit ? PAPER_GLOW.night : PAPER_GLOW.day })
      papers.set(color, mat); owned.push(mat)
    }
    return papers.get(color)
  }
  /** Pixel rows as boxes, each row's runs of one char merged: (x, y) its bottom middle, `legend` char → color or material. */
  function pixelRows(parent, rows, legend, x, y, z, px, depth, opts) {
    const w = Math.max(...rows.map(r => r.length))
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length;) {
        let k = i
        while (k + 1 < row.length && row[k + 1] === row[i]) k++
        const c = legend[row[i]]
        if (c) box(parent, x + ((i + k + 1) / 2 - w / 2) * px, y + (rows.length - 1 - j + .5) * px, z, (k - i + 1) * px, px, depth, c, opts)
        i = k + 1
      }
    })
  }
  const collider = (parent, x, y, z, w, h, d, data) => {
    const c = new THREE.Mesh(ctx.colliderGeometry, ctx.colliderMaterial)
    c.position.set(x, y, z); c.scale.set(w, h, d)
    Object.assign(c.userData, data)
    parent.add(c); pickables.push(c)
    return c
  }
  const light = (parent, x, y, z, intensity, distance) => {
    const l = new THREE.PointLight('#ffd28c', intensity, distance, 2)
    l.position.set(x, y, z); l.userData.nightIntensity = intensity
    parent.add(l); ctx.lights.push(l)
  }
  const lamp = (parent, x, top, z) => {
    box(parent, x, top - .3, z, .045, .33, .045, kit.darkSteel)
    box(parent, x, top - .48, z, .70, .16, .43, '#807153')
    box(parent, x, top - .58, z, .58, .035, .35, ctx.building.bulbMaterial)
  }
  const mover = parent => { const g = new THREE.Group(); parent.add(g); return g }
  // a character drawn without the kit's render bundle: a bundle keeps its first world place, so a floor pulled apart
  // (exploded) would leave its people behind
  const figure = (agent, opts) => { const actor = actors.figure(agent, opts); actor.root.userData.renderBundleActor = false; return actor }

  /** A storey's slab, its band to the street and its trims, the parquet from `z0` to the front. */
  function floorOf(level, base, band, bandColor, { z0 = -3.0, parquet = true } = {}) {
    const fy = base + band
    box(level, 0, fy - .17, 0, 16.7, .34, 6.40, K.slab)
    box(level, 0, base + band / 2 - .02, FRONT + .06, 16.9, band - .04, .32, bandColor)
    box(level, 0, fy - .015, FRONT + .2, 16.9, .05, .06, K.wood)
    box(level, 0, base + .02, FRONT + .2, 16.9, .05, .06, K.woodD)
    if (!parquet) return fy
    box(level, 0, fy, 0, 16.1, .040, 6.10, K.woodD, { castShadow: false })
    for (let z = 2.75, row = 0; z > z0; z -= .5, row++) for (let col = 0; col < 17; col++) box(level, -7.52 + col * .94, fy + .05, z, .94, .040, .50, PARQUET[(row * 3 + col) % 3], { castShadow: false })
    return fy
  }
  /** A wall across the storey at `z` (its face), wainscot, rail and skirt; the side walls' inner faces in front of it. */
  function wallOf(level, fy, top, z) {
    box(level, 0, (fy + top) / 2, z - .1, 16.5, top - fy, .20, WALL)
    box(level, 0, fy + .47, z + .03, 16.3, .94, .07, WAINSCOT)
    box(level, 0, fy + .98, z + .08, 16.4, .09, .11, RAIL)
    box(level, 0, fy + .08, z + .11, 16.4, .13, .15, SKIRT)
    for (let x = -7.8; x < 8; x += .56) box(level, x, fy + .48, z + .09, .025, .78, .04, SKIRT)
    const depth = FRONT - z
    for (const xx of [-8.05, 8.05]) { box(level, xx, (fy + top) / 2, z + depth / 2, .05, top - fy, depth, WALL); box(level, xx + (xx > 0 ? -.03 : .03), fy + .48, z + depth / 2, .05, .92, depth - .05, WAINSCOT) }
  }
  /** A room's name on a plate (the pixel office's room header), then its words; the origin is the plate's left middle. */
  function header(parent, x, y, z, name, color, words, strip = []) {
    const plateW = labels.measure(name, .34, { pixel: true }) + .36
    const stripW = strip.length ? strip.length * .15 + .2 : 0
    const said = words.length ? labels.label({ lines: [{ spans: dotted(words), size: .21 }], pad: .1, anchor: 'left' }) : null
    const saidW = said ? said.userData.size[0] : 0
    const w = plateW + stripW + saidW + .08
    box(parent, x + w / 2 - .04, y, z - .04, w, .52, .05, PLATE)
    tag({ lines: [{ spans: [[name, K.plate, { pixel: true }]], size: .34 }], width: plateW, height: .42, valign: 'middle', pad: .08, bg: color, radius: .025, anchor: 'left' }, x, y, z, parent)
    strip.forEach((c, i) => box(parent, x + plateW + .14 + i * .15, y, z + .01, .1, .3, .03, c, { glow: .45, castShadow: false }))
    if (said) { said.position.set(x + plateW + stripW, y, z); parent.add(said) }
    return w
  }

  // ---------------------------------------------------------------- 4F: the TIME CLOCK
  function clockRoom(level, base) {
    const top = base + CLOCK_STOREY
    const fy = floorOf(level, base, BAND, '#1f1a16', { z0: -1.4 })
    const WZ = -1.5 // the room's wall: what hangs on it stands just out from it
    wallOf(level, fy, top, WZ)
    for (const x of [-4.6, 3.2]) lamp(level, x, top, -.45)
    light(level, .6, top - .8, .9, 26, 12.5)
    const wz = WZ + .08
    // the room's name hanging from the ceiling at the front, the desks' headcount strip and who is in
    const strip = stripOf(m.desks).slice(0, 20).map(a => CLASS_COLOR[a.kind] ?? ROLE.dim)
    const sx = -7.55, sy = top - .62, sz = 2.55
    const sw = header(level, sx, sy, sz, 'TIME CLOCK', ROLE.day, clockWords(m), strip)
    for (const dx of [.25, sw - .35]) box(level, sx + dx, top - .22, sz - .04, .025, .5, .025, '#3a342b', { castShadow: false })

    // the clock-in racks on the wall: a card per desk open now, its top in its project's color (a page of the past: a
    // card per session of that day)
    const cards = m.present ? m.desks.map(d => colorOf(d.project)) : m.rows.flatMap(r => Array.from({ length: Math.min(12, r.sessions) }, () => r.color))
    const racks = clamp(Math.ceil(cards.length / 6), 1, 3)
    const rw = .94, rh = 1.86, ry = fy + 1.64
    for (let r = 0; r < racks; r++) {
      const x = -7.12 + r * (rw + .1)
      box(level, x, ry, wz, rw, rh, .14, '#5d4630')
      box(level, x, ry + rh / 2 - .02, wz + .02, rw, .04, .14, '#7a5a3a')
      box(level, x - rw / 2 + .02, ry, wz + .02, .04, rh, .14, '#7a5a3a')
      box(level, x + rw / 2 - .02, ry, wz + .02, .04, rh, .14, '#4a3520')
      for (let i = 0; i < 6; i++) {
        const cy = ry + rh / 2 - .3 - i * .285
        box(level, x, cy - .125, wz + .09, rw - .1, .035, .05, '#9a7b4f')
        const c = cards[r * 6 + i]
        if (!c) continue
        box(level, x - .02, cy, wz + .085, .62, .23, .025, paper('#efe6cf'))
        box(level, x - .02, cy + .085, wz + .1, .62, .06, .01, c)
        box(level, x - .08, cy - .03, wz + .1, .32, .03, .01, '#b5a888')
      }
    }
    if (cards.length > 18) tag({ lines: [{ spans: [[`+${cards.length - 18} more`, ROLE.dim, { bold: true }]], size: .19 }], pad: .05, bg: PLATE, alpha: .92, radius: .03 }, -7.12 + 2 * (rw + .1), ry - rh / 2 - .17, wz + .1, level)

    // the punch clock on its feet, the time on its face in amber, its card guide on the right
    const cx = -3.32, cz = -.95, cw = 1.42, ch = 1.9, cd = .64
    const yb = fy + .17, front = cz + cd / 2
    box(level, cx, yb + ch / 2, cz, cw, ch, cd, MACHINE.body)
    box(level, cx, yb + ch + .04, cz, cw - .12, .08, cd - .08, MACHINE.sh)
    box(level, cx - cw / 2 + .03, yb + ch / 2, cz + .005, .06, ch, cd, MACHINE.hi)
    box(level, cx + cw / 2 - .03, yb + ch / 2, cz + .005, .06, ch, cd, MACHINE.sh)
    for (const dx of [-.46, .46]) box(level, cx + dx, fy + .1, cz, .24, .18, .52, MACHINE.foot)
    const by = yb + ch - .4
    box(level, cx, by, front + .015, 1.2, .58, .04, MACHINE.bezel)
    box(level, cx, by - .33, front + .01, 1.2, .04, .03, darker(MACHINE.body, .7))
    box(level, cx, yb + ch - 1.1, front + .015, .8, .4, .03, MACHINE.brass)
    box(level, cx, yb + ch - 1.03, front + .035, .62, .045, .01, MACHINE.print)
    box(level, cx - .08, yb + ch - 1.14, front + .035, .46, .045, .01, MACHINE.print)
    const ledSize = .5
    if (m.present) {
      const digits = /^\d\d:\d\d$/.test(m.hhmm) ? m.hhmm : '--:--'
      for (const [text, dx] of [[digits.slice(0, 2), -.28], [digits.slice(3), .28]]) tag({ lines: [{ spans: [[text, LED, { pixel: true }]], size: ledSize, align: 'center' }], width: .48, pad: 0, valign: 'middle', height: .46 }, cx + dx, by, front + .04, level)
      const colon = mover(level)
      for (const dy of [-.08, .08]) box(colon, cx, by + dy, front + .045, .06, .06, .01, LED, { glow: 1.1, castShadow: false })
      tickers.push(t => { colon.visible = Math.floor(t) % 2 === 0 })
    } else {
      // a page of the past: the clock stamps that day's date
      const { day, month } = dateWords(m.ymd)
      const text = day ? `${day.padStart(2, '0')} ${MONTHS[month]}` : '-- ---'
      const size = Math.min(ledSize, 1.08 / Math.max(.1, labels.measure(text, 1, { pixel: true })))
      tag({ lines: [{ spans: [[text, LED, { pixel: true }]], size, align: 'center' }], width: 1.12, pad: 0, valign: 'middle', height: .46 }, cx, by, front + .04, level)
    }
    const gx = cx + cw / 2 + .08, gy = yb + .9, gz = cz + .06
    box(level, gx, gy, gz, .16, .7, .48, MACHINE.body)
    box(level, gx + .07, gy, gz, .03, .7, .48, MACHINE.sh)
    box(level, gx, gy, gz + .245, .04, .6, .01, MACHINE.bezel)
    const tip = m.present ? `punch clock ${m.hhmm || '--:--'}${m.desks[0] ? ` · ${m.desks[0].project} clocking in` : ''}` : `punch clock · ${dateWords(m.ymd).title.toLowerCase()}`
    collider(level, cx + .1, yb + ch / 2, cz, cw + .4, ch + .2, cd + .2, { text: tip })
    const who = m.desks[0]
    if (who) {
      // the character punching its card: in its left hand, its top in the project's color; every 2.4 s it steps in and
      // pushes the card into the slot, the face flares and sparks jump off the guide
      const p = .1
      const actor = figure(castOf(who.agent), { legs: true, p })
      const rest = gx + 1.4
      actor.root.position.set(rest, fy + .07, gz)
      level.add(actor.root)
      box(actor.leftArm, -8.5 * p - .1, 5.3 * p, 0, .26, .38, .03, '#f4efe4')
      box(actor.leftArm, -8.5 * p - .1, 5.3 * p + .15, .018, .26, .08, .01, colorOf(who.project))
      const sparks = mover(level), sparks2 = mover(level), flare = mover(level)
      for (const [dx, dy] of [[.16, .18], [.3, .32], [.24, -.08], [.42, .1]]) box(sparks, gx + dx, gy + dy, gz + .32, .055, .055, .05, ROLE.accent, { glow: 1.3, castShadow: false })
      for (const [dx, dy] of [[.22, .36], [.38, -.02], [.12, -.22]]) box(sparks2, gx + dx, gy + dy, gz + .32, .045, .045, .04, '#fff3c4', { glow: 1.3, castShadow: false })
      for (const [w, h, dx, dy] of [[1.28, .04, 0, .31], [1.28, .04, 0, -.31], [.04, .66, -.62, 0], [.04, .66, .62, 0]]) box(flare, cx + dx, by + dy, front + .04, w, h, .02, '#ffd9a8', { glow: 1.2, castShadow: false })
      tickers.push(t => {
        const k = (t % 2.4) / 2.4, punch = k > 2 / 3
        actor.root.position.x = rest - (punch ? .34 : 0)
        actors.animate(actor, 'look', t)
        flare.visible = punch
        sparks.visible = punch && Math.floor(t * 10) % 2 === 0
        sparks2.visible = punch && !sparks.visible
      })
    } else {
      // nobody at the clock: a card left in the slot
      box(level, gx + .18, gy + .06, gz, .28, .4, .03, '#f4efe4')
      box(level, gx + .18, gy + .22, gz + .018, .28, .08, .01, ROLE.dim)
    }

    // the employee of the day: the busiest project's busiest character in a gold frame under a star, its name on a plate
    // of its color, crowned; nobody yet on a day without agent-time
    const star = m.star
    const name = star ? star.name : 'nobody yet'
    const color = star ? star.color : '#6f665a'
    const crownW = star ? .48 : 0
    const nameSize = [.38, .34, .3].find(size => labels.measure(name, size, { pixel: true }) <= 2.35) ?? .3
    const nameW = Math.min(labels.measure(name, nameSize, { pixel: true }), 2.35)
    const plateW = Math.max(1.6, nameW + .22 + crownW)
    const frameW = 1.46, frameH = 1.16, gap = .3
    const span = frameW + gap + plateW
    const x0 = clamp(2.25 - span / 2, -.1, 4.75 - span)
    const fx = x0 + frameW / 2, fc = fy + 1.86
    box(level, fx, fc, wz, frameW, frameH, .1, '#c9a26b')
    box(level, fx, fc + frameH / 2 - .035, wz + .012, frameW, .07, .1, '#e8cf94')
    box(level, fx, fc - frameH / 2 + .035, wz + .012, frameW, .07, .1, '#8f6d43')
    box(level, fx, fc, wz + .03, frameW - .24, frameH - .24, .07, mix(K.wall, color, .4))
    pixelRows(level, BIG_STAR, { '#': kit.mat(ROLE.accent, .5) }, fx, fc + frameH / 2 + .08, wz + .02, .065, .06)
    let face = null
    if (star) {
      face = figure(busiestAgent(star), { legs: false, p: .068, depth: .1 })
      face.root.position.set(fx, fc - .27, wz + .1)
      level.add(face.root)
    } else tag({ lines: [{ spans: [['?', ROLE.dim, { pixel: true }]], size: .7, align: 'center' }], width: .5, pad: 0 }, fx, fc, wz + .08, level)
    const px = x0 + frameW + gap
    tag({ lines: [{ spans: [['EMPLOYEE OF THE DAY', ROLE.dim, { bold: true }]], size: .21 }], pad: .02, anchor: 'left' }, px, fc + .4, wz + .02, level)
    box(level, px + plateW / 2, fc - .1, wz + .01, plateW + .08, .56, .04, PLATE)
    tag({ lines: [{ spans: [[name, star ? K.plate : '#d8cdb6', { pixel: true }]], size: nameSize }], width: plateW - crownW, height: .48, valign: 'middle', pad: .1, bg: color, radius: .025, anchor: 'left' }, px, fc - .1, wz + .04, level)
    if (star) {
      box(level, px + plateW - crownW / 2 - .02, fc - .1, wz + .035, crownW + .04, .48, .01, flat(color), { castShadow: false })
      pixelRows(level, CROWN, { g: kit.mat('#eec96f', .4), G: kit.mat('#c8963a', .25), j: '#6f91dc' }, px + plateW - crownW / 2 - .02, fc - .23, wz + .06, .055, .05)
    }
    const empTip = star ? `employee of the day: ${star.name} (${CAST[busiestAgent(star)]?.who ?? 'Clawd'}) · ${fmtMinutes(star.am)} agent-time` : 'employee of the day: nobody yet'
    collider(level, x0 + span / 2, fc, wz + .2, span + .2, frameH + .4, .4, { text: empTip, ...(star ? { project: star.name } : {}) })

    // the tear-off calendar: the month on a blue band, the day in big pixel figures, its weekday; a plant in the corner
    const { day, month, weekday, title } = dateWords(m.ymd)
    const kx = 5.85, ky = fy + 1.86, kw = 1.26, kh = 1.42
    box(level, kx + .05, ky - .05, wz - .02, kw, kh, .04, '#0d150f')
    box(level, kx, ky, wz, kw, kh, .05, paper('#f4efe4'))
    box(level, kx, ky + kh / 2 - .19, wz + .03, kw, .38, .02, '#6f91dc')
    box(level, kx, ky - kh / 2 + .025, wz + .03, kw, .05, .02, '#c9bfa8')
    for (const dx of [-.34, .34]) box(level, kx + dx, ky + kh / 2 + .02, wz + .05, .05, .15, .05, '#5d5446')
    if (day) {
      tag({ lines: [{ spans: [[MONTHS[month], '#f4efe4', { bold: true }]], size: .26, align: 'center' }], width: kw, pad: 0 }, kx, ky + kh / 2 - .19, wz + .05, level)
      tag({ lines: [{ spans: [[day, '#3a322b', { pixel: true }]], size: .84, align: 'center' }], width: kw, pad: 0 }, kx, ky - .1, wz + .05, level)
      tag({ lines: [{ spans: [[weekday, '#857760', { bold: true }]], size: .15, align: 'center' }], width: kw, pad: 0 }, kx, ky - kh / 2 + .17, wz + .05, level)
      collider(level, kx, ky, wz + .2, kw, kh, .3, { text: title.toLowerCase() })
    }
    plant(level, 7.42, fy, -1.05, .66)

    // the band: the day in one line
    tag({ lines: [{ spans: dotted(clockLine(m)), size: .21, align: 'center' }], width: 15.4, pad: .06 }, 0, base + BAND / 2 - .02, FRONT + .23, level)
    return face
  }

  // ---------------------------------------------------------------- 3F: the day's picture, the city now
  function cityRoom(level, base) {
    const top = base + CITY_STOREY
    const { title, month } = dateWords(m.ymd)
    const fy = floorOf(level, base, CITY_BAND, MONTH_BAND[month], { parquet: false })
    const X0 = -7.8, W = 15.6, LOT = W / 24
    const lotX = h => X0 + (h + .5) * LOT
    const skyH = m.nowH ?? m.hour
    const key = SKY_OF[skyH]
    const hourLight = lightOf(skyH)
    const dark = hourLight === 'night'
    const rnd = seeded(`td-sky ${m.ymd ?? ''}`)
    const now = m.nowH
    const last = now ?? 23
    const shown = m.shown
    const vmax = Math.max(1, ...shown)
    const best = m.best
    const hop = now ?? (best >= 0 ? best : null)
    // the sky now, its hour's mixed toward the next one's by the minutes, in five bands on the back wall, their seams dithered
    const bands = SKIES[key].map((c, i) => mix(c, SKIES[SKY_OF[(skyH + 1) % 24]][i], clamp(m.mm / 60, 0, 1)))
    const H = top - fy, sz = -3.06
    const edges = [0, .24, .44, .62, .79, 1].map(k => top - k * H)
    // the sky goes round the room and over it, so the picture is a sky box from any floor
    bands.forEach((c, i) => {
      const yc = (edges[i] + edges[i + 1]) / 2, bh = edges[i] - edges[i + 1]
      box(level, 0, yc, sz, 16.1, bh, .1, flat(c), { castShadow: false, receiveShadow: false })
      for (const xx of [-8.04, 8.04]) box(level, xx, yc, (sz + FRONT) / 2, .05, bh, FRONT - sz, flat(c), { castShadow: false, receiveShadow: false })
    })
    box(level, 0, top - .015, (sz + FRONT) / 2, 16.1, .03, FRONT - sz, flat(bands[0]), { castShadow: false, receiveShadow: false })
    const dz = sz + .055, ds = .1
    for (let i = 1; i < 5; i++) {
      for (let k = 0, x = -8.0 + ds / 2; x < 8.05; x += ds, k++) {
        if (k % 2 === 0) box(level, x, edges[i] - ds / 2, dz, ds, ds, .01, flat(bands[i - 1]), { castShadow: false, receiveShadow: false })
        else box(level, x, edges[i] + ds / 2, dz, ds, ds, .01, flat(bands[i]), { castShadow: false, receiveShadow: false })
      }
    }
    // stars by night (a few before dawn and at dusk), two sets twinkling in turns
    const nStars = key === 'night' ? 40 : key === 'predawn' || key === 'dusk' ? 14 : 0
    const twinkle = [mover(level), mover(level)]
    for (let i = 0; i < nStars; i++) {
      const x = -7.9 + rnd() * 15.8, y = edges[3] + .1 + rnd() * (top - edges[3] - .2), s = i % 7 ? .045 : .07
      box(i % 3 ? twinkle[i % 3 - 1] : level, x, y, dz + .01, s, s, .01, flat(STARS[i % 2]), { castShadow: false, receiveShadow: false })
    }
    if (nStars) tickers.push(t => { twinkle[0].visible = Math.floor(t / 1.2) % 2 === 0; twinkle[1].visible = Math.floor(t / 1.7 + .5) % 2 === 0 })
    // the street's buildings: a building for each hour worked, as tall as its agent-time
    // the tallest roof, its crown and the sun stay under the floor above, in sight from it
    const maxH = H - 1.25
    const heightOf = v => .32 + (maxH - .32) * v / vmax
    const roofOf = h => fy + (shown[h] ? heightOf(shown[h]) : .02)
    // the sun from 07:00 to 20:00 or the moon the night through, where it stands on its arc over the street, lifted just
    // clear of the roofs under it
    const hNow = skyH + m.mm / 60
    const horizon = fy + 1.15, skyTop = top - 1.2, ceiling = top - 1.1
    const t = dark ? ((hNow - 19.5 + 24) % 24) / 11 : (hNow - 6.5) / 13
    // where it stands, else beside the crown and the mascot rather than over them
    const marks = [hop, best, now != null && now < 23 ? now + 1 : null].filter(h => h != null && h >= 0).map(lotX)
    const at = clamp(X0 + hNow / 24 * W, X0 + .5, X0 + W - .5)
    const arc = horizon + Math.sin(Math.PI * clamp(t, 0, 1)) * (skyTop - horizon)
    const under = x => Math.max(fy, ...shown.map((v, h) => (h <= last && Math.abs(lotX(h) - x) < LOT * .95 && (v || h === hop) ? roofOf(h) + (h === hop || h === best ? .5 : .2) : fy)))
    const spots = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5].map(k => at + k * LOT).filter(x => x > X0 + .4 && x < X0 + W - .4 && marks.every(mx => Math.abs(x - mx) >= .85))
    const sx = spots.find(x => Math.max(arc, under(x) + .4) <= ceiling) ?? spots[0] ?? at
    const syy = Math.min(ceiling, Math.max(arc, under(sx) + .4))
    const oz = -2.2 // in front of the far city, behind the street: what stands in front of it moves little against it
    const skyAt = bands[clamp(edges.findIndex(e => e < syy) - 1, 0, 4)]
    const sun = !dark
    if (sun && hourLight === 'warm') pixelRows(level, discRows(7), { c: flat(mix(skyAt, '#ffc070', .35)) }, sx, syy - .45, oz - .02, .065, .01, { castShadow: false, receiveShadow: false })
    if (sun) pixelRows(level, SUN, { s: flat('#ffe27a'), H: flat('#fff8dc') }, sx, syy - .245, oz, .07, .02, { castShadow: false, receiveShadow: false })
    else {
      pixelRows(level, discRows(6), { c: flat(mix(skyAt, '#f3ead0', .09)) }, sx, syy - .39, oz - .02, .065, .01, { castShadow: false, receiveShadow: false })
      pixelRows(level, MOON, { m: flat('#f3ead0'), M: flat('#d9cfae') }, sx, syy - .29, oz, .065, .02, { castShadow: false, receiveShadow: false })
    }
    // clouds drifting by, rose at dawn and sunset, dark by night
    const tint = dark ? CLOUDS.night : key === 'set' || key === 'dawn' ? CLOUDS.rose : hourLight === 'warm' ? CLOUDS.gold : CLOUDS.day
    const nClouds = dark ? 1 : 3
    for (let i = 0; i < nClouds; i++) {
      const cloud = mover(level)
      pixelRows(cloud, PUFF, { c: flat(tint), s: flat(mix(tint, '#000000', .12)) }, 0, 0, 0, .065, .02, { castShadow: false, receiveShadow: false })
      const y = edges[1] - .05 - rnd() * .5, x0 = -7 + (i + .3 + rnd() * .4) / nClouds * 14, speed = .1 + i * .035
      cloud.position.set(x0, y, dz + .03)
      tickers.push(t => { const x = -8.6 + ((x0 + 8.6 + t * speed) % 17.2); cloud.position.x = x; cloud.visible = Math.abs(x) < 7.62 })
    }
    if (!dark) {
      // a flock crossing the day, flapping
      const flock = mover(level), up = mover(flock), down = mover(flock)
      const ink = flat(hourLight === 'warm' ? '#4a2c3a' : '#2f3446')
      for (const [bx, by] of [[0, .08], [.32, 0], [.62, .14]]) {
        for (const dx of [-.05, .05]) box(up, bx + dx, by + .04, 0, .05, .05, .02, ink, { castShadow: false, receiveShadow: false })
        box(up, bx, by, 0, .05, .05, .02, ink, { castShadow: false, receiveShadow: false })
        box(down, bx, by + .02, 0, .15, .04, .02, ink, { castShadow: false, receiveShadow: false })
      }
      const fy0 = edges[1] - .2 - rnd() * .4, phase = rnd() * 40
      flock.position.set(0, fy0, dz + .04)
      tickers.push(t => { const k = (phase + t * .45) % 22; flock.position.x = -8.6 + k; flock.visible = k > .8 && k < 15.8; up.visible = Math.floor(t * 4) % 2 === 0; down.visible = !up.visible })
    }
    if (dark && key === 'night') {
      // now and then a star shoots
      const shoot = mover(level)
      const ax = -5 + rnd() * 8, ay = top - .25 - rnd() * .3
      box(shoot, 0, 0, 0, .12, .05, .01, flat('#ffffff'), { castShadow: false, receiveShadow: false })
      for (const [o, c] of [[.14, '#c8cde8'], [.28, '#8f97c4'], [.42, '#5a6196']]) box(shoot, -o, o / 2, 0, .12, .045, .01, flat(c), { castShadow: false, receiveShadow: false })
      shoot.position.set(ax, ay, dz + .03)
      tickers.push(t => { const k = ((t + 3) % 11) / 11; shoot.visible = k < .08; shoot.position.set(ax + k * 18, ay - k * 9, dz + .03) })
    }
    // the far city in the haze, its windows lit by night
    const haze = mix(bands[4], dark ? '#060918' : '#4a5a7a', dark ? .55 : .32)
    const farLegend = { S: flat(haze), w: flat(dark ? mix(haze, LIT, .7) : haze) }
    for (let fx = X0 - rnd() * 5.4; fx < X0 + W; fx += 64 * .085) {
      const x = fx + 32 * .085
      if (x - 2.72 < -8.04 || x + 2.72 > 8.04) {
        // a block cut at a side wall keeps to the room
        const rows = FAR.map(r => [...r].map((c, i) => (Math.abs(fx + (i + .5) * .085) < 8.0 ? c : '.')).join(''))
        pixelRows(level, rows, farLegend, x, fy, sz + .09, .085, .02, { castShadow: false, receiveShadow: false })
      } else pixelRows(level, FAR, farLegend, x, fy, sz + .09, .085, .02, { castShadow: false, receiveShadow: false })
    }

    // the ground: the lots, the sidewalk, the street (dark by night), its curb with the hours on it
    box(level, 0, fy + .02, -1.4, 16.1, .04, 3.3, '#4d463f', { castShadow: false })
    box(level, 0, fy + .03, .62, 16.1, .06, .2, '#8f897e', { castShadow: false })
    box(level, 0, fy + .02, 1.7, 16.1, .04, 1.95, dark ? '#34302c' : '#5d5850', { castShadow: false })
    for (let x = -7.6; x < 8; x += .9) box(level, x, fy + .045, 1.72, .42, .01, .05, '#c9b88a', { castShadow: false })
    box(level, 0, fy + .17, 2.96, 16.1, .34, .3, '#2c2723')
    box(level, 0, fy + .345, 2.96, 16.1, .03, .32, '#8f897e')
    const lotFront = .5
    const litBy = c => (dark ? mix(c, '#0d1330', .72) : hourLight === 'warm' ? mix(c, '#ff9a5a', .2) : c)
    const seasonal = FOLIAGE[SEASON_OF[month]].map(c => (dark ? mix(c, '#10183a', .6) : c))
    const trunk = dark ? mix('#6b4226', '#10183a', .6) : '#6b4226'
    const flicker = []
    const beacons = mover(level)
    const lots = []
    for (let h = 0; h < 24; h++) {
      const v = shown[h], x = lotX(h)
      if (h > last) continue
      if (!v) {
        // nobody worked this hour: a tree in the season's foliage; the hour now with nothing in it yet, its foundation
        if (h === now) box(level, x, fy + .05, lotFront - .4, .54, .06, .7, '#9a948a')
        else pixelRows(level, TREE, { L: seasonal[0], M: seasonal[1], D: seasonal[2], T: trunk }, x, fy + .04, lotFront - .3, .09, .3)
        lots[h] = { roof: fy + .06 }
        continue
      }
      const bh = heightOf(v), d = .7 + ((h * 7) % 3) * .12, zc = lotFront - d / 2, bw = .5
      const roof = fy + bh
      lots[h] = { roof }
      const facade = litBy(FACADES[(h * 5 + 2) % FACADES.length])
      box(level, x, fy + bh / 2, zc, bw, bh, d, kit.mat(facade, .12))
      box(level, x, roof + .02, zc, bw + .04, .04, d + .04, mix(facade, dark ? '#000000' : '#ffffff', .25))
      box(level, x + bw / 2 - .02, fy + bh / 2, zc + .005, .04, bh, d, mix(facade, '#000000', .2))
      // its windows (a door under them): glass by day, lit when the light goes and in the hour now, two in six dark
      const lights = hourLight !== 'day' || h === now
      const door = bh >= .62
      if (door) box(level, x, fy + .13, lotFront + .005, .13, .24, .02, '#2a2420')
      let row = 0
      for (let wy = roof - .17; wy > fy + (door ? .4 : .14); wy -= .2, row++) {
        for (const [col, dx] of [-.14, 0, .14].entries()) {
          const dim = lights && (row * 3 + col + h * 5) % 6 < 2
          if (lights && dim && flicker.length < 4 && (row + h) % 5 === 2) { const g = mover(level); box(g, x + dx, wy, lotFront + .005, .075, .1, .02, kit.mat(LIT, .9), { castShadow: false }); flicker.push(g); continue }
          box(level, x + dx, wy, lotFront + .005, .075, .1, .02, lights ? (dim ? mix(facade, '#000000', .35) : kit.mat(LIT, .9)) : kit.mat(GLASS, .15), { castShadow: false })
        }
      }
      // a water tank or a mast on the roof, never on the crowned roof or the one being built
      if (h !== best && h !== hop && h % 3 !== 2) {
        if (h % 3) { box(level, x + .1, roof + .2, zc, .2, .18, .2, '#7a5a3a'); box(level, x + .1, roof + .3, zc, .22, .03, .22, '#9a7650'); for (const dx of [.02, .18]) box(level, x + dx, roof + .06, zc, .03, .1, .03, '#4a3520') }
        else {
          box(level, x - .12, roof + .2, zc, .03, .36, .03, '#4a4f5c'); box(level, x - .12, roof + .3, zc, .14, .03, .03, '#4a4f5c')
          if (dark) box(beacons, x - .12, roof + .4, zc, .05, .05, .05, '#ff5a4a', { glow: 1.4, castShadow: false })
        }
      }
    }
    if (flicker.length) tickers.push(t => flicker.forEach((g, i) => { g.visible = Math.floor((t + i * 2.3) / (2.5 + i * .9)) % 3 !== 0 }))
    // the hours still to come: empty lots behind a fence
    if (now != null && now < 23) {
      const fx0 = X0 + (now + 1) * LOT + .04, fx1 = X0 + W - .02
      box(level, (fx0 + fx1) / 2, fy + .025, lotFront - .9, fx1 - fx0, .03, 1.6, '#5e5246', { castShadow: false })
      for (let x = fx0; x <= fx1 + .01; x += LOT / 2) box(level, x, fy + .17, lotFront + .06, .04, .34, .04, FENCE)
      for (const y of [.12, .27]) box(level, (fx0 + fx1) / 2, fy + y, lotFront + .06, fx1 - fx0, .035, .03, FENCE)
    }
    // the busiest hour crowned, twinkling
    if (best >= 0) {
      const cy = lots[best].roof + .03 + (best === hop ? .36 : 0)
      pixelRows(level, CROWN, { g: kit.mat('#eec96f', .45), G: kit.mat('#c8963a', .3), j: '#6f91dc' }, lotX(best), cy, lotFront - .3, .055, .08)
      const tw = mover(level)
      box(tw, lotX(best) + .24, cy + .3, lotFront - .25, .03, .09, .02, kit.mat('#fff6c8', 1.2), { castShadow: false })
      box(tw, lotX(best) + .24, cy + .3, lotFront - .25, .09, .03, .02, kit.mat('#fff6c8', 1.2), { castShadow: false })
      tickers.push(t => { tw.visible = Math.floor(t * 2.5) % 5 === 3 })
    }
    // the hour now: scaffolding up its top floors, the mascot hopping on its roof, a crane on the next lot lifting a beam
    if (hop != null) {
      const x = lotX(hop), roof = lots[hop]?.roof ?? fy + .06
      if (hop === now && shown[now]) {
        const d = Math.min(.6, roof - fy)
        for (const dx of [-.29, .29]) box(level, x + dx, roof - d / 2 + .05, lotFront + .03, .035, d + .1, .035, SCAFFOLD)
        for (const dy of [-.18, -.42]) if (d > -dy) box(level, x, roof + dy, lotFront + .04, .62, .03, .035, SCAFFOLD)
      }
      const who = castOf((snapshot?.crew ?? []).filter(c => num(c.minutes) > 0).sort((a, b) => num(b.minutes) - num(a.minutes))[0]?.agent ?? 'claude')
      const mascot = figure(who, { legs: true, p: .03, depth: .12 })
      mascot.root.position.set(x, roof + .02, lotFront - .25)
      level.add(mascot.root)
      tickers.push(t => { mascot.root.position.y = roof + .02 + (Math.floor(t * 3) % 2) * .045; actors.animate(mascot, 'stand', t) })
    }
    if (now != null && now < 23) {
      const mx = lotX(now + 1) + .05, hx = lotX(now)
      const ct = fy + maxH + .4
      box(level, mx, (fy + ct) / 2, lotFront - .5, .09, ct - fy, .09, CRANE[0])
      for (let y = fy + .3; y < ct - .1; y += .3) box(level, mx, y, lotFront - .5, .15, .025, .15, CRANE[1])
      box(level, mx, fy + .05, lotFront - .5, .32, .1, .32, CRANE[1])
      box(level, (hx - .4 + mx + .55) / 2, ct, lotFront - .5, mx + .55 - (hx - .4), .05, .06, CRANE[0])
      box(level, mx + .42, ct - .07, lotFront - .5, .2, .12, .1, '#5d5446')
      box(level, mx - .12, ct - .1, lotFront - .5, .16, .14, .14, CRANE[1])
      if (dark) box(beacons, mx, ct + .06, lotFront - .5, .05, .05, .05, '#ff5a4a', { glow: 1.4, castShadow: false })
      const roof = lots[now]?.roof ?? fy
      const hook = Math.max(roof + .62, fy + .7)
      if (hook < ct - .2) {
        const lift = mover(level)
        box(lift, hx, (ct + hook) / 2, lotFront - .5, .015, ct - hook, .015, '#3a322b')
        box(lift, hx, hook - .02, lotFront - .5, .44, .04, .08, '#9aa1ac')
        box(lift, hx, hook - .055, lotFront - .5, .44, .03, .08, '#6b717c')
        tickers.push(t => { lift.position.y = [0, .03, .06, .06, .03, 0][Math.floor((t % 3.6) / .6)] })
      }
    }
    if (beacons.children.length) tickers.push(t => { beacons.visible = Math.floor(t / .6) % 3 !== 2 })
    // a car driving east, a taxi west, their headlights on when the light goes
    const head = kit.mat('#ffe7a0', hourLight === 'day' ? .2 : 1.2)
    for (const [rows, legend, z, speed, dir] of [
      [CAR, { r: '#d8473a', g: '#bfe0f5', k: '#2a2622', l: head }, 1.2, 1.1, 1],
      [TAXI, { y: '#f2c230', g: '#bfe0f5', s: '#fff3c4', k: '#2a2622', l: head }, 2.1, .8, -1],
    ]) {
      const car = mover(level)
      pixelRows(car, rows, legend, 0, 0, 0, .075, .34)
      car.position.set(0, fy + .04, z)
      const phase = rnd() * 17
      tickers.push(t => { const k = (phase + t * speed) % 17.2; const x = dir > 0 ? -8.6 + k : 8.6 - k; car.position.x = x; car.visible = Math.abs(x) < 7.72 })
    }
    // the hours on the curb, every three; under the pointer each hour tells its agent-time
    for (let h = 0; h < 24; h += 3) {
      const ink = m.nowH != null && h > m.nowH ? '#8a8070' : nightHour(h) ? '#8ea4d8' : '#e9dfc5'
      tag({ lines: [{ spans: [[`${hh(h)}:00`, ink, { bold: true }]], size: .19, align: 'center' }], width: .72, pad: .02 }, lotX(h), fy + .18, 3.12, level)
    }
    for (let h = 0; h < 24; h++) {
      const to = m.nowH != null && h > m.nowH
      const text = to ? `${hourSpan(h)} · still to come` : `${hourSpan(h)} · ${shown[h] ? `${fmtMinutes(shown[h])} agent-time${h === best ? ' · the busiest hour' : ''}` : 'nobody worked'}`
      collider(level, lotX(h), (fy + top) / 2, -.2, LOT, top - fy, 1.6, { text })
    }
    // the date on the band in the month's color, the sun and the moon either side of it
    if (title) {
      const size = .3
      const tw = labels.measure(title, size, { pixel: true })
      tag({ lines: [{ spans: [[title, '#fff8e8', { pixel: true }]], size, align: 'center' }], width: tw + .2, pad: .02 }, 0, base + CITY_BAND / 2 - .02, FRONT + .23, level)
      const orn = kit.mat('#ffe9c4', .5)
      pixelRows(level, ORN_SUN, { c: orn }, -tw / 2 - .38, base + CITY_BAND / 2 - .02 - .175, FRONT + .23, .05, .02, { castShadow: false })
      pixelRows(level, ORN_MOON, { c: orn }, tw / 2 + .38, base + CITY_BAND / 2 - .02 - .175, FRONT + .23, .05, .02, { castShadow: false })
    }
  }

  // ---------------------------------------------------------------- 2F: the TIMESHEETS
  function sheetRoom(level, base, L) {
    const top = base + L.height
    const fy = floorOf(level, base, BAND, '#1f1a16', { z0: .4 })
    const WZ = .25 // the wall's face; the clipboard, the paper, the cells and the bars stand out from it
    wallOf(level, fy, top, WZ)
    const BOARD_Z = WZ + .06, PAPER_Z = WZ + .125, GRID_Z = WZ + .15, CELL_Z = WZ + .17, BAR_Z = WZ + .26, TAB_Z = WZ + .175, INK_Z = WZ + .19
    const y = v => base + v
    const { X0, XR, NW, NX, HX, pitch, AX, RH } = L
    const x0 = X0 - .14, x1 = XR + .14 // the paper
    // the clipboard: the hardboard lit from the top left, the pages under the sheet, the paper, the steel clip on a nail
    const bx0 = x0 - .14, bx1 = x1 + .14, bb = y(L.boardBottom), bt = y(L.boardTop)
    box(level, (bx0 + bx1) / 2 + .05, (bb + bt) / 2 - .05, BOARD_Z - .03, bx1 - bx0, bt - bb, .08, '#0d150f')
    box(level, (bx0 + bx1) / 2, (bb + bt) / 2, BOARD_Z, bx1 - bx0, bt - bb, .1, BOARD.b)
    box(level, (bx0 + bx1) / 2, bt - .025, BOARD_Z + .005, bx1 - bx0, .05, .1, BOARD.h)
    box(level, bx0 + .025, (bb + bt) / 2, BOARD_Z + .005, .05, bt - bb, .1, BOARD.h)
    box(level, (bx0 + bx1) / 2, bb + .025, BOARD_Z + .005, bx1 - bx0, .05, .1, BOARD.d)
    box(level, bx1 - .025, (bb + bt) / 2, BOARD_Z + .005, .05, bt - bb, .1, BOARD.d)
    const pb = y(L.paperBottom), pt = y(L.paperTop)
    box(level, (x0 + x1) / 2 + .03, pb - .025, PAPER_Z - .005, x1 - x0 - .06, .05, .03, '#d9cfb8')
    box(level, (x0 + x1) / 2 + .05, pb - .05, PAPER_Z - .01, x1 - x0 - .1, .04, .03, '#b5a98f')
    box(level, (x0 + x1) / 2, (pb + pt) / 2, PAPER_Z, x1 - x0, pt - pb, .03, paper(PAPER))
    const clipW = 2.4
    box(level, 0, pt + .02, PAPER_Z + .06, clipW, .32, .12, STEEL.o)
    box(level, 0, pt + .04, PAPER_Z + .1, clipW - .1, .22, .06, STEEL.b)
    box(level, 0, pt + .13, PAPER_Z + .11, clipW - .1, .04, .06, STEEL.h)
    box(level, 0, pt - .06, PAPER_Z + .11, clipW - .1, .04, .06, STEEL.d)
    for (const dx of [-.95, .95]) box(level, dx, pt + .04, PAPER_Z + .14, .06, .06, .02, STEEL.d)
    kit.beam(level, -.32, pt + .18, 0, pt + .48, PAPER_Z + .02, .025, STEEL.h)
    kit.beam(level, .32, pt + .18, 0, pt + .48, PAPER_Z + .02, .025, STEEL.d)
    box(level, 0, pt + .5, WZ + .03, .08, .08, .06, '#8a8f96')
    // a lamp over the board, its light on the sheet
    box(level, 4.4, bt + .3, WZ + .5, 3.2, .08, .09, '#b38956')
    box(level, 4.4, bt + .25, WZ + .5, 3.0, .03, .07, ctx.building.bulbMaterial)
    for (const dx of [-1.2, 1.2]) box(level, 4.4 + dx, bt + .32, WZ + .25, .04, .04, .5, '#8a6b42')
    light(level, 0, top - .2, 2.5, 26, 13)
    // the room's name on the wall over the board
    header(level, -7.5, top - .42, WZ + .03, 'TIMESHEETS', ROLE.accent, m.present ? [['one line per project', K.groupText], ['since midnight', ROLE.dim]] : [['one line per project', K.groupText], ['midnight to midnight', ROLE.dim]])

    // the column heads, the hours in the sheet's inks (the night shift's blue, the hours to come faded)
    const future = h => m.nowH != null && h > m.nowH
    const cellOf = h => (h === m.nowH ? PAPER_NOW : future(h) ? LATER : nightHour(h) ? PAPER_NIGHT : PAPER)
    const hy = y((L.headBottom + L.headTop) / 2)
    tag({ lines: [{ spans: [['project', INK_HEAD]], size: .17 }], pad: .02, anchor: 'left' }, X0, hy, INK_Z, level)
    if (m.present) tag({ lines: [{ spans: [['at desks', INK_HEAD]], size: .17 }], pad: .02, anchor: 'left' }, NX, hy, INK_Z, level)
    tag({ lines: [{ spans: [['agent-time', INK_HEAD]], size: .17 }], pad: .02, anchor: 'right' }, AX, hy, INK_Z, level)
    tag({ lines: [{ spans: [['commits', INK_HEAD]], size: .17 }], pad: .02, anchor: 'right' }, XR, hy, INK_Z, level)
    // now, as a playhead: a red tag with the time over the hours (the hour labels under it give way)
    let nowBox = null, tagX = 0, tagW = 0
    const nowLbl = m.nowH != null ? m.hhmm || 'now' : ''
    if (nowLbl) {
      tagW = labels.measure(`  ${nowLbl}`, .19, { bold: true }) + .14
      // the tag stays over the hours: at 23:40 it would run into the agent-time head
      tagX = clamp(HX + (m.nowH + .5) * pitch, HX + tagW / 2, HX + 24 * pitch - tagW / 2 - .03)
      nowBox = [tagX - tagW / 2 - .04, tagX + tagW / 2 + .04]
    }
    for (let h = 0; h < 24; h += 2) {
      const cx = HX + (h + .5) * pitch
      if (nowBox && cx + .14 > nowBox[0] && cx - .14 < nowBox[1]) continue
      tag({ lines: [{ spans: [[hh(h), future(h) ? FADED : nightHour(h) ? INK_NIGHT : INK, { bold: true }]], size: .19, align: 'center' }], width: .44, pad: 0 }, cx, hy, INK_Z, level)
    }

    // the lines: the grid the cells stand on, each hour a cell of paper (tinted by night, blank still to come) with its
    // bar, a star on the line's best hour; the name tab, the desks open now, the agent-time and the commits
    const rowsBlock = [y(L.rowsBottom), y(L.rowsTop)], totalBlock = [y(L.totalBottom), y(L.totalTop)]
    for (const [b0, b1] of [rowsBlock, totalBlock]) box(level, HX + 12 * pitch, (b0 + b1) / 2, GRID_Z, 24 * pitch + .03, b1 - b0 + .03, .02, paper(GRID))
    const max = Math.max(1, ...m.shownRows.flatMap(r => r.ph))
    function line(r, yt, { ink, tab, label, count = false, scale }) {
      const yb = yt - RH, yc = yt - RH / 2
      // the paper's rule under the line, across the tab and the numbers
      box(level, (X0 + XR) / 2, yb, PAPER_Z + .016, XR - X0, .014, .005, paper(RULE))
      // its hours
      const best = r ? argmax(r.ph) : -1
      for (let h = 0; h < 24; h++) {
        const x = HX + (h + .5) * pitch
        box(level, x, yc, CELL_Z, pitch - .035, RH - .035, .02, paper(cellOf(h)), { castShadow: false })
        const v = r ? r.ph[h] : 0
        const share = barShare(v, scale)
        if (!share) continue
        const bh = (RH - .09) * share
        box(level, x, yb + .045 + bh / 2, BAR_Z, pitch - .1, bh, .16, kit.mat(ink, .22))
        box(level, x, yb + .045 + bh - .016, BAR_Z + .002, pitch - .096, .032, .164, kit.mat(capOf(ink), .15))
        if (h === best && !count) {
          const sy = bh + .29 <= RH - .09 ? yb + .045 + bh + .03 : yb + .045 + bh - .28
          pixelRows(level, STAR, { o: kit.mat('#c98a14', .3), s: kit.mat('#ffd85a', .55) }, x, sy, BAR_Z + .1, .052, .04, { castShadow: false })
        }
      }
      // the tab
      box(level, X0 + NW / 2, yc, TAB_Z, NW, RH - .07, .05, kit.mat(tab, .2))
      box(level, X0 + NW / 2, yb + .04, TAB_Z + .002, NW, .025, .055, darker(tab, .6))
      tag({ lines: [{ spans: [[label.text, K.plate, { bold: true }]], size: label.size }], width: NW, height: RH - .07, valign: 'middle', pad: .09, bg: tab, radius: .02, anchor: 'left' }, X0, yc + .005, TAB_Z + .03, level)
      return { yb, yc }
    }
    const nameFit = name => {
      for (const size of [.24, .22, .2, .18]) if (labels.measure(name, size, { bold: true }) <= NW - .22) return { text: name, size }
      return { text: name, size: .18 }
    }
    const tipOf = r => [r.name, `${fmtMinutes(r.am)} agent-time${m.present ? ' today' : ''}`, r.am > 0 && sum(r.ph) ? `busiest ${hourSpan(argmax(r.ph))}` : '', plural(r.commits, 'commit'),
      r.desks.length ? `${plural(r.desks.length, 'desk')} open now` : '', r.titles[0] ?? ''].filter(Boolean).join(' · ')
    m.shownRows.forEach((r, i) => {
      const yt = y(L.rowsTop) - i * RH
      const { yb, yc } = line(r, yt, { ink: r.color, tab: r.color, label: nameFit(r.name), scale: max })
      // who of the project is at a desk now: their heads, each over its state's color
      if (m.present && r.desks.length) {
        const k = r.desks.length > 2 ? 1 : r.desks.length
        r.desks.slice(0, k).forEach((d, j) => {
          const mini = actors.mini(castOf(d.agent), { p: .036, depth: .1 })
          const mx = NX + .22 + j * .46
          mini.position.set(mx, yb + .1, INK_Z)
          level.add(mini)
          box(level, mx, yb + .072, INK_Z, .36, .04, .05, CLASS_COLOR[d.kind] ?? ROLE.idle, { glow: .5, castShadow: false })
        })
        if (r.desks.length > k) tag({ lines: [{ spans: [[`+${r.desks.length - k}`, '#6e5f47', { bold: true }]], size: .19 }], pad: .02, anchor: 'left' }, NX + .22 + k * .46 - .18, yc, INK_Z, level)
      }
      tag({ lines: [{ spans: [[r.am ? fmtMinutes(r.am) : '·', r.am ? INK : FADED, { bold: true }]], size: .22 }], pad: .02, anchor: 'right' }, AX, yc, INK_Z, level)
      const ct = r.commits ? String(r.commits) : '·'
      tag({ lines: [{ spans: [[ct, r.commits ? INK_SHIP : FADED, { bold: true }]], size: .22 }], pad: .02, anchor: 'right' }, XR, yc, INK_Z, level)
      if (r.commits) pixelRows(level, PARCEL, { l: BOX[1], b: BOX[0], d: BOX[2] }, XR - labels.measure(ct, .22, { bold: true }) - .22, yc - .085, INK_Z, .057, .1)
      collider(level, X0 + NW / 2, yc, INK_Z, NW, RH, .4, { project: r.name, text: tipOf(r) })
      collider(level, (AX - 1 + XR) / 2, yc, INK_Z, XR - AX + 1, RH, .4, { project: r.name, text: tipOf(r) })
      for (let h = 0; h < 24; h++) {
        const text = future(h) ? `${r.name} · ${hh(h)}:00 · still to come` : `${r.name} · ${hh(h)}:00 · ${r.ph[h] ? fmtMinutes(r.ph[h]) : 'nobody'}${h === argmax(r.ph) && r.ph[h] ? ' · its best hour' : ''}`
        collider(level, HX + (h + .5) * pitch, yc, BAR_Z, pitch, RH, .4, { text })
      }
    })
    // an empty sheet still has its blank line, the message on a slip of paper over it
    if (!m.shownRows.length) {
      const yt = y(L.rowsTop), yc = yt - RH / 2
      for (let h = 0; h < 24; h++) box(level, HX + (h + .5) * pitch, yc, CELL_Z, pitch - .035, RH - .035, .02, paper(cellOf(h)), { castShadow: false })
      box(level, (X0 + XR) / 2, yt - RH, PAPER_Z + .016, XR - X0, .014, .005, paper(RULE))
      const msg = m.present ? 'no time cards yet: nobody has worked today' : 'no time cards: nobody worked that day'
      tag({ lines: [{ spans: [[msg, '#6b5d4a', { bold: true }]], size: .22, align: 'center' }], pad: .08, bg: PAPER, radius: .02 }, (X0 + XR) / 2, yc, BAR_Z + .2, level)
    }
    // the rule, then the line of all projects: its bars in the totals' green, the desks open now, the day's totals
    box(level, (X0 + XR) / 2, y(L.ruleY), PAPER_Z + .02, XR - X0, .03, .01, INK)
    const t = m.totals
    const all = { name: 'all projects', ph: m.shown, am: num(t.minutes) || m.total, commits: num(t.commits) }
    const { yc } = line(all, y(L.totalTop), { ink: TOTAL_INK, tab: ROLE.accent, label: { text: 'all projects', size: .22 }, count: true, scale: Math.max(1, ...m.shown) })
    if (m.present && m.desks.length) {
      const mini = actors.mini('claude', { p: .036, depth: .1 })
      mini.position.set(NX + .22, y(L.totalBottom) + .1, INK_Z)
      level.add(mini)
      tag({ lines: [{ spans: [[String(m.desks.length), '#5d4a2f', { bold: true }]], size: .22 }], pad: .02, anchor: 'left' }, NX + .48, yc, INK_Z, level)
    }
    tag({ lines: [{ spans: [[all.am ? fmtMinutes(all.am) : '·', all.am ? INK : FADED, { bold: true }]], size: .22 }], pad: .02, anchor: 'right' }, AX, yc, INK_Z, level)
    const ac = all.commits ? String(all.commits) : '·'
    tag({ lines: [{ spans: [[ac, all.commits ? INK_SHIP : FADED, { bold: true }]], size: .22 }], pad: .02, anchor: 'right' }, XR, yc, INK_Z, level)
    if (all.commits) pixelRows(level, PARCEL, { l: BOX[1], b: BOX[0], d: BOX[2] }, XR - labels.measure(ac, .22, { bold: true }) - .22, yc - .085, INK_Z, .057, .1)
    const allTip = `all projects · ${fmtMinutes(all.am)} agent-time · ${plural(all.commits, 'commit')}${m.present ? ` · ${plural(m.desks.length, 'desk')} open now` : ''}`
    collider(level, X0 + NW / 2, yc, INK_Z, NW, RH, .4, { text: allTip })
    collider(level, (AX - 1 + XR) / 2, yc, INK_Z, XR - AX + 1, RH, .4, { text: allTip })
    for (let h = 0; h < 24; h++) collider(level, HX + (h + .5) * pitch, yc, BAR_Z, pitch, RH, .4, { text: future(h) ? `all projects · ${hourSpan(h)} · still to come` : `all projects · ${hourSpan(h)} · ${m.shown[h] ? `${fmtMinutes(m.shown[h])} agent-time` : 'nobody'}` })
    // the grid's six-hour columns, darker, down both blocks
    for (const h of [6, 12, 18]) for (const [b0, b1] of [rowsBlock, totalBlock]) box(level, HX + h * pitch, (b0 + b1) / 2, CELL_Z, .03, b1 - b0 + .02, .025, paper(INK_HEAD), { castShadow: false })
    // the playhead down the lines, under its tag, a white dot blinking on the tag
    if (nowLbl) {
      const lx = HX + (m.nowH + m.mm / 60) * pitch
      const y0 = y(L.totalBottom) - .06, y1 = y(L.headBottom)
      box(level, lx, (y0 + y1) / 2, BAR_Z + .1, .035, y1 - y0, .03, kit.mat(MARKER, .7), { castShadow: false })
      box(level, lx, y0 - .02, BAR_Z + .1, .12, .04, .04, kit.mat(MARKER, .7), { castShadow: false })
      const c0 = HX + m.nowH * pitch, c1 = c0 + pitch, r0 = y(L.totalBottom) - .03, r1 = y(L.rowsTop) + .03
      for (const xx of [c0, c1]) box(level, xx, (r0 + r1) / 2, CELL_Z + .02, .03, r1 - r0, .03, kit.mat(MARKER, .45), { castShadow: false })
      for (const yy of [r0, r1]) box(level, (c0 + c1) / 2, yy, CELL_Z + .02, pitch + .03, .03, .03, kit.mat(MARKER, .45), { castShadow: false })
      tag({ lines: [{ spans: [[`  ${nowLbl}`, '#fff8e8', { bold: true }]], size: .19, align: 'center' }], width: tagW, height: .3, valign: 'middle', pad: .03, bg: MARKER, radius: .05 }, tagX, hy, INK_Z + .02, level)
      const dot = mover(level)
      box(dot, tagX - tagW / 2 + .13, hy, INK_Z + .04, .065, .065, .01, kit.mat('#fff8e8', .8), { castShadow: false })
      tickers.push(t => { dot.visible = (t % 1.6) < 1.07 })
    }
    // the pencil on its string, swinging at the board's side
    const pencil = mover(level)
    pencil.position.set(bx1 + .2, pt - .1, WZ + .1)
    box(pencil, 0, -.25, 0, .015, .5, .015, '#ece4d2')
    pixelRows(pencil, PENCIL, { e: '#e88a9a', f: '#c0c4cc', y: '#f6d35a', Y: '#d9a93a', w: '#e8c9a0', k: '#3a322b' }, 0, -1.2, 0, .05, .05)
    box(level, bx1 + .2, pt - .1, WZ + .05, .05, .05, .1, '#8a8f96')
    tickers.push(t => { pencil.rotation.z = Math.sin(t * 1.3) * .06 })

    // the band: the projects not on the sheet, else what its marks mean
    const bandY = base + BAND / 2 - .02
    if (m.more > 0) tag({ lines: [{ spans: dotted([[`+${plural(m.more, 'more project')} not on the sheet`, ROLE.dim], ...(m.moreMinutes ? [[`${fmtMinutes(m.moreMinutes)} agent-time`, ROLE.dim]] : [])]), size: .21, align: 'center' }], width: 15.4, pad: .06 }, 0, bandY, FRONT + .23, level)
    else {
      const items = [['night shift 20:00–07:00', ROLE.night], ['its best hour', ROLE.accent], ...(nowLbl ? [['the hour now', '#ff8a73']] : []), ...(m.present ? [['hours still to come', ROLE.dim]] : [])]
      const keys = items.map(([text, color]) => labels.label({ lines: [{ spans: [[text, color]], size: .19 }], pad: .02, anchor: 'left' }))
      const widths = keys.map(k => k.userData.size[0] + .42)
      let x = -sum(widths) / 2 - (items.length - 1) * .25
      keys.forEach((k, i) => {
        const sw = x + .14, ky = bandY
        if (i === 0) box(level, sw, ky, FRONT + .24, .22, .22, .02, paper(PAPER_NIGHT))
        else if (i === 1) pixelRows(level, STAR, { o: kit.mat('#c98a14', .3), s: kit.mat('#ffd85a', .55) }, sw, ky - .11, FRONT + .24, .045, .02, { castShadow: false })
        else if (items[i][0] === 'the hour now') box(level, sw, ky, FRONT + .24, .05, .26, .02, kit.mat(MARKER, .7))
        else box(level, sw, ky, FRONT + .24, .22, .22, .02, paper(LATER))
        k.position.set(x + .34, ky, FRONT + .23); level.add(k)
        x += widths[i] + .25
      })
    }
  }

  // ---------------------------------------------------------------- the storeys, bottom up
  const L = sheetLayout({ present: m.present, rows: m.shownRows.length })
  const addStorey = height => {
    const base = storeys.length ? storeys.at(-1).base + storeys.at(-1).height : LOBBY_TOP
    const level = new THREE.Group(); level.userData.y = base; group.add(level)
    storeys.push({ base, height, number: storeys.length + 2, group: level, floor: storeys.length })
    return { level, base }
  }
  const s2 = addStorey(L.height); sheetRoom(s2.level, s2.base, L)
  const s3 = addStorey(CITY_STOREY); cityRoom(s3.level, s3.base)
  const s4 = addStorey(CLOCK_STOREY)
  const face = clockRoom(s4.level, s4.base)
  if (face) tickers.push(t => actors.animate(face, 'stand', t))
  flush()

  function update(t) {
    if (kit.night !== lit) {
      lit = kit.night
      for (const mat of papers.values()) mat.emissiveIntensity = lit ? PAPER_GLOW.night : PAPER_GLOW.day
    }
    for (const tick of tickers) tick(t)
    return true
  }
  return {
    storeys, group, pickables, anchors: new Map(), rooms: [], sign: todaySignLines(snapshot), status: null, update, animated: true,
    dispose() { for (const mat of owned) mat.dispose() },
  }
}

/** A pixel disc of radius r as rows (a glow behind the sun or the moon). */
function discRows(r) {
  const n = 2 * r + 1
  return Array.from({ length: n }, (_, j) => Array.from({ length: n }, (_, i) => ((i - r) ** 2 + (j - r) ** 2 <= r * r + r * .6 ? 'c' : '.')).join(''))
}
