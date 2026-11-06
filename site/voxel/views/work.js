/**
 * What they did: the pixel office's departments (lib/svg-work.mjs) in voxels. Every tool call of the page sorted by the
 * kind of work it was into the departments of a cut-away building: server room = terminal commands, QA lab = running
 * tests, library = reading code, typing pool = writing code, internet café = browsing the web, gadget shop = other
 * tools, whiteboard = planning, phone booth = talking to you, management = delegating to helpers, art studio = design
 * tools. One room per department, busiest first: on the top floor as many of the three busiest as fit side by side,
 * each as wide as its share of theirs; the others under them in a grid of equal rooms (one with many agents spans more
 * cells), what a row has left a hallway with the lift. One busy agent per started 5% or 10% of the calls (the sign says
 * which), the cast mixed by the crew's agent-time. Under each room its share big, its calls and the kind of work in
 * plain words, over a bar of its share drawn to one scale for the whole building. Under the rooms the interns' bench,
 * over them the title band: SHARE OF TOOL CALLS and the total. A department without a call is closed: dark behind a
 * shade, its stations empty, a sign on its door.
 */
import { K, ROLE, castPicker, figureWord } from '../../../plugin/lib/svg-kit.mjs'
import { DEPARTMENTS, DEPARTMENT_WORDS, DEPARTMENT_WORK, departmentRows, pct, plural, seeded } from '../../../plugin/lib/model.mjs'
import { clip, fmtCount, fmtInt } from '../../../plugin/lib/format.mjs'
import { FRONT, INNER, LOBBY_TOP } from '../building.js'

// ---------------------------------------------------------------- the plan (pure)

/** Activity kind → its room's nameplate color (svg-work WORK_ROOMS). */
export const WORK_COLORS = {
  terminal: '#9ab86a', testing: '#7fd6e8', reading: '#d4a94f', coding: '#6f91dc', web: '#55c5b1',
  tools: '#b0b8c4', planning: '#eec96f', talking: '#e07a61', delegating: '#c678dd', design: '#e08fc0',
}
/** The width of one agent's work station in world units (svg-work WORK_ROOMS pitch, at this building's scale). */
export const WORK_PITCH = {
  terminal: 1.2, testing: 1.2, reading: 1.2, coding: 1.2, web: 1.25, tools: 1.2, planning: 1.15, talking: 1.7, delegating: 1.5, design: 1.6,
}
/** How much of the calls one busy agent stands for, in %: the finest whose busiest room fits the building. */
export const CLAWD_UNITS = [5, 10, 20, 25, 50, 100]
/** The caption's sizes (world units): the share in the Office Pixel face, its calls and the kind of work; the nameplate. */
export const CAPTION = { share: .5, calls: .19, words: .18, plate: .3 }
/** A row of rooms: its caption band, then the room; the title band over the top row; the interns' floor. */
export const WORK_BAND = .95
export const WORK_ROOM = 3.0
export const WORK_TITLE = .72
export const INTERN_BAND = .62
export const INTERN_ROOM = 1.85
const GAP = .12 // a partition between two rooms
const CELL = 3.0 // the narrowest room of the grid
const HALL = 1.0 // the narrowest spare width drawn as a hallway (the grid's rows fill exactly; only its last leaves one)
const EDGE = .3 // what a room keeps round its stations and its caption

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const sum = list => list.reduce((a, b) => a + b, 0)
/** A width estimate of `text` at `size` (DM Mono .6 em, Office Pixel .4 em): the plan's default, labels.measure in the scene. */
export const roughMeasure = (text, size, { pixel = false } = {}) => [...String(text)].length * size * (pixel ? .4 : .6)

/** The page's tool calls by kind of work (`snapshot.work` rows), as the collector's activity object. */
export function workActivity(snapshot) {
  const act = {}
  for (const row of Array.isArray(snapshot?.work) ? snapshot.work : []) {
    if (row && typeof row.kind === 'string') act[row.kind] = (act[row.kind] ?? 0) + Math.max(0, Number(row.calls) || 0)
  }
  return act
}

/**
 * Every department, busiest first (the closed ones last, in the house order), with its share of all tool calls and how
 * many busy agents it seats: one per started `unit` % of the share it prints, any call at all → 1 (svg-work workRooms,
 * so the 2D and the voxel office always seat the same).
 */
export function workDepartments(snapshot, unit = 10) {
  const { rows, total: all } = departmentRows(workActivity(snapshot))
  const total = Math.max(0, all)
  const byK = new Map(rows.map(r => [r.k, r.v]))
  const rooms = DEPARTMENTS.map(([k, name]) => {
    const v = byK.get(k) ?? 0
    const p = total ? Math.round((v / total) * 100) : 0
    return { k, name, v, p, n: v > 0 ? Math.max(1, Math.ceil(p / unit)) : 0, share: v ? pct(v, total) : '0%', words: DEPARTMENT_WORDS[k], work: DEPARTMENT_WORK[k], color: WORK_COLORS[k], pitch: WORK_PITCH[k] }
  })
  rooms.sort((a, b) => b.v - a.v || (a.v ? a.name.localeCompare(b.name) : 0))
  // each room's first seat in the building: its agents are seats base … base + n - 1 of the cast
  let base = 0
  for (const r of rooms) { r.base = base; base += r.n }
  return { rooms, total }
}

/** The agent unit of a building `width` wide: the finest of CLAWD_UNITS at which every room's stations fit across it. */
export function workUnit(snapshot, width = 2 * INNER) {
  return CLAWD_UNITS.find(u => workDepartments(snapshot, u).rooms.every(r => r.n * r.pitch + EDGE <= width)) ?? CLAWD_UNITS.at(-1)
}

/** Which projects made a department's calls, busiest first, and one project color per seat (largest remainder). */
function projectsOf(snapshot, k, n) {
  const list = (Array.isArray(snapshot?.projects) ? snapshot.projects : [])
    .map(p => ({ name: String(p?.name ?? '?'), color: p?.color ?? ROLE.dim, v: Math.max(0, Number((Array.isArray(p?.work) ? p.work : []).find(w => w?.kind === k)?.calls) || 0) }))
    .filter(p => p.v > 0).sort((a, b) => b.v - a.v)
  const all = sum(list.map(p => p.v)) || 1
  const seats = list.slice(0, 6).map(p => ({ p, q: (p.v / all) * n, k: Math.floor((p.v / all) * n) }))
  for (let left = n - sum(seats.map(x => x.k)); left > 0 && seats.length; left--) seats.reduce((m, x) => (x.q - x.k > m.q - m.k ? x : m)).k++
  return { list, tags: seats.flatMap(x => new Array(x.k).fill(x.p.color)) }
}

/**
 * A row of the top tier: `top`, the busiest rooms, side by side across the whole width, each as wide as its share of
 * theirs and never under what its stations, nameplate and caption need (what a narrow one needs comes off the widest);
 * a narrow one is widened to a cell of the grid below where the widest can spare it. null when they do not fit.
 */
function fillRow(top, W, X0, cell) {
  const need = top.map(r => Math.min(W, r.minW))
  const room = W - GAP * (top.length - 1)
  if (sum(need) > room + 1e-9) return null
  const all = sum(top.map(r => r.v)) || 1
  const w = top.map((r, i) => Math.max(need[i], (room * r.v) / all))
  for (let over = sum(w) - room; over > 1e-9;) {
    const i = w.reduce((m, x, j) => (x - need[j] > w[m] - need[m] ? j : m), 0)
    const take = Math.min(over, w[i] - need[i])
    if (take <= 1e-9) break
    w[i] -= take
    over -= take
  }
  w[0] += room - sum(w)
  for (let i = 1; i < top.length; i++) {
    // busier first, and never wider than the room before it
    const spare = Math.min(cell - w[i], w[0] - Math.max(need[0], cell), w[i - 1] - w[i])
    if (spare > 0) { w[i] += spare; w[0] -= spare }
  }
  let x = X0
  top.forEach((r, i) => { r.x0 = x; r.x1 = x + w[i]; x += w[i] + GAP })
  return { rooms: top, hall: null, tier: 1 }
}

/**
 * The other rooms in a grid of equal cells, never under CELL (a room that needs more, its agents many, spans as many
 * cells as it needs), as many to a row as fit and the rows as even as they can be (7 rooms 4 + 3, not 6 + 1).
 */
function gridCells(rest, W) {
  if (!rest.length) return { per: 1, cw: 0, span: () => 1 }
  const mins = rest.map(r => r.minW).sort((a, b) => a - b)
  const median = mins[Math.floor(mins.length / 2)]
  const c0 = Math.max(CELL, ...mins.filter(m => m <= median * 1.5))
  const cells = n => (W - GAP * (n - 1)) / n
  let per = clamp(Math.floor((W + GAP) / (c0 + GAP)), 1, rest.length)
  const across = (r, cw) => clamp(Math.ceil((r.minW + GAP) / (cw + GAP) - 1e-9), 1, per)
  if (rest.every(r => across(r, cells(per)) === 1)) per = Math.ceil(rest.length / Math.ceil(rest.length / per))
  const cw = cells(per)
  return { per, cw, span: r => across(r, cw) }
}
function gridOf(rest, W, X0) {
  if (!rest.length) return []
  const { per, cw, span } = gridCells(rest, W)
  const left = [...rest], rows = []
  while (left.length) {
    const row = []
    for (let i = 0, used = 0; i < left.length && used < per;) {
      const k = span(left[i])
      if (used + k > per) { i++; continue }
      row.push([left.splice(i, 1)[0], k])
      used += k
    }
    let x = X0
    for (const [r, k] of row) { const w = k * cw + (k - 1) * GAP; r.x0 = x; r.x1 = x + w; x += w + GAP }
    const spare = X0 + W - x
    rows.push({ rooms: row.map(([r]) => r), hall: spare >= HALL ? { x0: x, x1: X0 + W } : null, tier: 2 })
  }
  return rows
}

/**
 * Where every department goes in a building `width` wide from `x0`: `{ unit, total, rooms, rows }`, rows top-down (the
 * top tier, then the grid), each room with its x0…x1, its seats (`n`, from cast seat `base`), its project colors
 * (`tags`), its calls in words and `bar`, the length of its share on one scale for the whole building (the widest that
 * leaves every room its margins). `measure(text, size, { pixel })` sizes the captions and nameplates.
 */
export function planWork(snapshot, { width = 2 * INNER, x0 = -INNER, measure = roughMeasure } = {}) {
  const unit = workUnit(snapshot, width)
  const { rooms, total } = workDepartments(snapshot, unit)
  for (const r of rooms) {
    r.lit = r.v > 0
    r.calls = r.v ? `${fmtInt(r.v)} ${r.v === 1 ? 'call' : 'calls'}` : 'no calls'
    const caption = Math.max(measure(r.work, CAPTION.words), measure(r.share, CAPTION.share, { pixel: true }) + .14 + measure(r.calls, CAPTION.calls)) + 2 * EDGE
    const plate = measure(plateName(r.name), CAPTION.plate, { pixel: true }) + .65
    r.minW = Math.min(width, Math.max(caption, plate, r.n ? r.n * r.pitch + EDGE : 0))
    Object.assign(r, projectsOf(snapshot, r.k, r.n))
  }
  const lit = rooms.filter(r => r.lit)
  let tier = []
  for (let k = Math.min(3, lit.length); k >= 1 && !tier.length; k--) {
    const row = fillRow(lit.slice(0, k), width, x0, gridCells(rooms.slice(k), width).cw)
    if (row) tier = [row]
  }
  const rows = [...tier, ...gridOf(rooms.slice(tier.reduce((a, row) => a + row.rooms.length, 0)), width, x0)]
  const scale = Math.min(width, ...lit.map(r => ((r.x1 - r.x0 - 2 * EDGE) * total) / r.v))
  for (const r of rooms) r.bar = r.v > 0 ? clamp((scale * r.v) / total, .08, r.x1 - r.x0 - 2 * EDGE) : 0
  // a closed department keeps one empty station where it has the room (the whiteboard has none: its agents stand)
  for (const r of rooms) r.empty = r.n === 0 && r.k !== 'planning' && r.pitch + EDGE <= r.x1 - r.x0 ? 1 : 0
  return { unit, total, rooms, rows }
}

/** Who sits in seat i: the cast mixed by the crew's agent-time (svg-kit castPicker), all Clawd without a split. */
export function crewPicker(crew) {
  const rows = Array.isArray(crew) ? crew : []
  const by = field => rows.reduce((o, c) => (c?.agent && Number(c[field]) > 0 ? { ...o, [c.agent]: (o[c.agent] ?? 0) + Number(c[field]) } : o), {})
  const minutes = by('minutes')
  return castPicker({ totals: { agents: Object.keys(minutes).length ? minutes : by('sessions') } })
}

/** The page in a word: 'this week', or 'that week' on a page of the past. */
export function pageWord(snapshot) {
  const kind = snapshot?.period?.kind
  const unit = kind === 'month' ? 'month' : kind === 'today' || kind === 'day' ? 'day' : 'week'
  const past = Boolean(snapshot?.period?.past) || Number(snapshot?.period?.back) > 0
  return past ? `that ${unit}` : unit === 'day' ? 'today' : `this ${unit}`
}

/** The sign's two lines (svg-work's key): the page, then what the bars and one agent stand for. */
export function workSign(snapshot, plan, who = 'Clawd') {
  const label = String(snapshot?.period?.label ?? snapshot?.range ?? '').trim()
  const first = [[label || 'what they did', ROLE.title]]
  if (!plan?.total) {
    const word = pageWord(snapshot)
    return [first, [[word.startsWith('that') ? `no tool calls ${word}` : 'no tool calls in this range yet', ROLE.dim], ['every department is closed', ROLE.dim]]]
  }
  return [first, [['bars to one scale', ROLE.dim], [`1 ${who} = up to ${plan.unit}% of the calls`, ROLE.accent]]]
}

/** The interns (subagents) the agents hired, by job title, most first: `[{ title, n }]`. */
export function internJobs(snapshot) {
  return (Array.isArray(snapshot?.interns) ? snapshot.interns : [])
    .map(j => ({ title: String(j?.job ?? 'specialist'), n: Math.max(0, Math.round(Number(j?.n) || 0)) }))
    .filter(j => j.n > 0).sort((a, b) => b.n - a.n || a.title.localeCompare(b.title))
}

/** A room's tooltip: what it stands for, its share and calls, the projects that made them (svg-work tipOf). */
export function roomTip(r) {
  if (!r.v) return `${r.name} · ${r.words} · no calls (closed)`
  const who = (r.list ?? []).slice(0, 2).map(p => `${clip(p.name, 24)} ${fmtInt(p.v)}`).join(', ')
  return `${r.name} · ${r.words} · ${r.share} · ${r.calls}${who ? ` · from ${who}` : ''}`
}

// ---------------------------------------------------------------- the building

const WALL = '#17251a', WAINSCOT = '#121f14', RAIL = '#2a422f', SKIRT = '#243928' // live.js's walls (kit DAY_PALETTE)
const BAND = '#1f1a16'
const DESK = ['#c9a26b', '#8f6d43', '#6e5233'] // furniture top, edge, body (svg-work DESK)
const PAPER = '#f4efe4'
const MUTED = '#6b6458' // the nameplate of a closed department
const JOB_BADGE = { consultant: ROLE.meeting, researcher: ROLE.idle, generalist: ROLE.intern, architect: ROLE.accent, reviewer: ROLE.ship }
const P = .064 // a seated agent's pixel
const TICK = ['....#', '...#.', '#.#..', '.#...']
const CROSS = ['#..#', '.##.', '.##.', '#..#']
const UP = ['..#..', '.###.', '#####']
// the internet café's planet: its continents by latitude row and longitude column (svg-work LAND)
const LAND = [
  '.....##.........#.....', '...#####......####....', '..######.....######...', '..#####.......####....', '...###.........##.....',
  '....##..........#.....', '....###.....##........', '.....##....####.......', '......#.....###.......', '............##........',
  '.............#........',
]
const exact = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
// the plates' pixel face has no accented capitals: CAFÉ is written CAFE there (the captions keep the accent)
const plateName = name => name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const darker = (hex, t = .55) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * t)); return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}` }
/** x of `k` stations `pitch` apart, centred in [x0, x1]. */
const spots = (x0, x1, k, pitch) => Array.from({ length: k }, (_, i) => (x0 + x1) / 2 + (i - (k - 1) / 2) * pitch)

// the view's own lit materials (LEDs that blink, glass), made once per kit: only this view animates them
const shared = new WeakMap()
function workMaterials(THREE, kit) {
  let m = shared.get(kit)
  if (m) return m
  const lit = color => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 1 })
  m = {
    ledA: lit(ROLE.busy), ledB: lit(ROLE.accent), cross: lit(ROLE.ask), arrow: lit(ROLE.accent), gadget: lit(ROLE.ask), dot: lit('#7a6f5c'),
    glass: new THREE.MeshStandardMaterial({ color: '#cfe8ff', roughness: .15, transparent: true, opacity: .16, depthWrite: false }),
    shade: new THREE.MeshBasicMaterial({ color: '#0b1233', transparent: true, opacity: .55, depthWrite: false }),
    paint: ['#e07a61', '#eec96f', '#6f91dc'].map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .12, roughness: 1 })),
  }
  for (const x of Object.values(m).flat()) kit.disposables.add(x)
  shared.set(kit, m)
  return m
}

// the view's two lights (its budget): no falloff but a soft edge at `distance`, so every floor is lit alike, at night
// as warm as the live floors' lamps; in front of the desks, behind the caption bands (which stay dark)
const LIGHT = { intensity: 3, distance: 13, decay: 0, z: 2.6 }

/**
 * The departments as storeys of a building from `base` up, x0…x1 wide (the work view's; the live building may borrow it
 * for a basement): `{ storeys, group, pickables, update, plan, who, top }`. `title` puts the title band over the top
 * row, `bench` the interns' floor under the rooms, `quiet` leaves the kinds of work and the scoreboard out, `lights`
 * adds the two lights.
 */
export function buildDepartments(ctx, snapshot, { x0 = -INNER, x1 = INNER, base: ground = LOBBY_TOP, quiet = false, title = true, bench = true, number = 2, lights = true } = {}) {
  const { THREE, kit, labels, actors } = ctx
  const { box, plant, sprite } = kit
  const width = x1 - x0, cx = (x0 + x1) / 2
  const plan = planWork(snapshot, { width, x0, measure: (text, size, opts) => labels.measure(text, size, opts) })
  const pick = crewPicker(snapshot?.crew)
  const who = figureWord({ pick })
  const M = workMaterials(THREE, kit)
  const group = new THREE.Group()
  const storeys = [], pickables = [], figures = [], minis = [], screens = [], movers = []
  // a label's natural width, with a little slack: a label left to size itself can lose its last letters to rounding
  const lineW = line => line.spans.reduce((w, [text, , o = {}], i) => {
    const size = line.size * (o.scale ?? 1), face = { pixel: o.pixel || line.pixel, bold: o.bold }
    return w + labels.measure(String(text), size, face) + (i && !o.join ? labels.measure(o.sep ?? '  ', size, face) : 0)
  }, 0)
  const tag = (spec, x, y, z, parent) => {
    const l = labels.label(spec.width == null ? { ...spec, width: Math.max(...spec.lines.map(lineW)) + 2 * (spec.pad ?? .06) + .05 } : spec)
    l.position.set(x, y, z); parent.add(l)
    return l
  }
  const collider = (parent, x, y, z, w, h, d, text) => {
    const c = new THREE.Mesh(ctx.colliderGeometry, ctx.colliderMaterial)
    c.position.set(x, y, z); c.scale.set(w, h, d); c.userData.text = text
    parent.add(c); pickables.push(c)
    return c
  }
  const seat = (L, r, i, x, y, z, pose, legs = false) => {
    const actor = actors.figure(pick(r.base + i), { p: P, legs, depth: .3 })
    actor.root.position.set(x, y, z)
    L.add(actor.root)
    figures.push({ actor, pose })
    return actor
  }
  const screen = (L, name, x, y, z, w, h, phase) => { screens.push({ mesh: actors.screen(L, name, x, y, z, w, h), phase }) }
  const jobs = bench ? internJobs(snapshot) : []
  const word = pageWord(snapshot)
  const totals = snapshot?.totals ?? {}

  // the slab and its caption band to the street, the parquet, the back wall: as the live floors have them
  function shell(L, base, fy, inner, band) {
    const w = width
    box(L, cx, (base + fy) / 2, 0, w + .7, fy - base, 6.4, K.slab)
    box(L, cx, base + band / 2 - .02, FRONT + .06, w + .9, band - .04, .32, BAND)
    box(L, cx, fy - .015, FRONT + .2, w + .9, .05, .06, K.wood)
    box(L, cx, base + .02, FRONT + .2, w + .9, .05, .06, K.woodD)
    box(L, cx, fy, 0, w + .1, .04, 6.1, K.woodD, { castShadow: false })
    const cols = Math.max(1, Math.round(w / .94)), tw = w / cols
    for (let row = 0; row < 12; row++) for (let col = 0; col < cols; col++) box(L, x0 + (col + .5) * tw, fy + .05, -2.75 + row * .5, tw, .04, .5, ['#4b3534', '#6e4d3f', '#593e35'][(row * 3 + col) % 3], { castShadow: false })
    box(L, cx, (fy + inner) / 2, -3.12, w + .5, inner - fy, .2, WALL)
    box(L, cx, fy + .47, -2.99, w + .3, .94, .07, WAINSCOT)
    box(L, cx, fy + .98, -2.94, w + .4, .09, .11, RAIL)
    box(L, cx, fy + .08, -2.91, w + .4, .13, .15, SKIRT)
    for (let x = x0 + .2; x < x1; x += .56) box(L, x, fy + .48, -2.93, .025, .78, .04, SKIRT)
    if (x0 <= -INNER + .01) box(L, x0 - .05, (fy + inner) / 2, 0, .05, inner - fy, 6.3, WALL)
    if (x1 >= INNER - .01) box(L, x1 + .05, (fy + inner) / 2, 0, .05, inner - fy, 6.3, WALL)
  }

  // ---------------------------------------------------------------- a department
  function department(L, r, base, fy, ceil, inner) {
    const w = r.x1 - r.x0, rx = (r.x0 + r.x1) / 2
    // the partition at its left (not the building's), as the live rooms'
    if (r.x0 > x0 + .01) partition(L, r.x0 - GAP / 2, fy, inner)
    // its nameplate hangs at the front, as the live rooms' do
    const name = plateName(r.name)
    const plateW = Math.min(w - .45, labels.measure(name, CAPTION.plate, { pixel: true }) + .3)
    const sx = Math.max(r.x0 + .22, x0 + .36), sy = ceil - .4, sz = 2.55
    for (const dx of [.22, plateW - .22]) box(L, sx + dx, (sy + .23 + inner) / 2, sz, .025, inner - sy - .23, .025, '#3a342b', { castShadow: false })
    box(L, sx + plateW / 2, sy, sz - .04, plateW + .08, .46, .05, '#120e0b')
    tag({ lines: [{ spans: [[name, '#16110d', { pixel: true }]], size: CAPTION.plate }], width: plateW, height: .38, valign: 'middle', pad: .08, bg: r.lit ? r.color : MUTED, radius: .025, anchor: 'left' }, sx, sy, sz + .005, L)
    if (r.lit) {
      // a rug woven in its color, a cream tassel at either end; the lamps over it, clear of the nameplate
      const rug = darker(r.color, .42)
      box(L, rx, fy + .085, -.3, w - .5, .03, 4.5, rug, { castShadow: false })
      for (let i = 0; i < 9; i++) box(L, rx, fy + .102, -2.3 + i * .5, w - .62, .008, .05, darker(r.color, .6), { castShadow: false })
      for (const z of [-2.6, 2.0]) for (let x = r.x0 + .4; x < r.x1 - .3; x += .22) box(L, x, fy + .09, z, .07, .02, .12, '#e9dfc5', { castShadow: false })
      const l0 = sx + plateW + .35 < r.x1 - .45 ? sx + plateW + .35 : r.x0 + .3, span = r.x1 - .3 - l0
      const lamps = Math.max(1, Math.round(span / 3.2))
      for (let i = 0; i < lamps; i++) lamp(L, l0 + ((i + .5) * span) / lamps, ceil, inner)
    }
    // the furniture, its agents at work
    const at = spots(r.x0, r.x1, r.n + r.empty, r.pitch)
    FURNISH[r.k](L, r, fy, ceil, inner, at)
    if (!r.lit) {
      // closed: the room in the dark behind a shade (its nameplate in front), the sign on its door
      box(L, rx, (fy + inner) / 2, 2.35, w, inner - fy, .02, M.shade, { castShadow: false, receiveShadow: false })
      const cy = fy + 1.2
      box(L, rx, (cy + .2 + inner) / 2, 2.44, .02, inner - cy - .2, .02, '#8a8478', { castShadow: false })
      tag({ lines: [{ spans: [['closed', ROLE.night, { pixel: true }]], size: .3, align: 'center' }], width: 1.0, pad: .06, bg: '#2b2520', radius: .02 }, rx, cy, 2.47, L)
    }
    caption(L, r, fy)
    // its tooltip; the typing pool's says the scoreboard's lines in full
    const add = Math.max(0, Number(totals.additions) || 0), del = Math.max(0, Number(totals.deletions) || 0)
    const lines = r.k === 'coding' && r.lit && (add || del) ? ` · +${exact(add)} / −${exact(del)} lines in commits ${word}` : ''
    collider(L, rx, (base + inner) / 2, 0, w, inner - base, 6.2, roomTip(r) + lines)
  }

  // Under the room, on the band: the bar of its share (one scale for the building), then its share big with its calls,
  // the kind of work in plain words under them (the short words in a narrow room; quiet: share and calls alone)
  function caption(L, r, fy) {
    const left = Math.max(r.x0 + .16, x0 + .36), room = r.x1 - .12 - left
    if (r.bar) {
      box(L, left + r.bar / 2, fy - .1, FRONT + .235, r.bar, .07, .03, r.color, { glow: .7, castShadow: false })
      box(L, left + r.bar / 2, fy - .145, FRONT + .23, r.bar, .02, .02, '#0b0907', { castShadow: false })
    }
    const tone = r.lit ? r.color : ROLE.dim
    const shareW = labels.measure(r.share, CAPTION.share, { pixel: true })
    const calls = [r.calls, r.v ? fmtCount(r.v) : ''].find(c => c && shareW + labels.measure(`  ${c}`, CAPTION.calls) <= room - .04)
    const words = [r.words, r.work].find(t => labels.measure(t, CAPTION.words) <= room - .04) ?? r.work
    const lines = [{ spans: [[r.share, tone, { pixel: true }], ...(calls ? [[calls, r.lit ? K.groupText : ROLE.dim, { scale: CAPTION.calls / CAPTION.share, sep: '  ' }]] : [])], size: CAPTION.share, gap: .02 }]
    if (!quiet) lines.push({ spans: [[words, r.lit ? ROLE.title : ROLE.dim]], size: CAPTION.words })
    tag({ lines, width: room, pad: .02, anchor: 'top-left' }, left, fy - (quiet ? .3 : .165), FRONT + .26, L)
  }

  function partition(L, x, fy, inner) {
    box(L, x, (fy + inner) / 2, -1.95, GAP, inner - fy, 2.35, K.part)
    box(L, x, (fy + inner) / 2, -.72, .18, inner - fy, .19, K.partHi)
  }
  function lamp(L, x, ceil, inner) {
    const y = Math.min(inner - .5, ceil - .25)
    box(L, x, (y + inner) / 2, -.6, .045, inner - y, .045, kit.darkSteel, { castShadow: false })
    box(L, x, y - .08, -.6, .62, .15, .4, '#807153')
    box(L, x, y - .17, -.6, .5, .035, .32, ctx.building.bulbMaterial, { castShadow: false })
  }

  // ---------------------------------------------------------------- what each department is furnished with
  const FURNISH = {
    // server room: a row of racks, their LEDs in two rhythms, one rack open with its cables hanging; a console per
    // agent, its terminal hung over it
    terminal(L, r, fy, ceil, inner, at) {
      const w = r.x1 - r.x0, rx = (r.x0 + r.x1) / 2
      box(L, rx, fy + .082, -.3, w - .3, .03, 5.0, r.lit ? '#3a3f48' : '#20232a', { castShadow: false })
      for (let x = r.x0 + .4; x < r.x1 - .2; x += .5) box(L, x, fy + .1, -.3, .02, .006, 5.0, '#2b2f36', { castShadow: false })
      for (let z = -2.6; z < 2.2; z += .5) box(L, rx, fy + .1, z, w - .3, .006, .02, '#2b2f36', { castShadow: false })
      const k = Math.max(1, Math.floor((w - .3) / .62)), r0 = rx - ((k - 1) * .62) / 2
      for (let i = 0; i < k; i++) {
        const x = r0 + i * .62, open = r.lit && k >= 3 && i === k - 1
        box(L, x, fy + 1.075, -2.15, .55, 2.15, .9, '#1b1e24')
        box(L, x, fy + 2.17, -2.15, .58, .05, .92, '#2b2f36')
        if (open) {
          // its door swung out, its servers' patch cables in loops
          const a = 2.05
          box(L, x + .275 - .275 * Math.cos(a), fy + 1.07, -1.7 + .275 * Math.sin(a), .55, 2.05, .04, '#454c57', { yaw: a })
          box(L, x, fy + 1.07, -1.71, .47, 2.0, .02, '#0d0f13')
          for (let u = 0; u < 6; u++) box(L, x, fy + .28 + u * .33, -1.75, .45, .16, .06, '#353a44')
          box(L, x - .13, fy + 1.45, -1.66, .03, .55, .03, '#e07a61'); box(L, x - .06, fy + 1.19, -1.66, .17, .03, .03, '#e07a61')
          box(L, x + .02, fy + .98, -1.66, .03, .6, .03, '#6f91dc'); box(L, x + .09, fy + .69, -1.66, .17, .03, .03, '#6f91dc')
          box(L, x + .15, fy + 1.32, -1.66, .03, .42, .03, ROLE.busy); box(L, x + .15, fy + 1.92, -1.66, .03, .03, .03, M.ledA, { castShadow: false })
          continue
        }
        for (let u = 0; u < 6; u++) {
          const yy = fy + .28 + u * .33
          box(L, x, yy, -1.69, .47, .27, .02, '#353a44')
          box(L, x - .07, yy, -1.677, .25, .045, .01, '#262a31')
          if (r.lit) box(L, x + .17, yy + .06, -1.676, .036, .036, .012, [M.ledA, M.ledB, kit.mat(ROLE.busy, .9)][(i + u) % 3], { castShadow: false })
        }
      }
      if (r.lit) box(L, rx, fy + 2.08, -1.66, k * .62 - .15, .03, .03, '#3f7fb8', { castShadow: false })
      at.forEach((x, i) => {
        box(L, x, fy + .58, .4, 1.0, .05, .6, '#6a707a')
        box(L, x, fy + .29, .45, .96, .54, .5, '#2b2f36')
        for (const yy of [.3, .38]) box(L, x - .2, fy + yy, .705, .45, .03, .01, '#1b1e24')
        box(L, x + .35, fy + .36, .705, .05, .03, .012, r.lit ? M.ledA : '#20232a', { castShadow: false })
        box(L, x, fy + .615, .52, .5, .025, .14, '#d6d0c4')
        // the terminal hung from the ceiling over its operator
        const sy = fy + 1.5
        box(L, x, (sy + .24 + inner) / 2, -.34, .03, inner - sy - .24, .03, kit.darkSteel, { castShadow: false })
        box(L, x, sy, -.38, .74, .5, .07, '#2b2f36')
        if (i < r.n) screen(L, 'terminal', x, sy, -.343, .66, .42, i * .7)
        else box(L, x, sy, -.343, .66, .42, .004, '#0b0d10')
        if (i < r.n) seat(L, r, i, x, fy + .6, .02, i % 3 === 2 ? 'read' : 'type')
      })
    },

    // QA lab: boards of green ticks along the wall (a red cross keeps coming back), a lab bench per agent with its test
    // tubes and a bubbling flask
    testing(L, r, fy, ceil, inner, at) {
      const w = r.x1 - r.x0, rx = (r.x0 + r.x1) / 2
      const k = Math.max(1, Math.floor((w - .3) / 1.35)), b0 = rx - ((k - 1) * 1.35) / 2
      const tick = kit.mat(ROLE.busy, r.lit ? .6 : 0)
      for (let i = 0; i < k; i++) {
        const x = b0 + i * 1.35, yy = fy + 1.55
        box(L, x, yy, -2.93, 1.14, .62, .06, '#5d6168')
        box(L, x, yy, -2.895, 1.04, .52, .02, '#13201a')
        if (!r.lit) continue
        for (let j = 0; j < 3; j++) sprite(L, TICK, { '#': tick }, x - .38 + j * .24, yy + .02, -2.883, .036, .012)
        sprite(L, CROSS, { '#': M.cross }, x + .36, yy + .03, -2.883, .036, .012)
        box(L, x, yy - .17, -2.884, .9, .07, .01, '#2c3a33', { castShadow: false })
        box(L, x - .45 + .32, yy - .17, -2.881, .64, .07, .012, ROLE.busy, { glow: .5, castShadow: false })
      }
      at.forEach((x, i) => {
        box(L, x, fy + .6, .4, 1.04, .05, .58, '#e6e1d6')
        box(L, x, fy + .565, .4, 1.04, .02, .58, '#9c9689')
        for (const dx of [-.46, .46]) box(L, x + dx, fy + .28, .4, .05, .56, .5, '#7a7468')
        box(L, x, fy + .16, .4, .9, .03, .44, '#7a7468')
        // the test tubes in their rack, a flask bubbling over a little stand
        box(L, x - .34, fy + .655, .55, .26, .05, .1, '#8a6a40')
        for (const [dx, c] of [[-.43, ROLE.busy], [-.34, '#e08fc0'], [-.25, '#eec96f']]) {
          box(L, x + dx, fy + .78, .55, .055, .17, .055, M.glass, { castShadow: false })
          box(L, x + dx, fy + .725, .55, .05, .07, .05, c, { glow: r.lit ? .3 : 0 })
        }
        box(L, x + .34, fy + .7, .55, .22, .14, .2, '#c678dd', { glow: r.lit ? .3 : 0 })
        box(L, x + .34, fy + .815, .55, .08, .1, .08, M.glass, { castShadow: false })
        if (i < r.n) {
          const bubbles = new THREE.Group(); bubbles.position.set(x + .34, fy + .78, .6); L.add(bubbles)
          box(bubbles, -.02, 0, 0, .03, .03, .03, '#f4efe4', { glow: .6, castShadow: false }); box(bubbles, .025, .07, 0, .025, .025, .025, '#f4efe4', { glow: .6, castShadow: false })
          movers.push({ kind: 'rise', obj: bubbles, y: fy + .78, phase: i * .37 })
          seat(L, r, i, x, fy + .6, -.04, 'read')
        }
      })
    },

    // library: bookcases along the wall with a rolling ladder, one long reading table under green banker's lamps where
    // every reader peers over an open book
    reading(L, r, fy, ceil, inner, at) {
      const w = r.x1 - r.x0, rx = (r.x0 + r.x1) / 2
      const rnd = seeded(`wk-shelf-${Math.round(r.x0 * 10)}`)
      const cols = ['#7a3b2e', '#3e5a7a', '#4f6b3a', '#a07a48', '#5e4466', '#2f5560', '#8a5a3a']
      const k = Math.max(1, Math.floor((w - .2) / .98)), b0 = rx - ((k - 1) * .98) / 2
      for (let i = 0; i < k; i++) {
        const x = b0 + i * .98
        box(L, x, fy + 1.12, -2.86, .96, 2.24, .1, '#1e1611')
        for (const dx of [-.455, .455]) box(L, x + dx, fy + 1.12, -2.6, .05, 2.24, .56, '#4a3424')
        box(L, x, fy + 2.26, -2.58, 1.0, .07, .62, DESK[1])
        for (const sy of [.06, .6, 1.14, 1.68]) {
          box(L, x, fy + sy, -2.6, .88, .04, .52, DESK[1])
          for (let bx = x - .42; ;) {
            const bw = rnd() < .35 ? .08 : .056, bh = .3 + rnd() * .15
            if (bx + bw > x + .42) break
            if (rnd() > .12) {
              box(L, bx + bw / 2, fy + sy + .02 + bh / 2, -2.64, bw - .008, bh, .32, cols[Math.floor(rnd() * cols.length)])
              if (rnd() < .5) box(L, bx + bw / 2, fy + sy + bh - .04, -2.477, bw - .008, .022, .006, '#c9a26b', { castShadow: false })
            }
            bx += bw
          }
        }
      }
      if (r.lit && k >= 2) {
        // the rolling ladder, hooked on a brass rail along the cornices
        const lx = b0 - .2
        box(L, rx, fy + 2.16, -2.27, k * .98 - .1, .03, .03, '#8a8f96', { castShadow: false })
        for (const dx of [-.17, .17]) { box(L, lx + dx, fy + 1.1, -2.2, .045, 2.12, .045, '#9a7b4f'); box(L, lx + dx, fy + .04, -2.2, .07, .07, .07, '#3a3f48') }
        for (let j = 0; j < 6; j++) box(L, lx, fy + .35 + j * .33, -2.2, .34, .035, .05, DESK[0])
      }
      if (!at.length) return
      // the reading table, end to end under the readers
      const tx = (at[0] + at.at(-1)) / 2, tw = at.at(-1) - at[0] + 1.12
      box(L, tx, fy + .62, .4, tw, .05, .66, DESK[0])
      box(L, tx, fy + .585, .4, tw, .02, .66, DESK[1])
      box(L, tx, fy + .3, .72, tw - .04, .56, .03, DESK[2])
      box(L, tx, fy + .3, .735, tw - .24, .38, .01, '#5a4129')
      at.forEach((x, i) => {
        // a green banker's lamp and its pool of light, a stack of books
        box(L, x + .42, fy + .652, .45, .16, .02, .12, '#d4a94f')
        box(L, x + .42, fy + .73, .42, .025, .14, .025, '#d4a94f')
        box(L, x + .42, fy + .83, .45, .27, .07, .15, '#2f7a4a', { glow: r.lit ? .35 : 0 })
        box(L, x + .42, fy + .868, .45, .18, .02, .1, '#5fb37a', { glow: r.lit ? .3 : 0 })
        if (r.lit) {
          box(L, x + .42, fy + .79, .48, .17, .014, .06, '#fff2c4', { glow: 1.4, castShadow: false })
          box(L, x + .42, fy + .647, .52, .36, .004, .26, '#ffe7b0', { glow: .35, castShadow: false })
        }
        for (const [j, c] of ['#3e5a7a', '#7a3b2e', '#4f6b3a'].entries()) box(L, x - .44 + (j % 2) * .02, fy + .665 + j * .04, .45, .22 - j * .02, .04, .15, c)
        if (i >= r.n) { box(L, x, fy + .66, .5, .3, .04, .2, '#6e2a22'); box(L, x, fy + .683, .5, .26, .008, .17, PAPER); return }
        const reader = seat(L, r, i, x, fy + .64, .02, 'read')
        // the open book held up under its eyes: its leather cover, the pages, a gilt title, a ribbon in its project's color
        const color = r.tags[i] ?? r.tags[0] ?? r.color
        box(reader.root, 0, .1, .3, .46, .2, .03, '#6e2a22')
        for (const dx of [-.112, .112]) box(reader.root, dx, .115, .318, .2, .15, .01, PAPER)
        box(reader.root, 0, .1, .322, .022, .2, .012, '#4a1a15')
        box(reader.root, .112, .155, .325, .1, .018, .004, '#f0c95a')
        box(reader.root, .03, .01, .322, .025, .06, .004, color)
        // now and then a page turns over the spine, each reader on a phase of its own
        if (r.lit) {
          const flip = new THREE.Group(); flip.position.set(0, .115, .326); flip.visible = false; reader.root.add(flip)
          box(flip, .1, 0, 0, .2, .15, .008, PAPER, { dynamic: true, castShadow: false })
          movers.push({ kind: 'page', obj: flip, phase: ((r.base + i) * 2.9) % 7 })
        }
      })
    },

    // typing pool: corkboards of printouts on the wall, the lines the commits added and removed on a scoreboard hung
    // over the desks, a desk per coder peering over a low screen of code, its paper stack and a mug in its project's color
    coding(L, r, fy, ceil, inner, at) {
      const add = Math.max(0, Number(totals.additions) || 0), del = Math.max(0, Number(totals.deletions) || 0)
      const lines = r.lit && !quiet && (add || del) ? [[`+${fmtCount(add)}`, ROLE.busy, { pixel: true }], [`−${fmtCount(del)}`, ROLE.warn, { pixel: true, sep: '  ' }]] : null
      const bw = lines ? labels.measure(`+${fmtCount(add)}  −${fmtCount(del)}`, .32, { pixel: true }) + .3 : 0
      const board = lines && bw + 1.2 <= r.x1 - r.x0
      const c1 = board ? r.x1 - bw - .45 : r.x1 - .1
      const k = Math.max(1, Math.floor((c1 - r.x0 - .2) / 1.0)), c0 = (r.x0 + c1) / 2 - ((k - 1) * 1.0) / 2
      for (let i = 0; i < k; i++) {
        const x = c0 + i * 1.0, yy = fy + 1.62
        box(L, x, yy, -2.94, .86, .56, .05, '#7d5f3c')
        box(L, x, yy, -2.91, .78, .48, .02, '#b08850')
        for (const [dx, h] of [[-.22, .3], [.02, .25]]) {
          box(L, x + dx, yy - .02, -2.895, .18, h, .01, PAPER)
          for (let j = 0; j < 4; j++) box(L, x + dx - .02 + (j % 2) * .03, yy + h / 2 - .07 - j * .055, -2.888, .1 - (j % 3) * .02, .018, .004, ['#c678dd', ROLE.busy, '#6f91dc', '#eec96f'][(i + j) % 4], { castShadow: false })
          box(L, x + dx, yy + h / 2 - .03, -2.885, .03, .03, .01, ROLE.ask, { castShadow: false })
        }
        box(L, x + .27, yy + .08, -2.895, .15, .15, .01, '#eec96f')
      }
      if (board) {
        // the scoreboard, hung from the ceiling over the desks (its tooltip says it in full)
        const bx = r.x1 - .3 - bw / 2, by = fy + 1.82, bz = -1.2
        for (const dx of [-bw / 2 + .12, bw / 2 - .12]) box(L, bx + dx, (by + .25 + inner) / 2, bz, .025, inner - by - .25, .025, '#3a342b', { castShadow: false })
        box(L, bx, by, bz - .05, bw + .08, .5, .06, '#2b2620')
        tag({ lines: [{ spans: lines, size: .32 }], width: bw, height: .42, valign: 'middle', pad: .12, bg: '#14100c', radius: .03 }, bx, by, bz, L)
      }
      at.forEach((x, i) => {
        box(L, x, fy + .55, .42, 1.1, .05, .6, DESK[0])
        box(L, x, fy + .515, .42, 1.1, .02, .6, DESK[1])
        box(L, x, fy + .26, .7, 1.06, .48, .03, DESK[2])
        box(L, x + .38, fy + .26, .42, .28, .48, .5, '#7d5f3c')
        for (const yy of [.18, .36]) box(L, x + .38, fy + yy, .675, .2, .014, .01, '#c49a62')
        // a low screen of colored code, its coder peering over it
        box(L, x - .05, fy + .59, .5, .12, .03, .1, '#5b5d58')
        box(L, x - .05, fy + .71, .53, .42, .26, .05, '#2b2f36')
        if (i < r.n) screen(L, 'coding', x - .05, fy + .71, .557, .36, .21, i * .9)
        else box(L, x - .05, fy + .71, .557, .36, .21, .004, '#0b0d10')
        box(L, x + .42, fy + .6, .45, .2, .06, .26, PAPER)
        box(L, x + .42, fy + .64, .45, .18, .015, .24, '#e2dccd')
        box(L, x - .46, fy + .63, .45, .1, .12, .1, r.tags[i] ?? r.tags[0] ?? r.color)
        box(L, x - .46, fy + .69, .45, .08, .01, .08, '#3b2a20')
        if (i < r.n) seat(L, r, i, x, fy + .62, .06, 'type')
      })
    },

    // internet café: a planet turning on its stand, a coffee bar where the room has the width, a café table per agent
    // with its laptop and a cup
    web(L, r, fy, ceil, inner, at) {
      const w = r.x1 - r.x0
      const bar = r.lit && w - at.length * r.pitch >= 1.7
      const gx = bar ? (r.x0 + r.x1 - 1.4) / 2 : (r.x0 + r.x1) / 2, gy = fy + 1.62, gz = -2.0
      if (bar) at = spots(r.x0, r.x1 - 1.4, at.length, r.pitch)
      box(L, gx, fy + .05, gz, .5, .1, .5, '#5d6168')
      box(L, gx, fy + .55, gz, .07, .9, .07, '#8a8f96')
      box(L, gx + .52, gy, gz, .04, .9, .04, '#d4a94f')
      for (const dy of [-.45, .45]) box(L, gx + .38, gy + dy, gz, .3, .04, .04, '#d4a94f')
      const tilt = new THREE.Group(); tilt.position.set(gx, gy, gz); tilt.rotation.z = .4; L.add(tilt)
      const spin = new THREE.Group(); tilt.add(spin)
      const ocean = kit.mat('#3f7fb8', r.lit ? .25 : 0), land = kit.mat(ROLE.busy, r.lit ? .25 : 0), v = .08, R = 5.4
      for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) for (let k = -6; k <= 6; k++) {
        const d = Math.hypot(i, j, k)
        if (d > R || d < R - 1.25) continue
        const lat = Math.asin(j / d), lon = Math.atan2(k, i)
        const row = clamp(Math.floor((.5 - lat / Math.PI) * 11), 0, 10), col = clamp(Math.floor(((lon + Math.PI) / (2 * Math.PI)) * 22), 0, 21)
        box(spin, i * v, j * v, k * v, v, v, v, LAND[row][col] === '#' ? land : ocean, { castShadow: false })
      }
      if (r.lit) movers.push({ kind: 'spin', obj: spin })
      if (bar) {
        // the coffee bar: its counter, the espresso machine, cups
        const bx = r.x1 - .8
        box(L, bx, fy + .5, -1.7, 1.2, 1.0, .55, '#38513d')
        box(L, bx, fy + 1.03, -1.7, 1.3, .06, .62, '#b98a58')
        box(L, bx - .25, fy + 1.28, -1.8, .42, .44, .36, '#505a55')
        box(L, bx - .25, fy + 1.3, -1.6, .3, .2, .03, '#a0a596')
        box(L, bx - .25, fy + 1.12, -1.58, .1, .06, .06, '#303c33')
        for (const [j, c] of ['#6a9c88', '#c5a166', '#d0c4a0'].entries()) box(L, bx + .15 + j * .14, fy + 1.12, -1.6, .1, .12, .1, c)
      }
      at.forEach((x, i) => {
        box(L, x, fy + .55, .42, .86, .05, .62, DESK[0])
        box(L, x, fy + .52, .42, .86, .02, .62, DESK[1])
        box(L, x, fy + .27, .42, .08, .5, .08, DESK[2])
        box(L, x, fy + .04, .42, .44, .04, .34, '#4a3520')
        // the laptop, its screen to the street, the browser on it; a cup of coffee
        box(L, x + .05, fy + .59, .52, .44, .025, .26, '#a4a9b0')
        box(L, x + .05, fy + .7, .62, .42, .24, .025, '#c4c9d0')
        if (i < r.n) screen(L, 'web', x + .05, fy + .7, .636, .34, .2, i * 1.1)
        box(L, x - .36, fy + .62, .45, .11, .11, .11, '#e9dfc5')
        box(L, x - .36, fy + .675, .45, .09, .01, .09, '#3b2a20')
        if (i < r.n) seat(L, r, i, x, fy + .6, .06, 'read')
      })
    },

    // gadget shop: pegboards of tools on the wall, a workbench per agent with a vise, a gadget whose light blinks and
    // parts bins in its project's color
    tools(L, r, fy, ceil, inner, at) {
      const w = r.x1 - r.x0, rx = (r.x0 + r.x1) / 2
      const k = Math.max(1, Math.floor((w - .3) / 1.2)), p0 = rx - ((k - 1) * 1.2) / 2
      for (let i = 0; i < k; i++) {
        const x = p0 + i * 1.2, yy = fy + 1.62
        box(L, x, yy, -2.94, 1.08, .5, .04, '#8a6a40')
        box(L, x, yy - .23, -2.915, 1.08, .04, .03, DESK[2])
        for (let a = 0; a < 7; a++) for (let b = 0; b < 3; b++) box(L, x - .45 + a * .15, yy - .14 + b * .14, -2.918, .02, .02, .004, '#5a4129', { castShadow: false })
        // a wrench, a hammer, a screwdriver, pliers
        box(L, x - .38, yy, -2.905, .04, .3, .02, '#a4a9b0'); box(L, x - .38, yy + .15, -2.905, .1, .06, .02, '#a4a9b0')
        box(L, x - .14, yy - .02, -2.905, .035, .3, .02, '#9a7b4f'); box(L, x - .14, yy + .14, -2.905, .16, .07, .025, '#5d6168')
        box(L, x + .1, yy + .08, -2.905, .05, .13, .025, ROLE.ask); box(L, x + .1, yy - .06, -2.905, .02, .17, .015, '#a4a9b0')
        box(L, x + .32, yy + .1, -2.905, .1, .08, .02, '#a4a9b0'); for (const dx of [-.03, .03]) box(L, x + .32 + dx, yy - .03, -2.905, .025, .18, .02, ROLE.ask)
      }
      at.forEach((x, i) => {
        box(L, x, fy + .58, .42, 1.1, .07, .6, '#9a7b4f')
        box(L, x, fy + .535, .73, 1.1, .03, .03, '#6f5636')
        for (const dx of [-.5, .5]) box(L, x + dx, fy + .27, .42, .07, .54, .5, DESK[2])
        box(L, x, fy + .14, .42, .94, .03, .46, DESK[2])
        box(L, x - .2, fy + .23, .45, .3, .14, .3, r.tags[i] ?? r.tags[0] ?? '#5d6168')
        box(L, x + .2, fy + .23, .45, .3, .14, .3, '#3f7fb8')
        // the vise, the gadget on the bench and its blinking light
        box(L, x + .38, fy + .66, .5, .14, .1, .18, '#5d6168'); box(L, x + .38, fy + .73, .5, .1, .04, .12, '#8a8f96')
        box(L, x - .18, fy + .67, .55, .32, .13, .2, '#3a3f48')
        box(L, x - .23, fy + .67, .653, .12, .06, .01, '#7fd6e8', { glow: r.lit ? .8 : 0, castShadow: false })
        box(L, x - .07, fy + .78, .55, .02, .12, .02, '#a4a9b0')
        box(L, x - .07, fy + .85, .55, .045, .045, .045, r.lit ? M.gadget : '#3a3f48', { castShadow: false })
        if (i < r.n) seat(L, r, i, x, fy + .62, .02, 'type')
      })
    },

    // whiteboard: a board of columns and sticky notes along the wall (one note on its way to the next column), the
    // planners standing in front of it
    planning(L, r, fy, ceil, inner, at) {
      const w = r.x1 - r.x0, rx = (r.x0 + r.x1) / 2, bw = w - .6, yy = fy + 1.42
      box(L, rx, yy, -2.92, bw, 1.1, .06, '#cfc8b8')
      box(L, rx, yy, -2.885, bw - .1, 1.0, .02, r.lit ? '#f4f1e8' : '#8d897f')
      box(L, rx, yy - .56, -2.84, bw - .3, .04, .1, '#8a8478')
      box(L, rx - .3, yy - .525, -2.82, .14, .03, .03, ROLE.ask); box(L, rx - .1, yy - .525, -2.82, .14, .03, .03, '#3f7fb8')
      const cols = clamp(Math.floor((bw - .25) / .62), 1, 6), rnd = seeded(`wk-board-${cols}`)
      const NOTE = ['#eec96f', '#e08fc0', '#7fd6e8', ROLE.busy]
      const c0 = rx - ((cols - 1) * .62) / 2
      for (let i = 0; i < cols; i++) {
        const x = c0 + i * .62
        box(L, x, yy + .38, -2.872, .34, .025, .006, '#5d6168', { castShadow: false })
        for (let j = 0, n = 1 + Math.floor(rnd() * 3); j < n; j++) box(L, x + (j % 2 ? .03 : -.03), yy + .18 - j * .22, -2.871, .24, .17, .008, NOTE[(i + j) % 4], { castShadow: false })
        if (i < cols - 1) { box(L, x + .31, yy + .08, -2.872, .14, .022, .005, '#6f91dc', { castShadow: false }); box(L, x + .38, yy + .08, -2.872, .03, .08, .005, '#6f91dc', { castShadow: false }) }
      }
      if (r.lit && cols > 1) {
        const note = new THREE.Group(); note.position.set(c0, yy - .3, -2.865); L.add(note)
        box(note, 0, 0, 0, .24, .17, .008, '#eec96f', { castShadow: false })
        movers.push({ kind: 'note', obj: note, x: c0, y: yy - .3, step: .62 })
      }
      at.forEach((x, i) => seat(L, r, i, x, fy + .1, -.6, i % 2 ? 'look' : 'point', true))
    },

    // phone booth: a red booth per agent, the agent inside on the phone, a speech bubble over it
    talking(L, r, fy, ceil, inner, at) {
      at.forEach((x, i) => {
        const z = -.9, h = 1.5, y0 = fy + .12
        box(L, x, fy + .06, z, .98, .12, .92, '#9a3428')
        for (const dx of [-.44, .44]) for (const dz of [-.41, .41]) box(L, x + dx, y0 + h / 2, z + dz, .1, h, .1, '#c8463a')
        box(L, x, y0 + h / 2, z - .42, .8, h, .04, '#2a1f1d')
        for (const dx of [-.445, .445]) { box(L, x + dx, y0 + h / 2, z, .04, h, .74, '#b03c31'); box(L, x + dx * 1.02, y0 + .85, z, .01, .7, .52, '#2a1f1d') }
        box(L, x, y0 + .14, z + .42, .8, .28, .04, '#b03c31')
        for (const yy of [.3, .62, .94]) box(L, x, y0 + yy, z + .43, .8, .035, .035, '#c8463a')
        box(L, x, y0 + .7, z + .43, .035, .8, .035, '#c8463a')
        box(L, x, y0 + h - .1, z + .43, .66, .11, .03, PAPER, { glow: r.lit ? .35 : 0 })
        for (let j = 0; j < 7; j++) box(L, x - .24 + j * .08, y0 + h - .1, z + .447, .05, .05, .004, '#3a2a20', { castShadow: false })
        box(L, x, y0 + h + .06, z, 1.0, .12, .94, '#9a3428')
        box(L, x, y0 + h + .16, z, .72, .08, .7, '#9a3428')
        box(L, x, y0 + h + .23, z, .14, .07, .1, '#d4a94f', { glow: .3 })
        box(L, x, y0 + .7, z + .41, .76, .78, .01, M.glass, { castShadow: false })
        box(L, x - .22, y0 + .95, z - .37, .14, .2, .06, '#3a3f48')
        if (i >= r.n) { box(L, x - .22, y0 + .95, z - .33, .05, .2, .04, '#1b1b1f'); return }
        const caller = seat(L, r, i, x + .04, y0, z + .02, 'look', true)
        // the receiver at its ear, its cord to the phone
        box(caller.leftArm, -7.4 * P, 6.6 * P, .19, .07, .24, .07, '#1b1b1f'); box(caller.leftArm, -7.4 * P, 8.2 * P, .23, .1, .06, .06, '#1b1b1f')
        box(L, x - .2, y0 + .7, z - .25, .025, .45, .025, '#1b1b1f', { castShadow: false })
        // the speech bubble, its last dot blinking
        const bx = x + .5, by = y0 + h + .05, bz = z + .55
        const white = kit.mat('#f4efe4', .45)
        box(L, bx, by, bz, .44, .24, .05, white, { castShadow: false }); box(L, bx, by, bz, .38, .3, .05, white, { castShadow: false })
        box(L, bx - .14, by - .17, bz, .06, .07, .05, white, { castShadow: false })
        box(L, bx - .1, by, bz + .03, .05, .05, .01, '#7a6f5c', { castShadow: false }); box(L, bx, by, bz + .03, .05, .05, .01, '#7a6f5c', { castShadow: false })
        box(L, bx + .1, by, bz + .03, .05, .05, .01, M.dot, { castShadow: false })
      })
    },

    // management: the org chart on the wall (a task travelling down it), a boss's desk per agent, pointing out work
    delegating(L, r, fy, ceil, inner, at) {
      const w = r.x1 - r.x0, rx = (r.x0 + r.x1) / 2
      const side = w - at.length * r.pitch >= 1.5
      const ox = side ? r.x1 - .8 : rx, oy = fy + 1.55, line = '#a4977c'
      if (side) at = spots(r.x0, r.x1 - 1.3, at.length, r.pitch)
      const card = (x, yy, color) => {
        box(L, x, yy, -2.93, .32, .24, .04, color)
        box(L, x, yy, -2.905, .25, .17, .01, '#2b2520')
        box(L, x, yy + .03, -2.898, .07, .05, .006, line, { castShadow: false }); box(L, x, yy - .04, -2.898, .14, .05, .006, line, { castShadow: false })
      }
      card(ox, oy + .4, '#d4a94f')
      box(L, ox, oy + .22, -2.93, .03, .12, .02, line); box(L, ox, oy + .15, -2.93, .94, .03, .02, line)
      for (const dx of [-.46, 0, .46]) { box(L, ox + dx, oy + .1, -2.93, .03, .1, .02, line); card(ox + dx, oy - .08, ROLE.intern) }
      if (r.lit) {
        const task = new THREE.Group(); task.position.set(ox, oy + .26, -2.9); L.add(task)
        box(task, 0, 0, 0, .06, .06, .02, ROLE.accent, { glow: .8, castShadow: false })
        movers.push({ kind: 'task', obj: task, x: ox, y: oy })
      }
      at.forEach((x, i) => {
        box(L, x, fy + .58, .4, 1.36, .08, .7, '#5a4129')
        box(L, x, fy + .535, .76, 1.36, .03, .02, '#d4a94f', { glow: r.lit ? .15 : 0 })
        box(L, x, fy + .3, .72, 1.34, .5, .04, '#5a4129')
        for (const dx of [-.33, .33]) box(L, x + dx, fy + .3, .745, .5, .32, .01, '#4a3520')
        box(L, x - .3, fy + .65, .6, .3, .07, .04, '#d4a94f'); box(L, x - .3, fy + .65, .622, .22, .025, .005, '#7a5a2a')
        box(L, x + .45, fy + .655, .45, .26, .07, .18, PAPER); box(L, x + .45, fy + .69, .45, .24, .004, .16, '#9a9282')
        if (i >= r.n) return
        seat(L, r, i, x - .02, fy + .62, .02, 'point')
        const sheet = new THREE.Group(); sheet.position.set(x + .45, fy + .72, .45); L.add(sheet)
        box(sheet, 0, 0, 0, .2, .006, .14, PAPER, { castShadow: false })
        movers.push({ kind: 'sheet', obj: sheet, x: x + .45, y: fy + .72, phase: i * .9 })
      })
    },

    // art studio: framed paintings on the wall, an easel per agent whose canvas keeps changing, the painter beside it
    // with its palette and brush
    design(L, r, fy, ceil, inner, at) {
      const w = r.x1 - r.x0, rx = (r.x0 + r.x1) / 2
      const k = Math.max(1, Math.floor((w - .3) / .8)), a0 = rx - ((k - 1) * .8) / 2
      for (let i = 0; i < k; i++) {
        const x = a0 + i * .8, yy = fy + 1.68
        if (i % 2 === 0) {
          box(L, x, yy, -2.93, .56, .44, .04, '#d4a94f')
          for (const [dy, h, c] of [[.12, .12, '#e08fc0'], [.02, .08, '#eec96f'], [-.1, .16, '#3f7fb8']]) box(L, x, yy + dy, -2.905, .48, h, .01, c)
          box(L, x + .1, yy + .05, -2.898, .08, .08, .006, '#f6d860', { glow: r.lit ? .5 : 0, castShadow: false })
        } else {
          box(L, x, yy, -2.93, .4, .4, .04, DESK[1])
          box(L, x, yy, -2.905, .32, .32, .01, '#f4f1e8')
          box(L, x, yy - .09, -2.898, .1, .12, .006, '#3f7fb8', { castShadow: false })
          for (const [dx, dy, c] of [[-.05, .07, '#e07a61'], [.05, .09, '#eec96f'], [0, .12, '#c678dd']]) { box(L, x + dx * .6, yy + dy - .06, -2.899, .015, .12, .004, '#4f7f34', { castShadow: false }); box(L, x + dx, yy + dy, -2.896, .05, .05, .006, c, { castShadow: false }) }
        }
      }
      at.forEach((x, i) => {
        const ex = x + .35
        for (const s of [-1, 1]) box(L, ex + s * .19, fy + .66, -.25, .04, 1.3, .04, '#9a7b4f', { rotate: s * .12 })
        box(L, ex, fy + .62, -.45, .04, 1.22, .04, '#9a7b4f')
        box(L, ex, fy + .72, -.18, .62, .04, .1, DESK[2])
        box(L, ex, fy + 1.0, -.22, .56, .48, .04, '#e9e4d6')
        const bar = box(L, ex - .15, fy + 1.0, -.196, .13, .34, .01, M.paint[(i + 1) % 3], { dynamic: true, castShadow: false })
        box(L, ex, fy + 1.0, -.196, .13, .34, .01, '#eec96f', { castShadow: false }); box(L, ex + .15, fy + 1.0, -.196, .13, .34, .01, '#6f91dc', { castShadow: false })
        for (const [dx, dz, c] of [[-.5, .5, '#e07a61'], [.1, .8, '#6f91dc'], [.5, .3, '#eec96f']]) box(L, x + dx, fy + .105, dz, .12, .006, .08, c, { castShadow: false })
        if (i >= r.n) return
        if (r.lit) movers.push({ kind: 'paint', mesh: bar, phase: i })
        const painter = seat(L, r, i, x - .3, fy + .1, .05, 'look', true)
        // its palette (a dab of each paint) and its brush, the tip in its project's color
        box(painter.leftArm, -8 * P, 4.2 * P, .2, .2, .12, .02, '#c9a26b')
        for (const [dx, c] of [[-.05, '#e07a61'], [0, '#6f91dc'], [.05, ROLE.busy]]) box(painter.leftArm, -8 * P + dx, 4.4 * P, .213, .03, .03, .006, c)
        box(painter.rightArm, 8.4 * P, 6 * P, .2, .025, .2, .025, '#c9a26b', { rotate: -.5 })
        box(painter.rightArm, 8.4 * P + .05, 6 * P + .09, .2, .04, .04, .03, r.tags[i] ?? r.tags[0] ?? r.color)
      })
    },
  }

  // ---------------------------------------------------------------- the hallway: the lift and a plant
  function hallway(L, h, base, fy, ceil, inner) {
    const w = h.x1 - h.x0, hx = (h.x0 + h.x1) / 2
    partition(L, h.x0 - GAP / 2, fy, inner)
    lamp(L, hx + .3, ceil, inner)
    // its windows on the city at the far end, as the live floors'
    const wins = Math.max(0, Math.min(2, Math.floor((w - 1.4) / 1.9)))
    for (let i = 0; i < wins; i++) {
      const x = h.x1 - 1.05 - i * 1.9
      box(L, x, fy + 1.75, -2.96, 1.3, 1.1, .12, '#76644b')
      box(L, x, fy + 1.75, -2.87, 1.12, .92, .06, ctx.windowMaterial)
      box(L, x, fy + 1.75, -2.82, .05, .96, .07, '#6f624e')
      box(L, x, fy + 1.85, -2.82, 1.16, .05, .07, '#6f624e')
      box(L, x, fy + 1.15, -2.84, 1.44, .08, .22, '#917956')
    }
    // the lift: its doors, the floor's arrow lit over them, the call button
    const lx = h.x0 + .75
    box(L, lx, fy + 1.0, -2.95, 1.05, 2.0, .1, '#5d6168')
    box(L, lx, fy + 2.03, -2.94, 1.05, .07, .12, '#8a8f96')
    for (const [dx, c] of [[-.215, '#a4a9b0'], [.215, '#8a8f96']]) { box(L, lx + dx, fy + .92, -2.89, .42, 1.78, .03, c); box(L, lx + dx - .12, fy + .92, -2.872, .03, 1.7, .006, '#c4c9d0', { castShadow: false }) }
    box(L, lx, fy + 2.3, -2.93, .4, .26, .05, '#14100c')
    sprite(L, UP, { '#': M.arrow }, lx, fy + 2.24, -2.9, .045, .015)
    box(L, lx + .68, fy + 1.0, -2.93, .1, .2, .04, '#3a3f48'); box(L, lx + .68, fy + 1.03, -2.9, .04, .04, .01, M.arrow, { castShadow: false })
    if (w >= 2.2) plant(L, h.x1 - .55, fy + .05, -2.3, .6)
    if (w >= 3.6) {
      // a bench to wait on
      const bx = h.x0 + 2.1
      box(L, bx, fy + .4, -2.4, 1.2, .07, .4, DESK[0]); box(L, bx, fy + .62, -2.6, 1.2, .3, .05, DESK[1])
      for (const dx of [-.5, .5]) box(L, bx + dx, fy + .2, -2.4, .06, .38, .32, DESK[2])
    }
    collider(L, hx, (base + inner) / 2, 0, w, inner - base, 6.2, 'hallway · every room is as wide as its share of the calls, so what is left is corridor')
  }

  // ---------------------------------------------------------------- the interns' floor: mini agents on a bench, by job
  function internsFloor(L, base, fy, ceil, inner) {
    const total = sum(jobs.map(j => j.n))
    // the windows on the city behind the bench, two lamps
    for (const x of [-5.35, 0, 5.35].map(v => cx + (v * width) / 16)) {
      box(L, x, fy + 1.15, -2.96, 1.5, .9, .12, '#76644b')
      box(L, x, fy + 1.15, -2.87, 1.32, .72, .06, ctx.windowMaterial)
      box(L, x, fy + 1.15, -2.82, .05, .76, .07, '#6f624e')
      box(L, x, fy + .66, -2.84, 1.66, .08, .22, '#917956')
    }
    for (const x of [cx - width / 4, cx + width / 4]) lamp(L, x, ceil, inner)
    // the nameplate and what the bench is
    const plateW = labels.measure('INTERNS', CAPTION.plate, { pixel: true }) + .3
    const sx = x0 + .36, sy = ceil - .38, sz = 2.55
    for (const dx of [.22, plateW - .22]) box(L, sx + dx, (sy + .23 + inner) / 2, sz, .025, inner - sy - .23, .025, '#3a342b', { castShadow: false })
    box(L, sx + plateW / 2, sy, sz - .04, plateW + .08, .46, .05, '#120e0b')
    tag({ lines: [{ spans: [['INTERNS', '#16110d', { pixel: true }]], size: CAPTION.plate }], width: plateW, height: .38, valign: 'middle', pad: .08, bg: ROLE.intern, radius: .025, anchor: 'left' }, sx, sy, sz + .005, L)
    tag({ lines: [{ spans: [[`${plural(total, 'helper')} hired, by job`, K.groupText]], size: .17 }], pad: .07, bg: '#120e0b', alpha: .94, radius: .03, anchor: 'left' }, sx + plateW + .25, sy, sz, L)
    // a water cooler and plants by the wall: a waiting room
    plant(L, x0 + .55, fy + .05, -2.4, .62); plant(L, x1 - .55, fy + .05, -2.4, .58)
    const wx = cx + width * .17
    box(L, wx, fy + .42, -2.55, .42, .84, .4, '#b9bab0'); box(L, wx, fy + 1.08, -2.55, .32, .48, .32, '#70a8b6', { glow: .15 }); box(L, wx, fy + 1.34, -2.55, .2, .06, .2, '#abcbd0')
    box(L, wx, fy + .72, -2.33, .1, .06, .04, '#588cb0')
    // the bench, end to end at the front
    const b0 = x0 + .45, b1 = x1 - .45, bz = 2.2
    box(L, (b0 + b1) / 2, fy + .38, bz, b1 - b0, .07, .44, DESK[0])
    box(L, (b0 + b1) / 2, fy + .335, bz + .23, b1 - b0, .04, .03, DESK[1])
    box(L, (b0 + b1) / 2, fy + .68, bz - .22, b1 - b0, .22, .05, DESK[1])
    for (let x = b0 + .2; x < b1; x += 1.6) { box(L, x, fy + .18, bz, .07, .36, .36, DESK[2]); box(L, x, fy + .55, bz - .22, .05, .3, .05, DESK[2]) }
    // each job's minis (as many as its share of the biggest, four at most) with a badge, its count on the band under them;
    // the groups that fit spread along the bench
    const max = jobs[0]?.n || 1, size = .19
    const groups = []
    let used = 0
    for (const j of jobs) {
      const k = clamp(Math.round((4 * j.n) / max), 1, 4)
      const label = plural(j.n, j.title)
      const gw = Math.max(k * .74, labels.measure(label, size) + .2)
      const more = groups.length < jobs.length - 1 ? labels.measure('+99 more', size) + .5 : 0
      if (used + gw + (groups.length ? .5 : 0) > width - .9 - more) break
      used += gw + (groups.length ? .5 : 0)
      groups.push({ j, k, label, gw, badge: JOB_BADGE[j.title] ?? ROLE.dim })
    }
    const rest = jobs.length - groups.length
    const tail = rest ? labels.measure(`+${rest} more`, size) + .5 : 0
    const gap = groups.length > 1 ? Math.min(2.4, (width - .9 - tail - used) / (groups.length - 1) + .5) : 0
    let gx = groups.length === 1 ? cx - groups[0].gw / 2 : x0 + .5, seatN = 0
    for (const g of groups) {
      const g0 = gx + (g.gw - g.k * .74) / 2
      for (let m = 0; m < g.k; m++) {
        const mx = g0 + .37 + m * .74
        const mini = actors.mini(pick(seatN++), { p: .066 })
        mini.position.set(mx, fy + .415, bz + .02)
        L.add(mini)
        minis.push({ mini, y: fy + .415, phase: (seatN * 1.7) % 5 })
        box(L, mx, fy + .335, bz + .255, .14, .05, .02, g.badge, { glow: .5, castShadow: false })
      }
      tag({ lines: [{ spans: [[g.label, g.badge]], size }], pad: .04, anchor: 'top-left', align: 'center', width: g.gw }, gx, fy - .14, FRONT + .26, L)
      collider(L, gx + g.gw / 2, (base + fy + 1.0) / 2, 1.6, g.gw, fy + 1.0 - base, 3.4, `${g.label} · interns are helper agents (subagents) their bosses delegated to`)
      gx += g.gw + gap
    }
    if (rest) tag({ lines: [{ spans: [[`+${rest} more`, ROLE.dim]], size }], pad: .04, anchor: 'top-left' }, x1 - .4 - tail + .5, fy - .14, FRONT + .26, L)
  }

  // ---------------------------------------------------------------- the title band under the cornice
  function titleBand(L, top) {
    const yy = top - .44, z = FRONT + .33
    box(L, cx, yy, z, width + .9, .6, .1, '#14100d')
    box(L, cx, yy + .32, z + .02, width + .9, .05, .13, K.wood)
    box(L, cx, yy - .32, z + .02, width + .9, .05, .13, K.woodD)
    const head = tag({ lines: [{ spans: [['SHARE OF TOOL CALLS', ROLE.title, { bold: true }]], size: .21 }], pad: .02, anchor: 'left' }, x0 + .36, yy, z + .07, L)
    const big = tag({ lines: [{ spans: [[fmtCount(plan.total), ROLE.accent, { pixel: true }], ['total', ROLE.dim, { scale: .4, sep: ' ' }]], size: .5, gap: 0 }], pad: .02, anchor: 'right' }, x1 - .36, yy + .015, z + .07, L)
    // the dotted rule between them
    const d0 = x0 + .36 + head.userData.size[0] + .25, d1 = x1 - .36 - big.userData.size[0] - .25
    for (let x = d0; x < d1; x += .16) box(L, x, yy - .02, z + .055, .07, .025, .01, ROLE.dim, { castShadow: false })
  }

  // ---------------------------------------------------------------- what moves
  const blink = (m, on, color, off) => { const v = on ? 1.5 : .02; if (m.emissiveIntensity !== v) { m.emissiveIntensity = v; m.color.set(on ? color : off) } }
  function update(t) {
    for (const f of figures) actors.animate(f.actor, f.pose, t)
    for (const m of minis) m.mini.position.y = m.y + (Math.floor(t * 3 + m.phase) % 2) * .03
    for (const s of screens) actors.tickScreen(s.mesh, t, s.phase)
    blink(M.ledA, Math.floor(t * 1.8) % 3 !== 1, ROLE.busy, '#26331c')
    blink(M.ledB, Math.floor(t * 1.1 + .5) % 2 === 0, ROLE.accent, '#3a311b')
    blink(M.cross, Math.floor(t * 1.25) % 3 !== 2, ROLE.ask, '#2a1814')
    blink(M.arrow, Math.floor(t * 1.6) % 3 !== 2, ROLE.accent, '#3a311b')
    blink(M.gadget, Math.floor(t * 2) % 2 === 0, ROLE.ask, ROLE.busy)
    blink(M.dot, Math.floor(t * 2) % 2 === 0, '#7a6f5c', '#f4efe4')
    for (const m of movers) {
      if (m.kind === 'spin') m.obj.rotation.y = t * .35
      else if (m.kind === 'rise') { const k = (t * .7 + m.phase) % 1; m.obj.position.y = m.y + k * .2; m.obj.visible = k < .8 }
      else if (m.kind === 'note') {
        // a sticky note steps to the next column every few seconds, then back
        const k = (t / 3.2) % 1, step = k < .4 ? 0 : k < .55 ? (k - .4) / .15 : k < .85 ? 1 : 1 - (k - .85) / .15
        m.obj.position.set(m.x + step * m.step, m.y + Math.sin(step * Math.PI) * .12, m.obj.position.z)
      } else if (m.kind === 'task') {
        // a task travels down the org chart to a helper, then a new one starts at the top
        const k = (t / 2.4) % 1
        const [px, py] = k < .3 ? [0, .26 - (k / .3) * .11] : k < .6 ? [-((k - .3) / .3) * .46, .15] : k < .85 ? [-.46, .15 - ((k - .6) / .25) * .1] : [-.46, .05]
        m.obj.position.set(m.x + px, m.y + py, m.obj.position.z)
        m.obj.visible = k < .9
      } else if (m.kind === 'sheet') {
        const k = (t / 2 + m.phase) % 1
        m.obj.position.set(m.x + k * .5, m.y + Math.sin(k * Math.PI) * .25, m.obj.position.z)
        m.obj.rotation.z = k * 1.2
        m.obj.visible = k < .75
      } else if (m.kind === 'paint') m.mesh.material = M.paint[Math.floor(t / 2.4 + m.phase) % 3]
      else if (m.kind === 'page') {
        const k = ((t + m.phase) % 7) / 7
        m.obj.visible = k > .9
        m.obj.rotation.y = k > .9 ? (-Math.PI * (k - .9)) / .1 : 0
      }
    }
    return true
  }

  // ---------------------------------------------------------------- the storeys, bottom-up
  const stack = [...(jobs.length ? [{ kind: 'interns' }] : []), ...[...plan.rows].reverse().map(row => ({ kind: 'rooms', row }))]
  let y = ground
  stack.forEach((s, i) => {
    const titled = title && i === stack.length - 1
    const band = s.kind === 'interns' ? INTERN_BAND : WORK_BAND
    const room = s.kind === 'interns' ? INTERN_ROOM : WORK_ROOM
    const height = band + room + (titled ? WORK_TITLE : 0)
    const L = new THREE.Group(); L.userData.y = y; group.add(L)
    const base = y, fy = base + band, top = base + height
    // the ceiling the props hang from: the room's own (the title band covers what is above it), and the slab over it
    const ceil = fy + room, inner = titled ? top - .18 : top
    storeys.push({ base, height, number: number + i, group: L, floor: i })
    shell(L, base, fy, inner, band)
    if (s.kind === 'interns') internsFloor(L, base, fy, ceil, inner)
    else {
      for (const r of s.row.rooms) department(L, r, base, fy, ceil, inner)
      if (s.row.hall) hallway(L, s.row.hall, base, fy, ceil, inner)
    }
    if (titled) titleBand(L, top)
    y = top
  })
  // two warm lights over the whole stack: each lights half the floors from in front of the desks
  if (lights) for (const k of [.25, .75]) {
    const light = new THREE.PointLight('#ffd9a0', LIGHT.intensity, LIGHT.distance, LIGHT.decay)
    light.position.set(cx, ground + (y - ground) * k, LIGHT.z)
    light.userData.nightIntensity = LIGHT.intensity
    group.add(light); ctx.lights.push(light)
  }
  kit.flush()
  return { storeys, group, pickables, update, plan, who, top: y }
}

/** What they did: the departments' building over the street lobby, its sign the page and what an agent stands for. */
export function buildWork(ctx, snapshot, { quiet = false } = {}) {
  const built = buildDepartments(ctx, snapshot, { quiet })
  return {
    storeys: built.storeys, group: built.group, pickables: built.pickables, update: built.update, animated: true,
    sign: workSign(snapshot, built.plan, built.who), status: null, rooms: [], anchors: new Map(),
  }
}
