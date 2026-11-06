// Execute the actual browser controller against a small DOM/event adapter. This covers native webview messages even
// when document.hidden stays false, without inspecting or depending on the controller's source spelling.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { dashboardPage } from '../plugin/lib/dashboard-page.mjs'

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();this.listeners = new Map();this.children = [];this.attributes = new Map()
    this.style = {};this.hidden = false;this.disabled = false;this.value = '';this.innerHTML = '';this.textContent = ''
  }
  addEventListener(type, listener) { const list = this.listeners.get(type) ?? [];list.push(listener);this.listeners.set(type, list) }
  dispatch(type, event = {}) { for (const listener of this.listeners.get(type) ?? []) listener({ target: this, ...event }) }
  click() { if (!this.disabled) this.dispatch('click') }
  append(...children) { this.children.push(...children);if (this.tagName === 'SELECT' && !this.value) this.value = children[0]?.value ?? '' }
  replaceChildren(...children) { this.children = [];if (this.tagName === 'SELECT') this.value = '';this.append(...children) }
  setAttribute(name, value) { this.attributes.set(name, value) }
  removeAttribute(name) { this.attributes.delete(name) }
  get selectedOptions() { return this.children.filter((child) => child.value === this.value) }
}

function browser() {
  const elements = new Map()
  const timers = new Map()
  let timerId = 0
  let defer
  const requests = []
  const parent = {}
  const window = new Element()
  const document = new Element()
  document.hidden = false
  document.cookie = ''
  document.body = new Element('body')
  document.getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, new Element(['range', 'part', 'format'].includes(id) ? 'select' : 'div'))
    return elements.get(id)
  }
  document.createElement = (tag) => new Element(tag)
  document.querySelectorAll = () => [...elements.values()]
  document.getElementById('part').value = 'calendar'
  for (const [value, label] of [['calendar', 'Calendar'], ['directory', 'Directory'], ['whole', 'Whole month'], ['stats', 'Stats']]) {
    const option = new Element('option');option.value = value;option.textContent = label;document.getElementById('part').append(option)
  }
  const location = { href: 'http://127.0.0.1:1234/?token=local' }
  const fetch = async (url) => {
    const parsed = new URL(url)
    if (parsed.pathname !== '/snapshot') return { ok: true }
    requests.push(parsed)
    const response = { ok: true, json: async () => ({ svg: `<svg><text>revision ${requests.length}</text></svg>`, text: 'The office', revision: `revision${requests.length}`, status: 'Working', label: 'This week' }) }
    if (defer) { const wait = defer;defer = null;await wait }
    return response
  }
  const html = dashboardPage({ nonce: 'test', selection: { view: 'live', range: 'week', back: 0 }, restore: false })
  const script = /<script nonce="test">([\s\S]*)<\/script>/.exec(html)[1]
  vm.runInNewContext(script, {
    window, document, parent, location, fetch, URL, console,
    history: { replaceState(_, __, url) { location.href = url.href } },
    localStorage: { getItem() { return null }, setItem() {} },
    setTimeout(callback, ms) { const id = ++timerId;timers.set(id, { callback, ms });return id },
    clearTimeout(id) { timers.delete(id) },
  })
  return {
    elements, timers, requests, document,
    emit(data, source = parent) { window.dispatch('message', { source, origin: 'vscode-webview://native', data }) },
    deferNext() { let resolve;defer = new Promise((done) => { resolve = done });return resolve },
    pollTimers() { return [...timers.values()].filter((timer) => timer.ms === 5000) },
  }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))

test('native visibility accepts only parent messages, pauses hidden polling and refreshes once on reveal', async () => {
  const app = browser()
  await flush()
  assert.equal(app.requests.length, 1)
  assert.equal(app.pollTimers().length, 1)
  app.emit({ type: 'theoffice:visibility', visible: false }, {})
  app.emit({ type: 'other', visible: false })
  app.emit({ type: 'theoffice:visibility', visible: 'false' })
  assert.equal(app.pollTimers().length, 1, 'foreign sources and malformed messages cannot hide the dashboard')
  app.emit({ type: 'theoffice:visibility', visible: false })
  assert.equal(app.document.hidden, false, 'native hiding is independent of document.hidden')
  assert.equal(app.pollTimers().length, 0)
  app.elements.get('refresh').click()
  await flush()
  assert.equal(app.requests.length, 1, 'hidden panes do not collect even when refresh is requested')
  app.emit({ type: 'theoffice:visibility', visible: true })
  await flush()
  assert.equal(app.requests.length, 2)
  assert.equal(app.pollTimers().length, 1)
  app.emit({ type: 'theoffice:visibility', visible: true })
  await flush()
  assert.equal(app.requests.length, 2, 'duplicate visible notifications do not restart collection')
})

test('hiding during collection retains the drawing until reveal, and replay/past views retain their revisions', async () => {
  const app = browser()
  await flush()
  const drawing = app.elements.get('drawing')
  const original = drawing.innerHTML
  const release = app.deferNext()
  app.elements.get('refresh').click()
  app.emit({ type: 'theoffice:visibility', visible: false })
  release()
  await flush()
  assert.equal(drawing.innerHTML, original, 'an in-flight response does not replace a hidden drawing')
  app.emit({ type: 'theoffice:visibility', visible: true })
  await flush()
  assert.notEqual(drawing.innerHTML, original)
  app.elements.get('tabs').children[5].click()
  await flush()
  const player = drawing.children[0]
  assert.equal(player.tagName, 'IFRAME')
  const count = app.requests.length
  app.emit({ type: 'theoffice:visibility', visible: false })
  app.emit({ type: 'theoffice:visibility', visible: true })
  await flush()
  assert.equal(app.requests.length, count, 'revealing a replay does not fetch a replacement revision')
  assert.equal(drawing.children[0], player, 'the original player document stays mounted')
  app.elements.get('tabs').children[3].click()
  await flush()
  app.elements.get('older').click()
  await flush()
  const pastCount = app.requests.length
  assert.equal(app.requests.at(-1).searchParams.get('back'), '1')
  app.emit({ type: 'theoffice:visibility', visible: false })
  app.emit({ type: 'theoffice:visibility', visible: true })
  await flush()
  assert.equal(app.requests.length, pastCount, 'revealing a past page keeps its existing revision')
})

test('a visible month exports its displayed revision during refresh and keeps it pinned until returning', async () => {
  const app = browser()
  await flush()
  app.elements.get('tabs').children[3].click()
  await flush()
  const drawing = app.elements.get('drawing')
  const original = drawing.innerHTML
  const visibleRevision = `revision${app.requests.length}`
  const release = app.deferNext()
  app.elements.get('refresh').click()
  app.elements.get('export').click()
  app.elements.get('save').click()
  await flush()
  const frame = app.elements.get('export-frame')
  assert.equal(app.elements.get('export-panel').hidden, false, 'the displayed month can export while a background refresh runs')
  assert.equal(new URL(frame.src).searchParams.get('revision'), visibleRevision)
  assert.equal(new URL(frame.src).searchParams.get('part'), 'calendar')
  release()
  await flush()
  assert.equal(drawing.innerHTML, original, 'the pending snapshot cannot replace the exported drawing')
  assert.equal(new URL(frame.src).searchParams.get('revision'), visibleRevision)
  assert.equal(app.pollTimers().length, 0, 'automatic collection stays paused in the export panel')
  app.elements.get('export-back').click()
  await flush()
  assert.equal(app.elements.get('export-panel').hidden, true)
  assert.equal(drawing.hidden, false)
  assert.notEqual(drawing.innerHTML, original, 'returning to the current month resumes refresh')
  assert.equal(app.pollTimers().length, 1)
})
