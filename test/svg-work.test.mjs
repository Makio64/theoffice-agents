import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { renderSvg } from '../plugin/lib/svg.mjs'
import { CLAWD_UNITS, LADDER, WORK_BUDGET, WORK_ROOMS, clawdUnit, workRooms } from '../plugin/lib/svg-work.mjs'
import { HEAD, INFO, ROW, SKY, SPRITE_CLASHES, textW } from '../plugin/lib/svg-kit.mjs'
import { fmtCount, fmtInt } from '../plugin/lib/format.mjs'
import { DEPARTMENTS, DEPARTMENT_WORK, pct } from '../plugin/lib/model.mjs'
import { SAMPLE, clone, emptyFacts, stressFacts } from './helpers/facts.mjs'

// ---------------------------------------------------------------- fixtures

const HOSTILE = '<script>alert(1)</script> & "x"'

// The shape of a real week: terminal-heavy, a long tail under 1%, one department never used, a daytime "now".
function realShaped() {
  const f = clone(SAMPLE)
  f.now = { ...f.now, is_night: false, hour: 14, local_time: '14:05' }
  f.totals.activity = { terminal: 65368, testing: 16382, reading: 11533, coding: 6353, web: 5418, tools: 1456, planning: 962, talking: 420,
    delegating: 319, design: 0 }
  f.totals.intern_types = { 'workflow-subagent': 1454, 'general-purpose': 46, Explore: 8 }
  return f
}

// Hostile text where the scene prints facts strings: the range label, project names (floor legend, tooltips) and
// intern types (the bench).
function hostileFacts() {
  const f = stressFacts()
  f.range.label = HOSTILE
  f.projects[0].name = HOSTILE
  f.totals.intern_types = { [HOSTILE]: 40, Explore: 3 }
  return f
}

const SETS = () => [['sample', clone(SAMPLE)], ['real-shaped', realShaped()], ['empty', emptyFacts()], ['stress', stressFacts()]]

// Balanced tags, quoted attributes, no raw `<` or bare `&` in text: the first problem, or ''.
function xmlProblem(src) {
  const stack = []
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|([^<]+)|(<)/g
  let m
  while ((m = re.exec(src))) {
    if (m[6]) return `stray < at ${m.index}`
    if (m[5] != null) {
      if (/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/i.test(m[5])) return `bare & near ${m.index}`
      continue
    }
    if (m[1]) {
      if (stack.pop() !== m[2]) return `</${m[2]}> unbalanced at ${m.index}`
    } else if (!m[4]) stack.push(m[2])
  }
  return stack.length ? `unclosed <${stack.at(-1)}>` : ''
}

const texts = (svg) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1])

// Each room's box, from its tooltip hit area: department name → { x, y, w }.
function roomBoxes(svg) {
  const out = new Map()
  for (const m of svg.matchAll(/<path fill-opacity="0" d="M([\d.]+) ([\d.]+)h([\d.]+)v[^"]*"><title>([^=<]+) = /g)) out.set(m[4], { x: +m[1], y: +m[2], w: +m[3] })
  return out
}

// A room's bar of its share: the rect 2 tall on the slab, 5 under its floor and 4 in from its left; 0 for none.
function barOf(svg, { x, y }) {
  const m = new RegExp(`M${x + 4} ${y + HEAD + ROW + 5}h(\\d+)v2h`).exec(svg)
  return m ? +m[1] : 0
}

// The rooftop sign, from its dark box: { x, w }; and its lines of plain text (centered under the neon): { cx, s }.
const signOf = (svg) => {
  const m = /<g><title>THE OFFICE · [^<]*<\/title><path fill="#1a1613" d="M([\d.]+) 2h([\d.]+)v40h/.exec(svg)
  return m ? { x: +m[1], w: +m[2] } : null
}
const signLines = (svg) => {
  const ys = [INFO.one, ...INFO.two].map((y) => String(y).replace('.', '\\.')).join('|')
  return [...svg.matchAll(new RegExp(`<text x="([\\d.]+)" y="(?:${ys})" font-size="${INFO.size}" text-anchor="middle">(.*?)</text>`, 'g'))]
    .map((m) => ({ cx: +m[1], s: m[2].replace(/<[^>]+>/g, '') }))
}

// ---------------------------------------------------------------- the scene

describe('what they did (work scene)', () => {
  test('renders sample, real-shaped, empty and stress facts at 480/640/960: safe, well-formed, under 58 000 chars', () => {
    for (const [label, f] of SETS()) {
      for (const width of [480, 640, 960]) {
        const at = `${label}@${width}`
        const svg = renderSvg(f, { view: 'work', width })
        assert.equal(xmlProblem(svg), '', at)
        assert.doesNotMatch(svg, /<script|<foreignObject|<image\b|\son[a-z]+\s*=/i, at)
        assert.doesNotMatch(svg.replace(' xmlns="http://www.w3.org/2000/svg"', ''), /\bhref="(?!#)|url\((?!#)/, at)
        // in full (the interns' bench, the extras), under the header's rooftop sign, its neon and the skyline
        assert.ok(svg.length <= 58_000, `${at}: ${svg.length}`)
        assert.match(svg, /aria-label="The Office, what they did/, at)
        for (const ref of svg.matchAll(/(?:href="#|url\(#)([^")]+)/g)) assert.ok(svg.includes(`id="${ref[1]}"`), `${at}: dangling #${ref[1]}`)
      }
    }
    assert.deepEqual(SPRITE_CLASHES, [])
  })

  test('stays under 58 000 chars at every width; the Office draws it in full as its basement, never as a second building', () => {
    // the scene's own budget weighs its rooms (the roof every view shares left out): with the rooftop sign, its neon, the
    // skyline and the commits line under it, the view stays under 58 000
    assert.ok(WORK_BUDGET <= 42_000)
    for (const f of [stressFacts(), hostileFacts(), realShaped()]) {
      for (const width of [240, 1200, 2400]) {
        assert.ok(renderSvg(f, { view: 'work', width }).length <= 58_000, `work@${width}`)
        // the Office is the live building; what they did is its basement (B1): the work scene's rooms, but not its
        // building (no header of its own, no interns' bench); neither says how to read it: the rooms do
        const all = renderSvg(f, { view: 'all', width })
        assert.ok(all.includes('>WHAT THEY DID<') && !all.includes('how to read:') && !all.includes('>INTERNS<') && !all.includes('· what they did ·'), `all@${width}: the basement only`)
        assert.ok(!renderSvg(f, { view: 'work', width }).includes('how to read:'), `work@${width}: no how to read`)
      }
    }
    // the sample's week fits the interns' bench at every pane width
    for (const width of [480, 640, 960]) assert.ok(renderSvg(SAMPLE, { view: 'work', width }).includes('>INTERNS<'), `sample @${width}`)
  })

  test('every number drawn comes from the facts: total, shares and call counts', () => {
    const f = clone(SAMPLE)
    const act = f.totals.activity
    const total = Object.values(act).reduce((a, b) => a + b, 0)
    const svg = renderSvg(f, { view: 'work', width: 960, animate: false })
    const t = texts(svg)
    // the title rule over the rooms: what the shares are of, and the total
    assert.ok(t.includes('SHARE OF TOOL CALLS') && t.includes(fmtCount(total)), 'the title rule and its total')
    for (const [k] of DEPARTMENTS) {
      assert.ok(t.includes(pct(act[k], total)), `${k} share ${pct(act[k], total)}`)
      assert.ok(t.includes(`${fmtInt(act[k])} calls`), `${k} count`)
    }
    // the busiest department is named first in the alt text with its share
    assert.match(svg, new RegExp(`aria-label="The Office, what they did: ${fmtInt(total)} tool calls, terminal commands ${pct(act.terminal, total)} \\(server room\\)`))
  })

  test('each department says its kind of work in plain words (short ones in a narrow room); unused ones are closed', () => {
    const svg = renderSvg(realShaped(), { view: 'work', width: 640, animate: false })
    const t = texts(svg)
    for (const [k, { words }] of Object.entries(WORK_ROOMS)) assert.ok(t.includes(words) || t.includes(DEPARTMENT_WORK[k]), words)
    // with the width for them, the busy rooms say it in full
    const wide = texts(renderSvg(realShaped(), { view: 'work', width: 1600, animate: false }))
    for (const k of ['terminal', 'testing', 'reading', 'coding', 'web']) assert.ok(wide.includes(WORK_ROOMS[k].words), `${k} @1600`)
    for (const plate of ['SERVER ROOM', 'QA LAB', 'LIBRARY', 'TYPING POOL', 'INTERNET CAFÉ', 'GADGET SHOP', 'WHITEBOARD', 'PHONE BOOTH', 'MANAGEMENT', 'ART STUDIO']) {
      assert.ok(t.includes(plate), plate)
    }
    assert.ok(t.includes('&lt;1%') && t.includes('0%') && t.includes('no calls'))
    assert.match(svg, /href="#to-wk-closed"/)   // design tools: 0 calls, the room is closed
    assert.ok(svg.includes('<title>art studio = design tools: no calls (closed)</title>'))
    const empty = renderSvg(emptyFacts(), { view: 'work', animate: false })
    assert.ok(empty.includes('no tool calls in this range yet') && (empty.match(/href="#to-wk-closed"/g) ?? []).length === 10)
  })

  test('one busy Clawd per started 5% or 10% of the share printed, any calls at all → one; the key says which', () => {
    const { rooms, total } = workRooms(realShaped())
    assert.equal(total, 108_211)
    assert.deepEqual(rooms.map((r) => r.k), ['terminal', 'testing', 'reading', 'coding', 'web', 'tools', 'planning', 'talking', 'delegating', 'design'])
    assert.deepEqual(rooms.map((r) => r.share), ['60%', '15%', '11%', '6%', '5%', '1%', '1%', '<1%', '<1%', '0%'])
    assert.deepEqual(rooms.map((r) => r.n), [6, 2, 2, 1, 1, 1, 1, 1, 1, 0])
    assert.deepEqual(workRooms(realShaped(), 5).rooms.map((r) => r.n), [12, 3, 3, 2, 1, 1, 1, 1, 1, 0])
    // the unit is the finest at which the busiest room's stations fit the building, and the key on the sign says it
    assert.deepEqual(CLAWD_UNITS.slice(0, 2), [5, 10])
    assert.equal(clawdUnit(realShaped(), 460), 5)
    assert.equal(clawdUnit(realShaped(), 300), 10)
    for (const [width, unit] of [[960, 5], [640, 10], [480, 10]]) {
      const svg = renderSvg(realShaped(), { view: 'work', width, animate: false })
      assert.match(svg, new RegExp(`1 Clawd (= up to|≤) ${unit}%`), `key @${width}`)
      // the drawing seats them: the server room's Clawds at its consoles (typing, every third one reading the logs);
      // the first row of rooms (the top tier) starts under the shared header's roof and the title rule, its furniture
      // under the nameplates
      const row1 = SKY + 5 + 15 + HEAD
      const start = svg.indexOf(`<g transform="translate(10 ${row1})">`)
      const next = svg.slice(start + 1).search(new RegExp(`<g transform="translate\\(\\d+ (${row1}|${row1 + 66})\\)">|<g><title>hallway`))
      const server = svg.slice(start, start + 1 + next)
      const n = Math.ceil(60 / unit)
      assert.equal((server.match(/href="#to-c(T0|R)"/g) ?? []).length, n, `server Clawds @${width}`)
      assert.equal((server.match(/href="#to-wk-con"/g) ?? []).length, n, `consoles @${width}`)
    }
    // the library reads as one: bookcases, a reader per station behind an open book (a ribbon in its project's color)
    // at the long reading table, the rolling ladder where the room has width to spare; closed, a closed book
    for (const [width, n, ladder] of [[640, 2, 0], [960, 3, 1], [1600, 3, 0]]) {
      const lib = renderSvg(realShaped(), { view: 'work', width, animate: false })
      assert.ok(lib.includes('url(#to-wk-shelvesp)'), `bookcases @${width}`)
      const seats = lib.match(/<use href="#to-cL" (?:x="\d+" )?y="13"\/><use href="#to-wk-read"(?: x="\d+")? color="#[0-9a-f]{6}"\/>/g) ?? []
      assert.equal(seats.length, n, `readers @${width}`)
      assert.equal((lib.match(/href="#to-wk-ladder"/g) ?? []).length, ladder, `ladder @${width}`)
    }
    // now and then each reader turns a page: one flipping page per reader, each on a phase of its own
    const turning = renderSvg(realShaped(), { view: 'work', width: 960 })
    const flips = [...turning.matchAll(/<path fill="#f4efe4" transform="translate\(\d+ 0\)" d="M0 0"><animate attributeName="d"[^>]*?(?: begin="(-[\d.]+)s")? calcMode/g)]
      .map((m) => m[1] ?? '0')
    assert.equal(flips.length, 3, 'a page per reader')
    assert.equal(new Set(flips).size, 3, `each reader on its own phase: ${flips}`)
    const shut = realShaped()
    shut.totals.activity.reading = 0
    const closed = renderSvg(shut, { view: 'work', width: 960, animate: false })
    assert.ok(closed.includes('href="#to-wk-read0"') && !closed.includes('href="#to-wk-read"'), 'a closed library: a closed book, no reader')
    // the org chart and the paintings are not Clawds to count: only the busy ones are
    const svg = renderSvg(realShaped(), { view: 'work', width: 1600, animate: false })
    const org = /<g id="to-wk-org">(.*?)<\/g>/.exec(svg)?.[1] ?? ''
    assert.doesNotMatch(org, /#d77757|href="#to-c/, 'the org chart draws silhouettes')
    assert.doesNotMatch(/<g id="to-wk-arts">(.*?)<\/g>/.exec(svg)?.[1] ?? '', /#d77757/, 'no Clawd portrait in the art studio')
  })

  test('two tiers: the busiest that fit side by side on top, as wide as their shares, over a grid of equal cells; every bar to one scale', () => {
    for (const f of [clone(SAMPLE), realShaped(), stressFacts()]) {
      for (const width of [320, 480, 640, 960, 1600]) {
        const svg = renderSvg(f, { view: 'work', width, animate: false })
        const box = roomBoxes(svg)
        const { rooms } = workRooms(f)
        assert.equal(box.size, 10, `10 rooms @${width}`)
        const at = (r) => box.get(r.name)
        // the top tier: the first row, the busiest rooms (up to three), busier never narrower; the busiest is the
        // widest room of all
        const top = rooms.filter((r) => at(r).y === at(rooms[0]).y)
        assert.ok(top.length >= 1 && top.length <= 3 && top.every((r, i) => r === rooms[i]), `@${width}: the top tier is the busiest`)
        for (let i = 1; i < top.length; i++) assert.ok(at(top[i]).w <= at(top[i - 1]).w, `@${width}: ${top[i].name} wider than ${top[i - 1].name}`)
        assert.equal(at(rooms[0]).w, Math.max(...[...box.values()].map((b) => b.w)), `@${width}: the busiest is the widest`)
        // the grid under it: whole cells (a room with many Clawds spans several, with the partitions between them)
        const grid = rooms.slice(top.length).map((r) => at(r).w)
        const cell = Math.min(...grid)
        for (const w of grid) assert.ok(Number.isInteger((w + 3) / (cell + 3)), `@${width}: ${w} is not a whole number of ${cell} cells`)
        // the bars: one scale for the whole building, busier never shorter, as many calls to a unit in every room
        const busy = rooms.filter((r) => r.v > 0)
        const bars = busy.map((r) => barOf(svg, at(r)))
        for (let i = 1; i < bars.length; i++) assert.ok(bars[i] <= bars[i - 1], `@${width}: ${busy[i].name}'s bar ${bars[i]} > ${bars[i - 1]}`)
        const k = bars[0] / busy[0].v
        busy.forEach((r, i) => assert.ok(Math.abs(bars[i] - Math.max(2, k * r.v)) <= 1, `@${width}: ${r.name}'s bar ${bars[i]}, ${(k * r.v).toFixed(1)} to scale`))
      }
    }
    // the shape of a real week: the 60% room's bar many times the 6% one's, however alike the small rooms are drawn
    const svg = renderSvg(realShaped(), { view: 'work', width: 960, animate: false })
    const box = roomBoxes(svg)
    assert.ok(barOf(svg, box.get('server room')) >= 8 * barOf(svg, box.get('typing pool')), 'a 60% room is many times a 6% one')
    assert.equal(box.get('management').w, box.get('typing pool').w, 'small rooms drawn alike')
  })

  test('the rooms say what they do: terminals over the consoles, code on the coders’ screens, an org chart, the lines on the wall', () => {
    const svg = renderSvg(SAMPLE, { view: 'work', width: 960, animate: false })
    const def = (name) => new RegExp(`<g id="to-${name}">(.*?)</g><g id=`).exec(svg)?.[1] ?? ''
    assert.ok(def('wk-con').includes('#0b100b'), 'a terminal over each console')
    assert.ok(def('wk-type').includes('#1b2030'), 'a screen of code at each typing desk')
    assert.ok(svg.includes('href="#to-wk-orgS"') || svg.includes('href="#to-wk-org"'), 'an org chart in management, whatever its width')
    assert.ok(svg.includes('href="#to-wk-rackopen"'), 'one rack open, an extra')
    // the office's lines, on the typing pool's wall
    assert.match(svg, /<title>\+107,100 \/ −23,800 lines in commits this week<\/title>/)
  })

  test('the key stays readable at every width, a short form rather than none', () => {
    for (const width of [320, 480, 960]) {
      const svg = renderSvg(realShaped(), { view: 'work', width, animate: false })
      assert.match(svg, /1 Clawd (= up to|≤) \d+%/, `@${width}`)
      // on the rooftop sign, centered under its neon, each of its lines inside the sign's margins
      const sign = signOf(svg)
      const lines = signLines(svg)
      assert.ok(sign && lines.length && lines.some((l) => /1 Clawd (= up to|≤) \d+%/.test(l.s)), `the key on the sign @${width}`)
      for (const { cx, s } of lines) {
        assert.equal(cx, sign.x + sign.w / 2, `centered @${width}: ${s}`)
        assert.ok(cx - textW(s, INFO.size) / 2 >= sign.x + 6 - 0.01 && cx + textW(s, INFO.size) / 2 <= sign.x + sign.w - 6 + 0.01, `inside the sign @${width}: ${s}`)
      }
    }
  })

  test('hostile facts strings are escaped (range label, project names, intern types)', () => {
    for (const width of [640, 1200]) {
      const svg = renderSvg(hostileFacts(), { view: 'work', width })
      assert.doesNotMatch(svg, /<script/i)
      assert.ok(svg.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;'), `@${width}`)
      assert.equal(xmlProblem(svg), '', `@${width}`)
    }
  })

  test('animated by SMIL only; animate:false emits none', () => {
    for (const [label, f] of SETS()) {
      const live = renderSvg(f, { view: 'work' })
      assert.doesNotMatch(live, /<set\b|<animateMotion|<style|@keyframes/, label)
      if (label !== 'empty') assert.match(live, /<animate/, label)
      assert.doesNotMatch(renderSvg(f, { view: 'work', animate: false }), /<animate|<set\b/, label)
    }
  })

  test('never throws on odd facts: null, garbage activity, 40 projects, no interns', () => {
    const odd = [null, {}, { totals: { activity: 'x' } }, { totals: { activity: { terminal: -5, coding: 'lots', web: NaN, constructor: 3 } } },
      { totals: { activity: { terminal: 1 }, intern_types: { toString: 2, Explore: '9' } }, projects: [{ name: 7, activity: { terminal: 1 } }, null] }]
    for (const f of odd) {
      for (const width of [240, 640]) {
        const svg = renderSvg(f, { view: 'work', width })
        assert.equal(xmlProblem(svg), '', JSON.stringify(f))
        assert.match(svg, /aria-label="The Office, what they did/)
      }
    }
    const one = renderSvg({ totals: { activity: { terminal: 1 } } }, { view: 'work', animate: false })
    assert.ok(texts(one).includes('100%') && texts(one).includes('1 call'))
  })

  test('deterministic, and the ladder of detail is ordered richest first', () => {
    assert.equal(renderSvg(SAMPLE, { view: 'work' }), renderSvg(SAMPLE, { view: 'work' }))
    // the extras (the library's turning pages and ladder, the open rack) go first, then the interns' bench, then the
    // smallest rooms' furniture
    assert.ok(LADDER[0].extras && LADDER[0].minis > 0 && !LADDER[1].extras && LADDER[1].minis > 0 && !LADDER[2].minis && LADDER.at(-1).bare)
    for (let i = 3; i < LADDER.length - 1; i++) assert.equal(LADDER[i].plain, LADDER[i - 1].plain + 1)
  })
})
