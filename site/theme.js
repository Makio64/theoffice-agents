// The page's frames, tiles and sky as custom properties: drawn once by build.mjs into art.css, so the first paint has
// them. Everything comes from art.js and sky.js, which draw from the plugin's own data (data.js).
import { CAST, CLOUD_TINTS } from './data.js'
import * as A from './art.js'
import { skyBands, bandTile } from './sky.js'

const { C, uri, svg, rects, pix, ringMap, plateFrame, mix } = A

/**
 * A 9-slice frame from rings of colors, outside first ([top-left, bottom-right, corner]); `face` fills the middle;
 * `screw`: a screw head (2 × 2, lit on its upper left) set that far in from each corner.
 */
function ringFrame(rings, face = null, { notch = 1, screw = null } = {}) {
  const chars = new Map()
  const ch = (col) => (chars.has(col) ? chars.get(col) : (chars.set(col, String.fromCharCode(65 + chars.size)), chars.get(col)))
  const map = ringMap(rings.map(([tl, br = tl, mid = tl]) => [ch(tl), ch(br), ch(mid)]), notch, face ? ch(face) : '.')
  const grid = map.map((r) => [...r])
  if (screw) {
    const n = grid.length
    const head = [[C.hot, '#a8844f'], ['#a8844f', '#4a3824']].map((r) => r.map(ch))
    for (const [ox, oy] of [[screw, screw], [n - 2 - screw, screw], [screw, n - 2 - screw], [n - 2 - screw, n - 2 - screw]])
      head.forEach((r, y) => r.forEach((c, x) => (grid[oy + y][ox + x] = c)))
  }
  const legend = Object.fromEntries([...chars].map(([col, c]) => [c, col]))
  return A.nine(grid.map((r) => r.join('')), legend)
}

function buttonVars(name, colors) {
  const f = A.buttonFrames(colors)
  return { [`--${name}-up`]: f.up.url, [`--${name}-hover`]: f.hover.url, [`--${name}-down`]: f.down.url }
}

// the plugin's dark plate (lib/svg-kit.mjs darkPlate): its light and shade kept close to it
const darkPlate = plateFrame(C.plate, mix(C.plate, '#ffffff', 0.12), mix(C.plate, '#000000', 0.4))

/**
 * The console's frame, the promo's text box (promo/editor/box.js frameSvg) as a 9-slice: an ink edge with its corners
 * cut, a cream rule two pixels wide, the ink again, the board with a lit row under its top, its shadow a pixel down
 * and to the right. For `border-image: <this> 10 10 10 8 fill / …` (style.css .term: 2 px a pixel, as every frame here).
 */
const BOX = { edge: '#0b0a09', rule: '#ece2cd', board: '#1f1a16', lit: '#2e2721' }
const boxFrame = () => A.nine(['.EEEEEEEEE..', 'EERRRRRRREE.', 'ERRRRRRRRRES', 'ERREEEEERRES', 'ERRELLLERRES', 'ERREBBBERRES', 'ERREBBBERRES',
  'ERREEEEERRES', 'ERRRRRRRRRES', 'EERRRRRRREES', '.EEEEEEEEE.s', '..sssssssss.'], { E: BOX.edge, R: BOX.rule, L: BOX.lit, B: BOX.board, s: '#00000073' })

// the clouds in each light, the plugin's (data.js CLOUD_TINTS: body, lit rim, underside), else the trailer's
const TINTS = {
  night: ['#1d2650', '#34417a', '#151b3c'], dawn: ['#b49ccc', '#ffe0b8', '#f0a8a8'],
  day: ['#e8f1fc', '#ffffff', '#b9d0ef'], dusk: ['#7a6aa8', '#ffc27a', '#e88a7a'],
}
const tintOf = (t) => (CLOUD_TINTS?.[t]?.length === 3 ? CLOUD_TINTS[t] : (TINTS[t] ?? TINTS.night))
const lightVars = (light) => {
  const sky = skyBands(light), [cloud, rim, under] = tintOf(light)
  const low = light === 'dawn' || light === 'dusk'
  return {
    '--sky-img': uri(bandTile(sky)), '--sky-top': sky[0][0],
    '--cl-body': cloud, '--cl-rim': rim, '--cl-under': under,
    '--roofline-glow': light === 'dawn' ? '#ffc586' : light === 'dusk' ? '#ffae66' : 'transparent',
    '--sun-core': low ? '#ffb35c' : '#ffe6a0', '--sun-rim': low ? '#ff8a4a' : '#ffc04d',
  }
}

/** The page's art as a stylesheet: everything above as custom properties, per sky. */
export function artCss() {
  const root = {
    '--brick': uri(A.brickTile()),
    '--quoin-l4': uri(A.quoinTile(4, 'l')),
    '--quoin-r4': uri(A.quoinTile(4, 'r')),
    '--cornice': uri(A.corniceTile()),
    '--walk': uri(A.walkTile()),
    '--soil-bands': uri(A.soilBands()),
    '--seam': uri(A.seamTile()),
    '--stones': uri(A.stonesTile()),
    '--rock': uri(A.soilTile(64, 16, 9, C.rock)),
    '--truss': uri(A.trussTile()),
    '--bulbs-a': uri(A.bulbTile(0)),
    '--bulbs-b': uri(A.bulbTile(1)),
    '--deep': uri(A.deepTile()),
    '--spill': uri(A.spillTile()),
    '--keystone': uri(svg(10, 9, pix(['.hhhhhhhh.', 'hHHHHHHHHs', 'hHHHHHHHHs', '.hHHHHHHs.', '.hHHHHHHs.', '.hHHHHHHs.', '..hHHHHs..', '..hHHHHs..', '..ssssss..'],
      { h: '#d2c4aa', H: C.sill, s: C.sillD }))),
    // the plugin's lit plates (lib/svg-kit.mjs litPlate): brass, dark, one per fact, one per character of the cast
    '--pl-brass': plateFrame(C.accent),
    '--pl-dark': darkPlate,
    '--pl-live': plateFrame(C.busy),
    '--pl-every': plateFrame(C.accent),
    '--pl-local': plateFrame(C.idle),
    ...Object.fromEntries(CAST.map((c) => [`--pl-${c.id}`, plateFrame(c.hex?.dark ?? C.accent)])),
    // frames
    // the terminal window the page had before its console (promo/site.mjs draws the trailer's opening with it)
    '--fr-win': ringFrame([['#05060a']]),
    '--fr-box': boxFrame(),
    '--halo': uri(haloSvg()),
    // by night the street front's light on the sidewalk (footer.js streetLights): a pool under each of its lamps, which
    // stand against the wall, and the light out of its lit shop windows (36 wide) and its door (40)
    '--pool': uri(poolSvg(7)),
    '--pool-front': uri(poolSvg(2.5)),
    '--spill-shop': uri(spillSvg(36, 6, [[11, -1, 0.045], [8, 2, 0.06], [5, 5, 0.075]], '#ffd98a')),
    '--spill-door': uri(spillSvg(40, 8, [[12, -2, 0.055], [9, 2, 0.075], [6, 6, 0.09], [3, 10, 0.1]], '#ffe2a0')),
    '--fr-sign': ringFrame([[ '#0d0b09'], ['#6d7279', '#2b2e33', '#4a4e55'], ['#0d0b09']]),
    '--fr-sash': ringFrame([['#0f0c0a'], ['#4a4038', '#1e1915', '#2a211b'], ['#2a211b'], ['#120e0b', '#4a4038', '#2a211b']]),
    '--fr-hall': ringFrame([['#1a1410'], ['#2f241e', '#8a6a52', '#4a3a2e'], ['#3a2d26', '#6b503f', '#4a3a2e'], ['#120e0b']]),
    '--fr-station': ringFrame([['#070a14'], [C.signHi, '#0b1022', C.sign]], C.sign),
    ...buttonVars('lit', { o: '#2b1d08', h: '#fff3c0', s: '#d9a21c', d: '#a8792a' }),
    ...buttonVars('brass', { o: '#241a10', h: '#f6e3bd', s: '#8f6d43', d: '#6f5636' }),
    ...buttonVars('steel', { o: '#1b1d21', h: '#eef0f2', s: '#6d7279', d: '#4a4e55' }),
  }
  const theme = (t) => {
    const night = t === 'night'
    const glow = A.neonGlow('#17120e')[t]
    return {
      ...lightVars(t),
      // the facts' boards: the plugin's dark plate by night, cream by day
      '--pl-board': night ? darkPlate : plateFrame('#efe6d5', '#fffaf0', '#c9bb9f'),
      '--planks': uri(A.plankTile(t)),
      '--ng1': glow[0], '--ng2': glow[1],
      // the rooms lit warm in either light: by lamplight at night, by the day's light, paler, by day
      '--room': uri(A.bands(night
        ? [['#b0703e', 6], ['#8d5a38', 16], ['#7a4c30', 26], ['#5c3e2e', 10], ['#4a2f20', 6]]
        : [['#d2a978', 6], ['#bf9669', 16], ['#ab845b', 26], ['#8d6b4b', 10], ['#6f533b', 6]], 2).svg),
      '--room-floor': night ? '#4a2f20' : '#6f533b',
      '--hall': uri(A.bands(night
        ? [['#221e1a', 8], ['#7a5236', 10], ['#674632', 18], ['#573c2d', 30], ['#4a3429', 40]]
        : [['#4a3d31', 8], ['#a98b69', 10], ['#997b5c', 18], ['#896c50', 30], ['#7b6047', 40]], 2).svg),
      '--hall-wall': night ? '#4a3429' : '#7b6047',
    }
  }
  const decl = (o) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(';')
  const phases = [['day', 'dawn'], ['day', 'dusk'], ['night', 'twilight']].map(([sky, light]) =>
    `html[data-sky="${sky}"][data-light="${light}"]{${decl(lightVars(light))}}`).join('')
  return `:root{${decl(root)}}html[data-sky="night"]{${decl(theme('night'))}}html[data-sky="day"]{${decl(theme('day'))}}${phases}`
}

// The street's light by night in flat bands on the pixel grid, each a thin warm wash over the ones outside it, so it
// steps down in a few clean rings (the plugin draws its street front's lamps the same way, lib/svg-live.mjs glowRects).
// The sidewalk is 12 rows: its seam against the wall, then the slabs, toward the curb.
const SIDEWALK = 12
/**
 * Light round a point: `bands` [[reach, opacity], …] ellipses round (cx, cy), reach along x and `squash` of it down y,
 * each one <path> of row runs, stacked so the light steps down, brightest at its heart. `rows` [y0, y1) clips them.
 */
function glowPaths(cx, cy, bands, { squash = 1, rows = null, color = '#ffd27a' } = {}) {
  return bands.map(([reach, opacity]) => {
    const [y0, y1] = rows ?? [Math.floor(cy - reach * squash), Math.ceil(cy + reach * squash)]
    let d = ''
    for (let y = y0; y < y1; y++) {
      const dy = (y + 0.5 - cy) / squash
      if (Math.abs(dy) > reach) continue
      const half = Math.sqrt(reach * reach - dy * dy)
      const x0 = Math.ceil(cx - half - 0.5)
      const w = Math.floor(cx + half - 0.5) - x0 + 1
      if (w > 0) d += `M${x0} ${y}h${w}v1h${-w}z`
    }
    return d ? `<path fill="${color}" fill-opacity="${opacity}" d="${d}"/>` : ''
  }).join('')
}
/** A lamp's halo round its glass, 2r art pixels square: the street front's (lib/svg-live.mjs HALO). */
const haloSvg = (r = 12) => svg(2 * r, 2 * r, glowPaths(r, r, [[11, 0.045], [7, 0.09], [3.5, 0.22]]))
/** A lamp's pool on the slabs, 44 art pixels wide, its heart at row `cy` (where the post stands). */
const poolSvg = (cy) => svg(44, SIDEWALK, glowPaths(22, cy, [[22, 0.05], [15, 0.075], [9, 0.11], [4.5, 0.14]], { squash: 0.25, rows: [0, SIDEWALK] }))
/**
 * Light out of an opening `w` wide in the wall over the sidewalk, `pad` each side for it to spread into: `bands`
 * [[rows, inset, opacity], …], each from the wall toward the curb `rows` deep, starting `inset` in from the opening's
 * sides and widening a pixel each side every two rows.
 */
function spillSvg(w, pad, bands, color) {
  const W = w + 2 * pad
  const body = bands.map(([deep, inset, opacity]) => {
    let d = ''
    for (let y = 0; y < Math.min(deep, SIDEWALK); y++) {
      const half = Math.min(W / 2, w / 2 - inset + Math.floor(y / 2))
      if (half > 0) d += `M${W / 2 - half} ${y}h${2 * half}v1h${-2 * half}z`
    }
    return `<path fill="${color}" fill-opacity="${opacity}" d="${d}"/>`
  }).join('')
  return svg(W, SIDEWALK, body)
}
