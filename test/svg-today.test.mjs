// The TODAY scene of the SVG office (lib/svg-today.mjs): the punch clock and the timesheet on its clipboard, drawn
// through renderSvg(facts, { view: 'today' }) on the sample, a real-shaped today, the empty office and the stress office.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { renderSvg } from '../plugin/lib/svg.mjs'
import { fmtInt, fmtMinutes } from '../plugin/lib/format.mjs'
import { mix } from '../plugin/lib/svg-kit.mjs'
import { SAMPLE, clone, emptyFacts, stressFacts, todayFacts } from './helpers/facts.mjs'

// the red playhead at the hour now: its line and its tag
const MARKER = '#e2392d'
// the six-hour columns of the sheet's grid, darker than the others (the column heads' ink)
const INK_HEAD = '#6e5f48'
// a bar's dark top edge: its color halfway to the sheet's darkest brown
const capOf = (c) => mix(c, '#2b2118', 0.5)

// ---------------------------------------------------------------- fixtures

// The sample as the collector writes a today at 18:17: every per_hour cut after now, agent-minutes the sum of the hours.
function realShaped() {
  const f = clone(SAMPLE)
  const cut = (ph) => ph.map((v, h) => (h <= 18 ? v : 0))
  f.range = { ...f.range, kind: 'today', days: ['2026-10-26'], label: 'Mon 26 Oct' }
  f.now = { ...f.now, iso: '2026-10-26T17:17:00.000Z', local_time: '18:17', hour: 18, is_night: false }
  for (const p of f.projects) {
    p.per_hour = cut(p.per_hour)
    p.agent_minutes = p.per_hour.reduce((a, b) => a + b, 0)
  }
  f.per_hour = cut(f.per_hour)
  f.totals.agent_minutes = f.per_hour.reduce((a, b) => a + b, 0)
  return f
}

const HOSTILE = '<script>alert(1)</script> & "x" ‮ שלום 🎉'
const WIDTHS = [480, 640, 960]
const sets = () => [['sample', SAMPLE], ['today', todayFacts()], ['real', realShaped()], ['empty', emptyFacts()], ['stress', stressFacts()]]

// Well-formed XML: tags balance, attributes are not repeated, no stray < or bare &.
function xmlProblem(src) {
  const stack = []
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|([^<]+)|(<)/g
  let m
  let pos = 0
  while ((m = re.exec(src))) {
    if (m.index !== pos) return `gap at ${pos}`
    pos = re.lastIndex
    if (m[6]) return `stray < at ${m.index}`
    if (m[5] != null) {
      if (/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/i.test(m[5])) return `bare & near ${m.index}`
      continue
    }
    const names = [...(m[3] ?? '').matchAll(/([\w:.-]+)=/g)].map((a) => a[1])
    if (new Set(names).size !== names.length) return `duplicate attribute in <${m[2]}>`
    if (m[1]) {
      if (stack.pop() !== m[2]) return `</${m[2]}> closes the wrong tag`
    } else if (!m[4]) stack.push(m[2])
  }
  return pos !== src.length ? 'trailing garbage' : stack.length ? `unclosed <${stack.at(-1)}>` : ''
}

const texts = (svg) => [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
const ids = (svg) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])

// ---------------------------------------------------------------- tests

describe('today scene', () => {
  test('renders every facts set at 480 / 640 / 960: well-formed, safe, ids resolve', () => {
    for (const [label, f] of sets()) {
      for (const width of WIDTHS) {
        const at = `${label}@${width}`
        const svg = renderSvg(f, { view: 'today', width })
        assert.ok(svg.startsWith('<svg ') && svg.endsWith('</svg>'), at)
        assert.equal(xmlProblem(svg), '', at)
        assert.doesNotMatch(svg, /<script|<foreignObject|<image\b|\son[a-z]+\s*=/i, at)
        for (const m of svg.replace(' xmlns="http://www.w3.org/2000/svg"', '').matchAll(/(?:href="|url\()([^")]*)/g)) assert.match(m[1], /^#to-/, at)
        assert.equal(new Set(ids(svg)).size, ids(svg).length, `${at}: duplicate ids`)
        for (const m of svg.matchAll(/href="#([^"]+)"/g)) assert.ok(ids(svg).includes(m[1]), `${at}: dangling #${m[1]}`)
        assert.match(svg, new RegExp(`viewBox="0 0 ${width / 2} \\d+"`), at)
        assert.match(svg, /aria-label="The Office (today|timesheet)/, at)
        assert.ok(texts(svg).includes('TIME CLOCK') && texts(svg).includes('TIMESHEETS'), at)
      }
    }
  })

  test('the numbers drawn are the facts: totals, busiest hour, per-card agent-time and commits, now', () => {
    const f = realShaped()
    // wide enough for the sign's two lines to keep every total in its long form
    const svg = renderSvg(f, { view: 'today', width: 960 })
    const all = texts(svg)
    const t = f.totals
    assert.ok(all.some((s) => s.includes(`${fmtMinutes(t.agent_minutes)} agent-time (${fmtMinutes(t.desk_minutes)} at desks)`)), 'header agent-time')
    // the totals are on the rooftop sign, under its neon (its tooltip the view, the day and the shift), before the shell's brick
    const sign = svg.slice(svg.indexOf('<g><title>THE OFFICE · today · Mon 26 Oct · '), svg.indexOf('fill="url(#to-brick)"'))
    assert.ok(sign.includes(`${fmtMinutes(t.agent_minutes)} agent-time (`) && sign.includes(`${t.commits} commits`), 'the totals on the sign')
    for (const s of [`${t.sessions} sessions`, `${t.subagents} interns`, `${t.workflows} meetings`, `${t.commits} commits`]) {
      assert.ok(all.some((x) => x.includes(s)), s)
    }
    const best = f.per_hour.indexOf(Math.max(...f.per_hour))
    const hh = (h) => String(h).padStart(2, '0')
    assert.ok(all.some((s) => s.includes(`busiest hour ${hh(best)}:00–${hh(best + 1)}:00`)), 'busiest hour')
    assert.ok(all.some((s) => s.includes(`${fmtMinutes(f.per_hour[best])} agent-time`)), 'busiest hour agent-time')
    // the ten busiest projects get a card: name, agent-time, commits
    const cards = [...f.projects].sort((a, b) => b.agent_minutes - a.agent_minutes || b.commits - a.commits).slice(0, 10)
    for (const p of cards) {
      assert.ok(all.includes(fmtMinutes(p.agent_minutes)), `${p.name} agent-time`)
      if (p.commits) assert.ok(all.includes(fmtInt(p.commits)), `${p.name} commits`)
    }
    assert.ok(all.includes('all projects') && all.includes(fmtMinutes(t.agent_minutes)), 'totals card')
    // now: the time over the hour cells, the one place it is drawn (the header carries no clock); hour tooltips up to
    // now, none for the hours still to come
    assert.equal(all.filter((s) => s === '18:17').length, 1, 'now label, and no clock on the header')
    assert.match(svg, /<title>18:00–19:00 · [^<]*<\/title>/)
    assert.doesNotMatch(svg, /<title>19:00–20:00 · /)
    assert.match(svg, new RegExp(`<title>${hh(best)}:00–${hh(best + 1)}:00 · ${fmtMinutes(f.per_hour[best])} agent-time</title>`))
  })

  test('week facts: the hours are summed over the range, no now line', () => {
    const svg = renderSvg(SAMPLE, { view: 'today' })
    const all = texts(svg)
    assert.ok(all.some((s) => s.includes(`hours summed over ${SAMPLE.range.label}`)), 'hour strip label')
    assert.equal(all.filter((s) => s === SAMPLE.now.local_time).length, 0, 'no now label, and no clock on the header')
    assert.match(svg, /<title>23:00–00:00 · /)
    assert.match(svg, /aria-label="The Office timesheet, /)
  })

  test('escapes hostile text in project names and titles', () => {
    const f = realShaped()
    f.projects[0].name = HOSTILE
    f.projects[0].titles = [HOSTILE]
    f.live.desks[0].project = HOSTILE
    for (const width of WIDTHS) {
      const svg = renderSvg(f, { view: 'today', width })
      assert.doesNotMatch(svg, /<script|‮/)
      assert.match(svg, /&lt;script&gt;/)
      assert.equal(xmlProblem(svg), '')
    }
  })

  test('animate:false emits no SMIL; animated, the Clawd punches its card', () => {
    for (const [label, f] of sets()) {
      const svg = renderSvg(f, { view: 'today', animate: false })
      assert.doesNotMatch(svg, /<animate|<set\b/, label)
    }
    const live = renderSvg(realShaped(), { view: 'today' })
    assert.match(live, /<g id="to-td-punch">.*?<animateTransform[^>]*values="0 0;0 0;-4 0"/)
  })

  test('the stress office stays under 60 000 chars; cards cap at ten, the rest are counted', () => {
    const f = stressFacts()
    // the scene (its header, the rooftop sign, its neon's glow and the day's skyline, about 10 000 more than the one-row
    // board they replaced; the timesheet on its clipboard with the day's picture, about 12 000 more than the wall of
    // cards it replaced, its city alive under the sky of the hour), and the commits line under its street
    // (svg-street.mjs: under 7 000 at the pane widths)
    for (const width of WIDTHS) {
      const svg = renderSvg(f, { view: 'today', width })
      assert.ok(svg.length <= 60_000, `${width}: ${svg.length}`)
    }
    const all = texts(renderSvg(f, { view: 'today' }))
    assert.ok(all.some((s) => s.includes(`+${40 - 10 + f.projects_more} more projects`)), 'more projects')
  })

  test('size: under 60 000 chars at the pane widths, under 66 000 at 2400 (longer coordinates, every hour labelled)', () => {
    for (const f of [stressFacts(), clone(SAMPLE), realShaped()]) {
      // the rooftop sign, its neon and the skyline included, and the commits line under the street (under 9 000 at 2400)
      assert.ok(renderSvg(f, { view: 'today', width: 2400 }).length <= 66_000, 'today @2400')
      // the week tower draws richer (lit rooms behind the street front's windows, their agents, pixel-lettered signs),
      // under the same rooftop sign and skyline; alone it stays under the budget, and stacked in `all` it sheds detail
      // itself (test/svg-week.test.mjs)
      for (const width of [960, 2400]) assert.ok(renderSvg(f, { view: 'week', width }).length <= 105_000, `week @${width}`)
    }
  })

  test('an empty morning: the no-cards message sits on a slip of paper over the playhead, not struck through by it', () => {
    const f = emptyFacts()
    f.range = { ...f.range, kind: 'today', days: ['2026-10-26'], label: 'Mon 26 Oct' }
    const svg = renderSvg(f, { view: 'today', width: 960, animate: false })
    const msg = svg.indexOf('>no time cards yet: nobody has worked today<')
    const head = svg.indexOf(`<path fill="${MARKER}"`)
    assert.ok(msg > 0 && head > 0 && msg > head, 'the message is drawn after (over) the playhead at the hour now')
    assert.match(svg.slice(head, msg), /<path fill="#f8f3e7" d="M[\d.]+ [\d.]+h\d+v8/, 'on a slip of the sheet\'s paper')
    // nobody worked: no building, no crown; the hour now is a bare lot with the mascot on it, a crane on the next one
    assert.doesNotMatch(svg, /#to-td-crown"|fill="url\(#to-td-(lit|glass)\)"/)
    assert.match(svg, /#to-td-tree-n"/)
  })

  test('the timesheet on its clipboard: the day\'s picture, the date on the month\'s band, a gold star a line, the hour now a playhead', () => {
    const f = realShaped()
    const svg = renderSvg(f, { view: 'today', width: 960, animate: false })
    const all = texts(svg)
    // the date on the band in the month calendar's October color, the sun and the moon either side of it
    assert.ok(all.includes('MONDAY 26 OCTOBER 2026'), 'the date')
    assert.match(svg, /<path fill="#c0512a" d="M[\d.]+ [\d.]+h[\d.]+v10h/, 'October\'s band')
    assert.match(svg, /#to-td-orn-sun".*#to-td-orn-moon"/)
    // the picture, clipped to its frame: a building for every hour worked, the busiest crowned once
    const pic = svg.slice(svg.indexOf('<clipPath id="to-td-pic">'), svg.indexOf('MONDAY 26 OCTOBER 2026'))
    assert.match(pic, /<g clip-path="url\(#to-td-pic\)">/)
    assert.equal(pic.split('#to-td-crown"').length - 1, 1, 'one crown, on the busiest hour')
    // the lines: at most one gold star each (its best hour, when that is of the sheet's top step)
    const lines = Math.min(10, f.projects.length) + 1
    const stars = svg.split('#to-td-star"').length - 1
    assert.ok(stars >= 1 && stars <= lines, `${stars} gold stars for ${lines} lines`)
    // the hour now as a playhead: one thin red line down the lines and the totals, nothing washed over the hour's bars,
    // a tag with the time
    assert.match(svg, new RegExp(`<path fill="${MARKER}" d="M[\\d.]+ [\\d.]+h1v\\d+h-1z`), 'the line, one unit wide')
    assert.doesNotMatch(svg, new RegExp(`fill="${MARKER}" fill-opacity`), 'no wash over the hour')
    for (const c of ['#ff7d6e', '#a3261c']) assert.ok(!svg.includes(`fill="${c}"`), `no ring (${c})`)
    assert.match(svg, /<g font-weight="bold"><text [^>]*fill="#fff8e8" text-anchor="middle">18:17<\/text><\/g>/, 'the tag')
    // every bar stands under a dark top edge one unit tall, so a light project's hours show on the paper: the totals
    // line's green ones, for one
    const caps = svg.match(new RegExp(`<path fill="${capOf('#57a333')}" d="([^"]+)"`))
    assert.ok(caps && caps[1].split('z').filter(Boolean).every((r) => /^M[\d.]+ [\d.]+h[\d.]+v1h-[\d.]+$/.test(r)), 'the totals bars\' edges')
    // the six-hour columns of the grid darker: 06, 12 and 18
    assert.match(svg, new RegExp(`<path fill="${INK_HEAD}" d="(M[\\d.]+ [\\d.]+h1v[\\d.]+h-1z){3}"/>`), 'the six-hour columns')
    // one parcel by each count of commits, the lines' and the totals'
    const shown = [...f.projects].sort((a, b) => b.agent_minutes - a.agent_minutes || b.commits - a.commits).slice(0, 10)
    assert.equal(svg.split('#to-td-parcel"').length - 1, shown.filter((p) => p.commits).length + (f.totals.commits ? 1 : 0), 'a parcel a count')
    // each hour's tooltip on its building and its totals cell
    assert.match(svg, /<path fill-opacity="0" d="M[\d.]+ [\d.]+h[\d.]+v[\d.]+h-[\d.]+zM[\d.]+ [\d.]+h[\d.]+v[\d.]+h-[\d.]+z"><title>18:00–19:00 · /)
    // a range of days: no hour now, so no playhead and no crane; its label on the band, the mascot under the picture's
    // one crown (the employee of the range's plate wears its own)
    const week = renderSvg(SAMPLE, { view: 'today', width: 960, animate: false })
    assert.ok(texts(week).includes(SAMPLE.range.label.toUpperCase()), 'the range on the band')
    assert.doesNotMatch(week, new RegExp(`<path fill="${MARKER}"`))
    const weekPic = week.slice(week.indexOf('<clipPath id="to-td-pic">'), week.indexOf(SAMPLE.range.label.toUpperCase()))
    assert.equal(weekPic.split('#to-td-crown"').length - 1, 1, 'one crown in the picture')
    assert.match(week, /<title>employee of the week: [^<]*<\/title>.*?#to-td-crown"/, 'the employee\'s plate crowned')
  })

  test('the day\'s picture is the city now: one sky for the hour, every building lit by it, alive when animated', () => {
    const at = (time, hour) => {
      const f = realShaped()
      f.now = { ...f.now, local_time: time, hour, is_night: hour >= 20 || hour < 7 }
      return f
    }
    // the picture from its frame to the date band under it, and its frame
    const pictureOf = (svg) => svg.slice(svg.indexOf('<clipPath id="to-td-pic">'), svg.indexOf('<text', svg.indexOf('<clipPath id="to-td-pic">')))
    const count = (s, name) => s.split(`#to-${name}"`).length - 1
    const cases = [['14:20', at('14:20', 14), 'day'], ['18:17', realShaped(), 'warm'], ['01:40', todayFacts(), 'night']]
    for (const [time, f, light] of cases) {
      const svg = renderSvg(f, { view: 'today', width: 960, animate: false })
      const pic = pictureOf(svg)
      const [x, y, w] = /<clipPath id="to-td-pic"><path d="M(\d+) (\d+)h(\d+)v/.exec(pic).slice(1)
      // one sky, as wide as the picture (not a sky per hour), and in it the sun or the moon, never both
      assert.match(pic, new RegExp(`^<clipPath[^]*?<g clip-path="url\\(#to-td-pic\\)"><path fill="#[0-9a-f]{6}" d="M${x} ${y}h${w}v`), `${time}: one sky`)
      assert.equal(count(pic, 'td-sun'), light === 'night' ? 0 : 1, `${time}: the sun`)
      assert.equal(count(pic, 'td-moon'), light === 'night' ? 1 : 0, `${time}: the moon`)
      // stars by night only; glass windows by day, lit ones when the light goes, a wide glow round a low sun
      assert.equal(pic.includes('fill="#f4f1dc"'), light === 'night', `${time}: stars`)
      assert.equal(/fill="url\(#to-td-glass\)"/.test(pic), light === 'day', `${time}: glass windows`)
      assert.match(pic, /fill="url\(#to-td-lit\)"/, `${time}: lit windows (the hour now's, at least)`)
      assert.equal(pic.includes('fill="#ffc070"'), light === 'warm', `${time}: the sun's glow`)
      // drawn still, nothing drives by
      assert.equal(count(pic, 'td-car') + count(pic, 'td-taxi') + count(pic, 'td-bird'), 0, `${time}: still`)
    }
    // animated: clouds drift round, a car and a taxi drive by; by day a flock flies over, by night a star shoots
    const day = pictureOf(renderSvg(at('14:20', 14), { view: 'today', width: 960 }))
    assert.match(day, /<animateTransform attributeName="transform" type="translate" values="0 0;\d+ 0;-\d+ 0;0 0" keyTimes="0;([.\d]+);\1;1"/, 'a cloud')
    assert.ok(count(day, 'td-car') === 1 && count(day, 'td-taxi') === 1 && count(day, 'td-bird') === 3, 'the traffic, a flock')
    const night = pictureOf(renderSvg(todayFacts(), { view: 'today', width: 960 }))
    assert.match(night, /<animate attributeName="opacity" values="0;1;1;0;0"/, 'a shooting star')
    assert.equal(count(night, 'td-bird'), 0, 'no birds by night')
  })

  test('narrow: names stay whole on two lines and apart, the totals card says total; the employee of the day keeps its plate', () => {
    const f = realShaped()
    f.projects[0].name = 'ultra-fast-rasters'
    f.projects[1].name = 'ultra-mesh-toolkit'
    for (const width of [320, 480]) {
      const svg = renderSvg(f, { view: 'today', width, animate: false })
      const t = texts(svg)
      assert.ok(!t.some((s) => s.startsWith('all proj') && s.endsWith('…')), `no all projec… @${width}`)
      assert.ok(t.includes('total') || t.includes('all projects'), `totals card named @${width}`)
      const names = t.filter((s) => s.startsWith('ult'))
      assert.equal(new Set(names).size, names.length, `two ultra-… projects stay apart @${width}: ${names}`)
    }
    // at 480 a long name is broken after a dash onto two lines, every letter kept; the racks give way before the
    // employee of the day and the calendar do
    const t480 = texts(renderSvg(f, { view: 'today', width: 480, animate: false }))
    for (const [a, b] of [['ultra-fast-', 'rasters'], ['ultra-mesh-', 'toolkit']]) {
      assert.equal(t480[t480.indexOf(a) + 1], b, `${a}${b} on two lines`)
    }
    assert.ok(t480.includes('EMPLOYEE OF THE DAY'), 'the employee of the day @480')
    // the cards say themselves (their tooltips the rest): no key of cells, parcels and figures, no “agent-time = …”
    const wideSvg = renderSvg(f, { view: 'today', width: 960, animate: false })
    const wide = texts(wideSvg)
    // the employee of the day's plate: the caption over its whole name, bold and a size over the sheet's names
    const plate = wideSvg.match(/<title>employee of the day: ([^<·]+?) ·[^<]*<\/title>.*?>EMPLOYEE OF THE DAY<\/text><g font-weight="bold"><text [^>]*font-size="6.5"[^>]*>([^<]+)<\/text>/)
    assert.ok(plate, 'the plate')
    assert.equal(plate[2], plate[1], `${plate[1]} whole on its plate`)
    for (const s of ['a commit', 'a desk open now', 'more agent-time in that hour']) assert.ok(!wide.includes(s), s)
    assert.ok(!wide.some((s) => s.startsWith('agent-time =')))
  })

  test('never throws on missing or odd facts; empty office reads as such', () => {
    const odd = [null, {}, { projects: [null, 1, 'x', { name: 7, per_hour: 'no' }], per_hour: [1, -5, 'x'], totals: 'none', now: { hour: 99 } },
      { ...todayFacts(), per_hour: undefined, totals: undefined }]
    for (const f of odd) {
      for (const width of [240, 640]) {
        const svg = renderSvg(f, { view: 'today', width })
        assert.equal(xmlProblem(svg), '')
        assert.match(svg, /aria-label="The Office/)
      }
    }
    const empty = emptyFacts()
    empty.range = { ...empty.range, kind: 'today', label: 'Mon 26 Oct' }
    const all = texts(renderSvg(empty, { view: 'today' }))
    assert.ok(all.includes('no time cards yet: nobody has worked today'))
    assert.ok(all.some((s) => s.includes('no agent-time yet today')))
  })

  test('deterministic', () => {
    assert.equal(renderSvg(realShaped(), { view: 'today' }), renderSvg(realShaped(), { view: 'today' }))
  })

  test('a day of the past whose sessions have no agent-time left still has their time cards', () => {
    // a day of January 2026: Claude Code's old index names a session of hennessy-cny, its transcript long deleted
    const f = emptyFacts()
    f.range = { ...f.range, kind: 'today', back: 292, days: ['2026-01-14'], label: 'Wed 14 Jan' }
    f.projects = [{ ...clone(SAMPLE.projects[0]), name: 'hennessy-cny', sessions: 1, agent_minutes: 0, commits: 0, per_hour: new Array(24).fill(0) }]
    f.totals = { ...f.totals, sessions: 1 }
    const svg = renderSvg(f, { view: 'today', width: 960 })
    assert.ok(svg.includes('hennessy-cny') && !svg.includes('nobody worked that day'))
  })

  test('a page of the past is drawn as that day: its date, its first in and last out, its time cards, no clock, no desks', () => {
    // yesterday, the whole day of it, seen at 18:17 today with desks open now
    const f = clone(SAMPLE)
    f.range = { ...f.range, kind: 'today', back: 1, days: ['2026-10-25'], label: 'Sun 25 Oct' }
    f.now = { ...f.now, iso: '2026-10-26T17:17:00.000Z', local_date: '2026-10-26', local_time: '18:17', hour: 18, is_night: false }
    assert.ok(f.live.desks.length > 0, 'desks are open now')
    const svg = renderSvg(f, { view: 'today', width: 960, animate: false })
    const all = texts(svg)
    // the day's own date on the calendar and the band, never today's
    assert.match(svg, /<title>sunday 25 october<\/title>/, 'the calendar on that day')
    assert.ok(all.includes('SUN 25 OCT'), 'the band on that day')
    // its first in and last out on the TIME CLOCK's header, nobody clocked in now, no Clawd punching in, no time
    const hh = (h) => String(h).padStart(2, '0')
    const first = f.per_hour.findIndex((v) => v > 0)
    const last = f.per_hour.findLastIndex((v) => v > 0)
    assert.ok(all.some((s) => s.includes(`first in ${hh(first)}:00`)) && all.some((s) => s.includes(`last out ${hh(last + 1)}:00`)), 'first in, last out')
    assert.ok(!all.some((s) => s.includes('clocked in now')), 'nobody clocked in now')
    assert.ok(!svg.includes('#to-td-punch"'), 'no Clawd punching in')
    assert.doesNotMatch(svg, /<title>punch clock \d\d:\d\d/, 'no time on the clock')
    // the racks hold that day's time cards; today's desks are on none of its lines, and the sheet has no desks column
    assert.match(svg, /<title>\d+ time cards that day: /, 'that day\'s time cards')
    assert.ok(!all.includes('desks') && !all.includes('at desks'), 'no desks column')
    assert.ok(!svg.includes('open now'), 'no desk open now on that day')
    // no hour now: no playhead
    assert.doesNotMatch(svg, new RegExp(`<path fill="${MARKER}"`))
  })
})
