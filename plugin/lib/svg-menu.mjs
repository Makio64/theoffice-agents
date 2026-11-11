// PURE: the pane's menu as the top deck of the console the period strip (lib/svg-period.mjs) is the other deck of: the
// same dark plate with brass rivets, each key a chunky cream keycap with a pixel icon and its name in the console's
// type (lib/svg-console.mjs TYPE: the drawing's bold monospace, as text, sharp at the pane's scale). One row a call: the tabs, or on the Timelapse its ranges and Export. The key on screen is lit, the
// yellow of a lit window in a faint glow, level with the others, and goes nowhere unless it may be pressed again (a
// range of the Timelapse, for a fresh replay); a key held down sinks as the strip's do; an action (Export) is a coral
// key at the right end, as NOW is on the strip, and while it works its letters blink, one <set> as the strip's LED.
// Joined, the row's foot is square and sits flush on the deck under it (the image hangs from its foot, so a pane that
// draws it narrower than asked leaves its sliver above, never between the decks); a row `under` another has its top
// square instead, so the two read as one console.
// A switch (the Live tab's Quiet, the Zoom) stands apart at the right end too, a cream key lit while it is on, its face
// the same on and off so the row never moves when it is pressed; keys apart line up at the right end in their order; a
// key `isHidden` keeps its room and draws nothing (Quiet off the Live tab), so the tabs stand where they do on every tab.
// A key `isIcon` is its icon alone at every width (the Frame key, the last switch): the tabs keep their names' room.
// The Frame's row is a deck like the export's: its LED says whether the frame is on, its keys turn it on or off and
// renew its link, and Back stands apart.
// The Month's export row is one more such deck, under the strip: an amber LED at its left asks the question (EXPORT, then
// CALENDAR AS), the keys answer it (what to export, then how), and Back stands apart at the right end as an action
// would, a cream key. Its LED goes before any key's words as the pane narrows.
// As the pane narrows the row steps down a ladder: icons and full names, short names, tighter caps, names alone (the lit
// key keeps its icon), icons alone (the lit key keeps its name, an action its word), icons alone. It hands back its
// zones in its own units, as the strip does. It imports the console's parts (lib/svg-console.mjs) and nothing else: the
// desktop ships a surface module and all it imports to the page that draws it.
import { C, bitmap, esc, paint, plateShape, typeGroup, word, wordW as typeW } from './svg-console.mjs'

// the key a click falls on, as the strip's (lib/svg-console.mjs)
export { zoneAt } from './svg-console.mjs'

/** Art units are 2 CSS px; the row is H units tall: a 16-unit key, 2 above it, 1 below. */
const H = 19
const PAD = 5
const KY = 2
/** The widest an Svg is drawn: the desktop refuses a tree past it. */
const MAX_PX = 4096
/** The lit key's lip, a shade under its yellow face. */
const LIT_LO = '#bf9a35'
/** The keys' words: 6.5 units (13 px) of the console's type. */
const SIZE = 6.5
const wordW = (s) => typeW(s, SIZE)

// the keys' icons, 9 × 9 at most: '#' in the key's ink, '+' in its accent, '.' the cap showing through
const ICON = {
  // live: an on-air light and its waves
  live: ['.........', '.#.....#.', '#..+++..#', '#.+++++.#', '#.+++++.#', '#.+++++.#', '#..+++..#', '.#.....#.', '.........'],
  // the time clock
  today: ['..#####..', '.#.....#.', '#...#...#', '#...#...#', '#...###.#', '#.......#', '#.......#', '.#.....#.', '..#####..'],
  // a calendar page of seven days
  week: ['.#.....#.', '+++++++++', '+++++++++', '#.......#', '#.#####.#', '#.....#.#', '#....#..#', '#...#...#', '#########'],
  // a calendar page of the month's days
  month: ['.#.....#.', '+++++++++', '+++++++++', '#.......#', '#.#.#.#.#', '#.......#', '#.#.#.#.#', '#.......#', '#########'],
  // the briefcase: what they did
  work: ['...###...', '..#...#..', '#########', '#########', '####+####', '.........', '#########', '#########', '#########'],
  // lines of words struck through: the Live tab's Quiet
  quiet: ['........+', '######.+.', '......+..', '.....+...', '####+####', '...+.....', '..+......', '#+######.', '+........'],
  // a magnifier over a plus: the Zoom
  zoom: ['..###....', '.#...#...', '#..+..#..', '#.+++.#..', '#..+..#..', '.#...#...', '..####...', '.....###.', '......###'],
  // a frame of film with a play mark
  timelapse: ['#.#.#.#.#', '#########', '###+#####', '###++####', '###+++###', '###++####', '###+#####', '#########', '#.#.#.#.#'],
  // last night's moon and a star
  yesterday: ['....##...', '..###..+.', '.###..+++', '###....+.', '###......', '###......', '####....#', '.#######.', '..#####..'],
  // down into the tray
  export: ['...###...', '...###...', '...###...', '.#######.', '..#####..', '...###...', '#...#...#', '#.......#', '#########'],
  // the Month's export row. What: the wall calendar (the month's page), the directory board, the whole building, the stats
  calendar: ['.#.....#.', '+++++++++', '+++++++++', '#.......#', '#.#.#.#.#', '#.......#', '#.#.#.#.#', '#.......#', '#########'],
  directory: ['#########', '#.......#', '#+.####.#', '#.......#', '#+.###..#', '#.......#', '#+.####.#', '#.......#', '#########'],
  building: ['....#....', '...###...', '.#######.', '.#+#+#+#.', '.#######.', '.#+#+#+#.', '.#######.', '.###+###.', '#########'],
  stats: ['.......+.', '.......+.', '....#..+.', '....#..+.', '.#..#..+.', '.#..#..+.', '.#..#..+.', '.........', '#########'],
  // how: a picture, a line between two nodes, a loop, a camera, a page, a table, braces; and back
  png: ['#########', '#.......#', '#.....+.#', '#.......#', '#..#....#', '#.###.#.#', '#########'],
  svg: ['###......', '#+#......', '###......', '...#.....', '....#....', '.....#...', '......###', '......#+#', '......###'],
  gif: ['..####...', '.#....#..', '#......#.', '#.....###', '#......#.', '#........', '.#....#..', '..####...'],
  video: ['######...', '#....#..#', '#.++.#.##', '#.++.####', '#....#.##', '######..#'],
  page: ['#####....', '#...##...', '#...#+#..', '#...####.', '#.+++..#.', '#......#.', '#.++++.#.', '#......#.', '########.'],
  csv: ['#########', '#+++#+++#', '#########', '#...#...#', '#########', '#...#...#', '#########'],
  json: ['.##...##.', '.#.....#.', '.#.....#.', '#..+.+..#', '.#.....#.', '.#.....#.', '.##...##.'],
  back: ['...#.....', '..##.....', '.#######.', '########.', '.#######.', '..##.....', '...#.....'],
  // the Frame: a screen on its stand, a lit window on it; its row: the power mark (on and off), a link made anew
  frame: ['#########', '#.......#', '#.++.++.#', '#.++.++.#', '#.......#', '#########', '....#....', '...###...', '.#######.'],
  power: ['....#....', '..#.#.#..', '.#..#..#.', '#...#...#', '#.......#', '#.......#', '.#.....#.', '..#####..'],
  renew: ['..####.#.', '.#....##.', '#....###.', '#........', '#.......#', '........#', '.###....#', '.##....#.', '.#.####..'],
}

/** A menu glyph on its own, sharing the desktop key's exact pixels and default ink. */
export function menuIconSvg(name, { scale = 2, ink = C.ink, accent = C.accent } = {}) {
  const rows = Object.hasOwn(ICON, name) ? ICON[name] : null
  if (!rows) return ''
  const pixel = Number.isFinite(scale) ? Math.max(1, Math.min(16, Math.round(scale))) : 2
  const w = rows[0].length
  const h = rows.length
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * pixel}" height="${h * pixel}" viewBox="0 0 ${w} ${h}" ` +
    `shape-rendering="crispEdges" aria-hidden="true">${paint(bitmap(rows, 0, 0, esc(ink), esc(accent)))}</svg>`
}

/**
 * The ladder, widest first: the first whose keys fit the plate is drawn. words: 'label' (full), 'short', 'on' (the lit
 * key's full name), 'onShort' (its short one), 'none' (an action keeps its word in 'on' and 'onShort'); icons: 'all',
 * 'on' (the lit key's alone); pad, ig (icon to word) and gap in units; cap: the widest a key grows to fill the row.
 */
const LADDER = [
  { tier: 'full', words: 'label', icons: 'all', pad: 4, ig: 3, gap: 3, cap: 80 },
  { tier: 'short', words: 'short', icons: 'all', pad: 4, ig: 3, gap: 3, cap: 80 },
  { tier: 'tight', words: 'short', icons: 'all', pad: 3, ig: 2, gap: 2, cap: 72 },
  { tier: 'words', words: 'short', icons: 'on', pad: 3, ig: 2, gap: 2, cap: 60 },
  { tier: 'picked', words: 'on', icons: 'all', pad: 3, ig: 2, gap: 2, cap: 26 },
  { tier: 'picked-short', words: 'onShort', icons: 'all', pad: 3, ig: 2, gap: 2, cap: 26 },
  { tier: 'icons', words: 'none', icons: 'all', pad: 3, ig: 2, gap: 2, cap: 24 },
  { tier: 'tiny', words: 'none', icons: 'all', pad: 1, ig: 0, gap: 2, cap: 20 },
]

const isAction = (k) => k.icon === 'export'
/** A switch: lit while on, pressed again to turn it off, its face the same either way (isSwitch). */
const isSwitch = (k) => k.isSwitch === true
/** A key that stands apart at the right end: an action, Back or a switch (cream keys, as the others are). */
const isApart = (k) => isAction(k) || k.icon === 'back' || isSwitch(k)
/** The question the export row's LED asks: its words' size, and its rim and padding around them. */
const LED_SIZE = 6.5
const ledW = (s) => typeW(s, LED_SIZE) + 10

/** What a key shows in a tier: its icon (or null) and its words. A switch on shows what it shows off: never the lit key. */
function face(k, t) {
  const lit = k.isOn && !isSwitch(k)
  // a key that is its icon alone shows it in every tier, and no word in any
  if (k.isIcon === true && ICON[k.icon]) return { icon: ICON[k.icon], text: '' }
  const icon = ICON[k.icon] && (t.icons === 'all' || lit) ? ICON[k.icon] : null
  const short = k.short || k.label
  const said = {
    label: k.label,
    short,
    on: lit ? k.label : isAction(k) ? short : '',
    onShort: lit || isAction(k) ? short : '',
    none: '',
  }[t.words]
  return { icon, text: String(said ?? '') }
}

/** A key's width at its narrowest in a tier: its rim, its padding, its icon and words. */
function natural(k, t) {
  const { icon, text } = face(k, t)
  const iw = icon ? icon[0].length : 0
  const tw = wordW(text)
  return Math.max(10, 2 + 2 * t.pad + iw + (iw && tw ? t.ig : 0) + tw)
}

/** The widest integer t (at most `cap`) to which the narrower keys may grow and all still fit `room`. */
function level(nat, room, cap) {
  for (let t = cap; t > 0; t--) if (nat.reduce((s, n) => s + Math.max(n, t), 0) <= room) return t
  return 0
}

/**
 * The menu row: `keys` [{ id, label, short, icon, isOn, isRepeatable, isBusy, isSwitch, isHidden, isIcon }], `width` CSS px
 * wide, `pressed` the id held down, `joined` when the strip or another deck sits flush under it, `under` when it sits
 * flush under another.
 * `prompt`: the question an amber LED asks at the row's left (the Month's export row), left out where the keys would not
 * fit beside it. Returns its SVG `source`, its size (`W` × `H` units, `px` × `h` CSS px), `alt`, its `zones` ({ id, x, w }
 * in units, every key a click goes to), `still` ({ x, w }: a lit key that may not be pressed again and a busy one, drawn
 * and going nowhere, which zoneAt weighs a cell's span against), and the ladder's `tier`.
 */
export function renderMenu({ keys = [], width = 640, pressed = null, joined = false, under = false, prompt = '' } = {}) {
  const px = Math.min(MAX_PX, Math.max(240, Math.round(Number(width) || 640)))
  const W = Math.round(px / 2)
  const h = Math.round((H * px) / W)
  const list = (Array.isArray(keys) ? keys : []).filter((k) => k && typeof k.id === 'string' && typeof k.label === 'string')
  const full = W - 2 * (PAD + 1)
  // the keys that stand apart line up at the right end, two gaps more before the first of them
  const apart = list.length > 1 ? list.flatMap((k, i) => (isApart(k) ? [i] : [])) : []
  const isOff = (i) => apart.includes(i)
  const gaps = (g) => g * Math.max(0, list.length - 1) + (apart.length ? g * 2 : 0)
  const fits = (l, room) => list.reduce((s, k) => s + natural(k, l), 0) + gaps(l.gap) <= room

  // the LED and a gap take their room first, in the tiers that keep the keys' words; else it goes
  const asks = String(prompt ?? '').toUpperCase().slice(0, 24)
  const lw = asks ? ledW(asks) : 0
  const withLed = asks ? LADDER.slice(0, 4).find((l) => fits(l, full - lw - l.gap * 2)) : undefined
  const t = withLed ?? LADDER.find((l) => fits(l, full)) ?? LADDER[LADDER.length - 1]
  const ledX = PAD + 1
  const inner = withLed ? full - lw - t.gap * 2 : full
  const left = withLed ? ledX + lw + t.gap * 2 : PAD + 1
  const nat = list.map((k) => natural(k, t))
  // the narrower keys grow toward the widest (never past the tier's cap; a key apart keeps its own), then the gaps a
  // little, then the row centers (or, with keys apart at the right end, leaves the room between them)
  const room = inner - gaps(t.gap)
  const grows = nat.filter((n, i) => !isOff(i))
  const fixed = apart.reduce((s, i) => s + nat[i], 0)
  const tw = level(grows, room - fixed, Math.min(t.cap, Math.max(...grows, 0)))
  const ws = nat.map((n, i) => (isOff(i) ? n : Math.max(n, tw)))
  const used = ws.reduce((s, w) => s + w, 0)
  const slots = Math.max(1, list.length - 1)
  const gap = list.length > 1 ? Math.min(t.gap + (apart.length ? 1 : 3), t.gap + Math.floor((room - used) / slots)) : t.gap
  const span = used + gap * (list.length - 1)

  const layer = { glow: [], body: [], ink: [], busy: [], led: [] }
  const words = { ink: [], busy: [] }
  const rects = layer.body
  const zones = []
  const still = []

  // the plate's light along its top, its shade along its foot (the seam between two decks, where they meet), a brass
  // rivet at each end, at the strip's
  rects.push([under ? 0 : 3, 0, under ? W : W - 6, 1, C.plateHi], [joined ? 0 : 3, H - 1, joined ? W : W - 6, 1, C.plateLo])
  for (const rx of [2, W - 4]) rects.push([rx, 8, 2, 2, C.rivet], [rx, 8, 1, 1, C.rivetHi], [rx + 1, 9, 1, 1, C.rivetLo])

  // the question on its LED, amber on dark glass as the strip's, a faint glow under the words
  if (withLed) {
    rects.push([ledX, KY, lw, 16, C.edge], [ledX + 1, KY + 1, lw - 2, 14, C.led], [ledX + 1, KY + 1, lw - 2, 1, C.ledRim])
    layer.led.push([ledX + 3, KY + 4, lw - 6, 8, C.amberGhost])
    words.ink.push(word(asks, ledX + lw / 2, KY + 10.3, LED_SIZE, C.amber, 'middle'))
    still.push({ x: ledX, w: lw })
  }

  // the keys left to right, centered as a row (beside the LED: from it); the keys apart at the right end, as NOW is on
  // the strip, the last of them at the edge
  let x = left + (apart.length || withLed ? 0 : Math.max(0, Math.floor((inner - span) / 2)))
  const xs = list.map((k, i) => {
    if (isOff(i)) return W - PAD - 1 - apart.slice(apart.indexOf(i)).reduce((s, j) => s + ws[j], 0) - gap * (apart.length - 1 - apart.indexOf(i))
    const at = x
    x += ws[i] + gap
    return at
  })

  list.forEach((k, i) => {
    // a hidden key holds its room, and that is all
    if (k.isHidden) return
    const kx = xs[i]
    const w = ws[i]
    const goes = (!k.isOn || k.isRepeatable === true || isSwitch(k)) && !k.isBusy
    if (goes) zones.push({ id: k.id, x: kx, w })
    else still.push({ x: kx, w })
    const isDown = goes && pressed === k.id
    const look = k.isOn ? 'lit' : isAction(k) ? 'action' : 'cap'
    const [fc, hi, lo, ink, accent] = {
      lit: [C.lit, C.litHi, LIT_LO, C.litInk, C.litAccent],
      action: [isDown ? C.nowDown : C.now, C.nowHi, C.nowLo, C.nowInk, C.nowInk],
      cap: [isDown ? C.capDown : C.cap, C.capHi, C.capLo, C.ink, C.accent],
    }[look]
    const dy = isDown ? 2 : 0
    // the lit key glows on the plate around it (its own layer, under every body: a paint lays fills in first-use order)
    if (k.isOn) layer.glow.push([kx - 1, KY - 1, w + 2, 18, C.glow])
    // the dark rim around the cap and its side, then the face, sunk 2 when held down
    rects.push([kx + 1, KY, w - 2, 16, C.edge], [kx, KY + 1, w, 14, C.edge], [kx + 1, KY + 1 + dy, w - 2, 12, fc])
    if (!isDown) rects.push([kx + 1, KY + 13, w - 2, 2, lo], [kx + 2, KY + 1, w - 4, 1, hi])
    // its icon and words, centered on the face; a busy key's blink
    const { icon, text } = face(k, t)
    const iw = icon ? icon[0].length : 0
    const tw = wordW(text)
    const cw = iw + (iw && text ? t.ig : 0) + tw
    const cx = kx + Math.floor((w - cw) / 2)
    const to = k.isBusy ? layer.busy : layer.ink
    if (icon) to.push(...bitmap(icon, cx, KY + 1 + dy + Math.floor((12 - icon.length) / 2), ink, accent))
    // the word on the face's middle line, its baseline a third of its size under it
    if (text) (k.isBusy ? words.busy : words.ink).push(word(text, cx + (iw ? iw + t.ig : 0), KY + 9.3 + dy, SIZE, ink))
  })

  const shown = list.filter((k) => !k.isHidden)
  const on = shown.find((k) => k.isOn && !isSwitch(k))
  const rest = shown.filter((k) => !k.isOn && !isSwitch(k)).map((k) => `${k.label}${k.isBusy ? ' (still working)' : ''}`)
  const named = rest.length > 1 ? `${rest.slice(0, -1).join(', ')} and ${rest[rest.length - 1]}` : rest[0] ?? ''
  const switches = shown.filter(isSwitch).map((k) => `; ${k.label} ${k.isOn ? 'on' : 'off'}`).join('')
  const lead = asks ? `${asks.charAt(0)}${asks.slice(1).toLowerCase()}: ` : ''
  const alt = asks ? `${lead}${shown.map((k) => `${k.label}${k.isBusy ? ' (still working)' : ''}`).join(', ')}.`
    : `${on ? `${on.label} on screen` : 'Nothing picked'}${named ? `; the other keys: ${named}` : ''}${switches}.`

  const plate = joined || under ? plateShape(W, H, { isOnTop: joined && !under, isUnder: under && !joined }) : null
  const shape = plate
    ? `<path fill="${C.plate}" d="${plate.d}" shape-rendering="geometricPrecision"/>`
    : `<rect width="${W}" height="${H}" rx="5" fill="${C.plate}" shape-rendering="geometricPrecision"/>`
  const rim = plate ? `<path d="${plate.rim}" ` : `<rect x=".25" y=".25" width="${W - 0.5}" height="${H - 0.5}" rx="4.75" `
  const type = (list) => typeGroup(list.join(''))
  const blink = layer.busy.length || words.busy.length
    ? `<g>${paint(layer.busy)}${type(words.busy)}<set id="Mnblink" attributeName="opacity" to=".3" dur="0.5s" begin="0s;Mnblink.end+0.5s"/></g>`
    : ''
  // a deck with another under it hangs from its foot: drawn narrower than asked, its sliver falls above it
  const anchor = joined ? 'xMidYMax' : 'xMidYMin'
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${h}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="${anchor} meet" ` +
    `shape-rendering="crispEdges" role="img" aria-label="${esc(alt)}"><title>${esc(alt)}</title>` +
    `${shape}${paint(layer.glow)}${paint(rects)}${paint(layer.led)}${paint(layer.ink)}${type(words.ink)}${blink}` +
    `${rim}fill="none" stroke="#fff" stroke-opacity=".2" stroke-width=".5" shape-rendering="geometricPrecision"/></svg>`
  return { source, W, H, px, h, alt, zones, still, tier: t.tier }
}
