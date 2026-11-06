import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planLive, tallyDesks, stripOf } from '../site/voxel/office-layout.js'
import { deskWords, tagTime, statusOfKind, NEEDY, YOURS } from '../plugin/lib/voxel-model.mjs'
import { fitLines } from '../site/voxel/labels.js'

const desk = (id, project, kind = 'working', extra = {}) => ({ id, project, kind, agent: 'claude', interns: [], meetings: [], ...extra })
const sum = values => values.reduce((a, b) => a + b, 0)

test('the live floor plan gives each project one room as wide as its desks, the biggest first, never splitting a floor badly', () => {
  const agents = [desk('a1', 'alpha'), desk('a2', 'alpha'), desk('a3', 'alpha'), desk('b1', 'beta'), desk('c1', 'gamma'), desk('c2', 'gamma')]
  const plan = planLive({ agents, projects: [{ name: 'alpha', color: '#111111' }] })
  const rooms = plan.floors.flatMap(floor => floor.rooms)
  assert.deepEqual(rooms.map(room => room.project), ['alpha', 'gamma', 'beta'])
  assert.equal(rooms[0].color, '#111111')
  for (const floor of plan.floors) {
    // the spare slots widen the rooms: a floor is always whole, its rooms side by side
    assert.equal(floor.rooms.at(-1).to, plan.slots)
    floor.rooms.forEach((room, i) => assert.equal(room.from, i ? floor.rooms[i - 1].to : 0))
    for (const room of floor.rooms) assert.ok(room.span >= room.desks.length)
  }
  assert.equal(sum(rooms.map(room => room.desks.length)), agents.length)
  assert.equal(plan.hidden, 0)
})

test('desks on a break go to the café, meetings to the meeting room, the longest shift gets the trophy', () => {
  const agents = [
    desk('a', 'alpha', 'working', { startedAt: '2026-11-01T10:00:00Z' }),
    desk('b', 'alpha', 'break', { startedAt: '2026-11-01T08:00:00Z' }),
    desk('c', 'beta', 'waiting', { startedAt: '2026-11-01T09:00:00Z', meetings: [{ name: 'review', running: 3 }] }),
  ]
  const plan = planLive({ agents, projects: [] })
  assert.deepEqual(plan.kitchen.map(a => a.id), ['b'])
  assert.deepEqual(plan.meetings.map(m => [m.agent.id, m.meeting.name]), [['c', 'review']])
  assert.ok(!plan.floors.flatMap(f => f.rooms).flatMap(r => r.desks).some(a => a.id === 'b'), 'a desk on a break is not drawn at its desk')
  assert.equal(plan.trophy, 'c', 'the trophy goes to the longest shift of the desks seated')
})

test('a project bigger than a floor carries on to the next, and the floor width that saves a floor wins', () => {
  const big = Array.from({ length: 9 }, (_, i) => desk(`a${i}`, 'alpha'))
  const plan = planLive({ agents: big, projects: [] })
  const rooms = plan.floors.flatMap(floor => floor.rooms)
  assert.equal(rooms[0].part, null)
  assert.equal(rooms.at(-1).part, 'continued')
  assert.equal(sum(rooms.map(room => room.desks.length)), 9)
  // 7 desks of 3 projects fit one floor of 7 rather than two floors of 6
  const seven = [...Array.from({ length: 3 }, (_, i) => desk(`x${i}`, 'x')), ...Array.from({ length: 2 }, (_, i) => desk(`y${i}`, 'y')), ...Array.from({ length: 2 }, (_, i) => desk(`z${i}`, 'z'))]
  const tight = planLive({ agents: seven, projects: [] })
  assert.equal(tight.floors.length, 1)
  assert.equal(tight.slots, 7)
})

test('more desks than the floors can seat are counted, not drawn, and rooms keep their order between refreshes', () => {
  const crowd = Array.from({ length: 60 }, (_, i) => desk(`d${i}`, `p${i % 12}`))
  const plan = planLive({ agents: crowd, projects: [] }, { maxFloors: 2 })
  assert.ok(plan.floors.length <= 2)
  assert.equal(sum(plan.floors.flatMap(f => f.rooms).map(r => r.desks.length)) + plan.hidden, 60)
  const first = planLive({ agents: [desk('a', 'one'), desk('b', 'two')], projects: [] })
  const again = planLive({ agents: [desk('b', 'two'), desk('a', 'one')], projects: [] }, { previous: first.order })
  assert.deepEqual(again.order, first.order, 'two rooms of one desk each keep the order they had')
})

test('an empty office keeps the projects worked today as dark rooms', () => {
  const plan = planLive({ agents: [], projects: [{ name: 'quiet', color: '#222222', days: [0, 0, 30] }, { name: 'idle', days: [5, 0, 0] }] })
  const rooms = plan.floors.flatMap(f => f.rooms)
  assert.deepEqual(rooms.map(r => [r.kind, r.project, r.minutes]), [['dark', 'quiet', 30]])
  assert.deepEqual(planLive({ agents: [], projects: [] }).floors, [])
})

test('the headcount tallies every class as the pixel office counts it, what needs you included', () => {
  const kinds = ['working', 'thinking', 'waiting', 'asking', 'error', 'stopped', 'break', 'done', 'dozing']
  const agents = kinds.map((kind, i) => desk(`k${i}`, 'p', kind, kind === 'waiting' ? { meetings: [{ name: 'm' }], interns: [{}, {}] } : {}))
  const t = tallyDesks(agents)
  assert.deepEqual([t.desks, t.working, t.waiting, t.inMeeting, t.asking, t.errors, t.stopped, t.onBreak, t.done, t.interns, t.meetings], [9, 2, 1, 1, 1, 1, 1, 1, 2, 2, 1])
  assert.equal(t.needYou, 4, 'a hand up, an error, a stop and a turn done wait on you')
  assert.deepEqual(stripOf(agents).map(a => a.kind), ['working', 'thinking', 'waiting', 'asking', 'error', 'stopped', 'break', 'done', 'dozing'])
})

test('desk words say what the pixel office tags say, with the time in its steps', () => {
  const now = Date.parse('2026-11-05T12:00:00Z')
  const ago = minutes => new Date(now - minutes * 60e3).toISOString()
  assert.deepEqual(deskWords('working', { label: 'cape.js', tool: 'Edit', activityKind: 'coding', startedAt: ago(95) }), { doing: 'edit cape.js', words: 'coding', clock: { from: ago(95), fine: true } })
  assert.equal(deskWords('asking', { label: 'Which cape anchor?' }).words, 'asks: Which cape anchor?')
  assert.equal(deskWords('waiting', { meetings: [{ name: 'review' }] }).words, 'in a meeting')
  assert.equal(deskWords('waiting', { interns: [{}, {}, {}] }).words, '3 interns')
  assert.equal(deskWords('done', { since: ago(12) }).words, 'your turn')
  assert.equal(deskWords('error', { label: 'usage limit', idleReason: 'error' }).doing, 'error: usage limit')
  assert.equal(deskWords('break', {}).clock, null)
  assert.equal(tagTime({ from: ago(5), fine: true }, now), '<20m')
  assert.equal(tagTime({ from: ago(95), fine: true }, now), '1h30+')
  assert.equal(tagTime({ from: ago(700), fine: true }, now), '11h+')
  assert.equal(tagTime({ from: ago(95), fine: false }, now), '1h+')
  assert.equal(tagTime({ from: ago(3000), fine: true }, now), '2d+')
  assert.equal(tagTime(null, now), '')
  assert.deepEqual(['asking', 'done', 'thinking', 'waiting', 'dozing', 'error'].map(statusOfKind), ['waiting', 'done', 'working', 'working', 'idle', 'idle'])
  assert.ok(NEEDY.has('stopped') && !NEEDY.has('done') && YOURS.has('done'))
})

test('a label line too long for its width keeps its first words and ends in an ellipsis', () => {
  const measure = text => text.length * .1
  const [line] = fitLines([{ spans: [['Webhook retry review', '#fff'], ['in a meeting', '#ccc']], fontFor: () => '' }], 1.6, measure)
  assert.equal(line.spans[0].text, 'Webhook retry review'.slice(0, 15) + '…')
  assert.equal(line.spans.length, 1)
  const [fits] = fitLines([{ spans: [['short', '#fff'], ['also', '#ccc']], fontFor: () => '' }], 5, measure)
  assert.deepEqual(fits.spans.map(span => span.text), ['short', 'also'])
})
