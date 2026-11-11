// PURE: what the pane shows under its Frame key (hooks/register.tsx): The Office on a screen of its own, a tablet on a
// stand, a picture frame, a spare monitor (scripts/dashboard.mjs --frame). A card on the console's dark plate, in its
// colours and its type (lib/svg-console.mjs): while the frame is on, the QR code of its address on a slip of paper (a
// tablet's camera opens it) beside the address in words and what the link lets a screen do; while it is off, the screen
// on its stand and what turning it on does. And the same in lines of text, for a terminal, the code in half blocks.
// It is told where the frame stands (`link`, the launcher's `--json` answer as the pane checked it) and draws only that.
import { C, bitmap, esc, paint, typeGroup, word, wordW } from './svg-console.mjs'
import { qrMatrix, qrTerminal } from './qr.mjs'

/** The widest an Svg is drawn: the desktop refuses a tree past it. */
const MAX_PX = 4096
const PAD = 9
/** The card's words: 6.5 units (13 px) of the console's type, a line every 10; the title a little bigger. */
const SIZE = 6.5
const LINE = 10
const TITLE = 7.5
/** Its inks on the dark plate: words, quieter words, the address (a lit window's yellow), the title (the LED's amber). */
const INK = { words: C.cap, quiet: C.capLo, address: C.lit, title: C.amber }
/** The screen on its stand, 9 x 9 as the menu's key draws it, here eight times the size. */
const SCREEN = ['#########', '#.......#', '#.++.++.#', '#.++.++.#', '#.......#', '#########', '....#....', '...###...', '.#######.']

/**
 * Words broken into lines of `room` characters at most, at spaces; an address (no space in it) is cut after its port
 * when that fits, else wherever the line ends.
 */
export function wrap(text, room) {
  const max = Math.max(8, Math.floor(room))
  const lines = []
  let line = ''
  const put = (piece) => {
    if (!line) line = piece
    else if (line.length + 1 + piece.length <= max) line += ` ${piece}`
    else { lines.push(line);line = piece }
  }
  for (const one of String(text).split(/\s+/).filter(Boolean)) {
    if (one.length <= max) { put(one);continue }
    // an address: its host and port, then its path, then whatever still runs over
    const cut = /^(https?:\/\/[^/]+)(\/.*)$/.exec(one)
    const pieces = cut && cut[1].length <= max ? [cut[1], cut[2]] : [one]
    for (const piece of pieces) for (let i = 0; i < piece.length; i += max) put(piece.slice(i, i + max))
  }
  if (line) lines.push(line)
  return lines
}

/** Where the frame stands, in a few words: the card's title and the first line of its text. */
export function frameState(link) {
  if (!link?.running) return 'off'
  if (!link.lan) return 'on this computer only'
  return link.urls?.length ? 'on your network' : 'on, but this computer is on no network'
}

/** What the card says, as [ink, words] paragraphs: the same on the card and in a terminal's lines. */
function paragraphs(link) {
  const urls = link?.running && link.lan ? link.urls ?? [] : []
  const [first, ...others] = urls
  const named = others.find((url) => /\.local:/.test(url))
  if (!link?.running) {
    return [
      ['words', 'A tablet on a stand, a picture frame, a spare monitor: the office full screen, live, without Claude open.'],
      ['words', 'Turn it on and this computer answers on your network, at one link that only looks: it changes nothing.'],
      ['quiet', "Anyone on the network who has the link sees your projects' names and what your agents are doing."],
    ]
  }
  if (!link.lan) {
    return [
      ['words', 'It runs on this computer only. Open it here to see what a screen will show:'],
      ['address', link.local ?? ''],
      ['quiet', 'Turn it off, then on, to put it on your network.'],
    ]
  }
  if (!first) {
    return [
      ['words', 'It is on, but this computer is on no network, so no screen can reach it.'],
      ['quiet', 'Join the network your screen is on, then turn it off and on again.'],
    ]
  }
  return [
    ['words', 'Scan the code with a tablet or a phone, or open this address on any screen of your network:'],
    ['address', first],
    ...(named ? [['quiet', "By name, for Apple devices (it stays good when this computer's address changes):"], ['address', named]] : []),
    ['quiet', "The link only looks: it changes nothing. Anyone on this network who has it sees your projects' names and what your agents are doing."],
    ['quiet', "On an iPad: Share, then Add to Home Screen, hides Safari's bars; set Auto-Lock to Never. A tap on the screen brings up its tabs."],
  ]
}

/**
 * The frame's card, `width` CSS px wide: `link` is where the frame stands ({ running, lan, urls, local }; null or off
 * draws what turning it on does). Returns its SVG `source`, its size (`px` x `h` CSS px) and its `alt`.
 */
export function renderFrameCard({ width = 720, link = null } = {}) {
  const px = Math.min(MAX_PX, Math.max(240, Math.round(Number(width) || 720)))
  const W = Math.round(px / 2)
  const state = frameState(link)
  const url = link?.running && link.lan ? link.urls?.[0] ?? '' : ''
  const rects = []
  const words = []

  // the block at the left (or on top of a narrow card): the code on its slip of paper, or the screen on its stand
  let block
  if (url) {
    const modules = qrMatrix(url, { ecl: 'L' })
    const n = modules.length
    const m = W >= 250 ? 3 : 2
    const quiet = 3 * m
    const side = n * m + 2 * quiet
    block = {
      w: side + 2, h: side + 2,
      draw: (x, y) => {
        rects.push([x, y, side + 2, side + 2, C.edge], [x + 1, y + 1, side, side, C.capHi])
        // each row's dark runs, one rect a run
        modules.forEach((row, j) => {
          for (let i = 0; i < n;) {
            if (!row[i]) { i++;continue }
            let run = 1
            while (row[i + run]) run++
            rects.push([x + 1 + quiet + i * m, y + 1 + quiet + j * m, run * m, m, C.ink])
            i += run
          }
        })
      },
    }
  } else {
    const k = 8
    block = {
      w: 9 * k, h: 9 * k,
      draw: (x, y) => rects.push(...bitmap(SCREEN, 0, 0, link?.running ? C.cap : C.off, link?.running ? C.lit : C.offLo).map(([bx, by, bw, bh, f]) => [x + bx * k, y + by * k, bw * k, bh * k, f])),
    }
  }

  // beside the block where the words have room for a line of some forty characters, else under it
  const gap = 12
  const beside = W - 2 * PAD - block.w - gap >= 40 * SIZE * 0.6
  const column = beside ? W - 2 * PAD - block.w - gap : W - 2 * PAD
  const room = column / (SIZE * 0.6)
  const title = `THE OFFICE ON A SCREEN OF ITS OWN · ${state.toUpperCase()}`
  const titles = wrap(title, column / (TITLE * 0.6))
  const text = paragraphs(link).map(([ink, said]) => ({ ink, lines: wrap(said, room) }))
  const textH = titles.length * (LINE + 1) + 3 + text.reduce((h, p) => h + p.lines.length * LINE + 4, 0) - 4
  const H = Math.ceil(2 * PAD + (beside ? Math.max(block.h, textH) : block.h + gap + textH))

  // the plate's light along its top, its shade along its foot, a brass rivet in each corner (the console's)
  rects.push([5, 0, W - 10, 1, C.plateHi], [5, H - 1, W - 10, 1, C.plateLo])
  for (const [rx, ry] of [[3, 3], [W - 5, 3], [3, H - 5], [W - 5, H - 5]]) rects.push([rx, ry, 2, 2, C.rivet], [rx, ry, 1, 1, C.rivetHi], [rx + 1, ry + 1, 1, 1, C.rivetLo])
  const bx = beside ? PAD : Math.floor((W - block.w) / 2)
  const by = beside ? PAD + Math.max(0, Math.floor((Math.min(textH, H - 2 * PAD) - block.h) / 2)) : PAD
  block.draw(bx, Math.max(PAD, by))
  const tx = beside ? PAD + block.w + gap : PAD
  let ty = beside ? PAD + Math.max(0, Math.floor((block.h - textH) / 2)) : PAD + block.h + gap
  for (const line of titles) {
    words.push(word(line, tx, ty + TITLE, TITLE, INK.title))
    ty += LINE + 1
  }
  ty += 3
  for (const p of text) {
    for (const line of p.lines) {
      words.push(word(line, tx, ty + SIZE, SIZE, INK[p.ink]))
      ty += LINE
    }
    ty += 4
  }

  const alt = `The Office on a screen of its own, ${state}. ${paragraphs(link).map(([, said]) => said).join(' ')}`
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${H * 2}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin meet" ` +
    `shape-rendering="crispEdges"><title>${esc(alt)}</title>` +
    `<rect width="${W}" height="${H}" rx="5" fill="${C.plate}" shape-rendering="geometricPrecision"/>${paint(rects)}${typeGroup(words.join(''))}` +
    `<rect x=".25" y=".25" width="${W - 0.5}" height="${H - 0.5}" rx="4.75" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width=".5" shape-rendering="geometricPrecision"/></svg>`
  return { source, alt, px, h: H * 2 }
}

/**
 * The same in lines of text, `columns` wide, for a terminal: where the frame stands, what the card says, and under it
 * the code in half blocks (two rows of the code to a line), which a phone's camera reads off a dark terminal.
 */
export function frameText({ link = null, columns = 80 } = {}) {
  const room = Math.max(24, Math.floor(columns))
  const lines = [`The Office on a screen of its own: ${frameState(link)}.`, '']
  for (const [, said] of paragraphs(link)) lines.push(...wrap(said, room))
  const url = link?.running && link.lan ? link.urls?.[0] ?? '' : ''
  if (url) {
    const code = qrTerminal(url).split('\n')
    if (code[0].length <= room) lines.push('', ...code)
  }
  return lines
}
