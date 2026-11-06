// The timelapse (lib/svg.mjs renderTimelapse, the scene in lib/svg-timelapse.mjs): one self-animating SVG replaying
// facts.timeline slot by slot on one loop that every timeline animation shares (TIMELAPSE: a quarter of a second a slot,
// a hold on the last one). These pin what the pane, the export page and the size budget rely on: a well-formed, safe
// drawing under MAX_SVG for every range, width and load; the loop said on the root; every timeline animation on that
// loop with its keys in order; the replay showing, slot by slot, the desks at work then (at a desk, or on its room's
// +N) and the replayed time on the sign's line, in gold right after the play mark (read by evaluating the drawing's
// discrete animations at that moment); that clock and the sign's lines inside the sign at every width; the reel's
// lanes, totals, peak and day tag; the meeting room on one row; a still of the busiest slot with no SMIL at all; the
// building closed when there is nothing to replay; no backdrop on the page, every thing in the scene still on it.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { SVG_VIEWS, TIMELAPSE, renderSvg, renderTimelapse } from '../plugin/lib/svg.mjs'
import { CLOUD_BOX, CLOUD_TINTS, INFO, K, MAX_SVG, ORB, ROLE, ROOF_PROPS, SKY, SUN_TONES, paint, pixRuns, signBox, textW } from '../plugin/lib/svg-kit.mjs'
import { motionPoint } from '../plugin/lib/timelapse-player.mjs'
import { LAPSE_LADDER, coarsen, lapseTimeline } from '../plugin/lib/svg-timelapse.mjs'
import { LAPSE_WORDS, cropTimeline, lapseSlot } from '../plugin/lib/model.mjs'
import { SAMPLE, clone, timelapseFacts } from './helpers/facts.mjs'

const KINDS = ['yesterday', 'week', 'month']
/** The timeline as the replay plays it: cut to where something happened (model.mjs cropTimeline). */
const cut = (f) => cropTimeline(f.timeline)
const LOADS = { plain: {}, heavy: { heavy: true }, clawd: { claudeOnly: true } }
// The skyline's props, each as written: the roof's sprites over the roof line, the pigeons on the coping apart.
const skylineOf = (svg) => [...svg.matchAll(/<use href="#tl-rf-([a-z]+)" x="\d+" y="(\d+)"\/>/g)].filter((m) => m[1] !== 'pigeon' && Number(m[2]) < SKY).map((m) => m[0])

// Built from char codes so no editor or tool ever normalizes them away: BEL, ESC-CSI, RLO bidi override, a lone surrogate.
const CTRL = String.fromCharCode(7) + String.fromCharCode(27) + '[31m' + String.fromCharCode(0x202e) + String.fromCharCode(0xd800)
const NASTY = `<script>alert(1)</script> & "x" ${CTRL} 'q' ${String.fromCodePoint(0x1f600)} é`

// ---------------------------------------------------------------- tiny checkers (as test/svg.test.mjs's)

// Balanced tags, no raw `<` or bare `&` in text, quoted attributes, no duplicate attributes. Returns the first problem or ''.
function xmlProblem(src) {
  const stack = []
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|<!--[\s\S]*?-->|([^<]+)|(<)/g
  let m
  let pos = 0
  while ((m = re.exec(src))) {
    if (m.index !== pos) return `gap at ${pos}`
    pos = re.lastIndex
    if (m[6]) return `stray < at ${m.index}: ${src.slice(m.index, m.index + 40)}`
    if (m[5] != null) {
      const bad = /&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/i.exec(m[5])
      if (bad) return `bare & at ${m.index + bad.index}`
      continue
    }
    if (!m[2]) continue
    const names = [...(m[3] ?? '').matchAll(/([\w:.-]+)=/g)].map((a) => a[1])
    if (new Set(names).size !== names.length) return `duplicate attribute in <${m[2]}>`
    if (m[1]) {
      const open = stack.pop()
      if (open !== m[2]) return `</${m[2]}> closes <${open}>`
    } else if (!m[4]) stack.push(m[2])
  }
  if (pos !== src.length) return `trailing garbage at ${pos}`
  return stack.length ? `unclosed <${stack.at(-1)}>` : ''
}

function unsafe(src) {
  const hits = []
  if (/<script/i.test(src)) hits.push('script')
  if (/<foreignObject/i.test(src)) hits.push('foreignObject')
  if (/<iframe|<object|<embed|<image\b|<img\b|<link\b/i.test(src)) hits.push('embed')
  if (/\son[a-z]+\s*=/i.test(src)) hits.push('on* attribute')
  if (/\b(?:href|xlink:href|src|action)\s*=\s*(?!["']?#)/i.test(src)) hits.push('external href')
  if (/url\(\s*(?!["']?#)/i.test(src)) hits.push('external url()')
  if (/@import|javascript:/i.test(src)) hits.push('import/javascript')
  return hits
}

const ids = (src) => [...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])

function wellFormed(svg, what) {
  assert.equal(xmlProblem(svg), '', what)
  assert.deepEqual(unsafe(svg.replace(' xmlns="http://www.w3.org/2000/svg"', '')), [], what)
  const all = ids(svg)
  assert.equal(new Set(all).size, all.length, `${what}: duplicate ids`)
  for (const ref of svg.matchAll(/(?:href="#|url\(#)([^")]+)/g)) assert.ok(all.includes(ref[1]), `${what}: dangling #${ref[1]}`)
  assert.ok(svg.length <= MAX_SVG, `${what}: ${svg.length} chars`)
}

const root = (svg) => Object.fromEntries([...svg.slice(0, svg.indexOf('>')).matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))

// ---------------------------------------------------------------- a tiny SMIL evaluator

/** The drawing as a tree of { tag, attrs, kids, up } and text nodes { text, up }. */
function tree(src) {
  const top = { tag: '#root', attrs: {}, kids: [] }
  let at = top
  for (const m of src.matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|([^<]+)/g)) {
    if (m[5] != null) {
      at.kids.push({ text: m[5], up: at })
      continue
    }
    if (m[1]) {
      at = at.up
      continue
    }
    const node = { tag: m[2], attrs: Object.fromEntries([...(m[3] ?? '').matchAll(/([\w:.-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])), kids: [], up: at }
    at.kids.push(node)
    if (!m[4]) at = node
  }
  return top
}
const walk = (n, fn) => {
  fn(n)
  for (const k of n.kids ?? []) walk(k, fn)
}
const textOf = (n) => (n.text != null ? n.text : n.kids.map(textOf).join(''))

/** An animation's value at `t` seconds (only the replay's own: dur D, begin 0), discrete or linear. */
function valueAt(a, t) {
  const D = parseFloat(a.attrs.dur)
  const vals = a.attrs.values.split(';')
  const keys = a.attrs.keyTimes.split(';').map(Number)
  const u = Math.min(1, t / D)
  if (a.attrs.calcMode === 'discrete') {
    let k = 0
    for (let i = 0; i < keys.length; i++) if (keys[i] <= u) k = i
    return vals[k]
  }
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i]) {
      const f = keys[i] === keys[i - 1] ? 1 : (u - keys[i - 1]) / (keys[i] - keys[i - 1])
      const [x0, x1] = [vals[i - 1], vals[i]].map((v) => Number(v.split(' ')[0]))
      return String(x0 + (x1 - x0) * f)
    }
  }
  return vals.at(-1)
}
const replayAnim = (n, attr, D) => n.kids?.find((k) => /^animate/.test(k.tag) && k.attrs.attributeName === attr && Number(k.attrs.dur.replace('s', '')) === D)
const displayAt = (n, t, D) => {
  const a = replayAnim(n, 'display', D)
  return a ? valueAt(a, t) : n.attrs?.display ?? 'inline'
}
const shownAt = (n, t, D) => {
  for (let p = n; p && p.tag !== '#root'; p = p.up) if (p.attrs && displayAt(p, t, D) === 'none') return false
  return true
}
// a translate at t: the replay's animation of it, else the transform attribute ([x, y])
const translateAt = (n, t, D) => {
  const a = replayAnim(n, 'transform', D)
  const v = a ? valueAt(a, t) : /translate\(([^)]*)\)/.exec(n.attrs.transform ?? '')?.[1] ?? '0'
  const [x, y = '0'] = v.trim().split(/[\s,]+/)
  return [Number(x), Number(y)]
}

// a window one line tall that glyphs slide through (lp-clk): the clocks' strips and the +N badges'
const isStrip = (n) => n.tag === 'g' && /lp-clkc/.test(n.attrs['clip-path'] ?? '')
const inStrip = (n) => {
  for (let p = n.up; p && p.tag !== '#root'; p = p.up) if (isStrip(p)) return true
  return false
}

/**
 * What the replay shows at `t` seconds: the desks at work (a desk's state strip slid so its working character sits in
 * the window, or a desk at work all along), the `+N` badges of sessions at work beyond a room's desks (the line of
 * their strip in its window; a still's plain text), and the replayed clock, the text right after the play mark on the
 * sign's line (its constant text, its switched glyphs, and its strips' glyphs in their window).
 */
function stateAt(svg, t) {
  const D = Number(root(svg)['data-loop'])
  const doc = tree(svg.slice(svg.indexOf('</defs>') + 7, -6))
  let working = 0
  let extra = 0
  let clock = null
  const strips = []
  walk(doc, (n) => {
    if (n.tag === 'use' && /lp-w/.test(n.attrs.href) && shownAt(n, t, D)) {
      const strip = n.up.up?.attrs?.['clip-path'] ? n.up : null
      if (!strip || Number(n.attrs.x ?? 0) + translateAt(strip, t, D)[0] === 0) working++
    }
    // a room's badge (the meeting room's counts meetings, not desks)
    if (n.tag === 'text' && n.attrs.fill === ROLE.busy && /^\+\d+$/.test(textOf(n)) && !inStrip(n) && shownAt(n, t, D)) extra += Number(textOf(n).slice(1))
    if (n.tag === 'text' && textOf(n) === '▶ ' && !clock) {
      const kin = n.up.kids
      clock = kin.slice(kin.indexOf(n) + 1).find((k) => k.tag === 'text')
    }
    if (isStrip(n)) {
      const inner = n.kids.find((k) => k.tag === 'g')
      const text = inner?.kids.find((k) => k.tag === 'text')
      if (text?.attrs['font-size'] !== '5') strips.push(n)
      else if (text.attrs.fill === ROLE.busy && shownAt(n, t, D)) {
        const dy = -translateAt(inner, t, D)[1]
        const line = text.kids.find((k) => k.tag === 'tspan' && Number(k.attrs.y) === dy)
        if (line) extra += Number(textOf(line).slice(1))
      }
    }
  })
  // the clock as columns: a strip's glyph is end-anchored past its hidden rest, so it sits in its hold's place only when
  // that rest is as wide as what follows the hold in the line at t (`misplaced` counts the strips that are not)
  const segs = []
  let k = 0
  for (const c of clock?.kids ?? []) {
    if (c.text != null) segs.push({ text: c.text })
    else if (c.attrs['fill-opacity'] === '0') {
      const g = strips[k++].kids[0]
      const dy = -translateAt(g, t, D)[1]
      const line = g.kids.find((x) => x.tag === 'text').kids.find((x) => Number(x.attrs.y) === dy)
      const glyph = line.kids.find((x) => x.text != null).text
      segs.push({ text: glyph, rest: textOf(line).length - glyph.length })
    } else if (shownAt(c, t, D)) segs.push({ text: textOf(c) })
  }
  const misplaced = segs.filter((s, j) => s.rest != null && s.rest !== segs.slice(j + 1).reduce((n, x) => n + x.text.length, 0)).length
  return { working, extra, clock: segs.map((s) => s.text).join(''), misplaced }
}

/** Desks at work at slot i, from the timeline itself. */
const atWork = (tl, i) => tl.desks.filter((d) => d.runs.some(([a, b]) => a <= i && i < b)).length

/**
 * A line of text at `t`: its constant text, its switched glyphs, and for each hold (an invisible glyph keeping a
 * strip's room) the glyph that `strips`' next strip shows in its window.
 */
function lineAt(text, strips, t, D) {
  let k = 0
  let s = ''
  for (const c of text.kids) {
    if (c.text != null) s += c.text
    else if (c.attrs['fill-opacity'] === '0') {
      const g = strips[k++].kids.find((x) => x.tag === 'g')
      const dy = -translateAt(g, t, D)[1]
      const line = g.kids.find((x) => x.tag === 'text').kids.find((x) => Number(x.attrs.y) === dy)
      s += line.kids.find((x) => x.text != null).text
    } else if (shownAt(c, t, D)) s += textOf(c)
  }
  return s
}

/** The reel's group (its tooltip first) in a drawing's tree. */
function reelOf(doc) {
  let reel = null
  walk(doc, (n) => {
    if (!reel && n.tag === 'g' && n.kids[0]?.tag === 'title' && textOf(n.kids[0]).startsWith('the reel:')) reel = n
  })
  return reel
}

/** The +N a badge strip of `fill` shows at `t` ('' for none). */
function badgeAt(doc, fill, t, D) {
  let out = ''
  walk(doc, (n) => {
    if (out || !isStrip(n)) return
    const inner = n.kids.find((k) => k.tag === 'g')
    const text = inner?.kids.find((k) => k.tag === 'text')
    if (text?.attrs.fill !== fill || text.attrs['font-size'] !== '5') return
    const dy = -translateAt(inner, t, D)[1]
    out = textOf(text.kids.find((k) => k.tag === 'tspan' && Number(k.attrs.y) === dy) ?? { text: '' })
  })
  return out
}

// ---------------------------------------------------------------- the drawing

describe('renderTimelapse', () => {
  test('every range, load and width is well-formed, safe, with unique ids and no dangling reference, under MAX_SVG', () => {
    for (const kind of KINDS) {
      for (const [load, opts] of Object.entries(LOADS)) {
        for (const width of [240, 333, 480, 720, 960, 1400, 1800, 2400]) {
          const svg = renderTimelapse(timelapseFacts(kind, opts), { width })
          wellFormed(svg, `${kind} ${load} ${width}`)
          assert.match(svg, /<animate/, `${kind} ${load} ${width}: always animated`)
        }
      }
    }
    for (const kind of KINDS) wellFormed(renderTimelapse(timelapseFacts(kind, { heavy: true }), { transparent: true }), `${kind} transparent`)
  })

  test('the root says how the replay runs: range, loop, slots, pace', () => {
    assert.deepEqual(TIMELAPSE, { SLOT_SECONDS: 0.05, HOLD_SECONDS: 2.5 })
    assert.ok(Object.isFrozen(TIMELAPSE))
    for (const kind of KINDS) {
      const f = timelapseFacts(kind)
      const svg = renderTimelapse(f)
      const r = root(svg)
      assert.equal(r['data-timelapse'], kind)
      assert.equal(Number(r['data-slots']), cut(f).slots, `${kind}: the plain fixture replays every slot of its cut range`)
      assert.equal(Number(r['data-loop']), Math.round((cut(f).slots * 0.05 + 2.5) * 1000) / 1000)
      assert.equal(r['data-slot-seconds'], '0.05')
      assert.equal(r['data-hold'], '2.5')
      assert.equal(r.width, '960')
      assert.equal(r.viewBox, `0 0 480 ${Math.round(Number(r.height) / 2)}`)
      assert.equal(r.role, 'img')
      assert.equal(r['shape-rendering'], 'crispEdges')
      assert.match(r['aria-label'], new RegExp(`^The Office timelapse, ${LAPSE_WORDS[kind]} \\(.+\\): \\d+ sessions in \\d+ projects, busiest .+ with \\d+ at work$`))
      assert.ok(svg.includes(`<title>${r['aria-label']}</title>`))
    }
    const week = root(renderTimelapse(timelapseFacts('week')))['aria-label']
    assert.ok(week.startsWith('The Office timelapse, this week (Tue 20 Oct → Mon 26 Oct): 92 sessions in 7 projects, busiest '), week)
  })

  test('every timeline animation runs on the loop: dur D from 0, values and keyTimes paired, keyTimes from 0 up to 1, never back', () => {
    for (const kind of KINDS) {
      for (const [load, opts] of Object.entries(LOADS)) {
        const svg = renderTimelapse(timelapseFacts(kind, opts))
        const D = Number(root(svg)['data-loop'])
        let replay = 0
        for (const [a] of svg.matchAll(/<animate(?:Transform)?\b[^>]*>/g)) {
          const at = Object.fromEntries([...a.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
          const dur = parseFloat(at.dur)
          // the rest are the office's own short loops (typing arms, blinks, flicker, bulbs, steam)
          if (dur !== D) {
            assert.ok(dur <= 10, `${kind} ${load}: a ${dur}s loop`)
            continue
          }
          replay++
          assert.equal(at.dur, `${D}s`)
          assert.equal(at.begin, undefined, 'begins with the loop')
          assert.equal(at.repeatCount, 'indefinite')
          const keys = at.keyTimes.split(';').map(Number)
          assert.equal(keys.length, at.values.split(';').length, `${kind} ${load}: ${a.slice(0, 120)}`)
          assert.equal(keys[0], 0)
          assert.ok(keys.every((k, i) => k >= 0 && k <= 1 && (!i || k >= keys[i - 1])), `${kind} ${load}: ${at.keyTimes.slice(0, 80)}`)
          if (at.attributeName === 'display') assert.equal(at.calcMode, 'discrete')
        }
        assert.ok(replay > 20, `${kind} ${load}: ${replay} replay animations`)
      }
    }
  })

  test('the same facts give the same string', () => {
    for (const kind of KINDS) {
      const f = timelapseFacts(kind, { heavy: true })
      assert.equal(renderTimelapse(f, { width: 900 }), renderTimelapse(clone(f), { width: 900 }))
      assert.equal(renderTimelapse(f, { animate: false }), renderTimelapse(timelapseFacts(kind, { heavy: true }), { animate: false }))
    }
  })

  test('slot by slot, the replay shows every desk at work then (at its desk, or on its room\'s +N), and the replayed time', () => {
    for (const kind of KINDS) {
      for (const opts of [{}, { heavy: true }]) {
        const f = timelapseFacts(kind, opts)
        const svg = renderTimelapse(f)
        const tl = cut(f)
        if (Number(root(svg)['data-slots']) !== tl.slots) continue // a coarser replay: its slots are not the timeline's
        const step = Math.max(1, Math.floor(tl.slots / 23))
        for (let i = 0; i < tl.slots; i += step) {
          const s = stateAt(svg, (i + 0.5) * TIMELAPSE.SLOT_SECONDS)
          assert.equal(s.working + s.extra, atWork(tl, i), `${kind} ${opts.heavy ? 'heavy' : 'plain'} slot ${i}`)
          assert.equal(s.clock, lapseSlot(tl, i).label, `${kind} slot ${i}`)
          assert.equal(s.misplaced, 0, `${kind} slot ${i} (${s.clock}): a clock glyph out of its place`)
        }
        // the last slot holds through the loop's hold
        const last = stateAt(svg, tl.slots * TIMELAPSE.SLOT_SECONDS + 2)
        assert.equal(last.clock, lapseSlot(tl, tl.slots - 1).label)
      }
    }
  })

  test('at the busiest slot as many desks work as the timeline had at work, and a surface without SMIL shows that slot', () => {
    for (const kind of KINDS) {
      const f = timelapseFacts(kind)
      const tl = cut(f)
      let b = 0
      for (let i = 1; i < tl.slots; i++) if (atWork(tl, i) > atWork(tl, b)) b = i
      const svg = renderTimelapse(f)
      const s = stateAt(svg, (b + 0.5) * TIMELAPSE.SLOT_SECONDS)
      assert.equal(s.working + s.extra, atWork(tl, b), kind)
      assert.ok(s.working > 0, kind)
      assert.ok(root(svg)['aria-label'].includes(`busiest ${lapseSlot(tl, b).label} with ${atWork(tl, b)} at work`), kind)
      // the base attributes (no animation run): the same desks at work, the same time on the clock
      const bare = svg.replace(/<animate(?:Transform)?\b[^>]*\/>/g, '')
      const still = stateAt(bare, 0)
      assert.equal(still.working + still.extra, atWork(tl, b), `${kind}: base attributes`)
    }
  })

  test('a still is the busiest slot without any SMIL', () => {
    for (const kind of KINDS) {
      const f = timelapseFacts(kind)
      const still = renderTimelapse(f, { animate: false })
      wellFormed(still, `${kind} still`)
      assert.doesNotMatch(still, /<animate|<set\b/)
      const tl = f.timeline
      let b = 0
      for (let i = 1; i < tl.slots; i++) if (atWork(tl, i) > atWork(tl, b)) b = i
      assert.match(still, new RegExp(`>▶</tspan><tspan fill="[^"]+"> </tspan></text><text x="[\\d.]+" y="[\\d.]+" font-size="${INFO.size}" text-anchor="end" fill="${ROLE.accent}">${lapseSlot(tl, b).label}</text>`),
        `${kind}: the busiest slot's time on the sign, in gold after the play mark`)
      assert.equal(stateAt(still, 0).working, atWork(tl, b), kind)
      // the same root as the animated drawing: the page can read the pace off a still too
      assert.equal(root(still)['data-loop'], root(renderTimelapse(f))['data-loop'])
    }
  })

  test('the reel: three lanes named with the range\'s totals, the busiest slot flagged, the replayed day on a tag that rides the playhead inside the reel', () => {
    const day = {
      yesterday: (s) => `${s.hm.slice(0, 2)}:00`,
      week: (s) => s.wd.toUpperCase(),
      month: (s) => `${s.mon.toUpperCase()} ${s.d}`,
    }
    for (const kind of KINDS) {
      const f = timelapseFacts(kind)
      const tl = cut(f)
      const svg = renderTimelapse(f, { width: 960 })
      const D = Number(root(svg)['data-loop'])
      const reel = reelOf(tree(svg.slice(svg.indexOf('</defs>') + 7, -6)))
      assert.ok(reel, `${kind}: the reel`)
      const words = []
      walk(reel, (n) => { if (n.tag === 'text' && n.attrs['font-size'] === '4.5') words.push(textOf(n)) })
      for (const w of ['SESSIONS', 'INTERNS', 'COMMITS']) assert.ok(words.includes(w), `${kind}: the ${w} lane`)
      assert.equal((svg.match(/\) scale\(2\)">/g) ?? []).length, 3, `${kind}: each total in big pixel figures`)
      let b = 0
      for (let i = 1; i < tl.slots; i++) if (atWork(tl, i) > atWork(tl, b)) b = i
      assert.ok(words.includes(`PEAK ${atWork(tl, b)}`), `${kind}: the busiest slot flagged (${words})`)
      // the tag: the replayed hour (yesterday), weekday (the week) or date (the month), slot by slot
      const tagG = reel.kids.filter((k) => k.tag === 'g' && k.kids.some((x) => x.tag === 'text' && x.attrs.fill === ROLE.accent)).at(-1)
      const text = tagG.kids.find((x) => x.tag === 'text')
      const strips = tagG.kids.filter(isStrip)
      const step = Math.max(1, Math.floor(tl.slots / 17))
      for (let i = 0; i < tl.slots; i += step) assert.equal(lineAt(text, strips, (i + 0.5) * TIMELAPSE.SLOT_SECONDS, D), day[kind](lapseSlot(tl, i)), `${kind} slot ${i}`)
      // held inside the reel's film at both ends, and centered on the playhead in between
      const TW = Number(/M0 [\d.]+h(\d+)/.exec(tagG.kids.find((x) => x.tag === 'path').attrs.d)[1])
      const xs = replayAnim(tagG, 'transform', D).attrs.values.split(';').map(Number)
      assert.ok(Math.min(...xs) >= 13 - 0.01 && Math.max(...xs) + TW <= 480 - 13 + 0.01, `${kind}: the tag from ${Math.min(...xs)} to ${Math.max(...xs) + TW}`)
      const head = reel.kids.find((k) => k.tag === 'g' && replayAnim(k, 'transform', D) && k !== tagG)
      const lineX = Number(/M([\d.]+) /.exec(head.kids.filter((x) => x.tag === 'path').at(-1).attrs.d)[1])
      const mid = (Math.floor(tl.slots / 2) + 0.5) * TIMELAPSE.SLOT_SECONDS
      assert.ok(Math.abs(translateAt(tagG, mid, D)[0] + TW / 2 - (lineX + translateAt(head, mid, D)[0])) <= 1, `${kind}: the tag over the playhead`)
      // each lane's total is the sign's, in the lane's color: in big figures, or in bold type where they do not fit
      for (const w of [960, 333, 240]) {
        const drawn = w === 960 ? svg : renderTimelapse(f, { width: w })
        for (const [word, fill] of [['session', ROLE.busy], ['intern', ROLE.intern], ['commit', ROLE.ship]]) {
          const n = new RegExp(`<tspan fill="[^"]+">(\\d+) ${word}s?</tspan>`).exec(svg)?.[1]
          const big = `scale(2)">${paint(pixRuns(n, 0, 0, fill))}</g>`
          const type = `fill="${fill}" text-anchor="end" font-weight="bold">${n}</text>`
          assert.ok(n && (drawn.includes(big) || drawn.includes(type)), `${kind}: ${n} ${word}s on its lane at ${w} px`)
        }
      }
      // a still: the busiest slot's day on the tag
      const still = renderTimelapse(f, { width: 960, animate: false })
      assert.ok(still.includes(`text-anchor="end" fill="${ROLE.accent}">${day[kind](lapseSlot(tl, b))}</text>`), `${kind}: the still's tag`)
    }
  })

  test('the meeting room is one row of tables, as many as fit the floor; the meetings beyond them show on its +N', () => {
    const f = timelapseFacts('week')
    f.timeline.meetings = Array.from({ length: 5 }, (_, i) => ({ project: 'harborledger', name: `flow ${i}`, from: 40, to: 46, agents: 3 }))
    const m = cut(f).meetings[0]
    for (const [width, tables] of [[640, 1], [960, 3]]) {
      const svg = renderTimelapse(f, { width })
      const D = Number(root(svg)['data-loop'])
      assert.equal((svg.match(/<title>\d+ meetings?: /g) ?? []).length, tables, `${width}: ${tables} tables`)
      const doc = tree(svg.slice(svg.indexOf('</defs>') + 7, -6))
      // from their first slot to their last, then gone
      const at = (u) => badgeAt(doc, ROLE.meeting, u * TIMELAPSE.SLOT_SECONDS, D)
      assert.deepEqual([m.from - 0.5, m.from + 0.5, m.to - 0.5, m.to + 0.5].map(at), ['', `+${5 - tables}`, `+${5 - tables}`, ''], `${width}: the meetings beyond the tables`)
    }
  })

  test('a room says its agent-time first, so a narrow room keeps it', () => {
    for (const width of [480, 960]) {
      const svg = renderTimelapse(timelapseFacts('week'), { width })
      const heads = [...svg.matchAll(/<text x="[\d.]+" y="[\d.]+" font-size="5"><tspan fill="[^"]+">([^<]+)<\/tspan>/g)].map((m) => m[1])
        .filter((first) => !first.startsWith('+') && !/meeting/.test(first))
      assert.ok(heads.length >= 4, `${width}: ${heads}`)
      for (const first of heads) assert.match(first, /^\d+(?:\.\d+)?[hm]$/, `${width}: a room's first number is its agent-time`)
    }
  })

  test('the replayed clock stands on the sign\'s line in gold right after the play mark, and the sign\'s lines stay inside it, at every width', () => {
    for (const kind of KINDS) {
      const f = timelapseFacts(kind)
      const tl = f.timeline
      const clockW = Math.max(...Array.from({ length: tl.slots }, (_, i) => textW(lapseSlot(tl, i).label, INFO.size)))
      for (const width of [240, 333, 480, 720, 960, 1400, 2400]) {
        for (const animate of [true, false]) {
          const svg = renderTimelapse(f, { width, animate })
          const what = `${kind} ${width}${animate ? '' : ' still'}`
          const { x, w } = signBox(Number(root(svg).viewBox.split(' ')[2]))
          const [left, right] = [x + 6 - 0.1, x + w - 6 + 0.1]
          // the play mark then the clock in gold, end-anchored at the end of its room, on the sign's first line
          const m = new RegExp(`<text x="([\\d.]+)" y="([\\d.]+)" font-size="5.5"><tspan fill="${ROLE.accent}">▶</tspan><tspan fill="[^"]+"> </tspan></text><text x="([\\d.]+)" y="([\\d.]+)" font-size="5.5" text-anchor="end" fill="${ROLE.accent}">`).exec(svg)
          assert.ok(m, `${what}: the clock after the play mark`)
          const [lx, ly, cx, cy] = m.slice(1).map(Number)
          assert.ok([INFO.one, INFO.two[0]].includes(ly) && cy === ly, `${what}: on the sign's first line (y ${ly}, ${cy})`)
          assert.ok(lx >= left && cx - clockW >= lx + textW('▶ ', INFO.size) - 0.1 && cx <= right, `${what}: ${lx}..${cx} on a sign ${x}..${x + w}`)
          // every run of text on the sign's lines between its margins
          for (const t of svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)" font-size="5\.5"( text-anchor="middle")?>(.*?)<\/text>/g)) {
            if (![INFO.one, ...INFO.two].includes(Number(t[2]))) continue
            const tw = textW(t[4].replace(/<[^>]+>/g, ''), INFO.size)
            const x0 = Number(t[1]) - (t[3] ? tw / 2 : 0)
            assert.ok(x0 >= left && x0 + tw <= right, `${what}: '${t[4].replace(/<[^>]+>/g, '')}' at ${x0}..${x0 + tw} on a sign ${x}..${x + w}`)
          }
        }
      }
    }
  })

  test('transparent paints no backdrop: no root background, no sky bands, no ground; the sign, the crown and the skyline stay', () => {
    const f = timelapseFacts('week')
    const opaque = renderTimelapse(f)
    const page = renderTimelapse(f, { transparent: true })
    assert.match(opaque, /^<svg [^>]*style="background:#14120f"/)
    assert.doesNotMatch(page.slice(0, page.indexOf('>')), /style=/)
    // the sky's bands from the top down to the street, by night, dawn, day and dusk (the reel's nights are a thing in
    // the drawing, not backdrop)
    const wash = /<g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-dasharray="1">(?:<path color="#[0-9a-f]{6}" d="M-2 \d+h484v\d+H-2z"\/>)+<\/g>/g
    assert.equal(opaque.match(wash)?.length, 4, 'the night, the dawn, the day and the dusk')
    assert.doesNotMatch(page, wash)
    assert.ok(opaque.includes(`fill="${K.ground}"`) && !page.includes(`fill="${K.ground}"`))
    // what stands in the scene is painted on the page too: the sign and its neon, the parapet's brick and its coping,
    // the quoins, the skyline
    const { x, w } = signBox(480)
    for (const thing of [`<path fill="#1a1613" d="M${x} 2h${w}v40h-${w}z`, '<use href="#tl-neon-0"', '<use href="#tl-neon-1"',
      `<rect x="6" y="${SKY - 3}" width="468" height="3" fill="url(#tl-brick)"/>`, `<path fill="#b29d7d" d="M3 ${SKY - 5}h474`,
      'fill="url(#tl-quoin-l)"', 'fill="url(#tl-quoin-r)"', '<use href="#tl-rf-pigeon"', ...skylineOf(opaque)]) {
      assert.ok(opaque.includes(thing) && page.includes(thing), thing)
    }
    assert.ok(skylineOf(opaque).length >= 4, 'the skyline on both sides of the sign')
  })

  test('the sky goes through the day as a timelapse\'s does: the night, the dawn, the day, the dusk, each fading into the next', () => {
    // a day worked from midnight to midnight: nothing cut, slot i at i quarters past midnight
    const all = timelapseFacts('yesterday')
    all.timeline.desks.push({ id: 'owl', project: 'harborledger', runs: [[0, 1], [95, 96]] })
    assert.equal(cut(all).start ?? 0, 0)
    const svg = renderTimelapse(all)
    const D = Number(root(svg)['data-loop'])
    // the lights over the night, in order: the dawn, the day, the dusk, each a group whose opacity the replay moves
    const lights = [...svg.matchAll(/<g opacity="[\d.]+"><animate attributeName="opacity" values="([^"]+)" keyTimes="([^"]+)" dur="([\d.]+)s" repeatCount="indefinite"\/>/g)]
    assert.equal(lights.length, 3)
    assert.ok(lights.every((m) => Number(m[3]) === D), 'on the loop')
    const at = (hh, mm = 0) => lights.map((m) => {
      const a = { attrs: { dur: `${D}s`, values: m[1], keyTimes: m[2] } }
      // to a tenth: the lights' keys are kept to three decimals of the loop
      return Math.round(Number(valueAt(a, ((hh * 60 + mm) / 15) * TIMELAPSE.SLOT_SECONDS)) * 10) / 10
    })
    assert.deepEqual(at(3), [0, 0, 0], '03:00, the night')
    assert.deepEqual(at(5, 45), [0.5, 0, 0], '05:45, the dawn coming')
    assert.deepEqual(at(7), [1, 0, 0], '07:00, the dawn')
    assert.deepEqual(at(8), [1, 0.5, 0], '08:00, the day coming over it')
    assert.deepEqual(at(12), [0, 1, 0], 'noon')
    assert.deepEqual(at(16, 30), [0, 1, 0.5], '16:30, the dusk coming')
    assert.deepEqual(at(18), [0, 0, 1], '18:00, the dusk')
    assert.deepEqual(at(19, 30), [0, 0, 0.5], '19:30, going into the night')
    assert.deepEqual(at(22), [0, 0, 0], '22:00, the night')
    // in every light, over its bands, the sun where it shows (gold by day, low and orange under the dawn and the dusk),
    // then its clouds in its own tint: they pass in front of it, and a light coming in over another never washes the sun
    // out; the moon in the night's alone (the dawn fades it as it sets)
    const parts = { night: svg.slice(0, lights[0].index), dawn: svg.slice(lights[0].index, lights[1].index), day: svg.slice(lights[1].index, lights[2].index), dusk: svg.slice(lights[2].index) }
    for (const [light, part] of Object.entries(parts)) {
      const clouds = part.indexOf(`<use href="#tl-lp-cl" color="${CLOUD_TINTS[light][0]}"`)
      assert.ok(clouds > 0, `${light}: its clouds, in its tint`)
      const sun = part.indexOf('<use href="#tl-lp-sun"')
      const moon = part.indexOf('<use href="#tl-lp-moon"')
      if (light !== 'night') assert.ok(sun > 0 && sun < clouds && part.includes(`color="${SUN_TONES[light === 'day' ? 'high' : 'low'][0]}"`), `${light}: the sun under its clouds, in its colors`)
      assert.ok(light === 'night' ? moon > 0 && moon < clouds : moon < 0, `${light}: the moon`)
    }
    // the clouds sail a drawing's width a loop, the near ones twice
    const field = /<g id="tl-lp-cl">(.*?)<\/g><g id=/.exec(svg)?.[1] ?? ''
    for (const dur of [D, Math.round(D * 500) / 1000]) {
      assert.ok(field.includes(`<animateTransform attributeName="transform" type="translate" values="0;-480" keyTimes="0;1" dur="${dur}s" repeatCount="indefinite"/>`), `clouds on a ${dur}s loop`)
    }
    assert.ok(!svg.slice(lights[0].index).includes(`fill="${K.star}"`) && svg.slice(0, lights[0].index).includes(K.star), 'the stars under the lights')
    // a still is in the light of the busiest slot, nothing moving, its clouds where the sign leaves sky
    const still = renderTimelapse(timelapseFacts('yesterday'), { animate: false })
    assert.doesNotMatch(still, /attributeName="opacity" values/)
    const { x: signX, w: signW } = signBox(480)
    const clouds = [...still.matchAll(/<use href="#tl-cl-([a-zA-Z]+)" x="(\d+)"/g)].map((m) => [Number(m[2]), CLOUD_BOX[m[1]][0]])
    assert.ok(clouds.length >= 2 && clouds.every(([x, w]) => x + w <= signX || x >= signX + signW), `clouds at ${clouds}`)
  })

  test('the sun and the moon rise between the roof\'s props, climb beside the sign, pass behind it and set behind the roof: one even pace, never a jump where they show', () => {
    const { x: signX, w: signW } = signBox(480)
    for (const kind of KINDS) {
      for (const load of [{}, { heavy: true }]) {
        const f = timelapseFacts(kind, load)
        const svg = renderTimelapse(f)
        const D = Number(root(svg)['data-loop'])
        const S = Number(root(svg)['data-slots'])
        const props = skylineOf(svg).map((u) => /#tl-rf-([a-z]+)" x="(\d+)"/.exec(u)).map((m) => ({ ...ROOF_PROPS[m[1]], x: Number(m[2]) }))
        for (const name of ['sun', 'moon']) {
          const what = `${kind}${load.heavy ? ' heavy' : ''} ${name}`
          // the full sky's body moves as a sprite every light shows it through; the lean sky's moves itself
          const m = new RegExp(`(?:<g id="tl-lp-${name}"><use href="#tl-${name}" x="(\\d+)" y="(\\d+)"/>|<use href="#tl-${name}-s" x="(\\d+)" y="(\\d+)">)` +
            '<animateMotion path="([^"]+)" keyPoints="([^"]+)" keyTimes="([^"]+)" calcMode="linear" dur="([\\d.]+)s" repeatCount="indefinite"/>').exec(svg)
          assert.ok(m, `${what}: it moves`)
          assert.equal(Number(m[8]), D, `${what}: on the replay's loop`)
          const base = [Number(m[1] ?? m[3]), Number(m[2] ?? m[4])]
          const at = (p) => motionPoint(m[5], p).map((v, i) => v + base[i])
          const ps = m[6].split(';').map(Number)
          const ts = m[7].split(';').map(Number)
          assert.equal(ps.length, ts.length, what)
          assert.ok(ts.every((t, i) => !i || t >= ts[i - 1]) && ps.every((p) => p >= 0 && p <= 1), `${what}: its keys in order, along its way`)
          // its way: from under the coping, up beside the sign to its corner, along behind it, down to under the coping
          // on the other side; its ends, a body's halo and all, out of sight, its top inside the drawing
          const [x0, low] = at(0)
          const [x1, low1] = at(1)
          assert.ok(low === low1 && low - ORB.far >= SKY - 5, `${what}: rises and sets out of sight (${low})`)
          assert.ok(x0 < signX && x1 > signX + signW, `${what}: rises on the left, sets on the right`)
          // a body's rows, halo and all, from its middle (the rows of pixels whose middles are within ORB.far of it)
          const rows = Math.floor(ORB.far + 0.5)
          for (let k = 0; k <= 200; k++) {
            const [x, y] = at(k / 200)
            assert.ok(y - rows >= 0, `${what}: inside the drawing at ${x}, ${y}`)
            // over the sign's span, behind it whole, halo and all
            if (x + ORB.rim > signX && x - ORB.rim < signX + signW) assert.ok(y - rows >= 2 && y + rows <= 42, `${what}: behind the sign at ${x}, ${y}`)
          }
          // between the props: never out of a landmark
          for (const x of [x0, x1]) assert.ok(!props.some((p) => p.kind === 'tall' && x >= p.x && x <= p.x + p.w), `${what}: rises or sets at ${x}, out of a landmark`)
          // never a jump where it shows: two keys at one time are its two ends, both out of sight
          for (let i = 1; i < ts.length; i++) if (ts[i] === ts[i - 1] && ps[i] !== ps[i - 1]) assert.ok([0, 1].includes(ps[i]) && [0, 1].includes(ps[i - 1]), `${what}: a jump at ${ts[i]}`)
          // one even pace from rising to setting, every crossing as long as the next (the replay's hold aside)
          const paces = []
          for (let i = 1; i < ts.length; i++) if (ps[i] > ps[i - 1] && ts[i] > ts[i - 1] && ts[i] * D <= S * TIMELAPSE.SLOT_SECONDS + 0.01) paces.push((ps[i] - ps[i - 1]) / (ts[i] - ts[i - 1]))
          assert.ok(paces.length && Math.max(...paces) <= 1.03 * Math.min(...paces), `${what}: paces ${paces.map((p) => p.toFixed(2))}`)
          // up only in its hours: the sun from 07:00 to 19:00, the moon from 20:00 to 06:00 (the replay's slot u is the
          // range's slot start + u)
          const start = cut(f).start ?? 0
          const slotH = (kind === 'yesterday' ? 15 : kind === 'week' ? 60 : 240) / 60
          const hourOf = (k) => ((((k * D) / TIMELAPSE.SLOT_SECONDS) + start) * slotH) % 24
          // within what a keyTime's four decimals can say
          const tol = (1e-4 * D * slotH) / TIMELAPSE.SLOT_SECONDS
          for (let i = 1; i < ts.length; i++) {
            if (!(ps[i] > ps[i - 1]) || ts[i] * D > S * TIMELAPSE.SLOT_SECONDS) continue
            for (const h of [hourOf(ts[i - 1]) + tol, hourOf(ts[i]) - tol]) assert.ok(name === 'sun' ? h >= 7 && h <= 19 : h >= 20 || h <= 6, `${what} up at ${h.toFixed(2)} h`)
          }
          assert.ok(paces.length >= (kind === 'yesterday' ? 1 : 3), `${what}: it rises and sets in the replay`)
        }
      }
    }
  })

  test('who comes and goes: a session\'s character walks up to the door before it starts and out of it and away when it is done', () => {
    const f = timelapseFacts('yesterday')
    f.timeline.desks = [{ id: 'a', project: 'harborledger', title: 'one session', runs: [[40, 52]] }]
    f.timeline.meetings = []
    f.timeline.commits = []
    // cut to slots 35 to 57 (CROP_MARGIN): room to walk in over the 4 before slot 40 and out over the 4 after 52
    const o = cut(f).start
    assert.deepEqual([o, cut(f).slots], [35, 22])
    const svg = renderTimelapse(f)
    const D = Number(root(svg)['data-loop'])
    const doc = tree(svg.slice(svg.indexOf('</defs>') + 7, -6))
    const walkers = []
    walk(doc, (n) => {
      if (n.tag === 'use' && /#tl-cW[lr]$/.test(n.attrs.href ?? '')) walkers.push(n)
    })
    assert.equal(walkers.length, 2, 'one comes, one goes')
    const door = 240 - 12
    const where = (n, slot) => {
      const t = (slot - o + 0.5) * TIMELAPSE.SLOT_SECONDS
      return shownAt(n, t, D) ? Math.round(translateAt(n.up, t, D)[0]) : null
    }
    const [comes, goes] = walkers.sort((a, b) => (where(a, 37) === null ? 1 : -1) - (where(b, 37) === null ? 1 : -1))
    // in: from the side over the 4 slots before slot 40, gone in when its desk lights up
    assert.deepEqual([35, 36, 39, 40].map((i) => where(comes, i) !== null), [false, true, true, false])
    assert.ok(Math.abs(where(comes, 36) - door) > Math.abs(where(comes, 39) - door), 'nearer the door as it comes')
    // out: at the door as its desk goes dark at slot 52 (half a slot in, an eighth of its way), away over the next 4,
    // then gone
    assert.deepEqual([51, 52, 55, 56].map((i) => where(goes, i) !== null), [false, true, true, false])
    assert.ok(Math.abs(where(goes, 52) - door) <= 16 && Math.abs(where(goes, 55) - door) > 60, `away from the door: ${where(goes, 52)} → ${where(goes, 55)}`)
    // facing the way it walks
    const right = where(goes, 55) > door
    assert.equal(goes.attrs.href, right ? '#tl-cWr' : '#tl-cWl')
    // a walker goes back for its next walk out of sight, and is gone before the last slot holds
    for (const kind of KINDS) {
      const busy = renderTimelapse(timelapseFacts(kind))
      const BD = Number(root(busy)['data-loop'])
      const S = Number(root(busy)['data-slots'])
      const t = tree(busy.slice(busy.indexOf('</defs>') + 7, -6))
      walk(t, (n) => {
        if (n.tag !== 'use' || !/W[lr]$/.test(n.attrs.href ?? '')) return
        const move = replayAnim(n.up, 'transform', BD)
        const keys = move.attrs.keyTimes.split(';').map(Number)
        const vals = move.attrs.values.split(';')
        for (let i = 1; i < keys.length; i++) {
          if (keys[i] !== keys[i - 1] || vals[i] === vals[i - 1]) continue
          for (const dt of [-0.01, 0.01]) assert.ok(!shownAt(n, keys[i] * BD + dt, BD), `${kind}: a walker jumps in sight at ${keys[i]}`)
        }
        assert.ok(!shownAt(n, S * TIMELAPSE.SLOT_SECONDS + 1, BD), `${kind}: a walker stands through the hold`)
      })
    }
  })

  test('nothing to replay: the building closed, a sign, never a throw', () => {
    const none = clone(SAMPLE)
    delete none.timeline
    const empty = timelapseFacts('week')
    empty.timeline.desks = []
    const broken = timelapseFacts('month')
    broken.timeline = { kind: 'month', slots: 'many', days: null, desks: [null, 'x', { runs: 'no' }], meetings: [{}], commits: [{ slot: -4 }] }
    for (const [name, f] of [['no timeline', none], ['no desks', empty], ['broken', broken], ['null', null], ['empty', {}], ['string timeline', { timeline: 'x' }]]) {
      const svg = renderTimelapse(f)
      wellFormed(svg, name)
      assert.ok(svg.includes('nothing to replay'), name)
      assert.match(root(svg)['aria-label'], /nothing to replay$/, name)
      assert.match(root(svg)['data-timelapse'], /^(yesterday|week|month)$/, name)
      assert.doesNotMatch(renderTimelapse(f, { animate: false }), /<animate/, name)
    }
    // no desks, but its meetings and commits: the range cut to them
    assert.equal(root(renderTimelapse(empty))['data-slots'], String(cut(empty).slots))
  })

  test('hostile titles, projects and meeting names are escaped; broken runs and interns are dropped, not drawn', () => {
    const f = timelapseFacts('week', { heavy: true })
    f.timeline.desks.forEach((d, i) => {
      if (i % 3 === 0) d.title = NASTY
      if (i % 7 === 0) d.project = `${NASTY}-${i % 2}`
      if (i % 11 === 0) d.account = NASTY
    })
    f.timeline.meetings.forEach((m) => { m.name = NASTY })
    f.timeline.desks.push({ id: NASTY, project: NASTY, agent: NASTY, runs: [[5, 2], ['a', 9], [170, 400], [-3, 4]], interns: [[1, 'x'], [NASTY, 3]] })
    for (const svg of [renderTimelapse(f), renderTimelapse(f, { animate: false }), renderTimelapse(f, { width: 300, transparent: true })]) wellFormed(svg, 'hostile')
    const tl = lapseTimeline(f)
    // [5, 2] runs backwards, 'a' is no slot, 170 is past the replay's 163 slots: only [-3, 4] is left, from 0
    assert.deepEqual(tl.desks.at(-1).runs, [[0, 4]], 'runs clipped to the replay')
    assert.equal(tl.desks.at(-1).agent, 'claude')
  })

  test('the roof\'s ornament goes before the replay\'s detail: a heavy week keeps its walkers under a plainer skyline', () => {
    // a light week has the full roof (more than a landmark a side, the pigeons); the heavy one at 960 is too heavy for
    // it with its four walkers, so it keeps each side's landmark alone and the quoins, without the pigeons, rather than
    // replay a rung lower without its walkers
    const walkers = (svg) => (svg.match(/href="#tl-[a-z]+W[rl]"/g) ?? []).length
    const names = (svg) => skylineOf(svg).map((u) => /#tl-rf-([a-z]+)"/.exec(u)[1])
    const light = renderTimelapse(timelapseFacts('week'), { width: 960 })
    assert.ok(names(light).length > 2 && light.includes('href="#tl-rf-pigeon"'), `light: ${names(light)}`)
    const heavy = renderTimelapse(timelapseFacts('week', { heavy: true }), { width: 960 })
    assert.ok(heavy.length <= MAX_SVG)
    assert.equal(walkers(heavy), 4, 'heavy: the four walkers on the sidewalk')
    assert.deepEqual(names(heavy).map((n) => ROOF_PROPS[n].kind), ['tall', 'tall'], `heavy: a landmark a side (${names(heavy)})`)
    assert.ok(heavy.includes('fill="url(#tl-quoin-l)"') && !heavy.includes('href="#tl-rf-pigeon"'), 'heavy: the quoins, no pigeons')
  })

  test('a load too heavy for the budget sheds detail, then replays coarser slots, but always plays', () => {
    const f = timelapseFacts('month', { heavy: true })
    const extra = []
    for (let k = 0; k < 400; k++) {
      const a = (k * 7) % 170
      extra.push({
        id: `x${k}`, project: `project-${k % 30}`, agent: ['claude', 'codex', 'gemini'][k % 3], title: `session ${k}`,
        runs: [[a, a + 2], [a + 4, a + 5]], interns: [[a, 3], [a + 2, 0]],
      })
    }
    f.timeline.desks.push(...extra)
    for (const width of [480, 2400]) {
      const svg = renderTimelapse(f, { width })
      wellFormed(svg, `overload ${width}`)
      const D = Number(root(svg)['data-loop'])
      assert.ok(svg.includes(`dur="${D}s"`), 'the replay still plays')
      assert.ok(Number(root(svg)['data-slots']) <= f.timeline.slots)
      assert.equal(D, Math.round((Number(root(svg)['data-slots']) * 0.05 + 2.5) * 1000) / 1000)
    }
    // the ladder ends on coarser slots: a merged slot starts on the wall clock's grid and keeps the most interns
    const tl = lapseTimeline(f)
    const c = coarsen(tl, 2)
    assert.equal(c.slots, Math.ceil(tl.slots / 2))
    assert.equal(c.per_day * 2, tl.per_day)
    assert.equal(lapseSlot(c, 1).hm, '08:00')
    assert.ok(LAPSE_LADDER.at(-1).coarse > 1 && LAPSE_LADDER[0].coarse === 1)
    // a cut replay starting off the grid (yesterday from 06:45, slot 27) takes back the slot before it, quiet, so its
    // half-hours start on the half-hour
    const day = lapseTimeline(timelapseFacts('yesterday'))
    assert.deepEqual([day.start, day.slots, lapseSlot(day, 0).hm], [27, 69, '06:45'])
    const halves = coarsen(day, 2)
    assert.deepEqual([halves.start, halves.slots, lapseSlot(halves, 0).hm, lapseSlot(halves, 1).hm], [13, 35, '06:30', '07:00'])
    const first = (t) => Math.min(...t.desks.map((d) => d.runs[0][0]))
    assert.equal(first(halves), Math.floor((first(day) + 1) / 2), 'the first run in its merged slot')
  })

  test('cropTimeline cuts the range to where something happened, a margin each side, and moves every slot with it', () => {
    const t = {
      kind: 'yesterday', days: ['2026-10-25'], slot_min: 15, per_day: 96, slots: 96,
      desks: [
        { id: 'a', project: 'p', runs: [[40, 44], [50, 52]], interns: [[30, 2], [42, 1], [60, 0]] },
        { id: 'b', project: 'q', runs: [[60, 70]] },
      ],
      meetings: [{ project: 'p', name: 'w', from: 41, to: 43, agents: 3 }, { project: 'q', name: 'x', from: 1, to: 2, agents: 1 }],
      commits: [{ project: 'p', slot: 72, n: 2 }],
    }
    // activity from slot 1 (a meeting) to 72 (a commit): only the end is cut, to 73 + 5
    const c1 = cropTimeline(t)
    assert.deepEqual([c1.start, c1.slots], [0, 78])
    // without that early meeting: from 40 - 5 = 35
    const c = cropTimeline({ ...t, meetings: t.meetings.slice(0, 1) })
    assert.deepEqual([c.start, c.slots], [35, 78 - 35])
    assert.deepEqual(c.desks.map((d) => d.runs), [[[5, 9], [15, 17]], [[25, 35]]])
    // interns: the count at the window's first slot opens it (2 from slot 30), then their change points
    assert.deepEqual(c.desks[0].interns, [[0, 2], [7, 1], [25, 0]])
    assert.deepEqual(c.meetings.map((m) => [m.from, m.to]), [[6, 8]])
    assert.deepEqual(c.commits, [{ project: 'p', slot: 37, n: 2 }])
    assert.equal(lapseSlot(c, 0).hm, '08:45')
    assert.equal(lapseSlot(c, 5).hm, lapseSlot(t, 40).hm)
    // nothing to cut: the same timeline back
    const busy = { ...t, desks: [{ id: 'z', project: 'p', runs: [[0, 96]] }] }
    assert.equal(cropTimeline(busy), busy)
    const idle = { ...t, desks: [], meetings: [], commits: [] }
    assert.equal(cropTimeline(idle), idle)
    // broken input never throws
    for (const bad of [null, undefined, 'x', {}, { slots: 'many', desks: [null, { runs: 'no' }, { runs: [[5, 2], ['a', 9]] }] }]) cropTimeline(bad)
    // cut twice is cut once
    assert.deepEqual(cropTimeline(c), c)
    // the reel's hours under a cut day stay on the film: one that would run past its end is left out
    const late = timelapseFacts('yesterday')
    late.timeline.desks = [{ id: 'a', project: 'harborledger', runs: [[36, 80]] }]
    late.timeline.meetings = []
    late.timeline.commits = []
    assert.ok(renderTimelapse(late, { width: 960 }).includes('>18:00</text>'))
    assert.ok(!renderTimelapse(late, { width: 960 }).includes('>21:00</text>'), '21:00 on the cut\'s last slot would run past the film')
    late.timeline.desks[0].runs = [[36, 68]]
    assert.ok(!renderTimelapse(late, { width: 320 }).includes('>18:00</text>'))
  })

  test('a cut replay keeps the sky of its hours: its slot u lit as the whole day\'s slot start + u', () => {
    const day = timelapseFacts('yesterday')
    const all = clone(day)
    all.timeline.desks.push({ id: 'owl', project: 'harborledger', runs: [[0, 1], [95, 96]] })
    const lights = (svg) => {
      const D = Number(root(svg)['data-loop'])
      return [...svg.matchAll(/<g opacity="[\d.]+"><animate attributeName="opacity" values="([^"]+)" keyTimes="([^"]+)" dur="([\d.]+)s" repeatCount="indefinite"\/>/g)]
        .map((m) => (u) => Math.round(Number(valueAt({ attrs: { dur: `${D}s`, values: m[1], keyTimes: m[2] } }, (u + 0.5) * TIMELAPSE.SLOT_SECONDS)) * 10) / 10)
    }
    const o = cut(day).start
    assert.ok(o > 0)
    const [cutSky, allSky] = [lights(renderTimelapse(day)), lights(renderTimelapse(all))]
    for (const u of [0, 4, 10, 20, 40, 60]) assert.deepEqual(cutSky.map((f) => f(u)), allSky.map((f) => f(u + o)), `slot ${u} of the cut day`)
  })

  test('two drawings on one page share no id; the other views do not know the timelapse', () => {
    const f = timelapseFacts('yesterday')
    const a = ids(renderTimelapse(f))
    const b = ids(renderTimelapse(f, { idPrefix: 'tl2' }))
    assert.ok(a.length && b.length)
    assert.equal(a.filter((x) => b.includes(x)).length, 0)
    for (const view of Object.keys(SVG_VIEWS)) assert.doesNotMatch(renderSvg(f, { view }), /data-timelapse|lp-/, view)
  })
})
