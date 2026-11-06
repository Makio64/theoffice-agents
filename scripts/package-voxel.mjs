#!/usr/bin/env node
// Package the independent editor adapter and portable agent plugin with the prebuilt local WebGPU UI.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { crc32, deflateRawSync } from 'node:zlib'
const root = fileURLToPath(new URL('../', import.meta.url))
const MARKER = '.theoffice-voxel-package'
const OWNERSHIP = 'theoffice-voxel-portable-plugin/1\n'

async function run(command, args, cwd) {
  const code = await new Promise((resolve, reject) => { const child = spawn(command, args, { cwd, stdio: 'inherit', windowsHide: true }); child.once('error', reject); child.once('exit', resolve) })
  if (code !== 0) throw new Error(`${command} exited with code ${code}`)
}
async function copyRuntime(destination) {
  await fs.mkdir(path.join(destination, 'scripts'), { recursive: true })
  await fs.cp(path.join(root, 'plugin/lib'), path.join(destination, 'lib'), { recursive: true, filter: file => !file.endsWith('.d.mts') })
  await fs.copyFile(path.join(root, 'plugin/scripts/voxel.mjs'), path.join(destination, 'scripts/voxel.mjs'))
  await fs.chmod(path.join(destination, 'scripts/voxel.mjs'), 0o755)
  await fs.cp(path.join(root, 'dist/voxel'), path.join(destination, 'dist/voxel'), { recursive: true })
}

/** A standard UTF-8 ZIP writer, using only Node's built-in CRC and deflate implementations. */
export async function writeVoxelZip(directory, output) {
  const entries = []
  async function visit(current, prefix) {
    for (const entry of (await fs.readdir(current, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const source = path.join(current, entry.name)
      const name = `${prefix}/${entry.name}`
      if (entry.isSymbolicLink()) throw new Error('Cannot package symbolic links')
      if (entry.isDirectory()) await visit(source, name)
      else if (entry.isFile()) entries.push({ source, name })
    }
  }
  await visit(directory, path.basename(directory))
  if (entries.length > 65535) throw new Error('Plugin ZIP has too many files')
  const local = [], central = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const body = await fs.readFile(entry.source)
    const compressed = deflateRawSync(body)
    const checksum = crc32(body)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6); header.writeUInt16LE(8, 8)
    header.writeUInt16LE(33, 12) // 1980-01-01, deterministic ZIP timestamp
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(body.length, 22); header.writeUInt16LE(name.length, 26)
    local.push(header, name, compressed)
    const record = Buffer.alloc(46)
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(0x0314, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x0800, 8); record.writeUInt16LE(8, 10)
    record.writeUInt16LE(33, 14)
    record.writeUInt32LE(checksum, 16); record.writeUInt32LE(compressed.length, 20); record.writeUInt32LE(body.length, 24); record.writeUInt16LE(name.length, 28)
    const mode = entry.name.endsWith('/scripts/voxel.mjs') ? 0o100755 : 0o100644
    record.writeUInt32LE((mode << 16) >>> 0, 38); record.writeUInt32LE(offset, 42)
    central.push(record, name)
    offset += header.length + name.length + compressed.length
  }
  const directoryBody = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directoryBody.length, 12); end.writeUInt32LE(offset, 16)
  await fs.writeFile(output, Buffer.concat([...local, directoryBody, end]))
  return output
}

export async function packageVoxel() {
  await fs.access(path.join(root, 'dist/voxel/index.html')).catch(() => { throw new Error('Run npm run build:voxel before packaging') })
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'theoffice-voxel-'))
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'))
    const adapter = JSON.parse(await fs.readFile(path.join(root, 'extensions/voxel/package.json'), 'utf8'))
    adapter.version = manifest.version
    const editor = path.join(stage, 'editor')
    await fs.cp(path.join(root, 'extensions/voxel'), editor, { recursive: true, filter: file => path.basename(file) !== 'agent-plugin' })
    await fs.writeFile(path.join(editor, 'package.json'), JSON.stringify(adapter, null, 2) + '\n')
    await fs.copyFile(path.join(root, 'LICENSE'), path.join(editor, 'LICENSE'))
    await copyRuntime(path.join(editor, 'runtime'))
    const vsix = path.join(root, 'dist', `theoffice-voxel-${manifest.version}.vsix`)
    const args = ['--yes', '--package', '@vscode/vsce@4.1.0', 'vsce', 'package', '--no-dependencies', '--out', vsix]
    let command = 'npx'
    if (process.platform === 'win32') {
      const npmBin = process.env.npm_execpath ? path.dirname(process.env.npm_execpath) : path.join(path.dirname(process.execPath), 'node_modules/npm/bin')
      const npx = path.join(npmBin, 'npx-cli.js')
      await fs.access(npx)
      command = process.execPath
      args.unshift(npx)
    }
    await run(command, args, editor)
    const agent = path.join(stage, 'theoffice-voxel-plugin')
    await fs.cp(path.join(root, 'extensions/voxel/agent-plugin'), agent, { recursive: true })
    for (const file of ['plugin.json', '.claude-plugin/plugin.json']) {
      const value = JSON.parse(await fs.readFile(path.join(agent, file), 'utf8'))
      value.version = manifest.version
      await fs.writeFile(path.join(agent, file), JSON.stringify(value, null, 2) + '\n')
    }
    await fs.copyFile(path.join(root, 'LICENSE'), path.join(agent, 'LICENSE'))
    await copyRuntime(agent)
    await fs.writeFile(path.join(agent, MARKER), OWNERSHIP)
    const zip = path.join(root, 'dist', `theoffice-voxel-plugin-${manifest.version}.zip`)
    await writeVoxelZip(agent, zip)
    const unpacked = path.join(root, 'dist/theoffice-voxel-plugin')
    try {
      const stat = await fs.lstat(unpacked)
      const ownership = await fs.readFile(path.join(unpacked, MARKER), 'utf8').catch(() => null)
      if (!stat.isDirectory() || stat.isSymbolicLink() || ownership !== OWNERSHIP) throw new Error(`Refusing to replace unrelated output: ${unpacked}`)
      await fs.rm(unpacked, { recursive: true })
    } catch (error) { if (error.code !== 'ENOENT') throw error }
    await fs.cp(agent, unpacked, { recursive: true })
    return { vsix, zip, directory: unpacked }
  } finally { await fs.rm(stage, { recursive: true, force: true }) }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  packageVoxel().then(result => { for (const output of Object.values(result)) process.stdout.write(`${output}\n`) }).catch(error => { process.stderr.write(`The Office / Voxel: ${error.message}\n`); process.exitCode = 1 })
}
