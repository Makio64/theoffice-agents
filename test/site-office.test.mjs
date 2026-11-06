// The site's inhabited floor borrows the plugin's real characters and furniture.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as kit from '../plugin/lib/svg-kit.mjs'
import { deskProps } from '../plugin/lib/svg-live.mjs'
import { deskScene, officeScene } from '../site/office.mjs'

const render = (options) => officeScene(kit, { deskProps, ...options })

function dimensions(svg) {
  const match = /^<svg\b[^>]*width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/.exec(svg)
  assert.ok(match, 'the scene declares its native size')
  return { width: Number(match[1]), height: Number(match[2]), W: Number(match[3]), H: Number(match[4]) }
}

function assertReferencesResolve(svg) {
  const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
  const declared = new Set(ids)
  assert.equal(declared.size, ids.length, 'each sprite and clip has a unique id')
  const refs = [
    ...[...svg.matchAll(/\bhref="#([^"]+)"/g)].map((m) => m[1]),
    ...[...svg.matchAll(/url\(#([^\)]+)\)/g)].map((m) => m[1]),
  ]
  assert.ok(refs.length > 0, 'the scene uses the shared native sprites')
  for (const id of refs) assert.ok(declared.has(id), `the reference to ${id} resolves`)
}

function assertWholeCast(svg) {
  for (const agent of kit.AGENT_IDS) {
    const tag = kit.CAST[agent].tag
    assert.ok(svg.includes(`id="lobby-${tag}-lit"`), `${agent}: the native character body is defined`)
    assert.ok(svg.includes(`href="#lobby-${tag}-lit"`), `${agent}: the native character is used`)
  }
}

test('the inhabited floor retains its agents and native pixel size as desks wrap on narrow screens', () => {
  for (const night of [false, true]) {
    let previousHeight = 0
    for (const width of [1024, 960, 712, 480, 360, 256, 208, 192]) {
      const svg = render({ width, night, animate: false })
      const box = dimensions(svg)
      assert.equal(box.width, width, `${width}: fits the available scene width`)
      assert.equal(box.width / box.W, 2, 'art pixels remain two CSS pixels wide')
      assert.equal(box.height / box.H, 2, 'art pixels remain two CSS pixels tall')
      assert.ok(box.height >= previousHeight, 'narrowing adds floor space instead of shrinking characters')
      previousHeight = box.height
      assert.doesNotMatch(svg, /NaN|Infinity|undefined/, 'geometry and colors are finite')
      assertWholeCast(svg)
      const desks = [...svg.matchAll(/data-office-desk="([^"]+)" transform="translate\((\d+) (\d+)\)"/g)]
      assert.equal(desks.length, 4, 'all working desks remain present')
      for (const [, agent, x, y] of desks) {
        assert.ok(Number(x) + 48 <= box.W, `${agent}: the complete desk fits horizontally`)
        assert.ok(Number(y) + 37 <= box.H, `${agent}: the complete desk fits vertically`)
      }
    }
  }
})

test('native figure frames, accessories and clipping resolve in animated and still scenes', () => {
  for (const night of [false, true]) {
    for (const animate of [false, true]) {
      for (const width of [960, 256]) assertReferencesResolve(render({ width, night, animate }))
    }
  }
})

test('reduced motion removes all SVG animation while keeping the inhabited office', () => {
  for (const night of [false, true]) {
    const svg = render({ width: 256, night, animate: false })
    assert.doesNotMatch(svg, /<(?:animate\w*|set)\b/, 'no SMIL remains active')
    assert.equal([...svg.matchAll(/data-office-walker=/g)].length, 2, 'both walkers have still poses')
    assert.match(svg, /data-office-break\b/, 'the coffee break remains visible')
    assertWholeCast(svg)
  }
})

test('walking agents cross in opposite directions while native work timelines stay animated', () => {
  const svg = render({ width: 960, animate: true })
  const box = dimensions(svg)
  const crossings = [...svg.matchAll(/data-office-walker="[^"]+"[^>]*><animateTransform\b[^>]*values="([^"]+)"/g)]
  assert.equal(crossings.length, 2, 'two independent walks cross the corridor')
  const directions = crossings.map(([, values]) => {
    const xs = values.split(';').map((position) => Number(position.split(' ')[0]))
    assert.ok(Math.min(...xs) < 0 && Math.max(...xs) > box.W, 'a walk enters and exits beyond the scene edges')
    return Math.sign(xs.at(-1) - xs[0])
  })
  assert.deepEqual(directions.sort(), [-1, 1], 'colleagues pass in both directions')
  assert.match(svg, /clip-path="url\(#lobby-fig-clip-p\)"/, 'working agents use native animated figure sheets')
  assert.match(svg, /calcMode="discrete"/, 'motion stays on the pixel grid')
})

test('the LIVE feature shares native desk animation without colliding with the office floor', () => {
  for (const night of [false, true]) {
    for (const animate of [false, true]) {
      const feature = deskScene(kit, { night, animate, deskProps })
      const scene = render({ night, animate })
      assertReferencesResolve(feature + scene)
      assert.match(feature, /href="#feature-rm-desk"/, 'the feature uses the current plugin desk')
      if (animate) assert.match(feature, /<animateTransform\b/, 'the feature shows native motion')
      else assert.doesNotMatch(feature, /<(?:animate\w*|set)\b/, 'the feature honors reduced motion')
    }
  }
})
