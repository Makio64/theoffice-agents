// renderSvg's and renderTimelapse's `card` option (svg.mjs rootSvg): the drawing clipped to rounded corners over its
// ground, a hairline edge of light just inside them and no root background, so the desktop pane shows a card that
// ends by design where a transparent drawing's street ran into the pane's gutter. The box and the layout stay.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SVG_VIEWS, renderSvg, renderTimelapse } from '../plugin/lib/svg.mjs'
import { K, MAX_SVG } from '../plugin/lib/svg-kit.mjs'
import { SAMPLE, clone, emptyFacts, stressFacts, timelapseFacts } from './helpers/facts.mjs'

const VIEWS = Object.keys(SVG_VIEWS)
const day = () => {
  const f = clone(SAMPLE)
  f.now = { ...f.now, is_night: false, hour: 14, local_time: '14:05' }
  return f
}
const size = (svg) => /width="(\d+)" height="(\d+)" viewBox="([^"]+)"/.exec(svg).slice(1)
const body = (svg) => svg.slice(svg.indexOf('</defs>') + '</defs>'.length, -'</svg>'.length)
// the hairline edge, last in the drawing: half an art unit (1 CSS px) of light just inside the rounded corners
const EDGE = /<rect x="0\.25" y="0\.25" width="[\d.]+" height="[\d.]+" rx="6\.75" fill="none" stroke="#fff" stroke-opacity="0\.2" stroke-width="0\.5" shape-rendering="geometricPrecision"\/><\/svg>$/

test('card: false (and leaving it out) draws exactly what it always drew', () => {
  for (const view of VIEWS) assert.equal(renderSvg(SAMPLE, { view, card: false }), renderSvg(SAMPLE, { view }), view)
  const lapse = timelapseFacts('week')
  assert.equal(renderTimelapse(lapse, { card: false }), renderTimelapse(lapse))
  assert.ok(!renderSvg(SAMPLE).includes('-card'))
})

test('card: the scene clipped to rounded corners over its ground, a hairline edge, no root background, in every view', () => {
  for (const view of VIEWS) {
    for (const [name, f] of [['night', SAMPLE], ['day', day()], ['empty', emptyFacts()], ['stress', stressFacts()]]) {
      const plain = renderSvg(f, { view, width: 660 })
      const svg = renderSvg(f, { view, width: 660, card: true })
      const [, , viewBox] = size(svg)
      const [, , W, H] = viewBox.split(' ')
      assert.doesNotMatch(svg, /^<svg [^>]*style=/, `${view} ${name}: the corners are the page's`)
      assert.deepEqual(size(svg), size(plain), `${view} ${name}: the same box`)
      assert.ok(svg.includes(`<clipPath id="to-card"><rect width="${W}" height="${H}" rx="7" shape-rendering="geometricPrecision"/></clipPath></defs>`), `${view} ${name}`)
      assert.ok(body(svg).startsWith(`<g clip-path="url(#to-card)"><rect width="${W}" height="${H}" fill="${K.ground}"/>`), `${view} ${name}`)
      assert.match(svg, EDGE, `${view} ${name}`)
      assert.ok(svg.length <= MAX_SVG, `${view} ${name}: ${svg.length}`)
      // the scene inside is the one the plain drawing has (a drawing near the budget may take its next rung down)
      if (name === 'night' || name === 'day') assert.ok(svg.includes(body(plain)), `${view} ${name}: the same scene`)
    }
  }
})

test('card on the pane: its own sky, the live clocks, the same string for the same facts and moment', () => {
  const opts = { view: 'all', width: 657, card: true, liveClock: true, clockAt: Date.parse(SAMPLE.now.iso) }
  const svg = renderSvg(SAMPLE, opts)
  assert.equal(renderSvg(SAMPLE, opts), svg)
  assert.ok(body(svg).includes(body(renderSvg(SAMPLE, { ...opts, card: false }))))
  // transparent and a card: the corners and the edge, nothing painted behind the scene
  const bare = renderSvg(SAMPLE, { ...opts, transparent: true })
  assert.match(body(bare), /^<g clip-path="url\(#to-card\)"><(?!rect width="\d+" height="\d+" fill=")/)
  assert.match(bare, EDGE)
})

test('card: the timelapse too, its replay data kept on the root', () => {
  for (const kind of ['yesterday', 'week', 'month']) {
    const f = timelapseFacts(kind)
    const plain = renderTimelapse(f, { width: 900 })
    const svg = renderTimelapse(f, { width: 900, card: true })
    assert.deepEqual(size(svg), size(plain), kind)
    assert.doesNotMatch(svg, /^<svg [^>]*style=/, kind)
    for (const attr of ['data-timelapse', 'data-loop', 'data-slots', 'data-slot-seconds', 'data-hold']) {
      assert.equal(new RegExp(`^<svg [^>]*${attr}="([^"]+)"`).exec(svg)?.[1], new RegExp(`^<svg [^>]*${attr}="([^"]+)"`).exec(plain)?.[1], `${kind} ${attr}`)
    }
    assert.ok(svg.includes('<clipPath id="tl-card">'), kind)
    assert.ok(body(svg).startsWith('<g clip-path="url(#tl-card)">'), kind)
    assert.match(svg, EDGE, kind)
    assert.ok(svg.length <= MAX_SVG, `${kind}: ${svg.length}`)
  }
})

test('scale (the pane\'s Zoom key): the same width in fewer, bigger art pixels, every view and the replay; its box the width asked, taller', () => {
  const box = (s) => /^<svg [^>]*width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/.exec(s).slice(1).map(Number)
  for (const view of [...Object.keys(SVG_VIEWS), 'timelapse']) {
    const draw = (scale) => (view === 'timelapse' ? renderTimelapse(timelapseFacts(), { width: 720, card: true, scale }) : renderSvg(SAMPLE, { view, width: 720, card: true, scale }))
    const [pw, ph, pW] = box(draw(undefined))
    const zoomed = draw(2.5)
    const [zw, zh, zW, zH] = box(zoomed)
    assert.deepEqual([pw, zw], [720, 720], view)
    assert.deepEqual([pW, zW], [360, 288], `${view}: 2.5 px a pixel`)
    assert.equal(zh, Math.round(zH * 2.5), view)
    assert.ok(zh > ph * 1.05, `${view}: taller (${ph} → ${zh})`)
    assert.ok(zoomed.length <= MAX_SVG, view)
  }
  // never finer than 2 px a pixel nor coarser than 4; a pane too narrow for the zoom keeps its 200 art pixels
  assert.equal(box(renderSvg(SAMPLE, { width: 720, scale: 1 }))[2], 360)
  assert.equal(box(renderSvg(SAMPLE, { width: 2000, scale: 9 }))[2], 500)
  assert.equal(box(renderSvg(SAMPLE, { width: 320, scale: 2.5 }))[2], 200)
})
