// Execute the actual browser controller against a small DOM/event adapter. This covers native webview messages even
// when document.hidden stays false, the server's pushed nudges (a stand-in EventSource), the pixel console drawn by the
// real lib/ modules (handed to the page's own loader), and the keys, without depending on the controller's spelling.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { dashboardPage } from '../plugin/lib/dashboard-page.mjs'

const LIB = new URL('../plugin/lib/', import.meta.url)

class Element {
  constructor(tag = 'div', id = '') {
    this.tagName = tag.toUpperCase();this.id = id;this.listeners = new Map();this.children = [];this.attributes = new Map();this.parent = null
    this.style = {};this.dataset = {};this.hidden = false;this.disabled = false;this.value = '';this.innerHTML = '';this._text = '';this.className = '';this.src = ''
    this.classList = { remove: (name) => { this.className = this.className.split(' ').filter((c) => c && c !== name).join(' ') } }
  }
  get textContent() { return this._text + this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join('') }
  set textContent(value) { this.children = [];this._text = String(value) }
  addEventListener(type, listener) { const list = this.listeners.get(type) ?? [];list.push(listener);this.listeners.set(type, list) }
  dispatch(type, event = {}) { for (const listener of this.listeners.get(type) ?? []) listener({ target: this, button: 0, ...event }) }
  click() { if (!this.disabled) this.dispatch('click') }
  append(...children) {
    for (const child of children) {
      if (typeof child !== 'string') { child.parent?.children.splice(child.parent.children.indexOf(child), 1);child.parent = this }
      this.children.push(child)
    }
  }
  remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1);this.parent = null } }
  replaceChildren(...children) { for (const c of this.children) if (typeof c !== 'string') c.parent = null;this.children = [];this._text = '';this.append(...children) }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.get(name) ?? null }
  removeAttribute(name) { this.attributes.delete(name) }
  querySelector(selector) { return this.children.find((c) => typeof c !== 'string' && c.tagName === selector.toUpperCase()) ?? null }
  /** The key whose `data-id` is `id`, among this holder's buttons. */
  key(id) { return this.children.find((c) => c.dataset?.id === id) ?? null }
}

class Stream {
  static all = []
  constructor(url) { this.url = new URL(url);this.listeners = new Map();this.closed = false;Stream.all.push(this) }
  addEventListener(type, listener) { const list = this.listeners.get(type) ?? [];list.push(listener);this.listeners.set(type, list) }
  emit(type, data = {}) { for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) }) }
  close() { this.closed = true }
}

/**
 * The page in a stand-in browser. `revisions(url)` names the revision each snapshot answers with (default: a new one
 * each time); `withModules` hands the page's loader the real console modules.
 */
function browser({ revisions = null, withModules = false, selection = { view: 'live', range: 'week', back: 0 }, stoppable = true, today = '2026-11-07' } = {}) {
  const elements = new Map()
  const timers = new Map()
  let timerId = 0
  let defer
  const requests = []
  const posts = []
  const parent = {}
  const window = new Element()
  const document = new Element()
  document.hidden = false
  document.cookie = ''
  document.title = ''
  document.body = new Element('body')
  document.body.className = 'plain'
  document.getElementById = (id) => {
    if (!elements.has(id)) {
      const element = new Element(id === 'panel-frame' ? 'iframe' : 'div', id)
      if (id.startsWith('deck-')) element.append(new Element('img'))
      elements.set(id, element)
    }
    return elements.get(id)
  }
  document.createElement = (tag) => new Element(tag)
  document.querySelectorAll = (selector) => {
    const found = []
    const walk = (node) => { for (const c of node.children ?? []) if (typeof c !== 'string') { if (c.tagName === selector.toUpperCase()) found.push(c);walk(c) } }
    for (const element of elements.values()) { if (element.tagName === selector.toUpperCase()) found.push(element);walk(element) }
    return [...new Set(found)]
  }
  const location = { href: 'http://127.0.0.1:1234/?token=local' }
  let count = 0
  const fetch = async (url, options = {}) => {
    const parsed = new URL(url)
    if (parsed.pathname === '/preferences' || parsed.pathname === '/shutdown') { posts.push(parsed);return { ok: true } }
    if (parsed.pathname === '/export') { posts.push(parsed);return { ok: true, blob: async () => ({}) } }
    if (parsed.pathname !== '/snapshot') return { ok: false }
    requests.push(parsed)
    const n = ++count
    const revision = revisions ? revisions(parsed, n) : `revision${n}`
    const response = { ok: true, json: async () => ({ svg: `<svg><text>${revision}</text></svg>`, text: 'The office', revision, status: '◉ 1 working', label: 'This week', alt: 'The Office, alt', today }) }
    if (defer) { const wait = defer;defer = null;await wait }
    return response
  }
  const html = dashboardPage({ nonce: 'test', selection, restore: false, stoppable, today })
  let script = /<script nonce="test">([\s\S]*)<\/script>/.exec(html)[1]
  // the page loads the console's modules from its server (/lib/); here they come from the checkout
  assert.ok(script.includes("import('/lib/'+name)"), 'the page loads the console from its own server')
  script = script.replace("import('/lib/'+name)", '__load(name)')
  Stream.all = []
  const context = {
    window, document, parent, location, fetch, URL, console, Promise, JSON, Math, Number, String, Object, Array, Set, Map, Boolean, encodeURIComponent, decodeURIComponent,
    EventSource: Stream,
    __load: (name) => (withModules ? import(new URL(name, LIB).href) : Promise.reject(new Error('no modules'))),
    history: { replaceState(_, __, url) { location.href = url.href } },
    localStorage: { getItem() { return null }, setItem() {} },
    setTimeout(callback, ms) { const id = ++timerId;timers.set(id, { callback, ms });return id },
    clearTimeout(id) { timers.delete(id) },
  }
  vm.runInNewContext(script, context)
  const stream = () => Stream.all.filter((s) => !s.closed).at(-1) ?? null
  return {
    elements, timers, requests, posts, document, context, stream,
    el: (id) => document.getElementById(id),
    emit(data, source = parent) { window.dispatch('message', { source, origin: 'vscode-webview://native', data }) },
    key(key) { document.dispatch('keydown', { key, preventDefault() {} }) },
    deferNext() { let resolve;defer = new Promise((done) => { resolve = done });return resolve },
    pollTimers() { return [...timers.values()].filter((timer) => timer.ms === 5000) },
    runTimers(ms) { for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id);timer.callback() } },
    async open() { stream()?.emit('open');await flush() },
  }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))
const last = (app) => app.requests.at(-1).searchParams

test('native visibility accepts only parent messages, closes the stream while hidden and refreshes once on reveal', async () => {
  const app = browser()
  await flush()
  assert.equal(app.requests.length, 1)
  assert.equal(app.pollTimers().length, 1, 'until the stream opens, the page asks every 5 seconds')
  assert.ok(app.stream(), 'the page listens to the server')
  app.emit({ type: 'theoffice:visibility', visible: false }, {})
  app.emit({ type: 'other', visible: false })
  app.emit({ type: 'theoffice:visibility', visible: 'false' })
  assert.equal(app.pollTimers().length, 1, 'foreign sources and malformed messages cannot hide the dashboard')
  app.emit({ type: 'theoffice:visibility', visible: false })
  assert.equal(app.document.hidden, false, 'native hiding is independent of document.hidden')
  assert.equal(app.pollTimers().length, 0)
  assert.equal(app.stream(), null, 'a hidden pane stops listening, so the server stops watching')
  app.key('2')
  await flush()
  assert.equal(app.requests.length, 1, 'hidden panes do not collect even when a tab is picked')
  app.emit({ type: 'theoffice:visibility', visible: true })
  await flush()
  assert.equal(app.requests.length, 2)
  assert.ok(app.stream(), 'listening again')
  app.emit({ type: 'theoffice:visibility', visible: true })
  await flush()
  assert.equal(app.requests.length, 2, 'duplicate visible notifications do not restart collection')
})

test('a pushed nudge asks again; the same revision leaves the drawing alone; no polling while the stream is open', async () => {
  let revision = 'A'
  const app = browser({ revisions: () => revision })
  await flush()
  const drawing = app.el('drawing')
  assert.match(drawing.innerHTML, /A/)
  await app.open()
  assert.equal(app.pollTimers().length, 0, 'the stream replaces the 5-second poll')
  assert.equal(app.el('foot').textContent, 'Live · local activity only')
  assert.equal(app.el('dot').className, 'dot on')
  const before = app.requests.length
  drawing.innerHTML = 'still the same frame'
  app.stream().emit('change', { why: 'activity' })
  await flush()
  assert.equal(app.requests.length, before + 1)
  assert.equal(drawing.innerHTML, 'still the same frame', 'the same revision never reloads the drawing')
  revision = 'B'
  app.stream().emit('change', { why: 'state' })
  await flush()
  assert.match(drawing.innerHTML, /B/)
  assert.equal(drawing.getAttribute('aria-label'), 'The Office, alt')
  assert.equal(app.document.title, 'The Office · 1 working')
  app.stream().emit('error')
  await flush()
  assert.equal(app.pollTimers().length, 1, 'a dropped stream falls back to the poll')
  app.stream().emit('bye')
  await flush()
  assert.match(app.el('line').textContent, /server stopped/)
  assert.equal(app.el('foot').textContent, 'The server is stopped.')
  const after = app.requests.length
  app.key('3')
  await flush()
  assert.equal(app.requests.length, after, 'a stopped server is asked nothing more')
})

test('the tabs, pages and switches follow the pane\'s hotkeys, and replays and past pages ignore nudges', async () => {
  const app = browser()
  await flush()
  await app.open()
  app.key('z')
  await flush()
  assert.equal(last(app).get('zoom'), '1')
  app.key('q')
  await flush()
  assert.equal(last(app).get('quiet'), '1', 'Quiet on the Live tab')
  app.key('3')
  await flush()
  assert.equal(last(app).get('view'), 'week')
  assert.equal(last(app).get('quiet'), null, 'Quiet is the Live tab\'s alone')
  assert.equal(app.el('deck-strip').hidden, false, 'Week pages: its strip shows')
  const count = app.requests.length
  app.key('q')
  await flush()
  assert.equal(app.requests.length, count, 'q does nothing off the Live tab')
  app.key('p')
  await flush()
  assert.equal(last(app).get('back'), '1')
  const past = app.requests.length
  app.stream().emit('change', { why: 'state' })
  await flush()
  assert.equal(app.requests.length, past, 'a page of the past stays as it was read')
  app.key('c')
  await flush()
  assert.equal(last(app).get('back'), '0')
  app.key('5')
  await flush()
  assert.equal(last(app).get('view'), 'work')
  assert.equal(last(app).get('back'), '0', 'What they did shares the Week\'s page')
  app.key('6')
  await flush()
  assert.equal(last(app).get('view'), 'timelapse')
  assert.equal(app.el('deck-lapse').hidden, false)
  assert.equal(app.el('deck-strip').hidden, true)
  app.key('y')
  await flush()
  assert.equal(last(app).get('range'), 'yesterday')
  const replay = app.requests.length
  app.stream().emit('change', { why: 'state' })
  await flush()
  assert.equal(app.requests.length, replay, 'a replay is not read again for a nudge')
  assert.ok(app.posts.some((url) => url.pathname === '/preferences'), 'every choice is remembered')
})

test('the Month exports the revision on screen through its export row, and nothing is read while the export shows', async () => {
  const app = browser()
  await flush()
  await app.open()
  app.key('4')
  await flush()
  const shown = app.requests.at(-1)
  const visibleRevision = `revision${app.requests.length}`
  app.key('e')
  assert.equal(app.el('deck-ask').hidden, false, 'Export opens the row that asks what')
  assert.deepEqual(app.el('ask').children.map((b) => b.dataset.id), ['calendar', 'directory', 'whole', 'stats'])
  const release = app.deferNext()
  app.stream().emit('change', { why: 'activity' })
  app.key('a')
  assert.deepEqual(app.el('ask').children.map((b) => b.dataset.id), ['png', 'svg', 'gif', 'video', 'back'])
  app.key('b')
  assert.deepEqual(app.el('ask').children.map((b) => b.dataset.id), ['calendar', 'directory', 'whole', 'stats'], 'Back asks what again')
  app.key('a')
  app.key('i')
  await flush()
  const frame = app.el('panel-frame')
  assert.equal(app.el('panel').hidden, false)
  assert.equal(app.el('drawing').hidden, true)
  assert.equal(app.el('deck-ask').hidden, true, 'the row closes once it is answered')
  assert.equal(new URL(frame.src).pathname, '/export')
  assert.equal(new URL(frame.src).searchParams.get('revision'), visibleRevision, 'the export is of the drawing on screen')
  assert.equal(new URL(frame.src).searchParams.get('part'), 'calendar')
  assert.equal(new URL(frame.src).searchParams.get('format'), 'png')
  const drawing = app.el('drawing').innerHTML
  release()
  await flush()
  assert.equal(app.el('drawing').innerHTML, drawing, 'the refresh under way cannot replace the drawing behind the export')
  const reads = app.requests.length
  app.stream().emit('change', { why: 'state' })
  await flush()
  assert.equal(app.requests.length, reads, 'no read while the export shows')
  assert.equal(app.pollTimers().length, 0)
  app.key('b')
  await flush()
  assert.equal(app.el('panel').hidden, true)
  assert.equal(app.el('drawing').hidden, false)
  assert.equal(app.requests.length, reads + 1, 'back on the office, it reads again')
  assert.equal(app.requests.at(-1).searchParams.get('view'), shown.searchParams.get('view'))
  app.key('e')
  app.key('s')
  assert.deepEqual(app.el('ask').children.map((b) => b.dataset.id), ['html', 'csv', 'json', 'back'])
  app.key('t')
  await flush()
  const saved = app.posts.at(-1)
  assert.equal(saved.pathname, '/export')
  assert.equal(saved.searchParams.get('format'), 'csv')
  assert.equal(app.el('panel').hidden, true, 'a CSV is a download, not a page')
})

test('the Timelapse\'s Export opens the replay\'s player for the revision on screen, and closes it again', async () => {
  const app = browser({ selection: { view: 'timelapse', range: 'week', back: 0 } })
  await flush()
  app.key('e')
  const frame = app.el('panel-frame')
  assert.equal(new URL(frame.src).pathname, '/player')
  assert.equal(new URL(frame.src).searchParams.get('revision'), 'revision1')
  app.key('e')
  assert.equal(app.el('panel').hidden, true)
  assert.equal(frame.getAttribute('src'), null)
})

test('with the console\'s modules the decks are the pane\'s pixel art, each key a button over its zone', async () => {
  const app = browser({ withModules: true })
  await flush()
  await flush()
  assert.equal(app.document.body.className, '', 'the plain row gives way to the pixel console')
  const img = app.el('deck-tabs').querySelector('img')
  assert.match(img.src, /^data:image\/svg\+xml;charset=utf-8,%3Csvg/)
  const tabs = app.el('tabs')
  assert.equal(tabs.key('live'), null, 'the lit tab goes nowhere, as in the pane')
  for (const id of ['today', 'week', 'month', 'work', 'timelapse', 'quiet', 'zoom']) {
    const key = tabs.key(id)
    assert.ok(key, id)
    assert.match(key.style.left, /^\d+(\.\d+)?%$/)
    assert.match(key.style.width, /^\d+(\.\d+)?%$/)
  }
  assert.equal(tabs.key('quiet').getAttribute('aria-pressed'), 'false')
  assert.equal(tabs.key('week').getAttribute('aria-label'), 'Week (3)')
  tabs.key('week').dispatch('pointerdown')
  const pressed = img.src
  tabs.key('week').dispatch('pointerup')
  assert.notEqual(pressed, img.src, 'a key held down is drawn pressed')
  tabs.key('week').click()
  await flush()
  assert.equal(last(app).get('view'), 'week')
  const strip = app.el('strip')
  assert.ok(strip.key('older'), 'the strip\'s keys are buttons too')
  assert.equal(strip.key('newer'), null, 'nothing newer than now')
  strip.key('older').click()
  await flush()
  assert.equal(last(app).get('back'), '1')
  const window = strip.children.find((b) => b.dataset.id?.startsWith('tick-') && b.dataset.back === '3')
  assert.ok(window, 'the ruler\'s windows go to their page')
  assert.match(window.getAttribute('aria-label'), /\d/)
  window.click()
  await flush()
  assert.equal(last(app).get('back'), '3')
  strip.key('now').click()
  await flush()
  assert.equal(last(app).get('back'), '0')
  app.key('4')
  await flush()
  app.el('strip').key('export').click()
  assert.equal(app.el('deck-ask').hidden, false)
  assert.match(app.el('deck-ask').querySelector('img').src, /^data:image\/svg\+xml/)
  app.el('ask').key('stats').click()
  assert.ok(app.el('ask').key('json'))
})

test('without Stop the host owns the server: the page offers none', () => {
  assert.doesNotMatch(dashboardPage({ nonce: 'n', selection: { view: 'live', range: 'week', back: 0 }, stoppable: false }), /id="stop"/)
  assert.match(dashboardPage({ nonce: 'n', selection: { view: 'live', range: 'week', back: 0 } }), /id="stop"/)
})
