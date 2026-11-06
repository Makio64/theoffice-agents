// Antigravity App's side pane: the sidecar listens on the port the App names and takes the App's own token, as the App
// frames it (`<path>?token=<ui token>&conversationId=<id>`, from its sidecar preload script).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { startDashboard } from '../plugin/lib/dashboard.mjs'
import { paneOf, readReady, startSidecar } from '../integrations/antigravity/sidecar.mjs'

const drawing = { svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>live</text></svg>', text: 'live text', label: 'Now', status: 'Office empty', generatedAt: '2026-11-07T00:00:00Z' }
const APP_TOKEN = 'app-ui-token-0123456789abcdef'

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

test('the App names the pane: its port and token, or no pane at all', () => {
  assert.equal(paneOf({}), null)
  assert.deepEqual(paneOf({ ANTIGRAVITY_SIDECAR_WEB_PORT: '43123', ANTIGRAVITY_SIDECAR_UI_TOKEN: 't' }), { port: 43123, token: 't' })
  assert.deepEqual(paneOf({ ANTIGRAVITY_SIDECAR_WEB_PORT: '43123', ANTIGRAVITY_SIDECAR_AUTH_TOKEN: 'a' }), { port: 43123, token: 'a' })
  for (const port of ['0', '70000', '12ab', '-1']) assert.throws(() => paneOf({ ANTIGRAVITY_SIDECAR_WEB_PORT: port }))
})

test('the side pane loads on the App port with the App token and its conversation id', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-pane-'))
  const port = await freePort()
  const sidecar = await startSidecar({
    dataDir: dir, pane: { port, token: APP_TOKEN },
    start: (options) => startDashboard({ ...options, renderer: async () => drawing, preferenceFile: path.join(dir, 'prefs.json') }),
  })
  t.after(async () => { await sidecar.stop();fs.rmSync(dir, { recursive: true, force: true }) })

  const ready = readReady(dir)
  assert.equal(ready.pane, port)
  assert.equal(new URL(ready.url).port, String(port), 'the browser link and the pane are one server')

  for (const host of ['127.0.0.1', 'localhost']) {
    const page = await fetch(`http://${host}:${port}/?token=${APP_TOKEN}&conversationId=c-123`)
    assert.equal(page.status, 200, `the pane loads as ${host}`)
    const html = await page.text()
    assert.match(html, /<title>The Office<\/title>/)
    assert.doesNotMatch(html, /Stop dashboard/, 'the App owns the sidecar: the pane cannot stop it')
  }
  const snapshot = await fetch(`http://127.0.0.1:${port}/snapshot?token=${APP_TOKEN}&view=live`)
  assert.equal(snapshot.status, 200)
  assert.equal((await snapshot.json()).text, 'live text')
  assert.equal((await fetch(ready.url)).status, 200, 'our own token still opens it in the browser')

  assert.equal((await fetch(`http://127.0.0.1:${port}/?token=wrong-token-0123456789&conversationId=c`)).status, 403)
  assert.equal((await fetch(`http://127.0.0.1:${port}/?token=${APP_TOKEN}&other=1`)).status, 400, 'only the fields the App adds are let through')
  const post = await fetch(`http://localhost:${port}/preferences?token=${APP_TOKEN}`, { method: 'POST', headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' }, body: '{}' })
  assert.equal(post.status, 403)
})

test('a pane is served even when a browser endpoint of another run is still alive', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-pane-'))
  const start = (options) => startDashboard({ ...options, renderer: async () => drawing, preferenceFile: path.join(dir, 'prefs.json') })
  const browser = await startSidecar({ dataDir: dir, pane: null, start })
  const port = await freePort()
  const pane = await startSidecar({ dataDir: dir, pane: { port, token: APP_TOKEN }, start }).catch((error) => error)
  t.after(async () => { await browser.stop();if (!(pane instanceof Error)) await pane.stop();fs.rmSync(dir, { recursive: true, force: true }) })
  // the browser run holds no lock once it is ready, so the pane starts on its own port
  assert.ok(!(pane instanceof Error), String(pane))
  assert.equal(pane.reused, false)
  assert.equal((await fetch(`http://127.0.0.1:${port}/?token=${APP_TOKEN}`)).status, 200)
})

test('a host token must be long and printable', async () => {
  await assert.rejects(startDashboard({ hostTokens: ['short'], renderer: async () => drawing }), /16 to 512/)
  await assert.rejects(startDashboard({ hostTokens: ['has space in the token 1234'], renderer: async () => drawing }), /16 to 512/)
})
