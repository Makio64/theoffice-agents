// renderSvg's `transparent` option (svg-kit backdrop/sky/titleBar/ground): every scene drops its sky, the day title
// bar, the ground behind the lines under a building and the root background, so the drawing sits on the page behind
// it; the buildings, the moon or the sun, the sidewalks and the street stay, and the layout does not move a pixel.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SVG_VIEWS, renderSvg } from '../plugin/lib/svg.mjs'
import { K, MAX_SVG } from '../plugin/lib/svg-kit.mjs'
import { SAMPLE, clone, emptyFacts, stressFacts } from './helpers/facts.mjs'

const VIEWS = Object.keys(SVG_VIEWS)
const day = () => {
  const f = clone(SAMPLE)
  f.now = { ...f.now, is_night: false, hour: 14, local_time: '14:05' }
  return f
}
const size = (svg) => /width="(\d+)" height="(\d+)" viewBox="([^"]+)"/.exec(svg).slice(1)
// the backdrop's own markup: the sky's bands (night or day), the day title bar, a ground band from the left edge
const HALO = `<g stroke="${K.plate}" stroke-width="1.2" stroke-linejoin="round" paint-order="stroke">`
const BACKDROP = ['<g fill="currentColor" stroke="currentColor"', 'fill="#0d1328" fill-opacity=".62"', `fill="${K.ground}" d="M0 `]

test('transparent: false (and leaving it out) draws exactly what it always drew', () => {
  for (const view of VIEWS) {
    for (const f of [SAMPLE, day()]) assert.equal(renderSvg(f, { view, transparent: false }), renderSvg(f, { view }), view)
  }
})

test('transparent: no sky, title bar, ground band or root background, in every view, night and day', () => {
  for (const view of VIEWS) {
    for (const [name, f] of [['night', SAMPLE], ['day', day()], ['empty', emptyFacts()], ['stress', stressFacts()]]) {
      const opaque = renderSvg(f, { view, width: 660, minHeight: 1600 })
      const svg = renderSvg(f, { view, width: 660, minHeight: 1600, transparent: true })
      assert.doesNotMatch(svg, /^<svg [^>]*style=/, `${view} ${name}`)
      for (const mark of BACKDROP) assert.ok(!svg.includes(mark), `${view} ${name}: ${mark}`)
      assert.ok(opaque.includes(`fill="${K.ground}" d="M0 `), `${view} ${name}: the opaque drawing has its ground`)
      // same box, same layout: only backdrop went
      assert.deepEqual(size(svg), size(opaque), `${view} ${name}`)
      // (the text on the page gains a dark halo: svg-kit onPage). Shorter but for the halos when both land on one rung of
      // renderSvg's ladder; the room the backdrop leaves may buy the transparent one a richer rung, inside the budget all
      // the same
      assert.ok(svg.length <= MAX_SVG, `${view} ${name}`)
      if (svg.includes('rm-wainsp') === opaque.includes('rm-wainsp') && svg.includes('rf-pigeon') === opaque.includes('rf-pigeon') &&
        /rm-(damask|regency|dots|lattice)p/.test(svg) === /rm-(damask|regency|dots|lattice)p/.test(opaque) &&
        (svg.match(/href="#to-wk-/g) ?? []).length === (opaque.match(/href="#to-wk-/g) ?? []).length) {
        assert.ok(svg.replaceAll(HALO, '<g>').length < opaque.length, `${view} ${name}: shorter on the same rung`)
      }
      // the things stay: the brick shell, the sidewalk, the moon or the sun, the street's metro (under a short drawing)
      assert.match(svg, /brick\)"/, `${view} ${name}`)
      assert.ok(svg.includes(`fill="${K.walk}"`), `${view} ${name}`)
      assert.match(svg, name === 'day' ? /href="#to-sun(?:-s)?"/ : /href="#to-moon(?:-s)?"/, `${view} ${name}`)
      const metro = 'type="translate" values="-100 0;'
      assert.equal(svg.includes(metro), opaque.includes(metro), `${view} ${name}`)
    }
  }
})

test('transparent: the stars stay, at half opacity', () => {
  const svg = renderSvg(SAMPLE, { view: 'live', transparent: true })
  assert.ok(svg.includes(`<g opacity=".5"><path fill="${K.star}"`))
  assert.ok(!renderSvg(SAMPLE, { view: 'live' }).includes('<g opacity=".5">'))
})
