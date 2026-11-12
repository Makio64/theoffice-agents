#!/usr/bin/env node
// Stage only the editor adapter and dependency-free runtime; marketing/promo files never enter the VSIX.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'theoffice-editor-'))
try {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
  const adapter = JSON.parse(await fs.readFile(path.join(root, 'extensions/vscode/package.json'), 'utf8'))
  adapter.version = manifest.version
  // the listing's icon, the plugins' own (assets/icon.png)
  adapter.icon = 'icon.png'
  adapter.files = [...new Set([...(adapter.files ?? []), 'icon.png'])]
  await fs.cp(path.join(root, 'extensions/vscode'), stage, { recursive: true })
  await fs.copyFile(path.join(root, 'plugin/assets/icon.png'), path.join(stage, 'icon.png'))
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify(adapter, null, 2) + '\n')
  await fs.copyFile(path.join(root, 'LICENSE'), path.join(stage, 'LICENSE'))
  await fs.mkdir(path.join(stage, 'runtime/scripts'), { recursive: true })
  await fs.cp(path.join(root, 'plugin/lib'), path.join(stage, 'runtime/lib'), { recursive: true, filter: file => !file.endsWith('.d.mts') })
  await fs.cp(path.join(root, 'plugin/themes'), path.join(stage, 'runtime/themes'), { recursive: true })
  for (const script of ['office.mjs', 'dashboard.mjs', 'statusline.mjs']) await fs.copyFile(path.join(root, 'plugin/scripts', script), path.join(stage, 'runtime/scripts', script))
  const dist = path.join(root, 'dist')
  await fs.mkdir(dist, { recursive: true })
  const out = path.join(dist, `theoffice-${manifest.version}.vsix`)
  const args = ['--yes', '--package', '@vscode/vsce@4.1.0', 'vsce', 'package', '--no-dependencies', '--out', out]
  let command = 'npx'
  if (process.platform === 'win32') {
    // .cmd shims cannot be spawned without a shell on Windows. Run npm's JS entry directly.
    const npmBin = process.env.npm_execpath ? path.dirname(process.env.npm_execpath) : path.join(path.dirname(process.execPath), 'node_modules/npm/bin')
    const npx = path.join(npmBin, 'npx-cli.js')
    await fs.access(npx)
    command = process.execPath
    args.unshift(npx)
  }
  const code = await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: stage, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', resolve)
  })
  if (code !== 0) throw new Error(`VSIX packaging exited with code ${code}`)
  process.stdout.write(`${out}\n`)
} finally {
  await fs.rm(stage, { recursive: true, force: true })
}
