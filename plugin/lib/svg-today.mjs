// PURE: the TODAY scene of the SVG office: the day as a timesheet. Upstairs the TIME CLOCK room, read left to right as
// a clocking-in goes: the clock-in racks (a card per desk clocked in now; on a page of the past, a card per session of
// that day), the punch clock showing the facts' local time while a Clawd punches a card, the employee of the day (the
// busiest project's character framed, its name on a plate of its color, crowned) and the day's tear-off calendar; on a
// narrow wall the racks give way first. On its floor one line: the busiest hour, its agent-time, the night shift's.
// Below, the TIMESHEETS room: the day's timesheet on a clipboard, of the month calendar's stationery. On top of the
// sheet the day's picture, the city now under the sky of the hour (the sun or the moon where it stands, clouds drifting
// by, birds or a shooting star, traffic on the street): along its street, midnight to midnight, a building for every
// hour worked, as tall as that hour's agent-time and lit by the hour now (the busiest crowned, the hour now under
// construction with the office's mascot on its roof and a crane on the next lot, a tree where nobody worked). Under it
// the date on a band in the month's color, then one line per project active that day: its name whole (a size up on one
// line, else on two), its hours as bars in its color standing in their 24 cells, each topped with a dark edge so a
// light color still shows on the paper (facts per_hour), the six-hour columns darker, a gold star on its best hour,
// the day's agent-time, its commits by a parcel, and today a tiny figure for each of its desks open right now; the hour
// now a thin red playhead under a tag with the time. A page of the past is drawn as that day: its own date, its time
// cards, no time on the clock and no desks. Given week or month facts the same sheet shows the hours summed over the
// range. No node:* imports (the desktop mod loads lib/svg.mjs, which imports this file).
import { clip, fmtInt, fmtMinutes } from './format.mjs'
import { dayInfo, isPastRange, rangeWord, seeded } from './model.mjs'
import {
  CAST, CLASS_COLOR, HEAD, K, MOON, ROLE, ROW, SKY, SLAB, THEME, aO, aT, castPicker, ceilingLight, clamp, clawd,
  dateLabel, defineSprites, esc, fit, fitGroups, fitInfo, fitMid, footing, hitArea, lineSpans, mapRects, miniLegend, mix, num0 as num, paint, pixClock,
  pixRuns, plural, pose, r1, roomHeader, sceneHeader, spans, sprite, stripOf, textW, txt, use,
} from './svg-kit.mjs'

// ---------------------------------------------------------------- palette

const LED = '#ff9d5c' // the lobby clock's amber digits
const BOX = ['#9fc06a', '#cfe6a0', '#6f8a45'] // a shipped parcel (one commit), the ROLE.ship family
const MACHINE = { body: '#b9ad94', hi: '#d3c9b1', sh: '#8f846d', foot: '#5d5446', bezel: '#14100c', brass: '#c9a26b', print: '#8f6d43' }
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

// The timesheet is of the month calendar's stationery (svg-month.mjs): its paper, grid and inks, the night shift's
// hours tinted as a printed calendar tints its weekends, the hours still to come blank as the days outside a month, and
// the busiest green of its squares for the day's totals; the red marker around the hour now is its own.
const PAPER = '#f8f3e7'
const PAPER_NIGHT = mix(PAPER, '#6f91dc', 0.13)
const LATER = '#d8cdb6'
const GRID = '#a3957b'
const RULE = '#e4dac5' // the ruled line between the lines, across the tabs and the numbers
const INK = '#3a2a20'
const INK_NIGHT = '#3a63b0' // the night shift's hours, blue as a printed calendar's Saturdays
const INK_HEAD = '#6e5f48'
const INK_SHIP = '#3d6e12' // commits: ROLE.ship's ink on paper
const FADED = '#857760'
const CLOCK_SLAB = 13 // the TIME CLOCK's floor, under its one line
const CAP = (c) => mix(c, '#2b2118', 0.5) // a bar's dark top edge: a light project's bars read on the paper
const MARKER = '#e2392d'
const TOTAL_INK = '#57a333' // the totals line's bars
// the clipboard's hardboard and its steel clip: outline, body, light, shade
const BOARD = { o: '#3d2614', b: '#8b5a32', h: '#a9784b', d: '#64401f' }
const STEEL = { o: '#3b3f46', b: '#9aa1ac', h: '#e2e6ec', d: '#6b717c' }
// the band under the day's picture in the month calendar's own color for the month (svg-month.mjs MONTH_BAND),
// January first, so the day's sheet and the month's page are of one set
const MONTH_BAND = ['#3c68ae', '#ad4570', '#3b8656', '#4b945c', '#a94f86', '#c4861f', '#2a80ba', '#cc6a2c', '#ad6c33', '#c0512a', '#894530', '#a52f39']
const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']

// The day's picture shows the sky now: its hour's, top to horizon in five bands, mixed toward the next hour's by the
// minutes. The night with the city's glow on the horizon, the blue before dawn, dawn's pinks, sunrise, the morning,
// noon's deep blue, the afternoon, the golden hour, sunset, dusk.
const SKIES = THEME.today.skies
const SKY_OF = ['night', 'night', 'night', 'night', 'night', 'predawn', 'dawn', 'rise', 'morning', 'morning', 'morning', 'noon', 'noon',
  'noon', 'noon', 'afternoon', 'afternoon', 'afternoon', 'gold', 'set', 'dusk', 'night', 'night', 'night']
// the buildings of the hours worked, each its own facade, lit by the hour: bright by day with glass windows, warm at
// sunrise and from the golden hour on, dark by night (both with their windows lit, two in six off)
const { facades: FACADES, lit: LIT, glass: GLASS } = THEME.skyline
const CRANE = ['#f2c230', '#b08a1c'] // the crane on the next lot, its cab
const SCAFFOLD = '#c9a26b'
const FENCE = '#c4ab78'
const STARS = THEME.today.stars // the picture's own stars: the roof's sky keeps K.star
// the clouds by the light: white by day, peach at sunrise and the golden hour, rose at dawn and sunset, dark by night
const CLOUDS = THEME.today.clouds
// the trees where nobody worked in the season's foliage (light, mid, shade): the month calendar's small trees
const SEASON_OF = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter']
const FOLIAGE = {
  winter: ['#ffffff', '#2f6e4c', '#1f4d36'], spring: ['#fde4ef', '#f6b3d0', '#de86ae'], summer: ['#a3db6c', '#6cbd45', '#469634'],
  autumn: ['#f8c45a', '#ee8d36', '#c75a2b'],
}

// ---------------------------------------------------------------- sprites

// The crown on the busiest hour's roof (7 × 5) and the gold star stuck on a top hour (5 × 5): the month calendar's
// stickers (svg-month.mjs), the star outlined so it shows on paper and on color.
const CROWN = ['g..g..g', 'gg.g.gg', 'ggggggg', 'gGgjgGg', 'GGGGGGG']
const STAR = ['..o..', '.oso.', 'ossso', '.oso.', '.o.o.']
// The ornaments either side of the date (7 × 7, currentColor): the sun and the moon.
const ORN_SUN = ['...c...', '.c...c.', '..ccc..', 'c.ccc.c', '..ccc..', '.c...c.', '...c...']
const ORN_MOON = ['..cccc.', '.ccc...', 'ccc....', 'ccc....', 'ccc....', '.ccc...', '..cccc.']
// A tree where nobody worked (5 × 6), lit from the top left; a cloud (13 × 5, currentColor, its underside in shade); a
// car heading east and a taxi heading west (9 × 4 and 9 × 5), their headlights in front.
const TREE = ['.LLM.', 'LLMMD', 'LMMMD', '.MDD.', '..T..', '..T..']
const PUFF = ['....ccc......', '..ccccccc.cc.', '.cccccccccccc', 'ccccccccccccc', '.sssssssssss.']
const CAR = ['..rggr...', '.rrrrrrr.', 'rrrrrrrrl', '.kk...kk.']
const TAXI = ['....s....', '...yggy..', '.yyyyyyy.', 'lyyyyyyyy', '.kk...kk.']
// The far city in the haze behind the hours (64 × 12, seamless): blocks of towers and a mast, some windows (w) to light
// by night.
const FAR = (() => {
  const rows = Array.from({ length: 12 }, () => Array(64).fill('.'))
  let x = 0
  for (const [bw, bh] of [[5, 6], [7, 9], [4, 5], [6, 11], [8, 7], [5, 10], [3, 4], [6, 8], [7, 6], [5, 9], [8, 7]]) {
    for (let i = 0; i < bw; i++) {
      for (let r = 12 - bh; r < 12; r++) rows[r][x + i] = i % 2 && i < bw - 1 && (12 - r) % 3 === 0 && (i + r + x) % 5 < 2 ? 'w' : 'S'
    }
    x += bw
  }
  rows[0][18] = 'S'
  return rows.map((r) => r.join(''))
})()
// A pixel disc of radius r around (cx, cy), as rects (a glow, a halo): its rows of one width merged, the middle ones
// in one rect across the center, the others mirrored top and bottom.
function disc(cx, cy, r, fill) {
  const halves = Array.from({ length: Math.ceil(r) }, (_, i) => Math.round(Math.sqrt(r * r - (i + 0.5) ** 2)))
  const out = []
  for (let i = 0; i < halves.length;) {
    let j = i
    while (j + 1 < halves.length && halves[j + 1] === halves[i]) j++
    const [x0, w, n] = [Math.round(cx - halves[i]), 2 * halves[i], j - i + 1]
    if (!i) out.push([x0, Math.round(cy - n), w, 2 * n, fill])
    else out.push([x0, Math.round(cy - j - 1), w, n, fill], [x0, Math.round(cy + i), w, n, fill])
    i = j + 1
  }
  return out
}
// The trees in the season of the facts' day (northern), in the dark by night.
const foliage = (f, night) => {
  const dim = (c) => (night ? mix(c, '#10183a', 0.6) : c)
  const [L, M, D] = FOLIAGE[SEASON_OF[monthIndex(f.now?.local_date)]]
  return { L: dim(L), M: dim(M), D: dim(D), T: dim('#6b4226') }
}

defineSprites({
  // A Clawd at the punch clock (25 × 15 box, standing, eyes on the machine, pointing arm out): a time card in the left
  // hand, its top in the project's color (currentColor). Every 2.4 s it steps in and pushes the card into the slot.
  'td-punch': (c) => {
    const card = paint([[-7, 2, 5, 8, '#f4efe4'], [-7, 2, 5, 2, 'cur'], [-6, 5, 3, 1, '#b5a888'], [-6, 7, 3, 1, '#b5a888']])
    return `<g>${card}${clawd(c, { look: [-2, 0], arms: ['point', 'out'], legs: true, blinkAt: -1.4 })}${aT(c, '0 0;0 0;-4 0', 2.4)}</g>`
  },
  // a card in the clock-in rack, 10 × 4, its top in the project's color
  'td-card': () => paint([[0, 0, 10, 4, '#efe6cf'], [0, 0, 10, 1, 'cur'], [2, 2, 5, 1, '#b5a888']]),
  // the clock-in rack, 16 × 30: six slots
  'td-rack': () => paint([[0, 0, 16, 30, '#5d4630'], [0, 0, 16, 1, '#7a5a3a'], [0, 0, 1, 30, '#7a5a3a'], [15, 0, 1, 30, '#4a3520'],
    ...Array.from({ length: 6 }, (_, i) => [1, 6 + i * 4, 14, 1, '#9a7b4f'])]),
  // a shipped parcel (4 × 3) by a line's commits
  'td-parcel': () => paint([[0, 0, 4, 3, BOX[0]], [0, 0, 4, 1, BOX[1]], [1, 1, 2, 1, BOX[2]]]),
  // the day's picture: its own sun and moon in their glow (9 × 9; the sky over the roof keeps the header's), a cloud, a
  // bird flapping (3 × 2), the far city by day and by night, the trees by day and by night, the traffic
  'td-sun': () => paint([...disc(4.5, 4.5, 6, '#fff3c4/.22'), [2, 1, 5, 7, '#ffe27a'], [1, 2, 7, 5, '#ffe27a'], [3, 2, 2, 1, '#fff8dc']]),
  'td-moon': () => paint(disc(4.5, 4.5, 7, '#f3ead0/.07')) + sprite(MOON, { m: '#f3ead0', M: '#d9cfae' }),
  'td-cloud': () => sprite(PUFF, { c: 'cur', s: ['cur', '#000/.12'] }),
  'td-bird': (c) => `<g>${paint([[0, 0, 1, 1, 'cur'], [2, 0, 1, 1, 'cur'], [1, 1, 1, 1, 'cur']])}${aO(c, '1;0', 0.5)}</g>` +
    `<g opacity="0">${paint([[0, 1, 3, 1, 'cur']])}${aO(c, '0;1', 0.5)}</g>`,
  'td-far': () => sprite(FAR.map((r) => r.replaceAll('w', 'S')), { S: 'cur' }),
  'td-far-n': () => sprite(FAR.map((r) => r.replaceAll('w', 'S')), { S: 'cur' }) + sprite(FAR.map((r) => r.replace(/S/g, '.')), { w: `${LIT}/.7` }),
  'td-tree': (c) => sprite(TREE, foliage(c.f, false)),
  'td-tree-n': (c) => sprite(TREE.map((r) => r.replace(/[LM]/g, 'D')), foliage(c.f, true)),
  'td-car': () => sprite(CAR, { r: '#d8473a', g: '#bfe0f5', k: '#2a2622', l: '#ffe7a0' }),
  'td-taxi': () => sprite(TAXI, { y: '#f2c230', g: '#bfe0f5', s: '#fff3c4', k: '#2a2622', l: '#ffe7a0' }),
  // the stickers, a 4-point twinkle (3 × 3) for the crown, the ornaments of the date
  'td-crown': () => sprite(CROWN, { g: '#eec96f', G: '#c8963a', j: '#6f91dc' }),
  'td-star': () => sprite(STAR, { o: '#c98a14', s: '#ffd85a' }),
  'td-twinkle': () => paint([[1, 0, 1, 3, '#fff6c8'], [0, 1, 3, 1, '#fff6c8']]),
  'td-orn-sun': () => sprite(ORN_SUN, { c: 'cur' }),
  'td-orn-moon': () => sprite(ORN_MOON, { c: 'cur' }),
  // the pencil on a string at the clipboard's side (2 × 14): eraser, ferrule, yellow body, sharpened tip
  'td-pencil': () => paint([[0, 0, 2, 2, '#e88a9a'], [0, 2, 2, 1, '#c0c4cc'], [0, 3, 1, 8, '#f6d35a'], [1, 3, 1, 8, '#d9a93a'],
    [0, 11, 2, 1, '#e8c9a0'], [0, 12, 1, 1, '#e8c9a0'], [0, 13, 1, 1, '#3a322b']]),
})

// ---------------------------------------------------------------- facts

const hours24 = (v) => Array.from({ length: 24 }, (_, h) => num(Array.isArray(v) ? v[h] : 0))
const hh = (h) => String(h).padStart(2, '0')
const span = (h) => `${hh(h)}:00–${hh((h + 1) % 24)}:00`
// An hour's agent-time in four steps on a square-root scale (the busiest hour on the sheet the top step, a quiet one
// still shows), 0 for none: steps, as the month calendar's squares, so a top hour earns its gold star.
const STEPS = 4
const level = (m, max) => (m > 0 && max > 0 ? clamp(Math.ceil(Math.sqrt(m / max) * STEPS), 1, STEPS) : 0)
const argmax = (a) => a.reduce((b, v, i) => (v > a[b] ? i : b), 0)
/** The night shift's hours (20:00–07:00): dark in the office's sky, tinted on the sheet. */
const nightHour = (h) => h >= 20 || h < 7
/** 'YYYY-MM-DD' → its month, 0…11 (April when there is no such day, as the month calendar's page). */
function monthIndex(ymd) {
  const m = /^\d{4}-(\d{2})-\d{2}$/.exec(String(ymd ?? ''))
  return m ? clamp(Number(m[1]) - 1, 0, 11) : 3
}

// The clock of the drawing: the hour now (null when the range is not today, or the facts have no hour), its minutes
// (where the now line crosses the hour) and HH:MM. A live clock (svg-kit clockFor) runs by itself: the now line then
// sits mid-hour and moves on the hour, so the drawing holds while its clocks tick.
function clockOf(ctx, daily) {
  const { f } = ctx
  const h = Number(f.now?.hour)
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(f.now?.local_time ?? ''))
  const live = Boolean(ctx.clock?.live)
  const nowH = daily && Number.isInteger(h) && h >= 0 && h < 24 ? h : null
  return { nowH, live, mm: live ? 30 : m ? clamp(Number(m[2]), 0, 59) : 0, hhmm: m ? `${hh(Number(m[1]))}:${m[2]}` : '' }
}

// One card per project active in the range (agent-time, commits, a session even with no agent-time left, or a desk open
// now), busiest first. A page of the past (`present` false) has no desks open now: they are today's.
function cardsOf(ctx, present = true) {
  const live = new Map()
  for (const d of present ? ctx.desks : []) {
    const k = String(d.project ?? '')
    if (!live.has(k)) live.set(k, [])
    live.get(k).push(d)
  }
  return ctx.f.projects.map((p) => {
    const name = String(p.name ?? '?')
    const ph = hours24(p.per_hour)
    return { p, name, ph, am: num(p.agent_minutes) || ph.reduce((a, b) => a + b, 0), commits: num(p.commits), desks: stripOf(live.get(name) ?? []) }
  }).filter((r) => r.am > 0 || r.commits > 0 || num(r.p.sessions) > 0 || r.desks.length)
    .sort((a, b) => b.am - a.am || b.commits - a.commits || a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------- the TIME CLOCK room

// The punch clock (27 × 33, floor-standing): the time in amber digits, a brass plate, the card slot on its right side.
// `slot` is drawn over the Clawd, so the card it pushes in disappears into the machine. On a page of the past (`present`
// false) its time does not run.
function punchClock(ctx, x, floor, hhmm, present = true) {
  const M = MACHINE
  const y = floor - 33
  const live = present && Boolean(ctx.clock?.live)
  const digits = /^\d\d:\d\d$/.test(hhmm) ? hhmm : '--:--'
  const body = [[x + 1, y - 2, 25, 2, M.sh], [x, y, 27, 29, M.body], [x, y, 1, 29, M.hi], [x + 26, y, 1, 29, M.sh], [x, y + 28, 27, 1, M.sh],
    [x + 2, y + 29, 3, 4, M.foot], [x + 22, y + 29, 3, 4, M.foot], [x + 2, y + 2, 23, 11, M.bezel], [x + 2, y + 13, 23, 1, '#000/.3'],
    [x + 7, y + 17, 13, 6, M.brass], [x + 8, y + 19, 11, 1, M.print], [x + 8, y + 21, 7, 1, M.print]]
  // a live clock's digits run by themselves (svg-kit pixClock), each on a path of its own
  const led = live ? [] : [...pixRuns(digits.slice(0, 2), x + 4, y + 5, LED), ...pixRuns(digits.slice(3), x + 16, y + 5, LED)]
  const colon = `<g>${paint(pixRuns(':', x + 12, y + 5, LED))}${aO(ctx, '1;0', 2)}</g>`
  // the "ka-chunk": the display flares and sparks jump off the slot as the card goes in
  const flash = ctx.animate
    ? `<g opacity="0">${paint([[x + 2, y + 2, 23, 11, '#ffd9a8/.2'], [x + 28, y + 15, 1, 1, ROLE.accent], [x + 30, y + 14, 1, 1, ROLE.accent],
      [x + 29, y + 12, 1, 1, ROLE.accent], [x + 31, y + 17, 1, 1, ROLE.accent]])}${aO(ctx, '0;0;1', 2.4)}</g>`
    : ''
  return {
    body: paint([...body, ...led]) + (live ? pixClock(ctx, [x + 4, x + 8, x + 16, x + 20], y + 5, LED) : '') + colon,
    slot: paint([[x + 22, y + 18, 5, 10, M.body], [x + 26, y + 18, 1, 10, M.sh], [x + 24, y + 19, 1, 8, M.bezel]]),
    flash,
  }
}

// The day's digits in the 3 × 5 pixel font at twice its size (6 × 10, an 8-px advance).
const bigDigits = (str, x, y, fill) => pixRuns(str, 0, 0, fill).map(([rx, ry, w, h, c]) => [x + rx * 2, y + ry * 2, w * 2, h * 2, c])
// A tear-off wall calendar, CAL_W × 24: the month on a blue band in bold, the day in big pixel digits; the sheet's day
// (a page of the past says its own).
const CAL_W = 22
function calendar(ymd, x, y) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(ymd ?? ''))
  if (!m) return ''
  const day = String(Number(m[2]))
  const { wdi } = dayInfo(ymd)
  const dx = x + Math.floor((CAL_W - (day.length * 8 - 2)) / 2)
  const tip = `${WEEKDAYS[wdi] ?? ''} ${Number(m[2])} ${MONTH_NAMES[Number(m[1]) - 1] ?? ''}`.trim().toLowerCase()
  return `<g><title>${esc(tip)}</title>${paint([[x + 1, y + 1, CAL_W, 24, '#000/.3'], [x, y, CAL_W, 24, '#f4efe4'], [x, y, CAL_W, 7, '#6f91dc'],
    [x, y + 23, CAL_W, 1, '#c9bfa8'], [x + 4, y - 1, 1, 2, '#5d5446'], [x + CAL_W - 5, y - 1, 1, 2, '#5d5446'], ...bigDigits(day, dx, y + 10, '#3a322b')])}` +
    `<g font-weight="bold">${txt(x + CAL_W / 2, y + 5.6, MONTHS[Number(m[1]) - 1] ?? '', 4.5, '#f4efe4', ' text-anchor="middle"')}</g></g>`
}

function timeClockRoom(ctx, g, top, clock, shown, star, word, present, ymd) {
  const { night, f } = ctx
  // a page of the past (`present` false): the day is over and nobody is at the clock (the desks open now are today's)
  const desks = present ? ctx.desks : []
  const { IX0, IX1, IW } = g
  const floor = top + HEAD + ROW
  const first = shown.findIndex((v) => v > 0)
  const last = shown.findLastIndex((v) => v > 0)
  const groups = !present
    ? (first >= 0 ? [[`first in ${hh(first)}:00`, K.groupText], [`last out ${hh(last + 1)}:00`, K.groupText]] : [['nobody clocked in', ROLE.dim]])
    : [
      desks.length ? [`${desks.length} clocked in now`, ROLE.busy] : [night ? 'everyone clocked out' : 'nobody clocked in yet', ROLE.dim],
      clock.nowH != null && first >= 0 && [`first in ${hh(first)}:00`, K.groupText],
    ].filter(Boolean)
  let back = roomHeader(ctx, { name: 'TIME CLOCK', color: ROLE.day }, IX0, top, IW, groups, stripOf(desks))
  back += paint([[IX0, floor - 14, IW, 14, K.wallLow]])
  let fore = ''
  // the right end: a plant, the tear-off calendar
  let rx = IX1 - 4
  if (IW >= 200) {
    fore += use(ctx, 'plant', rx - 10, floor - 12)
    rx -= 16
  }
  fore += calendar(ymd, rx - CAL_W, floor - 30)
  rx -= CAL_W + 8
  // the left: the clock-in racks (a card per desk open now; a page of the past, a card per session of that day), then
  // the punch clock and a Clawd punching in. The racks give way first, so the employee of the day keeps its plate.
  const cards = present ? desks.map((d) => d.project) : f.projects.flatMap((p) => Array.from({ length: Math.min(12, num(p.sessions)) }, () => p.name))
  const who = desks[0]
  const clockW = who ? 62 : 36
  const nameW = clamp(rx - IX0 - 6 - clockW - 8 - 23 - 14 - 4, 30, EMP_NAME_W)
  const empW = star ? employeeW(star, word, nameW) : 0
  let racks = cards.length ? clamp(Math.ceil(cards.length / 6), 1, 3) : 1
  while (racks > 0 && IX0 + 6 + racks * 19 + 4 + clockW + 8 + empW > rx) racks--
  let x = IX0 + 6
  const byProject = new Map()
  for (const p of cards) byProject.set(p, (byProject.get(p) ?? 0) + 1)
  const rackTip = cards.length
    ? `${plural(cards.length, present ? 'desk' : 'time card')} ${present ? 'clocked in now' : rangeWord(f)}: ${[...byProject].slice(0, 8).map(([p, n]) => `${clip(p, 30)} ×${n}`).join(', ')}`
    : 'the clock-in rack is empty'
  let rk = ''
  for (let r = 0; r < racks; r++) {
    rk += use(ctx, 'td-rack', x, floor - 33)
    cards.slice(r * 6, r * 6 + 6).forEach((p, i) => { rk += use(ctx, 'td-card', x + 3, floor - 31 + i * 4, ` color="${ctx.color(p)}"`) })
    x += 19
  }
  if (racks) {
    fore += `<g><title>${esc(rackTip)}</title>${rk}</g>`
    x += 4
  }
  const pc = punchClock(ctx, x, floor, present ? clock.hhmm : '--:--', present)
  // a tooltip cannot tick: a live clock's time stays on its face
  const tip = `punch clock${clock.live && present ? '' : ` ${present ? clock.hhmm || '--:--' : '--:--'}`}${who ? ` · ${clip(who.project, 40)} clocking in` : ''}`
  let machine = pc.body
  if (who) machine += use(ctx, 'td-punch', x + 34, floor - 15, ` color="${ctx.color(who.project)}"`) + pc.slot + pc.flash
  else machine += pc.slot + paint([[x + 27, floor - 13, 5, 8, '#f4efe4'], [x + 27, floor - 13, 5, 2, ROLE.dim]])
  fore += `<g><title>${esc(tip)}</title>${machine}</g>`
  x += clockW
  // the employee of the day in the middle of the wall left between the clock and the calendar
  if (star && rx - x >= empW + 4) fore += employeePlate(ctx, Math.round((x + rx - empW) / 2), floor, star, word, nameW)
  // the slab's one line: the busiest hour and its agent-time, then the night shift's
  const total = shown.reduce((a, b) => a + b, 0)
  const best = argmax(shown)
  const nightMin = shown.reduce((a, v, h) => a + (h < 7 || h >= 20 ? v : 0), 0)
  const labels = total > 0
    ? spans(IX0 + 3, floor + 9, 5.5, fitGroups([[`busiest hour ${span(best)}`, ROLE.accent], [`${fmtMinutes(shown[best])} agent-time`, ROLE.title],
      ...(nightMin > 0 ? [[`${fmtMinutes(nightMin)} on the night shift`, ROLE.night]] : [])], IW - 6, 5.5))
    : txt(IX0 + 3, floor + 9, fit(clock.nowH != null ? 'no agent-time yet today' : f.range?.kind === 'today' ? 'no agent-time that day' : 'no agent-time in this range', IW - 6, 5.5), 5.5, ROLE.dim)
  return { back, fore, labels, floor }
}

// The employee of the day's plate: the project's busiest agent framed under a star (a Clawd, or its own character),
// and beside it the caption over the project's name on a plate of its color, a crown at the plate's end; the name is
// clipped in its middle past nameW (EMP_NAME_W at most). employeeW is its width, so the wall can make room for it.
const EMP_NAME_W = 90
const employeeW = (r, word, nameW) => 23 + Math.max(Math.round(textW(fitMid(r.name, nameW, 6.5), 6.5) + 14), Math.round(textW(`EMPLOYEE ${word.toUpperCase()}`, 4.5)))
function employeePlate(ctx, x, floor, r, word, nameW) {
  const col = ctx.color(r.name)
  const who = castPicker({ totals: { agents: r.p?.agents } })(0)
  const cap = `EMPLOYEE ${word.toUpperCase()}`
  const name = fitMid(r.name, nameW, 6.5)
  const pw = Math.round(textW(name, 6.5) + 14)
  const y = floor - 27
  const px = x + 23
  const py = y + 7
  const star = mapRects(['..#..', '.###.', '#####', '.###.', '.#.#.'], { '#': ROLE.accent }, x + 7, y - 6)
  const rects = [[x, y, 19, 14, '#c9a26b'], [x, y, 19, 1, '#e8cf94'], [x, y + 13, 19, 1, '#8f6d43'], [x + 2, y + 2, 15, 10, mix(K.wall, col, 0.4)],
    ...mapRects(CAST[who].mini, miniLegend(who), x + 4, y + 6), ...star,
    [px + 1, py, pw - 2, 12, col], [px, py + 1, pw, 10, col], [px + 1, py, pw - 2, 1, '#fff/.3'], [px + 1, py + 12, pw - 1, 1, '#000/.35']]
  const tip = `employee ${word}: ${clip(r.name, 50)}${who === 'claude' ? '' : ` (${CAST[who].who})`} · ${fmtMinutes(r.am)} agent-time`
  return `<g><title>${esc(tip)}</title>${paint(rects)}${txt(px, y + 3.6, cap, 4.5, ROLE.dim)}` +
    `<g font-weight="bold">${txt(px + 3, py + 8.6, name, 6.5, K.plate)}</g>${use(ctx, 'td-crown', px + pw - 9, py + 3)}</g>`
}

// ---------------------------------------------------------------- the TIMESHEETS room

// The sheet's plan from the room's width: the clipboard 7 px in from the walls (the pencil hangs in the right margin),
// the paper 3 px inside the board, its columns 3 px inside the paper: name tab | desks now (none on a page of the past,
// `live` false) | 24 hour cells | agent-time | commits, the cells as wide as the wall allows once a narrow wall's names
// have 46. A wall wider than the sheet needs leaves it in the middle.
function sheetGeometry(IX0, IW, live = true) {
  const avail = IW - 26
  const k = avail >= 300 ? 4 : avail >= 240 ? 3 : 2
  const NOWW = live ? k * 8 + 2 : 0
  const AW = avail >= 250 ? 26 : 22
  const CMW = avail >= 240 ? 22 : 20
  const G = 3
  let NW = clamp(Math.round(avail * 0.17), avail < 240 ? 46 : 32, 90)
  // hour cells shrink to 1 px (and a 1-px gap) on the narrowest wall before the names give way
  const pitch = clamp(Math.floor((avail - NW - NOWW - AW - CMW - 3 * G - 3) / 24), avail < 200 ? 2 : 3, 30)
  const cellsW = 24 * pitch + 1
  const used = () => NW + G + NOWW + cellsW + 2 + G + AW + G + CMW
  // the leftover widens the name tab (up to 120); at the narrowest the tab gives way so the sheet never overflows
  NW = clamp(NW + avail - used(), 20, Math.max(NW, 120))
  const X0 = IX0 + 13 + Math.max(0, Math.floor((avail - used()) / 2))
  const NX = X0 + NW + G
  const HX = NX + NOWW
  const AX = HX + cellsW + 2 + G + AW
  const CX = AX + G
  return {
    k, NOWW, AW, CMW, NW, pitch, X0, NX, HX, AX, CX, RH: pitch >= 8 ? 17 : 15, PX: X0 - 3, PW: CX + CMW + 6 - X0,
  }
}

// Push runs of equal fills (null = nothing) as one rect each, cells `pitch` apart with a `gap` between them.
function runs(rects, fills, x0, pitch, y, h, gap = 1) {
  for (let a = 0; a < fills.length;) {
    let b = a
    while (b + 1 < fills.length && fills[b + 1] === fills[a]) b++
    if (fills[a]) rects.push([x0 + a * pitch, y, (b - a + 1) * pitch - gap, h, fills[a]])
    a = b + 1
  }
}

/**
 * The clipboard the sheet is clipped to, the paper at (x, y), w × h: the hardboard 3 px past the paper (4 under it),
 * its corners cut, lit from the top left, its shade on the wall; the pages under the sheet along its bottom; the steel
 * clip over the paper's top edge, hung by a wire from a nail. Drawn behind what is written on the sheet.
 */
function clipboard(x, y, w, h) {
  const [bx, by, bw, bh] = [x - 3, y - 4, w + 6, h + 8]
  const cw = clamp(Math.round(w * 0.16), 22, 34)
  const cx = x + Math.floor((w - cw) / 2)
  const cy = y - 3
  const mid = cx + Math.floor(cw / 2)
  return paint([
    [bx + 2, by + 2, bw, bh, '#000/.3'], [bx + 1, by, bw - 2, bh, BOARD.o], [bx, by + 1, bw, bh - 2, BOARD.o],
    [bx + 1, by + 1, bw - 2, bh - 2, BOARD.b], [bx + 1, by + 1, bw - 2, 1, BOARD.h], [bx + 1, by + 1, 1, bh - 2, BOARD.h],
    [bx + 2, by + bh - 2, bw - 3, 1, BOARD.d], [bx + bw - 2, by + 2, 1, bh - 3, BOARD.d],
    [x + 1, y + h, w - 1, 1, '#d9cfb8'], [x + 2, y + h + 1, w - 3, 1, '#b5a98f'], [x + 1, y + 1, w, h, '#000/.25'], [x, y, w, h, PAPER],
    [cx + 1, cy + 7, cw - 2, 1, '#000/.15'], [cx, cy, cw, 7, STEEL.o], [cx + 1, cy + 1, cw - 2, 5, STEEL.b], [cx + 1, cy + 1, cw - 2, 1, STEEL.h],
    [cx + 1, cy + 5, cw - 2, 1, STEEL.d], [cx + 3, cy + 3, 1, 1, STEEL.d], [cx + cw - 4, cy + 3, 1, 1, STEEL.d],
    ...[0, 1, 2, 3, 4].flatMap((i) => [[mid - 5 + i, cy - 1 - i, 1, 1, STEEL.h], [mid + 5 - i, cy - 1 - i, 1, 1, STEEL.d]]),
    [mid - 1, cy - 7, 3, 2, '#8a8f96'], [mid - 1, cy - 7, 1, 1, '#d7dbe2'],
  ])
}

/** The picture's hours: hour `h` (0…24, fractions too) of a picture at x, `w` wide, starts at its x. */
const hourAt = (x, w) => (h) => x + Math.round((h * w) / 24)
/** The picture's height for its width: taller as its hours widen. */
const pictureH = (w) => (w >= 336 ? 44 : w >= 216 ? 40 : 32)
/** How an hour lights the city: dark by night (20:00–07:00), warm at sunrise and from the golden hour on, else day. */
const lightOf = (h) => (nightHour(h) ? 'night' : h === 7 || h >= 18 ? 'warm' : 'day')
const r3 = (n) => Math.round(n * 1000) / 1000

/**
 * Markup drifting east and round again, `dur` seconds a round: from where it stands (`x0`) to the picture's east edge
 * `x1`, then in again from `xs` (its west edge, less the markup's width) back to x0. Still when not animating.
 */
function drift(ctx, markup, x0, xs, x1, dur) {
  if (!ctx.animate) return markup
  const k = r3((x1 - x0) / (x1 - xs))
  return `<g>${markup}<animateTransform attributeName="transform" type="translate" values="0 0;${x1 - x0} 0;${xs - x0} 0;0 0" ` +
    `keyTimes="0;${k};${k};1" dur="${r1(dur)}s" repeatCount="indefinite"/></g>`
}

/** Markup crossing the picture from `a` to `b` (its x), `dur` seconds a crossing, `begin` into its loop. */
const crossing = (markup, a, b, dur, begin) => `<g>${markup}<animateTransform attributeName="transform" type="translate" ` +
  `values="${a} 0;${b} 0" dur="${r1(dur)}s" begin="${r1(-begin)}s" repeatCount="indefinite"/></g>`

/**
 * The day's picture on top of the sheet, from (x, y), w × ph: the city now. Its street is the day from midnight to
 * midnight, left to right, as wide as the sheet (the hour cells under it would make a strip of it); its sky is the one
 * of `skyH` (the hour now; a range of days, the facts' hour) in five bands dithered into each other, the sun or the moon
 * on its arc where it stands, stars by night (one shooting now and then), clouds drifting by (rose at sunset), a flock by
 * day, the far city in the haze. On the street a building for every hour worked, as tall as that hour's agent-time
 * (`shown`, nothing after now), lit by the hour now (glass windows by day; warm, or dark by night, its windows lit, a
 * few going on and off), a tank or a mast on its roof, the busiest crowned, a tree in the season's foliage where nobody
 * worked; the hour now under construction, the office's mascot hopping on its roof while a crane on the next lot lifts
 * a beam over it; the hours still to come empty lots behind a fence; a car and a taxi driving by. A range of days
 * crowns its mascot instead.
 */
function dayPicture(ctx, x, y, w, ph, clock, shown, skyH) {
  const at = hourAt(x, w)
  const pp = w / 24
  const gy = y + ph - 3
  // the tallest building leaves sky over it for the mascot and its crown, or the sun
  const maxH = ph - 17
  const now = clock.nowH
  const last = now ?? 23
  const lean = ctx.caps.level >= 2
  // the picture's life, shed first when the drawing must shrink: traffic, birds, a shooting star, lights going on and off
  const busy = ctx.animate && ctx.caps.level < 1
  const rnd = seeded(`td-sky ${ctx.f.now?.local_date ?? ''}`)
  const key = SKY_OF[skyH]
  const light = lightOf(skyH)
  const dark = light === 'night'
  // the sky now, its hour's mixed toward the next one's by the minutes, in five bands (the seams the city leaves in sight
  // dithered)
  const bands = SKIES[key].map((c, i) => mix(c, SKIES[SKY_OF[(skyH + 1) % 24]][i], clamp(clock.mm / 60, 0, 1)))
  const tops = [0, 0.24, 0.44, 0.62, 0.79].map((k) => y + Math.round(ph * k))
  let out = paint(bands.map((c, i) => [x, tops[i], w, (tops[i + 1] ?? y + ph) - tops[i], c]))
  for (let i = 1; i < 4; i++) {
    out += `<path stroke="${bands[i]}" stroke-dasharray="1 1" d="M${x} ${tops[i] - 0.5}h${w}"/>` +
      `<path stroke="${bands[i - 1]}" stroke-dasharray="1 1" d="M${x + 1} ${tops[i] + 0.5}h${w - 1}"/>`
  }
  // the stars by night (a few before dawn and at dusk), two sets of them twinkling in turns; now and then one shoots
  const nStars = lean ? 0 : key === 'night' ? Math.round(w / 9) : key === 'predawn' || key === 'dusk' ? Math.round(w / 20) : 0
  const stars = [[], [], []]
  for (let i = 0; i < nStars; i++) stars[i % 3].push([x + Math.floor(rnd() * w), y + 1 + Math.floor(rnd() * (tops[3] - y - 2)), 1, 1, STARS[i % 2]])
  out += paint(stars[0]) + stars.slice(1).map((s, k) => (s.length ? `<g>${paint(s)}${aO(ctx, '1;.2;1', 2.4 + k * 0.9, -k * 1.1)}</g>` : '')).join('')
  if (key === 'night' && busy) {
    const [sx, sy] = [x + Math.round(w * (0.2 + rnd() * 0.5)), y + 2 + Math.floor(rnd() * 4)]
    const trail = [[2, '.6'], [4, '.35'], [6, '.15']].map(([o, a]) => [sx - o, sy - o / 2, 2, 1, `#ffffff/${a}`])
    out += `<g opacity="0">${paint([[sx, sy, 2, 1, '#ffffff'], ...trail])}` +
      '<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.02;.06;.08;1" dur="11s" begin="-3s" repeatCount="indefinite"/>' +
      '<animateTransform attributeName="transform" type="translate" values="0 0;16 8;16 8" keyTimes="0;.08;1" dur="11s" begin="-3s" ' +
      'repeatCount="indefinite"/></g>'
  }
  // the hours' lots: a building's height for its agent-time, the busiest hour, where the mascot hops; a building fills
  // its lot but for an alley, up to 18 wide (in the middle of a wider lot: a street, not a wall)
  const vmax = Math.max(1, ...shown)
  const height = (v) => clamp(Math.round(4 + ((maxH - 4) * v) / vmax), 4, maxH)
  const best = Math.max(...shown) > 0 ? argmax(shown) : -1
  const hop = now ?? (best >= 0 ? best : null)
  const room = (h) => at(h + 1) - at(h) - (pp >= 5 ? 2 : 1)
  const lotW = (h) => Math.min(18, room(h))
  const lotX = (h) => at(h) + 1 + Math.floor((room(h) - lotW(h)) / 2)
  const perch = (h) => lotX(h) + Math.floor((lotW(h) - 7) / 2)
  // the sun from 07:00 to 20:00 or the moon the night through, where it stands on its arc over the street, lifted just
  // clear of what stands under it; where that would take it out of the sky, just before the mascot instead
  const hNow = skyH + clamp(clock.mm, 0, 59) / 60
  const horizon = gy - 11
  const arc = (t) => Math.round(horizon - Math.sin(Math.PI * clamp(t, 0, 1)) * (horizon - y - 5))
  const high = arc(dark ? ((hNow - 19.5 + 24) % 24) / 11 : (hNow - 6.5) / 13) - 4
  // the highest thing standing under the span a…b: a roof (its tank or mast), the mascot (its crown), the crown
  const under = (a, b) => {
    let top = gy
    for (let h = Math.max(0, Math.floor((a - x) / pp)); h <= Math.min(last, Math.floor((b - x) / pp)); h++) {
      if (!shown[h] && h !== hop) continue
      const roof = gy - (shown[h] ? height(shown[h]) : 1)
      top = Math.min(top, roof - (h === hop ? (h === best ? 11 : 6) : h === best ? 5 : lotW(h) >= 8 && h % 3 !== 2 ? 5 : 0))
    }
    return top
  }
  let bx = Math.round(x + hNow * pp - 4.5)
  let by = Math.min(high, under(bx, bx + 8) - 10)
  if (by < y + 1 && hop != null) {
    bx = perch(hop) - 11
    by = Math.min(high, under(bx, bx + 8) - 10)
  }
  by = Math.max(y + 1, by)
  // low in a warm sky the sun lights a wide glow
  if (light === 'warm') out += paint(disc(bx + 4.5, by + 4.5, 15, '#ffc070/.12')) + paint(disc(bx + 4.5, by + 4.5, 10, '#ffe3a6/.18'))
  out += use(ctx, dark ? 'td-moon' : 'td-sun', bx, by)
  // clouds drifting by, a pixel a second, each from where it stands and round again; a flock crossing the day
  const tint = dark ? CLOUDS.night : key === 'set' || key === 'dawn' ? CLOUDS.rose : light === 'warm' ? CLOUDS.gold : CLOUDS.day
  const clouds = lean ? 0 : dark ? 1 : pp >= 9 ? 3 : 2
  for (let i = 0; i < clouds; i++) {
    const cx = Math.round(x + ((i + 0.2 + rnd() * 0.5) / clouds) * w)
    const cy = y + 2 + Math.floor(rnd() * Math.max(1, tops[2] - y - 4))
    out += drift(ctx, use(ctx, 'td-cloud', cx, cy, ` color="${tint}"`), cx, x - 14, x + w, (w + 14) * (1 + i * 0.35))
  }
  if (!dark && busy) {
    const fy = y + 3 + Math.floor(rnd() * 5)
    const flock = [[0, 2], [4, 0], [8, 3]].map(([dx, dy]) => use(ctx, 'td-bird', dx, fy + dy)).join('')
    out += `<g color="${light === 'warm' ? '#4a2c3a' : '#2f3446'}">${crossing(flock, x - 14, x + w + 2, (w + 16) / 6, rnd() * 20)}</g>`
  }
  // the far city in the haze, its windows lit by night
  let far = ''
  for (let fx = x - Math.floor(rnd() * 64); fx < x + w; fx += 64) far += use(ctx, dark ? 'td-far-n' : 'td-far', fx, gy - 12)
  out += `<g color="${mix(bands[4], dark ? '#060918' : '#4a5a7a', dark ? 0.55 : 0.32)}">${far}</g>`
  // the street, and on it the hours: a building for each hour worked, lit by the hour now, a tree for each hour nobody
  // worked; two layers, as paint() draws a fill's rects together where it first meets it: the bodies, then what lies on
  // them
  const lit = (c) => (dark ? mix(c, '#0d1330', 0.72) : light === 'warm' ? mix(c, '#ff9a5a', 0.2) : c)
  const rects = [[x, gy, w, 3, dark ? '#34302c' : '#5d5850'], [x, gy, w, 1, dark ? '#4f4a43' : '#8f897e']]
  const over = []
  const windows = { lit: [], glass: [] }
  const masts = []
  let marks = ''
  const lot = []
  for (let h = 0; h <= last; h++) {
    const v = shown[h]
    const bx = lotX(h)
    const bw = lotW(h)
    lot[h] = { bx, bw, roof: gy - 1 }
    if (!v) {
      // the hour now with nothing in it yet: the lot's foundation, for the mascot to stand on
      if (h === now) rects.push([bx, gy - 1, bw, 1, '#9a948a'])
      else if (bw >= 5) marks += use(ctx, dark ? 'td-tree-n' : 'td-tree', bx + Math.floor((bw - 5) / 2), gy - 6)
      else rects.push([bx, gy - 1, bw, 1, FOLIAGE[SEASON_OF[monthIndex(ctx.f.now?.local_date)]][dark ? 2 : 1]])
      continue
    }
    const bh = height(v)
    const top = gy - bh
    lot[h].roof = top
    rects.push([bx, top, bw, bh, lit(FACADES[(h * 5 + 2) % FACADES.length])])
    over.push([bx, top, bw, 1, dark ? '#fff/.12' : '#fff/.3'])
    if (bw >= 4) over.push([bx + bw - 1, top + 1, 1, bh - 1, '#000/.2'])
    // its windows (a door under them on a wide one), one rect filled by the window pattern: glass by day, lit when the
    // light goes and in the hour now
    const inset = bw >= 8 ? 2 : 1
    const door = bw >= 7 && bh >= 8
    if (door) over.push([bx + Math.floor(bw / 2) - 1, gy - 3, 2, 3, '#000/.35'])
    const wh = gy - (door ? 4 : 1) - (top + 2)
    if (bw >= 3 && wh > 0 && !lean) {
      windows[light !== 'day' || h === now ? 'lit' : 'glass'].push(`M${bx + inset} ${top + 2}h${bw - 2 * inset}v${wh}h${2 * inset - bw}z`)
      lot[h].win = [bx + inset, top + 2, bx + bw - inset, top + 2 + wh]
    }
    // on a wide roof a water tank or a mast (its light blinking by night), never on the crowned roof or the one being built
    if (bw >= 8 && h !== best && h !== hop && h % 3 !== 2) {
      if (h % 3) over.push([bx + bw - 6, top - 4, 4, 3, '#7a5a3a'], [bx + bw - 6, top - 4, 4, 1, '#9a7650'], [bx + bw - 6, top - 1, 1, 1, '#4a3520'], [bx + bw - 3, top - 1, 1, 1, '#4a3520'])
      else {
        over.push([bx + 2, top - 4, 1, 4, '#4a4f5c'], [bx + 1, top - 3, 3, 1, '#4a4f5c'])
        if (dark) masts.push([bx + 2, top - 5, 1, 1, '#ff5a4a'])
      }
    }
  }
  out += paint(rects) + paint(over)
  // the windows' patterns: 1 px windows (2 px on wide buildings) a pixel apart, in rows three apart; glass, or lit with
  // two in six dark, a few of which go on and off by night
  const ww = pp >= 14 ? 2 : 1
  const tile = 3 * (ww + 1)
  const panes = { lit: [[0, 0], [2 * (ww + 1), 0], [0, 3], [ww + 1, 3]], glass: [[0, 0], [ww + 1, 0], [2 * (ww + 1), 0], [0, 3], [ww + 1, 3], [2 * (ww + 1), 3]] }
  for (const [k, col] of [['lit', LIT], ['glass', GLASS]]) {
    if (!windows[k].length) continue
    const pid = `${ctx.id}td-${k}`
    out += `<pattern id="${pid}" width="${tile}" height="6" patternUnits="userSpaceOnUse">${paint(panes[k].map(([px, py]) => [px, py, ww, 1, col]))}</pattern>` +
      `<path fill="url(#${pid})" d="${windows[k].join('')}"/>`
  }
  if (light !== 'day' && busy) {
    // a dark pane (the pattern's first: ww + 1 across, on a row six apart) in up to three buildings, lit now and then
    const flicker = lot.filter((l) => l?.win).sort((a, b) => ((a.bx * 37) % 11) - ((b.bx * 37) % 11)).slice(0, 3)
    flicker.forEach(({ win: [x0, y0, x1, y1] }, i) => {
      const px = x0 + ((((ww + 1 - x0) % tile) + tile) % tile)
      const py = y0 + ((6 - (y0 % 6)) % 6)
      if (px + ww <= x1 && py < y1) out += `<g opacity="0">${paint([[px, py, ww, 1, LIT]])}${aO(ctx, '0;0;1;1;1;0', 5 + i * 1.7, -i * 2.3)}</g>`
    })
  }
  if (masts.length) out += `<g>${paint(masts)}${aO(ctx, '1;1;0', 1.8)}</g>`
  out += marks
  if (now != null) {
    // the hour now: scaffolding up its top floors; the lots still to come behind a fence, a crane on the next one
    // (its light blinking by night) lifting a beam over the roof
    const { bx, bw, roof } = lot[now]
    if (shown[now] && bw >= 5) {
      const d = Math.min(7, gy - roof)
      out += paint([[bx - 1, roof, 1, d, SCAFFOLD], [bx + bw, roof, 1, d, SCAFFOLD], [bx - 1, roof + 3, bw + 2, 1, SCAFFOLD]])
    }
    if (now < 23) {
      const fx = at(now + 1) + 1
      out += paint([[fx, gy - 3, x + w - 1 - fx, 1, FENCE]]) + `<path stroke="${FENCE}" stroke-width="2" stroke-dasharray="1 2" d="M${fx} ${gy - 1}h${x + w - 1 - fx}"/>`
      if (pp >= 5) {
        const mx = at(now + 1) + Math.floor(pp / 2)
        const hx = bx + Math.floor((bw - 1) / 2)
        // the jib over the tallest roof, the beam over the mascot's head (none when the roof comes up to the jib)
        const ct = Math.max(y + 1, gy - maxH - 9)
        const hook = Math.max(ct + 4, roof - 11)
        const hang = hook <= roof - 8
        const bw2 = clamp(bw, 5, 9)
        out += paint([[mx, ct, 1, gy - ct, CRANE[0]], [mx - 1, gy - 2, 3, 2, CRANE[1]], [hx - 4, ct, mx - hx + 9, 1, CRANE[0]],
          [mx + 2, ct + 1, 3, 2, '#5d5446'], [mx - 1, ct + 1, 3, 2, CRANE[1]], ...(hang ? [[hx, ct + 1, 1, hook - ct - 1, '#3a322b']] : [])])
        if (dark) out += `<g>${paint([[mx, ct - 1, 1, 1, '#ff5a4a']])}${aO(ctx, '1;0', 1.2)}</g>`
        if (hang) {
          const b0 = hx - Math.floor(bw2 / 2)
          out += `<g>${paint([[b0, hook, bw2, 1, '#9aa1ac'], [b0, hook + 1, bw2, 1, '#6b717c']])}${aT(ctx, '0 0;0 -1;0 -2;0 -2;0 -1;0 0', 3.6)}</g>`
        }
      }
    }
  }
  // the busiest hour crowned, twinkling; the mascot hops on the roof of the hour now (a range of days: under the crown)
  if (best >= 0) {
    const cy = lot[best].roof - 5 - (best === hop ? 6 : 0)
    out += use(ctx, 'td-crown', perch(best), cy) + `<g>${use(ctx, 'td-twinkle', perch(best) + 6, cy - 2)}${aO(ctx, '0;0;0;1;0', 1.6)}</g>`
  }
  if (hop != null) out += use(ctx, pose(ctx.pick ? ctx.pick(0) : 'claude', 'Mw'), perch(hop), lot[hop].roof - 5)
  // a car driving east and a taxi west, their headlights on when the light goes
  if (busy && pp >= 5) {
    const beam = (dx) => (light !== 'day' ? paint([[dx, gy, 5, 1, `${LIT}/.35`]]) : '')
    out += crossing(use(ctx, 'td-car', 0, gy - 2) + beam(9), x - 14, x + w + 4, (w + 18) / 14, rnd() * 9)
    out += crossing(use(ctx, 'td-taxi', 0, gy - 3) + beam(-5), x + w + 4, x - 14, (w + 18) / 10, rnd() * 13)
  }
  const id = `${ctx.id}td-pic`
  return `<clipPath id="${id}"><path d="M${x} ${y}h${w}v${ph}h${-w}z"/></clipPath><g clip-path="url(#${id})">${out}</g>`
}

/**
 * The date on the band, the longest form that fits `maxW` (bold 6 px, letter-spaced): 'THURSDAY 29 OCTOBER 2026' down
 * to '29 OCT'; a range of days says its label, else its kind.
 */
function bandTitle(f, daily, maxW) {
  const w = (s) => s.length * (6 * 0.62 + 0.5)
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(f.now?.local_date ?? ''))
  let opts = [String(f.range?.label ?? '').toUpperCase(), f.range?.kind === 'week' ? 'THE WEEK' : f.range?.kind === 'month' ? 'THE MONTH' : '']
  if (daily && m) {
    const { d, wdi } = dayInfo(f.now.local_date)
    const [W, M] = [WEEKDAYS[wdi], MONTH_NAMES[Number(m[2]) - 1]]
    opts = [`${W} ${d} ${M} ${m[1]}`, `${W} ${d} ${M}`, `${W.slice(0, 3)} ${d} ${M}`, `${W.slice(0, 3)} ${d} ${M.slice(0, 3)}`, `${d} ${M.slice(0, 3)}`]
  }
  return opts.find((s) => s && w(s) <= maxW) ?? ''
}

// The band under the picture (x, y, w × 10) in the month's color: the date, the sun and the moon either side of it.
function dateBand(ctx, x, y, w, title, color) {
  const tw = Math.ceil(textW(title, 6) + title.length * 0.5)
  let s = paint([[x, y, w, 10, color], [x, y, w, 1, '#fff/.22'], [x, y + 9, w, 1, '#000/.3']])
  s += txt(x + w / 2, y + 7.5, title, 6, '#fff8e8', ' font-weight="bold" text-anchor="middle" letter-spacing=".5"')
  if (title && tw + 26 <= w - 8) {
    s += `<g color="#ffe9c4">${use(ctx, 'td-orn-sun', Math.round(x + (w - tw) / 2 - 11), y + 2)}${use(ctx, 'td-orn-moon', Math.round(x + (w + tw) / 2 + 4), y + 2)}</g>`
  }
  return s
}

// One line of the sheet into its layers: L[1] the name tab and the 24 hour cells as runs (the night shift's hours
// tinted, the hours still to come blank), L[2] each hour worked as a bar in `ink` standing in its cell, as tall as its
// step, under a dark top edge (CAP), L[3] what lies on them: the tab's shade, the class colors under the desks open now,
// pixel digits; its texts and sprites go to `out` (names, times, commits; marks: figures, the parcel by the commits,
// the gold star of its best hour).
function line(ctx, s, y, L, out, { name, tab, ph, max, ink, future, desks, count, am, commits }) {
  const { X0, NW, RH, HX, NX, pitch } = s
  L[1].push([X0, y + 1, NW, RH - 2, tab])
  L[3].push([X0, y + RH - 2, NW, 1, '#000/.3'])
  const lv = ph.map((m, h) => (future(h) ? -1 : level(m, max)))
  runs(L[1], lv.map((v, h) => (v < 0 ? LATER : nightHour(h) ? PAPER_NIGHT : PAPER)), HX + 1, pitch, y + 1, RH - 1)
  // bars, not shades: a pale tint of a light project hardly showed on the paper, a bar's height reads in any color.
  // Hours of one step side by side are one rect, as the cells' runs are: the grid's columns, painted over, part them.
  const bars = lv.map((v) => (v > 0 ? Math.max(2, Math.round(((RH - 1) * v) / STEPS)) : 0))
  for (let a = 0; a < 24;) {
    let b = a
    while (b + 1 < 24 && bars[b + 1] === bars[a]) b++
    if (bars[a]) L[2].push([HX + 1 + a * pitch, y + RH - bars[a], (b - a + 1) * pitch - 1, bars[a], ink], [HX + 1 + a * pitch, y + RH - bars[a], (b - a + 1) * pitch - 1, 1, CAP(ink)])
    a = b + 1
  }
  // a gold star on the line's best hour, when that hour is of the sheet's top step
  const peak = argmax(lv)
  if (pitch >= 8 && lv[peak] === STEPS) out.marks += use(ctx, 'td-star', HX + (peak + 1) * pitch - 6, y + 2)
  const base = y + RH / 2 + 2.5
  // the totals line says 'all projects', or 'total' where that does not fit; a project's name is whole (wrapName clips a
  // half in its middle only when two lines are not enough)
  if (count) out.names += t0(X0 + 3, base, textW(name, 5.5) <= NW - 5 ? name : fit('total', NW - 5, 5.5))
  else {
    // a name a size up on one line when it fits, else on two, broken where it breaks best (wrapName), not clipped
    const big = textW(name, 6) <= NW - 5
    const parts = big ? [name] : wrapName(name, NW - 5, 5.5)
    const top = y + Math.round(RH / 2) - 1
    parts.forEach((p, i) => { out.names += t0(X0 + 3, parts.length > 1 ? top + i * 6 : base, p, big ? ' font-size="6"' : '') })
  }
  const cy = y + Math.floor((RH - 7) / 2) + 1
  if (count && desks.length) {
    // the totals line: one micro Clawd and the number of desks open now in pixel digits
    const n = String(Math.min(999, desks.length))
    const wide = s.NOWW >= n.length * 4 + 9
    if (wide) out.marks += use(ctx, 'cM', NX, cy)
    L[3].push(...pixRuns(n, NX + (wide ? 9 : 0), cy, '#5d4a2f'))
  } else if (!count && desks.length) {
    const fig = desks.length > s.k ? desks.slice(0, s.k - 1) : desks
    fig.forEach((d, i) => {
      out.marks += use(ctx, pose(d.agent, d.cls === 'working' || d.cls === 'thinking' ? 'Mw' : 'M'), NX + i * 8, cy)
      L[3].push([NX + i * 8, cy + 6, 7, 1, CLASS_COLOR[d.cls] ?? ROLE.idle])
    })
    if (desks.length > fig.length) out.more += t0(NX + fig.length * 8 + 1, base, `+${desks.length - fig.length}`)
  }
  out.times += t0(s.AX, base, am ? fmtMinutes(am) : '·', am ? '' : ` fill="${FADED}"`)
  out.commits += t0(s.CX + s.CMW, base, commits ? fmtInt(commits) : '·', commits ? '' : ` fill="${FADED}"`)
  if (commits) out.marks += use(ctx, 'td-parcel', Math.round(s.CX + s.CMW - textW(fmtInt(commits), 6) - 6), Math.round(base - 3.5))
}

// A <text> whose font, color and anchor come from its group (the sheet writes many): '' when empty.
const t0 = (x, y, s, extra = '') => (s ? `<text x="${r1(x)}" y="${r1(y)}"${extra}>${esc(s)}</text>` : '')

/**
 * A name in one line when it fits `maxW`, else in two: broken after a '-', '_', '.', '/' or ' ', or before a capital
 * (camelCase), at the break nearest its middle that lets both halves fit; each half clipped in its middle past maxW.
 */
function wrapName(name, maxW, size) {
  if (textW(name, size) <= maxW) return [name]
  const cuts = []
  for (let i = 1; i < name.length; i++) {
    const [a, b] = [name[i - 1], name[i]]
    if ('-_./ '.includes(a) || (/[a-z0-9]/.test(a) && /[A-Z]/.test(b))) cuts.push(i)
  }
  const fits = (i) => textW(name.slice(0, i), size) <= maxW && textW(name.slice(i), size) <= maxW
  const mid = name.length / 2
  const near = (list) => [...list].sort((x, y) => Math.abs(x - mid) - Math.abs(y - mid))[0]
  const at = near(cuts.filter(fits)) ?? near(cuts) ?? Math.ceil(mid)
  return [fitMid(name.slice(0, at), maxW, size), fitMid(name.slice(at).replace(/^ /, ''), maxW, size)]
}

function timesheetRoom(ctx, g, top, clock, perHour, cards, cap, daily, when) {
  const { IX0, IW } = g
  const { f } = ctx
  // a page of the past has no desks open now (they are today's): no desks column, nobody on the totals line
  const present = !isPastRange(f)
  const s = sheetGeometry(IX0, IW, present)
  const { pitch, HX, RH, X0, NX, AX, CX, CMW, PX, PW } = s
  const shown = cards.slice(0, cap)
  const future = (h) => clock.nowH != null && h > clock.nowH
  const lastH = clock.nowH ?? 23
  const right = CX + CMW
  const cellsW = 24 * pitch + 1
  // top down: the nail 10 over the paper, the clip over its top edge, the picture, the date band, the column heads, a
  // line per project, a rule, the totals line; the board 4 under the paper, then a little wall to the floor
  const [picX, picW] = [PX + 2, PW - 4]
  const ph = pictureH(picW)
  const py = top + HEAD + 12
  const picY = py + 5
  const bandY = picY + ph
  const hy = bandY + 17
  const rowsTop = bandY + 20
  const n = Math.max(1, shown.length)
  const totalY = rowsTop + n * RH + 4
  const pb = totalY + RH + 3
  const floor = pb + 12
  const t = f.totals && typeof f.totals === 'object' ? f.totals : {}
  let back = roomHeader(ctx, { name: 'TIMESHEETS', color: ROLE.accent }, IX0, top, IW,
    daily || f.range?.kind === 'today' ? [['one line per project', K.groupText], [daily ? 'since midnight' : 'midnight to midnight', ROLE.dim]] : [[`hours summed over ${when}`, K.groupText]])
  back += paint([[IX0, floor - 14, IW, 14, K.wallLow]]) + clipboard(PX, py, PW, pb - py)
  // plants either side of the board when the wall is wider than the sheet
  if (PX - 3 - IX0 >= 18) back += use(ctx, 'plant', IX0 + 4, floor - 12) + use(ctx, 'plant', IX0 + IW - 14, floor - 12)
  // the day's picture under the sky now (a range of days: the facts' hour, else noon), the date on the month's band
  const ymd = daily ? f.now?.local_date : (Array.isArray(f.range?.days) ? f.range.days.at(-1) : null) ?? f.now?.local_date
  const hour = Number(f.now?.hour)
  const skyH = clock.nowH ?? (Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : 13)
  let fore = dayPicture(ctx, picX, picY, picW, ph, clock, perHour.map((v, h) => (future(h) ? 0 : v)), skyH)
  fore += dateBand(ctx, picX, bandY, picW, bandTitle(f, daily, picW - 10), MONTH_BAND[monthIndex(ymd)])
  // column heads and hour labels in the sheet's inks (the night shift's blue, the hours to come faded; the now label
  // takes its place among them)
  const mid = ' text-anchor="middle"'
  let heads = t0(X0, hy, fit('project', s.NW, 4.5))
  heads += s.NOWW ? t0(NX, hy, s.NOWW >= 30 ? 'at desks' : 'desks') : ''
  heads += t0(AX, hy, textW('agent-time', 5) <= s.AW + 5 ? 'agent-time' : 'agent-h', ' text-anchor="end"')
  heads += t0(right, hy, 'commits', ' text-anchor="end"')
  const every = pitch >= 14 ? 1 : pitch >= 8 ? 2 : pitch >= 4 ? 3 : 6
  // a live clock ticks on the punch clock and in the title; the playhead's own tag then just says now. The tag (the time
  // after a dot) stays over the hour cells: at 23:40 it would run into the agent-time head
  const nowLbl = clock.nowH != null ? (clock.live ? 'now' : clock.hhmm) : ''
  const tagW = nowLbl ? Math.round(textW(nowLbl, 5)) + 10 : 0
  const tagX = nowLbl ? Math.round(clamp(HX + clock.nowH * pitch + pitch / 2 - tagW / 2, HX - 2, HX + 24 * pitch + 2 - tagW)) : 0
  const nowBox = nowLbl ? [tagX - 2, tagX + tagW + 2] : null
  let hours = ''
  for (let h = 0; h < 24; h += every) {
    const cx = HX + h * pitch + pitch / 2
    const half = textW('00', 5) / 2
    if (nowBox && cx + half > nowBox[0] && cx - half < nowBox[1]) continue
    hours += t0(cx, hy, hh(h), ` fill="${future(h) ? FADED : nightHour(h) ? INK_NIGHT : INK}"`)
  }
  fore += `<g font-size="5" fill="${INK_HEAD}">${heads}</g><g font-size="5" font-weight="bold"${mid}>${hours}</g>`
  // the lines: the paper's rules, the grid the cells stand on (it shows between the hours and the lines), L1 the tabs
  // and the cell runs, L2 the hours' bars, the grid's columns again over the runs, the cells lit from above, L3 the
  // class colors and the pixel digits, then the marks
  const L = { 1: [], 2: [], 3: [] }
  const out = { names: '', times: '', commits: '', marks: '', more: '' }
  let tips = ''
  const max = Math.max(1, ...shown.flatMap((r) => r.ph.filter((_, h) => !future(h))))
  shown.forEach((r, i) => {
    const y = rowsTop + i * RH
    const col = ctx.color(r.name)
    line(ctx, s, y, L, out, { name: r.name, tab: col, ph: r.ph, max, ink: col, future, desks: r.desks, am: r.am, commits: r.commits })
    const peak = argmax(r.ph.map((v, h) => (future(h) ? 0 : v)))
    const tip = [clip(r.name, 50), `${fmtMinutes(r.am)} agent-time${daily ? ' today' : ''}`, r.ph[peak] ? `busiest ${span(peak)}` : '',
      plural(r.commits, 'commit'), r.desks.length ? `${plural(r.desks.length, 'desk')} open now` : '', clip(r.p.titles?.[0] ?? '', 50)]
    tips += hitArea(X0, y, right - X0, RH, tip.filter(Boolean).join(' · '))
  })
  // an empty sheet still has its blank line, for the message to sit on
  if (!shown.length) runs(L[1], Array.from({ length: 24 }, (_, h) => (future(h) ? LATER : nightHour(h) ? PAPER_NIGHT : PAPER)), HX + 1, pitch, rowsTop + 1, RH - 1)
  const all = stripOf(ctx.desks)
  line(ctx, s, totalY, L, out, {
    name: 'all projects', tab: ROLE.accent, ph: perHour, max: Math.max(1, ...perHour.filter((_, h) => !future(h))), ink: TOTAL_INK, future,
    desks: present ? all : [], count: true, am: num(t.agent_minutes), commits: num(t.commits),
  })
  // the grid's columns run down both blocks; the gap between them is papered again under the totals' rule
  const grid = [...Array.from({ length: n + 1 }, (_, i) => [X0, rowsTop + i * RH, right - X0, 1, RULE]), [HX, rowsTop, cellsW, n * RH + 1, GRID],
    [HX, totalY, cellsW, RH + 1, GRID]]
  const gapY = rowsTop + n * RH + 1
  const cols = Array.from({ length: 23 }, (_, h) => [HX + (h + 1) * pitch, rowsTop, 1, totalY + RH - rowsTop, (h + 1) % 6 ? GRID : INK_HEAD])
  fore += paint(grid) + paint(L[1]) + paint(L[2]) + paint([...cols, [HX, gapY, cellsW, totalY - gapY, PAPER], [X0, totalY - 2, right - X0, 1, INK]])
  if (pitch >= 5) {
    const bevel = (dy, col, op) => `<path stroke="${col}" stroke-opacity="${op}" stroke-dasharray="${pitch - 1} 1" d="` +
      `${[...Array.from({ length: n }, (_, i) => rowsTop + i * RH), totalY].map((y) => `M${HX + 1} ${y + dy}h${24 * pitch - 1}`).join('')}"/>`
    fore += `<g pointer-events="none">${bevel(1.5, '#fff', 0.55)}${bevel(RH - 0.5, '#000', 0.12)}</g>`
  }
  fore += paint(L[3]) + out.marks
  fore += `<g font-size="5.5" font-weight="bold" fill="${K.plate}">${out.names}</g>` +
    `<g font-size="6" font-weight="bold" text-anchor="end" fill="${INK}">${out.times}</g>` +
    `<g font-size="6" font-weight="bold" text-anchor="end" fill="${INK_SHIP}">${out.commits}</g>` +
    (out.more ? `<g font-size="5" font-weight="bold" fill="#6e5f47">${out.more}</g>` : '')
  tips += hitArea(X0, totalY, HX - X0, RH, present ? `all projects · ${plural(all.length, 'desk')} open now` : 'all projects')
  tips += hitArea(HX + cellsW + 1, totalY, right - HX - cellsW - 1, RH,
    `all projects · ${fmtMinutes(num(t.agent_minutes))} agent-time · ${plural(num(t.commits), 'commit')}`)
  // one tooltip per hour, on its column of the picture and its cell of the totals line (dropped when the drawing must
  // shrink)
  if (ctx.caps.level < 1) {
    const at = hourAt(picX, picW)
    const box = (bx, y, bw, bh) => `M${bx} ${y}h${bw}v${bh}h${-bw}z`
    for (let h = 0; h <= lastH; h++) {
      const tip = `${span(h)} · ${perHour[h] ? `${fmtMinutes(perHour[h])} agent-time` : 'no agent-time'}`
      tips += `<path fill-opacity="0" d="${box(at(h), picY, at(h + 1) - at(h), ph)}${box(HX + h * pitch, totalY, pitch, RH)}"><title>${esc(tip)}</title></path>`
    }
  }
  // now, as a playhead: a thin red line at the minute (mid-hour on a live clock) down the lines and the totals, the
  // hour's bars in sight either side of it, under a red tag with the time, a white dot blinking before it
  if (clock.nowH != null) {
    const cx0 = HX + clock.nowH * pitch
    const lx = cx0 + (clock.live ? Math.floor(pitch / 2) : clamp(Math.round((clock.mm / 60) * pitch), 0, pitch - 1))
    fore += paint([[lx, hy + 2, 1, totalY + RH - hy - 1, MARKER], [lx - 1, totalY + RH + 1, 3, 1, MARKER]])
    const ty = hy - 6
    fore += paint([[tagX + 1, ty, tagW - 2, 8, MARKER], [tagX, ty + 1, tagW, 6, MARKER], [tagX + 1, ty + 1, tagW - 2, 1, '#fff/.3'],
      [tagX + 1, ty + 7, tagW - 2, 1, '#000/.2']])
    fore += `<g>${paint([[tagX + 3, ty + 3, 2, 2, '#fff8e8']])}${aO(ctx, '1;1;.2', 1.6)}</g>` +
      `<g font-weight="bold">${txt(tagX + 7.5 + textW(nowLbl, 5) / 2, hy, nowLbl, 5, '#fff8e8', mid)}</g>`
  }
  // no lines: the message on a slip of paper over the blank line and the playhead (which would strike it through)
  if (!shown.length) {
    const msg = fit(daily ? 'no time cards yet: nobody has worked today' : f.range?.kind === 'today' ? 'no time cards: nobody worked that day' : 'no time cards in this range', right - X0 - 8, 5)
    const mw = Math.round(textW(msg, 5) + 6)
    const mx = (X0 + right) / 2
    fore += paint([[Math.round(mx - mw / 2), rowsTop + RH / 2 - 4, mw, 8, PAPER]]) + txt(mx, rowsTop + RH / 2 + 2, msg, 5, '#6b5d4a', mid)
  }
  // the pencil on its string, swinging at the board's side
  const px = PX + PW + 3
  if (IX0 + IW - px >= 4) {
    fore += paint([[px - 1, py + 1, 1, 1, '#8a8f96'], [px, py + 2, 1, 9, '#ece4d2']]) +
      `<g>${use(ctx, 'td-pencil', px, py + 11)}${aT(ctx, '0 0;0 0;1 0;1 0;0 0;0 0;-1 0;-1 0', 4.8)}</g>`
  }
  return { back, fore: fore + tips, floor, shown }
}

// ---------------------------------------------------------------- scene

/**
 * The day as a timesheet, drawn alone in the `today` view. Why a timesheet: per_hour is the one fact only this range
 * has, and a sheet of lines (a line per project, a lit cell per hour worked) reads at a glance when the day started,
 * when it peaked and who is still on the clock, where a number per project would not; its picture tells the same day as
 * a street the hours build. Facts of a longer range (week, month) draw the same sheet with the hours summed over it,
 * without the hour now. Returns `{ svg, h, alt }`
 * painted from y0 down under the shared header (svg-kit sceneHeader; the scene contract: SCENES in lib/svg.mjs); never
 * throws on partial facts.
 */
export function sceneToday(ctx, y0) {
  const { W, f, night } = ctx
  const kind = f.range?.kind
  const isPast = isPastRange(f)
  const daily = !isPast && (!kind || kind === 'today' || kind === 'live')
  const when = String(f.range?.label ?? '') || `${f.now?.weekday ?? ''} ${dateLabel(f)}`.trim()
  const clock = clockOf(ctx, daily)
  const perHour = hours24(f.per_hour)
  const shown = perHour.map((v, h) => (clock.nowH != null && h > clock.nowH ? 0 : v)) // hours still to come hold nothing yet
  const t = f.totals && typeof f.totals === 'object' ? f.totals : {}
  const cards = cardsOf(ctx, !isPast)
  // the calendar's day: today, or a range's last day (a page of the past says its own)
  const ymd = daily ? f.now?.local_date : (Array.isArray(f.range?.days) ? f.range.days.at(-1) : null) ?? f.now?.local_date
  const cap = ctx.caps.level >= 2 ? 6 : ctx.caps.level >= 1 ? 8 : 10
  const BX0 = 6
  const BX1 = W - 6
  const g = { IX0: BX0 + 4, IX1: BX1 - 4, IW: BX1 - BX0 - 8 }
  const roof = y0 + SKY
  // ---- the rooms, top to bottom
  const top1 = roof + 5
  const word = daily || kind === 'today' ? 'of the day' : kind === 'week' ? 'of the week' : kind === 'month' ? 'of the month' : 'of the range'
  const tc = timeClockRoom(ctx, g, top1, clock, shown, cards[0]?.am > 0 ? cards[0] : null, word, !isPast, ymd)
  const top2 = tc.floor + CLOCK_SLAB
  const ts = timesheetRoom(ctx, g, top2, clock, perHour, cards, cap, daily, when)
  const groundY = ts.floor + SLAB
  const more = cards.length - ts.shown.length + num(f.projects_more)
  const lines = []
  if (more > 0) {
    const rest = cards.slice(ts.shown.length).reduce((a, r) => a + r.am, 0)
    lines.push([[`+${plural(more, 'more project')} not on the sheet`, ROLE.dim], ...(rest ? [[`${fmtMinutes(rest)} agent-time`, ROLE.dim]] : [])])
  }
  const H = groundY + 4 + (lines.length ? lines.length * 9 + 5 : 2) - y0
  // ---- the shared header (sky, title, skyline, brick shell) with the day's totals: without the desk time when it
  // would push a count off the line
  const am = num(t.agent_minutes)
  const tail = [[plural(num(t.sessions), 'session'), ROLE.title], [plural(num(t.subagents), 'intern'), ROLE.intern],
    [plural(num(t.workflows), 'meeting'), ROLE.meeting], [plural(num(t.commits), 'commit'), ROLE.ship]]
  const full = [[`${fmtMinutes(am)} agent-time (${fmtMinutes(num(t.desk_minutes))} at desks)`, ROLE.title], ...tail]
  const info = fitInfo(full, W).length < full.length ? [[`${fmtMinutes(am)} agent-time`, ROLE.title], ...tail] : full
  let s = sceneHeader(ctx, y0, { view: daily ? 'today' : 'timesheet', when, info, groundY }).svg
  // ---- the two rooms over their slabs (lights on: at night a warm line under each ceiling)
  const { IX0, IW } = g
  const walls = [[IX0, top1, IW, tc.floor - top1, K.wall], [IX0, top2, IW, ts.floor - top2, K.wall]]
  s += paint(walls)
  if (night) s += paint(walls.flatMap(([x, y, w]) => ceilingLight(x, y, w)))
  s += tc.back + ts.back
  // the slabs stop at the inner walls, as the live floor's do: the brick piers run unbroken from the parapet to the street
  s += paint([[tc.floor, CLOCK_SLAB], [ts.floor, SLAB]].flatMap(([fl, sh]) => [[IX0, fl, IW, sh, K.slab], [IX0, fl, IW, 2, K.wood], [IX0, fl + 2, IW, 1, K.woodD]]))
  s += tc.fore + ts.fore + tc.labels
  // ---- the sidewalk, then under it (footing: the composer lays the commits line between) the lines that did not fit
  const foot = footing(ctx, groundY, y0 + H, lines.map((ln, i) => lineSpans(6, groundY + 12 + i * 9, 5, ln, W - 10)).join(''))
  s += foot.walk
  const best = argmax(shown)
  const alt = `The Office ${daily ? 'today' : `timesheet, ${when}`}: ${fmtMinutes(am)} agent-time (${fmtMinutes(num(t.desk_minutes))} at desks), ` +
    `${plural(num(t.sessions), 'session')}, ${plural(num(t.subagents), 'intern')}, ${plural(num(t.workflows), 'meeting')}, ` +
    `${plural(num(t.commits), 'commit')}${shown[best] ? `; busiest hour ${span(best)}` : ''}`
  return { svg: s + foot.under.svg, top: s, under: foot.under, h: H, alt }
}
