// PURE: the pixel-art kit every SVG scene of the office draws with: palette, Clawd and the other sprites, the 3 × 5
// pixel font, escaping, text layout, SMIL helpers, the <defs>/<use> sprite mechanism, and the header every scene opens
// with (sceneHeader: the sign on the roof, the sky, the skyline and the brick shell, the same in every view). The scene files
// (svg-live.mjs, svg-week.mjs, svg-today.mjs, svg-month.mjs, svg-work.mjs) and the street under them (svg-street.mjs)
// import from here so every scene speaks the same visual language; lib/svg.mjs picks one per view. No
// node:* imports: the desktop mod hooks module (no Node, no DOM) imports svg.mjs, which imports this file.
import { AGENT_IDS, CAST, agentId } from './cast.mjs'
import { clip, displayWidth, fmtAgo, fmtAgoAtLeast, fmtAtLeast, fmtCount, fmtMinutes, truncate } from './format.mjs'
import { CLAWD_HEX, CLAWD_SPRITE, ROLE_HEX, STRIP_ORDER, agentShares, fnv1a, handsUp, idleGroups, plural, projectSlots, seeded } from './model.mjs'
import { THEME } from './scenery.mjs'

export { rangeWord } from './model.mjs'
export { THEME }

/** '3 desks', '1 desk' and '1 hand up', '2 hands up': model.mjs's, so the drawing and the text say it alike. */
export { handsUp, plural }
/** The cast (cast.mjs) for the scenes, which import the kit and the facts helpers only. */
export { AGENT_IDS, CAST, agentId }

// ---------------------------------------------------------------- palette

/**
 * Semantic role colors (model.mjs ROLE_HEX, dark-background hexes): the SVG paints its own night/day scene, so one
 * set fits both themes. `ROLE.busy`, `ROLE.dim`, `ROLE.accent`, `ROLE.p0`…
 */
export const ROLE = Object.fromEntries(Object.entries(ROLE_HEX).map(([k, v]) => [k, v.dark]))
/** The 8 project colors (ROLE.p0…p7), indexed by palette slot; use `ctx.color(name)` rather than picking one. */
export const PROJECT = Array.from({ length: 8 }, (_, i) => ROLE[`p${i}`])
/**
 * Desk class → its strip color, so a class always reads the same everywhere. A turn done is gold, as a turn stopped is:
 * both wait on you, and the break's teal (the first project color's too) hid them among the desks at rest.
 */
export const CLASS_COLOR = {
  working: ROLE.busy, thinking: ROLE.busy, waiting: ROLE.wait, asking: ROLE.ask, error: ROLE.warn, stopped: ROLE.accent, break: ROLE.idle,
  done: ROLE.accent, dozing: ROLE.idle,
}
// Clawd, Claude Code's mascot: every agent is one. Always Claude orange with near-black eyes; a project's color goes on
// the chair or the mug, never on Clawd. The SVG paints its own scene, so the dark-background orange fits both themes.
/** Clawd's body orange: never recolor it (a project's color goes on his plaque, mug or coat). */
export const CLAWD = CLAWD_HEX.dark
/** Clawd's near-black eyes. */
export const CLAWD_EYE = CLAWD_HEX.eye

/** Scene paint (not semantic): sky, bricks, slabs, furniture. Reuse these so a new scene sits in the same building. */
export const K = {
  star: THEME.sky.star, starDim: THEME.sky.starDim, moon: THEME.sky.moon, sun: THEME.sky.sun, cloud: THEME.sky.cloud, cloudSh: THEME.sky.cloudSh,
  brick: THEME.building.brick, mortar: THEME.building.mortar, parapet: THEME.roof.parapet, parapetTop: THEME.roof.parapetTop,
  wall: THEME.building.wall, wallLow: THEME.building.wallLow, wallDark: THEME.building.wallDark, wallDarkLow: THEME.building.wallDarkLow,
  slab: THEME.building.slab, wood: THEME.props.wood, woodD: THEME.props.woodD, part: THEME.props.part, partHi: THEME.props.partHi,
  walk: THEME.street.walk, walkD: THEME.street.walkD, ground: THEME.street.ground, plate: '#16110d', groupText: '#c9bda3',
  chair: THEME.props.chair, chairHi: THEME.props.chairHi,
}

/**
 * The ground below the street, top to bottom: soil, pebbles, the tunnel and its rails, bedrock, the tunnel lamps; then
 * the commits line's own paint (the road, the station sign, the train's shade, wheels and bogies, the headlight, the
 * cab glass by day). The street (svg-street.mjs) and the live building's basement, cut through beside it, share it.
 */
export const UNDER = THEME.street.under

/**
 * Whether a drawing wears the finer art (ctx.fine): the street front and the kitchen's and the meeting room's furniture
 * shaded as the desks are, everything on its own shadow, and every figure of the cast (the agents on the sidewalk, the
 * ones at work in the basement) put together from the shared lit parts the live floors' figures are made of, so they are
 * lit alike and a pose costs a handful of <use>s. A crowded drawing comes out lighter for it (the shared parts save more
 * than the front adds), a small one heavier: where it does not fit, renderSvg's ladder tries the plain art next
 * (ctx.fine 0), which is the art the drawings always had, char for char, so no drawing comes out poorer. Anything
 * drawn off the ladder (no ctx.fine at all) keeps the plain art too.
 */
export const fine = (c) => Boolean(c?.fine)

// ---------------------------------------------------------------- sprite maps (one char = one pixel)

// Every character of the cast (cast.mjs: Clawd's official pixel sprite and the others, all on his 17 × 10 skeleton) is
// drawn at 1.5× so it reads at desk size, still on the scene's pixel grid: source rows and columns alternate 1 and 2
// pixels, which keeps it symmetric. Result, a 25 × 15 box: body 19 × 12 at (3, 0), arms 3 × 3 at y 6, eyes 2 × 3 at
// x 7 and 16, y 3, four 1-px legs at y 12. The parts are cut apart so a pose can move the arms and the eyes.
const up15 = (i) => i + (i >> 1)
const at15 = (sprite) => sprite.flatMap((row, y) => {
  const line = [...row].map((ch, x) => ch.repeat(up15(x + 1) - up15(x))).join('')
  return Array.from({ length: up15(y + 1) - up15(y) }, () => line)
})
/** Clawd's official sprite at 1.5× (25 × 15 char rows, C body, E eye): the desk-size Clawd. */
export const CLAWD_15 = at15(CLAWD_SPRITE)

/**
 * A character at 1.5× cut into parts (`[x, y, w, h, fill]` rects in the 25 × 15 box): body (its eyes' spots in the
 * color behind them), armL, armR, legs, and eyes (in its eye color), so a pose can move arms and eyes.
 */
function partsOf(ch) {
  // an eye's spot painted like the body around it joins the body's runs (fewer rects: Clawd draws as he always did)
  const twin = (e) => Object.keys(ch.legend).find((c) => !ch.eyes.includes(c) && ch.legend[c] === ch.legend[e]) ?? e
  const grid = at15(ch.sprite).map((row) => [...row].map((c) => (ch.eyes.includes(c) ? twin(c) : c)).join(''))
  const eyeGrid = at15(ch.sprite)
  const cut = (keep, legend, g = grid) => mapRects(g.map((row, y) => [...row].map((c, x) => (Object.hasOwn(legend, c) && keep(x, y) ? c : '.')).join('')), legend)
  const eyes = Object.fromEntries([...ch.eyes].map((c) => [c, ch.eye]))
  return {
    body: cut((x, y) => y < 12 && x >= 3 && x <= 21, ch.legend),
    armL: cut((x, y) => y < 12 && x < 3, ch.legend),
    armR: cut((x, y) => y < 12 && x > 21, ch.legend),
    legs: cut((x, y) => y >= 12, ch.legend),
    eyes: cut(() => true, eyes, eyeGrid),
  }
}
const PARTS = Object.fromEntries(AGENT_IDS.map((a) => [a, partsOf(CAST[a])]))
/** CLAWD_15 cut into parts ([x, y, w, h] rects): body, armL, armR, legs, eyes, so a pose can move arms and eyes. */
export const CL = Object.fromEntries(Object.entries(PARTS.claude).map(([k, rs]) => [k, rs.map(([x, y, w, h]) => [x, y, w, h])]))
// Mini Clawd for interns (about half size, 11 × 6) and a micro one for the facade's tiny cells (7 × 5).
/** Mini Clawd (11 × 6), the interns: `sprite(CLAWD_MINI, CLAWD_LEG, x, y)`. */
export const CLAWD_MINI = CAST.claude.mini
/** Micro Clawd (7 × 5), for tiny cells (a facade window, a calendar day). */
export const CLAWD_MICRO = CAST.claude.micro
/** Legend for the Clawd char maps: C body, E eye. */
export const CLAWD_LEG = { C: CLAWD, E: CLAWD_EYE }
/** A character's legend for its mini and micro maps: its own colors, its eyes in its eye color. */
export const miniLegend = (agent) => {
  const ch = CAST[agentId(agent)]
  return { ...ch.legend, ...Object.fromEntries([...ch.eyes].map((c) => [c, ch.miniEye])) }
}
// A visitor (another vendor's agent, via novi) is not Clawd: a little grey robot with a visitor badge.
/** A visitor (another vendor's agent): a grey robot, 9 × 13, with ROBOT_LEG. */
export const ROBOT = [
  '....a....', '....g....', '.ggggggg.', '.gLgggLg.', '.ggggggg.', '..ddddd..', 'ggggggggg', 'g.gGGGg.g',
  'g.gGbGg.g', '..ggggg..', '..g...g..', '..g...g..', '.dd...dd.',
]
/** The robot's colors (antenna and badge in accent). */
export const ROBOT_LEG = { a: ROLE.accent, g: '#8a8f96', G: '#a4a9b0', d: '#5d6168', L: '#7fd6e8', b: ROLE.accent }
/** The kitchen water cooler, 10 × 24, with COOLER_LEG. */
export const COOLER = [
  '...BBBB...', '..BbbbbB..', '..BbWbbB..', '..BbWbbB..', '..BbbbbB..', '..BbbbbB..', '...BBBB...', '....nn....',
  '.gggggggg.', '.gGGGGGGg.', '.gGrGGuGg.', '.gGrGGuGg.', '.gGGGGGGg.', '.gGddddGg.', '.gGGGGGGg.', '.gGGGGGGg.',
  '.gGGGGGGg.', '.gGGGGGGg.', '.gGGGGGGg.', '.gGGGGGGg.', '.gGGGGGGg.', '.gGGGGGGg.', '.gggggggg.', '..g....g..',
]
/** The water cooler's colors. */
export const COOLER_LEG = { B: '#3f7fb8', b: '#7fbde8', W: '#d8efff', n: '#3f7fb8', g: '#9c9689', G: '#e6e1d6', r: '#e07a61', u: '#6f91dc', d: '#7a7468' }
/** A potted plant, 10 × 12, with PLANT_LEG: fills empty desk slots and room corners. */
export const PLANT = [
  '...l..l...', '.l.ll.l.l.', '.lllLlLll.', 'llLlllLlll', '.lLllLllL.', '..llLlll..', '...llll...',
  '..TTTTTT..', '..tTTTTt..', '..tTTTTt..', '...tTTt...', '...tttt...',
]
/** The plant's colors (leaves, pot). */
export const PLANT_LEG = { l: '#4f7f34', L: '#9ab86a', T: '#b0623c', t: '#7f4428' }
/** The office cat, 12 × 6 (the tail is rows 4–5), with CAT_LEG. */
export const CAT = ['........a..a', '.......aaaaa', '..aAaaAaeaea', '.aaaaaaaaaaa', 'taaaaaaaaaa.', 'tt..........']
/** The cat's colors (fur, stripes, eyes, tail). */
export const CAT_LEG = { a: '#eec96f', A: '#c8963a', e: '#3a2a20', t: '#d9a94f' }
/** A crescent moon, 9 × 9 (m light, M shade). */
export const MOON = ['...mmmm..', '.mmmmm...', '.mmmm....', 'mmmm.....', 'mmmM.....', 'mmmm.....', '.mmmm....', '.mmmmm...', '...mmmm..']
/** A cloud, 15 × 5 (c light, s shade). */
export const CLOUD = ['....cccc......', '..cccccccc.ccc.', '.cccccccccccccc', 'ccccccccccccccc', '.sssssssssssss.']
/** The night robot vacuum, 9 × 4. */
export const VAC = ['..ddddd..', '.dDDLDDd.', 'ddddddddd', '.k.....k.']

// 3 × 5 pixel font for monitor screens and whiteboard counters.
/** The 3 × 5 pixel font (digits and `/+?ix>z-:`), 15 bits per glyph, row by row; advance 4 px. */
export const FONT = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001011001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
  '/': '001001010100100', '+': '000010111010000', '?': '111001011000010', i: '010000010010010', x: '000101010101000',
  '>': '100010001010100', z: '111001010100111', '-': '000000111000000', ':': '000010000010000',
}

// ---------------------------------------------------------------- svg primitives

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
// Code points XML forbids (C0 controls, lone surrogates, U+FFFE/FFFF), plus C1 controls and bidi overrides
// (a title must not reorder the text around it). One forbidden char would make the whole document unparseable.
function isBad(c) {
  return (c < 32 && c !== 9 && c !== 10 && c !== 13) || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029 ||
    (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || (c >= 0xd800 && c <= 0xdfff) || c === 0xfffe || c === 0xffff
}

/**
 * Escape for XML text and attribute values. Every string that reaches the SVG or the HTML page goes through here,
 * so it is also the last line of defense for document validity: characters XML forbids are removed, not escaped
 * (ANSI CSI sequences go whole, so no stray `[31m` is left behind).
 */
export function esc(s) {
  let out = ''
  for (const ch of String(s ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')) {
    if (isBad(ch.codePointAt(0))) continue
    out += ESC[ch] ?? ch
  }
  return out
}

/** Fill spec → attribute: '#hex', '#hex/.5' (with fill-opacity), 'cur' (currentColor), 'inh' (inherit, no attribute). */
export function fillAttr(f) {
  if (f === 'inh') return ''
  if (f === 'cur') return ' fill="currentColor"'
  const [hex, op] = f.split('/')
  return ` fill="${hex}"${op ? ` fill-opacity="${op}"` : ''}`
}

/**
 * Rects [x, y, w, h, fill] → one <path> per fill, in first-use order (list base colors before overlays). The cheapest
 * way to draw many pixels: `paint([[0, 0, 4, 2, K.wood], [1, 1, 1, 1, '#000/.3']])`.
 */
export function paint(rects) {
  const by = new Map()
  for (const [x, y, w, h, f] of rects) {
    if (!(w > 0 && h > 0)) continue
    by.set(f, (by.get(f) ?? '') + `M${x} ${y}h${w}v${h}h${-w}z`)
  }
  let s = ''
  for (const [f, d] of by) s += `<path${fillAttr(f)} d="${d}"/>`
  return s
}

/**
 * A char map → rects: horizontal runs, merged downwards when the run below is identical. `legend` maps a char to a
 * fill (or a list of fills); chars without a legend entry are transparent. Offsets move the whole map.
 */
export function mapRects(rows, legend, ox = 0, oy = 0) {
  const out = []
  let open = new Map()
  rows.forEach((row, y) => {
    const next = new Map()
    for (let x = 0; x < row.length;) {
      const ch = row[x]
      let n = 1
      while (row[x + n] === ch) n++
      if (legend[ch] != null) {
        const key = `${ch}:${x}:${n}`
        const r = open.get(key)
        if (r) r[3]++
        else out.push(next.set(key, [x + ox, y + oy, n, 1, ch]).get(key))
        if (r) next.set(key, r)
      }
      x += n
    }
    open = next
  })
  const rects = []
  for (const [x, y, w, h, ch] of out) for (const f of [].concat(legend[ch])) rects.push([x, y, w, h, f])
  return rects
}

/** A char map painted: `sprite(PLANT, PLANT_LEG, x, y)`. Prefer `use()` for anything drawn more than once. */
export const sprite = (rows, legend, ox = 0, oy = 0) => paint(mapRects(rows, legend, ox, oy))

/** Pixel-font text → rects (3 × 5 glyphs, 4-px advance), to merge with other rects in one paint(). */
export function pixRects(str, x, y, fill) {
  const rects = []
  let cx = x
  for (const ch of String(str)) {
    const g = FONT[ch]
    if (g) for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === '1') rects.push([cx + c, y + r, 1, 1, fill])
    cx += 4
  }
  return rects
}
/**
 * Pixel-font text → merged rects: the glyphs as one char map, so each horizontal run (merged downwards when the run
 * below matches) is one rect, about half the markup of pixRects. Use it for digits that sit in a paint() of their own.
 */
export function pixRuns(str, x, y, fill) {
  const glyphs = [...String(str)].map((ch) => FONT[ch] ?? '0'.repeat(15))
  const rows = Array.from({ length: 5 }, (_, r) => glyphs.map((g) => [0, 1, 2].map((c) => (g[r * 3 + c] === '1' ? '#' : '.')).join('')).join('.'))
  return mapRects(rows, { '#': fill }, x, y)
}
/** Pixel-font text painted: `pixText('5/9', x, y, ROLE.wait)` (top-left at x, y). */
export const pixText = (str, x, y, fill) => paint(pixRects(str, x, y, fill))
/** Width in px of pixel-font text. */
export const pixWidth = (str) => Math.max(0, String(str).length * 4 - 1)

/** Round to one decimal: every coordinate a scene computes goes through it, so the markup stays short. */
export const r1 = (n) => Math.round(n * 10) / 10
/** Clamp v to [lo, hi]. */
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Monospace layout: advance ≈ 0.6 em in Menlo / SF Mono / Consolas / DejaVu; 0.62 leaves a margin. A wide char (CJK,
// Hangul, emoji) counts two columns, as in the text office (format.mjs displayWidth): it renders 1.0–1.2 em wide, so
// two columns (1.24 em) is a safe overestimate and a name never overflows its plate.
/** Monospace advance as a share of the font size (0.62 em, a safe margin over 0.6). */
export const CW = 0.62
/** How many columns of `size` fit in `px` (a wide char takes two). */
export const fitCols = (px, size) => Math.max(0, Math.floor(px / (size * CW)))
/** Clip a string (with …) to fit `px` at `size`, by display width. */
export const fit = (s, px, size) => clip(s, fitCols(px, size))
/** Width in px of a string at `size` (display width: a wide char counts two columns). */
export const textW = (s, size) => displayWidth(String(s)) * size * CW
/**
 * Clip in the middle (`ultra…ture`) to fit `px` at `size`: two names that share a prefix stay apart where an end clip
 * would print the same `ultra…` twice. Text that fits is returned as is.
 */
export function fitMid(s, px, size) {
  const t = clip(s, 999)
  const n = fitCols(px, size)
  if (displayWidth(t) <= n) return t
  if (n < 4) return truncate(t, n)
  const chars = [...t]
  const tail = []
  for (let w = 0, i = chars.length - 1; i >= 0 && w + displayWidth(chars[i]) <= Math.floor((n - 1) / 2); i--) {
    w += displayWidth(chars[i])
    tail.unshift(chars[i])
  }
  return `${truncate(t, n - 1 - displayWidth(tail.join('')), '')}…${tail.join('')}`
}

/** One <text> (escaped), baseline at y; '' for an empty string. `extra` adds attributes: ' text-anchor="end"'. */
export function txt(x, y, s, size, fill, extra = '') {
  return s ? `<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" fill="${fill}"${extra}>${esc(s)}</text>` : ''
}

/** Groups of [text, color] joined by ' · ', whole groups dropped from the right to fit `px`. */
export function fitGroups(groups, px, size, sep = ' · ') {
  const kept = []
  let used = 0
  for (const g of groups) {
    const w = textW(g[0], size) + (kept.length ? textW(sep, size) : 0)
    if (used + w > px) break
    kept.push(g)
    used += w
  }
  return kept
}
/** Width in px of groups joined by `sep`. */
export const groupsW = (groups, size, sep = ' · ') => groups.reduce((a, g, i) => a + textW(g[0], size) + (i ? textW(sep, size) : 0), 0)

/** Groups of [text, color] as one <text> of colored <tspan>s, the separator dim: pair it with fitGroups. */
export function spans(x, y, size, groups, extra = '', sep = ' · ') {
  if (!groups.length) return ''
  const inner = groups.map(([t, f], i) => (i ? `<tspan fill="${ROLE.dim}">${sep}</tspan>` : '') + `<tspan fill="${f}">${esc(t)}</tspan>`).join('')
  return `<text x="${r1(x)}" y="${r1(y)}" font-size="${size}"${extra}>${inner}</text>`
}

/**
 * A ground line: an optional dim lead ('lights off:', marked by a third element) then ' · '-joined groups fitted to
 * `maxPx` (the first group is clipped rather than dropped when nothing else fits).
 */
export function lineSpans(x, y, size, groups, maxPx) {
  const lead = groups[0]?.length === 3 ? groups[0] : null
  const room = maxPx - (lead ? textW(`${lead[0]} `, size) : 0)
  let rest = fitGroups(lead ? groups.slice(1) : groups, room, size)
  if (!rest.length && groups.length > (lead ? 1 : 0)) {
    const g = groups[lead ? 1 : 0]
    rest = [[clip(g[0], fitCols(room, size)), g[1]]]
  }
  const body = rest.map(([t, f], i) => (i ? `<tspan fill="${ROLE.dim}"> · </tspan>` : '') + `<tspan fill="${f}">${esc(t)}</tspan>`).join('')
  return `<text x="${x}" y="${y}" font-size="${size}">${lead ? `<tspan fill="${lead[1]}">${esc(lead[0])} </tspan>` : ''}${body}</text>`
}

/** Mix two '#rrggbb' colors (t = 0 → a, 1 → b): how the facade lights a window by its hours. */
export function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`
}

// ---------------------------------------------------------------- animation (SMIL only; nothing when animate=false)

/**
 * A discrete translate loop (put it inside the <g> or <use> it moves): `aT(ctx, '0 0;0 -1', 1.2, -0.5)`.
 * Returns '' when ctx.animate is false, so a static render carries no SMIL at all.
 */
export function aT(ctx, values, dur, begin = 0) {
  if (!ctx.animate) return ''
  const b = begin ? ` begin="${r1(begin)}s"` : ''
  return `<animateTransform attributeName="transform" type="translate" values="${values}" dur="${r2(dur)}s"${b} calcMode="discrete" repeatCount="indefinite"/>`
}
// Durations to two decimals: a computed one (2.2 + 3 × 0.4) must not print as 3.4000000000000004.
const r2 = (n) => Math.round(n * 100) / 100
/** A discrete attribute loop: `aA(ctx, 'width', '1;3;5', 1.6)`. '' when not animating. */
export function aA(ctx, attr, values, dur, begin = 0) {
  if (!ctx.animate) return ''
  const b = begin ? ` begin="${r1(begin)}s"` : ''
  return `<animate attributeName="${attr}" values="${values}" dur="${r2(dur)}s"${b} calcMode="discrete" repeatCount="indefinite"/>`
}
/** A discrete opacity loop (blinks, twinkles): `<g>${dots}${aO(ctx, '1;0', 0.8)}</g>`. */
export const aO = (ctx, values, dur, begin) => aA(ctx, 'opacity', values, dur, begin)
/** A stable negative offset per desk/star so neighbours do not move in lockstep: pass it as `begin`. */
export const phase = (key, dur) => -((fnv1a(key) % 997) / 997) * dur

/** A blink: the open eyes vanish for a beat while closed dashes show (discrete SMIL, phase per sprite variant). */
export function blink(c, open, shut, dur, begin) {
  if (!c.animate) return open
  const b = begin ? ` begin="${r1(begin)}s"` : ''
  const a = (v) => `<animate attributeName="opacity" values="${v}" keyTimes="0;.94;.98" dur="${dur}s"${b} calcMode="discrete" repeatCount="indefinite"/>`
  return `<g>${open}${a('1;0;1')}</g><g opacity="0">${shut}${a('0;1;0')}</g>`
}

// ---------------------------------------------------------------- sprites (defined once in <defs>, drawn with <use>)

/** One <rect> (fill spec as in paint), optionally wrapping SMIL children: `rect(0, 0, 3, 1, ROLE.busy, aA(…))`. */
export function rect(x, y, w, h, fill, inner = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${fillAttr(fill)}${inner ? `>${inner}</rect>` : '/>'}`
}

/**
 * An invisible hover target carrying a tooltip (the desktop pane shows <title> on hover): a path, the shortest markup
 * for it. Every scene's hit areas look the same, so a tooltip never depends on which scene drew it.
 */
export const hitArea = (x, y, w, h, tip) => `<path fill-opacity="0" d="M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}z"><title>${esc(tip)}</title></path>`

// A tag: rows of TAG.size type TAG.pitch apart, the first baseline TAG.first under its top, TAG.pad in from its left;
// its board and its hairline frame (the promo's stat cards, small enough to sit on a floor's slab); a marked tag's bar
// TAG.mark wide
const TAG = Object.freeze({ size: 5, pitch: 7, first: 6, pad: 3, mark: 2, board: '#1a1613', frame: '#ece2cd' })

/** How tall a tag of `rows` rows is: 8 for one, 15 for two. */
export const tagH = (rows) => rows * TAG.pitch + 1
/** Whether `s` fits whole on a row of a tag `w` wide, at the tags' size; `mark`: the tag carries a state's bar (tagsSvg). */
export const tagFits = (s, w, mark = false) => textW(s, TAG.size) <= w - 2 * TAG.pad - (mark ? TAG.mark - 1 : 0)

/**
 * Tags laid where a scene's lines go (the live floors' slabs, the basement's): each `{ x, y, w, rows, mark? }`, `rows`
 * one or two lists of groups as spans takes them ([text, color], joined by ' · '; the first clipped to the tag, the
 * others kept while they fit), on a dark board in a hairline frame, as the promo's cards are; `mark`, a color, a bar
 * down the tag's left edge (TAG.mark wide, the words moved over for it) and a frame round it in that color, so a state
 * reads from across the building. All their boards in one path, their frames in another, their words in one group, the
 * bars and the marks' frames last, or in `bars` when given (the live floors keep them with their plates, which are
 * painted after the tags: they join the path its strip's tick of that color already has): a tag costs little more than
 * the lines it holds.
 */
export function tagsSvg(tags, bars = null) {
  if (!tags.length) return ''
  let boards = ''
  let frames = ''
  let words = ''
  const marks = bars ?? []
  for (const { x, y, w, rows, mark } of tags) {
    const h = tagH(rows.length)
    boards += `M${r1(x)} ${r1(y)}h${r1(w)}v${h}h${r1(-w)}z`
    frames += `M${r1(x + 0.25)} ${r1(y + 0.25)}h${r1(w - 0.5)}v${h - 0.5}h${r1(-(w - 0.5))}z`
    if (mark) marks.push([x, y, TAG.mark, h, mark], [x + TAG.mark, y, w - TAG.mark, 1, mark], [x + TAG.mark, y + h - 1, w - TAG.mark, 1, mark], [x + w - 1, y + 1, 1, h - 2, mark])
    const pad = TAG.pad + (mark ? TAG.mark - 1 : 0)
    const room = w - TAG.pad - pad
    rows.forEach(([first, ...rest], i) => {
      const lead = [fit(first[0], room, TAG.size), first[1]]
      const row = [lead, ...fitGroups(rest, room - textW(`${lead[0]} · `, TAG.size), TAG.size)]
      const at = `x="${r1(x + pad)}" y="${r1(y + TAG.first + i * TAG.pitch)}"`
      words += row.length === 1 ? `<text ${at} fill="${lead[1]}">${esc(lead[0])}</text>`
        : `<text ${at}>${row.map(([t, f], k) => `<tspan fill="${f}">${k ? ' · ' : ''}${esc(t)}</tspan>`).join('')}</text>`
    })
  }
  return `<path fill="${TAG.board}" d="${boards}"/><path fill="none" stroke="${TAG.frame}" stroke-opacity=".22" stroke-width=".5" d="${frames}"/>` +
    `<g font-size="${TAG.size}">${words}</g>${bars ? '' : paint(marks)}`
}

// A hover card: rows of HOVER.size type HOVER.pitch apart from a first baseline at HOVER.first, inside a plate HOVER.pad
// wider on each side than its widest row and HOVER.max wide at most
const HOVER = Object.freeze({ size: 5, pitch: 7, first: 6.5, foot: 3, pad: 3, max: 120 })

/**
 * A card the drawing shows while the pointer rests on `box` ([x, y, w, h]): `rows`, each a list of groups as spans takes
 * them ([text, color], joined by ' · '), on a dark plate over the box (under it near the top). The desktop pane draws no
 * system tooltip for a drawing's `<title>`, but its frame runs CSS `:hover`, so this is how a word left off the floors is
 * still read there. Kept in ctx.cards; cardsSvg draws them all, last.
 */
export function hoverCard(ctx, box, rows) {
  const kept = rows.filter((r) => r.length)
  if (kept.length) (ctx.cards ??= []).push({ box, rows: kept })
}

/**
 * Every card hoverCard kept, at the end of the drawing so nothing covers one, and forgets them: each a hit box (the
 * pointer's target, never painted) and its card, hidden until the box is hovered (`display="none"`, which the style at
 * their head lifts while it is, so a surface without CSS keeps them hidden), the plate's paint and the type in that
 * style once. Its class is named by ctx.id, so two drawings in one page keep theirs apart. '' with none.
 */
export function cardsSvg(ctx) {
  const cards = ctx.cards ?? []
  ctx.cards = null
  if (!cards.length) return ''
  const cls = `${ctx.id}hc`
  const { size, pad, pitch } = HOVER
  const max = Math.min(HOVER.max, ctx.W - 12) - 2 * pad
  const items = cards.map(({ box: [x, y, w, h], rows }) => {
    // each row fitted to the card: its first group clipped, the others kept while they fit
    const fitted = rows.map(([first, ...rest]) => {
      const lead = [fit(first[0], max, size), first[1]]
      return [lead, ...fitGroups(rest, max - textW(`${lead[0]} · `, size), size)]
    })
    const cw = Math.ceil(Math.max(...fitted.map((r) => groupsW(r, size))) + 2 * pad)
    const ch = fitted.length * pitch + HOVER.foot
    const cx = clamp(Math.round(x + w / 2 - cw / 2), 6, ctx.W - 6 - cw)
    const above = Math.round(y - ch - 1)
    const cy = above >= 2 ? above : Math.round(y + h + 1)
    // a row of one color is one text in it; a row of several, a span each (the ' · ' in the color of what it leads)
    const text = fitted.map((r, i) => `<text x="${cx + pad}" y="${r1(cy + HOVER.first + i * pitch)}"` +
      (r.length === 1 ? ` fill="${r[0][1]}">${esc(r[0][0])}` : `>${r.map(([t, f], k) => `<tspan fill="${f}">${k ? ' · ' : ''}${esc(t)}</tspan>`).join('')}`) + '</text>').join('')
    return `<g><path fill-opacity="0" d="M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}z"/>` +
      `<g display="none"><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}"/>${text}</g></g>`
  })
  return `<style>.${cls} g:hover g{display:inline}.${cls} rect{fill:${K.plate};stroke:#fff;stroke-opacity:.25;stroke-width:.5px}` +
    `.${cls} text{font-size:${size}px}</style><g class="${cls}">${items.join('')}</g>`
}

/** Monitor screen backgrounds per activity kind (and per desk state: think, wait, ask, done, stop, err, doze, off). */
export const SCREEN_BG = {
  coding: '#1b2030', reading: '#e9e4d6', terminal: '#0b100b', testing: '#0f1716', web: '#eef0f3', delegating: '#1d1828',
  planning: '#f2eee2', talking: '#1b2030', design: '#24202a', tools: '#1b2030', think: '#1b2030', wait: '#1f1a26',
  ask: '#2a1814', done: '#0f1716', stop: '#1d1a12', err: '#2a1410', doze: '#0b0f12', off: '#0b0d10',
}
/** Activity kinds that have their own screen (`s-<kind>` sprites); any other kind shows `s-tools`. */
export const SCREENS = new Set(['coding', 'reading', 'terminal', 'testing', 'web', 'delegating', 'planning', 'talking', 'design', 'tools'])

// Each screen is 16 × 10, drawn at the monitor's (1,1).
const SCREEN = {
  coding: (c) => paint([[1, 1, 3, 1, '#c678dd'], [5, 1, 5, 1, '#9ab86a'], [3, 3, 7, 1, '#eec96f'], [3, 5, 2, 1, '#6f91dc'],
    [6, 5, 6, 1, '#ece2cd'], [1, 7, 4, 1, '#c678dd']]) +
    rect(6, 7, 1, 1, '#9ab86a', aA(c, 'width', '1;3;5;7', 1.6)) + rect(7, 7, 1, 1, '#ffffff', aA(c, 'x', '7;9;11;13', 1.6)),
  reading: (c) => paint([[1, 1, 13, 1, '#9a9282'], [1, 3, 11, 1, '#9a9282'], [1, 5, 13, 1, '#9a9282'], [1, 7, 9, 1, '#9a9282']]) +
    `<g>${rect(0, 1, 16, 1, '#eec96f/.5')}${aT(c, '0 0;0 2;0 4;0 6', 2.4)}</g>`,
  terminal: (c) => paint([[1, 1, 8, 1, '#4d5a4d'],
    [1, 3, 5, 1, '#4d5a4d'], ...pixRects('>', 1, 5, '#9ab86a')]) + rect(5, 9, 3, 1, '#9ab86a', aO(c, '1;0', 0.8)),
  testing: (c) => {
    const ck = (x) => [[x + 4, 2, 1, 1], [x + 3, 3, 1, 1], [x, 4, 1, 1], [x + 2, 4, 1, 1], [x + 1, 5, 1, 1]].map((r) => [...r, '#9ab86a'])
    return paint([...ck(1), [1, 8, 14, 1, '#2c3a33']]) + `<g>${paint(ck(6))}${aO(c, '0;1;1', 1.8)}</g><g>${paint(ck(11))}${aO(c, '0;0;1', 1.8)}</g>` +
      rect(1, 8, 4, 1, '#9ab86a', aA(c, 'width', '4;9;14', 1.8))
  },
  web: (c) => paint([[0, 0, 16, 2, '#c9ced8'], [1, 0, 1, 1, '#e07a61'], [3, 0, 1, 1, '#eec96f'], [5, 0, 1, 1, '#9ab86a'],
    [1, 3, 6, 5, '#6f91dc'], [1, 6, 6, 2, '#9ab86a'],
    [5, 4, 1, 1, '#eec96f'], [8, 3, 7, 1, '#a6abb5'], [8, 5, 6, 1, '#a6abb5'],
      [8, 7, 7, 1, '#a6abb5']]) + rect(0, 2, 3, 1, '#6f91dc', aA(c, 'width', '3;8;12;16', 2)),
  delegating: (c) => paint([[12, 1, 2, 2, '#c678dd'], [12, 4, 2, 2, '#c678dd'], [12, 7, 2, 2, '#c678dd']]) +
    `<g>${paint([[3, 3, 1, 1, '#ece2cd'], [1, 4, 4, 1, '#ece2cd'], [3, 5, 1, 1, '#ece2cd']])}${aT(c, '0 -3;3 0;6 3', 1.2)}</g>`,
  planning: (c) => {
    const box = (y) => [[1, y, 3, 1], [1, y + 2, 3, 1], [1, y + 1, 1, 1], [3, y + 1, 1, 1]].map((r) => [...r, '#8a8478'])
    return paint([...box(0), ...box(3), ...box(6), [6, 1, 8, 1, '#a59d8c'], [6, 4, 6, 1, '#a59d8c'], [6, 7, 8, 1, '#a59d8c'],
      [2, 1, 1, 1, '#4f7a1f']]) +
      rect(2, 4, 1, 1, '#4f7a1f', aO(c, '0;1;1', 2.4))
  },
  talking: (c) => paint([[2, 1, 12, 5, '#ece2cd'], [4, 6, 2, 1, '#ece2cd'], [4, 7, 1, 1, '#ece2cd'], [9, 7, 6, 2, '#9ab86a']]) +
    [4, 7, 10].map((x, i) => rect(x, 3, 2, 1, '#7a6f5c', aO(c, i === 0 ? '1;1;1' : i === 1 ? '0;1;1' : '0;0;1', 1.5))).join(''),
  design: (c) => {
    const cols = ['#e07a61', '#eec96f', '#6f91dc']
    const cycle = (i) => [0, 1, 2].map((k) => cols[(i + k) % 3]).join(';')
    return [1, 6, 11].map((x, i) => rect(x, 2, 4, 6, cols[i], aA(c, 'fill', cycle(i), 1.8))).join('')
  },
  tools: (c) => paint([[6, 3, 5, 1, '#a4977c'], [6, 7, 5, 1, '#a4977c'], [6, 4, 1, 3, '#a4977c'], [10, 4, 1, 3, '#a4977c']]) +
    `<g>${paint([[8, 2, 1, 1, '#a4977c'], [8, 8, 1, 1, '#a4977c'], [5, 5, 1, 1, '#a4977c'], [11, 5, 1, 1, '#a4977c']])}${aO(c, '1;0', 0.8)}</g>` +
    `<g opacity="0">${paint([[5, 2, 1, 1, '#a4977c'], [11, 2, 1, 1, '#a4977c'], [5, 8, 1, 1, '#a4977c'],
      [11, 8, 1, 1, '#a4977c']])}${aO(c, '0;1', 0.8)}</g>`,
  think: (c) => [3, 7, 11].map((x, i) => rect(x, 4, 2, 2, '#9ab86a', aO(c, ['1;1;1', '0;1;1', '0;0;1'][i], 1.5))).join(''),
  wait: (c) => rect(14, 8, 1, 1, '#b48ead', aO(c, '1;0', 1)),
  ask: (c) => `<g>${paint(mapRects(['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'], { '#': ROLE.ask }, 6, 1))}${aO(c, '1;1;.35', 1.2)}</g>`,
  // the turn handed in: a big check, still; stopped: the pause sign; an error: a warning sign with its '!', blinking
  done: () => paint([[11, 2, 1, 1], [10, 3, 2, 1], [4, 4, 1, 1], [9, 4, 2, 1], [4, 5, 2, 1], [8, 5, 2, 1], [5, 6, 4, 1], [6, 7, 2, 1]]
    .map((r) => [...r, ROLE.idle])),
  stop: () => paint([[5, 2, 2, 6, ROLE.accent], [9, 2, 2, 6, ROLE.accent]]),
  err: (c) => `<g>${paint([[7, 1, 1, 1], [6, 2, 1, 2], [8, 2, 1, 2], [5, 4, 1, 2], [9, 4, 1, 2], [4, 6, 1, 2], [10, 6, 1, 2], [3, 8, 9, 1],
    [7, 3, 1, 3], [7, 7, 1, 1]].map((r) => [...r, ROLE.warn]))}${aO(c, '1;1;.35', 1.6)}</g>`,
  doze: (c) => `<g>${rect(0, 0, 2, 2, '#2e4a52')}${aT(c, '2 2;8 5;12 1;5 6;10 7', 5)}</g>`,
  off: () => paint([[11, 1, 1, 1, '#1d232c'], [12, 2, 1, 1, '#1d232c'], [13, 3, 1, 1, '#1d232c']]),
}

// ---------------------------------------------------------------- Clawd poses

const at = (rs, dx, dy, f) => rs.map(([x, y, w, h, fill]) => [x + dx, y + dy, w, h, f ?? fill])
// Left-arm shapes in the 25 × 15 box (the right arm is the mirror image): the official stub, typing (the same stub,
// bobbing), drooped, bent up at the elbow (the boss), raised high (a hand up), pointing out, a pixel down (on the
// mouse), straight up beside the head (a stretch, clear of the monitor on the left).
/** Left-arm shapes for clawd() (the right arm mirrors): out, type, droop, up, high, point, mouse, raise. */
export const ARM = {
  out: [[0, 6, 3, 3]], type: [[0, 6, 3, 3]], droop: [[0, 8, 3, 3]],
  up: [[0, 6, 3, 3], [0, 1, 2, 5]], high: [[0, 6, 3, 3], [-1, 3, 3, 3], [-2, 0, 3, 3], [-3, -3, 3, 3]], point: [[-3, 5, 6, 3]],
  mouse: [[0, 7, 3, 3]], raise: [[0, 6, 3, 3], [0, -3, 2, 9]],
}
const mirror = (rs) => rs.map(([x, y, w, h]) => [25 - x - w, y, w, h])

/**
 * One character of the cast (`agent`, cast.mjs) in its 25 × 15 box (its sprite at 1.5×). `look` shifts both eyes toward
 * what it works on, as in Claude Code's own art (at most the character's `reach` each way); `shut` turns each eye into a
 * 1-px dash; `arms` is [left, right] from ARM (typing arms bob, a raised hand waves); `legs` only when standing (true)
 * or walking ('walk': the feet left and right of the middle lift in turns, still when not animating); `sink`
 * lowers the whole body; `blinkAt` is the blink phase; `lit` lays its shadow on the ground under its feet (a walker out
 * on the street) in the finer art (fine()), which lights every figure as the live floors light theirs. Wrap a new pose in
 * a sprite (defineSprites) rather than calling
 * it per figure: `{ 'wk-cheer': (c) => clawd(c, …) }`, or one per character with castSprites.
 */
export function figure(c, agent, { look = [0, 0], shut = false, arms = ['out', 'out'], legs = false, sink = 0, blinkAt = null, typeDur = 0.5, typeAt = 0, lit = false } = {}) {
  const ch = CAST[agentId(agent)]
  const P = PARTS[ch.id]
  const reach = ch.reach ?? 2
  const [lx, ly] = look.map((v) => Math.max(-reach, Math.min(reach, v)))
  const armFill = [].concat(ch.arm)
  const walking = legs === 'walk' && c.animate
  let s
  if (fine(c)) {
    // The finer art: the figure put together from the cast's shared parts, as the live floors' are, so every figure of a
    // drawing is lit alike and a pose is a handful of <use>s (a body is drawn once, however many poses show it): its
    // body lit (in the dark of its screen when it sleeps), its shadow on the wall behind it; the cast's arms, a typing
    // pair and a waving hand on the shared rhythms; its legs. `lit`: its shadow on the ground under its feet too.
    const plain = Boolean(c.caps?.art)
    const loop = (a, side) => (!c.animate ? null : a === 'type' ? (typeAt ? 'B' : 'A') : a === 'high' && side ? 'W' : null)
    const arm = (side) => use(c, armName(arms[side] === 'type' ? 'out' : arms[side], side, loop(arms[side], side), shut, plain), 0, sink, ` color="${armFill[side] ?? armFill[0]}"`)
    s = (lit ? paint([[5, 15 + sink, 18, 1, '#000/.3']]) : '') + use(c, `${ch.tag}-${shut ? 'dim' : 'lit'}`, 0, sink) +
      (legs ? use(c, `${ch.tag}-${walking ? 'walk' : 'legs'}`, 0, sink) : '') + arm(0) + arm(1)
    // its eyes the cast's too, where its look is one of the live floors' (FIGURE_EYES): they blink by themselves
    const eyes = Object.keys(FIGURE_EYES).find((k) => {
      const e = FIGURE_EYES[k]
      return (e.look?.[0] ?? 0) === look[0] && (e.look?.[1] ?? 0) === look[1] && (e.sink ?? 0) === sink && Boolean(e.shut) === shut
    })
    if (eyes) return s + eyesOf(c, ch, eyes, 0, 0, c.animate && blinkAt != null && !shut)
  } else {
    const armRects = arms.map((a, side) => at(side ? mirror(ARM[a]) : ARM[a], 0, sink, armFill[side] ?? armFill[0]))
    const moving = arms.map((a) => c.animate && (a === 'type' || a === 'high'))
    s = paint([...at(P.body, 0, sink), ...armRects.filter((_, i) => !moving[i]).flat(), ...(legs && !walking ? at(P.legs, 0, sink) : [])])
    arms.forEach((a, i) => {
      if (!moving[i]) return
      const v = a === 'high' ? '0 0;0 -1;0 0;0 0' : i ? '0 1;0 0' : '0 0;0 1'
      s += `<g>${paint(armRects[i])}${aT(c, v, a === 'high' ? 1.2 : typeDur, typeAt)}</g>`
    })
    if (walking) s += walkLegs(c, at(P.legs, 0, sink), 15 + sink)
  }
  const open = paint(at(P.eyes, lx, ly + sink))
  const dash = paint(P.eyes.map(([x, y, w, h, f]) => [x + lx, y + h - 1 + ly + sink, w, 1, f]))
  return s + (shut ? dash : blinkAt == null ? open : blink(c, open, dash, 4.2, blinkAt))
}

// A walker's legs (`legs` rects, the feet on `floor`): the ones left of the middle and those right of it take turns
// lifting their foot a pixel.
function walkLegs(c, legs, floor) {
  const left = (r) => r[0] + r[2] / 2 < 12.5
  const step = (lift) => paint(legs.map((r) => (left(r) === lift && r[1] + r[3] === floor ? [r[0], r[1], r[2], r[3] - 1, r[4]] : r)))
  return `<g>${step(true)}${aO(c, '1;0', 0.5)}</g><g opacity="0">${step(false)}${aO(c, '0;1', 0.5)}</g>`
}

/** One Clawd in its 25 × 15 box: figure() for Claude. */
export const clawd = (c, opts) => figure(c, 'claude', opts)

/**
 * The poses every character has, by the suffix of its sprite name (`${tag}${pose}`, tag from cast.mjs: Clawd's are
 * `cT0`, `cL`…, Dex's `dxT0`…). At a desk (box at desk (22, 12), the monitor on its left): typing (two phases), looking
 * at the screen, reading (eyes down the page), thinking (eyes up), delegating (pointing), the boss (arms up, watching
 * the interns), a hand up (looking at you), dozing (eyes shut, sunk, arms drooped); standing in the kitchen, chatting,
 * a mug in the right hand (the mug is drawn apart, in the project's color); walking down the street, right or left
 * (eyes ahead, the legs taking turns: `legs: 'walk'`).
 */
export const POSES = {
  T0: { look: [-2, 0], arms: ['type', 'type'], blinkAt: 0 },
  T1: { look: [-2, 0], arms: ['type', 'type'], typeDur: 0.4, typeAt: -0.2, blinkAt: -2.3 },
  L: { look: [-2, 0], blinkAt: -1.1 },
  R: { look: [-2, 2], blinkAt: -3.2 },
  H: { look: [1, -2], blinkAt: -0.6 },
  D: { look: [2, 0], arms: ['out', 'point'], blinkAt: -1.7 },
  B: { look: [-2, 2], arms: ['up', 'up'], blinkAt: -2.8 },
  A: { arms: ['out', 'high'], blinkAt: -0.3 },
  Z: { shut: true, sink: 1, arms: ['droop', 'droop'] },
  K0: { look: [2, 0], legs: true, blinkAt: -0.9 },
  K1: { look: [-2, 0], legs: true, blinkAt: -3.4 },
  Wr: { look: [2, 0], legs: 'walk', blinkAt: -1.4, lit: true },
  Wl: { look: [-2, 0], legs: 'walk', blinkAt: -2.6, lit: true },
}

/**
 * The sprite name of a character's pose: `pose('codex', 'T0')` → 'dxT0'. Poses are POSES' keys plus `I0` `I1` (the
 * mini figure hopping on an intern bench) and `M` `Mw` (the micro figure, `Mw` hopping: working).
 */
export const pose = (agent, name) => `${CAST[agentId(agent)].tag}${name}`

/**
 * Who stands in a drawing's generic seats (a room of what they did, a facade window, a calendar's mascot): `(i) →
 * agent id` for seat i, the cast mixed by agent-time (facts `totals.agents`, largest remainders over 20 seats, busiest
 * first), so a week that was 80% Claude and 20% Codex seats about one Dex in five. An office with no agent split is all
 * Clawd. Reads raw facts.
 */
export function castPicker(f) {
  const shares = agentShares(f?.totals?.agents)
  if (shares.length <= 1) {
    const only = shares[0]?.[0] ?? 'claude'
    return () => only
  }
  const N = 20
  const total = shares.reduce((a, [, m]) => a + m, 0)
  const seats = shares.map(([a, m]) => ({ a, n: Math.floor((m / total) * N), r: (m / total) * N % 1 }))
  let left = N - seats.reduce((a, s) => a + s.n, 0)
  for (const s of [...seats].sort((x, y) => y.r - x.r)) if (left-- > 0) s.n++
  // spread each agent's seats over the cycle (the busiest takes the first seat), so a room of 3 is not 3 of a kind
  const cycle = new Array(N)
  const order = seats.flatMap((s) => Array.from({ length: s.n }, (_, k) => ({ a: s.a, at: (k + 0.5) / s.n })))
  order.sort((x, y) => x.at - y.at)
  order.forEach((o, i) => { cycle[i] = o.a })
  return (i) => cycle[((i % N) + N) % N] ?? shares[0][0]
}

/**
 * What one figure of a drawing is called: its character's name when the office is one agent's ('Clawd'), else 'agent'
 * (ctx.pick, castPicker's: an office with no agent split is Clawd's).
 */
export function figureWord(ctx) {
  const seen = new Set(Array.from({ length: 20 }, (_, i) => (ctx.pick ? ctx.pick(i) : 'claude')))
  return seen.size > 1 ? 'agent' : CAST[[...seen][0]]?.who ?? 'Clawd'
}

/**
 * Every sprite `use(ctx, name)` can place: name → (ctx) → markup, drawn once into <defs> on first use. The cast's poses
 * (`${tag}${pose}`, see POSES and pose(): cT0 cT1 cL cR cH cD cB cA cZ at a desk, cK0 cK1 standing, cWr cWl walking, cI0 cI1 interns, cM cMw
 * micro, and the same for every character), robot, desk furniture (desk chair
 * plaque kb mon mug steam), screens (`s-<kind>`, fl0-2 flicker), bubbles (bt bq bw zz), plant cooler coffee rack coat
 * cat vac, sky (sun moon cl-puff cl-streak cl-puffS, the lean sky's sun-s moon-s cloud cloud-dawn cloud-dusk), building (ac tower
 * board crate wn wd). Scenes add their own with defineSprites().
 */
export const SPRITES = {
  robot: () => sprite(ROBOT, ROBOT_LEG),
  fl0: (c) => rect(0, 0, 16, 10, '#ffffff/0', aA(c, 'fill-opacity', '0;0;.08;0;0;0;.05;0', 3.2)),
  fl1: (c) => rect(0, 0, 16, 10, '#ffffff/0', aA(c, 'fill-opacity', '0;.06;0;0;0;0;0;.04', 4.1, -1.3)),
  fl2: (c) => rect(0, 0, 16, 10, '#ffffff/0', aA(c, 'fill-opacity', '0;0;0;0;.07;0;0;0', 2.7, -0.6)),
  // the desk chair seen under the desk (Clawd hides the rest): seat, stem, wheels
  chair: () => paint([[29, 30, 12, 1, K.chairHi], [29, 31, 12, 1, K.chair], [34, 32, 2, 2, K.chair], [31, 34, 8, 1, K.chair],
    [30, 35, 2, 1, K.chair], [34, 35, 2, 1, K.chair], [38, 35, 2, 1, K.chair]]),
  // a name plaque on the desk front, in the project's color
  plaque: () => paint([[29, 26, 10, 3, 'cur']]) + paint([[29, 28, 10, 1, '#000/.3'], [31, 27, 6, 1, '#000/.2']]),
  // desk: top at y 24, drawer pedestal left, leg right, floor at y 36
  desk: () => paint([
    [0, 24, 48, 1, '#c9a26b'], [0, 25, 48, 1, '#8f6d43'], [1, 26, 46, 4, '#6e5233'], [1, 26, 12, 10, '#6e5233'], [45, 26, 2, 10, '#6e5233'],
    [2, 27, 10, 3, '#7d5f3c'], [2, 31, 10, 3, '#7d5f3c'], [13, 29, 32, 1, '#5a4129'], [1, 35, 12, 1, '#4a3520'],
  ]) + paint([[6, 28, 2, 1, '#c9a26b'], [6, 32, 2, 1, '#c9a26b']]),
  kb: () => paint([[28, 23, 13, 1, '#d6d0c4'], ...[29, 31, 33, 35, 37, 39].map((x) => [x, 23, 1, 1, '#a49d90'])]),
  mon: () => paint([[0, 0, 18, 12, '#2b2f36'], [1, 0, 16, 1, '#454c57'], [7, 12, 4, 2, '#2b2f36'], [5, 14, 8, 1, '#3a3f48'],
    [15, 11, 1, 1, '#6a8a4a']]),
  // a mug in the project's color (currentColor), a dark rim, steam
  mug: (c) => paint([[0, 1, 3, 3, 'cur'], [3, 2, 1, 1, 'cur']]) + paint([[0, 1, 3, 1, '#000/.3']]) + use(c, 'steam', 1, -1),
  steam: (c) => `<g fill="#d8d2c4" opacity=".7">${rect(0, 0, 1, 1, 'inh')}${rect(1, -2, 1, 1, 'inh')}${rect(0, -4, 1, 1, 'inh')}` +
    `${aT(c, '0 0;0 -1;0 -2;0 -3', 1.6)}${aO(c, '.8;.6;.4;0', 1.6)}</g>`,
  zz: (c) => (c.animate
    ? [0, 1, 2].map((i) => `<g>${pixText('z', 0, 0, '#d8f0ea')}${aT(c, '0 0;2 -3;4 -6;6 -9', 2.4, -i * 0.8)}${aO(c, '1;.8;.5;0', 2.4, -i * 0.8)}</g>`).join('')
    : pixText('z', 0, 0, '#d8f0ea') + `<g opacity=".6">${pixText('z', 4, -6, '#d8f0ea')}</g>`),
  // a raised hand's bubble, big and bold so a question reads from across the building: white, outlined in ink, a fat
  // ? in the asking coral (a shade deeper, for the white), its tail down to the hand, hopping (13 × 14)
  bq: (c) => `<g>${sprite(['..ooooooooo..', '.owwwwwwwwwo.', 'owwwwRRRwwwwo', 'owwwRRwRRwwwo', 'owwwwwwRRwwwo', 'owwwwwRRwwwwo', 'owwwwRRwwwwwo',
    'owwwwRRwwwwwo', 'owwwwwwwwwwwo', 'owwwwRRwwwwwo', '.owwwwwwwwwo.', '..owwoooooo..', '..owo........', '..oo.........'],
  { o: '#2a1d16', w: '#fffaf0', R: '#e2563d' })}${aT(c, '0 0;0 -2;0 -2;0 0;0 0', 1.4)}</g>`,
  bt: (c) => [[0, 7, 1], [2, 4, 2], [5, 0, 3]]
    .map(([x, y, s], i) => `<g>${paint([[x, y, s, s, '#d8d2c4']])}${aO(c, ['1;1;1;0', '0;1;1;0', '0;0;1;0'][i], 2)}</g>`).join(''),
  bw: (c) => [0, 2, 4].map((x, i) => `<g>${rect(x, 0, 1, 1, ROLE.wait)}${aO(c, ['1;1;1;0', '0;1;1;0', '0;0;1;0'][i], 1.6)}</g>`).join(''),
  plant: () => sprite(PLANT, PLANT_LEG),
  cooler: (c) => sprite(COOLER, COOLER_LEG) + [0, 1]
    .map((i) => `<g opacity="0">${rect(4, 5, 1, 1, '#d8efff')}${aT(c, '0 0;1 -1;0 -2;1 -3', 1.6, -i * 0.8)}${aO(c, '1;1;1;0', 1.6, -i * 0.8)}</g>`).join(''),
  coffee: (c) => paint([[0, 8, 24, 2, '#c9a26b'], [1, 10, 22, 8, '#6e5233'], [2, 11, 9, 6, '#7d5f3c'], [13, 11, 9, 6, '#7d5f3c'],
    [9, 13, 1, 2, '#c9a26b'], [14, 13, 1, 2, '#c9a26b'],
    [3, 0, 8, 8, '#2b2b33'], [4, 1, 6, 2, '#454552'], [9, 4, 1, 1, '#e07a61'], [5, 5, 3, 3, '#f4efe4'], [16, 5, 3, 3, '#f4efe4'],
      [19, 6, 1, 1, '#f4efe4']]) + use(c, 'steam', 17, 3),
  rack: () => paint([[5, 2, 2, 27, '#7a5a3a'], [4, 0, 4, 2, '#9a7b4f'], [1, 3, 10, 1, '#7a5a3a'], [1, 2, 1, 1, '#7a5a3a'],
    [10, 2, 1, 1, '#7a5a3a'], [2, 29, 8, 2, '#5d4630']]),
  coat: () => paint([[0, 0, 4, 11, 'cur'], [0, 0, 4, 2, '#000/.25'], [1, 2, 1, 7, '#000/.15']]),
  cat: (c) => sprite(CAT.slice(0, 5), CAT_LEG) +
    `<g>${paint(mapRects(['t'], CAT_LEG, 0, 4))}${paint(mapRects(['tt'], CAT_LEG, 0, 5))}${aO(c, '1;0', 1.4)}</g>` +
    `<g opacity="0">${paint(mapRects(['t', 't'], CAT_LEG, 0, 2))}${aO(c, '0;1', 1.4)}</g>`,
  vac: () => sprite(VAC, { d: '#3a3d44', D: '#4a4e57', L: ROLE.idle, k: '#1a1b1f' }),
  // the sky's bodies, their middle at (0, 0), the sun in the colors of the <use> that places it, and its clouds, in a
  // light's tint (cloudTint)
  moon: () => moonSprite(),
  sun: () => sunSprite(),
  // the lean sky's (a drawing near its size budget): the small sun, rays and all, and the small moon, their middle at
  // (0, 0) too, and its one cloud
  'sun-s': () => paint([[-1, -3, 3, 7, K.sun], [-3, -1, 7, 3, K.sun], [-2, -2, 5, 5, K.sun], [0, -5, 1, 1, K.sun], [0, 5, 1, 1, K.sun],
    [-5, 0, 1, 1, K.sun], [5, 0, 1, 1, K.sun]]),
  'moon-s': () => sprite(MOON, { m: K.moon, M: THEME.sky.moonShade }, -4, -4),
  cloud: () => sprite(CLOUD, { c: K.cloud, s: K.cloudSh }),
  'cloud-dawn': () => sprite(CLOUD, { c: THEME.sky.cloudDawn[0], s: THEME.sky.cloudDawn[1] }),
  'cloud-dusk': () => sprite(CLOUD, { c: THEME.sky.cloudDusk[0], s: THEME.sky.cloudDusk[1] }),
  'cl-puff': () => cloudSprite('puff'),
  'cl-streak': () => cloudSprite('streak'),
  'cl-puffS': () => cloudSprite('puffS'),
  board: () => paint([[0, 0, 46, 21, '#cfc8b8'], [1, 1, 44, 19, '#f4f1e8'], [4, 21, 38, 1, '#8a8478'], [8, 21, 2, 1, '#e07a61'],
    [11, 21, 2, 1, '#6f91dc']]),
  crate: () => paint([[0, 0, 10, 8, '#8a6a40'], [0, 0, 10, 1, '#a8854f'], [1, 3, 8, 1, '#6e5233'], [4, 1, 2, 7, '#6e5233']]),
}
SPRITES.wn = () => winSprite(true)
SPRITES.wd = () => winSprite(false)
// the cast: every pose of every character, its mini figure hopping on an intern bench and its micro one (Mw hops: working)
for (const a of AGENT_IDS) {
  const { tag, mini, micro } = CAST[a]
  const leg = miniLegend(a)
  for (const [p, o] of Object.entries(POSES)) SPRITES[`${tag}${p}`] = (c) => figure(c, a, o)
  SPRITES[`${tag}M`] = () => sprite(micro, leg)
  SPRITES[`${tag}Mw`] = (c) => `<g>${sprite(micro, leg)}${aT(c, '0 0;0 -1;0 0;0 0', 1.2)}</g>`
  SPRITES[`${tag}I0`] = (c) => sprite(mini, leg) + aT(c, '0 0;0 0;0 -1;0 0', 1.2)
  SPRITES[`${tag}I1`] = (c) => sprite(mini, leg) + aT(c, '0 0;0 -1;0 0;0 0', 1.2, -0.5)
}
for (const k of Object.keys(SCREEN)) SPRITES[`s-${k}`] = (c) => rect(0, 0, 16, 10, SCREEN_BG[k]) + SCREEN[k](c)

// ---------------------------------------------------------------- the cast lit, each figure on a timeline of its own

// A live drawing lights its characters rather than repainting them: the light on a figure is translucent overlays on
// its own colors (its top edge lit, the rim its screen casts on its near side, its far side in shade) and the soft
// shadow it casts on the wall behind it. Only a character's body colors take the light (a fourth of its pixels or
// more): its mark, Gem's sparkle, Mooni's moon, Rok's slash, keeps its own glow.
/** The light on a figure (fill specs), by night and by day: its top edge, the screen's rim (night), the shade, its shadow. */
export const FIGURE_LIGHT = {
  night: { top: '#ffe9c8/.2', rim: '#c4f0ff/.32', shade: '#120a26/.26', drop: '#05040c/.34' },
  day: { top: '#fff3d6/.26', rim: null, shade: '#1c1220/.2', drop: '#0c0a14/.26' },
}
// (a replay runs through its days and nights in one drawing: its figures keep the day's light, which has no screen's rim)
const lightOf = (c) => FIGURE_LIGHT[c.night && c.view !== 'timelapse' ? 'night' : 'day']

// Where light lands on a character's body, as rows of its 25 × 15 box: 's' its 2 rightmost pixels (shade), 'r' its
// leftmost (the rim, the side its monitor is on; 'R' where that is also its top edge, which takes the top light when
// there is no rim), 'h' its top edge.
function lightMap(ch) {
  const twin = (e) => Object.keys(ch.legend).find((c) => !ch.eyes.includes(c) && ch.legend[c] === ch.legend[e]) ?? e
  const grid = at15(ch.sprite).map((row) => [...row].map((c) => (ch.eyes.includes(c) ? twin(c) : c)).join(''))
  const isBody = (x, y) => y >= 0 && y < 12 && x >= 3 && x <= 21 && Object.hasOwn(ch.legend, grid[y][x])
  const count = {}
  for (let y = 0; y < 12; y++) for (let x = 3; x <= 21; x++) if (isBody(x, y)) count[grid[y][x]] = (count[grid[y][x]] ?? 0) + 1
  const total = Object.values(count).reduce((a, n) => a + n, 0)
  return Array.from({ length: 12 }, (_, y) => {
    const xs = Array.from({ length: 19 }, (_, i) => i + 3).filter((x) => isBody(x, y))
    return Array.from({ length: 25 }, (_, x) => {
      if (!isBody(x, y) || count[grid[y][x]] < total / 4) return '.'
      if (x >= xs.at(-1) - 1) return 's'
      if (x === xs[0]) return isBody(x, y - 1) ? 'r' : 'R'
      return isBody(x, y - 1) ? '.' : 'h'
    }).join('')
  })
}
const LIGHT_MAP = Object.fromEntries(AGENT_IDS.map((a) => [a, lightMap(CAST[a])]))
// a character's body as its frames draw it: its shadow on the wall, its own colors, the light on them
function litBody(c, ch, dark) {
  const L = lightOf(c)
  const rim = !dark && L.rim
  const body = PARTS[ch.id].body
  return paint(body.map(([x, y, w, h]) => [x + 2, y + 1, w, h, L.drop])) + paint(body) +
    paint(mapRects(LIGHT_MAP[ch.id], { h: L.top, s: L.shade, ...(rim ? { r: rim, R: rim } : { R: L.top }) }))
}
// the light on an arm: the near one (left) takes the rim and the top light, the far one is in shade
function armLight(rs, side, L, dark) {
  if (!L.top) return []
  if (side) return rs.map(([x, y, w, h]) => [x, y, w, h, L.shade])
  const rim = !dark && L.rim
  return rs.flatMap(([x, y, w, h]) => [...(rim ? [[x, y, 1, h, rim]] : []), [x + (rim ? 1 : 0), y, w - (rim ? 1 : 0), 1, L.top]])
}

// Typing is two hands taking turns at an uneven pace ('1': that hand down on a key, one char a tick); the wave lifts the
// raised hand. Shared by every figure that types or waves: only visible while its own timeline shows that frame.
const RHYTHM = {
  A: { tick: 0.1, p: ['1001001000100100', '0100100101001010'], on: '0 1' },
  B: { tick: 0.1, p: ['1010000101000', '0000101000101'], on: '0 1' },
  W: { tick: 0.2, p: [null, '10'], on: '0 -1' },
}
function rhythm(c, id, side) {
  const R = RHYTHM[id]
  const p = R?.p[side]
  if (!c.animate || !p) return ''
  return `<animateTransform attributeName="transform" type="translate" values="${[...p].map((b) => (b === '1' ? R.on : '0 0')).join(';')}" ` +
    `dur="${r2(p.length * R.tick)}s" calcMode="discrete" repeatCount="indefinite"/>`
}

/**
 * The body frames a figure moves through (sprites `${tag}-f-${name}`): its arms (ARM), how far it sinks (dozing,
 * nodding) or rises (stretching), which arms run a rhythm (typing, waving), whether it stands (the kitchen), and
 * `dark` when its screen is off (no rim of light).
 */
export const FIGURE_BODY = {
  rest: { arms: ['out', 'out'] },
  typeA: { arms: ['out', 'out'], loop: ['A', 'A'] },
  typeB: { arms: ['out', 'out'], loop: ['B', 'B'] },
  mouse: { arms: ['out', 'mouse'] },
  stretch: { arms: ['raise', 'raise'], sink: -1 },
  hand: { arms: ['out', 'high'] },
  wave: { arms: ['out', 'high'], loop: [null, 'W'] },
  doze1: { arms: ['droop', 'droop'], sink: 1, dark: true },
  doze2: { arms: ['droop', 'droop'], sink: 2, dark: true },
  nod: { arms: ['out', 'out'], sink: 1 },
  point: { arms: ['out', 'point'] },
  boss: { arms: ['up', 'up'] },
  scratch: { arms: ['out', 'up'] },
  stand: { arms: ['out', 'out'], legs: true },
}
/**
 * The eye frames (sprites `${tag}-e-${name}`): where the eyes look (at most the character's reach each way), how far
 * the body has sunk or risen under them, and shut (a 1-px dash: a blink, sleep, a happy stretch).
 */
export const FIGURE_EYES = {
  scr: { look: [-2, 0] }, scr1: { look: [-2, 1] }, scr2: { look: [-2, 2] }, kb: { look: [-1, 2] }, right: { look: [2, 0] }, front: {},
  up: { look: [1, -2] }, upL: { look: [-1, -2] }, startle: { look: [0, -1] }, nod: { sink: 1 },
  shutS: { look: [-2, 0], shut: true }, shutF: { shut: true }, shutR: { look: [2, 0], shut: true }, shutK: { look: [-1, 2], shut: true },
  happy: { sink: -1, shut: true }, doze1: { sink: 1, shut: true }, doze2: { sink: 2, shut: true },
}
// the shut eyes that blink each open look
const SHUT = { scr: 'shutS', front: 'shutF', right: 'shutR', kb: 'shutK' }

// A frame: the character's body (sunk or risen), its legs if it stands, and its two arms. The arms are the whole cast's
// (one sprite per shape, side, rhythm and light, in currentColor: the frame sets the character's arm colors), as are the
// eyes (one sprite per frame and eye shape: EYE_SHAPE), so a second character in the office costs little more than its body.
function bodyFrame(c, ch, spec) {
  const sink = spec.sink ?? 0
  const fills = [].concat(ch.arm)
  // a lighter drawing's figures stand still: their arms take no light
  const plain = Boolean(c.caps?.art)
  const arm = (side) => use(c, armName(spec.arms[side], side, spec.loop?.[side], spec.dark, plain), 0, sink, ` color="${fills[side] ?? fills[0]}"`)
  return use(c, `${ch.tag}-${spec.dark ? 'dim' : 'lit'}`, 0, sink) + (spec.legs ? use(c, `${ch.tag}-legs`, 0, sink) : '') + arm(0) + arm(1)
}
const armName = (shape, side, loop, dark, plain) => `arm-${shape}${side}${loop ?? ''}${dark ? 'd' : ''}${plain ? 'p' : ''}`
function armSprite(c, shape, side, loop, dark, plain) {
  const rs = (side ? mirror(ARM[shape]) : ARM[shape]).map(([x, y, w, h]) => [x, y, w, h, 'cur'])
  const m = paint(rs) + (plain ? '' : paint(armLight(rs, side, lightOf(c), dark)))
  const t = rhythm(c, loop, side)
  return t ? `<g>${m}${t}</g>` : m
}
// Eye shapes: where a character's eyes sit and how far they reach (cast.mjs); most of the cast shares Clawd's.
const EYE_SHAPES = []
const EYE_SHAPE = Object.fromEntries(AGENT_IDS.map((a) => {
  const key = JSON.stringify({ eyes: PARTS[a].eyes.map(([x, y, w, h]) => [x, y, w, h]), reach: CAST[a].reach ?? 2 })
  if (!EYE_SHAPES.includes(key)) EYE_SHAPES.push(key)
  return [a, EYE_SHAPES.indexOf(key)]
}))
function eyeFrame(g, { look = [0, 0], sink = 0, shut = false }) {
  const { eyes, reach } = JSON.parse(EYE_SHAPES[g])
  const [lx, ly] = look.map((v) => Math.max(-reach, Math.min(reach, v)))
  return paint(eyes.map(([x, y, w, h]) => (shut ? [x + lx, y + h - 1 + ly + sink, w, 1, 'cur'] : [x + lx, y + ly + sink, w, h, 'cur'])))
}
// a character's eyes in a frame: the shared eye sprite of its shape, in its eye color (`blinking`: the one that blinks by itself)
const eyesOf = (c, ch, e, x = 0, y = 0, blinking = false) => use(c, `eye${EYE_SHAPE[ch.id]}-${e}${blinking ? '-b' : ''}`, x, y, ` color="${ch.eye}"`)

// ---- scripts: what a figure does, second by second ({ d: seconds, b: body frame, e: eye frame } segments)

const STRETCH = [{ d: 0.3, b: 'rest', e: 'front' }, { d: 1.4, b: 'stretch', e: 'happy' }, { d: 0.45, b: 'rest', e: 'front' }]
const NEIGHBOR = [{ d: 1.5, b: 'rest', e: 'right' }, { d: 0.35, b: 'rest', e: 'front' }]
const SCRATCH = [{ d: 1.3, b: 'scratch', e: 'up' }]
const WAKE = [{ d: 0.6, b: 'doze2', e: 'doze2' }, { d: 0.18, b: 'rest', e: 'startle' }, { d: 0.6, b: 'rest', e: 'front' },
  { d: 0.7, b: 'rest', e: 'scr' }, { d: 0.6, b: 'rest', e: 'right' }, { d: 0.5, b: 'doze1', e: 'doze1' }]
const add = (s, seq) => {
  s.push(...seq)
  return seq.reduce((a, x) => a + x.d, 0)
}
// the kitchen: facing a neighbour (right or left), a look around, a look down at the mug
function chat(r, toward) {
  const s = []
  const L = 9 + r() * 6
  let t = 0
  while (t < L) {
    t += add(s, [{ d: 1.5 + r() * 2.2, b: 'stand', e: toward }])
    if (r() < 0.35) t += add(s, [{ d: 0.9 + r(), b: 'stand', e: 'front' }])
    if (r() < 0.25) t += add(s, [{ d: 0.5, b: 'stand', e: 'kb' }])
  }
  return s
}

/** What a figure does, by script name: `(rng) → segments`. Each loop is a few tens of seconds, seeded per figure. */
export const SCRIPTS = {
  // coding, the terminal, tests: bursts of typing, pauses on the screen, a glance at the keys, one stretch a loop
  type(r) {
    const s = []
    const L = 16 + r() * 10
    const fid = 5 + r() * (L - 10)
    let t = 0
    let n = 0
    let done = false
    while (t < L) {
      t += add(s, [{ d: 1.1 + r() * 2.8, b: n++ % 2 ? 'typeB' : 'typeA', e: 'scr' }])
      if (!done && t > fid) {
        done = true
        t += add(s, r() < 0.7 ? STRETCH : r() < 0.5 ? NEIGHBOR : SCRATCH)
      }
      if (r() < 0.25) t += add(s, [{ d: 0.45, b: 'rest', e: 'kb' }])
      t += add(s, [{ d: 0.4 + r() * 2.2, b: 'rest', e: 'scr' }])
    }
    return s
  },
  // the web, a chat, a plan: the eyes run down the screen line by line, a click to scroll, back to the top
  look(r) {
    const s = []
    const L = 15 + r() * 9
    const fid = 4 + r() * (L - 8)
    let t = 0
    let done = false
    while (t < L) {
      for (const e of ['scr', 'scr1', 'scr2']) t += add(s, [{ d: 0.5 + r() * 0.7, b: 'rest', e }])
      if (r() < 0.7) t += add(s, [{ d: 0.14, b: 'mouse', e: 'scr2' }, { d: 0.22, b: 'rest', e: 'scr2' }, { d: 0.14, b: 'mouse', e: 'scr2' }])
      t += add(s, [{ d: 0.6 + r() * 1.6, b: 'rest', e: 'scr' }])
      if (!done && t > fid) {
        done = true
        t += add(s, r() < 0.5 ? NEIGHBOR : STRETCH)
      }
    }
    return s
  },
  // reading: the eyes low on the page, slower lines, a scroll now and then
  read(r) {
    const s = []
    const L = 15 + r() * 9
    let t = 0
    while (t < L) {
      for (const e of ['scr1', 'scr2']) t += add(s, [{ d: 0.9 + r() * 1.1, b: 'rest', e }])
      if (r() < 0.5) t += add(s, [{ d: 0.14, b: 'mouse', e: 'scr2' }, { d: 0.3, b: 'rest', e: 'scr' }])
      if (r() < 0.12) t += add(s, NEIGHBOR)
    }
    return s
  },
  // thinking: the eyes up, wandering left and right, a scratch of the head, a look back at the screen
  think(r) {
    const s = []
    const L = 16 + r() * 10
    let t = 0
    while (t < L) {
      t += add(s, [{ d: 1.4 + r() * 1.6, b: 'rest', e: r() < 0.5 ? 'up' : 'upL' }])
      if (r() < 0.25) t += add(s, SCRATCH)
      if (r() < 0.3) t += add(s, [{ d: 0.8, b: 'rest', e: 'scr' }])
    }
    return s
  },
  // a hand up: waving in bursts, holding it up between them, a look back at the question on the screen
  ask(r) {
    const s = []
    const L = 12 + r() * 8
    let t = 0
    while (t < L) {
      t += add(s, [{ d: 1.0 + r() * 1.4, b: 'wave', e: 'front' }])
      t += add(s, [{ d: 0.8 + r() * 2.2, b: 'hand', e: r() < 0.35 ? 'scr' : 'front' }])
    }
    return s
  },
  // dozing: slow breaths, one nod too deep a loop and a start, a look around, back to sleep
  doze(r) {
    const s = []
    const L = 18 + r() * 8
    const nod = 6 + r() * (L - 12)
    let t = 0
    let done = false
    while (t < L) {
      t += add(s, [{ d: 1.5 + r() * 0.7, b: 'doze1', e: 'doze1' }, { d: 1.7 + r() * 0.9, b: 'doze2', e: 'doze2' }])
      if (!done && t > nod) {
        done = true
        t += add(s, WAKE)
      }
    }
    return s
  },
  // done: the work handed in, sitting back and looking out at you, a glance back at the screen, a stretch now and then
  done(r) {
    const s = []
    const L = 14 + r() * 8
    let t = 0
    while (t < L) {
      t += add(s, [{ d: 1.8 + r() * 2, b: 'rest', e: 'front' }])
      if (r() < 0.4) t += add(s, [{ d: 0.8 + r() * 0.8, b: 'rest', e: 'scr' }])
      if (r() < 0.2) t += add(s, STRETCH)
    }
    return s
  },
  // stopped or an error: the work cut short, staring at the screen, a scratch of the head, a look out at you
  stuck(r) {
    const s = []
    const L = 14 + r() * 8
    let t = 0
    while (t < L) {
      t += add(s, [{ d: 1.4 + r() * 1.6, b: 'rest', e: 'scr' }])
      if (r() < 0.35) t += add(s, SCRATCH)
      t += add(s, [{ d: 1 + r() * 1.2, b: 'rest', e: 'front' }])
    }
    return s
  },
  // waiting on helpers: the boss, hands behind the head, watching the interns and the screen
  boss(r) {
    const s = []
    const L = 14 + r() * 8
    let t = 0
    while (t < L) t += add(s, [{ d: 1.5 + r() * 1.5, b: 'boss', e: 'kb' }, { d: 1 + r() * 1.2, b: 'boss', e: r() < 0.3 ? 'right' : 'scr' }])
    return s
  },
  // delegating: pointing the way, a look back at the screen
  point(r) {
    const s = []
    const L = 12 + r() * 8
    let t = 0
    while (t < L) t += add(s, [{ d: 1.6 + r() * 1.8, b: 'point', e: 'right' }, { d: 0.8 + r() * 1, b: 'rest', e: 'scr' }])
    return s
  },
  // a meeting: watching the board on the left, nodding along, a glance across the table
  meet(r) {
    const s = []
    const L = 10 + r() * 6
    let t = 0
    while (t < L) {
      t += add(s, [{ d: 1.2 + r() * 2, b: 'rest', e: 'scr' }])
      if (r() < 0.5) t += add(s, [{ d: 0.3, b: 'nod', e: 'nod' }])
      if (r() < 0.3) t += add(s, [{ d: 0.8 + r() * 0.8, b: 'rest', e: r() < 0.5 ? 'front' : 'right' }])
    }
    return s
  },
  chat0: (r) => chat(r, 'right'),
  chat1: (r) => chat(r, 'scr'),
}
/** Each script's still frame [body, eyes]: a figure drawn without a timeline (no animation, or a lighter drawing). */
export const SCRIPT_STILL = { type: ['typeA', 'scr'], look: ['rest', 'scr'], read: ['rest', 'scr2'], think: ['rest', 'up'], ask: ['hand', 'front'],
  doze: ['doze1', 'doze1'], done: ['rest', 'front'], stuck: ['scratch', 'up'], boss: ['boss', 'kb'], point: ['point', 'right'], meet: ['rest', 'scr'],
  chat0: ['stand', 'right'], chat1: ['stand', 'scr'] }

/** xorshift32: a figure's script is the same at every render (its seed is the desk's session id). */
function xorshift(seed) {
  let s = (seed >>> 0) || 0x9e3779b9
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}
// blinks every 2–7 s at no fixed beat, one in five a double blink; never while the eyes are shut already
function withBlinks(r, segs) {
  const out = []
  let next = 0.8 + r() * 3
  let t = 0
  for (const sg of segs) {
    let start = t
    let left = sg.d
    while (SHUT[sg.e] && next > start + 0.05 && next < start + left - 0.2) {
      const pre = next - start
      out.push({ ...sg, d: pre }, { ...sg, d: 0.13, e: SHUT[sg.e] })
      let used = pre + 0.13
      if (r() < 0.2 && left - used > 0.5) {
        out.push({ ...sg, d: 0.12 }, { ...sg, d: 0.12, e: SHUT[sg.e] })
        used += 0.24
      }
      start += used
      left -= used
      next = start + 2 + r() * 5
    }
    out.push({ ...sg, d: left })
    t = start + left
    if (next < t) next = t + 0.4 + r() * 1.5
  }
  return out.filter((x) => x.d > 0.01)
}

// A timeline moves a character's sheet (`${tag}-sheet`), whose frames sit FRAME_D apart: only the one moved to 0 is in
// the figure's clip (and on the canvas at all, however wide the drawing). The sheet holds the (body, eyes) pairs the
// drawing's figures show, in first-use order, and is rewritten into <defs> as figures add pairs.
const FRAME_D = 2000
const kt3 = (k) => (k === 0 ? '0' : String(Math.round(k * 1e3) / 1e3).replace(/^0\./, '.'))
function frameOf(c, ch, b, e) {
  const list = ((c.sheets ??= {})[ch.tag] ??= [])
  const key = `${b}:${e}`
  const k = list.indexOf(key)
  return k < 0 ? list.push(key) - 1 : k
}
function writeSheet(c, ch) {
  c.defs.set(`${ch.tag}-sheet`, c.sheets[ch.tag].map((key, k) => {
    const [b, e] = key.split(':')
    return use(c, `${ch.tag}-f-${b}`, k * FRAME_D) + eyesOf(c, ch, e, k * FRAME_D)
  }).join(''))
}
// one figure's script as a clipped <use> of its character's sheet, moved by one discrete translate; at (x, y) if given
function onTimeline(c, ch, script, key, x, y) {
  use(c, 'fig-clip')
  const r = xorshift(fnv1a(`fig:${key}`))
  const segs = withBlinks(r, SCRIPTS[script](r))
  const L = segs.reduce((a, sg) => a + sg.d, 0)
  const begin = -r() * L
  const vals = []
  const kts = []
  let t = 0
  for (const sg of segs) {
    const v = -frameOf(c, ch, sg.b, sg.e) * FRAME_D
    const k = Math.round((t / L) * 1e3) / 1e3
    t += sg.d
    if (vals.at(-1) === v) continue
    if (kts.length && k <= kts.at(-1)) vals[vals.length - 1] = v
    else {
      vals.push(v)
      kts.push(k)
    }
  }
  kts[0] = 0
  writeSheet(c, ch)
  const anim = `<animateTransform attributeName="transform" type="translate" values="${vals.join(';')}" keyTimes="${kts.map(kt3).join(';')}" ` +
    `dur="${r2(L)}s" begin="${r2(begin)}s" calcMode="discrete" repeatCount="indefinite"/>`
  const at = x == null ? '' : ` transform="translate(${x} ${y})"`
  return `<g${at} clip-path="url(#${c.id}fig-clip-p)">${use(c, `${ch.tag}-sheet`, 0, 0, '', anim)}</g>`
}

/**
 * A figure of the cast in its 25 × 15 box at (x, y) (a desk's at (22, 12)), lit by the scene and doing what `script`
 * says (SCRIPTS), on a timeline of its own seeded by `key` (the desk's session id): so no two figures in the same pose
 * move in step. `shared` (a seat number) uses one of three timelines per script instead, for rooms of many figures (a
 * meeting, the kitchen). A lighter drawing (ctx.caps.art, renderSvg's size budget) shows the script's still frame, its
 * eyes blinking on their own (art 1) or not (art 2, the lightest); animate=false the still frame alone.
 */
export function castFigure(ctx, agent, script, key, x, y, { shared } = {}) {
  const ch = CAST[agentId(agent)]
  const [b, e] = SCRIPT_STILL[script]
  if (!ctx.animate) return use(ctx, `${ch.tag}-f-${b}`, x, y) + eyesOf(ctx, ch, e, x, y)
  if (ctx.caps?.art) return use(ctx, `${ch.tag}-f-${b}`, x, y) + eyesOf(ctx, ch, e, x, y, ctx.caps.art === 1 && !FIGURE_EYES[e].shut)
  if (shared != null) return use(ctx, `${ch.tag}-v-${script}${shared % 3}`, x, y)
  return onTimeline(ctx, ch, script, key, x, y)
}

defineSprites({
  // the clip a figure on a timeline is seen through, in its box's frame: the frame at 0, raised hands and shadow included
  'fig-clip': (c) => `<clipPath id="${c.id}fig-clip-p"><rect x="-10" y="-10" width="46" height="31"/></clipPath>`,
  ...Object.fromEntries(Object.keys(ARM).flatMap((shape) => [0, 1].flatMap((side) => [null, 'A', 'B', 'W'].flatMap((loop) => [false, true].flatMap((dark) =>
    [false, true].map((plain) => [armName(shape, side, loop, dark, plain), (c) => armSprite(c, shape, side, loop, dark, plain)])))))),
  ...Object.fromEntries(EYE_SHAPES.flatMap((_, g) => Object.entries(FIGURE_EYES).flatMap(([n, spec]) => [
    [`eye${g}-${n}`, () => eyeFrame(g, spec)],
    // open eyes that blink by themselves, for a figure drawn without a timeline
    ...(spec.shut ? [] : [[`eye${g}-${n}-b`, (c) => blink(c, eyeFrame(g, spec), eyeFrame(g, { ...spec, shut: true }), 4.2, phase(`eye${g}${n}`, 4.2))]]),
  ]))),
  ...Object.fromEntries(AGENT_IDS.flatMap((a) => {
    const ch = CAST[a]
    const P = PARTS[a]
    return [
      [`${ch.tag}-lit`, (c) => litBody(c, ch, false)],
      [`${ch.tag}-dim`, (c) => litBody(c, ch, true)],
      [`${ch.tag}-legs`, () => paint(P.legs)],
      // its legs walking (the finer art's walkers and their plain twins step alike)
      [`${ch.tag}-walk`, (c) => walkLegs(c, P.legs, 15)],
      [`${ch.tag}-sheet`, () => ''],
      ...Object.entries(FIGURE_BODY).map(([n, spec]) => [`${ch.tag}-f-${n}`, (c) => bodyFrame(c, ch, spec)]),
      // three shared timelines per script
      ...Object.keys(SCRIPTS).flatMap((s) => [0, 1, 2].map((n) => [`${ch.tag}-v-${s}${n}`, (c) => onTimeline(c, ch, s, `${ch.tag}:${s}:${n}`)])),
    ]
  })),
})

function winSprite(night) {
  const W = THEME.windows
  const glass = night ? W.glassNight : W.glassDay
  const deco = night ? [[3, 2, 1, 1, K.star], [12, 5, 1, 1, K.starDim], [6, 5, 1, 1, K.starDim]] : [[3, 3, 4, 1, W.glint],
    [2, 4, 6, 1, W.glint], [11, 2, 3, 1, W.glintCool]]
  return paint([[0, 0, 18, 9, W.frame], [1, 1, 16, 7, glass], ...deco, [9, 1, 1, 7, W.frame], [0, 8, 18, 1, W.sill]])
}

/**
 * Place a sprite: the first use draws it into ctx.defs (once per drawing), every use is a short `<use href>`.
 * `attrs` adds attributes (` color="${ctx.color(p)}"` tints its currentColor parts), `inner` adds SMIL children
 * (`aT(ctx, …)` to move it). This is what keeps a 20-desk office under the size budget.
 */
export function use(ctx, name, x = 0, y = 0, attrs = '', inner = '') {
  if (!ctx.defs.has(name)) {
    ctx.defs.set(name, '')
    ctx.defs.set(name, SPRITES[name](ctx))
  }
  const pos = (x ? ` x="${x}"` : '') + (y ? ` y="${y}"` : '')
  return `<use href="#${ctx.id}${name}"${pos}${attrs}${inner ? `>${inner}</use>` : '/>'}`
}

/** Sprite names defineSprites refused because the name was taken (the tests keep this empty). */
export const SPRITE_CLASHES = []

/**
 * Add a scene's own sprites to the registry `use()` reads: call it once at module top level with names prefixed per
 * scene ('wk-', 'td-', 'mo-'; letters, digits, '-' and '_' only, they become XML ids). A name already taken keeps its
 * first drawing and lands in SPRITE_CLASHES instead of throwing, so the desktop pane keeps loading.
 */
export function defineSprites(map) {
  for (const [name, draw] of Object.entries(map)) {
    if (Object.hasOwn(SPRITES, name) && SPRITES[name] !== draw) SPRITE_CLASHES.push(name)
    else SPRITES[name] = draw
  }
  return map
}

/** A rect filled with the brick pattern (the building's outer wall); the pattern joins <defs> on first use. */
export function brickRect(ctx, x, y, w, h) {
  ctx.brick = true
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${ctx.id}brick)"/>`
}

// The wall's brick, one 16 × 12 tile: four courses of bricks 7 wide and 2 tall, the joints staggered, each brick lit
// along its top row and a few a shade darker or lighter than the rest, so the wall reads as laid by hand.
const BRICK_TILE = (() => {
  const tone = { base: [THEME.building.brickTone.base, K.brick], dark: THEME.building.brickTone.dark, light: THEME.building.brickTone.light }
  const courses = [[3, ['base', 'dark']], [7, ['light', 'base']], [3, ['dark', 'base']], [7, ['base', 'light']]]
  const rects = []
  courses.forEach(([joint, tones], c) => {
    const y = c * 3
    tones.forEach((t, i) => {
      const x0 = (joint + 1 + i * 8) % 16
      const [hi, lo] = tone[t]
      for (const [x, w] of x0 + 7 <= 16 ? [[x0, 7]] : [[x0, 16 - x0], [0, x0 - 9]]) rects.push([x, y, w, 1, hi], [x, y + 1, w, 1, lo])
    })
    rects.push([0, y + 2, 16, 1, K.mortar], [joint, y, 1, 2, K.mortar], [joint + 8, y, 1, 2, K.mortar])
  })
  return paint(rects)
})()

/** The <defs> content of a finished drawing: the brick pattern if used, then every sprite in first-use order. */
export function defsMarkup(ctx) {
  let defs = ''
  if (ctx.brick) defs += `<pattern id="${ctx.id}brick" width="16" height="12" patternUnits="userSpaceOnUse">${BRICK_TILE}</pattern>`
  for (const [name, markup] of ctx.defs) defs += `<g id="${ctx.id}${name}">${markup}</g>`
  return defs
}

// ---------------------------------------------------------------- facts helpers

/**
 * Project palette: the ASCII office's slots (model.mjs projectSlots), in desk → project → coat-rack order, so a
 * project has the same color in every scene and in the text office. renderSvg puts it on ctx.color.
 */
export function palette(f) {
  const names = [...f.live.desks.map((d) => d.project), ...f.projects.map((p) => p?.name), ...f.live.recently_left.map((l) => l?.project)]
  const slots = projectSlots(names)
  return (n) => PROJECT[slots.get(n) ?? fnv1a(n) % 8]
}

const list = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [])

/**
 * Facts as the drawing reads them: every list a list of objects (a null meeting, a string where projects go), so a
 * partial or broken answer still draws instead of throwing inside the desktop pane's render. Only the lists are
 * cleaned: a scene must still read numbers with `Number(x) || 0` and objects with `?.`.
 */
export function sane(facts) {
  const f = facts && typeof facts === 'object' ? facts : {}
  const live = f.live && typeof f.live === 'object' ? f.live : {}
  const desks = list(live.desks).map((d) => ({ ...d, interns: list(d.interns), meetings: list(d.meetings) }))
  return {
    ...f, live: { ...live, desks, recently_left: list(live.recently_left) }, projects: list(f.projects), contractors: list(f.contractors),
  }
}

/** ISO → epoch ms, NaN when missing or unparseable. */
export const ms = (iso) => {
  const t = Date.parse(iso ?? '')
  return Number.isFinite(t) ? t : NaN
}

/** A facts count as the drawing reads it: a number ≥ 0, anything else (a string, NaN, a negative) 0. */
export const num0 = (v) => Math.max(0, Number(v) || 0)
/** Two-letter weekdays, Sunday first (index with getUTCDay of dayOf). */
export const WEEKDAY = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
/** 'YYYY-MM-DD' → a UTC Date at midnight (day arithmetic without DST surprises). */
export const dayOf = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number)
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
}

/** '26 Oct' for facts.now.local_date ('' when missing). */
export function dateLabel(f) {
  const d = String(f.now?.local_date ?? '')
  if (!d) return ''
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${Number(d.slice(8, 10))} ${M[Number(d.slice(5, 7)) - 1] ?? ''}`
}

/**
 * The class tallies for a set of classified desks (ctx.desks): working, waiting, asking, the idle ones (errors,
 * stopped, onBreak, done: a dozer is done; idle is all of them), interns, meetingWait.
 */
export function tally(desks) {
  const t = { working: 0, waiting: 0, asking: 0, errors: 0, stopped: 0, onBreak: 0, done: 0, idle: 0, interns: 0, meetingWait: 0 }
  for (const d of desks) {
    if (d.cls === 'working' || d.cls === 'thinking') t.working++
    else if (d.cls === 'waiting') {
      t.waiting++
      if (d.meetings?.length) t.meetingWait++
    } else if (d.cls === 'asking') t.asking++
    else if (d.cls === 'error') t.errors++
    else if (d.cls === 'stopped') t.stopped++
    else if (d.cls === 'break') t.onBreak++
    else t.done++
    t.interns += d.interns?.length ?? 0
  }
  t.idle = t.errors + t.stopped + t.onBreak + t.done
  return t
}
/** A tally's idle groups (model.mjs idleGroups: `1 error`, `1 stopped`, `2 on break`, `9 done`) as `[text, color]`. */
export const idleSpans = (t) => idleGroups(t).map(([s, role]) => [s, ROLE[role]])
/** Desks in headcount-strip order (model.mjs STRIP_ORDER: working, waiting, asking, then the idle ones). */
export const stripOf = (desks) => [...desks].sort((a, b) => STRIP_ORDER[a.cls] - STRIP_ORDER[b.cls])

// ---------------------------------------------------------------- metrics + budget

/** A desk slot's width: the 48-px desk sprite and a gap. */
export const SW = 54
/** A row of desks: sprite height, the floor at the bottom. */
export const ROW = 36
/** The wood strip + label band under every row of desks (two text lines fit). */
export const SLAB = 18
/** The nameplate band at the top of a room. */
export const HEAD = 13
/**
 * The clerestory windows a room's header band (roomHeader) or a hallway keeps at most, at its right end: the wall its
 * words leave is wall, not a row of bright windows that outshine the room and read as a count beside its words.
 */
export const HEAD_WINDOWS = 2
/** The whole SVG's size budget in chars: the desktop Svg element refuses sources over 131 072. */
export const MAX_SVG = 120_000

// ---------------------------------------------------------------- the shared header, sky and building shell

/**
 * The header block every scene opens with, from its top (y0) down to its roof line: the same height in every view, so
 * the roof sits at y0 + SKY in every view at a given width and switching tabs never moves it. In it, top down: the
 * sign on the roof (SIGN: the neon THE OFFICE over the scene's lines), the open sky with the moon or the sun beside
 * it, and the skyline every building shares behind its parapet (sceneHeader). Why 56: the sign (2 + 40) stands on its
 * legs over a catwalk and the parapet (PARAPET), and the water tower (24 tall) stays under the moon's path.
 */
export const SKY = 56
/**
 * The sign on the roof: a dark box on two truss legs, centered over the building and about half as wide (signBox),
 * its top and height from the scene's top. In it, top down: a row of bulbs, the neon THE OFFICE (NEON), a rail, the
 * scene's lines (INFO), a row of bulbs; the view, the date or the range and the shift are its tooltip.
 */
const SIGN = Object.freeze({ top: 2, h: 40, neon: 3, rail: 20 })
/**
 * The scene's lines on the sign, under the neon: their size and their baselines from the scene's top, `one` for a
 * single line, `two` for two.
 */
export const INFO = Object.freeze({ size: 5.5, one: 33, two: [30, 36.5] })
// The sign's inner margin: its lines run from its left edge + PAD to PAD before its right edge.
const PAD = 6
// Every building spans x EDGE to W − EDGE (its 4-unit brick piers inside). Its crown rises PARAPET over the roof line:
// the coping on the parapet, behind which the skyline stands (the props' feet hidden), then the cornice down to roof + 4.
const EDGE = 6
const PARAPET = 5

// ---------------------------------------------------------------- the neon

// THE OFFICE in glass tubes. Each letter is the center line of its tube (# a pixel of it), 6 × 11 (the T 7). A tube is
// its line lit near white in yellow glass, 3 pixels thick; around it a glow, then a fainter halo, each the
// line stroked wider and rounder.
const GLYPHS = {
  T: ['#######', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...', '...#...'],
  H: ['#....#', '#....#', '#....#', '#....#', '#....#', '######', '#....#', '#....#', '#....#', '#....#', '#....#'],
  E: ['######', '#.....', '#.....', '#.....', '#.....', '#####.', '#.....', '#.....', '#.....', '#.....', '######'],
  O: ['.####.', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '.####.'],
  F: ['######', '#.....', '#.....', '#.....', '#.....', '#####.', '#.....', '#.....', '#.....', '#.....', '#.....'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  C: ['.#####', '#.....', '#.....', '#.....', '#.....', '#.....', '#.....', '#.....', '#.....', '#.....', '.#####'],
}
// The neon's two words and the letter that flickers, as a tired tube does: OFFICE's second F. Its ink, the poppy yellow
// of the old title: the lit line, the glass, the unlit glass of the flickering letter.
const NEON_WORDS = ['THE', 'OFFICE']
const NEON_FLICKER = [1, 2]
const NEON_INK = { core: '#fffbe0', glass: '#ffcf2e', off: '#54482a' }

/**
 * THE OFFICE laid out: `w` × `h` with a margin `m`, and as path data on its pixel grid: each word's center line (`d`,
 * one per word, drawn as the line and stroked 2 wide for the glass), the flickering letter's (`flick`, stroked unlit
 * over it), and the glow (`glow`, two shapes following the letters: the glass grown by a pixel to its four neighbours,
 * then by another to all eight, so its edge steps round). Letters 4 apart, the words 9.
 */
function neonLayout() {
  const gap = 4
  const m = 3
  // the center lines, word by word, letter by letter: [x, y, word, letter]
  const line = []
  let x = m
  NEON_WORDS.forEach((word, k) => {
    if (k) x += 9 - gap
    ;[...word].forEach((ch, i) => {
      const g = GLYPHS[ch]
      g.forEach((row, y) => [...row].forEach((c, dx) => c === '#' && line.push([x + dx, m + y, k, i])))
      x += g[0].length + gap
    })
  })
  const w = x - gap + m
  const h = GLYPHS.T.length + 2 * m
  // a grid with room for the glow around the margin (P), its pixels as merged runs back in the neon's own frame
  const P = 4
  const grid = () => Array.from({ length: h + 2 * P }, () => Array(w + 2 * P).fill(0))
  const pathOf = (g) => mapRects(g.map((r) => r.map((v) => (v ? '#' : '.')).join('')), { '#': '' }, -P, -P)
    .map(([rx, ry, rw, rh]) => `M${rx} ${ry}h${rw}v${rh}h${-rw}z`).join('')
  const lineOf = (keep) => {
    const g = grid()
    for (const [px, py, k, i] of line) if (keep(k, i)) g[py + P][px + P] = 1
    return g
  }
  // a shape grown by a pixel, to its four neighbours or to all eight
  const grow = (g, diag) => g.map((r, y) => r.map((v, x) => (v || [[0, -1], [-1, 0], [1, 0], [0, 1], ...(diag ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : [])]
    .some(([dx, dy]) => g[y + dy]?.[x + dx]) ? 1 : 0)))
  const glow = []
  let g = grow(lineOf(() => true), true) // the glass
  for (const diag of [false, true]) glow.push(pathOf((g = grow(g, diag))))
  return {
    w, h, m, d: NEON_WORDS.map((_, k) => pathOf(lineOf((wk) => wk === k))),
    flick: pathOf(lineOf((k, i) => k === NEON_FLICKER[0] && i === NEON_FLICKER[1])), glow,
  }
}
/** THE OFFICE in glass tubes: `{ w, h, m, d, flick, glow }` (neonLayout). */
export const NEON = Object.freeze(neonLayout())
// as sprites the neon fills and strokes: each word's center line (`neon-0`, `neon-1`), the flickering letter's
// (`neon-f`), the glow's shapes from the glass out (`neon-g1`, `neon-g2`)
NEON.d.forEach((d, k) => (SPRITES[`neon-${k}`] = () => `<path d="${d}"/>`))
SPRITES['neon-f'] = () => `<path d="${NEON.flick}"/>`
NEON.glow.forEach((d, k) => (SPRITES[`neon-g${k + 1}`] = () => `<path d="${d}"/>`))

/**
 * The neon at (x, y), its margin included, lit day and night, pixel by pixel: its glow, the shapes of NEON.glow stacked
 * faint from the wider in, so the light is strongest at the glass and fades out a pixel at a time (at night both, by
 * day the nearest alone and fainter, the sun washing it out; on the lean roof the wider alone); then each word's line
 * stroked 2 wide (the glass, 3 pixels thick around it) and the line itself lit near white; the flickering letter's glass
 * goes dark for a beat now and then.
 */
function neon(ctx, x, y) {
  const { night } = ctx
  const line = (k, attrs) => use(ctx, `neon-${k}`, x, y, attrs)
  const stroke = (color, w) => ` fill="none" stroke="${color}" stroke-width="${w}"`
  const { core, glass, off } = NEON_INK
  // the glow's shapes and their opacities, from the wider in
  const shapes = ctx.roof === 2 ? [[2, '.1']] : night ? [[2, '.12'], [1, '.18']] : [[1, '.08']]
  const glow = shapes.map(([k, op]) => use(ctx, `neon-g${k}`, x, y, ` fill="${glass}" fill-opacity="${op}"`)).join('')
  const lit = glow + NEON_WORDS.map((_, k) => line(k, stroke(glass, 2)) + line(k, ` fill="${core}"`)).join('')
  const dark = use(ctx, 'neon-f', x, y, stroke(off, 2))
  return lit + (ctx.animate ? `<g opacity="0">${dark}${aO(ctx, '0;0;0;0;0;0;0;0;0;1;0;1;1;0;0;0;0;0;0;0', 7, -2)}</g>` : '')
}

// ---------------------------------------------------------------- the skyline

/**
 * Where the sign stands in a drawing `W` wide (200 to 1200): `{ x, w }`, centered over the building, half its width up
 * to 300 (a narrow pane's up to 62 % or 200, so its lines keep their numbers), never narrower than the neon and a
 * margin.
 */
export function signBox(W) {
  const w = clamp(Math.round(Math.max(W * 0.5, Math.min(W * 0.62, 200))), NEON.w + 18, 300)
  return { x: Math.round((W - w) / 2), w }
}
/** How wide each of the scene's lines may run on the sign of a drawing `W` wide. */
export const infoRoom = (W) => Math.max(0, signBox(W).w - 2 * PAD)

/** The roof's props by name, `{ w, h, kind, twice? }` (lib/svg-roof.mjs registers them with defineRoofProps). */
export const ROOF_PROPS = {}
/**
 * Register the roof's props: `{ name: { w, h, kind, twice?, draw } }`, each with its box `w` × `h` (its feet on row
 * h − 1, the two rows under hidden by the coping) and its `kind`: 'tall', a landmark that stands at the outer end of a
 * side of the roof; 'mid', a structure; 'small', the roof's life; `twice`, a prop a side may have two of; or 'lean' and
 * 'perch', drawn apart (the lean roof's mast, the pigeons on the coping). Each becomes the sprite `rf-<name>`.
 */
export function defineRoofProps(map) {
  for (const [name, { draw, ...box }] of Object.entries(map)) {
    ROOF_PROPS[name] = Object.freeze(box)
    defineSprites({ [`rf-${name}`]: draw })
  }
}

/**
 * The skyline of a drawing (ctx.W wide), from the props' foot line (the roof deck, hidden behind the coping): each prop
 * `[name, x, w, h]` (its sprite, its left, its box), in the open roof on each side of the sign. Each side has its own:
 * a landmark at its outer end, then structures and the roof's life toward the sign, a few pixels apart, as many as its
 * room holds (three at most); no prop twice on the roof but the vents (ROOF_PROPS, lib/svg-roof.mjs). Which ones and in what order is drawn by lot from
 * the facts' date: the skyline changes from one day to the next, and is the same in every view and every redraw of the
 * day. `ctx.roof` (how much of its ornament a drawing near the size budget keeps): 1 keeps each side's landmark, 2 (the
 * lean roof) a bare mast on the left and the AC unit on the right.
 */
function skyline(ctx) {
  const { W } = ctx
  const roof = ctx.roof ?? 0
  const s = signBox(W)
  const sides = [[EDGE + 2, s.x - 3, 1], [W - EDGE - 2, s.x + s.w + 3, -1]]
  if (roof === 2) {
    const { mast, ac } = ROOF_PROPS
    return [['mast', EDGE + 3, mast.w, mast.h], ...(W - EDGE - 3 - ac.w >= s.x + s.w + 3 ? [['ac', W - EDGE - 3 - ac.w, ac.w, ac.h]] : [])]
  }
  const rnd = seeded(`skyline:${ctx.f?.now?.local_date ?? ''}`)
  const pick = (names) => names[Math.floor(rnd() * names.length)]
  const by = (kind) => Object.keys(ROOF_PROPS).filter((n) => ROOF_PROPS[n].kind === kind)
  const taken = new Set()
  const props = []
  for (const [outer, inner, dir] of sides) {
    let at = outer
    let n = 0
    const room = (w) => (dir > 0 ? at + w <= inner : at - w >= inner)
    const place = (name) => {
      const { w, h } = ROOF_PROPS[name]
      props.push([name, dir > 0 ? at : at - w, w, h])
      if (!ROOF_PROPS[name].twice) taken.add(name)
      at += dir * (w + 2 + Math.floor(rnd() * 4))
      n++
    }
    const free = (kind) => by(kind).filter((name) => !taken.has(name) && room(ROOF_PROPS[name].w))
    if (free('tall').length) place(pick(free('tall')))
    // then a structure and the roof's life in turns, drawn by lot, while the side has room
    const order = roof ? [] : rnd() < 0.5 ? ['mid', 'small', 'mid', 'small'] : ['small', 'mid', 'small', 'mid']
    for (const kind of order) {
      if (n >= 3) break
      const names = free(kind)
      if (names.length) place(pick(names))
    }
  }
  return props
}

/**
 * The way the moon and the sun cross the sky, in a drawing W wide from y0, over the skyline `props` (skyline's): up a
 * quarter of an ellipse from `x0`, in the widest gap the roof's props leave beside the sign (over the props when none
 * is wide enough for a body), so a body rises between them and not out of one, to the top of the sky at the sign's
 * corner; along behind the sign; and down a quarter of an ellipse to `x1` on the other side. Its ends `low`, under the
 * coping; its top `top`, a body's halo inside the drawing. `at(p)`: the point p (0…1) of the way along it, by length, as
 * an animateMotion's keyPoints read it; `rise` and `set`, the share of the way at which each quarter ends and starts.
 * `path(dx, dy)`: the way as path data, from (dx, dy).
 */
function celestialArc(W, y0, props) {
  const s = signBox(W)
  // the widest gap between a side's props (`outer`: its landmark's end), else over them, between its landmark and the sign
  const gapIn = (a, b, outer) => {
    const inside = props.filter(([, x, w]) => x + w > a && x < b).map(([, x, w]) => [x, x + w]).sort((p, q) => p[0] - q[0])
    let best = null
    let from = a
    for (const [l, r] of [...inside, [b, b]]) {
      if (l - from > (best ? best[1] - best[0] : 0)) best = [from, l]
      from = Math.max(from, r)
    }
    if (best && best[1] - best[0] >= 2 * ORB.core) return Math.round((best[0] + best[1]) / 2)
    const tall = outer === 'left' ? inside[0] : inside.at(-1)
    return Math.round(outer === 'left' ? ((tall ? tall[1] : a) + b) / 2 : (a + (tall ? tall[0] : b)) / 2)
  }
  // the top corners: a body's disc there clear of the sign
  const xa = Math.max(EDGE + 6, Math.floor(s.x - ORB.rim))
  const xb = Math.min(W - EDGE - 6, Math.ceil(s.x + s.w + ORB.rim))
  const x0 = Math.min(xa - 4, gapIn(EDGE + 4, s.x - 2, 'left'))
  const x1 = Math.max(xb + 4, gapIn(s.x + s.w + 2, W - EDGE - 4, 'right'))
  const low = y0 + SKY + Math.ceil(ORB.far) - PARAPET + 1
  const top = y0 + Math.ceil(ORB.far) + 1
  const ry = low - top
  // the way by length: a point every 1/32 of each quarter, the straight run between, and the length up to each
  const N = 32
  const pts = [
    ...Array.from({ length: N + 1 }, (_, k) => [xa - (xa - x0) * Math.cos((Math.PI / 2) * (k / N)), low - ry * Math.sin((Math.PI / 2) * (k / N))]),
    ...Array.from({ length: N + 1 }, (_, k) => [xb + (x1 - xb) * Math.sin((Math.PI / 2) * (k / N)), low - ry * Math.cos((Math.PI / 2) * (k / N))]),
  ]
  const len = [0]
  for (let k = 1; k < pts.length; k++) len.push(len[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]))
  const total = len.at(-1)
  const at = (p) => {
    const d = clamp(p, 0, 1) * total
    let k = 1
    while (k < pts.length - 1 && len[k] < d) k++
    const t = (d - len[k - 1]) / (len[k] - len[k - 1] || 1)
    return [pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * t, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * t]
  }
  const path = (dx = 0, dy = 0) => `M${x0 - dx} ${low - dy}A${xa - x0} ${ry} 0 0 1 ${xa - dx} ${top - dy}H${xb - dx}A${x1 - xb} ${ry} 0 0 1 ${x1 - dx} ${low - dy}`
  return { x0, x1, xa, xb, low, top, at, rise: len[N] / total, set: len[N + 1] / total, path, sign: s }
}

/**
 * Where the moon (night) or the sun (day) sits, its middle: the hour's share of the way along the quarters of the sky's
 * way beside the sign (`arc`, celestialArc's), up the first in the hours before the middle of its time, down the second
 * after (the moon from 20:00 to 06:00, the sun from 07:00 to 19:00), from where its disc clears the coping, so it is in
 * the same place in every view and never behind the sign. An hour that is not a number reads noon. `low`: whether the
 * sun is near the horizon (an hour of its rising or its setting), for its colors.
 */
function celestialAt(ctx, arc, y0) {
  const { night, f } = ctx
  const h = Number(f.now?.hour)
  const hour = Number.isFinite(h) ? h : 12
  const t = night ? Math.min(10, (hour - 20 + 24) % 24) / 10 : clamp((hour - 7) / 12, 0, 1)
  // the share of the way at which a disc stands clear of the coping, between `lo` and `hi` (its height falls as it goes)
  const coping = y0 + SKY - PARAPET
  const clear = (lo, hi, rising) => {
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2
      if ((arc.at(mid)[1] + ORB.rim > coping) === rising) lo = mid
      else hi = mid
    }
    return rising ? hi : lo
  }
  const from = clear(0, arc.rise, true)
  const to = clear(arc.set, 1, false)
  const p = t <= 0.5 ? from + (arc.rise - from) * t * 2 : arc.set + (to - arc.set) * (t - 0.5) * 2
  // (up a pixel rather than down, so a disc that clears the coping stays clear)
  const [x, y] = arc.at(p)
  return { x: Math.round(x), y: Math.floor(y), low: !night && (hour < 9 || hour >= 17) }
}

// The glow on the horizon at dawn and dusk, warm at its heart, rosier outside: [half width, rows up, dash, color].
const GLOWS = THEME.sky.glows
/**
 * The glow where the sun rises or sets, on the roofline at x: half an ellipse of dithered rows over it (the building
 * and its props over its foot), each step denser and warmer toward its heart; nothing but at dawn and dusk.
 */
function horizonGlow(phase, x, roof) {
  const steps = GLOWS[phase]
  if (!steps) return ''
  return steps.map(([rx, ry, dash, color]) => {
    let d = ''
    for (let k = 0; k < ry; k++) {
      const half = Math.floor(rx * Math.sqrt(1 - ((k + 0.5) / ry) ** 2))
      // each row a phase of the dash its own, so the dots checker
      d += `M${x - half + (k % 2)} ${roof - k - 0.5}h${2 * half}`
    }
    return `<path stroke="${color}" stroke-dasharray="${dash}" d="${d}"/>`
  }).join('')
}

// The crown's stone: the coping's top, its face, the shade under a ledge, the dark of the dentils' bed.
const CROWN = THEME.roof.crown

/**
 * A building's brick shell from the roof down to `groundY`, and its crown: the parapet over the roof line (brick under
 * a stone coping that juts past the piers), then the cornice down to roof + 4: its molding, a row of dentils with a
 * modillion every 24, its ends returned on corbels, and its shadow on the brick under it; stone quoins up both
 * corners of the wall. The lean roof (ctx.roof 2) has neither the modillions nor the quoins.
 */
function shell(ctx, x, roof, w, groundY) {
  const top = roof - PARAPET
  // the corner patterns join <defs> through use(); the <use> of their empty group is never drawn
  const quoins = (side) => (ctx.roof === 2 ? '' : (use(ctx, 'quoins'), `<rect x="${side ? x + w - 4 : x}" y="${roof + 5}" width="4" ` +
    `height="${Math.max(0, groundY - roof - 5)}" fill="url(#${ctx.id}quoin-${side ? 'r' : 'l'})"/>`))
  // the modillions, 24 apart, centered on the cornice with at least 10 to spare at each end
  const n = ctx.roof === 2 ? 0 : Math.max(0, Math.floor((w - 23) / 24) + 1)
  const m0 = x + Math.round((w - 24 * (n - 1) - 3) / 2)
  const mod = (o, f) => `<path stroke="${f}" stroke-width="3" stroke-dasharray="${o ? '1 23' : '2 22'}" d="M${m0 + o * 2} ${roof + 2.5}h${24 * (n - 1) + (o ? 1 : 2)}"/>`
  return brickRect(ctx, x, roof, w, groundY - roof) + brickRect(ctx, x, top + 2, w, PARAPET - 2) + quoins(0) + quoins(1) +
    paint([
      // the coping, its drip shading the parapet under it
      [x - 3, top, w + 6, 1, CROWN.hi], [x - 3, top + 1, w + 6, 1, CROWN.face], [x - 1, top + 2, w + 2, 1, '#000/.3'],
      // the cornice: crown molding, face, the dentils' bed, the bed molding, its shadow on the wall
      [x - 3, roof, w + 6, 1, CROWN.hi], [x - 3, roof + 1, w + 6, 1, CROWN.face], [x - 2, roof + 2, w + 4, 2, CROWN.bed],
      [x - 1, roof + 4, w + 2, 1, '#000/.4'],
    ]) +
    // the corbels the cornice's ends return on, over the dentils' bed
    paint([[x - 3, roof + 2, 3, 2, CROWN.face], [x - 3, roof + 2, 1, 2, CROWN.hi], [x - 2, roof + 4, 2, 1, CROWN.shade],
      [x + w, roof + 2, 3, 2, CROWN.face], [x + w + 2, roof + 2, 1, 2, CROWN.shade], [x + w, roof + 4, 2, 1, CROWN.shade]]) +
    `<path stroke="${CROWN.face}" stroke-width="2" stroke-dasharray="2 1" d="M${x} ${roof + 3}h${w}"/>` +
    (n ? mod(0, CROWN.hi) + mod(1, CROWN.shade) : '')
}

defineSprites({
  // the quoins: stone blocks of two brick courses each, long (4) and short (3) in turn, a lit top and a shaded foot,
  // toothed into the wall's brick (the short block leaves its inner column to the wall); the right corner's pattern is
  // the left one mirrored about the building's right edge
  quoins: (c) => {
    const tile = () => `<rect width="4" height="12" fill="${K.brick}"/>` + paint([
        [0, 0, 4, 5, CROWN.face], [0, 0, 4, 1, CROWN.hi], [0, 4, 4, 1, CROWN.shade], [0, 5, 4, 1, K.mortar],
        [0, 6, 3, 5, CROWN.face], [0, 6, 3, 1, CROWN.hi], [0, 10, 3, 1, CROWN.shade], [0, 11, 4, 1, K.mortar], [3, 8, 1, 1, K.mortar],
      ])
    return `<pattern id="${c.id}quoin-l" x="${EDGE}" y="0" width="4" height="12" patternUnits="userSpaceOnUse">${tile(0)}</pattern>` +
      `<pattern id="${c.id}quoin-r" href="#${c.id}quoin-l" x="0" patternTransform="matrix(-1 0 0 1 ${c.W - EDGE} 0)"/>`
  },
})

/**
 * The sidewalk at `groundY` and the dark ground under it, down to `bottom` (the scene's y0 + h). With ctx.transparent
 * the ground is backdrop and goes: only the sidewalk (and its shadow edge) stays, the lines under it sit on the page.
 */
export function ground(ctx, groundY, bottom) {
  const { W } = ctx
  const walk = [0, groundY, W, 3, K.walk]
  const edge = [0, groundY + 3, W, 1, K.walkD]
  return ctx.transparent ? paint([walk, edge]) : paint([walk, [0, groundY + 3, W, bottom - groundY - 3, K.ground], edge])
}

/**
 * Text that sits on the page itself when the drawing has no backdrop (ctx.transparent): the header lines over the sky,
 * the lines under a building. It gets a dark halo under its letters (and any mark beside them), so light text reads on
 * a light page as on a dark one; with a backdrop it is drawn as it is.
 */
export const onPage = (ctx, markup) => (ctx.transparent && markup ? `<g stroke="${K.plate}" stroke-width="1.2" stroke-linejoin="round" paint-order="stroke">${markup}</g>` : markup)

/**
 * ground() in two parts, so the composer (lib/svg.mjs) can slide the commits line in right under the sidewalk instead
 * of under the lines a scene writes there: `walk` is the sidewalk at `groundY` (part of the building's drawing);
 * `under` is everything below it, `{ y, svg }`: `y` (groundY + 3, the sidewalk's shadow edge, where the street starts)
 * and the ground band from groundY + 4 down to `bottom` (backdrop: nothing when ctx.transparent) with `markup` on it
 * (the scene's lines, its key; onPage when transparent). Painted one after the other they are exactly ground() and the markup.
 */
export function footing(ctx, groundY, bottom, markup = '') {
  const { W } = ctx
  const walk = paint([[0, groundY, W, 3, K.walk], [0, groundY + 3, W, 1, K.walkD]])
  const band = bottom - groundY - 4 > 0 ? backdrop(ctx, [[0, groundY + 4, W, bottom - groundY - 4, K.ground]]) : ''
  return { walk, under: { y: groundY + 3, svg: band + onPage(ctx, markup) } }
}

/** A room's ceiling lit at night (a warm line, a faint glow below it), as rects for the room's paint(). */
export const ceilingLight = (x, y, w) => [[x, y, w, 1, '#ffe7b0/.55'], [x, y + 1, w, 22, '#ffd98a/.05']]

// ---------------------------------------------------------------- running totals on a live drawing

/**
 * Agent-time as a drawing that stays on screen shows it (renderSvg `liveClock`): exact under 10 minutes (a day or a
 * project that has only just started still reads as worked), then floored to 10 minutes under 2 h, to half hours under
 * 10 h, then to two significant figures of hours (whole hours under 100 h, tens of hours after). Exact minutes moved
 * every minute any agent worked, and every move reloads the pane: a total now moves every 10 to 30 minutes of
 * agent-time, never more often. Floored, so it never says more than happened.
 */
export function steadyMinutes(min) {
  const m = num0(min)
  if (m < 10) return m
  if (m < 120) return Math.floor(m / 10) * 10
  if (m < 600) return Math.floor(m / 30) * 30
  const h = m / 60
  const step = 10 ** (Math.floor(Math.log10(h)) - 1)
  return Math.floor(h / step) * step * 60
}

/** A running count (tool calls, prompts, files edited) on a live drawing: exact under 100, then two significant figures. */
export function steadyCount(n) {
  const v = num0(n)
  if (v < 100) return v
  const step = 10 ** (Math.floor(Math.log10(v)) - 1)
  return Math.floor(v / step) * step
}

// What moves while agents work: minutes with every minute of agent-time, these counts with every tool call or prompt.
// Sessions, interns, meetings, commits and lines changed stay exact: each is an event worth a redraw.
const STEADY_MINUTES = ['agent_minutes', 'desk_minutes', 'minutes']
const STEADY_COUNTS = ['tool_calls', 'prompts', 'files_edited', 'tokens_in', 'tokens_out']
const mapValues = (o, fn) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(v)]))

// One record's running totals in steps (a project, the totals, a day, a visitor), its per_day and per_hour included.
function steadyRecord(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return o
  const out = { ...o }
  for (const k of STEADY_MINUTES) if (typeof out[k] === 'number') out[k] = steadyMinutes(out[k])
  for (const k of STEADY_COUNTS) if (typeof out[k] === 'number') out[k] = steadyCount(out[k])
  if (out.activity && typeof out.activity === 'object') out.activity = mapValues(out.activity, (v) => (typeof v === 'number' ? steadyCount(v) : v))
  if (out.per_day && typeof out.per_day === 'object') out.per_day = mapValues(out.per_day, steadyRecord)
  if (Array.isArray(out.per_hour)) out.per_hour = out.per_hour.map((v) => (typeof v === 'number' ? steadyMinutes(v) : v))
  return out
}

/**
 * Sane facts as a live drawing reads them (renderSvg `liveClock`): every running total in steps (steadyMinutes,
 * steadyCount), in the projects, the totals, the days, the hours and the visitors, so the Today, Week, Month and What
 * they did tabs hold while agents work instead of changing with every minute of agent-time. A new object: the facts
 * passed in are never touched.
 */
export function steadyFacts(f) {
  return { ...steadyRecord(f), totals: steadyRecord(f.totals), projects: f.projects.map(steadyRecord), contractors: f.contractors.map(steadyRecord) }
}

// ---------------------------------------------------------------- the live clock and durations

/**
 * The clock every HH:MM of a drawing reads (renderSvg puts it on ctx.clock). Without `live` it is the facts' own
 * local time, drawn as it always was. With `live` (renderSvg `liveClock`, animation on) the clocks run by themselves:
 * the desktop pane keeps one SVG on screen for as long as nothing else in it changes (a new source reloads the
 * sandboxed frame, a visible blink that restarts every animation), so a clock that only showed the facts' minute would
 * force a redraw every minute. `hm` is then the time at `atMs`, the moment the pane puts the source on screen, and
 * `sod` the local second of the day there, from which each digit's loop is phased (liveDigits). The local zone is the
 * collector's, read from the facts' own pair: local_time against the UTC minute of now.iso.
 * Returns `{ hm, live, sod? }`; `hm` is '' when the facts have no HH:MM time (and then nothing is live).
 */
export function clockFor(f, live, atMs) {
  const m = /^(\d\d):(\d\d)$/.exec(String(f?.now?.local_time ?? ''))
  const iso = ms(f?.now?.iso)
  if (!m || !live || !Number.isFinite(iso)) return { hm: m ? m[0] : '', live: false }
  let off = ((Number(m[1]) * 60 + Number(m[2]) - (Math.floor(iso / 60e3) % 1440)) % 1440 + 1440) % 1440
  if (off > 840) off -= 1440 // zones run from UTC−12 to UTC+14
  const at = Number.isFinite(atMs) ? atMs : iso
  const sod = (((Math.floor(at / 100) / 10 + off * 60) % 86400) + 86400) % 86400
  const min = Math.floor(sod / 60)
  return { hm: `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`, live: true, sod }
}

// The four digits of HH:MM, each a loop over its own period: the glyph each part of the loop shows, from where.
// Hours over a day, the tens of minutes over an hour, the last digit over ten minutes: so a clock phased once is right
// for as long as its frame lives, and never runs out of minutes.
const DIGIT_LOOPS = [
  { period: 86_400, seg: [[0, '0'], [36_000, '1'], [72_000, '2']] },
  { period: 86_400, seg: Array.from({ length: 24 }, (_, h) => [h * 3600, String(h % 10)]) },
  { period: 3600, seg: Array.from({ length: 6 }, (_, g) => [g * 600, String(g)]) },
  { period: 600, seg: Array.from({ length: 10 }, (_, g) => [g * 60, String(g)]) },
]
// keyTimes to seven decimals, without the leading zero: on a day's loop five decimals were up to 0.43 s off, so the
// hour digits flipped visibly apart from the minutes; seven are within 5 ms
const kt = (t) => String(Math.round(t * 1e7) / 1e7).replace(/^0\./, '.')

/**
 * The four digit loops phased from the clock: per digit its period, the SMIL `begin` that puts the loop where the wall
 * clock is when the frame loads (a negative offset: the loop started that long ago), the glyph showing at that moment
 * (what a surface without SMIL keeps) and the segments.
 */
function liveDigits(clock) {
  return DIGIT_LOOPS.map(({ period, seg }) => {
    const into = Math.round((clock.sod % period) * 10) / 10
    let glyph = seg[0][1]
    for (const [t, g] of seg) if (t <= into) glyph = g
    const begin = into ? ` begin="-${into}s"` : ''
    // `short`: the chars this begin is short of the loop's longest, its last tenth of a second (clockSlack)
    return { period, seg, glyph, begin, short: ` begin="-${period - 0.1}s"`.length - begin.length }
  })
}

/**
 * A live clock's markup is as long as the moment it is phased from makes it (a longer `begin`, a glyph of more runs),
 * so a drawing a few chars under MAX_SVG at one moment is over it the next, and a redraw of the same office would land
 * on another rung of the size ladder (the live rooms lit, then plain). Each live clock adds to ctx.clockSlack what it
 * is short of its longest moment, and the size checks count it (renderSvg, the live basement): every drawing is
 * measured as if its clocks were at their longest.
 */
function clockSlack(ctx, chars) {
  if (ctx.clockSlack) ctx.clockSlack.chars += chars
}

/**
 * The live clock's four digits in the 3 × 5 pixel font, at `xs` (one x per digit) and y: one <path> per digit whose
 * `d` steps through the glyphs of its loop (discrete SMIL), drawn at the glyph of the moment the frame loads.
 */
export function pixClock(ctx, xs, y, fill) {
  const d = (g, x) => pixRuns(g, x, y, fill).map(([rx, ry, w, h]) => `M${rx} ${ry}h${w}v${h}h${-w}z`).join('')
  return liveDigits(ctx.clock).map(({ period, seg, glyph, begin, short }, i) => {
    const ds = seg.map((s) => d(s[1], xs[i]))
    const now = d(glyph, xs[i])
    clockSlack(ctx, short + Math.max(...ds.map((x) => x.length)) - now.length)
    return `<path${fillAttr(fill)} d="${now}"><animate attributeName="d" values="${ds.join(';')}" keyTimes="${seg.map((s) => kt(s[0] / period)).join(';')}" ` +
      `dur="${period}s"${begin} calcMode="discrete" repeatCount="indefinite"/></path>`
  }).join('')
}

/**
 * How long ago epoch-ms `t` was, as a duration (`shift 1h05`): exact, or with ctx.liveClock in the coarse steps that
 * hold for a whole 10-minute window and are seldom crossed (ctx.now is then floored to it: format.mjs fmtAtLeast).
 * '' when `t` is not a time.
 */
export function sinceText(ctx, t) {
  if (!Number.isFinite(t)) return ''
  return ctx.liveClock ? fmtAtLeast((ctx.now - t) / 60e3) : fmtMinutes((ctx.now - t) / 60e3)
}

/** How long ago `when` (ISO or epoch ms) was, as a moment (`left 9m ago`): fmtAgo, or with ctx.liveClock fmtAgoAtLeast. */
export function agoText(ctx, when) {
  if (!ctx.liveClock) return fmtAgo(when, ctx.now)
  const t = typeof when === 'number' ? when : ms(when)
  return Number.isFinite(t) ? fmtAgoAtLeast((ctx.now - t) / 60e3) : ''
}

/**
 * The office's amber LED clock (23 × 9, as in the lobby): the local time (ctx.clock, running by itself when live), its
 * colon blinking, the date in its tooltip (and the time too when it is not live: a tooltip cannot tick). '' when the
 * facts have no HH:MM time.
 */
export function ledClock(ctx, x, y, led = '#ff9d5c') {
  const { f } = ctx
  const clock = ctx.clock ?? clockFor(f, false)
  const hm = /^(\d\d):(\d\d)$/.exec(clock.hm)
  if (!hm) return ''
  const plate = [[x, y, 23, 9, '#14100c'], [x, y + 9, 23, 1, '#000/.4']]
  const face = clock.live
    ? paint(plate) + pixClock(ctx, [x + 2, x + 6, x + 14, x + 18], y + 2, led)
    : paint([...plate, ...pixRuns(hm[1], x + 2, y + 2, led), ...pixRuns(hm[2], x + 14, y + 2, led)])
  const tip = `${f.now.weekday ?? ''} ${dateLabel(f)}${clock.live ? '' : ` · ${f.now.local_time}`}`.trim()
  return `<g><title>${esc(tip)}</title>${face}<g>${paint(pixRuns(':', x + 9, y + 2, led))}${aO(ctx, '1;0', 2)}</g></g>`
}

/**
 * Rects that are only backdrop (a sky, the ground behind text, a band behind a strip): painted as usual, nothing at
 * all when `ctx.transparent` (renderSvg's `transparent` option), so the drawing sits on whatever page is behind it.
 * Anything that is a thing in the scene (a building, a sidewalk, a sign, the moon) is painted with paint(), never here.
 */
export const backdrop = (ctx, rects) => (ctx.transparent ? '' : paint(rects))

// ---------------------------------------------------------------- the sky's art: the sun, the moon, the clouds

/**
 * Pixels [[x, y]…] as path data to stroke one unit wide, each row's runs a segment along the row's middle (`M x y.5
 * h w`, the next one moved to relatively when that is shorter): `gap` 2 makes a row of every other pixel one segment,
 * for a dash of 1, so a checker costs no more than a run.
 */
function rowsOf(pts, gap = 1) {
  const rows = new Map()
  for (const [x, y] of pts) rows.set(y, [...(rows.get(y) ?? []), x])
  let d = ''
  let at = null
  for (const [y, xs] of [...rows].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b)
    for (let i = 0; i < xs.length;) {
      let j = i
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + gap) j++
      const w = (j - i) * gap + 1
      const abs = `M${xs[i]} ${y + 0.5}`
      const rel = at && `m${xs[i] - at[0]} ${y + 0.5 - at[1]}`
      d += `${rel && rel.length < abs.length ? rel : abs}h${w}`
      at = [xs[i] + w, y + 0.5]
      i = j + 1
    }
  }
  return d
}
/** Pixels as merged rects (`M x y h w v1 h-w z`), each row's runs: a fill of its own. */
function rectsOf(pts) {
  const rows = new Map()
  for (const [x, y] of pts) rows.set(y, [...(rows.get(y) ?? []), x])
  let d = ''
  for (const [y, xs] of [...rows].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b)
    for (let i = 0; i < xs.length;) {
      let j = i
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++
      d += `M${xs[i]} ${y}h${j - i + 1}v1h${-(j - i + 1)}z`
      i = j + 1
    }
  }
  return d
}

/** The sun's and the moon's sizes: the disc, its rim, a checker of halo round it, a quarter checker past that. */
export const ORB = Object.freeze({ core: 5, rim: 6.4, halo: 8.4, far: 10.4 })
/**
 * The pixels round (0, 0) whose middles are past `r0` and within `r1` of it: all of them, every other one (`every` 2,
 * a checker) or one in four (4).
 */
function ringOf(r0, r1, every = 1) {
  const out = []
  const n = Math.ceil(r1)
  for (let y = -n; y <= n; y++) {
    for (let x = -n; x <= n; x++) {
      const r = Math.hypot(x + 0.5, y + 0.5)
      const kept = every === 1 || (every === 2 ? (x + y) % 2 === 0 : x % 2 === 0 && y % 2 === 0)
      if (r > r0 && r <= r1 && kept) out.push([x, y])
    }
  }
  return out
}
/**
 * The sun, its middle at (0, 0), in the colors of the <use> that places it: its disc in `color`, its rim in `stroke`,
 * the halo a checker of the disc's color, fainter outward (the light it is in picks how low it looks: SUN_TONES).
 */
const sunSprite = () => `<g fill="none"><path stroke="currentColor" stroke-dasharray="1" stroke-opacity=".3" d="${rowsOf(ringOf(ORB.halo, ORB.far, 4), 2)}"/>` +
  `<path stroke="currentColor" stroke-dasharray="1" stroke-opacity=".55" d="${rowsOf(ringOf(ORB.rim, ORB.halo, 2), 2)}"/>` +
  `<path d="${rowsOf(ringOf(ORB.core, ORB.rim))}"/><path stroke="currentColor" d="${rowsOf(ringOf(-1, ORB.core))}"/></g>`
/**
 * The sun's colors, [disc, rim]: high in the sky gold, low orange (under the dawn and the dusk, in a view at an hour of
 * its rising or its setting). Near enough that a fade from one to the other stays warm, never a beige.
 */
export const SUN_TONES = THEME.sky.sunTones
// The moon's light, band by band outward from its crescent: [how far from it, color, opacity].
const MOON_LIGHT = THEME.sky.moonLight
/**
 * The moon, a crescent 12 across, its middle at (0, 0): the lit side (the disc less a bite up and to the right), its
 * inner edge shaded, and its light round the crescent alone, in soft bands fainter outward (MOON_LIGHT), so the dark
 * bite stays sky and no ring outlines the whole disc.
 */
const moonSprite = () => {
  const lit = []
  const edge = []
  const disc = ringOf(-1, ORB.rim - 0.4)
  for (const [x, y] of disc) {
    const cut = Math.hypot(x + 0.5 - 2.6, y + 0.5 + 1.6)
    if (cut > 4.6) (cut <= 5.6 ? edge : lit).push([x, y])
  }
  // every pixel off the disc, in the band of its distance to the nearest of the crescent's
  const crescent = [...lit, ...edge]
  const onDisc = new Set(disc.map(([x, y]) => `${x},${y}`))
  const bands = MOON_LIGHT.map(() => [])
  const n = Math.ceil(ORB.rim + MOON_LIGHT.at(-1)[0])
  for (let y = -n; y <= n; y++) {
    for (let x = -n; x <= n; x++) {
      if (onDisc.has(`${x},${y}`)) continue
      const d = Math.min(...crescent.map(([cx, cy]) => Math.hypot(x - cx, y - cy)))
      bands[MOON_LIGHT.findIndex(([reach]) => d <= reach)]?.push([x, y])
    }
  }
  return `<g fill="none">${bands.map((pts, k) => `<path stroke="${MOON_LIGHT[k][1]}" stroke-opacity="${MOON_LIGHT[k][2]}" d="${rowsOf(pts)}"/>`).join('')}` +
    `<path stroke="${K.moon}" d="${rowsOf(lit)}"/><path stroke="${THEME.sky.moonEdge}" d="${rowsOf(edge)}"/></g>`
}

// The clouds' shapes: circles [x, y, r] over a base [x, y, w, h] for a puff, a run [from, to] a row for a streak.
const CLOUD_SHAPES = {
  puff: { circles: [[6, 7, 4], [13, 5, 5], [21, 4, 5.5], [28, 6, 4.5], [33, 8, 3]], base: [3, 7, 32, 4] },
  streak: { rows: [[12, 32], [4, 44], [0, 48], [8, 40]] },
  // a small one, for a sky the sign leaves little of
  puffS: { circles: [[4, 4, 3], [9, 3, 3.5], [14, 4, 3], [18, 5, 2]], base: [2, 4, 17, 2] },
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
/**
 * A cloud in the colors of the <use> that places it, lit along its top and shaded under: its body in `color`, its lit
 * rim in `stroke`, its underside in `fill` (CLOUD_TINTS).
 */
function cloudSprite(shape) {
  const mask = cloudMask(CLOUD_SHAPES[shape])
  const rim = []
  const body = []
  const under = []
  for (const k of mask) {
    const [x, y] = k.split(',').map(Number)
    if (!mask.has(`${x},${y - 1}`)) rim.push([x, y])
    else if (!mask.has(`${x},${y + 1}`) || !mask.has(`${x},${y + 2}`)) under.push([x, y])
    else body.push([x, y])
  }
  return `<path fill="none" stroke="currentColor" d="${rowsOf(body)}"/><path fill="none" d="${rowsOf(rim)}"/><path stroke="none" d="${rectsOf(under)}"/>`
}
/** The clouds' colors in each light, as a <use>'s attributes: the body (color), the lit rim (stroke), the underside (fill). */
export const CLOUD_TINTS = THEME.cloudTints
/** Each cloud shape's box, [w, h], and the order a sky draws them in. */
export const CLOUD_BOX = Object.fromEntries(Object.keys(CLOUD_SHAPES).map((k) => {
  const xs = [...cloudMask(CLOUD_SHAPES[k])].map((p) => p.split(',').map(Number))
  return [k, [Math.max(...xs.map(([x]) => x)) + 1, Math.max(...xs.map(([, y]) => y)) + 1]]
}))
const CLOUD_ORDER = ['puff', 'streak']
/** A <use>'s attributes that tint a cloud for `light` (CLOUD_TINTS). */
export const cloudTint = (light) => {
  const [c, s, f] = CLOUD_TINTS[light] ?? CLOUD_TINTS.day
  return ` color="${c}" stroke="${s}" fill="${f}"`
}

/**
 * The sky's colors in each light (skyPhase), top down. `head`: stops [y, color] at y under the top of the drawing, so
 * the open sky over the roof is the same in every view. `fall`: stops [t, color] at t of the way from the roof down to
 * the street, so the taller the building, the longer the ramp the margins beside it show, down to the glow on the
 * horizon (the city's at night, the sun's at dawn and dusk, a pale haze by day). sky() paints the ramp in bands.
 * `cloud`: the clouds' sprite (none at night: stars).
 */
export const SKIES = Object.fromEntries(Object.entries(THEME.skies).map(([light, sky]) => [light, {
  ...sky,
  head: sky.head.map(([y, color]) => [y === 'SKY' ? SKY : y, color]),
}]))
/**
 * The light the sky is in (SKIES' keys), by the facts' night and hour, as the moon and the sun keep time
 * (celestialAt): twilight at 20:00 and 06:00, the moon low; dawn at 07:00 and 08:00, the sun rising; dusk from 17:00 to
 * 19:00, the sun setting; else night or day. An hour that is not a number reads noon.
 */
export function skyPhase(ctx) {
  const h = Number(ctx.f.now?.hour)
  const hour = Number.isFinite(h) ? h : 12
  if (ctx.night) return hour === 20 || hour === 6 ? 'twilight' : 'night'
  return hour < 9 ? 'dawn' : hour >= 17 ? 'dusk' : 'day'
}

// How many bands the sky over the roof is laid in: the lean sky's, the full one's (ctx.sky).
const HEAD_N = [4, 5]
/** The share of a light's colors the sky over the roof shows, the rest spread down the margins beside the building. */
const OVER_ROOF = 0.62

/**
 * The color of the sky's topmost band in the facts' own light, as sky() paints it: what more sky over a drawing is
 * painted in, so it reads as that band reaching higher (renderSvg `skyFill`).
 */
export function skyTop(ctx) {
  const { head, fall } = SKIES[skyPhase(ctx)]
  const stops = [mix(head[0][1], '#000000', 0.25), ...head.map(([, c]) => c), ...fall.map(([, c]) => c)]
  const first = Math.round(SKY / HEAD_N[ctx.sky ? 1 : 0])
  const p = clamp((first / 2 / SKY) * OVER_ROOF, 0, 1) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(p))
  return mix(stops[i], stops[i + 1], p - i)
}

/**
 * The sky from y0, h tall, in a light (skyPhase): its colors (SKIES' stops, top down, under a zenith a shade darker than
 * the first) spread evenly over the sky over the roof, OVER_ROOF of them, so each band there steps as much as the next
 * and the dawn's and the dusk's warmth shows over the roof, not only beside the building; HEAD_N bands over the roof,
 * then about one per 72 units down to the street beside the building (2 to 6, for the size budget, `most` at most),
 * each a shade thinner than the one over it, the rest of the colors crowding toward the glow on the horizon as a
 * sunset's do. Each band is a rect stroked 2 wide in its own color, dashed: the stroke checkers the row over it, so
 * every seam is dithered at no cost. Backdrop: nothing when ctx.transparent.
 */
function sky(ctx, y0, h, phase, most = 6) {
  if (ctx.transparent) return ''
  const { W } = ctx
  const { head, fall } = SKIES[phase]
  const stops = [mix(head[0][1], '#000000', 0.25), ...head.map(([, c]) => c), ...fall.map(([, c]) => c)]
  const below = Math.max(0, h - SKY)
  const at = (y) => (y <= SKY ? (y / SKY) * OVER_ROOF : OVER_ROOF + (1 - OVER_ROOF) * ((y - SKY) / Math.max(1, below)))
  const colorAt = (y) => {
    const p = clamp(at(y), 0, 1) * (stops.length - 1)
    const i = Math.min(stops.length - 2, Math.floor(p))
    return mix(stops[i], stops[i + 1], p - i)
  }
  const n = below ? clamp(Math.round(below / 72), Math.min(2, most), most) : 0
  const nh = HEAD_N[ctx.sky ? 1 : 0]
  const head0 = Array.from({ length: nh }, (_, k) => Math.round((k * SKY) / nh))
  const edges = [...head0, SKY, ...Array.from({ length: n }, (_, k) => SKY + Math.round(below * (1 - 0.85 ** (k + 1)) / (1 - 0.85 ** n)))]
  // each band past both walls, so only its top and bottom edges are stroked in the drawing
  const s = edges.slice(1).map((e, k) => `<path color="${colorAt((edges[k] + e) / 2)}" d="M-2 ${y0 + edges[k]}h${W + 4}v${e - edges[k]}H-2z"/>`).join('')
  return `<g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-dasharray="1">${s}</g>`
}

/**
 * More sky over a drawing, `more` rows of it from y 0 (renderSvg `skyFill`: the drawing then stands `more` lower). The
 * light's own colors carry on upward from the topmost band the header paints (skyTop), deepening toward the zenith in
 * bands as dithered as its own, about one per 22 rows; and in it the night's stars or the day's clouds, laid as the
 * header lays its own but by another lot, so they are other stars and other clouds. Backdrop: nothing when transparent.
 */
export function skyOver(ctx, more) {
  if (ctx.transparent || !(more > 0)) return ''
  const { W } = ctx
  const phase = skyPhase(ctx)
  const low = skyTop(ctx)
  const high = mix(low, '#000000', ctx.night ? 0.5 : 0.32)
  const n = clamp(Math.round(more / 22), 1, 6)
  const edges = Array.from({ length: n + 1 }, (_, k) => Math.round((k * more) / n))
  // top down, the last band the header's own color; each past both walls and the first past the top, as sky()'s are
  const bands = edges.slice(1).map((e, k) => {
    const from = k ? edges[k] : -2
    return `<path color="${n === 1 ? low : mix(high, low, k / (n - 1))}" d="M-2 ${from}h${W + 4}v${e - from}H-2z"/>`
  }).join('')
  const lot = { ...ctx, f: { ...ctx.f, now: { ...ctx.f.now, local_date: `${ctx.f.now?.local_date ?? ''} over` } } }
  const deco = more >= 12 ? skyDeco(lot, 2, more - 4, [], phase) : ''
  return `<g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-dasharray="1">${bands}</g>${deco}`
}

/**
 * Stars (night) or clouds (day), seeded by the local date so the sky is stable all day. `avoid` lists [x, y, w, h]
 * boxes to keep clear (the moon or the sun): a twinkle on it reads as a typo. With ctx.transparent the stars sit at
 * half opacity, so on a light page they stay a faint speckle instead of reading as dirt. `phase` (skyPhase) picks the
 * clouds' sprite, and thins the stars at twilight.
 */
function skyDeco(ctx, y0, h, avoid, phase = ctx.night ? 'night' : 'day') {
  const { W, night, f } = ctx
  const rnd = seeded(f.now?.local_date ?? '')
  let out = ''
  if (night) {
    const bright = []
    const dim = []
    const twinkle = []
    // about one star per 500 px² of sky, never more than 36: a 2400-px drawing need not pay for 120 of them; half as
    // many in the twilight
    const n = Math.round(Math.min(36, Math.round(W * h / 500)) / (phase === 'twilight' ? 2 : 1))
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd() * W)
      const y = y0 + Math.floor(rnd() * h)
      const r = rnd()
      if (avoid.some(([ax, ay, aw, ah]) => x >= ax && x < ax + aw && y >= ay && y < ay + ah)) continue
      if (r < 0.15 && twinkle.length < 4) twinkle.push([x, y])
      else (r < 0.45 ? bright : dim).push([x, y, 1, 1, r < 0.45 ? K.star : K.starDim])
    }
    out += paint([...bright, ...dim])
    out += twinkle.map(([x, y], i) => `<g>${paint([[x, y, 1, 1, K.star], [x - 1, y, 3, 1, `${K.star}/.35`],
      [x, y - 1, 1, 3, `${K.star}/.35`]])}${aO(ctx, '1;.2;1;1', r1(2.2 + i * 0.4), -i * 0.7)}</g>`).join('')
    if (ctx.transparent && out) out = `<g opacity=".5">${out}</g>`
  } else {
    // each cloud tries a few places for one in clear sky (the sign takes much of it); one that finds none stays away. The
    // full sky's are a puff and a streak in turn, a small puff where those find no room, tinted for the light; the lean
    // sky's the small one, lit for its light
    const placed = []
    const tint = ctx.sky ? cloudTint(phase) : ''
    for (let i = 0; i < Math.max(2, Math.round(W / 160)); i++) {
      for (let k = 0; k < 8; k++) {
        const shape = ctx.sky ? (k < 4 ? CLOUD_ORDER[i % CLOUD_ORDER.length] : 'puffS') : 'cloud'
        const [cw, ch] = ctx.sky ? CLOUD_BOX[shape] : [17, 5]
        let x
        let y
        if (ctx.sky) {
          // the full sky's: a row by lot, then a place by lot among those clear of the sign, the skyline and the others
          y = y0 + Math.floor(rnd() * Math.max(1, h - ch))
          const blocked = [...avoid, ...placed].filter(([, ay, , ah]) => y + ch > ay && y < ay + ah)
          const free = []
          for (let cx = 0; cx <= W - cw; cx++) if (!blocked.some(([ax, , aw]) => cx + cw > ax && cx < ax + aw)) free.push(cx)
          if (!free.length) continue
          x = free[Math.floor(rnd() * free.length)]
        } else {
          x = Math.floor(rnd() * (W - 20))
          y = y0 + Math.floor(rnd() * Math.max(1, h - 6))
          if ([...avoid, ...placed].some(([ax, ay, aw, ah]) => x + cw > ax && x < ax + aw && y + ch > ay && y < ay + ah)) continue
        }
        placed.push([x, y, cw, ch])
        out += use(ctx, ctx.sky ? `cl-${shape}` : SKIES[phase]?.cloud ?? 'cloud', x, y, tint, aT(ctx, '0 0;1 0;2 0;1 0', 8, -i * 2))
        break
      }
    }
  }
  return out
}

/**
 * What the sign leaves to its tooltip: 'THE OFFICE · <view> · <date or range> · <shift>', the shift being night
 * shift, weekend shift or office hours (lights off or nobody in when no desk is open). Never the time: a tooltip cannot
 * tick, and a live drawing stays one string while its clock runs.
 */
function boardTip(ctx, view, when, said) {
  const { f, desks, night } = ctx
  const wd = f.now?.weekday
  const shift = said ??
    (!desks.length ? (night ? 'lights off' : 'nobody in') : night ? 'night shift' : wd === 'Sat' || wd === 'Sun' ? 'weekend shift' : 'office hours')
  return ['THE OFFICE', view, when, shift].filter(Boolean).join(' · ')
}

// What goes between two groups on the sign's lines, unless a group says otherwise.
const SEP = ' · '
// A group on the sign: [text, color] or [text, color, { join, w, at, br }]: `join` the separator before it, a mark
// `at(x, y)` of width `w` drawn in its place (the live glance's headcount strip and icons, the timelapse's clock), `br`
// the group the second line opens with.
const groupW = (g, size) => (g[2]?.at ? g[2].w : textW(g[0], size))
const joinOf = (g) => g[2]?.join ?? SEP
const lineW = (line, size) => line.reduce((n, g, i) => n + groupW(g, size) + (i ? textW(joinOf(g), size) : 0), 0)

/**
 * The scene's groups laid out on the sign's lines, `room` wide each: as many as fit in order on two lines (a group
 * that fits on neither ends them, as fitGroups does), on one line when they fit there, else split where the two lines
 * come out most even, never before a group joined by anything but ' · ' (the strip stays with its count). A group
 * marked `br` opens the second line instead, each line keeping its groups while they fit. Returns the lines, each a list
 * of groups.
 */
function infoLines(groups, room, size = INFO.size) {
  const br = groups.findIndex((g, i) => i && g[2]?.br)
  if (br > 0) {
    const fitting = (line) => {
      const out = []
      let used = 0
      for (const g of line) {
        const w = groupW(g, size) + (out.length ? textW(joinOf(g), size) : 0)
        if (used + w > room) break
        used += w
        out.push(g)
      }
      // a mark is kept only with the words joined to it (an icon without its count says nothing)
      while (out.length && out.length < line.length && out.at(-1)[2]?.at && joinOf(line[out.length]) !== SEP) out.pop()
      return out
    }
    return [fitting(groups.slice(0, br)), fitting(groups.slice(br))].filter((line) => line.length)
  }
  const kept = []
  let lines = 1
  let used = 0
  for (const g of groups) {
    const w = groupW(g, size)
    const sep = used ? textW(joinOf(g), size) : 0
    if (used + sep + w <= room) used += sep + w
    else if (lines === 1 && used && w <= room && joinOf(g) === SEP) {
      lines = 2
      used = w
    } else break
    kept.push(g)
  }
  if (lines === 1) return kept.length ? [kept] : []
  let best = null
  for (let k = 1; k < kept.length; k++) {
    if (joinOf(kept[k]) !== SEP) continue
    const a = lineW(kept.slice(0, k), size)
    const b = lineW(kept.slice(k), size)
    if (a <= room && b <= room && (!best || Math.max(a, b) < best.w)) best = { k, w: Math.max(a, b) }
  }
  return best ? [kept.slice(0, best.k), kept.slice(best.k)] : [kept]
}

/**
 * The groups that make it onto the sign of a drawing `W` wide: infoLines' lines flattened, so a scene can ask whether
 * its long form fits (`fitInfo(full, W).length < full.length`) before choosing a shorter one.
 */
export const fitInfo = (groups, W) => infoLines(groups, infoRoom(W)).flat()

/**
 * One of the sign's lines, centered on `cx` at baseline `y`: a line of text alone is one <text> anchored in its middle;
 * a line with marks is laid out from its left, each run of text (separators included) a <text>, each mark where it
 * falls.
 */
function infoLine(line, cx, y, size = INFO.size) {
  const tspan = (t, f) => `<tspan fill="${f}">${esc(t)}</tspan>`
  if (!line.some((g) => g[2]?.at)) {
    return `<text x="${r1(cx)}" y="${r1(y)}" font-size="${size}" text-anchor="middle">${line.map((g, i) => (i ? tspan(joinOf(g), ROLE.dim) : '') + tspan(g[0], g[1])).join('')}</text>`
  }
  let x = cx - lineW(line, size) / 2
  let s = ''
  let run = null
  // text joins the open run; a run opens where its text starts (a <text> drops leading spaces, so they move its x)
  const say = (t, f) => {
    if (!run) {
      const lead = t.length - t.trimStart().length
      run = { x: x + textW(t.slice(0, lead), size), body: '' }
      t = t.trimStart()
    }
    if (t) run.body += tspan(t, f)
  }
  const flush = () => {
    if (run?.body) s += `<text x="${r1(run.x)}" y="${r1(y)}" font-size="${size}">${run.body}</text>`
    run = null
  }
  line.forEach((g, i) => {
    const sep = i ? joinOf(g) : ''
    // a separator of spaces alone after a mark is only room
    if (sep && (run || sep.trim())) say(sep, ROLE.dim)
    x += textW(sep, size)
    if (g[2]?.at) {
      flush()
      s += g[2].at(x, y)
    } else say(g[0], g[1])
    x += groupW(g, size)
  })
  flush()
  return s
}

/**
 * The sign from (x, top), `w` × SIGN.h: a dark box, lit along its top edge, shadowed under, a row of bulbs along its top
 * and its bottom edge (every other bulb in each row, the two sets blinking in turn, as a theater marquee); the neon
 * centered in its upper part, a rail, the scene's lines centered under it.
 */
function sign(ctx, { x, w }, top, lines) {
  const h = SIGN.h
  let s = paint([[x, top, w, h, '#1a1613'], [x, top, w, 1, '#4a4038'], [x, top + 1, 1, h - 2, '#2e2721'], [x + w - 1, top + 1, 1, h - 2, '#0e0c0a'],
    [x, top + h - 1, w, 1, '#0e0c0a'], [x, top + h, w, 1, '#000/.35'],
    [x + 4, top + SIGN.rail, w - 8, 1, '#0e0c0a'], [x + 4, top + SIGN.rail + 1, w - 8, 1, '#3a322b']])
  const k = Math.floor((w - 4) / 4)
  const row = (o) => `M${x + 2 + o * 4} ${top + 2.5}h${(k - 1 - o) * 4 + 1}M${x + 2 + o * 4} ${top + h - 2.5}h${(k - 1 - o) * 4 + 1}`
  const bulbs = (o) => `<path stroke="${ROLE.accent}" stroke-dasharray="1 7" d="${row(o)}"/>`
  s += `<g>${bulbs(0)}${aO(ctx, '1;.25', 1.2)}</g><g opacity=".25">${bulbs(1)}${aO(ctx, '.25;1', 1.2)}</g>`
  s += neon(ctx, x + Math.round((w - NEON.w) / 2), top + SIGN.neon)
  const cx = x + w / 2
  return s + (lines.length === 2 ? infoLine(lines[0], cx, INFO.two[0] + top - SIGN.top) + infoLine(lines[1], cx, INFO.two[1] + top - SIGN.top)
    : lines.length ? infoLine(lines[0], cx, INFO.one + top - SIGN.top) : '')
}

/**
 * The sign's supports, from under it (`from`) down to the roof deck (`to`, their feet behind the coping): two steel
 * truss legs a fifth of its width in from each end (two rails, a zigzag between them), and across them, three rows
 * under the sign, a catwalk with its railing and a ladder up to it at the left leg; `lean`, the rails and the catwalk.
 */
function signLegs({ x, w }, from, to, lean) {
  const h = to - from
  const xs = [x + Math.round(w / 5), x + w - Math.round(w / 5) - 3]
  const walk = from + 3
  if (lean) return paint([...xs.flatMap((lx) => [[lx, from, 1, h, '#6d7279'], [lx + 3, from, 1, h, '#4a4e55']]), [x, walk, w, 1, '#8a8f96'], [x, walk + 1, w, 1, '#3a3d44']])
  const rails = xs.flatMap((lx) => [[lx, from, 1, h, '#6d7279'], [lx + 3, from, 1, h, '#4a4e55']])
  const lx = xs[0] - 4
  const ladder = [[lx, walk, 1, to - walk, '#7d858f'], [lx + 3, walk, 1, to - walk, '#5d6168']]
  // the dashed strokes: the trusses' zigzag (a pixel a row, left and right in turn), the railing's posts, the rungs
  const zig = xs.map((x0) => `M${x0 + 1.5} ${from}v${h}M${x0 + 2.5} ${from + 1}v${h - 1}`).join('')
  return paint([...rails, ...ladder, [x + 2, walk - 3, w - 4, 1, '#7d858f'], [x, walk, w, 1, '#8a8f96'], [x, walk + 1, w, 1, '#3a3d44'],
    [x + 1, walk + 2, w - 2, 1, '#000/.25']]) +
    `<path stroke="#454950" stroke-dasharray="1 1" d="${zig}"/><path stroke="#5d6168" stroke-width="3" stroke-dasharray="1 11" d="M${x + 4} ${walk - 1.5}h${w - 8}"/>` +
    `<path stroke="#6d7279" stroke-width="2" stroke-dasharray="1 1" d="M${lx + 2} ${walk + 1}v${to - walk - 1}"/>`
}

/**
 * The top of every scene, from y0 down to its sidewalk at `groundY`: one function, so every view has the same header,
 * the same sky and the same roof line. It paints the sky (backdrop) down to the street in the light of the hour
 * (skyPhase), its stars or clouds and the moon or the sun (celestialAt); the skyline (skyline(): the day's
 * landmarks, structures and life on each side, drawn by lot from lib/svg-roof.mjs's props), the sign on its legs (the neon THE OFFICE over the scene's lines,
 * '<view> · <when> · <shift>' in its tooltip), pigeons on the coping, and the building's brick shell and crown from the
 * roof (y0 + SKY) down to `groundY`, x EDGE to W − EDGE.
 * - `view`: the view word (live, today, week, month, what they did); `when`: the date or the range.
 * - `info`: the scene's glance or totals, as groups (infoLines: [text, color], or with a mark or a join of their own),
 *   laid out on the sign's one or two lines.
 * - `sky` (optional): a scene whose sky changes as it plays (the timelapse) paints it itself: `(sky) → markup` is drawn
 *   where the sky, its stars or clouds and the moon or the sun go, and gets `{ wash, arc, deco }`: `wash(phase, most)`,
 *   the sky's bands down to the street in a light (SKIES' keys; '' on the page; `most` bands under the roof at most),
 *   the way the moon and the sun cross the sky (celestialArc's), and `deco(night, avoid)`, the stars (night) or the
 *   clouds the header would draw, clear of the skyline, the sign and the `avoid` boxes. Without it the header paints the
 *   facts' own sky, in the light of their hour (skyPhase), as every view does.
 * - `shift` (optional): what the tooltip says after the date or the range instead of the shift ('' for nothing).
 * The sign is opaque, so its text reads on any page. Returns `{ svg, roof }`.
 */
export function sceneHeader(ctx, y0, { view, when = '', info = [], groundY, sky: skyOf, shift }) {
  const { W, night } = ctx
  const BX0 = EDGE
  const BX1 = W - EDGE
  const roof = y0 + SKY
  const deck = roof - PARAPET + 2
  const top = y0 + SIGN.top
  const box = signBox(W)
  const props = skyline(ctx)
  // what stars and clouds keep clear of: the sign and its legs, the skyline (a cloud caught behind the water tower
  // reads as smoke)
  const avoid = [[box.x - 2, top - 2, box.w + 4, deck - top + 2], ...props.map(([, x, w, h]) => [x - 1, deck - h - 3, w + 2, h + 3])]
  let s = ''
  const h = Math.max(SKY, groundY - y0)
  // the way the sun and the moon cross the sky, rising and setting between the props
  const arc = celestialArc(W, y0, props)
  if (typeof skyOf === 'function') {
    s += skyOf({
      wash: (phase, most) => sky(ctx, y0, h, phase, most), arc,
      deco: (dark, more = []) => skyDeco({ ...ctx, night: dark === true }, y0 + 1, deck - y0 - 1, [...more, ...avoid]),
    })
  } else {
    const cel = celestialAt(ctx, arc, y0)
    const phase = skyPhase(ctx)
    s += sky(ctx, y0, h, phase)
    // the glow on the horizon where the sun rises or sets, over the bands, behind the skyline
    if (ctx.sky && !ctx.transparent && (phase === 'dawn' || phase === 'dusk')) s += horizonGlow(phase, phase === 'dawn' ? arc.x0 : arc.x1, roof - PARAPET)
    // stars and clouds in the open sky, clear of the moon or the sun, the sign and the skyline
    const r = Math.ceil(ORB.halo)
    s += skyDeco(ctx, y0 + 1, deck - y0 - 1, [[cel.x - r, cel.y - r, 2 * r, 2 * r], ...avoid], phase)
    // the moon is as pale as a light page: on the page (transparent) it gets the text's dark halo
    const [disc, rim] = SUN_TONES[cel.low ? 'low' : 'high']
    const lean = ctx.sky ? '' : '-s'
    s += night ? onPage(ctx, use(ctx, `moon${lean}`, cel.x, cel.y)) : use(ctx, `sun${lean}`, cel.x, cel.y, ctx.sky ? ` color="${disc}" stroke="${rim}"` : '')
  }
  // the skyline, each prop on the deck behind the coping, its lights its own
  for (const [name, x, , h] of props) s += use(ctx, `rf-${name}`, x, deck - h)
  // the sign on its legs; what its lines leave out in its tooltip
  s += signLegs(box, top + SIGN.h + 1, deck, ctx.roof === 2)
  s += `<g><title>${esc(boardTip(ctx, view, when, shift))}</title>${sign(ctx, box, top, infoLines(info, infoRoom(W)))}</g>`
  s += shell(ctx, BX0, roof, BX1 - BX0, groundY)
  // at night the neon's yellow light on the coping under the sign, brightest under it
  if (night && ctx.roof !== 2) {
    s += paint([[box.x - 10, roof - PARAPET, box.w + 20, 1, `${NEON_INK.glass}/.18`], [box.x + 6, roof - PARAPET, box.w - 12, 1, `${NEON_INK.glass}/.2`],
      [box.x, roof - PARAPET + 1, box.w, 1, `${NEON_INK.glass}/.16`]])
  }
  // pigeons on the coping, one of them bobbing; clear of the sign's legs (the full roof's alone)
  const perch = roof - PARAPET - 4
  const birds = ctx.roof ? [] : [Math.round(BX0 + 60), Math.round(BX1 - 52)].filter((px) => px > BX0 + 2 && px + 6 < BX1 - 2 && (px + 6 < box.x || px > box.x + box.w))
  s += birds.map((px, i) => (i ? `<g>${use(ctx, 'rf-pigeon', px, perch)}${aT(ctx, '0 0;0 1;0 0;0 0;0 0', 1.8, -0.6)}</g>` : use(ctx, 'rf-pigeon', px, perch))).join('')
  return { svg: s, roof }
}

/**
 * A plate w × h at (x, y), lit from above as the whole building is. `rects`: its body, the corners rounded off, and its
 * shadow on the wall, a row under it a pixel to the right. `light`: its top row lit, its foot shaded, to paint over the
 * rects of every plate (a paint lays its colors in order of first use): however many plates and colors, two paths for
 * all their light.
 */
export const litPlate = (x, y, w, h, fill, lit = '#fff/.4', shade = '#000/.22') => ({
  rects: [[x + 1, y, w - 2, h, fill], [x, y + 1, w, h - 2, fill], [x + 1, y + h, w, 1, '#000/.35']],
  light: [[x + 1, y, w - 2, 1, lit], [x + 1, y + h - 1, w - 2, 1, shade]],
})
/** The dark plate (a floor number's, a count's): litPlate in K.plate, its light and shade kept close to it. */
export const darkPlate = (x, y, w, h) => litPlate(x, y, w, h, K.plate, '#fff/.12', '#000/.4')
/** A floor number's dark plate, 9 tall: a sprite per width, as a building has many of them and they are all alike. */
export function floorPlate(ctx, x, y, w) {
  const name = `fl-plate${w}`
  SPRITES[name] ??= () => {
    const { rects, light } = darkPlate(0, 0, w, 9)
    return paint(rects) + paint(light)
  }
  return use(ctx, name, x, y)
}

/**
 * A nameplate in parts, for a scene that draws many: its rects and light (litPlate) and its name as a bare <text> for a
 * group that sets PLATE_FONT. Returns { rects, light, text, w }.
 */
export function plateParts(x, y, name, fill, maxW) {
  const label = fit(name, maxW - 6, 5.5)
  const w = Math.round(textW(label, 5.5) + 6)
  return { ...litPlate(x, y, w, 9, fill), text: `<text x="${r1(x + 3)}" y="${r1(y + 7)}">${esc(label)}</text>`, w }
}
/** The font of a nameplate's name: wrap plateParts texts in `<g ${PLATE_FONT}>`. */
export const PLATE_FONT = `font-size="5.5" fill="${K.plate}" font-weight="bold"`

/**
 * A room's nameplate: a colored plate with the name in dark bold 5.5 px, fitted to maxW. Returns { svg, w }. A scene
 * with many of them keeps ctx.plates (`{ rects, light, text }`, its header bands' paint: platesSvg): this one joins
 * it, its svg is ''.
 */
export function nameplate(ctx, x, y, name, fill, maxW) {
  const p = plateParts(x, y, name, fill, maxW)
  if (!ctx.plates) return { svg: `${paint(p.rects)}${paint(p.light)}<g ${PLATE_FONT}>${p.text}</g>`, w: p.w }
  ctx.plates.rects.push(...p.rects)
  ctx.plates.light.push(...p.light)
  ctx.plates.text += p.text
  return { svg: '', w: p.w }
}
/** What a scene kept in ctx.plates, in one paint and one group, nothing kept after it. Nothing may draw over it. */
export function platesSvg(ctx) {
  const { rects, light, text } = ctx.plates
  ctx.plates = null
  return `${paint(rects)}${paint(light)}${text ? `<g ${PLATE_FONT}>${text}</g>` : ''}`
}

/**
 * A room's top band (HEAD tall): nameplate in `it.color`, an optional headcount strip (desks with .cls), the groups
 * ([text, color?] at 5 px), an optional `aside` at the right end, then clerestory windows (night or day glass) in the
 * wall left over, HEAD_WINDOWS at most, at its right end. `windows` draws them instead (`(xs) → markup`, each window
 * 18 × 9 at (x, y + 2)): the live rooms' open on a city, the month's on its season.
 */
export function roomHeader(ctx, it, x, y, w, groups, strip, aside = null, windows = null) {
  let s = ''
  const plate = nameplate(ctx, x + 3, y + 2, it.name, it.color, w - 10)
  s += plate.svg
  let cx = x + 3 + plate.w + 4
  let all = groups
  if (strip?.length) {
    // up to 20 ticks, as the glance; past that a dim `+N` group says how many more (a bare `+` read as `+ 19 clocked in`)
    const shown = strip.slice(0, 20)
    if (cx + shown.length * 3 + 4 < x + w) {
      const ticks = shown.map((d, i) => [cx + i * 3, y + 3, 2, 7, CLASS_COLOR[d.cls]])
      if (ctx.plates) ctx.plates.rects.push(...ticks)
      else s += paint(ticks)
      cx += shown.length * 3 + 3
      if (strip.length > shown.length) all = [[`+${strip.length - shown.length}`, ROLE.dim], ...groups]
    }
  }
  // `aside` (a sign of the scene's own, `{ w, at(x, y) }`: the live rooms' lines scoreboard) at the right end, when it
  // fits after the plate and the strip; the groups take what it leaves (the strip already counts the desks), then
  // clerestory windows the wall left between
  let end = x + w
  if (aside && cx + 4 + aside.w <= x + w - 3) {
    end = x + w - 3 - aside.w
    s += aside.at(end, y + 2)
  }
  const kept = fitGroups(all, end - cx - 4, 5)
  if (kept.length) {
    s += spans(cx + 1, y + 9, 5, kept.map(([t, f]) => [t, f ?? K.groupText]))
    cx += kept.reduce((a, g, i) => a + textW(g[0], 5) + (i ? textW(' · ', 5) : 0), 0) + 3
  }
  const xs = []
  for (let wx = Math.ceil(cx + 6); wx + 18 <= end - 4; wx += 26) xs.push(wx)
  const wins = xs.slice(-HEAD_WINDOWS)
  return s + (windows ? windows(wins) : wins.map((wx) => use(ctx, ctx.night ? 'wn' : 'wd', wx, y + 2)).join(''))
}

/**
 * The lines added and removed in commits, as a little LED scoreboard 9 tall, a stock ticker's: a dark plate, a green
 * ▲ before the lines added and a red ▼ before the lines removed, said short (format.mjs fmtCount: ▲3.3M ▼45k), the
 * arrows pulsing in turn; the exact counts in its tooltip ('+3,283,897 / −45,056 lines in commits this week', over
 * `when`). Returns `{ w, at(x, y) }` for a room to place it, or null when no line moved either way.
 */
export function linesTicker(ctx, add, del, when = '') {
  const a = num0(add)
  const d = num0(del)
  if (!a && !d) return null
  const up = fmtCount(a)
  const down = fmtCount(d)
  const uw = textW(up, 4.5)
  const w = Math.round(15 + uw + textW(down, 4.5))
  const exact = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const tip = `+${exact(a)} / −${exact(d)} lines in commits${when ? ` ${when}` : ''}`
  return {
    w,
    at: (x, y) => {
      const dx = Math.round(x + 9 + uw)
      const plate = [[x, y, w, 9, '#14100c'], [x, y + 9, w, 1, '#000/.4']]
      // the live floors' go over their band's walls, a path for all of them
      if (ctx.plates) ctx.band.rails.push(...plate)
      return `<g><title>${esc(tip)}</title>${ctx.plates ? '' : paint(plate)}` +
        `<g>${paint([[x + 2, y + 5, 3, 1, ROLE.busy], [x + 3, y + 4, 1, 1, ROLE.busy]])}${aO(ctx, '1;.35', 1.6)}</g>` +
        `<g>${paint([[dx, y + 4, 3, 1, ROLE.warn], [dx + 1, y + 5, 1, 1, ROLE.warn]])}${aO(ctx, '.35;1', 1.6)}</g>` +
        txt(x + 6, y + 7, up, 4.5, ROLE.busy) + txt(dx + 4, y + 7, down, 4.5, ROLE.warn) + '</g>'
    },
  }
}

