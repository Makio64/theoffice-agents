// The story's end screen, dressed (promo/scenes.mjs lapseEnd): the week's timelapse as the plugin draws it, and round
// it what a frame wider and taller than the building wants, in the drawing's own art pixels and on its own clock (the
// replay's loop, so everything turns with the light the replay turns). An independent review of the bare one found the
// sky empty, the sides two flat stripes and the street floating over nothing; so:
// - the sky re-banded over the whole frame, evenly, its colors stretched so each band steps as little as the next,
//   each seam dithered two rows each side;
// - clouds of five shapes in two layers, the near ones twice as fast (a timelapse's clouds race), tinted for the light,
//   passing in front of the sun;
// - three tiers of stars, a few twinkling, a shooting star and a plane by night, a flock of birds by day, all low enough
//   to clear Instagram's header;
// - the sun and the moon bigger and haloed, arcing over the sign from between the roof's props instead of out of them,
//   the sun orange when low, a glow behind the props it rises or sets by;
// - a slice of the neighbours' buildings each side, cooler than the office, in the light of the hour, a few windows lit
//   at night;
// - under the street its far sidewalk and the ground in section: soil in dithered bands, stones, a pipe, and the
//   office's cables running down beside the console into the pipe, a pulse on each.
// The timelapse's sky is its night bands (always drawn) with its dawn, day and dusk bands over them, each faded in and
// out by the hour (lib/svg-timelapse.mjs lapseSky): every addition goes in with the light it belongs to and fades with
// it; the sun and the moon go in with every light, between its bands and its clouds.

// the replay's clock: an hour each 0.05 s from Tue 02:00 (the week fixture, cut to where something happened)
const at = (day, hour) => Math.round((day * 24 + hour - 2) * 0.05 * 1000) / 1000
const THU = 2, FRI = 3
// how far the dressing reaches past the drawing (the frame shows 16 art px past each side at 2.5×) and up over it; the
// sky's colors run from its zenith down to the horizon at the lower neighbour's roof, in bands `step` rows tall
export const PAST = 90
const X0 = -PAST
const SKY = { top: -130, zenith: -110, horizon: 150, step: 30 }

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
const css = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
const mix = (a, b, t) => css(hex(a).map((v, i) => v + (hex(b)[i] - v) * t))
const shade = (c, k) => css(hex(c).map((v) => v * k))
const r1 = (n) => Math.round(n * 10) / 10
const r3 = (n) => Math.round(n * 1000) / 1000
const r4 = (n) => Math.round(n * 10000) / 10000
const rect = (x, y, w, h, fill, op) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${op != null ? ` fill-opacity="${op}"` : ''}/>`
/** Pixels [[x, y]…] as one path, each row's runs merged. */
function dots(pts, fill, op) {
  if (!pts.length) return ''
  const rows = new Map()
  for (const [x, y] of pts) rows.set(y, [...(rows.get(y) ?? []), x])
  let d = ''
  for (const [y, xs] of rows) {
    xs.sort((a, b) => a - b)
    for (let i = 0; i < xs.length;) {
      let j = i
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++
      d += `M${xs[i]} ${y}h${j - i + 1}v1h${-(j - i + 1)}z`
      i = j + 1
    }
  }
  return `<path fill="${fill}"${op != null ? ` fill-opacity="${op}"` : ''} d="${d}"/>`
}
/** A row of 1-px dashes across the dressing at `y`: a dither (`dash` '1 1' half of it, '1 3' a quarter). */
const row = (y, color, dash, offset, w, x0 = X0) => `<path stroke="${color}" stroke-dasharray="${dash}" stroke-dashoffset="${offset}" d="M${x0} ${y + 0.5}h${w}"/>`
/** Shown from `begin` for `dur` s of the replay, moved from `from` to `to` meanwhile. */
const pass = (begin, dur, from, to, body) => `<g display="none"><set attributeName="display" to="inline" begin="${begin}s"/><set attributeName="display" to="none" begin="${r3(begin + dur)}s"/>` +
  `<animateTransform attributeName="transform" type="translate" from="${from}" to="${to}" begin="${begin}s" dur="${dur}s" fill="freeze"/>${body}</g>`
// a seeded random (mulberry32): the stars and the stones stay where they were
function seeded(n) {
  let a = n >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------- the sky

const BANDS = /<g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-dasharray="1">((?:<path color="#[0-9a-f]{6}" d="M-2 \d+h\d+v\d+H-2z"\/>)+)<\/g>/g
const bandsOf = (paths) => [...paths.matchAll(/color="(#[0-9a-f]{6})" d="M-2 (\d+)h\d+v(\d+)H-2z"/g)].map(([, c]) => c)

/**
 * A light's sky over the whole frame: the plugin's band colors, top to bottom, as stops spread evenly from the zenith
 * (a shade darker than its top band) down to the horizon, so every band steps as little as the next (the plugin
 * crowds them toward its roof); laid in bands SKY.step rows tall from SKY.top down to the street, each seam dithered:
 * the lower color a quarter then half into the band over it, the upper half then a quarter into the one under.
 */
function sky(colors, foot, w, x0 = X0) {
  const stops = [shade(colors[0], 0.78), ...colors]
  const colorAt = (y) => {
    const p = Math.max(0, Math.min(1, (y - SKY.zenith) / (SKY.horizon - SKY.zenith))) * (stops.length - 1)
    const i = Math.min(stops.length - 2, Math.floor(p))
    return mix(stops[i], stops[i + 1], p - i)
  }
  const edges = []
  for (let y = SKY.top; y < foot; y += SKY.step) edges.push(y)
  edges.push(foot)
  const cols = edges.slice(0, -1).map((y, i) => colorAt((y + edges[i + 1]) / 2))
  let s = cols.map((c, i) => rect(x0, edges[i], w, edges[i + 1] - edges[i], c)).join('')
  for (let i = 1; i < cols.length; i++) {
    const y = edges[i], up = cols[i - 1], lo = cols[i]
    s += row(y - 2, lo, '1 3', 0, w, x0) + row(y - 1, lo, '1 1', 1, w, x0) + row(y, up, '1 1', 0, w, x0) + row(y + 1, up, '1 3', 2, w, x0)
  }
  return s
}

/**
 * The horizon's glow where the sun rises or sets: a flat band on the roofline at that end (the building and its props
 * over its lower half), five ordered-dither steps from three in four at its heart to one in sixteen at its edge, warm
 * inside and rosier outside. It waits for its light to be half in (`fade`, the light's own opacity track made late), so
 * it never shows as grey dots on a sky still blue.
 */
function glow(light, cx, roof, fade) {
  const [warm, rose] = GLOWS[light]
  const steps = [[86, 24, 'e', rose], [70, 19, 'q', rose], [54, 15, 'h', warm], [38, 11, 't', warm], [22, 7, 'f', warm]]
  return `<g opacity="0">${fade}${steps.map(([rx, ry, d, c]) => `<ellipse cx="${cx}" cy="${roof}" rx="${rx}" ry="${ry}" fill="url(#fin-${light}-${d}${c === warm ? 'w' : 'r'})"/>`).join('')}</g>`
}
const GLOWS = { dawn: ['#f2a48c', '#b07aa0'], dusk: ['#e8946a', '#b0607a'] }
// ordered-dither tiles: a sixteenth, an eighth, a quarter, a half, three in four
const DITHER = { e: [4, 4, [[0, 0]]], q: [4, 2, [[0, 0]]], h: [2, 2, [[0, 0], [1, 1]]], t: [2, 2, [[0, 0], [1, 1], [1, 0]]], f: [2, 2, [[0, 0], [1, 1], [1, 0], [0, 1]]] }
const glowPatterns = () => Object.entries(GLOWS).flatMap(([light, [warm, rose]]) => Object.entries(DITHER).flatMap(([d, [w, h, px]]) =>
  [['w', warm], ['r', rose]].map(([k, c]) => `<pattern id="fin-${light}-${d}${k}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${px.map(([x, y]) => rect(x, y, 1, 1, c)).join('')}</pattern>`))).join('')
/**
 * A light's opacity track (lib/svg-timelapse.mjs faded: `values` and `keyTimes`) made late: nothing until the light is
 * half in, all of it once it is all in, a key put where it crosses half so the ramps stay straight.
 */
function late(values, keyTimes, dur) {
  const v = values.split(';').map(Number), t = keyTimes.split(';').map(Number), out = []
  const g = (x) => Math.max(0, Math.min(1, (x - 0.5) * 2))
  v.forEach((x, i) => {
    out.push([t[i], g(x)])
    const y = v[i + 1]
    if (y != null && (x - 0.5) * (y - 0.5) < 0) out.push([t[i] + ((t[i + 1] - t[i]) * (0.5 - x)) / (y - x), 0])
  })
  return `<animate attributeName="opacity" values="${out.map(([, x]) => r3(x)).join(';')}" keyTimes="${out.map(([x]) => r4(x)).join(';')}" dur="${dur}" repeatCount="indefinite"/>`
}

// the clouds: five shapes (circles and a base for a puff, a run a row for a streak), lit along their tops and shaded
// under, in each light's three tones [rim, body, underside]
const SHAPES = {
  puffA: { circles: [[8, 9, 5], [17, 6, 6.5], [27, 5, 6], [35, 8, 5], [40, 11, 3.5]], base: [4, 9, 39, 6] },
  puffB: { circles: [[7, 7, 4.5], [15, 5, 5.5], [24, 6, 5], [29, 8, 4]], base: [3, 7, 29, 5] },
  puffC: { circles: [[6, 8, 4], [13, 6, 5], [21, 4, 6.5], [30, 6, 5], [38, 8, 4.5], [45, 10, 3]], base: [3, 8, 45, 5] },
  streakA: { rows: [[18, 44], [8, 58], [2, 63], [10, 52]] },
  streakB: { rows: [[10, 30], [2, 44], [12, 38]] },
}
const TINTS = {
  night: ['#3c4b80', '#1a2246', '#141a38'],
  dawn: ['#ffe0b8', '#b49ccc', '#f0a8a8'],
  day: ['#ffffff', '#e4eefb', '#b5cdee'],
  dusk: ['#ffc27a', '#7a6aa8', '#e88a7a'],
}
function cloudMask(s) {
  const on = new Set()
  if (s.rows) s.rows.forEach(([a, b], y) => { for (let x = a; x <= b; x++) on.add(`${x},${y}`) })
  else {
    for (const [cx, cy, r] of s.circles) {
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) on.add(`${x},${y}`)
    }
    const [bx, by, bw, bh] = s.base
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) on.add(`${x},${y}`)
  }
  return on
}
function cloudSprite(id, mask, [rim, body, under]) {
  const R = [], B = [], U = []
  for (const k of mask) {
    const [x, y] = k.split(',').map(Number)
    if (!mask.has(`${x},${y - 1}`)) R.push([x, y])
    else if (!mask.has(`${x},${y + 1}`) || !mask.has(`${x},${y + 2}`)) U.push([x, y])
    else B.push([x, y])
  }
  return `<g id="${id}">${dots(B, body)}${dots(U, under)}${dots(R, rim)}</g>`
}
// [shape, row, art px a second of the replay at `pace` 1 (the end's: the video's px a second at its 0.4× and 2.5×),
// where it is in its pass]
const CLOUDS = [['streakA', -100, 55, 0.12], ['streakB', -74, 55, 0.58], ['streakA', -46, 55, 0.86],
  ['puffA', -62, 110, 0.32], ['puffB', -28, 110, 0.78], ['puffC', 0, 110, 0.04]]
/**
 * The clouds across a drawing `w` wide, right to left, at `pace` of their speed (a still shot's clock runs 1:1, a replay's
 * races), from `past` past its right side to as far past its left.
 */
const clouds = (tint, w, pace = 1, past = PAST) => CLOUDS.map(([shape, y, speed, start]) => {
  const from = w + past - 20, to = -past - 20, dur = (from - to) / (speed * pace)
  return `<g><animateTransform attributeName="transform" type="translate" from="${from} 0" to="${to} 0" dur="${r3(dur)}s" begin="${r3(-start * dur)}s" repeatCount="indefinite"/>` +
    `<use href="#fin-cl-${shape}-${tint}" y="${y}"/></g>`
}).join('')

/**
 * The night's stars over a drawing `w` wide, three tiers: dim, white, and a few in a plus that twinkle (once each
 * `twinkle` s of its clock: three times a second of the end's video), `spread` art px past its sides, as many to a
 * stretch of sky however far that is. None behind the building or its sign.
 */
function stars(w, twinkle = 0.133, spread = 20) {
  const many = (n) => Math.round((n * (w + 2 * spread)) / (w + 40))
  const rnd = seeded(7)
  const hidden = (x, y) => (x > 8 && x < w - 8 && y > 50) || (x > w / 2 - 104 && x < w / 2 + 104 && y > -4 && y < 50) || (x <= 8 && y > 148) || (x >= w - 8 && y > 203)
  const pick = (n) => {
    const out = []
    while (out.length < n) {
      const p = [Math.floor(-spread + rnd() * (w + 2 * spread)), Math.floor(-128 + rnd() * 330)]
      if (!hidden(...p)) out.push(p)
    }
    return out
  }
  const star = ([x, y]) => `<g><path fill="#ffffff" fill-opacity=".5" d="M${x - 1} ${y}h3v1h-3zM${x} ${y - 1}h1v3h-1z"/><path fill="#ffffff" d="M${x} ${y}h1v1h-1z"/>` +
    `<animate attributeName="opacity" values="1;.3;1" dur="${twinkle}s" begin="${r3(-rnd() * twinkle)}s" repeatCount="indefinite"/></g>`
  return dots(pick(many(80)), '#6f86c9') + dots(pick(many(25)), '#e9e6ff') + pick(many(5)).map(star).join('')
}

/** A shooting star at `begin`: a white head, a tail in three steps fading behind it, down and to the left past the sign's right. */
function shootingStar(begin, w) {
  const tail = [[1, 10, '#ffffff', 0.85], [11, 20, '#c9d4ff', 0.55], [21, 32, '#8fa3e8', 0.3]]
    .map(([a, b, c, op]) => dots(Array.from({ length: b - a + 1 }, (_, i) => [a + i, -Math.floor((a + i) / 2)]), c, op)).join('')
  return pass(begin, 0.16, `${w - 8} -36`, `${w - 78} -1`, `<path fill="#ffffff" d="M-1 0h2v1h-2zM0 -1h1v1h-1z"/>${tail}`)
}

/** A plane across the night under the zenith, its red light blinking once a second of the video (0.4 s of the replay). */
function plane(begin, dur, w) {
  const body = dots([[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [3, 2], [4, 2], [5, 2], [3, 0]], '#4a5490')
  return pass(begin, dur, '-30 -22', `${w + 30} -34`, `${body}<path fill="#ff4d4d" d="M0 -1h1v1h-1z"><animate attributeName="opacity" values="1;0" dur="0.4s" calcMode="discrete" repeatCount="indefinite"/></path>` +
    '<path fill="#f3f0ff" d="M9 1h1v1h-1z"/>')
}

/** A flock of five crossing the day sky left to right, wings up and down five times a second of the video. */
function flock(begin, dur, y, w) {
  const up = [[0, 0], [1, 1], [2, 1], [3, 0]], down = [[0, 1], [1, 0], [2, 0], [3, 1]]
  const flap = (pts, first) => `<g>${dots(pts, '#2a3550')}<animate attributeName="opacity" values="${first ? '1;0' : '0;1'}" dur="0.08s" calcMode="discrete" repeatCount="indefinite"/></g>`
  const birds = [[0, 0], [7, -3], [13, 1], [19, -4], [25, 0]].map(([x, yy], i) => `<g transform="translate(${x} ${yy})">${flap(up, i % 2 === 0)}${flap(down, i % 2 === 1)}</g>`).join('')
  return pass(begin, dur, `-40 ${y}`, `${w + 20} ${y - 10}`, birds)
}

// ---------------------------------------------------------------- the sun and the moon

/** A sun 16 px across with a rim, a half then a quarter checker of halo round it, its middle at (0, 0): `id`, its tones. */
function sunSprite(id, [core, rimC, haloC]) {
  const c = [], rim = [], h1 = [], h2 = []
  for (let y = -13; y <= 13; y++) {
    for (let x = -13; x <= 13; x++) {
      const r = Math.hypot(x + 0.5, y + 0.5)
      if (r <= 6.6) c.push([x, y])
      else if (r <= 8) rim.push([x, y])
      else if (r <= 10.2) { if ((x + y) % 2 === 0) h1.push([x, y]) } else if (r <= 12.6 && x % 2 === 0 && y % 2 === 0) h2.push([x, y])
    }
  }
  return `<g id="${id}">${dots(h2, haloC, 0.55)}${dots(h1, haloC, 0.75)}${dots(rim, rimC)}${dots(c, core)}</g>`
}
/** The moon, a crescent 14 px across, its inner edge shaded, a half then a quarter checker of light hugging it. */
function moonSprite() {
  const lit = [], edge = [], h1 = [], h2 = []
  for (let y = -12; y <= 12; y++) {
    for (let x = -12; x <= 12; x++) {
      const r = Math.hypot(x + 0.5, y + 0.5), cut = Math.hypot(x + 0.5 - 3.5, y + 0.5 + 2)
      if (r <= 7) { if (cut > 5.8) (cut <= 6.8 ? edge : lit).push([x, y]) } else if (r <= 8.6) { if ((x + y) % 2 === 0) h1.push([x, y]) } else if (r <= 10.4 && x % 2 === 0 && y % 2 === 0) h2.push([x, y])
    }
  }
  return `<g id="fin-moon">${dots(h2, '#8fa3d8', 0.35)}${dots(h1, '#a9bdf0', 0.5)}${dots(lit, '#f3ead2')}${dots(edge, '#c8bea4')}</g>`
}

/**
 * The plugin's crossing (lib/svg-timelapse.mjs crossing: up from behind the roof at its left end, along under the
 * sign's top, down behind the roof at its right, at one even pace) laid again on an arc over the sign, rising and
 * setting between the roof's props: every key of the old path at its share of the way on the new one, with a key every
 * 1/24 of a crossing between, so it curves; a key off the path (the body hidden under the roof) goes to the arc's
 * nearer end, under the roof too. Its `values` are the body's middle; `stage`, at each key, how near the horizon it
 * is in three steps (0 over the middle of its way, 2 the last fifth of it each end), for the sun's colors.
 */
function rearc(values, keyTimes, arc) {
  const pts = values.split(';').map((v) => v.trim().split(/\s+/).map(Number))
  const ts = keyTimes.split(';').map(Number)
  const ys = pts.map((p) => p[1]), low = Math.max(...ys), high = Math.min(...ys)
  const lows = pts.filter((p) => p[1] === low).map((p) => p[0]), highs = pts.filter((p) => p[1] === high).map((p) => p[0])
  const A = [Math.min(...lows), low], B = [Math.min(...highs), high], C = [Math.max(...highs), high], D = [Math.max(...lows), low]
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1])
  const L = [dist(A, B), dist(B, C), dist(C, D)], total = L[0] + L[1] + L[2]
  const uOf = ([x, y]) => {
    if (y === low) return x === A[0] ? 0 : x === D[0] ? 1 : null
    if (y === high) return (L[0] + x - B[0]) / total
    return x < B[0] ? dist(A, [x, y]) / total : (L[0] + L[1] + dist(C, [x, y])) / total
  }
  return onArc(pts.map((p, i) => {
    const u = uOf(p)
    return [ts[i], u, u == null ? (p[0] < (A[0] + D[0]) / 2 ? 0 : 1) : u]
  }), arc)
}

/**
 * The plugin's way since 1.0 (lib/svg-kit.mjs celestialArc: one animateMotion a body, its keyPoints the share of the
 * way at each key, 0 rising from behind the roof at its left, 1 set behind it at its right) laid on the arc as rearc
 * lays the old crossing.
 */
function rearcWay(keyPoints, keyTimes, arc) {
  const ts = keyTimes.split(';').map(Number)
  return onArc(keyPoints.split(';').map(Number).map((u, i) => [ts[i], u, u]), arc)
}

/**
 * Keys [t, u, end] on the arc: `u` a share of the way (null: hidden under the roof, at the arc's `end`), a key every
 * 1/24 of a crossing between two on the way, so it curves.
 */
function onArc(keys, arc) {
  const cx = (arc.x0 + arc.x1) / 2, rx = (arc.x1 - arc.x0) / 2, ry = arc.low - arc.top
  const on = (u) => [cx - rx * Math.cos(Math.PI * u), arc.low - ry * Math.sin(Math.PI * u)]
  const lowness = (u) => Math.max(0, Math.min(1, (Math.abs(u - 0.5) - 0.24) / 0.12))
  const out = []
  keys.forEach(([t, u, end], i) => {
    out.push([t, on(u ?? end), u == null ? 1 : lowness(u)])
    const next = keys[i + 1], v = next?.[1]
    if (u == null || v == null || v <= u) return
    const n = Math.ceil((v - u) * 24)
    for (let k = 1; k < n; k++) out.push([t + ((next[0] - t) * k) / n, on(u + ((v - u) * k) / n), lowness(u + ((v - u) * k) / n)])
  })
  return {
    values: out.map(([, [x, y]]) => `${r1(x)} ${r1(y)}`).join(';'), keyTimes: out.map(([t]) => r4(t)).join(';'),
    stage: out.map(([, , l]) => (l < 0.33 ? 0 : l < 0.66 ? 1 : 2)),
  }
}
// the sun's colors by how low it is [core, rim, halo]: noon, then gold, then orange by the horizon
const SUNS = [['#fff1b8', '#ffd36b', '#ffe08a'], ['#ffd27a', '#ffb347', '#ffc27a'], ['#feb25b', '#ff8a4a', '#ff9f6a']]
/** The sun (stepping through its three colors, never blending them) or the moon on the arc, as one light draws it. */
function body(name, a, dur) {
  const move = `<animateTransform attributeName="transform" type="translate" values="${a.values}" keyTimes="${a.keyTimes}" dur="${dur}" repeatCount="indefinite"/>`
  const start = a.values.split(';')[0]
  if (name === 'moon') return `<use href="#fin-moon" transform="translate(${start})">${move}</use>`
  return SUNS.map((_, k) => `<use href="#fin-sun${k}" transform="translate(${start})">${move}` +
    `<animate attributeName="opacity" values="${a.stage.map((s) => (s === k ? 1 : 0)).join(';')}" keyTimes="${a.keyTimes}" calcMode="discrete" dur="${dur}" repeatCount="indefinite"/></use>`).join('')
}

// ---------------------------------------------------------------- the neighbours

// a slice of a building each side, wider than the frame shows (16 px of it at the end): its roof's row by default
const ROOFS = [150, 205]
const WALLS = {
  night: { wall: '#141834', cap: '#1e2446', win: '#0e1126', lit: '#f3cf73' },
  dawn: { wall: '#5d5a80', cap: '#77729a', win: '#3e3c5c', lit: '#e8b8b0' },
  day: { wall: '#7d8aa6', cap: '#9aa6bf', win: '#b9cbe6', lit: '#b9cbe6' },
  dusk: { wall: '#4b3d63', cap: '#5f4f7a', win: '#3b3050', lit: '#f0a868' },
}
/**
 * The neighbours in a light, either side of a drawing `w` wide down to its sidewalk (`foot`): walls, a lit cap,
 * windows 5 × 7. At dusk the right ones catch the sun; at night a few are lit, going on and off by the hour on a
 * replay's `loop`, or just lit when there is none (a still shot). Each reaches `past` art px past the drawing's side.
 */
function neighbours(light, foot, w, loop, roofs = ROOFS, past = PAST) {
  const c = WALLS[light], rnd = seeded(11)
  let s = ''
  ;[-past, w - 7].forEach((x0, side) => {
    const roof = roofs[side], nw = past + 7
    s += rect(x0, roof, nw, foot - roof, c.wall) + rect(x0, roof, nw, 2, c.cap) + rect(x0, roof + 2, nw, 1, shade(c.wall, 0.75))
    for (let y = roof + 9; y + 7 < foot - 6; y += 13) {
      for (let x = x0 + 4; x + 5 < x0 + nw; x += 9) {
        const r = rnd()
        if (light === 'night' && r < 0.22 && loop) {
          // on for a few hours of the night, off again
          const on = at(THU, 18 + Math.floor(rnd() * 6)), off = r3(on + 0.1 + rnd() * 0.25)
          s += `<rect x="${x}" y="${y}" width="5" height="7" fill="${c.win}"><animate attributeName="fill" values="${c.win};${c.lit};${c.win}" keyTimes="0;${r4(on / loop)};${r4(off / loop)}" calcMode="discrete" dur="${loop}s" repeatCount="indefinite"/></rect>`
        } else {
          const lit = (light === 'dusk' && side === 1 && r < 0.4) || (light === 'night' && !loop && r < 0.22)
          s += rect(x, y, 5, 7, lit ? c.lit : c.win) + rect(x, y + 7, 5, 1, shade(c.wall, 1.25))
        }
      }
    }
  })
  return s
}

// ---------------------------------------------------------------- the ground

// the office's cables, in its nameplates' colors, down the ground beside the console into the pipe: [x, color]
const CABLES = [[-13, '#b892e6'], [-8, '#e8c860'], [-3, '#9ccc70'], ['right+3', '#6cd0b4'], ['right+8', '#f08cb4']]
const SOIL = ['#3b2b21', '#2d2119', '#251b15', '#1f1814']
/**
 * The far side of a road whose far edge is row `y`, from `x0` for `W` art px: the far curb lit along its top, the far
 * sidewalk's slabs, then the ground in section, soil in four bands with checkered seams, stones, a pipe across,
 * bedrock under it; and, given a drawing's width `w`, the office's cables running down beside it into the pipe, a pulse
 * on each once a second of the end's video. Every shot whose street the frame shows stands on it.
 */
export function underground(y, x0, W, w) {
  const rnd = seeded(5)
  const r = (yy, h, fill, op) => rect(x0, yy, W, h, fill, op)
  const line = (yy, color, dash, offset) => `<path stroke="${color}" stroke-dasharray="${dash}" stroke-dashoffset="${offset}" d="M${x0} ${yy + 0.5}h${W}"/>`
  let s = r(y, 1, '#6e655a') + r(y + 1, 1, '#4a433b') + r(y + 2, 8, '#5a5249') + r(y + 2, 1, '#6e655a') + r(y + 10, 1, '#3a342e')
  s += `<path stroke="#4a433b" d="${Array.from({ length: Math.ceil(W / 10) }, (_, k) => `M${x0 + 5 + k * 10 + 0.5} ${y + 3}v7`).join('')}"/>`
  const g = y + 11, band = 40
  SOIL.forEach((c, k) => { s += r(g + k * band, k === SOIL.length - 1 ? 700 : band, c) })
  for (let k = 1; k < SOIL.length; k++) s += line(g + k * band - 1, SOIL[k], '1 1', 1) + line(g + k * band, SOIL[k - 1], '1 1', 0)
  // stones: pebbles, a few with a lit top, and rocks deeper down
  const pebbles = Array.from({ length: Math.round(W / 6) }, () => [Math.floor(x0 + rnd() * W), Math.floor(g + 3 + rnd() * 300)])
  s += dots(pebbles.flatMap(([x, yy], i) => (i % 3 ? [[x, yy], [x + 1, yy]] : [[x, yy]])), '#574231') + dots(pebbles.filter((_, i) => i % 3 === 1).map(([x, yy]) => [x, yy - 1]), '#6b5440')
  const rocks = Array.from({ length: Math.round(W / 58) }, () => [Math.floor(x0 + rnd() * W), Math.floor(g + 70 + rnd() * 230)])
  s += dots(rocks.flatMap(([x, yy]) => [[x + 1, yy], [x + 2, yy], [x, yy + 1], [x + 1, yy + 1], [x + 2, yy + 1], [x + 3, yy + 1], [x, yy + 2], [x + 1, yy + 2], [x + 2, yy + 2], [x + 3, yy + 2]]), '#4a3a2c') +
    dots(rocks.flatMap(([x, yy]) => [[x + 1, yy], [x + 2, yy]]), '#6b5440')
  const pipe = g + 176
  // bedrock under the pipe, darker, its seam checkered, a few boulders lit along their tops
  const bed = pipe + 34
  s += r(bed, 500, '#171210') + line(bed - 1, '#171210', '1 1', 1) + line(bed, SOIL.at(-1), '1 1', 0)
  for (let bx = x0 + 40, k = 0; bx < x0 + W - 10; bx += 140 + (k % 2) * 25, k++) {
    const [by, bw, bh] = [bed + [14, 40, 22, 52][k % 4], [10, 8, 9, 7][k % 4], [6, 5, 6, 5][k % 4]]
    s += rect(bx + 1, by, bw - 2, bh, '#2a221b') + rect(bx, by + 1, bw, bh - 2, '#2a221b') + rect(bx + 1, by, bw - 2, 1, '#3a2e24') + rect(bx + 1, by + bh - 1, bw - 2, 1, '#120d0a')
  }
  s += r(pipe, 4, '#56606c') + r(pipe, 1, '#7b8693') + r(pipe + 3, 1, '#3e464f') + r(pipe + 4, 1, '#000', 0.25)
  s += Array.from({ length: Math.ceil(W / 48) }, (_, k) => rect(x0 + 20 + k * 48, pipe - 1, 3, 6, '#4a535d')).join('')
  // the cables: 2 px, a dark edge each side, down from the far sidewalk into the pipe (a collar where they go in)
  if (w != null) {
    for (const [k, [x, color]] of CABLES.entries()) {
      const cx = typeof x === 'number' ? x : w + Number(x.slice(6))
      s += rect(cx - 1, g, 4, pipe - g, '#120e0b') + rect(cx, g, 2, pipe - g, mix(color, SOIL[1], 0.45)) + rect(cx - 2, pipe - 2, 6, 2, '#4a535d') +
        `<rect x="${cx}" y="${g}" width="2" height="4" fill="${color}"><animateTransform attributeName="transform" type="translate" from="0 0" to="0 ${pipe - g - 6}" dur="0.4s" begin="${r3(-k * 0.083)}s" repeatCount="indefinite"/></rect>`
    }
  }
  return s
}
/**
 * Under the end's sidewalk (its row `foot`): the sidewalk on `past` art px past the drawing, a road 10 rows wide, then
 * underground.
 */
function ground(foot, w, past = PAST) {
  const W = w + 2 * past, x0 = -past
  const r = (y, h, fill) => rect(x0, y, W, h, fill)
  const sides = (y, h, fill) => rect(x0, y, past, h, fill) + rect(w, y, past, h, fill)
  const road = foot + 4, R = 10
  return sides(foot, 3, '#58514a') + sides(foot + 3, 1, '#433d37') + r(road, R, '#34363b') + r(road, 1, '#2a2b2f') +
    `<path stroke="#c9c2b4" stroke-dasharray="6 5" d="M${x0} ${road + R / 2 + 0.5}h${W}"/>` + underground(road + R, x0, W, w)
}

// ---------------------------------------------------------------- the grade

/** A light's opacity at `t` (a share of the loop) on its track (linear between its keys). */
function at01(track, t) {
  const v = track.values.split(';').map(Number), k = track.keyTimes.split(';').map(Number)
  let i = k.findIndex((x) => x >= t)
  if (i <= 0) return v[Math.max(0, i)]
  return v[i - 1] + ((v[i] - v[i - 1]) * (t - k[i - 1])) / (k[i] - k[i - 1] || 1)
}
/** An opacity track `f(dawn, day, dusk)` × `peak`, keyed wherever any of the three lights is. */
function trackOf(tracks, f, peak) {
  const lights = ['dawn', 'day', 'dusk'].map((l) => tracks[l])
  const keys = [...new Set(lights.flatMap((t) => t.keyTimes.split(';').map(Number)))].sort((a, b) => a - b)
  const values = keys.map((t) => r3(Math.max(0, Math.min(1, f(...lights.map((l) => at01(l, t))))) * peak))
  return `<animate attributeName="opacity" values="${values.join(';')}" keyTimes="${keys.map(r4).join(';')}" dur="${lights[0].dur}" repeatCount="indefinite"/>`
}
/**
 * The street's façade in the light of the hour, which the replay's sky turns but its brick does not: over the whole
 * building (before the sidewalk and what stands on it, the lamps glowing on top), a night's blue, a dusk's orange and a
 * dawn's rose, each as much as its light is in; over the road, the night too.
 */
function graded(svg, tracks, foot) {
  if (!tracks.dawn || !tracks.day || !tracks.dusk) return svg
  const facade = svg.match(/<g data-facade><path fill="url\(#[\w-]+\)" fill-rule="evenodd" d="M(\d+) (\d+)h(\d+)v(\d+)h/)
  if (!facade) return svg
  const [, x, y, w] = facade.slice(1).map(Number)
  const night = (dawn, day, dusk) => 1 - dawn - day - dusk
  const tint = (fill, f, peak) => `<rect x="${x}" y="${y}" width="${w}" height="${foot - y}" fill="${fill}" opacity="0">${trackOf(tracks, f, peak)}</rect>`
  const building = tint('#141c40', night, 0.46) + tint('#ff7a3c', (dawn, day, dusk) => dusk, 0.16) + tint('#ffb48a', (dawn) => dawn, 0.1)
  const road = `<g opacity="0">${trackOf(tracks, night, 1)}<rect x="-400" y="${foot + 4}" width="1340" height="60" fill="#0c1230" fill-opacity=".38"/></g>`
  return svg.replace(/<path fill="#58514a" d="M0 (\d+)h/, (m) => building + m).replace(/(<g data-road>[\s\S]*?<\/g>)/, (m) => m + road)
}

// ---------------------------------------------------------------- the whole

// the cloud, sun and moon sprites a dressing uses, in the tints it asks for
const sprites = (tints, { suns = true } = {}) => (suns ? SUNS.map((tones, i) => sunSprite(`fin-sun${i}`, tones)).join('') + glowPatterns() : '') + moonSprite() +
  Object.entries(SHAPES).flatMap(([name, s]) => { const mask = cloudMask(s); return tints.map((tint) => cloudSprite(`fin-cl-${name}-${tint}`, mask, TINTS[tint])) }).join('')
const visible = (svg) => (svg.includes('<svg overflow="visible"') ? svg : svg.replace('<svg ', '<svg overflow="visible" '))

/**
 * A timelapse `svg` (lib/svg.mjs renderTimelapse, its root the drawing's size, `w` art px wide) with its sky dressed:
 * every light's bands laid again over the frame, the sun and the moon on `arc`, clouds, stars, the glows, and what
 * passes when (`life`: a plane, a shooting star, flocks, in the replay's seconds); `sides` the neighbours, `street` the
 * end's road and underground; all of it `past` art px past the drawing's sides (wider for a frame that shows more).
 */
function dressLapse(svg, w, { arc, life, sides, street, grade, past = PAST }) {
  const loop = Number(svg.match(/data-loop="([\d.]+)"/)[1])
  const foot = Number(svg.match(/fill="#58514a" d="M0 (\d+)h/)[1])
  // the sun and the moon out of their place after the sky, laid again on their arc, to go in with every light
  const bodies = {}
  let out = svg.replace(/<use href="#[\w-]+-(sun|moon)" transform="translate\([^)]+\)"><animateTransform attributeName="transform" type="translate" values="([^"]+)" keyTimes="([^"]+)" dur="([^"]+)" repeatCount="indefinite"\/><\/use>/g,
    (m, name, values, keyTimes, dur) => { bodies[name] = body(name, rearc(values, keyTimes, arc), dur); return '' })
  // since 1.0 the plugin moves them on a way of its own (svg-kit celestialArc: a body defined once, `…-lp-sun`,
  // `…-lp-moon`, its animateMotion's keyPoints the share of the way, and used in each light): on the arc the same way,
  // the plugin's uses out; and its clouds (`…-lp-cl…`, in every light), as the dressing lays its own in every light
  for (const name of ['sun', 'moon']) {
    const def = bodies[name] ? null : out.match(new RegExp(`<g id="([\\w-]+-lp-${name})">[\\s\\S]*?<animateMotion path="[^"]*" keyPoints="([^"]+)" keyTimes="([^"]+)"[^>]*? dur="([^"]+)"`))
    if (!def) continue
    bodies[name] = body(name, rearcWay(def[2], def[3], arc), def[4])
    out = out.replaceAll(new RegExp(`<use href="#${def[1]}"[^>]*/>`, 'g'), '')
  }
  out = out.replace(/<use href="#[\w-]+-lp-cl[\w-]*"[^>]*\/>/g, '')
  const sky2 = (bodies.sun ?? '') + (bodies.moon ?? '')
  const near = (light) => (sides ? neighbours(light, foot, w, loop, ROOFS, past) : '')
  const cloud = (light) => clouds(light, w, 1, past)
  // the roofline the glows sit on (lib/svg-kit.mjs SKY: the roof under the header)
  const ROOF = 54
  const extras = {
    night: () => stars(w, undefined, past - 70) + (life.star != null ? shootingStar(life.star, w) : '') + (life.plane ? plane(...life.plane, w) : '') + sky2 + cloud('night') + near('night'),
    dawn: (fade) => glow('dawn', arc.x0, ROOF, fade) + sky2 + cloud('dawn') + near('dawn'),
    day: () => sky2 + cloud('day') + (life.flocks ?? []).map(([begin, dur, y]) => flock(begin, dur, y, w)).join('') + near('day'),
    dusk: (fade) => glow('dusk', arc.x1, ROOF, fade) + sky2 + cloud('dusk') + near('dusk'),
  }
  const LIGHTS = ['night', 'dawn', 'day', 'dusk']
  const tracks = {}
  let k = 0
  // each light's bands laid again over the frame; the dawn's, the day's and the dusk's extras with them, in their fade
  // (the light's own opacity track, just before its bands, made late for its glow)
  out = out.replace(BANDS, (m, paths, offset, all) => {
    const light = LIGHTS[k++]
    const track = [...all.slice(Math.max(0, offset - 3000), offset).matchAll(/<animate attributeName="opacity" values="([^"]+)" keyTimes="([^"]+)" dur="([^"]+)"/g)].at(-1)
    if (track && light !== 'night') tracks[light] = { values: track[1], keyTimes: track[2], dur: track[3] }
    return sky(bandsOf(paths), foot, w + 2 * past, -past) + (light === 'night' ? '' : extras[light](track ? late(track[1], track[2], track[3]) : ''))
  })
  // the night's after its own stars (which go on), before the first light faded over it; the day's one cloud sprite out
  out = out.replace(/<g opacity="[\d.]+"><animate attributeName="opacity"/, (m) => extras.night() + m)
  out = out.replace(/<g>(?:<use href="#[\w-]+-cloud" x="-?\d+" y="-?\d+"\/>)+<animateTransform[^>]*\/><\/g>/, '')
  out = visible(out.replace('</defs>', `${sprites(LIGHTS)}</defs>`))
  if (grade) out = graded(out, tracks, foot)
  return street ? out.replace(/<\/svg>\s*$/, `<g data-ground>${ground(foot, w, past)}</g></svg>`) : out
}

/**
 * The story's end: the week's timelapse dressed over the whole frame, Thursday 02:30 to Friday's dusk (promo/boards.mjs
 * FINALE): the sun and the moon arcing over the sign, a plane and a shooting star that night, a flock each morning, the
 * neighbours each side, its street on the underground; `past` art px past its sides (a smaller zoom shows more of it).
 */
export const dressEnd = (svg, w, { past } = {}) => dressLapse(svg, w, {
  arc: { x0: 75, x1: w - 75, top: -40, low: 74 }, sides: true, street: true, past,
  life: { plane: [at(THU, 20), 0.85], star: at(THU, 22.75), flocks: [[at(THU, 8.5), 0.55, -10], [at(FRI, 9), 0.5, -22]] },
})
/**
 * The story's street (the timelapse behind its façade, Thursday into the night): the same sky, the sun and the moon
 * on an arc over the sign (the night shot opens wide on it), a flock in the morning.
 */
export const dressLapseStreet = (svg, w) => dressLapse(svg, w, {
  arc: { x0: 75, x1: w - 75, top: -36, low: 74 }, sides: true, street: false, grade: true,
  life: { star: at(1, 21.5), flocks: [[at(0, 9.5), 0.4, 20], [at(1, 9.5), 0.4, 26]] },
})

// the night's sky as the plugin paints it (lib/svg-kit.mjs SKIES.night: its head, then its fall to the horizon)
const NIGHT = ['#04071a', '#0a1130', '#131b40', '#1b2250', '#2c275a', '#46305f', '#6a3d5e']
/**
 * A drawing with no sky of its own (a live or period view drawn transparent, `w` art px wide, down to its sidewalk)
 * under the story's still night: the night's bands over the frame, three tiers of stars twinkling slowly, the haloed
 * moon at `moon` (instead of its own), clouds drifting at a still shot's pace, and with `roofs` the neighbours either
 * side, a few windows lit. All of it behind the drawing.
 */
export function dressStill(svg, w, { moon, roofs }) {
  const foot = Number(svg.match(/fill="#58514a" d="M0 (\d+)h/)?.[1] ?? svg.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/)[1])
  const back = sky(NIGHT, foot, w + 2 * PAST) + stars(w, 0.9) + `<use href="#fin-moon" transform="translate(${moon.join(' ')})"/>` + clouds('night', w, 0.05) +
    (roofs ? neighbours('night', foot, w, null, roofs) : '')
  const out = svg.replace(/<use href="#[\w-]+-moon" x="-?[\d.]+" y="-?[\d.]+"\/>/, '').replace('</defs>', `${sprites(['night'], { suns: false })}</defs>${back}`)
  return visible(out)
}

// ---------------------------------------------------------------- the night street

// The street's light by night as the site draws it under the same street front (site/theme.js: flat translucent bands
// on the pixel grid, each a thin warm wash over the ones outside it, never dither), on its sidewalk and the road's near
// edge, SIDEWALK rows down from the wall. The street front itself already lights its lamps (lib/svg-live.mjs: a halo in
// bands round the glass, a faint pool round the post's foot, a bloom round a lit window).
const SIDEWALK = 12
const POOL = [[22, 0.05], [15, 0.075], [9, 0.11], [4.5, 0.14]]
const SPILL_SHOP = [36, 6, [[11, -1, 0.045], [8, 2, 0.06], [5, 5, 0.075]], '#ffd98a']
const SPILL_DOOR = [40, 8, [[12, -2, 0.055], [9, 2, 0.075], [6, 6, 0.09], [3, 10, 0.1]], '#ffe2a0']
/** `bands` [[reach, opacity], …] ellipses round (cx, cy) as row runs, reach along x and `squash` of it down y, rows [y0, y1). */
function glowBands(cx, cy, bands, squash, [y0, y1], color = '#ffd27a') {
  return bands.map(([reach, op]) => {
    let d = ''
    for (let y = y0; y < y1; y++) {
      const dy = (y + 0.5 - cy) / squash
      if (Math.abs(dy) > reach) continue
      const half = Math.sqrt(reach * reach - dy * dy)
      const x0 = Math.ceil(cx - half - 0.5), w = Math.floor(cx + half - 0.5) - x0 + 1
      if (w > 0) d += `M${x0} ${y}h${w}v1h${-w}z`
    }
    return d ? `<path fill="${color}" fill-opacity="${op}" d="${d}"/>` : ''
  }).join('')
}
/** Light out of an opening `w` wide whose middle is at cx, from the wall at row y0 toward the curb, widening a pixel each side every two rows. */
function spillBands(cx, y0, [w, pad, bands, color]) {
  return bands.map(([deep, inset, op]) => {
    let d = ''
    for (let y = 0; y < Math.min(deep, SIDEWALK); y++) {
      const half = Math.min(w / 2 + pad, w / 2 - inset + Math.floor(y / 2))
      if (half > 0) d += `M${cx - half} ${y0 + y}h${2 * half}v1h${-2 * half}z`
    }
    return `<path fill="${color}" fill-opacity="${op}" d="${d}"/>`
  }).join('')
}

/**
 * The street lamps' and the lit office's light on the street by night, in the timelapse's own switches: a pool under
 * each lit lamp (`…-fr-lampN`, in the group shown by night), drawn under the lamps and what stands on the sidewalk;
 * light out of each lit shop window (`…-fr-shopN`) and of the door on the sidewalk, shown with the lit front (its
 * group's own display track), over the sidewalk and under the lamps.
 */
export function streetLight(svg) {
  const lamps = [...svg.matchAll(/<use href="#[\w-]+-fr-lampN" x="(-?[\d.]+)" y="(-?[\d.]+)"\/>/g)].map((m) => [Number(m[1]) + 3.5, Number(m[2]) + 44])
  if (!lamps.length) return svg
  const ground = lamps[0][1]
  const rows = [ground, ground + SIDEWALK]
  const pools = lamps.map(([x]) => glowBands(x, ground + 2.5, POOL, 0.25, rows)).join('')
  let out = svg.replace(/(<g display="none">)(<use href="#[\w-]+-fr-lampN")/, `$1${pools}$2`)
  // the lit front's group: its shop windows' uses, then its own display track at its end
  const lit = svg.match(/<g display="none">((?:<use href="#[\w-]+-fr-shopN" x="-?[\d.]+" y="-?[\d.]+"\/>)+)[\s\S]*?(<animate attributeName="display" [^>]*\/>)<\/g>/)
  if (lit) {
    const shops = [...lit[1].matchAll(/x="(-?[\d.]+)"/g)].map((m) => Number(m[1]) + 18)
    const door = (lamps[0][0] + lamps.at(-1)[0]) / 2
    const spill = shops.map((x) => spillBands(x, ground, SPILL_SHOP)).join('') + spillBands(door, ground, SPILL_DOOR)
    out = out.replace(/<g display="none">(?:<path [^>]*\/>)*<use href="#[\w-]+-fr-lampN"/, (m) => `<g display="none">${spill}${lit[2]}</g>${m}`)
  }
  return out
}

/**
 * What still glows in the shut office at night, a drawing of the street's size to lay over it (on a clock of its own,
 * the replay under it barely moving): in some of the façade's windows (its brick's holes, promo/scenes.mjs withFacade)
 * a monitor's standby light or a server's, green, amber or blue, blinking at its own pace.
 */
export function nightLights(svg) {
  const [, , w, h] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
  const holes = [...(svg.match(/fill-rule="evenodd" d="M10 \d+h\d+v\d+h-\d+z((?:M\d+ \d+h34v26h-34z)+)"/)?.[1] ?? '').matchAll(/M(\d+) (\d+)h34/g)].map((m) => [+m[1], +m[2]])
  const rnd = seeded(13), COLORS = ['#5aff8a', '#ffb84a', '#6cb6ff', '#5aff8a']
  // a light 2 px with a halo round it, blinking; and in three windows a monitor left on, its cyan screen breathing
  const lights = holes.filter(() => rnd() < 0.45).map(([x, y]) => {
    const lx = x + 4 + Math.floor(rnd() * 25), ly = y + 14 + Math.floor(rnd() * 6), c = COLORS[Math.floor(rnd() * COLORS.length)]
    const dur = r3(0.9 + rnd() * 1.6), off = r3(rnd() * dur)
    return `<g><path fill="${c}" fill-opacity=".3" d="M${lx - 1} ${ly - 1}h4v4h-4z"/><path fill="${c}" fill-opacity=".45" d="M${lx - 2} ${ly}h6v2h-6zM${lx} ${ly - 2}h2v6h-2z"/><path fill="${c}" d="M${lx} ${ly}h2v2h-2z"/>` +
      `<animate attributeName="opacity" values="1;.15;1" keyTimes="0;.5;1" dur="${dur}s" begin="${-off}s" calcMode="discrete" repeatCount="indefinite"/></g>`
  }).join('') + holes.filter((_, i) => i % 7 === 3).slice(0, 3).map(([x, y], i) =>
    `<g><path fill="#7ee8ff" fill-opacity=".22" d="M${x + 9} ${y + 6}h12v10h-12z"/><path fill="#7ee8ff" fill-opacity=".7" d="M${x + 11} ${y + 8}h8v6h-8z"/><path fill="#e8fbff" d="M${x + 12} ${y + 9}h3v1h-3zM${x + 12} ${y + 11}h5v1h-5z"/>` +
      `<animate attributeName="opacity" values="1;.55;1" dur="${2.2 + i * 0.7}s" repeatCount="indefinite"/></g>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}" shape-rendering="crispEdges" overflow="visible">${lights}</svg>`
}

/** A black cat crossing the sidewalk at night, right to left past the door, eyes catching the lamps, on its own clock. */
export function nightCat(svg, { begin = 0.2, dur = 2.4 } = {}) {
  const [, , w, h] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
  // from right of the door to past its left
  const from = w / 2 + 70, to = w / 2 - 80
  const walk = Number(svg.match(/fill="#58514a" d="M0 (\d+)h/)[1])
  const BODY = '#15161c'
  const body = [[1, 0], [3, 0], [1, 1], [2, 1], [3, 1], [8, 1], [2, 2], [3, 2], [7, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3]]
  const legs = [[[1, 4], [3, 4], [5, 4], [7, 4]], [[2, 4], [4, 4], [6, 4]]]
  const step = (pts, first) => `<g>${dots(pts, BODY)}<animate attributeName="opacity" values="${first ? '1;0' : '0;1'}" dur="0.24s" calcMode="discrete" repeatCount="indefinite"/></g>`
  const cat = `${dots(body, BODY)}${dots([[1, 2]], '#ffe08a')}${step(legs[0], true)}${step(legs[1], false)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}" shape-rendering="crispEdges" overflow="visible">` +
    `${pass(begin, dur, `${from} ${walk - 5}`, `${to} ${walk - 5}`, cat)}</svg>`
}
