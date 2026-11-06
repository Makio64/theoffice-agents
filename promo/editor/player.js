// What a frame of a promo is, drawn the same way by the editor's preview (editor.js) and by the video export
// (render.js): the clip under time t, its storyboard panel's layers, its drawings at the clip's clock, the camera eased
// between its keyframes, its captions. An edit is { fps, clips: [{ panel, dur, sceneStart, rate, keys, captions }] }.
import { boxHtml, cardHtml, clockHtml, clockText, letters } from './box.js'

export const FPS = 30
export const EASES = {
  inOut: (u) => (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2),
  linear: (u) => u,
  in: (u) => u ** 3,
  out: (u) => 1 - (1 - u) ** 3,
  hold: (u) => (u < 1 ? 0 : 1),
}

export const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, '<b>$1</b>').replace(/\n/g, '<br>')
/** A caption as the storyboard draws it (promo/boards.mjs captionHtml): `*word*` in the neon's yellow. */
const capHtml = (c) => `<div class="cap${c.plain ? ' plain' : ''}${c.band ? ' band' : ''}"${c.fx ? ` data-fx="${c.fx}"` : ''} style="top:${c.y}px;font-size:${c.size ?? (c.band ? 74 : 56)}px"><span>${rich(c.text)}</span></div>`

/** The times of the letters the edit's text boxes type (box.js), in seconds of the video: a blip each (export.mjs). */
export function letterTimes(edit, panels) {
  const st = starts(edit.clips), out = []
  edit.clips.forEach((clip, i) => {
    // a box types in seconds of the shot, carried across a split or a trim as the rest of the panel's motion is
    const shift = (clip.sceneStart - panels[clip.panel].base) / (clip.rate || 1)
    for (const c of clip.captions) {
      if (!c.box) continue
      for (const l of letters(c)) {
        const lt = l.at - shift
        if (l.at != null && l.ch !== ' ' && lt >= 0 && lt < clip.dur) out.push(round(st[i] + lt))
      }
    }
  })
  return out
}

/**
 * The edit's sounds in seconds of the video: every panel's sounds (promo/boards.mjs: { name, at, … } with `at` in
 * seconds of the shot, carried across a split or a trim as the rest of its motion is), each in the clip it starts in;
 * the export mixes them (promo/export.mjs).
 */
export function soundCues(edit, panels) {
  const st = starts(edit.clips), out = []
  edit.clips.forEach((clip, i) => {
    const shift = (clip.sceneStart - panels[clip.panel].base) / (clip.rate || 1)
    for (const s of panels[clip.panel].sounds ?? []) {
      const lt = s.at - shift
      if (lt >= 0 && lt < clip.dur) out.push({ ...s, t: round(st[i] + lt) })
    }
  })
  return out
}

/** Each clip's start, in seconds. */
export function starts(clips) {
  let a = 0
  return clips.map((c) => { const s = a; a += c.dur; return s })
}
export const total = (clips) => clips.reduce((a, c) => a + c.dur, 0)
/** The clip playing at t (the last one at the very end). */
export function clipAt(clips, t) {
  const st = starts(clips)
  for (let i = st.length - 1; i >= 0; i--) if (t >= st[i] - 1e-9) return i
  return 0
}

/** The camera at clip time `lt`: between its keyframes, eased by the earlier one's ease; zoom in log space. */
export function camAt(clip, lt) {
  const ks = clip.keys
  if (!ks.length) return null
  if (lt <= ks[0].t) return { x: ks[0].x, y: ks[0].y, zoom: ks[0].zoom }
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i], b = ks[i + 1]
    if (lt <= b.t) {
      const e = (EASES[a.ease] ?? EASES.inOut)(b.t === a.t ? 1 : (lt - a.t) / (b.t - a.t))
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * e) }
    }
  }
  const z = ks.at(-1)
  return { x: z.x, y: z.y, zoom: z.zoom }
}

// ---------------------------------------------------------------- what moves in a panel besides its drawings

const clamp01 = (v) => Math.max(0, Math.min(1, v))
const nums = (s) => String(s).split(',').map(Number)
/** v in whole steps of 1/n: pixel art opens in steps, not smoothly. */
const steps = (v, n = 4) => Math.ceil(clamp01(v) * n) / n
const DOOR = { glass: '#a9d3ee', frame: '#2b2520', brass: '#c9a26b', kick: '#6e5233', lobby: '#f1d796', floor: '#9a7b4f' }
const rect = (x, y, w, h, fill, op) => (w > 0 ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${op != null ? ` fill-opacity="${op}"` : ''}/>` : '')

/**
 * The entrance's doorway (promo/boards.mjs withDoors) at opening `u` (0 shut … 1 open): the lit lobby, and each glass
 * leaf narrowing toward its hinge as it swings in (in whole art pixels), darker as it turns. Shut, it is the drawing's.
 */
function doorway(el, u) {
  const w = Math.max(2, Math.round(18 * (1 - 0.82 * u)))
  if (el.dataset.w === String(w)) return
  el.dataset.w = w
  const [dx, top] = nums(el.dataset.door)
  const y = top + 10, h = 30, L = dx + 1, R = dx + 39, shade = (0.4 * u).toFixed(2)
  const bar = Math.round((w * 15) / 18), barR = Math.round((w * 16) / 18)
  el.innerHTML = rect(L, y, 38, h, DOOR.lobby) + rect(L, y + h - 6, 38, 6, DOOR.floor) + rect(L, y, 38, 2, '#000', 0.3) +
    rect(L, y, w, h, DOOR.glass) + rect(L + w, y, 1, h, DOOR.frame) + rect(L, top + 36, w, 4, DOOR.kick) +
    (w > 4 ? rect(L + bar, top + 22, 1, 8, DOOR.brass) + rect(L + 2, top + 12, 2, 22, '#fff', 0.25) : '') + rect(L, y, w + 1, h, '#000', shade) +
    rect(R - w, y, w, h, DOOR.glass) + rect(R - w - 1, y, 1, h, DOOR.frame) + rect(R - w, top + 36, w, 4, DOOR.kick) +
    (w > 4 ? rect(R - barR, top + 22, 1, 8, DOOR.brass) + rect(R - barR, top + 12, 2, 22, '#fff', 0.25) : '') + rect(R - w - 1, y, w + 1, h, '#000', shade)
}

// a pixel-art dissolve: a 4 × 4 Bayer tile whose cells under the step (0…16) are opaque, as a CSS mask
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const masks = new Map()
function ditherMask(step, cell) {
  const key = `${step}:${cell}`
  if (!masks.has(key)) {
    const cells = BAYER.map((v, i) => (v < step ? `<rect x="${(i % 4) * cell}" y="${Math.floor(i / 4) * cell}" width="${cell}" height="${cell}"/>` : '')).join('')
    masks.set(key, `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${4 * cell}" height="${4 * cell}" shape-rendering="crispEdges">${cells}</svg>`)}")`)
  }
  return masks.get(key)
}

// ---------------------------------------------------------------- the cuts and the entrances

/** The pixel transitions a clip can come in or go out with (clip.fx.in, clip.fx.out), through the sky behind it. */
export const CUTS = ['none', 'mosaic', 'blocks', 'iris', 'dither', 'blinds']
const svgUri = (w, h, body, extra = '') => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges"${extra}>${body}</svg>`)}")`
const cuts = new Map()
/**
 * A frame-size mask for transition `kind` at `p` (0 nothing shown … 1 all of it): blocks, squares growing in steps
 * along the diagonal; iris, a diamond of pixels opening from the middle; dither, a Bayer dissolve in 30-px cells;
 * blinds, rows of pixels sliding in, every other one from the other side. `[image, size]`.
 */
function cutMask(kind, p, FW, FH) {
  const key = `${kind}:${Math.round(p * 60)}:${FW}x${FH}`
  if (cuts.has(key)) return cuts.get(key)
  let out
  if (kind === 'dither') out = [ditherMask(Math.round(p * 16), 30), '120px 120px', 'repeat']
  else {
    let body = ''
    if (kind === 'blocks') {
      const B = 120, cols = Math.ceil(FW / B), rows = Math.ceil(FH / B)
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const q = clamp01(p * 1.6 - ((c + r) / (cols + rows - 2)) * 0.6)
        const sz = steps(q) * B
        if (sz > 0) body += `<rect x="${c * B + (B - sz) / 2}" y="${r * B + (B - sz) / 2}" width="${sz}" height="${sz}"/>`
      }
    } else if (kind === 'iris') {
      const B = 60, cols = Math.ceil(FW / B), rows = Math.ceil(FH / B)
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const d = Math.abs(c + 0.5 - cols / 2) / cols + Math.abs(r + 0.5 - rows / 2) / rows
        if (d <= p) body += `<rect x="${c * B}" y="${r * B}" width="${B}" height="${B}"/>`
      }
    } else if (kind === 'blinds') {
      const B = 80, C = 60, rows = Math.ceil(FH / B), cols = Math.ceil(FW / C)
      for (let r = 0; r < rows; r++) {
        const n = Math.round(clamp01(p * 1.5 - (r / rows) * 0.5) * cols)
        if (n) body += `<rect x="${r % 2 ? FW - n * C : 0}" y="${r * B}" width="${n * C}" height="${B}"/>`
      }
    }
    out = [svgUri(FW, FH, body), `${FW}px ${FH}px`, 'no-repeat']
  }
  cuts.set(key, out)
  return out
}
/** An element's mask, [image, size, repeat] (none when left out). */
function setMask(el, [image, size, repeat] = []) {
  for (const pre of ['', '-webkit-']) {
    el.style.setProperty(`${pre}mask-image`, image || 'none')
    el.style.setProperty(`${pre}mask-size`, size || 'auto')
    el.style.setProperty(`${pre}mask-repeat`, repeat || 'repeat')
  }
}

/** An element's own mask of 8 × 4 squares growing along its diagonal, stretched to it (an entrance's 'blocks'). */
function blockMask(u) {
  let body = ''
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
    const sz = steps(clamp01(u * 1.6 - ((c + r) / 10) * 0.6))
    if (sz > 0) body += `<rect x="${c + (1 - sz) / 2}" y="${r + (1 - sz) / 2}" width="${sz}" height="${sz}"/>`
  }
  return [svgUri(8, 4, body, ' preserveAspectRatio="none"'), '100% 100%', 'no-repeat']
}
// a stepped overshoot (pop), a fall with a stepped bounce (drop), in frames of the entrance
const POP = [0.25, 0.6, 1.16, 1.08, 0.96, 1.02, 1]
const DROP = [-120, -70, -25, 8, -5, 2, 0]
/**
 * An element's entrance, data-fx "kind:from:dur …" (seconds of the shot): pop, drop, rise (up 48 px in 8-px steps),
 * blocks (assembled from squares), dither (a Bayer dissolve); several at once. Before its start it is not there.
 */
function entrance(el, spec, at) {
  let transform = '', hidden = false, mask = null
  for (const part of spec.split(/\s+/)) {
    const [kind, a, d] = part.split(':')
    const u = (at - Number(a)) / Number(d)
    if (u <= 0) { hidden = true; continue }
    if (u >= 1) continue
    const i = (list) => list[Math.min(list.length - 1, Math.floor(u * list.length))]
    if (kind === 'pop') transform += ` scale(${i(POP)})`
    else if (kind === 'drop') transform += ` translateY(${i(DROP)}%)`
    else if (kind === 'rise') transform += ` translateY(${Math.round((1 - u) * 6) * 8}px)`
    else if (kind === 'blocks') mask = blockMask(u)
    else if (kind === 'dither') mask = [ditherMask(Math.round(u * 16), 3), '12px 12px', 'repeat']
  }
  el.style.visibility = hidden ? 'hidden' : ''
  el.style.transformOrigin = '50% 50%'
  el.style.transform = transform.trim()
  setMask(el, mask ?? undefined)
}

/**
 * The panel's own motion at `at`, its seconds since the shot began: data-fx (an entrance), data-dither "from,to,cell,rise" (a window
 * dissolving in through a Bayer dither of `cell` px blocks while it rises `rise` px into place, in 2-px steps),
 * data-pop "from,to" (a window opening as an old screen: a line, then its height, in steps), data-type "from,letters per second" (its text typed in), data-show and
 * data-hide (seconds), data-blink "from,period" (a cursor, steady before), data-marquee "period,offset" (the sign's
 * bulbs, lit by turns), data-doors (the entrance's leaves), data-reveal "from,letters per second" (a text box's
 * letters, each its own element, shown in turn: the lines laid out from the start).
 */
function animate(els, at) {
  for (const el of els) {
    const d = el.dataset
    if (d.pop) {
      const [a, b] = nums(d.pop)
      const u = (at - a) / (b - a)
      el.style.visibility = u <= 0 ? 'hidden' : ''
      el.style.transformOrigin = '50% 50%'
      el.style.transform = u <= 0 || u >= 1 ? '' : `scale(${u < 0.5 ? steps(u / 0.5) : 1},${u < 0.5 ? 0.03 : Math.max(0.03, steps((u - 0.5) / 0.5))})`
    }
    if (d.fx) entrance(el, d.fx, at)
    if (d.dither) {
      const [a, b, cell = 4, rise = 12] = nums(d.dither)
      const u = clamp01((at - a) / (b - a))
      const step = Math.round(u * 16)
      const mask = step > 0 && step < 16 ? ditherMask(step, cell) : ''
      el.style.visibility = step <= 0 ? 'hidden' : ''
      for (const k of ['mask-image', '-webkit-mask-image']) el.style.setProperty(k, mask || 'none')
      for (const k of ['mask-size', '-webkit-mask-size']) el.style.setProperty(k, mask ? `${4 * cell}px ${4 * cell}px` : 'auto')
      el.style.transform = step >= 16 ? '' : `translateY(${Math.round(((1 - u) * rise) / 2) * 2}px)`
    }
    if (d.clock) {
      // the day's clock: minutes on from the shot's start, in ticks; the colon blinks each second
      const [from, rate, step] = nums(d.clock)
      el.innerHTML = clockText(Math.floor((from + at * rate) / step) * step, d.day, at - Math.floor(at) < 0.5)
    }
    if (d.reveal) {
      const [a, cps] = nums(d.reveal)
      el.letters ??= [...el.children].filter((c) => c.tagName === 'SPAN')
      const n = Math.max(0, Math.floor((at - a) * cps + 1e-6))
      el.letters.forEach((c, k) => { c.style.visibility = k < n ? '' : 'hidden' })
    }
    if (d.type) {
      const [a, cps] = nums(d.type)
      d.text ??= el.textContent
      el.textContent = d.text.slice(0, Math.max(0, Math.floor((at - a) * cps)))
    }
    if (d.show || d.hide || d.blink) {
      let on = !(d.show && at < Number(d.show)) && !(d.hide && at >= Number(d.hide))
      if (on && d.blink) {
        const [a, p] = nums(d.blink)
        if (at >= a) on = Math.floor((at - a) / (p / 2)) % 2 === 0
      }
      el.style.visibility = on ? '' : 'hidden'
    }
    if (d.marquee) {
      const [p, o = 0] = nums(d.marquee)
      el.classList.toggle('alt', Math.floor((at + o) / (p / 2)) % 2 === 1)
    }
    if (d.doors) {
      const [a, b, c, e] = nums(d.doors)
      const u = at <= a ? 0 : at < b ? (at - a) / (b - a) : !(c >= 0) || at < c ? 1 : at < e ? 1 - (at - c) / (e - c) : 0
      doorway(el, EASES.inOut(clamp01(u)))
    }
  }
}

/**
 * A player on `stage`, an element of the frame's size at scale 1: draw(edit, panels, t) shows the frame at t and says
 * what it drew ({ i, clip, panel, lt, cam }). A panel's layers are only rebuilt when the clip shows another panel.
 */
let players = 0
export function player(stage) {
  // the mosaic: one source pixel pair a B × B block (feFlood in a B-wide tile, kept where the picture is), grown to fill it
  const fid = `pl-mosaic-${++players}`
  stage.innerHTML = `<svg width="0" height="0" style="position:absolute"><filter id="${fid}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    '<feFlood x="0" y="0" width="2" height="2"/><feComposite width="8" height="8"/><feTile result="grid"/><feComposite in="SourceGraphic" in2="grid" operator="in"/>' +
    '<feMorphology operator="dilate" radius="3"/></filter></svg><div style="position:absolute;inset:0"><div></div><div></div></div><div style="position:absolute;inset:0"></div>'
  const [flood, tile, , , grow] = stage.querySelector('filter').children
  // the scene (its drawings and captions) goes through the cuts; the text box over it stays steady (box.js)
  const [, scene, ui] = stage.children
  const [layers, caps] = scene.children
  /** The picture in blocks of B px (a power of two; 1, sharp), dimmed toward the peak. */
  function mosaic(B, dim = 0) {
    if (B <= 1) { scene.style.filter = ''; return }
    for (const [el, k, v] of [[flood, 'x', B / 2 - 1], [flood, 'y', B / 2 - 1], [tile, 'width', B], [tile, 'height', B], [grow, 'radius', B / 2 - 1]]) el.setAttribute(k, v)
    scene.style.filter = `url(#${fid})${dim ? ` brightness(${(1 - dim).toFixed(2)})` : ''}`
  }
  let shown = -1, capsKey = '', svgs = [], camSvgs = [], moving = [], capsMoving = []
  function draw(edit, panels, t) {
    const cs = edit.clips, i = clipAt(cs, t), clip = cs[i], panel = panels[clip.panel]
    const lt = t - starts(cs)[i]
    if (shown !== clip.panel) {
      layers.innerHTML = panel.html
      scene.style.background = panel.bg
      svgs = [...layers.querySelectorAll('svg[data-time]')]
      for (const s of svgs) s.pauseAnimations()
      // a drawing over the camera's (the walkers arriving) has its own camera at the same place: they move as one
      camSvgs = [...layers.querySelectorAll('svg[data-cam]')]
      moving = [...layers.querySelectorAll('[data-fx],[data-dither],[data-pop],[data-type],[data-show],[data-hide],[data-blink],[data-marquee],[data-doors]')]
      shown = clip.panel
    }
    const key = `${i}${JSON.stringify(clip.captions)}`
    if (key !== capsKey) {
      caps.innerHTML = clip.captions.filter((c) => !c.box && !c.card && !c.clock).map(capHtml).join('')
      ui.innerHTML = clip.captions.filter((c) => c.box || c.card || c.clock).map((c) => (c.clock ? clockHtml(c) : c.card ? cardHtml(c) : boxHtml(c))).join('')
      capsMoving = [...caps.querySelectorAll('[data-fx]'), ...ui.querySelectorAll('[data-fx],[data-reveal],[data-show],[data-blink],[data-clock]')]
      capsKey = key
    }
    const cam = camAt(clip, lt)
    for (const camSvg of cam ? camSvgs : []) {
      const [FW, FH] = panel.frame
      const z = cam.zoom
      camSvg.style.width = `${Math.round(Number(camSvg.dataset.w) * z)}px`
      camSvg.style.height = `${Math.round(Number(camSvg.dataset.h) * z)}px`
      camSvg.style.transform = `translate(${Math.round(FW / 2 - cam.x * z)}px,${Math.round(FH / 2 - cam.y * z)}px)`
      // an isolated scene stays on its rectangle as the camera moves: the clip, and the frame round it
      const wrap = camSvg.parentElement
      if (wrap.dataset.iso) {
        const [x, y, w, h] = nums(wrap.dataset.iso)
        const X0 = Math.max(0, FW / 2 + (x - cam.x) * z), Y0 = Math.max(0, FH / 2 + (y - cam.y) * z)
        const X1 = Math.min(FW, FW / 2 + (x + w - cam.x) * z), Y1 = Math.min(FH, FH / 2 + (y + h - cam.y) * z)
        // a room in focus keeps the building round it (dimmed by its frame's shadow); an isolated scene is cut out
        const focus = wrap.dataset.focus != null, m = focus ? 0 : 18
        if (!focus) wrap.style.clipPath = `inset(${Y0}px ${FW - X1}px ${FH - Y1}px ${X0}px)`
        const f = wrap.nextElementSibling
        if (f?.dataset.isof != null) Object.assign(f.style, { left: `${X0 - m}px`, top: `${Y0 - m}px`, width: `${X1 - X0 + 2 * m}px`, height: `${Y1 - Y0 + 2 * m}px` })
      }
    }
    // the panel's own motion runs in seconds of the shot, carried across a split or a trim by the clip's clock
    const at = lt + (clip.sceneStart - panel.base) / (clip.rate || 1)
    // a drawing on its own clock (data-own, a pace) runs in seconds of the shot, whatever the clip's rate
    const off = clip.sceneStart - panel.base + lt * clip.rate
    for (const s of svgs) s.setCurrentTime(Math.max(0, Number(s.dataset.time) + (s.dataset.own ? at * Number(s.dataset.own) : off)))
    animate(moving, at)
    animate(capsMoving, at)
    // the cut: the clip comes in through its transition and goes out through another, the sky behind showing through
    const fx = clip.fx ?? {}
    const d = Math.min(fx.dur ?? 0.2, clip.dur / 2)
    const [FW, FH] = panel.frame
    const cut = fx.in && fx.in !== 'none' && lt < d ? [fx.in, lt / d] : fx.out && fx.out !== 'none' && clip.dur - lt < d ? [fx.out, (clip.dur - lt) / d] : null
    if (cut?.[0] === 'mosaic') {
      // blocks doubling 1 → 64 px into the cut and halving back out of it, the picture dimming a little at the peak
      const q = 1 - clamp01(cut[1])
      setMask(scene)
      mosaic(q <= 0 ? 1 : Math.min(64, 2 ** Math.ceil(q * 6)), 0.35 * q * q)
    } else {
      mosaic(1)
      setMask(scene, cut ? cutMask(cut[0], cut[1], FW, FH) : undefined)
    }
    return { i, clip, panel, lt, cam }
  }
  return { draw, reset() { shown = -1; capsKey = '' } }
}
