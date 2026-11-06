// PURE: the script of the Month's export page (lib/month-page.mjs), as real functions: the page holds one room of the
// month's drawing (the wall calendar, the building directory) or all of it, moving as it does in the pane, and saves it
// in the browser as a PNG (a still, pixel-sharp at a whole scale), a GIF (a short loop of its motion), a video (the
// same, recorded in real time, WebM or MP4) or its SVG. The page makes the one the pane asked for as it loads, and its
// buttons make any other. It borrows the timelapse player's kit (lib/timelapse-player.mjs KIT: the SMIL baker, the GIF
// and WebM writers, the canvas helpers), pasted into the page with these functions as one script (MONTH_JS), so a
// function may call only the others and the PLAYER and MONTH constants. Inside function bodies the text stays ASCII, as
// the timelapse's does; the DOM ones run only in the page, the rest in Node's tests too.
import { KIT, PLAYER, bakeMarkup, bakePlan, buildPalette, fmtBytes, gifEncoder, idle, indexFrame, paletteMapper, pickMime, rasterize, saveBlob, scriptOf, sleep, stageFor, webmDuration } from './timelapse-player.mjs'

/**
 * What the exports are held to: each one's narrowest and widest (a still at least PNG_MIN wide, in whole steps of the
 * art's pixels), the loop's length in seconds and the GIF's frames a second (its delay a whole hundredth), the formats
 * a page may make as it loads.
 */
export const MONTH = Object.freeze({
  PNG_MIN: 1600,
  PNG_MAX: 4096,
  GIF_MIN: 720,
  GIF_MAX: 1600,
  VIDEO_MIN: 1280,
  VIDEO_MAX: 1920,
  LOOP_SECONDS: 6,
  GIF_FPS: 12.5,
  FORMATS: ['png', 'gif', 'video', 'svg'],
})

// ---------------------------------------------------------------- sizes, names

/**
 * The canvas for a drawing whose root says `viewBox` (its art units; a crop starts anywhere): the art at the smallest
 * whole scale that is at least `min` px wide, never wider than `max` (then the largest that fits, at least 1).
 * `{ width, height, scale }`.
 */
export function scaleFor({ viewBox, width } = {}, min = 0, max = Infinity) {
  const vb = String(viewBox ?? '').trim().split(/[\s,]+/).map(Number)
  const ok = vb.length === 4 && vb[2] > 0 && vb[3] > 0
  const vw = ok ? vb[2] : Number.parseFloat(width) > 0 ? Number.parseFloat(width) : 960
  const vh = ok ? vb[3] : vw * 0.75
  let scale = Math.max(1, Math.ceil(min / vw))
  if (vw * scale > max) scale = Math.max(1, Math.floor(max / vw))
  return { width: Math.round(vw * scale), height: Math.round(vh * scale), scale }
}

/** A download's name: the page's own (`theoffice-month-2026-10-calendar`, checked), then the format's extension. */
export function saveName(base, ext) {
  const b = /^[a-z0-9][a-z0-9-]{0,99}$/.test(String(base)) ? base : 'theoffice-month'
  return `${b}.${ext}`
}

/** The format a page makes as it loads: one MONTH.FORMATS names, else none. */
export function autoFormat(v) {
  const f = String(v ?? '').toLowerCase()
  return MONTH.FORMATS.includes(f) ? f : ''
}

// ---------------------------------------------------------------- exports (the page only: DOM)

/** Save PNG: the drawing as it stands when the page opens, every pixel of the art a whole square of the image. */
async function savePng(app) {
  const plan = app.plan()
  const size = scaleFor(app.box, MONTH.PNG_MIN, MONTH.PNG_MAX)
  app.say('Save PNG: drawing it...')
  const stage = await stageFor(app, plan, size, size.width, size.height, false)
  const blob = await new Promise((resolve) => stage.canvas.toBlob(resolve, 'image/png'))
  if (!blob) return app.say('Save PNG: this browser would not make the image.')
  const name = app.name('png')
  saveBlob(blob, name)
  app.say(`Saved ${name} (${size.width}\u00d7${size.height}, ${fmtBytes(blob.size)}) to your downloads.`)
}

/**
 * Save GIF: a loop of the drawing's own motion (the falling leaves, the lamps, Clawd at the calendar), MONTH.LOOP_SECONDS
 * long at MONTH.GIF_FPS. The palette comes from a few frames first; each frame is then baked, read back, indexed and
 * handed to the encoder, the page yielding between frames.
 */
async function saveLoop(app) {
  const plan = app.plan()
  const size = scaleFor(app.box, MONTH.GIF_MIN, MONTH.GIF_MAX)
  const frames = Math.max(1, Math.round(MONTH.LOOP_SECONDS * MONTH.GIF_FPS))
  const delay = Math.round(100 / MONTH.GIF_FPS)
  app.say('Save GIF: drawing the first frame...')
  const stage = await stageFor(app, plan, size, size.width, size.height, true)
  const shot = async (i) => {
    await rasterize(bakeMarkup(plan, i / MONTH.GIF_FPS, true, size.width, size.height), stage.ctx, size.width, size.height, app.bg, stage.asData)
    return stage.ctx.getImageData(0, 0, size.width, size.height).data
  }
  const samples = []
  for (const i of [...new Set([0, Math.floor(frames / 3), Math.floor((2 * frames) / 3), frames - 1])]) {
    app.say(`Save GIF: picking the colors (${samples.length + 1} of 4)...`)
    samples.push(await shot(i))
    await idle()
  }
  const palette = buildPalette(samples, 255)
  samples.length = 0
  const map = paletteMapper(palette)
  const gif = gifEncoder(size.width, size.height, palette)
  let prev = null
  let prevIdx = null
  for (let i = 0; i < frames; i++) {
    const px = await shot(i)
    const idx = indexFrame(px, map, prev, prevIdx)
    gif.add(idx, delay)
    prev = px
    prevIdx = idx
    app.progress((i + 1) / frames)
    app.say(`Save GIF: frame ${i + 1} of ${frames}...`)
    await idle()
  }
  const blob = new Blob([gif.end()], { type: 'image/gif' })
  const name = app.name('gif')
  saveBlob(blob, name)
  app.say(`Saved ${name} (${size.width}\u00d7${size.height}, ${frames} frames, ${fmtBytes(blob.size)}) to your downloads.`)
}

/**
 * Save video: the drawing's motion drawn on a canvas about 30 times a second, paced in real time over
 * MONTH.LOOP_SECONDS while a MediaRecorder records it (a frame that draws late is skipped, the clock stays true). WebM
 * (VP9) where the browser records it, else MP4.
 */
async function saveClip(app) {
  const Recorder = globalThis.MediaRecorder
  const canCapture = typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'
  if (typeof Recorder !== 'function' || !canCapture) return app.say('This browser cannot record a canvas (no MediaRecorder here): Save GIF still works.')
  const mime = pickMime((type) => Recorder.isTypeSupported(type))
  if (!mime) return app.say('This browser records neither WebM nor MP4: Save GIF still works.')
  const plan = app.plan()
  const size = scaleFor(app.box, MONTH.VIDEO_MIN, MONTH.VIDEO_MAX)
  const loop = MONTH.LOOP_SECONDS
  app.say('Save video: drawing the first frame...')
  // video codecs want even sides: the odd pixel is background
  const stage = await stageFor(app, plan, size, size.width + (size.width % 2), size.height + (size.height % 2), false)
  // some browsers record only a canvas that is in the document
  stage.canvas.className = 'offstage'
  document.body.append(stage.canvas)
  const draw = (t) => rasterize(bakeMarkup(plan, t, true, size.width, size.height), stage.ctx, size.width, size.height, app.bg, stage.asData)
  const stream = stage.canvas.captureStream(PLAYER.VIDEO_FPS)
  const chunks = []
  let took = 0
  try {
    const rec = new Recorder(stream, { mimeType: mime, videoBitsPerSecond: PLAYER.VIDEO_BITRATE })
    const stopped = new Promise((resolve, reject) => {
      rec.addEventListener('stop', resolve, { once: true })
      rec.addEventListener('error', (e) => reject(e.error ?? new Error('the recorder failed')), { once: true })
    })
    stopped.catch(() => {})
    rec.addEventListener('dataavailable', (e) => { if (e.data && e.data.size) chunks.push(e.data) })
    rec.start(1000)
    const t0 = performance.now()
    for (let k = 1; ; k++) {
      const due = k / PLAYER.VIDEO_FPS
      if (due >= loop) break
      await sleep(t0 + due * 1000 - performance.now())
      const t = (performance.now() - t0) / 1000
      if (t >= loop) break
      await draw(t)
      app.progress(t / loop)
      app.say(`Save video: recording ${t.toFixed(1)} s of ${loop} s (keep this tab in front)...`)
    }
    await sleep(t0 + loop * 1000 - performance.now())
    rec.stop()
    await stopped
    took = performance.now() - t0
  } finally {
    for (const track of stream.getTracks()) track.stop()
    stage.canvas.remove()
  }
  const type = mime.split(';')[0]
  let blob = new Blob(chunks, { type })
  if (!blob.size) return app.say('Save video: the browser recorded nothing.')
  if (type === 'video/webm') blob = new Blob([webmDuration(new Uint8Array(await blob.arrayBuffer()), took)], { type })
  const name = app.name(type === 'video/mp4' ? 'mp4' : 'webm')
  saveBlob(blob, name)
  app.say(`Saved ${name} (${stage.canvas.width}\u00d7${stage.canvas.height}, ${loop} s, ${fmtBytes(blob.size)}) to your downloads.`)
}

// ---------------------------------------------------------------- the page (the page only: DOM)

/**
 * The page's script: finds the drawing (the figure's svg), keeps its pristine markup (what Save SVG writes and every
 * frame bakes from), binds the four buttons and makes the format the page names (#mo-data's data-auto) at once. One
 * job at a time; every listener is bound here, the page has no on* attribute.
 */
function main() {
  const $ = (id) => document.getElementById(id)
  const status = $('mo-status')
  const say = (text) => { if (status) status.textContent = text }
  const svg = document.querySelector('#mo-stage svg')
  if (!svg) return say('This page has no drawing to save.')
  const pristine = new XMLSerializer().serializeToString(svg)
  const data = $('mo-data')
  const base = data ? data.getAttribute('data-name') : ''
  const bar = $('mo-progress')
  const bgOf = (el) => (el ? getComputedStyle(el).backgroundColor : '')
  const clearBg = (c) => !c || c === 'transparent' || /^rgba\(.*,\s*0(\.0*)?\)$/.test(c)
  let plan = null
  const app = {
    say,
    box: { width: svg.getAttribute('width'), height: svg.getAttribute('height'), viewBox: svg.getAttribute('viewBox') },
    bg: [bgOf(svg), bgOf(document.body)].find((c) => !clearBg(c)) || '#14120f',
    name: (ext) => saveName(base, ext),
    plan: () => (plan ??= bakePlan(pristine, MONTH.LOOP_SECONDS)),
    progress: (v) => { if (bar) { bar.hidden = false; bar.value = Math.min(1, Math.max(0, v)) } },
  }
  const saveSvg = async () => {
    const name = app.name('svg')
    saveBlob(new Blob([pristine + '\n'], { type: 'image/svg+xml' }), name)
    say(`Saved ${name} to your downloads.`)
  }
  const jobs = { png: savePng, gif: saveLoop, video: saveClip, svg: saveSvg }
  const buttons = MONTH.FORMATS.map((f) => [f, $(`mo-${f}`)]).filter(([, b]) => b)
  if ($('mo-export')) $('mo-export').hidden = false
  let busy = false
  const run = async (format) => {
    if (busy) return
    busy = true
    for (const [, b] of buttons) b.disabled = true
    try {
      await jobs[format](app)
    } catch (err) {
      say(`That did not work: ${err && err.message ? err.message : err}`)
    } finally {
      busy = false
      for (const [, b] of buttons) b.disabled = false
      if (bar) bar.hidden = true
    }
  }
  for (const [f, b] of buttons) b.addEventListener('click', () => run(f))
  const auto = autoFormat(data ? data.getAttribute('data-auto') : '')
  if (auto) run(auto)
  else say('Save it as a PNG, a GIF, a video or the SVG.')
}

// ---------------------------------------------------------------- the script

/** Every function the page runs: the kit, then these; main, last, calls the rest. */
const PARTS = [...KIT, scaleFor, saveName, autoFormat, savePng, saveLoop, saveClip, main]

/** The page's script with `tail` as its last statement (a test may end it with a `return` of the helpers). */
export function monthScript(tail = 'main()') {
  return scriptOf(PARTS, { PLAYER, MONTH }, tail)
}

/** The page's one inline script, started: its CSP hash is the sha256 of exactly this text. */
export const MONTH_JS = monthScript()
