// The CLI's timelapse mode (`node scripts/office.mjs timelapse [yesterday|week|month] …`) against the fake ~/.claude of
// helpers/fake-claude.mjs, time frozen at Mon 26 Oct 2026 01:40 Europe/Paris: how the words pick the range, the facts
// it collects (the timeline's slots for each range), the text still, --svg, --pixel, --html and --export with their
// private, symlink-refusing files and the page's script hash, and that the views' own outputs stay as they were.
// Every run sets THEOFFICE_NO_OPEN, so --open never starts a browser here.
process.env.TZ = 'Europe/Paris'

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { lapseFile, opener, parseArgs, playerHash } from '../plugin/scripts/office.mjs'
import { renderTimelapseText } from '../plugin/lib/ascii-timelapse.mjs'
import { toPlain } from '../plugin/lib/ascii.mjs'
import { PLAYER_JS } from '../plugin/lib/timelapse-page.mjs'
import { FROZEN, buildFakeClaude, cleanup } from './helpers/fake-claude.mjs'
import { permits } from './helpers/permits.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OFFICE = path.join(ROOT, 'plugin', 'scripts', 'office.mjs')
const MARK = '<meta name="generator" content="theoffice">'

let fx
let cache
before(() => {
  fx = buildFakeClaude()
  cache = fs.mkdtempSync(path.join(fx.root, 'lapse-cache-'))
})
after(() => cleanup(fx?.root))

/** The fake ~/.claude, frozen time, none of the shell's color settings, and never a browser. */
function envFor(extra = {}) {
  const env = {
    ...process.env, THEOFFICE_CLAUDE_DIR: fx.claudeDir, THEOFFICE_CACHE_DIR: cache, THEOFFICE_NOW: FROZEN, TZ: 'Europe/Paris',
    THEOFFICE_SKIP_PID_CHECK: '1', THEOFFICE_NO_NOVI: '1', THEOFFICE_NO_GIT: '1', THEOFFICE_NO_OPEN: '1',
  }
  for (const k of ['FORCE_COLOR', 'NO_COLOR', 'COLORTERM']) delete env[k]
  return { ...env, ...extra }
}

/** One CLI run: it always exits 0 and says nothing on stderr, so only its stdout is left to check. */
function cli(args, { env, cwd } = {}) {
  const res = spawnSync(process.execPath, [OFFICE, ...args], { env: envFor(env), cwd, encoding: 'utf8' })
  assert.equal(res.status, 0, args.join(' '))
  assert.equal(res.stderr, '', args.join(' '))
  return res.stdout
}

const json = (...args) => JSON.parse(cli([...args, '--json']))

// ---------------------------------------------------------------- words

describe('the timelapse words', () => {
  const parse = (...argv) => parseArgs(argv, { env: {} })

  test('timelapse (or lapse) replays the week unless a range word or --range says otherwise', () => {
    assert.equal(parse('timelapse').timelapse, 'week')
    assert.equal(parse('/Lapse').timelapse, 'week')
    assert.equal(parse('timelapse yesterday').timelapse, 'yesterday')
    assert.equal(parse('month timelapse').timelapse, 'month', 'the range word may come first')
    assert.equal(parse('timelapse', '--range', 'month').timelapse, 'month')
    assert.equal(parse('timelapse --range=yesterday').timelapse, 'yesterday')
    assert.equal(parse('timelapse week --range month').timelapse, 'month', '--range wins over a range word')
    assert.equal(parse('timelapse today').timelapse, 'week', 'today is not a range a timelapse replays')
    assert.equal(parse('timelapse --range today').timelapse, 'week')
    assert.deepEqual([parse('timelapse --export --open').export, parse('timelapse --export --open').open], [true, true])
  })

  test('outside the timelapse the words mean what they always did', () => {
    assert.equal(parse('week').timelapse, null)
    assert.equal(parse('week').view, 'week')
    assert.deepEqual(parse('yesterday'), parse(), 'yesterday alone is an unknown word')
    assert.equal(parse('--range month').timelapse, null, '--range alone is no timelapse')
    assert.equal(parse('--range month').view, 'all', '--range takes its value with it')
    // --html never takes a timelapse word for its file name
    assert.deepEqual([parse('--html yesterday').html, parse('--html timelapse').html, parse('--html timelapse').timelapse], [true, true, 'week'])
    assert.equal(parse('timelapse --html mine.html').html, 'mine.html')
  })
})

// ---------------------------------------------------------------- facts

describe('timelapse facts', () => {
  test('the week, hour by hour up to now: its range, its days and the timeline beside the usual facts', () => {
    const f = json('timelapse')
    assert.equal(f.spec, 'theoffice/1')
    assert.equal(f.range.kind, 'week')
    const tl = f.timeline
    assert.deepEqual([tl.kind, tl.slot_min, tl.per_day, tl.days.length], ['week', 60, 24, 7])
    assert.equal(tl.label, f.range.label)
    assert.deepEqual(tl.days, f.range.days)
    // now is Mon 26 Oct 01:40: six whole days, then midnight and one o'clock
    assert.equal(tl.slots, 6 * 24 + 2)
    assert.ok(tl.desks.length > 0 && tl.desks.every((d) => Array.isArray(d.runs)))
    for (const k of ['projects', 'totals', 'per_day', 'live']) assert.ok(k in f, k)
  })

  test('yesterday is 96 quarters of an hour, even on the 25-hour day the clocks went back', () => {
    for (const args of [['timelapse', 'yesterday'], ['--no-color', 'timelapse yesterday'], ['lapse', '--range', 'yesterday']]) {
      const f = json(...args)
      assert.equal(f.range.kind, 'yesterday', args.join(' '))
      assert.deepEqual(f.range.days, ['2026-10-25'])
      assert.deepEqual([f.timeline.kind, f.timeline.slot_min, f.timeline.per_day, f.timeline.slots], ['yesterday', 15, 96, 96])
    }
  })

  test('the month is 30 days in 4-hour slots', () => {
    const f = json('timelapse', '--range', 'month')
    assert.equal(f.range.kind, 'month')
    assert.deepEqual([f.timeline.slot_min, f.timeline.per_day, f.timeline.days.length], [240, 6, 30])
    assert.equal(f.timeline.slots, 29 * 6 + 1)
  })

  test('--project keeps the timeline to that project, and --no-cache gives the same timeline', () => {
    const all = json('timelapse')
    const one = json('timelapse', '--project', 'otherproj')
    assert.ok(one.timeline.desks.length > 0 && one.timeline.desks.length < all.timeline.desks.length)
    assert.ok(one.timeline.desks.every((d) => d.project === 'otherproj'))
    assert.deepEqual(json('timelapse', '--no-cache').timeline, all.timeline)
  })

  test("the views' own facts carry no timeline", () => {
    for (const args of [['week'], ['all'], ['month'], ['yesterday']]) {
      const f = json(...args)
      assert.ok(!('timeline' in f), args.join(' '))
      assert.ok(!('timeline' in (f.sources?.ms ?? {})), args.join(' '))
    }
    assert.equal(json('yesterday').range.kind, 'week', 'yesterday alone is the default view, the week')
  })
})

// ---------------------------------------------------------------- outputs

describe('timelapse outputs', () => {
  test('the text is the still of the whole range: renderTimelapseText of the same facts, plain when not a terminal', () => {
    const facts = json('timelapse')
    for (const width of [60, 80, 120]) {
      const out = cli(['timelapse', '--width', String(width)])
      assert.ok(out.startsWith('THE OFFICE · timelapse · this week'), out)
      assert.equal(out, `${toPlain(renderTimelapseText(facts, { width }))}\n`.replace(/^\s+/, ''), `width ${width}`)
      assert.doesNotMatch(out, /\x1b/, 'no ANSI into a pipe')
      for (const l of out.split('\n')) assert.ok([...l].length <= width, `line too wide at ${width}: ${l}`)
      assert.ok(out.split('\n').length > 4)
    }
    // the skill's command: one glued argument, --no-color
    assert.ok(cli(['--no-color', 'timelapse yesterday']).startsWith('THE OFFICE · timelapse · yesterday'))
    assert.match(cli(['timelapse', '--ascii']), /^[\x20-\x7e\n]+$/, '--ascii is 7-bit')
    assert.match(cli(['timelapse'], { env: { FORCE_COLOR: '1', TERM: 'xterm-256color' } }), /\x1b\[/, 'colored when asked')
  })

  test('--svg prints the replay: one opaque, looping drawing 960 px wide', () => {
    const svg = cli(['timelapse', 'yesterday', '--svg'])
    assert.ok(svg.startsWith('<svg ') && svg.endsWith('</svg>\n'))
    assert.match(svg, /^<svg [^>]*data-timelapse="yesterday"/)
    assert.match(svg, /^<svg [^>]*width="960"/)
    assert.match(svg, /^<svg [^>]*style="background:/)
    assert.match(svg, /data-slots="\d+"/)
    assert.match(svg, /data-slot-seconds="0\.05"/)
    assert.ok(svg.includes('<animate'))
    assert.ok(!cli(['week', '--svg']).includes('data-timelapse'), 'the week view is still the week view')
  })

  test('--pixel writes <cache dir>/pixel/timelapse-<range>.svg, private, and prints only its path', () => {
    const dir = path.join(cache, 'pixel')
    for (const range of ['yesterday', 'week', 'month']) {
      const file = path.join(dir, `timelapse-${range}.svg`)
      assert.equal(cli(['--no-color', '--pixel', `timelapse ${range}`]), `${file}\n`, range)
      assert.equal(lapseFile(range, 'svg', envFor()), file)
      const svg = fs.readFileSync(file, 'utf8')
      assert.match(svg, new RegExp(`^<svg [^>]*data-timelapse="${range}"`))
      assert.equal(permits(file, 0o600), 0o600, `${range}: the file is the person's alone`)
    }
    assert.equal(permits(dir, 0o700), 0o700)
    // --pixel wins over --json and --html, as for the views; no temp file is left behind
    assert.equal(cli(['timelapse', '--json', '--pixel']), `${path.join(dir, 'timelapse-week.svg')}\n`)
    assert.equal(cli(['timelapse', '--pixel', '--html', path.join(cache, 'x.html')]), `${path.join(dir, 'timelapse-week.svg')}\n`)
    assert.ok(!fs.existsSync(path.join(cache, 'x.html')))
    assert.ok(fs.readdirSync(dir).every((n) => !n.startsWith('.')), 'no temp file left')
    // the views keep their own files beside it
    assert.equal(cli(['week', '--pixel']), `${path.join(dir, 'office-week.svg')}\n`)
    assert.ok(!fs.readFileSync(path.join(dir, 'office-week.svg'), 'utf8').includes('data-timelapse'))
  })

  test('--pixel and --export refuse a pixel folder that is a symlink', () => {
    const elsewhere = fs.mkdtempSync(path.join(fx.root, 'lapse-elsewhere-'))
    const cache2 = fs.mkdtempSync(path.join(fx.root, 'lapse-cache-'))
    fs.symlinkSync(elsewhere, path.join(cache2, 'pixel'))
    const env = { THEOFFICE_CACHE_DIR: cache2 }
    const svg = path.join(cache2, 'pixel', 'timelapse-week.svg')
    const page = path.join(cache2, 'pixel', 'timelapse-week.html')
    assert.equal(cli(['timelapse', '--pixel'], { env }), `The Office could not write ${svg} (a symlink).\n`)
    assert.equal(cli(['timelapse', '--export', '--open'], { env }),
      `The Office could not write ${page} (a symlink).\nThe Office could not write ${svg} (a symlink).\n`)
    assert.deepEqual(fs.readdirSync(elsewhere), [])
  })

  test('--export keeps the page and the drawing in the pixel folder and prints both paths, the page first', () => {
    const dir = path.join(cache, 'pixel')
    const page = path.join(dir, 'timelapse-month.html')
    const svg = path.join(dir, 'timelapse-month.svg')
    const out = cli(['timelapse', 'month', '--export'])
    assert.equal(out, `${page}\n${svg}\n`)
    assert.equal(cli(['timelapse', 'month', '--export', '--open']), out, '--open prints the same two lines')
    assert.equal(cli(['timelapse', 'month', '--export', '--json']), out, '--export wins over --json')
    for (const file of out.trim().split('\n')) {
      assert.ok(path.isAbsolute(file) && fs.existsSync(file), file)
      assert.equal(permits(file, 0o600), 0o600, file)
    }
    assert.equal(lapseFile('month', 'html', envFor()), page)
    assert.match(fs.readFileSync(svg, 'utf8'), /^<svg [^>]*data-timelapse="month"/)

    const html = fs.readFileSync(page, 'utf8')
    assert.match(html, /^<!doctype html>/)
    assert.ok(Buffer.from(html).subarray(0, 1024).toString('utf8').includes(MARK), 'the mark --html looks for, in the first 1024 bytes')
    // the CSP lets exactly the page's one script run: the sha256 of PLAYER_JS as the browser hashes it
    const hash = `sha256-${createHash('sha256').update(PLAYER_JS).digest('base64')}`
    assert.equal(playerHash(PLAYER_JS), hash)
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1]
    assert.match(csp, /^default-src 'none';/)
    assert.ok(csp.includes(`script-src '${hash}'`), csp)
    assert.equal(html.split('<script').length - 1, 1, 'one script')
    assert.ok(html.includes(`<script>${PLAYER_JS}</script>`))
    assert.match(html, /<svg [^>]*data-timelapse="month"/, 'the drawing inline')
  })

  test('--html writes the page: a new .html file or its own earlier page, never anything else', () => {
    const dir = fs.mkdtempSync(path.join(fx.root, 'lapse-html-'))
    const page = path.join(dir, 'replay.html')
    assert.equal(cli(['timelapse', 'yesterday', '--html', page]), `${page}\n`)
    const html = fs.readFileSync(page, 'utf8')
    assert.ok(html.includes(MARK) && html.includes('data-timelapse="yesterday"'))
    assert.ok(html.includes(`script-src '${playerHash(PLAYER_JS)}'`))
    assert.equal(cli(['timelapse', 'yesterday', '--html', page]), `${page}\n`, 'its own earlier page is replaced')
    // an office page is a The Office page too
    const office = path.join(dir, 'office.html')
    assert.equal(cli(['live', '--no-cache', '--html', office]), `${office}\n`)
    assert.equal(cli(['timelapse', '--html', office]), `${office}\n`)
    assert.ok(fs.readFileSync(office, 'utf8').includes('data-timelapse="week"'))
    const other = path.join(dir, 'notes.html')
    fs.writeFileSync(other, '<p>mine</p>\n')
    assert.equal(cli(['timelapse', '--html', other]), `The Office did not write ${other}: exists and is not a The Office page.\n`)
    assert.equal(fs.readFileSync(other, 'utf8'), '<p>mine</p>\n')
    const link = path.join(dir, 'link.html')
    fs.symlinkSync(page, link)
    assert.equal(cli(['timelapse', '--html', link]), `The Office did not write ${link}: a symlink.\n`)
    const rc = path.join(dir, 'fake-rc')
    assert.equal(cli(['timelapse', '--html', rc]), `The Office did not write ${rc}: only .html files.\n`)
    assert.ok(!fs.existsSync(rc))
    // by default in the folder it runs in, named after the range and the local date
    assert.equal(cli(['timelapse', 'month', '--html'], { cwd: dir }), `${path.join(fs.realpathSync(dir), 'theoffice-timelapse-month-2026-10-26.html')}\n`)
    const missing = path.join(dir, 'no-such-dir', 'x.html')
    assert.equal(cli(['timelapse', '--html', missing]), `The Office could not write ${missing} (ENOENT).\n`)
  })

  test('--open hands the page to the platform opener', () => {
    const file = '/tmp/the office/timelapse-week.html'
    assert.deepEqual(opener(file, 'darwin'), { cmd: 'open', args: [file], options: {} })
    assert.deepEqual(opener(file, 'linux'), { cmd: 'xdg-open', args: [file], options: {} })
    assert.deepEqual(opener(file, 'freebsd').cmd, 'xdg-open')
    const win = opener('C:\\Users\\me\\the office\\timelapse-week.html', 'win32')
    assert.equal(win.cmd, 'cmd')
    assert.deepEqual(win.args, ['/d', '/s', '/c', '"start "" "C:\\Users\\me\\the office\\timelapse-week.html""'])
    assert.equal(win.options.windowsVerbatimArguments, true)
  })
})
