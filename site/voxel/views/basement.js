/**
 * B1, under the street of the live building: what they did, as the pixel office's Live tab draws its basement
 * (lib/svg-live.mjs basement, svg-work.mjs). One room per kind of work, the busiest first and widest, its share of the
 * page's tool calls in big type with its calls and its kind of work in plain words, a few of the cast at its
 * furniture; the departments past the fifth fold into one '+N more' room. Stone walls, a concrete ceiling under the
 * sidewalk; the commits line runs under its floor.
 */
import { DEPARTMENTS, DEPARTMENT_WORDS, pct } from '../../../plugin/lib/model.mjs'
import { fmtCount } from '../../../plugin/lib/format.mjs'
import { K, ROLE } from '../../../plugin/lib/svg-kit.mjs'
import { BASEMENT } from '../building.js'

const SHOWN = 5
const STONE = { face: '#4a463f', joint: '#37342f', hi: '#5a554c', slab: '#45413b', slabHi: '#5f5a51', slabD: '#2a2724' }
// each department's color, as its nameplate and its share wear it (svg-work's rooms)
export const DEPARTMENT_COLOR = { terminal: '#9ab86a', coding: '#6f91dc', reading: '#d4a94f', planning: '#eec96f', tools: '#a4977c', web: '#55c5b1', testing: '#7fd6e8', delegating: '#c58fd8', talking: '#e07a61', design: '#e08fc0' }
const NAME = Object.fromEntries(DEPARTMENTS)

/** The basement's rooms: the busiest departments with their share, widths to their share (at least `min`), the rest folded. */
export function basementRooms(work = [], { width = 16.4, min = 2.5, shown = SHOWN } = {}) {
  const rows = work.filter(r => (r.calls ?? 0) > 0).sort((a, b) => b.calls - a.calls)
  const total = rows.reduce((n, r) => n + r.calls, 0)
  if (!total) return { rooms: [], total: 0 }
  const head = rows.slice(0, shown), rest = rows.slice(shown)
  const rooms = head.map(r => ({ kind: r.kind, name: NAME[r.kind] ?? r.kind, words: DEPARTMENT_WORDS[r.kind] ?? r.label ?? r.kind, calls: r.calls, share: pct(r.calls, total), weight: r.calls }))
  if (rest.length) rooms.push({ kind: 'more', name: `+${rest.length} more`, words: rest.map(r => NAME[r.kind] ?? r.kind).slice(0, 3).join(' · '), calls: rest.reduce((n, r) => n + r.calls, 0), share: pct(rest.reduce((n, r) => n + r.calls, 0), total), weight: rest.reduce((n, r) => n + r.calls, 0) })
  // widths to the share, no room under `min`: the narrow ones take their minimum, the rest share what is left
  let fixed = new Set()
  for (let pass = 0; pass < rooms.length; pass++) {
    const free = width - fixed.size * min
    const weight = rooms.filter((_, i) => !fixed.has(i)).reduce((n, r) => n + r.weight, 0) || 1
    let changed = false
    rooms.forEach((r, i) => { if (!fixed.has(i) && (r.weight / weight) * free < min) { fixed.add(i); changed = true } })
    if (!changed) break
  }
  const free = width - fixed.size * min
  const weight = rooms.filter((_, i) => !fixed.has(i)).reduce((n, r) => n + r.weight, 0) || 1
  let x = -width / 2
  for (const [i, r] of rooms.entries()) { r.w = fixed.has(i) ? min : (r.weight / weight) * free; r.x0 = x; r.x1 = x + r.w; x = r.x1 }
  return { rooms, total }
}

export function buildBasement(ctx, snapshot, parent, { quiet = false } = {}) {
  const { THREE, kit, labels, actors } = ctx
  const { box } = kit
  const y0 = BASEMENT.floor, y1 = BASEMENT.top, h = y1 - y0
  // the cavity runs out under the sidewalk to the curb; the rooms' words stand on the building's front line
  const front = 5.45, back = -3.25, face = 3.45
  const group = new THREE.Group(); parent.add(group)
  const figures = [], screens = [], pickables = []
  const tag = (spec, x, y, z) => { const l = labels.label(spec); l.position.set(x, y, z); group.add(l); return l }
  const crew = (snapshot.crew ?? []).filter(c => (c.minutes ?? 0) > 0)
  const pick = i => crew.length ? crew[i % crew.length].agent : 'claude'
  // the shell: the floor slab, the concrete ceiling under the sidewalk, dressed stone walls with their joints
  box(group, 0, y0 - .06, 1.1, 16.6, .12, 8.9, STONE.slab)
  box(group, 0, y0 + .005, front - .05, 16.6, .03, .1, STONE.slabHi)
  box(group, 0, y1 - .07, 1.1, 16.6, .14, 8.9, '#3a3631')
  box(group, 0, (y0 + y1) / 2, back - .05, 16.6, h, .12, STONE.face)
  for (const xx of [-8.27, 8.27]) box(group, xx, (y0 + y1) / 2, 1.1, .1, h, 8.9, STONE.face)
  for (let r = 1; r < 6; r++) {
    box(group, 0, y0 + r * h / 6, back + .02, 16.5, .03, .02, STONE.joint)
    for (const xx of [-8.21, 8.21]) box(group, xx, y0 + r * h / 6, 1.1, .02, .03, 8.8, STONE.joint)
    for (let c = 0; c < 14; c++) box(group, -8 + c * 1.24 + (r % 2) * .62, y0 + (r - .5) * h / 6, back + .02, .03, h / 6, .02, STONE.joint)
  }
  // fluorescent tubes along the ceiling
  for (let x = -6; x <= 6; x += 4) { box(group, x, y1 - .2, 0, 2.2, .05, .16, '#f4f0dc', { glow: 1.1, castShadow: false }); box(group, x, y1 - .16, 0, 2.3, .04, .22, '#5a5650') }
  const { rooms, total } = basementRooms(snapshot.work ?? [])
  // the floor's own plate and its title, on the stone at the left
  tag({ lines: [{ spans: [['B1', ROLE.dim, { pixel: true }]], size: .34, align: 'center' }], width: .62, pad: .05, bg: K.plate }, -7.86, y0 + 1.95, face + .05)
  if (!rooms.length) {
    tag({ lines: [{ spans: [['WHAT THEY DID', ROLE.accent, { pixel: true }]], size: .3 }, { spans: [['no tool calls on this page yet', ROLE.dim]], size: .16 }], pad: .1, bg: '#120e0b', alpha: .94 }, 0, (y0 + y1) / 2, face)
    return { group, update() {}, pickables }
  }
  const title = tag({ lines: [{ spans: [['WHAT THEY DID', '#16110d', { pixel: true }]], size: .26 }], pad: .06, bg: ROLE.accent, radius: .02, anchor: 'left' }, -7.5, y1 - .78, face)
  tag({ lines: [{ spans: [[`share of ${fmtCount(total)} tool calls ${snapshot.period?.past ? 'that week' : 'this week'}`, ROLE.dim]], size: .15 }], pad: .05, bg: '#120e0b', alpha: .9, radius: .02, anchor: 'left' }, -7.5 + title.userData.size[0] + .12, y1 - .78, face)
  rooms.forEach((r, i) => {
    const cx = (r.x0 + r.x1) / 2, w = r.w, color = DEPARTMENT_COLOR[r.kind] ?? ROLE.dim
    if (i) { box(group, r.x0, (y0 + y1) / 2, -.6, .1, h, 5.2, '#3d3a34'); box(group, r.x0, (y0 + y1) / 2, 1.95, .16, h, .14, STONE.hi) }
    // the floor of the room: a concrete strip in the department's tint at the front
    box(group, cx, y0 + .02, face - .2, w - .12, .03, .5, color, { glow: .15, castShadow: false })
    furnish(r, cx, w, i)
    // its caption on the front line: its name, then its share big, its calls and its kind of work
    tag({ lines: [{ spans: [[r.name.toUpperCase(), '#16110d', { pixel: true }]], size: .24 }], width: Math.min(w - .28, labels.measure(r.name.toUpperCase(), .24, { pixel: true }) + .14), pad: .05, bg: color, radius: .02, anchor: 'left' }, r.x0 + .14, y0 + 1.32, face)
    tag({ lines: [
      { spans: [[r.share, color, { pixel: true }]], size: .44, gap: .06 },
      ...(quiet ? [] : [{ spans: [[`${fmtCount(r.calls)} calls`, '#d8c9ac', { bold: true }], [r.words, ROLE.dim, { sep: ' · ' }]], size: .14 }]),
    ], width: Math.max(1.2, w - .28), pad: .07, bg: '#120e0b', alpha: .92, radius: .03, anchor: 'left' }, r.x0 + .14, y0 + .62, face)
    const hit = new THREE.Mesh(ctx.colliderGeometry, ctx.colliderMaterial); hit.position.set(cx, (y0 + y1) / 2, 1); hit.scale.set(w, h, 4); hit.userData.text = `${r.name} · ${r.words} · ${r.share} · ${fmtCount(r.calls)} calls`; group.add(hit); pickables.push(hit)
  })

  // ---------------------------------------------------------------- each department's furniture and its people
  function seat(x, y, z, k, pose, p = .062) {
    const actor = actors.figure(pick(k), { legs: false, p })
    actor.root.position.set(x, y, z); group.add(actor.root)
    figures.push({ actor, pose })
  }
  function desk(x, z, k, screenName, pose = 'type') {
    box(group, x, y0 + .5, z, 1.2, .07, .6, '#c9a26b'); box(group, x, y0 + .25, z + .27, 1.16, .44, .04, '#8f6d43')
    box(group, x - .32, y0 + .78, z - .12, .44, .32, .06, '#262a30')
    screens.push({ mesh: actors.screen(group, screenName, x - .32, y0 + .78, z - .085, .38, .25), phase: k })
    seat(x + .25, y0 + .48, z - .3, k, pose)
  }
  function furnish(r, cx, w, i) {
    const z = -1.6
    const k = i * 2
    if (r.kind === 'terminal') {
      // a wall of racks, LEDs blinking, a console with its terminal; one rack stands open, its cables hanging
      const n = Math.max(2, Math.floor((w - .8) / .62))
      for (let j = 0; j < n; j++) {
        const x = r.x0 + .5 + j * .62
        box(group, x, y0 + 1.1, -2.7, .54, 2.2, .7, '#23262b')
        for (let l = 0; l < 7; l++) box(group, x - .15 + (l % 3) * .1, y0 + .45 + l * .26, -2.34, .05, .05, .02, ['#9ab86a', '#eec96f', '#7fd6e8'][(j + l) % 3], { glow: 1.2, castShadow: false })
        if (j === 1) for (let c = 0; c < 4; c++) box(group, x - .18 + c * .12, y0 + .9, -2.3, .03, .9 - c * .1, .03, ['#c0392b', '#3557a8', '#eec96f', '#9ab86a'][c])
      }
      desk(cx, .2, k, 'terminal')
    } else if (r.kind === 'coding') {
      const n = Math.max(1, Math.min(3, Math.floor(w / 1.5)))
      for (let j = 0; j < n; j++) desk(r.x0 + (j + .5) * w / n, .1 + (j % 2) * .4, k + j, 'coding')
      // the scoreboard of the lines the commits added and removed
      tag({ lines: [{ spans: [[`+${fmtCount(snapshot.totals?.additions ?? 0)}`, '#9ab86a', { pixel: true }], [`−${fmtCount(snapshot.totals?.deletions ?? 0)}`, '#e07a61', { pixel: true, sep: '  ' }]], size: .3 }], pad: .07, bg: '#0b0d10', radius: .02 }, cx, y1 - 1.05, back + .1)
    } else if (r.kind === 'reading') {
      // bookcases, a rolling ladder, a reader under a green banker's lamp
      const n = Math.max(1, Math.floor((w - .4) / 1.1))
      for (let j = 0; j < n; j++) {
        const x = r.x0 + .65 + j * 1.1
        box(group, x, y0 + 1.15, -2.75, 1.0, 2.3, .5, '#59452f')
        for (let s = 0; s < 4; s++) { box(group, x, y0 + .35 + s * .55, -2.5, 1.02, .05, .52, K.woodD); for (let b = 0; b < 7; b++) box(group, x - .4 + b * .13, y0 + .55 + s * .55, -2.58, .1, .34 - (b % 3) * .05, .3, ['#ab7852', '#6d947e', '#b8a16d', '#7a6c89', '#c0392b'][(b + s + j) % 5]) }
      }
      box(group, r.x0 + .6, y0 + 1.2, -2.3, .05, 2.3, .05, '#8b6a45', { rotate: .15 })
      desk(cx, .2, k, 'reading', 'read')
      box(group, cx + .45, y0 + .8, .05, .22, .08, .16, '#52724a'); box(group, cx + .45, y0 + .75, .05, .18, .02, .12, '#ffe0a0', { glow: .8 })
    } else if (r.kind === 'testing') {
      for (let j = 0; j < Math.max(1, Math.floor((w - .3) / 1.3)); j++) {
        const x = r.x0 + .8 + j * 1.3
        box(group, x, y0 + 2.0, back + .1, 1.1, .6, .05, '#0f1716')
        for (let t = 0; t < 4; t++) box(group, x - .38 + t * .25, y0 + 2.0, back + .14, .14, .14, .02, t === 3 && j % 2 ? '#c0392b' : '#9ab86a', { glow: .7, castShadow: false })
      }
      box(group, cx, y0 + .45, -.6, 1.4, .07, .6, '#c9c2b2'); box(group, cx - .3, y0 + .62, -.6, .14, .26, .14, '#b5d67f', { glow: .5 }); box(group, cx + .1, y0 + .6, -.6, .12, .2, .12, '#c58fd8', { glow: .5 })
      seat(cx + .55, y0 + .42, -.95, k, 'look')
    } else if (r.kind === 'web') {
      kit.sprite(group, ['..bbb..', '.bgbbg.', 'bgggbbb', 'bbgbggb', 'bbbgggb', '.bbgbb.', '..bbb..'], { b: '#3557a8', g: '#9ab86a' }, cx - .7, y0 + 1.75, -2.6, .1, .1)
      desk(cx + .3, .15, k, 'web', 'read')
    } else if (r.kind === 'planning') {
      box(group, cx, y0 + 1.7, back + .1, Math.min(w - .4, 2.2), 1.0, .06, '#e9e6dc')
      for (let s = 0; s < 8; s++) box(group, cx - Math.min(w - .4, 2.2) / 2 + .25 + (s % 4) * Math.min(w - .4, 2.2) / 4.4, y0 + 1.95 - Math.floor(s / 4) * .4, back + .14, .26, .22, .02, ['#f6d860', '#e08fc0', '#7fd6e8', '#b5d67f'][s % 4])
      seat(cx - .4, y0 + .1, -.8, k, 'point', .066); seat(cx + .5, y0 + .1, -.6, k + 1, 'look', .066)
    } else if (r.kind === 'talking') {
      // the red phone booth
      box(group, cx, y0 + 1.15, -1.6, 1.0, 2.3, .9, '#a8302b'); box(group, cx, y0 + 2.36, -1.6, 1.06, .12, .96, '#c0392b')
      box(group, cx, y0 + 1.2, -1.14, .7, 1.6, .02, '#e9d9b0', { glow: .35 })
      seat(cx, y0 + .5, -1.3, k, 'hand', .058)
    } else if (r.kind === 'design') {
      box(group, cx - .3, y0 + .9, -1.2, .06, 1.6, .06, '#8b6a45', { rotate: .1 }); box(group, cx - .3, y0 + 1.2, -1.15, .8, .6, .04, '#f4efe4')
      box(group, cx - .45, y0 + 1.25, -1.12, .3, .2, .01, '#e07a61'); box(group, cx - .15, y0 + 1.1, -1.12, .2, .25, .01, '#6f91dc')
      for (let j = 0; j < 3; j++) box(group, r.x0 + .6 + j * .7, y0 + 2.05, back + .1, .5, .4, .04, ['#e08fc0', '#eec96f', '#55c5b1'][j])
      seat(cx + .5, y0 + .1, -.9, k, 'look', .066)
    } else if (r.kind === 'delegating') {
      box(group, cx, y0 + 2.1, back + .1, .5, .3, .04, '#eec96f')
      for (const dx of [-.7, 0, .7]) { box(group, cx + dx, y0 + 1.55, back + .1, .45, .28, .04, '#6f91dc'); box(group, cx + dx, y0 + 1.82, back + .12, .03, .25, .02, '#d8c9ac') }
      box(group, cx, y0 + 1.82, back + .12, 1.4, .03, .02, '#d8c9ac')
      desk(cx, .2, k, 'delegating', 'point')
    } else if (r.kind === 'tools') {
      box(group, cx, y0 + 1.6, back + .1, Math.min(w - .4, 2.0), 1.1, .05, '#7b5a3a')
      for (let t = 0; t < 6; t++) box(group, cx - .8 + t * .32, y0 + 1.6 + (t % 2) * .2, back + .14, .06, .5 - (t % 3) * .1, .04, ['#a4977c', '#c0392b', '#5d6168'][t % 3])
      desk(cx, .2, k, 'tools', 'look')
    } else {
      // the folded departments: their crates in storage
      for (const [dx, dy] of [[0, 0], [.45, 0], [.22, .38]]) box(group, cx - .2 + dx, y0 + .2 + dy, -1.4, .4, .36, .4, '#8b6a45')
    }
  }
  kit.flush()
  return {
    group, pickables,
    update(t) {
      for (const f of figures) actors.animate(f.actor, f.pose, t)
      for (const s of screens) actors.tickScreen(s.mesh, t, s.phase)
    },
  }
}
