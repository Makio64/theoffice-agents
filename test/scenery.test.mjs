// The scenery themes (plugin/themes/*.json) share one shape: the same lights, the same keys, the same stop counts. Only
// `default` ships; the loader falls back to it on an unknown THEOFFICE_SCENERY.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../plugin/themes/${name}`, import.meta.url), 'utf8'))
const LIGHTS = ['night', 'twilight', 'dawn', 'day', 'dusk']
const TINTED = ['night', 'dawn', 'day', 'dusk'] // no twilight: cloudTint() falls back to day

// A theme's shape: its keys, its array lengths and each leaf's type, so a missing key or a shorter stop list fails.
const shape = (v) => (Array.isArray(v) ? v.map(shape) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)])) : typeof v)

test('every theme has the default theme\'s shape, key for key', () => {
  const base = shape(read('default.json'))
  for (const name of fs.readdirSync(new URL('../plugin/themes/', import.meta.url)).filter((n) => n.endsWith('.json'))) {
    assert.deepEqual(shape(read(name)), base, name)
  }
})

test('the default scenery has the five lights, and the tinted clouds of the four that have them', () => {
  const base = read('default.json')
  assert.deepEqual(Object.keys(base.skies), LIGHTS)
  assert.deepEqual(Object.keys(base.cloudTints), TINTED)
  for (const light of LIGHTS) {
    assert.ok(base.skies[light].head.length >= 2, `${light}: head stops`)
    assert.ok(base.skies[light].fall.length >= 2, `${light}: fall stops`)
  }
})

test('an unknown THEOFFICE_SCENERY warns on stderr and keeps the default theme', () => {
  const loader = new URL('../plugin/lib/scenery.mjs', import.meta.url).href
  const script = `const m = await import(${JSON.stringify(loader)}); console.log(JSON.stringify(m.THEME))`
  const run = (scenery) => spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, THEOFFICE_SCENERY: scenery }, encoding: 'utf8',
  })
  const unknown = run('no-such-theme')
  assert.equal(unknown.status, 0, unknown.stderr)
  assert.match(unknown.stderr, /no scenery "no-such-theme"/)
  assert.deepEqual(JSON.parse(unknown.stdout), read('default.json'))
  const unset = run('')
  assert.equal(unset.status, 0, unset.stderr)
  assert.equal(unset.stderr, '')
  assert.deepEqual(JSON.parse(unset.stdout), read('default.json'))
})
