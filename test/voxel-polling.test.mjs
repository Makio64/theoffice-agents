import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

// Exercise the browser polling functions with controllable network responses and
// timers. The scene and DOM renderer do not participate in request scheduling.
const source = readFileSync(new URL('../site/voxel/app.js', import.meta.url), 'utf8')
const start = source.indexOf('async function refreshLocal()')
const end = source.indexOf('// Make the workspace interactive', start)
assert.ok(start >= 0 && end > start)
const pollingSource = source.slice(start, end)
const pagehideSource = source.match(/^window\.addEventListener\('pagehide'.*$/m)[0]
const flush = () => new Promise(resolve => setImmediate(resolve))
const snapshot = label => ({ agents: [{ id: label }], projects: [], activity: [] })
function fixture({ hidden = false } = {}) {
  const requests = [], timers = new Map(), elements = new Map(), notices = []
  let timerId = 0, renders = 0
  const listeners = new Map()
  const context = {
    stopped: false, document: { hidden }, isLocal: true, token: 'local capability',
    window: { addEventListener(event, callback) { listeners.set(event, callback) } },
    demoTimer: undefined, metricsTimer: undefined, sceneApi: undefined,
    clearInterval() {}, sceneVisibility: { disconnect() {} },
    refreshController: null, refreshPending: false, refreshTimer: undefined,
    state: { snapshot: snapshot('initial') }, AbortController, AbortSignal,
    encodeURIComponent,
    fetch(url, options) {
      return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }))
    },
    setTimeout(callback, duration) { const id = ++timerId; timers.set(id, { callback, duration }); return id },
    clearTimeout(id) { timers.delete(id) },
    $(selector) { if (!elements.has(selector)) elements.set(selector, {}); return elements.get(selector) },
    renderAll() { renders++ },
    notify(message) { notices.push(message) },
  }
  runInNewContext(pollingSource + '\n' + pagehideSource, context)
  return {
    context, requests, timers, notices, get renders() { return renders },
    visibility(hidden) { context.document.hidden = hidden; context.localVisibilityChanged() },
    pagehide() { listeners.get('pagehide')() },
    answer(index, value = snapshot(`response-${index}`)) { requests[index].resolve({ ok: true, json: async () => value }) },
  }
}

test('local polling preserves the visible ten-second cadence and no-store capability request', async () => {
  const app = fixture(), pending = app.context.refreshLocal()
  assert.equal(app.requests.length, 1)
  assert.equal(app.requests[0].url, './api/snapshot?token=local%20capability')
  assert.equal(app.requests[0].options.cache, 'no-store')
  assert.deepEqual([...app.timers.values()].map(timer => timer.duration), [120000], 'only the request timeout runs before completion')
  app.answer(0)
  await pending
  assert.equal(app.renders, 1)
  assert.deepEqual([...app.timers.values()].map(timer => timer.duration), [10000])
  assert.equal(app.context.refreshController, null)
})

test('a local dashboard opened hidden waits until visible and refreshes immediately once', async () => {
  const app = fixture({ hidden: true })
  await app.context.refreshLocal()
  assert.equal(app.requests.length, 0)
  assert.equal(app.timers.size, 0)
  app.visibility(false)
  assert.equal(app.requests.length, 1)
  app.answer(0)
  await flush()
  assert.equal(app.renders, 1)
  assert.equal(app.timers.size, 1)
})

test('hiding cancels the next poll, and returning refreshes without waiting for that timer', async () => {
  const app = fixture(), pending = app.context.refreshLocal()
  app.answer(0)
  await pending
  app.visibility(true)
  assert.equal(app.timers.size, 0)
  app.visibility(false)
  assert.equal(app.requests.length, 2)
  assert.deepEqual([...app.timers.values()].map(timer => timer.duration), [120000])
  app.answer(1)
  await flush()
  assert.equal(app.renders, 2)
  assert.equal(app.timers.size, 1)
})

test('returning before an aborted request settles queues one fresh request without overlap', async () => {
  const app = fixture(), pending = app.context.refreshLocal()
  app.visibility(true)
  assert.equal(app.requests[0].options.signal.aborted, true)
  app.visibility(false)
  assert.equal(app.requests.length, 1, 'the aborted fetch still owns the in-flight slot')
  app.requests[0].reject(new DOMException('Hidden', 'AbortError'))
  await pending
  assert.equal(app.requests.length, 2)
  assert.equal(app.renders, 0)
  assert.deepEqual(app.notices, [])
  app.answer(1)
  await flush()
  assert.equal(app.renders, 1)
  assert.equal(app.timers.size, 1)
})

test('an aborted response cannot update the DOM even when its server ignores cancellation', async () => {
  const app = fixture(), pending = app.context.refreshLocal()
  app.visibility(true)
  app.visibility(false)
  app.answer(0, snapshot('stale'))
  await pending
  assert.equal(app.context.state.snapshot.agents[0].id, 'initial')
  assert.equal(app.renders, 0)
  assert.equal(app.requests.length, 2)
  app.answer(1, snapshot('fresh'))
  await flush()
  assert.equal(app.context.state.snapshot.agents[0].id, 'fresh')
  assert.equal(app.renders, 1)
})

test('hiding during JSON decoding discards that response and stops polling until return', async () => {
  const app = fixture(), pending = app.context.refreshLocal()
  let decode
  app.requests[0].resolve({ ok: true, json: () => new Promise(resolve => { decode = resolve }) })
  await flush()
  app.visibility(true)
  decode(snapshot('decoded while hidden'))
  await pending
  assert.equal(app.renders, 0)
  assert.equal(app.timers.size, 0)
  assert.deepEqual(app.notices, [])
  app.visibility(false)
  assert.equal(app.requests.length, 2)
  app.answer(1)
  await flush()
  assert.equal(app.renders, 1)
})

test('pagehide cancellation and permanent stop prevent late results or new timers', async () => {
  const app = fixture(), pending = app.context.refreshLocal()
  app.pagehide()
  app.answer(0)
  await pending
  app.visibility(false)
  await app.context.refreshLocal()
  assert.equal(app.requests.length, 1)
  assert.equal(app.renders, 0)
  assert.equal(app.timers.size, 0)
  assert.deepEqual(app.notices, [])
})

test('visible request failures retain the existing error notice and retry delay', async () => {
  const app = fixture(), pending = app.context.refreshLocal()
  app.requests[0].reject(new Error('Network unavailable'))
  await pending
  assert.equal(app.renders, 0)
  assert.equal(app.notices.length, 1)
  assert.deepEqual([...app.timers.values()].map(timer => timer.duration), [10000])
})


test('a visible request timeout reports the existing error and schedules the usual retry', async () => {
  const app = fixture(), pending = app.context.refreshLocal()
  const timeout = [...app.timers.values()].find(timer => timer.duration === 120000)
  assert.ok(timeout)
  timeout.callback()
  assert.equal(app.requests[0].options.signal.aborted, true)
  app.requests[0].reject(new DOMException('Timed out', 'AbortError'))
  await pending
  assert.equal(app.renders, 0)
  assert.equal(app.notices.length, 1)
  assert.deepEqual([...app.timers.values()].map(timer => timer.duration), [10000])
})

test('a late response after the visible timeout cannot overwrite the snapshot', async () => {
  const app = fixture(), pending = app.context.refreshLocal()
  const timeout = [...app.timers.values()].find(timer => timer.duration === 120000)
  timeout.callback()
  app.answer(0, snapshot('too late'))
  await pending
  assert.equal(app.context.state.snapshot.agents[0].id, 'initial')
  assert.equal(app.renders, 0)
  assert.equal(app.notices.length, 1)
  assert.deepEqual([...app.timers.values()].map(timer => timer.duration), [10000])
})
