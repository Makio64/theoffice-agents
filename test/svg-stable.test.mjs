// renderSvg's `liveClock` (lib/svg.mjs, svg-kit clockFor/pixClock/ledClock): the desktop pane keeps one SVG on screen
// until the drawing changes, since a new source reloads its sandboxed frame (a blink that restarts every animation).
// So a live drawing must not change with the minute: its clocks run by themselves (SMIL loops phased from `clockAt`,
// the moment the pane puts the source on screen), its durations hold for a 10-minute window, and the rest of what
// moves with the wall clock moves on the hour. Two drawings of the same facts whose now differs by up to 9 minutes
// inside one window, with the same `clockAt`, are the same string. The clocks that run are the Today view's punch
// clock and the Month view's LED clock on the wall; the rooftop sign every view opens with carries no time.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { SVG_VIEWS, esc, renderSvg } from '../plugin/lib/svg.mjs'
import { fmtAgoAtLeast, fmtAtLeast } from '../plugin/lib/format.mjs'
import { FONT, clockFor, ledClock, pixClock, sane, steadyCount, steadyFacts, steadyMinutes } from '../plugin/lib/svg-kit.mjs'
import { departmentRows, pct } from '../plugin/lib/model.mjs'
import { renderOffice } from '../plugin/lib/ascii.mjs'
import { fmtCount } from '../plugin/lib/format.mjs'
import { SAMPLE, clone, emptyFacts, monthFacts, stressFacts, todayFacts } from './helpers/facts.mjs'

const VIEWS = Object.keys(SVG_VIEWS)
const MIN = 60e3

/**
 * The facts as the collector would write them `min` minutes (and `sec` seconds) after their own now: now.iso, the
 * local HH:MM and the hour move together (the zone is the facts' own: local_time against the UTC minute), night
 * follows the hour. Nothing else changes: the same agents doing the same things.
 */
function later(f, min, sec = 0) {
  const g = clone(f)
  const t0 = Date.parse(f.now.iso)
  const t = t0 + min * MIN + sec * 1e3
  const [h, m] = f.now.local_time.split(':').map(Number)
  const local = ((h * 60 + m + Math.floor(t / MIN) - Math.floor(t0 / MIN)) % 1440 + 1440) % 1440
  const hour = Math.floor(local / 60)
  g.now = {
    ...f.now, iso: new Date(t).toISOString(), hour, is_night: hour >= 20 || hour < 7,
    local_time: `${String(hour).padStart(2, '0')}:${String(local % 60).padStart(2, '0')}`,
  }
  return g
}

/** A day-time copy (14:20 local), so the sun, the day title bar and the day glass are covered too. */
function dayTime(f) {
  return later(f, 12 * 60 + 40)
}

// Every facts set the views draw: the sample (now 01:40:00 local, the start of a 10-minute window), a today and a
// month range, the empty office, the 20-desk stress office, and the sample by day.
const SETS = () => [['sample', SAMPLE], ['today', todayFacts()], ['month', monthFacts()], ['empty', emptyFacts()], ['stress', stressFacts()], ['day', dayTime(SAMPLE)]]

const live = (f, view, extra = {}) => renderSvg(f, { view, width: 660, transparent: true, liveClock: true, clockAt: Date.parse(SAMPLE.now.iso) + 7 * 1e3, ...extra })

/**
 * The pixel clocks' digit loops in a drawing: paths whose shape steps through the glyphs over a day, an hour or ten
 * minutes (other shapes animate too, on loops of seconds: the library's turning pages).
 */
const clockLoops = (svg) => (svg.match(/<animate attributeName="d" [^>]*dur="(?:86400|3600|600)s"/g) ?? []).length

/** The pixels a path's `d` of 1-px runs (`M x y h w v h h -w z`) covers, as a sorted list of "x,y". */
function pixels(d) {
  const at = []
  for (const [, x, y, w, h] of d.matchAll(/M(-?\d+) (-?\d+)h(\d+)v(\d+)h-\d+z/g)) {
    for (let i = 0; i < Number(w); i++) for (let j = 0; j < Number(h); j++) at.push(`${Number(x) + i},${Number(y) + j}`)
  }
  return at.sort().join(' ')
}

/**
 * The digit a pixel-clock path draws, read off its pixels against the 3 × 5 font in the digit's cell (top-left x, y):
 * '?' when it is no digit there.
 */
function glyphOf(d, x, y) {
  const cell = (g) => [...FONT[g]].flatMap((b, k) => (b === '1' ? [`${x + (k % 3)},${y + Math.floor(k / 3)}`] : [])).sort().join(' ')
  return [...'0123456789'].find((g) => cell(g) === pixels(d)) ?? '?'
}

/**
 * The pixel clocks' digits in a drawing (svg-kit pixClock), in drawing order: per digit its loop's period, its SMIL
 * begin, its keyTimes, the glyph it draws at load (before its loop moves) and the glyph of every step of its loop.
 * Each loop starts on a 0, a full 3 × 5 glyph: its top-left pixel is the digit's cell.
 */
function clockDigits(svg) {
  const re = /<path fill="[^"]+" d="([^"]+)"><animate attributeName="d" values="([^"]+)" keyTimes="([^"]+)" dur="(86400|3600|600)s"(?: begin="(-[\d.]+)s")?/g
  return [...svg.matchAll(re)].map(([, now, values, keyTimes, dur, begin]) => {
    const [x, y] = pixels(values.split(';')[0]).split(' ').map((p) => p.split(',').map(Number)).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1])])
    return { dur: Number(dur), begin: begin ?? '', keyTimes: keyTimes.split(';'), shown: glyphOf(now, x, y), steps: values.split(';').map((v) => glyphOf(v, x, y)) }
  })
}

/** The local HH:MM every running clock of a drawing shows at load, one per clock (its four digits in a row). */
function shownTimes(svg) {
  const digits = clockDigits(svg).map((d) => d.shown)
  return Array.from({ length: Math.ceil(digits.length / 4) }, (_, i) => `${digits.slice(4 * i, 4 * i + 2).join('')}:${digits.slice(4 * i + 2, 4 * i + 4).join('')}`)
}

// Well-formed XML: tags balance, attributes are not repeated, no stray < or bare & (as test/svg-today.test.mjs).
function xmlProblem(src) {
  const stack = []
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|([^<]+)|(<)/g
  let m
  let pos = 0
  while ((m = re.exec(src))) {
    if (m.index !== pos) return `gap at ${pos}`
    pos = re.lastIndex
    if (m[6]) return `stray < at ${m.index}`
    if (m[5] != null) continue
    const names = [...(m[3] ?? '').matchAll(/([\w:.-]+)=/g)].map((a) => a[1])
    if (new Set(names).size !== names.length) return `duplicate attribute in <${m[2]}>`
    if (m[1]) {
      if (stack.pop() !== m[2]) return `</${m[2]}> closes the wrong tag`
    } else if (!m[4]) stack.push(m[2])
  }
  return pos !== src.length ? 'trailing garbage' : stack.length ? `unclosed <${stack.at(-1)}>` : ''
}

describe('a live drawing holds for its 10-minute window', () => {
  test('every view: the same facts up to 9 minutes later, the same clockAt → the identical SVG string', () => {
    for (const [name, f] of SETS()) {
      // the window the facts' now opens (01:40:00 for the sample; 14:20 by day)
      const start = later(f, -(Date.parse(f.now.iso) % (10 * MIN)) / MIN)
      for (const view of VIEWS) {
        const first = live(start, view)
        for (const [min, sec] of [[0, 1], [0, 59], [1, 0], [3, 30], [5, 0], [8, 15], [9, 0], [9, 59]]) {
          assert.equal(live(later(start, min, sec), view), first, `${name} ${view} +${min}m${sec}s`)
        }
      }
    }
  })

  test('so the pane redraws at most at a window boundary, and a calm office seldom: a desk at work tells its time to ten minutes, the rest in coarse honest steps', () => {
    // the sample at 01:40:00: the asking desk raised its hand at 00:14:48 UTC (25m12s before), the coat rack's last
    // one left at 00:31 (9 minutes before), the drum puzzle's coder sat down at 23:02:49 (97 minutes before)
    const at = (min) => live(later(SAMPLE, min), 'live')
    assert.match(at(0), /hand up 10m\+/)
    assert.match(at(0), /left &lt;20m ago/)
    assert.match(at(0), />coding · 1h30\+</)
    assert.equal(at(9), at(0))
    // 01:50: the coat rack steps on; the raised hand is still in its step; the coder's time moves on with the window,
    // never past what it has been at it (107 minutes)
    assert.notEqual(at(10), at(9))
    assert.match(at(10), /left 10m\+ ago/)
    assert.match(at(10), /hand up 10m\+/)
    assert.match(at(10), />coding · 1h40\+</)
    assert.match(at(40), /hand up 1h\+/)
    // four hours of a calm office (every turn over, nobody at work): a redraw or so an hour (four of them the hour
    // turning), not one every window; a desk at work moves its tag with every tool call anyway
    const calm = clone(SAMPLE)
    for (const d of calm.live.desks) Object.assign(d, { state: 'idle', status: 'idle', idle_reason: 'done', interns: [], meetings: [] })
    const still = (min) => live(later(calm, min), 'live')
    let redraws = 0
    for (let min = 10; min <= 240; min += 10) redraws += still(min) !== still(min - 10) ? 1 : 0
    assert.ok(redraws <= 14, `${redraws} redraws`)
    // never the exact minutes a plain drawing shows
    assert.match(renderSvg(SAMPLE, { view: 'live' }), /hand up 25m/)
    assert.doesNotMatch(at(0), /hand up 25m|left 9m ago|coding · 1h37/)
  })

  test('the steps: under 20 minutes, 10 minutes, then 1, 3 and 12 hours, then whole days', () => {
    assert.deepEqual([-3, 0, 0.5, 9.9, 10, 59.9, 60, 179, 180, 719, 720, 1439, 1440, 4000].map(fmtAtLeast),
      ['<20m', '<20m', '<20m', '<20m', '10m+', '10m+', '1h+', '1h+', '3h+', '3h+', '12h+', '12h+', '1d+', '2d+'])
    assert.deepEqual([5, 45, 300, 1439, 1440, 4000].map(fmtAgoAtLeast),
      ['<20m ago', '10m+ ago', '3h+ ago', '12h+ ago', '1d+ ago', '2d+ ago'])
    assert.equal(fmtAtLeast(NaN), '')
    assert.equal(fmtAgoAtLeast(undefined), '')
  })

  test('running totals move in steps: agent-time by 10 minutes, half hours, then two figures of hours; counts in two figures', () => {
    assert.deepEqual([0, 7, 10, 59, 119, 120, 149, 150, 599, 600, 659, 660, 5999, 6000, 6599, -4, NaN].map(steadyMinutes),
      [0, 7, 10, 50, 110, 120, 120, 150, 570, 600, 600, 660, 5940, 6000, 6000, 0, 0])
    assert.deepEqual([0, 42, 99, 100, 109, 312, 1999, 2000, 103251].map(steadyCount), [0, 42, 99, 100, 100, 310, 1900, 2000, 100000])
    const f = todayFacts()
    const before = JSON.stringify(f)
    const s = steadyFacts(f)
    assert.equal(JSON.stringify(f), before) // the facts passed in are never touched
    assert.equal(s.totals.agent_minutes, steadyMinutes(f.totals.agent_minutes))
    assert.equal(s.totals.tool_calls, steadyCount(f.totals.tool_calls))
    assert.deepEqual(s.per_hour.slice(0, 2), [300, 360])
    assert.equal(s.projects[0].agent_minutes, steadyMinutes(f.projects[0].agent_minutes))
    assert.equal(s.totals.commits, f.totals.commits) // an event, kept exact
  })

  test('the Today, Week and Month tabs hold while agent-time grows inside a step; the CLI\'s drawing shows every minute', () => {
    // two more minutes of agent-time today, as an agent working on would add them (00:00–01:00 local is the hour now)
    const grow = (f, by) => {
      const g = clone(f)
      const day = g.now.local_date
      g.totals.agent_minutes += by
      g.per_day[day].minutes += by
      g.per_hour[1] += by
      g.projects[0].agent_minutes += by
      if (g.projects[0].per_day?.[day]) g.projects[0].per_day[day].minutes += by
      return g
    }
    for (const [view, f] of [['today', todayFacts()], ['week', SAMPLE], ['month', monthFacts()]]) {
      const base = clone(f)
      base.totals.agent_minutes = 300
      base.per_day[base.now.local_date].minutes = 300
      base.per_hour[1] = 40
      base.projects[0].agent_minutes = 200
      if (base.projects[0].per_day?.[base.now.local_date]) base.projects[0].per_day[base.now.local_date].minutes = 200
      assert.equal(live(grow(base, 2), view), live(base, view), view)
      assert.notEqual(renderSvg(grow(base, 2), { view }), renderSvg(base, { view }), `${view} plain`)
    }
  })

  test('the Office\'s basement (B1, what they did) holds while tool calls come in: rounded counts, whole percents', () => {
    // five more calls of every kind, as agents at work add them: inside every count's step (svg-kit steadyCount), the
    // total's included (the sample's 50,990 sits ten calls under a step: a base 400 terminal commands lighter does not)
    const grow = (f, by, kinds = Object.keys(f.totals.activity)) => {
      const g = clone(f)
      for (const k of kinds) g.totals.activity[k] += by
      return g
    }
    const base = grow(SAMPLE, -400, ['terminal'])
    for (const view of ['all', 'live']) {
      const before = live(base, view)
      assert.equal(live(grow(base, 5), view), before, view)
      // a thousand more terminal commands cross a step: the shares move, and so does the drawing
      assert.notEqual(live(grow(base, 1000, ['terminal']), view), before, `${view}: a real change still shows`)
    }
    assert.doesNotMatch(live(SAMPLE, 'all'), /font-weight="bold">\d+\.\d+%/)
  })

  test('B1\'s shares are the exact counts\', as the text version and --json say them; its total is the exact total in steps', () => {
    // floored counts (steadyFacts) would skew them: 20,124 of 50,990 terminal commands is 39%, but 20,000 of the
    // floored parts' 50,400 says 40%, and the parts sum short of the total
    for (const [name, f] of [['sample', SAMPLE], ['today', todayFacts()], ['stress', stressFacts()]]) {
      const { rows, total } = departmentRows(f.totals.activity)
      const svg = live(f, 'all')
      assert.ok(svg.includes(`share of ${fmtCount(steadyCount(total))} tool calls`), `${name}: ${fmtCount(steadyCount(total))}`)
      const text = renderOffice(f, { view: 'live', width: 200, frame: 0 }).map((l) => l.map((s) => s[0]).join('')).join('\n')
      for (const r of rows.slice(0, 3)) {
        const b1 = svg.slice(svg.indexOf('>WHAT THEY DID<'))
        // the share on the room's tag (a span before its calls, or the row alone)
        assert.ok(b1.includes(`>${r.name.toUpperCase()}<`) && new RegExp(`>${esc(pct(r.v, total))}</(?:text|tspan)>`).test(b1), `${name}: ${r.name} ${pct(r.v, total)}`)
        assert.ok(text.includes(`${r.name}/${r.work} ${pct(r.v, total)}`), `${name} text: ${r.name}`)
      }
    }
    assert.match(live(SAMPLE, 'all'), /<tspan fill="[^"]+">39%<\/tspan><tspan fill="[^"]+"> · 20k calls<\/tspan>/)
    assert.match(live(SAMPLE, 'all'), /share of 50k tool calls this week/)
    // the Work tab says the same shares, and the total in the same steps, on its title rule
    const work = live(SAMPLE, 'work')
    assert.match(work, />SHARE OF TOOL CALLS<\/text>/)
    assert.match(work, />50k<\/text>/)
    assert.match(work, />39%<\/text>/)
  })

  test('a desk turns dozing at a window boundary, not at its own minute', () => {
    // a desk idle since 57 minutes before the window's start: a plain drawing dozes it off 3 minutes in (DOZE_MS is an
    // hour), a live one at the next window
    const f = clone(SAMPLE)
    const idle = f.live.desks.find((d) => d.state === 'idle')
    idle.activity = { ...idle.activity, since: new Date(Date.parse(f.now.iso) - 57 * MIN).toISOString() }
    idle.last_seen = idle.activity.since
    // its tooltip says what it is doing
    const dozing = (svg) => svg.includes(`${esc(idle.title)} · dozing at the desk`)
    const plain = (min) => dozing(renderSvg(later(f, min), { view: 'live' }))
    const liveAt = (min) => dozing(live(later(f, min), 'live'))
    assert.deepEqual([plain(2), plain(4)], [false, true])
    for (let min = 0; min < 10; min++) assert.equal(liveAt(min), false, `+${min}m`)
    assert.equal(liveAt(10), true)
  })

  test('the hour moves the sky and today\'s now line; the facts\' now within an hour does not', () => {
    const today = todayFacts()
    const svg = (min) => live(later(today, min), 'today')
    assert.equal(svg(5), svg(0))
    // 02:00 local: a new hour column, the moon one step on
    assert.notEqual(svg(20), svg(0))
    // the now line sits mid-hour and is labelled `now` (the time runs on the punch clock); drawn still, it says the
    // facts' time
    assert.match(svg(0), /<text [^>]*fill="[^"]+" text-anchor="middle">now<\/text>/)
    assert.doesNotMatch(svg(0), /<text [^>]*fill="[^"]+" text-anchor="middle">01:40<\/text>/)
    assert.match(renderSvg(today, { view: 'today' }), /<text [^>]*fill="[^"]+" text-anchor="middle">01:40<\/text>/)
  })
})

describe('the live clock', () => {
  // A clock's markup with its phase taken out: the loops' begins and the glyph each digit draws at load.
  const unphase = (s) => s.replace(/ begin="-[\d.]+s"/g, '').replace(/(<path fill="[^"]+" d=")[^"]+("><animate attributeName="d")/g, '$1$2')

  test('shows the time at clockAt and runs by itself: one SMIL loop per digit, phased to the wall clock', () => {
    // 01:40:00 local (00:40:00 UTC) + 2 min 5.5 s: the frame loads at 01:42:05.5; the punch clock in the Today view
    const at = Date.parse(SAMPLE.now.iso) + 125.5e3
    const svg = renderSvg(todayFacts(), { view: 'today', width: 660, liveClock: true, clockAt: at })
    assert.deepEqual(shownTimes(svg), ['01:42'])
    assert.equal(xmlProblem(svg), '')
    // the digits' loops: a day for the hours, an hour for the tens of minutes, ten minutes for the last digit, each
    // begun as far back as the wall clock is into it (01:42:05.5 = 6125.5 s into the day)
    const begins = (dur) => new Set([...svg.matchAll(new RegExp(`dur="${dur}s" begin="(-[\\d.]+)s"`, 'g'))].map((m) => m[1]))
    assert.deepEqual([...begins(86400)], ['-6125.5'])
    assert.deepEqual([...begins(3600)], ['-2525.5'])
    assert.deepEqual([...begins(600)], ['-125.5'])
    assert.deepEqual(clockDigits(svg).map((d) => d.dur), [86400, 86400, 3600, 600])
    // the last digit's 2 shows from 120 s to 180 s of its loop, and only then
    const last = clockDigits(svg).at(-1)
    assert.deepEqual(last.steps, [...'0123456789'])
    const two = last.steps.indexOf('2')
    assert.deepEqual(last.keyTimes.slice(two, two + 2), ['.2', '.3'])
    // the Office has no clock at all: the rooftop sign carries no time, nor does the street front, at load or later
    const office = renderSvg(SAMPLE, { view: 'live', width: 660, liveClock: true, clockAt: at })
    assert.equal(clockLoops(office), 0)
    assert.deepEqual(shownTimes(office), [])
    assert.doesNotMatch(office, /attributeName="display"[^>]*dur="(?:86400|3600|600)s"/)
    assert.ok(!office.includes('01:42') && !office.includes('01:40'))
  })

  test('every digit flips within 5 ms of its moment: the hour digits never lag the minutes', () => {
    // keyTimes are fractions of a loop as long as a day: five decimals put an hour's flip up to 0.43 s off; the punch
    // clock and the Month view's LED clock (900 wide, the wall by the calendar has room for it)
    const loops = [live(todayFacts(), 'today'), live(SAMPLE, 'month', { width: 900 })]
      .flatMap((svg) => [...svg.matchAll(/keyTimes="([^"]+)" dur="(86400|3600|600)s"/g)])
    assert.ok(loops.length >= 8)
    for (const [, times, dur] of loops) {
      const step = { 86400: 3600, 3600: 600, 600: 60 }[dur]
      for (const t of times.split(';').map(Number)) {
        const s = t * Number(dur)
        assert.ok(Math.abs(s - Math.round(s / step) * step) < 0.005, `${dur}s loop: ${t} is ${s}s`)
      }
    }
  })

  test('the clock is the only thing clockAt changes, and only in the clocks\' phases', () => {
    // a view with a running clock differs only in its phases; a view with none does not change at all
    for (const width of [660, 900]) {
      for (const view of VIEWS) {
        const a = live(SAMPLE, view, { width, clockAt: Date.parse(SAMPLE.now.iso) })
        const b = live(SAMPLE, view, { width, clockAt: Date.parse(SAMPLE.now.iso) + 37 * MIN + 13e3 })
        assert.equal(a !== b, clockLoops(a) > 0, `${view} ${width}`)
        assert.equal(unphase(a), unphase(b), `${view} ${width}`)
      }
    }
  })

  test('a running clock is weighed at its longest moment: its markup and its slack add up to the same at any phase', () => {
    // a live clock's markup is as long as the moment it is phased from makes it (svg-kit clockSlack); each clock adds
    // what it is short of its longest to ctx.clockSlack, which renderSvg and the live basement count, so a drawing at
    // the edge of MAX_SVG lands on the same rung whatever moment the pane phases it from
    const t0 = Date.parse(SAMPLE.now.iso)
    const weigh = (draw, at) => {
      const ctx = { f: SAMPLE, animate: true, id: 'to-', defs: new Map(), clock: clockFor(SAMPLE, true, at), clockSlack: { chars: 0 } }
      const markup = draw(ctx)
      return { markup, total: markup.length + ctx.clockSlack.chars }
    }
    for (const [name, draw] of [['pixel clock', (c) => pixClock(c, [0, 4, 12, 16], 0, '#ff9d5c')], ['LED clock', (c) => ledClock(c, 0, 0)]]) {
      const first = weigh(draw, t0)
      const lengths = new Set()
      for (let k = 0; k < 60; k++) {
        const at = weigh(draw, t0 + k * (97 * MIN + 13_700))
        lengths.add(at.markup.length)
        assert.equal(at.total, first.total, `${name} +${k * 97}m`)
      }
      // the phases do change the markup's length: the slack is what keeps the total still
      assert.ok(lengths.size > 1, `${name}: its markup's length moves with the moment`)
    }
  })

  test('a drawing at the edge of the size budget keeps its rung whatever moment its clocks are phased from', () => {
    // 900 wide, the sample's Office comes near MAX_SVG; it draws no clock, so whatever moment the pane phases it from,
    // it is the same drawing on the same rung. The views that run a clock keep theirs too, at every width: every live
    // clock is measured at its longest moment (the test above)
    const t0 = Date.parse(SAMPLE.now.iso)
    const office = live(SAMPLE, 'all', { width: 900, clockAt: t0 })
    for (let k = 1; k < 40; k++) assert.equal(live(SAMPLE, 'all', { width: 900, clockAt: t0 + k * (7 * MIN + 13e3) }), office, `+${k * 7}m`)
    for (const view of ['today', 'month']) {
      for (const width of [320, 660, 900, 1400]) {
        const first = unphase(live(SAMPLE, view, { width, clockAt: t0 }))
        for (let k = 1; k < 12; k++) assert.equal(unphase(live(SAMPLE, view, { width, clockAt: t0 + k * (97 * MIN + 13e3) })), first, `${view} ${width} +${k * 97}m`)
      }
    }
  })

  test('every clock of every view runs: the month LED clock, the punch clock; the Office has none', () => {
    const count = clockLoops
    assert.equal(count(live(SAMPLE, 'live')), 0) // the rooftop sign carries no time
    assert.equal(count(live(todayFacts(), 'today')), 4) // the punch clock
    assert.ok([0, 4].includes(count(live(monthFacts(), 'month')))) // the wall by the calendar, when it has room
    assert.equal(count(live(SAMPLE, 'month', { width: 900 })), 4)
    // and never a still pixel clock beside a running one: the time in a tooltip (a tooltip cannot tick) and the static
    // digits are only drawn without liveClock
    assert.doesNotMatch(live(SAMPLE, 'month', { width: 900 }), /<title>Mon 26 Oct · 01:40<\/title>/)
    assert.doesNotMatch(live(todayFacts(), 'today'), /<title>punch clock 01:40/)
    for (const width of [660, 900]) {
      for (const view of VIEWS) {
        const svg = live(SAMPLE, view, { width })
        // every loop is a digit of a whole clock, and every clock reads the facts' time
        assert.equal(shownTimes(svg).length * 4, clockLoops(svg), `${view} ${width}`)
        assert.ok(shownTimes(svg).every((t) => t === '01:40'), `${view} ${width}: ${shownTimes(svg)}`)
        assert.equal(xmlProblem(svg), '', `${view} ${width}`)
      }
    }
    assert.deepEqual(shownTimes(live(SAMPLE, 'today')), ['01:40'])
    assert.deepEqual(shownTimes(live(SAMPLE, 'month', { width: 900 })), ['01:40'])
  })

  test('clockAt defaults to the facts\' now; with no animation (or no HH:MM) the clock is the facts\' time, drawn still', () => {
    const svg = renderSvg(todayFacts(), { view: 'today', liveClock: true })
    assert.deepEqual(shownTimes(svg), ['01:40'])
    assert.match(svg, /dur="600s"(?! begin)/)
    // drawn still, the punch clock's time is in its tooltip and on the now line, the LED clock's in its tooltip
    const still = renderSvg(todayFacts(), { view: 'today', liveClock: true, animate: false })
    assert.doesNotMatch(still, /<animate|<set/)
    assert.match(still, /<title>punch clock 01:40[ <]/)
    assert.match(still, /<text [^>]*fill="[^"]+" text-anchor="middle">01:40<\/text>/)
    const month = renderSvg(SAMPLE, { view: 'month', width: 900, liveClock: true, animate: false })
    assert.doesNotMatch(month, /<animate|<set/)
    assert.match(month, /<title>Mon 26 Oct · 01:40<\/title>/)
    const bare = clone(SAMPLE)
    bare.now = { ...bare.now, local_time: 'soon' }
    for (const [view, width] of [['today', 660], ['month', 900]]) {
      assert.doesNotMatch(renderSvg(bare, { view, width, liveClock: true }), /attributeName="(?:display|d)"[^>]*dur="(?:86400|3600|600)s"/, view)
    }
  })

  test('the clock covers every zone: a facts pair in UTC−9:30 and UTC+5:45 reads its own local time', () => {
    for (const [iso, local, expect] of [['2026-10-26T10:40:00.000Z', '01:10', '01:12'], ['2026-10-26T10:40:00.000Z', '16:25', '16:27']]) {
      const f = clone(SAMPLE)
      f.now = { ...f.now, iso, local_time: local, hour: Number(local.slice(0, 2)) }
      for (const [view, width] of [['today', 660], ['month', 900]]) {
        assert.deepEqual(shownTimes(renderSvg(f, { view, width, liveClock: true, clockAt: Date.parse(iso) + 2 * MIN })), [expect], `${view} ${local}`)
      }
    }
  })

  test('liveClock off (the CLI, the page, the snapshots) draws exactly what it always drew', () => {
    for (const view of VIEWS) {
      for (const [name, f] of SETS()) assert.equal(renderSvg(f, { view, liveClock: false }), renderSvg(f, { view }), `${name} ${view}`)
    }
  })

  test('a live drawing stays well-formed and under the size budget, the stress office included', () => {
    for (const [name, f] of SETS()) {
      for (const view of VIEWS) {
        const svg = live(f, view)
        assert.equal(xmlProblem(svg), '', `${name} ${view}`)
        assert.ok(svg.length <= 120_000, `${name} ${view}: ${svg.length}`)
      }
    }
  })
})
