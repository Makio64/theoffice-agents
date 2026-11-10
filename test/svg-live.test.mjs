// The live floor plan (lib/svg-live.mjs): the brick shell runs unbroken from the parapet to the street, every desk
// carries 1 or 2 accessories picked from its session id (the same desk keeps its look between refreshes), the longest
// shift wins the trophy, lamps glow at night, the kitchen has bunting, every floor is numbered on the left pier, what
// they did fills the basement (B1), and all of it stays inside the size budget.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { renderSvg } from '../plugin/lib/svg.mjs'
import { BAR_SPAN, DECK, deskAccessories, deskTime } from '../plugin/lib/svg-live.mjs'
import { CLASS_COLOR, HEAD, K, MAX_SVG, PLATE_FONT, ROLE, SKY, SPRITES, SPRITE_CLASHES, esc, litPlate, textW } from '../plugin/lib/svg-kit.mjs'
import { DEPARTMENTS, departmentRows, deskClass, pct } from '../plugin/lib/model.mjs'
import { fmtCount } from '../plugin/lib/format.mjs'
import { SAMPLE, clone, emptyFacts, stressFacts } from './helpers/facts.mjs'

// ---------------------------------------------------------------- fixtures

const day = (f) => {
  const g = clone(f)
  g.now = { ...g.now, is_night: false, hour: 14, local_time: '14:05' }
  return g
}
// the sample with its desks gone: the dark rooms of today's projects (night) or the empty lit office (day)
const darkOffice = (night = true) => {
  const f = clone(SAMPLE)
  f.live.desks = []
  f.now = { ...f.now, is_night: night }
  return f
}
// 24 seated desks with 5 interns each, three of them in a meeting: the heaviest live floor the caps allow (as in
// test/svg-work.test.mjs)
function heavyOffice() {
  const f = stressFacts()
  const base = f.live.desks
  f.live.desks = Array.from({ length: 24 }, (_, i) => {
    const d = clone(base[i % base.length])
    d.id = `h${String(i).padStart(7, '0')}`
    d.interns = Array.from({ length: 5 }, (_, k) => ({ ...base[0].interns[k % base[0].interns.length], id: `h${i}-${k}` }))
    d.meetings = i < 3 ? [clone(base[3].meetings[0])] : []
    if (i < 3) Object.assign(d, { state: 'waiting_on_agents', status: 'busy' })
    return d
  })
  return f
}

const ACCESSORY = /^lv-(?!bunt$|balloons$)/
const TOPS = new Set(['lv-cactus', 'lv-duck', 'lv-dino', 'lv-globe', 'lv-neko', 'lv-flag', 'lv-ivy', 'lv-trophy'])
const SIDES = new Set(['lv-lamp', 'lv-photo', 'lv-catpic', 'lv-books', 'lv-pens', 'lv-coffee', 'lv-succ', 'lv-notes', 'lv-phones'])

// ---------------------------------------------------------------- tiny parsers

// The body of a drawing without its <defs> (sprites are drawn in their own coordinates there).
const bodyOf = (svg) => svg.slice(0, svg.indexOf('<defs>')) + svg.slice(svg.indexOf('</defs>'))

// Every rect a fill paints at the top level: paint() writes one <path> per fill of `M{x} {y}h{w}v{h}…z` runs.
function rectsOf(markup, fill) {
  const out = []
  for (const m of markup.matchAll(new RegExp(`<path fill="${fill}"(?: fill-opacity="[^"]*")? d="([^"]+)"`, 'g'))) {
    for (const r of m[1].matchAll(/M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)/g)) out.push(r.slice(1, 5).map(Number))
  }
  return out
}

// The pixels a sprite paints in its own (desk) coordinates: path runs and <rect>s, any fill.
function pixelsOf(markup) {
  const px = new Set()
  const add = (x, y, w, h) => {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) px.add(`${x + i},${y + j}`)
  }
  for (const m of markup.matchAll(/ d="([^"]+)"/g)) {
    for (const r of m[1].matchAll(/M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)/g)) add(...r.slice(1, 5).map(Number))
  }
  for (const r of markup.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) add(...r.slice(1, 5).map(Number))
  return px
}
const spriteCtx = () => ({ animate: true, id: 'to-', defs: new Map(), night: true, color: () => '#ffffff' })
const pixelsOfSprite = (name) => pixelsOf(SPRITES[name](spriteCtx()))

// Each desk's <g transform> (balanced), with the tooltip and the accessory sprites placed in it.
function deskGroups(svg) {
  const out = []
  const body = bodyOf(svg)
  for (const m of body.matchAll(/<g transform="translate\([^)]*\)">/g)) {
    let depth = 0
    let i = m.index
    const re = /<g\b|<\/g>/g
    re.lastIndex = i
    let t
    while ((t = re.exec(body))) {
      depth += t[0] === '</g>' ? -1 : 1
      if (!depth) break
    }
    const g = body.slice(i, re.lastIndex)
    // a desk's group: its chair (with the screen's glow behind it: rm-k…), or a dark room's chair
    if (!/href="#to-(?:chair|rm-chair|rm-k(?:cool|warm|ask|none))"/.test(g)) continue
    // its words: in its tooltip (a desk that needs you), else in the card whose hit box is the desk
    const at = /^<g transform="translate\(([\d.]+) ([\d.]+)\)">/.exec(g)
    const card = at && cardsOf(svg).find((c) => c.box[0] === Number(at[1]) && c.box[1] === Number(at[2]))
    out.push({
      tip: /^<g transform="[^"]*"><title>([^<]*)<\/title>/.exec(g)?.[1] ?? card?.rows.join(' · ') ?? '',
      acc: [...g.matchAll(/<use href="#to-(lv-[\w-]+)"/g)].map((u) => u[1]).filter((n) => ACCESSORY.test(n)),
    })
  }
  return out
}

// The cards a drawing shows on hover (svg-kit cardsSvg): each its hit box [x, y, w, h] and the words of its rows.
const cardsOf = (svg) => [...svg.matchAll(/<g><path fill-opacity="0" d="M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)h-[\d.]+z"\/><g display="none"><rect [^>]*\/>((?:<text\b[^>]*>(?:(?!<\/text>).)*<\/text>)*)<\/g><\/g>/g)]
  .map((m) => ({ box: m.slice(1, 5).map(Number), rows: [...m[5].matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map((r) => r[1].replace(/<[^>]+>/g, '')) }))
// A drawing without its cards, for what it writes on the floors themselves.
const withoutCards = (svg) => svg.replace(/<style>\.[\w-]+hc [^<]*<\/style><g class="[\w-]+hc">(?:<g><path[^>]*\/><g display="none">(?:(?!<\/g>).)*<\/g><\/g>)*<\/g>/, '')

// ---------------------------------------------------------------- tests

describe('live floor plan', () => {
  test('the brick shell runs unbroken from the parapet down to the street: no floor slab or label band crosses it', () => {
    for (const [name, f] of [['sample', SAMPLE], ['stress', stressFacts()], ['dark', darkOffice()], ['day', day(SAMPLE)]]) {
      for (const width of [480, 660, 960]) {
        const svg = renderSvg(f, { view: 'live', width, animate: false })
        const at = `${name}@${width}`
        const W = Number(/viewBox="0 0 (\d+)/.exec(svg)[1])
        const body = bodyOf(svg)
        const roof = SKY
        const groundY = rectsOf(body, K.walk)[0][1]
        assert.ok(rectsOf(body, K.slab).length > 0, `${at}: floors drawn`)
        // the shell's columns: x 6..9 and W-10..W-7, from under the parapet to the sidewalk
        const cols = [[6, 10], [W - 10, W - 6]]
        for (const fill of [K.slab, K.wood, K.woodD, K.wall, K.wallLow, K.wallDark, K.wallDarkLow, K.part, K.partHi]) {
          for (const [x, y, w, h] of rectsOf(body, fill)) {
            if (y + h <= roof + 5 || y >= groundY) continue
            for (const [c0, c1] of cols) assert.ok(x + w <= c0 || x >= c1, `${at}: ${fill} [${x} ${y} ${w} ${h}] crosses the brick at x ${c0}`)
          }
        }
      }
    }
  })

  test('every desk carries 1 or 2 accessories: at most one on the monitor and one on the corner', () => {
    for (const f of [SAMPLE, stressFacts(), heavyOffice()]) {
      const desks = deskGroups(renderSvg(f, { view: 'live', width: 660 }))
      assert.ok(desks.length > 0)
      for (const d of desks) {
        assert.ok(d.acc.length >= 1 && d.acc.length <= 2, `${d.tip}: ${d.acc}`)
        assert.ok(d.acc.filter((n) => TOPS.has(n)).length <= 1 && d.acc.filter((n) => SIDES.has(n.replace(/N$/, ''))).length <= 1, `${d.acc}`)
      }
    }
  })

  test('a desk keeps its accessories from one refresh to the next, whatever else is on the floor', () => {
    const byTip = (svg) => new Map(deskGroups(svg).map((d) => [d.tip, d.acc]))
    const before = byTip(renderSvg(SAMPLE, { view: 'live', width: 660 }))
    // a newcomer (the latest to clock in, so the trophy stays put) joins and the desks arrive in another order, at
    // another width: everyone else's desk looks the same
    const f = clone(SAMPLE)
    f.live.desks.reverse()
    f.live.desks.push({ ...clone(SAMPLE.live.desks[2]), id: 'newcomer-0001', title: 'A newcomer', started_at: SAMPLE.now.iso })
    const after = byTip(renderSvg(f, { view: 'live', width: 960 }))
    assert.ok(before.size >= 5)
    for (const [tip, acc] of before) assert.deepEqual(after.get(tip), acc, tip)
    assert.equal(renderSvg(SAMPLE, { view: 'live' }), renderSvg(SAMPLE, { view: 'live' }))
  })

  test('deskAccessories: deterministic per id, 1 or 2, never two that touch, and every accessory shows up', () => {
    const seen = new Set()
    let singles = 0
    for (let i = 0; i < 600; i++) {
      const id = `session-${i}-${(i * 7919) % 1000}`
      const acc = deskAccessories(id)
      assert.deepEqual(deskAccessories(id), acc)
      assert.ok(acc.length === 1 || acc.length === 2, `${id}: ${acc}`)
      assert.ok(!acc.includes('lv-trophy'))
      if (acc.length === 1) singles++
      for (const n of acc) seen.add(n)
      if (acc.length === 2) {
        const [a, b] = acc.map((n) => pixelsOfSprite(n === 'lv-lamp' ? 'lv-lampN' : n))
        assert.ok(![...a].some((p) => b.has(p)), `${id}: ${acc} touch`)
        assert.ok(TOPS.has(acc[0]) && SIDES.has(acc[1]), `${acc}`)
      }
      // the trophy takes the monitor; a dozer (or a dark room) gets no second hot coffee
      assert.equal(deskAccessories(id, { trophy: true })[0], 'lv-trophy')
      assert.ok(!deskAccessories(id, { coffee: false }).includes('lv-coffee'))
    }
    for (const n of [...TOPS, ...SIDES]) if (n !== 'lv-trophy') assert.ok(seen.has(n), `${n} is never picked`)
    assert.ok(singles > 100 && singles < 300, `${singles} desks of 600 with a single accessory`)
    // garbage keys still pick
    for (const k of [undefined, null, '', 42, '🦆']) assert.ok(deskAccessories(k).length >= 1)
  })

  test('accessories stay small: on the desk, never over the screen, the Clawd or the labels', () => {
    for (const name of [...TOPS, ...SIDES, 'lv-lampN']) {
      const px = pixelsOfSprite(name)
      assert.ok(px.size > 4, name)
      for (const p of px) {
        const [x, y] = p.split(',').map(Number)
        assert.ok(!(x >= 5 && x <= 20 && y >= 10 && y <= 19), `${name}: ${p} on the screen`)
        assert.ok(!(x >= 22 && y >= 12), `${name}: ${p} on Clawd`)
        // the desk's own box: the slot margin at the left, the desk top at y 24 (only a lamp's light pools on it)
        assert.ok(x >= -3 && x <= 21 && y >= 0 && y <= (name === 'lv-lampN' ? 24 : 23), `${name}: ${p} off the desk`)
      }
    }
    assert.deepEqual(SPRITE_CLASHES, [])
  })

  test('the longest shift on the floor wins the trophy: one cup, on the desk that clocked in first, said in its tooltip', () => {
    const svg = renderSvg(SAMPLE, { view: 'live', width: 660 })
    const desks = deskGroups(svg)
    const cups = desks.filter((d) => d.acc.includes('lv-trophy'))
    assert.equal(cups.length, 1)
    assert.match(cups[0].tip, /longest shift on the floor/)
    const now = Date.parse(SAMPLE.now.iso)
    const first = SAMPLE.live.desks.filter((d) => deskClass(d, now) !== 'break').sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))[0]
    assert.ok(cups[0].tip.includes(first.title.slice(0, 20).replace(/&/g, '&amp;').replace(/'/g, '&#39;')), cups[0].tip)
    // a lone desk has nobody to beat
    const lone = clone(SAMPLE)
    lone.live.desks = [lone.live.desks[0]]
    assert.ok(!renderSvg(lone, { view: 'live' }).includes('lv-trophy'))
  })

  test('lamps glow at night and are off by day; dark rooms keep their accessories, lamps off and no hot coffee', () => {
    // pick ids whose desk gets a lamp
    const ids = []
    for (let i = 0; ids.length < 3; i++) if (deskAccessories(`lamp-${i}`).includes('lv-lamp')) ids.push(`lamp-${i}`)
    const f = clone(SAMPLE)
    f.live.desks.forEach((d, i) => { if (i < 3) d.id = ids[i] })
    const night = renderSvg(f, { view: 'live' })
    assert.match(night, /href="#to-lv-lampN"/)
    assert.doesNotMatch(night, /href="#to-lv-lamp"/)
    const sunny = renderSvg(day(f), { view: 'live' })
    assert.match(sunny, /href="#to-lv-lamp"/)
    assert.doesNotMatch(sunny, /lv-lampN/)
    for (const lit of [true, false]) {
      const dark = deskGroups(renderSvg(darkOffice(lit), { view: 'live', width: 960 }))
      assert.ok(dark.length >= 2, 'dark desks drawn')
      for (const d of dark) {
        assert.ok(d.acc.length >= 1 && d.acc.length <= 2, `${d.acc}`)
        assert.ok(!d.acc.includes('lv-lampN') && !d.acc.includes('lv-coffee'), `${d.acc}`)
      }
    }
  })

  test('the project pennant flies in the project color; the kitchen hangs bunting; a roomy meeting room has balloons', () => {
    let f = null
    for (let i = 0; !f; i++) {
      if (deskAccessories(`flag-${i}`)[0] !== 'lv-flag') continue
      f = clone(SAMPLE)
      f.live.desks[0].id = `flag-${i}`
    }
    const svg = renderSvg(f, { view: 'live', width: 960 })
    assert.match(svg, /<use href="#to-lv-flag" color="#[0-9a-f]{6}"\/>/)
    assert.match(svg, /href="#to-lv-bunt"/)
    // balloons only where the room has a plant in each corner (spare width): the sample's narrow pane
    assert.match(renderSvg(f, { view: 'live', width: 480 }), /href="#to-lv-balloons"/)
    assert.match(renderSvg(emptyFacts(), { view: 'live' }), /href="#to-lv-bunt"/)
  })

  test('the accessories are cheap: a few kB at most, and the heaviest floor keeps all its desks under the budget', () => {
    for (const [name, f] of [['stress', stressFacts()], ['heavy', heavyOffice()]]) {
      for (const width of [240, 480, 660, 960, 2400]) {
        const svg = renderSvg(f, { view: 'live', width })
        const at = `${name}@${width}`
        assert.ok(svg.length <= MAX_SVG, `${at}: ${svg.length}`)
        assert.doesNotMatch(svg, /more desks? upstairs/, `${at}: every desk drawn`)
        const uses = (svg.match(/<use href="#to-lv-[^"]*"[^>]*\/>/g) ?? []).join('').length
        const defs = [...svg.matchAll(/<g id="to-lv-[^"]*">/g)].map((m) => {
          const rest = svg.slice(m.index + 1)
          return rest.slice(0, Math.min(...[rest.search(/<g id="/), rest.indexOf('</defs>')].filter((n) => n >= 0))).length
        }).reduce((a, b) => a + b, 0)
        assert.ok(uses + defs < 8500, `${at}: accessories cost ${uses} + ${defs} chars`)
      }
    }
  })

  test('a floor keeps its decor however heavy, alone or as the Office: no scene under it to make room for', () => {
    const decor = (svg) => [...new Set([...svg.matchAll(/href="#to-(lv-[\w-]+)"/g)].map((m) => m[1]))].filter((n) => n !== 'lv-trophy')
    for (const view of ['live', 'all']) {
      for (const f of [SAMPLE, heavyOffice()]) {
        const svg = renderSvg(f, { view, width: 960 })
        assert.ok(decor(svg).length > 3, view)
        assert.match(svg, /href="#to-lv-trophy"/, view)
      }
    }
  })

  test('animate=false: the accessories hold still (no SMIL); transparent keeps them all', () => {
    const still = renderSvg(SAMPLE, { view: 'live', animate: false })
    assert.doesNotMatch(still, /<animate/)
    const acc = (svg) => deskGroups(svg).map((d) => d.acc.join('+')).join(' ')
    for (const f of [SAMPLE, day(SAMPLE), darkOffice()]) {
      const opaque = renderSvg(f, { view: 'live', width: 660 })
      const clear = renderSvg(f, { view: 'live', width: 660, transparent: true })
      assert.equal(acc(clear), acc(opaque))
      assert.ok(acc(clear).length > 0)
      assert.doesNotMatch(clear, /^<svg [^>]*style=/)
      assert.ok(!clear.includes('<g fill="currentColor" stroke="currentColor"'), 'no sky')
    }
  })
})

// ---------------------------------------------------------------- floor numbers and the basement

// The sample's week with the shares of a real one (as test/svg-work.test.mjs): one busy department, a long tail.
function realShaped() {
  const f = clone(SAMPLE)
  f.totals.activity = { terminal: 65368, testing: 16382, reading: 11533, coding: 6353, web: 5418, tools: 1456, planning: 962, talking: 420,
    delegating: 319, design: 0 }
  return f
}
const FLOOR_SETS = () => [['sample', SAMPLE], ['real-shaped', realShaped()], ['stress', stressFacts()], ['heavy', heavyOffice()], ['empty', emptyFacts()],
  ['dark', darkOffice()], ['day', day(SAMPLE)]]

// The floor plaques, bottom up: [label, y] from the one group that writes them (dim 4.5 px, centered on the left pier).
function floorNumbers(svg) {
  const g = new RegExp(`<g font-size="4.5" fill="${ROLE.dim}" text-anchor="middle">((?:<text [^>]*>[^<]*</text>)+)</g>`).exec(svg)?.[1] ?? ''
  return [...g.matchAll(/<text x="([\d.]+)" y="([\d.]+)">([^<]*)<\/text>/g)].map((m) => [m[3], Number(m[2]), Number(m[1])]).sort((a, b) => b[1] - a[1])
}
// The basement (from its nameplate on): its rooms' shares as drawn (the big 9-px figures), in drawing order.
const b1 = (svg) => svg.slice(svg.indexOf('>WHAT THEY DID<'))
// the shares on B1's tags, in their order: the first row of each tag (its share, then its calls when they fit)
const b1Shares = (svg) => {
  const tags = /<path fill="#1a1613" d="[^"]*"\/><path fill="none"[^>]*\/><g font-size="5">(.*?)<\/g>/.exec(b1(svg))?.[1] ?? ''
  const rows = [...tags.matchAll(/<text\b[^>]*>(.*?)<\/text>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
  return rows.filter((_, i) => i % 2 === 0).map((r) => r.split(' · ')[0].replace('&lt;', '<'))
}

describe('floor numbers and the basement (B1)', () => {
  test('every floor is numbered on the left pier, bottom up: B1 the basement, 1F the street front, then 2F, 3F… to the roof', () => {
    for (const [name, f] of FLOOR_SETS()) {
      for (const width of [480, 660, 960, 2400]) {
        for (const view of ['all', 'live']) {
          const at = `${name} ${view}@${width}`
          const svg = renderSvg(f, { view, width, animate: false })
          const nums = floorNumbers(svg)
          assert.ok(nums.length >= 3, `${at}: ${nums}`)
          assert.deepEqual(nums.map((n) => n[0]), ['B1', ...nums.slice(1).map((_, i) => `${i + 1}F`)], at)
          // each on the pier (x 6 to the first room), the basement's under the sidewalk, the street front's over it (56
          // tall), the top floor's beside the top band's nameplates, under the building's bar (under the parapet when
          // nobody is in)
          const walk = rectsOf(bodyOf(svg), K.walk)[0][1]
          const room = Math.min(...rectsOf(bodyOf(svg), K.wall).map((r) => r[0]))
          for (const [label, , x] of nums) assert.ok(x > 6 && x < room, `${at}: ${label} at x ${x}, rooms from ${room}`)
          assert.ok(nums[0][1] > walk && nums[1][1] < walk && nums[1][1] > walk - 56, `${at}: B1 under the sidewalk, 1F over it`)
          assert.equal(nums.at(-1)[1], SKY + 5 + (f.live.desks.length ? BAR_SPAN : 0) + 2 + 6.5, `${at}: the top floor under the bar`)
        }
      }
    }
    // a tall building: from the tenth floor up the pier widens for two digits
    const tall = floorNumbers(renderSvg(stressFacts(), { view: 'all', width: 480, animate: false }))
    assert.ok(tall.some(([l]) => l === '10F'), `${tall.map((n) => n[0])}`)
  })

  test('B1 shows what they did in full: every department as its own room, busiest first, its share as the facts say', () => {
    for (const [name, f] of [['sample', SAMPLE], ['real-shaped', realShaped()], ['stress', stressFacts()]]) {
      const { rows, total } = departmentRows(f.totals.activity)
      for (const width of [480, 660, 960]) {
        const at = `${name}@${width}`
        const svg = renderSvg(f, { view: 'all', width, animate: false })
        assert.ok(svg.includes('>WHAT THEY DID<') && svg.includes(`share of ${fmtCount(total)} tool calls`), at)
        // the work scene's rooms, not a digest: every department on a nameplate of its own, none folded into "N more"
        for (const [, dept] of DEPARTMENTS) assert.ok(b1(svg).includes(`>${dept.toUpperCase()}<`), `${at}: ${dept}`)
        assert.doesNotMatch(b1(svg), />\d+ more</, `${at}: nothing folded`)
        // each share as the facts say it, a whole percent, the busiest first
        const shares = b1Shares(svg)
        assert.equal(shares.length, DEPARTMENTS.length, `${at}: ${shares}`)
        for (const r of rows.filter((x) => x.v)) assert.ok(shares.includes(pct(r.v, total)), `${at}: ${r.name} ${pct(r.v, total)}`)
        assert.equal(shares[0], pct(rows[0].v, total), `${at}: the busiest first`)
        for (const share of shares) assert.match(share, /^(<1|\d+)%$/, `${at}: a whole percent`)
        // and no how-to-read under it: the rooms say it (the work view keeps its lines)
        assert.ok(!b1(svg).includes('how to read:'), `${at}: no how to read`)
      }
    }
    // no tool calls: every department closed
    const empty = renderSvg(emptyFacts(), { view: 'all', animate: false })
    assert.ok(empty.includes('no tool calls this week yet') && empty.includes('every department is closed'))
  })

  test('the basement is a cross-section: stone walls under the piers, soil beside it, the commits line under it, no road down there', () => {
    for (const transparent of [false, true]) {
      const svg = renderSvg(SAMPLE, { view: 'all', width: 660, animate: false, transparent })
      const walk = rectsOf(bodyOf(svg), K.walk)[0][1]
      const stone = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="url\(#to-b1-stonep\)"\/>/g)].map((m) => m.slice(1).map(Number))
      assert.equal(stone.length, 2, 'a stone wall each side')
      assert.deepEqual([stone[0][0], stone[0][1], stone[1][0] + stone[1][2]], [6, walk + 4, 330 - 6], 'under the brick shell, right under the sidewalk')
      // the soil in the margins is ground, not backdrop: it stays on the page
      assert.ok(svg.includes(`fill="${'#1b1713'}" d="M0 ${walk + 9}h6`), 'soil beside the basement')
      assert.ok(svg.indexOf('COMMITS LINE') > svg.indexOf('>WHAT THEY DID<'))
      // one sidewalk, one brick shell: the basement is no second building. The shell's brick runs from the roof line down
      // to the sidewalk, the parapet's three courses over it; its stone quoins stop at the sidewalk too
      const brick = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="url\(#to-brick\)"\/>/g)]
        .map((m) => m.slice(1).map(Number)).sort((a, b) => a[1] - b[1])
      assert.deepEqual(brick, [[6, SKY - 3, 330 - 12, 3], [6, SKY, 330 - 12, walk - SKY]], 'the parapet and the shell, nothing under the street')
      const quoins = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="4" height="([\d.]+)" fill="url\(#to-quoin-[lr]\)"\/>/g)].map((m) => m.slice(1).map(Number))
      assert.deepEqual(quoins, [[6, SKY + 5, walk - SKY - 5], [330 - 10, SKY + 5, walk - SKY - 5]], 'a quoin up each corner, from the cornice to the sidewalk')
    }
  })

  test('a heavy office keeps every desk and the commits line: the basement sheds its furniture first', () => {
    for (const width of [240, 480, 960, 1600, 2400]) {
      for (const transparent of [false, true]) {
        const svg = renderSvg(heavyOffice(), { view: 'all', width, transparent })
        const at = `@${width}${transparent ? ' transparent' : ''}`
        assert.ok(svg.length <= MAX_SVG, `${at}: ${svg.length}`)
        assert.doesNotMatch(svg, /more desks? upstairs/, `${at}: all 24 desks`)
        assert.ok(svg.includes('COMMITS LINE') && svg.includes('>WHAT THEY DID<') && svg.includes('>B1</text>'), at)
      }
    }
    // the sample keeps its furniture at every pane width
    for (const width of [480, 660, 960]) assert.ok(renderSvg(SAMPLE, { view: 'all', width }).includes('fill="url(#to-wk-racksp)"'), `sample @${width}: the server racks`)
  })
})

describe('more desks than the drawing holds (24)', () => {
  // `n` desks of a project at work, titled `<k>00`, `<k>01`…
  const crew = (f, project, k, n, more = {}) => Array.from({ length: n }, (_, i) => ({
    ...clone(f.live.desks.find((d) => d.state === 'working')), id: `${k}${i}`, title: `${k}${String(i).padStart(2, '0')}`, project, project_path: `/git/${project}`,
    interns: [], meetings: [], ...more,
  }))
  const done = (f) => ({ state: 'idle', status: 'idle', idle_reason: 'done', activity: { kind: 'idle', tool: null, label: null, since: f.generated_at } })
  // the titles of the desks drawn, in the drawing's order (a desk's tooltip is `<project> · <title> · …`)
  const titles = (svg) => deskGroups(svg).map((d) => / · ([a-z]\d\d)(?: · |$)/.exec(d.tip)?.[1]).filter(Boolean)
  // how many desks of each crew are drawn, by the first letter of their titles
  const drawn = (svg) => {
    const n = {}
    for (const t of titles(svg)) n[t[0]] = (n[t[0]] ?? 0) + 1
    return n
  }
  const office = (...crews) => {
    const f = stressFacts()
    f.live.desks = crews.flatMap(([project, k, n, more]) => crew(f, project, k, n, typeof more === 'function' ? more(f) : more))
    return f
  }

  test('no room takes the floor: a desk to each room in turn, and the rest are counted under the building', () => {
    const svg = renderSvg(office(['factory', 'f', 40], ['app', 'a', 10], ['site', 's', 8]), { view: 'live', width: 960 })
    assert.deepEqual(drawn(svg), { f: 8, a: 8, s: 8 })
    assert.match(svg, /\+34 more desks upstairs/)
  })

  test("a script's workers sit after the sessions somebody opened, and before the desks whose turn is over", () => {
    const worker = { worker: true }
    const svg = renderSvg(office(['factory', 'f', 40, worker], ['app', 'a', 10], ['site', 's', 8], ['docs', 'd', 6, done]), { view: 'live', width: 960 })
    assert.deepEqual(drawn(svg), { a: 10, s: 8, f: 6 }, 'every opened session at work, then the workers')
    assert.match(svg, /\+40 more desks upstairs/)
    // a desk that needs you is seated with those at work
    const f = office(['factory', 'f', 40, worker], ['app', 'a', 10], ['site', 's', 8], ['docs', 'd', 6, done])
    Object.assign(f.live.desks.find((d) => d.title === 'd03'), { idle_reason: 'error' })
    assert.deepEqual(drawn(renderSvg(f, { view: 'live', width: 960 })), { a: 10, s: 8, d: 1, f: 5 })
  })

  test('a floor that fits is drawn as it was: every desk, in its own order', () => {
    const f = office(['app', 'a', 10, (g) => done(g)], ['site', 's', 8, { worker: true }])
    Object.assign(f.live.desks[9], clone(f.live.desks[10]), { id: 'a9', title: 'a09', project: 'app', project_path: '/git/app', worker: undefined })
    const svg = renderSvg(f, { view: 'live', width: 960 })
    assert.doesNotMatch(svg, /more desks? upstairs/)
    assert.deepEqual(titles(svg), f.live.desks.map((d) => d.title), 'the one at work is not moved before the others')
  })
})

// ---------------------------------------------------------------- the walls' dressing (2F and up)

// What hangs on the walls, [width, height, what rises over it] of each piece (the calendar's nail, the painting's light;
// the shadow adds a pixel right and down).
const PIECES = { 'rm-cal': [7, 9, 1], 'rm-poster': [9, 12, 0], 'rm-art': [13, 10, 2], 'rm-cork': [19, 12, 0], 'rm-wshelf': [22, 10, 0], 'rm-kanban': [30, 15, 0] }
const pieces = (svg) => [...bodyOf(svg).matchAll(/<use href="#to-(rm-(?:cal|poster|art|cork|wshelf|kanban))" x="(\d+)" y="(\d+)"( color="[^"]*")?\/>/g)]
  .map((m) => {
    const [w, h, up] = PIECES[m[1]]
    return { name: m[1], x: Number(m[2]), y: Number(m[3]) - up, w: w + 1, h: h + up + 1, tinted: Boolean(m[4]) }
  })
// Each desk's top-left (a lit desk's chair under its glow, or a dark room's chair), as drawn on the floor.
const desksAt = (svg) => [...bodyOf(svg).matchAll(/<g transform="translate\((\d+) (\d+)\)">(?:<title>[^<]*<\/title>)?<use href="#to-rm-(?:chair|k\w+)"/g)]
  .map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))
// The wallpapers a drawing hangs (by name), and whether the kitchen is tiled.
const papersOf = (svg) => [...svg.matchAll(/fill="url\(#to-rm-(damask|regency|dots|lattice)p\)"/g)].map((m) => m[1])
const dressing = (svg) => ({ papers: new Set(papersOf(svg)).size, tiles: svg.includes('fill="url(#to-rm-tilesp)"') })

describe('the walls of the floors upstairs', () => {
  test('dressed where the budget has room: a wallpaper per room, tiles in the kitchen, pieces on the bare wall, the art kept', () => {
    // by day at every width; by night (its lamps and lit windows weigh more) where the desks' hover cards leave it room
    for (const [night, widths] of [[false, [480, 660, 960]], [true, [960]]]) {
      for (const width of widths) {
        const f = clone(SAMPLE)
        f.now = { ...f.now, is_night: night }
        const svg = renderSvg(f, { view: 'all', width })
        const at = `${night ? 'night' : 'day'}@${width}`
        // five papered rooms (three project rooms upstairs, theoffice-agents and the meeting room): all four wallpapers
        assert.deepEqual(dressing(svg), { papers: 4, tiles: true }, at)
        assert.ok(pieces(svg).length > 0, `${at}: something on the walls`)
        assert.match(svg, /href="#to-rm-k(?:cool|warm|ask)"/, `${at}: the full art (the screens' glow on the wall) kept`)
      }
    }
    // the lights-off office hangs its pieces in its dark rooms; the empty one has only the kitchen and its tiles
    assert.ok(pieces(renderSvg(darkOffice(), { view: 'live', width: 960 })).length > 0)
    assert.deepEqual(dressing(renderSvg(emptyFacts(), { view: 'live', width: 960 })), { papers: 0, tiles: true })
  })

  test('a piece hangs on bare wall: never over a desk, another piece or the chair rail, inside the building', () => {
    for (const [name, f, width] of [['sample', day(SAMPLE), 480], ['sample', SAMPLE, 960], ['sample', day(SAMPLE), 2400], ['dark', darkOffice(false), 1600],
      ['dark', darkOffice(), 960]]) {
      const svg = renderSvg(f, { view: 'live', width })
      const W = Number(/viewBox="0 0 (\d+)/.exec(svg)[1])
      const on = pieces(svg)
      const desks = desksAt(svg)
      const at = `${name}@${width}`
      assert.ok(on.length > 0 && desks.length > 0, at)
      const meets = (a0, a1, b0, b1) => a0 < b1 && b0 < a1
      for (const p of on) {
        const it = `${at}: ${p.name} at ${p.x},${p.y}`
        assert.ok(p.x >= 18 && p.x + p.w <= W - 10, `${it}: inside the piers`)
        // a desk's box: the lamp a pixel left of it to the figure's arm at x 49; its row's chair rail at y 22
        for (const d of desks.filter((d) => meets(p.y, p.y + p.h, d.y, d.y + 36))) {
          assert.ok(!meets(p.x, p.x + p.w, d.x - 1, d.x + 50), `${it}: over the desk at ${d.x},${d.y}`)
          assert.ok(p.y + p.h <= d.y + 22, `${it}: over the chair rail of the row at ${d.y}`)
        }
        for (const q of on) if (q !== p) assert.ok(!(meets(p.x, p.x + p.w, q.x, q.x + q.w) && meets(p.y, p.y + p.h, q.y, q.y + q.h)), `${it}: over ${q.name}`)
      }
      // the poster is the project's: tinted, the rest in their own colors
      for (const p of on) assert.equal(p.tinted, p.name === 'rm-poster', `${at}: ${p.name}`)
    }
  })

  test('a room keeps its wallpaper and its walls from one refresh to the next; a wide wall gets a wide piece, and a room varies them', () => {
    const f = clone(SAMPLE)
    const g = clone(SAMPLE)
    g.live.desks[0].activity = { ...g.live.desks[0].activity, label: 'something else entirely' }
    const list = (svg) => [...papersOf(svg), ...pieces(svg).map((p) => `${p.name}@${p.x},${p.y}`)]
    assert.deepEqual(list(renderSvg(f, { view: 'live', width: 960 })), list(renderSvg(g, { view: 'live', width: 960 })))
    // the lights-off rooms at 2400: long bare walls, the kanban on them, and the pieces spread evenly over the rooms
    const wide = pieces(renderSvg(darkOffice(false), { view: 'live', width: 2400 })).map((p) => p.name)
    const times = [...new Set(wide)].map((n) => wide.filter((m) => m === n).length)
    assert.ok(wide.includes('rm-kanban') && times.length >= 4 && Math.max(...times) - Math.min(...times) <= 1, wide.join(' '))
  })

  test('never busy: a piece always has bare wall around it, and between the desks every other stretch stays bare', () => {
    for (const [name, f, width] of [['sample', day(SAMPLE), 480], ['sample', SAMPLE, 960], ['sample', day(SAMPLE), 2400], ['dark', darkOffice(false), 1600],
      ['dark', darkOffice(), 960]]) {
      const svg = renderSvg(f, { view: 'live', width })
      const W = Number(/viewBox="0 0 (\d+)/.exec(svg)[1])
      const at = `${name}@${width}`
      // what bounds a stretch of wall: the desks of its row, the partitions between the rooms, the building's ends
      const walls = [0, W, ...rectsOf(bodyOf(svg), K.part).map(([x]) => x)].map((x) => ({ x, desk: false }))
      const on = pieces(svg)
      const desks = desksAt(svg)
      for (const p of on) {
        const same = (q) => q !== p && q.y < p.y + p.h && q.y + q.h > p.y
        for (const q of on.filter(same)) assert.ok(q.x >= p.x + p.w + 40 || q.x + q.w + 40 <= p.x, `${at}: ${p.name} at ${p.x}, ${q.name} at ${q.x}`)
        const stops = [...desks.filter((d) => p.y >= d.y && p.y < d.y + 36).map((d) => ({ x: d.x, desk: true })), ...walls].sort((a, b) => a.x - b.x)
        const i = stops.findIndex((s) => s.x > p.x)
        // a room's ends always hang something; a stretch between two desks has none hung in the stretches beside it
        if (!stops[i - 1]?.desk || !stops[i]?.desk) continue
        for (const [a, b] of [[stops[i - 2], stops[i - 1]], [stops[i], stops[i + 1]]]) {
          if (!a?.desk || !b?.desk) continue
          assert.ok(!on.some((q) => same(q) && q.x > a.x && q.x < b.x), `${at}: ${p.name} at ${p.x} and a piece between the desks at ${a.x} and ${b.x}`)
        }
      }
    }
  })

  test('the lightest art keeps plain walls: no wallpaper, no tiles, nothing hung', () => {
    // the heavy office with every desk in a project of its own (24 rooms, each its nameplate and strip) comes down to the
    // lightest art on a narrow pane (no panelling pattern either)
    const f = heavyOffice()
    f.live.desks.forEach((d, i) => { d.project = `project-number-${i}-with-a-long-name` })
    const svg = renderSvg(f, { view: 'live', width: 240 })
    assert.doesNotMatch(svg, /rm-wainsp/, 'the lightest art')
    assert.deepEqual(dressing(svg), { papers: 0, tiles: false })
    assert.equal(pieces(svg).length, 0)
  })
})

// ---------------------------------------------------------------- 1F: the street front

// The agents walking the sidewalk: [tooltip, from, to, sprite] of each looping walker.
const walkers = (svg) => [...svg.matchAll(/<g>(?:<title>([^<]*)<\/title>)?<animateTransform attributeName="transform" type="translate" values="(-?\d+) 0;(-?\d+) 0;-?\d+ 0"[^>]*\/>(?:<animate [^>]*\/>)?<use href="#to-([\w-]+)"/g)]
  .map((m) => [m[1] ?? '', Number(m[2]), Number(m[3]), m[4]])

describe('the street front (1F)', () => {
  test('a grand entrance under a canopy that says THE OFFICE, shop windows mirrored about it, street lamps lit at night', () => {
    for (const width of [480, 660, 960]) {
      const svg = renderSvg(SAMPLE, { view: 'all', width, animate: false })
      const cx = Math.floor(width / 4)
      assert.match(svg, new RegExp(`<text x="${cx}" y="[\\d.]+" font-size="5" fill="[^"]+" text-anchor="middle" font-weight="bold" letter-spacing=".4">THE OFFICE</text>`), `@${width}`)
      const wins = [...svg.matchAll(/<use href="#to-fr-shop[ND]?" x="(\d+)"/g)].map((m) => Number(m[1]))
      assert.ok(wins.length >= 2 && wins.length % 2 === 0, `@${width}: ${wins}`)
      for (const x of wins) assert.ok(wins.includes(2 * cx - x - 36), `@${width}: the window at ${x} has no twin`)
      assert.match(svg, /href="#to-fr-lampN"/, `@${width}: the lamps lit at night`)
      assert.match(svg, /href="#to-fr-shopN"/, `@${width}: warm windows with someone in`)
    }
    assert.match(renderSvg(day(SAMPLE), { view: 'all' }), /href="#to-fr-lamp"/)
    // the empty office at night: 'closed' on the door, dark windows
    const dark = renderSvg(darkOffice(), { view: 'all', animate: false })
    assert.ok(dark.includes('>closed</text>') && dark.includes('href="#to-fr-shopD"'))
  })

  test('agents go around on the sidewalk: who just left walks out of the door, visitors walk in, passers-by fill the street', () => {
    const f = clone(SAMPLE)
    f.contractors = [{ ...f.contractors[0], live: true }]
    for (const width of [480, 960]) {
      const W = width / 2
      const door = Math.floor(W / 2) - 12
      const all = walkers(renderSvg(f, { view: 'all', width }))
      const at = `@${width}`
      // gizmo3d left 9 minutes ago: out of the door, off the street, its tooltip says who and when
      const out = all.filter(([tip]) => tip.includes('left 9m ago'))
      assert.equal(out.length, 1, at)
      assert.equal(out[0][1], door, `${at}: from the door`)
      assert.ok(out[0][2] > W || out[0][2] < -20, `${at}: off the street`)
      assert.match(out[0][3], /^cW[rl]$/, `${at}: walking`)
      // the live visitor: a robot walking up to the door
      const vis = all.filter(([tip]) => tip.startsWith('visitor: codex'))
      assert.equal(vis.length, 1, at)
      assert.equal(vis[0][3], 'robot', at)
      assert.equal(vis[0][2], door + 8, `${at}: to the door`)
      // passers-by fill the street to its width's share (2 to 5), end to end, no tooltip
      assert.equal(all.length, Math.max(2, Math.min(5, Math.floor(W / 110))), at)
      for (const [tip, from, to] of all.filter(([t]) => !t)) assert.ok(Math.min(from, to) < 0 && Math.max(from, to) > W, `${at}: ${from} → ${to}`)
    }
    // still: nobody walks, everybody stands on the street
    const still = renderSvg(f, { view: 'all', animate: false })
    assert.equal(walkers(still).length, 0)
    assert.ok(still.includes('left 9m ago</title><use href="#to-cW'), 'the one who left, standing on the street')
  })
})

// ---------------------------------------------------------------- the rooms' stats and props

describe('the rooms show their stats and live a little', () => {
  test('a project room says how it stands now, no week\'s scoreboard in its header; the office\'s lines stay on the typing pool\'s wall: ▲ added ▼ removed, said short, exact in its tooltip', () => {
    const svg = renderSvg(SAMPLE, { view: 'all', width: 960, animate: false })
    const island = SAMPLE.projects.find((p) => p.name === 'island-tour-3d')
    assert.doesNotMatch(svg, /<title>\+13,860 \/ −3,080 lines in commits this week<\/title>/, 'a project room\'s')
    assert.ok(!svg.includes(`>${fmtCount(island.deletions)}</text>`))
    // the office's own total on the typing pool's wall, downstairs; no board for a project whose commits moved nothing
    assert.match(svg, /<title>\+107,100 \/ −23,800 lines in commits this week<\/title>/)
    assert.ok(svg.includes(`>${fmtCount(107100)}</text>`) && svg.includes(`>${fmtCount(23800)}</text>`))
    assert.doesNotMatch(svg, /<title>\+0 \/ −0 lines/)
    // its dark plate stays in sight: nothing opaque is painted over it (its band's walls least of all)
    const paths = [...svg.matchAll(/<path fill="(#[0-9a-f]+)"( fill-opacity="[^"]+")? d="([^"]+)"/g)]
    const rects = (d) => [...d.matchAll(/M(-?[\d.]+) (-?[\d.]+)h([\d.]+)v([\d.]+)h-?[\d.]+z/g)].map((r) => r.slice(1).map(Number))
    const boards = paths.flatMap((p, i) => (p[1] === '#14100c' ? rects(p[3]).filter((r) => r[3] === 9 && r[2] !== 23).map((r) => [r, i]) : []))
    assert.equal(boards.length, 1, 'the typing pool\'s scoreboard alone')
    for (const [[x, y, w, h], i] of boards) {
      for (const p of paths.slice(i + 1)) {
        if (p[2]) continue
        assert.ok(!rects(p[3]).some(([rx, ry, rw, rh]) => rx <= x && ry <= y && rx + rw >= x + w && ry + rh >= y + h), `[${x}, ${y}, ${w}, ${h}] under ${p[1]}`)
      }
    }
  })

  test('a nameplate and a floor number are lit from above: corners rounded off, the top row lit, the foot shaded, a shadow on the wall', () => {
    const { rects, light } = litPlate(10, 20, 30, 9, '#123456')
    assert.deepEqual(rects.slice(0, 2), [[11, 20, 28, 9, '#123456'], [10, 21, 30, 7, '#123456']], 'the four corners cut')
    assert.deepEqual(light, [[11, 20, 28, 1, '#fff/.4'], [11, 28, 28, 1, '#000/.22']])
    assert.deepEqual(rects[2].slice(0, 2), [11, 29], 'the shadow under it, a pixel to the right')
    const svg = renderSvg(SAMPLE, { view: 'all', width: 960, animate: false })
    // every floor's number on the one sprite, none of its plate on the brick
    const floors = [...svg.matchAll(/<text x="[\d.]+" y="[\d.]+">(B1|\d+F)<\/text>/g)].length
    assert.ok(floors > 2)
    assert.equal(svg.match(/<use href="#to-fl-plate\d+"/g)?.length, floors)
    // the rooms' nameplates in one paint, the light over all of them, then their names in one group
    const names = svg.match(/fill-opacity="\.22" d="[^"]+"\/><g font-size="5\.5" fill="#16110d" font-weight="bold">(.*?)<\/g>/)?.[1]
    assert.ok(names && SAMPLE.live.desks.every((d) => names.includes(`>${d.project}<`)) && names.includes('>MEETING ROOM<'), names)
    // a room's desk labels take their font from the floors' two groups
    const label = SAMPLE.live.desks.find((d) => d.title && !d.account && d.cls !== 'dozing' && d.title.length < 20)?.title
    if (label) assert.match(svg, new RegExp(`<g font-size="5\\.5" fill="${ROLE.title}">.*<text x="[\\d.]+" y="[\\d.]+">${label}</text>`))
  })

  test('the kitchen: the microwave and the fruit on a shelf, the fridge where it has the width, the agents on break chatting', () => {
    const wide = renderSvg(SAMPLE, { view: 'all', width: 660 })
    assert.ok(wide.includes('href="#to-lv-shelf"') && wide.includes('href="#to-lv-fridge"'))
    assert.ok(wide.includes('href="#to-lv-chat"'), 'a speech bubble now and then')
    assert.ok(!renderSvg(SAMPLE, { view: 'all', width: 660, animate: false }).includes('href="#to-lv-chat"'), 'still: nobody talks')
  })

  test('the week tower stands on the Office’s street front: the entrance under its canopy, lamps, agents walking by', () => {
    const svg = renderSvg(SAMPLE, { view: 'week', width: 660 })
    assert.ok(svg.includes('letter-spacing=".4">THE OFFICE</text>'), 'the canopy')
    assert.ok(svg.includes('href="#to-fr-lampN"') && svg.includes('href="#to-fr-shopN"'), 'lamps lit, windows warm at night')
    assert.ok(/<animateTransform attributeName="transform" type="translate" values="-?\d+ 0;-?\d+ 0;-?\d+ 0"/.test(svg), 'someone walking')
    assert.ok(!svg.includes('tw-rcp'), 'no lobby of its own')
  })
})

// ---------------------------------------------------------------- what the floors say

// The words a drawing writes: each <text>'s body, its tspans joined, in the order drawn.
const textsOf = (svg) => [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
const heightOf = (svg) => Number(/viewBox="0 0 [\d.]+ ([\d.]+)"/.exec(svg)[1])
// the sample's hand up answered: its one desk with lines under it at work
const answered = () => {
  const f = clone(SAMPLE)
  Object.assign(f.live.desks[8], { state: 'working', status: 'busy', activity: { ...f.live.desks[8].activity, kind: 'coding', tool: 'Edit', label: 'cape.js' } })
  return f
}

// The tags a floor lays on its slabs (svg-kit tagsSvg), in `markup`: each its box [x, y, w, h] and the words of its rows.
function tagsOf(markup) {
  const g = /<path fill="#1a1613" d="([^"]*)"\/><path fill="none" stroke="#ece2cd"[^>]*\/><g font-size="5">(.*?)<\/g>/.exec(markup)
  if (!g) return []
  const texts = [...g[2].matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>(.*?)<\/text>/g)].map((m) => ({ x: +m[1], y: +m[2], t: m[3].replace(/<[^>]+>/g, '') }))
  return [...g[1].matchAll(/M([\d.]+) ([\d.]+)h([\d.]+)v(\d+)/g)].map((m) => m.slice(1, 5).map(Number))
    .map(([x, y, w, h]) => ({ box: [x, y, w, h], rows: texts.filter((t) => t.x > x && t.x < x + w && t.y > y && t.y < y + h).map((t) => t.t) }))
}
// the floors' tags, above the basement
const floorTags = (svg) => tagsOf(svg.slice(0, svg.indexOf('>WHAT THEY DID<')))

describe('what the floors say', () => {
  test('every desk wears a tag on the slab under it: its title over what it is at in a few words, and keeps its tooltip', () => {
    const f = clone(SAMPLE)
    Object.assign(f.live.desks[2], { state: 'idle', status: 'idle', idle_reason: 'stopped' })
    Object.assign(f.live.desks[3], { state: 'idle', status: 'idle', idle_reason: 'error' })
    const svg = renderSvg(f, { view: 'live', width: 960, animate: false })
    const now = Date.parse(f.now.iso)
    const tags = floorTags(svg)
    const said = new Map()
    for (const d of f.live.desks.filter((x) => deskClass(x, now) !== 'break')) {
      const tag = tags.find((t) => esc(d.title).startsWith(t.rows[0].replace(/…$/, '')))
      assert.ok(tag && tag.rows.length === 2, `${d.title}: its tag`)
      said.set(deskClass(d, now), tag.rows[1])
      assert.ok(svg.includes(`<title>${esc(d.project)} · ${esc(d.title)} · `), `${d.title}: its tooltip`)
    }
    // what needs you first (a narrow desk clips it); what a desk at work is at in a word and for how long; what waits
    // on what
    assert.match(said.get('asking'), /^asks: Which/)
    assert.match(said.get('stopped'), /^stopped by/)
    assert.match(said.get('error'), /^error: /)
    assert.match(said.get('working'), /^(coding|terminal|tests|web|reading) · \d/)
    assert.match(said.get('dozing'), /^dozing · \d/)
    // what a desk waits on in a word (its meeting's table names the meeting)
    assert.equal(said.get('waiting'), 'in a meeting')
    // the file a desk edits is not the floor's to say, nor are its room's counts the header's: its strip says them
    const floors = textsOf(svg.slice(0, svg.indexOf('>WHAT THEY DID<')))
    assert.ok(!floors.some((t) => t.startsWith('read office-notes') || t.startsWith('edit rhythm-drums')))
    // (a room header's counts were its 5-px line; the sign's lines are 5.5)
    const fives = [...svg.slice(0, svg.indexOf('>WHAT THEY DID<')).matchAll(/<text [^>]*font-size="5"[^>]*>(.*?)<\/text>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
    assert.ok(!fives.some((t) => /^\d+ working|^\d+ running · \d+ in the room|^\d+ on break$/.test(t)), fives.join(' | '))
    // no card: everything is on the floors
    assert.ok(!svg.includes('<g class="to-hc">'))
  })

  test('a desk that waits on you marks its tag with a bar down the left edge and a frame round it in its color, a turn done gold and saying your turn; a desk at work neither', () => {
    const f = clone(SAMPLE)
    Object.assign(f.live.desks[2], { state: 'idle', status: 'idle', idle_reason: 'stopped' })
    Object.assign(f.live.desks[3], { state: 'idle', status: 'idle', idle_reason: 'error' })
    // a turn just done: idle for a few minutes, no break, no stop
    Object.assign(f.live.desks[9], { state: 'idle', status: 'idle', idle_reason: 'done', activity: { ...f.live.desks[9].activity, since: new Date(Date.parse(f.now.iso) - 5 * 60e3).toISOString() } })
    const svg = renderSvg(f, { view: 'live', width: 960, animate: false })
    const now = Date.parse(f.now.iso)
    const tags = floorTags(svg)
    const seen = new Set()
    // a turn done is the gold of what waits on you, as a turn stopped is: no longer the break's teal
    assert.equal(CLASS_COLOR.done, ROLE.accent)
    assert.notEqual(CLASS_COLOR.done, CLASS_COLOR.break)
    for (const d of f.live.desks.filter((x) => deskClass(x, now) !== 'break')) {
      const cls = deskClass(d, now)
      const tag = tags.find((t) => esc(d.title).startsWith(t.rows[0].replace(/…$/, '')))
      const [x, y, w, h] = tag.box
      const bar = new RegExp(`<path fill="(#[0-9a-f]{6})" d="[^"]*M${x} ${y}h2v${h}h-2z`).exec(svg)
      if (['asking', 'error', 'stopped', 'done'].includes(cls)) {
        assert.equal(bar?.[1], CLASS_COLOR[cls], `${d.title} (${cls}): its bar`)
        // its frame in the same color: along the top and the foot from the bar on, down the right edge
        const frame = rectsOf(svg, CLASS_COLOR[cls])
        for (const r of [[x + 2, y, w - 2, 1], [x + 2, y + h - 1, w - 2, 1], [x + w - 1, y + 1, 1, h - 2]]) {
          assert.ok(frame.some((q) => q.join() === r.join()), `${d.title} (${cls}): its frame's [${r}]`)
        }
        seen.add(cls)
      } else {
        assert.equal(bar, null, `${d.title} (${cls}): no bar`)
        assert.ok(!rectsOf(svg, CLASS_COLOR[cls]).some((q) => q.join() === [x + w - 1, y + 1, 1, h - 2].join()), `${d.title} (${cls}): no frame`)
      }
      // a turn done says how long it has waited for you (exact off a live clock)
      if (cls === 'done') assert.equal(tag.rows[1], 'your turn · 5m')
    }
    assert.equal(seen.size, 4, [...seen].join(' '))
  })

  test('the meeting room\'s tables, the kitchen and the dark rooms wear tags too; the basement\'s rooms theirs', () => {
    const svg = renderSvg(SAMPLE, { view: 'all', width: 960, animate: false })
    const tags = floorTags(svg)
    assert.ok(tags.some((t) => t.rows[0] === 'arcade-finale-brief' && t.rows[1] === '3 running · 1 to go'))
    assert.ok(tags.some((t) => t.rows[0] === '2 on break' && /^island · glyph/.test(t.rows[1])))
    assert.ok(floorTags(renderSvg(darkOffice(), { view: 'live', width: 960, animate: false })).some((t) => /^(last out|lights left on)/.test(t.rows[0])))
    // B1: every room's share and calls over its kind of work, on a tag; no big bold figures down there
    const b1Tags = tagsOf(b1(svg))
    assert.ok(b1Tags.some((t) => /^39% · 20(\.1)?k calls$/.test(t.rows[0]) && t.rows[1] === 'terminal commands'))
    assert.doesNotMatch(b1(svg), /font-size="9" font-weight="bold"/)
    // a tag stays inside its room, its words fitted to it
    for (const { box: [, , w], rows } of [...tags, ...b1Tags]) for (const r of rows) assert.ok(textW(r.replace(/&#39;/g, "'").replace(/&amp;/g, '&'), 5) <= w - 6 + 0.01, `${r} in ${w}`)
  })

  test('a row of desks keeps its label band for its tags, a meeting room its own: no floor is thinned but a quiet one', () => {
    for (const width of [540, 960]) {
      const asked = renderSvg(SAMPLE, { view: 'live', width, animate: false })
      const calm = renderSvg(answered(), { view: 'live', width, animate: false })
      assert.equal(heightOf(asked), heightOf(calm), `@${width}`)
      // quiet: the hand up answered, its row has no lines left and stands on a plain floor, a label band shorter
      const quiet = (f) => renderSvg(f, { view: 'live', width, animate: false, quiet: true })
      assert.equal(heightOf(quiet(SAMPLE)) - heightOf(quiet(answered())), DECK - 5, `@${width}: quiet`)
      assert.equal(desksAt(quiet(answered())).length, desksAt(asked).length, `@${width}: every desk still drawn`)
    }
  })
})

// Balanced tags and no stray `<` or `&` in what a drawing writes: '' when the markup is sound, else what is wrong.
function xmlProblem(src) {
  const stack = []
  for (const m of src.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    if (m[3]) continue
    if (!m[1]) stack.push(m[2])
    else if (stack.pop() !== m[2]) return `unbalanced </${m[2]}>`
  }
  if (stack.length) return `unclosed <${stack.at(-1)}>`
  return /&(?![a-z]+;|#\d+;)/.test(src.replace(/<[^>]*>/g, '')) ? 'a bare &' : ''
}

describe('quiet (the pane’s Quiet key)', () => {
  test('the building keeps its names (nameplates, floor numbers, the sign’s one line, the hand up’s lines), its whiteboards and its basement’s shares; its counts, scoreboards and other words go', () => {
    const svg = renderSvg(SAMPLE, { view: 'all', width: 540, quiet: true, animate: false })
    const floors = textsOf(withoutCards(svg)).map((s) => s.trim())
    for (const s of ['10 desks', '1 hand up', 'island-tour-3d', 'glyph-atlas-webgpu', 'MEETING ROOM', 'KITCHEN', '5F', '1F', 'B1', 'WHAT THEY DID', 'SERVER ROOM',
      'COMMITS LINE', 'THE OFFICE', esc('Wizard\'s cape should…'), 'asks: Which cape ancho…', 'Design', '5/9 done']) assert.ok(floors.includes(s), s)
    for (const s of ['5 working', '3 working · 1 hand up · 1 on break · 1 done', '1 running · 3 in the room', '2 on break', 'terminal commands',
      'share of 50k tool calls this week', 'COMMITS LINE · 18 commits today']) assert.ok(!floors.some((t) => t.startsWith(s)), s)
    // the basement's tags keep their first line alone, the share and the calls: never the kind of work
    const b1 = tagsOf(svg.slice(svg.indexOf('>WHAT THEY DID<')))
    assert.ok(b1.length >= 6 && b1.every((t) => t.rows.length === 1 && /^<?[\d.]+%( · .*calls?)?$/.test(t.rows[0])), b1.map((t) => t.rows.join(' / ')).join(' | '))
    assert.ok(b1.some((t) => /^39% · 20(\.1)?k calls$/.test(t.rows[0])))
    // no scoreboard; the headcount strips and the desks' cards stay
    assert.ok(!svg.includes('<g><title>+'))
    assert.equal(cardsOf(svg).length, 10)
    assert.equal(desksAt(svg).length, desksAt(renderSvg(SAMPLE, { view: 'all', width: 540, animate: false })).length, 'every desk still drawn')
    assert.ok(heightOf(svg) < heightOf(renderSvg(SAMPLE, { view: 'all', width: 540, animate: false })), 'shorter: plain floors, and one line on the basement’s slabs')
  })

  test('an empty office, quiet: the desks counted, the dark rooms named, the canopy and the closed door; no lines under them', () => {
    const svg = renderSvg(darkOffice(), { view: 'all', width: 540, quiet: true, animate: false })
    const floors = textsOf(svg)
    for (const s of ['0 desks', 'glyph-atlas-webgpu', 'KITCHEN', 'THE OFFICE', 'closed', 'WHAT THEY DID']) assert.ok(floors.includes(s), s)
    for (const s of ['everyone clocked out', 'lights left on', 'last out', 'the robot vacuum']) assert.ok(!floors.some((t) => t.includes(s)), s)
  })

  test('a desk says what it is on in a card while the pointer rests on it; only one that needs you has its lines under it', () => {
    const f = clone(SAMPLE)
    Object.assign(f.live.desks[2], { state: 'idle', status: 'idle', idle_reason: 'stopped' })
    Object.assign(f.live.desks[3], { state: 'idle', status: 'idle', idle_reason: 'error' })
    const svg = renderSvg(f, { view: 'live', width: 960, animate: false, quiet: true })
    const now = Date.parse(f.now.iso)
    const seated = f.live.desks.filter((x) => deskClass(x, now) !== 'break')
    const needy = seated.filter((d) => ['asking', 'error', 'stopped'].includes(deskClass(d, now)))
    // their lines under them, and their tooltip
    const [, titles, acts] = svg.match(new RegExp(`<g font-size="5\\.5" fill="${ROLE.title}">(.*?)</g><g font-size="5">(.*?)</g>`))
    assert.equal(textsOf(titles).length, 3)
    const said = textsOf(acts)
    for (const lead of ['asks: ', 'stopped by you', 'error: ']) assert.ok(said.some((s) => s.startsWith(lead)), lead)
    for (const d of needy) assert.ok(svg.includes(`<title>${esc(d.project)} · ${esc(d.title)} · `), d.title)
    // every other desk: a card over it with its title and what it is doing, no tooltip under the card's hit box
    const cards = cardsOf(svg)
    for (const d of seated.filter((x) => !needy.includes(x))) {
      const card = cards.find((c) => esc(d.title).startsWith(c.rows[0].replace(/…$/, '')))
      assert.ok(card && card.box[2] === 48, `${d.title}: its card, its box the desk`)
      assert.ok(!svg.includes(`<title>${esc(d.project)} · ${esc(d.title)} · `), `${d.title}: no tooltip under the card`)
    }
    const floors = textsOf(withoutCards(svg))
    for (const s of ['read office-notes.md', 'browse app.netlify.com', 'dozing at the desk', 'meeting arcade-finale-brief']) {
      assert.ok(cards.some((c) => c.rows.some((r) => r.startsWith(s.slice(0, 12)))) && !floors.some((t) => t.startsWith(s.slice(0, 10))), s)
    }
  })

  test('a card hangs over its box, inside the building, all of them last and hidden until hovered; the tables and the kitchen have theirs', () => {
    for (const width of [240, 540, 960]) {
      const svg = renderSvg(SAMPLE, { view: 'all', width, animate: false, quiet: true })
      const W = Number(/viewBox="0 0 (\d+)/.exec(svg)[1])
      // seven desks at ease, the meeting room's table, the two agents on a break
      assert.equal(cardsOf(svg).length, 10, `@${width}`)
      for (const m of svg.matchAll(/<g display="none"><rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\/>/g)) {
        const [x, , w] = m.slice(1, 4).map(Number)
        assert.ok(x >= 6 && x + w <= W - 6, `@${width}: a card at ${x}+${w} of ${W}`)
      }
      assert.match(svg, /<style>\.to-hc g:hover g\{display:inline\}/)
      assert.equal(xmlProblem(svg), '', `@${width}`)
      // no tag: the floors keep their names alone
      assert.equal(floorTags(svg).length, 0, `@${width}`)
    }
    const cards = cardsOf(renderSvg(SAMPLE, { view: 'live', width: 960, animate: false, quiet: true }))
    assert.ok(cards.some((c) => c.rows[0] === 'arcade-finale-brief' && c.rows[1] === '3 running · 1 to go'))
    assert.equal(cards.filter((c) => c.rows[1]?.endsWith('on break')).length, 2)
    assert.ok(cardsOf(renderSvg(SAMPLE, { view: 'live', width: 660, quiet: true })).some((c) => c.rows.includes('longest shift on the floor')))
  })

  test('quiet is the live building’s alone: every other view draws as it would', () => {
    for (const view of ['today', 'week', 'month', 'work']) assert.equal(renderSvg(SAMPLE, { view, quiet: true }), renderSvg(SAMPLE, { view }), view)
  })

  test('quiet stays inside the size budget and never draws fewer desks, from an empty office to the heaviest', () => {
    for (const [name, f] of [['sample', SAMPLE], ['stress', stressFacts()], ['heavy', heavyOffice()], ['dark', darkOffice()], ['day', darkOffice(false)]]) {
      for (const width of [240, 540, 960]) {
        const opts = { view: 'all', width, card: true, liveClock: true }
        const quiet = renderSvg(f, { ...opts, quiet: true })
        assert.ok(quiet.length <= MAX_SVG, `${name} @${width}: ${quiet.length}`)
        assert.ok(desksAt(quiet).length >= desksAt(renderSvg(f, opts)).length, `${name} @${width}`)
      }
    }
  })
})

// ---------------------------------------------------------------- the building's bar, the sign, a raised hand

// The building's bar's counts as it draws them, in order: [type size, words] of the texts in its dim group.
const barCounts = (svg) => {
  const g = new RegExp(`<g font-size="([\\d.]+)" fill="${ROLE.dim}">((?:<text [^>]*>.*?</text>)+)</g>`).exec(svg)
  return g ? [...g[2].matchAll(/<text [^>]*>(.*?)<\/text>/g)].map((m) => [Number(g[1]), m[1].replace(/<[^>]+>/g, '')]) : []
}
// The sign's two lines as read: the texts on each baseline, their spans joined.
const signLines = (svg) => [30, 36.5].map((y) => [...svg.matchAll(new RegExp(`<text x="[\\d.]+" y="${y}" font-size="5.5"[^>]*>(.*?)</text>`, 'g'))]
  .map((m) => m[1].replace(/<[^>]+>/g, '')).join(' ').replace(/\s+/g, ' ').trim())

describe('the building\'s bar, the sign and a raised hand', () => {
  test('a bar under the roof says how the floors stand: the strip, then who works, who needs you, who waits on helpers, who is on break, each its icon', () => {
    const svg = renderSvg(SAMPLE, { view: 'live', width: 960, animate: false })
    assert.deepEqual(barCounts(svg), [[5.5, '5 working'], [5.5, '1 need you'], [5.5, '1 in a meeting'], [5.5, '2 on break']])
    for (const icon of ['work', 'you', 'wait', 'break']) assert.match(svg, new RegExp(`<use href="#to-ic-${icon}" x="\\d+" y="${SKY + 5 + 4}"/>`), icon)
    // as calm as the building's other labels: the sign's size, regular, only the number in its state's color, the words dim
    assert.doesNotMatch(svg, /font-size="6\.5"/)
    for (const [n, word, color] of [[5, 'working', ROLE.busy], [1, 'need you', ROLE.accent], [1, 'in a meeting', ROLE.wait], [2, 'on break', ROLE.idle]]) {
      assert.ok(svg.includes(`<tspan fill="${color}">${n}</tspan> ${word}</text>`), word)
    }
    // what needs you counts every desk that waits on you: a hand up, an error, a turn stopped or done (not a dozer)
    const f = clone(SAMPLE)
    Object.assign(f.live.desks[2], { state: 'idle', status: 'idle', idle_reason: 'stopped' })
    Object.assign(f.live.desks[3], { state: 'idle', status: 'idle', idle_reason: 'error' })
    assert.deepEqual(barCounts(renderSvg(f, { view: 'live', width: 960, animate: false })).map((c) => c[1]), ['3 working', '3 need you', '1 in a meeting', '2 on break'])
    // narrower, who waits on helpers goes first (the strip's purple still says it), then the type comes down to the tags'
    assert.equal(barCounts(renderSvg(SAMPLE, { view: 'live', width: 640, animate: false })).length, 4)
    assert.deepEqual(barCounts(renderSvg(SAMPLE, { view: 'live', width: 480, animate: false })), [[5.5, '5 working'], [5.5, '1 need you'], [5.5, '2 on break']])
    assert.deepEqual(barCounts(renderSvg(SAMPLE, { view: 'live', width: 240, animate: false })), [[5, '5 working'], [5, '1 need you'], [5, '2 on break']])
    // none quiet (the sign keeps its line), none with nobody in
    assert.deepEqual(barCounts(renderSvg(SAMPLE, { view: 'live', width: 960, animate: false, quiet: true })), [])
    assert.deepEqual(barCounts(renderSvg(emptyFacts(), { view: 'live', width: 960, animate: false })), [])
  })

  test('the sign keeps the fun of it: the desks and who sits at them, then the interns, the longest shift and the meetings, each its icon', () => {
    const svg = renderSvg(SAMPLE, { view: 'live', width: 960, animate: false })
    assert.deepEqual(signLines(svg), ['10 desks', '2 interns · longest shift 3h10 · 1 meeting'])
    assert.match(svg, /<use href="#to-ic-intern" x="\d+" y="31"\/>/)
    assert.match(svg, /<use href="#to-ic-cup" x="\d+" y="31"\/>/)
    // a mixed office says who is in, by character
    const mixed = clone(SAMPLE)
    for (const d of mixed.live.desks.slice(2, 4)) d.agent = 'codex'
    assert.equal(signLines(renderSvg(mixed, { view: 'live', width: 960, animate: false }))[0], '10 desks · 8 Clawd · 2 Dex')
    // what works and what needs you are the bar's, not the sign's
    assert.ok(!signLines(svg).join(' ').includes('working'))
  })

  test('a raised hand has a big ? over it, hopping in the air a room has over its desks', () => {
    const svg = renderSvg(SAMPLE, { view: 'live', width: 960 })
    assert.equal([...svg.matchAll(/<use href="#to-bq" x="30" y="-7"\/>/g)].length, 1, 'over the one raised hand')
    assert.match(svg, /<g id="to-bq"><g>(?:<path [^>]*\/>)+<animateTransform [^>]*values="0 0;0 -2;0 -2;0 0;0 0"/)
    // every row of desks has 8 of wall over it besides the row: the top band's desks HEAD + 8 under its top
    const still = renderSvg(SAMPLE, { view: 'live', width: 960, animate: false })
    const top = floorNumbers(still).at(-1)[1] - 2 - 6.5
    assert.equal(Math.min(...desksAt(still).map((d) => d.y)) - top, HEAD + 8)
  })

  test('a desk at work tells its time to ten minutes on a live drawing, never more than it has been at it; exactly off it', () => {
    const ctx = { now: Date.parse('2026-10-26T00:40:00.000Z'), liveClock: true }
    const at = (min) => deskTime(ctx, ctx.now - min * 60e3)
    assert.deepEqual([0, 9.9, 10, 59, 60, 69, 70, 125, 599, 600, 1439, 1440, 4000].map(at),
      ['<20m', '<20m', '10m+', '50m+', '1h+', '1h+', '1h10+', '2h+', '9h50+', '10h+', '23h+', '1d+', '2d+'])
    assert.equal(deskTime({ ...ctx, liveClock: false }, ctx.now - 97 * 60e3), '1h37')
    assert.equal(deskTime(ctx, NaN), '')
  })

  test('a tag says its time whole or not at all: never a time cut short on a narrow tag', () => {
    const f = clone(SAMPLE)
    // the drum puzzle's coder done a while ago: a turn with its time, among five desks to a row
    Object.assign(f.live.desks[2], { state: 'idle', status: 'idle', idle_reason: 'done', activity: { ...f.live.desks[2].activity, since: new Date(Date.parse(f.now.iso) - 15 * 60e3).toISOString() } })
    let told = 0
    for (const width of [480, 640, 960]) {
      for (const tag of floorTags(renderSvg(f, { view: 'live', width, liveClock: true, animate: false }))) {
        const said = tag.rows[1] ?? ''
        assert.doesNotMatch(said, / · [^·]*…$/, `@${width}: ${said}`)
        if (/^(your turn|coding|tests|web|reading|terminal) · /.test(said)) told++
      }
    }
    assert.ok(told > 0, 'some tags have room for their time')
  })
})
