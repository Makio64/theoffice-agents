#!/usr/bin/env node
// The promo editor: a small CapCut-style page to time the storyboards' shots and move their camera with keyframes.
// It serves promo/editor/ (the page), the drawings of promo/scenes.mjs, and each storyboard of promo/boards.mjs as a
// timeline: one clip per panel, its duration, the drawing's clock and the camera's keyframes. An edit is saved as
// promo/edits/<board>.json, the timeline the export films (promo/export.mjs, the page's Export button); with none
// saved, the storyboard's own timing and moves.
//   node promo/editor.mjs   → http://127.0.0.1:4517/
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scenes, size } from './scenes.mjs'
import { STORYBOARDS, PANEL_CSS, FONTS, backdrop, stageHtml } from './boards.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PAGE = path.join(HERE, 'editor')
const OUT = path.join(HERE, 'out')
const EDITS = path.join(HERE, 'edits')
const VIDEO = path.join(OUT, 'video')
const HOST = '127.0.0.1'
const PORT = 4517
const TRIES = 20
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp4': 'video/mp4' }

const svgs = scenes()
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d

// ---------------------------------------------------------------- a storyboard as a timeline

/** A panel's time as the sheet writes it: '1.5–3.5' (start and end), '0.35 s' (a start) or '4 s loop' (a length). */
function parseT(t) {
  const range = String(t).match(/(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)/)
  if (range) return { start: Number(range[1]), dur: Number(range[2]) - Number(range[1]) }
  const loop = String(t).match(/(\d+(?:\.\d+)?)\s*s loop/)
  if (loop) return { dur: Number(loop[1]) }
  const at = String(t).match(/^(\d+(?:\.\d+)?)\s*s$/)
  return at ? { start: Number(at[1]) } : {}
}

/** The camera's keyframes a panel's move asks for: a push in, a pull back, a tilt or a pan over the clip; else it holds. */
function moveKeys(move = '', layer, dur) {
  const [x, y] = layer.center
  const z = layer.zoom
  const d = round(140 / z, 1)
  const k = (t, o = {}) => ({ t: round(t), x, y, zoom: z, ease: 'inOut', ...o })
  if (/push in|zoom in/.test(move)) return [k(0, { zoom: round(z / 1.15) }), k(dur)]
  if (/pull back|unzoom/.test(move)) return [k(0, { zoom: z * 2 }), k(dur)]
  if (/tilt down|↓/.test(move)) return [k(0, { y: y - d }), k(dur, { y: y + d })]
  if (/tilt up|↑/.test(move)) return [k(0, { y: y + d }), k(dur, { y: y - d })]
  if (/→/.test(move)) return [k(0, { x: x - d }), k(dur, { x: x + d })]
  if (/←/.test(move)) return [k(0, { x: x + d }), k(dur, { x: x - d })]
  return [k(0)]
}

const camOf = (p) => p.layers.find((l) => l.center)
const baseOf = (p) => (camOf(p) ?? p.layers.find((l) => l.scene))?.time ?? 3

/** The storyboard's own timeline: one clip per panel, in order, with its timing, clock and moves. */
function derive(key) {
  const sb = STORYBOARDS[key]
  const times = sb.panels.map((p) => parseT(p.t))
  const clips = sb.panels.map((p, i) => {
    let { start, dur } = times[i]
    if (dur == null && start != null) {
      const next = times.slice(i + 1).find((q) => q.start != null)
      dur = next ? next.start - start : 1.5
    }
    dur = round(Math.max(0.1, dur ?? 1.5))
    const cam = camOf(p)
    // a panel's own keyframes ('end' is the clip's end), else the ones its move asks for
    const keys = !cam ? [] : p.keys ? p.keys.map((k) => ({ ease: 'inOut', ...k, t: k.t === 'end' ? dur : k.t })) : moveKeys(p.move, cam, dur)
    const fx = { in: p.fx?.in ?? 'none', out: p.fx?.out ?? 'none', dur: p.fx?.dur ?? 0.2 }
    return { panel: i, dur, sceneStart: baseOf(p), rate: p.rate ?? 1, keys, fx, captions: p.captions.map((c) => ({ ...c })) }
  })
  return { board: key, fps: 30, clips }
}

/** What the page draws each panel with: its layers' HTML (the camera's drawing marked data-cam), backdrop and notes. */
function panels(key) {
  return STORYBOARDS[key].panels.map((p, i) => {
    const cam = camOf(p)
    return {
      html: stageHtml(p, svgs), bg: backdrop(p), base: baseOf(p), frame: p.frame,
      cam: cam ? { scene: cam.scene, ...size(svgs[cam.scene]) } : null, thumb: `/out/${key}/panel-${i + 1}.png`,
      label: p.move || `shot ${i + 1}`, t: p.t, shot: p.shot, sound: p.sound ?? '', sounds: p.sounds ?? [],
    }
  })
}

async function saved(key) {
  try {
    const edit = JSON.parse(await fs.readFile(path.join(EDITS, `${key}.json`), 'utf8'))
    const n = STORYBOARDS[key].panels.length
    edit.clips = (edit.clips ?? []).filter((c) => Number.isInteger(c.panel) && c.panel >= 0 && c.panel < n)
    return edit.clips.length ? edit : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- the server

const json = (res, body, status = 200) => res.writeHead(status, { 'Content-Type': TYPES['.json'], 'Cache-Control': 'no-store' }).end(JSON.stringify(body))
const body = (req) => new Promise((resolve, reject) => {
  let s = ''
  req.on('data', (d) => { s += d; if (s.length > 5e6) reject(new Error('too big')) })
  req.on('end', () => resolve(s))
})

async function file(res, root, rel) {
  const f = path.join(root, rel)
  if (!f.startsWith(`${root}${path.sep}`)) throw new Error('outside')
  const data = await fs.readFile(f)
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(data)
}

// one export at a time (it holds a Chrome and ffmpeg busy): its board, how far it is, its file or its error
let job = null
function startExport(key, base) {
  job = { board: key, state: 'running', done: 0, total: 0, file: null, error: null, started: Date.now() }
  const mine = job
  // imported when needed: promo/export.mjs imports this server for its own command line
  import('./export.mjs')
    .then(({ exportVideo }) => exportVideo({ base, key, onProgress: (done, n) => Object.assign(mine, { done, total: n }) }))
    .then((r) => Object.assign(mine, { state: 'done', file: `/out/video/${path.basename(r.out)}?v=${Date.now()}`, path: path.relative(path.join(HERE, '..'), r.out), seconds: Math.round((Date.now() - mine.started) / 1000) }))
    .catch((e) => Object.assign(mine, { state: 'error', error: String(e.message ?? e) }))
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}`)
    const p = decodeURIComponent(url.pathname)
    if (p === '/') return await file(res, PAGE, 'index.html')
    if (p === '/api/boards') {
      return json(res, { css: PANEL_CSS, fonts: FONTS, boards: Object.entries(STORYBOARDS).map(([key, sb]) => ({ key, title: sb.title, meta: sb.meta, frame: sb.panels[0].frame })) })
    }
    const board = p.match(/^\/api\/board\/([a-z]+)$/)
    if (board) {
      const key = board[1]
      if (!STORYBOARDS[key]) return json(res, { error: 'no such board' }, 404)
      if (req.method === 'GET') {
        const edit = await saved(key)
        return json(res, { edit: edit ?? derive(key), isSaved: Boolean(edit), panels: panels(key), blips: STORYBOARDS[key].blips !== false })
      }
      if (req.method === 'POST') {
        const edit = JSON.parse(await body(req))
        await fs.mkdir(EDITS, { recursive: true })
        await fs.writeFile(path.join(EDITS, `${key}.json`), `${JSON.stringify({ ...edit, board: key }, null, 2)}\n`)
        return json(res, { ok: true })
      }
      if (req.method === 'DELETE') {
        await fs.rm(path.join(EDITS, `${key}.json`), { force: true })
        return json(res, { edit: derive(key) })
      }
    }
    const exp = p.match(/^\/api\/export\/([a-z]+)$/)
    if (exp) {
      const key = exp[1]
      if (!STORYBOARDS[key]) return json(res, { error: 'no such board' }, 404)
      if (req.method === 'POST') {
        if (job?.state === 'running') return json(res, { error: `already exporting ${job.board}`, job }, 409)
        startExport(key, `http://${req.headers.host}`)
        return json(res, { job })
      }
      // the last export on disk, for a board exported before this server started
      const file = path.join(VIDEO, `${key}.mp4`)
      const stat = await fs.stat(file).catch(() => null)
      const last = stat && { file: `/out/video/${key}.mp4?v=${stat.mtimeMs}`, path: path.relative(path.join(HERE, '..'), file), at: stat.mtimeMs }
      return json(res, { job: job?.board === key ? job : null, last })
    }
    const scene = p.match(/^\/scene\/([A-Za-z]+)\.svg$/)
    if (scene && svgs[scene[1]]) return res.writeHead(200, { 'Content-Type': TYPES['.svg'], 'Cache-Control': 'no-store' }).end(svgs[scene[1]])
    if (p.startsWith('/out/')) return await file(res, OUT, p.slice(5))
    return await file(res, PAGE, p.slice(1))
  } catch (e) {
    if (!res.headersSent) res.writeHead(404, { 'Cache-Control': 'no-store' }).end(String(e.message ?? 'Not found'))
  }
})

/** The server listening on `port` (0: any free one), or the next free port after it: { url, close }. */
export function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    let at = port
    server.on('error', (e) => {
      if (e.code !== 'EADDRINUSE' || !port || ++at >= port + TRIES) return reject(e)
      server.listen(at, HOST)
    })
    server.on('listening', () => resolve({ url: `http://${HOST}:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }))
    server.listen(at, HOST)
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { url } = await startServer()
  console.log(`The promo editor: ${url}/`)
}
