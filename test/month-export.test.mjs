// The Month's export (`node scripts/office.mjs month --export <part> --as <format>`, the pane's Month Export): the
// rooms the month's drawing names and their crops, the full stats (the object, its CSV, JSON and page), the export page
// and its script, and the CLI that writes each file privately into the pixel folder, from the pane's facts on stdin or
// from the fake ~/.claude of helpers/fake-claude.mjs (time frozen at Mon 26 Oct 2026 01:40 Europe/Paris). Every run sets
// THEOFFICE_NO_OPEN, so --open never starts a browser or a file manager here.
process.env.TZ = 'Europe/Paris'

import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { monthFile, monthName, parseArgs, playerHash, revealer } from '../plugin/scripts/office.mjs'
import { cropRoom, renderSvg, roomsOf } from '../plugin/lib/svg.mjs'
import { STATS_SPEC, csvCell, monthStats, statsCsv, statsJson, statsPage } from '../plugin/lib/month-stats.mjs'
import { MONTH_JS, ROOM_WORDS, renderMonthPage } from '../plugin/lib/month-page.mjs'
import { MONTH, autoFormat, monthScript, saveName, scaleFor } from '../plugin/lib/month-player.mjs'
import { FROZEN, buildFakeClaude, cleanup } from './helpers/fake-claude.mjs'
import { SAMPLE, clone, monthFacts } from './helpers/facts.mjs'
import { permits } from './helpers/permits.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const OFFICE = path.join(ROOT, 'plugin', 'scripts', 'office.mjs')
const MARK = '<meta name="generator" content="theoffice">'

/** A month of the past as the collector reads it: September 2026, a calendar month, `back` 1. */
function septemberFacts() {
  const f = monthFacts()
  const days = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)
  f.range = { ...f.range, days, label: 'September 2026', back: 1 }
  f.per_day = Object.fromEntries(days.map((d, i) => [d, { minutes: i % 7 === 5 ? 0 : 60 * (i + 1), desk_minutes: 0, sessions: i % 7 === 5 ? 2 : 3, subagents: 1, workflows: 0, prompts: 4, commits: i % 3 }]))
  return f
}

// ---------------------------------------------------------------- the rooms

describe('the rooms of the month', () => {
  const svg = renderSvg(monthFacts(), { view: 'month', width: 960, animate: false, rooms: true })

  test('a drawing asked for them names the wall calendar, the building directory and the crew, side by side at 960', () => {
    const rooms = roomsOf(svg)
    assert.deepEqual(Object.keys(rooms), ['calendar', 'directory', 'crew'])
    const [cx, cy, cw, ch] = rooms.calendar
    const [dx, dy, , dh] = rooms.directory
    assert.equal(cy, dy, 'one floor')
    assert.equal(ch, dh)
    assert.equal(cx + cw, dx + 3, 'the partition is the directory\'s')
    const [kx, ky, kw, kh] = rooms.crew
    assert.ok(kx > cx && kx + kw <= cx + cw && ky > cy && ky + kh <= cy + ch, 'the crew on the calendar\'s wall, beside the page')
    for (const box of Object.values(rooms)) assert.ok(box.every(Number.isInteger) && box[2] > 0 && box[3] > 0)
  })

  test('narrow, the directory hangs under the calendar, and the pane\'s drawing never carries the boxes', () => {
    const narrow = roomsOf(renderSvg(monthFacts(), { view: 'month', width: 600, animate: false, rooms: true }))
    assert.equal(narrow.directory[0], narrow.calendar[0])
    assert.equal(narrow.directory[1], narrow.calendar[1] + narrow.calendar[3])
    assert.doesNotMatch(renderSvg(monthFacts(), { view: 'month', width: 960 }), /data-rooms/)
    assert.doesNotMatch(renderSvg(monthFacts(), { view: 'week', width: 960, rooms: true }), /data-rooms/, 'only the month names rooms')
    assert.deepEqual(roomsOf(renderSvg(monthFacts(), { view: 'month', width: 960 })), {})
  })

  test('a crop is the same markup seen through the room\'s box, at the drawing\'s scale, with its own label', () => {
    const [x, y, w, h] = roomsOf(svg).calendar
    const crop = cropRoom(svg, 'calendar', 'The Office, the wall calendar <October>')
    const root = /^<svg[^>]*>/.exec(crop)[0]
    assert.match(root, new RegExp(`\\sviewBox="${x} ${y} ${w} ${h}"`))
    assert.match(root, new RegExp(`\\swidth="${w * 2}" height="${h * 2}"`))
    assert.doesNotMatch(root, /data-rooms/)
    assert.match(root, /aria-label="The Office, the wall calendar &lt;October&gt;"/)
    assert.match(crop, /<title>The Office, the wall calendar &lt;October&gt;<\/title>/)
    assert.equal(crop.slice(root.length).replace(/^<title>[^<]*<\/title>/, ''), svg.slice(/^<svg[^>]*>/.exec(svg)[0].length).replace(/^<title>[^<]*<\/title>/, ''))
    assert.equal(cropRoom(svg, 'lobby'), null)
    assert.equal(cropRoom('<svg viewBox="0 0 10 10"></svg>', 'calendar'), null)
    assert.equal(cropRoom(null, 'calendar'), null)
  })
})

// ---------------------------------------------------------------- the stats

describe('the full stats', () => {
  test('say the range, the totals, what stood out, the crew, the projects and every day', () => {
    const s = monthStats(septemberFacts())
    assert.equal(s.spec, STATS_SPEC)
    assert.deepEqual(s.range, { label: 'September 2026', first_day: '2026-09-01', last_day: '2026-09-30', days: 30, back: 1 })
    assert.equal(s.days.length, 30)
    assert.deepEqual(s.days[0], { day: '2026-09-01', weekday: 'Tue', agent_minutes: 60, sessions: 3, interns: 1, meetings: 0, prompts: 4, commits: 0, agent_hours: 1, worked: true })
    // a day with sessions and no agent-time still counts as worked: every day was
    assert.equal(s.highlights.days_worked, 30)
    assert.equal(s.highlights.longest_streak, 30)
    assert.deepEqual(s.highlights.busiest_day, { day: '2026-09-30', agent_minutes: 1800, agent_hours: 30 })
    const timed = s.days.filter((d) => d.agent_minutes > 0)
    assert.equal(s.highlights.minutes_per_worked_day, Math.round(timed.reduce((a, d) => a + d.agent_minutes, 0) / timed.length))
    assert.equal(s.highlights.weekend_minutes, s.days.filter((d) => ['Sat', 'Sun'].includes(d.weekday)).reduce((a, d) => a + d.agent_minutes, 0))
    assert.equal(s.totals.agent_minutes, Math.round(SAMPLE.totals.agent_minutes))
    assert.equal(s.projects.length, SAMPLE.projects.length)
    assert.equal(s.projects[0].name, SAMPLE.projects[0].name)
    assert.deepEqual(Object.keys(s.projects[0].per_day), s.days.map((d) => d.day))
    assert.ok(s.crew.length >= 1 && s.crew.every((c) => typeof c.name === 'string' && c.share >= 0 && c.share <= 1))
  })

  test('never throw on partial facts: nothing is zero', () => {
    for (const f of [null, {}, { range: { days: ['nope', '2026-02-30'] } }, { ...clone(SAMPLE), projects: [null, 3], per_day: null }]) {
      const s = monthStats(f)
      assert.ok(Array.isArray(s.days) && Array.isArray(s.projects) && Array.isArray(s.crew))
    }
    assert.equal(monthStats({ range: { days: ['2026-02-30', '2026-02-28'] } }).days.length, 1, 'only real days')
  })

  test('as CSV: a row per day and a column per project, a row of totals, CRLF, every cell kept as text', () => {
    const f = septemberFacts()
    f.projects = [{ ...f.projects[0], name: '=HYPERLINK("x")' }, { ...f.projects[1], name: 'a, "b"' }]
    const csv = statsCsv(monthStats(f))
    const rows = csv.split('\r\n')
    assert.equal(rows.at(-1), '')
    assert.equal(rows.length, 1 + 30 + 1 + 1)
    assert.equal(rows[0], 'date,weekday,agent_hours,sessions,interns,meetings,prompts,commits,"\'=HYPERLINK(""x"") (agent_hours)","a, ""b"" (agent_hours)"')
    assert.match(rows[1], /^2026-09-01,Tue,1,3,1,0,4,0,/)
    assert.match(rows.at(-2), /^total,,/)
    assert.equal(csvCell('-1+2'), "'-1+2")
    assert.equal(csvCell('@x'), "'@x")
    assert.equal(csvCell(-3), '-3', 'a number is a number')
    assert.equal(csvCell('line\nbreak'), '"line\nbreak"')
  })

  test('as JSON: the object, two spaces in', () => {
    const s = monthStats(septemberFacts())
    assert.deepEqual(JSON.parse(statsJson(s)), s)
    assert.ok(statsJson(s).endsWith('}\n'))
  })

  test('as a page: no script, nothing loaded, every name escaped, the drawing inline', () => {
    const f = septemberFacts()
    f.projects = [{ ...f.projects[0], name: '<script>alert(1)</script>' }]
    const svg = renderSvg(f, { view: 'month', width: 960, animate: false })
    const page = statsPage(monthStats(f), { svg })
    assert.ok(page.slice(0, 1024).includes(MARK))
    assert.match(page, /content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"/)
    assert.doesNotMatch(page, /<script|\son[a-z]+=/i)
    assert.ok(page.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
    assert.match(page, /<figure><svg width="960"/)
    assert.doesNotMatch(page, /xmlns=/)
    assert.match(page, /<title>The Office · September 2026 · stats<\/title>/)
    assert.match(page, /worked 30 of 30 days · longest streak 30 days/)
    assert.doesNotMatch(statsPage(monthStats(f), { svg: 'not a drawing' }), /<figure>/)
  })
})

// ---------------------------------------------------------------- the page

describe('the export page', () => {
  const svg = cropRoom(renderSvg(monthFacts(), { view: 'month', width: 960, rooms: true }), 'calendar', 'The Office, the wall calendar')
  const hash = playerHash(MONTH_JS)

  test('runs only its script, by the hash the caller passes, and says the format to make as it loads', () => {
    const page = renderMonthPage({ svg, room: 'calendar', label: 'September 2026', auto: 'gif', name: 'theoffice-month-2026-09-calendar', scriptHash: hash })
    assert.ok(page.slice(0, 1024).includes(MARK))
    assert.ok(page.includes(`script-src '${hash}'`))
    assert.equal([...page.matchAll(/<script>/g)].length, 1)
    const script = /<script>([\s\S]*)<\/script>/.exec(page)[1]
    assert.equal(`sha256-${createHash('sha256').update(script).digest('base64')}`, hash)
    assert.match(page, /<div id="mo-data" hidden data-room="calendar" data-auto="gif" data-name="theoffice-month-2026-09-calendar"><\/div>/)
    assert.match(page, /<button type="button" id="mo-gif" class="asked">Save GIF<\/button>/)
    assert.match(page, /<title>The Office · the wall calendar<\/title>/)
    assert.doesNotMatch(page, /\son[a-z]+=/i)
    assert.match(page, /<figure id="mo-stage"><svg width="\d+"/)
  })

  test('runs nothing without a hash, makes nothing it does not know, and names its downloads safely', () => {
    const page = renderMonthPage({ svg, room: 'nope', auto: 'exe', name: '../../etc/passwd', label: '<b>' })
    assert.ok(page.includes("script-src 'none'"))
    assert.match(page, /data-room="whole" data-auto="" data-name="theoffice-month"/)
    assert.ok(page.includes('&lt;b&gt;'))
    assert.match(renderMonthPage({ svg: 'nope' }), /Nothing to draw here/)
    assert.deepEqual(Object.keys(ROOM_WORDS), ['calendar', 'directory', 'whole'])
  })

  test('its script parses without running, stays ASCII, and stops on a page with no drawing', () => {
    assert.doesNotThrow(() => new vm.Script(MONTH_JS))
    assert.match(MONTH_JS, /^[\x00-\x7f]*$/)
    assert.doesNotMatch(MONTH_JS, /<\/script|<script|<!--|\r/i)
    assert.ok(MONTH_JS.endsWith('\nmain()\n})()\n'))
    const said = []
    const status = { set textContent(v) { said.push(v) } }
    vm.runInNewContext(MONTH_JS, { document: { getElementById: (id) => (id === 'mo-status' ? status : null), querySelector: () => null } })
    assert.deepEqual(said, ['This page has no drawing to save.'])
    assert.ok(MONTH_JS.length < 40_000, `${MONTH_JS.length} chars`)
  })

  test('its sizes are whole scales of the art, its names and formats checked, in the page as in the module', () => {
    const sandbox = vm.runInNewContext(monthScript('return { scaleFor, saveName, autoFormat, MONTH }'), {})
    for (const s of [scaleFor, sandbox.scaleFor]) {
      assert.deepEqual({ ...s({ viewBox: '6 56 248 220' }, MONTH.PNG_MIN, MONTH.PNG_MAX) }, { width: 1736, height: 1540, scale: 7 })
      assert.deepEqual({ ...s({ viewBox: '0 0 480 374' }, MONTH.GIF_MIN, MONTH.GIF_MAX) }, { width: 960, height: 748, scale: 2 })
      assert.deepEqual({ ...s({ viewBox: '0 0 3000 100' }, 1600, 2000) }, { width: 3000, height: 100, scale: 1 }, 'never under the art\'s own pixels')
    }
    assert.equal(saveName('theoffice-month-2026-09-calendar', 'png'), 'theoffice-month-2026-09-calendar.png')
    assert.equal(sandbox.saveName('a/b', 'gif'), 'theoffice-month.gif')
    assert.deepEqual(['PNG', 'gif', 'video', 'svg', 'html', null].map(autoFormat), ['png', 'gif', 'video', 'svg', '', ''])
  })

  test('the page and its script are PURE: no node:* import', () => {
    for (const file of ['month-page.mjs', 'month-player.mjs', 'month-stats.mjs']) {
      const src = fs.readFileSync(new URL(`../plugin/lib/${file}`, import.meta.url), 'utf8')
      assert.doesNotMatch(src, /from ['"]node:|require\(|import\(/, file)
    }
  })
})

// ---------------------------------------------------------------- the CLI

describe('the CLI', () => {
  let fx
  let cache
  before(() => {
    fx = buildFakeClaude()
    cache = fs.mkdtempSync(path.join(fx.root, 'month-cache-'))
  })
  after(() => cleanup(fx?.root))

  const envFor = (extra = {}) => {
    const env = {
      ...process.env, THEOFFICE_CLAUDE_DIR: fx.claudeDir, THEOFFICE_CACHE_DIR: cache, THEOFFICE_NOW: FROZEN, TZ: 'Europe/Paris',
      THEOFFICE_SKIP_PID_CHECK: '1', THEOFFICE_NO_NOVI: '1', THEOFFICE_NO_GIT: '1', THEOFFICE_NO_OPEN: '1',
    }
    for (const k of ['FORCE_COLOR', 'NO_COLOR', 'COLORTERM']) delete env[k]
    return { ...env, ...extra }
  }
  const cli = (args, { input, env } = {}) => {
    const res = spawnSync(process.execPath, [OFFICE, ...args], { env: envFor(env), input, encoding: 'utf8' })
    assert.equal(res.status, 0, args.join(' '))
    assert.equal(res.stderr, '', args.join(' '))
    return res.stdout
  }
  const parse = (...argv) => parseArgs(argv, { env: {} })

  test('--export takes what to export, which draws the month, and --as how, the part\'s first by default', () => {
    assert.deepEqual(['view', 'part', 'as', 'export', 'stdin'].map((k) => parse('--export', 'calendar')[k]), ['month', 'calendar', 'png', true, false])
    assert.deepEqual(['part', 'as'].map((k) => parse('month', '--export', 'stats', '--as', 'CSV')[k]), ['stats', 'csv'])
    assert.deepEqual(['part', 'as'].map((k) => parse('month', '--export=directory', '--as=gif', '--stdin')[k]), ['directory', 'gif'])
    assert.equal(parse('month', '--export', 'stats', '--as', 'png').as, 'html', 'the stats are no PNG')
    assert.equal(parse('month', '--export', 'whole', '--as', 'json').as, 'png', 'a drawing is no JSON')
    assert.equal(parse('month', '--export', 'whole', '--stdin').stdin, true)
    assert.equal(parse('month', '--back', '3', '--export', 'calendar').back, 3)
    // the timelapse keeps its own --export, a range word after it included
    assert.deepEqual(['timelapse', 'part', 'export'].map((k) => parse('timelapse', '--export', 'month')[k]), ['month', null, true])
    assert.deepEqual(['timelapse', 'part'].map((k) => parse('timelapse', '--export', 'calendar')[k]), ['week', null])
    assert.equal(parse('month', '--export').part, null)
  })

  test('a month\'s files are named by its calendar month, else its first and last day, beside the timelapse\'s', () => {
    assert.equal(monthName(septemberFacts(), 'calendar'), 'month-2026-09-calendar')
    assert.equal(monthName(monthFacts(), 'stats'), 'month-2026-09-27-to-2026-10-26-stats')
    assert.equal(monthName({ range: { days: ['2026-02-01', '2026-02-27'] } }, 'whole'), 'month-2026-02-01-to-2026-02-27-whole')
    assert.equal(monthName({ range: { days: [] }, now: { local_date: '2026-11-02' } }, 'nope'), 'month-2026-11-02-whole')
    assert.equal(monthFile('month-2026-09-calendar', 'svg', { THEOFFICE_CACHE_DIR: '/c' }), path.join(path.resolve('/c'), 'pixel', 'month-2026-09-calendar.svg'))   // /c is D:\\c on Windows
  })

  test('a file is shown in its folder: open -R on macOS, Explorer\'s /select on Windows, the folder elsewhere', () => {
    assert.deepEqual(revealer('/a b/c.svg', 'darwin'), { cmd: 'open', args: ['-R', '/a b/c.svg'], options: {} })
    assert.deepEqual(revealer('C:\\a b\\c.svg', 'win32'), { cmd: 'explorer.exe', args: ['/select,"C:\\a b\\c.svg"'], options: { windowsVerbatimArguments: true, windowsHide: true } })
    assert.deepEqual(revealer('/a b/c.svg', 'linux'), { cmd: 'xdg-open', args: ['/a b'], options: {} })
  })

  test('draws the facts handed on stdin and keeps each format privately in the pixel folder, its path alone printed', () => {
    const input = JSON.stringify(septemberFacts())
    const dir = path.join(cache, 'pixel')
    const runs = [
      [['calendar', 'png'], 'month-2026-09-calendar.html'], [['directory', 'svg'], 'month-2026-09-directory.svg'], [['whole', 'gif'], 'month-2026-09-whole.html'],
      [['whole', 'video'], 'month-2026-09-whole.html'], [['stats', 'html'], 'month-2026-09-stats.html'], [['stats', 'csv'], 'month-2026-09-stats.csv'],
      [['stats', 'json'], 'month-2026-09-stats.json'],
    ]
    for (const [[part, as], name] of runs) {
      const out = cli(['month', '--back', '1', '--export', part, '--as', as, '--stdin', '--open'], { input })
      assert.equal(out, `${path.join(dir, name)}\n`, `${part} ${as}`)
      assert.equal(permits(path.join(dir, name), 0o600), 0o600)
      const text = fs.readFileSync(path.join(dir, name), 'utf8')
      if (as === 'json') assert.equal(JSON.parse(text).range.label, 'September 2026')
      else if (as === 'csv') assert.match(text, /^date,weekday,/)
      else if (as === 'svg') assert.match(text, /^<svg [^>]*viewBox="\d+ \d+ \d+ \d+"[^>]*aria-label="The Office, the building directory, September 2026"/)
      else if (part === 'stats') assert.match(text, /<title>The Office · September 2026 · stats<\/title>/)
      else {
        assert.match(text, new RegExp(`data-auto="${as}" data-name="theoffice-month-2026-09-${part}"`))
        const script = /<script>([\s\S]*)<\/script>/.exec(text)[1]
        assert.ok(text.includes(`script-src '${playerHash(script)}'`))
      }
    }
    assert.equal(permits(dir, 0o700), 0o700)
  })

  test('without facts on stdin, or with facts that are not the office\'s, it reads the month itself', () => {
    const out = cli(['month', '--export', 'stats', '--as', 'json', '--stdin'], { input: '{"spec":"nope"}' })
    const file = out.trim()
    assert.ok(path.isAbsolute(file) && file.endsWith('-stats.json'), out)
    const s = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(s.range.days, 56, 'last month and this one so far, in the fake office')
    assert.equal(cli(['month', '--export', 'stats', '--as', 'json']), out)
  })

  test('refuses a pixel folder that is a symlink', () => {
    const elsewhere = fs.mkdtempSync(path.join(fx.root, 'month-elsewhere-'))
    const cache2 = fs.mkdtempSync(path.join(fx.root, 'month-cache-'))
    fs.symlinkSync(elsewhere, path.join(cache2, 'pixel'))
    const file = path.join(cache2, 'pixel', 'month-2026-09-calendar.svg')
    assert.equal(cli(['month', '--export', 'calendar', '--as', 'svg', '--stdin'], { input: JSON.stringify(septemberFacts()), env: { THEOFFICE_CACHE_DIR: cache2 } }),
      `The Office could not write ${file} (a symlink).\n`)
    assert.deepEqual(fs.readdirSync(elsewhere), [])
  })
})
