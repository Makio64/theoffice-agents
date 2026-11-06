/**
 * Week: the office tower of the pixel office's Week tab (lib/svg-week.mjs) in voxels. One floor per project, the
 * busiest on top, and one window per day of the page: the window's room lit by that day's agent-time (lit by its
 * screens alone, the lamp on, the room lit, the room ablaze), the day's agents at their monitors, the day's agent-time
 * on its transom; a day nobody worked there is shut, its roller shutter down under a rolled-up awning. On each floor's
 * left, its nameplate (its number on a dark tab, the project in dark type on its color) over its tally: a lit tube as
 * long as its share of the busiest floor's agent-time, the agent-time and the commits. Over the floors hang the week's
 * card and a tear-off calendar page per day; a key under them gives each light's hours.
 */
import { CAST } from '../../../plugin/lib/cast.mjs'
import { K, ROLE } from '../../../plugin/lib/svg-kit.mjs'
import { fmtHours, fmtInt } from '../../../plugin/lib/format.mjs'
import { FRONT, INNER, LOBBY_TOP } from '../building.js'

export const WEEK_STOREY = 2.55
const HEADER = 2.15, KEY = .95
const MAX_FLOORS = 9
const COL0 = -3.32, SIGN0 = -INNER + .55, SIGN1 = -3.6
const P = { frame: '#2a211b', stone: '#b29d7d', stoneD: '#5c4c3b', brass: '#c9a26b', gold: '#f6d860', goldD: '#a8792a', cream: '#f4efe4', plate: '#2b2019' }
// a lit room by level (svg-week's four rooms): its back wall, its glow
const ROOM = [null, ['#1d2433', .12], ['#5a4530', .45], ['#a8743a', .8], ['#f0b866', 1.25]]
const AWNINGS = ['stripes', 'band', 'hood', 'lintel']
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const hash = s => { let h = 2166136261; for (const ch of `tw:${String(s)}`) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h }
const mix = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const [x, y] = [p(a), p(b)]; return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}` }

/** A day's window light, 0 (dark) to 4: the square root of its minutes over the busiest window's, in quarters (svg-week glowLevel). */
export const glowLevel = (minutes, max) => (minutes > 0 ? Math.min(4, Math.max(1, Math.ceil(Math.sqrt(minutes / Math.max(1, max)) * 4))) : 0)
/** The key's hours: the most minutes each light stands for (a sixteenth, a quarter, nine sixteenths of the busiest window, then all of it). */
export const glowSteps = max => [1 / 16, 1 / 4, 9 / 16, 1].map(f => max * f)

export function buildWeek(ctx, snapshot) {
  const { THREE, kit, labels, actors } = ctx
  const { box, flush } = kit
  const group = new THREE.Group()
  const days = (snapshot.period?.days ?? snapshot.dailyDates ?? []).slice(-7)
  const today = snapshot.now?.date
  const all = [...(snapshot.projects ?? [])].filter(p => (p.minutes ?? 0) >= 10 || (p.days ?? []).some(v => v > 0)).sort((a, b) => b.minutes - a.minutes)
  const shown = all.slice(0, MAX_FLOORS)
  const stored = Math.max(0, all.length - shown.length) + (snapshot.projectsMore ?? 0)
  const minutesOf = (p, i) => Number(p.days?.[(p.days?.length ?? 0) - days.length + i] ?? 0)
  const commitsOf = (p, i) => Number(p.dayCommits?.[(p.dayCommits?.length ?? 0) - days.length + i] ?? 0)
  const max = Math.max(1, ...shown.flatMap(p => days.map((_, i) => minutesOf(p, i))))
  const busiest = Math.max(1, ...shown.map(p => p.minutes))
  const live = new Set((snapshot.agents ?? []).map(a => a.project))
  const pickables = [], screens = [], figures = [], rooms = [], storeys = []
  const n = days.length || 7, pitch = (INNER - COL0) / n, ww = pitch - .3
  const colX = i => COL0 + (i + .5) * pitch
  const tag = (spec, x, y, z, parent) => { const l = labels.label(spec); l.position.set(x, y, z); parent.add(l); return l }
  const hit = (parent, x, y, z, w, h, text, extra = {}) => {
    const m = new THREE.Mesh(ctx.colliderGeometry, ctx.colliderMaterial); m.position.set(x, y, z); m.scale.set(w, h, .4); m.userData = { text, ...extra }; parent.add(m); pickables.push(m)
  }
  const dayName = date => { const d = new Date(`${date}T12:00:00Z`); return { wd: WEEKDAY[d.getUTCDay()], d: d.getUTCDate(), dow: d.getUTCDay() } }
  const totals = days.map((_, i) => (snapshot.days ?? []).find(r => r.date === days[i])?.minutes ?? shown.reduce((s, p) => s + minutesOf(p, i), 0))
  const bestDay = totals.indexOf(Math.max(...totals))

  // ---------------------------------------------------------------- the key under the floors
  let y = LOBBY_TOP
  {
    const level = new THREE.Group(); group.add(level)
    storeys.push({ base: y, height: KEY, number: null, group: level })
    box(level, 0, y + KEY / 2, FRONT - .1, 16.4, KEY, .3, '#2b2019')
    box(level, 0, y + KEY - .04, FRONT + .07, 16.4, .05, .06, P.brass)
    box(level, 0, y + .04, FRONT + .07, 16.4, .05, .06, P.brass)
    box(level, 0, y + .06, 0, 16.4, .12, 6.3, K.slab)
    const steps = glowSteps(max)
    const spans = [['WORKLOAD (AGENT-TIME)', '#2b2620', { bold: true }]]
    tag({ lines: [{ spans, size: .15 }], pad: .07, bg: P.cream, radius: .02, anchor: 'left' }, -7.7, y + KEY / 2, FRONT + .12, level)
    steps.forEach((m, k) => {
      const x = -3.0 + k * 1.75
      box(level, x, y + KEY / 2, FRONT + .1, .44, .5, .06, P.frame)
      box(level, x, y + KEY / 2, FRONT + .14, .34, .38, .02, ROOM[k + 1][0], { glow: ROOM[k + 1][1] * .8 })
      tag({ lines: [{ spans: [[`≤${fmtHours(m)}`, '#d8c9ac']], size: .16 }], pad: .02, anchor: 'left' }, x + .3, y + KEY / 2, FRONT + .12, level)
    })
    box(level, 4.15, y + KEY / 2, FRONT + .12, .16, .16, .04, '#7fd6e8', { glow: .8 })
    tag({ lines: [{ spans: [['live now', '#d8c9ac']], size: .15 }], pad: .02, anchor: 'left' }, 4.3, y + KEY / 2, FRONT + .12, level)
    tag({ lines: [{ spans: [['9h', '#2b2620', { bold: true }]], size: .15 }], pad: .04, bg: P.gold, radius: .02, anchor: 'left' }, 5.9, y + KEY / 2, FRONT + .12, level)
    tag({ lines: [{ spans: [['best day', '#d8c9ac']], size: .15 }], pad: .02, anchor: 'left' }, 6.5, y + KEY / 2, FRONT + .12, level)
    if (stored) {
      for (const [dx, dy] of [[0, 0], [.42, 0], [.21, .34]]) { box(level, -7.4 + dx, y + KEY + .18 + dy, 2.4, .38, .32, .38, '#8b6a45'); box(level, -7.4 + dx, y + KEY + .18 + dy, 2.6, .38, .04, .02, '#5c4a33') }
    }
    y += KEY
  }

  // ---------------------------------------------------------------- the floors, the least busy at the bottom
  const order = [...shown].reverse()
  order.forEach((p, k) => {
    const rank = shown.length - 1 - k
    const base = y, top = base + WEEK_STOREY
    const level = new THREE.Group(); group.add(level)
    const number = k + 2
    storeys.push({ base, height: WEEK_STOREY, number, plate: false, group: level })
    rooms.push({ project: p.name, floor: storeys.length - 1, x0: -INNER, x1: INNER, base, top })
    const style = AWNINGS[hash(p.name) % 4]
    const night = ctx.night
    // the floor's slab and its brick face: a sill band under the windows, piers between them, the lintel band over them
    box(level, 0, base + .08, 0, 16.4, .16, 6.3, K.slab)
    box(level, 0, base + .1, FRONT + .1, 16.5, .2, .22, P.stoneD)
    box(level, 0, base + .3, FRONT - .02, 16.4, .22, .24, K.brick)
    box(level, 0, top - .28, FRONT - .02, 16.4, .56, .24, K.brick)
    box(level, (SIGN0 + COL0) / 2 - .25, (base + top) / 2, FRONT - .02, COL0 - SIGN0 + .5, WEEK_STOREY, .24, K.brick)
    for (let i = 0; i <= n; i++) box(level, COL0 + i * pitch, (base + top) / 2, FRONT, .3, WEEK_STOREY - .2, .26, mix(K.brick, '#000000', .1))
    box(level, 0, (base + top) / 2, -.5, 16.4, WEEK_STOREY, 1, '#151210')
    // the nameplate: its number on a dark tab fused to the project's name in dark type on its color, then the tally
    const name = p.name
    tag({ lines: [{ spans: [[`${number}F`, '#cbb995', { pixel: true }]], size: .26 }], width: .6, height: .44, valign: 'middle', pad: .04, bg: '#1b1611', radius: .02, anchor: 'left' }, SIGN0, top - .62, FRONT + .2, level)
    const plateW = SIGN1 - SIGN0 - .62
    tag({ lines: [{ spans: [[name, '#16110d', { pixel: true }]], size: .34 }], width: plateW, height: .44, valign: 'middle', pad: .07, bg: p.color, radius: .02, anchor: 'left' }, SIGN0 + .62, top - .62, FRONT + .2, level)
    const share = Math.max(.04, p.minutes / busiest)
    box(level, SIGN0 + .1 + (plateW + .5) * share / 2, base + 1.05, FRONT + .16, (plateW + .5) * share, .1, .06, p.color, { glow: night ? .9 : .35, castShadow: false })
    box(level, SIGN0 + .1 + (plateW + .5) / 2, base + 1.05, FRONT + .13, plateW + .5, .14, .04, '#1b1611', { castShadow: false })
    tag({ lines: [{ spans: [[fmtHours(p.minutes), '#f4efe4', { pixel: true }], [`${p.commits ?? 0} commits`, ROLE.ship, { sep: '   ' }]], size: .3 }], pad: .03, anchor: 'left' }, SIGN0 + .1, base + .62, FRONT + .2, level)
    if (rank === 0) {
      // the busiest floor's crown on its nameplate and its gilt ledge
      kit.sprite(level, ['g.g.g.g', 'ggggggg', 'gRgggRg', 'ggggggg'], { g: kit.mat(P.gold, .35), R: kit.mat('#e07a61', .4) }, SIGN0 + plateW + .25, top - .26, FRONT + .25, .07, .08)
      box(level, 0, base + .22, FRONT + .25, 16.5, .07, .1, P.gold, { glow: .25 })
    }
    // the seven windows
    const best = Math.max(...days.map((_, i) => minutesOf(p, i)))
    const crew = (p.crew ?? []).filter(c => (c.minutes ?? 0) > 0 || c.live)
    const seat = j => crew.length ? crew[j % crew.length].agent : 'claude'
    days.forEach((date, i) => {
      const x = colX(i), m = minutesOf(p, i), lv = glowLevel(m, max)
      const wy0 = base + .45, wy1 = top - .62, wh = wy1 - wy0, wy = (wy0 + wy1) / 2
      // the frame round the opening (its four sides), the stone sill under it, the reveal's dark sides
      for (const [fx, fy, fw, fh] of [[x - ww / 2 - .02, wy, .07, wh + .08], [x + ww / 2 + .02, wy, .07, wh + .08], [x, wy0 - .02, ww + .08, .07], [x, wy1 + .02, ww + .08, .07]]) box(level, fx, fy, FRONT + .05, fw, fh, .12, P.frame)
      for (const dx of [-1, 1]) box(level, x + dx * (ww / 2 - .02), wy, FRONT - .3, .04, wh, .6, '#1a1511')
      box(level, x, wy0 - .06, FRONT + .18, ww + .2, .07, .22, P.stone)
      if (!lv) {
        // shut: the roller shutter down, the awning rolled up in its box
        for (let s = 0; s < 9; s++) box(level, x, wy0 + .06 + s * (wh - .12) / 8.5, FRONT + .08, ww - .04, (wh - .12) / 10, .04, s % 2 ? '#4a4d52' : '#5d6168')
        box(level, x, wy1 + .08, FRONT + .2, ww + .12, .18, .22, '#3f3a33')
        hit(level, x, wy, FRONT + .2, ww, wh, `${name} · ${dayName(date).wd} ${dayName(date).d} · closed`, { project: name })
        return
      }
      const [wall, glow] = ROOM[lv]
      box(level, x, wy, FRONT - .55, ww, wh, .08, wall, { glow: glow * (night ? 1 : .35) })
      box(level, x, wy0 + .02, FRONT - .25, ww, .04, .6, mix(wall, '#000000', .35))
      if (lv >= 2) { box(level, x, wy1 - .05, FRONT - .3, .02, .14, .02, '#2b2620'); box(level, x, wy1 - .18, FRONT - .3, .3, .1, .2, '#2e2620'); box(level, x, wy1 - .24, FRONT - .3, .22, .03, .14, '#fff1c4', { glow: night ? 1.4 : .5 }) }
      // the day's agents at their monitors: one by a quiet day, up to three on the busiest
      const seats = lv >= 3 ? 2 : 1
      const sw = ww / seats
      for (let j = 0; j < seats; j++) {
        const sx = x - ww / 2 + (j + .5) * sw
        box(level, sx, wy0 + .3, FRONT - .32, sw - .08, .05, .26, '#c9a26b')
        box(level, sx - sw * .22, wy0 + .45, FRONT - .38, .2, .15, .03, '#262a30')
        const screen = actors.screen(level, 'coding', sx - sw * .22, wy0 + .45, FRONT - .364, .17, .11)
        screens.push({ mesh: screen, phase: i + j })
        const figure = actors.figure(seat(j + i), { legs: false, p: Math.min(.042, sw * .062) })
        figure.root.position.set(sx + sw * .16, wy0 + .27, FRONT - .45)
        level.add(figure.root)
        figures.push({ actor: figure, pose: j % 2 ? 'read' : 'type' })
      }
      // the mullions in front of the room
      box(level, x, wy, FRONT + .1, .04, wh, .04, P.frame)
      box(level, x, wy + wh * .18, FRONT + .1, ww, .04, .04, P.frame)
      // the awning in the floor's style
      if (style === 'stripes') for (let s = 0; s < 6; s++) box(level, x - ww / 2 + (s + .5) * ww / 6, wy1 + .12, FRONT + .3, ww / 6, .16, .5, s % 2 ? P.cream : p.color, { rotate: 0 })
      else if (style === 'band') box(level, x, wy1 + .12, FRONT + .28, ww + .1, .16, .46, p.color)
      else if (style === 'hood') { box(level, x, wy1 + .14, FRONT + .25, ww + .14, .1, .42, mix(p.color, '#000000', .3)); box(level, x, wy1 + .06, FRONT + .45, ww + .14, .12, .05, p.color) }
      else box(level, x, wy1 + .1, FRONT + .14, ww + .24, .14, .24, P.stone)
      // the day's agent-time on its transom, the floor's best day on a gold tag
      const isBest = m === best && m > 0
      tag({ lines: [{ spans: [[fmtHours(m), isBest ? '#2b2620' : lv >= 3 ? '#2b2620' : '#f4efe4', { bold: true }]], size: .17, align: 'center' }], pad: .04, bg: isBest ? P.gold : lv >= 3 ? '#f4dfb0' : '#1b1611', radius: .02 }, x, wy1 - .14, FRONT + .52, level)
      if (date === today && live.has(name)) box(level, x + ww / 2 - .1, wy0 + .1, FRONT + .2, .1, .1, .04, '#7fd6e8', { glow: 1 })
      // the light a lit room throws on its sill at night
      if (lv >= 2) box(level, x, wy0 - .02, FRONT + .32, ww * .8, .01, .25, '#ffd98a', { glow: night ? .35 * lv : 0, castShadow: false, receiveShadow: false })
      hit(level, x, wy, FRONT + .2, ww, wh, `${name} · ${dayName(date).wd} ${dayName(date).d} · ${fmtHours(m)} agent-time${commitsOf(p, i) ? ` · ${commitsOf(p, i)} commits` : ''}`, { project: name })
    })
    y = top
  })

  // ---------------------------------------------------------------- the picture rail: the week's card and the calendar pages
  {
    const base = y, top = y + HEADER
    const level = new THREE.Group(); group.add(level)
    storeys.push({ base, height: HEADER, number: null, group: level })
    box(level, 0, base + .08, 0, 16.4, .16, 6.3, K.slab)
    box(level, 0, (base + top) / 2, FRONT - .05, 16.4, HEADER, .2, mix(K.brick, '#000000', .2))
    box(level, 0, top - .18, FRONT + .1, 16.4, .07, .1, P.brass)
    const card = { x: (SIGN0 + SIGN1) / 2 - .2, w: SIGN1 - SIGN0 + .1 }
    box(level, card.x, base + 1.0, FRONT + .1, card.w, 1.55, .08, P.cream)
    const total = snapshot.totals?.minutes ?? totals.reduce((a, b) => a + b, 0)
    const label = snapshot.period?.back ? (snapshot.period?.label ?? '') : 'THIS WEEK'
    // the week's card: paper of its own (unlit), so it reads as bright by night as by day
    tag({ lines: [
      { spans: [[label.toUpperCase(), '#5a4f3c', { bold: true }]], size: .17, align: 'center' },
      { spans: [[fmtHours(total), '#2b2620', { pixel: true }]], size: .66, align: 'center', gap: .08 },
      { spans: [[days.length ? `${dayName(days[0]).d} ${MONTHS[new Date(`${days[0]}T12:00:00Z`).getUTCMonth()]} → ${dayName(days.at(-1)).d} ${MONTHS[new Date(`${days.at(-1)}T12:00:00Z`).getUTCMonth()]}` : '', '#5a4f3c', { bold: true }], [`${snapshot.totals?.commits ?? 0} commits`, '#3d6e12', { bold: true, sep: '   ' }]], size: .16, align: 'center' },
    ], width: card.w - .06, height: 1.48, valign: 'middle', pad: .08, bg: P.cream, radius: .03 }, card.x, base + 1.0, FRONT + .16, level)
    days.forEach((date, i) => {
      const x = colX(i), { wd, d, dow } = dayName(date), m = totals[i]
      const weekend = dow === 0 ? '#c0392b' : dow === 6 ? '#3557a8' : '#2b2620'
      const isToday = date === today
      box(level, x, base + 1.0, FRONT + .1, ww, 1.55, .08, isToday ? P.gold : '#9a8f78')
      box(level, x, base + 1.0, FRONT + .15, ww - .1, 1.45, .04, dow === 6 ? '#e3e7f0' : P.cream)
      box(level, x, base + 1.66, FRONT + .17, ww - .1, .2, .03, dow === 0 ? '#c0392b' : dow === 6 ? '#3557a8' : '#d77757')
      for (const dx of [-.3, .3]) box(level, x + dx, base + 1.82, FRONT + .2, .06, .08, .06, '#5c4a33')
      // the tear-off page: its weekday on the colored band, its date big, the day's agent-time, on paper of its own
      tag({ lines: [{ spans: [[wd.toUpperCase(), '#fff8ea', { bold: true }]], size: .14, align: 'center' }], width: ww - .1, height: .2, valign: 'middle', pad: .01, bg: dow === 0 ? '#c0392b' : dow === 6 ? '#3557a8' : '#d77757' }, x, base + 1.66, FRONT + .19, level)
      tag({ lines: [
        { spans: [[String(d), weekend, { pixel: true }]], size: .66, align: 'center', gap: .02 },
        { spans: [[m ? fmtHours(m) : '—', '#5a4f3c', { bold: true }]], size: .17, align: 'center' },
      ], width: ww - .1, height: 1.2, valign: 'middle', pad: .04, bg: dow === 6 ? '#e3e7f0' : P.cream }, x, base + .94, FRONT + .19, level)
      if (i === bestDay && m > 0) kit.sprite(level, ['..g..', '.ggg.', 'ggggg', '.g.g.'], { g: kit.mat(P.gold, .6) }, x + ww / 2 - .14, base + 1.62, FRONT + .25, .05, .05)
      hit(level, x, base + 1.0, FRONT + .2, ww, 1.5, `${wd} ${d} · ${fmtHours(m)} agent-time`)
    })
  }

  flush()
  function update(t) {
    for (const f of figures) actors.animate(f.actor, f.pose, t)
    for (const s of screens) actors.tickScreen(s.mesh, t, s.phase)
  }
  const tot = snapshot.totals ?? {}
  const sign = [
    [[`${fmtHours(tot.minutes ?? 0)} agent-time`, ROLE.title], [`${tot.sessions ?? 0} sessions`, ROLE.dim], [`${tot.subagents ?? 0} interns`, ROLE.intern]],
    [[`${tot.workflows ?? 0} meetings`, ROLE.meeting], [`${tot.commits ?? 0} commits`, ROLE.ship], [`+${fmtInt(tot.additions ?? 0)}/−${fmtInt(tot.deletions ?? 0)} lines`, ROLE.dim]],
  ]
  if (stored) sign[1].push([`+${stored} more in storage`, ROLE.dim])
  return { storeys, group, sign, status: null, rooms, anchors: new Map(), pickables, update }
}
