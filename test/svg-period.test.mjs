// The strip that pages a tab through the past (lib/svg-period.mjs), as the desktop pane's surface module draws it: what
// its LED says, which keys and windows a click may go to, how it narrows, and that it stays a small, plain image.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageLeap } from '../plugin/lib/period.mjs'
import { LED_CHARS, ledLabel, ledWords, renderPeriod, zoneAt } from '../plugin/lib/svg-period.mjs'

const TODAY = '2026-11-01' // a Sunday
const UNITS = ['day', 'week', 'month']
/** The strip's width for a pane of `columns` cells (hooks/register.tsx stripWidth): never narrower than its region. */
const stripWidth = (columns) => Math.max(320, Math.ceil(columns * 9))

test('the LED names a page by what it is now, then by its dates, the year only when it is not this one', () => {
  const cases = [
    ['day', 0, 'TODAY'], ['day', 1, 'YESTERDAY'], ['day', 2, 'FRI 30 OCT'], ['day', 306, 'TUE 30 DEC 2025'],
    ['week', 0, 'LAST 7 DAYS'], ['week', 1, '19-25 OCT'], ['week', 5, '21-27 SEP'], ['week', 4, '28 SEP-4 OCT'], ['week', 44, '22-28 DEC 2025'],
    ['month', 0, 'OCT → NOW'], ['month', 1, 'OCTOBER 2026'], ['month', 3, 'AUGUST 2026'], ['month', 10, 'JANUARY 2026'], ['month', 12, 'NOVEMBER 2025'],
  ]
  for (const [unit, back, label] of cases) assert.equal(ledLabel(unit, back, TODAY), label, `${unit} ${back}`)
  assert.equal(ledLabel('day', 1, TODAY, true), '31 OCT')
  assert.equal(ledLabel('week', 44, TODAY, true), '22-28 DEC')
  assert.equal(ledLabel('month', 3, TODAY, true), 'AUG 2026')
  assert.deepEqual([ledLabel('month', 0, '2027-01-03'), ledLabel('month', 0, TODAY, true)], ['DEC → NOW', 'OCT → NOW'])
})

test('every name of every page fits its LED, in full and short, in the capitals, digits, spaces, dashes and arrow ledWords takes', () => {
  for (const unit of UNITS) {
    for (const short of [false, true]) {
      for (let back = 0; back < 1500; back++) {
        const label = ledLabel(unit, back, TODAY, short)
        assert.ok(label.length <= LED_CHARS[unit][short ? 'short' : 'full'], `${unit} ${back} ${short}: ${label}`)
        assert.match(label, /^[A-Z0-9 →-]+$/)
      }
    }
  }
})

test('a key or a window goes to its page: older, newer, a leap, the ruler, now; the page on screen and what is yet to come go nowhere', () => {
  const at = (unit, back) => Object.fromEntries(renderPeriod({ unit, back, today: TODAY, width: 900 }).zones.map((z) => [z.id, z.back]))
  // on now: older, a leap back, and the ruler's past windows (the months of 2026 before November)
  assert.deepEqual(at('month', 0), { older: 1, 'leap-older': 12, ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`tick-${i}`, 10 - i])) })
  const august = at('month', 3)
  assert.deepEqual([august.older, august.newer, august.now, august['leap-older'], august['leap-newer']], [4, 2, 0, 15, 0])
  assert.equal(august['tick-7'], undefined) // August itself
  assert.equal(august['tick-11'], undefined) // December, yet to come
  assert.equal(august['tick-0'], 10) // January
  const week = at('week', 2)
  assert.deepEqual([week.older, week.newer, week['leap-older'], week['leap-newer']], [3, 1, 2 + pageLeap('week'), 0])
  const day = at('day', 1)
  assert.deepEqual([day.older, day.newer, day.now, day['leap-older']], [2, 0, 0, 1 + pageLeap('day')])
  // a key that turns pages says by how many, so a click counts from the page on screen when it lands
  const steps = Object.fromEntries(renderPeriod({ unit: 'month', back: 3, today: TODAY, width: 900 }).zones.map((z) => [z.id, z.step]))
  assert.deepEqual([steps.older, steps.newer, steps['leap-older'], steps['leap-newer'], steps.now, steps['tick-0']], [1, -1, 12, -12, undefined, undefined])
})

test('the keys stay where they are from page to page: a month with four Mondays leaves the ruler\'s fifth slot empty', () => {
  for (const unit of UNITS) {
    const keys = new Map()
    for (let back = 1; back < 60; back++) {
      for (const z of renderPeriod({ unit, back, today: TODAY, width: 900 }).zones) {
        if (z.id.startsWith('tick-')) continue
        if (keys.has(z.id)) assert.equal(z.x, keys.get(z.id), `${unit} ${back}: ${z.id}`)
        keys.set(z.id, z.x)
      }
    }
    assert.deepEqual([...keys.keys()].sort(), ['leap-newer', 'leap-older', 'newer', 'now', 'older'])
  }
})

test('at every pane width each zone is at least two cells wide, inside the strip and clear of the others, and a click finds it', () => {
  for (const unit of UNITS) {
    for (const back of [0, 1, 3, 40]) {
      for (let columns = 30; columns <= 400; columns += 7) {
        const strip = renderPeriod({ unit, back, today: TODAY, width: stripWidth(columns) })
        const cells = (units) => (units / strip.W) * columns
        const zones = [...strip.zones].sort((a, b) => a.x - b.x)
        zones.forEach((z, i) => {
          assert.ok(cells(z.w) >= 2, `${unit} ${back} at ${columns}: ${z.id} is ${cells(z.w).toFixed(2)} cells`)
          assert.ok(z.x >= 0 && z.x + z.w <= strip.W, `${z.id} inside`)
          if (i) assert.ok(zones[i - 1].x + zones[i - 1].w <= z.x, `${zones[i - 1].id} and ${z.id} overlap`)
          for (const s of strip.still) assert.ok(s.x + s.w <= z.x || z.x + z.w <= s.x, `${z.id} under something still`)
          const cell = Math.floor(cells(z.x + z.w / 2))
          assert.equal(zoneAt(strip, (cell + 0.5) / columns)?.id, z.id)
        })
      }
    }
  }
})

test('a click on the desktop, which tells only its cell, lands where it fell: on its key, never on a page for the LED or the page on screen', () => {
  // the desktop's region is `columns` cells of 1ch and a part of one more, and the strip spans it; a pixel falls in a
  // cell, which the module turns into its share of the region as hooks/period.tsx does
  const n = { onKey: 0, right: 0, still: 0, stillToKey: 0 }
  for (const unit of UNITS) {
    for (const back of [0, 1, 3, 40]) {
      for (let columns = 30; columns <= 130; columns += 5) {
        const strip = renderPeriod({ unit, back, today: TODAY, width: stripWidth(columns) })
        for (const ch of [7.5, 8.2, 8.8]) {
          for (const part of [0, 0.5, 0.99]) {
            const region = (columns + part) * ch
            for (let p = 0.25; p < region; p += 0.5) {
              const cell = Math.floor(p / ch)
              const got = zoneAt(strip, cell / (columns + 0.5), (cell + 1) / (columns + 0.5))
              const at = (p / region) * strip.W
              const on = (z) => at >= z.x && at < z.x + z.w
              const truth = strip.zones.find(on)
              if (truth) {
                n.onKey++
                if (got?.id === truth.id) n.right++
              } else if (strip.still.some(on)) {
                n.still++
                if (got) n.stillToKey++
              }
            }
          }
        }
      }
    }
  }
  // measured: 97.6% and 0.3%, against 87.2% and 0.3% for the cell's middle over `columns` (which drifts right and loses
  // the last cell) and 98.8% and 0.2% for a module that knew the region's width in pixels
  assert.ok(n.right / n.onKey > 0.97,`${((100 * n.right) / n.onKey).toFixed(2)}% of clicks on a key land on it`)
  assert.ok(n.stillToKey / n.still < 0.005, `${((100 * n.stillToKey) / n.still).toFixed(2)}% of clicks on the LED or a window going nowhere turn a page`)
  // a cell astride a key's edge and the plate presses the key; the last part of a cell, past the strip, nothing
  const strip = renderPeriod({ unit: 'week', back: 2, today: TODAY, width: 900 })
  const older = strip.zones.find((z) => z.id === 'older')
  assert.equal(zoneAt(strip, (older.x - 1) / strip.W, (older.x + 1) / strip.W)?.id, 'older')
  assert.equal(zoneAt(strip, (older.x - 3) / strip.W, (older.x - 0.5) / strip.W), null)
  assert.equal(zoneAt(strip, 1, 1.01), null)
})

test('never wider than the desktop draws an image: past 4096 px the tree is refused and the strip unmounted', () => {
  const { source, px } = renderPeriod({ unit: 'month', back: 1, today: TODAY, width: stripWidth(500) })
  assert.equal(px, 4096)
  assert.match(source, /^<svg [^>]*width="4096" height="40" /)
})

test('as the pane narrows the ruler goes first, then the leaps, then the long words', () => {
  const ids = (width) => renderPeriod({ unit: 'month', back: 3, today: TODAY, width }).zones.map((z) => z.id)
  assert.ok(ids(900).includes('tick-0') && ids(900).includes('leap-older'))
  assert.deepEqual(ids(600).sort(), ['leap-newer', 'leap-older', 'newer', 'now', 'older'])
  assert.deepEqual(ids(360).sort(), ['newer', 'now', 'older'])
  assert.equal(renderPeriod({ unit: 'month', back: 3, today: TODAY, width: 900 }).label, 'AUGUST 2026')
  assert.equal(renderPeriod({ unit: 'day', back: 400, today: TODAY, width: 320 }).label, 'SAT 27 SEP 2025')
  assert.equal(renderPeriod({ unit: 'day', back: 400, today: TODAY, width: 280 }).label, '27 SEP 2025')
})

test('a small, plain image: no script, link or handler, no <animate> (it would keep a frame loop), and its only motion the LED blinking while its page is read', () => {
  for (const unit of UNITS) {
    for (const busy of [false, true]) {
      const { source, px, h } = renderPeriod({ unit, back: 5, today: TODAY, width: 1800, busy })
      assert.ok(source.length < 12_000, `${source.length} chars`)
      assert.match(source, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1800" height="40" /)
      assert.deepEqual([px, h], [1800, 40])
      assert.doesNotMatch(source, /<script|<a\b|href|\son[a-z]+=|<image|<foreignObject/i)
      assert.deepEqual([...source.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]), busy ? ['pd-card', 'Pdblink'] : ['pd-card'])
      assert.doesNotMatch(source, /<animate/)
      assert.equal((source.match(/<set\b/g) ?? []).length, busy ? 1 : 0)
      if (busy) assert.match(source, /<g><text [^>]+>[^<]+<\/text><set id="Pdblink" attributeName="opacity" to="\.3" dur="0\.5s" begin="0s;Pdblink\.end\+0\.5s"\/><\/g>/)
    }
  }
})

test('a key held down is drawn pressed, and one that goes nowhere is not', () => {
  const plain = renderPeriod({ unit: 'week', back: 0, today: TODAY, width: 900 }).source
  assert.notEqual(renderPeriod({ unit: 'week', back: 0, today: TODAY, width: 900, pressed: 'older' }).source, plain)
  assert.equal(renderPeriod({ unit: 'week', back: 0, today: TODAY, width: 900, pressed: 'now' }).source, plain)
  assert.equal(renderPeriod({ unit: 'week', back: 0, today: TODAY, width: 900, pressed: 'nothing' }).source, plain)
})

test('its words are text in the console\'s type, title case as the tabs, each held to its width and inside its LED, window or key', () => {
  const cases = [['OCTOBER 2026', 'October 2026'], ['LAST 30 DAYS', 'Last 30 days'], ['28 SEP-4 OCT', '28 Sep–4 Oct'], ['19-25 OCT 2025', '19–25 Oct 2025'],
    ['FRI 30 OCT', 'Fri 30 Oct'], ['YESTERDAY', 'Yesterday'], ['TODAY', 'Today'], ['AUG 2026', 'Aug 2026']]
  for (const [label, shown] of cases) assert.equal(ledWords(label), shown)
  for (const unit of UNITS) {
    for (const width of [320, 360, 480, 640, 900, 1400]) { // the pane draws it 320 px wide at least (stripWidth)
      for (const back of [0, 1, 5, 44, 400]) {
        const strip = renderPeriod({ unit, back, today: TODAY, width })
        const words = [...strip.source.matchAll(/<text x="([\d.]+)" y="[\d.]+" font-size="([\d.]+)" fill="[^"]+" text-anchor="middle" textLength="(\d+)" lengthAdjust="spacing">([^<]*)<\/text>/g)]
        assert.equal(words.length, (strip.source.match(/<text /g) ?? []).length, `${unit} ${back} ${width}: every word held to its width`)
        assert.equal(words[0][4], ledWords(strip.label).replace(/&/g, '&amp;'))
        // each word fits what holds it: the LED (still[0]), a window, or Now
        for (const [, x, size, len, text] of words) {
          assert.equal(Number(len), Math.ceil([...text].length * Number(size) * 0.6))
          const holder = [...strip.zones, ...strip.still].find((z) => Number(x) > z.x && Number(x) < z.x + z.w)
          assert.ok(holder && Number(len) <= holder.w - 4, `${unit} ${back} ${width}: ${text} in ${holder?.w}`)
        }
        assert.doesNotMatch(strip.source, /NOW|OCTOBER/)
      }
    }
  }
})

test('the Month\'s Export key stands past NOW at the right end: it goes to no page but opens the export row, lit while open, blinking and going nowhere while an export runs', () => {
  for (const width of [320, 360, 600, 900, 1800]) {
    for (const back of [0, 3]) {
      const idle = renderPeriod({ unit: 'month', back, today: TODAY, width, exporter: 'idle' })
      const key = idle.zones.find((z) => z.id === 'export')
      assert.deepEqual({ ...key, x: 0 }, { id: 'export', x: 0, w: 15, back, act: 'export' }, `${width} ${back}`)
      assert.equal(key.x + key.w, idle.W - 6, 'at the right end, inside the plate')
      const now = renderPeriod({ unit: 'month', back, today: TODAY, width }).zones.find((z) => z.id === 'now')
      const nowThen = idle.zones.find((z) => z.id === 'now')
      if (back) assert.equal(nowThen.x + nowThen.w + 3, key.x, 'NOW one gap before it')
      if (now && nowThen) assert.ok(nowThen.x < now.x)
      // a click on its middle lands on it, as the module reads a click from its cell alone
      const at = (key.x + key.w / 2) / idle.W
      assert.equal(zoneAt(idle, at)?.id, 'export')
      // open: still a zone (a press closes the row), the key lit; busy: no zone, its tray blinking
      const open = renderPeriod({ unit: 'month', back, today: TODAY, width, exporter: 'open' })
      assert.ok(open.zones.some((z) => z.id === 'export'))
      assert.notEqual(open.source, idle.source)
      assert.ok(open.source.includes('#f6d860'), 'lit')
      const busy = renderPeriod({ unit: 'month', back, today: TODAY, width, exporter: 'busy' })
      assert.ok(!busy.zones.some((z) => z.id === 'export'))
      assert.ok(busy.still.some((s) => s.x === key.x && s.w === key.w))
      assert.match(busy.source, /<set id="Pdxblink" attributeName="opacity" to="\.3" dur="0\.5s" begin="0s;Pdxblink\.end\+0\.5s"\/>/)
      assert.doesNotMatch(idle.source, /<set\b/)
    }
  }
  // pressed, it sinks; busy, a press draws nothing else
  const idle = renderPeriod({ unit: 'month', back: 1, today: TODAY, width: 900, exporter: 'idle' })
  assert.notEqual(renderPeriod({ unit: 'month', back: 1, today: TODAY, width: 900, exporter: 'idle', pressed: 'export' }).source, idle.source)
  const busy = renderPeriod({ unit: 'month', back: 1, today: TODAY, width: 900, exporter: 'busy' })
  assert.equal(renderPeriod({ unit: 'month', back: 1, today: TODAY, width: 900, exporter: 'busy', pressed: 'export' }).source, busy.source)
  // the alt says it is there; no other strip has it, nor one asked with no such state
  assert.match(idle.alt, /, now and Export\.$/)
  assert.match(busy.alt, /, and Export \(still working\)\.$/)
  for (const exporter of [undefined, null, 'nope']) assert.ok(!renderPeriod({ unit: 'month', back: 1, today: TODAY, width: 900, exporter }).zones.some((z) => z.id === 'export'))
})

test('with the export row hanging under it the strip is square at its foot, and between the tabs and the row square all round, its plate running on under its foot', () => {
  const hanging = renderPeriod({ unit: 'month', back: 1, today: TODAY, width: 900, exporter: 'open', hangs: true })
  assert.match(hanging.source, /<clipPath id="pd-card"><path d="M0 5a5 5 0 0 1 5-5H445a5 5 0 0 1 5 5V20H0z"/)
  const between = renderPeriod({ unit: 'month', back: 1, today: TODAY, width: 900, exporter: 'open', hangs: true, joined: true })
  assert.match(between.source, /<clipPath id="pd-card"><rect width="450" height="20"\/><\/clipPath><path fill="#241c17" d="M0 20h450v2h-450z"\/>/)
  assert.match(between.source, /<path d="M\.25 0V20M449\.75 0V20" fill="none"/)
  assert.doesNotMatch(renderPeriod({ unit: 'month', back: 1, today: TODAY, width: 900, joined: true }).source, /d="M0 20h450v2h-450z"/)
})
