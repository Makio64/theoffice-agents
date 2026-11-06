/**
 * Timelapse: the pixel office's replay (lib/svg-timelapse.mjs) in voxels. Yesterday, the last 7 days or the last 30
 * replayed slot by slot, a twentieth of a second a slot: every session sits at a desk of its project's room while it
 * works there and leaves it when it is done, its interns on the bench in front; a room goes dark while nobody is in.
 * The lobby's meeting room fills while a workflow runs, the commits line's parcels pile up, the sign's clock names the
 * replayed time in gold and the sky turns with its hour. The page's scrubber and reel (app.js) drive and follow it.
 */
import { CAST } from '../../../plugin/lib/cast.mjs'
import { K, ROLE } from '../../../plugin/lib/svg-kit.mjs'
import { planLive } from '../office-layout.js'
import { FRONT, INNER, LOBBY_TOP } from '../building.js'

export const LAPSE_STOREY = 3.6
const BAND = .5
const SLOT_SECONDS = 1 / 20, HOLD_SECONDS = 1.6, MAX_SEATS = 5, MAX_ROOMS = 8
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const darker = (hex, t = .55) => { const n = parseInt(hex.slice(1), 16); return `#${[n >> 16, n >> 8 & 255, n & 255].map(v => Math.round(v * t).toString(16).padStart(2, '0')).join('')}` }

/** Slot i of a replay as its clock says it: 'Sun 09:15', 'Tue 27 16:00' for a month (model.mjs lapseSlot). */
export function lapseClock(timeline, i) {
  const days = timeline?.days?.length ? timeline.days : ['1970-01-01']
  const slotMin = Math.max(1, timeline?.slotMinutes || 60), perDay = Math.max(1, Math.round(1440 / slotMin))
  const n = Math.min(days.length * perDay - 1, Math.max(0, Math.floor(timeline?.start || 0) + Math.floor(i)))
  const date = days[Math.min(days.length - 1, Math.floor(n / perDay))]
  const min = (n % perDay) * slotMin
  const hm = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
  const d = new Date(`${date}T12:00:00Z`)
  return { date, hour: Math.floor(min / 60), label: timeline?.kind === 'month' ? `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${hm}` : `${WEEKDAY[d.getUTCDay()]} ${hm}` }
}

/**
 * Seats per project over the replay: each project's sessions, by first slot, onto as few desks as can hold them at
 * once (MAX_SEATS at most; a session with no free desk is left out of the room). Returns rooms busiest first and the
 * reel's lanes: sessions at work, interns and commits in each slot.
 */
export function lapseSeats(timeline) {
  const slots = Math.max(1, timeline?.slots || 1)
  const byProject = new Map()
  for (const desk of timeline?.desks ?? []) {
    if (!byProject.has(desk.project)) byProject.set(desk.project, [])
    for (const [from, to] of desk.runs ?? []) byProject.get(desk.project).push({ from, to, agent: desk.agent, title: desk.title, interns: desk.interns ?? [] })
  }
  const rooms = []
  let dropped = 0
  for (const [project, runs] of byProject) {
    runs.sort((a, b) => a.from - b.from || a.to - b.to)
    const seats = []
    for (const run of runs) {
      const seat = seats.find(s => s.at(-1).to <= run.from)
      if (seat) seat.push(run)
      else if (seats.length < MAX_SEATS) seats.push([run])
      else dropped++
    }
    rooms.push({ project, seats, worked: runs.reduce((n, r) => n + r.to - r.from, 0) })
  }
  rooms.sort((a, b) => b.worked - a.worked || a.project.localeCompare(b.project))
  const lanes = { sessions: new Array(slots).fill(0), interns: new Array(slots).fill(0), commits: new Array(slots).fill(0) }
  for (const desk of timeline?.desks ?? []) {
    for (const [from, to] of desk.runs ?? []) for (let s = Math.max(0, from); s < Math.min(slots, to); s++) lanes.sessions[s]++
    const points = desk.interns ?? []
    points.forEach(([at, count], k) => { const until = points[k + 1]?.[0] ?? slots; for (let s = Math.max(0, at); s < Math.min(slots, until); s++) lanes.interns[s] += count })
  }
  for (const c of timeline?.commits ?? []) if (c.slot >= 0 && c.slot < slots) lanes.commits[c.slot] += c.n
  return { rooms: rooms.slice(0, MAX_ROOMS), more: Math.max(0, rooms.length - MAX_ROOMS), dropped, lanes }
}

export function buildTimelapse(ctx, snapshot) {
  const { THREE, kit, labels, actors } = ctx
  const { box, flush } = kit
  const timeline = snapshot.timeline ?? { slots: 1, days: [], desks: [], meetings: [], commits: [] }
  const projects = snapshot.projects ?? []
  const colorOf = name => projects.find(p => p.name === name)?.color ?? '#9ab86a'
  const { rooms, more, lanes } = lapseSeats(timeline)
  // the rooms laid out as the live building's, a desk a seat
  const fakeAgents = rooms.flatMap(r => r.seats.map((_, k) => ({ id: `${r.project}#${k}`, project: r.project, kind: 'working', agent: r.seats[k][0]?.agent ?? 'claude' })))
  const plan = planLive({ agents: fakeAgents, projects: rooms.map(r => ({ name: r.project, color: colorOf(r.project) })) })
  const group = new THREE.Group(), lobbyPeople = new THREE.Group()
  const storeys = [], roomShades = [], pickables = []
  const shadeMaterial = new THREE.MeshBasicMaterial({ color: '#05060c', transparent: true, opacity: .62, depthWrite: false })
  kit.disposables.add(shadeMaterial)
  const tag = (spec, x, y, z, parent) => { const l = labels.label(spec); l.position.set(x, y, z); parent.add(l); return l }
  const n = plan.floors.length, slot = (2 * INNER) / (plan.slots || 6)
  plan.floors.forEach((floor, row) => {
    const index = n - 1 - row
    const base = LOBBY_TOP + index * LAPSE_STOREY, fy = base + BAND, top = base + LAPSE_STOREY
    const level = new THREE.Group(); group.add(level)
    storeys[index] = { base, height: LAPSE_STOREY, number: index + 2, group: level }
    box(level, 0, fy - .15, 0, 16.7, .3, 6.4, K.slab)
    box(level, 0, base + BAND / 2, FRONT + .06, 16.9, BAND - .04, .32, '#1f1a16')
    box(level, 0, fy - .015, FRONT + .2, 16.9, .05, .06, K.wood)
    box(level, 0, fy + .02, 0, 16.1, .04, 6.1, '#5a3f34', { castShadow: false })
    box(level, 0, (fy + top) / 2, -3.12, 16.5, top - fy, .2, '#17251a')
    box(level, 0, fy + .45, -2.99, 16.3, .9, .07, '#121f14')
    for (const xx of [-8.05, 8.05]) box(level, xx, (fy + top) / 2, 0, .05, top - fy, 6.3, '#17251a')
    for (const x of [-4.0, 4.0]) { box(level, x, top - .4, -.6, .6, .12, .4, '#807153'); box(level, x, top - .47, -.6, .5, .03, .32, ctx.building.bulbMaterial) }
    for (const room of floor.rooms) {
      const x0 = -INNER + room.from * slot, x1 = -INNER + room.to * slot, cx = (x0 + x1) / 2, w = x1 - x0
      if (room.from > 0) box(level, x0, (fy + top) / 2, -1.95, .12, top - fy, 2.35, K.part)
      box(level, cx, fy + .06, -.2, w - .5, .03, 4.6, darker(room.color, .62), { castShadow: false })
      const name = room.part ? `${room.project} (cont.)` : room.project
      const plateW = Math.min(w - .4, labels.measure(name, .3, { pixel: true }) + .3)
      for (const dx of [.2, plateW - .2]) box(level, x0 + .3 + dx, top - .2, 2.55, .025, .4, .025, '#3a342b', { castShadow: false })
      tag({ lines: [{ spans: [[name, '#16110d', { pixel: true }]], size: .3 }], width: plateW, height: .38, valign: 'middle', pad: .06, bg: room.color, radius: .025, anchor: 'left' }, x0 + .3, top - .52, 2.55, level)
      // the shade that darkens the room while nobody works in it
      const shade = new THREE.Mesh(ctx.colliderGeometry, shadeMaterial)
      shade.position.set(cx, (fy + top) / 2, 2.4); shade.scale.set(w - .08, top - fy - .02, .02); shade.renderOrder = 3
      level.add(shade)
      const projectRoom = rooms.find(r => r.project === room.project)
      const roomSeats = []
      const pitch = w / room.desks.length
      room.desks.forEach((fake, i) => {
        const x = x0 + (i + .5) * pitch, width = Math.min(2.2, pitch - .36), left = x - width / 2
        box(level, x, fy + .74, .55, width, .08, .78, '#dcab72')
        box(level, x, fy + .38, .93, width - .04, .5, .05, '#8b6a45')
        const mw = Math.min(.66, width * .32), mx = left + mw / 2 + .12
        box(level, mx, fy + 1.12, .34, mw + .1, mw * .68 + .1, .1, '#262a30')
        const screen = actors.screen(level, 'off', mx, fy + 1.12, .396, mw, mw * .66)
        const cx2 = x + width * .18
        box(level, cx2, fy + .5, -.42, .55, .1, .5, K.chairHi); box(level, cx2, fy + .96, -.66, .6, .78, .1, K.chair)
        const seatIndex = Number(String(fake.id).split('#').pop())
        roomSeats.push({ runs: projectRoom?.seats[seatIndex] ?? [], x: cx2, y: fy + .72, mx, level, screen, figures: new Map(), minis: new Map(), current: null, bench: { x, y: fy + .22, z: 1.42 } })
      })
      roomShades.push({ shade, seats: roomSeats })
      const hit = new THREE.Mesh(ctx.colliderGeometry, ctx.colliderMaterial); hit.position.set(cx, (fy + top) / 2, 1.2); hit.scale.set(w, top - fy, 2.5); hit.userData = { text: room.project, project: room.project }; level.add(hit); pickables.push(hit)
    }
  })
  // the meeting room's table: up to six seats, filled while a workflow runs
  const lobby = ctx.lobby
  const meetingSeats = []
  for (let i = 0; i < 6; i++) meetingSeats.push({ x: lobby.meeting.table.x - 1.0 + (i % 3) * 1.0, z: lobby.meeting.table.z - .95 + Math.floor(i / 3) * 1.9, figures: new Map(), current: null })
  const board = new THREE.Group(); lobbyPeople.add(board)
  flush()

  function figureFor(holder, agent, make) {
    if (!holder.figures.has(agent)) { const f = make(agent); holder.figures.set(agent, f) }
    return holder.figures.get(agent)
  }
  // ---------------------------------------------------------------- the replay
  const slots = Math.max(1, timeline.slots || 1)
  let at = 0, playing = true, speed = 1, hold = 0, lastSlot = -1, lastMeeting = '', lastHour = -1, commitsSoFar = -1
  const cumulative = []
  { let c = 0; for (let s = 0; s < slots; s++) { c += lanes.commits[s]; cumulative.push(c) } }
  function showSlot(s) {
    for (const room of roomShades) {
      let busy = 0
      for (const seat of room.seats) {
        const run = seat.runs.find(r => r.from <= s && s < r.to) ?? null
        const agent = run?.agent ?? null
        if (seat.current && seat.current !== agent) seat.figures.get(seat.current).root.visible = false
        if (agent) {
          const f = figureFor(seat, agent, a => { const fig = actors.figure(a, { legs: false, p: .085 }); fig.root.position.set(seat.x, seat.y, .02); seat.level.add(fig.root); flush(); return fig })
          f.root.visible = true
          busy++
        }
        seat.current = agent
        actors.setScreen(seat.screen, agent ? 'coding' : 'off')
        // its interns on the bench, while its helpers work
        const count = run ? Math.min(3, (run.interns.filter(([p]) => p <= s).at(-1)?.[1]) ?? 0) : 0
        for (const [key, mini] of seat.minis) mini.visible = key.startsWith(`${agent}:`) && Number(key.split(':')[1]) < count
        for (let k = 0; k < count; k++) {
          const key = `${agent}:${k}`
          if (!seat.minis.has(key)) { const m = actors.mini(agent); m.position.set(seat.bench.x - (count - 1) * .31 + k * .62, seat.bench.y, seat.bench.z); seat.level.add(m); seat.minis.set(key, m); flush() }
          seat.minis.get(key).visible = true
        }
      }
      room.shade.visible = busy === 0
    }
    // the meeting room
    const running = (timeline.meetings ?? []).filter(m => m.from <= s && s < m.to)
    const agentsInMeeting = Math.min(6, running.reduce((a, m) => a + Math.max(1, m.agents || 1), 0))
    const who = running[0] ? (timeline.desks.find(d => d.project === running[0].project)?.agent ?? 'claude') : 'claude'
    meetingSeats.forEach((seat, i) => {
      const agent = i < agentsInMeeting ? who : null
      if (seat.current && seat.current !== agent) seat.figures.get(seat.current).root.visible = false
      if (agent) { const f = figureFor(seat, agent, a => { const fig = actors.figure(a, { legs: false, p: .062 }); fig.root.position.set(seat.x, .62, seat.z); if (seat.z > lobby.meeting.table.z) fig.root.rotation.y = Math.PI; lobbyPeople.add(fig.root); flush(); return fig }); f.root.visible = true }
      seat.current = agent
    })
    const meetingText = running.length ? `${running[0].name}${running.length > 1 ? ` +${running.length - 1}` : ''}` : ''
    if (meetingText !== lastMeeting) {
      lastMeeting = meetingText
      labels.release(board); board.clear()
      if (meetingText) tag({ lines: [{ spans: [['Workflow', '#2b2620', { bold: true }]], size: .22 }, { spans: [[meetingText, '#5a5246']], size: .17 }], width: lobby.meeting.board.w - .4, pad: .08 }, lobby.meeting.board.x, lobby.meeting.board.y + .1, lobby.meeting.board.z + .03, board)
    }
    // the clock, the sky, the parcels
    const clock = lapseClock(timeline, s)
    ctx.setClock?.(clock.label)
    if (clock.hour !== lastHour) { lastHour = clock.hour; ctx.setSkyHour?.(clock.hour) }
    if (cumulative[s] !== commitsSoFar) { commitsSoFar = cumulative[s]; ctx.setCommits?.(commitsSoFar) }
    ctx.onLapse?.({ at: s, slots, label: clock.label, playing })
  }
  function update(t, dt) {
    for (const room of roomShades) for (const seat of room.seats) if (seat.current) actors.animate(seat.figures.get(seat.current), 'type', t)
    for (const seat of meetingSeats) if (seat.current) actors.animate(seat.figures.get(seat.current), 'look', t)
    if (playing) {
      if (hold > 0) { hold -= dt; if (hold <= 0) { at = 0 } }
      else {
        at += dt * speed / SLOT_SECONDS
        if (at >= slots - 1) { at = slots - 1; hold = HOLD_SECONDS }
      }
    }
    const s = Math.floor(at)
    if (s !== lastSlot) { lastSlot = s; showSlot(s) }
  }
  function setLapse(options = {}) {
    if (typeof options.playing === 'boolean') { playing = options.playing; if (playing && at >= slots - 1) { at = 0; hold = 0 } }
    if (Number.isFinite(options.speed) && options.speed > 0) speed = options.speed
    if (Number.isFinite(options.at)) { at = Math.max(0, Math.min(slots - 1, options.at)); hold = 0 }
    lastSlot = -1
    update(0, 0)
  }
  showSlot(0)
  const word = { yesterday: 'yesterday', week: 'this week', month: 'this month' }[timeline.kind] ?? 'this week'
  const totalSessions = timeline.desks?.length ?? 0
  const sign = [
    [['▶ timelapse', ROLE.accent], [word, ROLE.title], [timeline.label || snapshot.period?.label || '', ROLE.dim]],
    totalSessions ? [[`${totalSessions} sessions`, ROLE.busy], [`${(timeline.meetings ?? []).length} meetings`, ROLE.meeting], [`${cumulative.at(-1) ?? 0} commits`, ROLE.ship], ...(more ? [[`+${more} more projects`, ROLE.dim]] : [])] : [['nothing to replay', ROLE.dim]],
  ]
  return {
    storeys, group, lobbyPeople, sign, signClock: true, status: null, rooms: [], anchors: new Map(), pickables, update, setLapse, animated: true,
    lapse: { slots, lanes, label: lapseClock(timeline, 0).label },
    dispose() { shadeMaterial.dispose(); kit.disposables.delete(shadeMaterial) },
  }
}
