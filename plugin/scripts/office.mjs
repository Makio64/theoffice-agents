#!/usr/bin/env node
// theoffice CLI: `node scripts/office.mjs [live|today|week|month|work|all] [--json] [--width N] [--back N] …`
// Collects the facts, then draws them as the pixel-art office where every agent is Clawd: the block-glyph office as
// text, --json facts, --svg, --pixel (the SVG written to a file, its path printed), --html page or a --watch loop.
// --back N turns today, the week or the month N pages into the past, with no limit (`today --back 1`: yesterday, `week
// --back 1`: last Monday to Sunday, `month --back 1`: last calendar month; lib/period.mjs).
// --first-light is the desktop mod's on a machine's first open: the live floor alone, in about a second, while the
// run after it reads the week (collect `firstLight`).
// `timelapse [yesterday|week|month]` replays that range slot by slot in the same outputs, and --export keeps the replay's
// page and SVG in the cache folder (--open then shows the page in the browser).
// `month [--back N] --export <calendar|directory|whole|stats> --as <format>` keeps one room of the month's drawing, all of
// it, or its full stats in the cache folder: the SVG itself, or a page that saves it as a PNG, a GIF or a video in the
// browser; the stats as a page, CSV or JSON. --open then opens the page or shows the file in its folder. --stdin takes
// the facts to draw from standard input (the pane's, the page on screen), else they are collected.
// `--json --since MS` is the desktop mod's: every session of the machine asks for the same facts, so one run answers them
// all, through a file they can read with no process (sharedFile, sharedRun).
// stdout carries the output only; stderr stays silent unless --debug. Always exits 0 (the skill's `!` block pastes
// whatever we print).
import fs from 'node:fs'
import module from 'node:module'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { defaultCacheDir } from '../lib/cache.mjs'

// V8 keeps what it compiled, ~30 ms off every run. It only reaches what loads after it, so the rest comes by import().
module.enableCompileCache?.(path.join(defaultCacheDir(), 'compile'))
const { SPEC, VIEWS, collect, progressOf, resolveRange } = await import('../lib/collect.mjs')
const { renderOffice, toAnsi, toPlain } = await import('../lib/ascii.mjs')

// What renderHtml writes in every page's <head>: the only kind of existing file `--html` will replace.
const PAGE_MARK = '<meta name="generator" content="theoffice">'
// CSS px of the --svg and --pixel drawings: wide enough that the rooms, the tower and the departments read at a glance
const PIXEL_WIDTH = 960
/**
 * The pixel-art scenes an --html page shows for each view, top to bottom, each over its own text: the live floor first
 * (a `live` range is today, so its page adds today's time clock), then the range's own picture, then what they did.
 */
const HTML_SCENES = {
  all: ['live', 'week', 'work'], week: ['live', 'week', 'work'], month: ['live', 'month', 'work'], today: ['live', 'today'],
  live: ['live', 'today'], work: ['work'],
}
// --watch redraws once a second: each frame swaps the typing hands, monitor flicker, steam and snores in place
const WATCH_MS = 1000
// ...and reads the facts again every 5 s, so the floor keeps up with the agents
const REFRESH_MS = 5000
// The words that switch to the timelapse, and the ranges it replays: yesterday in quarters of an hour, the last 7 days
// hour by hour, the last 30 days in 4-hour slots. The week unless a range word or --range says otherwise.
const LAPSE_MODE = ['timelapse', 'lapse']
const LAPSE_RANGES = ['yesterday', 'week', 'month']
// What the Month's export keeps (`month --export <part>`): a room of its drawing, all of it, or its stats; and the
// formats each may be kept as (`--as`), the first the default. A PNG, a GIF and a video are made by the page in the
// browser (MONTH_IN_BROWSER); the rest are written as they are.
const MONTH_PARTS = ['calendar', 'directory', 'whole', 'stats']
const MONTH_FORMATS = {
  calendar: ['png', 'svg', 'gif', 'video'], directory: ['png', 'svg', 'gif', 'video'], whole: ['png', 'svg', 'gif', 'video'], stats: ['html', 'csv', 'json'],
}
const MONTH_IN_BROWSER = ['png', 'gif', 'video']
// The most the pane's facts on --stdin may weigh
const STDIN_MAX = 16 * 1024 * 1024
// The words that are never --html's file name: a view, or the timelapse and its ranges, said after the flag
const KEYWORDS = [...new Set([...VIEWS, ...LAPSE_MODE, ...LAPSE_RANGES])]
// A run for the pane waits this long for the one under way before answering what there is: under the pane's 20 s
// (THEOFFICE_SHARE_WAIT_MS sets it, so the tests need not sit it out)
const SHARE_WAIT_MS = 15_000
const SHARE_POLL_MS = 20
// No run lives longer than this (the pane's longest wait is 10 minutes): a lock older than that is nobody's
const LOCK_MAX_MS = 11 * 60e3
// The pages of the past have no end, and each shared answer is a file: the newest this many stay
const MAX_SHARED_PAGES = 12
// A shared answer of a page of the past, by its first day (`month-2026-08-01.json`), or as 0.8.6 named one (`month-1.json`),
// and its lock
const PAGE_FILE_RE = /^[a-z]+-(?:\d+|\d{4}-\d\d-\d\d)\.json$/
const PAGE_LOCK_RE = /^([a-z]+-(?:\d+|\d{4}-\d\d-\d\d)\.json)\.lock$/
// What a run of a page said of how far it had read, left behind by a run that was killed
const PAGE_PROGRESS_RE = /^([a-z]+-(?:\d+|\d{4}-\d\d-\d\d))\.progress\.json$/

// ---------------------------------------------------------------- args

/**
 * Parse argv defensively: `$ARGUMENTS` arrives verbatim, so words may be glued together ("week --json"
 * as one arg), slashes or odd casing may appear, and unknown words are ignored rather than fatal.
 * The word `timelapse` (or `lapse`) sets `o.timelapse` to the range it replays: a range word anywhere (`yesterday`,
 * `week`, `month`), or `--range R`, which wins; the week by default. Outside the timelapse a range word is what it
 * always was (`week` and `month` the views, `yesterday` an unknown word), and --range, --export and --open do nothing.
 * `--export` followed by one of MONTH_PARTS (calendar, directory, whole, stats) is the Month's export (`o.part`, the
 * `month` view), kept as `--as` says (MONTH_FORMATS; the part's first when unsaid or not its own); `--stdin` reads the
 * facts it draws from standard input.
 */
export function parseArgs(argv, { isTTY = false, columns = 0, env = process.env } = {}) {
  const words = argv.flatMap((a) => String(a ?? '').split(/\s+/)).filter(Boolean)
  const o = {
    view: 'all', json: false, html: null, svg: false, pixel: false, width: null, widthGiven: false, color: null, colors: 256, ascii: false,
    watch: false, project: null, git: true, novi: true, cache: true, debug: false, agents: null, timelapse: null, export: false, open: false,
    back: 0, since: null, firstLight: false, part: null, as: null, stdin: false,
  }
  let lapse = false
  let rangeWord = null
  let rangeFlag = null
  for (let i = 0; i < words.length; i++) {
    const raw = words[i]
    const [flag, inline] = raw.startsWith('--') && raw.includes('=') ? [raw.slice(0, raw.indexOf('=')), raw.slice(raw.indexOf('=') + 1)] : [raw, null]
    const next = () => inline ?? (words[i + 1] != null && !words[i + 1].startsWith('--') ? words[++i] : null)
    const word = flag.replace(/^\/+/, '').toLowerCase()
    // `week` and `month` are views and ranges both: the view they set matters only outside the timelapse
    if (LAPSE_RANGES.includes(word)) rangeWord = word
    if (VIEWS.includes(word)) o.view = word
    else if (LAPSE_MODE.includes(word)) lapse = true
    else if (flag === '--json') o.json = true
    else if (flag === '--svg') o.svg = true
    else if (flag === '--pixel') o.pixel = true
    else if (flag === '--export') {
      o.export = true
      const peek = String(inline ?? words[i + 1] ?? '').replace(/^\/+/, '').toLowerCase()
      if (MONTH_PARTS.includes(peek)) {
        o.part = peek
        if (inline == null) i++
      }
    } else if (flag === '--as') o.as = String(next() ?? '').replace(/^\/+/, '').toLowerCase()
    else if (flag === '--stdin') o.stdin = true
    else if (flag === '--open') o.open = true
    else if (flag === '--range') {
      const r = String(next() ?? '').replace(/^\/+/, '').toLowerCase()
      if (LAPSE_RANGES.includes(r)) rangeFlag = r
    } else if (flag === '--html') {
      const peek = inline ?? words[i + 1]
      o.html = peek && !peek.startsWith('--') && !KEYWORDS.includes(peek.toLowerCase()) ? (inline ?? words[++i]) : true
    } else if (flag === '--width') {
      const n = Number.parseInt(next() ?? '', 10)
      if (Number.isFinite(n)) { o.width = Math.max(40, Math.min(400, n)); o.widthGiven = true }
    } else if (flag === '--back') {
      const n = Number.parseInt(next() ?? '', 10)
      if (Number.isSafeInteger(n)) o.back = Math.max(0, n)
    } else if (flag === '--since') {
      const n = Number(next() ?? '')
      if (Number.isFinite(n)) o.since = n
    } else if (flag === '--color') o.color = true
    else if (flag === '--no-color') o.color = false
    else if (flag === '--ascii') o.ascii = true
    else if (flag === '--watch') o.watch = true
    else if (flag === '--project') o.project = next()
    else if (flag === '--agents') o.agents = next()
    else if (flag === '--claude-only') o.agents = 'claude'
    else if (flag === '--no-git') o.git = false
    else if (flag === '--no-novi') o.novi = false
    else if (flag === '--no-cache') o.cache = false
    else if (flag === '--debug') o.debug = true
    else if (flag === '--first-light') o.firstLight = true
  }
  if (lapse) o.timelapse = rangeFlag ?? rangeWord ?? 'week'
  // the Month's export draws the month, whatever view was said; in the timelapse a part means nothing
  if (o.timelapse) o.part = null
  if (o.part) {
    o.view = 'month'
    o.as = MONTH_FORMATS[o.part].includes(o.as) ? o.as : MONTH_FORMATS[o.part][0]
  } else o.as = null
  o.width ??= isTTY && columns > 0 ? Math.max(60, Math.min(140, columns)) : 100
  o.colors = looks16Color(env) ? 16 : 256
  // explicit flag > FORCE_COLOR > NO_COLOR (any non-empty value, per no-color.org) > is stdout a real terminal
  if (o.color == null) {
    if (env.FORCE_COLOR != null) o.color = !['0', 'false'].includes(String(env.FORCE_COLOR).toLowerCase())
    else if (env.NO_COLOR) o.color = false
    else o.color = isTTY && env.TERM !== 'dumb'
  }
  return o
}

/**
 * True when the terminal looks 16-color only: TERM is exactly a linux console, vt100/vt220, plain xterm (or
 * xterm-color, xterm-16color), screen (or a screen.* name without 256color) or dumb, and no COLORTERM says better.
 * Clawd's orange is 256-color (38;5;173), which such a terminal prints wrong or not at all, so toAnsi then keeps to the
 * 16-color palette. Whole names only: xterm-kitty, xterm-ghostty and other xterm-* terminals draw 256 colors and more,
 * and lose COLORTERM over plain ssh or env-scrubbing wrappers.
 */
export function looks16Color(env = process.env) {
  if (env.COLORTERM) return false
  const term = String(env.TERM ?? '').toLowerCase()
  return /^(linux|vt100|vt220|xterm|xterm-color|xterm-16color|screen(\.[\w.-]+)?|dumb)$/.test(term) && !/256color|direct/.test(term)
}

// ---------------------------------------------------------------- render

/**
 * Facts → the text we print: the block-glyph office (lib/ascii.mjs), colored when the terminal wants it. Exported as
 * the single swap point so tests and the watch loop draw exactly what a one-shot run prints.
 */
export function render(facts, opts = {}) {
  const lines = renderOffice(facts, { view: opts.view ?? 'all', width: opts.width ?? 100, frame: opts.frame ?? 0, ascii: !!opts.ascii, project: opts.project ?? undefined })
  return paint(lines, opts)
}

/**
 * The timelapse's text, drawn by `mod` (lib/ascii-timelapse.mjs, loaded only for a timelapse): the still of the whole
 * range and its busiest slot, or given a `frame` that frame of the replay (--watch counts them up).
 */
function renderLapse(mod, facts, opts = {}) {
  return paint(mod.renderTimelapseText(facts, { width: opts.width ?? 100, frame: opts.frame ?? null, ascii: !!opts.ascii }), opts)
}

/** Text lines as printed: ANSI colors when the terminal wants them (its 16 only on a 16-color terminal), else plain. */
function paint(lines, opts) {
  return `${opts.color ? toAnsi(lines, { colors: opts.colors === 16 ? 16 : 256 }) : toPlain(lines)}\n`
}

/** Columns for a terminal of `columns` width: the art is designed for 60..140. */
function fitColumns(columns, fallback = 100) {
  return columns > 0 ? Math.max(60, Math.min(140, columns)) : fallback
}

/**
 * Optional renderers are loaded lazily: the svg / html modules are only needed for --svg / --html, and a missing or
 * broken one must cost a one-line message, not the whole CLI.
 */
async function load(name, o) {
  try {
    return await import(`../lib/${name}.mjs`)
  } catch (err) {
    if (o.debug) process.stderr.write(`[theoffice] lib/${name}.mjs failed to load: ${err?.stack ?? err}\n`)
    return null
  }
}

const NO_SVG = 'The Office has no SVG renderer here (lib/svg.mjs is missing).\n'
const NO_LAPSE = 'The Office has no timelapse renderer here (lib/ascii-timelapse.mjs is missing).\n'
const NO_PAGE = 'The Office has no timelapse page here (lib/timelapse-page.mjs is missing).\n'

/**
 * The pixel-art drawing --svg, --pixel and --export make, as a function of the facts, or null when lib/svg.mjs cannot
 * make it: the asked view (`all` = the live building), or in the timelapse the replay of its range. Opaque, as --html
 * is: a file or a page has no pane behind it to stand on.
 */
async function svgDrawer(o) {
  const mod = await load('svg', o)
  if (o.timelapse) return typeof mod?.renderTimelapse === 'function' ? (facts) => mod.renderTimelapse(facts, { width: PIXEL_WIDTH }) : null
  return typeof mod?.renderSvg === 'function' ? (facts) => mod.renderSvg(facts, { view: o.view, width: PIXEL_WIDTH, animate: true }) : null
}

/** `--svg`: the asked view, or the timelapse, as one animated pixel-art SVG on stdout. */
async function printSvg(facts, o) {
  const draw = await svgDrawer(o)
  if (!draw) return void process.stdout.write(NO_SVG)
  process.stdout.write(`${draw(facts)}\n`)
}

/** Where `--pixel` keeps the drawing of `view`: `<cache dir>/pixel/office-<view>.svg`, one file per view. */
export function pixelFile(view, env = process.env) {
  return path.join(path.resolve(defaultCacheDir(env)), 'pixel', `office-${VIEWS.includes(view) ? view : 'all'}.svg`)
}

/**
 * Where the timelapse of `range` is kept, next to the views' drawings: `<cache dir>/pixel/timelapse-<range>.svg` (from
 * --pixel and --export) and `.html` (its page, from --export), one pair per range.
 */
export function lapseFile(range, ext = 'svg', env = process.env) {
  const name = `timelapse-${LAPSE_RANGES.includes(range) ? range : 'week'}.${ext === 'html' ? 'html' : 'svg'}`
  return path.join(path.resolve(defaultCacheDir(env)), 'pixel', name)
}

/**
 * Where the answer of a run for the pane is kept: `<cache dir>/shared/<view>.json`, or for a page of the past
 * `<view>-<its first day>.json` (shareKey).
 */
export function sharedFile(key, env = process.env) {
  return path.join(path.resolve(defaultCacheDir(env)), 'shared', `${key}.json`)
}

/** Where the run making a shared answer says how far it has read (collect `progress`): `<key>.progress.json` beside it. */
export function progressFile(file) {
  return file.replace(/\.json$/, '.progress.json')
}

/**
 * Write `text` to `file` the way every file the CLI keeps in its cache folder is written: replaced atomically (a fresh
 * temp file renamed over it), so a viewer never reads half a drawing; the folder kept private (0700) and the file 0600,
 * since a drawing names projects and session titles. A symlinked folder is refused rather than followed. Throws an
 * error whose `code` ends the sentence the caller prints. `mtimeMs`: the file's time, instead of the moment it was written.
 */
function writePrivate(file, text, mtimeMs) {
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const st = fs.lstatSync(dir)
  if (!st.isDirectory()) throw Object.assign(new Error(`${dir} is not a folder`), { code: st.isSymbolicLink() ? 'a symlink' : 'ENOTDIR' })
  if ((st.mode & 0o777) !== 0o700) fs.chmodSync(dir, 0o700)
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now().toString(36)}.tmp`)
  try {
    fs.writeFileSync(tmp, text, { mode: 0o600, flag: 'wx' })
    if (mtimeMs != null) fs.utimesSync(tmp, mtimeMs / 1000, mtimeMs / 1000)
    fs.renameSync(tmp, file)
  } catch (err) {
    try { fs.unlinkSync(tmp) } catch {}
    throw err
  }
}

/** The one line a file that could not be written gets on stdout; the error itself goes to stderr with --debug only. */
function cannotWrite(file, err, o, what) {
  if (o.debug) process.stderr.write(`[theoffice] ${what} failed: ${err?.stack ?? err}\n`)
  process.stdout.write(`The Office could not write ${file} (${err?.code ?? 'write failed'}).\n`)
}

/**
 * `--pixel`: draw the asked view (or the timelapse) as pixel art into its pixelFile (lapseFile) and print only that
 * file's absolute path, so the office skill can hand the picture to a tool that shows files (a chat cannot draw an SVG
 * pasted as text). Written privately and atomically (writePrivate).
 */
async function writePixel(facts, o) {
  const file = o.timelapse ? lapseFile(o.timelapse, 'svg') : pixelFile(o.view)
  const draw = await svgDrawer(o)
  if (!draw) return void process.stdout.write(NO_SVG)
  try {
    writePrivate(file, `${draw(facts)}\n`)
  } catch (err) {
    return cannotWrite(file, err, o, 'pixel write')
  }
  process.stdout.write(`${file}\n`)
}

/**
 * The CSP token that lets the timelapse page run its one script: 'sha256-<base64>' of the player's source exactly as the
 * page inlines it (renderTimelapsePage quotes it into script-src). Hashed here: the page module is pure, no node:crypto.
 */
export function playerHash(js) {
  return `sha256-${process.getBuiltinModule('node:crypto').createHash('sha256').update(String(js)).digest('base64')}`
}

/**
 * The timelapse's drawing (renderTimelapse, opaque, 960 px) and its page (renderTimelapsePage: that drawing inline, the
 * player and the GIF / video / SVG export, its script allowed by playerHash), or null once it has said which renderer
 * is missing.
 */
async function lapseDrawings(facts, o) {
  const draw = await svgDrawer(o)
  const mod = draw && await load('timelapse-page', o)
  const missing = !draw ? NO_SVG : typeof mod?.renderTimelapsePage !== 'function' || typeof mod.PLAYER_JS !== 'string' ? NO_PAGE : null
  if (missing) {
    process.stdout.write(missing)
    return null
  }
  const svg = draw(facts)
  return { svg, page: mod.renderTimelapsePage({ svg, facts, scriptHash: playerHash(mod.PLAYER_JS) }) }
}

/**
 * `--export`: the timelapse's page and its drawing side by side in the cache folder (lapseFile's .html and .svg, each
 * written like --pixel's file), their absolute paths printed in that order, one a line, for the pane's Export button.
 * The page is the one to open: it plays the replay and saves it as a GIF, a video or the SVG, all in the browser.
 * `--open` then shows the page in the default browser, once both are written.
 */
async function exportLapse(facts, o) {
  const made = await lapseDrawings(facts, o)
  if (!made) return
  const page = lapseFile(o.timelapse, 'html')
  let pageWritten = false
  for (const [file, text] of [[page, made.page], [lapseFile(o.timelapse, 'svg'), `${made.svg}\n`]]) {
    try {
      writePrivate(file, text)
    } catch (err) {
      cannotWrite(file, err, o, 'export write')
      continue
    }
    process.stdout.write(`${file}\n`)
    if (file === page) pageWritten = true
  }
  if (pageWritten && o.open) openPage(page, o)
}

// ---------------------------------------------------------------- the Month's export

/**
 * What the files of a month's export are called: `month-<key>-<part>`, the key the month's calendar name
 * (`2026-10`) when its days are one whole calendar month, else its first and last day (`2026-10-01-to-2026-11-03`, the
 * Month of now: last month and this one so far); the day of the facts when they name no days.
 */
export function monthName(facts, part) {
  const ymd = /^\d{4}-\d{2}-\d{2}$/
  const days = (Array.isArray(facts?.range?.days) ? facts.range.days : []).filter((d) => ymd.test(String(d))).sort()
  const first = days[0]
  const last = days.at(-1)
  const end = first && new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0)).toISOString().slice(0, 10)
  const key = !first ? (ymd.test(String(facts?.now?.local_date)) ? facts.now.local_date : 'now')
    : first.endsWith('-01') && last === end ? first.slice(0, 7) : `${first}-to-${last}`
  return `month-${key}-${MONTH_PARTS.includes(part) ? part : 'whole'}`
}

/** Where a month's export keeps its file, beside the timelapse's: `<cache dir>/pixel/<monthName>.<ext>`. */
export function monthFile(name, ext, env = process.env) {
  return path.join(path.resolve(defaultCacheDir(env)), 'pixel', `${name}.${ext}`)
}

/** What a month's export says the room is, for a reader that cannot see it: the room, then the month's name. */
const MONTH_ALT = { calendar: 'the wall calendar', directory: 'the building directory', whole: 'the month' }

/**
 * `month --export <part> --as <format>`: the month's facts kept as asked, in the cache folder (monthFile, written like
 * --pixel's file), its absolute path printed alone on the first line, for the pane's Export. A room or the whole month
 * as SVG is the drawing itself (cropRoom on renderSvg's month); as PNG, GIF or video it is the export page
 * (lib/month-page.mjs), which makes that format in the browser as it loads. The stats are a page (lib/month-stats.mjs
 * statsPage, the month's drawing over its tables), a CSV or JSON. `--open` then opens a page in the default browser, or
 * shows any other file in its folder.
 */
async function exportMonth(facts, o) {
  const name = monthName(facts, o.part)
  const label = String(facts?.range?.label ?? '')
  const svgMod = await load('svg', o)
  if (typeof svgMod?.renderSvg !== 'function') return void process.stdout.write(NO_SVG)
  let ext = o.as
  let text
  if (o.part === 'stats') {
    const mod = await load('month-stats', o)
    if (typeof mod?.monthStats !== 'function') return void process.stdout.write('The Office has no month stats here (lib/month-stats.mjs is missing).\n')
    const stats = mod.monthStats(facts)
    text = o.as === 'csv' ? mod.statsCsv(stats) : o.as === 'json' ? mod.statsJson(stats)
      : mod.statsPage(stats, { svg: svgMod.renderSvg(facts, { view: 'month', width: PIXEL_WIDTH, animate: true }) })
  } else {
    const whole = svgMod.renderSvg(facts, { view: 'month', width: PIXEL_WIDTH, animate: true, rooms: o.part !== 'whole' })
    const alt = `The Office, ${MONTH_ALT[o.part]}${label ? `, ${label}` : ''}`
    const svg = o.part === 'whole' ? whole : svgMod.cropRoom(whole, o.part, alt)
    if (!svg) return void process.stdout.write(`The Office could not find ${MONTH_ALT[o.part]} in the month's drawing.\n`)
    if (o.as === 'svg') text = `${svg}\n`
    else {
      const page = await load('month-page', o)
      if (typeof page?.renderMonthPage !== 'function' || typeof page.MONTH_JS !== 'string') return void process.stdout.write('The Office has no month page here (lib/month-page.mjs is missing).\n')
      ext = 'html'
      text = page.renderMonthPage({ svg, room: o.part, label, auto: o.as, name: `theoffice-${name}`, scriptHash: playerHash(page.MONTH_JS) })
    }
  }
  const file = monthFile(name, ext)
  try {
    writePrivate(file, text)
  } catch (err) {
    return cannotWrite(file, err, o, 'export write')
  }
  process.stdout.write(`${file}\n`)
  if (o.open) launch(ext === 'html' ? opener(file) : revealer(file), o)
}

/**
 * The facts the pane hands a month's export on standard input (`--stdin`): the page it shows, read as it is, when it
 * is theoffice/1 facts with a range, at most STDIN_MAX; else null, and the run collects them itself. A terminal on
 * stdin hands nothing.
 */
async function stdinFacts(o, input = process.stdin) {
  if (input.isTTY) return null
  try {
    const chunks = []
    let size = 0
    for await (const chunk of input) {
      size += chunk.length
      if (size > STDIN_MAX) return null
      chunks.push(chunk)
    }
    const facts = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return facts && typeof facts === 'object' && facts.spec === SPEC && facts.range && typeof facts.range === 'object' ? facts : null
  } catch (err) {
    if (o.debug) process.stderr.write(`[theoffice] stdin facts unread: ${err?.stack ?? err}\n`)
    return null
  }
}

/**
 * How to show `file` in its folder on `platform`, selected: `open -R` on macOS, Explorer's /select on Windows (its
 * argument as one verbatim word, the path quoted), the folder itself anywhere else (xdg-open).
 */
export function revealer(file, platform = process.platform) {
  if (platform === 'darwin') return { cmd: 'open', args: ['-R', file], options: {} }
  if (platform === 'win32') return { cmd: 'explorer.exe', args: [`/select,"${file}"`], options: { windowsVerbatimArguments: true, windowsHide: true } }
  return { cmd: 'xdg-open', args: [path.dirname(file)], options: {} }
}

/**
 * How to show `file` in the default browser on `platform`: `open` on macOS, `start` on Windows (through cmd, whose
 * /s strips the outer quotes around the whole line; the empty "" is start's window title, so the quoted path is not
 * taken for one), `xdg-open` anywhere else.
 */
export function opener(file, platform = process.platform) {
  if (platform === 'darwin') return { cmd: 'open', args: [file], options: {} }
  if (platform === 'win32') {
    return { cmd: 'cmd', args: ['/d', '/s', '/c', `"start "" "${file}""`], options: { windowsVerbatimArguments: true, windowsHide: true } }
  }
  return { cmd: 'xdg-open', args: [file], options: {} }
}

/**
 * Open the exported page and move on: the opener runs detached, its output ignored and unref'd, so the run neither
 * waits for it nor fails with it; a missing or failing opener is silent, the paths are printed already.
 * THEOFFICE_NO_OPEN=1 skips it, so the tests can run --open without a browser.
 */
function openPage(file, o, env = process.env) {
  launch(opener(file), o, env)
}

/** Run an opener or a revealer as openPage does: detached and unwaited, silent when it fails, never under THEOFFICE_NO_OPEN. */
function launch({ cmd, args, options }, o, env = process.env) {
  if (env.THEOFFICE_NO_OPEN && !['0', 'false'].includes(String(env.THEOFFICE_NO_OPEN).toLowerCase())) return
  const quiet = (err) => { if (o.debug) process.stderr.write(`[theoffice] open failed: ${err?.stack ?? err}\n`) }
  try {
    const child = spawn(cmd, args, { ...options, detached: true, stdio: 'ignore' })
    child.on('error', quiet)
    child.unref()
  } catch (err) {
    quiet(err)
  }
}

/**
 * Where `--html` may write, decided before anything is drawn. The path can come from the model (the skill's command
 * runs pre-approved), so a page never lands on anything but a new `.html` file or an earlier The Office page: an
 * existing file without our mark is refused, and a symlink is never followed. Returns a refusal reason, or null.
 */
export function htmlTarget(file) {
  if (!/\.html?$/i.test(file)) return 'only .html files'
  let st
  try { st = fs.lstatSync(file) } catch (err) { return err?.code === 'ENOENT' ? null : err?.code ?? 'unreadable' }
  if (!st.isFile()) return st.isSymbolicLink() ? 'a symlink' : 'not a regular file'
  const head = Buffer.alloc(1024)
  let n = 0
  try {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    try { n = fs.readSync(fd, head, 0, head.length, 0) } finally { fs.closeSync(fd) }
  } catch (err) { return err?.code ?? 'unreadable' }
  return head.subarray(0, n).toString('utf8').includes(PAGE_MARK) ? null : 'exists and is not a The Office page'
}

/**
 * Write the self-contained page and print its absolute path. For a view, every pixel-art scene of it (HTML_SCENES: the
 * live floor, the week tower, today's time clock, the month's calendar, what they did), each over its own text; when
 * "what they did" has its own scene, the range's text leaves it out, so each thing is drawn and written once. For the
 * timelapse, its own page (the replay, its player and its GIF / video / SVG export), by default
 * ./theoffice-timelapse-<range>-<date>.html.
 */
async function writeHtml(facts, o) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(facts.now?.local_date ?? '') ? facts.now.local_date : new Date().toISOString().slice(0, 10)
  const file = path.resolve(typeof o.html === 'string' ? o.html : o.timelapse ? `theoffice-timelapse-${o.timelapse}-${day}.html` : `theoffice-${day}.html`)
  const refused = htmlTarget(file)
  if (refused) {
    process.stdout.write(`The Office did not write ${file}: ${refused}.\n`)
    return
  }
  // a folder we cannot write to fails before any rendering
  try { fs.accessSync(path.dirname(file), fs.constants.W_OK) } catch (err) { return cannotWrite(file, err, o, 'html write') }
  const page = o.timelapse ? (await lapseDrawings(facts, o))?.page : await officePage(facts, o)
  if (page == null) return
  try {
    // a new file is created exclusively; an earlier page is replaced in place, never through a symlink. Emptied once
    // open, not by O_TRUNC: Windows refuses O_TRUNC without O_CREAT (EINVAL), and has no O_NOFOLLOW (htmlTarget's lstat guards there)
    const exists = fs.existsSync(file)
    const fd = fs.openSync(file, exists ? fs.constants.O_WRONLY | (fs.constants.O_NOFOLLOW ?? 0) : 'wx')
    try {
      if (exists) fs.ftruncateSync(fd, 0)
      fs.writeFileSync(fd, page)
    } finally { fs.closeSync(fd) }
  } catch (err) {
    return cannotWrite(file, err, o, 'html write')
  }
  process.stdout.write(`${file}\n`)
}

/** The page of a view (lib/html.mjs renderHtml over HTML_SCENES), or null once it has said the renderer is missing. */
async function officePage(facts, o) {
  const mod = await load('html', o)
  if (typeof mod?.renderHtml !== 'function') {
    process.stdout.write('The Office has no HTML renderer here (lib/html.mjs is missing).\n')
    return null
  }
  const opts = { width: 110, ascii: o.ascii, project: o.project ?? undefined }
  const views = HTML_SCENES[o.view] ?? HTML_SCENES.all
  const departments = !views.includes('work')
  return mod.renderHtml(facts, {
    title: `The Office · ${facts.range?.label ?? facts.now?.local_date ?? ''}`,
    scenes: views.map((view) => ({ view, lines: renderOffice(facts, { ...opts, view, departments }) })),
  })
}

/** The timelapse as text on stdout: the still of the whole range, as the views print theirs. */
async function printLapse(facts, o) {
  const mod = await load('ascii-timelapse', o)
  if (typeof mod?.renderTimelapseText !== 'function') return void process.stdout.write(NO_LAPSE)
  process.stdout.write(renderLapse(mod, facts, o).replace(/^\s+/, ''))
}

// ---------------------------------------------------------------- watch

/**
 * Live office in the terminal: alternate screen, hidden cursor, a redraw every second (frame++ drives the typing, steam
 * and snoring) and fresh facts every 5 s. Redraws overwrite in place (home + erase-to-EOL) instead of clearing the
 * screen, so nothing flickers. q, Esc or ctrl-c exits; the terminal is restored on every way out. The timelapse comes
 * through here too (watchLapse), with its own `draw`, frame clock and facts.
 */
async function watch(o, { draw: drawFacts = render, tickMs = WATCH_MS, refreshMs = REFRESH_MS, opts = collectOpts(o) } = {}) {
  const out = process.stdout
  const stdin = process.stdin
  let facts = null
  let failed = false
  let collectedAt = 0
  let frame = 0
  let busy = false
  let restored = false
  let timer = null
  const restore = () => {
    if (restored) return
    restored = true
    clearInterval(timer)
    try { if (stdin.isTTY) stdin.setRawMode(false) } catch {}
    out.write('\x1b[0m\x1b[?25h\x1b[?1049l')
  }
  const quit = () => { restore(); process.exit(0) }
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, quit)
  process.on('exit', restore)
  if (stdin.isTTY) {
    try {
      stdin.setRawMode(true)
      stdin.resume()
      stdin.on('data', (buf) => { if (['q', 'Q', '\x03', '\x1b'].includes(String(buf))) quit() })
    } catch {}
  }
  const draw = () => {
    const width = o.widthGiven ? o.width : fitColumns(out.columns ?? 0, o.width)
    const text = facts ? drawFacts(facts, { ...o, width, frame }) : failed ? 'The Office is closed: could not read agent activity.\n' : 'The Office is opening…\n'
    const rows = out.rows > 0 ? out.rows : 1000
    // never write more rows than the screen has: a scroll would shift the home position and smear the next frame
    const lines = text.replace(/\n$/, '').split('\n').slice(0, rows)
    out.write(`\x1b[H${lines.map((l) => `${l}\x1b[0m\x1b[K`).join('\n')}\x1b[J`)
  }
  const tick = async () => {
    if (busy || restored) return
    busy = true
    try {
      if (!facts || Date.now() - collectedAt >= refreshMs) {
        try {
          facts = await collectWithRetry(opts)
        } catch (err) {
          failed = true
          if (o.debug) process.stderr.write(`[theoffice] watch collect failed: ${err?.stack ?? err}\n`)
        }
        collectedAt = Date.now()
      }
      draw()
      frame++
    } catch {} finally {
      busy = false
    }
  }
  out.write('\x1b[?1049h\x1b[?25l\x1b[2J')
  out.on('resize', () => { out.write('\x1b[2J'); draw() })
  await tick()
  timer = setInterval(tick, tickMs)
}

/**
 * The timelapse in the terminal: its text replay, one frame every TEXT_FRAME_MS (700 ms, the terminal pane's frame
 * clock), looping. The facts are read once: the replay is of a range that is over or nearly so, and new facts would
 * make it jump, as the pane's timelapse does not refresh either.
 */
async function watchLapse(o) {
  const mod = await load('ascii-timelapse', o)
  if (typeof mod?.renderTimelapseText !== 'function') return void process.stdout.write(NO_LAPSE)
  return watch(o, { draw: (facts, opts) => renderLapse(mod, facts, opts), tickMs: Number(mod.TEXT_FRAME_MS) || 700, refreshMs: Infinity, opts: lapseOpts(o) })
}

// ---------------------------------------------------------------- the runs for the pane

/**
 * The name an answer is shared under, or null: only `--json --since` facts of the whole office, as the pane asks for
 * them. A page of the past is named by its first day (`month-2026-08-01`) on the calendar of `at`, the moment it is
 * read for (sharedRun), so its file stays its own page whatever day it is asked on.
 */
function shareKey(o, at) {
  if (o.since == null || o.firstLight || !o.json || o.pixel || o.html || o.svg || o.timelapse || o.watch || o.project || o.agents || !o.git || !o.novi || !o.cache) return null
  return o.back ? `${o.view}-${resolveRange(o.view, at, o.back).days[0]}` : o.view
}

/**
 * The pages of the past have no end: past MAX_SHARED_PAGES their shared answers go, the oldest written first, with
 * their locks, and so do the locks and the progress a stopped run left on a page, unless a run holds its lock.
 * Whatever cannot be listed or removed is left for the next time.
 */
function pruneShared(dir) {
  let names
  try {
    names = fs.readdirSync(dir)
  } catch {
    return
  }
  const pages = names.filter((name) => PAGE_FILE_RE.test(name))
  const gone = new Set(pages.length <= MAX_SHARED_PAGES ? [] : pages
    .map((name) => ({ name, at: fs.statSync(path.join(dir, name), { throwIfNoEntry: false })?.mtimeMs ?? 0 }))
    .sort((a, b) => b.at - a.at).slice(MAX_SHARED_PAGES).map(({ name }) => name))
  for (const name of gone) try { fs.unlinkSync(path.join(dir, name)) } catch {}
  for (const name of names) {
    const page = PAGE_LOCK_RE.exec(name)?.[1]
    if (page && (gone.has(page) || !pages.includes(page)) && !lockHeld(path.join(dir, name))) try { fs.unlinkSync(path.join(dir, name)) } catch {}
    // what a killed run said of how far it was: no run of its page goes on
    const said = PAGE_PROGRESS_RE.exec(name)?.[1]
    if (said && !lockHeld(path.join(dir, `${said}.json.lock`))) try { fs.unlinkSync(path.join(dir, name)) } catch {}
  }
}

/** The lock of `file`, or false while a live run holds it. One that cannot be made (no cache folder) does not stop a run. */
function takeLock(lock) {
  for (let tries = 0; tries < 2; tries++) {
    try {
      fs.mkdirSync(path.dirname(lock), { recursive: true, mode: 0o700 })
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 })
      return true
    } catch (err) {
      if (err?.code !== 'EEXIST') return true
    }
    if (lockHeld(lock)) return false
    try { fs.unlinkSync(lock) } catch {}
  }
  return false
}

/** Whether a lock file is a run's that is still going: its process alive (EPERM says so too), and no older than a run can be. */
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

/** A shared answer, when it began at `since` or later (the file's mtime says when; any age with no `since`), else null. */
function sharedAnswer(file, since) {
  try {
    const st = fs.statSync(file, { throwIfNoEntry: false })
    return st && (since == null || Math.round(st.mtimeMs) >= since) ? fs.readFileSync(file, 'utf8') : null
  } catch {
    return null
  }
}

/**
 * A `--json --since MS` run: the facts of a run that began at MS or later, by one process at a time however many sessions
 * ask. A shared answer that recent is printed as it is. A run under way (the lock) is waited for, and if it began too
 * early the next waiter makes the one after it, so a burst of sessions costs two runs at most. Waiting has a limit: past
 * SHARE_WAIT_MS the last answer does, whatever its age; with none at all (a cold cache is building) the wait lasts.
 * The file's mtime is the moment the run began, the same as its facts' now: a reader needs a stat to tell how recent it is.
 */
async function sharedRun(o, key, keyAt) {
  const file = sharedFile(key)
  const lock = `${file}.lock`
  const giveUp = Date.now() + (Number(process.env.THEOFFICE_SHARE_WAIT_MS) || SHARE_WAIT_MS)
  for (;;) {
    const ready = sharedAnswer(file, o.since)
    if (ready) return void process.stdout.write(ready)
    if (takeLock(lock)) break
    if (Date.now() > giveUp) {
      const last = sharedAnswer(file, null)
      if (last) return void process.stdout.write(last)
    }
    await new Promise((resolve) => setTimeout(resolve, SHARE_POLL_MS))
  }
  // what the run says of how far it has read, for the sessions waiting for it; a run that ends, or stops on the way,
  // takes it with its lock, so they then wait for the answer alone
  let progress = null
  const release = () => {
    progress?.stop()
    try { fs.unlinkSync(progressFile(file)) } catch {}
    try { fs.unlinkSync(lock) } catch {}
  }
  process.once('exit', release)   // a run that stops on the way (stopsWithParent) lets go of it too
  try {
    // a run may have ended between the look and the lock
    const ready = sharedAnswer(file, o.since)
    if (ready) return void process.stdout.write(ready)
    const at = Date.now()
    let facts
    try {
      // a page of the past is read on the calendar its name was taken on, so a lock waited out past midnight never files
      // another page under it
      progress = progressOf(progressFile(file))
      facts = await collectWithRetry({ ...collectOpts(o), series: true, stopsWithParent: true, now: o.back ? keyAt : at, progress })
    } catch (err) {
      if (o.debug) process.stderr.write(`[theoffice] collect failed: ${err?.stack ?? err}\n`)
      return void process.stdout.write(`${JSON.stringify(fallbackFacts(err))}\n`)
    }
    const text = `${JSON.stringify({ ...facts, sources: { ...facts.sources, shared: file } })}\n`
    try {
      writePrivate(file, text, at)
      if (o.back) pruneShared(path.dirname(file))
    } catch (err) {
      if (o.debug) process.stderr.write(`[theoffice] shared write failed: ${err?.stack ?? err}\n`)
    }
    process.stdout.write(text)
  } finally {
    process.off('exit', release)
    release()
  }
}

// ---------------------------------------------------------------- main

function collectOpts(o) {
  return {
    view: o.view, git: o.git, novi: o.novi, project: o.project ?? undefined, debug: o.debug, ...(o.agents ? { agents: o.agents } : {}),
    ...(o.cache ? {} : { cacheDir: null }), ...(o.back ? { back: o.back } : {}), ...(o.firstLight ? { firstLight: true } : {}),
  }
}

/**
 * collect()'s options for a timelapse: the whole office's facts (`all`, as the views' default) over the replayed range,
 * with its timeline. novi is never asked: it has no slots, and no yesterday.
 */
function lapseOpts(o) {
  return { ...collectOpts(o), view: 'all', range: o.timelapse, timeline: true, novi: false, stopsWithParent: o.json }
}

function fallbackFacts(err) {
  return { spec: SPEC, error: String(err?.message ?? err).slice(0, 200) }
}

/**
 * collect(), and once more with a reset cache if it throws: whatever in the cache broke the run is then
 * overwritten, so the next refresh (the desktop mod polls every 5 s while its pane is open, every 60 s otherwise)
 * works again instead of failing forever.
 */
export async function collectWithRetry(opts, run = collect) {
  try {
    return await run(opts)
  } catch (err) {
    if (opts.cacheDir === null) throw err
    if (opts.debug) process.stderr.write(`[theoffice] collect failed, retrying with a fresh cache: ${err?.stack ?? err}\n`)
    return run({ ...opts, resetCache: true })
  }
}

export async function main(argv = process.argv.slice(2)) {
  // a reader that goes away early (`| head`) is not an error: no EPIPE stack on stderr, still exit 0
  process.stdout.on('error', () => process.exit(0))
  const o = parseArgs(argv, { isTTY: !!process.stdout.isTTY, columns: process.stdout.columns ?? 0 })
  const exporting = !!o.timelapse && o.export
  const monthExporting = !!o.part && o.export
  if (o.watch && process.stdout.isTTY && !o.json && !o.html && !o.svg && !o.pixel && !exporting && !monthExporting) return o.timelapse ? watchLapse(o) : watch(o)
  const keyAt = Date.now()
  const key = shareKey(o, keyAt)
  if (key) return sharedRun(o, key, keyAt)
  // the Month's export draws the page the pane shows, handed on stdin, else collects it
  let facts = monthExporting && o.stdin && !o.pixel ? await stdinFacts(o) : null
  try {
    facts ??= await collectWithRetry(o.timelapse ? lapseOpts(o) : collectOpts(o))
  } catch (err) {
    if (o.debug) process.stderr.write(`[theoffice] collect failed: ${err?.stack ?? err}\n`)
    process.stdout.write(o.json ? `${JSON.stringify(fallbackFacts(err))}\n` : 'The Office is closed: could not read agent activity.\n')
    return
  }
  try {
    // --pixel wins: the skill runs it beside the text command with the same words, which may say --json or --html
    if (o.pixel) return await writePixel(facts, o)
    // then the timelapse's --export: the pane's Export button reads its two lines and nothing else
    if (exporting) return await exportLapse(facts, o)
    // and the Month's: the pane reads its one line
    if (monthExporting) return await exportMonth(facts, o)
    // a first light says where the run after it will leave its answer, and how far it has read (sharedRun)
    if (o.firstLight) facts.sources = { ...facts.sources, shared: sharedFile('all') }
    if (o.json) {
      process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`)
      return
    }
    if (o.html) return await writeHtml(facts, o)
    if (o.svg) return await printSvg(facts, o)
    if (o.timelapse) return await printLapse(facts, o)
    process.stdout.write(render(facts, o).replace(/^\s+/, ''))
  } catch (err) {
    if (o.debug) process.stderr.write(`[theoffice] render failed: ${err?.stack ?? err}\n`)
    process.stdout.write('The Office is closed: could not draw the floor.\n')
  }
}

function isMain() {
  if (import.meta.main != null) return import.meta.main
  try { return fs.realpathSync(process.argv[1] ?? '') === fs.realpathSync(fileURLToPath(import.meta.url)) } catch { return false }
}

if (isMain()) {
  main().catch(() => {}).finally(() => { process.exitCode = 0 })
}
