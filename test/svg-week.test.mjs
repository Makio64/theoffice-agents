// The week tower (lib/svg-week.mjs): one floor per project, each one row: its sign (the floor's number fused to its
// nameplate in the project's color, under it the tally: the tube of its share, its agent-time, its commits), then
// seven windows lit by each day's agent-time with its agents at their monitors inside and the day's hours on the
// transom (the floor's best day on a gold tag); the cards over the floors (the week's and each day's, their big figures
// in pixel type), the key under them, the quiet projects in storage, the night over the brick and the life on the
// facade, the neon sign on the roof of the shared header, and the budget ladder when it gets less room.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { renderSvg } from '../plugin/lib/svg.mjs'
import { FLOOR_H, GLOW, floorStyle, glowLevel, sceneWeek } from '../plugin/lib/svg-week.mjs'
import { MAX_SVG, SPRITE_CLASHES, defsMarkup, ms, palette, sane, textW } from '../plugin/lib/svg-kit.mjs'
import { deskClass } from '../plugin/lib/model.mjs'
import { fmtHours, fmtInt } from '../plugin/lib/format.mjs'
import { SAMPLE, clone, emptyFacts, stressFacts } from './helpers/facts.mjs'

// ---------------------------------------------------------------- fixtures

const HOSTILE = '<script>alert(1)</script> & "x"'

// The shape of a real week: sixteen projects (four past the twelve floors, the last ones with no agent-time at all but a
// commit or two), a long camel-case name, nineteen desks open tonight over three floors, a quiet start of the week.
function realShaped() {
  const f = clone(SAMPLE)
  f.now = { ...f.now, is_night: true, hour: 22, local_time: '22:18' }
  const extra = ['ProjectOptimizerReport', 'repo_js_map', 'notes', 'scratchpad'].map((name, i) => ({
    ...clone(f.projects[11]), name, agent_minutes: 0, commits: i + 1, sessions: 0,
    per_day: Object.fromEntries(Object.keys(f.projects[11].per_day).map((d) => [d, { minutes: 0, sessions: 0, subagents: 0, commits: 0 }])),
  }))
  f.projects.push(...extra)
  f.projects_more = 0
  const base = f.live.desks
  f.live.desks = Array.from({ length: 19 }, (_, i) => ({ ...clone(base[i % base.length]), id: `r${i}`, project: f.projects[[0, 1, 2][i % 3]].name }))
  return f
}

const day = (f) => {
  f.now = { ...f.now, is_night: false, hour: 14, local_time: '14:05' }
  return f
}
const SETS = () => [['sample', clone(SAMPLE)], ['real-shaped', realShaped()], ['empty', emptyFacts()], ['stress', stressFacts()]]

// Balanced tags, quoted attributes, no raw `<` or bare `&` in text: the first problem, or ''.
function xmlProblem(src) {
  const stack = []
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|([^<]+)|(<)/g
  let m
  while ((m = re.exec(src))) {
    if (m[6]) return `stray < at ${m.index}`
    if (m[5] != null) {
      if (/&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/i.test(m[5])) return `bare & near ${m.index}`
      continue
    }
    if (m[1]) {
      if (stack.pop() !== m[2]) return `</${m[2]}> unbalanced at ${m.index}`
    } else if (!m[4]) stack.push(m[2])
  }
  return stack.length ? `unclosed <${stack.at(-1)}>` : ''
}

function unsafe(src) {
  const s = src.replace(' xmlns="http://www.w3.org/2000/svg"', '')
  return [/<script/i, /<foreignObject/i, /\son[a-z]+\s*=/i, /\b(?:href|xlink:href|src)\s*=\s*(?!["']?#)/i, /url\(\s*(?!["']?#)/i]
    .filter((re) => re.test(s)).map(String)
}

const texts = (svg) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1])

// A drawing context as renderSvg builds it, to call the scene itself (its options are not reachable through renderSvg).
function ctxOf(facts, { width = 660, view = 'week', animate = false, level = 0 } = {}) {
  const f = sane(facts)
  const now = ms(f.now?.iso)
  const caps = [{ level: 0, desks: 24, meetings: 3, floors: 12 }, { level: 1, desks: 14, meetings: 2, floors: 8 }, { level: 2, desks: 6, meetings: 1, floors: 4 }][level]
  return {
    f, W: width / 2, px: width, animate, id: 'to-', now, night: Boolean(f.now?.is_night), color: palette(f), view, caps,
    desks: f.live.desks.map((d) => ({ ...d, cls: deskClass(d, now) })), defs: new Map(), brick: false, minHeight: 0, transparent: false,
  }
}

// The floor groups of a drawing, top floor first: { y, color, body } (body: the group's markup).
const floors = (svg) => [...svg.matchAll(/<g transform="translate\(0 (\d+)\)" color="([^"]+)">(.*?)<\/g>(?=<g transform="translate\(0 |<path)/gs)]
  .map((m) => ({ y: Number(m[1]), color: m[2], body: m[3] }))
// The window sprites of a floor group: the light level of each bay ('1'-'4' lit, '0' shut by night, 'd' shut by day)
// and its awning's code.
const windows = (body) => [...body.matchAll(/href="#to-tw-w([0-4d])(\d)"/g)].map((m) => ({ lv: m[1], code: m[2] }))
// A sprite's drawing in <defs>, up to the next sprite's.
const defOf = (svg, id) => {
  const at = svg.indexOf(`<g id="${id}">`)
  return at < 0 ? null : svg.slice(at, svg.indexOf('<g id="to-', at + 1) < 0 ? svg.indexOf('</defs>', at) : svg.indexOf('<g id="to-', at + 1))
}
// The names in the floors' tooltips, in order (their nameplates may cut them short).
const plates = (svg) => [...svg.matchAll(/<path fill-opacity="0" d="[^"]+"><title>(.*?) · [^<]*? agent-time · /g)].map((m) => m[1])
// The texts of the group whose opening tag matches `open` (a regex source), in order.
const groupTexts = (svg, open) => {
  const m = new RegExp(open).exec(svg)
  return m ? texts(svg.slice(m.index, svg.indexOf('</g>', m.index))) : []
}
// What the nameplates and the floor numbers say, top floor first: the names in dark bold type (a long one on two
// lines), the numbers in dim type.
const nameplates = (svg) => groupTexts(svg, '<g font-size="[\\d.]+" font-weight="bold" fill="#16110d">')
const floorNumbers = (svg) => groupTexts(svg, '<g font-size="4.5" fill="#a4977c" text-anchor="middle">')
// The tally column: each floor's agent-time, then the commits of the floors that have any.
const totals = (svg) => groupTexts(svg, '<g font-size="7" font-weight="bold" fill="#d8c9ac" text-anchor="end">')
const commitCounts = (svg) => groupTexts(svg, '<g font-size="4.5" fill="#8fae66" text-anchor="end">')
// The days' hours printed on the transoms, by ink: { ink: [labels] }.
function printed(svg) {
  const at = svg.indexOf('<g font-size="4.5" font-weight="bold" text-anchor="middle"><g fill=')
  if (at < 0) return {}
  const block = svg.slice(at, svg.indexOf('</g></g>', at) + 8)
  return Object.fromEntries([...block.matchAll(/<g fill="(#[0-9a-f]{6})">(.*?)<\/g>/g)].map((m) => [m[1], texts(m[2])]))
}
// The floors' best days, on their gold tags.
const goldTags = (svg) => groupTexts(svg, '<g font-size="4.5" font-weight="bold" fill="#3a2a20" text-anchor="middle">')
// The pixel figures, row by row, read left to right as words (a gap wider than a figure's advance starts a new one).
const FIG_CH = { dt: '.', md: '·' }
function figureRows(svg) {
  const rows = new Map()
  for (const m of svg.matchAll(/<use href="#to-tw-fig(\w+)"(?: x="([\d.-]+)")?(?: y="([\d.-]+)")?\/>/g)) {
    const y = Number(m[3] ?? 0)
    if (!rows.has(y)) rows.set(y, [])
    rows.get(y).push({ x: Number(m[2] ?? 0), ch: FIG_CH[m[1]] ?? m[1] })
  }
  return [...rows.values()].map((glyphs) => {
    glyphs.sort((a, b) => a.x - b.x)
    const words = []
    let last = -Infinity
    for (const g of glyphs) {
      if (g.x - last > 8) words.push('')
      words[words.length - 1] += g.ch
      last = g.x
    }
    return words
  })
}
const lum = (h) => [1, 3, 5].reduce((a, i) => a + parseInt(h.slice(i, i + 2), 16), 0)

// ---------------------------------------------------------------- the scene

describe('week tower (svg-week.mjs)', () => {
  test('renders sample, real-shaped, empty and stress facts at 480/660/960, night and day: safe, well-formed, under budget', () => {
    for (const [label, facts] of SETS()) {
      for (const f of [facts, day(clone(facts))]) {
        for (const width of [480, 660, 960]) {
          for (const animate of [true, false]) {
            const at = `${label}@${width}${f.now.is_night ? '' : ' day'}${animate ? '' : ' static'}`
            const svg = renderSvg(f, { view: 'week', width, animate })
            assert.equal(xmlProblem(svg), '', at)
            assert.deepEqual(unsafe(svg), [], at)
            // the tower (its lit rooms and their seats, each worked day's hours, the signs, the cards and the key), the
            // commits line under it, and over it the rooftop sign, its neon and the skyline: about 80 000 at the most
            assert.ok(svg.length <= 100_000, `${at}: ${svg.length}`)
            if (!animate) assert.doesNotMatch(svg, /<animate|<set\b/, at)
            for (const ref of svg.matchAll(/href="#([^"]+)"/g)) assert.ok(svg.includes(`id="${ref[1]}"`), `${at}: dangling #${ref[1]}`)
            const all = renderSvg(f, { view: 'all', width, animate })
            assert.ok(all.length <= MAX_SVG, `${at} all: ${all.length}`)
          }
        }
      }
    }
    assert.deepEqual(SPRITE_CLASHES, [])
  })

  test('one floor per project, busiest on top, twelve at most, the rest in storage with their agent-time', () => {
    const f = realShaped()
    const svg = renderSvg(f, { view: 'week', width: 660, animate: false })
    const fl = floors(svg)
    assert.equal(fl.length, 12)
    for (let i = 1; i < fl.length; i++) assert.equal(fl[i].y - fl[i - 1].y, FLOOR_H, 'floors stacked without a gap')
    // the floors in order, the floor numbers counting down to 1F
    assert.deepEqual(plates(svg), f.projects.slice(0, 12).map((p) => p.name))
    for (let n = 1; n <= 12; n++) assert.ok(svg.includes(`>${n}F<`), `${n}F`)
    assert.ok(!svg.includes('>13F<'))
    assert.ok(svg.includes('>+4 more in storage<'), 'four projects without a floor, no agent-time among them')
    assert.ok(svg.includes('fill="#1c1611"'), 'with its ground, the storage is a cellar under the street')
    // on the page (no ground) the storage is a line of text, never a dark box floating under the commits line
    const onPage = renderSvg(f, { view: 'week', width: 660, animate: false, transparent: true })
    assert.ok(onPage.includes('>+4 more in storage<'))
    assert.ok(!onPage.includes('fill="#1c1611"') && !onPage.includes('#to-crate'), 'no cellar box, no crates')
    // each floor in its project's color
    const color = palette(sane(f))
    assert.deepEqual(fl.map((x) => x.color), f.projects.slice(0, 12).map((p) => color(p.name)))
    // under the street, the commits line and the storage: no directory board repeating the tower
    assert.ok(svg.includes('<title>Commits line'))
    assert.doesNotMatch(svg, />tenant</)
  })

  test('every number comes from the facts: the tally’s agent-time and commits, each worked day’s hours, the cards', () => {
    for (const f of [clone(SAMPLE), realShaped(), stressFacts()]) {
      const svg = renderSvg(f, { view: 'week', width: 660, animate: false })
      const shown = f.projects.slice(0, 12)
      assert.deepEqual(totals(svg), shown.map((p) => (p.agent_minutes ? fmtHours(p.agent_minutes) : '·')))
      assert.deepEqual(commitCounts(svg), shown.filter((p) => Number(p.commits) > 0).map((p) => fmtInt(p.commits)))
      // every worked day of every floor shows its hours: on its transom, or the floor's best on its gold tag
      const onGlass = Object.values(printed(svg)).flat()
      const gold = goldTags(svg)
      // a gold tag on every floor that worked (two when its best day came twice)
      assert.ok(gold.length >= shown.filter((p) => Number(p.agent_minutes) > 0).length, 'a gold tag a floor')
      const worked = shown.flatMap((p) => f.range.days.map((d) => Number(p.per_day?.[d]?.minutes) || 0)).filter((m) => m > 0)
      assert.equal(onGlass.length + gold.length, worked.length, 'a label for every worked day')
      for (const label of [...onGlass, ...gold]) assert.match(label, /^(\d+(\.\d)?h?|\d+m|\.\d)$/, label)
      // the cards: each day's hours in type, the week's agent-time and each date in pixel figures, in the cards' order
      const t = texts(svg)
      for (const d of f.range.days) {
        const m = Number(f.per_day[d]?.minutes) || 0
        if (m) assert.ok(t.includes(fmtHours(m)), `${d}: ${fmtHours(m)}`)
      }
      const am = Number(f.totals?.agent_minutes) || 0
      assert.ok(figureRows(svg).some((w) => w.join(' ') === [am ? fmtHours(am) : '·', ...f.range.days.map((d) => String(Number(d.slice(8))))].join(' ')),
        JSON.stringify(figureRows(svg)))
      // the cards' tooltip says each day in words
      assert.match(svg, /<title>agent-time per day, all floors: Tu 20 [^<]* · Mo 26 [^<]*<\/title>/)
    }
  })

  test('each window is lit by its day: the level from the minutes, Clawds for the sessions, dark glass when idle', () => {
    const f = clone(SAMPLE)
    const svg = renderSvg(f, { view: 'week', width: 660, animate: false })
    const fl = floors(svg)
    const days = f.range.days
    const max = Math.max(...f.projects.slice(0, 12).flatMap((p) => days.map((d) => p.per_day[d]?.minutes ?? 0)))
    const today = f.now.local_date
    f.projects.slice(0, 12).forEach((p, i) => {
      const live = f.live.desks.some((d) => d.project === p.name)
      const w = windows(fl[i].body)
      assert.equal(w.length, 7, p.name)
      days.forEach((d, j) => {
        const lv = glowLevel(p.per_day[d]?.minutes ?? 0, max)
        if (d === today && live) assert.ok(Number(w[j].lv) >= Math.max(1, lv), `${p.name} ${d}: today's window lit while someone is in`)
        else assert.equal(w[j].lv, String(lv), `${p.name} ${d}`)
      })
      assert.ok(w.every((x) => x.code === floorStyle(p.name).code), `${p.name}: one style per floor`)
    })
    // the glow climbs from dark glass to a warm light
    for (let i = 1; i < GLOW.length; i++) assert.ok(lum(GLOW[i]) > lum(GLOW[i - 1]), `GLOW[${i}]`)
    // a lit day seats one agent per session at a monitor, as many as the window holds
    const seats = [...fl[0].body.matchAll(/href="#to-tw-r(\d)[a-z]-/g)].map((m) => Number(m[1]))
    assert.ok(seats.length > 0 && seats.every((k) => k >= 1 && k <= 2))
    // by day a dark window is a dusky pane, not the night glass
    const dsvg = renderSvg(day(clone(SAMPLE)), { view: 'week', width: 660, animate: false })
    assert.ok(windows(floors(dsvg).map((x) => x.body).join('')).some((x) => x.lv === 'd'))
    assert.ok(!windows(floors(dsvg).map((x) => x.body).join('')).some((x) => x.lv === '0'))
  })

  test('the days’ hours on the glass: dark letters on a bright room, quieter as it dims, pale blue on the dimmest; the best day gold', () => {
    const f = clone(SAMPLE)
    const svg = renderSvg(f, { view: 'week', width: 960, animate: false })
    // harborledger's week: Saturday its best, on the gold tag; the other worked days on their transoms, Monday shut
    const best = f.projects[0].per_day['2026-10-24'].minutes
    assert.ok(goldTags(svg).includes(fmtHours(best)))
    const inks = printed(svg)
    const all = Object.values(inks).flat()
    for (const d of ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-25']) {
      assert.ok(all.includes(fmtHours(f.projects[0].per_day[d].minutes)), d)
    }
    // the ink by the window's light: a level-4 room's label darker than a level-1 room's (lit by its screens alone)
    const days = f.range.days
    const shown = f.projects.slice(0, 12)
    const max = Math.max(...shown.flatMap((p) => days.map((d) => p.per_day[d]?.minutes ?? 0)))
    const labelAt = (level) => {
      for (const p of shown) {
        const peak = Math.max(...days.map((d) => p.per_day[d]?.minutes ?? 0))
        for (const d of days) {
          const m = p.per_day[d]?.minutes ?? 0
          if (m && m !== peak && glowLevel(m, max) === level) return fmtHours(m)
        }
      }
      return null
    }
    const inkOf = (label) => Object.keys(inks).find((ink) => inks[ink].includes(label))
    const [l4, l1] = [inkOf(labelAt(4)), inkOf(labelAt(1))]
    assert.ok(l4 && l1, `${l4} ${l1}`)
    assert.ok(lum(l4) < lum(l1), `${l4} darker than ${l1}`)
    // the transom is never split: it carries the hours
    assert.doesNotMatch(defOf(svg, 'to-tw-glz') ?? '', /M\d+ 4h\d v5/)
  })

  test('the live Clawds are at their floor: the lamp on today’s awning, its tooltip, the busy ones type', () => {
    const f = realShaped()
    const svg = renderSvg(f, { view: 'week', width: 660, animate: true })
    const fl = floors(svg)
    for (let i = 0; i < 3; i++) assert.match(fl[i].body, /href="#to-tw-m-c(?:t[01])?"/)
    const lamps = [...svg.matchAll(/<title>(\d+) desks? open now on ([^<]+)<\/title>/g)].map((m) => [Number(m[1]), m[2]])
    assert.deepEqual(lamps, [[7, 'harborledger'], [6, 'glyph-atlas-webgpu'], [6, 'island-tour-3d']])
    // the busiest floor wears the crown, once
    assert.equal((svg.match(/href="#to-tw-crown"/g) ?? []).length, 1, 'the crown')
    assert.match(svg, /<title>busiest floor: harborledger<\/title>/)
    assert.doesNotMatch(svg, /href="#to-wk-/, 'the live floor\'s sprites keep to its own tab')
  })

  test('a floor’s awning is its project’s own: the same name always dresses its floor alike, wherever its floor is', () => {
    for (const name of ['harborledger', 'md2epub', 'プロジェクト-alpha', HOSTILE]) assert.deepEqual(floorStyle(name), floorStyle(name))
    // a dozen names wear at least three of the four awnings
    const styles = clone(SAMPLE).projects.map((p) => floorStyle(p.name))
    assert.ok(new Set(styles.map((s) => s.awning)).size >= 3)
    assert.ok(styles.every((s) => /^[0-3]$/.test(s.code)))
    // swap the two top floors' facts: each project keeps its floor's awning
    const a = clone(SAMPLE)
    const b = clone(SAMPLE)
    ;[b.projects[1].name, b.projects[2].name] = [a.projects[2].name, a.projects[1].name]
    ;[b.projects[1].per_day, b.projects[2].per_day] = [a.projects[2].per_day, a.projects[1].per_day]
    const codes = (svg, i) => windows(floors(svg)[i].body).map((w) => w.code).join()
    const sa = renderSvg(a, { view: 'week', width: 660, animate: false })
    const sb = renderSvg(b, { view: 'week', width: 660, animate: false })
    assert.equal(codes(sa, 1), codes(sb, 2))
    assert.equal(codes(sa, 2), codes(sb, 1))
  })

  test('an empty week: one vacant floor, its sign, no tally, no crown, nothing lit', () => {
    for (const f of [emptyFacts(), day(emptyFacts())]) {
      const svg = renderSvg(f, { view: 'week', width: 660, animate: false })
      assert.ok(svg.includes('>no tenants this week<'))
      const fl = floors(svg)
      assert.equal(fl.length, 1)
      assert.ok(windows(fl[0].body).every((w) => w.lv === '0' || w.lv === 'd'))
      assert.deepEqual(totals(svg), [])
      assert.doesNotMatch(svg, /fill-opacity="0"[^>]*><title>(?!Commits line)/, 'no floor tooltips (the commits line has its own)')
      assert.doesNotMatch(svg, /<use href="#to-tw-crown" x/, 'no crown on a floor')
    }
  })

  test('hostile and odd facts: names escaped in plates and tooltips, garbage days and counts never throw', () => {
    const f = stressFacts()
    f.projects[0].name = HOSTILE
    f.projects[1].per_day = 'nope'
    f.projects[2].per_day = { [f.range.days[0]]: null, [f.range.days[1]]: { minutes: -50, sessions: 'x' } }
    f.projects[3].agent_minutes = 'lots'
    f.projects[4].commits = -3
    f.projects.push({ name: null }, {}, { name: '' })
    f.range.days = ['bogus', 3, null]
    for (const view of ['week', 'all']) {
      const svg = renderSvg(f, { view, width: 660 })
      assert.equal(xmlProblem(svg), '', view)
      assert.doesNotMatch(svg, /<script/i)
      // the tower names its floor in full; the Office names the project in its basement's tooltips, clipped
      assert.ok(svg.includes(view === 'week' ? '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;' : '&lt;script&gt;alert(1)'), view)
    }
    for (const g of [null, {}, { projects: [null, 'x', { name: 7, per_day: [] }] }, { range: { days: 'x' }, projects: [{ name: 'a', per_day: { x: 1 } }] }]) {
      assert.equal(xmlProblem(renderSvg(g, { view: 'week' })), '')
    }
  })

  test('budget: given less room, the tower sheds its life, then the days in its tooltips, keeping all twelve floors', () => {
    const f = stressFacts()
    // the chars a scene takes: its markup and the sprites it added to <defs>
    const draw = (budget) => {
      const ctx = ctxOf(f)
      const r = sceneWeek(ctx, 0, { budget })
      return { ...r, size: r.svg.length + defsMarkup(ctx).length }
    }
    const full = draw(Infinity)
    const lean = draw(full.size - 1)
    const plain = draw(1)
    assert.ok(full.size > lean.size && lean.size > plain.size, `${full.size} > ${lean.size} > ${plain.size}`)
    assert.ok(lean.size <= full.size - 1, 'the lean drawing fits the budget it was given')
    for (const r of [full, lean, plain]) {
      assert.equal((r.svg.match(/>\d+F</g) ?? []).length, 12)
      assert.equal(full.h, r.h, 'the same height: the floors stay')
    }
    assert.match(full.svg, /href="#to-tw-ivy"/, 'ivy at full detail')
    assert.doesNotMatch(lean.svg, /href="#to-tw-ivy"/, 'no ivy')
    const dayList = /agent-time · [^<]* (?:Mo|Tu|We|Th|Fr|Sa|Su) (?:[\d.]+[hmk]|·)[^<]*<\/title>/
    assert.match(lean.svg, dayList, 'the days in the tooltips')
    assert.doesNotMatch(plain.svg, dayList, 'no days in the tooltips')
    // a drop leaves no sprite of the richer drawing in <defs>
    const ctx = ctxOf(f)
    sceneWeek(ctx, 0, { budget: 1 })
    assert.doesNotMatch(defsMarkup(ctx), /id="to-tw-ivy"/)
    // in the Week view the whole budget is the tower's: full detail
    assert.match(renderSvg(f, { view: 'week', width: 660 }), /href="#to-tw-ivy"/)
  })

  test('quiet projects wait in storage: under 10 minutes of agent-time or no project at all, unless the whole week was quiet', () => {
    const f = clone(SAMPLE)
    f.projects[5].agent_minutes = 6
    f.projects.push({ ...clone(f.projects[11]), name: '(unknown)', agent_minutes: 40 })
    const svg = renderSvg(f, { view: 'week', width: 660, animate: false })
    assert.deepEqual(plates(svg), f.projects.filter((p, i) => i !== 5 && p.name !== '(unknown)').map((p) => p.name))
    // thirteen listed less the eleven on a floor, and the 23 beyond the list
    assert.match(svg, />\+25 more in storage/)
    // a week of nothing but quiet projects keeps them on their floors
    const q = emptyFacts()
    q.projects = [{ ...clone(SAMPLE.projects[0]), name: 'tiny', agent_minutes: 3 }, { ...clone(SAMPLE.projects[1]), name: 'tinier', agent_minutes: 1 }]
    assert.deepEqual(plates(renderSvg(q, { view: 'week', width: 660, animate: false })), ['tiny', 'tinier'])
  })

  test('the busiest floor on top wears a crown and a gilt ledge, and is a row like the others: no penthouse, no fanlights', () => {
    const svg = renderSvg(realShaped(), { view: 'week', width: 660, animate: false })
    const fl = floors(svg)
    assert.doesNotMatch(svg, /#to-tw-fan|penthouse/)
    assert.match(svg, /<title>busiest floor: harborledger<\/title>/)
    assert.match(svg, new RegExp(`<path fill="#f6d860" d="[^"]*M10 ${fl[0].y + FLOOR_H - 3}h310v1h-310z`), 'the gilt ledge, from pier to pier')
    // the busiest floor anywhere else wears the crown, and the top floor's ledge stays stone
    const g = clone(SAMPLE)
    g.projects[3].agent_minutes = 99_999
    const other = renderSvg(g, { view: 'week', width: 660, animate: false })
    assert.match(other, /<title>busiest floor: webgl-swatch-demos<\/title>/)
    const top = floors(other)[0].y + FLOOR_H - 3
    assert.doesNotMatch(other, new RegExp(`<path fill="#f6d860" d="[^"]*M10 ${top}h310v1h-310z`))
  })

  test('the cards: the week’s, then a tear-off page a day; the busiest day starred, its hours in bold; the key under the floors', () => {
    const f = clone(SAMPLE)
    const svg = renderSvg(f, { view: 'week', width: 960, animate: false })
    const t = texts(svg)
    assert.ok(t.includes('THIS WEEK'))
    assert.ok(t.includes('20 OCT → 26 OCT'), 'the week’s dates')
    assert.ok(t.includes(fmtInt(f.totals.commits)), 'and its commits')
    for (const wd of ['TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'MON']) assert.ok(t.includes(wd), wd)
    // one star, on the busiest day's card, its hours in the bold line
    const [, { minutes }] = Object.entries(f.per_day).sort((a, b) => b[1].minutes - a[1].minutes)[0]
    assert.equal((svg.match(/href="#to-tw-star"/g) ?? []).length, 1)
    assert.ok(groupTexts(svg, '<g font-size="5" font-weight="bold" text-anchor="middle">').includes(fmtHours(minutes)))
    // a Monday-to-Sunday page is the week's number
    const iso = clone(SAMPLE)
    iso.range.days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']
    assert.ok(texts(renderSvg(iso, { view: 'week', width: 960, animate: false })).includes('WEEK 43'))
    // the key: its name, each light's hours up to the busiest window's, the live lamp, the gold tag
    const shown = f.projects.slice(0, 12)
    const max = Math.max(...shown.flatMap((p) => f.range.days.map((d) => p.per_day[d]?.minutes ?? 0)))
    for (const label of ['WORKLOAD (AGENT-TIME)', `≤${fmtHours(max)}`, 'LIVE NOW', 'BEST DAY', '9h']) assert.ok(t.includes(label), label)
  })

  test('soft paint: the sign column and the key a warm dark under the wall, never black; the totals in parchment', () => {
    const svg = renderSvg(clone(SAMPLE), { view: 'week', width: 660, animate: false })
    // the tabs, the tallies and the key's board share the soft dark (the Office's near-black plate stays the names' ink)
    const soft = svg.match(/<path fill="#2b2019" d="([^"]*)"/)
    assert.ok(soft && (soft[1].match(/M/g) ?? []).length >= 2 * 12 + 1, 'twelve tabs, twelve tallies and the key')
    assert.equal(totals(svg).length, 12)
  })

  test('night and day: the night over the brick, today’s column in gold, now and then a light going off; the window cleaner by day', () => {
    const night = renderSvg(realShaped(), { view: 'week', width: 660, animate: true })
    assert.match(night, /fill="#0a0e1f" fill-opacity="\.42"/)
    assert.match(night, /fill="#eec96f" fill-opacity="\.1"/)
    assert.equal((night.match(/keyTimes="0;\.84;\.93"/g) ?? []).length, 2, 'two lights going off')
    assert.ok(!night.includes('the window cleaner'))
    const lit = renderSvg(day(realShaped()), { view: 'week', width: 660, animate: true })
    assert.doesNotMatch(lit, /fill="#0a0e1f" fill-opacity="\.42"/)
    assert.doesNotMatch(lit, /keyTimes="0;\.84;\.93"/)
    assert.match(lit, /<title>the window cleaner<\/title>/)
    // a still drawing keeps neither
    assert.ok(!renderSvg(day(realShaped()), { view: 'week', width: 660, animate: false }).includes('the window cleaner'))
    assert.doesNotMatch(renderSvg(realShaped(), { view: 'week', width: 660, animate: false }), /keyTimes="0;\.84;\.93"/)
  })

  test('a lit window seats the day’s agents at monitors of the floor’s main work, as many as its panes hold', () => {
    const f = clone(SAMPLE)
    f.projects[0].activity = { reading: 50, terminal: 10 }
    const svg = renderSvg(f, { view: 'week', width: 960, animate: false })
    const fl = floors(svg)
    assert.match(fl[0].body, /href="#to-tw-r\dr-c/, 'reading screens, Clawds at them')
    // harborledger's 14-session days fill both panes of a wide window; no ×N tag on the glass, its hours are there
    assert.match(fl[0].body, /href="#to-tw-r2r-/)
    assert.ok(!texts(svg).some((x) => /^×\d+$/.test(x)))
  })

  test('a day nobody worked there is closed: its shutter down under its rolled-up awning, by day and at night', () => {
    for (const f of [realShaped(), day(realShaped())]) {
      const svg = renderSvg(f, { view: 'week', width: 660, animate: false })
      const night = f.now.is_night
      const shut = floors(svg).flatMap((x) => windows(x.body)).filter((w) => w.lv === '0' || w.lv === 'd')
      assert.ok(shut.length > 0 && shut.every((w) => w.lv === (night ? '0' : 'd')))
      for (const w of shut) {
        // the shutter's body under the shut dressing: no glazing bars behind a shutter
        const def = defOf(svg, `to-tw-w${w.lv}${w.code}`)
        assert.match(def, new RegExp(`href="#to-tw-b${w.lv}".*href="#to-tw-ac${w.code}"`), w.code)
        assert.doesNotMatch(def, /tw-glz|tw-a\d/, w.code)
      }
      // the same shutter on every floor, its slats pale metal by day and slate at night
      assert.ok(defOf(svg, `to-tw-b${night ? 0 : 'd'}`).includes(night ? '#363a46' : '#8f8b84'))
    }
    // a light going off now and then shows the dark room, never the shutter
    const anim = renderSvg(realShaped(), { view: 'week', width: 660, animate: true })
    const off = [...anim.matchAll(/<g opacity="0" transform="translate\([^)]+\)">(.*?)<animate attributeName="opacity" values="0;1;0"/g)].map((m) => m[1])
    assert.equal(off.length, 2)
    for (const o of off) assert.match(o, /^<use href="#to-tw-bx"\/>/)
  })

  test('each floor’s name is on the Office’s nameplate in its color, its number on a soft dark tab beside it', () => {
    const f = clone(SAMPLE)
    f.projects[1].name = 'Café-Crème_2'
    f.projects[2].name = 'プロジェクト'
    const svg = renderSvg(f, { view: 'week', width: 960, animate: false })
    // the names as written, top floor first, in dark bold type: no pixel lettering
    assert.deepEqual(nameplates(svg).slice(0, 3), ['harborledger', 'Café-Crème_2', 'プロジェクト'])
    assert.equal(nameplates(svg).length, 12)
    // the floor numbers counting down, centered in dim type on a tab as wide on every floor
    assert.deepEqual(floorNumbers(svg), Array.from({ length: 12 }, (_, i) => `${12 - i}F`))
    // a long name goes on two lines where it breaks best, each cut short with an ellipsis only when even that fails
    const narrow = nameplates(renderSvg(stressFacts(), { view: 'week', width: 480, animate: false }))
    assert.ok(narrow.some((x) => x.startsWith('an-extreme') && x.endsWith('…')), narrow.join(' | '))
  })

  test('the day cards keep every label apart at the narrowest pane', () => {
    const f = stressFacts()
    for (const d of Object.keys(f.per_day)) f.per_day[d].minutes = 999 * 60
    for (const width of [400, 480]) {
      const svg = renderSvg(f, { view: 'week', width, animate: false })
      const xs = [...svg.matchAll(/<text x="([\d.]+)" y="[\d.]+" fill="[^"]+">999h<\/text>/g)].map((m) => Number(m[1])).sort((a, b) => a - b)
      assert.equal(xs.length, 7, `${width}`)
      for (let i = 1; i < 7; i++) assert.ok(xs[i] - xs[i - 1] >= textW('999h', 4.5) + 2, `${width}: apart`)
    }
  })
})
