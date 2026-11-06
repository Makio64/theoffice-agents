// PURE: the strip that pages a tab through the past, as the desktop pane draws it above the tab's drawing (the surface
// module hooks/period.tsx): one dark plate with brass rivets, chunky pixel keys (◀ older, ▶ newer, Now back to the
// range as it runs now), an amber LED that names the page, and between them a row of windows, the page's ruler
// (period.mjs pageTicks: the days of its week, the weeks of its month, the months of its year), its own window lit,
// the ones yet to come shuttered, a click on any other going there; « and » at the ruler's ends leap a week of days,
// four weeks or a year of months (period.mjs pageLeap). The ruler keeps its slots from page to page (a month with four
// Mondays leaves its fifth empty), so a key stays under the pointer however often it is pressed. As
// the pane narrows the ruler goes first, then the leaps, then the LED's long words. The drawing hands back its hit zones
// in its own units, so the module tells which key a click fell on from the pointer's cell alone. Its words (the LED's,
// the windows' marks, Now) are the console's type, text that stays sharp at the pane's scale, as the menu's are. Under
// the menu of tabs (lib/svg-menu.mjs, `joined`) its top corners are square, so the two decks meet flush as one
// console. It imports period.mjs and the console's parts (lib/svg-console.mjs) and nothing else: the desktop ships a
// surface module and all it imports to the page that draws it, so this stays small. Drawn as an image (no frame, the
// pointer reaches the module), its only motion is the LED blinking while the page it names is read: one <set> that
// begins again, which keeps no frame loop running (lib/svg-beat.mjs says why no <animate> may). The Month's strip has
// one key more at its right end, past NOW: Export, a download into a tray, lit while the row that asks what to export
// hangs under the strip (its foot then square, `hangs`), its tray blinking while an export runs.
import { pageBack, pageLeap, pageTicks } from './period.mjs'
import { C, TYPE, bitmap, esc, paint, plateShape, typeGroup, word } from './svg-console.mjs'

// the zone a click falls on, as the menu's (lib/svg-console.mjs)
export { zoneAt } from './svg-console.mjs'

/** Art units are 2 CSS px, as in every scene (lib/svg.mjs); the strip is H units tall. */
const H = 20
const PAD = 5
const GAP = 3
const KEY = 14
const LEAP = 12
const NOW_W = 25
/** The Month's Export key, past NOW. */
const EXPORT_W = 15
/** The lit key's lip (the menu's), a shade under its yellow face. */
const LIT_LO = '#bf9a35'
const WIN = { day: 11, week: 17, month: 11 }
/** The ruler's slots: a week's days, the most Mondays a month has, a year's months. */
const SLOTS = { day: 7, week: 5, month: 12 }
const WIN_GAP = 2
/** The widest an Svg is drawn: the desktop refuses a tree past it, which unmounts the strip. */
const MAX_PX = 4096

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const NOW_WORDS = { day: 'TODAY', week: 'LAST 7 DAYS' }
/**
 * How many characters the LED holds for each unit, in full and short (ledLabel): its longest name, so it keeps its
 * width from page to page (WED 31 DEC 2025, 28 SEP-4 OCT 2025, SEPTEMBER 2026; 31 DEC 2025, 28 SEP-4 OCT). The month's
 * short LED keeps the 12 its LAST 30 DAYS took, so the strip drops its ruler at the widths it always did.
 */
export const LED_CHARS = { day: { full: 15, short: 11 }, week: { full: 17, short: 12 }, month: { full: 14, short: 12 } }

// the keys' faces, '#' in the key's ink
const ARROW = {
  older: ['....#', '...##', '..###', '.####', '..###', '...##', '....#'],
  newer: ['#....', '##...', '###..', '####.', '###..', '##...', '#....'],
  leapOlder: ['..#...#', '.##..##', '###.###', '.##..##', '..#...#'],
  leapNewer: ['#...#..', '##..##.', '###.###', '##..##.', '#...#..'],
  // down into the tray (lib/svg-menu.mjs's export icon)
  export: ['...###...', '...###...', '...###...', '.#######.', '..#####..', '...###...', '#...#...#', '#.......#', '#########'],
}

const ledChars = (unit, short) => LED_CHARS[unit][short ? 'short' : 'full']
/** The LED's words, and the windows' and NOW's, in the console's type (lib/svg-console.mjs TYPE), units tall. */
const LED_SIZE = 7.5
const MARK_SIZE = 6.5
/** The LED's width for `chars` characters: its words and its rim. */
const ledWidth = (chars) => Math.ceil(chars * LED_SIZE * TYPE.advance) + 12
/**
 * The words the LED shows for a name ledLabel says in capitals: in title case as the tabs are (October 2026, Last 7
 * days, Oct → Now, Fri 30 Oct), a range with an en dash (28 Sep–4 Oct).
 */
export function ledWords(label) {
  return label.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/ Days$/, ' days').replace(/(\w)-(\w)/g, '$1–$2')
}

const parts = (day) => day.split('-').map(Number)
const shift = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/**
 * What the LED says for a page: page 0 by what it is now (TODAY, LAST 7 DAYS, OCT → NOW), the others by their dates,
 * in capitals: YESTERDAY, SAT 31 OCT, 19-25 OCT, 28 SEP-4 OCT, AUGUST 2026, with the year when it is not `today`'s
 * (a month always has it). `short` drops a day's weekday, a week's year, and spells a month in three letters.
 */
export function ledLabel(unit, back, today, short = false) {
  const n = pageBack(back)
  if (n === 0) return unit === 'month' ? `${MONTHS[(parts(today)[1] + 10) % 12].slice(0, 3)} → NOW` : NOW_WORDS[unit] ?? NOW_WORDS.day
  const [ty] = parts(today)
  const year = (day) => (parts(day)[0] === ty ? '' : ` ${parts(day)[0]}`)
  const dm = (day) => `${parts(day)[2]} ${MONTHS[parts(day)[1] - 1].slice(0, 3)}`
  if (unit === 'week') {
    const mon = shift(monday(today), -7 * n)
    const sun = shift(mon, 6)
    const from = parts(mon)[1] === parts(sun)[1] ? String(parts(mon)[2]) : dm(mon)
    return `${from}-${dm(sun)}${short ? '' : year(sun)}`
  }
  if (unit === 'month') {
    const [y, m] = parts(today)
    const first = new Date(Date.UTC(y, m - 1 - n, 1))
    const name = MONTHS[first.getUTCMonth()]
    return `${short ? name.slice(0, 3) : name} ${first.getUTCFullYear()}`
  }
  if (n === 1 && !short) return 'YESTERDAY'
  const day = shift(today, -n)
  const name = `${dm(day)}${year(day)}`
  return short ? name : `${DAYS[new Date(Date.parse(`${day}T00:00:00Z`)).getUTCDay()]} ${name}`
}

/** Monday of a day's week. */
function monday(day) {
  return shift(day, -((new Date(Date.parse(`${day}T00:00:00Z`)).getUTCDay() + 6) % 7))
}

/**
 * A key into `layer`: its cap (cream, or dark when it does nothing) raised or pressed into `layer.body`, its glyph into
 * `layer.ink`, which is painted after every body (a paint lays its colors in order of first use).
 */
function keyRects(layer, x, y, w, glyph, { isOff = false, isDown = false, look = 'cap', ink: inkTo = layer.ink } = {}) {
  const [face, hi, lo, ink] = isOff ? [C.off, C.off, C.offLo, C.offInk]
    : look === 'now' ? [C.now, C.nowHi, C.nowLo, C.nowInk] : look === 'lit' ? [C.lit, C.litHi, LIT_LO, C.litInk]
      : [isDown ? C.capDown : C.cap, C.capHi, C.capLo, C.ink]
  const h = 13
  const dy = isDown ? 2 : 0
  // the dark rim around the cap and its side, then the face, sunk 2 when pressed
  layer.body.push([x + 1, y, w - 2, h + 3, C.edge], [x, y + 1, w, h + 1, C.edge], [x + 1, y + 1 + dy, w - 2, h - 1, face])
  if (!isDown) layer.body.push([x + 1, y + h, w - 2, 2, lo], [x + 2, y + 1, w - 4, 1, hi]) // its side below, its lit top edge
  if (glyph.length) inkTo.push(...bitmap(glyph, x + Math.floor((w - glyph[0].length) / 2), y + 1 + dy + Math.floor((h - 1 - glyph.length) / 2), ink))
}

/** A ruler window into `layer`: lit (the page on screen, or pressed), glass with its mark (a page to go to), shuttered (yet to come). */
function windowRects(layer, x, y, w, mark, { isOn, isFuture, isDown }) {
  const h = 13
  layer.body.push([x, y, w, h, C.edge], [x - 1, y + h, w + 2, 1, C.sill])
  if (isFuture) {
    layer.body.push([x + 1, y + 1, w - 2, h - 2, C.shut])
    for (let sy = y + 2; sy < y + h - 1; sy += 2) layer.body.push([x + 1, sy, w - 2, 1, C.slat])
    return
  }
  const isLit = isOn || isDown
  layer.body.push([x + 1, y + 1, w - 2, h - 2, isLit ? C.lit : C.glass], [x + 1, y + 1, w - 2, 1, isLit ? C.litHi : C.glassHi])
  layer.words.push(word(mark, x + w / 2, y + 9, MARK_SIZE, isLit ? C.litInk : C.mark, 'middle'))
}

/** The widths a layout takes: which of the ruler, the leaps and the long LED words it keeps, and the Export key. */
function layoutWidth(unit, { ruler, leaps, short }, exports = false) {
  const led = ledWidth(ledChars(unit, short))
  let w = PAD + KEY + GAP + led + GAP + KEY + GAP * 3 + NOW_W + PAD + (exports ? GAP + EXPORT_W : 0)
  if (leaps) w += 2 * (LEAP + GAP)
  if (ruler) w += SLOTS[unit] * (WIN[unit] + WIN_GAP) - WIN_GAP + GAP * 2
  return w
}

/**
 * The strip of `unit` ('day', 'week' or 'month') on page `back` (0: the range as it runs now) of the calendar of `today`
 * (YYYY-MM-DD), `width` CSS px wide. `busy`: the page named is being read, and its LED blinks. `pressed`: the id of the
 * zone held down, drawn pressed. `joined`: the menu of tabs sits on it, so its top corners are square. Returns its SVG `source`, its size (`W` units across, `px` × `h` CSS px), what it says
 * to a reader that cannot see it (`alt`), and its `zones`: `{ id, x, w, back, step }` in units, every key or window a
 * click may go to (none for the page on screen, a window yet to come, or ▶ and NOW on page 0). `back` is the page it
 * goes to from this one; a key that turns pages (◀ ▶ « ») also says by how many (`step`, older positive), so a click
 * counts from the page on screen when it lands, not from the one this drawing shows. `still`: what is drawn and goes
 * nowhere, `{ x, w }` in units, which zoneAt weighs a cell's span against.
 * `exporter` (the Month's): its Export key past NOW, 'idle', 'open' (lit: the row asking what to export hangs under it,
 * and a press closes it) or 'busy' (an export runs: its tray blinks, and it goes nowhere); its zone `{ id: 'export',
 * act: 'export' }`. `hangs`: a deck hangs under the strip, so its foot is square too.
 */
export function renderPeriod({ unit = 'day', back = 0, today, width = 640, busy = false, pressed = null, joined = false, exporter = null, hangs = false } = {}) {
  const u = unit === 'week' || unit === 'month' ? unit : 'day'
  const n = pageBack(back)
  const px = Math.min(MAX_PX, Math.max(240, Math.round(Number(width) || 640)))
  const W = Math.round(px / 2)
  const h = Math.round((H * px) / W)
  const ticks = pageTicks(u, n, today)
  const leap = pageLeap(u)
  const exports = exporter === 'idle' || exporter === 'open' || exporter === 'busy'
  const layout = [{ ruler: true, leaps: true }, { ruler: false, leaps: true }, { ruler: false, leaps: false }, { ruler: false, leaps: false, short: true }]
    .find((l) => layoutWidth(u, l, exports) <= W) ?? { ruler: false, leaps: false, short: true }
  const label = ledLabel(u, n, today, layout.short)
  const zones = []
  // what is drawn and goes nowhere (the LED, the page's own window, those yet to come, a key with nowhere to go from
  // here): a cell astride one of them and a key falls to whichever it covers more (zoneAt)
  const still = []
  const layer = { body: [], ink: [], words: [], busy: [] }
  const rects = layer.body
  const zone = (id, x, w, to, step) => {
    if (to !== n) zones.push({ id, x, w, back: to, ...(step ? { step } : {}) })
    else still.push({ x, w })
    return pressed === id && to !== n
  }

  // the plate: lit along its top, shaded along its foot, a brass rivet at each end
  rects.push([0, 0, W, H, C.plate], [0, 0, W, 1, C.plateHi], [0, H - 1, W, 1, C.plateLo])
  for (const rx of [2, W - 4]) rects.push([rx, 9, 2, 2, C.rivet], [rx, 9, 1, 1, C.rivetHi], [rx + 1, 10, 1, 1, C.rivetLo])

  let x = PAD + 1
  const ky = 2
  const key = (id, w, glyph, step) => {
    const to = Math.max(0, n + step)
    keyRects(layer, x, ky, w, glyph, { isOff: to === n, isDown: zone(id, x, w, to, step) })
    x += w + GAP
  }
  if (layout.leaps && !layout.ruler) key('leap-older', LEAP, ARROW.leapOlder, leap)
  key('older', KEY, ARROW.older, 1)
  // the LED: its width that of the unit's longest name, the name centered, blinking while it is read
  const lw = ledWidth(ledChars(u, layout.short))
  rects.push([x, 2, lw, 16, C.edge], [x + 1, 3, lw - 2, 14, C.led], [x + 1, 3, lw - 2, 1, C.ledRim])
  still.push({ x, w: lw })
  // its words, amber on the dark glass, a faint glow of the same under them
  const lit = ledWords(label)
  const glow = [[x + 3, 6, lw - 6, 8, C.amberGhost]]
  const text = word(lit, x + lw / 2, 12.7, LED_SIZE, C.amber, 'middle')
  x += lw + GAP
  key('newer', KEY, ARROW.newer, -1)
  if (layout.leaps && !layout.ruler) key('leap-newer', LEAP, ARROW.leapNewer, -leap)

  // Export at the right end (the Month's), NOW at the right end or beside it
  const exportX = W - PAD - 1 - EXPORT_W
  if (exports) {
    const goes = exporter !== 'busy'
    if (goes) zones.push({ id: 'export', x: exportX, w: EXPORT_W, back: n, act: 'export' })
    else still.push({ x: exportX, w: EXPORT_W })
    const isDown = goes && pressed === 'export'
    keyRects(layer, exportX, ky, EXPORT_W, ARROW.export, { look: exporter === 'open' ? 'lit' : 'cap', isDown, ink: goes ? layer.ink : layer.busy })
  }
  const nowX = (exports ? exportX - GAP : W - PAD - 1) - NOW_W
  const nowDown = zone('now', nowX, NOW_W, 0)
  keyRects(layer, nowX, ky, NOW_W, [], { look: 'now', isOff: n === 0, isDown: nowDown })
  layer.words.push(word('Now', nowX + NOW_W / 2, ky + 9.3 + (nowDown ? 2 : 0), MARK_SIZE, n === 0 ? C.offInk : C.nowInk, 'middle'))

  // the ruler, centered between the LED's keys and NOW, the leaps at its ends
  if (layout.ruler) {
    const ww = WIN[u]
    const row = SLOTS[u] * (ww + WIN_GAP) - WIN_GAP
    const span = 2 * (LEAP + GAP) + row
    const left = x + GAP
    x = Math.max(left, Math.round(left + (nowX - GAP * 2 - left - span) / 2))
    key('leap-older', LEAP, ARROW.leapOlder, leap)
    const rowX = x
    ticks.forEach((t, i) => {
      const isDown = !t.isFuture && zone(`tick-${i}`, x, ww, t.back)
      if (t.isFuture) still.push({ x, w: ww })
      windowRects(layer, x, 2, ww, t.mark, { isOn: t.isOn, isFuture: t.isFuture, isDown })
      x += ww + WIN_GAP
    })
    x = rowX + row + GAP
    key('leap-newer', LEAP, ARROW.leapNewer, -leap)
  }

  // the card: rounded at every corner, or only at its foot under the menu, or only at its top over a deck (svg-console
  // plateShape), or square between two, its rim then its sides alone
  const plate = joined !== hangs ? plateShape(W, H, { isUnder: joined, isOnTop: hangs }) : null
  const card = joined && hangs
    ? { clip: `<rect width="${W}" height="${H}"/>`, rim: `<path d="M.25 0V${H}M${W - 0.25} 0V${H}" ` }
    : plate
      ? { clip: `<path d="${plate.d}" shape-rendering="geometricPrecision"/>`, rim: `<path d="${plate.rim}" ` }
      : { clip: `<rect width="${W}" height="${H}" rx="5" shape-rendering="geometricPrecision"/>`, rim: `<rect x=".25" y=".25" width="${W - 0.5}" height="${H - 0.5}" rx="4.75" ` }
  // over a deck, the plate runs on under its foot: drawn a little narrower than asked, the strip leaves a sliver of its
  // box below it, which is then plate, never a seam of page between the two (outside the viewBox, it shows only there)
  const under = hangs ? `<path fill="${C.plate}" d="M0 ${H}h${W}v2h${-W}z"/>` : ''
  const blink = busy ? '<set id="Pdblink" attributeName="opacity" to=".3" dur="0.5s" begin="0s;Pdblink.end+0.5s"/>' : ''
  const tray = layer.busy.length ? `<g>${paint(layer.busy)}<set id="Pdxblink" attributeName="opacity" to=".3" dur="0.5s" begin="0s;Pdxblink.end+0.5s"/></g>` : ''
  const exportWords = !exports ? '' : exporter === 'busy' ? ', and Export (still working)' : exporter === 'open' ? ', and Export (open)' : ' and Export'
  const alt = `Pages of the past: ${label.toLowerCase()} on screen${busy ? ', being read' : ''}. Older, newer${layout.ruler ? ', its ruler' : ''}` +
    `${exports ? ', now' : ' and now'}${exportWords}.`
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${h}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin meet" ` +
    `shape-rendering="crispEdges" role="img" aria-label="${esc(alt)}"><title>${esc(alt)}</title>` +
    `<clipPath id="pd-card">${card.clip}</clipPath>${under}` +
    `<g clip-path="url(#pd-card)">${paint(rects)}${paint(layer.ink)}${tray}${paint(glow)}${typeGroup(`<g>${text}${blink}</g>${layer.words.join('')}`)}</g>` +
    `${card.rim}fill="none" stroke="#fff" stroke-opacity=".2" stroke-width=".5" shape-rendering="geometricPrecision"/></svg>`
  return { source, W, H, px, h, alt, label, zones, still }
}
