import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROVIDERS, STATUS, demoSnapshot, escapeHtml, minutesLabel } from '../site/voxel/data.js'

test('the illustrative office has consistent weekly figures and every agent belongs to a displayed project', () => {
  const sample = demoSnapshot()
  assert.equal(sample.source, 'demo', 'the website must clearly distinguish its illustrative data from local activity')
  assert.equal(sample.projects.reduce((total, project) => total + project.minutes, 0), sample.totals.minutes)
  assert.equal(sample.projects.reduce((total, project) => total + project.commits, 0), sample.totals.commits)
  assert.equal(sample.daily.reduce((total, minutes) => total + minutes, 0), sample.totals.minutes)
  assert.equal(sample.daily.length, 7)
  assert.equal(sample.hourly.length, 24)
  assert.ok([...sample.daily, ...sample.hourly].every(value => Number.isFinite(value) && value >= 0))
  const projects = new Set(sample.projects.map(project => project.name))
  assert.equal(new Set(sample.agents.map(agent => agent.id)).size, sample.agents.length)
  for (const agent of sample.agents) {
    assert.ok(projects.has(agent.project))
    assert.ok(PROVIDERS[agent.agent])
    assert.ok(STATUS[agent.status])
  }
  for (const event of sample.activity) {
    assert.ok(projects.has(event.project))
    if (event.kind === 'commit') assert.equal(event.agent, null)
    else assert.ok(PROVIDERS[event.agent])
    assert.ok(STATUS[event.status])
    assert.ok(Number.isFinite(Date.parse(event.time)))
  }
  assert.deepEqual(sample.activity.map(event => event.time), sample.activity.map(event => event.time).sort().reverse())
})

test('mutating an interactive demo snapshot does not alter a fresh demo or provider definitions', () => {
  const sample = demoSnapshot()
  const originalColor = PROVIDERS[sample.agents[0].agent].color
  sample.agents[0].task = 'Changed interactively'
  sample.agents[0].color = '#000000'
  sample.daily[0] = -100
  const fresh = demoSnapshot()
  assert.notEqual(fresh.agents[0].task, 'Changed interactively')
  assert.equal(fresh.agents[0].color, originalColor)
  assert.ok(fresh.daily[0] >= 0)
})

test('local agent names, projects and task strings can be embedded as text or quoted HTML attributes', () => {
  const hostile = `<img src=x onerror="alert('agent')"> & \\n`
  const escaped = escapeHtml(hostile)
  assert.doesNotMatch(escaped, /[<>"']/)
  assert.ok(escaped.includes('&lt;img'))
  assert.ok(escaped.includes('&quot;'))
  assert.ok(escaped.includes('&#39;'))
  assert.ok(escaped.includes('&amp;'))
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(undefined), '')
})

test('agent-time labels remain readable at hour boundaries and handle unavailable measurements', () => {
  const cases = [[0, '0m'], [59.4, '59m'], [59.5, '1h'], [60, '1h'], [61, '1h 1m'], [3490, '58h 10m'], ['90', '1h 30m'], [-1, '0m'], [undefined, '0m'], [NaN, '0m'], [Infinity, '0m'], [-Infinity, '0m']]
  for (const [input, expected] of cases) assert.equal(minutesLabel(input), expected)
})


test('the sample fills eight project rooms with twenty real session identities and consistent rich metrics', () => {
  const sample = demoSnapshot()
  assert.equal(sample.projects.length, 8)
  assert.equal(sample.agents.length, 20)
  assert.ok(sample.projects.some(project => project.name === 'portfolio'))
  assert.deepEqual(new Set(sample.agents.map(agent=>agent.status)), new Set(['working','waiting','idle','done']))
  const sum = values => values.reduce((total,value)=>total+value,0)
  for (const key of ['minutes','commits','sessions','toolCalls','filesEdited','additions','deletions','prompts','workflows','subagents']) {
    assert.equal(sum(sample.projects.map(project=>project[key])), sample.totals[key], key)
  }
  assert.equal(sum(sample.hourly), sample.totals.minutes)
  assert.equal(sum(sample.crew.map(row=>row.minutes)), sample.totals.minutes)
  assert.equal(sum(sample.crew.map(row=>row.sessions)), sample.totals.sessions)
  assert.equal(sum(sample.work.map(row=>row.calls)), sample.totals.toolCalls)
  assert.equal(sample.totals.interns, 4)
  for (const project of sample.projects) {
    assert.equal(sum(project.daily), project.minutes, project.name)
    assert.equal(sum(project.hourly), project.minutes, project.name)
    assert.equal(sum(project.crew.map(row=>row.minutes)), project.minutes, project.name)
    assert.equal(sum(project.crew.map(row=>row.sessions)), project.sessions, project.name)
    assert.equal(sum(project.work.map(row=>row.calls)), project.toolCalls, project.name)
    assert.equal(sum(project.dayStats.map(row=>row.commits)), project.commits, project.name)
    assert.equal(sum(project.dayStats.map(row=>row.sessions)), project.sessions, project.name)
    assert.deepEqual(project.dailyDates,sample.dailyDates)
    assert.ok(project.live.desks >= 2)
    assert.equal(project.recentCommits.length, 1)
  }
  for (const agent of sample.agents.filter(agent=>agent.status==='waiting')) {
    assert.equal(agent.question,agent.task)
    assert.equal(agent.waitingReason,agent.question)
    assert.equal(agent.tool,'AskUserQuestion')
    assert.equal(agent.elapsedLabel,'Time in current state')
  }
})
