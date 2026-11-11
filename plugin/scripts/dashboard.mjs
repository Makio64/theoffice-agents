#!/usr/bin/env node
// Browser host for Claude Code's terminal, Cursor, Antigravity, Codex and a regular browser. The first stdout line is
// always the ready URL.
// `--reuse` keeps one server for the machine: its address is kept in the cache (dashboard-ready.json, private) while it
// runs, and a second `--reuse` that finds it answering hands back that address on the tab asked for instead of starting
// another. A server started with it stops itself once no page has been open for IDLE_MINUTES (`--idle N` sets another).
// `--frame` is The Office on a screen of its own (lib/frame-page.mjs): a server of its own that also listens on the
// network, so a tablet or a picture frame opens the office full screen from an address and a QR code. Its link only
// looks. Its port and token are kept in ~/.cache/theoffice (frame.json, private), so the address a screen was given stays good
// across restarts; it never stops by itself. `--frame --stop` stops it, `--frame --new-link` replaces the link (every
// screen is asked for the new one), `--local` keeps it on this computer (to look at it before a screen is given the
// address), `--view` and `--rotate MINUTES` only change the address printed. `--status` starts nothing and says where the
// frame stands; `--json` answers in one line a program reads (the pane's Frame key, hooks/register.tsx) instead of words.
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dashboardSelection, dashboardSelectionParams, startDashboard } from '../lib/dashboard.mjs'
import { FRAME_VIEWS } from '../lib/frame-page.mjs'
import { qrTerminal } from '../lib/qr.mjs'
import { defaultCacheDir } from '../lib/cache.mjs'

const IDLE_MINUTES = 30
const SELECTION_KEYS = ['view', 'range', 'back', 'quiet', 'zoom']
/** A frame's port, DESK on a phone's keys, and how many after it are tried when another program holds it. */
const FRAME_PORT = 3375
const FRAME_PORTS = 10
/**
 * How long the frame's launcher waits on a computer busy with many agents (a start, a look at the one running, a stop):
 * a frame taken for gone while it only answers late would be started twice, on a port it already holds.
 */
const FRAME_WAIT = { start: 15_000, look: 4_000, stop: 8_000 }
const USAGE = 'Usage: node scripts/dashboard.mjs [--view live|today|week|month|work|timelapse] [--range yesterday|week|month] [--back N] [--quiet] [--zoom] [--port 0] [--open] [--detach] [--reuse] [--idle MINUTES]\n       node scripts/dashboard.mjs --frame [--view live|today|week|month|work] [--rotate MINUTES] [--port N] [--local] [--open] [--detach] [--stop] [--new-link] [--status] [--json]'

export function dashboardArgs(argv) {
  const options = { port: 0, open: false, detach: false, child: false, reuse: false, idleMs: 0 }
  // a frame's own flags, kept apart: `options.frame` is there only when --frame is
  const frame = { on: false, stop: false, newLink: false, local: false, status: false, json: false, rotate: 0 }
  const selection = new URLSearchParams()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--open') options.open = true
    else if (arg === '--detach') options.detach = true
    else if (arg === '--reuse') options.reuse = true
    else if (arg === '--frame') frame.on = true
    else if (arg === '--stop') frame.stop = true
    else if (arg === '--new-link') frame.newLink = true
    else if (arg === '--local') frame.local = true
    else if (arg === '--status') frame.status = true
    else if (arg === '--json') frame.json = true
    else if (arg === '--rotate') {
      const raw = argv[++i]
      if (!/^[1-9]\d{0,2}$/.test(raw ?? '')) throw new Error('--rotate takes whole minutes, 1 to 999')
      frame.rotate = Number(raw)
    }
    else if (arg === '--child' && typeof process.send === 'function') options.child = true
    else if (arg === '--quiet') selection.set('quiet', '1')
    else if (arg === '--zoom') selection.set('zoom', '1')
    else if (arg === '--idle') {
      const raw = argv[++i]
      if (!/^\d{1,4}$/.test(raw ?? '')) throw new Error('--idle takes whole minutes, 0 to never stop')
      options.idleMs = Number(raw) * 60_000
    }
    else if (['--view', '--range', '--back'].includes(arg)) {
      const value = argv[++i]
      if (value == null || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      selection.set(arg.slice(2), value)
    }
    else if (arg === '--port') {
      const raw = argv[++i]
      if (!/^\d{1,5}$/.test(raw ?? '') || Number(raw) > 65535) throw new Error('--port must be an integer from 0 to 65535')
      options.port = Number(raw)
    } else throw new Error(USAGE)
  }
  if (options.reuse && !argv.includes('--idle')) options.idleMs = IDLE_MINUTES * 60_000
  if (selection.size) options.selection = dashboardSelection(selection)
  if (frame.on) {
    // a frame is the drawing alone, of now, and its server one of its own that stays
    const { view = 'live', ...others } = options.selection ?? {}
    if (options.reuse || options.idleMs || !FRAME_VIEWS.includes(view) || Object.keys(others).some((key) => key !== 'range' && key !== 'back') || others.back) throw new Error(USAGE)
    delete options.selection
    // one thing at a time: where it stands, or stopped, or started (with a new link or not)
    if (frame.status && (frame.stop || frame.newLink || options.detach || options.open)) throw new Error(USAGE)
    options.frame = { view, rotate: frame.rotate, stop: frame.stop, newLink: frame.newLink, local: frame.local, status: frame.status, json: frame.json }
  } else if (frame.stop || frame.newLink || frame.local || frame.status || frame.json || frame.rotate) throw new Error(USAGE)
  return options
}

/** Where a `--reuse` server keeps its address while it runs: the plugin's private cache. */
export function readyFile(dir = defaultCacheDir()) {
  return path.join(dir, 'dashboard-ready.json')
}

/** The running server's address, when the ready file names one that answers; else null. */
export async function runningDashboard(file = readyFile(), { timeoutMs = 1500 } = {}) {
  let ready
  try {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.size > 4096) return null
    ready = JSON.parse(fs.readFileSync(file, 'utf8'))
    const url = new URL(ready?.url)
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/' || !/^[\w-]{32}$/.test(url.searchParams.get('token') ?? '')) return null
  } catch { return null }
  try {
    const answer = await fetch(ready.url, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) })
    return answer.ok ? ready.url : null
  } catch { return null }
}

/** The address on the tab asked for: the token kept, the selection replaced (none: the page opens where it was left). */
export function addressFor(url, selection = null) {
  const target = new URL(url)
  for (const key of SELECTION_KEYS) target.searchParams.delete(key)
  if (selection) for (const [key, value] of dashboardSelectionParams(selection)) target.searchParams.set(key, value)
  return target.href
}

/** A small private file of the cache, written whole or not at all. */
function keepPrivate(file, value) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.tmp`
  try { fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });fs.renameSync(temporary, file) } finally { try { fs.unlinkSync(temporary) } catch {} }
}

function keepReady(file, url) {
  keepPrivate(file, { url, pid: process.pid })
}

function forgetReady(file) {
  try { if (JSON.parse(fs.readFileSync(file, 'utf8'))?.pid === process.pid) fs.unlinkSync(file) } catch {}
}

function openBrowser(url) {
  if (process.env.THEOFFICE_NO_OPEN === '1') return
  const [command, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]]
  const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true })
  child.on('error', () => process.stderr.write('The Office URL is ready; open it in your browser.\n'))
  child.unref()
}

export async function detachDashboard(port = 0, initialSelection = null, { reuse = false, idleMs = 0, frame = false, newLink = false, local = false, timeoutMs = 10_000 } = {}) {
  const args = [fileURLToPath(import.meta.url), '--port', String(port), '--child']
  if (frame) args.push('--frame')
  if (frame && newLink) args.push('--new-link')
  if (frame && local) args.push('--local')
  if (reuse) args.push('--reuse')
  if (reuse || idleMs) args.push('--idle', String(Math.round(idleMs / 60_000)))
  if (initialSelection != null) {
    const selected = dashboardSelection(dashboardSelectionParams(initialSelection))
    for (const field of ['view', 'range', 'back']) args.push(`--${field}`, String(selected[field]))
    if (selected.quiet) args.push('--quiet')
    if (selected.zoom) args.push('--zoom')
  }
  const child = spawn(process.execPath, args, {
    detached: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
  })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); finish(new Error('The Office did not start in time')) }, timeoutMs)
    const finish = (error, url) => {
      clearTimeout(timer)
      child.removeAllListeners('message');child.removeAllListeners('error');child.removeAllListeners('exit')
      if (child.connected) child.disconnect()
      child.unref()
      error ? reject(error) : resolve({ url, pid: child.pid, ...(framed ? { frame: framed } : {}) })
    }
    let framed = null
    child.once('error', (error) => finish(error))
    child.once('exit', () => finish(new Error('The Office could not start; the port may already be in use')))
    child.once('message', (message) => {
      try {
        const url = new URL(message?.url)
        if (message?.type !== 'ready' || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || !/^[\w-]{32}$/.test(url.searchParams.get('token') ?? '')) throw new Error()
        dashboardSelection(url.searchParams)
        if (frame) {
          if (!Number.isInteger(message.frame?.port) || !/^\/frame\?token=[\w-]{32}$/.test(message.frame?.path ?? '')) throw new Error()
          framed = { port: message.frame.port, path: message.frame.path }
        }
        finish(null, url.href)
      } catch { child.kill();finish(new Error('The Office returned an invalid address')) }
    })
  })
}

// ---------------------------------------------------------------- the frame: the office on a screen of its own

/**
 * Where the frame's files are kept: one folder for the computer, `~/.cache/theoffice` (THEOFFICE_CACHE_DIR names another),
 * whoever starts the frame. Not the plugin data folder an agent may hand this script (CLAUDE_PLUGIN_DATA, which only
 * its own runs see): the pane's Frame key, the skill and a terminal must all find the one frame and its one link.
 */
export function frameDir(env = process.env) {
  return env.THEOFFICE_CACHE_DIR || path.join(os.homedir(), '.cache', 'theoffice')
}

/** Where a frame's link is kept for good, and where its running server keeps its own address (frameDir, private). */
export function frameFile(dir = frameDir()) {
  return path.join(dir, 'frame.json')
}
export function frameReadyFile(dir = frameDir()) {
  return path.join(dir, 'frame-ready.json')
}

/** A frame's link as it is kept, `{ token, port }`; null when none is, or it does not read as one. */
export function readFrameLink(file = frameFile()) {
  try {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.size > 4096) return null
    const { token, port } = JSON.parse(fs.readFileSync(file, 'utf8'))
    return /^[\w-]{32}$/.test(token ?? '') && Number.isInteger(port) && port > 0 && port <= 65535 ? { token, port } : null
  } catch { return null }
}

/**
 * The addresses a screen on the network opens a frame at: this computer's own (the home network's first, then any
 * other, a self-given one last), then its Bonjour name, which Apple devices find and which stays when the address
 * changes. `[0]` is the one the QR code carries: an address, since not every screen looks names up.
 */
export function frameAddresses(port, framePath, { interfaces = os.networkInterfaces(), hostname = os.hostname() } = {}) {
  const rank = (ip) => (/^192\.168\./.test(ip) ? 0 : /^10\./.test(ip) ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : /^169\.254\./.test(ip) ? 4 : 3)
  const ips = Object.values(interfaces).flatMap((list) => (list ?? []).filter((one) => one.family === 'IPv4' && !one.internal).map((one) => one.address))
  const name = String(hostname).replace(/\.(local|lan|home)$/i, '').toLowerCase()
  const names = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name) ? [`${name}.local`] : []
  return [...ips.sort((a, b) => rank(a) - rank(b)), ...names].map((host) => `http://${host}:${port}${framePath}`)
}

/** What `--frame` prints: the address alone on the first line, as every launch prints its own, then how to use it. */
export function frameWords(urls, { local, onLan = true, qr = qrTerminal } = {}) {
  if (!onLan) return `${local}\n\nThe Office's frame is running on this computer only (--local): open the address above here to see what a screen will show.\nRun --frame without --local to put it on your network, for a tablet or a picture frame.\n`
  if (!urls.length) return `${local}\n\nThe Office's frame is running, but this computer is on no network: only this computer can open it, at the address above.\nJoin the network your screen is on, then run --frame again for the address to give it.\n`
  const [first, ...others] = urls
  const named = (url) => (/\.local:/.test(url) ? `${url}\n      by name: Apple devices find it, and it stays good when this computer's address changes` : url)
  return [
    first,
    '',
    'The Office is on your network, for a screen to show full screen. The link only looks: it changes nothing.',
    '',
    ...[first, ...others].map((url) => `  ${named(url)}`),
    '',
    qr(first),
    '',
    "On an iPad: scan the code, then Share → Add to Home Screen hides Safari's bars. Set Auto-Lock to Never to keep it lit.",
    `A tap on the screen brings up its tabs. Add &view=week to open on one (${FRAME_VIEWS.join(', ')}), &rotate=5 to turn them every 5 minutes, &smooth=1 for gliding animation.`,
    "Anyone on this network who has the link sees your projects' names and what your agents are doing.",
    'If your computer asks whether node may accept incoming connections, allow it. The frame shows Closed while this computer sleeps.',
    'It runs until this computer restarts. To stop it: --frame --stop. To replace the link: --frame --new-link.',
    '',
  ].join('\n')
}

/**
 * `--frame --json`: where the frame stands in one line, for a program to read. `running`, whether it listens on the
 * network (`lan`), its `port` (the kept link's when it is not running, 0 with none), the addresses a screen opens it at
 * (`urls`, none off the network) and this computer's own (`local`, '' when it is not running).
 */
export function frameAnswer({ running = false, lan = false, port = 0, urls = [], local = '' } = {}) {
  return `${JSON.stringify({ spec: 'theoffice-frame/1', running, lan: running && lan, port, urls: running && lan ? urls : [], local: running ? local : '' })}\n`
}

/** Stops the server a ready file's address names (its own page's Stop, from here); true when it answered. */
async function stopDashboard(address) {
  try {
    const url = new URL(address)
    const target = new URL(`/shutdown?token=${url.searchParams.get('token')}`, url)
    const answer = await fetch(target, { method: 'POST', headers: { Origin: url.origin }, signal: AbortSignal.timeout(FRAME_WAIT.stop) })
    return answer.ok
  } catch { return false }
}

/** Whether the frame server a ready file names listens on the network (true unless it was started with --local). */
function readyOnLan(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8'))?.lan !== false } catch { return true }
}

async function startFrame(port, kept, lan) {
  const token = kept?.token ?? randomBytes(24).toString('base64url')
  // the port asked for, or the one this link was first given (a screen has its address), or the first free one after ours
  const ports = port ? [port] : kept?.port ? [kept.port] : Array.from({ length: FRAME_PORTS }, (_, i) => FRAME_PORT + i)
  for (const candidate of ports) {
    try { return await startDashboard({ port: candidate, frame: { token, lan } }) } catch (error) {
      if (error?.code !== 'EADDRINUSE') throw error
      if (candidate === ports.at(-1)) throw new Error(kept?.port && !port ? `port ${kept.port}, which your screens were given, is held by another program; stop it, or run --frame --port N for a new address` : `port ${candidate} is held by another program; try --port N`)
    }
  }
}

async function frameMain(options) {
  const dir = frameDir()
  const ready = frameReadyFile(dir)
  const { view, rotate, stop: isStopping, newLink, local: isLocal, status: isAsking, json: isJson } = options.frame
  const suffix = `${view === 'live' ? '' : `&view=${view}`}${rotate ? `&rotate=${rotate}` : ''}`
  // `--open` shows the frame here too, in this computer's browser: what the screen will show, before it is given the address
  const say = (frame, own, onLan = !isLocal) => {
    const local = `${new URL(own).origin}${frame.path}${suffix}`
    const urls = onLan ? frameAddresses(frame.port, `${frame.path}${suffix}`) : []
    process.stdout.write(isJson ? frameAnswer({ running: true, lan: onLan, port: frame.port, urls, local }) : frameWords(urls, { local, onLan }))
    if (options.open) openBrowser(local)
  }
  if (!options.child) {
    const running = await runningDashboard(ready, { timeoutMs: FRAME_WAIT.look })
    const link = readFrameLink(frameFile(dir))
    const off = () => frameAnswer({ port: link?.port ?? 0 })
    if (isStopping) {
      const stopped = running !== null && await stopDashboard(running)
      process.stdout.write(isJson ? off() : stopped ? "The Office's frame is stopped. Its link is kept: --frame starts it again at the same address.\n" : "The Office's frame was not running.\n")
      return
    }
    // asked where it stands: the one running as it runs (on the network or not), and nothing started
    if (isAsking) {
      if (running && link) return say({ port: Number(new URL(running).port), path: `/frame?token=${link.token}` }, running, readyOnLan(ready))
      process.stdout.write(isJson ? off() : "The Office's frame is not running: --frame starts it.\n")
      return
    }
    if (running && link && !newLink && readyOnLan(ready) === !isLocal && (!options.port || options.port === Number(new URL(running).port))) return say({ port: Number(new URL(running).port), path: `/frame?token=${link.token}` }, running)
    // a new link, a new port, the network joined or left, or a server whose link is lost: the one running makes room
    if (running && await stopDashboard(running)) await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (options.detach) {
    const { url, frame } = await detachDashboard(options.port, null, { frame: true, newLink, local: isLocal, timeoutMs: FRAME_WAIT.start })
    return say(frame, url)
  }
  const kept = readFrameLink(frameFile(dir))
  const dashboard = await startFrame(options.port, newLink ? (kept ? { port: kept.port } : null) : kept, !isLocal)
  try {
    keepPrivate(frameFile(dir), { token: new URL(dashboard.framePath, 'http://x').searchParams.get('token'), port: dashboard.port })
    keepPrivate(ready, { url: dashboard.url.split('&')[0], pid: process.pid, lan: !isLocal })
  } catch {}
  dashboard.whenClosed.then(() => forgetReady(ready))
  process.once('exit', () => forgetReady(ready))
  if (options.child) process.send({ type: 'ready', url: dashboard.url, frame: { port: dashboard.port, path: dashboard.framePath } })
  else say({ port: dashboard.port, path: dashboard.framePath }, dashboard.url)
  let stopping = false
  const stop = async () => { if (stopping) return;stopping = true;await dashboard.close() }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

export async function main(argv = process.argv.slice(2)) {
  const options = dashboardArgs(argv)
  if (options.frame) return frameMain(options)
  if (options.reuse && !options.child) {
    const running = await runningDashboard()
    if (running) {
      const url = addressFor(running, options.selection)
      process.stdout.write(`${url}\n`)
      if (options.open) openBrowser(url)
      return
    }
  }
  if (options.detach) {
    const { url } = await detachDashboard(options.port, options.selection, { reuse: options.reuse, idleMs: options.idleMs })
    process.stdout.write(`${url}\n`)
    if (options.open) openBrowser(url)
    return
  }
  const dashboard = await startDashboard({ port: options.port, initialSelection: options.selection, idleMs: options.idleMs })
  if (options.reuse) {
    const file = readyFile()
    try { keepReady(file, dashboard.url.split('&')[0]) } catch {}
    dashboard.whenClosed.then(() => forgetReady(file))
    process.once('exit', () => forgetReady(file))
  }
  if (options.child) process.send({ type: 'ready', url: dashboard.url })
  else process.stdout.write(`${dashboard.url}\n`)
  if (options.open) openBrowser(dashboard.url)
  let stopping = false
  const stop = async () => { if (stopping) return;stopping = true;await dashboard.close() }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

function isMain() {
  try { return fs.realpathSync(process.argv[1] ?? '') === fs.realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
}
if (isMain()) main().catch((error) => { process.stderr.write(`The Office: ${error.message}\n`);process.exitCode = 1 })
