// The site crops the app's drawings at their native pixel size, so narrow rooms become more floors.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderSvg } from '../plugin/lib/svg.mjs'
import * as kit from '../plugin/lib/svg-kit.mjs'
import { EDGE, pictureParts } from '../site/pictures.mjs'
import { SAMPLE, clone, monthFacts, todayFacts } from './helpers/facts.mjs'

const { rooms, ground } = pictureParts(kit)
const WIDTHS = [1088, 768, 480, 376]

function dimensions(svg) {
  const match = /^<svg\b[^>]*width="(\d+)" height="(\d+)" viewBox="([\d. ]+)"/.exec(svg)
  assert.ok(match, 'a cropped drawing has explicit dimensions and a viewBox')
  const [x, y, w, h] = match[3].split(' ').map(Number)
  return { width: Number(match[1]), height: Number(match[2]), x, y, w, h }
}

function assertNativeSize(svg, width, label) {
  const box = dimensions(svg)
  assert.equal(box.width, width, `${label}: fits the available width`)
  assert.equal(box.width / box.w, 2, `${label}: each art pixel stays two CSS pixels wide`)
  assert.equal(box.height / box.h, 2, `${label}: each art pixel stays two CSS pixels tall`)
  assert.ok(box.h > 0, `${label}: the crop contains artwork`)
  assert.doesNotMatch(svg, /NaN|Infinity/, `${label}: finite geometry`)
  return box
}

test('narrow live previews add floors while retaining every named desk at the native pixel size', () => {
  const facts = clone(SAMPLE)
  // Keep all ten sample desks seated, with short distinct titles, so no kitchen or meeting changes the comparison.
  facts.live.desks = facts.live.desks.map((desk, i) => ({
    ...desk, id: `named${i}`, title: `Test desk ${i}`, state: 'working', status: 'busy', idle_reason: null,
    interns: [], meetings: [], activity: { kind: 'coding', tool: 'Edit', label: 'Editing code', since: facts.now.iso },
  }))
  const heights = WIDTHS.map((width) => {
    const picture = rooms(renderSvg(facts, { view: 'live', width: width + EDGE * 4, animate: false }), 'office')
    const box = assertNativeSize(picture, width, `live@${width}`)
    for (const desk of facts.live.desks) assert.ok(picture.includes(desk.title), `${width}: retains ${desk.title}`)
    return box.height
  })
  for (let i = 1; i < heights.length; i++) assert.ok(heights[i] >= heights[i - 1], 'narrowing never removes floor space')
  assert.ok(heights.at(-1) > heights[0], 'the mobile preview grows vertically instead of shrinking its desks')
})

test('all preview views retain native pixel dimensions in both skies', () => {
  const views = { office: clone(SAMPLE), today: todayFacts(), week: clone(SAMPLE), month: monthFacts(), work: clone(SAMPLE) }
  for (const night of [false, true]) {
    for (const [name, base] of Object.entries(views)) {
      const facts = clone(base)
      facts.now = { ...facts.now, is_night: night, hour: night ? 1 : 14, local_time: night ? '01:40' : '14:05' }
      for (const width of WIDTHS) {
        const view = name === 'office' ? 'live' : name
        const picture = rooms(renderSvg(facts, { view, width: width + EDGE * 4, animate: false }), name)
        const box = assertNativeSize(picture, width, `${night ? 'night' : 'day'} ${name}@${width}`)
        assert.equal(box.x, EDGE, 'only the outer margin is removed from either side')
        assert.equal(box.y, kit.SKY + 5, 'the rooms begin below the shared roof')
        // a floor that stands on the Office's street front in the app (the live office, the week's tower, the month)
        // comes without it, 56 rows over its sidewalk: the site's building has one lobby, its own
        if (['office', 'week', 'month'].includes(name)) {
          const walk = Number(new RegExp(`<path fill="${kit.K.walk}" d="M0 (\\d+)h`).exec(picture)[1])
          assert.equal(box.y + box.h, walk - 56, `${name}@${width}: the rooms end over the street front`)
          assert.match(picture, /-fr-(?:shop|lamp)/, `${name}@${width}: which the drawing itself stands on`)
        }
      }
    }
  }
})

test('the entrance and subway follow the responsive tower width without shrinking the entrance', () => {
  for (const night of [false, true]) {
    const facts = clone(SAMPLE)
    facts.now = { ...facts.now, is_night: night, hour: night ? 1 : 14 }
    for (const width of WIDTHS) {
      const parts = ground(renderSvg(facts, { view: 'week', width: width + EDGE * 4, animate: false }))
      assert.ok(parts, `${width}: the week drawing includes its street and commits line`)
      const front = assertNativeSize(parts.front, width, `front@${width}`)
      assert.equal(front.height, 112, 'the entrance keeps its full-height pixel art on mobile')
      assertNativeSize(parts.subway, width, `subway@${width}`)
    }
  }
})
