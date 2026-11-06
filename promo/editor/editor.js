// The promo editor's page: a player that draws the clip under the playhead (the storyboard panel's layers, its drawing
// at the clip's clock, the camera between its keyframes), a CapCut-like timeline (one clip per panel, its keyframes as
// diamonds, trim handles, drag to reorder) and an inspector. The whole edit is one object (S.edit), undoable, saved to
// the server (promo/edits/<board>.json) a moment after each change.
import { FPS, EASES, CUTS, round, esc, starts as startsOf, total as totalOf, clipAt as clipAtOf, camAt, player } from './player.js'

const $ = (s, el = document) => el.querySelector(s)
const X0 = 16 // the timeline's left margin, px
const S = {
  boards: [], key: '', edit: null, panels: [], frame: [1080, 1920], scale: 1,
  t: 0, playing: false, keyIx: null, pps: 80, undo: [], redo: [], isSaved: false, saveTimer: 0, last: 0, export: null, exportTimer: 0, lastVideo: null,
}
const P = player($('#stage'))

const snap = (t) => Math.round(t * FPS) / FPS
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const tc = (t) => {
  const f = Math.round(t * FPS)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(Math.floor(f / FPS / 60))}:${p(Math.floor(f / FPS) % 60)}:${p(f % FPS)}`
}

// ---------------------------------------------------------------- the timeline's arithmetic

const clips = () => S.edit.clips
const starts = () => startsOf(clips())
const total = () => totalOf(clips())
const clipAt = (t) => clipAtOf(clips(), t)
const cur = () => clipAt(S.t)
const localT = () => S.t - starts()[cur()]

// ---------------------------------------------------------------- loading and saving

async function boot() {
  const r = await (await fetch('/api/boards')).json()
  S.boards = r.boards
  document.head.insertAdjacentHTML('beforeend', `<link rel="stylesheet" href="${r.fonts}"><style>${r.css}</style>`)
  $('#board').innerHTML = S.boards.map((b) => `<option value="${b.key}">${esc(b.title)}</option>`).join('')
  const want = location.hash.slice(1)
  await load(S.boards.some((b) => b.key === want) ? want : S.boards.at(-1).key)
  bind()
  requestAnimationFrame(tick)
}

async function load(key) {
  const r = await (await fetch(`/api/board/${key}`)).json()
  Object.assign(S, { key, edit: r.edit, panels: r.panels, isSaved: r.isSaved, frame: r.panels[0].frame, t: 0, keyIx: null, undo: [], redo: [] })
  P.reset()
  history.replaceState(null, '', `#${key}`)
  $('#board').value = key
  status(S.isSaved ? 'Saved edit' : 'Storyboard timing', S.isSaved)
  fit()
  fitTimeline()
  all()
  exportState()
}

function status(text, ok = false) {
  const el = $('#status')
  el.textContent = text
  el.classList.toggle('saved', ok)
}
function scheduleSave() {
  status('Saving…')
  clearTimeout(S.saveTimer)
  S.saveTimer = setTimeout(save, 500)
}
async function save() {
  clearTimeout(S.saveTimer)
  const res = await fetch(`/api/board/${S.key}`, { method: 'POST', body: JSON.stringify(S.edit) })
  S.isSaved = res.ok
  status(res.ok ? `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Save failed', res.ok)
}

let toastTimer = 0
function toast(text) {
  const el = $('#toast')
  el.textContent = text
  el.classList.add('on')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('on'), 1100)
}

// ---------------------------------------------------------------- edits: undo, change

function checkpoint() {
  S.undo.push(JSON.stringify(S.edit))
  if (S.undo.length > 300) S.undo.shift()
  S.redo = []
}
function undo() {
  if (!S.undo.length) return
  S.redo.push(JSON.stringify(S.edit))
  S.edit = JSON.parse(S.undo.pop())
  S.keyIx = null
  changed()
}
function redo() {
  if (!S.redo.length) return
  S.undo.push(JSON.stringify(S.edit))
  S.edit = JSON.parse(S.redo.pop())
  S.keyIx = null
  changed()
}
/** After any change of the edit: redraw what shows it, save soon. `inspector: false` while typing in it. */
function changed({ inspector = true } = {}) {
  S.t = clamp(S.t, 0, total())
  timeline()
  shots()
  if (inspector) inspect()
  render()
  scheduleSave()
}
function all() {
  timeline()
  shots()
  inspect()
  render()
}

/** The camera set at the playhead: the keyframe there moves, or a new one is made. */
function keyHere(cam) {
  const i = cur()
  const clip = clips()[i]
  if (!clip.keys.length && !S.panels[clip.panel].cam) return
  const lt = round(snap(localT()))
  let k = clip.keys.find((q) => Math.abs(q.t - lt) < 0.5 / FPS)
  if (!k) {
    k = { t: lt, x: 0, y: 0, zoom: 1, ease: 'inOut' }
    clip.keys.push(k)
    clip.keys.sort((a, b) => a.t - b.t)
    toast('◆ keyframe added')
  }
  Object.assign(k, { x: round(cam.x, 1), y: round(cam.y, 1), zoom: round(cam.zoom, 3) })
  S.keyIx = clip.keys.indexOf(k)
}

function addKey() {
  const clip = clips()[cur()]
  const cam = camAt(clip, localT())
  if (!cam) return toast('A layout shot has no camera')
  checkpoint()
  keyHere(cam)
  changed()
}

function split() {
  const st = starts(), i = cur(), c = clips()[i]
  const lt = snap(S.t - st[i])
  if (lt < 1 / FPS || lt > c.dur - 1 / FPS) return toast('Move the playhead inside a clip to split it')
  checkpoint()
  const cam = camAt(c, lt)
  const capsCopy = () => c.captions.map((q) => ({ ...q }))
  const a = { ...c, dur: round(lt), keys: c.keys.filter((k) => k.t < lt - 1e-6).map((k) => ({ ...k })), captions: capsCopy() }
  const b = { ...c, dur: round(c.dur - lt), sceneStart: round(c.sceneStart + lt * c.rate), keys: c.keys.filter((k) => k.t > lt + 1e-6).map((k) => ({ ...k, t: round(k.t - lt) })), captions: capsCopy() }
  if (cam) {
    const at = { x: round(cam.x, 1), y: round(cam.y, 1), zoom: round(cam.zoom, 3) }
    const ease = [...c.keys].reverse().find((k) => k.t <= lt)?.ease ?? 'inOut'
    a.keys.push({ t: a.dur, ...at, ease })
    b.keys.unshift({ t: 0, ...at, ease })
  }
  clips().splice(i, 1, a, b)
  S.keyIx = null
  toast('✂ split')
  changed()
}

function del() {
  const i = cur(), clip = clips()[i]
  checkpoint()
  if (S.keyIx != null && clip.keys[S.keyIx]) {
    clip.keys.splice(S.keyIx, 1)
    S.keyIx = null
    toast('keyframe deleted')
  } else if (clips().length > 1) {
    clips().splice(i, 1)
    toast('clip deleted')
  } else return S.undo.pop()
  changed()
}

function seek(t) {
  const before = cur()
  S.t = clamp(t, 0, total())
  if (cur() !== before) {
    S.keyIx = null
    inspect()
    shots()
    timeline()
  }
  render()
}

function jumpKey(dir) {
  const st = starts()
  const all = clips().flatMap((c, i) => c.keys.map((k) => round(st[i] + k.t)))
  const t = dir > 0 ? all.find((v) => v > S.t + 1e-4) : [...all].reverse().find((v) => v < S.t - 1e-4)
  if (t != null) seek(t)
}

// ---------------------------------------------------------------- the export

/** Export: the edit saved first, then filmed by the server (promo/export.mjs) while the button fills. */
async function exportVideo() {
  if (S.export?.state === 'running') return
  setPlaying(false)
  await save()
  const res = await fetch(`/api/export/${S.key}`, { method: 'POST' })
  const r = await res.json()
  if (!res.ok) return toast(r.error)
  S.export = r.job
  showExport()
  pollExport()
}
function pollExport() {
  clearTimeout(S.exportTimer)
  S.exportTimer = setTimeout(async () => {
    const key = S.key
    const r = await (await fetch(`/api/export/${key}`)).json()
    if (key !== S.key) return
    S.export = r.job
    S.lastVideo = r.last
    showExport()
    if (r.job?.state === 'running') pollExport()
    else if (r.job?.state === 'done') toast(`exported in ${r.job.seconds} s`)
  }, 400)
}
function showExport() {
  const b = $('#export'), j = S.export
  const running = j?.state === 'running'
  const pct = running && j.total ? Math.floor((j.done / j.total) * 100) : 0
  b.disabled = running
  b.textContent = running ? `Exporting ${pct}%` : '⬆ Export'
  b.style.setProperty('--p', `${pct}%`)
  const done = j?.state === 'done' ? j : S.lastVideo
  $('#exported').innerHTML = j?.state === 'error' ? `<span class="err" title="${esc(j.error)}">export failed: ${esc(j.error)}</span>`
    : done && !running ? `<a href="${done.file}" target="_blank" title="${esc(done.path)}">▶ ${esc(done.path.split('/').at(-1))}</a>` : ''
}
async function exportState() {
  const key = S.key
  const r = await (await fetch(`/api/export/${key}`)).json()
  if (key !== S.key) return
  S.export = r.job
  S.lastVideo = r.last
  showExport()
  if (r.job?.state === 'running') pollExport()
}

// ---------------------------------------------------------------- the player

function fit() {
  const box = $('#player').getBoundingClientRect()
  const [FW, FH] = S.frame
  S.scale = Math.min((box.width - 40) / FW, (box.height - 44) / FH)
  const vp = $('#viewport')
  vp.style.width = `${FW * S.scale}px`
  vp.style.height = `${FH * S.scale}px`
  for (const el of [$('#stage'), $('#overlay')]) Object.assign(el.style, { width: `${FW}px`, height: `${FH}px`, transform: `scale(${S.scale})` })
}

function render() {
  if (!S.edit) return
  const { clip, panel, lt, cam } = P.draw(S.edit, S.panels, S.t)
  $('#viewport').classList.toggle('nocam', !panel.cam)
  $('#playerHint').textContent = panel.cam ? 'drag to move the camera · scroll to zoom · a keyframe is set at the playhead' : 'layout shot: no camera to move, time it on the timeline'
  $('#clock').textContent = `${tc(S.t)} / ${tc(total())}`
  $('#playhead').style.left = `${X0 + S.t * S.pps}px`
  // the overlay: the safe zone, and a diamond while the playhead sits on a keyframe
  const onKey = clip.keys.some((k) => Math.abs(k.t - lt) < 0.5 / FPS)
  const [FW, FH] = S.frame
  $('#overlay').innerHTML = ($('#safe').checked && FH === 1920 ? '<i class="ed-safe" style="top:220px"><span>safe zone</span></i><i class="ed-safe" style="top:1500px"></i>' : '') +
    (onKey ? '<b class="ed-onkey">◆ keyframe</b>' : '')
  // the inspector's live camera and the minimap's frame
  if (cam) {
    for (const [f, v, d] of [['x', cam.x, 1], ['y', cam.y, 1], ['zoom', cam.zoom, 3]]) {
      const el = $(`#inspector input[data-c="${f}"]`)
      if (el && document.activeElement !== el) el.value = round(v, d)
    }
    const rect = $('#inspector .ed-cam-rect')
    if (rect && panel.cam) {
      const m = $('#inspector .ed-minimap').clientWidth / panel.cam.w
      Object.assign(rect.style, { left: `${(cam.x - FW / 2 / cam.zoom) * m}px`, top: `${(cam.y - FH / 2 / cam.zoom) * m}px`, width: `${(FW / cam.zoom) * m}px`, height: `${(FH / cam.zoom) * m}px` })
    }
  }
}

function tick(now) {
  const dt = S.last ? (now - S.last) / 1000 : 0
  S.last = now
  if (S.playing) {
    let t = S.t + dt
    if (t >= total()) {
      if ($('#loop').checked) t = 0
      else { t = total(); setPlaying(false) }
    }
    seek(t)
    // keep the playhead in view
    const sc = $('#scroll'), x = X0 + S.t * S.pps
    if (x > sc.scrollLeft + sc.clientWidth - 60 || x < sc.scrollLeft) sc.scrollLeft = x - 80
  }
  requestAnimationFrame(tick)
}
function setPlaying(on) {
  S.playing = on
  $('#play').textContent = on ? '❚❚' : '▶'
  if (on && S.t >= total() - 1e-6) S.t = 0
}

// ---------------------------------------------------------------- the timeline

function fitTimeline() {
  const w = $('#scroll').clientWidth - X0 * 2 - 40
  S.pps = clamp(w / Math.max(1, total()), 20, 600)
  $('#zoom').value = S.pps
}

function timeline() {
  const st = starts(), T = total(), pps = S.pps, cs = clips(), i0 = cur()
  $('#content').style.width = `${X0 * 2 + T * pps + 400}px`
  // the ruler: a labelled tick per step wide enough for its label, minor ticks between
  const major = [1 / FPS * 5, 0.25, 0.5, 1, 2, 5, 10].find((s) => s * pps >= 64) ?? 10
  const minor = major / 5
  let ticks = ''
  for (let k = 0; k * minor <= T + 2 + 1e-9; k++) {
    const t = k * minor, isMajor = k % 5 === 0
    ticks += `<i class="ed-tick${isMajor ? ' major' : ''}" style="left:${X0 + t * pps}px">${isMajor ? `<span>${major < 1 ? tc(t) : `${round(t, 2)}s`}</span>` : ''}</i>`
  }
  $('#ruler').innerHTML = ticks
  $('#mainTrack').innerHTML = cs.map((c, i) => {
    const p = S.panels[c.panel]
    const keys = c.keys.map((k, ki) => `<i class="ed-key${i === i0 && ki === S.keyIx ? ' sel' : ''}" data-k="${ki}" style="left:${k.t * pps}px" title="${tc(st[i] + k.t)} · x ${k.x} y ${k.y} zoom ${k.zoom}"></i>`).join('')
    return `<div class="ed-clip${i === i0 ? ' sel' : ''}" data-i="${i}" style="left:${X0 + st[i] * pps}px;width:${Math.max(6, c.dur * pps - 2)}px;background-image:url(${p.thumb})">
      <div class="ed-clip-name">${i + 1} · ${esc(p.label)}</div>${keys}
      <div class="ed-clip-cam">${p.cam ? `${c.keys.length} ◆` : 'layout'}</div><div class="ed-clip-dur">${c.dur.toFixed(2)}s</div>
      <b class="ed-trim l"></b><b class="ed-trim r"></b></div>`
  }).join('')
  $('#capTrack').innerHTML = cs.map((c, i) => {
    const words = c.captions.filter((q) => !q.plain && q.text).map((q) => q.text.replace(/\*/g, '').replace(/\n/g, ' ')).join(' / ')
    return words ? `<div class="ed-capblock" style="left:${X0 + st[i] * pps}px;width:${Math.max(6, c.dur * pps - 2)}px" title="${esc(words)}">T ${esc(words)}</div>` : ''
  }).join('')
  render()
}

/** A pointer drag: `move(dx, dy, e)` while it moves, `up(dx, dy, e)` when it lets go. */
function drag(e, move, up) {
  const x0 = e.clientX, y0 = e.clientY
  const mm = (ev) => move(ev.clientX - x0, ev.clientY - y0, ev)
  const uu = (ev) => {
    removeEventListener('pointermove', mm)
    removeEventListener('pointerup', uu)
    up?.(ev.clientX - x0, ev.clientY - y0, ev)
  }
  addEventListener('pointermove', mm)
  addEventListener('pointerup', uu)
}
const timeAtX = (clientX) => {
  const sc = $('#scroll')
  return (clientX - sc.getBoundingClientRect().left + sc.scrollLeft - X0) / S.pps
}
/** A time snapped to the frame grid, and to the playhead and the clips' edges when within 6 px. */
function snapT(t, except = -1) {
  const st = starts()
  const marks = [S.t, total(), ...st.filter((_, i) => i !== except)]
  for (const m of marks) if (Math.abs(m - t) * S.pps < 6) return m
  return snap(t)
}

function scrub(e) {
  seek(timeAtX(e.clientX))
  drag(e, (dx, dy, ev) => seek(timeAtX(ev.clientX)))
}

function onTrack(e) {
  const keyEl = e.target.closest('.ed-key')
  const trim = e.target.closest('.ed-trim')
  const clipEl = e.target.closest('.ed-clip')
  if (!clipEl) return scrub(e)
  e.preventDefault()
  const i = Number(clipEl.dataset.i)
  const st = starts()
  const c = clips()[i]
  if (keyEl) {
    // a keyframe: select it, put the playhead on it, drag it along its clip
    const ki = Number(keyEl.dataset.k)
    const k = c.keys[ki]
    seek(st[i] + k.t)
    S.keyIx = ki
    checkpoint()
    const t0 = k.t
    let moved = false
    drag(e, (dx) => {
      moved = true
      k.t = round(clamp(snap(t0 + dx / S.pps), 0, c.dur))
      S.t = st[i] + k.t
      timeline()
    }, () => {
      c.keys.sort((a, b) => a.t - b.t)
      S.keyIx = c.keys.indexOf(k)
      if (moved) changed()
      else { S.undo.pop(); all() }
    })
    return
  }
  if (trim?.classList.contains('r')) {
    // the right edge: the clip's length, the clips after it follow (ripple)
    checkpoint()
    const d0 = c.dur
    drag(e, (dx) => {
      const end = snapT(st[i] + d0 + dx / S.pps, i + 1)
      c.dur = round(Math.max(1 / FPS, end - st[i]))
      timeline()
    }, () => changed())
    return
  }
  if (trim?.classList.contains('l')) {
    // the left edge: trims the clip's start, its drawing's clock and keyframes keep their place in the picture
    checkpoint()
    const o = { dur: c.dur, sceneStart: c.sceneStart, keys: c.keys.map((k) => k.t) }
    drag(e, (dx) => {
      let d = snap(dx / S.pps)
      d = clamp(d, -o.sceneStart / Math.max(c.rate, 1e-6), o.dur - 1 / FPS)
      c.dur = round(o.dur - d)
      c.sceneStart = round(o.sceneStart + d * c.rate)
      c.keys.forEach((k, j) => { k.t = round(o.keys[j] - d) })
      timeline()
    }, () => changed())
    return
  }
  // the clip: select it (the playhead comes to it), drag it to another place in the track
  if (S.t < st[i] || S.t >= st[i] + c.dur) seek(st[i])
  S.keyIx = null
  all()
  const el = $(`.ed-clip[data-i="${i}"]`)
  let dragging = false
  drag(e, (dx) => {
    if (!dragging && Math.abs(dx) < 5) return
    dragging = true
    el.classList.add('drag')
    el.style.transform = `translateX(${dx}px)`
  }, (dx, dy, ev) => {
    if (!dragging) return
    const t = timeAtX(ev.clientX)
    const mids = starts().map((s, j) => s + clips()[j].dur / 2)
    let j = mids.filter((m) => m < t).length
    if (j > i) j -= 1
    if (j !== i) {
      checkpoint()
      const [moved] = clips().splice(i, 1)
      clips().splice(j, 0, moved)
      S.t = starts()[j]
      changed()
    } else timeline()
  })
}

// ---------------------------------------------------------------- the side panels

function shots() {
  const st = starts(), i0 = cur()
  $('#shots').innerHTML = `<div class="ed-sec"><h3>${esc(S.boards.find((b) => b.key === S.key)?.title ?? '')}</h3><p class="ed-meta">${esc(S.boards.find((b) => b.key === S.key)?.meta ?? '')}</p></div>
    <div class="ed-shots">${clips().map((c, i) => {
      const p = S.panels[c.panel]
      return `<div class="ed-shot${i === i0 ? ' cur' : ''}" data-i="${i}"><img src="${p.thumb}" alt=""><div><b>${i + 1} · ${esc(p.label)}</b><span>${tc(st[i])} · ${c.dur.toFixed(2)}s</span><p>${esc(p.shot)}</p>${p.sound ? `<p>♪ ${esc(p.sound)}</p>` : ''}</div></div>`
    }).join('')}</div>`
  $('.ed-shot.cur')?.scrollIntoView({ block: 'nearest' })
}

function inspect() {
  const st = starts(), i = cur(), c = clips()[i], p = S.panels[c.panel]
  const keys = c.keys.map((k, ki) => `<div class="ed-keyrow${ki === S.keyIx ? ' sel' : ''}" data-k="${ki}"><b>◆</b><span>${tc(st[i] + k.t)}</span><span>${k.x}, ${k.y} · ${k.zoom}×</span>
      <select data-kf="ease" data-k="${ki}" title="Ease to the next keyframe">${Object.keys(EASES).map((e) => `<option${e === (k.ease ?? 'inOut') ? ' selected' : ''}>${e}</option>`).join('')}</select><button data-kdel="${ki}" title="Delete">✕</button></div>`).join('')
  const cam = p.cam ? `
      <div class="ed-cam"><label>X<input type="number" step="1" data-c="x"></label><label>Y<input type="number" step="1" data-c="y"></label><label>Zoom<input type="number" step="0.1" min="0.25" data-c="zoom"></label></div>
      <div class="ed-hint">At the playhead. Drag the picture to move, scroll to zoom, or drag the frame below: each sets a keyframe here.</div>
      <div class="ed-minimap" id="minimap"><img src="/scene/${p.cam.scene}.svg" alt=""><i class="ed-cam-rect"></i></div>
      <div class="ed-keys">${keys || '<div class="ed-hint">No keyframe yet.</div>'}</div>
      <button class="ed-wide" data-act="addKey">◆ Keyframe at the playhead</button>`
    : '<div class="ed-hint">A layout shot (crops, a terminal, type): no camera to move. Time it on the timeline.</div>'
  const caps = c.captions.map((q, ci) => q.clock ? '' : `<div class="ed-caprow"><textarea data-cap="${ci}" data-cf="text">${esc(q.text)}</textarea><button data-capdel="${ci}" title="Delete">✕</button>
      <div class="ed-capnums">y <input type="number" step="10" data-cap="${ci}" data-cf="y" value="${q.y}"> size <input type="number" step="2" data-cap="${ci}" data-cf="size" value="${q.size ?? (q.band ? 74 : 56)}"></div></div>`).join('')
  $('#inspector').innerHTML = `
    <div class="ed-sec"><h3>Clip ${i + 1}<span>${esc(p.label)}</span></h3>
      <div class="ed-row"><label>Starts at</label><span>${tc(st[i])}</span></div>
      <div class="ed-row"><label>Duration</label><input type="number" step="0.05" min="0.034" data-f="dur" value="${c.dur}"><span class="ed-unit">s</span></div>
      <div class="ed-row"><label>Drawing clock</label><input type="number" step="0.05" min="0" data-f="sceneStart" value="${c.sceneStart}"><span class="ed-unit">s at start</span></div>
      <div class="ed-row"><label>Its speed</label><input type="number" step="0.1" min="0" data-f="rate" value="${c.rate}"><span class="ed-unit">× (0 holds a still)</span></div>
    </div>
    <div class="ed-sec"><h3>Transitions</h3>
      <div class="ed-row"><label>In</label><select data-cut="in">${CUTS.map((k) => `<option${k === (c.fx?.in ?? 'none') ? ' selected' : ''}>${k}</option>`).join('')}</select></div>
      <div class="ed-row"><label>Out</label><select data-cut="out">${CUTS.map((k) => `<option${k === (c.fx?.out ?? 'none') ? ' selected' : ''}>${k}</option>`).join('')}</select></div>
      <div class="ed-row"><label>Length</label><input type="number" step="0.05" min="0.05" data-cut="dur" value="${c.fx?.dur ?? 0.2}"><span class="ed-unit">s each</span></div>
      <div class="ed-hint">Pixel cuts through the sky: blocks, iris, dither, blinds.</div></div>
    <div class="ed-sec"><h3>Camera</h3>${cam}</div>
    <div class="ed-sec"><h3>Text</h3>${caps || '<div class="ed-hint">No text on this clip.</div>'}<button class="ed-wide" data-act="addCap">+ Text</button>
      <div class="ed-hint">*word* is drawn in the neon's yellow; a new line breaks the caption.</div></div>
    <div class="ed-sec ed-notes"><h3>Storyboard</h3><p>${esc(p.t)} · ${esc(p.label)}</p><p>${esc(p.shot)}</p>${p.sound ? `<p>♪ ${esc(p.sound)}</p>` : ''}</div>`
  render()
}

function onInspectorInput(e) {
  const el = e.target
  const c = clips()[cur()]
  const v = el.type === 'number' ? Number(el.value) : el.value
  if (el.type === 'number' && !Number.isFinite(v)) return
  if (el.dataset.f) {
    checkpoint()
    if (el.dataset.f === 'dur') c.dur = round(Math.max(1 / FPS, v))
    else c[el.dataset.f] = round(Math.max(0, v))
    changed({ inspector: false })
  } else if (el.dataset.c) {
    const cam = camAt(c, localT())
    if (!cam) return
    checkpoint()
    cam[el.dataset.c] = el.dataset.c === 'zoom' ? Math.max(0.25, v) : v
    keyHere(cam)
    changed({ inspector: false })
  } else if (el.dataset.cf) {
    checkpoint()
    const q = c.captions[Number(el.dataset.cap)]
    q[el.dataset.cf] = el.dataset.cf === 'text' ? v : round(v, 1)
    changed({ inspector: false })
  } else if (el.dataset.cut) {
    checkpoint()
    c.fx = { in: 'none', out: 'none', dur: 0.2, ...c.fx }
    c.fx[el.dataset.cut] = el.dataset.cut === 'dur' ? round(Math.max(0.05, v)) : v
    changed({ inspector: el.tagName !== 'SELECT' ? false : true })
  } else if (el.dataset.kf) {
    checkpoint()
    c.keys[Number(el.dataset.k)].ease = v
    changed()
  }
}

function onInspectorClick(e) {
  const c = clips()[cur()]
  const st = starts()[cur()]
  const del = e.target.closest('[data-kdel]')
  if (del) {
    checkpoint()
    c.keys.splice(Number(del.dataset.kdel), 1)
    S.keyIx = null
    return changed()
  }
  const capDel = e.target.closest('[data-capdel]')
  if (capDel) {
    checkpoint()
    c.captions.splice(Number(capDel.dataset.capdel), 1)
    return changed()
  }
  const act = e.target.closest('[data-act]')?.dataset.act
  if (act === 'addKey') return addKey()
  if (act === 'addCap') {
    checkpoint()
    c.captions.push({ text: 'new *text*', y: 1300 })
    return changed()
  }
  const row = e.target.closest('.ed-keyrow')
  if (row && !e.target.closest('select')) {
    S.keyIx = Number(row.dataset.k)
    seek(st + c.keys[S.keyIx].t)
    timeline()
    inspect()
  }
}

/** The minimap: a press puts the camera's centre there, a drag moves it; each sets a keyframe at the playhead. */
function onMinimap(e) {
  const map = e.target.closest('#minimap')
  if (!map) return
  const c = clips()[cur()], p = S.panels[c.panel]
  const cam = camAt(c, localT())
  if (!cam) return
  e.preventDefault()
  checkpoint()
  const box = map.getBoundingClientRect()
  const m = box.width / p.cam.w
  const onRect = e.target.classList.contains('ed-cam-rect')
  const start = onRect ? { ...cam } : { ...cam, x: (e.clientX - box.left) / m, y: (e.clientY - box.top) / m }
  keyHere(start)
  changed()
  drag(e, (dx, dy) => {
    keyHere({ ...start, x: start.x + dx / m, y: start.y + dy / m })
    timeline()
    render()
  }, () => changed())
}

// ---------------------------------------------------------------- the camera, in the player

function onViewportDown(e) {
  const c = clips()[cur()]
  const cam = camAt(c, localT())
  if (!cam || !S.panels[c.panel].cam) return
  e.preventDefault()
  setPlaying(false)
  checkpoint()
  const vp = $('#viewport')
  vp.classList.add('dragging')
  let moved = false
  drag(e, (dx, dy) => {
    moved = true
    keyHere({ ...cam, x: cam.x - dx / S.scale / cam.zoom, y: cam.y - dy / S.scale / cam.zoom })
    timeline()
    inspect()
  }, () => {
    vp.classList.remove('dragging')
    if (moved) changed()
    else S.undo.pop()
  })
}

let wheelIdle = 0
function onWheel(e) {
  const c = clips()[cur()]
  const cam = camAt(c, localT())
  if (!cam || !S.panels[c.panel].cam) return
  e.preventDefault()
  if (!wheelIdle) checkpoint()
  clearTimeout(wheelIdle)
  wheelIdle = setTimeout(() => { wheelIdle = 0; changed() }, 350)
  const [FW, FH] = S.frame
  const box = $('#viewport').getBoundingClientRect()
  const fx = (e.clientX - box.left) / S.scale - FW / 2
  const fy = (e.clientY - box.top) / S.scale - FH / 2
  const z1 = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0018), 0.25, 24)
  // the art pixel under the pointer stays under it
  const px = cam.x + fx / cam.zoom, py = cam.y + fy / cam.zoom
  keyHere({ x: px - fx / z1, y: py - fy / z1, zoom: z1 })
  timeline()
  inspect()
}

// ---------------------------------------------------------------- wiring

function bind() {
  $('#board').addEventListener('change', (e) => load(e.target.value))
  $('#play').addEventListener('click', () => setPlaying(!S.playing))
  $('#toStart').addEventListener('click', () => seek(0))
  $('#toEnd').addEventListener('click', () => seek(total()))
  $('#prevKey').addEventListener('click', () => jumpKey(-1))
  $('#nextKey').addEventListener('click', () => jumpKey(1))
  $('#undo').addEventListener('click', undo)
  $('#redo').addEventListener('click', redo)
  $('#addKey').addEventListener('click', addKey)
  $('#split').addEventListener('click', split)
  $('#del').addEventListener('click', del)
  $('#safe').addEventListener('change', render)
  $('#export').addEventListener('click', exportVideo)
  $('#revert').addEventListener('click', async () => {
    if (!confirm('Back to the storyboard\'s own timing and moves? Your saved edit of this board is removed.')) return
    await fetch(`/api/board/${S.key}`, { method: 'DELETE' })
    await load(S.key)
    toast('reverted to the storyboard')
  })
  const zoomTo = (pps) => {
    const sc = $('#scroll')
    const tMid = timeAtX(sc.getBoundingClientRect().left + sc.clientWidth / 2)
    S.pps = clamp(pps, 20, 600)
    $('#zoom').value = S.pps
    timeline()
    sc.scrollLeft = X0 + tMid * S.pps - sc.clientWidth / 2
  }
  $('#zoom').addEventListener('input', (e) => zoomTo(Number(e.target.value)))
  $('#zoomIn').addEventListener('click', () => zoomTo(S.pps * 1.4))
  $('#zoomOut').addEventListener('click', () => zoomTo(S.pps / 1.4))
  $('#fitTl').addEventListener('click', () => { fitTimeline(); timeline(); $('#scroll').scrollLeft = 0 })
  $('#scroll').addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    zoomTo(S.pps * Math.exp(-e.deltaY * 0.004))
  }, { passive: false })
  $('#ruler').addEventListener('pointerdown', scrub)
  $('#playhead i').addEventListener('pointerdown', scrub)
  $('#capTrack').addEventListener('pointerdown', scrub)
  $('#mainTrack').addEventListener('pointerdown', onTrack)
  $('#shots').addEventListener('click', (e) => {
    const el = e.target.closest('.ed-shot')
    if (el) seek(starts()[Number(el.dataset.i)])
  })
  $('#inspector').addEventListener('input', onInspectorInput)
  $('#inspector').addEventListener('click', onInspectorClick)
  $('#inspector').addEventListener('pointerdown', onMinimap)
  $('#viewport').addEventListener('pointerdown', onViewportDown)
  $('#viewport').addEventListener('wheel', onWheel, { passive: false })
  $('#viewport').addEventListener('dblclick', addKey)
  addEventListener('resize', () => { fit(); render() })
  addEventListener('keydown', (e) => {
    const typing = e.target.closest('input, textarea, select')
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); return save() }
    if (typing) return
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo() }
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); return split() }
    const step = e.shiftKey ? 1 : 1 / FPS
    const keys = {
      ' ': () => setPlaying(!S.playing),
      ArrowLeft: () => seek(snap(S.t - step)),
      ArrowRight: () => seek(snap(S.t + step)),
      Home: () => seek(0),
      End: () => seek(total()),
      k: addKey, K: addKey,
      s: split, S: split,
      Delete: del, Backspace: del,
      '[': () => jumpKey(-1), ']': () => jumpKey(1),
      '+': () => $('#zoomIn').click(), '=': () => $('#zoomIn').click(), '-': () => $('#zoomOut').click(),
    }
    if (keys[e.key]) { e.preventDefault(); keys[e.key]() }
  })
}

boot()
