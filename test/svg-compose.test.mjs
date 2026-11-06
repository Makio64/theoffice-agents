// The composer (lib/svg.mjs): the Office view (`all`) is the live building (the week tower is the Week view's), one
// brick shell from the roof to the street and its basement (B1, what they did) under the sidewalk; every view has the
// commits line right under its sidewalk (the Office's under its basement), the lines a scene writes there moved under
// it; transparent drawings give the text that sits on the page a dark halo.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { SVG_VIEWS, renderSvg } from '../plugin/lib/svg.mjs'
import { INFO, K, MAX_SVG, NEON, ORB, SKY, textW } from '../plugin/lib/svg-kit.mjs'
import { SUBWAY_DEEP_H, SUBWAY_H } from '../plugin/lib/svg-street.mjs'
import { SAMPLE, clone, emptyFacts, monthFacts, stressFacts, todayFacts } from './helpers/facts.mjs'

// ---------------------------------------------------------------- fixtures

const day = (f) => {
  const g = clone(f)
  g.now = { ...g.now, is_night: false, hour: 14, local_time: '14:05' }
  return g
}
// 24 seated desks (the idle ones done or dozing at theirs), 6 interns each at the others, three in a meeting: the
// heaviest live floor the caps allow (an idle desk has no interns at work: it would be a boss waiting on them)
function heavyOffice() {
  const f = stressFacts()
  const base = f.live.desks
  f.live.desks = Array.from({ length: 24 }, (_, i) => {
    const d = clone(base[i % base.length])
    d.id = `h${String(i).padStart(7, '0')}`
    d.interns = d.state === 'idle' ? [] : Array.from({ length: 6 }, (_, k) => ({ ...base[0].interns[k % base[0].interns.length], id: `h${i}-${k}` }))
    d.meetings = i < 3 ? [clone(base[3].meetings[0])] : []
    if (i < 3) Object.assign(d, { state: 'waiting_on_agents', status: 'busy' })
    return d
  })
  return f
}
const SETS = () => [['sample', clone(SAMPLE)], ['day', day(SAMPLE)], ['empty', emptyFacts()], ['stress', stressFacts()], ['heavy', heavyOffice()]]

// ---------------------------------------------------------------- tiny parsers

// The brick rects of a drawing, top to bottom: [x, y, w, h].
const bricks = (svg) => [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="url\(#to-brick\)"\/>/g)]
  .map((m) => m.slice(1).map(Number)).sort((a, b) => a[1] - b[1])
// The y of every sidewalk (a K.walk run from the left edge).
const walks = (svg) => [...svg.matchAll(new RegExp(`<path fill="${K.walk}" d="M0 ([\\d.]+)h`, 'g'))].map((m) => Number(m[1]))
// The y the commits line is moved to.
const lineY = (svg) => {
  const i = svg.indexOf('COMMITS LINE')
  const groups = [...svg.slice(0, i).matchAll(/<g transform="translate\(0 ([\d.]+)\)">/g)]
  return Number(groups.at(-1)?.[1])
}
// The sign on the roof, [x, y, w, h]: its dark box, the first thing painted under its tooltip; and the tooltip (what
// its lines leave out: the view, the date or the range, the shift).
const signOf = (svg) => /<g><title>THE OFFICE · [^<]*<\/title><path fill="#1a1613" d="M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)h/.exec(svg)?.slice(1).map(Number)
const signTipOf = (svg) => /<g><title>(THE OFFICE · [^<]*)<\/title><path fill="#1a1613"/.exec(svg)?.[1]
// The sign's own markup: from its tooltip to the brick wall drawn right after it.
const signMarkup = (svg) => {
  const i = svg.indexOf('<g><title>THE OFFICE · ')
  return i < 0 ? '' : svg.slice(i, svg.indexOf('fill="url(#to-brick)"', i))
}
// The scene's lines on the sign: each run of text, { x, y, size, s, mid } (mid: anchored in its middle).
const unesc = (s) => s.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
const infoOf = (svg) => [...signMarkup(svg).matchAll(/<text x="([\d.]+)" y="([\d.]+)" font-size="([\d.]+)"( text-anchor="middle")?>(.*?)<\/text>/g)]
  .map((m) => ({ x: Number(m[1]), y: Number(m[2]), size: Number(m[3]), s: unesc(m[5]), mid: Boolean(m[4]) }))
// Where a sprite is placed: [x, y] of each <use> of it.
const usesOf = (svg, name) => [...svg.matchAll(new RegExp(`<use href="#to-${name}"(?: x="([\\d.-]+)")?(?: y="([\\d.-]+)")?`, 'g'))]
  .map((m) => [Number(m[1] ?? 0), Number(m[2] ?? 0)])
const viewW = (svg) => Number(/viewBox="0 0 (\d+) /.exec(svg)[1])
// The baseline of the first <text> that starts with `s`, whole or in its first tspan.
const textY = (svg, s) => Number(new RegExp(`<text x="[\\d.]+" y="([\\d.]+)"[^>]*>(?:<tspan[^>]*>)?${s}`).exec(svg)?.[1])
const viewH = (svg) => Number(/viewBox="0 0 \d+ (\d+)"/.exec(svg)[1])
// The live basement's left stone wall, [y, h]: from under the sidewalk to the basement floor's last row.
const basementOf = (svg) => /<rect x="6" y="([\d.]+)" width="[\d.]+" height="([\d.]+)" fill="url\(#to-b1-stonep\)"\/>/.exec(svg)?.slice(1).map(Number)
// Views whose building goes on underground: their commits line runs under the basement, without a road.
const DEEP = new Set(['live', 'all'])

// ---------------------------------------------------------------- the Office: the live building

describe('the Office view is the live building', () => {
  test('exactly the live drawing: one brick shell from the roof to the street under its parapet, one sidewalk, no week floors, what they did in B1', () => {
    assert.deepEqual(SVG_VIEWS.all, ['live'])
    for (const [label, f] of SETS()) {
      for (const width of [480, 660, 960]) {
        const at = `${label}@${width}`
        const svg = renderSvg(f, { view: 'all', width, animate: false })
        assert.equal(svg, renderSvg(f, { view: 'live', width, animate: false }), `${at}: the live building`)
        // the wall from the roof line down, and over the roof line the brick of its parapet, under the coping
        const [parapet, wall, ...more] = bricks(svg)
        assert.equal(more.length, 0, `${at}: one building`)
        assert.deepEqual([wall[0], wall[2]], [6, width / 2 - 12], at)
        assert.deepEqual(parapet, [6, wall[1] - 3, wall[2], 3], `${at}: the parapet on the wall`)
        assert.equal(walks(svg).length, 1, `${at}: one sidewalk, at the foot of the building`)
        assert.equal(walks(svg)[0], wall[1] + wall[3], `${at}: the sidewalk under the brick`)
        assert.doesNotMatch(svg, /href="#to-tw-/, `${at}: the week tower keeps its own tab`)
        assert.ok(svg.includes('>WHAT THEY DID<') && svg.includes('>B1</text>'), `${at}: what they did, in the basement`)
        assert.deepEqual(basementOf(svg)?.[0], walks(svg)[0] + 4, `${at}: the basement right under the sidewalk`)
        assert.ok(!svg.includes('agent-time per day, all floors'), at)
        assert.ok(svg.includes('COMMITS LINE'), at)
        assert.ok(svg.length <= MAX_SVG, `${at}: ${svg.length}`)
      }
    }
  })

  test('one sign on the roof, centered over the building: the neon THE OFFICE, the live glance under it, no clock; the view, the date and the shift in its tooltip', () => {
    for (const width of [240, 480, 660, 960, 2400]) {
      for (const f of [clone(SAMPLE), day(SAMPLE)]) {
        const night = f.now.is_night
        const at = `${night ? 'night' : 'day'}@${width}`
        const svg = renderSvg(f, { view: 'all', width, animate: false })
        const W = viewW(svg)
        assert.equal(svg.split('<g><title>THE OFFICE · ').length - 1, 1, `${at}: one sign`)
        assert.equal(signTipOf(svg), `THE OFFICE · live · ${f.now.weekday} 26 Oct · ${night ? 'night shift' : 'office hours'}`, at)
        // a dark box on the roof over the parapet, about half as wide as the building and centered over it
        const [x, y, w, h] = signOf(svg)
        assert.deepEqual([y, h], [2, 40], at)
        assert.ok(y + h < bricks(svg)[0][1], `${at}: over the parapet`)
        assert.ok(Math.abs(x + w / 2 - W / 2) <= 0.5, `${at}: centered over the building: ${x} + ${w} of ${W}`)
        assert.ok(w <= Math.min(300, 0.7 * W + 0.5), `${at}: narrower than the building: ${w} of ${W}`)
        // the moon or the sun (its middle at cx, cy, its disc ORB.rim round it) in the open sky beside it, never behind
        // it, up out of the coping
        const cel = usesOf(svg, night ? 'moon(?:-s)?' : 'sun(?:-s)?')
        assert.equal(cel.length, 1, at)
        const [cx, cy] = cel[0]
        assert.ok(cy - ORB.rim >= 0 && cy + ORB.rim <= SKY - 5, `${at}: the ${night ? 'moon' : 'sun'} at ${cy}, in the sky over the coping`)
        assert.ok(cx + ORB.rim <= x || cx - ORB.rim >= x + w, `${at}: the ${night ? 'moon' : 'sun'} at ${cx}, beside the sign at ${x}..${x + w}`)
        // the neon: THE OFFICE in glass tubes, no text; one neon, both words, centered on the sign over its lines
        assert.doesNotMatch(signMarkup(svg), />THE OFFICE</, `${at}: the neon is pixel art (the lettering over the street door is the lobby's)`)
        assert.ok(usesOf(svg, 'neon-0').length, `${at}: one neon`)
        const n = NEON
        const tubes = [...usesOf(svg, 'neon-0'), ...usesOf(svg, 'neon-1')]
        assert.equal(usesOf(svg, 'neon-0').length, usesOf(svg, 'neon-1').length, `${at}: THE and OFFICE`)
        assert.equal(new Set(tubes.map(String)).size, 1, `${at}: the words' tubes, glow and line in one place`)
        const [nx, ny] = tubes[0]
        assert.ok(Math.abs(nx + n.w / 2 - (x + w / 2)) <= 1 && nx >= x && ny >= y, `${at}: the neon centered on the sign`)
        // the live glance on one line or two under it, every run inside the sign's margins
        const lines = infoOf(svg)
        assert.ok(signMarkup(svg).includes('>10 desks</tspan>'), `${at}: the glance on the sign`)
        const ys = [...new Set(lines.map((l) => l.y))]
        assert.ok(ys.length === 1 ? ys[0] === INFO.one : String(ys) === String(INFO.two), `${at}: one line or two: ${ys}`)
        assert.ok(ny + n.h <= Math.min(...ys) - INFO.size, `${at}: the neon over the lines`)
        for (const l of lines) {
          const tw = textW(l.s, l.size)
          const [a, b] = l.mid ? [l.x - tw / 2, l.x + tw / 2] : [l.x, l.x + tw]
          assert.equal(l.size, INFO.size, at)
          assert.ok(a >= x + 6 - 0.1 && b <= x + w - 6 + 0.1, `${at}: '${l.s}' (${a}..${b}) inside the sign (${x}..${x + w})`)
        }
        // no clock on the sign, nor anywhere in the Office: the time is not drawn
        assert.doesNotMatch(signMarkup(svg), /\d\d:\d\d/, `${at}: no clock`)
        assert.ok(!svg.includes(`>${f.now.local_time}<`), `${at}: no time`)
      }
    }
    const svg = renderSvg(SAMPLE, { view: 'all', width: 660, animate: false })
    assert.doesNotMatch(svg, />this week<|live · week/, 'no stacked-scene heading, no list of scenes')
    // a drawing that stays on screen runs its clocks by themselves (each digit a loop of its own); the Office has none
    // left to run, the punch clock on today's still does
    const kept = renderSvg(SAMPLE, { view: 'all', width: 660, liveClock: true })
    assert.doesNotMatch(kept, /dur="(86400|600)s"/, 'no running clock in the Office')
    assert.match(renderSvg(todayFacts(), { view: 'today', width: 660, liveClock: true }), /dur="600s"/, 'today’s punch clock still runs')
  })

  test('the heaviest office keeps every desk and the commits line, at every width', () => {
    for (const width of [480, 660, 960, 2400]) {
      const svg = renderSvg(heavyOffice(), { view: 'all', width })
      assert.ok(svg.length <= MAX_SVG, `@${width}: ${svg.length}`)
      assert.doesNotMatch(svg, /more desks? upstairs/, `@${width}: all 24 desks`)
      assert.ok(svg.includes('COMMITS LINE'), `@${width}`)
    }
  })

  test('the alt text: the live headcount', () => {
    const alt = /aria-label="([^"]*)"/.exec(renderSvg(SAMPLE, { view: 'all' }))[1]
    assert.match(alt, /^The Office: 10 desks, 5 working, [^;]*$/)
  })
})

// ---------------------------------------------------------------- the commits line under every view

describe('the commits line runs under every view, right under the sidewalk (the Office\'s under its basement)', () => {
  const facts = { live: SAMPLE, today: todayFacts(), week: SAMPLE, month: monthFacts(), work: SAMPLE, all: SAMPLE }
  test('every view: the line starts on the sidewalk’s shadow edge (the Office: under its basement), the lines under the building come after it', () => {
    for (const view of Object.keys(SVG_VIEWS)) {
      for (const transparent of [false, true]) {
        const at = `${view}${transparent ? ' transparent' : ''}`
        const svg = renderSvg(facts[view], { view, width: 660, animate: false, transparent })
        assert.ok(svg.includes('COMMITS LINE'), at)
        const walk = walks(svg).at(-1)
        if (DEEP.has(view)) {
          // the street is up at the lobby: the line, without a road, runs right under the basement floor
          const [y, h] = basementOf(svg)
          assert.equal(y, walk + 4, `${at}: the basement under the sidewalk`)
          assert.equal(lineY(svg), y + h, `${at}: the line under the basement`)
          assert.ok(viewH(svg) >= y + h + SUBWAY_DEEP_H, `${at}: the whole line is in the box`)
          assert.ok(!svg.includes(`stroke="#8a7f5a"`), `${at}: no lane marks under the basement`)
        } else {
          assert.equal(lineY(svg), walk + 3, `${at}: under the sidewalk`)
          assert.ok(viewH(svg) >= walk + 3 + SUBWAY_H, `${at}: the whole line is in the box`)
          assert.equal(basementOf(svg), undefined, `${at}: no basement`)
        }
      }
    }
    // what a scene writes under its building moves under the line (drawn in the scene's own coordinates, then moved
    // down by the line's height in one group): the month's numbers, who is who in a mixed office
    const mixed = clone(SAMPLE)
    mixed.live.desks[0].agent = 'codex'
    for (const [view, f, s, lineH] of [['live', mixed, 'Dex · Codex', SUBWAY_DEEP_H], ['month', monthFacts(), 'the month: ', SUBWAY_H]]) {
      const moved = `<g transform="translate(0 ${lineH - 1})">`
      const svg = renderSvg(f, { view, width: 660, animate: false })
      assert.ok(svg.lastIndexOf(moved, svg.indexOf(`>${s}<`)) > svg.indexOf('COMMITS LINE'), `${view}: ${s} in the moved group`)
      assert.ok(textY(svg, s) + lineH - 1 > lineY(svg) + lineH, `${view}: ${s} under the line`)
    }
    // the Office of Clawd alone writes nothing under its line: no lights-off list, no coat rack, no color key
    const office = renderSvg(SAMPLE, { view: 'all', width: 660, animate: false })
    assert.ok(viewH(office) <= lineY(office) + SUBWAY_DEEP_H + 2, `the drawing ends with the line: ${viewH(office)}`)
  })

  test('the Office, live and today haul today’s commits, the others their range’s', () => {
    const today = SAMPLE.per_day[SAMPLE.now.local_date].commits
    for (const view of ['live', 'all']) assert.ok(renderSvg(SAMPLE, { view }).includes(`>${today} commits today<`), view)
    for (const view of ['week', 'work']) assert.ok(renderSvg(SAMPLE, { view }).includes(`>${SAMPLE.totals.commits} commits this week<`), view)
    assert.ok(renderSvg(monthFacts(), { view: 'month' }).includes('commits this month<'))
  })

  test('every view stays in the budget with its line, on stress facts at every width', () => {
    for (const view of Object.keys(SVG_VIEWS)) {
      for (const width of [240, 480, 660, 960, 2400]) {
        const svg = renderSvg(stressFacts(), { view, width, transparent: true })
        assert.ok(svg.length <= MAX_SVG, `${view}@${width}: ${svg.length}`)
        assert.ok(svg.includes('COMMITS LINE'), `${view}@${width}`)
      }
    }
  })
})

// ---------------------------------------------------------------- transparent: the text on the page

describe('transparent: the text that sits on the page reads on a light page as on a dark one', () => {
  const HALO = `<g stroke="${K.plate}" stroke-width="1.2" stroke-linejoin="round" paint-order="stroke">`
  test('the lines under a building get a dark halo; the header’s lines sit on its own opaque sign; an opaque drawing has no halo', () => {
    for (const view of Object.keys(SVG_VIEWS)) {
      for (const f of [SAMPLE, day(SAMPLE)]) {
        const clear = renderSvg(f, { view, width: 660, transparent: true })
        const opaque = renderSvg(f, { view, width: 660 })
        assert.ok(!opaque.includes('paint-order'), view)
        assert.ok(signOf(clear), `${view}: the sign under the scene's lines, on any page`)
        assert.deepEqual(signOf(clear), signOf(opaque), `${view}: the same sign on the page as in its own sky`)
        assert.ok(infoOf(clear).length, `${view}: the scene's lines on the sign`)
        assert.ok(!signMarkup(clear).includes('paint-order'), `${view}: the sign's text needs no halo`)
      }
    }
    const mixed = clone(SAMPLE)
    mixed.live.desks[0].agent = 'codex'
    const live = renderSvg(mixed, { view: 'live', width: 660, transparent: true })
    const at = live.indexOf('>Dex · Codex<')
    assert.ok(live.lastIndexOf(HALO, at) > live.indexOf('COMMITS LINE'), 'the lines under the street in a halo of their own')
  })
})
