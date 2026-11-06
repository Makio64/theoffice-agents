const path = require('node:path')
const fs = require('node:fs')
const { launchDashboard, escapeHtml, paneHtml } = require('./server.cjs')
let panel
let processHandle

function activate(context) {
  const vscode = require('vscode')
  context.subscriptions.push(vscode.commands.registerCommand('theofficeVoxel.open', async () => {
    if (panel) { panel.reveal(vscode.ViewColumn.Beside); return }
    const current = vscode.window.createWebviewPanel('theofficeVoxel', 'The Office / Voxel', vscode.ViewColumn.Beside, {
      enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [],
    })
    panel = current
    current.webview.html = '<!doctype html><body style="font:14px system-ui;color:#334337;background:#f4f3ed">Opening your voxel office…</body>'
    const packed = path.join(context.extensionPath, 'runtime')
    const root = fs.existsSync(path.join(packed, 'scripts', 'voxel.mjs')) ? packed : path.resolve(context.extensionPath, '../../plugin')
    let handle
    current.onDidDispose(() => {
      handle?.dispose()
      if (processHandle === handle) processHandle = undefined
      if (panel === current) panel = undefined
    }, null, context.subscriptions)
    try {
      handle = launchDashboard({
        nodePath: vscode.workspace.getConfiguration('theofficeVoxel').get('nodePath', 'node'),
        script: path.join(root, 'scripts', 'voxel.mjs'), root,
        onExit: () => { if (panel === current) current.webview.html = '<!doctype html><body>The voxel office stopped. Close and reopen this pane to restart it.</body>' },
      })
      processHandle = handle
      const url = await handle.ready
      if (panel === current) current.webview.html = paneHtml(url)
    } catch (error) {
      handle?.dispose()
      if (panel === current) {
        current.webview.html = `<!doctype html><body style="font:14px system-ui"><h2>The voxel office could not open</h2><p>${escapeHtml(error.message)}</p></body>`
        void vscode.window.showErrorMessage(error.message)
      }
    }
  }))
  context.subscriptions.push({ dispose: deactivate })
}
function deactivate() { processHandle?.dispose(); processHandle = undefined; panel?.dispose(); panel = undefined }
module.exports = { activate, deactivate }
