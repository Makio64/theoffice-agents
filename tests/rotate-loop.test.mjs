// rotateLoop: a walk picked up where the clock has it after a reload (connected-office fork).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rotateLoop } from '../plugin/lib/svg-live.mjs'

const lerp = (u, v, t) => String(Math.round(Number(u) + (Number(v) - Number(u)) * t))

test('a linear loop starts mid-segment at the interpolated value and comes back to it', () => {
  assert.deepEqual(rotateLoop(['0', '100', '100', '0'], [0, 0.4, 0.6, 1], 0.2, lerp), { values: ['50', '100', '100', '0', '50'], keys: [0, 0.2, 0.4, 0.8, 1] })
})

test('a discrete loop starts on the frame that holds at that moment', () => {
  assert.deepEqual(rotateLoop(['a', 'b', 'c'], [0, 0.5, 0.8], 0.6), { values: ['b', 'c', 'a', 'b'], keys: [0, 0.2, 0.4, 0.9] })
})

test('at 0 a loop is unchanged', () => {
  assert.deepEqual(rotateLoop(['0', '100', '0'], [0, 0.5, 1], 0, lerp), { values: ['0', '100', '0'], keys: [0, 0.5, 1] })
})
