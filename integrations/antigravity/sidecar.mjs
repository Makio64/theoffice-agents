#!/usr/bin/env node
// Antigravity owns this process. The shared dashboard reads nothing until a pane requests a snapshot.
// Antigravity App 2.22 and newer draws it in its side pane, as Google's own plugin panes are drawn (sidecar.json
// `has_web_ui` and an AUX_PANE view): the App names the port to listen on (ANTIGRAVITY_SIDECAR_WEB_PORT) and frames the
// page with a token of its own (ANTIGRAVITY_SIDECAR_UI_TOKEN) and the conversation's id in the query. The same server
// still writes ready.json, for a link opened in the App's browser and for an older App that runs no pane.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
// The shared dashboard: lib/ sits beside integrations/ in the packaged bundle (scripts/package-plugin.mjs), and under
// plugin/ in the repository.
const LIB = fs.existsSync(new URL('../../lib/dashboard.mjs', import.meta.url)) ? '../../lib/' : '../../plugin/lib/'
const { startDashboard } = await import(`${LIB}dashboard.mjs`)

export const SIDECAR_ID = 'theoffice/office'
export const READY_SPEC = 'theoffice-antigravity/1'
const LOCK_SPEC = 'theoffice-antigravity-lock/1'

/** The pane the App asks for: its port and token, or null when it runs this sidecar with no pane (an older App). */
export function paneOf(env = process.env) {
  const raw = env.ANTIGRAVITY_SIDECAR_WEB_PORT
  if (!raw) return null
  const port = Number(raw)
  if (!/^\d{1,5}$/.test(raw) || port < 1 || port > 65535) throw new Error('ANTIGRAVITY_SIDECAR_WEB_PORT is not a port')
  const token = env.ANTIGRAVITY_SIDECAR_UI_TOKEN || env.ANTIGRAVITY_SIDECAR_AUTH_TOKEN || env.ANTIGRAVITY_SIDECAR_WEB_TOKEN || null
  return { port, token }
}

export function defaultDataDir() {
  return process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || path.join(os.homedir(), '.gemini/antigravity/sidecar_data', SIDECAR_ID, 'data')
}

export function privateDataDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (!fs.lstatSync(dir).isDirectory()) throw new Error('The Office data path must be a directory, not a symbolic link')
  fs.chmodSync(dir, 0o700)
}

export function atomicJson(file, data, mode = 0o600) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { mode, flag: 'wx' })
    fs.renameSync(temp, file)
  } finally { fs.rmSync(temp, { force: true }) }
}

function ownedJson(file, spec) {
  try {
    const stat = fs.lstatSync(file)
    if (!stat.isFile() || stat.size > 16_384) throw new Error('Invalid private Office runtime file')
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (data.spec !== spec) throw new Error('Unrecognized Office runtime file')
    return data
  } catch (error) { if (error.code === 'ENOENT') return null;throw error }
}

export function readReady(dataDir = defaultDataDir()) {
  const ready = ownedJson(path.join(dataDir, 'ready.json'), READY_SPEC)
  if (ready && (!Number.isSafeInteger(ready.pid) || ready.pid < 1 || ready.sidecarId !== SIDECAR_ID ||
      !/^http:\/\/127\.0\.0\.1:\d{1,5}\/\?token=[A-Za-z0-9_-]+$/.test(ready.url ?? '') || !Number.isFinite(Date.parse(ready.startedAt)) ||
      (ready.pane !== undefined && !/^\d{1,5}$/.test(String(ready.pane))))) {
    throw new Error('Invalid private Office endpoint')
  }
  return ready
}

function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false
  try { process.kill(pid, 0);return true } catch (error) { return error.code === 'EPERM' }
}

export async function readyIsLive(ready) {
  if (!ready || !alive(ready.pid)) return false
  try {
    const response = await fetch(ready.url, { redirect: 'error', signal: AbortSignal.timeout(1000) })
    return response.ok && response.headers.get('content-type')?.startsWith('text/html') && (await response.text()).includes('<title>The Office</title>')
  } catch { return false }
}

export async function stopReady(dataDir = defaultDataDir()) {
  const ready = readReady(dataDir)
  if (!await readyIsLive(ready)) return false
  const url = new URL('/shutdown', ready.url)
  url.searchParams.set('token', new URL(ready.url).searchParams.get('token'))
  const response = await fetch(url, { method: 'POST', headers: { Origin: url.origin }, redirect: 'error', signal: AbortSignal.timeout(3000) })
  return response.ok
}

export async function startSidecar({ dataDir = defaultDataDir(), start = startDashboard, pane = paneOf() } = {}) {
  privateDataDir(dataDir)
  const readyFile = path.join(dataDir, 'ready.json')
  const lockFile = path.join(dataDir, 'server.lock')
  const previous = readReady(dataDir)
  // a pane needs a server on the App's own port: an endpoint left by another run is never reused for it
  if (!pane && await readyIsLive(previous)) return { ...previous, reused: true, stop: async () => {} }
  const lock = ownedJson(lockFile, LOCK_SPEC)
  // the App's pane is served whatever else runs: its run takes the endpoint over, and the other cleans up only its own
  if (lock && alive(lock.pid) && !pane) throw new Error('The Office sidecar is already starting; try again shortly')
  if (lock) fs.unlinkSync(lockFile)
  if (previous) fs.unlinkSync(readyFile)
  fs.writeFileSync(lockFile, JSON.stringify({ spec: LOCK_SPEC, pid: process.pid }) + '\n', { flag: 'wx', mode: 0o600 })
  let dashboard
  const clean = () => {
    for (const [file, spec] of [[readyFile, READY_SPEC], [lockFile, LOCK_SPEC]]) {
      try { if (ownedJson(file, spec)?.pid === process.pid) fs.unlinkSync(file) } catch {}
    }
  }
  try {
    dashboard = await start(pane
      ? { port: pane.port, hostTokens: pane.token ? [pane.token] : [], hostParams: ['conversationId'], localhostAlias: true, stoppable: false }
      : { port: 0 })
    const ready = { spec: READY_SPEC, sidecarId: SIDECAR_ID, pid: process.pid, url: dashboard.url, startedAt: new Date().toISOString(), ...(pane ? { pane: pane.port } : {}) }
    atomicJson(readyFile, ready)
    let stopping
    const stop = () => stopping ??= Promise.resolve().then(async () => {
      clean()
      await dashboard.close()
      process.removeListener('exit', clean)
      process.removeListener('beforeExit', clean)
    })
    process.once('exit', clean)
    process.once('beforeExit', clean)
    return { ...ready, reused: false, stop }
  } catch (error) {
    clean()
    await dashboard?.close()
    throw error
  }
}

export async function main() {
  const sidecar = await startSidecar()
  process.stdout.write(sidecar.reused ? 'The Office sidecar is already ready.\n' : 'The Office sidecar is ready.\n')
  if (!sidecar.reused) {
    const stop = () => { sidecar.stop().catch(() => { process.exitCode = 1 }) }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`The Office: ${error.message}\n`);process.exitCode = 1 })
}
