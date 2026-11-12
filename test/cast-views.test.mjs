// Every character of the cast in every view: a desk of each registered agent id draws without throwing and never as
// Clawd, and the lists that must follow CAST (the voxel site's providers, the typings' agent union) do.
import fs from 'node:fs'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { AGENT_IDS, CAST } from '../plugin/lib/cast.mjs'
import { renderOffice, toPlain } from '../plugin/lib/ascii.mjs'
import { renderSvg, renderTimelapse } from '../plugin/lib/svg.mjs'
import { renderMonthPage } from '../plugin/lib/month-page.mjs'
import { renderTimelapsePage } from '../plugin/lib/timelapse-page.mjs'
import { normalizeVoxelFacts } from '../plugin/lib/voxel-dashboard.mjs'
import { PROVIDERS } from '../site/voxel/data.js'
import { SAMPLE, clone, monthFacts, timelapseFacts, todayFacts } from './helpers/facts.mjs'

/** `f` with every desk, intern and walker of agent `id` (the crew says so too), and a Claude desk when `id` is not Claude. */
function only(f, id) {
  const g = clone(f)
  g.live.desks.forEach((d, i) => { d.agent = id; for (const it of d.interns) it.agent = id; if (i === 0 && id !== 'claude') d.agent = 'claude', d.interns.forEach((it) => { it.agent = 'claude' }) })
  for (const l of g.live.recently_left) l.agent = id
  g.totals.agents = { [id]: 600 }
  g.accounts = [{ agent: id, label: null, minutes: 600, sessions: 5, live: 1 }]
  for (const d of g.timeline?.desks ?? []) d.agent = id
  return g
}
// the figures a drawing places (`<use href="#to-<tag><pose>">`, the timelapse's `#tl-lp-w<tag><look>`), by character tag
const placed = (svg, tag) => [...svg.matchAll(/<use[^>]*href="#(?:to|tl)-([A-Za-z0-9-]+)"/g)].map((m) => m[1]).filter((n) => new RegExp(`^(?:lp-[wz])?${tag}(?:[A-Z]|\\d|$|-f-)`).test(n))

describe('every character in every view', () => {
  for (const id of AGENT_IDS) {
    const { tag } = CAST[id]
    test(`${id}: the pixel art draws it in live, today, week, month and work; Clawd only sits where a Claude desk is`, () => {
      for (const view of ['live', 'today', 'week', 'month', 'work']) {
        const f = view === 'today' ? todayFacts() : view === 'month' ? monthFacts() : SAMPLE
        const svg = renderSvg(only(f, id), { view, width: 1100, animate: false })
        assert.ok(placed(svg, tag).length > 0, `${id} ${view}: its own figure is drawn`)
      }
      // the live floor: the one Claude desk is the only Clawd on a desk (the walkers and interns are the agent's too)
      const live = renderSvg(only(SAMPLE, id), { view: 'live', width: 1100, animate: false })
      assert.ok(id === 'claude' || placed(live, 'c').length <= 2, `${id}: only the Claude desk is Clawd's`)
    })

    test(`${id}: the timelapse and its pages draw it`, () => {
      const f = only(timelapseFacts('week'), id)
      const svg = renderTimelapse(f, { width: 1100, animate: false })
      assert.ok(placed(svg, tag).length > 0, `${id}: timelapse figure`)
      assert.ok(id === 'claude' || placed(svg, 'c').length === 0, `${id}: no Clawd in the replay`)
      assert.ok(renderTimelapsePage({ svg, facts: f, scriptHash: 'x' }).includes('<svg'))
      const m = only(monthFacts(), id)
      assert.ok(renderMonthPage({ svg: renderSvg(m, { view: 'month', width: 1100, animate: false }), room: 'whole', label: 'Oct', name: 'm', scriptHash: 'x' }).includes(CAST[id].name))
    })

    test(`${id}: the text office gives it its own head and name`, () => {
      const live = toPlain(renderOffice(only(SAMPLE, id), { view: 'live', width: 120 }))
      if (id !== 'claude') assert.ok(live.includes(CAST[id].face.front[0]), `${id}: head on the live floor`)
      for (const view of id === 'claude' ? [] : ['today', 'week', 'month']) {
        const txt = toPlain(renderOffice(only(view === 'month' ? monthFacts() : todayFacts(), id), { view, width: 120 }))
        assert.ok(txt.includes(CAST[id].name), `${id}: ${view} names its AI`)
      }
    })
  }

  test('an unknown agent id draws as Clawd, never throws', () => {
    for (const view of ['live', 'today', 'week', 'month', 'work']) {
      const f = clone(SAMPLE)
      f.live.desks.forEach((d) => { d.agent = 'nope' })
      assert.doesNotThrow(() => renderSvg(f, { view, width: 900, animate: false }))
      assert.doesNotThrow(() => renderOffice(f, { view, width: 100 }))
    }
  })
})

describe('lists that follow the cast', () => {
  test('the voxel site knows every character (its crew cards, its fallback name and color)', () => {
    assert.deepEqual(Object.keys(PROVIDERS), AGENT_IDS)
    for (const a of AGENT_IDS) assert.ok(PROVIDERS[a].name === CAST[a].who && PROVIDERS[a].label && /^#[\da-f]{6}$/i.test(PROVIDERS[a].color) && PROVIDERS[a].description, a)
  })

  test('the voxel dashboard carries each agent with its own name and color', () => {
    const f = only(SAMPLE, 'copilot')
    const v = normalizeVoxelFacts(f, { view: 'live' })
    assert.ok(v.agents.some((a) => a.agent === 'copilot' && a.name === 'Copi' && a.color === CAST.copilot.hex.light))
    assert.ok(v.crew.some((c) => c.agent === 'copilot' && c.name === 'Copi'))
  })

  test('the typings name every agent id', () => {
    const src = fs.readFileSync(new URL('../plugin/types/index.d.ts', import.meta.url), 'utf8')
    const union = /export type OfficeAgent = ([^\n]+)/.exec(src)[1].split('|').map((s) => s.trim().replace(/'/g, ''))
    assert.deepEqual(union, AGENT_IDS)
  })
})
