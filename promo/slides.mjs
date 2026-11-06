#!/usr/bin/env node
// The carousel: the plugin's story told in slides, for Instagram (4:5, 1080 × 1350) and X (16:9, 1920 × 1080). Each
// slide is one panel of the promo's own kind (promo/boards.mjs: a camera on one of the plugin's drawings, the install
// console), registered here as a board of its own (`ig…`, `x…`) and drawn by the editor's player, so a still and a
// video are the same frame. On Instagram the drawing fills the frame and the story's text box sits over its foot; on X
// the drawing fills a square on the left (every dressed drawing's sky and street reach past it, so no seam shows) and
// the text is on a game's side panel, the box's board, down the right. The film slide is the story video itself,
// cropped to 4:5 on its safe zone (Instagram's feed shows a Reel that way), and on X beside the side panel.
//   node promo/slides.mjs                      every slide: PNGs, and MP4s for the moving ones → promo/out/slides/
//   node promo/slides.mjs install cover        only those slides
//   node promo/slides.mjs --stills             PNGs only
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { STORYBOARDS } from './boards.mjs'
import { NARROW, crewBox } from './scenes.mjs'
import { INK } from './editor/box.js'
import { browser } from './cdp.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'out', 'slides')
// the story as exported last (promo/export.mjs story), so the film slide always shows the current cut
const FILM = path.join(HERE, 'out', 'video', 'story.mp4')
export const IG = [1080, 1350], X = [1920, 1080]
// Instagram: the text box's sides and foot. X: the drawing's square, the side panel from its edge to the frame's
const IG_BOX = { x: 40, w: 1000, foot: 1320 }
const SIDE = { x: 1080, w: 840 }

// the pixel type from the site's own files (site/fonts: Press Start 2P whole, VT323 cut to ASCII and · — …), inlined:
// headless Chrome may not reach Google Fonts, and a still must not fall back to a system face
const FONT = (file) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(HERE, '..', 'site', 'fonts', file)).toString('base64')}) format('woff2')`
const FONTS = { raw: `<style>@font-face{font-family:'Press Start 2P';src:${FONT('press-start-2p.woff2')}}@font-face{font-family:VT323;src:${FONT('vt323.woff2')}}</style>`, x: 0, y: 0, w: 0 }

// ---------------------------------------------------------------- shots
/** A camera on `scene` at `zoom` that puts art pixel `art` [x, y] on frame pixel `at` [X, Y] of `frame`. */
const shot = (scene, [ax, ay], [X, Y], zoom, frame, o = {}) =>
  ({ scene, zoom, center: [ax + (frame[0] / 2 - X) / zoom, ay + (frame[1] / 2 - Y) / zoom], ...o })
const sfx = (name, at, o = {}) => ({ name, at, ...o })

// ---------------------------------------------------------------- the box and the side panel
// The story's box (promo/editor/box.js frameSvg: an ink edge with its corners cut, a cream rule, the sign's board) in
// CSS, so it grows with its text: 5-px pixels, the board's top row lit. Its kicker and page in VT323, its title in
// Press Start 2P (5 px a pixel of it at 40) with *words* in the neon's yellow, its lines in VT323; a ▼ at its corner
// says there is more (a role-playing game's next page), blinking.
const PX = 5
// the side panel's column: from the frame's edge past the panel's own, to 40 px short of the frame's right
const COL = { x: SIDE.x + 4 * PX + 44, w: SIDE.w - 4 * PX - 44 - 40 }
const cut =(n) => `clip-path:polygon(${n}px 0,calc(100% - ${n}px) 0,100% ${n}px,100% calc(100% - ${n}px),calc(100% - ${n}px) 100%,${n}px 100%,0 calc(100% - ${n}px),0 ${n}px)`
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const lit = (s) => esc(s).replace(/\*([^*]+)\*/g, `<span style="color:${INK.key}">$1</span>`).replace(/\n/g, '<br>')
const NOLIGA = "font-variant-ligatures:none;font-feature-settings:'liga' 0,'clig' 0,'calt' 0"
const rects = (list, fill) => list.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`).join('')
const MORE = `<svg viewBox="0 0 7 5" width="35" height="25" shape-rendering="crispEdges">${rects([[0, 0, 7, 1], [1, 1, 5, 1], [2, 2, 3, 1], [3, 3, 1, 1]], INK.key)}</svg>`
const more = (on) => (on ? `<div data-blink="2,1.2" style="position:absolute;right:${6 * PX}px;bottom:${5 * PX}px;line-height:0">${MORE}</div>` : '')

/** The frame's layers under a box of any size: shadow, ink edge, cream rule, ink, board, its lit top row. */
const frameCss = (board = INK.board) =>
  `<i style="position:absolute;left:${2 * PX}px;top:${2 * PX}px;right:${-PX}px;bottom:${-PX}px;background:rgba(0,0,0,.45);${cut(PX)}"></i>` +
  `<i style="position:absolute;inset:0;background:${INK.edge};${cut(PX)}"></i>` +
  `<i style="position:absolute;inset:${PX}px;background:${INK.rule};${cut(PX)}"></i>` +
  `<i style="position:absolute;inset:${2 * PX}px;background:${INK.edge}"></i>` +
  `<i style="position:absolute;inset:${3 * PX}px;background:${board}"></i>` +
  `<i style="position:absolute;left:${3 * PX}px;right:${3 * PX}px;top:${3 * PX}px;height:${PX}px;background:${INK.lit}"></i>`

const kickerHtml = (kicker, page, size = 32) => `<div style="display:flex;justify-content:space-between;font:${size}px/${size}px VT323,monospace;${NOLIGA};color:#a4977c;letter-spacing:.04em;text-transform:uppercase">` +
  `<span>${esc(kicker)}</span><span>${esc(page ?? '')}</span></div>`
const titleHtml = (t, size, top) => `<div style="margin-top:${top}px;font:${size}px/${Math.round(size * 1.5)}px 'Press Start 2P',monospace;${NOLIGA};color:${INK.text}">${lit(t)}</div>`
const bodyHtml = (t, size, top) => (t ? `<div style="margin-top:${top}px;font:${size}px/${Math.round(size * 1.1)}px VT323,monospace;${NOLIGA};color:#cfc6b2">${lit(t)}</div>` : '')

/** Instagram's text box over the drawing's foot: `t` { kicker, title, body }, growing up from the box's foot. */
function textBox(t, { page, last }) {
  const { x, w, foot } = IG_BOX
  const html = `<div style="position:absolute;left:0;bottom:0;width:${w}px">${frameCss()}` +
    `<div style="position:relative;padding:36px 48px 44px;-webkit-font-smoothing:none">${kickerHtml(t.kicker, page)}${titleHtml(t.title, 40, 22)}${bodyHtml(t.body, 40, 18)}</div>${more(!last)}</div>`
  return { raw: html, x, y: foot, w }
}

/**
 * X's side panel: the box's board down the frame's right, its frame's left edge the line between it and the drawing
 * (its other edges past the frame), the kicker and the page at its top, the title and the body in its middle, or
 * `inner` (the install console's lines) under the title.
 */
function sidePanel(t, { page, last, inner = '', from = SIDE.x }) {
  // `from`: where the panel's edge is (the film's is further left, its square narrower); its column stays put
  const w = X[0] - from, left = COL.x - from
  const html = `<div style="position:absolute;left:0;top:-30px;width:${w + 30}px;height:${X[1] + 60}px">${frameCss()}</div>` +
    `<div style="position:absolute;left:${left}px;width:${COL.w}px;top:0;height:${X[1]}px;display:flex;flex-direction:column;justify-content:center;-webkit-font-smoothing:none">` +
    `<div style="position:absolute;left:0;right:0;top:56px">${kickerHtml(t.kicker, page, 40)}</div>${titleHtml(t.title, 48, 0)}${bodyHtml(t.body, 62, 34)}${inner}</div>` +
    // the site's address at its foot and the ▼ in its corner, but on the last (its console ends on the address)
    (last ? '' : `<div style="position:absolute;left:${left}px;top:${X[1] - 96}px;font:40px/40px VT323,monospace;${NOLIGA};color:#8a8170">theoffice.makio.io</div>` +
      `<div data-blink="2,1.2" style="position:absolute;left:${w - 75}px;top:${X[1] - 86}px;line-height:0">${MORE}</div>`)
  return { raw: html, x: from, y: 0, w }
}

/**
 * The install console's lines (the story's pixel box, promo/boards.mjs installBox): its notes and commands in VT323 at
 * `size`, /theoffice in Press Start 2P on the board's lit row with its caret, the site's address in the sign's interns
 * blue with the credit at its end. A line `show`s at its second and types from there at `cps` letters a second.
 */
function consoleLines(lines, { size, pad }) {
  const LINK = '#92b0f0'
  const face = (go) => `font:${go ? `${size}px 'Press Start 2P'` : `${size}px VT323`},monospace;${NOLIGA}`
  const typed = (q) => (q.cps ? ` data-type="${q.show},${q.cps}"` : '')
  const shown = (q) => (q.show != null ? ` data-show="${q.show}"` : '')
  return lines.map((q) => {
    if (q.kind === 'link') {
      return `<div${shown(q)} style="display:flex;align-items:center;justify-content:space-between;height:${size + 10}px;margin-top:6px">` +
        `<code style="${face()};white-space:pre;color:${LINK};line-height:${size - 6}px;border-bottom:3px solid ${LINK}">${esc(q.text)}</code>` +
        `<code style="${face()};white-space:pre;color:#7d7466">${esc(q.aside ?? '')}</code></div>`
    }
    const go = q.kind === 'go', note = q.kind === 'note'
    return `<div${shown(q)} style="display:flex;align-items:center;gap:${go ? 24 : 12}px;height:${go ? size + 34 : size + 6}px;` +
      `${go ? `margin:8px ${-pad + 15}px;padding:0 ${pad - 10}px;border-left:5px solid ${INK.key};background:${INK.lit}` : ''}">` +
      `${note ? '' : `<span style="${face(go)};color:#d77757">&gt;</span>`}` +
      `<code${typed(q)} style="${face(go)};white-space:pre;color:${go ? INK.key : note ? '#a4977c' : INK.text}">${esc(q.text)}</code>` +
      `${q.caret ? `<i data-blink="${q.caret}" style="display:inline-block;width:${Math.round(size * 0.62)}px;height:${size}px;margin-left:-14px;background:${INK.key}"></i>` : ''}</div>`
  }).join('')
}
/**
 * Instagram's install console: the text box's kicker and a one-line title (Press Start 2P at 32), then the lines, in
 * the box's frame over the drawing's foot. There from the first frame (a video's first frame is its thumbnail).
 */
function consoleBox(t, lines, { size = 36, page } = {}) {
  const { x, w, foot } = IG_BOX, pad = 34
  const html = `<div style="position:absolute;left:0;bottom:0;width:${w}px">${frameCss()}` +
    `<div style="position:relative;padding:${pad - 2}px ${pad}px ${pad}px;-webkit-font-smoothing:none">${kickerHtml(t.kicker, page)}${titleHtml(t.title, 32, 16)}` +
    `<div style="margin-top:12px">${consoleLines(lines, { size, pad })}</div></div></div>`
  return { raw: html, x, y: foot, w }
}
/** A stepped fade from the frame's top: the drawing's cut-off top rows going dark in four bands of `step` px. */
const topFade = (w, step = 50, ink = '10,9,14') =>
  ({ raw: `<div style="position:absolute;left:0;top:0;width:${w}px;height:${4 * step}px;background:linear-gradient(rgba(${ink},.92) 0 ${step}px,rgba(${ink},.7) ${step}px ${2 * step}px,rgba(${ink},.45) ${2 * step}px ${3 * step}px,rgba(${ink},.2) ${3 * step}px ${4 * step}px)"></div>`, x: 0, y: 0, w })

// ---------------------------------------------------------------- the slides
// the crew in the month's building (promo/scenes.mjs crewBox): the employee of the month and a line an AI under it
const CREW = crewBox()
// the console's lines, typed in turn: the two commands, then /theoffice once they're in, then the address
const CMDS = [
  { kind: 'cmd', text: '/plugin marketplace add Makio64/theoffice-agents', show: 1.0, cps: 30 },
  { kind: 'cmd', text: '/plugin install theoffice@makio64', show: 2.9, cps: 30 },
  { kind: 'note', text: '# then, in a new session', show: 4.4 },
  { kind: 'go', text: '/theoffice', show: 4.8, cps: 14, caret: '5.6,0.6' },
  { kind: 'link', text: 'https://theoffice.makio.io', aside: 'by Makio64', show: 6.2 },
]
const INSTALL_SOUNDS = [sfx('pop', 0.3, { gain: -12 }), sfx('typing', 1.0, { gain: -4 }), sfx('typing', 2.36, { gain: -4, from: 0.6, dur: 0.3 }),
  sfx('typing', 2.9, { gain: -4, dur: 1.2 }), sfx('typing', 4.8, { gain: -4, dur: 0.75 }), sfx('pop', 6.2, { gain: -14 }),
  sfx('office', 0, { gain: -14, fadeIn: 0.4, fadeOut: 0.8 })]

export const SLIDES = [
  {
    name: 'cover',
    ig: { kicker: 'A Claude Code plugin', title: 'Your AI agents have\nan *office* now.', body: 'A pixel-art office for your coding agents.' },
    x: { kicker: 'A Claude Code plugin', title: 'Your AI\nagents have\nan *office* now.', body: 'A pixel-art office for\nyour coding agents.' },
    // from the moon down to the sidewalk, its walkers clear of the box
    igShot: () => [shot('liveNow', [160, 0], [540, 78], 2.05, IG)],
    xShot: () => [shot('liveNow', [160, 0], [540, 96], 2.15, X)],
    still: 1.2,
  },
  {
    name: 'cast',
    ig: { kicker: 'The cast', title: 'Every AI is a\n*character*.', body: 'Claude, Codex, Gemini, Cursor, Kimi and Grok.' },
    x: { kicker: 'The cast', title: 'Every AI is a\n*character*.', body: 'Claude, Codex, Gemini,\nCursor, Kimi and Grok,\nacross all your accounts.' },
    // the crew's badges, the six across the road under them; the directory over them cut off by the frame, faded out
    // since 1.0 the crew hangs beside the wall calendar, under the employee of the month, a line an AI: that column
    // lit, as tall as the room over the box (on X the square), the building's edge on the frame's, the calendar dimmed
    // beside it
    igShot: () => [shot('monthNow', [NARROW.now - 120, CREW.box[1] + CREW.box[3] / 2], [540, 495], 4.5, IG, { focus: CREW.box, dim: 0.62 })],
    xShot: () => [shot('monthNow', [NARROW.now - 120, CREW.box[1] + CREW.box[3] / 2], [540, 540], 4.5, X, { focus: CREW.box, dim: 0.62 })],
    still: 0.9,
  },
  {
    name: 'now',
    ig: { kicker: 'Live', title: 'See what they\'re\ndoing *right now*.', body: 'Who is coding, testing, or waiting on you.' },
    x: { kicker: 'Live', title: 'See what\nthey\'re doing\n*right now*.', body: 'Who is coding, testing,\nor waiting on you.' },
    // one room close up, wall to wall (art 4 to 196), from the roof's edge: on Instagram down to its desks, the
    // box's top on the 3F labels' top; on X down to the 3F floor
    igShot: () => [shot('liveNow', [100, 56], [540, 0], 5.625, IG)],
    xShot: () => [shot('liveNow', [100, 56], [540, 0], 5.625, X)],
    still: 1.2,
  },
  {
    name: 'week',
    ig: { kicker: 'Today · week · month', title: 'Which *projects*\nthey worked on.', body: 'A floor per project, its hours, its commits.' },
    x: { kicker: 'Today · week · month', title: 'Which *projects*\nthey worked on.', body: 'A floor per project,\nits hours, its commits.' },
    igShot: () => [shot('weekNow', [160, 0], [540, 120], 3, IG)],
    xShot: () => [shot('weekNow', [160, 0], [540, 110], 2.5, X)],
    still: 1.2,
  },
  {
    name: 'lapse',
    ig: { kicker: 'Timelapse', title: 'Replay the week\nin *seconds*.', body: 'Desks fill up at dawn, lights go out at night.' },
    x: { kicker: 'Timelapse', title: 'Replay the week\nin *seconds*.', body: 'Desks fill up at dawn,\nlights go out at night.' },
    // the façade wall to wall (2.7×: its street as wide as the frame), its sign clear of the top
    igShot: () => [shot('streetLapse', [200, 0], [540, 44], 2.7, IG, { time: 2.6 })],
    xShot: () => [shot('streetLapse', [200, 404], [540, 1150], 2.7, X, { time: 2.6 })],
    rate: 0.25, dur: 8, video: true, still: 0.8,
  },
  {
    name: 'film',
    film: true,
    x: { kicker: 'The film', title: 'The whole story\nin *34 seconds*.', body: 'Sound on.' },
  },
  {
    name: 'install',
    last: true,
    // dawn to Thursday noon at an hour a second: the office fills up as the commands are typed; the still at 11:00
    igShot: ({ page }) => [shot('lapseEnd', [200, 0], [540, 14], 2.2, IG, { time: 2.5 }),
      consoleBox({ kicker: 'Install · link in bio', title: 'Install in *two commands*.' },
        [{ kind: 'note', text: '# in Claude Code · nothing leaves your machine', show: 0.7 }, ...CMDS], { page })],
    x: { kicker: 'Install', title: 'Install in\n*two commands*.', body: 'In Claude Code.\nNothing leaves your machine.' },
    xShot: () => [shot('lapseEnd', [200, 0], [540, 40], 2.7, X, { time: 2.5 })],
    xInner: `<div style="margin-top:40px">${consoleLines(CMDS, { size: 36, pad: 44 })}</div>`,
    rate: 0.05, dur: 9, video: true, still: 7, sounds: INSTALL_SOUNDS,
  },
]

// ---------------------------------------------------------------- the boards
const keyOf = (fmt, name) => `${fmt}${name}`
/** Every slide's two boards, registered with the storyboards the editor serves. */
export function register() {
  SLIDES.forEach((s, i) => {
    if (s.film) return
    const page = `${i + 1}/${SLIDES.length}`
    for (const fmt of ['ig', 'x']) {
      const frame = fmt === 'ig' ? IG : X
      const t = s[fmt]
      const words = fmt === 'ig' ? (t ? [textBox(t, { page, last: s.last })] : []) : [sidePanel(t, { page, last: s.last, inner: s.xInner })]
      const dur = s.dur ?? 3
      STORYBOARDS[keyOf(fmt, s.name)] = {
        title: `Slide ${page}: ${s.name} (${fmt === 'ig' ? 'Instagram 4:5' : 'X 16:9'})`, meta: '', blips: false,
        panels: [{ t: `0–${dur}`, move: '', frame, sky: 'site', rate: s.rate ?? 1, layers: [FONTS, ...s[`${fmt}Shot`]({ page }), ...words],
          captions: [], sounds: s.sounds ?? [], shot: s.name }],
      }
    }
  })
}

// ---------------------------------------------------------------- the film
const H264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
/** The story video as the film slide: cropped to 4:5 on its safe zone for Instagram; beside the side panel on X. */
async function film(b, base, n) {
  const s = SLIDES.find((q) => q.film), page = `${n}/${SLIDES.length}`
  const ig = path.join(OUT, `ig-${n}-film.mp4`), x = path.join(OUT, `x-${n}-film.mp4`)
  // Instagram: the Reel's 4:5 window, centred on its safe zone (220–1500): every caption and the console inside it
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', FILM, '-vf', 'crop=1080:1350:0:185', ...H264, '-c:a', 'copy', ig])
  // X: that window at 4/5 (the frame's height) on the left, the side panel from its edge (its column where every
  // slide has it)
  const key = keyOf('x', s.name), V = { x: 0, y: 0, w: 864, h: 1080 }
  STORYBOARDS[key] = {
    title: 'Slide: film (X 16:9)', meta: '', blips: false,
    panels: [{ t: '0–3', move: '', frame: X, sky: 'site', layers: [FONTS, sidePanel(s.x, { page, from: V.w })], captions: [], sounds: [], shot: 'film' }],
  }
  const bg = path.join(OUT, '.film-x-bg.png')
  await still(b, base, key, 0, bg)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-framerate', '30', '-i', bg, '-i', ig, '-filter_complex',
    `[1:v]scale=${V.w}:${V.h}:flags=lanczos[v];[0:v][v]overlay=${V.x}:${V.y}:shortest=1,format=yuv420p[out]`, '-map', '[out]', '-map', '1:a',
    ...H264, '-c:a', 'copy', x])
  fs.rmSync(bg)
  // a poster each: the cast at work inside (the 5F desks, Clawd and Dex with their cards)
  for (const f of [ig, x]) execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '10.5', '-i', f, '-frames:v', '1', f.replace('.mp4', '.png')])
  return [ig, x]
}

// ---------------------------------------------------------------- stills
const FACES = ["40px 'Press Start 2P'", '40px VT323']
/** Board `key` at `t` seconds as a PNG: the player's frame, once its pixel type is in (a fresh page each). */
export async function still(b, base, key, t, out) {
  await b.open(`${base}/render.html?${key}-${Date.now()}#${key}`, { width: 1080, height: 1920 })
  const info = await b.evaluate('window.whenReady')
  await b.resize(...info.frame)
  await b.evaluate(`frameAt(${t})`)
  await b.evaluate(`Promise.all(${JSON.stringify(FACES)}.map((f) => document.fonts.load(f))).then(() => document.fonts.ready)`)
  await b.evaluate(`frameAt(${t})`)
  fs.writeFileSync(out, await b.capture())
}

// ---------------------------------------------------------------- the command line
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const only = args.filter((a) => !a.startsWith('--'))
  const stillsOnly = args.includes('--stills')
  register()
  fs.mkdirSync(OUT, { recursive: true })
  const { startServer } = await import('./editor.mjs')
  const { exportVideo } = await import('./export.mjs')
  const server = await startServer(0)
  const b = await browser()
  try {
    for (const [i, s] of SLIDES.entries()) {
      if (only.length && !only.includes(s.name)) continue
      const n = String(i + 1)
      if (s.film) {
        if (!stillsOnly) console.log((await film(b, server.url, n)).map((f) => path.relative(HERE, f)).join('  '))
        continue
      }
      for (const fmt of ['ig', 'x']) {
        const key = keyOf(fmt, s.name), base = path.join(OUT, `${fmt}-${n}-${s.name}`)
        await still(b, server.url, key, s.still ?? 1, `${base}.png`)
        console.log(path.relative(HERE, `${base}.png`))
        if (s.video && !stillsOnly) {
          const r = await exportVideo({ base: server.url, key, out: `${base}.mp4`, blips: false })
          console.log(path.relative(HERE, r.out), `${r.duration.toFixed(1)} s`)
        }
      }
    }
  } finally {
    await b.close()
    await server.close()
  }
}
