// The day board's status tags and emotes (promo/boards.mjs `day`): what an agent is doing as a little pixel plate over
// its head, "[THINKING...]", "[EDIT CAPE-RIG.JS]", "[2 FAILED!]", its dots running, and a pop of feeling beside it (a
// "!", a light bulb, a note, a sparkle, a sweat drop). Drawn in art pixels on the 3 × 5 grid of the plugin's own pixel
// type, so they stay crisp at every zoom, on a layer of the scene's size laid over it (its clock the shot's seconds):
// each tag shown from `from` to `to`, popping up two pixels as it comes in, bobbing a pixel each second.

// 3 × 5 glyphs (narrower where the letter allows), a pixel's gap between letters
const G = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'], K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['10001', '11011', '10101', '10001', '10001'], N: ['1001', '1101', '1011', '1001', '1001'], O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'], Q: ['010', '101', '101', '110', '011'], R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'], W: ['10001', '10001', '10101', '11011', '10001'], X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
  0: ['111', '101', '101', '101', '111'], 1: ['01', '11', '01', '01', '01'], 2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '011', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  '[': ['11', '10', '10', '10', '11'], ']': ['11', '01', '01', '01', '11'], '.': ['0', '0', '0', '0', '1'], '!': ['1', '1', '1', '0', '1'],
  '?': ['111', '001', '011', '000', '010'], "'": ['1', '1', '0', '0', '0'], '-': ['00', '00', '11', '00', '00'], ':': ['0', '1', '0', '1', '0'],
  '/': ['001', '001', '010', '100', '100'], '#': ['101', '111', '101', '111', '101'], '+': ['000', '010', '111', '010', '000'],
  ' ': ['0', '0', '0', '0', '0'],
}
const glyph = (ch) => G[ch.toUpperCase()] ?? G[' ']
/** The width in art px of `text` in the tags' type. */
export const textW = (text) => [...text].reduce((a, ch) => a + glyph(ch)[0].length + 1, 0) - 1

// one path per color, a 1-px rect per lit pixel run
const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`
function runs(rows, ox, oy) {
  let d = ''
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      if (row[x] !== '1') { x++; continue }
      let n = 1
      while (row[x + n] === '1') n++
      d += rect(ox + x, oy + y, n, 1)
      x += n
    }
  })
  return d
}
/** `text` at (x, y) (its top-left) as one path's d. */
function typeD(text, x, y) {
  let d = '', cx = x
  for (const ch of text) {
    const g = glyph(ch)
    d += runs(g, cx, y)
    cx += g[0].length + 1
  }
  return d
}

export const INK = { edge: '#0b0a09', board: '#1f1a16', lit: '#3a322b', text: '#ece2cd' }
// the colors a tag's word takes, by what the agent is at
export const HUE = { think: '#c3a6ff', read: '#8fd3dc', edit: '#ffd23f', run: '#7ee787', fail: '#ff6b6b', chat: '#f6c28b', wait: '#ffb86b', ask: '#ff9f43', done: '#7ee787', plain: '#ece2cd' }

const DOT_PERIOD = 1.2
const r2 = (n) => Math.round(n * 100) / 100

/**
 * A tag: `parts` [[text, color], …] on a plate, the middle of its tail's tip at (x, y) (its foot; `below`, its top and
 * the tail pointing up), shown from `from` to `to` seconds. `dots`: "..." after it, running.
 */
function tagSvg({ x, y, parts: words, from, to, dots = false, below = false, dim = false, clamp = [16, 250] }) {
  // in brackets, the dots inside them: [THINKING...]
  const parts = [['[', HUE.plain], ...words, ...(dots ? [['', null]] : []), [']', HUE.plain]]
  const w = parts.reduce((a, [t]) => a + (t ? textW(t) + 1 : 6), -1) + 6, h = 9
  const X = Math.max(clamp[0], Math.min(clamp[1] - w, Math.round(x - w / 2))), Y = below ? y + 2 : y - h - 2
  let s = `<path fill="#000" fill-opacity=".35" d="${rect(X + 1, Y + 1, w, h)}"/>` +
    `<path fill="${INK.edge}" d="${rect(X, Y + 1, w, h - 2)}${rect(X + 1, Y, w - 2, h)}"/>` +
    `<path fill="${INK.board}" d="${rect(X + 1, Y + 1, w - 2, h - 2)}"/><path fill="${INK.lit}" d="${rect(X + 1, Y + 1, w - 2, 1)}"/>`
  // the tail: three pixels then one, under the plate's middle (over it, `below`)
  const tx = Math.round(x) - 1
  s += below ? `<path fill="${INK.edge}" d="${rect(tx + 1, Y - 2, 1, 1)}${rect(tx, Y - 1, 3, 1)}"/>`
    : `<path fill="${INK.edge}" d="${rect(tx, Y + h, 3, 1)}${rect(tx + 1, Y + h + 1, 1, 1)}"/>`
  let cx = X + 3
  for (const [t, color] of parts) {
    if (!t) {
      // the dots, in the word's hue, filling in one by one
      const hue = words.at(-1)[1]
      s += [0, 1, 2].map((k) => `<path fill="${hue}" d="${rect(cx + k * 2, Y + 6, 1, 1)}"><animate attributeName="opacity" values="0;1" keyTimes="0;${(k + 1) / 4}" calcMode="discrete" dur="${DOT_PERIOD}s" repeatCount="indefinite"/></path>`).join('')
      cx += 6
      continue
    }
    s += `<path fill="${color}" d="${typeD(t, cx, Y + 2)}"/>`
    cx += textW(t) + 1
  }
  return shown(s, from, to, { dim })
}

// The emotes, as pixel maps ('k' ink, the rest their colors), drawn with their foot's middle at (x, y)
const EMOTE = {
  bang: { rows: ['kkk', 'krk', 'krk', 'krk', 'kkk', 'krk', 'kkk'], c: { r: '#ff5d5d' } },
  bulb: { rows: ['.kkk.', 'kyyyk', 'kywyk', 'kyyyk', '.kyk.', '.kgk.', '..k..'], c: { y: '#ffe066', w: '#fffbe0', g: '#9a917f' } },
  note: { rows: ['..kkk', '..kyk', '..kyk', '..k..', 'kkkk.', 'kyyk.', 'kkkk.'], c: { y: '#ffd23f' } },
  spark: { rows: ['..k..', '..y..', 'kyWyk', '..y..', '..k..'], c: { y: '#ffe066', W: '#ffffff' } },
  sweat: { rows: ['.k', 'kb', 'kb', '.k'], c: { b: '#8fd3ff' } },
  heart: { rows: ['k.k.k', 'krkrk', 'krrrk', '.krk.', '..k..'], c: { r: '#ff6b9a' } },
  // steam off a mug: no ink, three wisps
  steam: { rows: ['.w.w', 'w.w.', '.w.w', 'w.w.', '.w..'], c: { w: '#f4efe4' } },
}
function emoteSvg({ x, y, kind, from, to }) {
  const e = EMOTE[kind]
  const W = e.rows[0].length, H = e.rows.length
  const X = Math.round(x - W / 2), Y = y - H
  const fills = { k: INK.edge, ...e.c }
  const s = Object.entries(fills).map(([ch, fill]) => {
    const d = runs(e.rows.map((r) => [...r].map((c) => (c === ch ? '1' : '0')).join('')), X, Y)
    return d ? `<path fill="${fill}" d="${d}"/>` : ''
  }).join('')
  return shown(s, from, to, { hop: 3 })
}

/** Shown from `from` to `to` (seconds of the layer's clock): in with a pop up, bobbing a pixel a second while it stays. */
function shown(inner, from, to, { hop = 2, dim = false } = {}) {
  const end = to != null ? `<set attributeName="display" to="none" begin="${r2(to)}s"/>` : ''
  const pop = `<animateTransform attributeName="transform" type="translate" values="0 ${hop};0 -1;0 0" keyTimes="0;.6;1" begin="${r2(from)}s" dur="0.18s" fill="freeze"/>`
  const bob = `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1" calcMode="discrete" begin="${r2(from + 0.5)}s" dur="1s" repeatCount="indefinite"/>`
  return `<g display="none"${dim ? ' opacity=".8"' : ''}><set attributeName="display" to="inline" begin="${r2(from)}s"/>${end}<g>${pop}<g>${bob}${inner}</g></g></g>`
}

/** A layer of `w` × `h` art px holding the tags (tagSvg) and the emotes (`emote` set: emoteSvg), on its own clock, over `under` (walkers). */
export function tagLayer(w, h, items, under = '') {
  const body = items.map((it) => (it.emote ? emoteSvg({ ...it, kind: it.emote }) : tagSvg(it))).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}" shape-rendering="crispEdges" overflow="visible">${under}${body}</svg>`
}

/** A tag's markup alone at (0, 0), for a walker to carry: its foot's middle at (x, y). */
export const walkerTag = (o) => tagSvg({ from: 0, ...o })
