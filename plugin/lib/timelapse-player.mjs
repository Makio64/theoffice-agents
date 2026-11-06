// PURE: the player of the timelapse's own page (lib/timelapse-page.mjs), as real functions: its clock (the drawing's
// SMIL paused, driven from the page's own clock so pause, scrub, step and speed are exact), the frame baker (SMIL state
// cannot be serialized, so a still of time t is the drawing with every animation's value at t written onto its target
// and the animations removed), and the three exports, all in the browser: Save GIF (one frame per slot, decorations
// held still, a hand-written GIF89a/LZW encoder), Save video (MediaRecorder on a canvas, WebM or MP4) and Save SVG.
// No imports at all: every function here is pasted into the page as its own source (PLAYER_JS), so a function may call
// only the others and the PLAYER constants. Inside function bodies the text stays ASCII, so the script's bytes (and the
// hash its CSP allows) are the same in every encoding; the DOM ones run only in the page, the rest run in Node's tests.

// ---------------------------------------------------------------- limits

/**
 * What the exports are held to: the widest GIF and video, the video's frame rate (above the replay's 20 slots a
 * second, so every slot shows) and bitrate, the video types in the order they are tried, how many frames the GIF's
 * palette is picked from, and the SMIL elements the baker reads.
 */
export const PLAYER = Object.freeze({
  GIF_WIDTH: 1600,
  VIDEO_WIDTH: 1920,
  VIDEO_FPS: 30,
  VIDEO_BITRATE: 8_000_000,
  VIDEO_TYPES: ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'],
  PALETTE_SAMPLES: 6,
  SMIL: ['animate', 'animateTransform', 'animateColor', 'animateMotion', 'set'],
})

// ---------------------------------------------------------------- SMIL values

/**
 * A SMIL clock value in seconds: '2.5s', '-1.25s', '300ms', '0.5min', '1h', '12' (seconds), '01:02.5' or '0:01:02.5'.
 * 'indefinite' is Infinity; anything else (an event, a syncbase, nothing) is `fallback`.
 */
export function clockSeconds(v, fallback = NaN) {
  if (typeof v === 'number') return Number.isNaN(v) ? fallback : v
  const s = String(v ?? '').trim()
  if (s === 'indefinite') return Infinity
  const clock = /^([-+]?)(?:(\d+):)?(\d+):(\d{2}(?:\.\d+)?)$/.exec(s)
  if (clock) return (clock[1] === '-' ? -1 : 1) * (Number(clock[2] ?? 0) * 3600 + Number(clock[3]) * 60 + Number(clock[4]))
  const m = /^([-+]?(?:\d+\.?\d*|\.\d+))(h|min|s|ms)?$/.exec(s)
  if (!m) return fallback
  return Number(m[1]) * { h: 3600, min: 60, s: 1, ms: 0.001 }[m[2] ?? 's']
}

/** A `values`, `keyTimes` or `begin` list: 'a; b;c;' → ['a', 'b', 'c'] (an array passes through, trimmed). */
export function splitList(v) {
  const out = (Array.isArray(v) ? v : String(v ?? '').split(';')).map((x) => String(x).trim())
  while (out.length && out.at(-1) === '') out.pop()
  return out
}

/**
 * The value `u` (0…1) of the way from animation value `a` to `b`: '#rgb'/'#rrggbb' colors channel by channel, anything
 * else number by number when both share their non-numeric text ('3 4' → '7 8', 'M0 0h4' → 'M2 2h8', '10,5'), so a
 * linear path, translate or width bakes as the browser draws it. null when the two cannot blend (display, a color
 * name, another path shape): the animation then steps, as browsers fall back to discrete.
 */
export function lerpValue(a, b, u) {
  const sa = String(a).trim()
  const sb = String(b).trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
  if (hex.test(sa) && hex.test(sb)) {
    const rgb = (s) => {
      const h = hex.exec(s)[1]
      const full = h.length === 3 ? h.replace(/./g, '$&$&') : h
      return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16))
    }
    const ca = rgb(sa)
    const cb = rgb(sb)
    return '#' + ca.map((x, i) => Math.round(x + (cb[i] - x) * u).toString(16).padStart(2, '0')).join('')
  }
  const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g
  const na = sa.match(NUM) ?? []
  const nb = sb.match(NUM) ?? []
  // the text between the numbers must match, separators aside: '10,5' blends with '20 6', 'M0 0h4' never with 'M0 0v4'
  const skeleton = (s) => s.split(NUM).map((x) => x.replace(/[\s,]+/g, ' ').trim()).join('|')
  if (!na.length || na.length !== nb.length || skeleton(sa) !== skeleton(sb)) return null
  const parts = sa.split(NUM)
  return parts.map((p, i) => {
    if (i >= na.length) return p
    const n = Number(na[i]) + (Number(nb[i]) - Number(na[i])) * u
    return p + String(Math.round(n * 1e4) / 1e4)
  }).join('')
}

/**
 * One SMIL animation read once for sampling: its values, keyTimes (the given ones when valid, else even: i/n for
 * discrete, i/(n-1) otherwise), whether it steps (calcMode discrete, or values that cannot blend), its begins, simple
 * and active durations, fill. `spec` is valueAt's.
 */
export function compileAnim(spec) {
  const s = spec && typeof spec === 'object' ? spec : {}
  const vals = splitList(s.values)
  const n = vals.length
  let discrete = s.calcMode === 'discrete'
  for (let i = 0; !discrete && i < n - 1; i++) if (lerpValue(vals[i], vals[i + 1], 0) == null) discrete = true
  const given = s.keyTimes == null || String(s.keyTimes).trim() === '' ? [] : splitList(s.keyTimes).map(Number)
  // a linear list must end at 1 (browsers drop it otherwise); this one falls back to even steps instead
  const valid = given.length === n && given[0] === 0 && given.every((k, i) => k >= 0 && k <= 1 && (i === 0 || k >= given[i - 1])) &&
    (s.calcMode === 'discrete' || given[n - 1] === 1)
  const kt = valid ? given : vals.map((_, i) => (n < 2 ? 0 : i / (discrete ? n : n - 1)))
  const begins = s.begin == null || String(s.begin).trim() === '' ? [0]
    : splitList(s.begin).map((b) => clockSeconds(b, NaN)).filter((b) => Number.isFinite(b))
  const dur = clockSeconds(s.dur, NaN)
  const simple = dur > 0 && dur < Infinity ? dur : Infinity
  const count = s.repeatCount === 'indefinite' ? Infinity : Number.parseFloat(s.repeatCount)
  const repeatDur = clockSeconds(s.repeatDur, NaN)
  const limits = [count > 0 ? simple * count : NaN, repeatDur >= 0 ? repeatDur : NaN].filter((x) => !Number.isNaN(x))
  return { vals, kt, discrete, begins, dur: simple, active: limits.length ? Math.min(...limits) : simple, freeze: s.fill === 'freeze' }
}

/**
 * A compiled animation's value at document time `t` (seconds), or null while it has no effect: before its (latest)
 * begin, or past its active end without fill="freeze" (frozen, it keeps the value its last repeat ended on).
 */
export function sampleAnim(c, t) {
  const { vals, kt } = c
  if (!vals.length) return null
  let begin = -Infinity
  for (const b of c.begins) if (b <= t && b > begin) begin = b
  if (begin === -Infinity) return null
  // no simple duration: the first value holds
  if (c.dur === Infinity) return vals[0]
  const local = t - begin
  let p
  if (local >= c.active) {
    if (!c.freeze) return null
    const reps = c.active / c.dur
    const frac = reps - Math.floor(reps)
    p = frac < 1e-9 ? 1 : frac
  } else p = (local % c.dur) / c.dur
  const n = vals.length
  if (n === 1) return vals[0]
  // the last key time at or before p (kt[0] is 0)
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (kt[mid] <= p) lo = mid
    else hi = mid - 1
  }
  if (c.discrete || lo === n - 1) return vals[lo]
  const span = kt[lo + 1] - kt[lo]
  return lerpValue(vals[lo], vals[lo + 1], span > 0 ? (p - kt[lo]) / span : 1) ?? vals[lo]
}

/**
 * The value one SMIL animation gives its attribute at document time `t` (seconds), or null while it has no effect:
 * what the browser draws at that instant. `spec`: `values` ('a;b;c' or an array), `keyTimes` (default even spacing),
 * `dur` and `begin` (clock values or seconds; a negative begin starts mid-loop, a list begins at each), `calcMode`
 * (linear unless 'discrete'; paced and spline bake as linear), `repeatCount` / `repeatDur` (a count or clock, or
 * 'indefinite'), `fill`. Linear blends numbers, number lists and hex colors (lerpValue); a value that cannot blend steps.
 */
export function valueAt(spec, t) {
  return sampleAnim(compileAnim(spec), t)
}

/**
 * The point a share `p` (0…1) of the way along path data `d`, by length, as an animateMotion's keyPoints read it: [x, y].
 * Absolute M, L, H, V, A and Z (an arc walked in short steps, its centre found as SVG's implementation notes say);
 * anything else ends the path there. [0, 0] for no path.
 */
export function motionPoint(d, p) {
  const pts = []
  let at = [0, 0]
  let start = [0, 0]
  const re = /([MLHVAZ])([^MLHVAZ]*)/gi
  let m
  while ((m = re.exec(String(d ?? '')))) {
    const cmd = m[1]
    const n = (m[2].match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number)
    if (cmd !== cmd.toUpperCase() && cmd !== 'z') break
    if (cmd === 'M' || cmd === 'L') {
      for (let i = 0; i + 1 < n.length; i += 2) {
        at = [n[i], n[i + 1]]
        if (cmd === 'M' && i === 0) { start = at; pts.push(null) }
        pts.push(at)
      }
    } else if (cmd === 'H') for (const x of n) pts.push((at = [x, at[1]]))
    else if (cmd === 'V') for (const y of n) pts.push((at = [at[0], y]))
    else if (cmd === 'Z' || cmd === 'z') pts.push((at = start))
    else if (cmd === 'A') {
      for (let i = 0; i + 6 < n.length; i += 7) {
        let [rx, ry] = [Math.abs(n[i]), Math.abs(n[i + 1])]
        const [large, sweep, x2, y2] = [n[i + 3], n[i + 4], n[i + 5], n[i + 6]]
        const [x1, y1] = at
        const hx = (x1 - x2) / 2
        const hy = (y1 - y2) / 2
        if (!rx || !ry || (!hx && !hy)) {
          pts.push((at = [x2, y2]))
          continue
        }
        const lam = (hx * hx) / (rx * rx) + (hy * hy) / (ry * ry)
        if (lam > 1) {
          rx *= Math.sqrt(lam)
          ry *= Math.sqrt(lam)
        }
        const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * hy * hy - ry * ry * hx * hx) / (rx * rx * hy * hy + ry * ry * hx * hx)))
        const cx = (k * rx * hy) / ry + (x1 + x2) / 2
        const cy = (-k * ry * hx) / rx + (y1 + y2) / 2
        const a1 = Math.atan2((y1 - cy) / ry, (x1 - cx) / rx)
        let da = Math.atan2((y2 - cy) / ry, (x2 - cx) / rx) - a1
        if (sweep && da < 0) da += 2 * Math.PI
        if (!sweep && da > 0) da -= 2 * Math.PI
        const steps = Math.max(8, Math.ceil((Math.abs(da) * 32) / Math.PI))
        for (let j = 1; j <= steps; j++) pts.push([cx + rx * Math.cos(a1 + (da * j) / steps), cy + ry * Math.sin(a1 + (da * j) / steps)])
        at = [x2, y2]
      }
    }
  }
  // the length along it, a move breaking it (no length across a move)
  const segs = []
  let last = null
  let total = 0
  for (const q of pts) {
    if (q && last) {
      const len = Math.hypot(q[0] - last[0], q[1] - last[1])
      segs.push([last, q, total, len])
      total += len
    }
    last = q
  }
  const first = pts.find(Boolean)
  if (!first) return [0, 0]
  const want = Math.max(0, Math.min(1, Number(p) || 0)) * total
  for (const [a, b, from, len] of segs) {
    if (want <= from + len || segs.at(-1)[2] === from) {
      const u = len ? Math.max(0, Math.min(1, (want - from) / len)) : 1
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u].map((v) => Math.round(v * 100) / 100)
    }
  }
  return first
}

/**
 * What one SMIL element says, read through `get(name)` (its attribute, or null): `{ attr, type, additive, fromBase,
 * spec }`, or null for one the baker leaves as it is not (nothing to animate). A <set> holds its `to`; from/to are two
 * values; a bare `to` starts from the target's own value (`fromBase`). `type` is the transform kind of an
 * animateTransform ('translate' when unsaid), '' otherwise. An animateMotion along a `path` is a translate added to
 * the target's transform, its values the shares of the way (keyPoints, else the whole way), `path` the way: the baker
 * finds each point with motionPoint.
 */
export function animSpec(tag, get) {
  if (tag === 'animateMotion') {
    const path = get('path')
    if (!path) return null
    return {
      attr: 'transform', type: 'translate', additive: true, fromBase: false, path,
      spec: {
        values: get('keyPoints') || '0;1', keyTimes: get('keyTimes'), dur: get('dur'), begin: get('begin'), calcMode: get('calcMode') === 'discrete' ? 'discrete' : 'linear',
        repeatCount: get('repeatCount'), repeatDur: get('repeatDur'), fill: get('fill'),
      },
    }
  }
  const attr = get('attributeName')
  if (!attr) return null
  const to = get('to')
  const from = get('from')
  let values = tag === 'set' ? (to == null ? null : [to]) : get('values')
  let fromBase = false
  if (tag !== 'set' && (values == null || String(values).trim() === '')) {
    if (to == null) return null
    values = [from ?? '', to]
    fromBase = from == null
  }
  if (values == null) return null
  return {
    attr, type: tag === 'animateTransform' ? get('type') || 'translate' : '', additive: get('additive') === 'sum', fromBase,
    spec: {
      values, keyTimes: get('keyTimes'), dur: get('dur'), begin: get('begin'), calcMode: tag === 'set' ? 'discrete' : get('calcMode') || 'linear',
      repeatCount: get('repeatCount'), repeatDur: get('repeatDur'), fill: get('fill'),
    },
  }
}

/**
 * An attribute's baked value: the animations on it (`[{ value, additive, type }]`, lowest priority first) over its
 * `base` (null: no such attribute). A layer whose value is null has no effect, a replacing one wins over all below
 * it, an additive one adds to them (a transform appends, plain numbers add); an animateTransform's value is
 * `type(value)`. null when nothing is left, and the attribute goes.
 */
export function compose(base, layers) {
  let v = base ?? null
  for (const l of layers) {
    if (l.value == null) continue
    const val = l.type ? `${l.type}(${l.value})` : String(l.value)
    if (!l.additive || v == null || String(v).trim() === '') v = val
    else if (l.type) v = `${v} ${val}`
    else {
      const sum = Number(v) + Number(val)
      v = Number.isFinite(sum) ? String(Math.round(sum * 1e4) / 1e4) : val
    }
  }
  return v
}

/**
 * One animated attribute ready to bake: its `base` value and its animations (animSpec's, each with its document
 * `order`) compiled and sorted by SMIL priority, the earlier begin first, then document order. `timeline` marks the
 * ones a `loop` long: the GIF runs those and holds every decoration still.
 */
export function compileGroup(base, anims, loop) {
  const layers = anims.map((a, i) => {
    const to = splitList(a.spec.values).at(-1)
    const c = compileAnim(a.fromBase ? { ...a.spec, values: [base ?? to, to] } : a.spec)
    const first = c.begins.length ? Math.min(...c.begins) : Infinity
    return { c, additive: a.additive, type: a.type, path: a.path, timeline: Math.abs(c.dur - loop) < 1e-3, first, order: a.order ?? i }
  })
  layers.sort((x, y) => x.first - y.first || x.order - y.order)
  return { base: base ?? null, layers }
}

/**
 * Every animated attribute's value at time `t` of the replay, one per group (compileGroup's). Not `lively` (the
 * GIF): only the timeline runs, every decoration (a blink, a twinkle, typing hands) stays as it is at t = 0, so two
 * slots that differ only in their decorations bake the same and frame differencing keeps the file small.
 */
export function frameValues(groups, t, lively) {
  // a motion's share of its way, as the point it is at
  const valueOf = (l) => {
    const v = sampleAnim(l.c, lively || l.timeline ? t : 0)
    return v == null || !l.path ? v : motionPoint(l.path, Number(v)).join(' ')
  }
  return groups.map((g) => compose(g.base, g.layers.map((l) => ({ value: valueOf(l), additive: l.additive, type: l.type }))))
}

// ---------------------------------------------------------------- pace, sizes, names

/**
 * The replay's pace from the drawing's root, read through `get(name)`: `{ slots, slotSeconds, hold, loop }` from
 * data-slots, data-slot-seconds (0.05), data-hold (2.5) and data-loop (slots × slot seconds + hold when unsaid).
 */
export function paceOf(get) {
  const num = (k, d) => {
    const v = Number.parseFloat(get(k))
    return Number.isFinite(v) && v >= 0 ? v : d
  }
  const slots = Math.floor(num('data-slots', 0))
  const slotSeconds = num('data-slot-seconds', 0.05) || 0.05
  const hold = num('data-hold', 2.5)
  return { slots, slotSeconds, hold, loop: num('data-loop', 0) || slots * slotSeconds + hold }
}

/** The slot on screen at replay time `t`: slot i from i × slotSeconds on, the last one held to the end of the loop. */
export function slotAt(t, slotSeconds, slots) {
  if (!(slots > 0)) return 0
  return Math.min(slots - 1, Math.max(0, Math.floor((t + 1e-9) / slotSeconds)))
}

/**
 * The export canvas for a drawing whose root says `width`, `height` (CSS px) and `viewBox`: the viewBox at the whole
 * scale nearest the drawing's own width (never under its own pixels), so every pixel of the art lands on whole canvas
 * pixels, capped to `cap` px wide by whole steps down (a fraction 1/m of the viewBox only when it alone is wider).
 * `{ width, height, scale }`.
 */
export function exportSize({ width, height, viewBox } = {}, cap = Infinity) {
  const vb = String(viewBox ?? '').trim().split(/[\s,]+/).map(Number)
  const w0 = Number.parseFloat(width)
  const h0 = Number.parseFloat(height)
  const hasBox = vb.length === 4 && vb[2] > 0 && vb[3] > 0
  const vw = hasBox ? vb[2] : w0 > 0 && h0 > 0 ? w0 : 960
  const vh = hasBox ? vb[3] : w0 > 0 && h0 > 0 ? h0 : 540
  let scale = Math.max(1, Math.round((w0 > 0 ? w0 : vw) / vw))
  if (vw * scale > cap) scale = Math.floor(cap / vw) || 1 / Math.ceil(vw / cap)
  return { width: Math.max(1, Math.round(vw * scale)), height: Math.max(1, Math.round(vh * scale)), scale }
}

/** A download's name, theoffice-timelapse-<kind>-<YYYY-MM-DD>.<ext>: the kind and the date checked, `today` (then none) standing in for a bad date. */
export function fileName(kind, date, ext, today = '') {
  const k = /^[a-z]{1,16}$/.test(String(kind)) ? kind : 'week'
  const d = [date, today].find((x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x)))
  return `theoffice-timelapse-${k}${d ? `-${d}` : ''}.${ext}`
}

/** The first video type this browser records (PLAYER.VIDEO_TYPES' order), '' for none; `isSupported` is MediaRecorder.isTypeSupported. */
export function pickMime(isSupported) {
  for (const type of PLAYER.VIDEO_TYPES) {
    try { if (isSupported(type)) return type } catch { /* a browser that throws on a type does not record it */ }
  }
  return ''
}

// ---------------------------------------------------------------- palette

/**
 * The GIF's palette from a few sample frames (RGBA bytes): their colors by popularity, the most used first, at most
 * `max` (ties in color order, so the same frames give the same palette). `[[r, g, b], …]`. Pixel art has few colors;
 * the antialiased edges of text add a long tail, which the nearest palette color stands in for.
 */
export function buildPalette(samples, max = 255) {
  const counts = new Map()
  const book = (c, n) => counts.set(c, (counts.get(c) ?? 0) + n)
  for (const px of samples) {
    // pixel art comes in runs of one color: count a run at once
    let last = -1
    let run = 0
    for (let i = 0; i + 3 < px.length; i += 4) {
      const c = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2]
      if (c === last) { run++; continue }
      if (run) book(last, run)
      last = c
      run = 1
    }
    if (run) book(last, run)
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, Math.max(1, max)).map(([c]) => [c >> 16, (c >> 8) & 255, c & 255])
}

/** The palette index nearest to r, g, b: the smallest squared distance, weighted 2 : 4 : 3 as the eye weighs red, green and blue. */
export function nearestColor(palette, r, g, b) {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i]
    const d = 2 * (pr - r) ** 2 + 4 * (pg - g) ** 2 + 3 * (pb - b) ** 2
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

/** 0xRRGGBB → palette index for one export: a palette color at once, any other through nearestColor, remembered. */
export function paletteMapper(palette) {
  const cache = new Map()
  palette.forEach(([r, g, b], i) => {
    const c = (r << 16) | (g << 8) | b
    if (!cache.has(c)) cache.set(c, i)
  })
  return (c) => {
    let i = cache.get(c)
    if (i === undefined) { i = nearestColor(palette, c >> 16, (c >> 8) & 255, c & 255); cache.set(c, i) }
    return i
  }
}

/**
 * One frame's RGBA bytes → palette indices through `map` (paletteMapper's). Given the frame before it (its bytes and
 * indices), a pixel that did not change keeps its index without a lookup: most of a timelapse frame is the last one.
 */
export function indexFrame(rgba, map, prev, prevIdx) {
  const n = rgba.length >> 2
  const out = new Uint8Array(n)
  const aligned = (a) => a && a.byteOffset % 4 === 0 && a.length === rgba.length
  const same = prevIdx && prevIdx.length === n && aligned(prev) && aligned(rgba)
  const now = same ? new Uint32Array(rgba.buffer, rgba.byteOffset, n) : null
  const was = same ? new Uint32Array(prev.buffer, prev.byteOffset, n) : null
  let last = -1
  let lastIdx = 0
  for (let i = 0; i < n; i++) {
    if (same && now[i] === was[i]) { out[i] = prevIdx[i]; continue }
    const j = i << 2
    const c = (rgba[j] << 16) | (rgba[j + 1] << 8) | rgba[j + 2]
    if (c !== last) { last = c; lastIdx = map(c) }
    out[i] = lastIdx
  }
  return out
}

// ---------------------------------------------------------------- GIF

/**
 * GIF's LZW over palette indices of `minCode` bits (2…8): a clear code first, codes growing from minCode + 1 bits up to
 * 12, a clear code again whenever the table is full, the end code last, packed least significant bit first. The
 * table is two typed arrays keyed by prefix code × 256 + index and stamped per generation, so a clear costs nothing;
 * pass the same `table` ({}) to reuse it across frames. The packed bytes, not yet cut into sub-blocks.
 */
export function lzwEncode(indices, minCode, table = {}) {
  if (!table.stamp) { table.stamp = new Uint32Array(1 << 20); table.codes = new Uint16Array(1 << 20); table.gen = 0 }
  const { stamp, codes } = table
  let gen = ++table.gen
  const clear = 1 << minCode
  const end = clear + 1
  let size = minCode + 1
  let next = end + 1
  let out = new Uint8Array(Math.max(64, indices.length >> 1))
  let pos = 0
  let acc = 0
  let bits = 0
  const put = (code) => {
    acc |= code << bits
    bits += size
    while (bits >= 8) {
      if (pos === out.length) { const grown = new Uint8Array(out.length * 2); grown.set(out); out = grown }
      out[pos++] = acc & 255
      acc >>>= 8
      bits -= 8
    }
  }
  put(clear)
  if (indices.length) {
    let prefix = indices[0]
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i]
      const key = (prefix << 8) | k
      if (stamp[key] === gen) { prefix = codes[key]; continue }
      put(prefix)
      if (next < 4096) {
        stamp[key] = gen
        codes[key] = next++
        // the decoder learns this code one step later: it widens once the code after the last one needs the bit
        if (next > 1 << size && size < 12) size++
      } else {
        put(clear)
        gen = ++table.gen
        next = end + 1
        size = minCode + 1
      }
      prefix = k
    }
    put(prefix)
  }
  put(end)
  if (bits > 0) {
    if (pos === out.length) { const grown = new Uint8Array(out.length + 1); grown.set(out); out = grown }
    out[pos++] = acc & 255
  }
  return out.subarray(0, pos)
}

/** Bytes cut into GIF sub-blocks: a length byte (255 at most) before each piece, a zero block after the last. */
export function subBlocks(bytes) {
  const out = new Uint8Array(bytes.length + Math.ceil(bytes.length / 255) + 1)
  let pos = 0
  for (let i = 0; i < bytes.length; i += 255) {
    const piece = bytes.subarray(i, i + 255)
    out[pos++] = piece.length
    out.set(piece, pos)
    pos += piece.length
  }
  out[pos] = 0
  return out
}

/**
 * A GIF89a writer for one animation of `width` × `height`: `palette` ([[r, g, b], …], 256 at most) as the global
 * color table, an endless NETSCAPE2.0 loop (`loop` 0; n plays it n more times), and frames added one at a time as
 * palette indices with their delay in hundredths of a second. Frame differencing: each frame after the first is only
 * the box of pixels that changed since the one before (disposal 1, left in place), its unchanged pixels transparent
 * when the palette leaves an index free (runs of one index pack small); a frame that changes nothing adds its delay
 * to the one before. `{ add(indices, delay), end() → Uint8Array }`.
 */
export function gifEncoder(width, height, palette, { loop = 0 } = {}) {
  const colors = palette.slice(0, 256)
  // the index after the last color stands for "as before", when the table has room for it
  const hole = colors.length < 256 ? colors.length : -1
  let depth = 1
  while (1 << depth < colors.length + (hole >= 0 ? 1 : 0)) depth++
  const minCode = Math.max(2, depth)
  const chunks = []
  const le = (n) => [n & 255, (n >> 8) & 255]
  const head = new Uint8Array(13 + 3 * (1 << depth))
  head.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...le(width), ...le(height), 0xf0 | (depth - 1), 0, 0])
  colors.forEach(([r, g, b], i) => head.set([r, g, b], 13 + i * 3))
  chunks.push(head, Uint8Array.of(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((ch) => ch.charCodeAt(0)), 3, 1, ...le(loop), 0))
  const table = {}
  let prev = null
  let gce = null
  const add = (indices, delay) => {
    const d = Math.min(65535, Math.max(0, Math.round(delay)))
    let x0 = 0
    let y0 = 0
    let x1 = width - 1
    let y1 = height - 1
    if (prev) {
      x0 = width
      y0 = height
      x1 = -1
      y1 = -1
      for (let y = 0; y < height; y++) {
        const row = y * width
        for (let x = 0; x < width; x++) {
          if (indices[row + x] === prev[row + x]) continue
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          y1 = y
        }
      }
      if (x1 < 0) {
        // nothing changed: the frame before stays up longer, unless its delay would overflow (then one still pixel carries it)
        const held = gce[4] + gce[5] * 256 + d
        if (held <= 65535) { gce[4] = held & 255; gce[5] = held >> 8; return }
        x0 = x1 = y0 = y1 = 0
      }
    }
    const w = x1 - x0 + 1
    const h = y1 - y0 + 1
    const box = new Uint8Array(w * h)
    let holes = false
    for (let y = 0; y < h; y++) {
      const row = (y0 + y) * width + x0
      for (let x = 0; x < w; x++) {
        const v = indices[row + x]
        if (prev && hole >= 0 && v === prev[row + x]) { box[y * w + x] = hole; holes = true } else box[y * w + x] = v
      }
    }
    gce = Uint8Array.of(0x21, 0xf9, 4, (1 << 2) | (holes ? 1 : 0), d & 255, d >> 8, holes ? hole : 0, 0)
    chunks.push(gce, Uint8Array.of(0x2c, ...le(x0), ...le(y0), ...le(w), ...le(h), 0, minCode), subBlocks(lzwEncode(box, minCode, table)))
    prev = Uint8Array.from(indices)
  }
  const end = () => {
    if (!prev) add(new Uint8Array(width * height), 0)
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0) + 1)
    let pos = 0
    for (const c of chunks) { out.set(c, pos); pos += c.length }
    out[pos] = 0x3b
    return out
  }
  return { add, end }
}

/** A whole GIF at once: `{ width, height, palette, frames: [{ indices, delay }], loop }` → its bytes (gifEncoder's). */
export function encodeGif({ width, height, palette, frames = [], loop = 0 }) {
  const gif = gifEncoder(width, height, palette, { loop })
  for (const f of frames) gif.add(f.indices, f.delay)
  return gif.end()
}

// ---------------------------------------------------------------- WebM

/**
 * A recorded WebM with its length written in: MediaRecorder streams WebM and never goes back to say how long it is, so
 * players show no duration and seek poorly. A Duration (`ms`, in the default TimecodeScale's milliseconds) goes into
 * the Segment's Info, or over the one already there. Anything it does not expect (no Info before the first Cluster, a
 * SeekHead whose offsets an insertion would break, a truncated element) leaves the bytes as they came.
 */
export function webmDuration(bytes, ms) {
  const id = (p) => {
    const b = bytes[p]
    const n = b >= 0x80 ? 1 : b >= 0x40 ? 2 : b >= 0x20 ? 3 : b >= 0x10 ? 4 : 0
    if (!n || p + n > bytes.length) throw new Error('not an element id')
    let v = 0
    for (let i = 0; i < n; i++) v = v * 256 + bytes[p + i]
    return [v, n]
  }
  // [size, its length]; an unknown size (all ones) is -1
  const size = (p) => {
    const b = bytes[p]
    let n = 1
    while (n <= 8 && !(b & (0x100 >> n))) n++
    if (n > 8 || p + n > bytes.length) throw new Error('not a size')
    let v = b & (0xff >> n)
    let ones = v === 0xff >> n
    for (let i = 1; i < n; i++) {
      v = v * 256 + bytes[p + i]
      if (bytes[p + i] !== 0xff) ones = false
    }
    return [ones ? -1 : v, n]
  }
  try {
    const [ebml, en] = id(0)
    const [es, esn] = size(en)
    if (ebml !== 0x1a45dfa3 || es < 0) return bytes
    let p = en + esn + es
    const [segment, sn] = id(p)
    if (segment !== 0x18538067) return bytes
    p += sn + size(p + sn)[1]
    while (p < bytes.length) {
      const [el, n] = id(p)
      const [len, ln] = size(p + n)
      if (el === 0x114d9b74 || el === 0x1f43b675 || len < 0) return bytes
      const start = p + n + ln
      const end = start + len
      if (end > bytes.length) return bytes
      if (el !== 0x1549a966) { p = end; continue }
      for (let q = start; q < end;) {
        const [child, cn] = id(q)
        const [clen, cln] = size(q + cn)
        if (clen < 0) return bytes
        if (child === 0x4489 && (clen === 8 || clen === 4)) {
          const out = bytes.slice()
          const view = new DataView(out.buffer, out.byteOffset, out.length)
          if (clen === 8) view.setFloat64(q + cn + cln, ms)
          else view.setFloat32(q + cn + cln, ms)
          return out
        }
        q += cn + cln + clen
      }
      // Info's new size as an 8-byte size, then its children, then Duration (id 4489, 8 bytes of float)
      const out = new Uint8Array(bytes.length + 7 + (8 - ln) + 4)
      out.set(bytes.subarray(0, p + n))
      let at = p + n
      out[at] = 0x01
      for (let i = 7, v = len + 11; i >= 1; i--, v = Math.floor(v / 256)) out[at + i] = v % 256
      at += 8
      out.set(bytes.subarray(start, end), at)
      at += len
      out.set([0x44, 0x89, 0x88], at)
      new DataView(out.buffer).setFloat64(at + 3, ms)
      out.set(bytes.subarray(end), at + 11)
      return out
    }
  } catch {
    // a stream it cannot read is saved as it is
  }
  return bytes
}

// ---------------------------------------------------------------- frames (the page only: DOM)

/**
 * The drawing ready to bake stills from: the pristine markup parsed once as XML, every SMIL element read (animSpec)
 * and grouped by the attribute it drives on its target (an href'd element, or its parent), the target's own value its
 * base, then removed, since a still has no clock. `{ doc, root, groups }`.
 */
export function bakePlan(markup, loop) {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml')
  const root = doc.documentElement
  if (!root || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new Error('the drawing does not parse')
  const smil = [...root.getElementsByTagName('*')].filter((el) => PLAYER.SMIL.includes(el.localName))
  const found = new Map()
  smil.forEach((el, order) => {
    const a = animSpec(el.localName, (k) => el.getAttribute(k))
    const ref = (el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '').trim()
    const target = ref.startsWith('#') ? doc.getElementById(ref.slice(1)) : el.parentNode
    if (!a || !target || target.nodeType !== 1) return
    // a swapped sprite is written as href, which wins over xlink:href in every browser
    const attr = a.attr === 'xlink:href' ? 'href' : a.attr
    if (!found.has(target)) found.set(target, new Map())
    const attrs = found.get(target)
    if (!attrs.has(attr)) attrs.set(attr, [])
    attrs.get(attr).push({ ...a, order })
  })
  for (const el of smil) el.remove()
  const groups = []
  for (const [target, attrs] of found) {
    for (const [attr, anims] of attrs) {
      const base = target.getAttribute(attr) ?? (attr === 'href' ? target.getAttribute('xlink:href') : null)
      groups.push({ target, attr, ...compileGroup(base, anims, loop) })
    }
  }
  return { doc, root, groups }
}

/** The still of replay time `t` as SVG markup `width` × `height` px: every animated attribute written as it is at t. */
export function bakeMarkup(plan, t, lively, width, height) {
  const values = frameValues(plan.groups, t, lively)
  plan.groups.forEach((g, i) => {
    if (values[i] == null) g.target.removeAttribute(g.attr)
    else g.target.setAttribute(g.attr, values[i])
  })
  plan.root.setAttribute('width', String(width))
  plan.root.setAttribute('height', String(height))
  return new XMLSerializer().serializeToString(plan.doc)
}

/**
 * Draws SVG markup onto a 2D context at `width` × `height`, over `bg`, pixels unsmoothed. The markup loads as an image
 * from a Blob URL, or a data: URL (`asData`) for a browser that would taint the canvas with a blob.
 */
export async function rasterize(markup, ctx, width, height, bg, asData) {
  const img = new Image()
  const url = asData ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup) : URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
  try {
    await new Promise((resolve, reject) => {
      img.addEventListener('load', resolve, { once: true })
      img.addEventListener('error', () => reject(new Error('a frame would not draw')), { once: true })
      img.src = url
    })
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.drawImage(img, 0, 0, width, height)
  } finally {
    if (!asData) URL.revokeObjectURL(url)
  }
}

/**
 * A canvas the page can read back, with the first still on it: a blob-drawn canvas first, a data:-drawn one when the
 * browser taints the first (a tainted canvas stays tainted, so it is a new one). `{ canvas, ctx, asData }`.
 */
export async function stageFor(app, plan, size, canvasW, canvasH, read) {
  for (const asData of [false, true]) {
    const canvas = document.createElement('canvas')
    canvas.width = canvasW
    canvas.height = canvasH
    const ctx = canvas.getContext('2d', read ? { willReadFrequently: true } : { alpha: false })
    if (!ctx) throw new Error('this browser has no 2D canvas')
    await rasterize(bakeMarkup(plan, 0, false, size.width, size.height), ctx, size.width, size.height, app.bg, asData)
    try {
      ctx.getImageData(0, 0, 1, 1)
      return { canvas, ctx, asData }
    } catch (err) {
      if (asData) throw new Error('this browser will not let the page read its own drawing back')
    }
  }
}

/** Hands the person a file: a Blob URL on an <a download>, clicked, its URL let go a minute later. */
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  a.hidden = true
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60e3)
}

/** A turn of the event loop, so the page stays responsive between frames (a message, which a hidden tab does not throttle like a timer). */
export function idle() {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel()
    port1.addEventListener('message', () => { port1.close(); resolve() }, { once: true })
    port1.start()
    port2.postMessage(0)
  })
}

/** Waits `ms` milliseconds. */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

/** A file size in words: '840 kB', '2.1 MB'. */
export function fmtBytes(n) {
  return n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} kB` : `${(n / 1e6).toFixed(1)} MB`
}

/** The browser's local date, YYYY-MM-DD: a file's date when the page carries none. */
export function localDate() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---------------------------------------------------------------- exports (the page only: DOM)

/**
 * Save GIF: one frame per slot, the timeline at mid-slot and every decoration still, the last frame held to the end of
 * the loop (so the GIF loops in the drawing's own D). The palette comes from a few frames first, then each frame is
 * baked, read back, indexed and handed to the encoder, the page yielding between frames.
 */
async function saveGif(app) {
  const { pace } = app
  if (!(pace.slots > 0)) return app.say('There is nothing to replay, so there is no GIF to make.')
  const plan = app.plan()
  const size = exportSize(app.box, PLAYER.GIF_WIDTH)
  app.say('Save GIF: drawing the first frame...')
  const stage = await stageFor(app, plan, size, size.width, size.height, true)
  const shot = async (i) => {
    const t = (Math.min(i, pace.slots - 1) + 0.5) * pace.slotSeconds
    await rasterize(bakeMarkup(plan, t, false, size.width, size.height), stage.ctx, size.width, size.height, app.bg, stage.asData)
    return stage.ctx.getImageData(0, 0, size.width, size.height).data
  }
  const k = Math.min(PLAYER.PALETTE_SAMPLES, pace.slots)
  const picks = [...new Set(Array.from({ length: k }, (_, j) => Math.round((j * (pace.slots - 1)) / Math.max(1, k - 1))))]
  const samples = []
  for (const i of picks) {
    app.say(`Save GIF: picking the colors (${samples.length + 1} of ${picks.length})...`)
    samples.push(await shot(i))
    await idle()
  }
  const palette = buildPalette(samples, 255)
  samples.length = 0
  const map = paletteMapper(palette)
  const gif = gifEncoder(size.width, size.height, palette)
  let prev = null
  let prevIdx = null
  for (let i = 0; i < pace.slots; i++) {
    const px = await shot(i)
    const idx = indexFrame(px, map, prev, prevIdx)
    const last = i === pace.slots - 1
    gif.add(idx, (last ? pace.slotSeconds + pace.hold : pace.slotSeconds) * 100)
    prev = px
    prevIdx = idx
    app.progress((i + 1) / pace.slots)
    app.say(`Save GIF: frame ${i + 1} of ${pace.slots}...`)
    await idle()
  }
  const blob = new Blob([gif.end()], { type: 'image/gif' })
  const name = app.name('gif')
  saveBlob(blob, name)
  app.say(`Saved ${name} (${size.width}\u00d7${size.height}, ${pace.slots} slots, ${fmtBytes(blob.size)}).`)
}

/**
 * Save video: the lively drawing (decorations moving) drawn on a canvas at about 30 frames a second, paced in real time
 * over one loop while a MediaRecorder records the canvas: a frame that draws late is skipped, the clock stays true.
 * WebM (VP9) where the browser records it, else MP4.
 */
async function saveVideo(app) {
  const { pace } = app
  const Recorder = globalThis.MediaRecorder
  const canCapture = typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function'
  if (typeof Recorder !== 'function' || !canCapture) return app.say('This browser cannot record a canvas (no MediaRecorder here): Save GIF still works.')
  const mime = pickMime((type) => Recorder.isTypeSupported(type))
  if (!mime) return app.say('This browser records neither WebM nor MP4: Save GIF still works.')
  const plan = app.plan()
  const size = exportSize(app.box, PLAYER.VIDEO_WIDTH)
  app.say('Save video: drawing the first frame...')
  // video codecs want even sides: the odd pixel is background
  const stage = await stageFor(app, plan, size, size.width + (size.width % 2), size.height + (size.height % 2), false)
  // some browsers record only a canvas that is in the document
  stage.canvas.className = 'offstage'
  document.body.append(stage.canvas)
  const draw = (t) => rasterize(bakeMarkup(plan, t, true, size.width, size.height), stage.ctx, size.width, size.height, app.bg, stage.asData)
  const stream = stage.canvas.captureStream(PLAYER.VIDEO_FPS)
  const chunks = []
  let took = 0
  try {
    const rec = new Recorder(stream, { mimeType: mime, videoBitsPerSecond: PLAYER.VIDEO_BITRATE })
    const stopped = new Promise((resolve, reject) => {
      rec.addEventListener('stop', resolve, { once: true })
      rec.addEventListener('error', (e) => reject(e.error ?? new Error('the recorder failed')), { once: true })
    })
    // a recorder that fails mid-loop is reported once the loop ends, not as an unhandled rejection before
    stopped.catch(() => {})
    rec.addEventListener('dataavailable', (e) => { if (e.data && e.data.size) chunks.push(e.data) })
    rec.start(1000)
    const t0 = performance.now()
    for (let k = 1; ; k++) {
      const due = k / PLAYER.VIDEO_FPS
      if (due >= pace.loop) break
      await sleep(t0 + due * 1000 - performance.now())
      const t = (performance.now() - t0) / 1000
      if (t >= pace.loop) break
      await draw(t)
      app.progress(t / pace.loop)
      app.say(`Save video: recording ${t.toFixed(1)} s of ${pace.loop.toFixed(1)} s (keep this tab in front)...`)
    }
    await sleep(t0 + pace.loop * 1000 - performance.now())
    rec.stop()
    await stopped
    took = performance.now() - t0
  } finally {
    for (const track of stream.getTracks()) track.stop()
    stage.canvas.remove()
  }
  const type = mime.split(';')[0]
  let blob = new Blob(chunks, { type })
  if (!blob.size) return app.say('Save video: the browser recorded nothing.')
  if (type === 'video/webm') blob = new Blob([webmDuration(new Uint8Array(await blob.arrayBuffer()), took)], { type })
  const name = app.name(type === 'video/mp4' ? 'mp4' : 'webm')
  saveBlob(blob, name)
  app.say(`Saved ${name} (${stage.canvas.width}\u00d7${stage.canvas.height}, ${pace.loop.toFixed(1)} s, ${fmtBytes(blob.size)}).`)
}

// ---------------------------------------------------------------- the player (the page only: DOM)

/**
 * The page's player: finds the drawing (svg[data-timelapse]), keeps its pristine markup, pauses its SMIL and drives it
 * from a requestAnimationFrame clock (elapsed × speed, wrapping at the loop), the scrubber and the slot's label
 * following; binds play and pause, the scrubber, the speeds, the keyboard (space plays or pauses, the arrows step a
 * slot, Home and End jump) and the export bar. Every listener is bound here: the page has no on* attribute.
 */
function main() {
  const $ = (id) => document.getElementById(id)
  const status = $('tl-status')
  const say = (text) => { if (status) status.textContent = text }
  const svg = document.querySelector('svg[data-timelapse]')
  if (!svg) return say('This page has no drawing to replay.')
  // what Save SVG writes and every frame bakes from, taken before anything touches the drawing
  const pristine = new XMLSerializer().serializeToString(svg)
  const pace = paceOf((k) => svg.getAttribute(k))
  const data = $('tl-data')
  let labels = []
  try { labels = JSON.parse(data?.getAttribute('data-labels') || '[]') } catch { labels = [] }
  if (!Array.isArray(labels)) labels = []
  const kind = data?.getAttribute('data-kind') || svg.getAttribute('data-timelapse')
  const date = data?.getAttribute('data-date')
  const play = $('tl-play')
  const scrub = $('tl-scrub')
  const slotOut = $('tl-slot')
  const bar = $('tl-progress')
  const speeds = [...document.querySelectorAll('button[data-speed]')]
  const buttons = [$('tl-gif'), $('tl-video'), $('tl-svg')].filter(Boolean)
  const bgOf = (el) => (el ? getComputedStyle(el).backgroundColor : '')
  const clearBg = (c) => !c || c === 'transparent' || /^rgba\(.*,\s*0(\.0*)?\)$/.test(c)
  let plan = null
  const app = {
    pace, say,
    box: { width: svg.getAttribute('width'), height: svg.getAttribute('height'), viewBox: svg.getAttribute('viewBox') },
    bg: [bgOf(svg), bgOf(document.body)].find((c) => !clearBg(c)) || '#171512',
    name: (ext) => fileName(kind, date, ext, localDate()),
    plan: () => (plan ??= bakePlan(pristine, pace.loop)),
    progress: (v) => { if (bar) { bar.hidden = false; bar.value = Math.min(1, Math.max(0, v)) } },
  }
  for (const id of ['tl-controls', 'tl-export']) if ($(id)) $(id).hidden = false
  const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const state = { t: 0, shown: -1, slot: -1, playing: pace.slots > 0 && !calm, speed: 1, held: false, busy: false }
  const hasClock = typeof svg.setCurrentTime === 'function' && typeof svg.pauseAnimations === 'function'
  if (hasClock) svg.pauseAnimations()
  if (!(pace.slots > 0)) {
    if ($('tl-controls')) $('tl-controls').hidden = true
    for (const b of buttons) if (b.id !== 'tl-svg') b.disabled = true
    say('There is nothing to replay here: Save SVG still saves the drawing.')
  }
  const showPlay = () => {
    if (!play) return
    play.textContent = state.playing ? '\u275a\u275a' : '\u25b6\ufe0e'
    play.setAttribute('aria-label', state.playing ? 'Pause' : 'Play')
  }
  const showSpeed = () => { for (const b of speeds) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === state.speed)) }
  const follow = () => {
    const i = slotAt(state.t, pace.slotSeconds, pace.slots)
    if (i === state.slot) return
    state.slot = i
    if (scrub && !state.held) scrub.value = String(i)
    if (slotOut) slotOut.textContent = typeof labels[i] === 'string' ? labels[i] : `slot ${i + 1}`
  }
  // the drawing at the player's time, at once (a hidden tab runs no animation frames): its SMIL clock set, the
  // scrubber and the label following
  const render = () => {
    if (state.t === state.shown) return
    state.shown = state.t
    if (hasClock) svg.setCurrentTime(state.t)
    follow()
  }
  const seekSlot = (i) => {
    state.t = (Math.min(pace.slots - 1, Math.max(0, i)) + 0.5) * pace.slotSeconds
    render()
  }
  const toggle = () => {
    if (!(pace.slots > 0)) return
    state.playing = !state.playing
    showPlay()
  }
  const step = (k) => {
    state.playing = false
    showPlay()
    seekSlot(slotAt(state.t, pace.slotSeconds, pace.slots) + k)
  }
  let last = performance.now()
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
    last = now
    if (state.playing && !state.held && pace.loop > 0) state.t = (state.t + dt * state.speed) % pace.loop
    render()
    requestAnimationFrame(frame)
  }
  // a browser that starts the drawing's clock at load gets it paused again, at the player's time
  addEventListener('load', () => {
    if (hasClock) svg.pauseAnimations()
    state.shown = -1
    render()
  })
  if (play) play.addEventListener('click', toggle)
  if (scrub) {
    scrub.max = String(Math.max(0, pace.slots - 1))
    scrub.addEventListener('input', () => { state.held = true; seekSlot(Number(scrub.value)) })
    scrub.addEventListener('change', () => { state.held = false })
  }
  for (const b of speeds) b.addEventListener('click', () => { state.speed = Number(b.dataset.speed) || 1; showSpeed() })
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented || !(pace.slots > 0)) return
    const tag = e.target && e.target.tagName
    // space on a button is that button's own click
    if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); toggle() }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1) }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); step(e.key === 'Home' ? -pace.slots : pace.slots) }
  })
  const run = (job) => async () => {
    if (state.busy) return
    state.busy = true
    for (const b of buttons) b.disabled = true
    try {
      await job(app)
    } catch (err) {
      say(`That did not work: ${err && err.message ? err.message : err}`)
    } finally {
      state.busy = false
      for (const b of buttons) b.disabled = !(pace.slots > 0) && b.id !== 'tl-svg'
      if (bar) bar.hidden = true
    }
  }
  const saveSvg = async () => {
    const name = app.name('svg')
    saveBlob(new Blob([pristine + '\n'], { type: 'image/svg+xml' }), name)
    say(`Saved ${name}.`)
  }
  const jobs = { 'tl-gif': saveGif, 'tl-video': saveVideo, 'tl-svg': saveSvg }
  for (const b of buttons) b.addEventListener('click', run(jobs[b.id]))
  showPlay()
  showSpeed()
  render()
  requestAnimationFrame(frame)
}

// ---------------------------------------------------------------- the script

/**
 * What another page's player takes from this one (the Month's export page, lib/month-player.mjs): the SMIL baker, the
 * GIF and WebM writers and the canvas and file helpers, every one standing alone but for the others and PLAYER.
 */
export const KIT = [
  clockSeconds, splitList, lerpValue, compileAnim, sampleAnim, valueAt, motionPoint, animSpec, compose, compileGroup, frameValues, exportSize, pickMime, buildPalette,
  nearestColor, paletteMapper, indexFrame, lzwEncode, subBlocks, gifEncoder, encodeGif, webmDuration, bakePlan, bakeMarkup, rasterize, stageFor, saveBlob,
  idle, sleep, fmtBytes, localDate,
]

// Every function the page runs, in the order the script declares them; main, last, calls the rest.
const PARTS = [...KIT, paceOf, slotAt, fileName, saveGif, saveVideo, main]

/**
 * A page's script: `consts` as constants by name (PLAYER, and whatever a page adds), then every function of `parts`
 * as its own source, then `tail`, all inside one function scope (nothing lands on window).
 */
export function scriptOf(parts, consts, tail) {
  const head = Object.entries(consts).map(([k, v]) => `const ${k} = ${JSON.stringify(v)}`).join('\n')
  const body = `(function () {\n'use strict'\n${head}\n${parts.map(String).join('\n')}\n${tail}\n})()\n`
  // the HTML parser turns CR LF into LF before the CSP hashes the script: hash what the browser will hash
  return body.replace(/\r\n?/g, '\n')
}

/**
 * The page's script with `tail` as its last statement: the PLAYER constants, then every function above as its own
 * source. The page ends it with main(); a test can end it with a `return` of the helpers, to run the very source the
 * page carries.
 */
export function playerScript(tail = 'main()') {
  return scriptOf(PARTS, { PLAYER }, tail)
}

/** The page's one inline script, the player started: its CSP hash is the sha256 of exactly this text. */
export const PLAYER_JS = playerScript()
