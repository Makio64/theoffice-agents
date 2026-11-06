#!/usr/bin/env node
// Browser host for Cursor, Antigravity, Codex and a regular browser. The first stdout line is always the ready URL.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { dashboardSelection, dashboardSelectionParams, startDashboard } from '../lib/dashboard.mjs'

export function dashboardArgs(argv) {
  const options = { port: 0, open: false, detach: false, child: false }
  const selection = new URLSearchParams()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--open') options.open = true
    else if (arg === '--detach') options.detach = true
    else if (arg === '--child' && typeof process.send === 'function') options.child = true
    else if (arg === '--quiet') selection.set('quiet', '1')
    else if (['--view', '--range', '--back'].includes(arg)) {
      const value = argv[++i]
      if (value == null || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      selection.set(arg.slice(2), value)
    }
    else if (arg === '--port') {
      const raw = argv[++i]
      if (!/^\d{1,5}$/.test(raw ?? '') || Number(raw) > 65535) throw new Error('--port must be an integer from 0 to 65535')
      options.port = Number(raw)
    } else throw new Error('Usage: node scripts/dashboard.mjs [--view live|today|week|month|work|timelapse] [--range yesterday|week|month] [--back N] [--quiet] [--port 0] [--open] [--detach]')
  }
  if (selection.size) options.selection = dashboardSelection(selection)
  return options
}

function openBrowser(url) {
  if (process.env.THEOFFICE_NO_OPEN === '1') return
  const [command, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]]
  const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true })
  child.on('error', () => process.stderr.write('The Office URL is ready; open it in your browser.\n'))
  child.unref()
}

export async function detachDashboard(port = 0, initialSelection = null) {
  const args = [fileURLToPath(import.meta.url), '--port', String(port), '--child']
  if (initialSelection != null) {
    const selected = dashboardSelection(dashboardSelectionParams(initialSelection))
    for (const field of ['view', 'range', 'back']) args.push(`--${field}`, String(selected[field]))
    if (selected.quiet) args.push('--quiet')
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
  if (options.detach) {
    const { url } = await detachDashboard(options.port, options.selection)
    process.stdout.write(`${url}\n`)
    if (options.open) openBrowser(url)
    return
  }
  const dashboard = await startDashboard({ port: options.port, initialSelection: options.selection })
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
