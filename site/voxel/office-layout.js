/**
 * PURE: where everyone sits in the voxel office's live building, as the pixel office's floor plan does it
 * (lib/svg-live.mjs liveItems and pack): one room per project of the desks at work there, the biggest first, rooms
 * packed into floors of `slots` desks in their order, a room too big for one floor carried on to the next. Desks on a
 * break stand in the lobby's café, meetings sit in the lobby's meeting room. With nobody in, the projects worked
 * today keep their rooms with the lights off. Rooms keep their order between two refreshes (`previous`), so nobody
 * changes floor when a desk elsewhere sits down.
 */
export const DESK_SLOTS = 6
export const MAX_FLOORS = 8

const BUSY = new Set(['working', 'thinking', 'waiting'])

export function planLive(snapshot, { slots = DESK_SLOTS, maxFloors = MAX_FLOORS, previous = [] } = {}) {
  const agents = Array.isArray(snapshot?.agents) ? snapshot.agents : []
  const projects = Array.isArray(snapshot?.projects) ? snapshot.projects : []
  const colorOf = name => projects.find(p => p.name === name)?.color ?? '#9ab86a'
  const kitchen = agents.filter(a => a.kind === 'break')
  const meetings = agents.flatMap(a => (a.meetings ?? []).map(meeting => ({ meeting, agent: a })))
  const groups = new Map()
  for (const a of agents) {
    if (a.kind === 'break') continue
    const name = String(a.project || 'Unassigned')
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(a)
  }
  const all = name => agents.filter(a => String(a.project || 'Unassigned') === name)
  const busy = name => all(name).filter(a => BUSY.has(a.kind)).length
  // biggest rooms first (svg-live sorts so), a tie keeps the order of the last refresh, then the busier, then the name
  const was = name => { const i = previous.indexOf(name); return i < 0 ? Infinity : i }
  const order = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length || was(a) - was(b) || busy(b) - busy(a) || a.localeCompare(b))
  // the longest shift on the floor (two desks or more) wears the trophy on its monitor
  const seated = agents.filter(a => a.kind !== 'break' && Number.isFinite(Date.parse(a.startedAt ?? '')))
  const trophy = seated.length > 1 ? seated.reduce((a, b) => Date.parse(b.startedAt) < Date.parse(a.startedAt) ? b : a).id : null

  // Rooms into floors, first fit (a room goes on the first floor with room for it, the biggest first), at the floor
  // width that needs the fewest floors: six desks a floor, seven or eight when that saves a floor.
  function pack(width) {
    const out = []
    let hidden = 0
    for (const name of order) {
      const desks = groups.get(name)
      let start = 0
      while (start < desks.length) {
        const left = desks.length - start
        const take = Math.min(left, width)
        let floor = take < width ? out.find(f => f.used + take <= width) : null
        if (!floor) {
          if (out.length >= maxFloors) { hidden += left; break }
          floor = { rooms: [], used: 0 }; out.push(floor)
        }
        floor.rooms.push({ kind: 'room', project: name, color: colorOf(name), span: take, desks: desks.slice(start, start + take), part: start ? 'continued' : null, all: all(name) })
        floor.used += take
        start += take
      }
    }
    return { floors: out, hidden }
  }
  const candidates = [slots, slots + 1, slots + 2].filter(n => n >= 3 && n <= 9)
  let best = null
  for (const width of candidates) {
    const result = pack(width)
    const empty = result.floors.reduce((n, f) => n + width - f.used, 0)
    const score = result.hidden * 1000 + result.floors.length * 100 + empty * 3 + (width - slots) * 8
    if (!best || score < best.score) best = { ...result, width, score }
  }
  const floors = best?.floors ?? []
  const hidden = best?.hidden ?? 0
  const width = best?.width ?? slots
  if (!agents.length) {
    // nobody in: the projects worked today keep their rooms, lights off (else the three busiest of the range)
    const today = projects.filter(p => (p.days?.at?.(-1) ?? 0) > 0).sort((a, b) => (b.days.at(-1) ?? 0) - (a.days.at(-1) ?? 0))
    const pick = (today.length ? today : projects.slice(0, 3)).slice(0, Math.max(1, Math.floor(slots / 2)))
    if (pick.length) floors.push({ rooms: pick.map(p => ({ kind: 'dark', project: p.name, color: p.color ?? '#9ab86a', span: Math.max(1, Math.floor(slots / pick.length)), desks: [], minutes: p.days?.at?.(-1) ?? 0 })), used: 0 })
  }
  // the spare desk slots of a floor widen its rooms, the biggest first, so a floor is never half a room
  for (const floor of floors) {
    const total = width
    let spare = total - floor.rooms.reduce((n, r) => n + r.span, 0)
    floor.spare = spare
    floor.slots = total
    const byNeed = [...floor.rooms].sort((a, b) => b.span - a.span)
    for (let i = 0; spare > 0 && byNeed.length; i++, spare--) byNeed[i % byNeed.length].span++
    let at = 0
    for (const r of floor.rooms) { r.from = at; r.to = at + r.span; at = r.to }
  }
  return { floors, hidden, slots: width, kitchen, meetings, trophy, order, left: snapshot?.left ?? [], visitors: snapshot?.visitors ?? [] }
}

/**
 * The building's headcount (svg-kit tally, model.mjs deskCounts): working (thinking too), waiting on helpers (and how
 * many of them in a meeting), hands up, errors, stopped, on a break, done (dozing too), interns, meetings.
 */
export function tallyDesks(agents = []) {
  const t = { desks: agents.length, working: 0, waiting: 0, inMeeting: 0, asking: 0, errors: 0, stopped: 0, onBreak: 0, done: 0, interns: 0, meetings: 0 }
  for (const a of agents) {
    const k = a.kind
    if (k === 'working' || k === 'thinking') t.working++
    else if (k === 'waiting') { t.waiting++; if (a.meetings?.length) t.inMeeting++ }
    else if (k === 'asking') t.asking++
    else if (k === 'error') t.errors++
    else if (k === 'stopped') t.stopped++
    else if (k === 'break') t.onBreak++
    else t.done++
    t.interns += a.interns?.length ?? 0
    t.meetings += a.meetings?.length ?? 0
  }
  t.needYou = t.asking + t.errors + t.stopped + agents.filter(a => a.kind === 'done').length
  return t
}

/** Headcount strip order (model.mjs STRIP_ORDER): working → waiting → asking → error → stopped → break → done → dozing. */
export const STRIP_ORDER = { working: 0, thinking: 0, waiting: 1, asking: 2, error: 3, stopped: 4, break: 5, done: 6, dozing: 7 }
export const stripOf = agents => [...agents].sort((a, b) => (STRIP_ORDER[a.kind] ?? 9) - (STRIP_ORDER[b.kind] ?? 9))
