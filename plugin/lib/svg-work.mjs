// PURE: the WORK scene of the SVG office, "what they did": every tool call of the range sorted by kind of work into the
// departments of a cut-away building. Server room = terminal commands, QA lab = running tests, library = reading code,
// typing pool = writing code, internet café = browsing the web, gadget shop = other tools, whiteboard = planning,
// phone booth = talking to you, management = delegating to helpers, art studio = design tools. One room per
// department, busiest first, with one busy Clawd per started 5% or 10% of the calls (the drawing says which), in two
// tiers under a title rule (SHARE OF TOOL CALLS, the total big): on top as many of the three busiest as fit side by
// side, each as wide as its share of theirs, its share framed big on its name line; the others under them in a grid of
// equal rooms (one with many Clawds spans more cells), its share in big type, its call count and the kind of work in
// plain words under it. Under every room a bar of its share of all the calls, on one scale for the whole building, so
// 27 calls never look like 13 000 however alike two small rooms are drawn.
// workFloor lends the same rooms, compact, to another building as one floor: the live Office's basement (B1).
// No node:* imports (the desktop mod loads lib/svg.mjs, which imports this file).
import { jobTitle } from './activity.mjs'
import { clip, fmtCount, fmtInt } from './format.mjs'
import { DEPARTMENTS, DEPARTMENT_WORDS, DEPARTMENT_WORK, departmentRows, pct, seeded } from './model.mjs'
import {
  HEAD, HEAD_WINDOWS, K, PLATE_FONT, ROLE, ROW, SKY, aA, aO, aT, ceilingLight, clamp, defineSprites, esc, figureWord, fit, fitGroups, fitInfo, footing, hitArea,
  linesTicker, lineSpans, mapRects, paint, pixRects, plateParts, plural, pose, r1, rangeWord, rect, sceneHeader, spans, steadyCount, tagsSvg, textW, txt, use,
} from './svg-kit.mjs'

// ---------------------------------------------------------------- departments

/**
 * Activity kind → what its room says and how it is furnished: the plain words under the room (nobody should have to
 * decode "server room"; model.mjs DEPARTMENT_WORDS, which the text legend says too; a narrow room says the short
 * DEPARTMENT_WORK instead), the nameplate color, and the width of one Clawd's work station.
 */
export const WORK_ROOMS = {
  terminal: { words: DEPARTMENT_WORDS.terminal, color: '#9ab86a', pitch: 30 },
  testing: { words: DEPARTMENT_WORDS.testing, color: '#7fd6e8', pitch: 31 },
  reading: { words: DEPARTMENT_WORDS.reading, color: '#d4a94f', pitch: 30 },
  coding: { words: DEPARTMENT_WORDS.coding, color: '#6f91dc', pitch: 30 },
  web: { words: DEPARTMENT_WORDS.web, color: '#55c5b1', pitch: 30 },
  tools: { words: DEPARTMENT_WORDS.tools, color: '#b0b8c4', pitch: 30 },
  planning: { words: DEPARTMENT_WORDS.planning, color: '#eec96f', pitch: 28 },
  talking: { words: DEPARTMENT_WORDS.talking, color: '#e07a61', pitch: 42 },
  delegating: { words: DEPARTMENT_WORDS.delegating, color: '#c678dd', pitch: 36 },
  design: { words: DEPARTMENT_WORDS.design, color: '#e08fc0', pitch: 40 },
}

const SEAT = 13 // a seated Clawd's box y: its body shows above the furniture top at 25
const STAND = 21 // a standing Clawd's box y: legs on the floor at 36
// The slab under a row of rooms in the work scene: the top tier's (the bar, then the kind of work and the calls on one
// line, its share being framed on its name line) or the others' (the bar, the share big with the call count, the kind
// of work in plain words)
const CS = { top: 17, rest: 26 }
// The slab under a row of the live building's basement: its rooms' tags on it (TAGGED_CS), or quiet (ctx.quiet), tags of
// one line, the share and the calls without the kind of work (QUIET_CS)
const TAGGED_CS = 18
const QUIET_CS = 11
const slabOf = (ctx, row) => (ctx.view !== 'live' ? (row.tier === 1 ? CS.top : CS.rest) : ctx.quiet ? QUIET_CS : TAGGED_CS)
/** How tall a row of rooms is, with its slab. */
const rowH = (ctx, row) => HEAD + ROW + slabOf(ctx, row)
const RULE = 13 // the title rule over the rooms: SHARE OF TOOL CALLS, a dotted rule, the total big
const CELL = 64 // the narrowest room of the grid: its station, its wall's props and the width for an extra
const GAP = 3 // partition between two rooms
const LOBBY = 20 // interior height of the interns' bench on the ground floor
/** How much of the calls one busy Clawd stands for, in %: the finest of these whose busiest room fits the drawing. */
export const CLAWD_UNITS = [5, 10, 20, 25, 50, 100]
const CHART = 38 // the management's org chart, beside the boss's desk (only when the room has that much to spare)
const HALL = 22 // the narrowest spare width drawn as a hallway (less shows the building's brick, a pillar)
const MUTED = '#6b6458' // nameplate of a closed department
/**
 * Chars the scene's own rooms may weigh (its slice and every sprite it places, the roof every view shares left out):
 * with the roof and the commits line the composer draws under it, the `work` view stays under 63 000.
 */
export const WORK_BUDGET = 42_000

// Counts as the collector writes them; anything else (strings, negatives, NaN) reads 0.
const count = (o, k) => (o && typeof o === 'object' && Object.hasOwn(o, k) ? Math.max(0, Number(o[k]) || 0) : 0)

/**
 * Every department, busiest first (zero-call ones last, in the house order), with its share of all tool calls and
 * how many busy Clawds it gets: one per started `unit` % of the share it prints (20% → 2, 21% → 3 at 10%; any calls at
 * all → 1), so counting Clawds against the key always works out. Shares and order are model.mjs departmentRows', so the
 * drawing and the text chart always agree: pass the exact facts (a live drawing's ctx.exact; its ctx.f has every count
 * floored, svg-kit steadyFacts, which skews the shares and sums short). `p`, what sizes a room, is the share it prints,
 * a whole percent: so a live drawing's rooms move only when a share crosses one, never with every call.
 */
export function workRooms(f, unit = 10) {
  const { rows, total: sum } = departmentRows(f?.totals?.activity)
  const total = Math.max(0, sum, rows.reduce((a, r) => a + Math.max(0, r.v), 0))
  const byK = new Map(rows.map((r) => [r.k, Math.max(0, r.v)]))
  const rooms = DEPARTMENTS.map(([k, name]) => {
    const v = byK.get(k) ?? 0
    const p = total ? Math.round((v / total) * 100) : 0
    return { k, name, v, p, n: v > 0 ? Math.max(1, Math.ceil(p / unit)) : 0, share: v ? pct(v, total) : '0%', ...WORK_ROOMS[k] }
  })
  rooms.sort((a, b) => b.v - a.v || (a.v ? a.name.localeCompare(b.name) : 0))
  // each room's first seat in the building: its figures are seats base…base+n-1 of the cast (ctx.pick)
  let base = 0
  for (const r of rooms) { r.base = base; base += r.n }
  return { rooms, total }
}

/**
 * The Clawd unit of a drawing `IW` wide: the finest of CLAWD_UNITS at which every room's stations fit across the
 * building (a wide drawing seats a Clawd per 5%, a narrow one per 10% or 20%). The key under the title says which.
 */
export function clawdUnit(f, IW) {
  return CLAWD_UNITS.find((u) => workRooms(f, u).rooms.every((r) => r.n * r.pitch + 6 <= IW)) ?? CLAWD_UNITS.at(-1)
}

/**
 * A count of tool calls as a drawing prints it (a room's calls, the total): a live one's in steps (svg-kit steadyCount,
 * as steadyFacts steps every count ctx.f holds), so a caption or a tooltip holds while calls come in. The shares are
 * the exact counts' either way (workRooms).
 */
const said = (ctx, n) => (ctx.liveClock ? steadyCount(n) : n)

// ---------------------------------------------------------------- sprites (wk-: drawn once in <defs>, placed with <use>)

const GLASS = '#cfe3f0'
const PAPER = '#f4efe4'
const INK = '#9a9282'
const DESK = ['#c9a26b', '#8f6d43', '#6e5233'] // furniture top, edge, body (the live floor's desk woods)

// A wall of repeated props (racks, shelves, pegboards…) is one <pattern>, so a wide room costs one rect, not a <use>
// per rack. The pattern lives in a sprite's <defs> group; it is referenced as url(#<prefix><name>p).
const pattern = (c, name, w, h, inner) => `<pattern id="${c.id}${name}p" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${inner}</pattern>`

// A rack (16 × 32 tile: 13 wide, patch cables to the next): six units with a vent and a steady power LED.
function rackTile() {
  const r = [[1, 0, 11, 1, '#1b1e24'], [0, 1, 13, 30, '#1b1e24'], [1, 31, 2, 1, '#1b1e24'], [10, 31, 2, 1, '#1b1e24'], [13, 29, 1, 3, '#3f7fb8'],
    [14, 31, 2, 1, '#3f7fb8']]
  for (let y = 1; y < 30; y += 5) r.push([1, y, 11, 4, '#353a44'], [2, y + 2, 5, 1, '#262a31'], [8, y + 2, 1, 1, '#5f8a3f'])
  return paint(r)
}
// The LEDs that blink on the racks (a 32-wide tile, two racks apart): `odd` picks the other half, two rhythms.
const leds = (odd, fill) => paint([0, 1, 2, 3, 4, 5].flatMap((u) => [[10, 3 + u * 5], [26, 3 + u * 5]].filter((_, i) => (u + i) % 3 === (odd ? 0 : 1))
  .map(([x, y]) => [x, y, 1, 1, fill])))

// A bookcase (27 × 33 tile, 26 wide): a dark wood frame under a lighter cornice, three shelves of leather-bound spines
// in the muted colors of old bindings, a gilt band on about half of them, a gap here and there; seeded so it never
// moves. Muted on purpose: the readers in front of it, their open books and green lamps, are what the eye finds first.
function shelfTile() {
  const rnd = seeded('wk-shelf')
  const cols = ['#7a3b2e', '#3e5a7a', '#4f6b3a', '#a07a48', '#5e4466', '#2f5560', '#8a5a3a']
  const r = [[0, 0, 26, 33, '#4a3424'], [0, 0, 26, 2, DESK[1]], [1, 2, 24, 30, '#1e1611']]
  for (const base of [11, 21, 31]) {
    r.push([1, base, 24, 1, DESK[1]])
    for (let x = 2; x < 24;) {
      const bw = rnd() < 0.35 ? 3 : 2
      if (x + bw > 24) break
      const bh = 5 + Math.floor(rnd() * 4)
      if (rnd() > 0.12) {
        r.push([x, base - bh, bw, bh, cols[Math.floor(rnd() * cols.length)]])
        if (rnd() < 0.5) r.push([x, base - bh + 1, bw, 1, '#c9a26b'])
      }
      x += bw
    }
  }
  return paint(r)
}

// The library's rolling ladder (8 × 33), hooked on the bookcases' cornice, its wheels on the floor.
const BOOK_LADDER = [[0, 0, 2, 1, '#8a8f96'], [6, 0, 2, 1, '#8a8f96'], [0, 1, 1, 31, '#9a7b4f'], [7, 1, 1, 31, '#9a7b4f'],
  ...[5, 10, 15, 20, 25].map((y) => [1, y, 6, 1, DESK[0]]), [-1, 32, 2, 1, '#3a3f48'], [6, 32, 2, 1, '#3a3f48']]
// A reading seat's share of the long table (30 wide): its top and front panel (which hides the bottom shelf), a green
// banker's lamp at the right and its pool of light, a little stack of books at the left.
const READ_TABLE = [
  [0, 25, 30, 1, DESK[0]], [0, 26, 30, 1, DESK[1]], [0, 27, 30, 8, DESK[2]], [2, 28, 26, 6, '#5a4129'], [0, 35, 30, 1, '#4a3520'],
  [21, 21, 9, 4, '#ffe7b0/.14'], [25, 18, 5, 3, '#2f7a4a'], [26, 18, 3, 1, '#5fb37a'], [26, 21, 3, 1, '#fff2c4'], [27, 22, 1, 2, '#d4a94f'],
  [25, 24, 5, 1, '#d4a94f'], [0, 22, 4, 1, '#3e5a7a'], [0, 23, 5, 1, '#7a3b2e'], [0, 24, 4, 1, '#4f6b3a'],
]

// A pegboard of tools (30 × 11 tile): wrench, hammer, screwdriver, pliers.
function pegboard() {
  return paint([[0, 0, 28, 11, '#8a6a40'], [0, 10, 28, 1, DESK[2]], [2, 1, 3, 2, '#a4a9b0'], [3, 3, 1, 5, '#a4a9b0'], [2, 8, 3, 2, '#a4a9b0'],
    [8, 1, 5, 2, '#5d6168'], [10, 3, 1, 6, '#9a7b4f'], [15, 1, 3, 4, ROLE.ask], [16, 5, 1, 4, '#a4a9b0'], [21, 1, 1, 4, '#a4a9b0'],
    [24, 1, 1, 4, '#a4a9b0'], [22, 5, 2, 1, '#a4a9b0'], [21, 6, 1, 3, ROLE.ask], [24, 6, 1, 3, ROLE.ask]])
}

// The internet café's wall screen, 17 × 13: a little planet turning (two discrete frames of its continents).
const LAND = [
  '.....##.........#.....', '...#####......####....', '..######.....######...', '..#####.......####....', '...###.........##.....',
  '....##..........#.....', '....###.....##........', '.....##....####.......', '......#.....###.......', '............##........',
  '.............#........',
]
function globe(c) {
  const disc = (ch) => Array.from({ length: 11 }, (_, j) => Array.from({ length: 11 }, (_, i) => ((i - 5) ** 2 + (j - 5) ** 2 <= 30 ? ch(i, j) : '.')).join(''))
  const land = (f) => paint(mapRects(disc((i, j) => (LAND[j][(i + f * 4) % 22] === '#' ? 'L' : '.')), { L: ROLE.busy }, 3, 1))
  return paint([[0, 0, 17, 13, '#2b2f36'], [1, 1, 15, 11, '#0d1328'], ...mapRects(disc(() => 'o'), { o: '#3f7fb8' }, 3, 1)]) +
    `<g>${land(0)}${aO(c, '1;0', 2.4)}</g><g opacity="0">${land(1)}${aO(c, '0;1', 2.4)}</g>` +
    paint([[6, 2, 2, 1, '#ffffff/.45'], [5, 3, 1, 1, '#ffffff/.45'], [6, 13, 5, 1, '#5d6168']])
}

// A results board (40 × 12 tile, board 27 wide): green ticks, a progress bar; the red crosses blink apart.
const tick = (x, y) => [[x + 4, y, 1, 1], [x + 3, y + 1, 1, 1], [x, y + 2, 1, 1], [x + 2, y + 2, 1, 1], [x + 1, y + 3, 1, 1]].map((r) => [...r, ROLE.busy])

defineSprites({
  // server room: the wall of racks and its two LED rhythms; a console desk where a Clawd types commands
  'wk-racks': (c) => pattern(c, 'wk-racks', 16, 32, rackTile()) + pattern(c, 'wk-ledg', 32, 32, leds(false, ROLE.busy)) +
    pattern(c, 'wk-leda', 32, 32, leds(true, ROLE.accent)),
  // (the console carries the terminal hung over its operator, as the live desks' terminal screen looks: dim lines of
  // output, a green prompt, its cursor blinking, in a bezel on the rack wall)
  'wk-con': (c) => paint([[0, 25, 30, 1, '#6a707a'], [0, 26, 30, 1, '#3a3f48'], [1, 27, 28, 9, '#2b2f36'], [3, 29, 9, 1, '#1b1e24'],
    [3, 31, 9, 1, '#1b1e24'], [24, 29, 2, 1, ROLE.busy], [6, 24, 13, 1, '#d6d0c4'], [7, 24, 11, 1, '#a49d90/.5'],
    [6, 0, 18, 12, '#2b2f36'], [7, 0, 16, 1, '#454c57'], [21, 11, 1, 1, '#6a8a4a'], [7, 1, 16, 10, '#0b100b'], [8, 2, 8, 1, '#4d5a4d'],
    [8, 4, 5, 1, '#4d5a4d'], ...pixRects('>', 8, 6, ROLE.busy)]) + rect(12, 10, 3, 1, ROLE.busy, aO(c, '1;0', 0.8)),
  // one rack of the wall stands open: its door swung out, its servers' patch cables hanging in loops, its lights busy
  'wk-rackopen': (c) => paint([[0, 0, 13, 32, '#1b1e24'], [1, 1, 11, 30, '#0d0f13'], ...[2, 7, 12, 17, 22, 27].map((y) => [1, y, 11, 3, '#353a44']),
    [3, 5, 1, 8, '#e07a61'], [3, 13, 3, 1, '#e07a61'], [6, 10, 1, 9, '#6f91dc'], [6, 19, 3, 1, '#6f91dc'], [9, 20, 1, 6, ROLE.busy],
    [13, 1, 3, 30, '#454c57'], [15, 14, 1, 4, '#a4a9b0']]) + `<g>${paint([[10, 3, 1, 1, ROLE.busy], [10, 13, 1, 1, ROLE.busy]])}${aO(c, '1;0;1;1', 1.1)}</g>`,
  // QA lab: results boards (a red cross keeps coming back) and a lab bench with test tubes and a bubbling flask
  'wk-qabs': (c) => pattern(c, 'wk-qabs', 40, 12, paint([[0, 0, 27, 12, '#5d6168'], [1, 1, 25, 10, '#13201a'], [2, 8, 23, 2, '#2c3a33'],
    ...tick(2, 2), ...tick(8, 2), ...tick(14, 2), [2, 8, 15, 2, ROLE.busy]])) +
    pattern(c, 'wk-qax', 40, 12, paint([[20, 2, 1, 1], [23, 2, 1, 1], [21, 3, 2, 2], [20, 5, 1, 1], [23, 5, 1, 1]].map((r) => [...r, ROLE.ask]))),
  'wk-qa': (c) => paint([
    [0, 25, 31, 1, '#e6e1d6'], [0, 26, 31, 1, '#9c9689'], [1, 27, 2, 9, '#7a7468'], [28, 27, 2, 9, '#7a7468'], [3, 31, 25, 1, '#7a7468'],
    [2, 22, 9, 1, '#8a6a40'], [3, 16, 2, 3, GLASS], [7, 16, 2, 3, GLASS], [3, 19, 2, 6, ROLE.busy], [7, 19, 2, 6, '#e08fc0'],
    [24, 17, 2, 3, GLASS], [23, 20, 4, 1, GLASS], [22, 21, 6, 1, '#c678dd'], [21, 22, 8, 3, '#c678dd'],
  ]) + `<g>${paint([[3, 21, 1, 1, '#ffffff/.8'], [24, 23, 1, 1, '#ffffff/.8']])}${aT(c, '0 0;0 -1;0 -2;0 -3', 1.2)}${aO(c, '1;1;1;0', 1.2)}</g>`,
  // library: bookcases, a rolling ladder, and one long reading table under green banker's lamps, where every reader
  // holds up an open leather-bound book (a gilt title, the pages' edges on top, a bookmark ribbon in its project's
  // color) and peers over it, turning a page now and then (turnPage); an empty seat has its book closed on the table
  'wk-shelves': (c) => pattern(c, 'wk-shelves', 27, 33, shelfTile()),
  'wk-ladder': () => paint(BOOK_LADDER),
  'wk-read': () => paint([...READ_TABLE, [6, 19, 14, 6, '#6e2a22'], [7, 19, 5, 1, PAPER], [14, 19, 5, 1, PAPER], [13, 20, 1, 5, '#4a1a15'],
    [6, 20, 1, 5, '#8a3b2e'], [15, 21, 3, 1, '#f0c95a'], [15, 23, 3, 1, '#f0c95a'], [8, 22, 3, 1, '#c9a26b/.6']]) + paint([[10, 25, 1, 2, 'cur']]),
  'wk-read0': () => paint([...READ_TABLE, [8, 23, 12, 2, '#6e2a22'], [9, 23, 10, 1, PAPER], [15, 24, 3, 1, '#f0c95a']]) + paint([[12, 25, 1, 2, 'cur']]),
  // typing pool: corkboards of code printouts, and a desk where every coder peers over a low screen of colored code
  // (its cursor blinking) above its keyboard, a paper stack (pages fly off) and a mug
  'wk-corks': (c) => pattern(c, 'wk-corks', 34, 11, paint([[0, 0, 18, 11, '#7d5f3c'], [1, 1, 16, 9, '#b08850'], [2, 2, 4, 6, PAPER],
    [7, 3, 4, 5, PAPER], [12, 2, 4, 4, '#eec96f'], [3, 3, 2, 1, '#c678dd'], [3, 5, 2, 1, ROLE.busy], [8, 4, 2, 1, ROLE.busy], [8, 6, 2, 1, '#c678dd'],
    [4, 2, 1, 1, ROLE.ask], [9, 3, 1, 1, ROLE.ask], [14, 2, 1, 1, '#3f7fb8']])),
  'wk-type': (c) => paint([
    [0, 25, 30, 1, DESK[0]], [0, 26, 30, 1, DESK[1]], [1, 27, 2, 9, DESK[2]], [21, 27, 8, 9, DESK[2]],
    [22, 28, 6, 3, '#7d5f3c'], [22, 32, 6, 3, '#7d5f3c'],
    [5, 19, 16, 6, '#2b2f36'], [6, 20, 14, 4, '#1b2030'], [7, 20, 2, 1, '#c678dd'], [10, 20, 5, 1, ROLE.busy], [8, 21, 3, 1, '#eec96f'],
    [12, 21, 6, 1, ROLE.busy], [8, 22, 2, 1, '#c678dd'], [11, 22, 4, 1, '#eec96f'], [7, 23, 3, 1, '#c678dd'],
    [6, 24, 13, 1, '#d6d0c4'], [7, 24, 11, 1, '#a49d90/.5'], [24, 22, 6, 3, PAPER], [25, 23, 4, 1, '#c9c0b0'],
  ]) + rect(11, 23, 2, 1, '#ffffff', aO(c, '1;0', 0.8)) +
    `<g>${paint([[25, 19, 4, 2, PAPER]])}${aT(c, '0 0;0 -2;1 -4;2 -6', 2.4)}${aO(c, '1;1;.6;0', 2.4)}</g>` + use(c, 'mug', -1, 21),
  // internet café: the globe screen, and a café table with a laptop (a sticker in the project's color) and a coffee
  'wk-globe': globe,
  'wk-cafe': (c) => paint([
    [1, 25, 26, 1, DESK[0]], [2, 26, 24, 1, DESK[1]], [13, 27, 2, 8, DESK[2]], [9, 35, 10, 1, '#4a3520'],
    [9, 19, 12, 6, '#a4a9b0'], [9, 19, 12, 1, '#c4c9d0'], [8, 24, 14, 1, '#8a8f96'],
  ]) + paint([[13, 21, 4, 2, 'cur']]) + use(c, 'mug', 2, 21),
  // gadget shop: pegboards of tools, and a workbench with a vise, a blinking gadget and parts bins
  'wk-pegs': (c) => pattern(c, 'wk-pegs', 30, 11, pegboard()),
  'wk-shop': (c) => paint([
    [0, 25, 30, 2, '#9a7b4f'], [0, 27, 30, 1, '#6f5636'], [1, 28, 3, 8, DESK[2]], [26, 28, 3, 8, DESK[2]], [4, 33, 22, 1, DESK[2]],
    [25, 21, 4, 4, '#5d6168'], [26, 20, 2, 1, '#8a8f96'], [8, 21, 9, 4, '#3a3f48'], [9, 22, 3, 2, '#7fd6e8'], [13, 22, 3, 1, '#a4a9b0'],
    [14, 18, 1, 3, '#a4a9b0'], [15, 30, 7, 3, '#3f7fb8'],
  ]) + paint([[6, 30, 7, 3, 'cur']]) + rect(14, 17, 1, 1, ROLE.ask, aA(c, 'fill', `${ROLE.ask};${ROLE.busy}`, 1)),
  // phone booth: the inside (a phone on the wall), the Clawd on the phone, the red frame and its glass in front
  'wk-boothB': () => paint([[2, 6, 25, 29, '#2a1f1d'], [3, 8, 4, 6, '#3a3f48'], [4, 9, 2, 1, '#8a8f96'], [4, 11, 2, 1, '#8a8f96']]),
  'wk-hook': () => paint([[2, 14, 2, 4, '#1b1b1f']]),
  'wk-rcv': () => paint([[2, 20, 2, 5, '#1b1b1f'], [3, 14, 1, 6, '#1b1b1f']]),
  'wk-boothF': () => paint([
    [0, 1, 29, 2, '#9a3428'], [12, 0, 5, 1, '#9a3428'], [2, 3, 25, 3, PAPER],
    [0, 3, 2, 33, '#c8463a'], [27, 3, 2, 33, '#c8463a'], [2, 6, 25, 1, '#c8463a'], [2, 12, 25, 1, '#c8463a'], [2, 18, 25, 1, '#c8463a'],
    [14, 7, 1, 11, '#c8463a'], [2, 28, 25, 6, '#b03c31'], [3, 29, 11, 4, '#9a3428'], [15, 29, 11, 4, '#9a3428'], [0, 34, 29, 2, '#9a3428'],
    [0, 3, 1, 31, '#e0705f'],
    [7, 4, 15, 1, '#3a2a20'],
    [2, 7, 25, 11, '#cfe8ff/.1'],
  ]),
  'wk-say': (c) => paint([[1, 0, 11, 7, PAPER], [0, 1, 13, 5, PAPER], [1, 7, 2, 1, PAPER], [0, 8, 1, 1, PAPER], [3, 3, 2, 1, '#7a6f5c'], [6, 3, 2, 1, '#7a6f5c']]) +
    `<g>${paint([[9, 3, 2, 1, '#7a6f5c']])}${aO(c, '0;1', 1)}</g>`,
  // management: the org chart on the wall (a boss box on top, three helper boxes below, plain head-and-shoulders
  // silhouettes in them: a chart, not more Clawds to count) with a task travelling down, and the boss's desk
  'wk-org': (c) => {
    const r = [[12, 0, 11, 7, '#d4a94f'], [13, 1, 9, 5, '#2b2520'], [17, 7, 1, 3, '#a4977c'], [4, 10, 27, 1, '#a4977c'],
      [4, 11, 1, 2, '#a4977c'], [17, 11, 1, 2, '#a4977c'], [30, 11, 1, 2, '#a4977c']]
    for (const x of [0, 13, 26]) r.push([x, 13, 9, 7, ROLE.intern], [x + 1, 14, 7, 5, '#2b2520'])
    const who = (x, y) => [[x + 2, y, 3, 2, '#a4977c'], [x + 1, y + 2, 5, 2, '#a4977c']]
    return paint([...r, ...who(14, 2), ...[0, 13, 26].flatMap((x) => who(x + 1, 15))]) +
      `<g>${rect(16, 7, 2, 2, ROLE.accent)}${aT(c, '0 0;0 2;-6 2;-12 2;-12 4;-12 4', 2.4)}${aO(c, '1;1;1;1;1;0', 2.4)}</g>`
  },
  // the org chart small enough for any management room (23 × 12), on the wall over the bosses' heads: the boss box, a
  // helper box under it each side, a task travelling down to one of them
  'wk-orgS': (c) => {
    const line = '#a4977c'
    const r = [[8, 0, 7, 4, '#d4a94f'], [9, 1, 5, 2, '#2b2520'], [11, 4, 1, 2, line], [2, 6, 19, 1, line], [2, 7, 1, 1, line], [11, 7, 1, 1, line],
      [20, 7, 1, 1, line]]
    for (const x of [0, 9, 18]) r.push([x, 8, 5, 4, ROLE.intern], [x + 1, 9, 3, 2, '#2b2520'])
    return paint(r) + `<g>${rect(11, 4, 1, 1, ROLE.accent)}${aT(c, '0 0;0 2;-9 2;-9 3;-9 3', 2.4)}${aO(c, '1;1;1;1;0', 2.4)}</g>`
  },
  'wk-boss': (c) => paint([
    [0, 25, 34, 1, DESK[1]], [0, 26, 34, 10, '#5a4129'], [0, 27, 34, 1, '#d4a94f'], [3, 29, 12, 5, '#4a3520'], [19, 29, 12, 5, '#4a3520'],
    [9, 23, 10, 2, '#d4a94f'], [10, 24, 8, 1, '#7a5a2a'], [27, 22, 6, 3, PAPER], [27, 24, 6, 1, INK],
  ]) + `<g>${paint([[28, 20, 4, 2, PAPER]])}${aT(c, '0 0;3 -2;6 -3;9 -3', 2)}${aO(c, '1;1;.6;0', 2)}</g>`,
  // art studio: framed paintings (a sunset, flowers in a vase), an easel whose canvas keeps changing, palette and brush
  'wk-arts': (c) => pattern(c, 'wk-arts', 32, 12, paint([
    [0, 0, 12, 10, '#d4a94f'], [1, 1, 10, 3, '#e08fc0'], [1, 4, 10, 2, '#eec96f'], [1, 6, 10, 3, '#3f7fb8'], [7, 3, 2, 2, '#f6d860'],
    [15, 1, 9, 9, DESK[1]], [16, 2, 7, 7, '#f4f1e8'], [18, 6, 3, 3, '#3f7fb8'], [19, 4, 1, 2, '#4f7f34'], [17, 3, 1, 1, '#e07a61'],
    [19, 2, 1, 2, '#eec96f'], [21, 3, 1, 1, '#c678dd'], [18, 5, 1, 1, '#4f7f34'], [20, 5, 1, 1, '#4f7f34'],
  ])),
  'wk-easel': (c) => {
    const cols = ['#e07a61', '#eec96f', '#6f91dc']
    return paint([[27, 16, 1, 20, '#9a7b4f'], [37, 16, 1, 20, '#9a7b4f'], [32, 14, 1, 3, '#9a7b4f'], [27, 31, 11, 1, '#9a7b4f'],
      [26, 17, 13, 11, '#e9e4d6'], [25, 28, 15, 1, DESK[2]], [31, 19, 3, 7, cols[1]], [34, 19, 3, 7, cols[2]], [6, 35, 2, 1, cols[0]],
      [14, 35, 1, 1, cols[2]], [30, 35, 2, 1, cols[1]]]) + rect(28, 19, 3, 7, cols[0], aA(c, 'fill', cols.join(';'), 2.4))
  },
  'wk-brush': () => paint([[-3, 28, 6, 2, '#c9a26b'], [-2, 27, 4, 1, '#c9a26b'], [-2, 30, 4, 1, '#c9a26b'], [-2, 28, 1, 1, '#e07a61'],
    [0, 28, 1, 1, '#6f91dc'], [-1, 29, 1, 1, ROLE.busy], [1, 29, 1, 1, '#eec96f'], [24, 27, 2, 1, DESK[2]]]) + paint([[26, 27, 1, 1, 'cur']]),
  // a hallway at the end of a row: the lift (its arrow blinks, the call button beside it), a vending machine, a bench
  'wk-vend': () => paint([[0, 8, 14, 28, '#3f7fb8'], [0, 8, 14, 1, '#6f91dc'], [13, 9, 1, 27, '#2f5f8a'], [2, 10, 8, 17, '#14100c'],
    ...[0, 1, 2, 3].flatMap((r) => [[3, 11 + r * 4, 2, 2, ['#e07a61', '#eec96f', '#9ab86a', '#c678dd'][r]], [6, 11 + r * 4, 2, 2, ['#eec96f', '#6f91dc', '#e07a61', '#9ab86a'][r]]]),
    [2, 10, 8, 17, '#ffffff/.06'], [11, 12, 2, 4, '#c9ced8'], [11, 18, 2, 1, ROLE.accent], [2, 29, 8, 3, '#0b0d10'], [1, 35, 13, 1, '#000/.4']]),
  'wk-bench': () => paint([[0, 29, 26, 2, DESK[0]], [0, 31, 26, 1, DESK[1]], [2, 32, 2, 4, DESK[2]], [22, 32, 2, 4, DESK[2]],
    [0, 23, 26, 1, DESK[1]], [1, 24, 1, 5, DESK[2]], [24, 24, 1, 5, DESK[2]]]),
  'wk-lift': (c) => paint([[0, 8, 20, 28, '#5d6168'], [0, 8, 20, 1, '#8a8f96'], [2, 10, 8, 26, '#a4a9b0'], [10, 10, 8, 26, '#8a8f96'],
    [3, 11, 1, 24, '#c4c9d0'], [11, 11, 1, 24, '#a4a9b0'], [5, 2, 10, 5, '#14100c'], [5, 7, 10, 1, '#000/.4'], [21, 21, 2, 4, '#3a3f48']]) +
    `<g>${paint([[10, 3, 1, 1, ROLE.accent], [9, 4, 3, 1, ROLE.accent], [21, 22, 2, 1, ROLE.accent]])}${aO(c, '1;1;.3', 1.6)}</g>`,
  // a closed department: the sign on its door
  'wk-closed': () => paint([[5, 0, 1, 2, '#8a8478'], [16, 0, 1, 2, '#8a8478'], [0, 2, 22, 7, '#2b2520'], [0, 8, 22, 1, '#000/.4']]) +
    txt(11, 7, 'closed', 4.5, ROLE.night, ' text-anchor="middle"'),
})

// ---------------------------------------------------------------- rooms (each painted in its own box: x 0…w, y 0…36, floor at 36)

// x of `k` stations `pitch` apart, centered in [from, to).
function spots(from, to, k, pitch) {
  const x0 = from + Math.floor((to - from - k * pitch) / 2)
  return Array.from({ length: k }, (_, i) => x0 + i * pitch)
}

/**
 * A wall of props across the room, centered: as many `item`-wide copies `step` apart as fit, painted by one rect
 * filled with the sprite's pattern (`layers` adds the blinking ones: [pattern name, opacity values, duration]).
 */
function wall(ctx, name, item, step, h, w, y, layers = []) {
  const k = Math.max(0, Math.floor((w - 4 - item) / step) + 1)
  if (!k) return ''
  use(ctx, name) // registers the pattern in <defs>; the <use> itself (of an empty group) is not drawn
  const rw = (k - 1) * step + item
  const fill = (p) => `<rect width="${rw}" height="${h}" fill="url(#${ctx.id}${p}p)"`
  return `<g transform="translate(${Math.floor((w - rw) / 2)} ${y})">${fill(name)}/>` +
    layers.map(([p, v, d]) => (ctx.animate ? `${fill(p)}>${aO(ctx, v, d)}</rect>` : `${fill(p)}/>`)).join('') + '</g>'
}

// A page turning over the book of the reader at station x, every 7 s, reader `i` of the building on a phase of its own
// (2.9 s apart, wrapped: neighbours never turn in a wave): one path whose shape steps through the flip, lifting off the
// right cover, standing up at the spine, falling to the left. Nothing when not animating.
const PAGE_FLIP = ['M0 0', 'M14 18h5v1h-5zM16 17h3v1h-3z', 'M13 14h1v5h-1zM12 15h1v3h-1z', 'M8 18h5v1h-5zM8 17h3v1h-3z', 'M0 0']
function turnPage(ctx, x, i) {
  if (!ctx.animate) return ''
  const dur = 7
  const begin = r1((i * 2.9) % dur)
  return `<path fill="${PAPER}" transform="translate(${x} 0)" d="M0 0"><animate attributeName="d" values="${PAGE_FLIP.join(';')}" ` +
    `keyTimes="0;.88;.91;.94;.97" dur="${dur}s"${begin ? ` begin="-${begin}s"` : ''} calcMode="discrete" repeatCount="indefinite"/></path>`
}

// Who works at station i of a room, in pose `p`: the cast by agent-time (ctx.pick), Clawd alone in an all-Claude office.
const fig = (ctx, r, i, p) => pose(ctx.pick ? ctx.pick((r.base ?? 0) + i) : 'claude', p)

// The project color a station's mug, sticker or bin wears (its Clawd's project; the busiest one for an empty station).
const tag = (r, i) => ` color="${r.tags[i] ?? r.tags[0] ?? r.top[0]?.color ?? MUTED}"`

/** The furnishing of each department: wall props, then one work station per Clawd (plus an empty one when nobody is in). */
const PAINT = {
  terminal(ctx, r) {
    let s = wall(ctx, 'wk-racks', 13, 16, 32, r.w, 4, [['wk-ledg', '1;0;1;1;0;1', 1.8], ['wk-leda', '1;0;0;1', 0.9]])
    // the wall's last rack (as wall() lays them out) stands open, in a room of three racks or more (an extra)
    const racks = Math.floor((r.w - 4 - 13) / 16) + 1
    if (r.extras && racks >= 3) s += use(ctx, 'wk-rackopen', Math.floor((r.w - (racks - 1) * 16 - 13) / 2) + (racks - 1) * 16, 4)
    spots(0, r.w, r.n + r.empty, r.pitch).forEach((x, i) => {
      if (i < r.n) s += use(ctx, fig(ctx, r, i, i % 3 === 2 ? 'R' : 'T0'), x + 1, SEAT)
      s += use(ctx, 'wk-con', x, 0)
    })
    return s
  },
  testing(ctx, r) {
    let s = wall(ctx, 'wk-qabs', 27, 40, 12, r.w, 1, [['wk-qax', '1;1;.2', 1.2]])
    spots(0, r.w, r.n + r.empty, r.pitch).forEach((x, i) => {
      if (i < r.n) s += use(ctx, fig(ctx, r, i, 'R'), x + 3, SEAT)
      s += use(ctx, 'wk-qa', x, 0)
    })
    return s
  },
  reading(ctx, r) {
    let s = wall(ctx, 'wk-shelves', 26, 27, 33, r.w, 3)
    const at = spots(0, r.w, r.n + r.empty, r.pitch)
    // the rolling ladder on the shelves, where the table leaves room for it (an extra: it goes first)
    if (r.extras && at.length && at[0] >= 12) s += use(ctx, 'wk-ladder', at[0] - 10, 3)
    at.forEach((x, i) => {
      if (i < r.n) s += use(ctx, fig(ctx, r, i, 'L'), x, SEAT)
      s += use(ctx, i < r.n ? 'wk-read' : 'wk-read0', x, 0, tag(r, i))
      if (i < r.n && r.extras) s += turnPage(ctx, x, (r.base ?? 0) + i)
    })
    return s
  },
  coding(ctx, r) {
    // the whole office's lines scoreboard on the wall, the corkboards beside it, where the room has the width for both
    // (quiet: corkboards alone)
    const t = ctx.f.totals
    const lines = r.lit && !ctx.quiet ? linesTicker(ctx, t?.additions, t?.deletions, rangeWord(ctx.f)) : null
    const board = lines && lines.w + 30 <= r.w ? lines : null
    let s = wall(ctx, 'wk-corks', 18, 34, 11, board ? r.w - board.w - 4 : r.w, 1)
    if (board) s += board.at(r.w - board.w - 3, 2)
    spots(0, r.w, r.n + r.empty, r.pitch).forEach((x, i) => {
      if (i < r.n) s += use(ctx, fig(ctx, r, i, 'T0'), x + 1, SEAT)
      s += use(ctx, 'wk-type', x, 0, tag(r, i))
    })
    return s
  },
  web(ctx, r) {
    const k = r.n + r.empty
    const bar = r.lit && r.w - k * r.pitch >= 34
    let s = use(ctx, 'wk-globe', bar ? Math.max(3, Math.floor((r.w - 28 - 17) / 2)) : Math.floor((r.w - 17) / 2), 0)
    if (bar) s += use(ctx, 'coffee', r.w - 27, 18)
    spots(0, bar ? r.w - 28 : r.w, k, r.pitch).forEach((x, i) => {
      if (i < r.n) s += use(ctx, fig(ctx, r, i, 'L'), x + 3, SEAT)
      s += use(ctx, 'wk-cafe', x, 0, tag(r, i))
    })
    return s
  },
  tools(ctx, r) {
    let s = wall(ctx, 'wk-pegs', 28, 30, 11, r.w, 1)
    spots(0, r.w, r.n + r.empty, r.pitch).forEach((x, i) => {
      if (i < r.n) s += use(ctx, fig(ctx, r, i, 'T0'), x + 1, SEAT)
      s += use(ctx, 'wk-shop', x, 0, tag(r, i))
    })
    return s
  },
  planning(ctx, r) {
    const bw = r.w - 6
    const cols = clamp(Math.floor((bw - 4) / 14), 1, 6)
    const rnd = seeded(`wk-board-${cols}`)
    const NOTE = ['#eec96f', '#e08fc0', '#7fd6e8', ROLE.busy]
    const ink = [[3, 1, bw, 20, '#cfc8b8'], [4, 2, bw - 2, 18, '#f4f1e8'], [5, 21, bw - 4, 1, '#8a8478'], [7, 20, 3, 1, ROLE.ask], [11, 20, 3, 1, '#3f7fb8']]
    const notes = []
    for (let i = 0; i < cols; i++) {
      const cx = 6 + i * 14
      ink.push([cx, 4, 6, 1, '#5d6168'])
      for (let j = 0, k = 1 + Math.floor(rnd() * 3); j < k; j++) notes.push([cx + (j % 2), 7 + j * 4, 5, 3, NOTE[(i + j) % 4]])
      if (i < cols - 1) ink.push([cx + 7, 9, 4, 1, '#6f91dc'], [cx + 10, 8, 1, 3, '#6f91dc'])
    }
    let s = paint([...ink, ...notes])
    // one sticky note on its way to the next column
    if (cols > 1) s += `<g>${paint([[7, 16, 5, 3, '#eec96f']])}${aT(ctx, '0 0;0 0;7 -1;14 0;14 0', 3.2)}</g>`
    spots(0, r.w, r.n, r.pitch).forEach((x, i) => {
      s += use(ctx, fig(ctx, r, i, `K${i % 2}`), x + 1, STAND)
    })
    return s
  },
  talking(ctx, r) {
    let s = ''
    spots(0, r.w, r.n + r.empty, r.pitch).forEach((x, i) => {
      const b = x + 1
      s += use(ctx, 'wk-boothB', b, 0)
      s += i < r.n ? use(ctx, fig(ctx, r, i, 'L'), b + 2, 16) + use(ctx, 'wk-rcv', b, 0) : use(ctx, 'wk-hook', b, 0)
      s += use(ctx, 'wk-boothF', b, 0)
      if (i < r.n) s += use(ctx, 'wk-say', b + 29, 3)
    })
    return s
  },
  delegating(ctx, r) {
    const k = r.n + r.empty
    const chart = r.w - k * r.pitch >= CHART + 2
    // the big org chart beside the desks when the room has the width, else the small one on the wall over them
    let s = chart ? use(ctx, 'wk-org', r.w - CHART, 3) : use(ctx, 'wk-orgS', Math.floor((r.w - 23) / 2), 0)
    spots(0, chart ? r.w - CHART : r.w, k, r.pitch).forEach((x, i) => {
      if (i < r.n) s += use(ctx, fig(ctx, r, i, 'D'), x + 2, SEAT)
      s += use(ctx, 'wk-boss', x + 1, 0)
    })
    return s
  },
  design(ctx, r) {
    let s = wall(ctx, 'wk-arts', 24, 32, 12, r.w, 2)
    spots(0, r.w, r.n + r.empty, r.pitch).forEach((x, i) => {
      if (i < r.n) s += use(ctx, fig(ctx, r, i, 'K0'), x + 3, STAND) + use(ctx, 'wk-brush', x + 3, 0, tag(r, i))
      s += use(ctx, 'wk-easel', x + 3, 0)
    })
    return s
  },
}

// ---------------------------------------------------------------- layout

// Widths a room cannot go under: its nameplate, its caption (the share and its call count, the kind of work in the
// short words) and its stations. Management's org chart is not one: it hangs only where the room has width to spare.
// A room of the top tier also needs its name line to hold its share, framed after the nameplate (headW).
function sizeRoom(r, IW) {
  r.lit = r.v > 0
  r.calls = r.v ? `${fmtInt(r.said)} ${r.said === 1 ? 'call' : 'calls'}` : 'no calls'
  const caption = Math.max(textW(DEPARTMENT_WORK[r.k], 5), textW(r.share, 9) + 3 + textW(r.calls, 5)) + 8
  const plate = textW(r.name.toUpperCase(), 5.5) + 16
  r.minW = Math.min(IW, Math.ceil(Math.max(caption, plate, r.n ? r.n * r.pitch + 6 : 0)))
  r.headW = Math.ceil(textW(r.name.toUpperCase(), 5.5) + 6 + 3 + textW(r.share, 9) + 6 + 3)
}

/**
 * A row of the top tier: `top`, the busiest rooms, side by side across the whole width, each as wide as its share of
 * theirs and never under what its stations and its name line need (what a narrow one needs comes off the widest), nor
 * under a cell of the grid below (`cell`): when `lend`, only where the widest can spare it, else always. null when they
 * do not fit in one row.
 */
function fillRow(top, IW, IX0, cell, lend) {
  const need = top.map((r) => Math.min(IW, Math.max(r.minW, r.headW, lend ? 0 : cell)))
  const room = IW - GAP * (top.length - 1)
  if (need.reduce((a, b) => a + b, 0) > room) return null
  const sum = top.reduce((a, r) => a + r.v, 0) || 1
  const w = top.map((r, i) => Math.max(need[i], Math.floor((room * r.v) / sum)))
  for (let over = w.reduce((a, b) => a + b, 0) - room; over > 0;) {
    const i = w.reduce((m, x, j) => (x - need[j] > w[m] - need[m] ? j : m), 0)
    const take = Math.min(over, w[i] - need[i])
    if (take <= 0) break
    w[i] -= take
    over -= take
  }
  w[0] += room - w.reduce((a, b) => a + b, 0)
  for (let i = 1; lend && i < top.length; i++) {
    // busier first, and never wider than the room before it
    const spare = Math.min(cell - w[i], w[0] - Math.max(need[0], cell), w[i - 1] - w[i])
    if (spare > 0) {
      w[i] += spare
      w[0] -= spare
    }
  }
  let x = IX0
  top.forEach((r, i) => {
    r.w = w[i]
    r.x = x
    x += w[i] + GAP
  })
  return { rooms: top, hall: null, tier: 1 }
}

/**
 * The top tier: as many of the three busiest rooms as fit in one row, none narrower than a cell of the grid under them;
 * none for a range without a call. `lend` (the work scene's, whose top tier frames its shares) lets a narrow one fit
 * and widens it to a cell where the widest can spare it, so the three busiest share the top more often; the live
 * building's basement keeps to whole cells, every char there being the floors' upstairs.
 */
function tierOne(rooms, IW, IX0, lend) {
  const lit = rooms.filter((r) => r.v > 0)
  for (let k = Math.min(3, lit.length); k >= 1; k--) {
    const row = fillRow(lit.slice(0, k), IW, IX0, gridCells(rooms.slice(k), IW).cw, lend)
    if (row) return [row]
  }
  return []
}

/**
 * The other rooms in a grid of equal cells, as wide as the widest ordinary room needs and never under CELL (a room
 * that needs far more, its Clawds many, spans as many cells as it needs), as many to a row as fit, the rows as even as
 * they can be (7 rooms 4 + 3, not 6 + 1). Each row takes the next rooms that fit in it; the cells left at the end of
 * the last row are a hallway.
 */
function gridCells(rest, IW) {
  if (!rest.length) return { per: 1, cw: 0, span: () => 1 }
  const mins = rest.map((r) => r.minW).sort((a, b) => a - b)
  const median = mins[Math.floor(mins.length / 2)]
  const c0 = Math.max(CELL, ...mins.filter((m) => m <= median * 1.5))
  const cells = (n) => Math.floor((IW - GAP * (n - 1)) / n)
  let per = clamp(Math.floor((IW + GAP) / (c0 + GAP)), 1, rest.length)
  const across = (r, cw) => clamp(Math.ceil((r.minW + GAP) / (cw + GAP)), 1, per)
  if (rest.every((r) => across(r, cells(per)) === 1)) per = Math.ceil(rest.length / Math.ceil(rest.length / per))
  const cw = cells(per)
  return { per, cw, span: (r) => across(r, cw) }
}
function gridOf(rest, IW, IX0) {
  if (!rest.length) return []
  const { per, cw, span } = gridCells(rest, IW)
  const left = [...rest]
  const rows = []
  while (left.length) {
    const row = []
    for (let i = 0, used = 0; i < left.length && used < per;) {
      const k = span(left[i])
      if (used + k > per) {
        i++
        continue
      }
      row.push([left.splice(i, 1)[0], k])
      used += k
    }
    let x = IX0
    for (const [r, k] of row) {
      r.w = k * cw + (k - 1) * GAP
      r.x = x
      x += r.w + GAP
    }
    const spare = IX0 + IW - x
    rows.push({ rooms: row.map(([r]) => r), hall: spare >= HALL ? { x, w: spare } : null, tier: 2 })
  }
  return rows
}

// Which projects made a department's calls, busiest first (its tooltip names two), and one project color per Clawd
// (largest remainder) for the mugs, stickers and bins of its stations.
function projectsOf(ctx, k, n) {
  const list = ctx.f.projects.map((p) => ({ name: String(p.name ?? '?'), v: count(p.activity, k) })).filter((p) => p.v > 0).sort((a, b) => b.v - a.v)
  const sum = list.reduce((a, p) => a + p.v, 0)
  const top = list.slice(0, 6).map((p) => ({ ...p, color: ctx.color(p.name) }))
  const seats = top.map((p) => ({ p, q: (p.v / (sum || 1)) * n, k: Math.floor((p.v / (sum || 1)) * n) }))
  for (let left = n - seats.reduce((a, x) => a + x.k, 0); left > 0 && seats.length; left--) {
    seats.reduce((m, x) => (x.q - x.k > m.q - m.k ? x : m)).k++
  }
  return { list, sum, top, tags: seats.flatMap((x) => new Array(x.k).fill(x.p.color)) }
}

// A room's top band, as the live floor draws it: the nameplate (its plate merged into `rects`, its name returned as a
// bare <text> for a group that sets PLATE_FONT), then an optional dim group of words in the wall left over.
function header(x, top, w, name, color, rects, words = '') {
  const p = plateParts(x + 3, top + 2, name, color, w - 10)
  rects.push(...p.rects)
  const cx = x + 3 + p.w + 4
  return { plate: p.text, light: p.light, rest: words ? txt(cx + 1, top + 9, fit(words, x + w - cx - 5, 5), 5, K.groupText) : '' }
}

// ---------------------------------------------------------------- the interns' bench and the hallway

// The interns (subagents) the Clawds hired, by job title: mini Clawds on a bench, a badge each, `559 consultants`.
const JOB_BADGE = { consultant: ROLE.meeting, researcher: ROLE.idle, generalist: ROLE.intern, architect: ROLE.accent, reviewer: ROLE.ship }

function internJobs(f) {
  const types = f.totals?.intern_types
  const jobs = new Map()
  if (types && typeof types === 'object') {
    for (const t of Object.keys(types)) {
      const n = Math.round(count(types, t))
      if (n > 0) jobs.set(jobTitle(t), (jobs.get(jobTitle(t)) ?? 0) + n)
    }
  }
  return [...jobs].map(([title, n]) => ({ title, n })).sort((a, b) => b.n - a.n || a.title.localeCompare(b.title))
}

function bench(ctx, x, top, w, jobs, d) {
  const floor = top + HEAD + LOBBY
  const total = jobs.reduce((a, j) => a + j.n, 0)
  const rects = [[x, top, w, HEAD + LOBBY, K.wall], [x, floor - 8, w, 8, K.wallLow], ...(ctx.night ? ceilingLight(x, top, w) : [])]
  const head = header(x, top, w, 'INTERNS', ROLE.intern, rects, `${plural(total, 'helper')} hired, by job`)
  const legs = Array.from({ length: Math.floor((w - 10) / 40) + 1 }, (_, i) => [x + 5 + i * 40, floor - 3, 2, 3, DESK[2]])
  let s = paint([...rects, [x + 3, floor - 5, w - 6, 1, DESK[0]], [x + 3, floor - 4, w - 6, 1, DESK[1]], ...legs, [x + w - 7, floor - 3, 2, 3, DESK[2]]]) +
    `${paint(head.light)}<g ${PLATE_FONT}>${head.plate}</g>${head.rest}`
  const max = jobs[0]?.n || 1
  let cx = x + 8
  let shown = 0
  for (const j of jobs) {
    const k = clamp(Math.round((d.minis * j.n) / max), 1, d.minis)
    const label = plural(j.n, j.title)
    const gw = k * 12 + 2 + textW(label, 5) + 10
    if (cx + gw > x + w - 4 - (shown < jobs.length - 1 ? textW('+9 more', 5) + 4 : 0)) break
    const badge = JOB_BADGE[j.title] ?? ROLE.dim
    let g = ''
    for (let i = 0; i < k; i++) g += use(ctx, 'cI0', cx + i * 12, floor - 11)
    g += paint(Array.from({ length: k }, (_, i) => [cx + i * 12 + 4, floor - 4, 3, 2, badge])) + txt(cx + k * 12 + 2, floor - 6, label, 5, badge)
    s += `<g><title>${esc(`${label}: interns are helper agents (subagents) their bosses delegated to`)}</title>${g}</g>`
    cx += gw
    shown++
  }
  if (shown < jobs.length) s += txt(cx, floor - 6, `+${jobs.length - shown} more`, 5, ROLE.dim)
  return s
}

// What a hallway holds, most wanted first: [sprite, width, y of its box, order left to right].
const HALL_PROPS = [['wk-lift', 23, 0, 2], ['plant', 10, 24, 4], ['cooler', 10, 12, 0], ['wk-vend', 15, 0, 3], ['wk-bench', 26, 0, 1]]
const HALL_KEEP = 2 // how many of them a hallway takes, most wanted first

// The width a row has left after its rooms (they are only as wide as their share): a hallway with windows, the lift,
// a plant, the water cooler, a vending machine and a bench, each as room allows (a narrow one keeps just a plant),
// spread along it. No Clawd waits there:
// every Clawd in the building is busy in a department. Its tooltip says why it is there.
function hallway(ctx, { x, w }, top, back) {
  const floor = top + HEAD + ROW
  back.push([x - GAP, top, GAP, HEAD + ROW, K.part], [x - GAP, top, 1, HEAD + ROW, K.partHi], [x, top, w, HEAD + ROW, K.wallLow],
    [x, floor - 14, w, 14, K.wallDarkLow], [x, floor - 15, w, 1, '#000/.25'])
  if (ctx.night) back.push(...ceilingLight(x, top, w))
  let s = ''
  // its windows at its far end, as a room's header keeps them (svg-kit HEAD_WINDOWS)
  const wins = []
  for (let wx = x + 5; wx + 18 <= x + w - 4; wx += 26) wins.push(wx)
  for (const wx of wins.slice(-HEAD_WINDOWS)) s += use(ctx, ctx.night ? 'wn' : 'wd', wx, top + 2)
  const props = []
  let used = 0
  // the lift and a plant at most: the grid's last row can leave a long corridor, and the corridor's other furniture
  // (the water cooler, the vending machine, the bench) would weigh more than a room; down in the live building's
  // basement, where every char is the floors' upstairs, a plant alone
  for (const p of ctx.view === 'live' ? HALL_PROPS.filter(([name]) => name === 'plant') : HALL_PROPS.slice(0, HALL_KEEP)) {
    if (used + p[1] + 8 > w) continue
    props.push(p)
    used += p[1] + 8
  }
  props.sort((a, b) => a[3] - b[3])
  const gap = (w - props.reduce((a, p) => a + p[1], 0)) / (props.length + 1)
  let px = x + gap
  for (const [name, pw, y] of props) {
    s += use(ctx, name, Math.round(px), top + HEAD + y)
    px += pw + gap
  }
  return `<g><title>hallway: every room is as wide as its share of the calls, so what is left is corridor</title>${s}</g>`
}

// ---------------------------------------------------------------- scene

/**
 * The detail ladder, richest first: the extras (the library's turning pages and its ladder, the server room's open
 * rack) and the interns' bench with its mini Clawds; no extras; no bench (the interns become a ground line); then the
 * smallest departments, one more per step, lose their furniture (their Clawds stay, as tiny figures); last, for a very
 * crowded range, no tooltips and no project or intern lines. Furniture is what weighs: a Clawd is one <use>, a
 * furnished room brings its own sprites.
 */
export const LADDER = [{ minis: 4, plain: 0, extras: true }, { minis: 4, plain: 0 }, ...Array.from({ length: 11 }, (_, k) => ({ minis: 0, plain: k })),
  { minis: 0, plain: 10, bare: true }]

// A room without furniture: its Clawds as tiny figures standing on the floor.
function plainRoom(ctx, r) {
  return spots(0, r.w, r.n, 10).map((x, i) => use(ctx, fig(ctx, r, i, 'M'), x + 1, 31)).join('')
}

/**
 * What they did: every tool call of the range, drawn as the departments of a cut-away building (server room =
 * terminal commands, …), busiest first, each room as wide as its share of the calls with a busy Clawd per started 5%
 * or 10% of them, captioned with its share, its call count and the kind of work in plain words, under the shared header
 * (svg-kit sceneHeader). It draws the richest step of LADDER whose rooms weigh at most WORK_BUDGET (the interns' bench goes
 * first, then the smallest rooms' furniture), the barest when none does; renderSvg's tighter caps start it lower and
 * give it less. Returns the slice `{ svg, h, alt, gist, top, under }` painted from y0 down (the scene contract: SCENES
 * in lib/svg.mjs).
 */
export function sceneWork(ctx, y0) {
  const level = clamp(Number(ctx.caps?.level) || 0, 0, 2)
  const budget = [WORK_BUDGET, 26_000, 16_000][level]
  for (let i = [0, 2, 5][level]; ; i++) {
    // drawn into a <defs> of its own, so a sprite the commits line already placed is weighed here too
    const c = { ...ctx, defs: new Map(), brick: false }
    const out = drawWork(c, y0, LADDER[i])
    let size = out.svg.length - out.roofChars
    for (const [k, v] of c.defs) size += v.length + k.length + 24
    if (size <= budget || i === LADDER.length - 1) {
      for (const [k, v] of c.defs) if (!ctx.defs.has(k)) ctx.defs.set(k, v)
      ctx.brick ||= c.brick
      return out
    }
  }
}

/**
 * Every department as a room `IW` wide from IX0 (the work scene's and the Office basement's), with a busy Clawd per
 * started `unit` % of the exact counts: the top tier (tierOne) over the grid of the others (gridOf), each room's bar
 * (`bar`, its share of all the calls on one scale for the whole building: its inner width is all the calls, less when a
 * room is narrower than its share of it; never under 2 for a room with any call), the smallest `d.plain` drawn without
 * furniture, the extras (the library's turning pages and ladder, the server room's open rack) with `d.extras`.
 * Returns { unit, rooms, total (said), rows }.
 */
function layout(ctx, IX0, IW, d) {
  const exact = ctx.exact ?? ctx.f
  const unit = clawdUnit(exact, IW)
  const { rooms, total: sum } = workRooms(exact, unit)
  const total = said(ctx, sum)
  for (const r of rooms) {
    r.said = said(ctx, r.v)
    sizeRoom(r, IW)
    Object.assign(r, projectsOf(ctx, r.k, r.n))
  }
  const tier = tierOne(rooms, IW, IX0, ctx.view !== 'live')
  const rows = [...tier, ...gridOf(rooms.slice(tier.reduce((a, row) => a + row.rooms.length, 0)), IW, IX0)]
  const scale = Math.min(IW, ...rooms.filter((r) => r.v > 0).map((r) => ((r.w - 8) * sum) / r.v))
  for (const r of rooms) r.bar = r.v > 0 ? clamp(Math.round((scale * r.v) / sum), 2, r.w - 8) : 0
  rooms.forEach((r, i) => {
    r.plain = i >= rooms.length - d.plain
    r.extras = Boolean(d.extras)
    r.empty = !r.plain && r.n === 0 && r.k !== 'planning' && r.pitch + 4 <= r.w ? 1 : 0
  })
  return { unit, rooms, total, rows }
}

function drawWork(ctx, y0, d) {
  const { W, f } = ctx
  const BX0 = 6
  const BX1 = W - 6
  const IX0 = BX0 + 4
  const IW = BX1 - 4 - IX0
  const { unit, rooms, total, rows } = layout(ctx, IX0, IW, d)
  const interns = internJobs(f)
  const jobs = d.minis ? interns : []
  // ---- vertical plan: sky, roof, the title rule, the rows of rooms over their caption slabs, the interns' bench, the
  // ground lines
  const roof = y0 + SKY
  const ruleTop = roof + 5
  const rowsTop = ruleTop + RULE + 2
  const benchTop = rowsTop + rows.reduce((a, row) => a + rowH(ctx, row), 0)
  const groundY = benchTop + (jobs.length ? HEAD + LOBBY : 0)
  const lines = d.bare ? [] : groundLines(jobs.length ? [] : interns)
  const H = groundY + (lines.length ? 10 + lines.length * 9 : 6) - y0
  // ---- the shared header (sky, title, skyline, brick shell) with the key: the range (the title rule says what the
  // shares are of, and the total), what the bars and a Clawd stand for, in a shorter form rather than not at all
  const one = figureWord(ctx)
  const range = typeof f.range?.label === 'string' ? f.range.label : ''
  const key = [...(range ? [[[range, ROLE.title], [`bars to one scale · 1 ${one} = up to ${unit}% of the calls`, ROLE.dim]],
    [[range, ROLE.title], [`bars to scale · 1 ${one} ≤ ${unit}% of the calls`, ROLE.dim]], [[range, ROLE.title], [`1 ${one} ≤ ${unit}%`, ROLE.dim]]] : []),
  [[`${fmtInt(total)} tool calls`, ROLE.title], [`1 ${one} ≤ ${unit}%`, ROLE.dim]], [[`${fmtCount(total)} calls`, ROLE.title], [`1 ${one} ≤ ${unit}%`, ROLE.dim]]]
  const sub = total ? key.find((g) => fitInfo(g, W).length === 2) ?? key.at(-1) : [['no tool calls in this range yet', ROLE.dim], ['every department is closed', ROLE.dim]]
  // the roof, weighed apart (its markup and the sprites it brings): sceneWork's budget is the rooms'
  const before = new Set(ctx.defs.keys())
  let s = sceneHeader(ctx, y0, { view: 'what they did', when: f.range?.label ?? '', info: sub, groundY }).svg
  let roofChars = s.length
  for (const [k, v] of ctx.defs) if (!before.has(k)) roofChars += v.length + k.length + 24
  s += titleRule(IX0, ruleTop, IW, total) + paintRows(ctx, rows, rowsTop, IX0, IW, d, ctx.night)
  if (jobs.length) s += bench(ctx, IX0, benchTop, IW, jobs, d)
  // ---- the sidewalk, then under it (footing: the composer lays the commits line between) the interns' line
  const foot = footing(ctx, groundY, y0 + H, lines.map((g, i) => lineSpans(6, groundY + 11 + i * 9, 5, g, W - 10)).join(''))
  s += foot.walk
  return { svg: s + foot.under.svg, top: s, under: foot.under, h: H, roofChars, ...altOf(rooms, total) }
}

/**
 * The title rule over the rooms, `w` wide from x at y: SHARE OF TOOL CALLS, a dotted rule, the total big in the
 * accent (`total` as said: a live drawing's in steps) and the word total.
 */
function titleRule(x, y, w, total) {
  const label = 'SHARE OF TOOL CALLS'
  const big = fmtCount(total)
  const tw = textW('total', 5)
  const bx = x + w - 4 - tw - 2
  // the dotted rule one dashed stroke, whatever its length (a rect a dot would weigh 4k across a wide pane)
  const dx = Math.ceil(x + 4 + textW(label, 5.5) + 5)
  const len = Math.floor((bx - textW(big, 9) - 5 - dx) / 4) * 4 - 2
  const dots = len > 0 ? `<path stroke="${ROLE.dim}" stroke-dasharray="2 2" d="M${dx} ${y + 7.5}h${len}"/>` : ''
  return paint([[x, y, w, RULE, K.plate], [x, y, w, 1, '#fff/.1'], [x, y + RULE - 1, w, 1, '#000/.45']]) + dots +
    txt(x + 4, y + 9, label, 5.5, ROLE.title, ' font-weight="bold"') +
    txt(bx, y + 10, big, 9, ROLE.accent, ' font-weight="bold" text-anchor="end"') + txt(x + w - 4 - tw, y + 10, 'total', 5, ROLE.dim)
}

/**
 * The rows of rooms from `rowsTop` down (layout's), `IW` wide from IX0: walls and nameplates, furniture and Clawds, a
 * closed room's shade and sign, a plain wood floor, then on the slab under each room the bar of its share (layout's
 * `bar`) and its caption, and its tooltip. The top tier's share is framed big on its name line, the kind of work and
 * the calls on one line under it; the others' share is big under the room, the call count small, the kind of work in
 * plain words. `lamps` lights the ceilings (night in the work scene; always in the Office's basement). In the live
 * building's basement the bar is the floor's lit edge and the caption a tag on a lower slab, as its desks' are upstairs:
 * its share and calls over its kind of work, the top tier's too (no frame down there); quiet (ctx.quiet), a tag of one
 * line, the share and the calls.
 */
function paintRows(ctx, rows, rowsTop, IX0, IW, d, lamps) {
  // the live building's: tags, not the work scene's big captions
  const tagged = ctx.view === 'live'
  const tags = []
  const back = []
  const light = []
  const slab = []
  const shadeR = []
  let plates = ''
  let fore = ''
  let signs = ''
  let framed = ''
  let shares = ''
  let calls = ''
  let words = ''
  let tips = ''
  let top = rowsTop
  for (const row of rows) {
    const { rooms: rs, hall, tier } = row
    const cs = slabOf(ctx, row)
    const floor = top + HEAD + ROW
    // the slab, painted with the walls so a bar (its nameplate's color: the same path) lies on it; it stops at the inner
    // walls, as the live floor's does: the brick piers run unbroken from the parapet to the street
    back.push([IX0, floor, IW, cs, K.slab])
    // walls: the lit rooms come first in a row (busiest first), the closed ones after them
    const end = (list) => list.at(-1).x + list.at(-1).w
    for (const [list, lit] of [[rs.filter((r) => r.lit), true], [rs.filter((r) => !r.lit), false]]) {
      if (!list.length) continue
      const x0 = list[0].x
      back.push([x0, top, end(list) - x0, HEAD + ROW, lit ? K.wall : K.wallDark], [x0, floor - 14, end(list) - x0, 14, lit ? K.wallLow : K.wallDarkLow])
      if (lamps && lit) back.push(...ceilingLight(x0, top, end(list) - x0))
    }
    rs.forEach((r, i) => {
      const { x, w } = r
      if (i) back.push([x - 3, top, 3, HEAD + ROW, K.part], [x - 3, top, 1, HEAD + ROW, K.partHi], [x - 2, floor + 4, 1, cs - 6, '#000/.35'])
      const head = header(x, top, w, r.name.toUpperCase(), r.lit ? r.color : MUTED, back)
      plates += head.plate
      light.push(...head.light)
      const tone = r.lit ? r.color : ROLE.dim
      // the top tier's share, big, framed in its color at the end of its name line (the frame's dark inside is painted
      // with the floors, after every frame); down in the basement its tag says it, as every room's does
      if (tier === 1 && r.lit && !tagged) {
        const fw = Math.ceil(textW(r.share, 9) + 6)
        const fx = x + w - fw - 3
        back.push([fx, top + 1, fw, 12, r.color])
        slab.push([fx + 1, top + 2, fw - 2, 10, K.plate])
        framed += `<text x="${r1(fx + 3)}" y="${top + 10}" fill="${r.color}">${esc(r.share)}</text>`
      }
      fore += `<g transform="translate(${x} ${top + HEAD})">${r.plain ? plainRoom(ctx, r) : PAINT[r.k](ctx, r)}</g>`
      if (!r.lit) {
        shadeR.push([x, top + HEAD, w, ROW, '#0b1233/.5'])
        signs += use(ctx, 'wk-closed', x + Math.floor(w / 2) - 11, top + HEAD + 12)
      }
      // the floor, plain wood; the bar of the room's share: the floor's lit edge in the basement (its tag lies right
      // under it), in the work scene a bar on the slab with its shadow
      const g = r.bar ?? 0
      if (tagged) {
        if (g) back.push([x, floor, g, 2, r.color])
        slab.push([x + g, floor, w - g, 2, r.lit ? K.wood : K.woodD], [x, floor + 2, w, 1, K.woodD])
      } else {
        if (g) back.push([x + 4, floor + 5, g, 2, r.color], [x + 4, floor + 7, g, 1, '#000/.35'])
        slab.push([x, floor, w, 2, r.lit ? K.wood : K.woodD], [x, floor + 2, w, 1, K.woodD])
      }
      // the caption: the kind of work (the short words in a narrow room), the share, the call count
      const said = textW(r.words, 5) <= w - 6 ? r.words : fit(DEPARTMENT_WORK[r.k], w - 6, 5)
      const kind = [said, r.lit ? ROLE.title : ROLE.dim]
      if (tagged) {
        const figures = [[r.share, tone], [r.calls, ROLE.dim]]
        tags.push({ x: x + 2, y: floor + 3, w: w - 4, rows: ctx.quiet ? [figures] : [figures, [kind]] })
      } else if (tier === 1) {
        // the kind of work at the left, the calls at the right: in full, short, or left to the tooltip
        words += `<text x="${x + 4}" y="${floor + 15}">${esc(said)}</text>`
        const count = [r.calls, fmtCount(r.said)].find((c) => textW(said, 5) + 6 + textW(c, 5) <= w - 8)
        if (count) calls += `<text x="${r1(x + w - 4)}" y="${floor + 15}" text-anchor="end">${esc(count)}</text>`
      } else {
        const sw = textW(r.share, 9)
        shares += `<text x="${x + 4}" y="${floor + 17}" fill="${tone}">${esc(r.share)}</text>`
        if (sw + 3 + textW(r.calls, 5) <= w - 8) calls += `<text x="${r1(x + 7 + sw)}" y="${floor + 17}">${esc(r.calls)}</text>`
        words += `<text x="${x + 4}" y="${floor + 24}"${r.lit ? '' : ` fill="${ROLE.dim}"`}>${esc(said)}</text>`
      }
      if (!d.bare) tips += hitArea(x, top, w, HEAD + ROW + cs, tipOf(r))
    })
    if (hall) {
      fore += hallway(ctx, hall, top, back)
      slab.push([hall.x, floor, hall.w, 2, K.woodD], [hall.x, floor + 2, hall.w, 1, K.woodD])
    }
    top += HEAD + ROW + cs
  }
  const caption = tagged ? tagsSvg(tags)
    : `<g font-size="9" font-weight="bold">${shares}</g><g font-size="5" fill="${K.groupText}">${calls}</g><g font-size="5" fill="${ROLE.title}">${words}</g>`
  return paint(back) + paint(light) + `<g ${PLATE_FONT}>${plates}</g>` + fore + paint(shadeR) + signs + paint(slab) +
    (framed ? `<g font-size="9" font-weight="bold">${framed}</g>` : '') + caption + tips
}

// The alt text: the total and the busiest kinds of work with their departments (five in the alt, two in the gist).
function altOf(rooms, total) {
  const top = (k) => `what they did: ${fmtInt(total)} tool calls, ${rooms.filter((r) => r.v).slice(0, k).map((r) => `${r.words} ${r.share} (${r.name})`).join(', ')}`
  if (!total) return { alt: 'The Office, what they did: no tool calls yet, every department closed', gist: 'what they did: no tool calls yet' }
  return { alt: `The Office, ${top(5)}`, gist: top(2) }
}

// The tooltip of a room: what it stands for, its count (said) and share, the projects that made the calls.
function tipOf(r) {
  const head = `${r.name} = ${r.words}`
  if (!r.v) return `${head}: no calls (closed)`
  const who = (r.list ?? []).slice(0, 2).map((p) => `${clip(p.name, 24)} ${fmtInt(p.v)}`).join(', ')
  return `${head}: ${fmtInt(r.said)} tool calls, ${r.share} of all${who ? `, from ${who}` : ''}`
}

// The interns by job, when their bench is not drawn: the one line under the building. What a room, a share or a floor
// color stands for, the rooms and their tooltips say.
function groundLines(interns) {
  return interns.length ? [[['interns hired:', ROLE.dim, ''], ...interns.map((j) => [plural(j.n, j.title), JOB_BADGE[j.title] ?? ROLE.dim])]] : []
}

// ---------------------------------------------------------------- one floor of another building (the Office's B1)

// The size ladder of the floor (renderSvg's budget): every room furnished; the busiest half; none, and no tooltips.
const FLOOR_LADDER = [{ minis: 0, plain: 0, extras: true }, { minis: 0, plain: 5 }, { minis: 0, plain: 10, bare: true }]

/**
 * What they did as one floor of another building, painted from y0 down in [x0, x0 + width): `(ctx, y0, { x0, width,
 * level }) → { svg, h, gist }`; the live Office draws it as its basement, B1. The work scene's own rooms (layout,
 * paintRows), not a digest: every department with a busy Clawd per started unit %, the top tier over the grid of the
 * others, a closed one dark with its sign, the floor's lit edge its share of all the calls on one scale, its tag on the
 * slab under it (its share big, its call count and the kind of work in plain words). Over them a band with the
 * nameplate (WHAT THEY DID, what the shares are of, what a Clawd stands for); no lines under them: the rooms say it,
 * their tooltips say the rest. `level` (FLOOR_LADDER): 0 furnishes every room, 1 the busiest
 * half, 2 none and drops the tooltips; the height depends on the facts and the width alone, never on `level`. Quiet
 * (ctx.quiet, the live building's): what the shares are of left out, and each room's tag its share and calls alone.
 */
export function workFloor(ctx, y0, { x0 = 10, width = ctx.W - 20, level = 0 } = {}) {
  const { f } = ctx
  const IW = Math.max(60, Math.floor(width))
  const d = FLOOR_LADDER[clamp(Number(level) || 0, 0, 2)]
  const { unit, rooms, total, rows } = layout(ctx, x0, IW, d)
  // ---- the header band: the nameplate, what the shares are of (in the facts' range), what a Clawd stands for
  const when = rangeWord(f)
  const back = [[x0, y0, IW, HEAD, K.wall]]
  const plate = plateParts(x0 + 3, y0 + 2, 'WHAT THEY DID', ROLE.accent, IW - 10)
  back.push(...plate.rects)
  const cx = x0 + 3 + plate.w + 4
  const room = x0 + IW - cx - 4
  const calls = fmtCount(total)
  // a first light (facts.first_light) has counted nothing yet: it says so rather than that nothing was done
  const forms = total
    ? [[`share of ${calls} tool calls ${when}`, `1 ${figureWord(ctx)} = up to ${unit}% of the calls`], [`share of ${calls} tool calls`, `1 ${figureWord(ctx)} ≤ ${unit}%`], [`${calls} tool calls`]]
    : f.first_light === true ? [[`counting ${when}…`, 'the departments open in a moment'], ['counting…']]
      : [[`no tool calls ${when} yet`, 'every department is closed'], ['no tool calls yet']]
  const form = forms.find((g) => textW(g[0], 5) <= room) ?? forms.at(-1)
  const words = ctx.quiet ? '' : spans(cx + 1, y0 + 9, 5, fitGroups(form.map((t, i) => [t, i ? ROLE.dim : K.groupText]), room, 5))
  // ---- the rooms, lamps always on down here
  const rowsTop = y0 + HEAD
  const h = rowsTop + rows.reduce((a, row) => a + rowH(ctx, row), 0) - y0
  const svg = paint(back) + paint(plate.light) + `<g ${PLATE_FONT}>${plate.text}</g>` + words + paintRows(ctx, rows, rowsTop, x0, IW, d, true)
  const top2 = rooms.filter((r) => r.v).slice(0, 2)
  const gist = total ? `what they did: ${top2.map((r) => `${r.words} ${r.share}`).join(', ')}` : f.first_light === true ? 'what they did: counting' : 'what they did: no tool calls yet'
  return { svg, h, gist }
}
