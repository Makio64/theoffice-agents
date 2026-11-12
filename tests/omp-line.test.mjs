// ompLine: an omp session's lines booked like the other agents' (connected-office fork).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ompLine } from '../plugin/lib/agents.mjs'

const T0 = new Date(2026, 10, 9, 10, 0, 0).getTime()
const DAY = '2026-11-09'
const MIN = 60e3
const entry = (kind = 'main') => ({ kind, sid: 's1', cwds: {}, models: {}, days: {} })
const msg = (min, role, extra = {}) => ({ type: 'message', message: { role, timestamp: T0 + min * MIN, ...extra } })
const run = (e, lines) => { for (const o of lines) ompLine(e, o); return e }
const session = { type: 'session', cwd: '/w/tech/zax', timestamp: new Date(T0).toISOString() }

test('the session line gives the cwd; time is the gaps between messages, capped at five minutes', () => {
  const e = run(entry(), [session, msg(0, 'user'), msg(2, 'assistant'), msg(30, 'user')])
  assert.deepEqual(e.cwds, { '/w/tech/zax': 10 })
  assert.equal(e.days[DAY].a, 7 * MIN, `minutes: ${e.days[DAY].a / MIN}`)
  assert.deepEqual(e.cm, { '/w/tech/zax': { [DAY]: 7 * MIN } })
})

test('prompts, tokens, models and tool calls are counted', () => {
  const e = run(entry(), [session, msg(0, 'user'), msg(1, 'assistant', {
    model: 'qwen', usage: { input: 100, output: 20 },
    content: [{ type: 'text', text: 'x' }, { type: 'toolCall', name: 'read', arguments: { path: 'a' } }, { type: 'toolCall', name: 'bash', arguments: { command: 'ls' } }],
  }), msg(2, 'toolResult')])
  const b = e.days[DAY]
  assert.deepEqual({ p: b.p, i: b.i, o: b.o, t: b.t }, { p: 1, i: 100, o: 20, t: 2 })
  assert.deepEqual(e.models, { qwen: 1 })
})

test('a subagent books no prompt; other line types and bad timestamps book nothing', () => {
  const e = run(entry('sub'), [session, msg(0, 'user'), { type: 'model_change', model: 'x' }, { type: 'message', message: { role: 'user', timestamp: 'nope' } }])
  assert.equal(e.days[DAY].p, 0)
  assert.deepEqual(e.models, {})
})
