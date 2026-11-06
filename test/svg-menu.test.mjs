// The pane's pixel menu (lib/svg-menu.mjs), as the desktop pane's surface module draws it over the period strip: which
// keys a click may go to, how the row narrows, that it meets the strip as one console, and that it stays a small, plain
// image. And the console's parts the two share (lib/svg-console.mjs), which import nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { menuIconSvg, renderMenu, zoneAt } from '../plugin/lib/svg-menu.mjs'
import { renderPeriod } from '../plugin/lib/svg-period.mjs'
import { C } from '../plugin/lib/svg-console.mjs'

test('standalone menu icons preserve the native key glyph geometry and colours', () => {
  // Compare the rendered shapes after translation; no second copy of the icon maps belongs in the site or test.
  const glyph = (source) => {
    const pixels = [C.ink, C.accent].flatMap((fill) => {
      const d = source.match(new RegExp(`<path fill="${fill}" d="([^"]*)"`))?.[1] ?? ''
      return [...d.matchAll(/M(-?[\d.]+) (-?[\d.]+)h([\d.]+)v1h-[\d.]+z/g)]
        .map(([, x, y, w]) => [Number(x), Number(y), Number(w), fill])
    })
    assert.ok(pixels.length > 0)
    const x0 = Math.min(...pixels.map((p) => p[0]))
    const y0 = Math.min(...pixels.map((p) => p[1]))
    return pixels.map(([x, y, w, fill]) => [x - x0, y - y0, w, fill])
  }
  for (const icon of ['live', 'week', 'month']) {
    const standalone = menuIconSvg(icon)
    const native = renderMenu({ keys: [{ id: icon, label: '', short: '', icon }], width: 240 }).source
    assert.deepEqual(glyph(standalone), glyph(native), icon)
    assert.match(standalone, /width="18" height="18" viewBox="0 0 9 9"/)
    assert.match(standalone, /aria-hidden="true"/)
  }
})

test('standalone menu icons bound their pixel scale, escape colour attributes and ignore unknown names', () => {
  assert.match(menuIconSvg('week', { scale: 3 }), /width="27" height="27"/)
  assert.match(menuIconSvg('week', { scale: -1 }), /width="9" height="9"/)
  assert.match(menuIconSvg('week', { scale: 1e9 }), /width="144" height="144"/)
  assert.match(menuIconSvg('week', { scale: Infinity }), /width="18" height="18"/)
  const escaped = menuIconSvg('week', { ink: '" onclick="alert(1)', accent: '<red>&' })
  assert.match(escaped, /fill="&quot; onclick=&quot;alert\(1\)"/)
  assert.match(escaped, /fill="&lt;red&gt;&amp;"/)
  assert.doesNotMatch(escaped, /" onclick="/)
  assert.equal(menuIconSvg('unknown'), '')
  assert.equal(menuIconSvg('toString'), '')
})

/** The tabs as hooks/register.tsx hands them, `on` lit. */
const tabs = (on) => [
  ['all', 'Live', 'Live', 'live'], ['today', 'Today', 'Today', 'today'], ['week', 'Week', 'Week', 'week'],
  ['month', 'Month', 'Month', 'month'], ['work', 'What they did', 'Work', 'work'], ['timelapse', 'Timelapse', 'Lapse', 'timelapse'],
].map(([id, label, short, icon]) => ({ id, label, short, icon, ...(id === on ? { isOn: true } : {}) }))
/** The Timelapse's ranges and Export, `on` lit, Export busy while it runs. */
const lapse = (on, busy = false) => [
  ...[['yesterday', 'Yesterday', 'Yesterday', 'yesterday'], ['week', 'Week', 'Week', 'week'], ['month', 'Month', 'Month', 'month']]
    .map(([id, label, short, icon]) => ({ id, label, short, icon, ...(id === on ? { isOn: true } : {}) })),
  { id: 'export', label: busy ? 'Exporting' : 'Export', short: 'Export', icon: 'export', ...(busy ? { isBusy: true } : {}) },
]
const ROWS = [
  ...['all', 'today', 'week', 'month', 'work', 'timelapse'].map((on) => tabs(on)),
  ...['yesterday', 'week', 'month'].flatMap((on) => [lapse(on), lapse(on, true)]),
]
const TIERS = ['full', 'short', 'tight', 'words', 'picked', 'picked-short', 'icons', 'tiny']
/** A word's width in units, as the menu sets it: 6.5 units of a monospace's 0.6 em a character. */
const wordW = (s) => Math.ceil(s.length * 6.5 * 0.6)

test('a key that is not lit nor busy is a zone a click goes to, each where it is drawn, apart, inside the plate, wide enough for a cell', () => {
  for (const keys of ROWS) {
    for (let width = 240; width <= 2400; width += 7) {
      for (const joined of [false, true]) {
        const row = renderMenu({ keys, width, joined })
        const goes = keys.filter((k) => !k.isOn && !k.isBusy).map((k) => k.id)
        assert.deepEqual(row.zones.map((z) => z.id), goes, `${width}`)
        assert.equal(row.still.length, keys.length - goes.length)
        // every key, a zone or still, in order along the row, 2 units apart at least, inside its padding
        const all = [...row.zones, ...row.still].sort((a, b) => a.x - b.x)
        for (const [i, z] of all.entries()) {
          assert.ok(z.w >= 10, `${width}: a key ${z.w} wide`)
          assert.ok(z.x >= 6 && z.x + z.w <= row.W - 6, `${width}: a key at ${z.x}+${z.w} of ${row.W}`)
          if (i) assert.ok(z.x >= all[i - 1].x + all[i - 1].w + 2, `${width}: keys too close`)
        }
        // the key's dark rim is drawn exactly over its zone
        for (const z of all) assert.ok(row.source.includes(`M${z.x + 1} 2h${z.w - 2}v16h-${z.w - 2}z`), `${width}: rim of ${z.x}`)
      }
    }
  }
})

test('the cell under a key\'s middle goes to that key at every width, as the module reads a click from its cell alone', () => {
  for (const keys of ROWS) {
    for (let width = 320; width <= 2400; width += 13) {
      const row = renderMenu({ keys, width })
      // the region is `columns` cells and a part (about 8.75 px a cell), and a click is known by its cell's span
      const columns = Math.floor(row.px / 8.75)
      for (const z of row.zones) {
        const x = Math.floor(((z.x + z.w / 2) / row.W) * (columns + 0.5))
        assert.equal(zoneAt(row, x / (columns + 0.5), (x + 1) / (columns + 0.5))?.id, z.id, `${width}: ${z.id}`)
      }
      // the cell under the lit key's middle goes nowhere, and one astride its edge goes to what it covers more
      const lit = row.still[0]
      if (lit) {
        const x = Math.floor(((lit.x + lit.w / 2) / row.W) * (columns + 0.5))
        assert.equal(zoneAt(row, x / (columns + 0.5), (x + 1) / (columns + 0.5)), null, `${width}: the lit key`)
        const edge = Math.floor((lit.x / row.W) * (columns + 0.5))
        const [a, b] = [(edge / (columns + 0.5)) * row.W, ((edge + 1) / (columns + 0.5)) * row.W]
        const onLit = Math.min(b, lit.x + lit.w) - Math.max(a, lit.x)
        const left = row.zones.find((z) => z.x + z.w > a && z.x < b)
        const onLeft = left ? Math.min(b, left.x + left.w) - Math.max(a, left.x) : 0
        const got = zoneAt(row, edge / (columns + 0.5), (edge + 1) / (columns + 0.5))
        assert.equal(got?.id ?? null, onLeft > onLit ? left.id : null, `${width}: astride the lit key's edge`)
      }
    }
  }
})

test('as the pane narrows the row steps down its ladder and never back up: names, short names, the lit key\'s name, icons', () => {
  for (const keys of ROWS) {
    let last = -1
    for (let width = 2400; width >= 240; width -= 3) {
      const at = TIERS.indexOf(renderMenu({ keys, width }).tier)
      assert.ok(at >= last, `${width}: back up to ${TIERS[at]}`)
      last = at
    }
  }
  const tier = (keys, width) => renderMenu({ keys, width }).tier
  assert.equal(tier(tabs('month'), 900), 'full')
  assert.equal(tier(tabs('month'), 340), 'picked')
  assert.equal(tier(tabs('month'), 240), 'tiny')
  // a pane of 340 px still names every range of the Timelapse; at 300 the lit one and Export keep their words
  assert.equal(tier(lapse('week'), 340), 'words')
  const narrow = renderMenu({ keys: lapse('week'), width: 300 })
  assert.equal(narrow.tier, 'picked')
  // an icon is 9 units wide: Export's key holds its word too, the lit range its name, the others their icons alone
  assert.ok(narrow.zones.find((z) => z.id === 'export').w >= 2 + 2 * 3 + 9 + 2 + wordW('Export'))
  assert.ok(narrow.zones.find((z) => z.id === 'yesterday').w < 2 + 2 * 3 + 9 + 2 + wordW('Yesterday'))
  assert.ok(narrow.still[0].w >= 2 + 2 * 3 + 9 + 2 + wordW('Week'))
  assert.match(narrow.source, />Export<\/text>/)
  assert.match(narrow.source, />Week<\/text>/)
  assert.doesNotMatch(narrow.source, />Yesterday<\/text>/)
})

test('a lit key that may be pressed again (a range of the Timelapse) is a zone; one that may not is still', () => {
  const keys = lapse('week').map((k) => (k.isOn ? { ...k, isRepeatable: true } : k))
  const row = renderMenu({ keys, width: 900 })
  assert.deepEqual(row.zones.map((z) => z.id), ['yesterday', 'week', 'month', 'export'])
  assert.deepEqual(row.still, [])
  // held, it sinks as any key; busy, Export goes nowhere
  assert.notEqual(renderMenu({ keys, width: 900, pressed: 'week' }).source, row.source)
  const busy = renderMenu({ keys: keys.map((k) => (k.id === 'export' ? { ...k, isBusy: true } : k)), width: 900 })
  assert.deepEqual(busy.zones.map((z) => z.id), ['yesterday', 'week', 'month'])
})

test('the lit key is level with the others, a key held down sinks, and the source says so', () => {
  const keys = tabs('month')
  const plain = renderMenu({ keys, width: 900 })
  const held = renderMenu({ keys, width: 900, pressed: 'today' })
  assert.notEqual(held.source, plain.source)
  const today = plain.zones.find((z) => z.id === 'today')
  assert.ok(held.source.includes(`M${today.x + 1} 5h${today.w - 2}v12h-${today.w - 2}z`)) // its face 2 units down
  assert.ok(!plain.source.includes(`M${today.x + 1} 5h`))
  // the lit key's face on the same line as its neighbours'
  const month = plain.still[0]
  assert.ok(plain.source.includes(`M${month.x + 1} 3h${month.w - 2}v12h-${month.w - 2}z`))
  // a press on the lit key or on no key draws nothing else
  assert.equal(renderMenu({ keys, width: 900, pressed: 'month' }).source, plain.source)
  assert.equal(renderMenu({ keys, width: 900, pressed: 'banana' }).source, plain.source)
})

test('a small, plain image: no <animate>, words as text held to their width, one <set> only while Export works, its size, the same string for the same keys', () => {
  for (const keys of ROWS) {
    for (const width of [240, 320, 560, 900, 1400, 2400, 4096, 9000]) {
      const row = renderMenu({ keys, width, joined: true })
      assert.equal(row.source, renderMenu({ keys, width, joined: true }).source)
      assert.ok(row.source.length < 15_000, `${width}: ${row.source.length}`)
      assert.doesNotMatch(row.source, /<animate|<foreignObject|<script|<image|href=|@import|url\(/)
      // every word in the drawing's monospace, held to the width its key was laid out for
      for (const m of row.source.matchAll(/<text [^>]*textLength="(\d+)" lengthAdjust="spacing">([^<]*)<\/text>/g)) assert.equal(Number(m[1]), wordW(m[2]))
      assert.equal((row.source.match(/<text /g) ?? []).length, (row.source.match(/textLength=/g) ?? []).length)
      assert.equal((row.source.match(/<set /g) ?? []).length, keys.some((k) => k.isBusy) ? 1 : 0)
      assert.equal(row.px, Math.min(4096, width))
      assert.equal(row.W, Math.round(row.px / 2))
      assert.equal(row.H, 19)
      assert.match(row.source, new RegExp(`^<svg [^>]*width="${row.px}" height="${row.h}" viewBox="0 0 ${row.W} 19"`))
    }
  }
  assert.equal(renderMenu({ keys: tabs('week'), width: 900 }).alt,
    'Week on screen; the other keys: Live, Today, Month, What they did and Timelapse.')
  // the names as they are given, not in capitals
  assert.match(renderMenu({ keys: tabs('week'), width: 900 }).source, />What they did<\/text>/)
  assert.match(renderMenu({ keys: lapse('week', true), width: 900 }).alt, /Exporting \(still working\)\.$/)
})

test('keys from code are input: none, odd ones and a label to escape still draw', () => {
  for (const keys of [[], undefined, [null, 7, { id: 'x' }, { label: 'y' }], [{ id: 'a', label: '<b>&"\'', short: '', icon: 'none' }]]) {
    const row = renderMenu({ keys, width: 640 })
    assert.match(row.source, /^<svg /)
    assert.doesNotMatch(row.alt, /undefined|null/)
  }
  const odd = renderMenu({ keys: [{ id: 'a', label: '<b>&"\'', short: '', icon: 'none' }], width: 640 })
  assert.ok(odd.source.includes('&lt;b&gt;&amp;&quot;&#39;'))
  assert.deepEqual(odd.zones.map((z) => z.id), ['a'])
})

test('joined, the menu\'s foot and the strip\'s top are square and meet flush: one console; alone, each is a rounded card', () => {
  const top = renderMenu({ keys: tabs('month'), width: 900, joined: true })
  // drawn narrower than asked, a deck with another under it keeps its foot down, its sliver above it; the others hang
  // from their top
  assert.match(top.source, /preserveAspectRatio="xMidYMax meet"/)
  assert.match(renderMenu({ keys: tabs('month'), width: 900 }).source, /preserveAspectRatio="xMidYMin meet"/)
  // the Timelapse's ranges under the tabs: their top square, the rim open there
  const ranges = renderMenu({ keys: lapse('week'), width: 900, under: true })
  assert.match(ranges.source, /<path fill="#241c17" d="M0 0H450V14a5 5 0 0 1-5 5H5a5 5 0 0 1-5-5z"/)
  assert.match(ranges.source, /<path d="M\.25 0V14a4\.75/)
  assert.match(ranges.source, /preserveAspectRatio="xMidYMin meet"/)
  const under = renderPeriod({ unit: 'month', back: 1, today: '2026-11-02', width: 900, joined: true })
  assert.match(top.source, /<path fill="#241c17" d="M0 5a5 5 0 0 1 5-5H445a5 5 0 0 1 5 5V19H0z"/)
  assert.match(under.source, /<clipPath id="pd-card"><path d="M0 0H450V15a5 5 0 0 1-5 5H5a5 5 0 0 1-5-5z"/)
  // the rims leave open the edge where they meet
  assert.match(top.source, /<path d="M\.25 19V5a4\.75/)
  assert.match(under.source, /<path d="M\.25 0V15a4\.75/)
  assert.match(renderMenu({ keys: tabs('month'), width: 900 }).source, /<rect width="450" height="19" rx="5"/)
  assert.match(renderPeriod({ unit: 'month', back: 1, today: '2026-11-02', width: 900 }).source, /<clipPath id="pd-card"><rect width="450" height="20" rx="5"/)
})

test('the console is PURE: its parts import nothing, the menu only them, the strip them and the calendar', () => {
  const importsOf = (file) => {
    const src = fs.readFileSync(new URL(`../plugin/lib/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /require\(|import\(/, file)
    return [...src.matchAll(/^(?:import|export)\b[^'"]*?\bfrom '([^']+)'/gm)].map((m) => m[1]).sort()
  }
  assert.deepEqual(importsOf('svg-console.mjs'), [])
  assert.deepEqual([...new Set(importsOf('svg-menu.mjs'))], ['./svg-console.mjs'])
  assert.deepEqual([...new Set(importsOf('svg-period.mjs'))], ['./period.mjs', './svg-console.mjs'])
})

/** The Month's export row as hooks/register.tsx hands it: what to export, or how to keep a part and Back. */
const what = () => [['calendar', 'Calendar', 'Calendar', 'calendar'], ['directory', 'Directory', 'Directory', 'directory'],
  ['whole', 'Whole month', 'Month', 'building'], ['stats', 'Stats', 'Stats', 'stats']].map(([id, label, short, icon]) => ({ id, label, short, icon }))
const how = (stats = false) => [
  ...(stats ? [['html', 'Page', 'page'], ['csv', 'CSV', 'csv'], ['json', 'JSON', 'json']] : [['png', 'PNG', 'png'], ['svg', 'SVG', 'svg'], ['gif', 'GIF', 'gif'], ['video', 'Video', 'video']])
    .map(([id, label, icon]) => ({ id, label, short: label, icon })),
  { id: 'back', label: 'Back', short: 'Back', icon: 'back' },
]

test('the Month\'s export row asks its question on an amber LED at its left, its answers beside it, Back apart at the right end; narrow, the LED goes first', () => {
  for (const [keys, prompt] of [[what(), 'Export'], [how(), 'Calendar as'], [how(true), 'Stats as']]) {
    for (const width of [320, 420, 600, 900, 1800]) {
      const row = renderMenu({ keys, width, under: true, prompt })
      // every answer is a zone, the LED is not, and nothing overlaps
      assert.deepEqual(row.zones.map((z) => z.id), keys.map((k) => k.id), `${prompt} ${width}`)
      const spans = [...row.zones, ...row.still].sort((a, b) => a.x - b.x)
      spans.forEach((z, i) => i && assert.ok(spans[i - 1].x + spans[i - 1].w <= z.x, `${prompt} ${width}`))
      const led = row.source.includes(`>${prompt.toUpperCase()}</text>`)
      if (width >= 600) assert.ok(led, `${prompt} ${width}: the LED`)
      if (led) {
        assert.ok(row.still.length === 1 && row.still[0].x === 6, 'the LED at the left, drawn and going nowhere')
        assert.ok(row.zones[0].x > row.still[0].x + row.still[0].w)
      } else assert.equal(row.still.length, 0)
      const back = row.zones.find((z) => z.id === 'back')
      if (back) assert.equal(back.x + back.w, row.W - 6, 'Back at the right end')
      assert.doesNotMatch(row.source, /<animate|<set\b|<script|href=/)
    }
  }
  assert.equal(renderMenu({ keys: how(), width: 900, under: true, prompt: 'Calendar as' }).alt, 'Calendar as: PNG, SVG, GIF, Video, Back.')
  assert.equal(renderMenu({ keys: what(), width: 900, under: true, prompt: 'Export' }).alt, 'Export: Calendar, Directory, Whole month, Stats.')
  // a cream Back, as the answers are: no coral action key on the row
  assert.doesNotMatch(renderMenu({ keys: how(), width: 900, under: true, prompt: 'Calendar as' }).source, /#e07a61/)
  // the answers carry their own icons, each drawn
  for (const keys of [what(), how(), how(true)]) {
    const icons = renderMenu({ keys, width: 1800, under: true }).source
    const bare = renderMenu({ keys: keys.map((k) => ({ ...k, icon: 'none' })), width: 1800, under: true }).source
    assert.ok(icons.length > bare.length)
  }
})

/** The tabs and the Live tab's Quiet switch, as hooks/register.tsx hands them: lit while on, its room kept off Live. */
const withQuiet = (on, isQuiet) => [...tabs(on),
  { id: 'quiet', label: 'Quiet', short: 'Quiet', icon: 'quiet', isSwitch: true, ...(isQuiet ? { isOn: true } : {}), ...(on === 'all' ? {} : { isHidden: true }) }]

test('the Live tab\'s Quiet is a switch apart at the right end: pressed on or off it moves no key, and the other tabs keep its room', () => {
  const at = (row) => [...row.zones, ...row.still].sort((a, b) => a.x - b.x).map((z) => `${z.x}+${z.w}`)
  for (let width = 240; width <= 2400; width += 11) {
    const off = renderMenu({ keys: withQuiet('all', false), width })
    const on = renderMenu({ keys: withQuiet('all', true), width })
    // a zone either way, at the right end; on, it is lit and its face the same
    for (const row of [off, on]) {
      const q = row.zones.find((z) => z.id === 'quiet')
      assert.ok(q && q.x + q.w === row.W - 6, `${width}`)
    }
    assert.deepEqual(at(on), at(off), `${width}`)
    assert.equal(on.tier, off.tier, `${width}`)
    assert.match(off.alt, /; Quiet off\.$/)
    assert.match(on.alt, /^Live on screen; the other keys: Today, [^;]*; Quiet on\.$/)
    // on another tab its room is kept and nothing is drawn in it: where every key wears its icon and its word, the tabs
    // stand where they do on Live
    const week = renderMenu({ keys: withQuiet('week', true), width })
    const q = off.zones.find((z) => z.id === 'quiet')
    assert.ok(!week.zones.some((z) => z.id === 'quiet') && week.still.length === 1, `${width}`)
    assert.ok(!week.source.includes(`M${q.x + 1} 2h${q.w - 2}v16h-${q.w - 2}z`) && !week.source.includes('>Quiet<') && !week.alt.includes('Quiet'), `${width}`)
    assert.equal(week.tier, off.tier, `${width}`)
    if (['full', 'short', 'tight'].includes(off.tier)) assert.deepEqual(at(week), at(off).slice(0, -1), `${width}`)
  }
  // a cream key, lit yellow while on, never the coral of an action
  assert.doesNotMatch(renderMenu({ keys: withQuiet('all', false), width: 900 }).source, /#e07a61/)
})

/** The tabs, the Live tab's Quiet and the Zoom, as hooks/register.tsx hands them (tabKeys): both switches apart. */
const withZoom = (on, isQuiet, isZoomed) => [...withQuiet(on, isQuiet), { id: 'zoom', label: 'Zoom', short: 'Zoom', icon: 'zoom', isSwitch: true, ...(isZoomed ? { isOn: true } : {}) }]

test('the Zoom is a switch at the right edge, Quiet beside it: on any tab, pressed on or off, nothing moves', () => {
  const at = (row) => [...row.zones, ...row.still].sort((a, b) => a.x - b.x).map((z) => `${z.x}+${z.w}`)
  for (let width = 240; width <= 2400; width += 11) {
    for (const tab of ['all', 'week']) {
      const off = renderMenu({ keys: withZoom(tab, false, false), width })
      const on = renderMenu({ keys: withZoom(tab, true, true), width })
      for (const row of [off, on]) {
        // the Zoom at the edge, a zone either way; Quiet (on Live) a gap to its left, both apart from the tabs
        const z = row.zones.find((k) => k.id === 'zoom')
        assert.ok(z && z.x + z.w === row.W - 6, `${tab} ${width}`)
        const q = row.zones.find((k) => k.id === 'quiet')
        if (tab === 'all') assert.ok(q && q.x + q.w <= z.x, `${tab} ${width}`)
        else assert.ok(!q, `${tab} ${width}`)
        // (the lit tab is still: no zone, drawn and going nowhere)
        const tabsEnd = Math.max(...row.zones.filter((k) => k.id !== 'zoom' && k.id !== 'quiet').map((k) => k.x + k.w), ...row.still.map((k) => k.x + k.w))
        assert.ok(tabsEnd < (q?.x ?? z.x), `${tab} ${width}: the tabs left of the switches`)
      }
      assert.deepEqual(at(on), at(off), `${tab} ${width}`)
      assert.equal(on.tier, off.tier, `${tab} ${width}`)
      assert.match(on.alt, tab === 'all' ? /; Quiet on; Zoom on\.$/ : /; Zoom on\.$/, `${tab} ${width}`)
    }
  }
  assert.ok(menuIconSvg('zoom').includes('<path'), 'its magnifier')
})
