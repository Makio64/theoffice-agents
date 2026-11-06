// lib/svg-beat.mjs: the pane's drawings on a shared beat, with nothing left that keeps a frame loop running. That what they
// draw is what plain <animate>s of the same timing draw was checked in Chromium and WebKit, pixel by pixel; these tests
// hold the markup to it: a small reader of the <set>s and hops says what a drawing shows at any moment.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { BEAT_MAX, onBeat } from '../plugin/lib/svg-beat.mjs'
import { SVG_VIEWS, renderSvg } from '../plugin/lib/svg.mjs'
import { SAMPLE, clone, emptyFacts, idleFacts, monthFacts, stressFacts, todayFacts } from './helpers/facts.mjs'

const attr = (tag, name) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
const secs = (s) => Number.parseFloat(s)
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">${body}</svg>`
const tags = (s, name) => s.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? []

/**
 * Every moment each <set> and hop of a drawing begins, up to `until`: the times it names, then all that those set off in
 * turn, as a browser reaches them.
 */
function schedule(s, until) {
  const els = [...tags(s, 'set'), ...tags(s, 'animateMotion')].filter((t) => attr(t, 'begin'))
  const byId = new Map(els.filter((t) => attr(t, 'id')).map((t) => [attr(t, 'id'), t]))
  const times = new Map(els.map((t) => [t, new Set()]))
  const waits = []
  for (const t of els) {
    for (const part of attr(t, 'begin').split(';')) {
      const m = /^(\w+)\.(end|begin)(?:\+([\d.]+)s)?$/.exec(part)
      if (m) waits.push({ el: t, ref: byId.get(m[1]), isEnd: m[2] === 'end', plus: Number.parseFloat(m[3] ?? '0') })
      else times.get(t).add(secs(part))
    }
  }
  for (let moved = true; moved;) {
    moved = false
    for (const { el, ref, isEnd, plus } of waits) {
      const span = isEnd ? secs(attr(ref, 'dur')) : 0
      for (const at of times.get(ref)) {
        const next = Math.round((at + span + plus) * 1e3) / 1e3
        if (next <= until && !times.get(el).has(next)) {
          times.get(el).add(next)
          moved = true
        }
      }
    }
  }
  return times
}

/** What `sets` hold their element at, at `t`, or `rest`. */
function heldAt(sets, times, t, rest = null) {
  for (const set of sets) {
    const dur = secs(attr(set, 'dur'))
    if ([...times.get(set)].some((b) => b <= t && t < b + dur)) return attr(set, 'to')
  }
  return rest
}

/** The opacity of the one animated element of `s` at `t`: a <set>'s, or the one it rests at. */
function opacityAt(s, t) {
  const rest = attr(/<g\b[^>]*>/.exec(s)[0], 'opacity') ?? '1'
  return heldAt(tags(s, 'set'), schedule(s, t + 1), t, rest)
}

/** The last of `hops` to have landed by `t`, as [dx, dy]; [0, 0] before any. */
function landed(hops, times, t) {
  let best = -Infinity
  let value = [0, 0]
  for (const h of hops) {
    const at = Math.max(...[...times.get(h)].filter((b) => b <= t), -Infinity)
    if (at >= best && at > -Infinity) {
      best = at
      value = attr(h, 'to').split(',').map(Number)
    }
  }
  return value
}

/** The x an element inside a counter stands at: its place at load plus what each level of the counter has added. */
function walkerAt(s, t) {
  const times = schedule(s, t + 1)
  let x = Number(/translate\(([-\d.]+) /.exec(s)[1])
  for (const level of s.split('<g').slice(1)) {
    const hops = tags(level, 'animateMotion')
    if (hops.length) x += landed(hops, times, t)[0]
  }
  return x
}

/** The squares a path of rectangles covers, in either spelling, as a set of 'x y'. */
function squares(d) {
  const out = new Set()
  let [x, y] = [0, 0]
  for (const m of d.matchAll(/([Mm])(-?[\d.]+)[ ]?(-?[\d.]+)h([\d.]+)v([\d.]+)h-[\d.]+z?/g)) {
    const [mx, my, w, h] = m.slice(2).map(Number)
    ;[x, y] = m[1] === 'M' ? [mx, my] : [x + mx, y + my]
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.add(`${x + i} ${y + j}`)
    y += h
  }
  return out
}

describe('onBeat', () => {
  test('two values on an element at rest in one of them: one <set> that begins again, on the beat', () => {
    const out = onBeat(svg('<g opacity="0"><rect/><animate attributeName="opacity" values="0;1;0" keyTimes="0;.94;.98" dur="4.2s" begin="-2s" calcMode="discrete" repeatCount="indefinite"/></g>'))
    assert.equal(tags(out, 'animate').length, 0)
    assert.equal(tags(out, 'set').length, 1)
    const set = tags(out, 'set')[0]
    assert.equal(attr(set, 'to'), '1')
    assert.equal(attr(set, 'dur'), '.25s')
    // a loop of 17 beats, 8 in: at rest for 8 more, then a beat at 1, then 16 at rest
    assert.equal(attr(set, 'begin'), `2s;${attr(set, 'id')}.end+4s`)
    assert.equal(opacityAt(out, 1.9), '0')
    assert.equal(opacityAt(out, 2.1), '1')
    assert.equal(opacityAt(out, 2.3), '0')
    assert.equal(opacityAt(out, 6.3), '1', 'and again a loop later')
  })

  test('of three values the one on screen at load is its rest, the others a chain, each in its own time', () => {
    const out = onBeat(svg('<g><rect/><animate attributeName="opacity" values=".2;.5;.8" dur="1.5s" begin="-.75s" calcMode="discrete" repeatCount="indefinite"/></g>'))
    assert.match(out, /<g opacity="\.5">/)
    assert.deepEqual(tags(out, 'set').map((t) => attr(t, 'to')), ['.8', '.2'])
    for (const [t, v] of [[0, '.5'], [0.3, '.8'], [0.8, '.2'], [1.3, '.5'], [1.8, '.8'], [15.1, '.5']]) assert.equal(opacityAt(out, t), v, `at ${t}`)
  })

  test('the value a loop keeps coming back to costs no element, and the drawing loads into a stretch of another as well', () => {
    const body = (begin) => `<g><rect/><animate attributeName="opacity" values="1;.2;1;.5;1;.8" dur="3s" begin="${begin}s" calcMode="discrete" repeatCount="indefinite"/></g>`
    const at = onBeat(svg(body(0)))
    assert.equal(tags(at, 'set').length, 3)
    for (const [t, v] of [[0.2, '1'], [0.7, '.2'], [1.2, '1'], [1.7, '.5'], [2.2, '1'], [2.7, '.8'], [3.2, '1'], [3.7, '.2'], [9.7, '.2']]) assert.equal(opacityAt(at, t), v, `at ${t}`)
    const inside = onBeat(svg(body(-0.75)))
    for (const [t, v] of [[0.1, '.2'], [0.4, '1'], [0.9, '.5'], [1.9, '.8'], [2.9, '.2']]) assert.equal(opacityAt(inside, t), v, `loading inside: at ${t}`)
  })

  test('a loop too quick for the beat keeps a beat for each of its values, and runs longer', () => {
    const out = onBeat(svg('<g><animate attributeName="opacity" values="1;0;1;0;.5" dur="1s" calcMode="discrete" repeatCount="indefinite"/></g>'))
    const sets = tags(out, 'set')
    assert.equal(sets.length, 3, 'the two at 1 are its rest')
    assert.ok(sets.every((t) => attr(t, 'dur') === '.25s'))
  })

  test('a move on a <use> is a <set> of its x or y, from where it stands', () => {
    const out = onBeat(svg('<use href="#a" x="10" y="4"><animateTransform attributeName="transform" type="translate" values="0 0;0 -1" dur=".5s" calcMode="discrete" repeatCount="indefinite"/></use>'))
    assert.equal(tags(out, 'animateMotion').length, 0)
    const set = tags(out, 'set')[0]
    assert.deepEqual([attr(set, 'attributeName'), attr(set, 'to'), attr(set, 'dur')], ['y', '3', '.25s'])
  })

  test('any other move is hops from its first value, which the element rests at; none begins before the drawing does', () => {
    const out = onBeat(svg('<g transform="translate(9 9)"><rect/><animateTransform attributeName="transform" type="translate" values="0 0;2 -3;4 -6;6 -9" dur="2s" begin="-.5s" calcMode="discrete" repeatCount="indefinite"/></g>'))
    assert.match(out, /<g transform="translate\(2 -3\)">/, 'the animation replaced its transform, and still does')
    const hops = tags(out, 'animateMotion')
    assert.equal(hops.length, 4)
    assert.ok(hops.every((h) => !attr(h, 'begin').startsWith('-')))
    const times = schedule(out, 6)
    for (const [t, want] of [[0.1, [0, 0]], [0.6, [2, -3]], [1.1, [4, -6]], [1.6, [-2, 3]], [2.1, [0, 0]], [4.1, [0, 0]], [4.6, [2, -3]]]) assert.deepEqual(landed(hops, times, t), want, `at ${t}`)
  })

  test('a walk is a counter: steady steps end to end, back at the start each round, a few elements for hundreds of places', () => {
    const body = '<g><title>a walker</title><use href="#w" y="30"/><animateTransform attributeName="transform" type="translate" values="452 0;-27 0;-27 0" keyTimes="0;.862;1" dur="50.5s" begin="-20s" repeatCount="indefinite"/></g>'
    const out = onBeat(svg(body))
    assert.ok(tags(out, 'animateMotion').length <= 22, `${tags(out, 'animateMotion').length} hops`)
    assert.equal(tags(out, 'animateTransform').length, 0)
    const at = (t) => walkerAt(out, t)
    const start = at(0)
    assert.ok(start < 452 && start > -27, `the phase it loads in: ${start}`)
    assert.equal(at(1) - start, -12, 'the pace it walked at, 12 a second, in steps of 3')
    const seen = new Set()
    for (let t = 0; t < 70; t += 0.125) seen.add(at(t))
    assert.ok(seen.size > 0)
    assert.ok(seen.size >= 200, `${seen.size} places`)
    assert.equal(Math.max(...seen), 452, 'round again to where it starts')
    assert.ok(Math.min(...seen) <= -27, 'all the way out')
  })

  test('a walk that stops in sight is hidden from where it stops until it starts again', () => {
    const out = onBeat(svg('<g><use href="#w"/><animateTransform attributeName="transform" type="translate" values="150 0;20 0;20 0" keyTimes="0;.8;1" dur="20s" repeatCount="indefinite"/></g>'))
    const gone = tags(out, 'set').filter((t) => attr(t, 'attributeName') === 'opacity')
    assert.equal(gone.length, 1)
    assert.equal(attr(gone[0], 'to'), '0')
  })

  test('a drift round a seam is one walk, coming in again at its west edge', () => {
    const out = onBeat(svg('<g><rect/><animateTransform attributeName="transform" type="translate" values="0 0;83 0;-337 0;0 0" keyTimes="0;.198;.198;1" dur="714s" repeatCount="indefinite"/></g>'))
    assert.equal(tags(out, 'animateTransform').length, 0)
    assert.ok(tags(out, 'animateMotion').length <= 22)
    assert.equal(walkerAt(out, 0), 0, 'it stands where it stood')
    assert.equal(walkerAt(out, 100), 57, 'at the drift\'s speed, a pixel at a time')
  })

  test('a glide with stops is sampled on the beat, the last of its values held', () => {
    const out = onBeat(svg('<g><rect/><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;.02;.06;.08;1" dur="11s" begin="-3s" repeatCount="indefinite"/></g>'))
    assert.equal(tags(out, 'animate').length, 0)
    assert.ok(tags(out, 'set').length >= 1)
    const stops = onBeat(svg('<g><rect/><animateTransform attributeName="transform" type="translate" values="0 0;40 20;40 20;0 0" keyTimes="0;.3;.7;1" dur="30s" repeatCount="indefinite"/></g>'))
    assert.equal(tags(stops, 'animateTransform').length, 0)
    assert.ok(tags(stops, 'animateMotion').length <= 60)
  })

  test('anything that does not loop for ever is left alone, and a drawing that would outgrow the Svg element too', () => {
    const once = svg('<g><animate attributeName="opacity" values="0;1" dur="1s" fill="freeze"/></g>')
    assert.match(onBeat(once), /<animate attributeName="opacity"/)
    const big = svg(`<g><title>${'x'.repeat(BEAT_MAX)}</title><animate attributeName="opacity" values="0;1" dur="1s" calcMode="discrete" repeatCount="indefinite"/></g>`)
    assert.equal(onBeat(big), big)
  })

  test('when a drawing would outgrow the Svg element a long loop gives up its blinks, one in two first, the rest of it the same', () => {
    const loop = 'values="0;-20;0;-40;0;-20;0;-60;0;-20;0;-40;0;-60;0;-20;0;-40" keyTimes="0;.2;.21;.3;.31;.4;.41;.5;.51;.6;.61;.7;.71;.8;.81;.9;.91;.95"'
    const body = (pad) => `<title>${'x'.repeat(pad)}</title><use href="#a"><animateTransform attributeName="transform" type="translate" ${loop} dur="30s" calcMode="discrete" repeatCount="indefinite"/></use>`
    const full = onBeat(svg(body(1000)))
    const sets = tags(full, 'set').length
    const room = BEAT_MAX - full.length + 1000
    const half = onBeat(svg(body(room + 20)))
    assert.notEqual(half, svg(body(room + 20)))
    assert.ok(tags(half, 'set').length < sets, `${tags(half, 'set').length} of ${sets}`)
    assert.ok(tags(half, 'set').length >= sets / 2 - 2)
    assert.ok(half.length <= BEAT_MAX)
  })

  test('a path of rectangles comes out shorter, with the very same squares', () => {
    const d = (rects) => rects.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h-${w}z`).join('')
    const shapes = [
      [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [0, 1, 3, 1], [8, 8, 2, 2]],
      [[5, 5, 1, 1], [5, 6, 1, 1], [5, 7, 1, 1], [9, 1, 4, 1], [12, 1, 2, 3]],
      [[1, 1, 4, 1], [2, 1, 1, 1], [0, 3, 1, 1], [2, 3, 1, 1]],
      [[-3, 2, 5, 1], [-3, 3, 5, 1], [40, 90, 1, 1], [3, 0, 1, 1]],
    ]
    for (const rects of shapes) {
      const out = /\sd="([^"]*)"/.exec(onBeat(svg(`<path fill="#123" d="${d(rects)}"/>`)))[1]
      assert.deepEqual([...squares(out)].sort(), [...squares(d(rects))].sort(), out)
      assert.ok(out.length < d(rects).length, out)
    }
    const spelled = /\sd="([^"]*)"/.exec(onBeat(svg(`<path fill="#123" d="${d(shapes[0].slice(0, 2))}"/>`)))[1]
    assert.equal(spelled, 'M0 0h1v1h-1m1-1h1v1h-1', 'relative moves, no z, and side by side ones stay two: one would not rasterize the same at a scale that is not whole')
    const other = 'M2 6.5h24M2 2.5h24'
    assert.ok(onBeat(svg(`<path stroke="#000" d="${other}"/>`)).includes(other), 'any other path is left alone')
    const box = 'M1 1h4v4h-4z'
    assert.ok(onBeat(svg(`<path fill="none" stroke="#000" d="${box}"/>`)).includes(box), 'a stroked one needs its z')
    assert.ok(onBeat(svg(`<g stroke="#000"><path fill="none" d="${box}"/></g>`)).includes(box), 'and so does one whose stroke it inherits')
    assert.ok(onBeat(svg(`<defs><path id="to-n" d="${box}"/></defs><use href="#to-n" fill="none" stroke="#000"/>`)).includes(box), 'and one a <use> strokes from outside: the neon')
    assert.ok(!onBeat(svg(`<g stroke="#000"><rect/></g><path fill="#000" d="${box}"/>`)).includes(box), 'and only those')
  })

  test('ids are as short as they go, and every reference follows', () => {
    const out = onBeat(svg('<defs><path id="to-a-long-sprite-name" d="M0 0"/><clipPath id="to-clip"><rect/></clipPath></defs><use href="#to-a-long-sprite-name" clip-path="url(#to-clip)"/><use href="#to-a-long-sprite-name"/>'))
    assert.doesNotMatch(out, /to-/)
    const [a, b] = [...out.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
    assert.ok(a.length === 2 && b.length === 2)
    assert.equal(out.split(`href="#${a}"`).length - 1, 2)
    assert.ok(out.includes(`clip-path="url(#${b})"`))
  })

  test('however many ids a drawing takes, none is a word a document or a form answers to, which a surface\'s scrub would drop', () => {
    const loops = Array.from({ length: 1000 }, (_, i) => `<rect id="to-${i}"><animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite" calcMode="discrete"/></rect>`)
    const ids = [...onBeat(svg(loops.join(''))).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
    assert.equal(new Set(ids).size, ids.length)
    assert.ok(ids.length >= 2000, 'past the names of two letters')
    assert.deepEqual(ids.filter((id) => !/^[A-Z][a-z]+$/.test(id)), [])
    assert.ok(ids.some((id) => id.length > 2))
  })
})

describe('the pane\'s drawings', () => {
  const NOW = Date.parse(SAMPLE.now.iso) + 125.5e3
  const SETS = () => [['sample', SAMPLE], ['today', todayFacts()], ['month', monthFacts()], ['empty', emptyFacts()], ['idle', idleFacts()], ['stress', stressFacts()]]
  const beat = (f, view, width = 900) => onBeat(renderSvg(f, { view, width, card: true, liveClock: true, clockAt: NOW }))

  /** Every id, and what points at them. */
  function references(s) {
    const ids = [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
    const set = new Set(ids)
    const used = [...s.matchAll(/(?:href="#|url\(#)([^")]+)/g)].map((m) => m[1])
    const waits = [...s.matchAll(/\sbegin="([^"]*)"/g)].flatMap((m) => m[1].split(';')).flatMap((p) => /^(\w+)\.(?:end|begin)/.exec(p)?.slice(1, 2) ?? [])
    return { ids, set, used, waits }
  }

  test('no view of any office keeps anything that needs a frame loop, and every one stays in the Svg element\'s limit', () => {
    for (const view of Object.keys(SVG_VIEWS)) {
      for (const [name, f] of SETS()) {
        const s = beat(f, view)
        assert.ok(s.length <= BEAT_MAX, `${view} ${name}: ${s.length}`)
        assert.doesNotMatch(s, /<animate\b|<animateTransform\b/, `${view} ${name}`)
        assert.doesNotMatch(s, /<script|\son[a-z]+=/, 'no script crept in')
      }
    }
  })

  test('every id is unique and letters only, a `begin` can read it, and nothing points at one that is gone', () => {
    for (const view of Object.keys(SVG_VIEWS)) {
      for (const [name, f] of SETS()) {
        const { ids, set, used, waits } = references(beat(f, view))
        assert.equal(set.size, ids.length, `${view} ${name}: unique`)
        assert.ok(ids.every((id) => /^[A-Z][a-z]+$/.test(id)), `${view} ${name}: letters`)
        for (const ref of [...used, ...waits]) assert.ok(set.has(ref), `${view} ${name}: ${ref}`)
      }
    }
  })

  test('all it writes gets through the scrub a surface runs before it frames a drawing', () => {
    // DOMPurify as the desktop app sets it up: the attributes of its svg profile plus to and calcMode, none of them a
    // scheme it does not know, and no animation of a link or a handler
    const WRITTEN = new Set(['id', 'attributeName', 'to', 'begin', 'dur', 'fill'])
    const IS_ALLOWED_URI = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i
    for (const view of Object.keys(SVG_VIEWS)) {
      for (const [name, f] of SETS()) {
        const s = beat(f, view)
        for (const t of [...tags(s, 'set'), ...tags(s, 'animateMotion')]) {
          for (const [, key, value] of t.matchAll(/\s([a-zA-Z-]+)="([^"]*)"/g)) {
            assert.ok(WRITTEN.has(key), `${view} ${name}: ${key} in ${t}`)
            if (key !== 'id') assert.match(value, IS_ALLOWED_URI, `${view} ${name}: ${t}`)
          }
          assert.doesNotMatch(attr(t, 'attributeName') ?? '', /href|^on/i)
        }
      }
    }
  })

  test('every change lands on the beat: what the pane repaints, it repaints together', () => {
    for (const view of Object.keys(SVG_VIEWS)) {
      for (const [name, f] of SETS()) {
        const s = beat(f, view)
        for (const t of [...tags(s, 'set'), ...tags(s, 'animateMotion')]) {
          if (!attr(t, 'begin')) continue
          for (const part of attr(t, 'begin').split(';')) {
            const m = /(-?[\d.]+)s$/.exec(part)
            if (m) assert.ok(Math.abs(Number(m[1]) * 4 - Math.round(Number(m[1]) * 4)) < 1e-6, `${view} ${name}: ${t}`)
          }
        }
      }
    }
  })

  test('the same facts give the same string', () => {
    for (const view of Object.keys(SVG_VIEWS)) assert.equal(beat(SAMPLE, view), beat(SAMPLE, view))
  })

  test('the art is the art of the drawing it finishes: the pass never moves an office down the ladder', () => {
    const text = (s) => [...s.matchAll(/>([^<>]+)</g)].map((m) => m[1]).join('|')
    for (const view of Object.keys(SVG_VIEWS)) {
      for (const [name, f] of SETS()) {
        const plain = renderSvg(f, { view, width: 900, card: true, liveClock: true, clockAt: NOW })
        assert.equal(text(beat(f, view)), text(plain), `${view} ${name}`)
        const paths = (s) => tags(s, 'path').length
        assert.equal(paths(beat(f, view)), paths(plain), `${view} ${name}`)
      }
    }
  })

  test('drawn still, nothing changes: no animation to put on a beat', () => {
    const still = onBeat(renderSvg(SAMPLE, { view: 'all', width: 900, card: true, liveClock: true, animate: false }))
    assert.doesNotMatch(still, /<set|<animate/)
  })

  test('the fullest drawings stay within the limit and tick-free at every width', () => {
    const offices = [SAMPLE, clone(stressFacts()), idleFacts()]
    for (const f of offices) {
      for (const width of [480, 657, 960, 1400, 2400]) {
        const s = beat(f, 'all', width)
        assert.ok(s.length <= BEAT_MAX, `@${width}: ${s.length}`)
        assert.doesNotMatch(s, /<animate\b|<animateTransform\b/, `@${width}`)
      }
    }
  })
})
