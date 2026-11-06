import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoSnapshot } from '../site/voxel/data.js'
import {
  CITY_STOREY, CLOCK_STOREY, barShare, busiestAgent, clockLine, clockWords, dateWords, hourSpan, nightHour, sheetLayout, todayModel, todaySignLines,
} from '../site/voxel/views/today.js'

const sum = values => values.reduce((a, b) => a + b, 0)
const AFTERNOON = Date.parse('2026-11-07T15:40:00')
const zeros = () => Array(24).fill(0)

test('today as it runs: the hour now, the hours still to come empty, a line per project busiest first', () => {
  const s = demoSnapshot({ view: 'today', now: AFTERNOON })
  const m = todayModel(s)
  assert.equal(m.present, true)
  assert.equal(m.nowH, 15)
  assert.equal(m.hhmm, '15:40')
  assert.equal(m.mm, 40)
  assert.equal(m.ymd, '2026-11-07')
  assert.ok(m.shown.slice(16).every(v => v === 0))
  assert.equal(m.total, sum(s.hourly))
  assert.equal(m.shown[m.best], Math.max(...m.shown))
  assert.equal(m.nightMin, sum(m.shown.filter((_, h) => h < 7 || h >= 20)))
  assert.deepEqual(m.rows.map(r => r.name), [...s.projects].sort((a, b) => b.minutes - a.minutes).map(p => p.name))
  assert.equal(m.star.name, m.rows[0].name)
  // the desks open now, each on its project's line
  assert.equal(m.desks.length, s.agents.length)
  assert.equal(sum(m.rows.map(r => r.desks.length)), s.agents.length)
  for (const r of m.rows) for (const d of r.desks) assert.equal(d.project, r.name)
})

test('a page of the past: its own day, no hour now, no desks, every hour of it', () => {
  const s = demoSnapshot({ view: 'today', back: 2, now: AFTERNOON })
  const m = todayModel(s)
  assert.equal(m.present, false)
  assert.equal(m.nowH, null)
  assert.equal(m.ymd, '2026-11-05')
  assert.deepEqual(m.desks, [])
  assert.ok(m.rows.every(r => r.desks.length === 0))
  assert.deepEqual(m.shown, s.hourly)
  assert.deepEqual(clockWords(m), [[`first in ${String(m.first).padStart(2, '0')}:00`, clockWords(m)[0][1]], [`last out ${String(m.last + 1).padStart(2, '0')}:00`, clockWords(m)[1][1]]])
  assert.match(clockLine(m)[0][0], /^busiest hour \d\d:00–\d\d:00$/)
})

test('an empty day: no lines, no busiest hour, the sheet and the clock say so', () => {
  const s = { ...demoSnapshot({ view: 'today', now: AFTERNOON }), projects: [], hourly: zeros(), agents: [], totals: {} }
  const m = todayModel(s)
  assert.deepEqual(m.rows, [])
  assert.equal(m.best, -1)
  assert.equal(m.star, null)
  assert.deepEqual(clockLine(m), [['no agent-time yet today', clockLine(m)[0][1]]])
  assert.equal(clockWords(m)[0][0], 'nobody clocked in yet')
  const past = todayModel({ ...s, period: { ...s.period, back: 1, past: true, days: ['2026-11-06'] } })
  assert.equal(clockLine(past)[0][0], 'no agent-time that day')
  assert.deepEqual(clockWords(past), [['nobody clocked in', clockWords(past)[0][1]]])
  // the sign keeps its two lines on a day of zeros
  assert.deepEqual(todaySignLines(s).map(line => line.map(span => span[0])), [['0m agent-time', '0 sessions'], ['0 interns', '0 meetings', '0 commits']])
})

test('partial facts never throw: no period, no hours, odd times', () => {
  const m = todayModel({})
  assert.equal(m.present, true)
  assert.equal(m.nowH, null)
  assert.equal(m.hhmm, '')
  assert.deepEqual(m.shown, zeros())
  const odd = todayModel({ now: { hour: 31, time: 'late' }, hourly: [1, 'x', -4, null], projects: [{ name: 'a', hourly: [5], minutes: 0 }, { name: 'b' }] })
  assert.equal(odd.nowH, null)
  assert.deepEqual(odd.perHour.slice(0, 4), [1, 0, 0, 0])
  assert.deepEqual(odd.rows.map(r => [r.name, r.am]), [['a', 5]])
})

test('more projects than the sheet holds are counted with their agent-time', () => {
  const s = demoSnapshot({ view: 'today', back: 1, now: AFTERNOON })
  const extra = Array.from({ length: 5 }, (_, i) => ({ name: `extra-${i}`, color: '#9ab86a', minutes: 3 + i, commits: 0, sessions: 1, hourly: zeros() }))
  const m = todayModel({ ...s, projects: [...s.projects, ...extra], projectsMore: 2 })
  assert.equal(m.shownRows.length, 8)
  assert.equal(m.more, m.rows.length - 8 + 2)
  assert.equal(m.moreMinutes, sum(m.rows.slice(8).map(r => r.am)))
})

test('the sign follows the pixel sign: agent-time and sessions, then interns, meetings and commits', () => {
  const lines = todaySignLines({ totals: { minutes: 125, sessions: 1, subagents: 3, workflows: 1, commits: 12 } })
  assert.deepEqual(lines.map(line => line.map(span => span[0])), [['2h05 agent-time', '1 session'], ['3 interns', '1 meeting', '12 commits']])
})

test('the sheet fits the storey: its columns inside the paper, its cells wider without the desks column', () => {
  for (const present of [true, false]) {
    for (const rows of [0, 1, 5, 8]) {
      const L = sheetLayout({ present, rows })
      assert.ok(L.X0 >= -7.5 && L.XR <= 7.5)
      assert.ok(Math.abs(L.pitch * 24 - L.cellsW) < 1e-9)
      assert.ok(L.HX + L.cellsW < L.AX - 1, 'the agent-time column keeps its room')
      assert.ok(L.AX < L.XR - .8, 'the commits column keeps its room')
      assert.ok(L.totalTop < L.ruleY && L.ruleY < L.rowsBottom && L.rowsTop < L.headBottom && L.headTop < L.paperTop && L.paperTop < L.boardTop && L.boardTop < L.height)
      assert.ok(Math.abs(L.rowsTop - L.rowsBottom - Math.max(1, rows) * L.RH) < 1e-9)
    }
  }
  assert.ok(sheetLayout({ present: false }).pitch > sheetLayout({ present: true }).pitch)
  assert.ok(sheetLayout({ rows: 8 }).height > sheetLayout({ rows: 2 }).height)
  assert.ok(CLOCK_STOREY > 3 && CITY_STOREY > 3)
})

test('a bar stands as tall as its hour on a square-root scale, a quiet hour still showing', () => {
  assert.equal(barShare(0, 60), 0)
  assert.equal(barShare(60, 60), 1)
  assert.equal(barShare(15, 60), .5)
  assert.ok(barShare(1, 600) >= .14)
  assert.ok(barShare(10, 60) < barShare(20, 60))
  assert.equal(barShare(5, 0), 0)
})

test('hours and dates in the sheet\'s words', () => {
  assert.equal(hourSpan(9), '09:00–10:00')
  assert.equal(hourSpan(23), '23:00–00:00')
  assert.deepEqual([0, 6, 7, 19, 20, 23].map(nightHour), [true, true, false, false, true, true])
  assert.deepEqual(dateWords('2026-11-07'), { title: 'SATURDAY 7 NOVEMBER 2026', month: 10, day: '7', weekday: 'SATURDAY' })
  assert.equal(dateWords('nope').title, '')
  assert.equal(busiestAgent({ crew: [{ agent: 'codex', minutes: 3 }, { agent: 'gemini', minutes: 9 }] }), 'gemini')
  assert.equal(busiestAgent({ crew: [], desks: [] }), 'claude')
})
