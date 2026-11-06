import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { demoSnapshot } from '../site/voxel/data.js'
import { createKit } from '../site/voxel/kit.js'
import { createActors } from '../site/voxel/actors.js'
import { LOBBY_TOP } from '../site/voxel/building.js'
import {
  buildMonth, calendarCells, calendarPlan, crewOf, dayTip, directoryOf, hm, levelOf, monthDays, monthSignLines, monthStats, monthTitle, sharePct, standOut,
} from '../site/voxel/views/month.js'

const NOW = Date.parse('2026-11-07T15:30:00')
const span = (first, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${first}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10))

test('the page is its days, contiguous, the last 62 at most, and an empty page for garbage', () => {
  assert.deepEqual(monthDays({ period: { days: ['2026-10-03', '2026-10-01', 'nope', '2026-10-01'] } }), ['2026-10-01', '2026-10-02', '2026-10-03'])
  assert.equal(monthDays({ period: { days: span('2026-09-01', 90) } }).length, 62)
  assert.equal(monthDays({ period: { days: span('2026-09-01', 90) } }).at(-1), '2026-11-29')
  assert.deepEqual(monthDays({ period: {}, days: [{ date: '2026-02-30' }], now: { date: '2026-11-07' } }), ['2026-11-07'])
  assert.deepEqual(monthDays({}), [])
  assert.deepEqual(monthDays(null), [])
})

test('the grid runs Monday first, the month before and after it filling its first and last weeks', () => {
  // 1 October 2026 is a Thursday: three squares of September before it; page 0 on 7 November is 38 days, 6 weeks
  const days = span('2026-10-01', 38)
  const grid = calendarCells(days, '2026-11-07')
  assert.equal(grid.lead, 3)
  assert.equal(grid.rows, 6)
  assert.equal(grid.cells.length, 42)
  assert.deepEqual(grid.cells.slice(0, 4).map(c => [c.date, c.d, c.inRange]), [['2026-09-28', 28, false], ['2026-09-29', 29, false], ['2026-09-30', 30, false], ['2026-10-01', 1, true]])
  assert.deepEqual(grid.cells.at(-1), { k: 41, col: 6, row: 5, date: '2026-11-08', d: 8, inRange: false, future: true })
  assert.ok(grid.cells.every(c => c.col === c.k % 7))
  // a February that starts on a Monday is four weeks; a page of 62 days is ten at most; no days, one empty week
  assert.equal(calendarCells(span('2027-02-01', 28), null).rows, 4)
  assert.ok(calendarCells(span('2026-11-01', 61), null).rows <= 10)
  assert.deepEqual(calendarCells([], null).cells.map(c => c.date), Array(7).fill(null))
})

test('a square is shaded in four steps on a square-root scale, the busiest full', () => {
  assert.equal(levelOf(0, 600), 0)
  assert.equal(levelOf(600, 0), 0)
  assert.equal(levelOf(600, 600), 4)
  assert.equal(levelOf(1, 600), 1)
  assert.equal(levelOf(150, 600), 2)
  assert.equal(levelOf(340, 600), 4)
})

test('the month in numbers: its busiest day, days worked, the longest streak and weekends', () => {
  const minutes = { '2026-10-01': 60, '2026-10-02': 0, '2026-10-03': 120, '2026-10-04': 30, '2026-10-05': 10 }
  const st = monthStats(Object.keys(minutes), d => minutes[d])
  assert.deepEqual(st, { max: 120, best: '2026-10-03', active: 4, streak: 3, weekend: 150, total: 220, traced: 0 })
  const line = standOut(Object.keys(minutes), st, {})
  assert.deepEqual(line.map(s => s[0]), ['busiest day Sat 3 Oct · 2.0h agent-time', 'worked 4 of 5 days', 'longest streak 3 days', '55m a day worked', 'weekends 2.5h'])
  assert.equal(standOut(['2026-10-01'], monthStats(['2026-10-01'], () => 0), { past: true })[0][0], 'no agent-time that month')
  assert.equal(standOut([], monthStats([], () => 0))[0][0], 'no days to show')
})

test('the page is titled by its month, or its two months', () => {
  assert.equal(monthTitle(span('2026-09-01', 30)), 'SEPTEMBER 2026')
  assert.equal(monthTitle(span('2026-10-01', 38)), 'OCTOBER – NOVEMBER 2026')
  assert.equal(monthTitle(span('2025-12-01', 40)), 'DEC 2025 – JAN 2026')
  assert.equal(monthTitle([]), 'THE MONTH')
})

test('the calendar fits a six-week page in a storey that shows whole, a ten-week one in shorter squares', () => {
  const six = calendarPlan(6), ten = calendarPlan(10), four = calendarPlan(4)
  assert.ok(six.calH < 7.5, `${six.calH}`)
  assert.ok(ten.ch >= .64 && ten.ch < six.ch)
  assert.ok(four.ch <= .84)
  // a date (5 pixels) and an agent-time fit in a square, with room around them
  for (const p of [four, six, ten]) assert.ok(5 * p.q + p.timeSize + .04 + .2 <= p.ch, JSON.stringify(p))
})

test('words: agent-time, a square tooltip, a share', () => {
  assert.equal(hm(45), '45m')
  assert.equal(hm(380), '6h20')
  assert.equal(hm(720), '12h')
  assert.equal(hm(-3), '0m')
  assert.equal(dayTip('2026-10-14', { minutes: 380, commits: 12, sessions: 3 }, { best: true }), 'Wed 14 Oct · 6h20 agent-time · 3 sessions · 12 commits · busiest day')
  assert.equal(dayTip('2026-11-07', {}, { today: '2026-11-07' }), 'Sat 7 Nov (today) · no agent-time')
  assert.equal(dayTip('2026-10-02', { commits: 2 }, { traced: true }), 'Fri 2 Oct · sessions or commits, no agent-time on record · 2 commits')
  assert.equal(sharePct(.234, 10), '23%')
  assert.equal(sharePct(.001, 10), '<1%')
  assert.equal(sharePct(0, 0), '0%')
})

test('the sign says the month: agent-time and sessions, then interns, meetings and commits', () => {
  const s = demoSnapshot({ view: 'month', now: NOW })
  const lines = monthSignLines(s)
  assert.equal(lines.length, 2)
  assert.match(lines[0][0][0], /^\d+h agent-time$/)
  assert.deepEqual(lines[1].map(span => span[0].split(' ')[1]), ['interns', 'meetings', 'commits'])
  assert.deepEqual(monthSignLines({ totals: {}, period: { past: true } }).flat().map(span => span[0]), ['0h agent-time', 'a quiet month'])
})

test('the crew is every AI that worked, busiest first, its shares summing to the whole', () => {
  const s = demoSnapshot({ view: 'month', now: NOW })
  const crew = crewOf(s)
  assert.equal(crew.length, 6)
  assert.ok(crew.every((c, i) => !i || crew[i - 1].minutes >= c.minutes))
  assert.ok(Math.abs(crew.reduce((sum, c) => sum + c.share, 0) - 1) < 1e-9)
  // an AI only at a desk now, without time this month, gets no badge; sessions not counted stay null
  assert.deepEqual(crewOf({ crew: [{ agent: 'codex', minutes: 0, sessions: null, live: 2 }, { agent: 'grok', minutes: 30, sessions: null }] }), [{ agent: 'grok', minutes: 30, sessions: null, share: 1 }])
})

test('the directory lists the busiest ten, the rest on its last line', () => {
  const projects = Array.from({ length: 13 }, (_, i) => ({ name: `p${i}`, minutes: i * 10, commits: i }))
  const dir = directoryOf({ projects, projectsMore: 2, totals: { minutes: 9999 } })
  assert.deepEqual(dir.list.map(p => p.name), ['p12', 'p11', 'p10', 'p9', 'p8', 'p7', 'p6', 'p5', 'p4', 'p3'])
  assert.equal(dir.more, 5)
  assert.equal(dir.tenants, 15)
  assert.equal(dir.rest, 30 + (9999 - 780))
  assert.deepEqual(directoryOf({}), { list: [], more: 0, rest: 0, tenants: 0 })
})

// ---------------------------------------------------------------- the building, built headless
function fakeContext() {
  const kit = createKit({ THREE, renderer: {} })
  const made = []
  const labels = {
    label(spec) { made.push(spec); const g = new THREE.Group(); g.userData.size = [spec.width ?? 1, spec.height ?? .3]; return g },
    measure: (text, size) => String(text).length * size * .6,
    release() {},
  }
  const actors = createActors({ THREE, kit })
  return {
    made, kit,
    ctx: {
      THREE, kit, labels, actors, building: { bulbMaterial: new THREE.MeshStandardMaterial() }, lobby: {}, windowMaterial: null,
      colliderGeometry: new THREE.BoxGeometry(1, 1, 1), colliderMaterial: new THREE.MeshBasicMaterial({ visible: false }), lights: [], nowMs: NOW, night: true,
    },
  }
}

test('the month builds three storeys over the lobby, within its light and label budgets, on every kind of page', () => {
  const s0 = demoSnapshot({ view: 'month', now: NOW })
  const pages = {
    now: s0,
    past: demoSnapshot({ view: 'month', back: 1, now: NOW }),
    long: { ...s0, period: { ...s0.period, days: span('2026-11-01', 61) }, days: span('2026-11-01', 61).map((date, i) => ({ date, minutes: i % 5 ? 30 * i : 0, commits: i % 3 })), now: { ...s0.now, date: '2026-12-31' } },
    empty: { view: 'month', projects: [], agents: [], crew: [], totals: {}, days: span('2026-10-01', 31).map(date => ({ date, minutes: 0 })), period: { days: span('2026-10-01', 31), back: 2, past: true }, now: { date: '2026-11-07' } },
    garbage: { view: 'month' },
  }
  for (const [name, snapshot] of Object.entries(pages)) {
    const { ctx, made } = fakeContext()
    const built = buildMonth(ctx, snapshot, { previous: [], quiet: false })
    assert.equal(built.storeys.length, 3, name)
    let base = LOBBY_TOP
    for (const [i, storey] of built.storeys.entries()) {
      assert.equal(storey.base, base, `${name} storey ${i}`)
      assert.equal(storey.number, i + 2)
      assert.ok(storey.group.parent === built.group)
      base += storey.height
    }
    assert.ok(ctx.lights.length <= 2, `${name}: ${ctx.lights.length} lights`)
    assert.ok(ctx.lights.every(l => l.userData.nightIntensity > 0))
    assert.ok(made.length < 150, `${name}: ${made.length} labels`)
    assert.equal(built.status, null)
    assert.ok(built.sign.length >= 1 && built.sign.every(line => line.every(span => typeof span[0] === 'string' && span[0])))
    assert.ok(built.pickables.every(p => typeof p.userData.text === 'string' && p.userData.text.length > 0), name)
    assert.equal(typeof built.update, 'function')
    built.update(1.5, .016)
    built.update(7.25, .016)
  }
  // page 0: a square per day of the page to hover, the busiest project framed, its rows on the directory
  const { ctx } = fakeContext()
  const built = buildMonth(ctx, s0, {})
  const days = built.pickables.filter(p => p.userData.day)
  assert.equal(days.length, 38)
  assert.match(days.find(p => p.userData.day === '2026-11-07').userData.text, /\(today\)/)
  const projects = built.pickables.filter(p => p.userData.project)
  assert.deepEqual(projects.slice(1).map(p => p.userData.project), [...s0.projects].sort((a, b) => b.minutes - a.minutes).map(p => p.name))
  assert.match(projects[0].userData.text, /^employee of the month: little-studio/)
})
