// The page's pixel art, drawn from the plugin's own data (./data.js) and paint (lib/svg-kit.mjs, svg-roof.mjs,
// svg-week.mjs, svg-street.mjs). One art pixel is P = 2 CSS px, the scale the office pictures are drawn at (960 px for
// 480 art pixels), so the page and the pictures share one grid. Everything is a char map (one char, one pixel) or a
// few rects, turned into crisp SVG: inline for sprites and icons, data URIs for tiles and 9-slice frames.
import { CAST, NEON, NEON_INK, PALETTE as K, PROPS } from './data.js'

/** One art pixel, in CSS px. */
export const P = 2

// ---------------------------------------------------------------- the paint

/** The plugin's colors: PALETTE, NEON_INK and the building's own stone, brass, steel and street paint. */
export const C = {
  ...K,
  ...NEON_INK,
  // brick tones (svg-kit BRICK_TILE) and the crown's stone (svg-kit CROWN, svg-week P)
  bHi: '#62493a', bDk: '#553e31', bDk2: '#4d382c', bLt: '#6b503f', bLt2: '#624939',
  stHi: '#b29d7d', stF: '#8a765c', stD: '#5c4c3b', bed: '#2b211b', sill: '#b5a58e', sillD: '#7d6f5d', lin: '#8a8072', linHi: '#a39886',
  frame: '#2a211b', iron: '#2b2622', fascia: '#17120e', band: '#1e1915', bandHi: '#4a4038', cream: '#f4efe4',
  brass: '#c9a26b', brassD: '#8f6d43', brassH: '#e6c48c', gold: '#f6d860', goldF: '#d9a640', goldD: '#a8792a', amber: '#ffb347',
  bulb: '#fff1c4', warm: '#ffd98a', hot: '#fff3c0', light: '#f6d860',
  // steel (svg-roof), lightest first
  s0: '#eef0f2', s1: '#dde1e6', s2: '#c4c9cf', s3: '#a4a9b0', s4: '#8a8f96', s5: '#6d7279', s6: '#5d6168', s7: '#4a4e55', s8: '#2b2e33',
  // under the street (svg-kit UNDER)
  soil: '#1b1713', pebble: '#2a241e', pebbleD: '#231e19', tunnel: '#0e0d0c', tWall: '#151311', rim: '#2b2622', rail: '#6a625a',
  sleeper: '#2f2924', ballast: '#1a1714', rock: '#110f0d', road: '#1d1b19', lane: '#8a7f5a', gutter: '#2a2520', roadEdge: '#141210',
  sign: '#16203e', signHi: '#2b3a66', ucream: '#f3ead0', shade: '#a8533a', wheel: '#2a2622', bogie: '#3a342e',
  // the roles (model.mjs ROLE_HEX, dark) and Clawd
  busy: '#9ab86a', ship: '#b5d67f', accent: '#eec96f', ask: '#e07a61', idle: '#55c5b1', clawd: '#d77757', dim: '#a4977c',
}

// ---------------------------------------------------------------- svg

const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
/** a mixed with b by t (0..1), as a solid color: the page's glows are flat paint, never transparency. */
export const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('')

// a fill: '#hex', 'currentColor', or '.name' (a class the page's CSS paints, for inline art that follows the theme)
function paths(by) {
  let s = ''
  for (const [f, d] of by) if (f) s += f[0] === '.' ? `<path class="${f.slice(1)}" d="${d}"/>` : `<path fill="${f}" d="${d}"/>`
  return s
}
/** A char map → one <path> per color (each row's runs). Chars missing from the legend are holes. */
export function pix(rows, legend, ox = 0, oy = 0) {
  const by = new Map()
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const ch = row[x]
      let w = 1
      while (row[x + w] === ch) w++
      const f = legend[ch]
      if (f) by.set(f, (by.get(f) ?? '') + `M${x + ox} ${y + oy}h${w}v1h${-w}z`)
      x += w
    }
  })
  return paths(by)
}
/** Rects [x, y, w, h, fill] → <path>s in paint order: a run of rects of one fill is one path, later rects paint over. */
export function rects(list) {
  let s = ''
  let fill = null
  let d = ''
  const flush = () => { if (d) s += paths(new Map([[fill, d]])) }
  for (const [x, y, w, h, f] of list) {
    if (!(w > 0 && h > 0) || !f) continue
    if (f !== fill) { flush(); fill = f; d = '' }
    d += `M${x} ${y}h${w}v${h}h${-w}z`
  }
  flush()
  return s
}
/** An SVG w × h art pixels, drawn s CSS px per art pixel (P unless a featured sprite asks for a whole multiple). */
export const svg = (w, h, body, s = P, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * s}" height="${h * s}" shape-rendering="crispEdges"${attrs}>${body}</svg>`
/** Markup → a CSS url() of a data URI. */
export const uri = (markup) => `url("data:image/svg+xml,${encodeURIComponent(markup)}")`

/** A seeded random (Park–Miller), so the stars and the pebbles sit in the same place on every load. */
export function rng(seed) {
  let s = seed % 2147483647 || 1
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

// ---------------------------------------------------------------- dithered gradients

/**
 * A vertical gradient the pixel-art way, as an SVG tile w art pixels wide: hard bands, each change dithered over three
 * steps of t rows (three quarters, a half, a quarter of the color above: the 2 × 2 ordered patterns). bands: [[color,
 * rows], …] top first. Returns { svg, h }.
 */
export function bands(list, t = 2, w = 4) {
  // A wide tile spells its dithered rows as one rect over a 2 × 1 pattern each, not pixel by pixel: the same pixels, a
  // fraction of the markup (the bedrock's 344 columns made art.css 77% of its weight). Ids are local to this one svg.
  const wide = w >= 16
  const patterns = new Map()
  const every = (color, odd) => {
    const key = `${color}${odd}`
    if (!patterns.has(key)) patterns.set(key, `<pattern id="d${patterns.size}" width="2" height="1" patternUnits="userSpaceOnUse"><path fill="${color}" d="M${odd} 0h1v1h-1z"/></pattern>`)
    return `url(#d${[...patterns.keys()].indexOf(key)})`
  }
  const r = []
  let y = 0
  list.forEach(([c, h], i) => {
    r.push([0, y, w, h, c])
    if (i) {
      const up = list[i - 1][0]
      for (let k = 0; k < 3 * t && k < h; k++) {
        const step = Math.floor(k / t)
        const yy = y + k
        if (wide) {
          // three quarters: whole even rows, every even pixel of the odd; a half: alternate pixels; a quarter: even only
          if (step === 0 && !(yy % 2)) r.push([0, yy, w, 1, up])
          else if (step === 1) r.push([0, yy, w, 1, every(up, yy % 2)])
          else if (!(yy % 2) || step === 0) r.push([0, yy, w, 1, every(up, 0)])
          continue
        }
        for (let x = 0; x < w; x++) {
          const on = step === 0 ? !(x % 2 && yy % 2) : step === 1 ? (x + yy) % 2 === 0 : !(x % 2) && !(yy % 2)
          if (on) r.push([x, yy, 1, 1, up])
        }
      }
    }
    y += h
  })
  const defs = patterns.size ? `<defs>${[...patterns.values()].join('')}</defs>` : ''
  return { svg: svg(w, y, defs + rects(r)), h: y }
}

// ---------------------------------------------------------------- the building's stone and brick

/** The wall's brick, the plugin's own tile (svg-kit BRICK_TILE): 16 × 12, four staggered courses, each brick lit on top. */
export function brickTile() {
  const tone = { base: [C.bHi, K.brick], dark: [C.bDk, C.bDk2], light: [C.bLt, C.bLt2] }
  const courses = [[3, ['base', 'dark']], [7, ['light', 'base']], [3, ['dark', 'base']], [7, ['base', 'light']]]
  const r = []
  courses.forEach(([j, tones], c) => {
    const y = c * 3
    tones.forEach((t, i) => {
      const x0 = (j + 1 + i * 8) % 16
      const [hi, lo] = tone[t]
      for (const [x, w] of x0 + 7 <= 16 ? [[x0, 7]] : [[x0, 16 - x0], [0, x0 - 9]]) r.push([x, y, w, 1, hi], [x, y + 1, w, 1, lo])
    })
    r.push([0, y + 2, 16, 1, K.mortar], [j, y, 1, 2, K.mortar], [j + 8, y, 1, 2, K.mortar])
  })
  return svg(16, 12, rects(r))
}

/**
 * A corner's quoins, the plugin's own, w wide, one 12-row tile: a long stone block and a short
 * one, each two brick courses tall, lit on top and on the left, shaded under and on the right, toothed into the wall
 * (the short block leaves the wall's brick showing on its inner side). side: 'l' or 'r'.
 */
export function quoinTile(w, side) {
  const s = w > 4 ? w - 2 : w - 1
  const r = []
  const block = (y, bw) => {
    const x = side === 'l' ? 0 : w - bw
    r.push([x, y, bw, 5, C.stF], [x, y, bw, 1, C.stHi], [x, y, 1, 5, C.stHi], [x + bw - 1, y + 1, 1, 4, C.stD], [x, y + 4, bw, 1, C.stD],
      [x, y + 5, bw, 1, K.mortar])
  }
  block(0, w)
  block(6, s)
  return svg(w, 12, rects(r))
}

/**
 * The cornice under the parapet, a 24-wide tile, 9 rows: the crown molding (lit top, face), its drip, a row of dentils
 * on their dark bed with a modillion every 24, the bed molding and its shade. The ends step back (CSS clip-path).
 */
export function corniceTile() {
  const r = [[0, 0, 24, 1, C.stHi], [0, 1, 24, 2, C.stF], [0, 3, 24, 1, C.stD], [0, 4, 24, 3, C.bed], [0, 7, 24, 1, C.stF], [0, 8, 24, 1, C.stD]]
  for (let x = 0; x < 24; x += 3) r.push([x, 4, 2, 2, C.stF], [x, 4, 2, 1, C.stHi], [x, 6, 2, 1, C.stD])
  // the modillion: a bracket under the drip, lit on the left
  r.push([10, 3, 5, 4, C.stF], [10, 3, 1, 4, C.stHi], [14, 3, 1, 4, C.stD], [10, 6, 5, 1, C.stD], [11, 3, 3, 1, C.stHi])
  return svg(24, 9, rects(r))
}

/** Wood planks for the lobby floor, seen from the front: the lit top board, the boards, their joints. */
export function plankTile(theme) {
  const day = theme === 'day'
  const a = day ? '#a8895a' : C.wood, b = day ? '#9a7b4f' : '#8c6f47', j = C.woodD
  return svg(24, 8, rects([[0, 0, 24, 1, day ? '#c39f6c' : '#b08d5c'], [0, 1, 24, 3, a], [0, 4, 24, 1, j], [0, 5, 24, 3, b],
    [7, 1, 1, 3, j], [19, 5, 1, 3, j]]))
}

/** The sidewalk's slabs (24 × 12): a lit kerb line on top, slabs with their joints, the edge in shade. */
export function walkTile() {
  return svg(24, 12, rects([[0, 0, 24, 1, '#6a625a'], [0, 1, 24, 10, K.walk], [0, 1, 24, 1, '#625a52'], [23, 1, 1, 10, K.walkD],
    [0, 11, 24, 1, K.walkD], [4, 5, 1, 1, '#4e4741'], [15, 8, 2, 1, '#4e4741']]))
}

/** Soil with pebbles, a w × h tile (the plugin's grit: two uneven dashes). */
export function soilTile(w = 64, h = 12, seed = 5, base = C.soil) {
  const rnd = rng(seed)
  const r = [[0, 0, w, h, base]]
  for (let i = 0; i < w * h / 26; i++) r.push([Math.floor(rnd() * (w - 2)), Math.floor(rnd() * h), 2, 1, rnd() < 0.5 ? C.pebble : C.pebbleD])
  return svg(w, h, rects(r))
}

/**
 * The ground under the commits line, a 344 × 360 tile: bedrock darkening with depth in dithered strata, pebbles thinning
 * out as it goes, and here and there a crystal in one of the cast's colors.
 */
export function deepTile() {
  const W = 344
  const strata = bands([['#151210', 40], ['#110f0d', 70], ['#0e0c0b', 80], ['#0b0a09', 90], ['#090807', 80]], 3, W)
  const rnd = rng(17)
  const r = []
  for (let i = 0; i < 520; i++) {
    const y = Math.floor(Math.pow(rnd(), 1.8) * 340) + 2, x = Math.floor(rnd() * (W - 2))
    r.push([x, y, rnd() < 0.3 ? 1 : 2, 1, y < 120 ? (rnd() < 0.5 ? C.pebble : C.pebbleD) : '#1a1714'])
  }
  const hues = [['#f0a07f', C.clawd, '#8a4a34'], ['#9fb6fa', '#5a80f0', '#2c3f8a'], ['#c4a8f6', '#a983f2', '#5a3f8f'], ['#bdf3ff', '#6fe3ff', '#2a7f99'], ['#ffe9a0', C.gold, C.goldD]]
  for (const [x, y, k] of [[38, 84, 0], [251, 141, 1], [137, 236, 2], [312, 297, 3], [71, 331, 4]]) {
    const [l, c, d] = hues[k]
    r.push([x + 1, y, 1, 1, l], [x, y + 1, 1, 2, l], [x + 1, y + 1, 1, 2, c], [x + 2, y + 1, 1, 2, d], [x + 1, y + 3, 1, 1, d])
  }
  return strata.svg.replace('</svg>', rects(r) + '</svg>')
}

// The ground in section under the street, the trailer's (promo/finale.mjs underground): soil in four bands, darker
// down, then the bedrock's
export const SOIL = ['#3b2b21', '#2d2119', '#251b15', '#1f1814']
/** The soil's bands as a tile 4 wide, SOIL.length × 40 rows: each seam checkered a row each side. */
export function soilBands(band = 40) {
  const r = SOIL.map((c, k) => [0, k * band, 4, band, c])
  for (let k = 1; k < SOIL.length; k++) {
    const y = k * band
    r.push([1, y - 1, 1, 1, SOIL[k]], [3, y - 1, 1, 1, SOIL[k]], [0, y, 1, 1, SOIL[k - 1]], [2, y, 1, 1, SOIL[k - 1]])
  }
  return svg(4, SOIL.length * band, rects(r))
}
/** The soil's last band dithered into what is under it, two rows (half, then a quarter): a 4 × 2 tile. */
export const seamTile = () => svg(4, 2, rects([[0, 0, 1, 1, SOIL.at(-1)], [2, 0, 1, 1, SOIL.at(-1)], [2, 1, 1, 1, SOIL.at(-1)]]))
/** Stones in the soil, a w × h tile: pebbles (some lit on top) and here and there a rock lit along its top. */
export function stonesTile(w = 128, h = 160, seed = 5) {
  const rnd = rng(seed)
  const r = []
  for (let i = 0; i < w / 3; i++) {
    const x = Math.floor(rnd() * (w - 2)), y = Math.floor(1 + rnd() * (h - 2))
    r.push([x, y, i % 3 ? 2 : 1, 1, '#574231'])
    if (i % 3 === 1) r.push([x, y - 1, 1, 1, '#6b5440'])
  }
  for (let i = 0; i < Math.round(w / 40); i++) {
    const x = Math.floor(rnd() * (w - 4)), y = Math.floor(8 + rnd() * (h - 12))
    r.push([x + 1, y, 2, 1, '#6b5440'], [x, y + 1, 4, 2, '#4a3a2c'], [x + 1, y + 1, 2, 1, '#574231'])
  }
  return svg(w, h, rects(r))
}

/** The neon's light on the coping under the sign by night: warm pixels on the stone, thinning out to the sides. 320 × 3. */
export function spillTile() {
  const r = []
  for (let y = 0; y < 3; y++) for (let x = 0; x < 320; x++) {
    const d = Math.abs(x + 0.5 - 160) / 160
    const on = d < 0.45 ? (x + y) % 2 === 0 : d < 0.8 ? x % 2 === 0 && y % 2 === 0 : false
    if (on && !(y === 2 && d > 0.45)) r.push([x, y, 1, 1, y === 0 ? '#e0c890' : y === 1 ? '#a8905f' : '#7a6440'])
  }
  return svg(320, 3, rects(r))
}

// ---------------------------------------------------------------- 9-slice frames

/**
 * A frame as a char map, t rings deep (outside first), each ring [top-left char, bottom-right char, corner char]: the
 * outer corners stepped in by `notch`. The center is a hole, unless `face` names its char. → rows (2t + 1 square).
 */
export function ringMap(rings, notch = 1, face = '.') {
  const t = rings.length, n = 2 * t + 1
  const rows = []
  for (let y = 0; y < n; y++) {
    let row = ''
    for (let x = 0; x < n; x++) {
      const d = Math.min(x, y, n - 1 - x, n - 1 - y)
      const cx = Math.min(x, n - 1 - x), cy = Math.min(y, n - 1 - y)
      if (cx + cy < notch) { row += '.'; continue }
      if (d >= t) { row += face; continue }
      const [tl, br, mid] = rings[d]
      const top = y === d, left = x === d, bottom = y === n - 1 - d, right = x === n - 1 - d
      row += (top && right) || (bottom && left) ? (mid ?? tl) : top || left ? tl : br
    }
    rows.push(row)
  }
  return rows
}

/** A 9-slice from a char map whose slices are all t: the CSS custom property value (url) and the slice in px. */
export const nine = (rows, legend) => uri(svg(rows[0].length, rows.length, pix(rows, legend)))

/**
 * A lit plate as a 9-slice, the plugin's own (lib/svg-kit.mjs litPlate): its corners rounded off, its top row lit, its
 * foot shaded, its shadow on the wall a row under it, a pixel to the right. For
 * `border-image: <this> 4 6 6 4 fill / 4px 6px 6px 4px stretch` (style.css, a lit plate).
 */
export function plateFrame(fill, lit = mix(fill, '#ffffff', 0.4), shade = mix(fill, '#000000', 0.22)) {
  return uri(svg(7, 7, pix(['.LLLL..', 'FFFFFF.', 'FFFFFF.', 'FFFFFF.', 'FFFFFF.', '.SSSS..'], { L: lit, F: fill, S: shade }) +
    '<path fill="#000" fill-opacity=".35" d="M1 6h6v1h-6z"/>'))
}

/**
 * A pixel button's frame, 5 wide: the dark outline with its corners stepped in, the lit bevel top-left, the shade
 * bottom-right and the depth it stands on, with `air` rows of nothing over it (room to rise on hover). Raised, hovered
 * (a pixel higher, its side a pixel deeper) and pressed (sunk to the bottom, the bevel turned round): every state is
 * as tall, so the face moves and the page does not. Colors: o outline, h light, s shade, d depth.
 */
export function buttonFrames({ o, h, s, d }, air = 1, depth = 2) {
  const leg = { O: o, h, s, d }
  const make = (a, D, down) => {
    const rows = [...Array(a).fill('.....'), '.OOO.']
    if (down) rows.push('OsssO', 'Os.hO', 'OhhhO')
    else rows.push('OhhhO', 'Oh.sO', 'OsssO', ...Array(D).fill('OdddO'))
    rows.push('.OOO.')
    return { url: nine(rows, leg), top: (a + 2) * P, bottom: (down ? 2 : D + 2) * P }
  }
  return { up: make(air, depth), hover: make(air - 1, depth + 1), down: make(air + depth, 0, true) }
}

// ---------------------------------------------------------------- the cast

/** A character of the cast (data.js CAST) as an inline SVG at a whole scale; its eyes on top in their own group (blink). */
export function castSvg(c, scale, attrs = '') {
  const eyes = Object.fromEntries([...c.eyes].map((e) => [e, c.eye]))
  return svg(c.sprite[0].length, c.sprite.length, `<g class="body">${pix(c.sprite, c.legend)}</g><g class="eyes">${pix(c.sprite, eyes)}</g>`, scale, ` aria-hidden="true"${attrs}`)
}
/** A sprite map at 1.5×, as the plugin draws the people in its scenes (lib/svg-kit.mjs at15): its rows and columns alternate 1 and 2 pixels. */
export function at15(rows) {
  const up = (i) => i + (i >> 1)
  return rows.flatMap((row, y) => {
    const line = [...row].map((ch, x) => ch.repeat(up(x + 1) - up(x))).join('')
    return Array.from({ length: up(y + 1) - up(y) }, () => line)
  })
}
/** A cast member's mini (11 × 6) or micro (7 × 5) map with its eyes painted in. */
export function castSmall(c, kind, ox = 0, oy = 0) {
  const leg = { ...c.legend, ...Object.fromEntries([...c.eyes].map((e) => [e, c.miniEye])) }
  return pix(c[kind], leg, ox, oy)
}

// ---------------------------------------------------------------- the neon

/**
 * THE OFFICE in neon (data.js NEON, its own 95 × 17 grid), painted as the plugin paints it, its glow in flat colors
 * mixed over the sign's board: the outer ring (glow[1]), the inner (glow[0]), each word's glass (its line stroked 2
 * wide), the lit core; the tired letter's glass goes dark now and then (.flick). The ring colors come from classes
 * (.ng1, .ng2), so the page's sky picks them.
 */
export function neonSvg(scale) {
  const body = `<path class="ng2" d="${NEON.glow[1]}"/><path class="ng1" d="${NEON.glow[0]}"/>` +
    NEON.d.map((d) => `<path d="${d}" fill="none" stroke="${NEON_INK.glass}" stroke-width="2"/><path d="${d}" fill="${NEON_INK.core}"/>`).join('') +
    `<path class="flick" d="${NEON.flick}" fill="none" stroke="${NEON_INK.off}" stroke-width="2"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${NEON.w} ${NEON.h}" width="${NEON.w * scale}" height="${NEON.h * scale}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`
}

/** The neon's glow rings over a board color, by night (both rings) and by day (the inner ring, faint). */
export function neonGlow(board) {
  return {
    night: [mix(board, NEON_INK.glass, 0.278), mix(board, NEON_INK.glass, 0.12)],
    day: [mix(board, NEON_INK.glass, 0.08), board],
  }
}

/** A row of marquee bulbs, a 16 × 4 tile with two sockets; `lit` says which of the two is on (0, 1) or none (-1). */
export function bulbTile(lit) {
  const bulb = (x, on) => [[x, 0, 4, 4, '#2a2218'], [x, 0, 1, 1, ''], [x + 1, 1, 2, 2, on ? C.glass : '#4a3f26'], [x + 1, 1, 1, 1, on ? C.hot : '#5e5130'],
    [x + 2, 2, 1, 1, on ? '#d9a21c' : '#3a3120']]
  const r = [...bulb(2, lit === 0), ...bulb(10, lit === 1)].filter((q) => q[4])
  // the sockets' stepped corners
  const cut = [[2, 0], [5, 0], [2, 3], [5, 3], [10, 0], [13, 0], [10, 3], [13, 3]]
  return svg(16, 4, rects(r) + cut.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="#17120e"/>`).join(''))
}

// ---------------------------------------------------------------- the sky's bodies (the promo's: promo/finale.mjs)

/** Pixels [[x, y], …] → one <path> of their runs, row by row, in `fill` (at `op` opacity: a halo's light). */
function dots(pts, fill, op) {
  const by = new Map()
  for (const [x, y] of pts) by.set(y, [...(by.get(y) ?? []), x])
  let d = ''
  for (const [y, xs] of by) {
    xs.sort((a, b) => a - b)
    for (let i = 0; i < xs.length;) {
      let j = i
      while (xs[j + 1] === xs[j] + 1) j++
      d += `M${xs[i]} ${y}h${j - i + 1}v1h${-(j - i + 1)}z`
      i = j + 1
    }
  }
  return d ? `<path fill="${fill}"${op ? ` fill-opacity="${op}"` : ''} d="${d}"/>` : ''
}
/** The pixels round (0, 0) out to `n` that `keep(x, y, r)` takes, r the distance of the pixel's middle. */
function disc(n, keep) {
  const out = []
  for (let y = -n; y <= n; y++) for (let x = -n; x <= n; x++) if (keep(x, y, Math.hypot(x + 0.5, y + 0.5))) out.push([x, y])
  return out
}
// The sun at noon [core, rim, halo]: 16 across with its rim, a half then a quarter checker of light round it
const SUN = ['#fff1b8', '#ffd36b', '#ffe08a']
// The moon's light, band by band outward from its crescent (the plugin's, lib/svg-kit.mjs MOON_LIGHT): [reach, color, opacity]
const MOON_LIGHT = [[1.5, '#e4ebff', 0.34], [2.9, '#b9c9f4', 0.18], [4.3, '#8fa3d8', 0.09]]
const ORB = {
  sun: () => {
    const [core, rim, halo] = ['var(--sun-core, #fff1b8)', 'var(--sun-rim, #ffd36b)', SUN[2]]
    return dots(disc(13, (x, y, r) => r > 10.2 && r <= 12.6 && x % 2 === 0 && y % 2 === 0), halo, 0.55) +
      dots(disc(13, (x, y, r) => r > 8 && r <= 10.2 && (x + y) % 2 === 0), halo, 0.75) + dots(disc(13, (x, y, r) => r > 6.6 && r <= 8), rim) +
      dots(disc(13, (x, y, r) => r <= 6.6), core)
  },
  // a crescent 14 across, its inner edge shaded, its light round the crescent alone, so the bite stays sky
  moon: () => {
    const lit = [], edge = []
    const body = disc(12, (x, y, r) => r <= 7)
    for (const [x, y] of body) {
      const cut = Math.hypot(x + 0.5 - 3.5, y + 0.5 + 2)
      if (cut > 5.8) (cut <= 6.8 ? edge : lit).push([x, y])
    }
    const crescent = [...lit, ...edge], on = new Set(body.map((p) => p.join()))
    const bands = MOON_LIGHT.map(() => [])
    for (const [x, y] of disc(12, () => true)) {
      if (on.has(`${x},${y}`)) continue
      const d = Math.min(...crescent.map(([cx, cy]) => Math.hypot(x - cx, y - cy)))
      bands[MOON_LIGHT.findIndex(([reach]) => d <= reach)]?.push([x, y])
    }
    return bands.map((pts, k) => dots(pts, MOON_LIGHT[k][1], MOON_LIGHT[k][2])).join('') + dots(lit, K.moon) + dots(edge, '#c8bea4')
  },
}
const ORB_N = { sun: 13, moon: 12 }
/** The sun or the moon, haloed, its middle the middle of its box, `scale` CSS px to its pixel. */
export function orbSvg(name, scale = P) {
  const n = ORB_N[name], w = 2 * n + 1
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-n} ${-n} ${w} ${w}" width="${w * scale}" height="${w * scale}" shape-rendering="crispEdges" aria-hidden="true">${ORB[name]()}</svg>`
}

// The clouds: puffs (circles over a base) and streaks (a run a row), lit along their tops and shaded under
export const CLOUDS = {
  puffA: { circles: [[8, 9, 5], [17, 6, 6.5], [27, 5, 6], [35, 8, 5], [40, 11, 3.5]], base: [4, 9, 39, 6] },
  puffB: { circles: [[7, 7, 4.5], [15, 5, 5.5], [24, 6, 5], [29, 8, 4]], base: [3, 7, 29, 5] },
  puffC: { circles: [[6, 8, 4], [13, 6, 5], [21, 4, 6.5], [30, 6, 5], [38, 8, 4.5], [45, 10, 3]], base: [3, 8, 45, 5] },
  streakA: { rows: [[18, 44], [8, 58], [2, 63], [10, 52]] },
  streakB: { rows: [[10, 30], [2, 44], [12, 38]] },
}
/**
 * A cloud of CLOUDS, in the classes the page's sky paints in its light (style.css): its lit rim (.cr), its body (.cb),
 * the two rows over its underside (.cu). → { svg, w, h }
 */
export function cloudSvg(shape, scale = P) {
  const s = CLOUDS[shape], on = new Set()
  if (s.rows) s.rows.forEach(([a, b], y) => { for (let x = a; x <= b; x++) on.add(`${x},${y}`) })
  else {
    for (const [cx, cy, r] of s.circles) {
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) on.add(`${x},${y}`)
    }
    const [bx, by, bw, bh] = s.base
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) on.add(`${x},${y}`)
  }
  const map = [], pts = [...on].map((k) => k.split(',').map(Number))
  const w = Math.max(...pts.map(([x]) => x)) + 1, h = Math.max(...pts.map(([, y]) => y)) + 1
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) row += !on.has(`${x},${y}`) ? '.' : !on.has(`${x},${y - 1}`) ? 'r' : !on.has(`${x},${y + 1}`) || !on.has(`${x},${y + 2}`) ? 'u' : 'b'
    map.push(row)
  }
  return { svg: svg(w, h, pix(map, { b: '.cb', u: '.cu', r: '.cr' }), scale, ' aria-hidden="true"'), w, h }
}

// ---------------------------------------------------------------- the console's big type

// /theoffice in big pixel type, as the promo's console types it: each glyph 7 × 7 in a cell 8 wide
const HERO = {
  '>': ['##.....', '.##....', '..##...', '...##..', '..##...', '.##....', '##.....'],
  '/': ['.....##', '....##.', '....##.', '...##..', '..##...', '.##....', '##.....'],
  t: ['..##...', '..##...', '######.', '..##...', '..##...', '..##...', '...###.'],
  h: ['##.....', '##.....', '##.###.', '###..##', '##...##', '##...##', '##...##'],
  e: ['.......', '.......', '.#####.', '##...##', '#######', '##.....', '.#####.'],
  o: ['.......', '.......', '.#####.', '##...##', '##...##', '##...##', '.#####.'],
  f: ['...###.', '..##...', '######.', '..##...', '..##...', '..##...', '..##...'],
  i: ['..##...', '.......', '.###...', '..##...', '..##...', '..##...', '.####..'],
  c: ['.......', '.......', '.#####.', '##...##', '##.....', '##...##', '.#####.'],
}
/** A word in the big type, in `fill` (a color or a .class), one glyph per 8 pixels, 7 tall; unknown letters are gaps. */
export function heroSvg(text, fill, scale = 2 * P) {
  const rows = Array.from({ length: 7 }, (_, y) => [...text].map((ch) => `${HERO[ch]?.[y] ?? '.......'}.`).join(''))
  return svg(rows[0].length - 1, 7, pix(rows.map((r) => r.slice(0, -1)), { '#': fill }), scale, ' aria-hidden="true"')
}

// ---------------------------------------------------------------- icons

// the buttons' icons, 10 × 10 (X the ink, x the second ink: .i2); the small ones 8 × 8
export const ICON = {
  office: ['.XXXXXXXX.', '.XxxxxxxX.', '.XxXXxxxX.', '.XxxxXXxX.', '.XxXXXxxX.', '.XXXXXXXX.', '....XX....', '..XXXXXX..', 'XXXXXXXXXX', 'X........X'],
  today: ['...XXXX...', '.XX.xx.XX.', '.X..X...X.', 'X...X....X', 'Xx..X...xX', 'X...XXX..X', 'X........X', '.X......X.', '.XX.xx.XX.', '...XXXX...'],
  week: ['....XX....', '..XXXXXX..', '..XxXXxX..', '..XXXXXX..', '..XxXXxX..', '..XXXXXX..', '..XxXXxX..', '..XXXXXX..', '..XxXXxX..', 'XXXXXXXXXX'],
  month: ['.X.X..X.X.', 'XXXXXXXXXX', 'XXXXXXXXXX', 'X........X', 'X.x.x.x..X', 'X........X', 'X.x.x.xX.X', 'X......X.X', 'X.x.x....X', 'XXXXXXXXXX'],
  work: ['......XX.X', '.....XX..X', '.....XXXXX', '....XXXx..', '...XXXx...', '..XXXx....', '.XXXx.....', 'XXXx......', 'X.XX......', 'X..X......'],
  install: ['....XX....', '....XX....', '....XX....', '....XX....', '.XXXXXXXX.', '..XXXXXX..', '...XXXX...', 'X...XX...X', 'X........X', 'XXXXXXXXXX'],
  cat: ['X........X', 'XX......XX', 'XXXXXXXXXX', 'XXXXXXXXXX', 'XX.XXXX.XX', 'XXxXXXXxXX', 'XXXX..XXXX', '.XXXXXXXX.', '..XXXXXX..', '..........'],
  // the install console's two ways in: a terminal for Claude Code, a monitor on its stand for Claude Desktop
  terminal: ['XXXXXXXXXX', 'XXXXXXXXXX', 'X........X', 'X.x......X', 'X..x.....X', 'X...x....X', 'X..x.....X', 'X.x.xxxx.X', 'X........X', 'XXXXXXXXXX'],
  desktop: ['XXXXXXXXXX', 'X........X', 'X.xxxxx..X', 'X........X', 'X.xxx....X', 'X........X', 'XXXXXXXXXX', '....XX....', '...XXXX...', '.XXXXXXXX.'],
  copy: ['XXXXX...', 'X...X...', 'X.XXXXXX', 'X.X....X', 'XXX....X', '..X....X', '..X....X', '..XXXXXX'],
  check: ['........', '.......X', '......XX', 'X....XX.', 'XX..XX..', '.XXXX...', '..XX....', '........'],
}
/** An icon as inline SVG in the button's ink (currentColor) and its second ink (.i2). */
export function iconSvg(name, scale = P) {
  const rows = ICON[name]
  return svg(rows[0].length, rows.length, pix(rows, { X: 'currentColor', x: '.i2' }), scale, ' aria-hidden="true" class="ico"')
}

/** The toggle's sun and moon, 10 × 10, each in its own two inks (.sun1/.sun2, .moon1/.moon2), so the lit one shows. */
export function toggleIcons() {
  const sun = ['....yy....', '.y......y.', '...YYYY...', '..YZYYYY..', 'y.YYYYYY.y', 'y.YYYYYY.y', '..YYYYYY..', '...YYYY...', '.y......y.', '....yy....']
  const moon = ['...mmmm...', '.mmmmm....', '.mmmM.....', 'mmmM......', 'mmmM......', 'mmmM......', 'mmmM......', '.mmmM.....', '.mmmmm....', '...mmmm...']
  return {
    sun: svg(10, 10, pix(sun, { Y: '.sun1', Z: '.sun0', y: '.sun2' }), P, ' aria-hidden="true" class="tg-sun"'),
    moon: svg(10, 10, pix(moon, { m: '.moon1', M: '.moon2' }), P, ' aria-hidden="true" class="tg-moon"'),
  }
}

// ---------------------------------------------------------------- the roof (lib/svg-roof.mjs's own props)

const rows = (n, row) => Array(n).fill(row)
// the water tower (16 × 24): staves lit on the left under a slate cone, hoops, a ladder, the legs and the riser
const TOWER_WOOD = [...rows(8, ''), '.vvvvvvvvvvvvvk.', ...rows(7, '.wLLvwwvWWvWkkk.'), 'vvvvvvvvvvvvvvvk']
const TOWER_STEEL = [
  '.......Ff.......', '......Aabb......', '.....Aaabbb.....', '....Aaaabbbb....', '...Aaaaabbbbb...', '..Aaaaaabbboob..',
  '.Aaaaaaabbbeebb.', 'eeeeeeeeeeeeeeee', '...........q.q..', '...........qQq..', '.hHHhhhhhhhqgqg.', '...........q.q..',
  '...........qQq..', '...........q.q..', '.hHHhhhhhhhqgqg.', '...........qQq..', '................', '.eeeeeeeeeeeeee.',
  '..qg..xrRx..qg..', '..qg.x.rR.x.qg..', '..qgx..rR..xqg..', '..qg...rR...qg..', '..qg...rR...qg..', '..qg...rR...qg..',
]
const TOWER_LEG = {
  w: '#a37c4b', L: '#bf955c', W: '#8a6840', v: '#6b5032', k: '#4b3a2c', F: '#c4c9cf', f: '#6d7279', A: '#8a8f96',
  a: '#6d7279', b: '#4a4e55', o: '#5d6168', e: '#2b2e33', H: '#a4a9b0', h: '#6d7279', g: '#4a4e55', q: '#8a8f96',
  Q: '#c4c9cf', x: '#4a4e55', r: '#6d7279', R: '#4a4e55',
}
// the AC unit (15 × 10): a steel box, a fan grille and a louvre block, a copper line down its side
const AC = ['TTTTTTTTTTTTt..', 'aAAAAAAAAAAAs..', 'aAvvvAAvvvvvs..', 'aAvkvAAvuuuvscC', 'aAvvvAAvvvvvs.c', 'aAAkAAAvuuuvs.c', 'aAAAAAAvvvvvs.c',
  'ddddddddddddd.c', '.d.........d..c', '.d.........d..c']
const AC_LEG = { T: '#c4c9cf', t: '#8a8f96', a: '#a4a9b0', A: '#8a8f96', s: '#6d7279', d: '#5d6168', c: '#c27c45', C: '#8a5228', v: '#4a4e55', k: '#2b2e33', u: '#b4b9c0' }
// a mushroom vent (5 × 8)
const VENT = ['.TAa.', 'TAaab', 'bbbbd', '.kmk.', '.LPd.', '.LPd.', '.LPd.', '.LPd.']
const VENT_LEG = { T: '#dde1e6', A: '#a4a9b0', a: '#8a8f96', b: '#6d7279', d: '#4a4e55', k: '#2b2e33', m: '#5d6168', L: '#a4a9b0', P: '#7d828a' }
// the lattice antenna (7 × 23) in aviation bands, its beacon on top (lit, blinking, by night: .beacon)
const ANT = ['', '...M', '...m', 'aaAm', '...m', '...mAaa', '...m', '..OOo', '..O.o', '..Oxo', '..O.o', '..Oxo', '.E.z.e', '.E...e', '.Ez.ze', '.E...e',
  '.E.z.e', 'O.x.x.o', 'O.....o', 'Ox...xo', 'O.x.x.o', 'O..x..o', 'OOOOOOo']
const ANT_LEG = { M: '#a4a9b0', m: '#8a8f96', a: '#6d7279', A: '#8a8f96', O: '#e0603f', o: '#a8452c', x: '#b9502f', E: '#ece6da', e: '#b5ad9f', z: '#a49c8e' }
// the satellite dish (18 × 18), four layers: the bowl's back, its rim, its inside, the arm and the post
const DISH = [
  ['', '', '', '.kkkkk', 'kkkkkk', 'kkkkkk', 'kkkkkk', 'kkkkkk', '.kkkkk', '..kkkkk', '..kkkkkkk', '....kkkkkk', '.....kkkk'],
  ['', '...rrrrr', '..rrrrrrr', '..rrrrrrrr', '..rrrrrrrrr', '..rrrrrrrrrr', '..rrrrrrrrrr', '...rrrrrrrrr', '....rrrrrrrr', '.....rrrrrrr', '......rrrrr'],
  ['', '', '...IIIII', '...IIIIii', '...IIIiiii', '...IIiiiiii', '...Iiiiiiii', '....iiiiiii', '.....iiiiii', '......iiiii'],
  ['', '.............nn', '............aIA', '...........a', '..........a', '.........a', '........a', '', '', '', '', '', '', '......aA', '......yA', '....aaaAAA', '....aaaAAA', '....aaaAAA'],
]
const DISH_LEG = { k: '#5d6168', r: '#eef0f2', I: '#9aa0a8', i: '#c9cdd3', n: '#9aa0a8', a: '#6d7279', A: '#4a4e55', y: '#ffcf2e' }
// a pigeon on the coping (6 × 4), facing left
const PIGEON = ['.nn...', 'eNggg.', '..gGgt', '...yy.']
const PIGEON_LEG = { n: '#8a90a0', N: '#6fa59a', e: '#2e2620', g: '#9aa0ae', G: '#7a8090', t: '#4a4e5a', y: '#c0705a' }

/** The roof's props, as inline SVGs at P. */
export function roofProps() {
  const [cat, catLeg] = PROPS.cat
  return {
    tower: svg(16, 24, pix(TOWER_WOOD, TOWER_LEG) + pix(TOWER_STEEL, TOWER_LEG), P, ' aria-hidden="true"'),
    ac: svg(15, 10, pix(AC, AC_LEG), P, ' aria-hidden="true"'),
    vent: svg(5, 8, pix(VENT, VENT_LEG), P, ' aria-hidden="true"'),
    antenna: svg(7, 23, pix(ANT, ANT_LEG) + '<rect class="beacon" x="3" y="0" width="1" height="1"/>', P, ' aria-hidden="true"'),
    dish: svg(18, 18, DISH.map((m) => pix(m, DISH_LEG)).join(''), P, ' aria-hidden="true"'),
    pigeon: svg(6, 4, pix(PIGEON, PIGEON_LEG), P, ' aria-hidden="true"'),
    cat: svg(12, 6, pix(cat, catLeg), P, ' aria-hidden="true"'),
  }
}

/** The sign's truss leg, an 8 × 8 tile: two rails (the left one lit) and their X bracing. */
export function trussTile() {
  return svg(8, 8, pix(['LXXXXXXR', 'L.x..x.R', 'L..xx..R', 'L..xx..R', 'L.x..x.R', 'Lx....xR', 'LXXXXXXR', 'Lx....xR'],
    { L: '#8a8f96', R: '#4a4e55', X: '#5d6168', x: '#4a4e55' }))
}

// ---------------------------------------------------------------- lobby, basement, street

/** A pendant lamp (9 × 10): its cord, a brass shade lit on the left, the bulb (.lamp, lit by night). */
export function pendantSvg() {
  return svg(9, 10, pix(['....c....', '....c....', '....c....', '....c....', '...hhh...', '..hHHHs..', '.hHHHHHs.', 'sssssssss', '...bbb...', '....b....'],
    { c: '#2b2622', h: C.brassH, H: C.brass, s: C.brassD, b: '.lamp' }), P, ' aria-hidden="true"')
}

/**
 * The lobby's wall: a brass clock (14 × 14, a quarter past twelve), Clawd as the employee of the month in a gilt frame
 * (24 × 18) and a landscape in a wooden one (24 × 16): the sun over two green hills.
 */
export function lobbyDecor() {
  const clock = []
  for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
    const d = Math.hypot(x + 0.5 - 7, y + 0.5 - 7)
    if (d <= 6.9) clock.push([x, y, 1, 1, d > 5.7 ? (x + y < 13 ? C.brassH : C.brassD) : C.ucream])
  }
  clock.push([6, 2, 2, 1, '#6d6250'], [6, 11, 2, 1, '#6d6250'], [2, 6, 1, 2, '#6d6250'], [11, 6, 1, 2, '#6d6250'],
    [6, 3, 1, 4, C.iron], [7, 6, 3, 1, C.iron], [6, 6, 2, 2, C.ask])
  const frame = (w, h, [hi, mid, lo, out]) => [[0, 0, w, h, out], [1, 1, w - 2, h - 2, lo], [1, 1, w - 3, 1, hi], [1, 1, 1, h - 3, hi], [2, 2, w - 4, h - 4, mid]]
  const portrait = [...frame(24, 18, ['#fff0a0', C.gold, C.goldD, '#5a3f14']), [3, 3, 18, 12, '#6b2f2a'], [3, 3, 18, 3, '#7d3a33']]
  const painting = [...frame(24, 16, ['#b08d5c', C.wood, C.woodD, '#3e2c1f']), [3, 3, 18, 10, '#a3d0f1'], [3, 3, 18, 3, '#89bfe9'],
    [15, 4, 3, 3, C.sun], [3, 9, 18, 4, '#4f7f34'], [3, 8, 9, 1, '#6f9a45'], [4, 7, 6, 1, '#6f9a45'], [12, 10, 9, 1, '#9ab86a'], [14, 9, 5, 1, '#9ab86a']]
  return {
    clock: svg(14, 14, rects(clock), P, ' aria-hidden="true"'),
    portrait: svg(24, 18, rects(portrait) + castSmall(CAST[0], 'mini', 7, 8), P, ' aria-hidden="true"'),
    painting: svg(24, 16, rects(painting), P, ' aria-hidden="true"'),
  }
}

/** A street lamp (11 × 44): a cast-iron post on its base, the lantern on top (.lamp glass, lit by night). */
export function streetLampSvg() {
  const head = ['...kkkkk...', '..kKKKKKk..', '.kkkkkkkkk.', '..kGGGGGk..', '..kGgGGGk..', '..kGGGGGk..', '..kGGGGGk..', '...kkkkk...', '....kKk....']
  const post = [...rows(28, '....kKk....'), '...kkKkk...', '...kKKKk...', '..kkKKKkk..', '..kKKKKKk..', '.kkkkkkkkk.', '.kKKKKKKKk.', 'kkkkkkkkkkk']
  return svg(11, 44, pix([...head, ...post], { k: '#1a1714', K: '#3a332d', G: '.lamp', g: '.lamp2' }), P, ' aria-hidden="true"')
}

// ---------------------------------------------------------------- the three facts' rooms

/**
 * LIVE: a desk, a monitor whose code types itself (frames .t1 .t2 .t3), Clawd behind the desk at the keyboard, his arms
 * up and down in turn as he types (.armA / .armB). 48 × 30.
 */
export function liveScene(scale = P) {
  const c = CAST[0]
  const r = [
    // the monitor: bezel lit on its top and left, the screen, the stand
    [2, 4, 20, 14, '#2b2e33'], [2, 4, 20, 1, '#4a4e55'], [2, 4, 1, 14, '#4a4e55'], [4, 6, 16, 10, '#0b1a2e'],
    [10, 18, 4, 3, '#4a4e55'], [7, 20, 10, 1, '#5d6168'],
    // the desk: its top lit, its front, the drawer, the legs
    [0, 21, 48, 2, C.wood], [0, 21, 48, 1, '#b08d5c'], [1, 23, 46, 5, C.woodD], [3, 24, 10, 2, '#5e4930'], [7, 25, 2, 1, C.brass], [2, 28, 3, 2, C.woodD], [43, 28, 3, 2, C.woodD],
    // a mug
    [42, 17, 4, 4, C.ask], [42, 17, 4, 1, '#f09a84'], [46, 18, 1, 2, C.ask],
  ]
  const code = (k, lines) => `<g class="t${k}">${rects(lines.map(([x, y, w, col]) => [x, y, w, 1, col]))}</g>`
  const g = C.busy, w = '#cfd8e6', b = '#6f91dc', y = C.accent
  const screen = code(1, [[5, 7, 6, g], [6, 9, 9, w], [6, 11, 5, b], [5, 13, 3, y]]) +
    code(2, [[5, 7, 6, g], [6, 9, 9, w], [6, 11, 5, b], [5, 13, 7, y], [13, 13, 1, C.hot]]) +
    code(3, [[5, 7, 6, g], [6, 9, 9, w], [6, 11, 11, b], [5, 13, 7, y], [6, 15, 2, w]])
  // Clawd behind the desk: his sprite's rows 0–7 without the arms, his eyes, then the keyboard in front of him
  const X = 25, Y = 13
  const body = c.sprite.slice(0, 8).map((row, i) => (i === 4 || i === 5 ? '..' + row.slice(2, 15) + '..' : row))
  const clawd = pix(body, c.legend, X, Y) + pix(body, { E: c.eye }, X, Y) + rects([[X + 2, 20, 13, 1, C.s2], [X + 2, 19, 13, 1, C.s4]])
  // his arms: out at his sides (rows 4–5), then down on the keys
  const arm = (dy) => rects([[X, Y + 4 + dy, 2, 2, C.clawd], [X + 15, Y + 4 + dy, 2, 2, C.clawd]])
  return svg(48, 30, rects(r) + screen + clawd + `<g class="armA">${arm(0)}</g><g class="armB">${arm(1)}</g>`, scale, ' aria-hidden="true"')
}

/** EVERY AGENT: a little office building, a micro character of the cast in each of its windows (3 × 3 fits the 9 of the cast). 40 × 30. */
export function crowdScene(scale = P) {
  const r = [
    [4, 2, 32, 26, '#5a4334'], [4, 2, 32, 1, '#6b503f'], [3, 1, 34, 2, C.stF], [3, 1, 34, 1, C.stHi], [4, 2, 1, 26, '#6b503f'], [35, 3, 1, 25, '#47342a'],
    [0, 28, 40, 2, '#3a332d'], [0, 28, 40, 1, '#58514a'],
    // the door
    [17, 21, 6, 7, '#2a211b'], [18, 22, 4, 6, C.warm], [19, 22, 2, 6, '#ffe7b0'],
  ]
  // windows: 3 per row, a micro character (7 × 5) in each
  let cast = ''
  CAST.forEach((c, i) => {
    const wx = 7 + (i % 3) * 9, wy = 5 + Math.floor(i / 3) * 8
    r.push([wx - 1, wy - 1, 9, 7, '#2a211b'], [wx, wy, 7, 5, i % 2 ? '#7a4c30' : '#8d5a38'], [wx - 1, wy + 6, 9, 1, C.sill])
    cast += castSmall(c, 'micro', wx, wy)
  })
  return svg(40, 30, rects(r) + cast, scale, ' aria-hidden="true"')
}

/** LOCAL: a computer on its desk, a padlock shut on its screen, no cable going anywhere. 44 × 30. */
export function localScene(scale = P) {
  const r = [
    [8, 2, 26, 18, '#2b2e33'], [8, 2, 26, 1, '#4a4e55'], [8, 2, 1, 18, '#4a4e55'], [10, 4, 22, 14, '#0b1a2e'],
    [18, 20, 6, 2, '#4a4e55'], [14, 22, 14, 1, '#5d6168'],
    [0, 23, 44, 2, C.wood], [0, 23, 44, 1, '#b08d5c'], [1, 25, 42, 3, C.woodD], [2, 28, 3, 2, C.woodD], [39, 28, 3, 2, C.woodD],
    // the tower under the desk's edge, its LED
    [36, 13, 6, 10, '#3a3d44'], [36, 13, 6, 1, '#5d6168'], [37, 15, 4, 1, '#2b2e33'], [37, 17, 4, 1, '#2b2e33'], [38, 20, 1, 1, C.busy],
  ]
  // the padlock on the screen (the "game" design's): its steel shackle, the gold body lit on its upper left, the keyhole
  const lock = pix(['...KKKKK...', '..KKsssKK..', '..Ks...sK..', '..Ks...sK..', 'KKKKKKKKKKK', 'KWYYYYYYYyK', 'KYYYYKYYYyK', 'KYYYYKYYYyK',
    'KYYYYYYYYyK', 'KyyyyyyyyyK', 'KKKKKKKKKKK'], { K: '#1a1626', s: C.s3, Y: C.glass, W: C.hot, y: '#c99a12' }, 16, 5)
  return svg(44, 30, rects(r) + lock, scale, ' aria-hidden="true"')
}
