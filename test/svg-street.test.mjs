// The street and the COMMITS LINE under the office (lib/svg-street.mjs): the train hauls the range's commits as
// parcels (wagons of ten, a closed `+N` car past the cap), runs faster the more commits a day, sleeps on none; the
// sign says the number; no SMIL when not animating; the size budget holds on stress facts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderSvg } from '../plugin/lib/svg.mjs'
import { MAX_SVG, SPRITE_CLASHES, defsMarkup, sane } from '../plugin/lib/svg-kit.mjs'
import { CAR_LOAD, SUBWAY_DEEP_H, SUBWAY_H, UNDER, commitsLine, maxCars, street, subway, trainDur, trainPlan } from '../plugin/lib/svg-street.mjs'
import { SAMPLE, clone, emptyFacts, monthFacts, stressFacts, todayFacts } from './helpers/facts.mjs'

// ---------------------------------------------------------------- fixtures

const HOSTILE = '<script>alert(1)</script> & "x"'
const STEPS = [0, 1, 10, 100, 1000]

// The ctx renderSvg builds, for drawing the subway alone.
const ctxOf = (facts, { width = 660, animate = true, view = 'week', night, transparent = false } = {}) => {
  const f = sane(facts)
  return {
    f, W: width / 2, px: width, animate, id: 'to-', now: Date.parse(f.now?.iso ?? '') || 0, night: night ?? Boolean(f.now?.is_night),
    view, caps: { level: 0, desks: 24, meetings: 3, floors: 12 }, defs: new Map(), brick: false, minHeight: 0, transparent,
  }
}
// Facts whose range hauls `n` commits over `days` days.
const withCommits = (n, days = 1) => {
  const f = clone(SAMPLE)
  f.range = { ...f.range, kind: days === 1 ? 'today' : 'week', days: f.range.days.slice(-days) }
  f.totals = { ...f.totals, commits: n }
  f.per_day = { [f.now.local_date]: { ...f.per_day[f.now.local_date], commits: n } }
  return f
}
const trainOf = (svg) => {
  const at = svg.indexOf('<g transform="translate(0 ')
  return at < 0 ? '' : svg.slice(at)
}
const SMIL = /<animate|<set\b|<animateTransform|<animateMotion/

// Balanced tags, quoted attributes, no raw `<` or bare `&` in text: the first problem, or ''.
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
      if (/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/i.test(m[5])) return `bare & at ${m.index}`
      continue
    }
    if (m[1]) {
      if (stack.pop() !== m[2]) return `</${m[2]}> mismatched`
    } else if (!m[4]) stack.push(m[2])
  }
  return stack.length ? `unclosed <${stack.at(-1)}>` : ''
}

// ---------------------------------------------------------------- the rules

test('a first light has counted nothing yet: the Office says it is counting what they did and the commits, never that there were none', () => {
  const light = { ...emptyFacts(), live: SAMPLE.live, first_light: true }
  const svg = renderSvg(light, { view: 'all', width: 900, animate: false })
  for (const words of ['counting this week…', 'counting commits today…', 'commits today, being counted']) assert.ok(svg.includes(words), words)
  for (const words of ['no tool calls', 'the train sleeps', 'no commits today']) assert.ok(!svg.includes(words), words)
  assert.ok(renderSvg(emptyFacts(), { view: 'all', width: 900, animate: false }).includes('no commits today'), 'facts that counted say so')
})

test('trainPlan: wagons of ten grow with the commits up to the cap, then a closed +N car holds the rest', () => {
  for (const cap of [2, 3, 5, 8]) {
    let last = 0
    for (const n of [...STEPS, 9, 11, 49, 50, 51].sort((a, b) => a - b)) {
      const p = trainPlan(n, cap)
      assert.equal(p.loads.reduce((a, b) => a + b, 0) + p.plus, n, `${n} commits, cap ${cap}: every commit aboard`)
      assert.ok(p.cars <= cap && p.cars >= last, `${n}: ${p.cars} wagons, never fewer than for fewer commits`)
      assert.ok(p.loads.every((k) => k >= 1 && k <= CAR_LOAD), 'a wagon carries 1 to 10 parcels')
      if (p.plus) assert.ok(p.plus > CAR_LOAD && p.loads.every((k) => k === CAR_LOAD), 'the +N car comes after full wagons')
      last = p.cars
    }
  }
  assert.deepEqual(trainPlan(0, 5), { loads: [], plus: 0, cars: 0 })
  assert.deepEqual(trainPlan(1, 5), { loads: [1], plus: 0, cars: 1 })
  assert.deepEqual(trainPlan(10, 5), { loads: [10], plus: 0, cars: 1 })
  assert.deepEqual(trainPlan(100, 5), { loads: [10, 10, 10, 10], plus: 60, cars: 5 })
  assert.deepEqual(trainPlan(1000, 5), { loads: [10, 10, 10, 10], plus: 960, cars: 5 })
  assert.deepEqual(trainPlan(45, 5), { loads: [10, 10, 10, 10, 5], plus: 0, cars: 5 })
  // odd input reads as no commits, never throws
  for (const odd of [-3, NaN, '12x', null, undefined, Infinity]) assert.ok(trainPlan(odd, 5).cars >= 0)
  assert.deepEqual([480, 660, 960].map((px) => maxCars(px / 2)), [3, 5, 8])
})

test('trainDur: 32 − 3·log2(1 + commits a day), 6…30 s; no commits, no run', () => {
  assert.deepEqual(STEPS.map(trainDur), [0, 29, 21.6, 12, 6])
  let last = Infinity
  for (const r of [0.1, 0.5, 1, 2, 5, 10, 25, 69, 100, 400, 5000]) {
    const d = trainDur(r)
    assert.ok(d >= 6 && d <= 30 && d <= last, `${r}/day → ${d} s`)
    last = d
  }
  for (const odd of [-1, NaN, 'x', null]) assert.equal(trainDur(odd), 0)
})

test('commitsLine: live, the Office and today haul today\'s commits, the other views the range\'s, spread over its days', () => {
  const week = clone(SAMPLE)
  const today = week.per_day[week.now.local_date].commits
  assert.deepEqual(commitsLine(ctxOf(week, { view: 'live' })), { commits: today, perDay: today, label: 'today', days: 1 })
  const w = commitsLine(ctxOf(week, { view: 'week' }))
  assert.deepEqual([w.commits, w.label, w.days], [week.totals.commits, 'this week', 7])
  assert.equal(w.perDay, week.totals.commits / 7)
  assert.equal(commitsLine(ctxOf(week, { view: 'all' })).commits, today)
  assert.equal(commitsLine(ctxOf(monthFacts(), { view: 'month' })).label, 'this month')
  // a range that ended before today (the Month tab's previous page) is that month
  const before = monthFacts()
  before.now = { ...before.now, local_date: '2026-11-25' }
  assert.equal(commitsLine(ctxOf(before, { view: 'month' })).label, 'that month')
  assert.equal(commitsLine(ctxOf(todayFacts(), { view: 'today' })).commits, today)
  assert.equal(commitsLine(ctxOf(emptyFacts(), { view: 'live' })).commits, 0)
  // odd facts read 0 (or the number they hold), never throw
  for (const mut of [(f) => { f.per_day = [] }, (f) => { f.totals = null }, (f) => { f.totals = { commits: '12' } }, (f) => { f.totals.commits = -4 },
    (f) => { f.range = 'x' }, (f) => { f.per_day = { [f.now.local_date]: null } }, (f) => { delete f.now }]) {
    const f = clone(SAMPLE)
    mut(f)
    for (const view of ['live', 'week']) {
      const l = commitsLine(ctxOf(f, { view }))
      assert.ok(Number.isInteger(l.commits) && l.commits >= 0 && Number.isFinite(l.perDay) && l.perDay >= 0, `${view} ${JSON.stringify(l)}`)
    }
  }
})

// ---------------------------------------------------------------- the drawing

test('subway: the sign says the number, the cars and the speed follow the commits (0, 1, 10, 100, 1000)', () => {
  let lastCars = -1
  for (const n of STEPS) {
    const ctx = ctxOf(withCommits(n), { view: 'today' })
    const r = subway(ctx, 100)
    assert.equal(r.h, SUBWAY_H)
    assert.equal(xmlProblem(r.svg), '', `${n}`)
    assert.equal(xmlProblem(defsMarkup(ctx)), '', `${n} defs`)
    if (n) assert.ok(r.svg.includes(`>${n} commit${n === 1 ? '' : 's'} today<`), `${n}: the sign`)
    else assert.ok(r.svg.includes('>no commits today<') && r.svg.includes('#to-st-sleep'), 'no commits: the train sleeps')
    assert.ok(r.gist.includes(n ? `${n} commit` : 'no commits'), r.gist)
    // wagons drawn: full ones (a <use> each), part-loaded ones (a deck of their own), the +N car
    const train = trainOf(r.svg)
    const cars = (train.match(/#to-st-car"/g) ?? []).length + (train.match(/#to-st-deck"/g) ?? []).length + (train.match(/#to-st-crate"/g) ?? []).length
    assert.equal(cars, trainPlan(n, maxCars(ctx.W)).cars, `${n}: wagons`)
    assert.ok(cars >= lastCars)
    lastCars = cars
    if (n >= 100) assert.ok(train.includes('#to-st-crate"') && r.svg.includes('the closed car the rest'), `${n}: the +N car`)
    // one pass every trainDur(commits a day) seconds; none when there is nothing to haul
    const dur = /type="translate" values="-\d+ 0;\d+ 0" dur="([\d.]+)s"/.exec(train)?.[1]
    assert.equal(dur === undefined ? 0 : Number(dur), trainDur(n), `${n}: speed`)
  }
  // a week: the range's commits and their daily rate
  const svg = subway(ctxOf(clone(SAMPLE), { view: 'week' }), 0).svg
  assert.ok(svg.includes(`>${SAMPLE.totals.commits} commits this week<`) && svg.includes(`>~${Math.round(SAMPLE.totals.commits / 7)} a day<`))
  assert.ok(svg.includes(`dur="${trainDur(SAMPLE.totals.commits / 7)}s"`))
})

test('subway: animate false parks the train and emits no SMIL at all, night and day, asleep or not', () => {
  for (const n of STEPS) {
    for (const night of [true, false]) {
      const ctx = ctxOf(withCommits(n), { view: 'today', animate: false, night })
      const svg = subway(ctx, 0).svg + defsMarkup(ctx)
      assert.doesNotMatch(svg, SMIL, `${n} ${night}`)
      assert.ok(n === 0 || svg.includes('#to-st-loco'), 'the train is still there, parked')
    }
  }
  // animated: the train moves, its eyes blink; asleep: only the z's float
  assert.match(subway(ctxOf(withCommits(10)), 0).svg, /<animateTransform attributeName="transform" type="translate"/)
  assert.doesNotMatch(trainOf(subway(ctxOf(withCommits(0)), 0).svg), /type="translate" values="-/)
})

test('subway: lit windows and a headlight glint at night, sky glass by day', () => {
  const night = ctxOf(withCommits(30), { night: true })
  subway(night, 0)
  const day = ctxOf(withCommits(30), { night: false })
  subway(day, 0)
  const loco = (ctx) => defsMarkup(ctx).split('<g id="to-st-loco">')[1]
  assert.ok(loco(night).includes(`fill="${UNDER.light}" d="M6 2h4v3h-4zM12 2h4v3h-4z"`), 'lit windows')
  assert.ok(loco(day).includes(`fill="${UNDER.glass}" d="M6 2h4v3h-4zM12 2h4v3h-4z"`), 'glass by day')
  assert.ok(loco(night).includes('fill-opacity=".7" d="M36 12h8v1h-8z"') && !loco(day).includes('M36 12h8'), 'the glint on the rails only at night')
})

test('subway: every facts string is escaped, the tooltip says the numbers and the rules', () => {
  const f = clone(SAMPLE)
  f.range.label = HOSTILE
  const svg = subway(ctxOf(f), 0, { commits: 7, perDay: 3, label: HOSTILE, days: 7 }).svg
  assert.equal(xmlProblem(svg), '')
  assert.ok(!svg.includes('<script') && svg.includes('&lt;script&gt;'))
  const tip = /<title>([^<]*)<\/title>/.exec(subway(ctxOf(clone(SAMPLE)), 0).svg)[1]
  assert.ok(tip.includes(`${SAMPLE.totals.commits} commits this week`) && tip.includes('one pass every') && tip.includes('a wagon carries 10'), tip)
})

test('subway without its road (under a basement): soil over the same tunnel, the same train and sign, 11 rows shorter', () => {
  for (const transparent of [false, true]) {
    const ctx = ctxOf(withCommits(30), { view: 'live', transparent })
    const deep = subway(ctx, 100, undefined, { road: false })
    const full = subway(ctxOf(withCommits(30), { view: 'live', transparent }), 100)
    assert.equal(deep.h, SUBWAY_DEEP_H)
    assert.equal(full.h - deep.h, 11)
    assert.equal(xmlProblem(deep.svg), '')
    assert.ok(deep.svg.includes('>30 commits today<') && deep.svg.includes('#to-st-loco'), 'the sign and the train')
    assert.ok(!deep.svg.includes(`stroke="${UNDER.lane}"`) && !deep.svg.includes(`fill="${UNDER.road}"`), 'no road, no lane marks')
    assert.ok(deep.svg.includes(`<path fill="${UNDER.soil}" d="M0 100h`), 'soil from the top')
    // the tunnel 11 rows higher than under a road: the train with it
    const trainY = (svg) => Number(/<g transform="translate\(0 ([\d.]+)\)"><g transform="translate\(-/.exec(svg)?.[1])
    assert.equal(trainY(full.svg) - trainY(deep.svg), 11)
  }
})

test('street: under the commits line only bedrock; transparent drops the bedrock and cuts the soil ragged', () => {
  const ctx = ctxOf(clone(SAMPLE))
  const sub = subway(ctx, 0).svg
  const rest = street(ctx, SUBWAY_H, 400)
  assert.ok(rest.includes(`fill="${UNDER.rock}"`) && !rest.includes('COMMITS LINE') && !rest.includes('st-loco'), 'bedrock only')
  assert.equal(street(ctx, 0, 0), '')
  const clear = ctxOf(clone(SAMPLE), { transparent: true })
  const subT = subway(clear, 0).svg
  assert.equal(street(clear, SUBWAY_H, 400), '', 'no bedrock on the page')
  assert.ok(subT.includes('COMMITS LINE') && subT.includes(`fill="${UNDER.tunnel}"`), 'the line itself is ground: it stays')
  assert.ok(subT.length < sub.length + 400)
  // without a commits line drawn yet, a tall filler draws it, a short one the road alone
  assert.ok(street(ctxOf(clone(SAMPLE)), 0, 300).includes('COMMITS LINE'))
  assert.ok(!street(ctxOf(clone(SAMPLE)), 0, 30).includes('COMMITS LINE'))
})

test('renderSvg: a pane taller than the drawing shows the commits line of the view (today for live, the range for week)', () => {
  const today = SAMPLE.per_day[SAMPLE.now.local_date].commits
  assert.ok(renderSvg(SAMPLE, { view: 'live', minHeight: 4000 }).includes(`>${today} commits today<`))
  assert.ok(renderSvg(SAMPLE, { view: 'week', minHeight: 4000 }).includes(`>${SAMPLE.totals.commits} commits this week<`))
  const still = renderSvg(SAMPLE, { view: 'week', minHeight: 4000, animate: false })
  assert.doesNotMatch(still, SMIL)
  assert.deepEqual(SPRITE_CLASHES, [])
})

test('budget: the line stays a few kB, and every view fits 120 000 chars on stress facts at every width', () => {
  for (const px of [480, 660, 960]) {
    for (const facts of [stressFacts(), clone(SAMPLE), emptyFacts()]) {
      const ctx = ctxOf(facts, { width: px })
      const size = subway(ctx, 0).svg.length + defsMarkup(ctx).length
      assert.ok(size < 7000, `${px}: ${size}`)
    }
    for (const view of ['live', 'today', 'week', 'month', 'work', 'all']) {
      for (const transparent of [false, true]) {
        const svg = renderSvg(stressFacts(), { view, width: px, minHeight: 4000, transparent })
        assert.ok(svg.length <= MAX_SVG, `${view} @${px}: ${svg.length}`)
      }
    }
  }
  const wide = ctxOf(stressFacts(), { width: 2400 })
  assert.ok(subway(wide, 0).svg.length + defsMarkup(wide).length < 9000)
})
