// PURE: the parts the pane's console is built of, shared by its two decks: the menu of tabs (lib/svg-menu.mjs) and the
// strip that pages through the past under it (lib/svg-period.mjs). Its colours, its type, a paint that turns rects into
// one <path> per fill, a bitmap's runs as rects, the decks' plates, and the zone a click falls on. It imports
// nothing: the desktop ships a surface module and all it imports to the page that draws it, so this stays small.

/** The console's colours: the dark plate and its brass rivets, cream keycaps, the coral action key, the LED, the windows. */
export const C = {
  plate: '#241c17', plateHi: '#fff/.07', plateLo: '#000/.35', rivet: '#c9a24a', rivetHi: '#f3dc8e', rivetLo: '#7a5d22',
  edge: '#0e0b09', cap: '#e9dfc7', capHi: '#fffaf0', capLo: '#a3967b', capDown: '#d2c5a8', ink: '#2a211b', accent: '#d0603f',
  off: '#4f463b', offLo: '#37302a', offInk: '#2c2620',
  now: '#e07a61', nowHi: '#f5a58f', nowLo: '#9e4a35', nowDown: '#cc6a52', nowInk: '#fff6ea',
  led: '#14100c', ledRim: '#000/.5', amber: '#ff9d5c', amberGhost: '#ff9d5c/.07',
  glass: '#1e2b4a', glassHi: '#2f4370', mark: '#a9bde3', lit: '#f6d860', litHi: '#fff3c0', litInk: '#4a3417', litAccent: '#c0502f',
  glow: '#ffb35c/.2', shut: '#4a3d33', slat: '#3a2f27', sill: '#6b5646',
}

/**
 * The console's words: the drawing's own bold monospace (the building's nameplates, lib/svg.mjs), set as text, not
 * pixels: the pane draws a console image a little narrower than it asks (its slot is a part of a cell narrower), and
 * pixel letters scaled by 0.97 come out uneven, where text stays sharp. Its advance is about 0.6 em in every such
 * font; each word is held to the width it was laid out for (textLength), so the layout never moves with the font.
 */
export const TYPE = { family: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace', advance: 0.6 }
/** A word's width in units at `size`, as the type sets it. */
export const wordW = (s, size) => Math.ceil([...s].length * size * TYPE.advance)
/**
 * A word as text at (x, y), its baseline, `size` units, in `fill`, held to wordW; `anchor` 'middle' centers it on x.
 * Words go in a group of the type's (typeGroup).
 */
export function word(s, x, y, size, fill, anchor = 'start') {
  return `<text x="${r1(x)}" y="${r1(y)}" font-size="${size}" fill="${fill}"${anchor === 'start' ? '' : ` text-anchor="${anchor}"`} ` +
    `textLength="${wordW(s, size)}" lengthAdjust="spacing">${esc(s)}</text>`
}
/** Words in the type: the family, bold, drawn sharp. */
export const typeGroup = (words) => (words ? `<g font-family="${TYPE.family}" font-weight="bold" text-rendering="geometricPrecision">${words}</g>` : '')

export const r1 = (n) => Math.round(n * 10) / 10
/** Fill spec → attributes: '#hex' or '#hex/.5' (with fill-opacity). */
function fillAttr(f) {
  const [hex, op] = f.split('/')
  return ` fill="${hex}"${op ? ` fill-opacity="${op}"` : ''}`
}

/** Rects [x, y, w, h, fill] → one <path> per fill, in first-use order (svg-kit paint, kept here so the console stands alone). */
export function paint(rects) {
  const by = new Map()
  for (const [x, y, w, h, f] of rects) {
    if (!(w > 0 && h > 0)) continue
    by.set(f, (by.get(f) ?? '') + `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}z`)
  }
  let s = ''
  for (const [f, d] of by) s += `<path${fillAttr(f)} d="${d}"/>`
  return s
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (s) => String(s).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/[&<>"']/g, (c) => ESC[c])

/** Rows of a bitmap → rects of its horizontal runs at (x, y): '#' in `fill`, '+' in `accent`. */
export function bitmap(rows, x, y, fill, accent = fill) {
  const out = []
  rows.forEach((row, dy) => {
    for (let dx = 0; dx < row.length;) {
      const ch = row[dx]
      if (ch !== '#' && ch !== '+') { dx++; continue }
      let n = 1
      while (row[dx + n] === ch) n++
      out.push([x + dx, y + dy, n, 1, ch === '#' ? fill : accent])
      dx += n
    }
  })
  return out
}

/**
 * A deck's plate, `W` × `H` units, its corners rounded 5 where it stands alone: the top ones only on a deck sitting on
 * the one under it (`isOnTop`), the bottom ones only on the deck under it (`isUnder`), so the two meet flush as one
 * console. Returns the filled shape (`d`, which clips the deck too) and its hairline rim (`rim`, half a unit in, open
 * where the decks meet).
 */
export function plateShape(W, H, { isOnTop = false, isUnder = false } = {}) {
  const top = !isUnder
  const foot = !isOnTop
  const d = `M0 ${top ? 5 : 0}${top ? 'a5 5 0 0 1 5-5' : ''}H${top ? W - 5 : W}${top ? 'a5 5 0 0 1 5 5' : ''}` +
    `V${foot ? H - 5 : H}${foot ? 'a5 5 0 0 1-5 5' : ''}H${foot ? 5 : 0}${foot ? 'a5 5 0 0 1-5-5' : ''}z`
  const rim = isOnTop
    ? `M.25 ${H}V5a4.75 4.75 0 0 1 4.75-4.75H${W - 5}a4.75 4.75 0 0 1 4.75 4.75V${H}`
    : isUnder
      ? `M.25 0V${H - 5}a4.75 4.75 0 0 0 4.75 4.75H${W - 5}a4.75 4.75 0 0 0 4.75-4.75V0`
      : `M.25 5a4.75 4.75 0 0 1 4.75-4.75H${W - 5}a4.75 4.75 0 0 1 4.75 4.75V${H - 5}a4.75 4.75 0 0 1-4.75 4.75H5a4.75 4.75 0 0 1-4.75-4.75z`
  return { d, rim }
}

/**
 * The zone a click falls on, from where it fell as shares of the row's width (0 at its left edge, 1 at its right), or
 * null. A point `from` falls in the zone that holds it. A span `from`–`to` (the cell under the pointer, all the desktop
 * tells) falls on what it covers most, so a cell astride a key's edge and the plate beside it still presses the key,
 * and one astride a key and something drawn that goes nowhere (`still`) goes to whichever it covers more.
 */
export function zoneAt(row, from, to = from) {
  const a = from * row.W
  const b = to * row.W
  if (b <= a) return row.zones.find((z) => a >= z.x && a < z.x + z.w) ?? null
  let best = null
  let most = 0
  for (const z of [...row.zones, ...(row.still ?? [])]) {
    const over = Math.min(b, z.x + z.w) - Math.max(a, z.x)
    if (over > most) [best, most] = [z, over]
  }
  return best && 'id' in best ? best : null
}
