// The finer art (svg-kit fine, ctx.fine): what every rung of renderSvg's ladder tries first. The street front and the
// kitchen's and the meeting room's furniture shaded and on their shadows, in the plain art's sprites and places; every
// figure of the cast made of the shared lit parts the live floors' figures are made of. A drawing with no room for it
// wears the plain art, which is what every sprite draws without ctx.fine.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { renderSvg } from '../plugin/lib/svg.mjs'
import { frontage } from '../plugin/lib/svg-live.mjs'
import { AGENT_IDS, CAST, FIGURE_LIGHT, MAX_SVG, POSES, defsMarkup, fine, use } from '../plugin/lib/svg-kit.mjs'
import { SAMPLE, clone, stressFacts } from './helpers/facts.mjs'

// a drawing's context as the ladder makes it, in the finer art (1), the plain one (0) or off the ladder (undefined)
const ctxOf = (f, extra = {}) => ({
  id: 'to-', defs: new Map(), animate: true, night: false, caps: { art: 0, dress: true }, brick: false, W: 480, color: () => '#7fd6e8', f: {}, desks: [{}],
  ...(f === undefined ? {} : { fine: f }), ...extra,
})
// a sprite's own markup, and the <defs> a drawing of it alone needs
const drawn = (c, name) => {
  use(c, name)
  return { own: c.defs.get(name), defs: defsMarkup(c) }
}
const day = (f) => {
  const g = clone(f)
  g.now = { ...g.now, is_night: false, hour: 14, local_time: '14:05' }
  return g
}
const uses = (markup, name) => [...markup.matchAll(new RegExp(`<use href="#to-${name}" x="(-?\\d+)" y="(-?\\d+)"`, 'g'))].map((m) => `${m[1]},${m[2]}`)

describe('the finer art (ctx.fine)', () => {
  test('fine() is on only where the ladder asks for it: off for a rung\'s plain twin and for a drawing off the ladder', () => {
    assert.equal(fine({ fine: 1 }), true)
    assert.equal(fine({ fine: 0 }), false)
    assert.equal(fine({}), false)
    assert.equal(fine(undefined), false)
  })

  test('a drawing with room for it wears it, by day and by night, inside the budget', () => {
    // the sample's first desks and the two on a break: a floor, a kitchen, and room to spare
    const small = clone(SAMPLE)
    small.live.desks = [...small.live.desks.filter((d) => !d.meetings?.length).slice(0, 4), ...small.live.desks.filter((d) => d.meetings?.length).slice(0, 1)]
    for (const f of [small, day(small)]) {
      for (const width of [660, 960]) {
        const svg = renderSvg(f, { view: 'all', width })
        const at = `${f.now.is_night ? 'night' : 'day'} @${width}`
        assert.ok(svg.length <= MAX_SVG, `${at}: ${svg.length}`)
        // the front in panes and leaves, a box ball either side of the door
        assert.match(svg, /<g id="to-fr-pane[ND]?">/, at)
        assert.match(svg, /<g id="to-fr-leaf[ND]?">/, at)
        assert.equal(uses(svg, 'fr-box').length, 2, at)
        // the furniture of the rooms it has, in their light; the walkers their characters' lit bodies
        if (svg.includes('>KITCHEN<')) assert.match(svg, /<g id="to-rm-cooler">/, at)
        assert.match(svg, /<g id="to-rm-board">/, at)
        assert.match(svg, /<g id="to-cW[rl]">(?:<path [^>]*\/>)?<use href="#to-c-lit"\/>/, at)
      }
    }
  })

  test('a drawing near its budget wears one art or the other whole, never a mix, and stays inside the budget', () => {
    for (const f of [SAMPLE, day(SAMPLE)]) {
      for (const width of [480, 660, 960]) {
        const svg = renderSvg(f, { view: 'all', width })
        const at = `${f.now.is_night ? 'night' : 'day'} @${width}`
        assert.ok(svg.length <= MAX_SVG, `${at}: ${svg.length}`)
        const rich = /<g id="to-fr-pane[ND]?">/.test(svg)
        assert.equal(uses(svg, 'fr-box').length === 2, rich, at)
        assert.equal(/<g id="to-cW[rl]">(?:<path [^>]*\/>)?<use href="#to-c-lit"\/>/.test(svg), rich, at)
        assert.equal(/<g id="to-(?:rm-cooler|rm-board|rm-counter|rm-seat)">/.test(svg), rich && /KITCHEN|MEETING ROOM/.test(svg), at)
      }
    }
  })

  test('the finer front stands where the plain one does: the same windows and lamps, sprite for sprite', () => {
    for (const night of [false, true]) {
      for (const [W, IX0, IX1] of [[240, 20, 230], [330, 20, 320], [480, 20, 470]]) {
        const [plain, rich] = [0, 1].map((f) => frontage(ctxOf(f, { W, night }), 100, 56, IX0, IX1))
        for (const name of night ? ['fr-shopN', 'fr-lampN'] : ['fr-shop', 'fr-lamp']) {
          assert.deepEqual(uses(rich.facade + rich.street, name), uses(plain.facade + plain.street, name), `${name} @${W}`)
          assert.ok(uses(plain.facade + plain.street, name).length >= 2, `${name} @${W}`)
        }
        // the windows lead the facade and the lamps the street, as the promo reads them
        assert.match(rich.facade, /^<use href="#to-fr-shopN?"/, `@${W}`)
        assert.match(rich.street, /^<use href="#to-fr-lampN?"/, `@${W}`)
      }
    }
  })

  test('the plain art is the sprites\' own without ctx.fine: no pane, no leaf, a body painted in every pose', () => {
    for (const c of [ctxOf(0), ctxOf(undefined)]) {
      const win = drawn(c, 'fr-shop')
      assert.doesNotMatch(win.defs, /fr-pane/)
      const walker = drawn(c, 'cWr')
      assert.doesNotMatch(walker.defs, /c-lit|c-walk/)
      assert.ok(walker.own.includes(`fill="${CAST.claude.hex.dark}"`), 'its body painted in the sprite')
    }
    assert.equal(drawn(ctxOf(0), 'fr-shop').defs, drawn(ctxOf(undefined), 'fr-shop').defs)
    assert.equal(drawn(ctxOf(0), 'lv-shelf').defs, drawn(ctxOf(undefined), 'lv-shelf').defs)
  })

  test('in the finer art every pose of every character is its shared lit body, the cast\'s arms and eyes', () => {
    for (const a of AGENT_IDS) {
      const { tag } = CAST[a]
      for (const [p, o] of Object.entries(POSES)) {
        const { own } = drawn(ctxOf(1), `${tag}${p}`)
        // asleep it sits in the dark of its screen; its body is drawn once, in its own sprite
        assert.match(own, new RegExp(`<use href="#to-${tag}-${o.shut ? 'dim' : 'lit'}"`), `${tag}${p}`)
        assert.equal((own.match(/<use href="#to-arm-/g) ?? []).length, 2, `${tag}${p}: two arms`)
        assert.match(own, /<use href="#to-eye\d+-/, `${tag}${p}: the cast's eyes`)
        assert.equal(/<use href="#to-[a-z]+-(?:walk|legs)"/.test(own), Boolean(o.legs), `${tag}${p}: legs only when it stands`)
      }
      // a walker stands on its shadow on the sidewalk; a figure at a desk does not
      assert.match(drawn(ctxOf(1), `${tag}Wr`).own, /^<path fill="#000" fill-opacity=".3" d="M5 15h18v1h-18z"\/>/)
      assert.doesNotMatch(drawn(ctxOf(1), `${tag}T0`).own, /fill="#000" fill-opacity=".3"/)
    }
    // typing hands run the cast's shared rhythms; a still drawing has none
    assert.match(drawn(ctxOf(1), 'cT0').own, /arm-out0A.*arm-out1A/)
    assert.match(drawn(ctxOf(1), 'cT1').own, /arm-out0B.*arm-out1B/)
    assert.doesNotMatch(drawn(ctxOf(1, { animate: false }), 'cT0').defs, /<animate/)
  })

  test('a replay keeps the day\'s light on its figures, whatever the hour of its facts', () => {
    const rim = FIGURE_LIGHT.night.rim.split('/')[0]
    assert.ok(drawn(ctxOf(1, { night: true }), 'cL').defs.includes(rim), 'a night drawing: the screen\'s rim')
    assert.ok(!drawn(ctxOf(1, { night: true, view: 'timelapse' }), 'cL').defs.includes(rim), 'a replay: none')
  })

  test('a crowded office stays inside the budget whichever art it ends in', () => {
    const f = stressFacts()
    for (const width of [480, 960]) {
      const svg = renderSvg(f, { view: 'all', width })
      assert.ok(svg.length <= MAX_SVG, `@${width}: ${svg.length}`)
      // one art or the other, never both fronts
      assert.equal(/<g id="to-fr-pane[ND]?">/.test(svg), uses(svg, 'fr-box').length === 2, `@${width}`)
    }
  })
})
