// The sky behind the building, as the promo's trailer paints it (promo/finale.mjs): the plugin's own sky re-banded evenly
// over the window, its stars in three tiers, a skyline on the horizon, and the neighbours standing either side of the
// tower; drawn on the page's grid (P = 2 CSS px per art pixel). The page fixes the sky behind the tower, so the building
// scrolls past it: the zenith at the top of the window, the horizon at its foot. promo/site.mjs draws the trailer's
// opening sky with these too.
import { PALETTE as K, SKIES } from './data.js'
import { mix } from './art.js'

const P = 2
const svg = (w, h, body, s = P, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * s}" height="${h * s}" shape-rendering="crispEdges" aria-hidden="true" focusable="false"${attrs}>${body}</svg>`

// a seeded random, so the city is the same city on every visit
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
// a 2-D grid of colors (null = clear) → rects [x, y, w, h, color]: runs along a row, merged down while the run repeats
function gridRects(px, ox = 0, oy = 0) {
  const out = []
  let open = new Map()
  px.forEach((row, y) => {
    const next = new Map()
    let x = 0
    while (x < row.length) {
      const c = row[x]
      if (!c) { x++; continue }
      let e = x + 1
      while (e < row.length && row[e] === c) e++
      const k = `${x}:${e}:${c}`
      const prev = open.get(k)
      if (prev) { prev[3]++; next.set(k, prev) } else { const r = [x + ox, y + oy, e - x, 1, c]; out.push(r); next.set(k, r) }
      x = e
    }
    open = next
  })
  return out
}
// rects → one <path> per color, in first-use order
function paint(rects) {
  const by = new Map()
  for (const [x, y, w, h, c] of rects) if (w > 0 && h > 0) by.set(c, (by.get(c) ?? '') + `M${x} ${y}h${w}v${h}h${-w}z`)
  let s = ''
  for (const [c, d] of by) s += `<path fill="${c}" d="${d}"/>`
  return s
}
// The plugin's light phases (data.js SKIES, lib/svg-kit.mjs), under the page's day/night switch. The sample's morning
// office has dawn light; keeping its sky and clouds in that same light also keeps the room windows from reading noon.
// FALLBACK when a release has no SKIES.
const FALLBACK = {
  night: ['#04071a', '#0a1130', '#131b40', '#1b2250', '#2c275a', '#46305f', '#6a3d5e'],
  twilight: ['#0b1236', '#28306a', '#3a3878', '#5d4282', '#9a587e', '#e08a63'],
  dawn: ['#3a5ea8', '#8193cc', '#b4a2d2', '#e3b0c6', '#f6c4a8', '#fde0a2'],
  day: ['#3e86d6', '#7db6e8', '#a2cff2', '#c8e4f6', '#eaf2ee'],
  dusk: ['#232c6c', '#6b4d93', '#b05f8a', '#e3786d', '#f6a25c', '#ffd56e'],
}
const colorsOf = (sky) => {
  const s = SKIES?.[sky]
  return s?.head && s?.fall ? [...s.head, ...s.fall].map(([, c]) => c) : (FALLBACK[sky] ?? FALLBACK.night)
}

/** The plugin's skyPhase rules, keeping the page's existing binary day/night choice. */
export function lightPhase(sky, hour) {
  const h = Number(hour), at = Number.isFinite(h) ? h : 12
  if (sky === 'night') return at === 20 || at === 6 ? 'twilight' : 'night'
  return at < 9 ? 'dawn' : at >= 17 ? 'dusk' : 'day'
}
// a band's rows, as the trailer's
const STEP = 30
// The plugin brings most of the ramp into the sky over the roof, so dawn and dusk show their warmth there too.
const OVER_ROOF = 0.62
/**
 * The sky in bands, on the trailer's pixel grid with the plugin's current light ramp: OVER_ROOF of its colors over
 * the roof, the rest down to the horizon `rows` art pixels under the zenith. Bands STEP rows tall, laid from the
 * horizon up (the one on it whole), each the ramp's color at its middle. → [[color, rows], …], top down.
 */
export function skyBands(sky, rows = 450, roofRows = Math.min(180, rows)) {
  const colors = colorsOf(sky)
  const stops = [mix(colors[0], '#000000', 0.25), ...colors]
  const colorAt = (y) => {
    const at = y <= roofRows ? (y / roofRows) * OVER_ROOF : OVER_ROOF + (1 - OVER_ROOF) * ((y - roofRows) / Math.max(1, rows - roofRows))
    const p = Math.max(0, Math.min(1, at)) * (stops.length - 1)
    const i = Math.min(stops.length - 2, Math.floor(p))
    return mix(stops[i], stops[i + 1], p - i)
  }
  const edges = [rows]
  while (edges[0] > 0) edges.unshift(Math.max(0, edges[0] - STEP))
  // a sliver at the top joins the band under it, so every seam has its rows
  if (edges.length > 2 && edges[1] < 8) edges.splice(1, 1)
  return edges.slice(1).map((e, k) => [colorAt((edges[k] + e) / 2), e - edges[k]])
}

// the city: two layers of silhouettes, the far one lighter (the glow behind it), the near one dark, with its windows
export const CITY = {
  night: {
    far: ['#33264f', '#2e2249'], farEdge: '#40305f', farLit: ['#d49a5c', '#f0c070', '#c47f4f'],
    near: ['#161228', '#19142e', '#130f23'], edge: '#241d3d', cope: '#2e2648', win: '#211b38', winHi: null, alley: '#0b0915',
    lit: [['#f2c46a', 58], ['#ffe08f', 12], ['#e39a4a', 16], ['#7fd6e8', 8], ['#e08fc0', 6]],
    prop: '#1d1834', propHi: '#2e2648', propDk: '#0f0c1c', beacon: '#ff5a4a', sign: ['#ff7aa8', '#55e0c8', '#ffcf2e'],
  },
  day: {
    far: ['#a9c0d9', '#b0c6dd'], farEdge: '#bfd2e6', farLit: null,
    near: ['#a3a7b7', '#9ea2b3', '#a8acbb'], edge: '#b5b9c7', cope: '#bec2ce', win: '#8a8fa2', winHi: '#bdc3d0', alley: '#8c8fa0',
    lit: null,
    prop: '#979bac', propHi: '#b3b7c4', propDk: '#7f8396', beacon: '#9a4a40', sign: ['#c58aa0', '#7fa9a0', '#c9a75a'],
  },
}

// the bands as a tile: hard bands, top first, each seam dithered two rows each side (the trailer's): the lower color a
// quarter then half into the band over it, the upper half then a quarter into the one under
export function bandTile(bands, W = 4) {
  const px = []
  for (const [c, h] of bands) for (let i = 0; i < h; i++) px.push(Array(W).fill(c))
  let y = 0
  for (let i = 0; i < bands.length - 1; i++) {
    y += bands[i][1]
    const [up, lo] = [bands[i][0], bands[i + 1][0]]
    for (let x = 0; x < W; x++) {
      if (x % 4 === 0 && y >= 2) px[y - 2][x] = lo
      if (x % 2 === 1) px[y - 1][x] = lo
      if (x % 2 === 0) px[y][x] = up
      if (x % 4 === 2 && px[y + 1]) px[y + 1][x] = up
    }
  }
  return svg(W, px.length, paint(gridRects(px)))
}

// window grids [w, h, step x, step y]
const WIN = [[2, 3, 4, 5], [2, 2, 4, 4], [1, 2, 3, 4], [2, 3, 5, 6], [1, 1, 3, 3], [3, 2, 5, 4], [2, 2, 3, 4]]
const HA = 64 // the near skyline's rows above the horizon
const HF = 88 // the far skyline's

export function layoutCity(W) {
  const r = rng(2024)
  const far = [], near = []
  for (let x = -(r() * 6 | 0); x < W;) {
    const w = 8 + (r() * 22 | 0), h = 24 + (r() * 50 | 0)
    far.push({ x, w, h, set: r() < 0.35 ? 2 + (r() * 3 | 0) : 0, mast: r() < 0.3 ? 4 + (r() * 8 | 0) : 0, seed: r() * 1e9 | 0, tone: r() * 2 | 0 })
    x += w - (r() < 0.5 ? 2 : 0)
  }
  for (let x = -(r() * 10 | 0); x < W;) {
    const tower = r() < 0.22
    const w = tower ? 12 + (r() * 8 | 0) : 20 + (r() * 30 | 0)
    const rise = tower ? 32 + (r() * 14 | 0) : 10 + (r() * 26 | 0)
    const roofs = tower ? ['antenna', 'spire', 'setback', 'antenna'] : ['water', 'ac', 'stair', 'sign', 'antenna', 'none', 'water', 'ac']
    near.push({ x, w, rise, win: WIN[r() * WIN.length | 0], roof: roofs[r() * roofs.length | 0], tone: r() * 3 | 0, seed: r() * 1e9 | 0 })
    x += w + (r() < 0.28 ? 2 + (r() * 3 | 0) : 0)
  }
  return { far, near }
}
// where a near building's windows sit: its grid, centered, 2 in from each side, 3 under its roof
function grid(b) {
  const [ww, wh, sx, sy] = b.win
  const cols = Math.floor((b.w - 4 + (sx - ww)) / sx)
  const used = cols * sx - (sx - ww)
  return { ww, wh, sx, sy, cols, used, gx: b.x + Math.floor((b.w - used) / 2), gy: HA - b.rise + 3 }
}
const pickLit = (r, lit) => {
  let n = r() * 100
  for (const [c, p] of lit) if ((n -= p) < 0) return c
  return lit[0][0]
}

// the far skyline: silhouettes lit along their left edge, a few tiny windows, masts with a blinking beacon
export function farSvg(city, W, sky) {
  const c = CITY[sky], rects = [], blink = []
  for (const b of city.far) {
    const top = HF - b.h, r = rng(b.seed)
    rects.push([b.x, top, b.w, b.h, c.far[b.tone]], [b.x, top, 1, b.h, c.farEdge])
    if (b.set) rects.push([b.x + b.set, top - 4, b.w - 2 * b.set, 4, c.far[b.tone]], [b.x + b.set, top - 4, 1, 4, c.farEdge])
    if (b.mast) {
      const mx = b.x + (b.w >> 1), my = top - (b.set ? 4 : 0) - b.mast
      rects.push([mx, my, 1, b.mast, c.far[b.tone]])
      if (sky === 'night') blink.push([mx, my - 1, 1, 1, c.beacon ?? CITY.night.beacon])
    }
    if (c.farLit) for (let y = top + 3; y < HF - 1; y += 3) for (let x = b.x + 2; x < b.x + b.w - 2; x += 3) if (r() < 0.09) rects.push([x, y, 1, 1, c.farLit[r() * 3 | 0]])
  }
  return svg(W, HF, paint(rects) + blink.map((b, i) => `<g class="blink" style="--dl:${-i * 0.7}s">${paint([b])}</g>`).join(''))
}

// a near roof's prop, standing on its roof at (b.x, top): its rects, and the lights that blink or glow
function roofProp(b, top, c, night, out, lights) {
  const cx = b.x + (b.w >> 1)
  const light = (rects, kind = '') => lights.push([rects, kind])
  switch (b.roof) {
    case 'water': { // the water tower: a tank with two hoops on three legs, a cone on top
      const x = b.x + 3 + ((b.w - 14) > 0 ? (b.seed % (b.w - 14)) : 0)
      out.push([x + 1, top - 12, 7, 1, c.prop], [x, top - 11, 9, 7, c.prop], [x, top - 11, 1, 7, c.propHi], [x, top - 9, 9, 1, c.propDk], [x, top - 6, 9, 1, c.propDk],
        [x + 3, top - 13, 3, 1, c.prop], [x + 1, top - 4, 1, 4, c.propDk], [x + 4, top - 4, 1, 4, c.propDk], [x + 7, top - 4, 1, 4, c.propDk], [x, top - 2, 9, 1, c.propDk])
      break
    }
    case 'ac': { // two AC units, fans dark
      const x = b.x + 2
      out.push([x, top - 3, 6, 3, c.prop], [x, top - 3, 6, 1, c.propHi], [x + 2, top - 2, 2, 1, c.propDk])
      if (b.w > 16) out.push([x + 8, top - 3, 6, 3, c.prop], [x + 8, top - 3, 6, 1, c.propHi], [x + 10, top - 2, 2, 1, c.propDk])
      break
    }
    case 'stair': { // the stair bulkhead and its door
      const x = b.x + b.w - 10
      out.push([x, top - 6, 7, 6, c.prop], [x, top - 6, 7, 1, c.propHi], [x, top - 6, 1, 6, c.propHi], [x + 2, top - 4, 3, 4, c.propDk])
      if (night) light([[x + 3, top - 5, 1, 1, '#f2c46a']])
      break
    }
    case 'sign': { // a little rooftop sign on legs, its neon bar lit at night
      const w = Math.min(14, b.w - 4), x = b.x + ((b.w - w) >> 1), col = c.sign[b.seed % 3]
      out.push([x, top - 9, w, 6, c.propDk], [x + 2, top - 3, 1, 3, c.propDk], [x + w - 3, top - 3, 1, 3, c.propDk])
      if (night) light([[x + 1, top - 8, w - 2, 4, mix(c.propDk, col, 0.25)], [x + 2, top - 7, w - 4, 2, col]])
      else out.push([x + 2, top - 7, w - 4, 2, col])
      break
    }
    case 'antenna': { // a mast with two crossbars and a red beacon
      const h = 9 + (b.seed % 6)
      out.push([cx, top - h, 1, h, c.propHi], [cx - 2, top - h + 3, 5, 1, c.prop], [cx - 1, top - h + 6, 3, 1, c.prop])
      light([[cx, top - h - 1, 1, 1, c.beacon]], night ? 'blink' : '')
      break
    }
    case 'spire': { // a stepped crown and its needle
      out.push([b.x + 3, top - 3, b.w - 6, 3, b.tone ? c.near[1] : c.near[0]], [b.x + 3, top - 3, 1, 3, c.edge], [b.x + 5, top - 6, b.w - 10, 3, c.near[0]],
        [b.x + 5, top - 6, 1, 3, c.edge], [cx, top - 13, 1, 7, c.propHi])
      light([[cx, top - 14, 1, 1, c.beacon]], night ? 'blink' : '')
      break
    }
    case 'setback': {
      out.push([b.x + 2, top - 5, b.w - 4, 5, c.near[b.tone]], [b.x + 2, top - 5, 1, 5, c.edge], [b.x + 2, top - 5, b.w - 4, 1, c.cope],
        [b.x + 4, top - 9, b.w - 8, 4, c.near[b.tone]], [b.x + 4, top - 9, 1, 4, c.edge], [b.x + 4, top - 9, b.w - 8, 1, c.cope])
      break
    }
  }
}

// the near skyline over the horizon: roofs and props, each building's windows (a pattern), the lit ones and a few that
// go out and back on (the page's neighbours stand there now; promo/site.mjs still draws it)
export function nearSvg(city, W, sky) {
  const c = CITY[sky], night = sky === 'night'
  const body = [], props = [], lights = [], lit = [], twinkles = []
  let pats = ''
  city.near.forEach((b, i) => {
    const top = HA - b.rise, g = grid(b), r = rng(b.seed)
    body.push([b.x, top, b.w, b.rise, c.near[b.tone]], [b.x, top + 1, 1, b.rise - 1, c.edge], [b.x, top, b.w, 1, c.cope])
    roofProp(b, top, c, night, props, lights)
    if (g.cols < 1) return
    const id = `nw${sky[0]}${i}`
    pats += `<pattern id="${id}" x="${g.gx}" y="${g.gy}" width="${g.sx}" height="${g.sy}" patternUnits="userSpaceOnUse">` +
      paint([[0, 0, g.ww, g.wh, c.win], ...(c.winHi ? [[0, 0, 1, 1, c.winHi]] : [])]) + '</pattern>'
    body.push([g.gx, g.gy, g.used, HA - g.gy, `url(#${id})`])
    if (!c.lit) return
    for (let y = g.gy; y < HA; y += g.sy) for (let k = 0; k < g.cols; k++) {
      if (r() > 0.3) continue
      const w = [g.gx + k * g.sx, y, g.ww, Math.min(g.wh, HA - y), pickLit(r, c.lit)]
      if (r() < 0.12 && twinkles.length < 18) twinkles.push(w)
      else lit.push(w)
    }
  })
  // url(#id) fills go through paint() as plain fills: split them out
  const plain = body.filter((b) => !b[4].startsWith('url')), patterned = body.filter((b) => b[4].startsWith('url'))
  const drawn = paint(plain) + patterned.map(([x, y, w, h, f]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"/>`).join('')
  const glow = lights.map(([rs, kind], i) => (kind ? `<g class="${kind}" style="--dl:${-(i * 0.53) % 2}s">${paint(rs)}</g>` : paint(rs))).join('')
  const tw = twinkles.map((w, i) => `<g class="tw" style="--t:${5 + (i * 1.7) % 8}s;--dl:${-(i * 2.3) % 9}s">${paint([w])}</g>`).join('')
  return svg(W, HA, `<defs>${pats}</defs>${drawn}${paint(props)}${paint(lit)}${tw}${glow}`)
}

// the stars, the trailer's three tiers: dim ones, white ones and a few in a plus that twinkle, scattered once over the
// whole sky, fewer as it warms toward the horizon
export function starsSvg(W, H) {
  const r = rng(99)
  const pick = (n) => {
    const out = []
    for (let i = 0; i < n * 4 && out.length < n; i++) {
      const x = r() * W | 0, y = r() * H | 0
      if (r() >= (y / H) * 0.85) out.push([x, y])
    }
    return out
  }
  const dim = pick(Math.round((W * H) / 1400)), white = pick(Math.round((W * H) / 4600)), plus = pick(Math.min(16, Math.round((W * H) / 20000)))
  const tw = plus.map(([x, y], i) => `<g class="twk" style="--t:${(2.4 + (i % 5) * 0.6).toFixed(1)}s;--dl:${(-i * 0.7).toFixed(1)}s">` +
    `<path fill="#ffffff" fill-opacity=".5" d="M${x - 1} ${y}h3v1h-3zM${x} ${y - 1}h1v3h-1z"/><path fill="#ffffff" d="M${x} ${y}h1v1h-1z"/></g>`)
  return svg(W, H, paint([...dim.map(([x, y]) => [x, y, 1, 1, '#6f86c9']), ...white.map(([x, y]) => [x, y, 1, 1, K.star])]) + tw.join(''))
}

// ---------------------------------------------------------------- the neighbours

// their walls in each light, the trailer's (promo/finale.mjs WALLS): three tones of wall for the buildings in a row, a
// lit cap, the windows (dark glass, by day a glint of the sky in its corner), lit by night in warm lamplight (a few
// going out and back on); the shops at the street, their display windows lit by night, their awnings and signs
export const WALLS = {
  night: {
    wall: ['#141834', '#181c3c', '#11142e'], cap: '#1e2446', win: '#0e1126', lit: [['#f3cf73', 70], ['#e8b25e', 20], ['#ffe6a8', 10]],
    shop: '#d8a958', shopHi: '#f0c878', canvas: '#8f8470',
  },
  day: { wall: ['#8b97b1', '#96a2ba', '#818da8'], cap: '#adb8cd', win: '#55678a', glint: '#a9bddb', shop: '#46577a', shopHi: '#8fa6c8', canvas: '#ece2cd' },
}
// what stands on their roofs, by turns (the skyline's props: roofProp)
const ROOF_PROPS = ['water', 'antenna', 'ac', 'stair', 'water', 'none', 'ac']
// a shop at the street, 16 rows: a fascia with its sign, the display window in panes over a sill, the door; an awning
// over every other one, striped in its sign's color
const SHOP = 16
const SIGNS = ['#b8513a', '#3f8f86', '#c9a23a', '#7a5aa8']
/** A neighbour's shop at the street (its foot at row `h`), x0 to x0 + bw, into `out` (rects): see SHOP. */
function shop(x0, bw, h, wall, sign, awning, c, night, out) {
  const y = h - SHOP, frame = mix(wall, '#000000', 0.5)
  const sx = x0 + 5, sw = bw - 20, wy = y + 5, wh = SHOP - 7, dx = sx + sw + 3
  out.push([x0 + 1, y, bw - 2, 4, frame], [x0 + 6, y + 1, Math.min(24, sw - 6), 2, night ? mix(sign, '#ffffff', 0.3) : sign])
  // the display window, its panes 9 wide, its top row lit (the light inside by night, the sky's by day), its sill
  out.push([sx, wy, sw, wh, c.shop], [sx, wy, sw, 1, c.shopHi], [sx - 1, wy + wh, sw + 2, 1, mix(wall, '#ffffff', 0.2)])
  for (let x = sx + 9; x < sx + sw - 2; x += 9) out.push([x, wy, 1, wh, frame])
  if (!night) for (let x = sx + 2; x < sx + sw - 4; x += 9) out.push([x, wy + 2, 1, 1, c.shopHi], [x + 1, wy + 3, 1, 1, c.shopHi])
  // the door, its transom lit by night
  out.push([dx, y + 4, 7, SHOP - 4, frame], [dx + 1, y + 6, 5, SHOP - 6, mix(c.shop, '#000000', night ? 0.45 : 0.2)], [dx + 1, y + 5, 5, 1, c.shopHi])
  // the awning over the window: stripes 2 wide, a scalloped edge
  if (awning) for (let x = sx - 1; x < sx + sw + 1; x++) {
    const stripe = (x - sx) % 4 < 2 ? (night ? mix(sign, '#000000', 0.35) : sign) : c.canvas
    out.push([x, y + 4, 1, 3, stripe])
    if ((x - sx) % 2 === 0) out.push([x, y + 7, 1, 1, stripe])
  }
  out.push([x0 + 1, h - 1, bw - 2, 1, mix(wall, '#000000', 0.4)])
}
/**
 * The neighbours on one side of the tower, a box `w` × `h` art pixels whose foot is the street: buildings in a row from
 * the tower's side (`side` 'l': the tower is at the box's right) outward, the first `first` rows tall, the others taller
 * or lower by turns. Each is a wall in its tone, a lit cap and a shade under it, a prop on its roof, windows 5 × 7 on a
 * grid 9 × 13 with a sill each (by night a few lit, some of those going out and back on), a shop at the street. Unlit
 * windows are a pattern, so a tall row costs the same as a short one.
 */
export function neighboursSvg(w, h, side, sky, first) {
  const c = WALLS[sky], night = sky === 'night', r = rng(side === 'l' ? 31 : 47)
  const shapes = [], defs = [], lit = [], blink = [], props = [], lights = []
  let edge = 0, k = 0
  while (edge < w) {
    const bw = k === 0 ? 92 + (r() * 16 | 0) : 56 + (r() * 44 | 0)
    const bh = Math.min(h - 16, k === 0 ? first : Math.round(first * (k % 2 ? 1.18 + r() * 0.2 : 0.72 + r() * 0.16)))
    const x0 = side === 'l' ? w - edge - bw : edge, top = h - bh, wall = c.wall[k % 3], shade = mix(wall, '#000000', 0.25)
    // the cornice: a lit edge, the cap, its dentils over a row of shade
    shapes.push([x0, top, bw, bh, wall], [x0, top, bw, 1, mix(c.cap, '#ffffff', 0.18)], [x0, top + 1, bw, 1, c.cap], [x0, top + 2, bw, 2, shade])
    for (let x = x0 + 1; x < x0 + bw - 1; x += 2) shapes.push([x, top + 2, 1, 1, mix(c.cap, shade, 0.3)])
    // the edge away from the tower in shade
    shapes.push([side === 'l' ? x0 : x0 + bw - 1, top + 4, 1, bh - 4, mix(wall, '#000000', 0.3)])
    roofProp({ x: x0, w: bw, seed: r() * 1e9 | 0, roof: ROOF_PROPS[(k * 2 + (side === 'l' ? 1 : 0)) % ROOF_PROPS.length], tone: 0 }, top, CITY[sky], night, props, lights)
    shop(x0, bw, h, wall, SIGNS[(k + (side === 'l' ? 0 : 2)) % SIGNS.length], k % 2 === 0, c, night, shapes)
    // the windows: centered in the wall, from 9 under the roof to over the shop
    const cols = Math.floor((bw - 8 + 4) / 9), rows = Math.floor((bh - 9 - SHOP - 6 + 5) / 13)
    if (cols > 0 && rows > 0) {
      const gx = x0 + Math.floor((bw - (cols * 9 - 4)) / 2), gy = top + 9, id = `nb${side}${sky[0]}${k}`
      defs.push(`<pattern id="${id}" x="${gx}" y="${gy}" width="9" height="13" patternUnits="userSpaceOnUse">` +
        paint([[0, 0, 5, 7, c.win], ...(c.glint ? [[0, 0, 1, 1, c.glint], [1, 1, 1, 1, c.glint]] : []), [0, 7, 5, 1, mix(wall, '#ffffff', 0.12)]]) + '</pattern>')
      shapes.push([gx, gy, cols * 9 - 4, rows * 13 - 5, `url(#${id})`])
      if (night) for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        if (r() > 0.22) continue
        const win = [gx + i * 9, gy + j * 13, 5, 7, pickLit(r, c.lit)]
        if (r() < 0.14 && blink.length < 24) blink.push(win)
        else lit.push(win)
      }
    }
    edge += bw
    k++
  }
  // the walls side by side, then the windows over them (url(#id) fills go through as rects), the props on the roofs
  const walls = paint(shapes.filter((s) => !s[4].startsWith('url')))
  const windows = shapes.filter((s) => s[4].startsWith('url')).map(([x, y, ww, hh, f]) => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${f}"/>`).join('')
  const tw = blink.map((b, i) => `<g class="tw" style="--t:${7 + (i * 1.9) % 9}s;--dl:${-(i * 2.7) % 11}s">${paint([b])}</g>`).join('')
  const glow = lights.map(([rs, kind], i) => (kind ? `<g class="${kind}" style="--dl:${-(i * 0.53) % 2}s">${paint(rs)}</g>` : paint(rs))).join('')
  return svg(w, h, `<defs>${defs.join('')}</defs>${walls}${windows}${paint(lit)}${tw}${paint(props)}${glow}`)
}
