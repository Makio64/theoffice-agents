// PURE: the last pass over a drawing a browser holds on screen for hours, the desktop pane's, each time it changes. No
// node:* imports: the desktop mod hooks module imports this file.
// Chromium runs a whole frame 60 times a second for as long as one <animate> or <animateTransform> is alive in the
// document, whatever it animates and however slowly: one `dur="600s"` loop that changes nothing costs as much as 120 of
// them, 9% of a core against 4 with none. And a drawing whose loops each change at moments of their own repaints nearly
// every frame. So this pass rewrites every loop of a finished drawing, leaving the scenes and the art ladder as they are:
// - every change lands on a shared beat of BEAT seconds, so all the frames between two beats have nothing to paint;
// - nothing that needs a frame loop stays. A loop of values is a chain of <set>s round its stretches, the element at rest
//   at the value it holds most often, whose stretches then need no element (a blink: one <set> that begins again). A move
//   cannot be a <set>, which does nothing on `transform` (in Chromium and WebKit alike): on a <use> it is a <set> of its x
//   or y, anywhere else hops, an <animateMotion> of a millisecond frozen where it lands, one per value;
// - a glide is steps. One from end to end is a counter (`counter`): nested <g>s, each adding its bit of the distance, so
//   a walk of 512 positions is 9 pairs of hops. Any other is a loop of values, sampled on the beat.
// Timing is kept to the beat; a loop's length moves to a whole number of beats, a counter's to 2ⁿ or 3 × 2ⁿ steps, and
// what a counter would carry past the end of a walk that stops on screen is hidden. Hops that begin before a drawing
// loads never fire, so each element starts at the next time it comes round and the drawing rests at its first value.
// Each element that comes round adds an entry a browser keeps until the frame reloads, which the pane does hourly at
// least.
// All of that is markup, and the drawing is near its budget, so the pass earns some back: paths spelled shorter for the
// same pixels (`tighter`), ids down to two letters. BEAT_MAX: the limit of the Svg element, over the art ladder's own
// budget, less the colour attribute a surface adds to the root; past that limit a surface draws the alt text instead. A
// drawing that outgrows it all the same blinks less (`thinned`: the long loops of figures in full art are mostly blinks),
// and only one that still would is left as it was.
// A surface scrubs the markup with DOMPurify before it frames it, which keeps all of this: <set> and <animateMotion> with
// the attributes written here, and ids of the shape `namer` gives them.

const BEAT = 0.25
/**
 * A mover's steps, on the beat like all the rest. The commits train runs under every view, so its steps set how often the
 * drawing wakes at all: 0.125 would glide better, for about twice the CPU.
 */
const STEP = BEAT
/** A sampled glide takes coarser steps past this many values. */
const MAX_STATES = 60
/** A loop this long is a figure's script, whose blinks can go. */
const THIN_FROM = 10
export const BEAT_MAX = 131_000
const HOP = 'dur="1ms" fill="freeze"'
const TAG = /<(\/?)([a-zA-Z]+)\b([^<>]*?)(\/?)>/g
// the path of rectangles svg-kit paint() writes, all of one winding, so that their fill is their union
const RECTS = /^(?:M[-\d.]+ [-\d.]+h[\d.]+v[\d.]+h-[\d.]+z)+$/
const RECT = /M([-\d.]+) ([-\d.]+)h([\d.]+)v([\d.]+)/g
const BASE = { opacity: '1', 'fill-opacity': '1' }

const patterns = new Map()
function attrOf(raw, name) {
  if (!patterns.has(name)) patterns.set(name, new RegExp(`\\s${name}="([^"]*)"`))
  return patterns.get(name).exec(raw)?.[1]
}
const secs = (v) => Number.parseFloat(v ?? '0') || 0
const num = (x) => String(Math.round(x * 1000) / 1000).replace(/^(-?)0\./, '$1.')
const time = (s) => `${num(s)}s`
const pointOf = (v) => {
  const [x = 0, y = 0] = v.trim().split(/[\s,]+/).map(Number)
  return [x, y]
}
const same = (a, b) => a === b || (a !== '' && b !== '' && Number(a) === Number(b))

/**
 * Names as short as they go, all of one shape: a capital, then small letters. Letters only, which a `begin` can never take
 * for a time or an offset, and never a word a document or a form answers to, whose id the surfaces' scrub (DOMPurify) would
 * drop without a word, taking its chain with it: those are camelCase or all capitals (`id`, `dir`, `URL`).
 */
function namer() {
  let n = 0
  return () => {
    let i = n++
    const head = String.fromCharCode(65 + (i % 26))
    let tail = ''
    for (i = Math.floor(i / 26); ; i = Math.floor(i / 26) - 1) {
      tail = String.fromCharCode(97 + (i % 26)) + tail
      if (i < 26) return head + tail
    }
  }
}

/** The fraction of a loop of `values` each one starts at: its keyTimes, or evenly (over the steps of a glide: n − 1). */
function keysOf(raw, n, isGlide) {
  const kt = attrOf(raw, 'keyTimes')
  return kt ? kt.split(';').map(Number) : Array.from({ length: n }, (_, i) => i / (isGlide ? n - 1 : n))
}

/**
 * A loop of `values` starting at `keys`, on the beat: `{ states: [{ v, n }], total, back }`, stretches of `n` beats out of
 * `total`, the first the one holding the moment the drawing loads, `back` beats into it. `spin` is how far into its loop
 * the drawing loads, as a fraction. A loop too quick for the beat runs longer: every value keeps a beat of its own.
 */
function loopOf(values, keys, dur, spin) {
  let total = Math.max(1, Math.round(dur / BEAT))
  const cuts = []
  values.forEach((v, i) => {
    if (cuts.at(-1)?.v === v) return
    const beat = Math.round(keys[i] * total)
    cuts.push({ v, beat: cuts.length ? Math.max(beat, cuts.at(-1).beat + 1) : 0 })
  })
  // rounded onto the seam: a value back at the first one needs no beat of its own, any other does
  if (cuts.at(-1).beat >= total) {
    if (cuts.length > 1 && cuts.at(-1).v === cuts[0].v && cuts.at(-2).beat < total) cuts.pop()
    else total = cuts.at(-1).beat + 1
  }
  const states = cuts.map((c, i) => ({ v: c.v, at: c.beat, n: (cuts[i + 1]?.beat ?? total) - c.beat }))
  // a loop that ends on the value it starts on: one stretch round the seam
  if (states.length > 1 && states[0].v === states.at(-1).v) {
    const tail = states.pop()
    states[0].at = tail.at - total
    states[0].n += tail.n
  }
  const phase = Math.round(spin * total) % total
  const inside = (s) => (phase - s.at + total) % total < s.n
  const first = Math.max(0, states.findIndex(inside))
  return { states: [...states.slice(first), ...states.slice(0, first)], total, back: (phase - states[first].at + total) % total }
}

/**
 * A long loop with some of its blinks gone: a stretch of one beat between two of one value, every `every`th of them
 * (1: all) joined to its neighbours, never the one on screen at load.
 */
function thinned(loop, every) {
  const st = loop.states
  if (!every || st.length < THIN_FROM) return loop
  const out = [{ ...st[0] }]
  let seen = 0
  for (let i = 1; i < st.length; i++) {
    const isBlink = st[i].n === 1 && i + 1 < st.length && out.at(-1).v === st[i + 1].v
    if (isBlink && ++seen % every === 0) {
      out.at(-1).n += 1 + st[++i].n
      continue
    }
    out.push({ ...st[i] })
  }
  return { ...loop, states: out }
}

/** How far into its loop a drawing loads, as a fraction, for a loop `begin` seconds from now. */
const spinOf = (begin, dur) => (((-begin / dur) % 1) + 1) % 1

/** A glide as values on the beat, each rounded (a move to the art's pixel, a number to two places), merged where they repeat. */
function sampled(raw, isMove, dur) {
  const vectors = attrOf(raw, 'values').split(';').map(pointOf)
  const keys = keysOf(raw, vectors.length, true)
  const round = (x) => (isMove ? Math.round(x) : Math.round(x * 100) / 100)
  const at = (f) => {
    let j = 0
    while (j < keys.length - 2 && f >= keys[j + 1]) j++
    const u = keys[j + 1] > keys[j] ? Math.min(1, (f - keys[j]) / (keys[j + 1] - keys[j])) : 1
    const [a, b] = [vectors[j], vectors[j + 1]]
    return `${round(a[0] + (b[0] - a[0]) * u)}${isMove ? ` ${round(a[1] + (b[1] - a[1]) * u)}` : ''}`
  }
  const beats = Math.max(1, Math.round(dur / BEAT))
  for (let step = 1; ; step *= 2) {
    const values = []
    const stops = []
    for (let b = 0; b < beats; b += step) {
      const v = at(b / beats)
      if (values.at(-1) === v) continue
      values.push(v)
      stops.push(b / beats)
    }
    if (values.length <= MAX_STATES || step >= beats) return { values, keys: stops }
  }
}

/** The stretch of a glide from end to end: from, to, when it sets off and how long it takes, in seconds; null for any other. */
function walkOf(raw, dur) {
  const points = attrOf(raw, 'values').split(';').map(pointOf)
  const keys = keysOf(raw, points.length, true)
  const legs = []
  for (let i = 0; i + 1 < points.length; i++) {
    if (keys[i + 1] > keys[i] && points[i + 1][0] !== points[i][0]) legs.push({ from: points[i], to: points[i + 1], at: keys[i] * dur, t: (keys[i + 1] - keys[i]) * dur })
    if (points[i + 1][1] !== points[0][1]) return null
  }
  if (legs.length === 1) return legs[0]
  // two legs of one drift, the seam between them where it comes in again: it sets off at the second
  const [a, b] = legs
  const isDrift = legs.length === 2 && a.to[0] !== b.from[0] && a.from[0] === b.to[0] && a.at + a.t >= b.at - 1e-6
  return isDrift ? { from: b.from, to: a.to, at: b.at, t: a.t + b.t } : null
}

/** The value a loop comes back to most often, which its element can rest at; of a tie, the one it loads in. */
function restOf({ states }) {
  const seen = new Map()
  for (const { v } of states) seen.set(v, (seen.get(v) ?? 0) + 1)
  return states.reduce((best, { v }) => (seen.get(v) > seen.get(best) ? v : best), states[0].v)
}

/**
 * A loop as <set>s of `name` on an element resting at `rest`: one for each stretch of another value, in a chain, each the
 * time after the last that the element rests. The first begins as far back as the drawing is into it, or still to come.
 */
function setsOf(name, { states, back }, rest, id) {
  const beat = (n) => time(n * BEAT)
  const held = states.filter((s) => !same(s.v, rest))
  if (!held.length) return ''
  const ids = held.map(id)
  // a stretch's own wait for the one before it, and when the first of them begins
  const waits = []
  let wait = 0
  let first = null
  let at = -back
  for (const s of states) {
    if (same(s.v, rest)) wait += s.n
    else {
      first ??= at
      waits.push(wait)
      wait = 0
    }
    at += s.n
  }
  waits[0] = wait + (first + back > 0 ? first + back : 0)
  return held.map((s, i) => {
    const prev = ids[(i + held.length - 1) % held.length]
    const after = `${prev}.end${waits[i] ? `+${beat(waits[i])}` : ''}`
    return `<set id="${ids[i]}" attributeName="${name}" to="${s.v}" begin="${i ? after : `${beat(first)};${after}`}" dur="${beat(s.n)}"/>`
  }).join('')
}

/** `tag` with attribute `name` at `value`. */
function withAttr(tag, name, value) {
  const pair = `${name}="${value}"`
  const has = new RegExp(`(\\s)${name}="[^"]*"`)
  return has.test(tag) ? tag.replace(has, `$1${pair}`) : tag.replace(/^(<[a-zA-Z]+)/, `$1 ${pair}`)
}

/** One hop by (dx, dy) when `begin` says, named if something counts from it. */
const hop = (dx, dy, begin, name) => `<animateMotion${name ? ` id="${name}"` : ''} to="${num(dx)},${num(dy)}" begin="${begin}" ${HOP}/>`

/** A ring of hops, each `gap` after the one before it, the first `first` seconds from now: an entry is [dx, dy, gap to the next]. */
function ring(entries, first, id) {
  const ids = entries.map(id)
  return entries.map(([dx, dy], i) => {
    const prev = (i + entries.length - 1) % entries.length
    const next = `${ids[prev]}.begin+${time(entries[prev][2])}`
    return hop(dx, dy, i ? next : `${time(first)};${next}`, ids[i])
  }).join('')
}

/** A loop of moves as hops from where the element rests (its first value), and that resting place. */
function hopsOf({ states, back }, id) {
  const rest = pointOf(states[0].v)
  const round = states.slice(1).concat(states[0]).map((s) => {
    const [x, y] = pointOf(s.v)
    return [x - rest[0], y - rest[1], s.n * BEAT]
  })
  return { hops: states.length > 1 ? ring(round, (states[0].n - back) * BEAT, id) : '', rest }
}

/**
 * A walk as a counter of steps: each binary digit a <g> adding its share of the distance, flipped by two hops; the top
 * digit may count to 3, so a loop comes within a third of the length it had. Nothing moves but what a step changes, a
 * bit at a time. Past the end of a walk that stops in sight (`shown`, x within the drawing) the counter runs on hidden.
 * Returns the <g>s to open around the element and how many to close.
 */
function counter(walk, dur, spin, width, id) {
  const dist = Math.abs(walk.to[0] - walk.from[0])
  const dir = Math.sign(walk.to[0] - walk.from[0])
  const speed = dist / walk.t
  let dt = STEP
  let size = Math.round(speed * dt * 2) / 2
  // slower than half an art pixel a step: one pixel at a time, as seldom as the speed asks
  if (size < 0.5) [size, dt] = [1, Math.max(1, Math.round(1 / speed / STEP)) * STEP]
  const steps = Math.ceil(dist / size)
  const wanted = Math.max(steps, Math.round(dur / dt))
  let low = 1
  while (2 ** (low + 2) < wanted) low++
  const top = 2 ** low * 3 >= wanted ? 3 : 4
  const ticks = top * 2 ** low
  // the step the drawing loads on: time into the walk, or past its end
  const into = (spin * dur - walk.at + dur) % dur
  const start = (into < walk.t ? Math.round((into / walk.t) * steps) : steps + Math.round((into - walk.t) / dt)) % ticks
  const stepped = (n) => n * size * dir
  let open = ''
  let close = 0
  for (let k = 0; k < low; k++) {
    const span = 2 ** k
    const flip = (span - (start % span)) * dt
    const bit = stepped(span) * ((start >> k) & 1 ? -1 : 1)
    const self = id()
    open += `<g>${hop(bit, 0, `${time(flip)};${self}.begin+${time(2 * span * dt)}`, self)}${hop(0, 0, `${self}.begin+${time(span * dt)}`)}`
    close++
  }
  const span = 2 ** low
  const digit = Math.floor(start / span)
  const round = Array.from({ length: top }, (_, j) => [stepped(((digit + j + 1) % top - digit) * span), 0, span * dt])
  const hops = ring(round, (span - (start % span)) * dt, id)
  const shown = dir && walk.to[0] > -20 && walk.to[0] < width
  const gone = shown && ticks > steps ? hideFor(start, steps, ticks, dt, id) : ''
  const place = `transform="translate(${num(walk.from[0] + stepped(start))} ${num(walk.from[1])})"`
  return { open: `<g ${place}>${gone}<g>${hops}${open}`, close: '</g>'.repeat(close + 2) }
}

/** The element's opacity at 0 from step `steps` to the end of a loop of `ticks` steps. */
function hideFor(start, steps, ticks, dt, id) {
  const self = id()
  return `<set id="${self}" attributeName="opacity" to="0" begin="${time((steps - start) * dt)};${self}.end+${time(steps * dt)}" dur="${time((ticks - steps) * dt)}"/>`
}

/**
 * A path of rectangles spelled as short as it goes, the very same pixels at any scale: each move relative to the last, in
 * reading order, and no closing z, which a fill does not need. A stroke does, so only a path with a fill of its own comes
 * here, as paint() writes them: a bare one in <defs> may be stroked by the <use> that draws it, as the neon is. Joining
 * rectangles side by side would save little and does not rasterize the same at a scale that is not whole. Any other
 * path comes back as it was.
 */
function tighter(d) {
  if (!RECTS.test(d)) return d
  const rects = [...d.matchAll(RECT)].map((m) => m.slice(1).map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0])
  let out = ''
  let [cx, cy] = [0, 0]
  for (const [x, y, w, h] of rects) {
    const dy = num(y - cy)
    out += `${out ? `m${num(x - cx)}` : `M${num(x)}`}${dy[0] === '-' ? '' : ' '}${dy}h${num(w)}v${num(h)}h-${num(w)}`
    ;[cx, cy] = [x, y + h]
  }
  return out
}

/** `tag` with its transform set to translate(x y), or gone with none. */
function placed(tag, rest) {
  const bare = tag.replace(/\stransform="[^"]*"/, '')
  return rest ? bare.replace(/^(<[a-zA-Z]+)/, `$1 transform="translate(${num(rest[0])} ${num(rest[1])})"`) : bare
}

/** What takes the place of one SMIL loop on `parent`. The element's own tag is changed through parent.tag, a ring around it through parent.ring. */
function rewrite(tag, raw, isMove, parent, width, id, blinks) {
  if (attrOf(raw, 'repeatCount') !== 'indefinite') return tag
  const dur = secs(attrOf(raw, 'dur'))
  const spin = spinOf(secs(attrOf(raw, 'begin')), dur)
  const name = attrOf(raw, 'attributeName')
  // a walk's own vanishing goes with its counter
  if (parent.ring) return ''
  const isGlide = attrOf(raw, 'calcMode') !== 'discrete'
  const walk = isGlide && isMove ? walkOf(raw, dur) : null
  if (walk) {
    parent.ring = counter(walk, dur, spin, width, id)
    parent.tag = placed(parent.tag)
    return ''
  }
  const { values, keys } = isGlide ? sampled(raw, isMove, dur) : { values: attrOf(raw, 'values').split(';'), keys: keysOf(raw, attrOf(raw, 'values').split(';').length) }
  const loop = thinned(loopOf(values, keys, dur, spin), blinks)
  const onAttr = (attr, held) => {
    const rest = restOf(held)
    if (!same(rest, attrOf(parent.raw, attr) ?? BASE[attr] ?? '')) parent.tag = withAttr(parent.tag, attr, rest)
    return setsOf(attr, held, rest, id)
  }
  if (!isMove) return onAttr(name, loop)
  if (parent.name === 'use') {
    const moves = loop.states.map((s) => pointOf(s.v))
    const axis = moves.every(([, y]) => y === 0) ? 'x' : moves.every(([x]) => x === 0) ? 'y' : null
    if (axis) {
      const at = secs(attrOf(parent.raw, axis))
      return onAttr(axis, { ...loop, states: loop.states.map((s, i) => ({ n: s.n, v: num(at + moves[i][axis === 'x' ? 0 : 1]) })) })
    }
  }
  const { hops, rest } = hopsOf(loop, id)
  parent.tag = placed(parent.tag, rest[0] || rest[1] ? rest : null)
  return hops
}

/**
 * The drawing with its loops on the beat and no frame loop left, its ids as short as they go. `prefix`, what all of the
 * drawing's own ids start with. Pure and deterministic. With as many blinks as BEAT_MAX allows: every one, one in two
 * gone, or none; a drawing that would outgrow it even so comes back as it was.
 */
export function onBeat(svg, prefix = 'to-') {
  for (const blinks of [0, 2, 1]) {
    const out = pass(svg, prefix, blinks)
    if (out.length <= BEAT_MAX) return out
  }
  return svg
}

function pass(svg, prefix, blinks) {
  const id = namer()
  const width = Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1]) || 0
  const pieces = []
  const open = []
  let stroked = 0 // open elements with a stroke, which their paths take
  let last = 0
  for (const m of svg.matchAll(TAG)) {
    pieces.push(svg.slice(last, m.index))
    last = m.index + m[0].length
    const [tag, isClose, name, raw, isSelf] = m
    if (isClose) {
      const el = open.pop()
      if (el.isStroked) stroked--
      pieces[el.at] = `${el.ring?.open ?? ''}${el.tag}`
      pieces.push(tag, el.ring?.close ?? '')
    } else if (name === 'animate' || name === 'animateTransform') {
      pieces.push(rewrite(tag, raw, name === 'animateTransform', open.at(-1), width, id, blinks))
    } else {
      const isStroked = attrOf(raw, 'stroke') != null
      const isFilled = name === 'path' && !stroked && !isStroked && /^#/.test(attrOf(raw, 'fill') ?? '')
      const tight = isFilled ? tag.replace(/\sd="([^"]*)"/, (_, d) => ` d="${tighter(d)}"`) : tag
      pieces.push(tight)
      if (!isSelf) {
        open.push({ name, raw, tag: tight, at: pieces.length - 1, isStroked })
        if (isStroked) stroked++
      }
    }
  }
  pieces.push(svg.slice(last))
  const names = new Map()
  const short = (name) => {
    if (!names.has(name)) names.set(name, id())
    return names.get(name)
  }
  return pieces.join('').replaceAll(new RegExp(`(\\sid="|href="#|url\\(#)${prefix}([^")]+)`, 'g'), (_, lead, name) => `${lead}${short(name)}`)
}
