import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three/webgpu'
import { demoSnapshot } from '../site/voxel/data.js'
import { createKit } from '../site/voxel/kit.js'
import { createActors } from '../site/voxel/actors.js'
import { LOBBY_TOP } from '../site/voxel/building.js'
import { workRooms } from '../plugin/lib/svg-work.mjs'
import {
  CLAWD_UNITS, buildWork, crewPicker, internJobs, pageWord, planWork, roomTip, workActivity, workDepartments, workSign, workUnit,
} from '../site/voxel/views/work.js'

const NOW = Date.parse('2026-11-07T15:30:00')
const SAMPLE = { terminal: 20103, coding: 6912, reading: 6438, tools: 5300, planning: 3200, web: 2700, testing: 2600, delegating: 1500, talking: 1100, design: 1100 }
const page = (activity, extra = {}) => ({ work: Object.entries(activity).map(([kind, calls]) => ({ kind, calls })), period: { label: 'Mon 26 Oct → Sun 1 Nov', kind: 'week', back: 0 }, ...extra })

test('the departments seat as the pixel office does: same order, shares and agents per unit', () => {
  for (const activity of [SAMPLE, { terminal: 9000, coding: 1000 }, { web: 3 }, {}, { reading: 1, planning: 999 }]) {
    for (const unit of [5, 10]) {
      const voxel = workDepartments(page(activity), unit).rooms
      const pixel = workRooms({ totals: { activity } }, unit).rooms
      assert.deepEqual(voxel.map(r => [r.k, r.share, r.n, r.base]), pixel.map(r => [r.k, r.share, r.n, r.base]), JSON.stringify(activity))
    }
  }
  assert.deepEqual(workActivity({ work: [{ kind: 'coding', calls: 3 }, { kind: 'coding', calls: '2' }, { kind: 'web', calls: -4 }, null, { calls: 9 }] }), { coding: 5, web: 0 })
  assert.deepEqual(workActivity(null), {})
})

test('one agent stands for the finest unit whose busiest room fits across the building', () => {
  assert.equal(workUnit(page(SAMPLE)), 5)
  assert.equal(workUnit(page({ terminal: 9000, coding: 1000 })), 10)
  assert.equal(workUnit(page({ web: 1 })), 10)
  assert.equal(workUnit(page({})), CLAWD_UNITS[0])
  assert.equal(workUnit(page({ terminal: 9000, coding: 1000 }), 6), 25)
})

test('the rooms pack into rows across the building: busiest on top, none overlapping, the bars on one scale', () => {
  const cases = { sample: page(SAMPLE), demo: demoSnapshot({ view: 'work', now: NOW }), two: page({ terminal: 9000, coding: 1000 }), one: page({ web: 3 }), even: page(Object.fromEntries(Object.keys(SAMPLE).map(k => [k, 100]))), empty: page({}), garbage: {} }
  for (const [name, snapshot] of Object.entries(cases)) {
    const plan = planWork(snapshot)
    const placed = plan.rows.flatMap(row => row.rooms)
    assert.equal(placed.length, 10, name)
    assert.deepEqual(new Set(placed.map(r => r.k)).size, 10, name)
    for (const row of plan.rows) {
      let x = -8
      for (const r of row.rooms) {
        assert.ok(r.x0 >= x - 1e-9 && r.x1 > r.x0 && r.x1 <= 8 + 1e-9, `${name}: ${r.name} ${r.x0}…${r.x1}`)
        assert.ok(r.x1 - r.x0 >= r.minW - 1e-6, `${name}: ${r.name} narrower than it needs`)
        x = r.x1
      }
      if (row.hall) assert.ok(row.hall.x0 >= x && row.hall.x1 - row.hall.x0 >= 1 && Math.abs(row.hall.x1 - 8) < 1e-9, name)
    }
    if (plan.total) {
      // the top row holds the busiest rooms, each as wide as its stations
      assert.equal(plan.rows[0].tier, 1, name)
      assert.equal(plan.rows[0].rooms[0], plan.rooms[0], name)
      const lit = plan.rooms.filter(r => r.v)
      const scale = lit.map(r => r.bar / r.v)
      for (const r of lit) assert.ok(r.bar >= .08 && r.bar <= r.x1 - r.x0, `${name}: ${r.name} bar ${r.bar}`)
      const free = lit.filter(r => r.bar > .08 + 1e-9)
      assert.ok(free.every(r => Math.abs(r.bar / r.v - scale[0]) < 1e-9 || r.bar === r.x1 - r.x0 - .6), `${name}: one scale`)
    } else {
      assert.ok(plan.rows.every(row => row.tier === 2), name)
      assert.ok(plan.rooms.every(r => r.bar === 0 && r.n === 0 && !r.lit), name)
    }
  }
  // the pixel office's sample: the server room and the typing pool on top, a hallway left at the end of the last row
  const sample = planWork(page(SAMPLE))
  assert.deepEqual(sample.rows[0].rooms.map(r => r.name), ['server room', 'typing pool'])
  assert.equal(sample.rows.length, 3)
  assert.ok(sample.rows.at(-1).hall)
  assert.equal(sample.rooms[0].n, 8)
})

test('the sign says the page and what an agent stands for, or that every department is closed', () => {
  const plan = planWork(page(SAMPLE))
  assert.deepEqual(workSign(page(SAMPLE), plan, 'Clawd').map(line => line.map(span => span[0])), [['Mon 26 Oct → Sun 1 Nov'], ['bars to one scale', '1 Clawd = up to 5% of the calls']])
  assert.deepEqual(workSign(page({}), planWork(page({})))[1].map(span => span[0]), ['no tool calls in this range yet', 'every department is closed'])
  const past = page({}, { period: { label: 'Mon 19 Oct → Sun 25 Oct', kind: 'week', back: 2, past: true } })
  assert.deepEqual(workSign(past, planWork(past))[1].map(span => span[0]), ['no tool calls that week', 'every department is closed'])
  assert.equal(workSign({}, planWork({}))[0][0][0], 'what they did')
  assert.equal(pageWord({ period: { kind: 'week', back: 0 } }), 'this week')
  assert.equal(pageWord({ period: { kind: 'month', back: 1 } }), 'that month')
})

test('the cast is mixed by agent-time, the interns by job, the tooltips say it in words', () => {
  const mixed = crewPicker([{ agent: 'claude', minutes: 80 }, { agent: 'codex', minutes: 20 }])
  const seats = Array.from({ length: 20 }, (_, i) => mixed(i))
  assert.equal(seats.filter(a => a === 'codex').length, 4)
  assert.equal(crewPicker([{ agent: 'claude', minutes: 100 }])(7), 'claude')
  assert.equal(crewPicker([{ agent: 'gemini', minutes: null, sessions: 3 }])(0), 'gemini')
  assert.equal(crewPicker(null)(3), 'claude')
  assert.deepEqual(internJobs({ interns: [{ job: 'generalist', n: 79 }, { job: 'consultant', n: 559 }, { job: 'researcher', n: 0 }, { n: 2 }] }), [{ title: 'consultant', n: 559 }, { title: 'generalist', n: 79 }, { title: 'specialist', n: 2 }])
  const plan = planWork({ ...page(SAMPLE), projects: [{ name: 'little-studio', color: '#9ab86a', work: [{ kind: 'terminal', calls: 1200 }] }, { name: 'docs-kit', color: '#6f91dc', work: [{ kind: 'terminal', calls: 300 }] }] })
  assert.equal(roomTip(plan.rooms[0]), 'server room · terminal commands · 39% · 20.1k calls · from little-studio 1.2k, docs-kit 300')
  assert.deepEqual(plan.rooms[0].tags, [...Array(6).fill('#9ab86a'), '#6f91dc', '#6f91dc'])
  assert.equal(roomTip(planWork(page({})).rooms[0]), 'server room · terminal commands · no calls (closed)')
})

// ---------------------------------------------------------------- the building, built headless
function fakeContext() {
  // the screens draw on a 16 × 10 canvas: a stub is enough without a browser
  globalThis.document ??= { createElement: () => ({ getContext: () => ({ fillRect() {}, set fillStyle(v) {} }), width: 0, height: 0 }) }
  const kit = createKit({ THREE, renderer: {} })
  const made = []
  const labels = {
    label(spec) { made.push(spec); const g = new THREE.Group(); g.userData.size = [spec.width ?? 1, spec.height ?? .3]; return g },
    measure: (text, size, { pixel } = {}) => String(text).length * size * (pixel ? .4 : .6),
    release() {},
  }
  const actors = createActors({ THREE, kit })
  return {
    made,
    ctx: {
      THREE, kit, labels, actors, building: { bulbMaterial: new THREE.MeshStandardMaterial() }, lobby: {}, windowMaterial: new THREE.MeshStandardMaterial(),
      colliderGeometry: new THREE.BoxGeometry(1, 1, 1), colliderMaterial: new THREE.MeshBasicMaterial({ visible: false }), lights: [], nowMs: NOW, night: true,
    },
  }
}

test('the departments build as storeys over the lobby, within their light and label budgets, on every kind of page', () => {
  const s0 = demoSnapshot({ view: 'work', now: NOW })
  const pages = {
    now: s0,
    past: demoSnapshot({ view: 'work', back: 1, now: NOW }),
    sample: { ...s0, ...page(SAMPLE), interns: [{ job: 'consultant', n: 559 }, { job: 'generalist', n: 79 }, { job: 'researcher', n: 19 }] },
    jobs: { ...s0, interns: ['consultant', 'generalist', 'researcher', 'architect', 'reviewer', 'librarian', 'decorator', 'specialist'].map((job, i) => ({ job, n: 300 - i * 37 })) },
    empty: { ...s0, work: s0.work.map(w => ({ ...w, calls: 0 })), interns: [], period: { ...s0.period, back: 3, past: true } },
    garbage: { view: 'work' },
  }
  for (const [name, snapshot] of Object.entries(pages)) {
    for (const quiet of [false, true]) {
      const { ctx, made } = fakeContext()
      const built = buildWork(ctx, snapshot, { previous: [], quiet })
      const rows = planWork(snapshot).rows.length + (internJobs(snapshot).length ? 1 : 0)
      assert.equal(built.storeys.length, rows, name)
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
      assert.ok(made.every(spec => spec.lines.every(line => line.spans.every(span => typeof span[0] === 'string' && span[0]))), name)
      assert.equal(built.status, null)
      assert.ok(built.sign.length === 2 && built.sign.every(line => line.every(span => typeof span[0] === 'string' && span[0])), name)
      assert.ok(built.pickables.length >= 10 && built.pickables.every(p => typeof p.userData.text === 'string' && p.userData.text.length > 0), name)
      // quiet: the shares and calls stay, the kinds of work go
      const captions = made.filter(spec => spec.anchor === 'top-left' && spec.lines[0].spans[0][2]?.pixel)
      assert.equal(captions.length, 10, name)
      assert.ok(captions.every(spec => spec.lines.length === (quiet ? 1 : 2)), name)
      built.update(1.5, .016)
      built.update(7.25, .016)
    }
  }
  // the typing pool's tooltip says the scoreboard's lines in full
  const { ctx } = fakeContext()
  const built = buildWork(ctx, s0, {})
  const pool = built.pickables.find(p => p.userData.text.startsWith('typing pool'))
  assert.match(pool.userData.text, /lines in commits this week$/)
})
