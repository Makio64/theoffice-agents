import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
const { launchDashboard, paneHtml } = createRequire(import.meta.url)('../extensions/vscode/server.cjs')
const { parseOfficeUri } = createRequire(import.meta.url)('../extensions/vscode/extension.cjs')

function harness(options = {}) {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kills: 0, signals: [], kill(signal) { this.kills++; this.signals.push(signal) } })
  let spawned
  const handle = launchDashboard({ nodePath: '/Node with spaces/node', script: '/Office with spaces/dashboard.mjs', root: '/Office with spaces',
    spawnImpl: (...args) => { spawned = args; return child }, ...options })
  return { child, handle, get spawned() { return spawned } }
}

test('editor starts a shell-free foreground server and stops it exactly once', async () => {
  const run = harness()
  assert.deepEqual(run.spawned.slice(0, 2), ['/Node with spaces/node', ['/Office with spaces/dashboard.mjs', '--port', '0']])
  assert.equal(run.spawned[2].shell, undefined)
  run.child.stdout.write('http://127.0.0.1:42781/?tok')
  run.child.stdout.write('en=secret\n')
  assert.equal(await run.handle.ready, 'http://127.0.0.1:42781/?token=secret')
  run.handle.dispose()
  run.handle.dispose()
  assert.equal(run.child.kills, 1)
})

test('closing during startup rejects readiness and terminates the child', async () => {
  const { child, handle } = harness()
  const rejected = assert.rejects(handle.ready, /closed/)
  handle.dispose()
  await rejected
  child.stdout.write('http://127.0.0.1:1/?token=late\n')
  assert.equal(child.kills, 1)
})

test('editor rejects nonlocal or unauthenticated server addresses', async () => {
  for (const address of ['https://evil.example/?token=x', 'http://127.0.0.1:1234/']) {
    const { child, handle } = harness()
    const rejected = assert.rejects(handle.ready, /invalid address/)
    child.stdout.write(address + '\n')
    await rejected
    assert.equal(child.kills, 1)
  }
})

test('startup failures and timeouts terminate rather than leaving a process', async () => {
  const missing = harness()
  const rejected = assert.rejects(missing.handle.ready, /Node.js 24/)
  missing.child.emit('error', new Error('ENOENT'))
  await rejected
  assert.equal(missing.child.kills, 1)
  const slow = harness({ timeoutMs: 5 })
  await assert.rejects(slow.handle.ready, /did not start/)
  assert.equal(slow.child.kills, 1)
})

test('iframe policy permits only its local origin and escapes query parameters', () => {
  const html = paneHtml('http://127.0.0.1:3456/?token=abc&name=%22%3E')
  assert.match(html, /frame-src http:\/\/127\.0\.0\.1:3456;/)
  assert.match(html, /token=abc&amp;name=/)
  assert.match(html, /default-src 'none'/)
})

test('native visibility relays only trusted host booleans to the exact dashboard origin', () => {
  const html = paneHtml('http://127.0.0.1:3456/?token=private-capability')
  const [, nonce, source] = /<script nonce="([^"]+)">([\s\S]*?)<\/script>/.exec(html)
  assert.ok(html.includes(`script-src 'nonce-${nonce}'`))
  const callbacks = {}, messages = [], ready = []
  const child = { postMessage: (value, origin) => messages.push({ value, origin }) }
  const frame = { contentWindow: child, addEventListener: (event, callback) => { callbacks[event] = callback } }
  const window = { addEventListener: (event, callback) => { callbacks[event] = callback } }
  const host = {}, location = { origin: 'vscode-webview://office-private-origin' }
  // VS Code's injected API masks parent as window; the actual parent is still the message sender.
  vm.runInNewContext(source, { window, parent: window, location, document: { getElementById: () => frame }, acquireVsCodeApi: () => ({ postMessage: value => ready.push(value) }) })
  assert.equal(ready[0].type, 'theoffice:ready')
  for (const event of [
    { source: child, origin: 'http://127.0.0.1:3456' },
    { source: {}, origin: 'https://foreign.example' },
    { source: window, origin: location.origin },
  ]) callbacks.message({ ...event, data: { type: 'theoffice:visibility', visible: false } })
  assert.equal(messages.length, 0)
  callbacks.message({ source: host, origin: location.origin, data: { type: 'theoffice:visibility', visible: 'false' } })
  assert.equal(messages.length, 0)
  callbacks.message({ source: host, origin: location.origin, data: { type: 'theoffice:visibility', visible: false, token: 'ignored' } })
  assert.equal(messages[0].origin, 'http://127.0.0.1:3456')
  assert.equal(messages[0].value.visible, false)
  callbacks.load()
  assert.equal(messages[1].value.visible, false, 'iframe load receives latest host state')
  assert.doesNotMatch(JSON.stringify([...messages, ...ready]), /private-capability|ignored/)
})

test('native links select only known views and leave unspecified preferences intact', () => {
  const uri = query => ({ scheme: 'cursor', authority: 'Makio64.theoffice', path: '/open', query, fragment: '' })
  assert.deepEqual(parseOfficeUri(uri(''), 'cursor'), {})
  assert.deepEqual(parseOfficeUri(uri('view=month&back=2'), 'cursor'), { view: 'month', back: 2 })
  for (const query of ['view=unknown', 'view=live&back=1', 'view=week&view=month', 'file=/private', 'back=NaN', 'view=month&back=1201']) {
    assert.throws(() => parseOfficeUri(uri(query), 'cursor'))
  }
})

test('sidebar, editor and restored panel retain one process while hidden and dispose it when closed', async () => {
  const commands = new Map(), servers = [], panels = []
  let provider, serializer, sidebar
  let completeStartup
  const initialReady = new Promise(resolve => { completeStartup = resolve })
  const tick = () => new Promise(resolve => setImmediate(resolve))
  function surface(isPanel) {
    const events = new EventEmitter()
    const host = { visible: true, webview: { options: {}, html: '', sent: [],
      postMessage(value) { this.sent.push(value); return Promise.resolve(true) },
      onDidReceiveMessage: callback => listen('message', callback),
    }, onDidDispose: callback => listen('dispose', callback),
    onDidChangeVisibility: callback => listen('visibility', callback),
    onDidChangeViewState: callback => listen('visibility', callback),
    setVisible(value) { this.visible = value; events.emit('visibility') },
    reveal() { this.setVisible(true) },
    close() { this.visible = false; events.emit('dispose') },
    }
    function listen(event, callback) { events.on(event, callback);return { dispose: () => events.off(event, callback) } }
    if (isPanel) host.dispose = host.close
    return host
  }
  const vscode = { env: { uriScheme: 'cursor' }, ViewColumn: { Active: -1 }, StatusBarAlignment: { Right: 2 },
    workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }), onDidChangeConfiguration: () => ({ dispose() {} }) },
    ThemeColor: class { constructor(id) { this.id = id } },
    commands: { registerCommand(id, callback) { commands.set(id, callback);return { dispose() {} } },
      async executeCommand(id) { if (id === 'theoffice.sidebar.focus') { if (!sidebar) { sidebar = surface(false);provider.resolveWebviewView(sidebar) } else sidebar.setVisible(true) } },
    }, window: {
      createWebviewPanel(_id, _title, column) { assert.equal(column, -1);const panel = surface(true);panels.push(panel);return panel },
      registerWebviewViewProvider(_id, value) { provider = value;return { dispose() {} } },
      registerWebviewPanelSerializer(_id, value) { serializer = value;return { dispose() {} } },
      registerUriHandler() { return { dispose() {} } },
      createStatusBarItem() { return { show() {}, dispose() {} } },
      // an unfocused window reads no headcount, so the test never runs the status line script
      state: { focused: false },
      onDidChangeWindowState: () => ({ dispose() {} }),
    },
  }
  const module = { exports: {} }
  const require = createRequire(import.meta.url)
  vm.runInNewContext(fs.readFileSync(new URL('../extensions/vscode/extension.cjs', import.meta.url), 'utf8'), { module, URL, URLSearchParams, setInterval, clearInterval, require(name) {
    if (name === 'vscode') return vscode
    if (name === './server.cjs') return { escapeHtml: String, paneHtml: value => value, launchDashboard() {
      const server = { ready: initialReady, kills: 0, dispose() { this.kills++ } }
      servers.push(server);return server
    } }
    return require(name)
  } })
  const context = { extensionPath: fileURLToPath(new URL('../extensions/vscode/', import.meta.url)), subscriptions: [] }
  module.exports.activate(context)
  try {
    await commands.get('theoffice.open')();await tick()
    sidebar.setVisible(false)
    completeStartup('http://127.0.0.1:12345/?token=synthetic');await tick()
    sidebar.setVisible(true);await tick()
    const original = sidebar.webview.html
    assert.match(original, /token=synthetic/, 'revealing a view hidden during startup still mounts the ready server')
    commands.get('theoffice.openEditor')();await tick()
    assert.equal(servers.length, 1)
    panels[0].dispose()
    sidebar.setVisible(false);await tick()
    assert.equal(servers[0].kills, 0)
    assert.equal(sidebar.webview.sent.at(-1).visible, false)
    sidebar.setVisible(true);await tick()
    assert.equal(servers.length, 1)
    assert.equal(sidebar.webview.html, original)
    assert.equal(sidebar.webview.sent.at(-1).visible, true)
    const restored = surface(true)
    await serializer.deserializeWebviewPanel(restored);await tick()
    assert.equal(servers.length, 1)
    sidebar.close()
    assert.equal(servers[0].kills, 0)
    restored.dispose()
    assert.equal(servers[0].kills, 1)
  } finally { module.exports.deactivate() }
})

test('pane teardown force-stops a collector that ignores SIGTERM', async () => {
  const { child, handle } = harness({ stopTimeoutMs: 5 })
  child.stdout.write('http://127.0.0.1:1234/?token=test\n')
  await handle.ready
  handle.dispose()
  await new Promise(resolve => setTimeout(resolve, 15))
  assert.deepEqual(child.signals, ['SIGTERM', 'SIGKILL'])
})

test('normal server exit cancels forced teardown', async () => {
  const { child, handle } = harness({ stopTimeoutMs: 5 })
  child.stdout.write('http://127.0.0.1:1234/?token=test\n')
  await handle.ready
  handle.dispose()
  child.emit('exit', 0, null)
  await new Promise(resolve => setTimeout(resolve, 15))
  assert.deepEqual(child.signals, ['SIGTERM'])
})
