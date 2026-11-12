// opencodeEntry: an opencode session's messages booked like the other agents' (connected-office fork).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opencodeEntry } from '../plugin/lib/agents.mjs'

const T0 = new Date(2026, 10, 9, 10, 0, 0).getTime()   // local time: buckets are per local day
const DAY = '2026-11-09'
const MIN = 60e3
const entry = () => ({ kind: 'main', sid: 's1', cwds: {}, models: {}, days: {} })
const msg = (min, role, extra = {}) => ({ ms: T0 + min * MIN, role, cwd: '/w/tech', model: null, tokIn: 0, tokOut: 0, tools: 0, ...extra })

test('time is the gaps between messages, capped at five minutes', () => {
  const e = opencodeEntry(entry(), [msg(0, 'user'), msg(2, 'assistant'), msg(30, 'user')])
  assert.equal(e.days[DAY].a, 2 * MIN + 5 * MIN, `minutes booked: ${e.days[DAY].a / MIN}`)
})

test('prompts, tokens, tools and models are counted on their message', () => {
  const e = opencodeEntry(entry(), [
    msg(0, 'user'),
    msg(1, 'assistant', { model: 'gemma', tokIn: 100, tokOut: 20, tools: 3 }),
    msg(2, 'user'),
    msg(3, 'assistant', { model: 'gemma', tokIn: 50, tokOut: 5, tools: 1 }),
  ])
  const b = e.days[DAY]
  assert.deepEqual({ p: b.p, i: b.i, o: b.o, t: b.t }, { p: 2, i: 150, o: 25, t: 4 })
  assert.deepEqual(e.models, { gemma: 2 })
})

test('each gap goes to the cwd of the message that ends it', () => {
  const e = opencodeEntry(entry(), [msg(0, 'user'), msg(2, 'assistant', { cwd: '/w/tech/overseer' }), msg(3, 'user')])
  assert.deepEqual(e.cwds, { '/w/tech': 2, '/w/tech/overseer': 1 })
  assert.deepEqual(e.cm, { '/w/tech/overseer': { [DAY]: 2 * MIN }, '/w/tech': { [DAY]: 1 * MIN } })
})

test('first and last activity are kept, an empty session books nothing', () => {
  const e = opencodeEntry(entry(), [msg(0, 'user'), msg(4, 'assistant')])
  assert.equal(e.fts, T0)
  assert.equal(e.lts, T0 + 4 * MIN)
  assert.deepEqual(opencodeEntry(entry(), []).days, {})
})
