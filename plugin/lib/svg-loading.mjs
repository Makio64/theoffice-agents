// PURE: the room a tab shows while its facts are read for the first time (the desktop pane's wait: the Month's two months
// on a new machine take a minute or two): the archive, Clawd at a desk reading, a wall calendar whose days light up one
// by one as they would be read, a filing cabinet with a drawer going in and out, a stack of crates of sessions with one
// carried to the desk, and the windows of the building's hour. It says nothing of how far the read is (the pane writes that under it, in text, which changes
// without reloading the drawing): it is the same drawing for the whole wait, so the frame it plays in never reloads. No
// node:* imports (the desktop mod hooks module imports svg.mjs, which imports this file).
import { K, PLATE_FONT, PROJECT, ROLE, aO, aT, castFigure, esc, paint, plateParts, r1, use } from './svg-kit.mjs'

/**
 * What each read shows: its nameplate, its calendar's head, its days (cells of `cols` across) and how it is said to a
 * reader that cannot see it. `past` is a page of the past, a page far back read from the transcripts once.
 */
const KINDS = {
  month: { plate: 'READING THE MONTH', head: '2 MONTHS', cells: 35, cols: 7, what: 'last month and this one' },
  week: { plate: 'READING THE WEEK', head: '7 DAYS', cells: 7, cols: 7, what: 'the last 7 days' },
  today: { plate: 'READING TODAY', head: 'TODAY', cells: 24, cols: 8, what: "today's hours" },
  past: { plate: 'READING THE ARCHIVE', head: 'THE PAST', cells: 30, cols: 7, what: 'a page of the past' },
}
/** The room's height, in art units: wall, chair rail, floor slab. */
const H = 96
const FLOOR = 80
/** How long the calendar's days take to light up, one after another, before it starts over (seconds a day). */
const DAY_S = 0.25

/**
 * The reading room for `kind` ('month', 'week', 'today' or 'past'; anything else reads as the month), ctx.W art units
 * across. Returns { svg, h, alt }.
 */
export function sceneLoading(ctx, kind) {
  const k = KINDS[kind] ?? KINDS.month
  const { W } = ctx
  const rects = [
    [0, 0, W, FLOOR, K.wall], [0, 56, W, FLOOR - 56, K.wallLow], [0, 55, W, 1, K.partHi],
    [0, FLOOR, W, H - FLOOR, K.slab], [0, FLOOR, W, 1, '#fff/.08'], [0, H - 1, W, 1, '#000/.3'],
  ]
  // the nameplate, and the clerestory windows of the building's hour along the top
  const plate = plateParts(6, 5, k.plate, ROLE.accent, Math.max(60, Math.round(W / 2)))
  let s = paint(rects) + paint(plate.rects) + paint(plate.light) + `<g ${PLATE_FONT}>${plate.text}</g>`
  for (let x = W - 26, n = 0; x > plate.w + 16 && n < 6; x -= 28, n++) s += use(ctx, ctx.night ? 'wn' : 'wd', x, 5)
  // the wall calendar, its days lighting up in turn
  const calX = Math.max(10, Math.round(W * 0.08))
  s += calendar(ctx, calX, 20, k)
  // the filing cabinet of the archive, then the desk, Clawd reading at it, thinking dots over the screen
  const deskX = Math.round(Math.max(calX + 86, W * 0.42))
  s += cabinet(ctx, deskX - 30, FLOOR)
  s += desk(ctx, deskX, FLOOR - 36)
  // the crates of sessions beside it, one carried to the desk again and again
  const crateX = deskX + 60
  if (crateX + 30 < W) s += crates(ctx, crateX, FLOOR)
  if (W - 22 > crateX + 34) s += use(ctx, 'plant', W - 22, FLOOR - 12)
  const alt = `Reading ${k.what}: Clawd at the archive desk, the calendar's days lighting up one by one as they are read`
  return { svg: s, h: H, alt }
}

/** The wall calendar at (x, y): its binder, its head, and a grid of days that light up one after another. */
function calendar(ctx, x, y, k) {
  const rows = Math.ceil(k.cells / k.cols)
  const cell = 5
  const w = k.cols * (cell + 1) + 5
  const h = 13 + rows * (cell + 1) + 3
  const frame = [
    [x + Math.floor(w / 2) - 1, y - 3, 2, 3, '#8a7f6a'], [x, y, w, 3, '#5f5a52'], [x, y + 3, w, h - 3, '#f4efe4'], [x + 1, y + h, w, 1, '#000/.3'],
    [x + 1, y + 4, w - 2, 7, '#c0503a'],
  ]
  const days = []
  const lit = []
  const loop = k.cells * DAY_S + 1.5
  for (let i = 0; i < k.cells; i++) {
    const cx = x + 3 + (i % k.cols) * (cell + 1)
    const cy = y + 13 + Math.floor(i / k.cols) * (cell + 1)
    days.push([cx, cy, cell, cell, '#e2dccd'])
    // each day turns green at its turn and stays lit to the end of the loop
    const at = r1(((i + 1) * DAY_S) / loop * 1000) / 1000
    lit.push(ctx.animate
      ? `<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" fill="${ROLE.busy}" opacity="0"><animate attributeName="opacity" values="0;1" ` +
        `keyTimes="0;${at}" dur="${r1(loop)}s" calcMode="discrete" repeatCount="indefinite"/></rect>`
      : '')
  }
  const head = `<text x="${r1(x + w / 2)}" y="${y + 9.5}" text-anchor="middle" font-size="5" font-weight="bold" fill="#fff6ea">${esc(k.head)}</text>`
  return paint(frame) + paint(days) + lit.join('') + head
}

/** The desk at (x, y) (its box 48 × 36, the floor at its foot): the chair, Clawd reading, the desk, its screen and keys. */
function desk(ctx, x, y) {
  const inner = use(ctx, 'chair') + castFigure(ctx, 'claude', 'read', 'loading-reader', 22, 12) + use(ctx, 'desk') + use(ctx, 'plaque') +
    use(ctx, 'mon', 4, 9) + use(ctx, 'kb') + use(ctx, 's-reading', 5, 10) + (ctx.animate ? use(ctx, 'fl0', 5, 10) : '') + use(ctx, 'bt', 38, 2)
  return `<g transform="translate(${x} ${y})" color="${PROJECT[0]}">${inner}</g>`
}

/** A filing cabinet standing at (x, floor), 20 × 40: three drawers, the middle one sliding out and back on a loop. */
function cabinet(ctx, x, floor) {
  const y = floor - 40
  const body = [[x, y, 20, 40, '#5f6b73'], [x, y, 20, 1, '#7d8a93'], [x + 19, y, 1, 40, '#4a545b'], [x + 1, floor, 19, 1, '#000/.35']]
  const drawer = (dy) => [[x + 2, y + dy, 16, 11, '#6e7b84'], [x + 2, y + dy, 16, 1, '#8a979f'], [x + 7, y + dy + 4, 6, 2, '#c9cfd3'], [x + 8, y + dy + 7, 4, 2, '#f4efe4']]
  const slide = [[x + 2, y + 15, 16, 11, '#6e7b84'], [x + 2, y + 15, 16, 1, '#8a979f'], [x + 7, y + 19, 6, 2, '#c9cfd3'], [x + 3, y + 13, 14, 2, '#f4efe4']]
  const out = paint([...body, ...drawer(2), ...drawer(28)]) + paint([[x + 2, y + 15, 16, 11, '#2f363b']])
  if (!ctx.animate) return out + paint(slide)
  return out + `<g>${paint(slide)}${aT(ctx, '0 0;2 1;4 1;4 1;2 1;0 0', 2.4)}</g>`
}

/** A stack of crates at (x, floor) and one carried from its top towards the desk on a loop. */
function crates(ctx, x, floor) {
  let s = use(ctx, 'crate', x, floor - 8) + use(ctx, 'crate', x + 11, floor - 8) + use(ctx, 'crate', x + 22, floor - 8) +
    use(ctx, 'crate', x + 5, floor - 16) + use(ctx, 'crate', x + 16, floor - 16)
  if (!ctx.animate) return s + use(ctx, 'crate', x + 10, floor - 24)
  s += `<g>${use(ctx, 'crate', x + 10, floor - 24)}${aT(ctx, '0 0;-4 -2;-8 -3;-12 -2;-16 0;-16 0', 3)}${aO(ctx, '1;1;1;1;1;0', 3)}</g>`
  return s
}
