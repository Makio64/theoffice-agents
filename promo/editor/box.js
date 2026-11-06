// The story's text box, as a role-playing game draws it: a dark board in a pixel frame (an ink edge with its corners
// cut, a cream rule, the sign's board inside), two lines of pixel type typed in letter by letter, and a ▼ blinking at
// its corner once the page is done. A caption with `box: true` is one (promo/boards.mjs), drawn the same by the
// storyboard sheets, the editor's preview and the export, which lays a blip under every letter typed (export.mjs).
// It sits over the bottom of Instagram's safe zone (promo/boards.mjs SAFE), out of the transitions: it stays steady
// through a cut while its pages change.

// 1030 × 210 in 5-px pixels (the type's own: Press Start 2P draws 8 pixels an em, at 40 px), its foot at 1475 (a caption's
// `top` moves it: a cut with no safe zone to keep)
export const BOX = { x: 25, y: 1265, w: 1030, h: 210, px: 5, font: 40, line: 60 }
// typed from `at` (seconds of the shot) at `cps` letters a second, spaces included
export const TYPE = { at: 0.15, cps: 36 }
export const INK = { edge: '#0b0a09', rule: '#ece2cd', board: '#1f1a16', lit: '#2e2721', text: '#ece2cd', key: '#ffd23f' }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const rects = (list, fill, op) => list.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}/>`).join('')

/**
 * A frame `w` × `h` px in `px`-px pixels: a shadow a pixel down and right, the ink edge, the cream rule, the board
 * (`board`, the sign's own by default). The box's, and the story's install console's (promo/boards.mjs).
 */
export function frameSvg(w, h, px = BOX.px, board = INK.board) {
  const W = w / px, H = h / px
  return `<svg viewBox="0 0 ${W} ${H}" width="${w}" height="${h}" overflow="visible" shape-rendering="crispEdges" style="position:absolute;left:0;top:0">` +
    rects([[2, H, W - 2, 1], [W, 2, 1, H - 2]], '#000', '.45') +
    rects([[1, 0, W - 2, H], [0, 1, W, H - 2]], INK.edge) + rects([[2, 1, W - 4, H - 2], [1, 2, W - 2, H - 4]], INK.rule) +
    rects([[2, 2, W - 4, H - 4]], INK.edge) + rects([[3, 3, W - 6, H - 6]], board) + rects([[3, 3, W - 6, 1]], INK.lit) + '</svg>'
}
const frame = () => frameSvg(BOX.w, BOX.h)

// the ▼, 7 pixels across, bobbing a pixel as it blinks
const MORE = `<svg viewBox="0 0 7 5" width="35" height="25" shape-rendering="crispEdges">${rects([[0, 0, 7, 1], [1, 1, 5, 1], [2, 2, 3, 1], [3, 3, 1, 1]], INK.key)}${rects([[1, 4, 5, 1]], '#000', '.4')}</svg>`

/** The caption's letters: [{ ch, key, at }] in order (`*word*` lit, a new line a break), each with the time it is typed. */
export function letters(c) {
  const at = c.at ?? TYPE.at, cps = c.cps ?? TYPE.cps
  const out = []
  let key = false
  for (const ch of String(c.text)) {
    if (ch === '*') key = !key
    else if (ch === '\n') out.push({ ch, key, at: null })
    else out.push({ ch, key, at: at + out.filter((l) => l.at != null).length / cps })
  }
  return out
}
/** When the page is done: its last letter typed. */
export const doneAt = (c) => {
  const ls = letters(c).filter((l) => l.at != null)
  return ls.length ? ls.at(-1).at + 1 / (c.cps ?? TYPE.cps) : c.at ?? TYPE.at
}

/**
 * The box with caption `c`'s page in it: every letter its own <span>, shown as the player types it (data-reveal "from,
 * letters a second"), so the lines are laid out from the start and nothing jumps as they fill; the ▼ from the end.
 * `c.fx` an entrance (the first page's).
 */
export function boxHtml(c) {
  const at = c.at ?? TYPE.at, cps = c.cps ?? TYPE.cps, done = doneAt(c)
  const text = letters(c).map((l) => (l.ch === '\n' ? '<br>' : `<span${l.key ? ` style="color:${INK.key}"` : ''}>${l.ch === ' ' ? '&nbsp;' : esc(l.ch)}</span>`)).join('')
  const pad = 7 * BOX.px
  // a later page of the shot: shown from `show` to `hide` (seconds of the shot), over the one before it
  const span = c.show != null || c.hide != null ? ` data-show="${c.show ?? -1}"${c.hide != null ? ` data-hide="${c.hide}"` : ''}` : ''
  return `<div class="bx"${c.fx ? ` data-fx="${c.fx}"` : ''}${span} style="position:absolute;left:${BOX.x}px;top:${c.top ?? BOX.y}px;width:${BOX.w}px;height:${BOX.h}px">${frame()}` +
    `<div data-reveal="${at},${cps}" style="position:absolute;left:${pad}px;right:${pad}px;top:${(BOX.h - 2 * BOX.line) / 2}px;font:${BOX.font}px/${BOX.line}px 'Press Start 2P',monospace;` +
    `color:${INK.text};white-space:nowrap;-webkit-font-smoothing:none">${text}</div>` +
    `<div data-show="${done}" data-blink="${done},0.6" style="position:absolute;right:${6 * BOX.px}px;bottom:${5 * BOX.px}px;line-height:0">${MORE}</div></div>`
}

// A stat card (a caption with `card: true`): what the office says about whoever is on screen, as a small label in the
// box's frame popping in on the beat: a name in its own color over a line of numbers, or a month and its hours. At
// (x, y) in the frame; `big` for a heading-sized card.
const CARD = { px: 4, font: 24, line: 36, pad: 18 }
/** The card's markup, popping in at `at` (a stepped overshoot, promo/editor/player.js). */
export function cardHtml(c) {
  // a big card's type at 32 px, 4 px a pixel of it, as crisp as the box's
  const font = c.big ? 32 : CARD.font, line = c.big ? 48 : CARD.line, px = CARD.px
  const row = (text, color, size) => `<div style="color:${color};font-size:${size}px;line-height:${line}px;white-space:nowrap">${esc(text)}</div>`
  return `<div${c.at != null ? ` data-fx="pop:${c.at}:0.25"` : ''} style="position:absolute;left:${c.x}px;top:${c.y}px;padding:${CARD.pad - 6}px ${CARD.pad}px;` +
    `background:${INK.board};border:${px}px solid ${INK.rule};box-shadow:0 0 0 ${px}px ${INK.edge},${2 * px}px ${2 * px}px 0 ${px}px rgba(0,0,0,.45);` +
    `font-family:'Press Start 2P',monospace;-webkit-font-smoothing:none">` +
    `${row(c.title, c.color ?? INK.key, font)}${c.text ? row(c.text, INK.text, Math.round(font * 0.84)) : ''}</div>`
}

// A running clock (a caption with `clock: true`): the day's time in a small plate in the box's frame, never popping, its
// minutes running on at `rate` a second of the video from `from` (minutes since midnight at the shot's start), shown
// in `step`-minute ticks, its colon blinking each second, so the time is seen to pass at an even pace across the cuts
// (the player writes it each frame: data-clock, promo/editor/player.js). At (x, y) in the frame.
export const clockText = (minutes, day = '', on = true) => {
  const m = ((Math.floor(minutes) % 1440) + 1440) % 1440
  const hh = String(Math.floor(m / 60)).padStart(2, '0'), mm = String(m % 60).padStart(2, '0')
  return `${day ? `<span style="color:${INK.rule};opacity:.7">${esc(day)}</span> ` : ''}${hh}<span${on ? '' : ' style="visibility:hidden"'}>:</span>${mm}`
}
export function clockHtml(c) {
  const px = 3
  return `<div data-clock="${c.from},${c.rate},${c.step ?? 5}" data-day="${esc(c.day ?? '')}" style="position:absolute;left:${c.x}px;top:${c.y}px;padding:6px 12px;` +
    `background:${INK.board};border:${px}px solid ${INK.rule};box-shadow:0 0 0 ${px}px ${INK.edge},${2 * px}px ${2 * px}px 0 ${px}px rgba(0,0,0,.45);` +
    `font:24px/32px 'Press Start 2P',monospace;color:${INK.key};-webkit-font-smoothing:none;white-space:nowrap">` +
    `${clockText(Math.floor(c.from / (c.step ?? 5)) * (c.step ?? 5), c.day)}</div>`
}
