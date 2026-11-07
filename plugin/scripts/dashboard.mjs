#!/usr/bin/env node
// Browser host for Claude Code's terminal, Cursor, Antigravity, Codex and a regular browser. The first stdout line is
// always the ready URL.
// `--reuse` keeps one server for the machine: its address is kept in the cache (dashboard-ready.json, private) while it
// runs, and a second `--reuse` that finds it answering hands back that address on the tab asked for instead of starting
// another. A server started with it stops itself once no page has been open for IDLE_MINUTES (`--idle N` sets another).
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import { dashboardSelection, dashboardSelectionParams, startDashboard } from '../lib/dashboard.mjs'
import { defaultCacheDir } from '../lib/cache.mjs'

const IDLE_MINUTES = 30
const SELECTION_KEYS = ['view', 'range', 'back', 'quiet', 'zoom']

export function dashboardArgs(argv) {
  const options = { port: 0, open: false, detach: false, child: false, reuse: false, idleMs: 0 }
  const selection = new URLSearchParams()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--open') options.open = true
    else if (arg === '--detach') options.detach = true
    else if (arg === '--reuse') options.reuse = true
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
    } else throw new Error('Usage: node scripts/dashboard.mjs [--view live|today|week|month|work|timelapse] [--range yesterday|week|month] [--back N] [--quiet] [--zoom] [--port 0] [--open] [--detach] [--reuse] [--idle MINUTES]')
  }
  if (options.reuse && !argv.includes('--idle')) options.idleMs = IDLE_MINUTES * 60_000
  if (selection.size) options.selection = dashboardSelection(selection)
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

function keepReady(file, url) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.tmp`
  try { fs.writeFileSync(temporary, `${JSON.stringify({ url, pid: process.pid })}\n`, { mode: 0o600 });fs.renameSync(temporary, file) } finally { try { fs.unlinkSync(temporary) } catch {} }
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

export async function detachDashboard(port = 0, initialSelection = null, { reuse = false, idleMs = 0 } = {}) {
  const args = [fileURLToPath(import.meta.url), '--port', String(port), '--child']
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
    const timer = setTimeout(() => { child.kill(); finish(new Error('The Office did not start in time')) }, 10_000)
    const finish = (error, url) => {
      clearTimeout(timer)
      child.removeAllListeners('message');child.removeAllListeners('error');child.removeAllListeners('exit')
      if (child.connected) child.disconnect()
      child.unref()
      error ? reject(error) : resolve({ url, pid: child.pid })
    }
    child.once('error', (error) => finish(error))
    child.once('exit', () => finish(new Error('The Office could not start; the port may already be in use')))
    child.once('message', (message) => {
      try {
        const url = new URL(message?.url)
        if (message?.type !== 'ready' || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || !/^[\w-]{32}$/.test(url.searchParams.get('token') ?? '')) throw new Error()
        dashboardSelection(url.searchParams)
        finish(null, url.href)
      } catch { child.kill();finish(new Error('The Office returned an invalid address')) }
    })
  })
}

export async function main(argv = process.argv.slice(2)) {
  const options = dashboardArgs(argv)
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
