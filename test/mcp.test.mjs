import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import vm from 'node:vm'
import { createOfficeMcp, OFFICE_UI } from '../integrations/mcp/mcp-server.mjs'
import { startDashboard } from '../plugin/lib/dashboard.mjs'
import { fileURLToPath } from 'node:url'

function adapter() {
  let starts = 0
  const mcp = createOfficeMcp({ start: options => { starts++;return startDashboard({ ...options, renderer: async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', text: 'synthetic office' }) }) } })
  return { mcp, starts: () => starts }
}

test('MCP discovery has a native conversation entrypoint and starts no activity reader', async t => {
  const { mcp, starts } = adapter();t.after(() => mcp.close())
  const init = await mcp.request('initialize', { protocolVersion: '2025-11-25' })
  assert.equal(init.protocolVersion, '2025-11-25')
  const { tools } = await mcp.request('tools/list')
  assert.equal(tools[0].name, 'open_office')
  assert.equal(tools[0]._meta.ui.resourceUri, OFFICE_UI)
  assert.deepEqual(tools[0]._meta['openai/ui'].entrypoints, [{ type: 'thread' }, { type: 'global' }])
  assert.match(tools[0].icons?.[0]?.src ?? '', /^data:image\/png;base64,/, 'Codex lists the entrypoints with the plugin icon')
  assert.equal(tools[0].annotations.openWorldHint, false)
  assert.equal(starts(), 0)
})

test('MCP rejects arbitrary inputs before starting a server, and never exposes activity in tool output', async t => {
  const { mcp, starts } = adapter();t.after(() => mcp.close())
  for (const args of [{ file: '/private/session' }, { view: 'bad' }, { view: 'live', back: 1 }, { view: 'month', back: 1.2 }, { range: 'today' }]) {
    assert.equal((await mcp.request('tools/call', { name: 'open_office', arguments: args })).isError, true)
  }
  assert.equal(starts(), 0)
  const result = await mcp.request('tools/call', { name: 'open_office', arguments: { view: 'month', back: 2 } })
  assert.equal(result.structuredContent.view, 'month')
  assert.equal(new URL(result.structuredContent.url).searchParams.get('back'), '2')
  assert.doesNotMatch(JSON.stringify(result), /synthetic office|<svg/)
  assert.equal((await fetch(result.structuredContent.url)).status, 200)
})

test('MCP App resource shares its private loopback origin, bridges tool results, and closes cleanly', async t => {
  const { mcp, starts } = adapter();t.after(() => mcp.close())
  const { contents: [resource] } = await mcp.request('resources/read', { uri: OFFICE_UI })
  const opened = await mcp.request('tools/call', { name: 'open_office', arguments: { view: 'week' } })
  assert.equal(starts(), 1)
  assert.equal(resource.mimeType, 'text/html;profile=mcp-app')
  assert.deepEqual(resource._meta.ui.csp.frameDomains, [new URL(opened.structuredContent.url).origin])
  const code = /<script>([\s\S]*?)<\/script>/.exec(resource.text)[1]
  assert.doesNotThrow(() => new vm.Script(code))
  const messages = [], callbacks = {}, frame = {}, fallback = {}
  const parent = { postMessage: value => messages.push(value) }
  vm.runInNewContext(code, { URL, parent, window: { addEventListener: (name, callback) => { callbacks[name] = callback } }, document: { getElementById: id => id === 'office' ? frame : fallback } })
  assert.equal(messages[0].method, 'ui/initialize')
  callbacks.message({ source: parent, data: { jsonrpc: '2.0', id: 'office-init', result: { hostContext: {} } } })
  assert.equal(messages[1].method, 'ui/notifications/initialized')
  callbacks.message({ source: {}, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { url: opened.structuredContent.url } } } })
  assert.equal(frame.src, undefined, 'messages from nested content cannot control the frame')
  callbacks.message({ source: parent, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { url: opened.structuredContent.url } } } })
  assert.equal(frame.src, opened.structuredContent.url)
  callbacks.message({ source: parent, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { url: 'https://external.example/' } } } })
  assert.equal(frame.src, opened.structuredContent.url, 'tool data cannot redirect the panel to an external site')
  await mcp.close()
  await assert.rejects(fetch(opened.structuredContent.url))
})

test('actual stdio server frames requests, opens its installed runtime and exits on stdin close', async t => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../integrations/mcp/mcp.mjs', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'] })
  t.after(() => { if (child.exitCode === null) child.kill() })
  let buffer = '', stderr = ''
  const waiting = new Map()
  child.stderr.on('data', chunk => { stderr += chunk })
  child.stdout.on('data', chunk => {
    buffer += chunk
    let end
    while ((end = buffer.indexOf('\n')) !== -1) { const response = JSON.parse(buffer.slice(0, end));buffer = buffer.slice(end + 1);waiting.get(response.id)?.(response);waiting.delete(response.id) }
  })
  let id = 0
  const call = (method, params) => new Promise(resolve => { const current = ++id;waiting.set(current, resolve);child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: current, method, params }) + '\n') })
  const init = await call('initialize', { protocolVersion: '2025-03-26' })
  assert.equal(init.result.protocolVersion, '2025-03-26')
  const result = await call('tools/call', { name: 'open_office', arguments: {} })
  const url = result.result.structuredContent.url
  assert.equal((await fetch(url)).status, 200)
  assert.equal((await call('unknown/method')).error.code, -32601)
  const ended = once(child, 'exit')
  child.stdin.end()
  assert.deepEqual(await ended, [0, null])
  assert.equal(stderr, '')
  await assert.rejects(fetch(url))
})
