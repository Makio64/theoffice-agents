#!/usr/bin/env node
// The Office's headcount as one status line, `🏢 1 hand up · 5 working · 2 interns`: the line Claude Code's pane keeps in
// its status line, for every host that runs a command for its own (Cursor's CLI, Antigravity's CLI, GitHub Copilot's
// CLI, a Claude Code status line of your own) and for the editor extension's status bar item.
//
// A status line runs often and must answer at once, so this never collects anything itself. It reads the answer the
// collector shares in the cache folder (<cache>/shared/all.json, which every pane, dashboard and status line of the
// machine leaves there) and draws it. When that answer is more than a minute old it starts one refresh in the
// background and prints what it has: the next call shows the fresh one. A machine with no answer yet gets a line that
// says the office is being read.
//
//   node scripts/statusline.mjs [--width N] [--ascii] [--json]
//
// --width N  columns the line may take (default 80); groups drop from the right to fit
// --ascii    7-bit characters only
// --json     `{ text, at, stale, desks, asking, errors, working, interns }` for a host that styles its own item
//
// The host's session JSON on stdin is not read: the line is the whole machine's. stdout carries the line only; the
// exit code is always 0.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defaultCacheDir } from '../lib/cache.mjs'

/** How old the shared answer may be before a refresh starts: the pane's own cadence while it is closed. */
export const FRESH_MS = 60_000
/** A refresh started this recently is not started again, however often the host asks. */
const RESTART_MS = 30_000
/** No run lives longer than this (office.mjs LOCK_MAX_MS): an older lock is nobody's. */
const LOCK_MAX_MS = 11 * 60e3
/** The most a shared answer may weigh to be read here. */
const MAX_BYTES = 32 * 1024 * 1024
const OFFICE = fileURLToPath(new URL('./office.mjs', import.meta.url))
const SELF = fileURLToPath(import.meta.url)

export function statusArgs(argv) {
  const o = { width: 80, ascii: false, json: false, refresh: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--ascii') o.ascii = true
    else if (a === '--json') o.json = true
    else if (a === '--width' && /^\d{1,4}$/.test(argv[i + 1] ?? '')) o.width = Math.max(20, Number(argv[++i]))
    else if (a === '--refresh' && /^\d{1,16}$/.test(argv[i + 1] ?? '')) o.refresh = Number(argv[++i])
  }
  return o
}

/** Where the collector shares the whole office's facts (office.mjs sharedFile('all')). */
export function sharedAll(env = process.env) {
  return path.join(path.resolve(defaultCacheDir(env)), 'shared', 'all.json')
}

/** The shared facts and the moment their run began (the file's mtime), or null when there are none to read. */
export function readShared(file) {
  try {
    const st = fs.statSync(file, { throwIfNoEntry: false })
    if (!st?.isFile() || st.size > MAX_BYTES) return null
    const facts = JSON.parse(fs.readFileSync(file, 'utf8'))
    return facts?.live && Array.isArray(facts.live.desks) ? { facts, at: Math.round(st.mtimeMs) } : null
  } catch {
    return null
  }
}

/** Whether a run holds the shared answer's lock: its process alive, and no older than a run can be (office.mjs lockHeld). */
function lockHeld(lock) {
  try {
    if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_MAX_MS) return false
    const pid = Number(fs.readFileSync(lock, 'utf8'))
    if (!(pid > 0)) return false
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err?.code === 'EPERM'
  }
}

/**
 * Starts one refresh of the shared answer in the background, unless a run is under way or this started one a moment
 * ago. The refresh is this script again, detached, waiting on office.mjs: a run for the pane stops once its parent is
 * gone, so its parent must outlive it. Returns whether one was started.
 */
export function startRefresh(file, now = Date.now(), { spawnRefresh = defaultSpawn } = {}) {
  if (lockHeld(`${file}.lock`)) return false
  const marker = path.join(path.dirname(file), 'statusline.refresh')
  try {
    const st = fs.statSync(marker, { throwIfNoEntry: false })
    if (st && now - st.mtimeMs < RESTART_MS) return false
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    fs.writeFileSync(marker, `${process.pid}\n`, { mode: 0o600 })
  } catch {
    return false
  }
  try { spawnRefresh(now) } catch { return false }
  return true
}

function defaultSpawn(since) {
  const child = spawn(process.execPath, [SELF, '--refresh', String(since)], { detached: true, stdio: 'ignore', windowsHide: true })
  child.unref()
}

/** The background refresh: one shared run of the whole office, begun at `since` or later. */
async function refresh(since) {
  const child = spawn(process.execPath, [OFFICE, 'all', '--json', '--since', String(since)], { stdio: 'ignore', windowsHide: true })
  await new Promise((resolve) => { child.once('exit', resolve);child.once('error', resolve) })
}

/** The line, and the counts a host styles its item with, from the shared answer as it is now. */
export async function statusLine({ width = 80, ascii = false, env = process.env, now = Date.now(), spawnRefresh } = {}) {
  const file = sharedAll(env)
  const shared = readShared(file)
  const stale = !shared || now - shared.at > FRESH_MS
  if (stale) startRefresh(file, now, spawnRefresh ? { spawnRefresh } : undefined)
  if (!shared) {
    const text = ascii ? '[office] reading your agents...' : '🏢 reading your agents…'
    return { text, at: null, stale: true, desks: 0, asking: 0, errors: 0, working: 0, interns: 0 }
  }
  const { renderStatus, statusCounts } = await import('../lib/ascii.mjs')
  return { text: renderStatus(shared.facts, { width, ascii }), at: shared.at, stale, ...statusCounts(shared.facts) }
}

export async function main(argv = process.argv.slice(2)) {
  const o = statusArgs(argv)
  if (o.refresh != null) return refresh(o.refresh)
  // a host that writes its session JSON and waits for us to read it must not block: take it and drop it
  if (!process.stdin.isTTY) { process.stdin.on('error', () => {});process.stdin.resume() }
  const line = await statusLine(o)
  process.stdout.write(o.json ? `${JSON.stringify(line)}\n` : `${line.text}\n`)
  process.exit(0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  main().catch(() => { process.stdout.write('🏢 The Office\n');process.exit(0) })
}
