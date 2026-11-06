// PURE: the street under the office and the COMMITS LINE below it. A cross-section: the road under the scene's own
// sidewalk, a band of soil, then a metro tunnel where a Clawd-faced freight train hauls the range's commits as green
// parcels (one parcel is one commit, the same parcel the day's time cards stack): the more commits, the more wagons;
// the more commits a day, the faster it rolls; no commits and it sleeps at the platform. `subway()` is the piece the
// composer (lib/svg.mjs) puts under the last scene; `street()` fills whatever height the pane still asks for below it
// (bedrock), or draws the whole commits line itself when nothing drew one yet.
// No node:* imports (the desktop mod loads lib/svg.mjs, which imports this file).
import { fmtInt } from './format.mjs'
import { fnv1a, isPastRange, rangeWord } from './model.mjs'
import { CLAWD, CLAWD_EYE, K, ROLE, UNDER, aT, backdrop, blink, clamp, defineSprites, esc, fitGroups, hitArea, num0, paint, pixRuns, pixWidth, r1, textW, use } from './svg-kit.mjs'

// ---------------------------------------------------------------- palette

/**
 * The ground below the street and the commits line's paint (svg-kit UNDER: the live building's basement stands in the
 * same soil), re-exported so a test can name a color instead of repeating a hex.
 */
export { UNDER }

// A commit parcel: today's time cards stack the same one (svg-today.mjs BOX, the ROLE.ship family), so a commit reads
// alike in every scene.
const BOX = ['#9fc06a', '#cfe6a0', '#6f8a45']
const BOX_TEXT = '#24311a'

// ---------------------------------------------------------------- the commits line: facts → a train

/** Commits one wagon carries: two rows of five parcels, so a full wagon is a round ten. */
export const CAR_LOAD = 10
/** The commits line's height in viewBox units: the road, soil, the tunnel (sign, train, rails), soil. */
export const SUBWAY_H = 53
/**
 * Its height without the road (`subway(…, { road: false })`): under the Office's basement the street is up at the
 * lobby's sidewalk, so the line starts in the soil under the basement floor: soil, the tunnel, soil.
 */
export const SUBWAY_DEEP_H = 42
// The train's parts, in viewBox units: the Clawd locomotive (with its arms as buffers), a wagon, the gap between two.
const LOCO_W = 36
const CAR_W = 28
const PITCH = CAR_W + 3

/**
 * The commits the line carries for a view, from the facts: `live`, `all` (the Office, the live building) and `today`
 * (or facts of a live/today range) haul today's commits (`per_day[now.local_date].commits`, else the range total for a
 * one-day range); every other view hauls the range's `totals.commits`, its rate spread over the range's days. Returns
 * `{ commits, perDay, label, days }`, where `label` (model.mjs rangeWord: 'today', 'this week', 'that month' on a past
 * page, which hauls that page's commits whatever the view) finishes '484 commits …', and `counting: true` when a first
 * light has not counted them yet. Odd facts read 0, never throw.
 */
export function commitsLine(ctx, view = ctx.view) {
  const f = ctx.f ?? {}
  const kind = f.range?.kind
  const perDay = f.per_day && typeof f.per_day === 'object' && !Array.isArray(f.per_day) ? f.per_day : {}
  const day = perDay[f.now?.local_date]
  // a first light (facts.first_light) has not counted them yet
  const counting = f.first_light === true ? { counting: true } : {}
  if (!isPastRange(f) && (view === 'live' || view === 'all' || view === 'today' || kind === 'live' || kind === 'today')) {
    const oneDay = kind === 'live' || kind === 'today'
    const commits = day && typeof day === 'object' ? num0(day.commits) : oneDay ? num0(f.totals?.commits) : 0
    return { commits: Math.floor(commits), perDay: Math.floor(commits), label: 'today', days: 1, ...counting }
  }
  const days = Math.max(1, Array.isArray(f.range?.days) ? f.range.days.length : 0)
  const commits = Math.floor(num0(f.totals?.commits))
  return { commits, perDay: commits / days, label: rangeWord(f), days, ...counting }
}

/**
 * How many wagons a train may pull at this width: the train stays within about 60% of the tunnel, between 2 and 8
 * wagons (3 at 480 px, 5 at 660 px, 8 at 960 px), so a pass still shows tunnel on both sides.
 */
export const maxCars = (W) => clamp(Math.floor((W * 0.6 - LOCO_W) / PITCH), 2, 8)

/**
 * The wagons for `commits`, front to back: `loads` are parcel counts (full wagons of CAR_LOAD, then the remainder),
 * and when the commits need more wagons than `cap`, the last wagon is a closed green car painted `+plus` holding the
 * rest, so `sum(loads) + plus === commits` always. 0 commits → no wagons (the locomotive sleeps at the platform).
 */
export function trainPlan(commits, cap) {
  const n = Math.floor(num0(commits))
  const most = Math.max(1, Math.floor(num0(cap)) || 1)
  if (!n) return { loads: [], plus: 0, cars: 0 }
  if (Math.ceil(n / CAR_LOAD) <= most) {
    const loads = Array.from({ length: Math.floor(n / CAR_LOAD) }, () => CAR_LOAD)
    if (n % CAR_LOAD) loads.push(n % CAR_LOAD)
    return { loads, plus: 0, cars: loads.length }
  }
  const loads = Array.from({ length: most - 1 }, () => CAR_LOAD)
  return { loads, plus: n - (most - 1) * CAR_LOAD, cars: most }
}

/**
 * Seconds one pass of the train takes, from the commit rate (commits a day): 32 − 3 × log2(1 + perDay), clamped to
 * 6…30 s. Every doubling of the rate shaves 3 s off: 1 a day ≈ 29 s, 10 ≈ 21.6 s, 100 ≈ 12 s, 400 or more 6 s.
 * 0 (no commits) returns 0: the train does not run, it sleeps at the platform.
 */
export function trainDur(perDay) {
  const r = num0(perDay)
  if (!r) return 0
  return r1(clamp(32 - 3 * Math.log2(1 + r), 6, 30))
}

// ---------------------------------------------------------------- sprites

// `n` commit parcels on a wagon (4 × 3 each: a base, a light top, a dark tape mark), the bottom row of five filled
// first, left to right, then the top row (a dark row between, so each parcel reads on its own). Each layer is one
// dashed stroke over both rows, so a wagon of ten is three short paths.
function parcels(ctx, n) {
  const rows = [[5, Math.min(n, 5)], [1, Math.min(Math.max(0, n - 5), 5)]].filter(([, k]) => k > 0)
  if (!rows.length) return ''
  const d = (dy, dx) => rows.map(([y, k]) => `M${2 + dx} ${y + dy}h${k * 5 - 1 - dx}`).join('')
  // the load hops a pixel at each rail joint while the train runs (nothing when not animating)
  return `<g><path stroke="${BOX[0]}" stroke-width="3" stroke-dasharray="4 1" d="${d(1.5, 0)}"/>` +
    `<path stroke="${BOX[1]}" stroke-dasharray="4 1" d="${d(0.5, 0)}"/><path stroke="${BOX[2]}" stroke-dasharray="2 3" d="${d(1.5, 1)}"/>` +
    `${aT(ctx, '0 0;0 0;0 0;0 -1', 0.9)}</g>`
}
// A flat wagon (CAR_W × 12): an orange deck on two dark bogies, a stake at each end to hold the load.
const deck = () => [[0, 8, CAR_W, 1, CLAWD], [0, 9, CAR_W, 1, UNDER.shade], [0, 6, 1, 2, UNDER.shade], [CAR_W - 1, 6, 1, 2, UNDER.shade],
  [3, 10, 6, 1, UNDER.bogie], [CAR_W - 9, 10, 6, 1, UNDER.bogie], [3, 11, 2, 1, UNDER.wheel], [7, 11, 2, 1, UNDER.wheel],
  [CAR_W - 9, 11, 2, 1, UNDER.wheel], [CAR_W - 5, 11, 2, 1, UNDER.wheel]]

// The Clawd locomotive (LOCO_W × 12, facing right): Clawd's body stretched into a car, his arms out front and back as
// buffers, his four legs on little wheels, two cab windows behind his eyes (lit at night, sky glass by day) and a
// headlight that glints on the rails ahead at night. Asleep (no commits): eyes shut, no beam, windows dark.
function loco(ctx, asleep) {
  const lit = ctx.night && !asleep
  const win = lit ? UNDER.light : asleep ? '#2b2f36' : UNDER.glass
  const body = [[3, 0, 30, 1, CLAWD], [2, 1, 32, 7, CLAWD], [2, 8, 32, 1, UNDER.shade], [0, 5, 2, 2, CLAWD], [34, 5, 2, 2, CLAWD],
    [6, 2, 4, 3, win], [12, 2, 4, 3, win], ...(lit || asleep ? [] : [[6, 2, 4, 1, UNDER.glassHi], [12, 2, 4, 1, UNDER.glassHi]]),
    ...[5, 9, 26, 30].map((x) => [x, 9, 1, 2, CLAWD]), ...[4, 8, 25, 29].map((x) => [x, 11, 3, 1, UNDER.wheel]),
    [33, 7, 1, 1, lit ? UNDER.beam : '#e9c9a0']]
  const beam = lit ? [[34, 7, 2, 1, `${UNDER.beam}/.5`], [36, 7, 2, 1, `${UNDER.beam}/.2`], [36, 12, 8, 1, `${UNDER.light}/.7`], [44, 12, 10, 1, `${UNDER.light}/.35`],
    [54, 12, 12, 1, `${UNDER.light}/.15`]] : []
  const open = paint([[23, 2, 2, 3, CLAWD_EYE], [29, 2, 2, 3, CLAWD_EYE]])
  const shut = paint([[23, 4, 2, 1, CLAWD_EYE], [29, 4, 2, 1, CLAWD_EYE]])
  return paint([...body, ...beam]) + (asleep ? shut : blink(ctx, open, shut, 4.4, -1.3))
}

defineSprites({
  'st-loco': (c) => loco(c, false),
  'st-sleep': (c) => loco(c, true),
  'st-deck': () => paint(deck()),
  'st-car': (c) => use(c, 'st-deck') + parcels(c, CAR_LOAD),
  // the closed car for the commits that did not fit: one big parcel on a deck, `+N` painted on its side (drawn apart)
  'st-crate': (c) => use(c, 'st-deck') + paint([[0, 0, CAR_W, 8, BOX[0]], [0, 0, CAR_W, 1, BOX[1]], [0, 7, CAR_W, 1, BOX[2]], [1, 1, 1, 6, BOX[1]]]),
})

// ---------------------------------------------------------------- the train

/**
 * The commits train with its top at y (12 tall, the rails right under it): wagons of parcels behind the Clawd
 * locomotive, from `trainPlan(line.commits, maxCars(W))`. It crosses the tunnel left to right, one pass every
 * `trainDur(line.perDay)` seconds (SMIL, started mid-pass so the first frame shows it; the parcels hop at the rail
 * joints, Clawd blinks); parked mid-platform when ctx.animate is false; asleep there, eyes shut under floating z's, when there are no commits (right of `clearX`,
 * where the station sign ends, so the z's never cross it).
 */
export function metroTrain(ctx, y, line = commitsLine(ctx), clearX = 0) {
  const { W } = ctx
  const plan = trainPlan(line.commits, maxCars(W))
  if (!plan.cars) {
    // its z's rise from x + 26 up past the train's top: keep them right of the sign (clearX), the train in the tunnel
    const x = Math.min(W - LOCO_W - 4, Math.max(Math.round(W * 0.62 - LOCO_W / 2), clearX - 22))
    return `<g transform="translate(${x} ${y})">${use(ctx, 'st-sleep')}${use(ctx, 'zz', 26, -3)}</g>`
  }
  // back to front: the `+N` car (or the part-loaded wagon), then the full wagons, then the locomotive
  const cars = [...plan.loads].reverse()
  let s = ''
  let x = 0
  if (plan.plus) {
    const label = `+${plan.plus < 1e5 ? plan.plus : fmtInt(plan.plus)}`
    s += use(ctx, 'st-crate') + paint(pixRuns(label, Math.max(1, Math.round((CAR_W - pixWidth(label)) / 2)), 2, BOX_TEXT))
    x += PITCH
  }
  for (const n of cars) {
    if (n === CAR_LOAD) s += use(ctx, 'st-car', x)
    else s += `<g${x ? ` transform="translate(${x} 0)"` : ''}>${use(ctx, 'st-deck')}${parcels(ctx, n)}</g>`
    x += PITCH
  }
  s += paint(Array.from({ length: plan.cars }, (_, i) => [i * PITCH + CAR_W, 7, PITCH - CAR_W, 1, UNDER.rail])) + use(ctx, 'st-loco', x)
  const L = x + LOCO_W
  const dur = trainDur(line.perDay)
  if (!ctx.animate || !dur) return `<g transform="translate(${Math.round((W - L) / 2)} ${y})">${s}</g>`
  const from = -L - 24
  const to = W + 4
  return `<g transform="translate(0 ${y})"><g transform="translate(${from} 0)">${s}` +
    `<animateTransform attributeName="transform" type="translate" values="${from} 0;${to} 0" dur="${dur}s" begin="${r1(-dur * 0.42)}s" repeatCount="indefinite"/></g></g>`
}

// ---------------------------------------------------------------- the street and the station

// Bedrock pebbles between y and y + h (at most 60), seeded by `key` so every drawing of the same size has the same rock.
function pebbles(W, y, h, key) {
  const out = []
  if (h < 1) return out
  for (let i = 0; i < Math.min(60, Math.floor(W / 9)); i++) {
    const s = fnv1a(`${key}-${i}`)
    out.push([1 + (s % (W - 4)), y + ((s >>> 9) % h), 2, 1, s & 1 ? UNDER.pebble : UNDER.pebbleD])
  }
  return out
}

// A repeated 1-px mark along a row (lane marks, sleepers, wall tiles, pebbles, a ragged edge): one dashed stroke
// instead of a rect per mark.
const dashes = (x0, x1, y, color, on, off) => `<path stroke="${color}" stroke-dasharray="${on} ${off}" d="M${x0} ${y + 0.5}H${x1}"/>`
// Pebbles in a thin soil band (rows y and y + 1): two uneven dash patterns (periods 92 and 85 px) offset from each
// other, so the scatter never visibly repeats, at the cost of two paths whatever the width.
const grit = (W, y, at) => dashes(at, W, y, UNDER.pebble, 2, '37 2 21 2 28') + dashes(at + 17, W, y + 1, UNDER.pebbleD, 2, '19 2 33 2 25')

/**
 * The station sign hanging from the tunnel roof at (x, y): a navy plate with the line's roundel (Clawd's orange ring,
 * a cream bar) and `COMMITS LINE · 484 commits this week · ~69 a day`, groups dropped from the right to fit maxW.
 * Returns { svg, w }.
 */
function stationSign(ctx, x, y, line, maxW) {
  const n = line.commits
  const groups = n
    ? [['COMMITS LINE', UNDER.cream], [`${n} commit${n === 1 ? '' : 's'} ${line.label}`.trim(), ROLE.ship],
        ...(line.days > 1 ? [[`~${line.perDay >= 10 ? Math.round(line.perDay) : r1(line.perDay)} a day`, K.groupText]] : [])]
    : line.counting ? [['COMMITS LINE', UNDER.cream], [`${`counting commits ${line.label}`.trim()}…`, ROLE.dim]]
      : [['COMMITS LINE', UNDER.cream], [`no commits ${line.label}`.trim(), ROLE.dim], ['the train sleeps', ROLE.dim]]
  // the quiet live building's (ctx.quiet): the line's name alone, what it hauls in the tunnel's tooltip
  const kept = fitGroups(ctx.quiet ? groups.slice(0, 1) : groups, maxW - 17, 5)
  const tw = kept.reduce((a, g, i) => a + textW(g[0], 5) + (i ? textW(' · ', 5) : 0), 0)
  const w = Math.round(tw + 16)
  const ring = [[2, 0, 3, 1], [1, 1, 1, 1], [5, 1, 1, 1], [0, 2, 1, 1], [6, 2, 1, 1], [0, 4, 1, 1], [6, 4, 1, 1], [1, 5, 1, 1], [5, 5, 1, 1], [2, 6, 3, 1]]
  const plate = paint([[x + 3, y - 2, 1, 2, UNDER.rail], [x + w - 4, y - 2, 1, 2, UNDER.rail], [x, y, w, 9, UNDER.sign], [x, y, w, 1, UNDER.signHi],
    [x, y + 9, w, 1, '#000/.45'], ...ring.map(([rx, ry, rw, rh]) => [x + 2 + rx, y + 1 + ry, rw, rh, CLAWD]), [x + 2, y + 4, 7, 1, UNDER.cream]])
  const body = kept.map(([t, f], i) => (i ? `<tspan fill="${ROLE.dim}"> · </tspan>` : '') +
    `<tspan fill="${f}"${i ? '' : ' font-weight="bold"'}>${esc(t)}</tspan>`).join('')
  return { svg: plate + (kept.length ? `<text x="${x + 12}" y="${y + 7}" font-size="5">${body}</text>` : ''), w }
}

/**
 * The commits line under the building, from y0, SUBWAY_H tall: the road with its lane marks (the scene above ends on
 * its sidewalk), a band of soil, then the tunnel: lamps on its roof (glowing at night), a wall stripe in the line's color, the station sign
 * (`COMMITS LINE · 484 commits this week`), the commits train on its rails (metroTrain), a tooltip saying the numbers
 * and the rules, and soil under the tunnel floor (a ragged cut edge when ctx.transparent, so the cross-section ends
 * on the page instead of in a box). `line` defaults to commitsLine(ctx); pass one to haul another range.
 * `road: false` leaves the road out (SUBWAY_DEEP_H tall, a band of soil on top instead): the line under a building
 * that goes on underground, whose street is up at its lobby (the Office's basement).
 * Marks ctx.subway, so a street() drawn under it is only bedrock. Returns { svg, h, alt, gist }.
 */
export function subway(ctx, y0, line = commitsLine(ctx), { road = true } = {}) {
  const { W, night } = ctx
  const ln = {
    commits: Math.floor(num0(line?.commits)), perDay: num0(line?.perDay), label: String(line?.label ?? ''), days: Math.max(1, Math.floor(num0(line?.days)) || 1),
    counting: line?.counting === true,
  }
  ctx.subway = true
  // the road (curb, gutter, asphalt with its lane marks) right under the scene's own sidewalk, soil, the tunnel's inside
  // (28 tall: roof lamps, the sign, the train with its top at T + 13, rails at T + 25), soil under its floor; without
  // the road, six rows of soil over the tunnel
  const T = y0 + (road ? 19 : 8)
  const low = T + 30
  const top = road
    ? [[0, y0, W, 1, K.walkD], [0, y0 + 1, W, 1, UNDER.gutter], [0, y0 + 2, W, 10, UNDER.road], [0, y0 + 12, W, 1, UNDER.roadEdge], [0, y0 + 13, W, 4, UNDER.soil]]
    : [[0, y0, W, T - 2 - y0, UNDER.soil]]
  const rects = [
    ...top, [0, T - 2, W, 2, UNDER.tunnelRim], [0, T, W, 28, UNDER.tunnel], [0, T, W, 12, UNDER.wall],
    [0, T + 12, W, 1, `${CLAWD}/.45`], [0, T + 26, W, 2, UNDER.ballast], [0, T + 25, W, 1, UNDER.rail], [0, T + 28, W, 2, UNDER.tunnelRim],
    [0, low, W, ctx.transparent ? 2 : 4, UNDER.soil],
  ]
  // the roof lamps, clear of the sign, every 52 px (8 at most on a wide pane); a warm halo around each at night
  const sign = stationSign(ctx, 6, T + 2, ln, W - 12)
  const lamp0 = 6 + sign.w + 18
  const step = Math.max(52, Math.ceil((W - lamp0) / 8))
  for (let x = lamp0; x + 5 < W; x += step) {
    rects.push([x, T, 5, 1, UNDER.bogie], [x + 1, T + 1, 3, 1, UNDER.light])
    if (night) rects.push([x - 1, T + 1, 7, 2, `${UNDER.light}/.16`], [x - 2, T + 3, 9, 3, `${UNDER.light}/.05`])
  }
  // the soil's last two rows: flat on the ground behind the drawing, a ragged cut edge when there is none (two rows of
  // uneven dashes whose periods, 33 and 37 px, never line up, so the edge never visibly repeats)
  const cut = ctx.transparent ? dashes(0, W, low + 2, UNDER.soil, '6 1 3 1 9 2 4 1 5', 1) + dashes(0, W, low + 3, UNDER.soil, '2 5 4 7 1 9 3', 6) : ''
  const street = road ? grit(W, y0 + 14, 5) + dashes(4, W, y0 + 7, UNDER.lane, 8, 10) : grit(W, y0 + 2, 5)
  const body = paint(rects) + cut + street + grit(W, low, 31) + dashes(1, W, T + 26, UNDER.sleeper, 3, 3) +
    dashes(2, W, T + 11, '#1d1a17', 1, 7) + sign.svg
  const what = ln.commits ? `${ln.commits} commit${ln.commits === 1 ? '' : 's'} ${ln.label}`.trim() : ln.counting ? `${`commits ${ln.label}`.trim()}, being counted` : `no commits ${ln.label}`.trim()
  const dur = trainDur(ln.perDay)
  const rate = ln.days > 1 && ln.commits ? `, about ${ln.perDay >= 10 ? Math.round(ln.perDay) : r1(ln.perDay)} a day` : ''
  const how = ln.commits
    ? `. One green parcel is one commit, a wagon carries ${CAR_LOAD}${trainPlan(ln.commits, maxCars(W)).plus ? ', the closed car the rest' : ''}; ` +
      `the more commits a day, the faster it runs: one pass every ${dur} s.`
    : '. The train sleeps at the platform until the next commit.'
  const range = ln.days > 1 && ctx.f?.range?.label ? ` (${ctx.f.range.label})` : ''
  const tip = `Commits line: ${what}${range}${rate}${how}`
  const svg = body + metroTrain(ctx, T + 13, ln, 6 + sign.w) + hitArea(0, T, W, 28, tip)
  const gist = `commits line: ${what}`
  return { svg, h: road ? SUBWAY_H : SUBWAY_DEEP_H, alt: `The Office ${gist}`, gist }
}

/**
 * Bedrock from y0, h tall: dark rock and pebbles all the way down, under the commits line when the pane is taller
 * than the drawing. It is backdrop: nothing when ctx.transparent, so the cross-section ends on the page.
 */
export function underground(ctx, y0, h) {
  if (!(h > 0)) return ''
  return backdrop(ctx, [[0, y0, ctx.W, h, UNDER.rock], ...pebbles(ctx.W, y0 + 1, Math.max(1, h - 2), `st-rock-${Math.round(h)}`)])
}

/**
 * The filler under a drawing that stops above the bottom of the pane, from y0, h tall. Under the commits line
 * (ctx.subway, set by subway()) it is only bedrock (underground). Without one yet, it draws the commits line itself
 * when h leaves room for it (then bedrock below), else the road and soil, so a pane is always covered
 * top to bottom. Returns markup (no height: it fills exactly h).
 */
export function street(ctx, y0, h) {
  if (!(h > 0)) return ''
  if (ctx.subway) return underground(ctx, y0, h)
  if (h >= SUBWAY_H) return subway(ctx, y0).svg + underground(ctx, y0 + SUBWAY_H, h - SUBWAY_H)
  const { W } = ctx
  const rects = [[0, y0, W, h, UNDER.soil]]
  if (h >= 13) rects.push([0, y0, W, 1, K.walkD], [0, y0 + 1, W, 1, UNDER.gutter], [0, y0 + 2, W, 10, UNDER.road], [0, y0 + 12, W, 1, UNDER.roadEdge])
  return paint(rects) + (h >= 13 ? dashes(4, W, y0 + 7, UNDER.lane, 8, 10) + (h >= 16 ? grit(W, y0 + 14, 5) : '') : '')
}
