#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { startVoxelDashboard, VOXEL_VIEWS } from '../lib/voxel-dashboard.mjs'

export function voxelArgs(argv) {
  const options = { port: 0, open: false, demo: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--open') options.open = true
    else if (argv[i] === '--demo') options.demo = true
    else if (argv[i] === '--view') {
      // open on one of the pixel office's tabs: live, today, week, month, work or timelapse
      const view = argv[++i]
      if (!VOXEL_VIEWS.includes(view)) throw new Error(`--view must be one of ${VOXEL_VIEWS.join(', ')}`)
      options.view = view
    }
    else if (argv[i] === '--port') {
      const raw = argv[++i]
      if (!/^\d{1,5}$/.test(raw ?? '') || Number(raw) > 65535) throw new Error('--port must be an integer from 0 to 65535')
      options.port = Number(raw)
    } else throw new Error('Usage: node scripts/voxel.mjs [--port 0] [--open] [--demo] [--view live|today|week|month|work|timelapse]')
  }
  return options
}
function openBrowser(url) {
  if (process.env.THEOFFICE_NO_OPEN === '1') return
  const [command, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]]
  const child = spawn(command, args, { stdio: 'ignore', detached: true, windowsHide: true })
  child.on('error', () => process.stderr.write('The voxel office URL is ready; open it in your browser.\n'))
  child.unref()
}
export async function main(argv = process.argv.slice(2)) {
  const options = voxelArgs(argv)
  const app = await startVoxelDashboard(options)
  process.stdout.write(`${app.url}\n`)
  if (options.open) openBrowser(app.url)
  const stop = () => app.close().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}
let isMain = false
try { isMain = fs.realpathSync(process.argv[1] ?? '') === fs.realpathSync(fileURLToPath(import.meta.url)) } catch {}
if (isMain) main().catch(error => { process.stderr.write(`The Office / Voxel: ${error.message}\n`); process.exitCode = 1 })
