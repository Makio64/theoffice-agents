/**
 * Month: the pixel office's Month tab (lib/svg-month.mjs) in voxels, three storeys over the street lobby, read from the
 * roof down. On top the wall calendar room: the page hangs from a nail on a wire coil, the month's picture on top (a
 * little landscape of its own for each month, the month's busiest character at its pastime: skating in January, a
 * kite in March, the beach in July, a campfire in November…), the month on a band of its color, then a square per day
 * of the page, Monday first, greener and raised higher the more agent-time it had (a heat relief you can read across
 * the room), its date in the pixel font and its agent-time; a gold star on the best days, a crown on the busiest,
 * today edged in soft gold with a tiny figure hopping on it, the days outside the page faded. Beside it the employee
 * of the month flexing in a gilt frame under a picture light, the key, and Clawd tapping the page with a pointer; on
 * the label band what stood out. Under it the building directory: a felt board in a brass frame, a line per tenant,
 * busiest first (a lamp lit while one of its desks is in, its name in its color, a bar per day of the last seven, its
 * agent-time and commits), the month's interns waiting on a bench beside it. At the bottom the crew: a staff badge per
 * AI that worked in the month, hung on a lanyard from a rail: its character on a band of its color, its sessions, its
 * agent-time and its share as a bar. The sign says the month's numbers.
 */
import { CAST } from '../../../plugin/lib/cast.mjs'
import { CLOUD, K, ROLE, plural } from '../../../plugin/lib/svg-kit.mjs'
import { fmtAgentTime, fmtHours, fmtInt } from '../../../plugin/lib/format.mjs'
import { GLYPHS } from '../kit.js'
import { FRONT, LOBBY_TOP } from '../building.js'

// ---------------------------------------------------------------- paint

/** The label band at the foot of every storey, as Live's; the rooms' back wall (its face), brought forward to be read. */
export const MONTH_BAND = .62
const BAND = MONTH_BAND
const WALL_Z = -1.0
const WALL = '#17251a', WAINSCOT = '#121f14', RAIL = '#2a422f', SKIRT = '#243928'
const PLATE = '#120e0b'
// the paper calendar (svg-month's own paint)
const PAPER = '#f8f3e7', PAGE = '#ece4d2', EDGE = '#857760', GRID = '#a3957b', BLANK = '#d8cdb6', FADED = '#ab9e84', PAD = '#cbbd9f'
const INK = '#3a2a20', INK_SA = '#3a63b0', INK_SU = '#c23b2c', HONEY = '#dcaa4e'
/** Agent-time, a quiet day to the busiest: four steps on a square-root scale, so the key's swatches are exact. */
export const GREENS = ['#d5ecae', '#acd977', '#7ec04e', '#57a333']
const PAPER_WE = mix(PAPER, '#6f91dc', .13) // weekend squares: a cool tint, as on a printed calendar
const TRACE = mix(PAPER, '#e8957a', .38) // a day with sessions or commits but no agent-time on record
const FELT = '#1d1916', BRASS = '#c9a26b', BRASS_D = '#8f6d43', SOCKET = '#3a322b'
const GILT = { o: '#6b4716', d: '#a8792a', b: '#d9a640', h: '#f7d47c' }
const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
// the band under the picture, one color per month, January first
const MONTH_COLOR = ['#3c68ae', '#ad4570', '#3b8656', '#4b945c', '#a94f86', '#c4861f', '#2a80ba', '#cc6a2c', '#ad6c33', '#c0512a', '#894530', '#a52f39']
const WD2 = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** Desk classes at rest: a project with only these at its desks lights its lamp dim (model.mjs IDLE_CLASSES). */
const RESTING = new Set(['error', 'stopped', 'break', 'done', 'dozing'])

// the stickers and the portrait's trimmings (svg-month's sprites)
const CROWN = ['g..g..g', 'gg.g.gg', 'ggggggg', 'gGgjgGg', 'GGGGGGG']
const STAR = ['..o..', '.oso.', 'ossso', '.oso.', '.o.o.']
const ROSETTE = ['.rrrrr.', 'rrGGGrr', 'rGhGGGr', 'rrGGGrr', '.rrrrr.', '.rr.rr.', '.r...r.']
const TWINKLE = ['.w.', 'www', '.w.']
const ORNAMENT = {
  autumn: ['...c...', '.c.c.c.', '.ccccc.', 'ccccccc', '.ccccc.', '..ccc..', '...c...'],
  winter: ['...c...', '.c.c.c.', '..ccc..', 'ccc.ccc', '..ccc..', '.c.c.c.', '...c...'],
  spring: ['.c.c.c.', '.ccccc.', '.ccccc.', '..ccc..', '...c...', 'c..c..c', '.ccccc.'],
  summer: ['c..c..c', '.c.c.c.', '..ccc..', 'ccc.ccc', '..ccc..', '.c.c.c.', 'c..c..c'],
}

// ---------------------------------------------------------------- the month's picture

// Each month's season paint, then what its own scene paints otherwise (svg-month SEASONS and MONTH_PIC): its sky top
// down, its sun (where it stands: a share of the width and a row of the 2D picture's 34), the far range or the sea, the
// hills, the ground, its trees (round ones in three greens, pines or bare boughs), what falls and its pastime.
const SEASON_OF = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter']
const SEASONS = {
  winter: { sky: ['#46599a', '#5b70b1', '#7c92ca', '#a8bbe1'], orb: '#fff4d6', sun: [.3, 3], cloud: false, range: '#b7c6e4', snowy: true, hills: '#dbe5f4', ground: '#f2f6fc', edge: '#ffffff', turf: '#c3d2ec', tree: 'pine', fall: ['#ffffff', '#dfe8f6'], flakes: true },
  spring: { sky: ['#64b4e6', '#80c4ed', '#a2d6f3', '#c6e8f8'], orb: '#ffe27a', sun: [.72, 3], cloud: true, range: '#a3c4b8', hills: '#8ccb6a', ground: '#69aa48', edge: '#8fcf63', turf: '#4e8d39', tree: ['#fff0f6', '#f7b8d4', '#dc84ad'], fall: ['#f8bcd6', '#fde1ed'] },
  summer: { sky: ['#2b8ad6', '#45a2e3', '#68baed', '#97d0f4'], orb: '#fff27a', sun: [.72, 3], cloud: true, range: '', hills: '', ground: '#ead597', edge: '#f7e9b6', turf: '#d3b86d', tree: ['#a8de6e', '#68b943', '#3f8d31'], fall: [], birds: '#ffffff' },
  autumn: { sky: ['#d5734d', '#e28d5b', '#eca96d', '#f4c68b'], orb: '#ffe7a3', sun: [.64, 10], cloud: true, range: '#c3876a', hills: '#a6633b', ground: '#7e4a2a', edge: '#ab6431', turf: '#9e5a2e', tree: ['#f9c75c', '#ee8d36', '#c4552a'], fall: ['#e8742f', '#f4b23e', '#c8432b'], birds: '#5a3a2a' },
}
const MEADOW = { range: '#a3c4b8', hills: '#86c860', ground: '#5ea343', edge: '#86c95b', turf: '#4a8a36', tree: ['#a3db6c', '#6cbd45', '#469634'] }
const MONTH_PIC = [
  { pastime: 'skate' },
  { pastime: 'snowman', sun: [.68, 2] },
  { pastime: 'kite', sun: [.4, 2], hills: '#9fd673', ground: '#78b94d', edge: '#9dd669', turf: '#5c9a3c', tree: ['#d6f29a', '#9ed664', '#64aa3e'], fall: [] },
  { pastime: 'rain', sky: ['#7d93ad', '#90a6bd', '#a6bacd', '#bfd0de'], orb: '', cloud: false, rain: true, rainbow: true, fall: [] },
  { pastime: 'garden', tree: ['#a8de6e', '#68b943', '#3f8d31'], fall: [] },
  { pastime: 'fishing', ...MEADOW },
  { pastime: 'beach' },
  { pastime: 'sunflowers', ...MEADOW, range: '#9dbfd6', hills: '#e2c35a', ground: '#8fb24a', edge: '#b5d468', turf: '#6f9a3a' },
  { pastime: 'apples', sky: ['#4f9bd6', '#6eb0df', '#93c5e6', '#bcdbea'], orb: '#fff0a0', sun: [.7, 3], range: '#9fb8a8', hills: '#a3bf57', ground: '#76a443', edge: '#9cc95a', turf: '#5d8a35', tree: ['#efd86c', '#b2c44c', '#77a13c'], fall: ['#e8c43f', '#d88a2e'], birds: '' },
  { pastime: 'leaves' },
  { pastime: 'campfire', sky: ['#4b3f6e', '#7a4f78', '#b8686c', '#e39a72'], orb: '#ffcf7a', sun: [.72, 11], cloud: false, range: '#6d4d63', hills: '#6e5238', ground: '#5a4030', edge: '#7a5638', turf: '#4a3324', tree: 'bare', fall: ['#a0643a', '#c08040'], birds: '' },
  { pastime: 'xmas', sky: ['#34437f', '#475a99', '#6378b3', '#8aa0d2'], sun: [.8, 2] },
]
/** What the mascot does at each pastime: its pose (actors.animate). */
const PASTIME_POSE = { skate: 'stand', snowman: 'hand', kite: 'hand', rain: 'hand', garden: 'point', fishing: 'point', beach: 'back', sunflowers: 'hand', apples: 'hand', leaves: 'boss', campfire: 'point', xmas: 'stand' }
const ORB = ['...ccc...', '.ccccccc.', '.ccccccc.', 'ccccccccc', 'ccccccccc', 'ccccccccc', '.ccccccc.', '.ccccccc.', '...ccc...']
const KITE = ['...k...', '..rky..', '.rrkyy.', 'kkkkkkk', '.bbkgg.', '..bkg..', '...k...']
const PUMPKIN = ['...g...', '.ooOoo.', 'oyoOoyo', 'ooyyyoo', '.ooOoo.']
const FLAME = ['...r...', '..rr...', '..ror..', '.roor.r', '.royorr', 'roooyor', 'royyyor', '.ryyyr.']
const CRAB = ['R.k.k.R', 'RrrrrrR', '.rrrrr.', 'r.r.r.r']
const CASTLE = ['.f.......f.', '.ff......ff', '.p.......p.', 'TTT.....TTT', 'TwT.TTT.TwT', 'TTTTTwTTTTT', 'TTTTTTTTTTT', 'TTTTTddTTTT', 'TTTTTddTTTT']
const BASKET = ['..hhhhh..', '.h.....h.', '.rrRrrRr.', 'bbbbbbbbb', 'BBBBBBBBB', '.bbbbbbb.']
const FISH = ['O.ooo.', 'OOooko', 'O.ooo.']
const GEESE = ['.......kk', '....kk...', 'kk.......', '....kk...', '.......kk']
const FLY = ['pp.pp', 'ppkpp', '.p.p.']
const SUNHEAD = ['.yyy.', 'yybyy', 'ybbby', 'yybyy', '.yyy.']
const PRESENT = ['..y.y..', '...y...', 'rrryrrr', 'rrryrrr', 'yyyyyyy', 'rrryrrr', 'rrryrrr']
// an umbrella of yellow panels (15 × 5), a parasol in red and cream (13 × 4)
const BROLLY = Array.from({ length: 5 }, (_, y) => Array.from({ length: 15 }, (_, x) => Math.abs(x - 7) > [1, 4, 6, 7, 7][y] ? '.' : y === 4 && x % 3 === 0 ? '.' : Math.floor((x + 1) / 3) % 2 ? 'S' : 'Y').join(''))
const PARASOL = Array.from({ length: 4 }, (_, y) => Array.from({ length: 13 }, (_, x) => Math.abs(x - 6) > [1, 4, 6, 6][y] ? '.' : Math.floor((x + 1) / 3) % 2 ? 'W' : 'r').join(''))
// the rolling hills, a few pixels tall (svg-month hillH)
const hillH = i => Math.min(6, Math.max(1, Math.round(3 + 1.4 * Math.sin(i / 40 * 2 * Math.PI) + 1.1 * Math.sin(i / 13 * 2 * Math.PI + .7))))

// ---------------------------------------------------------------- the facts, pure

const DAY_MS = 864e5
const num = v => Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0
const msOf = d => Date.parse(`${d}T00:00:00Z`)
const dayAt = ms => new Date(ms).toISOString().slice(0, 10)
const isDay = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(msOf(d)) && dayAt(msOf(d)) === d

function mix(a, b, t) {
  const p = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255] }
  const [x, y] = [p(a), p(b)]
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}
const darker = (hex, t = .55) => mix('#000000', hex, t)

/** A day's parts: its date `d`, month `m` (0…11), year, Monday-first weekday `wdi` (0…6) and its names. */
export function dayParts(date) {
  const t = new Date(msOf(date))
  return { d: t.getUTCDate(), m: t.getUTCMonth(), y: t.getUTCFullYear(), wdi: (t.getUTCDay() + 6) % 7, wd: WEEKDAYS[t.getUTCDay()], mon: MON3[t.getUTCMonth()] }
}
/** 'Thu 22 Oct'. */
export const dayName = date => { const i = dayParts(date); return `${i.wd} ${i.d} ${i.mon}` }
/** Agent-time as a tooltip says it: '45m', '6h20', '12h'. */
export function hm(minutes) {
  const m = Math.round(num(minutes))
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`
}

/**
 * The page's days, oldest first: period.days (else the day rows' dates, else today), valid, made contiguous and capped
 * to the last 62 (page 0 is last month and this one so far), so garbage draws an empty page rather than throwing.
 */
export function monthDays(snapshot) {
  let list = (Array.isArray(snapshot?.period?.days) ? snapshot.period.days : []).filter(isDay)
  if (!list.length) list = (Array.isArray(snapshot?.days) ? snapshot.days : []).map(row => row?.date).filter(isDay)
  if (!list.length && isDay(snapshot?.now?.date)) list = [snapshot.now.date]
  if (!list.length) return []
  list = [...new Set(list)].sort()
  const last = msOf(list.at(-1)), first = Math.max(msOf(list[0]), last - 61 * DAY_MS)
  const out = []
  for (let t = first; t <= last; t += DAY_MS) out.push(dayAt(t))
  return out
}

/**
 * The page's grid, Monday first: `lead` squares of the month before the first day, then the days, then the days after
 * to the end of the last week. Each cell `{ k, col, row, date, d, inRange, future }` (future: after `today`).
 */
export function calendarCells(days, today) {
  const lead = days.length ? dayParts(days[0]).wdi : 0
  const rows = Math.max(1, Math.ceil((lead + days.length) / 7))
  const first = days.length ? msOf(days[0]) - lead * DAY_MS : null
  const cells = Array.from({ length: rows * 7 }, (_, k) => {
    const date = first == null ? null : dayAt(first + k * DAY_MS)
    return { k, col: k % 7, row: Math.floor(k / 7), date, d: date ? dayParts(date).d : null, inRange: k >= lead && k < lead + days.length, future: Boolean(date && today && date > today) }
  })
  return { lead, rows, cells }
}

/** A day's agent-time in four steps on a square-root scale (the busiest day = 4, a quiet one still shows), 0 for none. */
export const levelOf = (m, max) => (m > 0 && max > 0 ? Math.min(4, Math.max(1, Math.ceil(Math.sqrt(m / max) * 4))) : 0)

/** The month in numbers: the busiest day, days worked, the longest run of worked days, weekend agent-time. */
export function monthStats(days, minutesOf) {
  const st = { max: 0, best: '', active: 0, streak: 0, weekend: 0, total: 0, traced: 0 }
  let run = 0
  for (const d of days) {
    const m = num(minutesOf(d))
    st.total += m
    if (m > st.max) { st.max = m; st.best = d }
    if (m > 0) { st.active++; st.streak = Math.max(st.streak, ++run) } else run = 0
    if (dayParts(d).wdi >= 5) st.weekend += m
  }
  return st
}

/** 'OCTOBER 2026', 'OCTOBER – NOVEMBER 2026', or across a new year 'DEC 2025 – JAN 2026'. */
export function monthTitle(days) {
  if (!days.length) return 'THE MONTH'
  const a = dayParts(days[0]), b = dayParts(days.at(-1))
  const [A, B] = [MONTH_NAMES[a.m], MONTH_NAMES[b.m]]
  if (a.y === b.y && a.m === b.m) return `${A} ${a.y}`
  if (a.y === b.y) return `${A} – ${B} ${b.y}`
  return `${A.slice(0, 3)} ${a.y} – ${B.slice(0, 3)} ${b.y}`
}

/**
 * The calendar's plan for `rows` weeks: squares as tall as a 6-week page fits in about 5.8 units (shorter for a page
 * of up to ten weeks, never under .64 so a date and an agent-time still fit), the picture a little shorter on a long
 * page, the date's pixel and the agent-time's size by the square's height; `calH` the page from its coil to its foot.
 */
export function calendarPlan(rows) {
  const R = Math.max(1, rows)
  const ch = Math.min(.84, Math.max(.64, 4.7 / R))
  const picH = R <= 6 ? 1.42 : 1.28
  const gridH = R * ch
  return { R, ch, picH, gridH, calH: .2 + picH + .42 + .3 + gridH + .12, q: ch >= .78 ? .055 : ch >= .7 ? .048 : .044, timeSize: ch >= .78 ? .2 : .17 }
}

/** A day square's tooltip: 'Tue 14 Oct · 6h20 agent-time · 12 commits · busiest day'. */
export function dayTip(date, row = {}, { today = null, best = false, gold = false, traced = false } = {}) {
  const m = num(row?.minutes)
  return [`${dayName(date)}${date === today ? ' (today)' : ''}`, m ? `${hm(m)} agent-time` : traced ? 'sessions or commits, no agent-time on record' : 'no agent-time',
    num(row?.sessions) && plural(num(row.sessions), 'session'), num(row?.subagents) && plural(num(row.subagents), 'intern'),
    num(row?.workflows) && plural(num(row.workflows), 'meeting'), num(row?.commits) && plural(num(row.commits), 'commit'),
    best ? 'busiest day' : gold ? 'a gold-star day' : ''].filter(Boolean).join(' · ')
}

/** What stood out, as the 2D footer says it: the busiest day, days worked, the longest streak, per day, weekends. */
export function standOut(days, st, { past = false } = {}) {
  if (!days.length) return [['no days to show', ROLE.dim]]
  const spans = [st.max > 0 ? [`busiest day ${dayName(st.best)} · ${fmtHours(st.max)} agent-time`, ROLE.accent] : [past ? 'no agent-time that month' : 'no agent-time this month yet', ROLE.dim],
    [`worked ${st.active + st.traced} of ${plural(days.length, 'day')}`, ROLE.title]]
  if (st.streak > 1) spans.push([`longest streak ${st.streak} days`, ROLE.title])
  if (st.active) spans.push([`${fmtHours(st.total / st.active)} a day worked`, ROLE.dim])
  if (st.weekend) spans.push([`weekends ${fmtAgentTime(st.weekend)}`, ROLE.night])
  return spans
}

/** The sign's lines under the neon: the month's agent-time and sessions, then its interns, meetings and commits. */
export function monthSignLines(snapshot) {
  const t = snapshot?.totals ?? {}
  const minutes = num(t.minutes), sessions = num(t.sessions), commits = num(t.commits)
  if (!minutes && !sessions && !commits) return [[['0h agent-time', ROLE.title], [snapshot?.period?.past ? 'a quiet month' : 'nothing on the calendar yet', ROLE.dim]]]
  return [
    [[`${fmtAgentTime(minutes)} agent-time`, ROLE.title], [plural(sessions, 'session'), ROLE.dim]],
    [[plural(num(t.subagents), 'intern'), ROLE.intern], [plural(num(t.workflows), 'meeting'), ROLE.meeting], [plural(commits, 'commit'), ROLE.ship]],
  ]
}

/** The crew of the month, busiest first: each AI that worked in it, its agent-time, sessions (null: not counted) and share. */
export function crewOf(snapshot, cap = 6) {
  const rows = (Array.isArray(snapshot?.crew) ? snapshot.crew : []).filter(r => r && (num(r.minutes) > 0 || num(r.sessions) > 0))
  const total = rows.reduce((s, r) => s + num(r.minutes), 0)
  return rows.map(r => ({ agent: CAST[r.agent] ? r.agent : 'claude', minutes: num(r.minutes), sessions: r.sessions == null ? null : num(r.sessions), share: total ? num(r.minutes) / total : 0 }))
    .sort((a, b) => b.minutes - a.minutes || (b.sessions ?? 0) - (a.sessions ?? 0)).slice(0, cap)
}

/** The building directory: the busiest tenants first (`cap` of them), how many more and their agent-time. */
export function directoryOf(snapshot, cap = 10) {
  const all = (Array.isArray(snapshot?.projects) ? snapshot.projects : []).filter(p => p && typeof p === 'object')
  const projects = all.map((p, i) => ({ p, i })).sort((a, b) => num(b.p.minutes) - num(a.p.minutes) || num(b.p.commits) - num(a.p.commits) || a.i - b.i).map(e => e.p)
  const list = projects.slice(0, cap)
  const listed = projects.reduce((s, p) => s + num(p.minutes), 0)
  const beyond = num(snapshot?.projectsMore) ? Math.max(0, num(snapshot?.totals?.minutes) - listed) : 0
  return { list, more: projects.length - list.length + num(snapshot?.projectsMore), rest: projects.slice(cap).reduce((s, p) => s + num(p.minutes), 0) + (beyond > 5 ? beyond : 0), tenants: projects.length + num(snapshot?.projectsMore) }
}

/** A share as the badge says it: '23%', '<1%' for a sliver, '0%'. */
export const sharePct = (share, minutes) => share >= .005 ? `${Math.round(share * 100)}%` : minutes > 0 ? '<1%' : '0%'

// ---------------------------------------------------------------- the building

export function buildMonth(ctx, snapshot = {}) {
  const { THREE, kit, labels, actors } = ctx
  const { box, plant, flush } = kit
  const group = new THREE.Group()
  const storeys = [], pickables = [], figures = [], movers = []
  const flat = { castShadow: false }
  // the calendar is lit as a page under its lamp, never cut by the roof's shadow line: its parts take no shadows
  const paper = { castShadow: false, receiveShadow: false }
  const tag = (spec, x, y, z, parent) => { const l = labels.label(spec); l.position.set(x, y, z); parent.add(l); return l }
  const pick = (parent, x, y, z, w, h, d, data) => {
    const c = new THREE.Mesh(ctx.colliderGeometry, ctx.colliderMaterial)
    c.position.set(x, y, z); c.scale.set(w, h, d); Object.assign(c.userData, data)
    parent.add(c); pickables.push(c); return c
  }
  const dotted = spans => spans.flatMap((span, i) => i ? [['·', '#7a6e58', { sep: '  ' }], [span[0], span[1], { ...span[2], sep: '  ' }]] : [span])

  // ---- the page's facts
  const days = monthDays(snapshot)
  const today = isDay(snapshot.now?.date) ? snapshot.now.date : null
  const past = Boolean(snapshot.period?.past) || Boolean(today && days.length && days.at(-1) < today)
  const rowOf = new Map((Array.isArray(snapshot.days) ? snapshot.days : []).filter(r => r && isDay(r.date)).map(r => [r.date, r]))
  const mins = d => num(rowOf.get(d)?.minutes)
  const st = monthStats(days, mins)
  // a day whose sessions or commits say it was worked with no agent-time on record is tinted and counts as worked: on a
  // page of the past, or on a page with no agent-time at all (svg-month's traced days)
  const untimed = d => !mins(d) && num(rowOf.get(d)?.sessions) + num(rowOf.get(d)?.commits) > 0
  const traced = past || !st.max ? new Set(days.filter(untimed)) : new Set()
  st.traced = traced.size
  const grid = calendarCells(days, today)
  const plan = calendarPlan(grid.rows)
  const crew = crewOf(snapshot)
  const who = crew[0]?.agent ?? 'claude'
  const dir = directoryOf(snapshot)
  const star = dir.list.find(p => num(p.minutes) > 0)
  const month = days.length ? dayParts(days.at(-1)).m : (today ? dayParts(today).m : 3)
  const totals = snapshot.totals ?? {}

  // ---- the storeys, bottom up: the crew, the building directory, the wall calendar
  const P = .43, LINES = Math.max(1, dir.list.length + (dir.more ? 1 : 0))
  const boardH = .2 + .46 + LINES * P + .16
  // the crew room is a wall of badges, or a short room with the note that nobody clocked in
  const heights = [BAND + (crew.length ? 4.95 : 2.9), BAND + .7 + boardH + 1.15, BAND + Math.max(.34 + plan.calH + .64, 6.6)]
  let base = LOBBY_TOP
  const levels = heights.map((height, i) => {
    const level = new THREE.Group(); level.userData.y = base; group.add(level)
    storeys.push({ base, height, number: i + 2, group: level, floor: i })
    const out = { level, base, height }
    base += height
    return out
  })

  // ---------------------------------------------------------------- a room: slab, label band, floor, walls, lamps
  function room({ level, base, height }, lamps, lampZ = .9) {
    const fy = base + BAND, top = base + height, depth = FRONT - WALL_Z, mid = (FRONT + WALL_Z) / 2
    box(level, 0, fy - .17, 0, 16.7, .34, 6.40, K.slab)
    box(level, 0, base + BAND / 2 - .02, FRONT + .06, 16.9, BAND - .04, .32, '#1f1a16')
    box(level, 0, fy - .015, FRONT + .2, 16.9, .05, .06, K.wood)
    box(level, 0, base + .02, FRONT + .2, 16.9, .05, .06, K.woodD)
    box(level, 0, fy, mid, 16.1, .04, depth, K.woodD, flat)
    for (let row = 0; row < 8; row++) for (let col = 0; col < 17; col++) box(level, -7.52 + col * .94, fy + .05, WALL_Z + .27 + row * .52, .94, .04, .52, ['#4b3534', '#6e4d3f', '#593e35'][(row * 3 + col) % 3], flat)
    // the back wall, its wainscot, rail and skirting, as the live floor's
    box(level, 0, (fy + top + .3) / 2, WALL_Z - .1, 16.5, top + .3 - fy, .2, WALL)
    box(level, 0, fy + .47, WALL_Z + .035, 16.3, .94, .07, WAINSCOT)
    box(level, 0, fy + .98, WALL_Z + .055, 16.4, .09, .11, RAIL)
    box(level, 0, fy + .08, WALL_Z + .075, 16.4, .13, .15, SKIRT)
    for (let x = -7.8; x < 8; x += .56) box(level, x, fy + .48, WALL_Z + .09, .025, .78, .04, SKIRT)
    for (const xx of [-8.05, 8.05]) { box(level, xx, (fy + top) / 2, mid, .05, top - fy, depth, WALL); box(level, xx + (xx > 0 ? -.03 : .03), fy + .48, mid, .05, .92, depth, WAINSCOT) }
    for (const x of lamps) {
      box(level, x, top - .3, lampZ, .045, .33, .045, kit.darkSteel)
      box(level, x, top - .48, lampZ, .70, .16, .43, '#807153')
      box(level, x, top - .58, lampZ, .58, .035, .35, ctx.building.bulbMaterial)
    }
    return { fy, top }
  }
  function light(level, x, y, z, intensity, distance) {
    const l = new THREE.PointLight('#ffd28c', intensity, distance, 2)
    l.position.set(x, y, z); l.userData.nightIntensity = intensity
    level.add(l); ctx.lights.push(l)
  }
  /** The 3 × 5 pixel font extruded, left-aligned at x, its top at yTop (each row's runs one box): the 2D page's dates. */
  function digits(parent, text, x, yTop, z, q, color, depth = .022) {
    let cx = x
    for (const ch of String(text)) {
      const g = GLYPHS[ch]
      if (g) for (let r = 0; r < 5; r++) for (let c = 0; c < 3;) {
        if (g[r * 3 + c] !== '1') { c++; continue }
        let e = c
        while (e < 3 && g[r * 3 + e] === '1') e++
        box(parent, cx + (c + e) / 2 * q, yTop - (r + .5) * q, z + depth / 2, (e - c) * q, q, depth, color, paper)
        c = e
      }
      cx += 4 * q
    }
  }
  /** Pixel-art rows extruded (kit.sprite, a run of one color one box), taking no shadow: x its middle, y its bottom row's. */
  function spr(parent, rows, legend, x, y, z, pixel, depth, opts = paper) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length;) {
        const color = legend[row[i]]
        let e = i + 1
        while (e < row.length && row[e] === row[i]) e++
        if (color) box(parent, x + ((i + e - 1) / 2 - (row.length - 1) / 2) * pixel, y + (rows.length - 1 - j) * pixel, z, (e - i) * pixel, pixel, depth, color, opts)
        i = e
      }
    })
  }
  /** A rod from (x1, y1) to (x2, y2) at depth z (kit.beam, taking no shadow). */
  const rod = (parent, x1, y1, x2, y2, z, width, color, opts = paper) => box(parent, (x1 + x2) / 2, (y1 + y2) / 2, z, width, Math.hypot(x2 - x1, y2 - y1), width, color, { ...opts, rotate: -Math.atan2(x2 - x1, y2 - y1) })
  /** A character standing at (x, y, z), its feet there, posed every frame; `lit` ones take no shadow (on the calendar's wall). */
  const unshadowed = []
  function cast(parent, agent, x, y, z, p, pose, extra = {}) {
    const actor = actors.figure(agent, { p, legs: true, depth: Math.max(.08, p * 3.4) })
    actor.root.position.set(x, y, z)
    parent.add(actor.root)
    figures.push({ actor, pose, ...extra })
    if (extra.lit) unshadowed.push(actor.root)
    return actor
  }

  // ================================================================ 4F: the wall calendar
  {
    const L = levels[2], { level } = L
    const { fy, top } = room(L, [-6.3, 1.1], 2.2)
    light(level, -2.35, top - .95, 2.0, 30, 14)
    const { ch, picH, gridH, calH, q, timeSize } = plan
    const X0 = -7.45, X1 = 2.75, W = X1 - X0, CX = (X0 + X1) / 2, M = .14
    const cw = (W - 2 * M) / 7, gx0 = X0 + M
    const bottom = fy + .34, calTop = bottom + calH, midY = (bottom + calTop) / 2
    const zp = -.75 // the paper's face
    // the pad of pages under the page, the page's edge, the page
    box(level, CX + .03, midY - .05, -.82, W - .04, calH, .04, PAD, paper)
    box(level, CX, midY, -.79, W, calH, .04, EDGE, paper)
    box(level, CX, midY, zp - .015, W - .06, calH - .06, .03, PAGE, { ...paper, glow: .2 })
    // the wire coil over the top edge, a loop every .2 from a punched hole, parted in the middle for the hanger
    for (let x = X0 + .24; x < X1 - .15; x += .2) {
      if (Math.abs(x - CX) < .3) continue
      box(level, x, calTop - .075, zp + .001, .07, .05, .004, '#3b2f27', paper)
      box(level, x, calTop + .02, zp + .015, .035, .17, .035, '#c9ced8', paper)
      box(level, x + .012, calTop + .09, zp + .03, .02, .03, .02, '#f4f6f9', paper)
      box(level, x - .012, calTop - .04, zp - .05, .035, .12, .035, '#7d828c', paper)
    }
    rod(level, CX - .28, calTop + .03, CX, calTop + .42, zp - .03, .03, '#8a8f96')
    rod(level, CX + .28, calTop + .03, CX, calTop + .42, zp - .03, .03, '#8a8f96')
    box(level, CX, calTop + .44, (WALL_Z + zp) / 2, .08, .08, .34, '#d7dbe2')

    // the month's picture, then its band in the month's color with the season's ornaments, then the weekday initials
    const gTop = bottom + .12 + gridH, bandY0 = gTop + .3, bandY1 = bandY0 + .42, bandY = (bandY0 + bandY1) / 2
    picture(level, gx0, bandY1, 7 * cw, picH, zp, month, who)
    box(level, CX, bandY, zp + .015, 7 * cw, .42, .03, MONTH_COLOR[month], { ...paper, glow: .18 })
    box(level, CX, bandY1 - .02, zp + .031, 7 * cw, .04, .004, mix(MONTH_COLOR[month], '#ffffff', .3), paper)
    box(level, CX, bandY0 + .02, zp + .031, 7 * cw, .04, .004, darker(MONTH_COLOR[month], .7), paper)
    const title = monthTitle(days)
    tag({ lines: [{ spans: [[title, '#fff8e8', { pixel: true }]], size: .34, align: 'center' }], width: 7 * cw - .2, pad: .02 }, CX, bandY, zp + .034, level)
    const tw = labels.measure(title, .34, { pixel: true })
    if (tw + 1.2 < 7 * cw) for (const s of [-1, 1]) spr(level, ORNAMENT[SEASON_OF[month]], { c: kit.mat('#ffe9c4', .2) }, CX + s * (tw / 2 + .32), bandY - .12, zp + .036, .04, .012)
    WD2.forEach((w, i) => tag({ lines: [{ spans: [[w, i === 5 ? INK_SA : i === 6 ? INK_SU : INK, { bold: true }]], size: .2, align: 'center' }], width: cw - .1, pad: .02 }, gx0 + (i + .5) * cw, gTop + .15, zp + .004, level))

    // the squares: lit from above (a light top edge, a shaded foot), raised by agent-time, each with its date, its
    // agent-time and its sticker
    box(level, CX, bottom + .12 + gridH / 2, zp + .005, 7 * cw + .03, gridH + .03, .01, GRID, paper)
    const sq = Math.min(.05, ch * .062) // a sticker's pixel
    for (const cell of grid.cells) {
      const x = gx0 + (cell.col + .5) * cw, y = gTop - (cell.row + .5) * ch
      const inPage = cell.inRange && !cell.future
      const m = inPage ? mins(cell.date) : 0
      const lvl = inPage ? levelOf(m, st.max) : 0
      const fill = !inPage ? BLANK : traced.has(cell.date) ? TRACE : lvl ? GREENS[lvl - 1] : cell.col >= 5 ? PAPER_WE : PAPER
      const dz = .03 + lvl * .05, face = zp + .01 + dz, tw = cw - .06, th = ch - .06
      box(level, x, y, zp + .01 + dz / 2, tw, th, dz, fill, { ...paper, glow: inPage ? .2 : .1 })
      box(level, x, y + th / 2 - .02, face + .001, tw, .04, .002, mix(fill, '#ffffff', .45), paper)
      box(level, x, y - th / 2 + .02, face + .001, tw, .04, .002, darker(fill, .82), paper)
      if (cell.d != null) digits(level, String(cell.d), x - cw / 2 + .1, y + ch / 2 - .1, face, q, !inPage ? FADED : cell.col === 5 ? INK_SA : cell.col === 6 ? INK_SU : INK)
      if (!inPage) continue
      if (m > 0) tag({ lines: [{ spans: [[fmtHours(m), INK, { bold: true }]], size: timeSize }], pad: .02, anchor: 'right' }, x + cw / 2 - .09, y - ch / 2 + .06 + timeSize / 2 + .02, face + .004, level)
      const isBest = cell.date === st.best && st.max > 0, gold = !isBest && lvl === 4
      const right = x + cw / 2 - .1, topY = y + ch / 2 - .09
      if (isBest) spr(level, CROWN, { g: kit.mat('#eec96f', .35), G: '#c8963a', j: '#6f91dc' }, right - 3.5 * sq, topY - 4.5 * sq, face + .02, sq, .04)
      else if (gold) spr(level, STAR, { o: '#c98a14', s: kit.mat('#ffd85a', .35) }, right - 2.5 * sq, topY - 4.5 * sq, face + .02, sq, .04)
      const isToday = cell.date === today && !past
      if (isToday) {
        // today: its square edged in soft gold over the grid line, a tiny figure hopping on it
        const e = .05, w = cw - .02, h = ch - .02, honey = kit.mat(HONEY, .6)
        for (const [dx, dy, bw, bh] of [[0, h / 2, w + e, e], [0, -h / 2, w + e, e], [-w / 2, 0, e, h], [w / 2, 0, e, h]]) box(level, x + dx, y + dy, face + .012, bw, bh, .025, honey, paper)
        // as tall as the corner under the date leaves it, its feet on the square's foot
        const p = Math.min(.03, (ch - .16 - 5 * q - .08) / 10)
        cast(level, who, x - cw / 2 + .1 + 8.5 * p, y - ch / 2 + .05, face + .06, p, 'stand', { hop: y - ch / 2 + .05, lit: true })
      }
      pick(level, x, y, zp + .16, cw, ch, .32, { day: cell.date, text: dayTip(cell.date, rowOf.get(cell.date), { today: past ? null : today, best: isBest, gold, traced: traced.has(cell.date) }) })
    }
    if (!days.length) tag({ lines: [{ spans: [['no days to show', INK]], size: .2, align: 'center' }], width: 4, pad: .04 }, CX, gTop - ch / 2, zp + .06, level)

    // ---- the wall beside it: the employee of the month under its picture light, the key, Clawd with a pointer
    const COL = 5.45, FW = 3.2, FH = 2.5, frameTop = calTop - .1, fcy = frameTop - FH / 2, PZ = -.9
    const color = star?.color ?? ROLE.dim
    box(level, COL + .05, fcy - .05, PZ - .02, FW, FH, .06, '#0d0a08', paper) // its shadow on the wall
    box(level, COL, fcy, PZ, FW, FH, .1, GILT.o, paper)
    box(level, COL, fcy, PZ + .03, FW - .08, FH - .08, .1, GILT.b, { ...paper, glow: .12 })
    box(level, COL, fcy + FH / 2 - .1, PZ + .085, FW - .16, .06, .02, kit.mat(GILT.h, .2), paper)
    box(level, COL - FW / 2 + .1, fcy, PZ + .085, .06, FH - .16, .02, kit.mat(GILT.h, .2), paper)
    box(level, COL, fcy - FH / 2 + .1, PZ + .085, FW - .16, .06, .02, GILT.d, paper)
    box(level, COL + FW / 2 - .1, fcy, PZ + .085, .06, FH - .16, .02, GILT.d, paper)
    box(level, COL, fcy, PZ + .05, FW - .42, FH - .42, .1, GILT.o, paper)
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const rx = COL + sx * (FW / 2 - .1), ry = fcy + sy * (FH / 2 - .1); box(level, rx, ry, PZ + .1, .16, .05, .02, kit.mat(GILT.h, .3), paper); box(level, rx, ry, PZ + .1, .05, .16, .02, kit.mat(GILT.h, .3), paper) }
    // the backdrop tinted with the project's color, a soft spotlight behind the sitter, a lit floor under it
    const iw = FW - .5, ih = FH - .5
    box(level, COL, fcy, PZ + .085, iw, ih, .06, darker(color, .3), { ...paper, glow: .15 })
    box(level, COL, fcy + .12, PZ + .118, iw * .6, ih * .62, .004, darker(color, .44), paper)
    box(level, COL, fcy - ih / 2 + .22, PZ + .119, iw, .18, .004, darker(color, .5), paper)
    if (star) {
      const sitter = (Array.isArray(star.crew) ? [...star.crew] : []).filter(c => c && CAST[c.agent]).sort((a, b) => num(b.minutes) - num(a.minutes))[0]?.agent ?? who
      cast(level, sitter, COL, fcy - ih / 2 + .17, PZ + .26, .108, 'boss', { lit: true })
      const tip = `employee of the month: ${star.name}${sitter === 'claude' ? '' : ` (${CAST[sitter].who})`} · ${hm(star.minutes)} agent-time · ${plural(num(star.commits), 'commit')}`
      pick(level, COL, fcy - .3, PZ + .3, FW, FH + .9, .5, { project: star.name, text: tip })
    } else tag({ lines: [{ spans: [['?', ROLE.dim, { pixel: true }]], size: .9, align: 'center' }], pad: .02 }, COL, fcy, PZ + .125, level)
    spr(level, ROSETTE, { r: kit.mat('#d23c3c', .15), G: GILT.b, h: GILT.h }, COL + FW / 2 - .28, fcy - FH / 2 + .14, PZ + .16, .06, .04)
    // the brass picture light over the frame, its bulb lit
    box(level, COL, frameTop + .26, PZ + .26, 1.5, .12, .22, BRASS, { ...paper, glow: .15 })
    box(level, COL, frameTop + .19, PZ + .32, 1.3, .03, .09, ctx.building.bulbMaterial, paper)
    box(level, COL, frameTop + .28, PZ + .06, .07, .07, .3, BRASS_D, paper)
    // sparkles around the frame, twinkling in turn
    for (const [dx, dy, ph] of [[-FW / 2 - .22, FH / 2 - .4, 0], [FW / 2 + .2, .15, 1.3], [-FW / 2 - .16, -FH / 2 + .3, 2.6]]) {
      const tw = new THREE.Group(); level.add(tw)
      spr(tw, TWINKLE, { w: kit.mat('#fff6c8', .9) }, COL + dx, fcy + dy, PZ + .12, .05, .02)
      movers.push(t => { tw.visible = Math.sin(t * 2.2 + ph) > .1 })
    }
    // its caption: EMPLOYEE OF THE MONTH, the project in its color, its agent-time and who sat for it
    const capTop = fcy - FH / 2 - .14
    const caption = star
      ? [{ spans: [['EMPLOYEE OF THE MONTH', ROLE.accent, { pixel: true }]], size: .24, align: 'center', gap: .2 }, { spans: [[star.name, color, { pixel: true }]], size: .36, align: 'center', gap: .15 }, { spans: [[`${fmtAgentTime(num(star.minutes))} agent-time`, ROLE.title], [plural(num(star.commits), 'commit'), ROLE.ship]], size: .17, align: 'center' }]
      : [{ spans: [['EMPLOYEE OF THE MONTH', ROLE.accent, { pixel: true }]], size: .24, align: 'center', gap: .2 }, { spans: [['the position is open', ROLE.dim]], size: .16, align: 'center' }]
    const cap = tag({ lines: caption, width: FW + .5, pad: .08, bg: PLATE, alpha: .94, radius: .04, anchor: 'top' }, COL, capTop, PZ + .02, level)
    const capBottom = capTop - cap.userData.size[1]
    // the key: what a square's shade, its gold edge, a star and the crown say
    keyCard(level, COL, capBottom - .2, PZ + .02, 4.3)
    // Clawd by the page, tapping it with a pointer
    const clawd = cast(level, 'claude', 3.95, fy, -.45, .07, 'look', { tap: true })
    const hand = { x: -8.2 * .07, y: 5 * .07 }, tip = { x: X1 - .35 - 3.95, y: bottom + .42 - fy }
    rod(clawd.leftArm, hand.x, hand.y, tip.x, tip.y, 0, .035, '#e8d2a0')
    box(clawd.leftArm, tip.x, tip.y, 0, .05, .05, .05, INK)
    pick(level, 3.95, fy + .4, -.4, 1.3, .9, .6, { text: `Clawd checks the calendar: worked ${st.active + st.traced} of ${plural(days.length, 'day')}` })
    plant(level, 7.45, fy, .3, .72)
    plant(level, -7.62, fy, .5, .55)
    // on the label band, what stood out
    const line = standOut(days, st, { past })
    if (st.max > 0) spr(level, CROWN, { g: kit.mat('#eec96f', .35), G: '#c8963a', j: '#6f91dc' }, -7.33, L.base + BAND / 2 - .12, FRONT + .25, .05, .04)
    tag({ lines: [{ spans: dotted(line), size: .17 }], width: st.max > 0 ? 15.25 : 15.55, pad: .03, anchor: 'left' }, st.max > 0 ? -7.08 : -7.4, L.base + BAND / 2 - .02, FRONT + .23, level)
  }

  /** The key card: less ▢▢▢▢▢ more agent-time, then ▣ today (not on a page of the past), ★ top day, ♛ busiest. */
  function keyCard(level, cx, yTop, z, w) {
    const h = .92, x0 = cx - w / 2 + .18, size = .18
    box(level, cx, yTop - h / 2, z - .02, w, h, .04, PLATE, paper)
    box(level, cx, yTop - .015, z + .002, w, .03, .01, BRASS_D, paper)
    const y1 = yTop - .28, y2 = yTop - .66
    const text = (s, x, y, color = ROLE.dim) => { tag({ lines: [{ spans: [[s, color]], size }], pad: .01, anchor: 'left' }, x, y, z + .01, level); return x + labels.measure(s, size) + .02 }
    let x = text('less', x0, y1) + .08
    ;[PAPER, ...GREENS].forEach((c, i) => box(level, x + .11 + i * .26, y1, z + .02 + i * .012, .21, .21, .04 + i * .024, c, { ...paper, glow: .2 }))
    text('more agent-time', x + 1.4, y1)
    x = x0
    if (!past) {
      box(level, x + .11, y2, z + .02, .21, .21, .04, PAPER, { ...paper, glow: .2 })
      for (const [dx, dy, bw, bh] of [[0, .125, .29, .04], [0, -.125, .29, .04], [-.125, 0, .04, .25], [.125, 0, .04, .25]]) box(level, x + .11 + dx, y2 + dy, z + .05, bw, bh, .02, kit.mat(HONEY, .6), paper)
      x = text('today', x + .32, y2) + .2
    }
    spr(level, STAR, { o: '#c98a14', s: kit.mat('#ffd85a', .35) }, x + .12, y2 - .1, z + .03, .05, .03)
    x = text('top day', x + .3, y2) + .2
    spr(level, CROWN, { g: kit.mat('#eec96f', .35), G: '#c8963a', j: '#6f91dc' }, x + .17, y2 - .1, z + .03, .05, .03)
    text('busiest', x + .4, y2)
  }

  // ---------------------------------------------------------------- the month's picture
  function picture(level, x0, y0, w, h, z, month, who) {
    // the picture is printed on the page: nothing in it takes a shadow
    const box = (parent, x, y, z, w, h, d, color, opts = {}) => kit.box(parent, x, y, z, w, h, d, color, { ...opts, castShadow: false, receiveShadow: false })
    const S = { ...SEASONS[SEASON_OF[month]], ...MONTH_PIC[month] }
    const pic = new THREE.Group(); level.add(pic)
    const q = h / 34, gh = h * .28, gy = y0 + gh, cx = x0 + w / 2, at = f => x0 + w * f
    // the sky in four bands, top down
    const skyH = h - gh
    S.sky.forEach((c, i) => box(pic, cx, y0 + h - (i + .5) * skyH / 4, z + .004, w, skyH / 4 + .001, .008, c, { ...flat, glow: .2 }))
    // the sun where the month has it (low in autumn, setting in November), a cloud drifting by (two in the rain)
    if (S.orb) {
      const ox = at(S.sun[0]) + 4.5 * q, oy = y0 + h - (S.sun[1] + 8.5) * q
      box(pic, ox, oy + 4 * q, z + .01, 13 * q, 9 * q, .004, mix(S.orb, S.sky[1], .55), { ...flat, glow: .3 })
      box(pic, ox, oy + 4 * q, z + .01, 9 * q, 13 * q, .004, mix(S.orb, S.sky[1], .55), { ...flat, glow: .3 })
      spr(pic, ORB, { c: kit.mat(S.orb, .7) }, ox, oy, z + .016, q, .006)
    }
    const cloud = (fx, fy, light, shade) => {
      const g = new THREE.Group(); pic.add(g)
      spr(g, CLOUD, { c: kit.mat(light, .3), s: shade }, at(fx), y0 + h - fy * q, z + .021, q, .004)
      const x = g.position.x
      movers.push(t => { g.position.x = x + Math.sin(t * .15 + fx * 9) * .25 })
    }
    if (S.cloud) cloud(.2, 7, '#ffffff', '#dce7f2')
    if (S.rain) { cloud(.16, 7, '#e4e9ef', '#b4bfcc'); cloud(.58, 9, '#e4e9ef', '#b4bfcc') }
    if (S.birds) for (const [fx, fy] of [[.38, 6], [.43, 8], [.47, 5]]) { box(pic, at(fx), y0 + h - fy * q, z + .021, q, q, .004, S.birds, flat); box(pic, at(fx) + 2 * q, y0 + h - fy * q, z + .021, q, q, .004, S.birds, flat); box(pic, at(fx) + q, y0 + h - (fy + 1) * q, z + .021, q, q, .004, S.birds, flat) }
    // a rainbow behind the shower
    if (S.rainbow) {
      const rx = at(.7), r0 = Math.min(skyH * .95, 1.15)
      ;['#ef6a5a', '#f6c94a', '#86cc62', '#6aa8e8'].forEach((c, b) => {
        const r = r0 - b * q * 1.1, n = Math.ceil(Math.PI * r / (q * 1.2))
        for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; box(pic, rx + Math.cos(a) * r, gy + Math.sin(a) * r, z + .013, q * 1.3, q * 1.1, .004, c, { ...flat, glow: .25 }) }
      })
    }
    // far away: the range (snow-capped in winter) or the sea; the hills
    if (S.range) {
      for (const [fx, ph] of [[.06, 9], [.24, 12], [.42, 8], [.6, 11], [.8, 10], [.97, 8]]) {
        for (let r = 0; r < ph; r++) {
          const half = Math.min((ph - r) * q * 1.6, at(1) - at(fx), at(fx) - x0 + (ph - r) * q * 1.6)
          const left = Math.max(x0, at(fx) - (ph - r) * q * 1.6), right = Math.min(x0 + w, at(fx) + (ph - r) * q * 1.6)
          if (right - left <= 0 || half <= 0) continue
          box(pic, (left + right) / 2, gy + (r + .5) * q, z + (S.snowy && r >= ph - 3 ? .024 : .022), right - left, q, .004, S.snowy && r >= ph - 3 ? '#f4f8ff' : S.range, flat)
        }
      }
    } else {
      box(pic, cx, gy + 4.5 * q, z + .022, w, 9 * q, .004, '#3b8dc5', { ...flat, glow: .15 })
      box(pic, cx, gy + 8.5 * q, z + .024, w, q, .004, '#a9d8f0', flat)
      box(pic, cx, gy + 1.5 * q, z + .024, w, 3 * q, .004, '#3480b6', flat)
      for (let i = 0; i < 5; i++) box(pic, at(.12 + i * .19), gy + (5 + (i % 2) * 2) * q, z + .026, 2 * q, q * .8, .004, '#ffffff', flat)
    }
    if (S.hills) for (let i = 0; i < 40; i++) { const hh = hillH(i) * q; box(pic, x0 + (i + .5) * w / 40, gy + hh / 2, z + .028, w / 40 + .001, hh, .004, S.hills, flat) }
    // near: the ground with its lit edge and tufts
    box(pic, cx, y0 + gh / 2, z + .02, w, gh, .04, S.ground, { ...flat, glow: .12 })
    box(pic, cx, gy - q / 2, z + .041, w, q, .002, S.edge, flat)
    for (let i = 0; i < 12; i++) box(pic, x0 + w * ((i * .137 + .04) % 1), gy - (3 + (i % 3) * 2) * q, z + .041, q, q, .002, S.turf, flat)
    // a big tree framing each side, small ones on the hills
    tree(pic, x0 + .45, gy - q, z + .05, S.tree, q, 1)
    tree(pic, x0 + w - .45, gy - q, z + .05, S.tree, q, 1)
    if (S.hills && S.tree !== 'bare') for (const f of [.14, .25, .76, .87]) tree(pic, at(f), gy + 2 * q, z + .032, S.tree, q, .45)
    // the mascot at the month's pastime, and what it needs
    const p = q * .95, depth = .1
    const mascot = (x, y = gy - q * .2) => cast(pic, who, x, y, z + .09, p, PASTIME_POSE[S.pastime], { lit: true })
    // where its right hand is in its pose (actors.animate): raised for a hand, held out to point, else at its side
    const hand = actor => { const pose = PASTIME_POSE[S.pastime], [dx, dy] = pose === 'hand' ? [7.7, 9.6] : pose === 'point' ? [9.6, 6] : [8, 5]; return { x: actor.root.position.x + dx * p, y: actor.root.position.y + dy * p } }
    const mover = (g, f) => movers.push(t => f(g, t))
    switch (S.pastime) {
      case 'skate': {
        // a frozen pond, lit on its far edge, and the mascot gliding to and fro on it
        box(pic, cx, gy - 2.6 * q, z + .043, w * .44, 4 * q, .006, '#cfe6f7', { ...flat, glow: .2 })
        box(pic, cx, gy - .9 * q, z + .047, w * .4, q * .8, .004, '#eaf6fe', flat)
        box(pic, cx, gy - 4.3 * q, z + .047, w * .4, q * .7, .004, '#b4d3ec', flat)
        for (const f of [-.12, .05, .14]) box(pic, cx + w * f, gy - 2.5 * q, z + .049, 3 * q, q * .6, .002, '#ffffff', flat)
        const a = mascot(cx, gy - 2.4 * q)
        for (const s of [-1, 1]) box(a.body, s * 5 * p, -.4 * p, 0, 5 * p, .5 * p, depth * .8, '#9aa3b4', flat)
        mover(a.root, (r, t) => { r.position.x = cx + Math.sin(t * .8) * w * .14 })
        break
      }
      case 'snowman': {
        // a snow-Clawd beside it: coal eyes, a carrot, stick arms and a top hat; snowballs piled up
        const sx = cx + .75, b = gy - q
        box(pic, sx, b + 5 * q, z + .07, 14 * q, 10 * q, .1, kit.mat('#f7fbff', .15))
        box(pic, sx, b + 1 * q, z + .121, 14 * q, 2 * q, .004, '#c5d4ec', flat)
        for (const s of [-1, 1]) { box(pic, sx + s * 3 * q, b + 7 * q, z + .121, q, 2 * q, .004, '#2b2b33', flat); box(pic, sx + s * 9 * q, b + 6 * q, z + .08, 4 * q, q * .8, .02, '#6b4226', flat) }
        box(pic, sx, b + 5 * q, z + .13, 3 * q, q, .03, '#f08a2a', flat)
        box(pic, sx, b + 11 * q, z + .07, 9 * q, q, .08, '#24242c'); box(pic, sx, b + 13.5 * q, z + .07, 6 * q, 4 * q, .08, '#24242c'); box(pic, sx, b + 12 * q, z + .112, 6 * q, q, .004, '#c93a32', flat)
        for (const [dx, dy] of [[-1.2, 0], [-1.05, 0], [-1.13, 1.6]]) box(pic, cx + dx * .9, b + (1 + dy) * q, z + .07, 2.2 * q, 2 * q, .05, '#ffffff', flat)
        const a = mascot(cx - .55)
        const ball = new THREE.Group(); pic.add(ball); box(ball, hand(a).x, hand(a).y + q, z + .14, 2 * q, 2 * q, .04, '#ffffff', flat)
        mover(ball, (g, t) => { g.position.y = Math.abs(Math.sin(t * 1.6)) * .14 })
        break
      }
      case 'kite': {
        // flying a kite over the daffodils, the kite bobbing on its string, its tail of bows
        const a = mascot(cx - .7)
        const k = new THREE.Group(); pic.add(k)
        const kx = cx + 1.1, ky = gy + skyH * .58
        spr(k, KITE, { k: '#5a3a2a', r: kit.mat('#e5463c', .2), y: kit.mat('#ffd447', .2), b: '#4a8fd8', g: '#5aa23c' }, kx, ky, z + .06, q * 1.1, .03)
        for (const [dy, c] of [[1.5, '#f4f4f4'], [3, '#e5463c'], [4.5, '#f4f4f4'], [6, '#ffd447']]) box(k, kx + (dy % 3 ? q : -q), ky - dy * q, z + .06, 2 * q, q, .02, c, flat)
        const hd = hand(a)
        rod(pic, hd.x, hd.y, kx, ky + q, z + .055, .012, '#f4f4f4')
        mover(k, (g, t) => { g.position.set(Math.sin(t * .9) * .05, Math.sin(t * 1.3) * .06, 0) })
        for (const f of [.08, .16, .84, .92]) { box(pic, at(f), gy + q, z + .05, q * .6, 3 * q, .02, '#5aa23c', flat); box(pic, at(f), gy + 3 * q, z + .055, 2 * q, 1.5 * q, .03, '#ffd447', flat); box(pic, at(f), gy + 3 * q, z + .07, q, q, .01, '#f29a2a', flat) }
        break
      }
      case 'rain': {
        // under an umbrella in the shower, puddles rippling either side
        mascot(cx)
        spr(pic, BROLLY, { Y: kit.mat('#f6c431', .15), S: '#e0a020' }, cx + 2 * q, gy + 13 * q, z + .14, q, .04)
        box(pic, cx + 2 * q, gy + 8 * q, z + .13, q * .6, 6 * q, .02, '#5a3a2a', flat)
        for (const f of [.2, .78]) { box(pic, at(f), gy - 2 * q, z + .043, 10 * q, 1.5 * q, .004, '#7fa6c8', flat); box(pic, at(f), gy - 1.3 * q, z + .046, 8 * q, q * .6, .002, '#b9d4ea', flat) }
        for (let i = 0; i < 7; i++) {
          const drop = box(pic, 0, 0, z + .15, .012, .07, .01, '#dbe8f4', { dynamic: true, castShadow: false })
          const dx = x0 + w * ((i * .149 + .06) % 1)
          mover(drop, (d, t) => { const k = (t * 1.3 + i / 7) % 1; d.position.set(dx - k * .08, y0 + h - .1 - k * (skyH - .05), z + .15) })
        }
        break
      }
      case 'garden': {
        // watering the tulips, a butterfly flitting over them
        mascot(cx + .1)
        for (const [f, c] of [[.12, '#e8434f'], [.17, '#f07cb5'], [.22, '#ffd447'], [.27, '#e8434f'], [.73, '#ffd447'], [.78, '#e8434f'], [.83, '#f07cb5'], [.88, '#ffd447']]) {
          box(pic, at(f), gy + 1.5 * q, z + .05, q * .7, 4 * q, .02, '#3f8a3a', flat); box(pic, at(f), gy + 4 * q, z + .055, 2.4 * q, 2 * q, .03, kit.mat(c, .15), flat)
        }
        box(pic, cx - .45, gy + 4 * q, z + .12, 5 * q, 4 * q, .06, '#5a9bd4'); rod(pic, cx - .45 - 2.5 * q, gy + 5 * q, cx - .45 - 5.5 * q, gy + 7 * q, z + .12, q * .8, '#3f78ad')
        const fly = new THREE.Group(); pic.add(fly)
        spr(fly, FLY, { p: kit.mat('#f6b23a', .25), k: '#3a2a20' }, at(.22), gy + 9 * q, z + .14, q, .02)
        mover(fly, (g, t) => { g.position.set(Math.sin(t * .7) * .5, Math.abs(Math.sin(t * 2.3)) * .12, 0) })
        break
      }
      case 'fishing': {
        // fishing from the bank of a lake, the float bobbing, a fish jumping now and then
        const lx = at(.66)
        box(pic, lx, gy - 2.4 * q, z + .043, w * .42, 4 * q, .006, '#4a9bd6', { ...flat, glow: .15 })
        box(pic, lx, gy - .8 * q, z + .047, w * .38, q * .8, .004, '#9fd3f2', flat)
        for (const f of [.5, .82]) box(pic, at(f), gy - 1.6 * q, z + .049, 3 * q, q * .8, .004, '#5fae43', flat)
        const a = mascot(at(.3))
        const tipX = lx - .3, tipY = gy + 9 * q
        rod(pic, hand(a).x, hand(a).y, tipX, tipY, z + .13, .014, '#8a5a2e')
        rod(pic, tipX, tipY, tipX + .15, gy - 1.5 * q, z + .12, .006, '#eef4fa')
        const float = new THREE.Group(); pic.add(float)
        box(float, tipX + .15, gy - q, z + .12, 2 * q, q, .03, '#e5463c', flat); box(float, tipX + .15, gy - 2 * q, z + .12, 2 * q, q, .03, '#ffffff', flat)
        mover(float, (g, t) => { g.position.y = (Math.floor(t * 1.5) % 2) * q })
        const fish = new THREE.Group(); pic.add(fish)
        spr(fish, FISH, { o: '#f08a3a', O: '#d0642a', k: '#2b2b33' }, lx + .8, gy, z + .12, q, .03)
        mover(fish, (g, t) => { const k = (t / 5) % 1, on = k > .7; g.visible = on; const u = (k - .7) / .3; g.position.set(u * .5, Math.sin(u * Math.PI) * .35, 0) })
        break
      }
      case 'beach': {
        // on the beach between a sandcastle and a parasol, a crab scuttling by
        box(pic, cx, gy + .5 * q, z + .043, w, q, .004, '#7cc0ea', flat)
        mascot(cx)
        spr(pic, CASTLE, { T: '#e2c27a', w: '#b8955a', d: '#a8854a', p: '#7a5236', f: kit.mat('#e5463c', .2) }, at(.27), gy - 3 * q, z + .07, q, .05)
        spr(pic, PARASOL, { r: kit.mat('#e5463c', .15), W: '#fff8ec' }, at(.7), gy + 14 * q, z + .08, q * 1.1, .04)
        box(pic, at(.7), gy + 6 * q, z + .075, q * .7, 13 * q, .02, '#7a5236', flat)
        box(pic, at(.62), gy - 2.5 * q, z + .045, 12 * q, 2 * q, .006, '#e5463c', flat)
        const crab = new THREE.Group(); pic.add(crab)
        spr(crab, CRAB, { r: '#e5463c', R: '#c93a32', k: '#2b2b33' }, at(.82), gy - 2 * q, z + .08, q, .03)
        mover(crab, (g, t) => { g.position.x = Math.sin(t * .9) * .25 })
        break
      }
      case 'sunflowers': {
        // among sunflowers that nod in the breeze, an ice cream held up
        const a = mascot(cx)
        for (const [f, hh] of [[.14, 15], [.21, 17], [.28, 14], [.72, 16], [.79, 14], [.86, 17]]) {
          const s = new THREE.Group(); pic.add(s)
          box(s, at(f), gy + hh * q / 2, z + .05, q * .7, hh * q, .02, '#4f8f34', flat)
          spr(s, SUNHEAD, { y: kit.mat('#f6c431', .2), b: '#6b3d1e' }, at(f), gy + (hh - 1) * q, z + .065, q, .03)
          mover(s, (g, t) => { g.position.x = Math.sin(t * 1.4 + f * 11) * q * .8 })
        }
        const hd = hand(a)
        box(pic, hd.x, hd.y, z + .15, 1.4 * q, 2.6 * q, .03, '#d9a55a', flat); box(pic, hd.x, hd.y + 2 * q, z + .15, 2.4 * q, 2 * q, .04, kit.mat('#f59ab8', .2), flat)
        break
      }
      case 'apples': {
        // picking apples under an apple tree, one falling, a basket of them beside
        mascot(cx - .45)
        const tx = cx + .55
        box(pic, tx, gy + 5 * q, z + .05, 3 * q, 10 * q, .04, '#6b4226', flat)
        box(pic, tx, gy + 15 * q, z + .055, 18 * q, 11 * q, .05, '#68b943'); box(pic, tx - 3 * q, gy + 18 * q, z + .065, 9 * q, 6 * q, .05, '#a8de6e', flat); box(pic, tx + 4 * q, gy + 12 * q, z + .065, 8 * q, 5 * q, .05, '#3f8d31', flat)
        for (const [dx, dy] of [[-6, 12], [-2, 17], [3, 14], [6, 18], [1, 10], [-5, 19]]) box(pic, tx + dx * q, gy + dy * q, z + .09, 2 * q, 2 * q, .03, kit.mat('#d8342c', .15), flat)
        spr(pic, BASKET, { h: '#7a5226', r: '#d8342c', R: '#b02a22', b: '#b07a3e', B: '#8a5a2a' }, at(.22), gy - 2 * q, z + .07, q, .05)
        const apple = box(pic, 0, 0, z + .1, 2 * q, 2 * q, .03, '#d8342c', { dynamic: true, castShadow: false })
        mover(apple, (o, t) => { const k = (t / 3) % 1; o.position.set(tx + 5 * q, gy + 10 * q - Math.max(0, k - .4) / .6 * 10 * q, z + .1) })
        break
      }
      case 'leaves': {
        // waist-deep in a pile of leaves beside jack-o'-lanterns, the leaves it throws fluttering down
        mascot(cx)
        for (let r = 0; r < 6; r++) box(pic, cx, gy - q + (r + .5) * q, z + .13, (22 - r * r * .55) * q, q, .05, r % 2 ? '#e8742f' : '#d8682a', flat)
        for (const [dx, dy, c] of [[-6, 2, '#f4b23e'], [4, 1, '#c8432b'], [-1, 4, '#f4b23e'], [7, 3, '#c8432b'], [-9, 1, '#c8432b']]) box(pic, cx + dx * q, gy + dy * q, z + .16, 2 * q, q, .01, c, flat)
        for (const f of [.17, .24, .8]) spr(pic, PUMPKIN, { g: '#5d7a2a', o: kit.mat('#e8742f', .15), O: '#c95a2a', y: kit.mat('#ffd75a', .6) }, at(f), gy - 2 * q, z + .07, q * 1.1, .05)
        break
      }
      case 'campfire': {
        // roasting a marshmallow over a campfire, its flames flickering, geese flying south
        const fx = cx + .35
        const a = mascot(cx - .45)
        for (const [s, c] of [[1, '#7a4a26'], [-1, '#6b4226']]) rod(pic, fx - s * 5 * q, gy - q, fx + s * 5 * q, gy + 2 * q, z + .08, q * 1.4, c)
        for (let i = 0; i < 7; i++) box(pic, fx - 6 * q + i * 2 * q, gy - 2 * q, z + .075, 1.5 * q, q, .04, '#8a8290', flat)
        const flames = [0, 1].map(k => { const g = new THREE.Group(); pic.add(g); spr(g, k ? FLAME.map(r => [...r].reverse().join('')) : FLAME, { r: kit.mat('#d83a22', .6), o: kit.mat('#f08a2a', .8), y: kit.mat('#ffd75a', 1) }, fx, gy + q, z + .1, q, .04); return g })
        mover(flames, (f, t) => { const on = Math.floor(t * 4) % 2; f[0].visible = !on; f[1].visible = !!on })
        const hd = hand(a)
        rod(pic, hd.x, hd.y, fx - 1.5 * q, gy + 7 * q, z + .14, .012, '#8a5a2e')
        box(pic, fx - 1.5 * q, gy + 7 * q, z + .15, 2 * q, 1.5 * q, .03, '#fff8ec', flat)
        const geese = new THREE.Group(); pic.add(geese)
        spr(geese, GEESE, { k: '#2e2438' }, at(.66), y0 + h - 7 * q, z + .025, q, .004)
        mover(geese, (g, t) => { g.position.x = -((t * .12) % 1) * w * .5 })
        break
      }
      case 'xmas': {
        // bringing a present to the decorated tree, its lights blinking in turn, its star twinkling
        const tx = cx + .7
        for (let k = 0; k < 4; k++) { const tw = (5 + k * 3) * q, ty = gy + (17 - k * 4.2) * q; box(pic, tx, ty, z + .06 + k * .004, tw, 4.5 * q, .06, k % 2 ? '#2f6e4c' : '#2a6446') }
        box(pic, tx, gy + q, z + .06, 2.4 * q, 3 * q, .04, '#6b4226', flat)
        for (const [dx, dy, c] of [[-3, 6, '#e8434f'], [2, 9, '#f4c542'], [-1, 13, '#6aa8e8'], [4, 5, '#6aa8e8'], [-5, 3, '#f4c542'], [1, 3, '#e8434f']]) box(pic, tx + dx * q, gy + dy * q, z + .1, q, q, .02, kit.mat(c, .3), flat)
        const bulbs = [0, 1].map(k => { const g = new THREE.Group(); pic.add(g); for (let i = 0; i < 5; i++) box(g, tx + ((i * 3 + k * 2) % 9 - 4) * q, gy + (4 + i * 3 + k) * q, z + .105, q * .8, q * .8, .02, kit.mat(k ? '#ffc2d4' : '#fff1a8', 1), flat); return g })
        mover(bulbs, (b, t) => { const on = Math.floor(t * 1.5) % 2; b[0].visible = !on; b[1].visible = !!on })
        spr(pic, STAR, { o: '#c98a14', s: kit.mat('#ffd85a', .8) }, tx, gy + 20 * q, z + .1, q, .03)
        spr(pic, PRESENT, { r: kit.mat('#e8434f', .1), y: '#f4c542' }, tx - 6 * q, gy - q, z + .1, q, .05)
        spr(pic, PRESENT, { r: '#5aa23c', y: '#f4c542' }, tx + 6 * q, gy - q, z + .1, q * .8, .05)
        const a = mascot(cx - .6)
        const hd = hand(a)
        spr(pic, PRESENT, { r: '#3a6fc0', y: '#f4c542' }, hd.x - 1.5 * q, hd.y - 2 * q, z + .16, q * .9, .05)
        break
      }
    }
    // what falls through the whole picture: snow, petals, leaves
    const fall = S.fall ?? []
    const n = fall.length ? 6 : 0
    for (let i = 0; i < n; i++) {
      const size = S.flakes ? [q, q] : SEASON_OF[month] === 'autumn' ? [2 * q, q] : [1.5 * q, q]
      const flake = box(pic, 0, 0, z + .17, size[0], size[1], .01, fall[i % fall.length], { dynamic: true, castShadow: false })
      const fx = x0 + .25 + (w - .5) * ((i * .379 + .07) % 1), speed = S.flakes ? .12 : .16
      mover(flake, (o, t) => { const k = (t * speed + i / n) % 1; o.position.set(fx + Math.sin(t * 1.7 + i * 2) * (S.flakes ? .04 : .1), y0 + h - .05 - k * (h - gh * .55), z + .17) })
    }
  }
  /** A tree on the picture's ground at (x, y): a round one in three greens (light, mid, shade), a pine, or bare boughs. */
  function tree(parent, x, y, z, kind, q, s) {
    const box = (parent, x, y, z, w, h, d, color) => kit.box(parent, x, y, z, w, h, d, color, paper)
    const u = q * s
    if (kind === 'pine') {
      box(parent, x, y + 2 * u, z, 3 * u, 4 * u, .04, '#6b4226', flat)
      for (let k = 0; k < 4; k++) {
        const tw = (15 - k * 3.4) * u, ty = y + (6 + k * 5) * u
        box(parent, x, ty, z + .005 + k * .004, tw, 5 * u, .06, '#2f6e4c')
        box(parent, x + tw * .25, ty - .5 * u, z + .036 + k * .004, tw * .5, 4 * u, .004, '#1f4d36', flat)
        box(parent, x - tw * .28, ty - 2 * u, z + .036 + k * .004, tw * .44, u, .006, '#ffffff', flat)
      }
      box(parent, x, y + 26 * u, z + .02, 2 * u, 2 * u, .03, '#ffffff', flat)
    } else if (kind === 'bare') {
      box(parent, x, y + 8 * u, z, 3 * u, 16 * u, .05, '#6b4226', flat)
      for (const [x1, y1, x2, y2] of [[0, 12, -7, 18], [0, 14, 6, 21], [0, 9, 6, 13], [0, 10, -5, 13], [-3, 15, -2, 23], [3, 17, 3, 24]]) rod(parent, x + x1 * u, y + y1 * u, x + x2 * u, y + y2 * u, z + .01, u * 1.2, '#5a3a22')
      for (const [dx, dy] of [[-7, 18], [6, 21], [3, 24]]) box(parent, x + dx * u, y + dy * u, z + .03, u * 1.4, u, .01, '#c8742f', flat)
    } else {
      const [Lc, Mc, Dc] = kind
      box(parent, x, y + 6 * u, z, 3 * u, 12 * u, .05, '#6b4226', flat)
      box(parent, x, y + 17 * u, z + .01, 16 * u, 11 * u, .07, Mc)
      box(parent, x - 3 * u, y + 20 * u, z + .03, 9 * u, 6 * u, .07, Lc, flat)
      box(parent, x + 4 * u, y + 14 * u, z + .03, 8 * u, 5 * u, .07, Dc, flat)
      box(parent, x, y + 23.5 * u, z + .02, 9 * u, 3 * u, .06, Mc, flat)
    }
  }

  // ================================================================ 3F: the building directory
  {
    const L = levels[1], { level } = L
    const { fy } = room(L, [-3.6, 3.6])
    // one lamp for the directory and the crew, set in the slab between them: it lights both boards from the front
    light(level, 0, L.base + .45, 2.2, 38, 10)
    const BW = 11.6, bx0 = -BW / 2, bTop = fy + .7 + boardH, bBot = fy + .7, by = (bTop + bBot) / 2, BZ = -.82
    // the board: a brass frame round dark felt, a faint stripe behind every other line
    box(level, .06, by - .06, BZ - .07, BW, boardH, .04, '#0d0a08', paper)
    box(level, 0, by, BZ - .02, BW, boardH, .08, BRASS_D, paper)
    box(level, 0, by, BZ + .005, BW - .08, boardH - .08, .07, BRASS, { ...paper, glow: .16 })
    box(level, 0, by, BZ + .02, BW - .24, boardH - .24, .07, FELT, paper)
    const fz = BZ + .055 // the felt's face
    // its plaque on top, and how many tenants
    const plaque = tag({ lines: [{ spans: [['BUILDING DIRECTORY', '#2b2016', { pixel: true }]], size: .36 }], pad: .09, bg: BRASS, radius: .03 }, 0, bTop + .38, BZ + .05, level)
    const pw = plaque.userData.size[0]
    box(level, 0, bTop + .38, BZ - .01, pw + .1, .62, .06, BRASS_D, paper)
    for (const s of [-1, 1]) box(level, s * (pw / 2 - .12), bTop + .1, BZ + .02, .05, .1, .05, '#6e5233', paper)
    tag({ lines: [{ spans: [[plural(dir.tenants, 'tenant'), ROLE.dim]], size: .17 }], pad: .07, bg: PLATE, alpha: .94, radius: .03, anchor: 'left' }, pw / 2 + .2, bTop + .38, BZ + .04, level)
    // the columns: lamp, tenant, a bar per day of the last seven, agent-time, commits
    const lampX = bx0 + .4, nameX = bx0 + .6, nameW = 4.2, sparkX = -.72, sparkP = .46, timeR = 4.05, shipR = 5.45
    const headY = bTop - .36, rowsTop = bTop - .58, NS = .23, pad = .02, gap = P / NS - 1
    const rowY = i => rowsTop - pad - i * P - .56 * NS
    const last7 = days.slice(-7)
    const span = !last7.length ? '' : past ? `${last7.length} days → ${dayParts(last7.at(-1)).d} ${dayParts(last7.at(-1)).mon}` : `last ${last7.length} days → today`
    const head = (s, x, anchor) => tag({ lines: [{ spans: [[s, ROLE.dim]], size: .17 }], pad: .01, anchor }, x, headY, fz + .004, level)
    head('tenant', nameX, 'left'); if (span) head(span, sparkX - .02, 'left'); head('agent-time', timeR, 'right'); head('commits', shipR, 'right')
    box(level, 0, bTop - .5, fz + .002, BW - .5, .02, .004, '#4a4036', paper)
    for (let i = 1; i < LINES; i += 2) box(level, 0, rowY(i) + .02, fz + .001, BW - .5, P, .002, '#25201b', paper)
    if (dir.list.length) {
      const lines = col => [...dir.list.map(col), ...(dir.more ? [col(null)] : [])].map(spans => ({ spans, size: NS, gap }))
      tag({ lines: lines(p => p ? [[String(p.name ?? '?'), p.color || ROLE.title]] : [[`+${plural(dir.more, 'more tenant')}`, ROLE.dim]]), width: nameW, pad, anchor: 'top-left' }, nameX, rowsTop, fz + .004, level)
      tag({ lines: lines(p => p ? [[num(p.minutes) ? fmtHours(num(p.minutes)) : '·', num(p.minutes) ? ROLE.title : ROLE.dim, { bold: true }]] : [[dir.rest ? fmtHours(dir.rest) : '', ROLE.dim]]), width: 1.5, pad, align: 'right', anchor: 'top-left' }, timeR - 1.5 + pad, rowsTop, fz + .004, level)
      tag({ lines: lines(p => p ? [[fmtInt(num(p.commits)), num(p.commits) ? ROLE.ship : ROLE.dim]] : [['', ROLE.dim]]), width: 1.2, pad, align: 'right', anchor: 'top-left' }, shipR - 1.2 + pad, rowsTop, fz + .004, level)
      // a faint column behind today, the bars standing on a baseline per row
      const ti = past ? -1 : last7.indexOf(today)
      if (ti >= 0) box(level, sparkX + ti * sparkP + .17, rowY(dir.list.length - 1) + (dir.list.length - 1) * P / 2, fz + .003, .42, dir.list.length * P, .004, '#3d3424', paper)
      dir.list.forEach((p, i) => {
        const y = rowY(i), color = p.color || ROLE.dim
        const desks = (snapshot.agents ?? []).filter(a => a.project === p.name)
        const awake = desks.some(a => !RESTING.has(a.kind))
        box(level, lampX, y, fz + .03, .14, .14, .06, awake ? kit.mat(ROLE.busy, 1.1) : desks.length ? kit.mat(ROLE.idle, .6) : SOCKET, paper)
        const vals = Array.isArray(p.days) ? p.days.slice(-7).map(num) : []
        const max = Math.max(1, ...vals)
        box(level, sparkX + (7 * sparkP - .12) / 2, y - .15, fz + .004, 7 * sparkP - .12, .02, .006, SOCKET, paper)
        vals.forEach((v, j) => {
          if (!(v > 0)) return
          const bh = Math.max(.03, v / max * .34)
          box(level, sparkX + j * sparkP + .17, y - .14 + bh / 2, fz + .02 + bh * .12, .34, bh, .04 + bh * .25, color, { ...paper, glow: .3 })
        })
        const tip = [String(p.name ?? '?'), `${hm(p.minutes)} agent-time`, plural(num(p.sessions), 'session'), plural(num(p.subagents), 'intern'), plural(num(p.commits), 'commit'),
          desks.length && `${plural(desks.length, 'desk')} in now`, Array.isArray(p.titles) && p.titles[0]].filter(Boolean).join(' · ')
        pick(level, 0, y, fz + .1, BW - .3, P, .2, { project: p.name, text: tip })
      })
    } else tag({ lines: [{ spans: [['no tenants yet', ROLE.dim]], size: .2, align: 'center' }], width: 4, pad }, 0, rowY(0), fz + .004, level)
    // the month's interns, waiting on a lobby bench beside the board; plants
    const interns = num(totals.subagents)
    const bx = -6.9
    box(level, bx, fy + .42, .15, 1.45, .08, .46, BRASS, { glow: .1 }); box(level, bx, fy + .36, .15, 1.45, .04, .46, BRASS_D)
    for (const s of [-1, 1]) box(level, bx + s * .6, fy + .2, .15, .08, .4, .38, '#6e5233')
    box(level, bx, fy + .72, -.06, 1.45, .5, .06, BRASS_D)
    if (interns) {
      ;[-.33, .33].forEach((dx, i) => { const mini = actors.mini(i ? (crew[1]?.agent ?? who) : who, { p: .06, depth: .2 }); mini.position.set(bx + dx, fy + .46, .15); level.add(mini); figures.push({ mini, phase: i * 1.7 }) })
      tag({ lines: [{ spans: [[plural(interns, 'intern'), ROLE.intern, { bold: true }]], size: .18, align: 'center' }, { spans: [[past ? 'hired that month' : 'hired this month', ROLE.dim]], size: .155, align: 'center' }], width: 1.9, pad: .07, bg: PLATE, alpha: .94, radius: .03 }, bx, fy + 1.75, WALL_Z + .04, level)
      pick(level, bx, fy + .8, .1, 1.7, 1.4, .8, { text: `${plural(interns, 'intern')} hired ${past ? 'that' : 'this'} month` })
    }
    plant(level, 6.55, fy, .35, .78)
    plant(level, 7.45, fy, -.35, .6)
    // on the label band: what the board lists, and its key
    const key = dir.list.length
      ? [['one line per project, busiest first', ROLE.title], ...(dir.more ? [[`top ${dir.list.length} of ${dir.tenants}`, ROLE.dim]] : []), ['bars: agent-time a day, the last 7', ROLE.dim], ['lamp: at a desk now', ROLE.busy]]
      : [['no projects on the board yet', ROLE.dim]]
    tag({ lines: [{ spans: dotted(key), size: .17 }], width: 15.55, pad: .03, anchor: 'left' }, -7.4, L.base + BAND / 2 - .02, FRONT + .23, level)
  }

  // ================================================================ 2F: the crew
  {
    const L = levels[0], { level } = L
    const { fy } = room(L, [-5.2, 5.2])
    const railY = fy + (crew.length ? 3.95 : 1.9), CZ = -.74
    if (crew.length) { box(level, 0, railY, WALL_Z + .06, 15.6, .1, .12, '#6f5636'); box(level, 0, railY + .06, WALL_Z + .08, 15.6, .03, .1, '#9a7b4f', flat) }
    const plaque = tag({ lines: [{ spans: [['THE CREW', '#16110d', { pixel: true }]], size: .36 }], pad: .09, bg: ROLE.intern, radius: .03 }, 0, railY + .46, WALL_Z + .08, level)
    const pw = plaque.userData.size[0]
    box(level, 0, railY + .46, WALL_Z + .03, pw + .1, .62, .06, '#3b4a72')
    tag({ lines: [{ spans: [[crew.length ? `${plural(crew.length, 'AI')} worked ${past ? 'that' : 'this'} month` : past ? 'nobody clocked in that month' : 'nobody clocked in yet', ROLE.dim]], size: .17 }], pad: .07, bg: PLATE, alpha: .94, radius: .03, anchor: 'left' }, pw / 2 + .2, railY + .46, WALL_Z + .06, level)
    const n = crew.length, gapX = .34
    const bw = Math.min(2.35, (15.2 - (n - 1) * gapX) / Math.max(1, n))
    const total = n * bw + (n - 1) * gapX
    crew.forEach((c, i) => {
      const spec = CAST[c.agent], color = spec.hex.dark
      const x = -total / 2 + bw / 2 + i * (bw + gapX)
      const cardTop = railY - .52, photoH = .95, photoBot = cardTop - photoH
      // its peg on the rail, the lanyard, the clip
      box(level, x, railY - .02, WALL_Z + .14, .08, .08, .16, '#c9ced8')
      rod(level, x - .04, railY - .04, x - .26, cardTop + .02, CZ - .06, .045, darker(color, .7))
      rod(level, x + .04, railY - .04, x + .26, cardTop + .02, CZ - .06, .045, darker(color, .7))
      box(level, x, cardTop + .03, CZ + .02, .36, .1, .06, '#9aa0aa')
      // the photo: its character on a band of its color, a lighter stripe on top, a floor under its feet
      box(level, x, cardTop - photoH / 2, CZ - .02, bw, photoH, .05, darker(color, .42), { glow: .2 })
      box(level, x, cardTop - .04, CZ + .006, bw, .08, .004, color, { ...flat, glow: .3 })
      box(level, x, cardTop - photoH * .45, CZ + .006, bw * .5, photoH * .6, .004, darker(color, .55), flat)
      box(level, x, photoBot + .08, CZ + .007, bw, .16, .004, darker(color, .3), flat)
      const p = Math.min(.064, bw * .028)
      cast(level, c.agent, x, photoBot + .14, CZ + .02 + p * 1.7, p, i % 2 ? 'look' : 'stand')
      // the badge's words: its name and agent, its sessions, its agent-time, its share (a bar under it)
      const pct = sharePct(c.share, c.minutes)
      const card = tag({
        lines: [
          { spans: [[spec.who, color, { pixel: true }], [spec.name, ROLE.dim, { scale: .52 }]], size: .34, gap: .16 },
          { spans: [[c.sessions == null ? 'sessions not counted' : plural(c.sessions, 'session'), ROLE.dim]], size: .175, gap: .3 },
          { spans: [[fmtAgentTime(c.minutes), ROLE.title, { bold: true }], ['agent-time', ROLE.dim, { scale: .8 }]], size: .22, gap: .3 },
          { spans: [[pct, color, { bold: true }], ['of the month', ROLE.dim]], size: .165 },
        ], width: bw, height: 1.56, pad: .1, bg: PLATE, alpha: .97, radius: .04, anchor: 'top',
      }, x, photoBot, CZ + .004, level)
      const ch = card.userData.size[1], barW = bw - .24
      box(level, x, photoBot - ch / 2, CZ - .03, bw + .05, ch + .05, .05, '#2a2420')
      box(level, x, photoBot - ch + .16, CZ + .02, barW, .07, .02, SOCKET, flat)
      if (c.share > 0) box(level, x - barW / 2 + Math.max(.03, barW * c.share) / 2, photoBot - ch + .16, CZ + .03, Math.max(.03, barW * c.share), .07, .03, kit.mat(color, .4), flat)
      pick(level, x, cardTop - (photoH + ch) / 2, CZ + .1, bw, photoH + ch, .3, { text: `${spec.name} (${spec.who}): ${c.sessions == null ? '' : `${plural(c.sessions, 'session')} · `}${hm(c.minutes)} agent-time · ${pct} of the month's agent-time` })
    })
    plant(level, -7.45, fy, .4, .7)
    plant(level, 7.45, fy, .4, .7)
    // on the label band: the crew's month
    const line = crew.length
      ? [[plural(crew.length, 'AI'), ROLE.title], [`${plural(num(totals.sessions), 'session')}`, ROLE.dim], [`${plural(num(totals.subagents), 'intern')} hired`, ROLE.intern], [plural(num(totals.workflows), 'meeting'), ROLE.meeting], [`led by ${CAST[who].who}, ${sharePct(crew[0].share, crew[0].minutes)} of the agent-time`, ROLE.accent]]
      : [[past ? 'nobody clocked in that month' : 'nobody clocked in this month yet', ROLE.dim]]
    tag({ lines: [{ spans: dotted(line), size: .17 }], width: 15.55, pad: .03, anchor: 'left' }, -7.4, L.base + BAND / 2 - .02, FRONT + .23, level)
  }

  flush()
  for (const root of unshadowed) root.traverse(o => { if (o.isMesh) o.receiveShadow = false })
  // ---------------------------------------------------------------- what moves
  function update(t) {
    for (const f of figures) {
      if (f.mini) { f.mini.userData.baseY ??= f.mini.position.y; f.mini.position.y = f.mini.userData.baseY + (Math.floor(t * 2.4 + f.phase) % 2) * .025; continue }
      actors.animate(f.actor, f.pose, t)
      if (f.hop != null) f.actor.root.position.y = f.hop + Math.abs(Math.sin(t * 3.4)) * .05
      if (f.tap) { const p = f.actor.p; f.actor.leftArm.position.set(-p * .2, p * (.6 + (Math.floor(t * 1.6) % 2) * .5), 0) }
    }
    for (const m of movers) m(t)
    return true
  }
  return { storeys, group, pickables, anchors: new Map(), rooms: [], sign: monthSignLines(snapshot), status: null, update, animated: true }
}
