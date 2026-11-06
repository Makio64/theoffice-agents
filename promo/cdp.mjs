// One headless Chrome driven over the DevTools protocol, for every picture of a storyboard (and, later, every frame of a
// video): a page is loaded, its drawings paused at their time (window.ready), and the viewport saved as a PNG
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export async function browser() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-promo-'))
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--allow-file-access-from-files', `--user-data-dir=${dir}`, '--remote-debugging-port=0', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
  const url = await new Promise((resolve, reject) => {
    let log = ''
    proc.stderr.on('data', (d) => { log += d; const m = log.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]) })
    proc.on('exit', () => reject(new Error(`Chrome exited:\n${log}`)))
    setTimeout(() => reject(new Error('Chrome did not start')), 20000)
  })
  const ws = new WebSocket(url)
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0
  const pending = new Map()
  const listeners = new Set()
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    const wait = pending.get(msg.id)
    if (wait) { pending.delete(msg.id); msg.error ? wait.reject(new Error(msg.error.message)) : wait.resolve(msg.result) } else for (const l of listeners) l(msg)
  })
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params, sessionId }))
  })
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
  const page = (method, params) => send(method, params, sessionId)
  await page('Page.enable')
  const loaded = () => new Promise((resolve) => {
    const l = (msg) => { if (msg.sessionId === sessionId && msg.method === 'Page.loadEventFired') { listeners.delete(l); resolve() } }
    listeners.add(l)
  })

  /** `file` (an HTML page) → `out` (PNG) at width × height CSS px; `full` grows the shot to the page's whole height. */
  async function shoot(file, out, { width, height, scale = 1, full = false }) {
    await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false })
    const done = loaded()
    await page('Page.navigate', { url: `file://${path.resolve(file)}` })
    await done
    await page('Runtime.evaluate', { expression: 'window.ready ? window.ready() : 0', awaitPromise: true })
    let clip
    if (full) {
      const { result } = await page('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight' })
      clip = { x: 0, y: 0, width, height: result.value, scale: 1 }
    }
    const { data } = await page('Page.captureScreenshot', { format: 'png', ...(clip && { clip, captureBeyondViewport: true }) })
    fs.writeFileSync(out, Buffer.from(data, 'base64'))
  }
  /** Load `url` at width × height and wait for it; `evaluate` then runs an expression in it (awaited, by value). */
  async function open(url, { width, height, scale = 1 }) {
    await page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false })
    const done = loaded()
    await page('Page.navigate', { url })
    await done
  }
  /** The viewport, resized. */
  const resize = (width, height, scale = 1) => page('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false })
  /** The viewport now, as PNG bytes. */
  async function capture() {
    const { data } = await page('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })
    return Buffer.from(data, 'base64')
  }
  async function evaluate(expression) {
    const { result, exceptionDetails } = await page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
    return result.value
  }
  async function close() {
    ws.close()
    const gone = new Promise((r) => proc.once('exit', r))
    proc.kill()
    await gone
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  }
  return { shoot, open, resize, capture, evaluate, close }
}
