// The header every pixel view opens with (svg-kit sceneHeader): a sign on the roof, about half as wide as the building
// and centered over it on truss legs, the neon THE OFFICE in pixel-art glass tubes, yellow
// over the scene's info on one or two centered lines (the view, the date or the range and the shift in its tooltip; no
// clock), over a sky band of one fixed height, so the roof line sits at the same y in every view at a given width; the
// moon or the sun beside the sign, the stars, and the skyline behind the parapet (the antenna, the water tower, the stair
// bulkhead, the chimney and the vents, the AC unit, the pigeons on the coping) stand in the same places, over the
// building's crown: the parapet's brick under its stone coping, the cornice, the stone quoins up both corners.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { SVG_VIEWS, renderSvg } from '../plugin/lib/svg.mjs'
import { CLOUD_TINTS, INFO, K, MAX_SVG, NEON, ORB, ROOF_PROPS, SKIES, SKY, signBox, textW } from '../plugin/lib/svg-kit.mjs'
import { SAMPLE, clone, emptyFacts, monthFacts, stressFacts, todayFacts } from './helpers/facts.mjs'

// ---------------------------------------------------------------- fixtures

const VIEWS = Object.keys(SVG_VIEWS)
// each view with the facts the pane gives it: the week's for the Office, Week and What they did, a range of their own
// for Today and Month
const FACTS = { live: () => clone(SAMPLE), all: () => clone(SAMPLE), today: todayFacts, week: () => clone(SAMPLE), month: monthFacts, work: () => clone(SAMPLE) }
const at = (f, night, hour) => ({ ...f, now: { ...f.now, is_night: night, hour, local_time: `${String(hour).padStart(2, '0')}:05` } })
const WORD = { live: 'live', all: 'live', today: 'today', week: 'week', month: 'month', work: 'what they did' }

// ---------------------------------------------------------------- tiny parsers

const widthOf = (svg) => Number(/viewBox="0 0 (\d+)/.exec(svg)[1])
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
// The roof line: the top of the shell's brick (the parapet's own brick sits on it, 3 tall, the coping on that).
const roofOf = (svg) => Number(/<rect x="6" y="([\d.]+)" width="[\d.]+" height="[\d.]+" fill="url\(#to-brick\)"\/>/.exec(svg)?.[1])
const parapetOf = (svg) => Number(/<rect x="6" y="([\d.]+)" width="[\d.]+" height="3" fill="url\(#to-brick\)"\/>/.exec(svg)?.[1])
// The coping's lit top: [y, w], jutting 3 past each wall.
const copingOf = (svg) => /<path fill="#b29d7d" d="M3 ([\d.]+)h([\d.]+)v1h/.exec(svg.slice(svg.indexOf('</defs>')))?.slice(1).map(Number)
// The header: everything drawn before the shell's brick (the sky, the moon or the sun, the skyline, the sign).
const headOf = (svg) => svg.slice(svg.indexOf('</defs>'), svg.indexOf(`<rect x="6" y="${SKY}" `))
// Where a shared prop or the moon or the sun is placed: its <use> as written.
const useOf = (svg, name) => new RegExp(`<use href="#to-${name}"[^>]*/>`).exec(svg)?.[0]
const celOf = (svg) => {
  const m = /<use href="#to-(moon|sun)(?:-s)?" x="(\d+)" y="(\d+)"/.exec(svg)
  return m && { body: m[1], x: Number(m[2]), y: Number(m[3]) }
}
// The skyline: every prop standing on the roof (over the roof line), as written, in the order drawn; and as
// { name, x, y, w } (its box from ROOF_PROPS, lib/svg-roof.mjs), the pigeons on the coping apart.
const skylineOf = (svg) => [...svg.matchAll(/<use href="#to-rf-([a-z]+)" x="(\d+)" y="(\d+)"\/>/g)].filter((m) => Number(m[3]) < SKY).map((m) => m[0])
const propsOf = (svg) => [...svg.matchAll(/<use href="#to-rf-([a-z]+)" x="(\d+)" y="(\d+)"\/>/g)]
  .filter((m) => Number(m[3]) < SKY && m[1] !== 'pigeon').map((m) => ({ name: m[1], x: Number(m[2]), y: Number(m[3]), w: ROOF_PROPS[m[1]].w }))
// The stars (or the clouds): the shared sky as markup.
const starsOf = (svg) => {
  const body = svg.slice(svg.indexOf('</defs>'))
  return /<path fill="#e9e6ff" d="[^"]*"\/>/.exec(body)?.[0] ?? (body.match(/<use href="#to-(?:cloud|cl-)[^>]*>/g) ?? []).join('')
}
// The sign: its box [x, y, w, h], its tooltip, and its markup (the sign's group, up to the shell drawn after it).
const signOf = (svg) => {
  const m = /<g><title>(THE OFFICE · [^<]*)<\/title><path fill="#1a1613" d="M([\d.]+) ([\d.]+)h([\d.]+)v([\d.]+)h/.exec(svg)
  if (!m) return null
  const [x, y, w, h] = m.slice(2).map(Number)
  return { x, y, w, h, tip: unesc(m[1]), markup: svg.slice(m.index, svg.indexOf('fill="url(#to-brick)"', m.index)) }
}
// The neon: the lit line of each word, drawn once per word as a <use> of its tube: [word, x, y].
const neonOf = (svg) => [...svg.matchAll(/<use href="#to-neon-([01])" x="(\d+)" y="(\d+)" fill="#[0-9a-f]+"\/>/g)]
  .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])])
// The scene's info lines on the sign: each text's left, right, baseline and text (a centered line is one <text>
// anchored in its middle; a line with a mark is laid out from its left, a <text> per run).
const infoOf = (sign) => [...sign.markup.matchAll(new RegExp(`<text x="([\\d.]+)" y="([\\d.]+)" font-size="${INFO.size}"( text-anchor="middle")?>(.*?)</text>`, 'g'))]
  .map((m) => {
    const s = unesc(m[4].replace(/<[^>]+>/g, ''))
    const w = textW(s, INFO.size)
    const x = Number(m[1])
    return { x0: m[3] ? x - w / 2 : x, x1: m[3] ? x + w / 2 : x + w, cx: m[3] ? x : null, y: Number(m[2]), s }
  })
// What the sign draws after its first line of text starts: the marks on its lines (the live glance's headcount strip).
const marksOf = (sign) => {
  const from = sign.markup.indexOf('<text')
  return from < 0 ? [] : [...sign.markup.slice(from).matchAll(/<path[^>]* d="([^"]+)"/g)]
    .flatMap((m) => [...m[1].matchAll(/M(-?[\d.]+) (-?[\d.]+)h([\d.]+)v([\d.]+)h-?[\d.]+z/g)].map((r) => r.slice(1).map(Number)))
}
// What some markup writes: each <text>'s words, tags stripped.
const textsOf = (markup) => [...markup.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((m) => unesc(m[1].replace(/<[^>]+>/g, '')))
// A running clock's digits: a tspan per glyph switched on and off (display), or a path whose d steps through them.
const RUNNING = /attributeName="(?:display|d)"/

// ---------------------------------------------------------------- the header

describe('one header for every pixel view', () => {
  test('the roof line, the crown, the sign and the skyline sit at the same place in every view, at 480, 660 and 960 px, night and day, on a page or not', () => {
    for (const width of [480, 660, 960]) {
      for (const [night, hour] of [[true, 23], [false, 14]]) {
        for (const transparent of [false, true]) {
          const seen = {}
          for (const view of VIEWS) {
            const where = `${view}@${width}${night ? '' : ' day'}${transparent ? ' transparent' : ''}`
            const svg = renderSvg(at(FACTS[view](), night, hour), { view, width, animate: false, transparent })
            const W = widthOf(svg)
            assert.equal(roofOf(svg), SKY, `${where}: the roof at the header's foot`)
            assert.equal(parapetOf(svg), SKY - 3, `${where}: the parapet's brick on it`)
            assert.deepEqual(copingOf(svg), [SKY - 5, W - 6], `${where}: the coping on the parapet, jutting past the walls`)
            const sign = signOf(svg)
            assert.ok(sign, `${where}: the sign`)
            const lines = [...new Set(infoOf(sign).map((t) => t.y))]
            assert.ok([[INFO.one], INFO.two].some((ys) => ys.join() === lines.join()), `${where}: the scene's info on the sign's lines (${lines})`)
            const shared = {
              sign: [sign.x, sign.y, sign.w, sign.h].join(), neon: neonOf(svg).join(';'), celestial: useOf(svg, night ? 'moon' : 'sun'),
              skyline: skylineOf(svg).join(''), stars: starsOf(svg),
            }
            for (const [k, v] of Object.entries(shared)) {
              // the stars by night, the clouds by day (each tries a few places for one clear of the sign and the skyline)
              assert.ok(v, `${where}: ${k}`)
              seen[k] ??= v
              assert.equal(v, seen[k], `${where}: the ${k} where every other view has it`)
            }
          }
          // on each side of the sign, in the open roof beside it: a landmark at the outer end, then up to two more
          // toward the sign, none over another; from 960 px a pigeon each side on the coping
          const svg = renderSvg(at(FACTS.week(), night, hour), { view: 'week', width, animate: false })
          const W = widthOf(svg)
          const box = signBox(W)
          const props = propsOf(svg)
          const sides = [props.filter((p) => p.x < box.x), props.filter((p) => p.x > box.x)]
          sides.forEach((side, k) => {
            assert.ok(side.length >= 1 && side.length <= 3, `${width}: ${side.length} props on the ${k ? 'right' : 'left'}`)
            for (const p of side) {
              assert.ok(k ? p.x >= box.x + box.w + 2 && p.x + p.w <= W - 6 : p.x >= 6 && p.x + p.w <= box.x - 2, `${width}: the ${p.name} at ${p.x} beside the sign`)
            }
            const byX = side.toSorted((a, b) => a.x - b.x)
            byX.slice(1).forEach((p, i) => assert.ok(p.x >= byX[i].x + byX[i].w + 2, `${width}: the ${p.name} clear of the ${byX[i].name}`))
            assert.equal(ROOF_PROPS[(k ? byX.at(-1) : byX[0]).name].kind, 'tall', `${width}: a landmark at the ${k ? 'right' : 'left'} end`)
          })
          if (width >= 960) assert.equal(seen.skyline.split('#to-rf-pigeon"').length - 1, 2, `${width}: two pigeons`)
        }
      }
    }
  })

  test('the skyline changes from one day to the next: its props drawn by lot from the date, the same all day', () => {
    const day = (date) => {
      const f = clone(SAMPLE)
      f.now.local_date = date
      return propsOf(renderSvg(f, { view: 'week', width: 960, animate: false })).map((p) => p.name).join(' ')
    }
    const dates = Array.from({ length: 14 }, (_, i) => `2026-11-${String(i + 1).padStart(2, '0')}`)
    const skylines = dates.map(day)
    assert.ok(new Set(skylines).size >= 10, `${new Set(skylines).size} skylines in 14 days`)
    const seen = new Set(skylines.join(' ').split(' '))
    for (const kind of ['tall', 'mid', 'small']) {
      const names = Object.keys(ROOF_PROPS).filter((n) => ROOF_PROPS[n].kind === kind)
      assert.ok(names.filter((n) => seen.has(n)).length >= Math.min(3, names.length), `${kind}: ${names.filter((n) => seen.has(n))}`)
    }
    // the same day draws the same skyline, whenever it is drawn
    assert.equal(day(dates[3]), skylines[3])
  })

  test('one sign: the neon THE OFFICE over the scene\'s info; the view, the date or the range and the shift in its tooltip; no clock', () => {
    for (const view of VIEWS) {
      const f = FACTS[view]()
      const svg = renderSvg(f, { view, width: 660, animate: false })
      const sign = signOf(svg)
      // the neon is drawn, not written: THE and OFFICE each a tube, in the same place, once
      const neon = neonOf(svg)
      assert.deepEqual(neon.map((n) => n[0]), [0, 1], `${view}: one neon, THE then OFFICE`)
      assert.ok(neon.every((n) => n[1] === neon[0][1] && n[2] === neon[0][2]), `${view}: one place`)
      const head = headOf(svg)
      assert.ok(!textsOf(head).some((s) => s.includes('THE OFFICE')), `${view}: THE OFFICE is neon, not text`)
      const when = view === 'live' || view === 'all' ? `${f.now.weekday} 26 Oct` : f.range.label
      assert.equal(sign.tip, `THE OFFICE · ${WORD[view]} · ${when} · night shift`, view)
      // the lines carry no view word, date or shift of its own
      assert.ok(infoOf(sign).length, `${view}: the scene's info`)
      assert.ok(!infoOf(sign).some((t) => /night shift|office hours/.test(t.s)), `${view}: no shift on the sign's lines`)
      // the header carries no clock: no time written, no text but the sign's lines
      assert.ok(!head.includes(f.now.local_time), `${view}: no ${f.now.local_time} in the header`)
      assert.ok(!textsOf(head).some((s) => /\d:\d\d/.test(s)), `${view}: no HH:MM in the header`)
      assert.equal(textsOf(head).length, infoOf(sign).length, `${view}: no text in the header but the sign's lines`)
    }
    // the shift word follows the facts, the same in every view: office hours by day, lights off with nobody in at night
    for (const view of VIEWS) {
      assert.match(signOf(renderSvg(at(FACTS[view](), false, 14), { view, animate: false })).tip, / · office hours$/, view)
      assert.match(signOf(renderSvg(emptyFacts(), { view, animate: false })).tip, / · lights off$/, view)
    }
  })

  test('a drawing that stays on screen runs no clock in its header: the live building none at all, the punch clock and the LED clock in their rooms', () => {
    // what a running clock adds to a drawing: its digits stepped by SMIL, one loop per digit (other loops, a page
    // turning on a desk, are there either way)
    const running = (svg) => (svg.match(new RegExp(RUNNING.source, 'g')) ?? []).length
    // the punch clock on Today's wall; the month's LED clock, only on a wall with room for it over the calendar
    const DIGITS = { live: [0], all: [0], today: [4], week: [0], month: [0, 4], work: [0] }
    for (const view of VIEWS) {
      const f = FACTS[view]()
      const svg = renderSvg(f, { view, width: 660, liveClock: true })
      const head = headOf(svg)
      assert.doesNotMatch(head, RUNNING, `${view}: no running digits in the header`)
      assert.ok(!head.includes(f.now.local_time) && !textsOf(head).some((s) => /\d:\d\d/.test(s)), `${view}: no time in the header`)
      const added = running(svg) - running(renderSvg(f, { view, width: 660 }))
      assert.ok(DIGITS[view].includes(added), `${view}: ${added} running digits, ${DIGITS[view].join(' or ')} expected`)
    }
  })

  test('at any width the sign keeps the neon, and the scene\'s info stays inside it, on one or two centered lines', () => {
    for (const width of [240, 320, 480, 660, 960, 2400]) {
      for (const view of VIEWS) {
        const svg = renderSvg(FACTS[view](), { view, width, transparent: true, animate: false })
        const where = `${view}@${width}`
        const sign = signOf(svg)
        const [left, right] = [sign.x + 6, sign.x + sign.w - 6]
        // the neon centered in the sign's upper part
        const neon = neonOf(svg)
        assert.equal(neon.length, 2, `${where}: the neon`)
        const n = NEON
        assert.equal(neon[0][1], sign.x + Math.round((sign.w - n.w) / 2), `${where}: the neon centered`)
        assert.ok(neon[0][1] >= sign.x && neon[0][1] + n.w <= sign.x + sign.w && neon[0][2] + n.h <= sign.y + 20, `${where}: the neon inside the sign, over its rail`)
        const info = infoOf(sign)
        assert.ok(info.length, `${where}: the scene's info`)
        const lines = [...new Set(info.map((t) => t.y))]
        assert.ok([[INFO.one], INFO.two].some((ys) => ys.join() === lines.join()), `${where}: one line or two (${lines})`)
        for (const t of info) {
          assert.ok(t.x0 >= left - 0.5 && t.x1 <= right + 0.5, `${where}: '${t.s}' [${t.x0}, ${t.x1}] runs out of the sign [${left}, ${right}]`)
          if (t.cx != null) assert.ok(Math.abs(t.cx - (sign.x + sign.w / 2)) <= 0.05, `${where}: '${t.s}' centered on the sign`)
          assert.ok(t.y > neon[0][2] + n.h && t.y < sign.y + sign.h - 3, `${where}: '${t.s}' under the neon, over the bulbs`)
        }
        for (const [x, , w] of marksOf(sign)) assert.ok(x >= left - 0.5 && x + w <= right + 0.5, `${where}: a mark at ${x} out of the sign`)
      }
    }
  })

  test('the sign stands centered over the roof in every view, narrower than the building, the moon or the sun beside it, at every hour and width', () => {
    for (const view of VIEWS) {
      for (const width of [240, 480, 660, 960, 1600, 2400]) {
        for (const hour of [0, 6, 9, 14, 19, 23]) {
          const night = hour >= 20 || hour < 7
          const svg = renderSvg(at(FACTS[view](), night, hour), { view, width, animate: false })
          const where = `${view} ${hour}h@${width}`
          const W = widthOf(svg)
          const { x, y, w, h } = signOf(svg)
          const box = signBox(W)
          assert.deepEqual([x, y, w, h], [box.x, 2, box.w, 40], `${where}: the sign where signBox puts it`)
          assert.ok(Math.abs(2 * x + w - W) <= 1, `${where}: centered over the building`)
          assert.ok(w <= W - 20 && w <= 300 && (width < 960 || w <= W / 2), `${where}: ${w} wide, narrower than the building (${W})`)
          assert.ok(y + h < SKY - 5, `${where}: over the roof, its legs down to the parapet`)
          const cel = celOf(svg)
          assert.equal(cel.body, night ? 'moon' : 'sun', where)
          // its middle at x, y, its disc ORB.rim round it: beside the sign, over the building, up out of the coping (low
          // in the sky at its rising and its setting, between the roof's props)
          assert.ok(cel.x + ORB.rim <= x || cel.x - ORB.rim >= x + w, `${where}: the ${cel.body} at ${cel.x} beside the sign [${x}, ${x + w}], never behind it`)
          assert.ok(cel.x - ORB.rim >= 6 && cel.x + ORB.rim <= W - 6, `${where}: the ${cel.body} over the building`)
          assert.ok(cel.y - ORB.rim >= 0 && cel.y + ORB.rim <= SKY - 5, `${where}: the ${cel.body} at ${cel.y}, in the sky over the coping`)
        }
      }
    }
    // the week keeps no sign of its own: its totals are on the roof's
    const week = renderSvg(clone(SAMPLE), { view: 'week', width: 660, animate: false })
    assert.equal((week.match(/<path fill="#1a1613"/g) ?? []).length, 1)
    assert.match(signOf(week).markup, /<text x="[\d.]+" y="(?:30|33)" font-size="5.5" text-anchor="middle"><tspan fill="[^"]+">\d+h agent-time<\/tspan>/)
  })

  test('the sky is pixel-art bands from the top down to the street, in the light of the hour: the same over the roof in every view, more the taller the building', () => {
    // the sky's group: its bands [top, h, color, w] (rects past both walls)
    const skyOf = (svg) => {
      const g = [...svg.matchAll(/<g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-dasharray="1">(.*?)<\/g>/g)]
      const bands = [...(g[0]?.[1] ?? '').matchAll(/<path color="(#[0-9a-f]{6})" d="M-2 (\d+)h(\d+)v(\d+)H-2z"\/>/g)].map((m) => [Number(m[2]), Number(m[4]), m[1], Number(m[3])])
      return { n: g.length, bands }
    }
    const dist = (a, b) => [1, 3, 5].reduce((n, i) => n + Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)), 0)
    // the moon low at 20:00 and 06:00 (twilight), the sun low at 07:00 and 08:00 (dawn) and from 17:00 (dusk)
    const LIGHTS = [[true, 23, 'night'], [true, 20, 'twilight'], [true, 6, 'twilight'], [false, 7, 'dawn'], [false, 12, 'day'], [false, 18, 'dusk']]
    for (const [night, hour, light] of LIGHTS) {
      const fell = {}
      let roof = null
      for (const view of VIEWS) {
        const where = `${view} ${hour}h`
        const svg = renderSvg(at(FACTS[view](), night, hour), { view, width: 660, animate: false })
        const { n, bands } = skyOf(svg)
        assert.equal(n, 1, `${where}: one sky`)
        // from the top down to the street, band on band, past both walls (the dashed stroke dithers each seam)
        assert.equal(bands[0][0], 0, `${where}: from the top`)
        bands.forEach(([top, h, , w], i) => {
          assert.ok(h > 0 && w === widthOf(svg) + 4, `${where}: band ${i}`)
          if (i) assert.equal(top, bands[i - 1][0] + bands[i - 1][1], `${where}: band ${i} under the one before`)
        })
        // over the roof the same bands in every view, one edge on the roof line
        const head = bands.filter(([top]) => top < SKY)
        assert.ok(head.some(([top, h]) => top + h === SKY), `${where}: a seam on the roof line`)
        roof ??= JSON.stringify(head)
        assert.equal(JSON.stringify(head), roof, `${where}: the sky over the roof as in every view`)
        // beside the building, 2 to 6 bands, each no taller than the one over it, the last nearest the horizon's glow
        const below = bands.filter(([top]) => top >= SKY)
        assert.ok(below.length >= 2 && below.length <= 6, `${where}: ${below.length} bands beside the building`)
        assert.ok(below.every(([, h], i) => !i || h <= below[i - 1][1] + 1), `${where}: thinner toward the street`)
        const glow = SKIES[light].fall.at(-1)[1]
        assert.ok(dist(bands.at(-1)[2], glow) < dist(bands[0][2], glow), `${where}: the glow at the street`)
        // the clouds in the light's tint (the lean sky's: lit by the low sun at dawn and dusk)
        if (!night) {
          assert.ok(new RegExp(`<use href="#to-cl-[a-z]+"[^>]* color="${CLOUD_TINTS[light][0]}"`).test(svg) || svg.includes(`<use href="#to-${SKIES[light].cloud}"`), `${where}: its clouds`)
        }
        fell[view] = below
      }
      const [week, month] = [fell.week, fell.month]
      assert.ok(week.at(-1)[0] + week.at(-1)[1] > month.at(-1)[0] + month.at(-1)[1] && week.length >= month.length, `${light}: the week's tower stands in a longer sky than the month's floor`)
    }
    // the twilight keeps the brightest of the night's stars, half as many
    const stars = (hour) => {
      const svg = renderSvg(at(clone(SAMPLE), true, hour), { view: 'week', width: 660, animate: false })
      return (/<path fill="#e9e6ff" d="([^"]*)"\/>/.exec(svg.slice(svg.indexOf('</defs>')))?.[1].match(/M/g) ?? []).length
    }
    assert.ok(stars(20) > 0 && stars(20) < stars(23), `${stars(20)} stars at 20:00, ${stars(23)} at 23:00`)
  })

  test('the brick piers run unbroken from the roof to the sidewalk: no slab, band or room paints over them', () => {
    // the shell's brick is one <rect> from the roof down to groundY; the piers are its outer 4 px on each side, their
    // stone quoins <rect>s of a pattern of their own over them from roof + 5 down (the stonework of the piers, not paint
    // over them: the left corner's tiles start on its pier, the right corner's are them mirrored about the building's
    // right edge); the crown (the coping, the cornice, its shadow) stays above roof + 5
    for (const view of VIEWS) {
      for (const width of [480, 660, 960]) {
        for (const transparent of [false, true]) {
          const svg = renderSvg(FACTS[view](), { view, width, transparent, animate: false })
          const where = `${view}@${width}${transparent ? ' transparent' : ''}`
          const W = widthOf(svg)
          const brick = /<rect x="6" y="([\d.]+)" width="[\d.]+" height="([\d.]+)" fill="url\(#to-brick\)"\/>/.exec(svg)
          const groundY = Number(brick[1]) + Number(brick[2])
          for (const [x, side] of [[6, 'l'], [W - 10, 'r']]) {
            assert.ok(svg.includes(`<rect x="${x}" y="${SKY + 5}" width="4" height="${groundY - SKY - 5}" fill="url(#to-quoin-${side})"/>`), `${where}: the quoins up the ${side} corner`)
          }
          assert.match(svg, /<pattern id="to-quoin-l" x="6" y="0" width="4" height="12" patternUnits="userSpaceOnUse">/, `${where}: the left quoins' tiles on its pier`)
          assert.ok(svg.includes(`<pattern id="to-quoin-r" href="#to-quoin-l" x="0" patternTransform="matrix(-1 0 0 1 ${W - 6} 0)"/>`), `${where}: the right ones mirrored onto theirs`)
          // what is painted after the brick (the sky behind it does not count), up to the commits line, whose group
          // paints in its own coordinates under the street
          const line = svg.indexOf('COMMITS LINE')
          const body = svg.slice(brick.index + brick[0].length, line < 0 ? svg.length : svg.lastIndexOf('<g transform="translate(0 ', line))
          const onPier = (x, w) => (x < 10 && x + w > 6) || (x < W - 6 && x + w > W - 10)
          for (const m of body.matchAll(/<path[^>]* d="([^"]+)"/g)) {
            for (const r of m[1].matchAll(/M(-?[\d.]+) (-?[\d.]+)h([\d.]+)v([\d.]+)h-?[\d.]+z/g)) {
              const [rx, ry, rw, rh] = r.slice(1).map(Number)
              if (ry + rh > SKY + 5 && ry < groundY) assert.ok(!onPier(rx, rw), `${where}: [${rx}, ${ry}, ${rw}, ${rh}] on a pier`)
            }
          }
        }
      }
    }
  })

  test('stress facts keep the header: one roof line, one sign, one neon, in the budget', () => {
    for (const view of VIEWS) {
      for (const width of [240, 2400]) {
        const svg = renderSvg(stressFacts(), { view, width })
        const where = `${view}@${width}`
        assert.equal(roofOf(svg), SKY, where)
        assert.equal(svg.split('<title>THE OFFICE · ').length - 1, 1, `${where}: one sign`)
        assert.deepEqual(neonOf(svg).map((n) => n[0]), [0, 1], `${where}: one neon`)
        assert.ok(svg.length <= MAX_SVG, `${where}: ${svg.length} chars`)
      }
    }
  })

  test('the header is drawn once, by the kit: every scene calls sceneHeader and paints no sky, moon or title of its own', () => {
    for (const file of ['svg-live.mjs', 'svg-today.mjs', 'svg-week.mjs', 'svg-month.mjs', 'svg-work.mjs']) {
      const src = fs.readFileSync(new URL(`../plugin/lib/${file}`, import.meta.url), 'utf8')
      assert.equal((src.match(/\bsceneHeader\(ctx, y0, \{[^}]*\binfo\b/g) ?? []).length, 1, `${file}: one call, its info on the sign`)
      assert.doesNotMatch(src, /'moon'|'sun'|K\.sky[ND]|headerLine|sceneTitle|titleBar|celestialAt|skyDeco|rooftop\(/, file)
    }
    // the timelapse paints its replayed sky through the header's `sky` option, and its info goes on the sign too, in
    // its replay and in the closed building; no scene writes the old board's line or its clock
    const lapse = fs.readFileSync(new URL('../plugin/lib/svg-timelapse.mjs', import.meta.url), 'utf8')
    assert.equal((lapse.match(/\bsceneHeader\(ctx, y0, \{[^}]*\binfo\b/g) ?? []).length, 2, 'svg-timelapse.mjs')
    for (const file of ['svg-live.mjs', 'svg-today.mjs', 'svg-week.mjs', 'svg-month.mjs', 'svg-work.mjs', 'svg-timelapse.mjs']) {
      assert.doesNotMatch(fs.readFileSync(new URL(`../plugin/lib/${file}`, import.meta.url), 'utf8'), /\bLINE2\b|\bline2Room\b|\bclockText\b|\bline2:/, file)
    }
  })
})
