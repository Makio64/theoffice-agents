import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoSnapshot, VIEWS } from '../site/voxel/data.js'
import { glowLevel, glowSteps } from '../site/voxel/views/week.js'
import { lapseClock, lapseSeats } from '../site/voxel/views/timelapse.js'
import { VIEW_BUILDERS } from '../site/voxel/views/index.js'

const sum = values => values.reduce((a, b) => a + b, 0)
const NOW = Date.parse('2026-11-07T15:30:00')

test('the voxel office has the pixel office tabs, each with a builder and its key', () => {
  assert.deepEqual(VIEWS.map(v => v.id), ['live', 'today', 'week', 'month', 'work', 'timelapse'])
  assert.deepEqual(VIEWS.map(v => v.key), ['1', '2', '3', '4', '5', '6'])
  for (const v of VIEWS) assert.equal(typeof VIEW_BUILDERS[v.id], 'function', v.id)
})

test('every page of the sample keeps its days, its projects and its totals in step', () => {
  for (const [view, back, days] of [['today', 0, 1], ['today', 4, 1], ['week', 0, 7], ['week', 2, 7], ['work', 1, 7], ['month', 0, 38], ['month', 1, 31]]) {
    const s = demoSnapshot({ view, back, now: NOW })
    assert.equal(s.view, view)
    assert.equal(s.period.back, back)
    assert.equal(s.period.days.length, days, `${view} ${back}`)
    assert.equal(s.days.length, days)
    assert.equal(s.period.past, back > 0)
    for (const p of s.projects) {
      assert.equal(p.days.length, days, p.name)
      assert.equal(sum(p.days), p.minutes, p.name)
      assert.equal(p.hourly.length, 24)
    }
    assert.equal(sum(s.projects.map(p => p.minutes)), s.totals.minutes)
    assert.equal(sum(s.days.map(d => d.minutes)), s.totals.minutes)
    assert.ok(s.agents.length === 20, 'the live floor is always the same twenty desks')
  }
  // the month as it runs now: last month and this one so far
  const month = demoSnapshot({ view: 'month', now: NOW })
  assert.equal(month.period.days[0], '2026-10-01')
  assert.equal(month.period.days.at(-1), '2026-11-07')
  // a day as it runs now has no hours after now
  const today = demoSnapshot({ view: 'today', now: NOW })
  for (const p of today.projects) assert.ok(p.hourly.slice(16).every(v => v === 0), p.name)
})

test('the sample desks cover every class the pixel office draws, with its words', () => {
  const s = demoSnapshot({ now: NOW })
  const kinds = new Set(s.agents.map(a => a.kind))
  for (const kind of ['working', 'thinking', 'waiting', 'asking', 'error', 'break', 'done', 'dozing']) assert.ok(kinds.has(kind), kind)
  for (const a of s.agents) {
    assert.equal(typeof a.words, 'string')
    assert.ok(a.words.length)
    if (a.kind === 'working') assert.equal(a.clock.fine, true)
  }
  assert.equal(s.agents.find(a => a.kind === 'waiting').words, 'in a meeting')
})

test('a sample replay keeps every run inside its slots, and the seats never hold two sessions at once', () => {
  for (const range of ['yesterday', 'week', 'month']) {
    const s = demoSnapshot({ view: 'timelapse', range, now: NOW })
    const t = s.timeline
    assert.equal(t.kind, range)
    assert.equal(t.slotMinutes, { yesterday: 15, week: 60, month: 240 }[range])
    for (const desk of t.desks) for (const [from, to] of desk.runs) assert.ok(from >= 0 && to <= t.slots && from < to)
    const { rooms, lanes } = lapseSeats(t)
    assert.equal(lanes.sessions.length, t.slots)
    assert.equal(sum(lanes.commits), sum(t.commits.map(c => c.n)))
    for (const room of rooms) {
      assert.ok(room.seats.length <= 5)
      for (const seat of room.seats) seat.forEach((run, i) => { if (i) assert.ok(seat[i - 1].to <= run.from) })
    }
  }
})

test('the replay clock names its slot as the pixel replay does', () => {
  const week = { kind: 'week', days: ['2026-11-01', '2026-11-02'], slotMinutes: 60, start: 0 }
  assert.deepEqual(lapseClock(week, 0), { date: '2026-11-01', hour: 0, label: 'Sun 00:00' })
  assert.equal(lapseClock(week, 33).label, 'Mon 09:00')
  assert.equal(lapseClock({ ...week, start: 2 }, 0).label, 'Sun 02:00')
  assert.equal(lapseClock({ kind: 'month', days: ['2026-10-27'], slotMinutes: 240 }, 4).label, 'Tue 27 16:00')
  assert.equal(lapseClock({ kind: 'yesterday', days: ['2026-11-06'], slotMinutes: 15 }, 37).label, 'Fri 09:15')
  assert.equal(lapseClock(week, 999).label, 'Mon 23:00', 'a slot past the range is its last')
})

test('the week tower lights a window in four steps of the busiest window, as the pixel tower does', () => {
  assert.equal(glowLevel(0, 600), 0)
  assert.equal(glowLevel(1, 600), 1)
  assert.equal(glowLevel(600 / 16, 600), 1)
  assert.equal(glowLevel(600 / 16 + 1, 600), 2)
  assert.equal(glowLevel(600, 600), 4)
  assert.equal(glowLevel(900, 600), 4)
  assert.deepEqual(glowSteps(1600), [100, 400, 900, 1600])
})

test('B1 seats the five busiest departments as wide as their share, the rest folded into one room', async () => {
  const { basementRooms } = await import('../site/voxel/views/basement.js')
  const work = [['terminal', 390], ['coding', 140], ['reading', 130], ['planning', 60], ['tools', 100], ['web', 50], ['testing', 50], ['delegating', 30], ['talking', 20], ['design', 20]].map(([kind, calls]) => ({ kind, calls }))
  const { rooms, total } = basementRooms(work)
  assert.equal(total, 990)
  assert.deepEqual(rooms.map(r => r.name), ['server room', 'typing pool', 'library', 'gadget shop', 'whiteboard', '+5 more'])
  assert.deepEqual(rooms.map(r => r.share), ['39%', '14%', '13%', '10%', '6%', '17%'])
  assert.ok(Math.abs(rooms.reduce((n, r) => n + r.w, 0) - 16.4) < 1e-9)
  rooms.forEach((r, i) => { assert.ok(r.w >= 2.5 - 1e-9); if (i) assert.ok(Math.abs(r.x0 - rooms[i - 1].x1) < 1e-9) })
  assert.ok(rooms[0].w > rooms[1].w, 'the busiest department is the widest')
  assert.deepEqual(basementRooms([]).rooms, [])
  assert.deepEqual(basementRooms([{ kind: 'coding', calls: 0 }]).rooms, [])
})
