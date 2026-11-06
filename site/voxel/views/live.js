/**
 * Live: the building as the pixel office's Live tab draws it (lib/svg-live.mjs), in voxels. One room per project, as
 * wide as its desks, on floors stacked over the street lobby; a carpet in the project's color, its nameplate and
 * headcount strip on the back wall. Each desk: its character in the pose of its state at a monitor showing what it is
 * at, its interns on a bench in front, a big ? over a raised hand, zZ over a dozer, and its tag on the floor's label
 * band (its title, what it is at and for how long; framed in its color when it waits on you). The café holds whoever is
 * on a break, mug in hand; the meeting room the running workflows around their whiteboard; the coat rack whoever just
 * left. The sign says who is in, the fascia under the cornice how the floors stand.
 */
import { CAST } from '../../../plugin/lib/cast.mjs'
import { CLASS_COLOR, K, ROLE } from '../../../plugin/lib/svg-kit.mjs'
import { NEEDY, YOURS, tagTime } from '../../../plugin/lib/voxel-model.mjs'
import { planLive, stripOf, tallyDesks } from '../office-layout.js'
import { DESK_POSE, screenOf } from '../actors.js'
import { FRONT, INNER, LOBBY_TOP } from '../building.js'
import { buildBasement } from './basement.js'

export const LIVE_STOREY = 4.1
export const LIVE_BAND = .62
const WALL = '#17251a', WAINSCOT = '#121f14', RAIL = '#2a422f', SKIRT = '#243928'
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`
const darker = (hex, t = .55) => { const n = parseInt(hex.slice(1), 16); const c = [n >> 16, n >> 8 & 255, n & 255].map(v => Math.round(v * t)); return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}` }
const hash = s => { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h }

/** The sign's two lines for the live building (svg-live glance): who is in, then the fun of it. */
export function liveSignLines(snapshot, nowMs) {
  const agents = snapshot.agents ?? []
  if (!agents.length) {
    const night = snapshot.now?.night
    return [[['0 desks', ROLE.title], [night ? 'everyone clocked out' : 'nobody in yet', ROLE.dim]], [[night ? 'the office cat is in charge' : 'the desks are tidy', ROLE.accent]]]
  }
  const t = tallyDesks(agents)
  const cast = Object.keys(CAST).filter(id => agents.some(a => a.agent === id))
  const first = [[plural(agents.length, 'desk'), ROLE.title], ...(cast.length > 1 || cast[0] !== 'claude' ? cast.map(id => [`${agents.filter(a => a.agent === id).length} ${CAST[id].who}`, CAST[id].hex.dark]) : [])]
  const shifts = agents.filter(a => a.kind !== 'break').map(a => Date.parse(a.startedAt ?? '')).filter(Number.isFinite)
  const second = [
    t.interns && [plural(t.interns, 'intern'), ROLE.intern],
    shifts.length && [`longest shift ${tagTime({ from: new Date(Math.min(...shifts)).toISOString(), fine: false }, nowMs)}`, ROLE.accent],
    t.meetings && [plural(t.meetings, 'meeting'), ROLE.meeting],
  ].filter(Boolean)
  return second.length ? [first, second] : [first]
}

/** The fascia's counts (svg-live statusBar): working, need you, with helpers or in a meeting, on break. */
export function liveStatus(agents) {
  const t = tallyDesks(agents)
  return [
    t.working && [`${t.working}`, 'working', ROLE.busy],
    t.needYou && [`${t.needYou}`, 'need you', ROLE.accent],
    t.waiting && [`${t.waiting}`, t.inMeeting === t.waiting ? 'in a meeting' : 'with helpers', ROLE.wait],
    t.onBreak && [`${t.onBreak}`, 'on break', ROLE.idle],
  ].filter(Boolean)
}

export function buildLive(ctx, snapshot, { previous = [], quiet = false } = {}) {
  const { THREE, kit, labels, actors } = ctx
  const { box, plant, flush } = kit
  const nowMs = ctx.nowMs ?? Date.now()
  const plan = planLive(snapshot, { previous })
  const group = new THREE.Group(), lobbyPeople = new THREE.Group()
  const figures = [], bubbles = [], snores = [], screens = [], pickables = [], anchors = new Map(), rooms = [], facades = []
  const storeys = []
  const tag = (spec, x, y, z, parent) => { const l = labels.label(spec); l.position.set(x, y, z); parent.add(l); return l }

  // ---------------------------------------------------------------- what hangs on the back walls
  function frame(level, x, y, z, w, h, color = '#5c4a33') { box(level, x, y, z, w + .08, h + .08, .05, color) }
  function calendar(level, x, y, z) {
    frame(level, x, y, z, .5, .6, '#3d3226')
    box(level, x, y, z + .03, .5, .6, .02, '#efe8d6')
    box(level, x, y + .24, z + .045, .5, .12, .01, '#c0392b')
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) box(level, x - .18 + c * .12, y + .1 - r * .1, z + .045, .08, .06, .01, r === 1 && c === 2 ? '#c0392b' : '#b9ae96')
  }
  function kanban(level, x, y, z) {
    frame(level, x, y, z, 1.0, .64)
    box(level, x, y, z + .03, 1.0, .64, .02, '#f1ede2')
    for (let c = 0; c < 3; c++) {
      box(level, x - .33 + c * .33, y + .26, z + .045, .28, .05, .01, ['#9ab86a', '#eec96f', '#6f91dc'][c])
      for (let r = 0; r < 3 - c; r++) box(level, x - .33 + c * .33, y + .13 - r * .14, z + .045, .2, .1, .01, ['#f6d860', '#e08fc0', '#7fd6e8'][(r + c) % 3])
    }
  }
  function cork(level, x, y, z) {
    frame(level, x, y, z, .8, .56, '#7a5a3a')
    box(level, x, y, z + .03, .8, .56, .02, '#b8875a')
    ;[[-.24, .1, '#f6d860'], [.02, .14, '#9fd0e8'], [.24, .06, '#f0f0e8'], [-.12, -.14, '#e08fc0'], [.18, -.12, '#b5d67f']].forEach(([dx, dy, c]) => { box(level, x + dx, y + dy, z + .045, .2, .16, .01, c); box(level, x + dx, y + dy + .06, z + .055, .03, .03, .01, '#c0392b') })
  }
  function landscape(level, x, y, z) {
    frame(level, x, y, z, .9, .58, '#8a6a3a')
    box(level, x, y + .1, z + .03, .9, .38, .02, '#9cc3dc')
    box(level, x - .2, y - .08, z + .04, .5, .22, .02, '#6f9149')
    box(level, x + .22, y - .1, z + .04, .46, .18, .02, '#4f7f34')
    box(level, x + .26, y + .16, z + .04, .1, .1, .02, '#f6d860')
  }

  // the biggest rooms on the top floor, as the pixel office lays its bands from the roof down
  const n = plan.floors.length, slot = (2 * INNER) / (plan.slots || 6)
  plan.floors.forEach((floor, row) => {
    const index = n - 1 - row
    const base = LOBBY_TOP + index * LIVE_STOREY
    const level = new THREE.Group(); level.userData.y = base; group.add(level)
    const fy = base + LIVE_BAND
    storeys[index] = { base, height: LIVE_STOREY, number: index + 2, group: level, floor: index }
    // the slab, its label band facing the street and the wood floor
    box(level, 0, fy - .17, 0, 16.7, .34, 6.40, K.slab)
    box(level, 0, base + LIVE_BAND / 2 - .02, FRONT + .06, 16.9, LIVE_BAND - .04, .32, '#1f1a16')
    box(level, 0, fy - .015, FRONT + .2, 16.9, .05, .06, K.wood)
    box(level, 0, base + .02, FRONT + .2, 16.9, .05, .06, K.woodD)
    box(level, 0, fy, 0, 16.1, .040, 6.10, K.woodD, { castShadow: false })
    for (let row = 0; row < 12; row++) for (let col = 0; col < 17; col++) box(level, -7.52 + col * .94, fy + .05, -2.75 + row * .50, .94, .040, .50, ['#4b3534', '#6e4d3f', '#593e35'][((row * 3 + col) % 3)], { castShadow: false })
    // the back wall: wainscot, rail, the city's windows between the rooms' hangings
    const top = base + LIVE_STOREY
    box(level, 0, (fy + top) / 2, -3.12, 16.5, top - fy, .20, WALL)
    box(level, 0, fy + .47, -2.99, 16.3, .94, .07, WAINSCOT)
    box(level, 0, fy + .98, -2.94, 16.4, .09, .11, RAIL)
    box(level, 0, fy + .08, -2.91, 16.4, .13, .15, SKIRT)
    for (let x = -7.8; x < 8; x += .56) box(level, x, fy + .48, -2.93, .025, .78, .04, SKIRT)
    // three windows on the city, the walls between them hung as the pixel rooms' are (calendar, poster, cork, kanban)
    for (const x of [-5.35, 0, 5.35]) {
      box(level, x, fy + 1.95, -2.96, 1.62, 1.36, .12, '#76644b')
      box(level, x, fy + 1.95, -2.87, 1.42, 1.16, .06, ctx.windowMaterial)
      box(level, x, fy + 1.95, -2.82, .06, 1.2, .07, '#6f624e')
      box(level, x, fy + 2.05, -2.82, 1.46, .06, .07, '#6f624e')
      box(level, x, fy + 1.22, -2.84, 1.8, .1, .25, '#917956')
      for (let j = 0; j < 3; j++) box(level, x - .4 + j * .4, fy + 1.66 + (j % 2) * .34, -2.78, .11, .13, .01, '#ad9558', { glow: .25 })
    }
    // the walls between the windows hung as the pixel rooms' are: a calendar, a kanban board, a cork board, a landscape
    const hangings = [calendar, kanban, cork, landscape]
    ;[-7.25, -2.7, 2.7, 7.25].forEach((x, k) => hangings[(index + k) % hangings.length](level, x, fy + 2.0, -2.97))
    // the inner faces of the side walls
    for (const xx of [-8.05, 8.05]) { box(level, xx, (fy + top) / 2, 0, .05, top - fy, 6.30, WALL); box(level, xx + (xx > 0 ? -.03 : .03), fy + .48, 0, .05, .92, 6.25, WAINSCOT) }
    // the ceiling's lamps and their light, two a floor
    for (const x of [-4.0, 4.0]) {
      box(level, x, top - .3, -.60, .045, .33, .045, kit.darkSteel)
      box(level, x, top - .48, -.60, .70, .16, .43, '#807153')
      box(level, x, top - .58, -.60, .58, .035, .35, ctx.building.bulbMaterial)
      const light = new THREE.PointLight('#ffd28c', 20, 8, 2); light.position.set(x, top - .7, -.20); light.userData.nightIntensity = 20; level.add(light); ctx.lights.push(light)
    }
    plant(level, -7.63, fy, -2.3, .62); plant(level, 7.45, fy, -2.3, .58)
    // the literal street facade, hidden until asked for (the Façade key): piers at the bays, stone sills and lintels
    const facade = new THREE.Group(); facade.visible = false; level.add(facade); facades.push(facade)
    const bays = plan.slots || 6, bay = (2 * INNER) / bays
    for (let j = 0; j <= bays; j++) { const x = -INNER + j * bay; box(facade, x, (fy + top) / 2, FRONT - .13, .4, top - fy, .32, K.brick); box(facade, x, (fy + top) / 2, FRONT + .09, .16, top - fy, .1, kit.stone) }
    for (let j = 0; j < bays; j++) {
      const x = -INNER + (j + .5) * bay, w = bay - .36
      box(facade, x, top - .2, FRONT - .1, w, .4, .33, K.brick)
      box(facade, x, fy + .32, FRONT - .1, w, .64, .33, K.brick)
      box(facade, x, fy + .66, FRONT + .08, w + .04, .12, .5, kit.stoneHi)
      box(facade, x, top - .44, FRONT + .05, w, .12, .38, kit.stone)
      box(facade, x, (fy + .72 + top - .5) / 2, FRONT + .04, .055, top - fy - 1.22, .07, '#a79674')
    }

    for (const room of floor.rooms) {
      const x0 = -INNER + room.from * slot, x1 = -INNER + room.to * slot, cx = (x0 + x1) / 2, w = x1 - x0
      rooms.push({ project: room.project, floor: index, x0, x1, base, top, kind: room.kind })
      // a partition at the room's left edge (not the building's)
      if (room.from > 0) { box(level, x0, (fy + top) / 2, -1.95, .12, top - fy, 2.35, K.part); box(level, x0, (fy + top) / 2, -.72, .18, top - fy, .19, K.partHi) }
      // the room's carpet, woven in its project's color, a cream tassel at either end
      const dark = room.kind === 'dark'
      const carpet = dark ? darker(room.color, .32) : darker(room.color, .62)
      box(level, cx, fy + .085, -.2, w - .5, .03, 4.6, carpet, { castShadow: false })
      for (let i = 0; i < 9; i++) box(level, cx, fy + .102, -2.2 + i * .5, w - .62, .008, .05, darker(room.color, dark ? .4 : .8), { castShadow: false })
      for (const z of [-2.55, 2.15]) for (let x = x0 + .4; x < x1 - .3; x += .22) box(level, x, fy + .09, z, .07, .02, .12, dark ? '#6f6a5c' : '#e9dfc5', { castShadow: false })
      // its nameplate hangs from the ceiling at the room's front, the headcount strip on its board
      const name = room.part ? `${room.project} (cont.)` : room.project
      const strip = stripOf(room.desks).slice(0, 10)
      const stripW = strip.length ? strip.length * .15 + .16 : 0
      const plateW = Math.min(w - .4 - stripW, labels.measure(name, .34, { pixel: true }) + .34)
      const signX = x0 + .3, signY = top - .62, signZ = 2.55
      for (const dx of [.25, plateW + stripW - .25]) box(level, signX + dx, top - .22, signZ, .025, .5, .025, '#3a342b', { castShadow: false })
      box(level, signX + (plateW + stripW) / 2, signY, signZ - .04, plateW + stripW + .08, .5, .05, '#120e0b')
      const plate = tag({ lines: [{ spans: [[name, '#16110d', { pixel: true }]], size: .34 }], width: plateW, height: .42, valign: 'middle', pad: .07, bg: dark ? darker(room.color, .6) : room.color, radius: .025, anchor: 'left' }, signX + .02, signY, signZ, level)
      plate.userData.project = room.project
      strip.forEach((a, i) => box(level, signX + plateW + .14 + i * .15, signY, signZ + .01, .1, .3, .03, CLASS_COLOR[a.kind] ?? ROLE.dim, { glow: .45, castShadow: false }))
      rooms.at(-1).sign = { x: signX, y: signY, z: signZ, w: plateW + stripW }
      if (dark) {
        // lights off: a dark room, its desks empty, what it did today on its tag
        for (let i = 0; i < Math.min(3, room.span); i++) emptyDesk(level, x0 + (i + .5) * (w / Math.min(3, room.span)), fy, room)
        tag({ lines: [{ spans: [[room.project, ROLE.dim]], size: .15 }, { spans: [['lights off', ROLE.dim], ...(room.minutes ? [[`${Math.round(room.minutes / 6) / 10}h today`, ROLE.accent]] : [])], size: .14 }], width: Math.min(w - .25, 3.2), pad: .07, bg: '#120e0b', alpha: .94 }, cx, base + LIVE_BAND / 2 - .02, FRONT + .23, level)
        continue
      }
      const pitch = w / room.desks.length
      room.desks.forEach((agent, i) => desk(level, agent, x0 + (i + .5) * pitch, fy, base, Math.min(pitch, slot * 1.15), room, index))
    }
  })

  function emptyDesk(level, x, fy, room) {
    box(level, x, fy + .74, .55, 2.0, .08, .78, '#5c4a35')
    box(level, x, fy + .42, .92, 2.0, .58, .05, '#4a3b2b')
    box(level, x - .55, fy + 1.12, .32, .78, .5, .07, '#1d2026')
    box(level, x - .55, fy + 1.12, .36, .68, .4, .01, '#0b0d10')
  }

  function desk(level, agent, x, fy, base, pitch, room, floorIndex) {
    const width = Math.min(2.3, pitch - .36)
    const accent = room.color
    const h = hash(agent.id)
    const left = x - width / 2, right = x + width / 2
    // the desk: its top, a modesty panel to the street, a drawer pedestal under the monitor, legs at the other end
    box(level, x, fy + .76, .55, width, .08, .8, '#dcab72')
    box(level, x, fy + .70, .55, width - .06, .05, .74, K.woodD)
    box(level, x, fy + .38, .93, width - .04, .5, .05, '#8b6a45')
    box(level, x, fy + .62, .955, width - .04, .04, .02, '#c49a62')
    box(level, left + .32, fy + .36, .55, .5, .62, .66, '#6d5639')
    for (const yy of [.2, .43]) { box(level, left + .32, fy + yy, .89, .42, .17, .02, '#8b7049'); box(level, left + .32, fy + yy, .905, .1, .025, .02, '#cfb478') }
    for (const dz of [.22, .88]) box(level, right - .08, fy + .36, dz, .06, .7, .06, '#5c4a33')
    // the monitor on the left, facing the street, showing what the desk is at
    const mw = Math.min(.74, width * .33), mx = left + mw / 2 + .12
    box(level, mx, fy + .87, .36, .09, .17, .08, '#4e5453')
    box(level, mx, fy + .81, .36, .32, .03, .18, '#5b5d58')
    box(level, mx, fy + 1.16, .34, mw + .1, mw * .68 + .1, .1, '#262a30')
    const screen = actors.screen(level, screenOf(agent.kind, agent.activityKind), mx, fy + 1.16, .396, mw, mw * .66)
    screens.push({ mesh: screen, phase: (h % 97) / 13 })
    if (agent.id === plan.trophy) { box(level, mx + mw / 2 - .05, fy + 1.58, .34, .1, .14, .08, '#eec96f', { glow: .4 }); box(level, mx + mw / 2 - .05, fy + 1.5, .34, .16, .04, .1, '#b8892a') }
    // the keyboard under its hands, a mug in the project's color and a lamp or a plant on the left corner
    const cx = right - width * .32
    box(level, cx - .1, fy + .815, .82, .62, .03, .18, '#b0aaa0')
    box(level, left + .1, fy + .87, .82, .13, .17, .13, accent)
    box(level, left + .1, fy + .96, .82, .1, .01, .1, '#3b2a20')
    if (h % 3 === 1) plant(level, mx, fy + .8, .78, .26)
    // the chair behind, then its character, sitting at the desk, facing the street, its shoulders over the desk
    box(level, cx, fy + .5, -.42, .58, .1, .5, K.chairHi)
    box(level, cx, fy + .98, -.66, .62, .8, .1, K.chair)
    box(level, cx, fy + .25, -.42, .08, .44, .08, '#393739')
    const p = Math.min(.1, width * .044)
    const actor = actors.figure(agent.agent, { legs: false, id: agent.id, p })
    actor.root.position.set(cx, fy + .73, .02)
    level.add(actor.root)
    const pose = agent.kind === 'working' ? (agent.activityKind === 'delegating' ? 'point' : actors.readingPose(agent.activityKind) ? 'read' : 'type') : DESK_POSE[agent.kind] ?? 'look'
    figures.push({ actor, pose })
    if (agent.kind === 'asking') bubbles.push({ group: actors.bubble(level, cx + .55, fy + 1.98, .1, .062), y: fy + 1.98 })
    if (agent.kind === 'dozing') snores.push({ group: actors.snore(level, cx + .5, fy + 1.55, .1), y: fy + 1.55, phase: (h % 89) / 11 })
    // the interns on a bench in front of the desk, the boss's own kind in miniature
    const interns = agent.interns ?? []
    if (interns.length) {
      box(level, x, fy + .2, 1.42, Math.min(width, .5 + interns.length * .62), .08, .3, '#7b5a3a')
      for (const dx of [-1, 1]) box(level, x + dx * (Math.min(width, .5 + interns.length * .62) / 2 - .08), fy + .1, 1.42, .06, .2, .24, '#4f3c29')
      interns.slice(0, 3).forEach((_, i) => {
        const mini = actors.mini(agent.agent)
        mini.position.set(x - (Math.min(3, interns.length) - 1) * .31 + i * .62, fy + .24, 1.42)
        level.add(mini)
        figures.push({ mini, phase: i * 1.7 + (h % 7) })
      })
    }
    // the collider a click finds the desk by
    const collider = new THREE.Mesh(ctx.colliderGeometry, ctx.colliderMaterial)
    collider.position.set(x, fy + .9, .4); collider.scale.set(Math.min(pitch - .1, 2.4), 1.6, 1.6)
    collider.userData.id = agent.id
    level.add(collider); pickables.push(collider)
    anchors.set(agent.id, { x, y: fy + 1, z: .4, floor: floorIndex, level })
    // its tag on the label band: whose session it is, then what it is at and for how long, framed when it waits on you
    if (quiet && !NEEDY.has(agent.kind)) return
    const time = tagTime(agent.clock, nowMs)
    const words = time ? `${agent.words} · ${time}` : agent.words
    const mark = YOURS.has(agent.kind) ? CLASS_COLOR[agent.kind] : null
    const title = agent.title || agent.task || agent.project
    // the floor's number keeps its column on the left pier, as the pixel floors have it: the first tag starts after it
    const tagW = Math.min(2.5, pitch - .12), tagLeft = Math.max(x - tagW / 2, -7.55), tagRight = x + tagW / 2
    tag({ lines: [
      { spans: [...(agent.account ? [[`@${agent.account}`, ROLE.accent]] : []), [title, agent.kind === 'dozing' ? ROLE.dim : ROLE.title, { bold: true }]], size: .165, gap: .3 },
      { spans: [[words, CLASS_COLOR[agent.kind] ?? ROLE.dim]], size: .152 },
    ], width: tagRight - tagLeft, height: LIVE_BAND - .08, valign: 'middle', pad: .06, bg: '#120e0b', alpha: .96, mark, radius: .03 }, (tagLeft + tagRight) / 2, base + LIVE_BAND / 2 - .02, FRONT + .23, level)
  }

  // ---------------------------------------------------------------- the lobby: the café, the meeting room, the coat rack
  const lobby = ctx.lobby
  const breaks = plan.kitchen.slice(0, 6)
  breaks.forEach((agent, i) => {
    const span = lobby.cafe.x1 - lobby.cafe.x0
    const x = lobby.cafe.x0 + (i + .5) * span / Math.max(3, breaks.length)
    const actor = actors.figure(agent.agent, { legs: true, id: agent.id, p: .085 })
    actor.root.position.set(x, .1, lobby.cafe.z + (i % 2) * .4)
    lobbyPeople.add(actor.root)
    // a mug in the project's color, held out in the right hand
    const color = (snapshot.projects ?? []).find(p => p.name === agent.project)?.color ?? ROLE.idle
    box(actor.rightArm, .72, .42, .22, .16, .2, .16, color); box(actor.rightArm, .72, .53, .22, .12, .01, .12, '#3b2a20')
    figures.push({ actor, pose: 'stand' })
    const collider = new THREE.Mesh(ctx.colliderGeometry, ctx.colliderMaterial)
    collider.position.set(x, .6, lobby.cafe.z); collider.scale.set(1.3, 1.2, 1); collider.userData.id = agent.id
    lobbyPeople.add(collider); pickables.push(collider)
    anchors.set(agent.id, { x, y: .7, z: lobby.cafe.z, floor: -1, level: lobbyPeople })
  })
  if (plan.kitchen.length) {
    const who = [...new Set(plan.kitchen.map(a => a.project))].slice(0, 2)
    const plaque = lobby.cafe.plaque
    tag({ lines: [{ spans: [[`${plan.kitchen.length} on break`, ROLE.idle, { bold: true }]], size: .17 }, { spans: [[who.join(' · '), ROLE.dim]], size: .14 }], width: 2.2, pad: .08, bg: '#120e0b', alpha: .94 }, plaque.x, plaque.y, plaque.z, lobbyPeople)
  }
  const meetings = plan.meetings.slice(0, 2)
  if (meetings.length) {
    const { meeting, agent } = meetings[0]
    const seats = Math.max(1, Math.min(6, meeting.running || 1))
    for (let i = 0; i < seats; i++) {
      const side = i % 2 ? -1 : 1, col = Math.floor(i / 2)
      const actor = actors.figure(agent.agent, { legs: false, p: .07 })
      actor.root.position.set(lobby.meeting.table.x - 1.0 + col * 1.0, .62, lobby.meeting.table.z + side * .95)
      if (side < 0) actor.root.rotation.y = 0
      lobbyPeople.add(actor.root)
      figures.push({ actor, pose: i % 3 === 0 ? 'type' : 'look' })
    }
    // the whiteboard: the workflow, its phase, one mark per agent, ticked as they finish
    const board = lobby.meeting.board
    const total = Math.max(1, Math.min(24, meeting.total || seats)), done = Math.min(total, meeting.done || 0), failed = Math.min(total - done, meeting.failed || 0)
    tag({ lines: [{ spans: [[meeting.phase || 'Workflow', '#2b2620', { bold: true }]], size: .27 }, { spans: [[meeting.name || 'meeting', '#5a5246']], size: .2 }, { spans: [[`${done}/${total} done`, '#3d6e12', { bold: true }], ...(meeting.running ? [[`${meeting.running} running`, '#7d4f8a', { bold: true }]] : []), ...(meetings.length > 1 ? [[`+${meetings.length - 1}`, '#5a5246']] : [])], size: .2 }], width: board.w - .3, pad: .08 }, board.x, board.y + .2, board.z + .03, lobbyPeople)
    for (let i = 0; i < total; i++) box(lobbyPeople, board.x - board.w / 2 + .4 + i * .16, board.y - .52, board.z + .02, .11, .11, .02, i < done ? '#4f7a1f' : i < done + failed ? '#c0392b' : i < done + failed + (meeting.running || 0) ? '#9a3fb5' : '#c9c2b2', { castShadow: false })
  }
  // the coat rack by reception: a coat for each agent who just left, in its project's color
  const left = (plan.left ?? []).slice(0, 4)
  const rack = lobby.rack
  box(lobbyPeople, rack.x, 1.0, rack.z, .07, 1.9, .07, '#5c4a33'); box(lobbyPeople, rack.x, .08, rack.z, .5, .06, .5, '#4f3c29')
  for (const dx of [-.22, .22]) box(lobbyPeople, rack.x + dx, 1.86, rack.z, .3, .04, .04, '#5c4a33')
  left.forEach((entry, i) => {
    const color = (snapshot.projects ?? []).find(p => p.name === entry.project)?.color ?? '#8a7f5a'
    const dx = (i % 2 ? .22 : -.22) * (1 + Math.floor(i / 2) * .3)
    box(lobbyPeople, rack.x + dx, 1.5, rack.z + .05, .3, .62, .14, color); box(lobbyPeople, rack.x + dx, 1.82, rack.z + .05, .14, .1, .1, darker(color, .7))
  })
  if (left.length) tag({ lines: [{ spans: [[`${left.length} just left`, ROLE.dim]], size: .14 }, { spans: [[left[0].project, ROLE.title]], size: .14 }], width: 1.6, pad: .07, bg: '#120e0b', alpha: .94, anchor: 'left' }, rack.x + .45, 1.55, rack.z + .2, lobbyPeople)

  // B1 under the street: what they did this week, as the pixel office's Live tab has it
  const basement = buildBasement(ctx, snapshot, group, { quiet })
  pickables.push(...basement.pickables)

  flush()
  // ---------------------------------------------------------------- what moves
  function update(t) {
    basement.update(t)
    for (const f of figures) {
      if (f.actor) { actors.animate(f.actor, f.pose, t); continue }
      // an intern hops on its bench now and then, as the pixel interns do
      f.mini.userData.baseY ??= f.mini.position.y
      f.mini.position.y = f.mini.userData.baseY + (Math.floor(t * 3 + f.phase) % 2) * .03
    }
    for (const b of bubbles) b.group.position.y = b.y + (Math.floor(t * 2) % 2) * .07
    for (const s of snores) { const k = ((t * .45 + s.phase) % 1); s.group.position.y = s.y + k * .45; s.group.visible = k < .85 }
    for (const s of screens) actors.tickScreen(s.mesh, t, s.phase)
    return true
  }
  const signLines = liveSignLines(snapshot, nowMs)
  return {
    storeys, group, lobbyPeople, pickables, anchors, rooms, order: plan.order, hidden: plan.hidden, trophy: plan.trophy, basement: true,
    sign: signLines, status: snapshot.agents?.length && !quiet ? { strip: stripOf(snapshot.agents ?? []).map(a => CLASS_COLOR[a.kind] ?? ROLE.dim), counts: liveStatus(snapshot.agents ?? []) } : null,
    update, animated: true,
    setFacade(value) { for (const facade of facades) facade.visible = Boolean(value) },
  }
}
