const path = require('node:path')
const fs = require('node:fs')
const { execFile } = require('node:child_process')
const { launchDashboard, escapeHtml, paneHtml } = require('./server.cjs')

const VIEW = 'theoffice.sidebar'
// The status bar's headcount: read again this often while the window has the focus, and at once when it gets it back
const HEADCOUNT_MS = 20_000
const HEADCOUNT_WIDTH = 48
const HEADCOUNT_TIMEOUT_MS = 5_000
let activeHost

/**
 * What the status bar item shows for a headcount from scripts/statusline.mjs --json: the line after the codicon, lit as
 * a warning while a desk needs the person (a hand up or an error), and a tooltip that says so. No headcount (no Node, a
 * failed read): the plain Office button.
 */
function headcountItem(line) {
  if (!line || typeof line.text !== 'string') return { text: '$(organization) Office', tooltip: 'Open The Office sidebar', warn: false }
  const words = line.text.replace(/^🏢\s*/u, '').replace(/\$\(/g, '$​(').replace(/[\r\n]+/g, ' ').slice(0, 120)
  const needs = (Number(line.asking) || 0) + (Number(line.errors) || 0)
  const ask = needs ? `${needs === 1 ? 'An agent needs' : `${needs} agents need`} you. ` : ''
  return { text: `$(organization) ${words}`, tooltip: `The Office: ${words}\n\n${ask}Click to open the live pane.`, warn: needs > 0 }
}

/** One headcount from the bundled status line script, or null. It never collects: it reads the shared answer. */
function readHeadcount(nodePath, script, run = execFile) {
  return new Promise(resolve => {
    try {
      run(nodePath, [script, '--json', '--width', String(HEADCOUNT_WIDTH)], { timeout: HEADCOUNT_TIMEOUT_MS, windowsHide: true, maxBuffer: 64 * 1024 }, (error, stdout) => {
        if (error) return resolve(null)
        try { resolve(JSON.parse(String(stdout).trim().split(/\r?\n/).at(-1))) } catch { resolve(null) }
      })
    } catch { resolve(null) }
  })
}

function parseOfficeUri(uri, scheme) {
  if (uri.scheme !== scheme || uri.authority.toLowerCase() !== 'makio64.theoffice' || uri.path !== '/open' || uri.fragment) {
    throw new Error('Unsupported The Office link.')
  }
  const params = new URLSearchParams(uri.query)
  for (const key of params.keys()) {
    if (!['view', 'range', 'back'].includes(key) || params.getAll(key).length !== 1) throw new Error('Invalid The Office link options.')
  }
  const view = params.get('view') ?? 'live'
  const range = params.get('range') ?? 'week'
  const raw = params.get('back') ?? '0'
  if (!['live', 'today', 'week', 'month', 'work', 'timelapse'].includes(view) || !['yesterday', 'week', 'month'].includes(range) || !/^(0|[1-9]\d{0,3})$/.test(raw)) {
    throw new Error('Invalid The Office view.')
  }
  const back = Number(raw)
  if (back > (view === 'month' ? 1200 : view === 'today' ? 3660 : 520) || ((view === 'live' || view === 'timelapse') && back)) {
    throw new Error('Invalid The Office calendar page.')
  }
  return Object.fromEntries([...params].map(([key, value]) => [key, key === 'back' ? back : value]))
}

function page(message, heading = '') {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:16px;font:13px/1.5 system-ui;color:var(--vscode-foreground);background:var(--vscode-editor-background)">${heading ? `<h2>${escapeHtml(heading)}</h2>` : ''}<p>${escapeHtml(message)}</p></body></html>`
}

function activate(context) {
  const vscode = require('vscode')
  const packed = path.join(context.extensionPath, 'runtime')
  const root = fs.existsSync(path.join(packed, 'scripts', 'dashboard.mjs')) ? packed : path.resolve(context.extensionPath, '../../plugin')
  const surfaces = new Set()
  let panel
  let sidebar
  let pendingSidebarSelection
  let server
  let disposed = false

  function releaseUnused() {
    if (server && ![...surfaces].some(surface => surface.server === server)) {
      const previous = server
      server = undefined
      previous.dispose()
    }
  }

  function ensureServer() {
    if (server) return server
    const current = launchDashboard({
      nodePath: vscode.workspace.getConfiguration('theoffice').get('nodePath', 'node'),
      script: path.join(root, 'scripts', 'dashboard.mjs'), root,
      onExit: () => {
        if (server === current) server = undefined
        for (const surface of surfaces) {
          if (surface.server !== current) continue
          surface.server = undefined
          surface.mounted = false
          if (surface.host.visible) surface.host.webview.html = page('Use The Office: Restart to reopen it.', 'The Office stopped')
        }
      },
    })
    server = current
    return current
  }

  async function render(surface, force = false) {
    if (disposed || surface.disposed) return
    if (!surface.host.visible) return
    if (surface.server && surface.mounted && !force) return
    surface.mounted = false
    surface.host.webview.html = page('Opening The Office…')
    let current
    try {
      current = ensureServer()
      surface.server = current
      const selection = surface.selection
      const url = await current.ready
      if (!disposed && !surface.disposed && surface.host.visible && surface.server === current && server === current) {
        const selected = new URL(url)
        for (const [key, value] of Object.entries(selection ?? {})) selected.searchParams.set(key, String(value))
        surface.host.webview.html = paneHtml(selected.href)
        surface.mounted = true
        if (surface.selection === selection) surface.selection = undefined
        notifyVisibility(surface)
      }
    } catch (error) {
      if (surface.server !== current || disposed || surface.disposed || !surface.host.visible) return
      surface.server = undefined
      releaseUnused()
      surface.host.webview.html = page(`${error.message} Use The Office: Restart to try again.`, 'The Office could not open')
    }
  }

  function notifyVisibility(surface) {
    if (!surface.disposed) void surface.host.webview.postMessage({ type: 'theoffice:visibility', visible: !!surface.host.visible })
  }

  function attach(host, isPanel, selection) {
    host.webview.options = { ...host.webview.options, enableScripts: true, localResourceRoots: [] }
    const surface = { host, isPanel, selection, server: undefined, mounted: false, disposed: false }
    surfaces.add(surface)
    const update = () => { notifyVisibility(surface);void render(surface) }
    const visibility = isPanel ? host.onDidChangeViewState(update) : host.onDidChangeVisibility(update)
    const messages = host.webview.onDidReceiveMessage(message => {
      if (message?.type === 'theoffice:ready') notifyVisibility(surface)
    })
    let cleanup
    surface.dispose = () => {
      if (surface.disposed) return
      surface.disposed = true
      surface.server = undefined
      surfaces.delete(surface)
      visibility.dispose()
      messages.dispose()
      cleanup?.dispose()
      if (panel === host) panel = undefined
      if (sidebar === surface) sidebar = undefined
      releaseUnused()
    }
    cleanup = host.onDidDispose(surface.dispose)
    void render(surface)
    return surface
  }

  function openEditor() {
    if (panel) {
      panel.reveal(vscode.ViewColumn.Active)
      const surface = [...surfaces].find(item => item.host === panel)
      if (surface) void render(surface)
      return
    }
    panel = vscode.window.createWebviewPanel('theoffice', 'The Office', vscode.ViewColumn.Active, {
      enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [],
    })
    attach(panel, true)
  }

  const openSidebar = async selection => {
    const existing = sidebar
    if (selection && existing) existing.selection = selection
    else if (selection) pendingSidebarSelection = selection
    await vscode.commands.executeCommand(`${VIEW}.focus`)
    if (selection && existing && sidebar === existing) await render(existing, true)
  }
  const restart = async () => {
    const previous = server
    server = undefined
    for (const surface of surfaces) surface.server = undefined
    previous?.dispose()
    const visible = [...surfaces].filter(surface => surface.host.visible)
    if (visible.length) await Promise.all(visible.map(render))
    else await openSidebar()
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('theoffice.open', () => openSidebar()),
    vscode.commands.registerCommand('theoffice.openEditor', openEditor),
    vscode.commands.registerCommand('theoffice.openSidebar', () => openSidebar()),
    vscode.commands.registerCommand('theoffice.restart', restart),
    vscode.window.registerWebviewViewProvider(VIEW, { resolveWebviewView(view) {
      const selection = pendingSidebarSelection
      pendingSidebarSelection = undefined
      sidebar = attach(view, false, selection)
    } }, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewPanelSerializer('theoffice', { async deserializeWebviewPanel(restored) {
      panel = restored
      attach(restored, true)
    } }),
    vscode.window.registerUriHandler({ async handleUri(uri) {
      try { await openSidebar(parseOfficeUri(uri, vscode.env.uriScheme)) } catch (error) {
        void vscode.window.showErrorMessage(error.message)
      }
    } }),
  )
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 20)
  status.name = 'The Office'
  status.command = 'theoffice.open'
  const showHeadcount = line => {
    const item = headcountItem(line)
    status.text = item.text
    status.tooltip = item.tooltip
    status.backgroundColor = item.warn ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined
  }
  showHeadcount(null)
  status.show()
  context.subscriptions.push(status)

  // The same headcount as Claude Code's status line, read while this window has the focus: an unfocused window asks
  // for nothing, and catches up the moment it is focused again.
  let reading = false
  const statusScript = path.join(root, 'scripts', 'statusline.mjs')
  const updateHeadcount = async () => {
    if (disposed || reading || !vscode.window.state.focused) return
    const config = vscode.workspace.getConfiguration('theoffice')
    if (!config.get('statusBarHeadcount', true) || !fs.existsSync(statusScript)) return showHeadcount(null)
    reading = true
    try {
      const line = await readHeadcount(config.get('nodePath', 'node'), statusScript)
      if (!disposed) showHeadcount(line)
    } finally { reading = false }
  }
  const headcountTimer = setInterval(() => void updateHeadcount(), HEADCOUNT_MS)
  headcountTimer.unref?.()
  context.subscriptions.push(
    { dispose: () => clearInterval(headcountTimer) },
    vscode.window.onDidChangeWindowState(state => { if (state.focused) void updateHeadcount() }),
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration('theoffice')) void updateHeadcount() }),
  )
  void updateHeadcount()

  const host = { dispose() {
    if (disposed) return
    disposed = true
    clearInterval(headcountTimer)
    for (const surface of [...surfaces]) {
      surface.dispose()
      if (surface.isPanel) surface.host.dispose()
    }
    server?.dispose()
    server = undefined
    if (activeHost === host) activeHost = undefined
  } }
  activeHost = host
  context.subscriptions.push(host)
}

function deactivate() {
  activeHost?.dispose()
}

module.exports = { activate, deactivate, parseOfficeUri, headcountItem, readHeadcount }
