// The editor owns this foreground process; disposing the pane always stops it.
const { spawn } = require('node:child_process')

function launchDashboard({ nodePath, script, root, spawnImpl = spawn, timeoutMs = 10000, stopTimeoutMs = 2000, onExit = () => {} }) {
  const child = spawnImpl(nodePath, [script, '--port', '0'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stopped = false
  let settled = false
  let output = ''
  let errors = ''
  let timer
  let killTimer
  let exited = false
  let rejectReady
  function dispose() {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    if (!settled) {
      settled = true
      rejectReady(new Error('The Office pane was closed.'))
    }
    if (!exited) {
      child.kill('SIGTERM')
      // Cold transcript scans can delay signal handling. Never leave a hidden collector behind.
      killTimer = setTimeout(() => { if (!exited) child.kill('SIGKILL') }, stopTimeoutMs)
      killTimer.unref?.()
    }
  }
  const ready = new Promise((resolve, reject) => {
    rejectReady = reject
    const fail = error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
      dispose()
    }
    child.once('error', error => fail(new Error(`Could not start Node.js: ${error.message}. Set theofficeVoxel.nodePath to Node.js 24 or newer.`)))
    child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-2000) })
    child.stdout.on('data', chunk => {
      if (settled) return
      output += chunk
      if (output.length > 8192) return fail(new Error('The Office server returned an invalid address.'))
      const line = output.split(/\r?\n/)[0]
      if (!output.includes('\n')) return
      try {
        const url = new URL(line)
        if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || !url.searchParams.get('token')) throw new Error()
        settled = true
        clearTimeout(timer)
        resolve(url.href)
      } catch { fail(new Error('The Office server returned an invalid address.')) }
    })
    child.once('exit', (code, signal) => {
      exited = true
      clearTimeout(killTimer)
      if (!settled) fail(new Error(`The Office server exited (${code ?? signal}). ${errors.trim()}`))
      else if (!stopped) onExit()
    })
    timer = setTimeout(() => fail(new Error('The Office server did not start. Check that Node.js 24 or newer is installed.')), timeoutMs)
  })
  return { ready, dispose }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function paneHtml(url) {
  const source = new URL(url).origin
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${escapeHtml(source)}; style-src 'unsafe-inline';"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;overflow:hidden;background:#080d23}</style></head><body><iframe title="The Office / Voxel" src="${escapeHtml(url)}" allow="webgpu; clipboard-write" sandbox="allow-scripts allow-same-origin allow-downloads allow-popups allow-popups-to-escape-sandbox"></iframe></body></html>`
}

module.exports = { launchDashboard, escapeHtml, paneHtml }
