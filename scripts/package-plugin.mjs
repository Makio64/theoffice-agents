#!/usr/bin/env node
// Stage the portable skill and runtime only; each host's native UI adapter stays in its own package.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fs.realpathSync(fileURLToPath(new URL('../', import.meta.url)))
const DEFAULT_OUTPUT = path.join(ROOT, 'dist/theoffice-plugin')
const MARKER = '.theoffice-package'
const OWNERSHIP = 'theoffice-portable-plugin/1\n'
// The skills only the other hosts load, laid beside skills/ in the bundle. Claude Code makes every folder of the
// plugin's own skills/ a command /theoffice:<folder>, and a `theoffice` one takes /theoffice from the desktop pane's
// command (hooks/register.tsx): the short `theoffice` skill lives here instead.
const HOST_SKILLS = 'integrations/skills'

function inside(parent, child) {
  const relative = path.relative(parent, child)
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
}

function checkLocation(output) {
  if (inside(output, ROOT) || ['plugin', 'scripts', 'integrations', '.agents', '.antigravity-plugin', '.cursor-plugin', '.claude-plugin', '.git'].some((dir) => inside(path.join(ROOT, dir), output))) {
    throw new Error('Choose an output directory outside the source files')
  }
}

function ownedOutput(output) {
  let stat
  try { stat = fs.lstatSync(output) } catch (error) { if (error.code === 'ENOENT') return false;throw error }
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    try {
      const marker = fs.lstatSync(path.join(output, MARKER))
      const manifest = fs.lstatSync(path.join(output, 'plugin.json'))
      if (marker.isFile() && manifest.isFile() &&
          fs.readFileSync(path.join(output, MARKER), 'utf8') === OWNERSHIP &&
          JSON.parse(fs.readFileSync(path.join(output, 'plugin.json'), 'utf8')).name === 'theoffice') return true
    } catch {}
  }
  throw new Error(`Refusing to replace an unrelated output: ${output}`)
}

function copyFile(source, target) {
  if (!fs.lstatSync(source).isFile()) throw new Error(`Expected a regular package file: ${source}`)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target)
}

function copyTree(source, target, library = false) {
  if (!fs.lstatSync(source).isDirectory()) throw new Error(`Expected a regular package directory: ${source}`)
  fs.mkdirSync(target, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || /\.(log|tmp)$/.test(entry.name)) continue
    const from = path.join(source, entry.name)
    const to = path.join(target, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Package source contains a symbolic link: ${from}`)
    if (entry.isDirectory()) copyTree(from, to, library)
    else if (!library || entry.name.endsWith('.mjs')) copyFile(from, to)
  }
}

function json(source) { return JSON.parse(fs.readFileSync(path.join(ROOT, source), 'utf8')) }
function writeJson(stage, file, value) {
  const target = path.join(stage, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n')
}

export function packagePlugin(destination = DEFAULT_OUTPUT) {
  let output = path.resolve(destination)
  checkLocation(output)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  output = path.join(fs.realpathSync(path.dirname(output)), path.basename(output))
  checkLocation(output)
  ownedOutput(output)
  const stage = fs.mkdtempSync(path.join(path.dirname(output), '.theoffice-plugin-stage-'))
  let backup = null
  let preserveBackup = false
  try {
    const { version } = json('package.json')
    writeJson(stage, 'plugin.json', { ...json('plugin.json'), version })
    writeJson(stage, '.antigravity-plugin/plugin.json', { ...json('.antigravity-plugin/plugin.json'), version })
    writeJson(stage, '.agents/plugins/marketplace.json', json('.agents/plugins/marketplace.json'))
    if (fs.existsSync(path.join(ROOT, '.cursor-plugin/plugin.json'))) writeJson(stage, '.cursor-plugin/plugin.json', { ...json('.cursor-plugin/plugin.json'), version })
    copyFile(path.join(ROOT, 'mcp.json'), path.join(stage, 'mcp.json'))
    copyTree(path.join(ROOT, 'integrations/antigravity'), path.join(stage, 'integrations/antigravity'))
    copyFile(path.join(ROOT, 'integrations/antigravity/sidecar.json'), path.join(stage, 'sidecars/office/sidecar.json'))
    if (fs.existsSync(path.join(ROOT, 'integrations/cursor'))) copyTree(path.join(ROOT, 'integrations/cursor'), path.join(stage, 'integrations/cursor'))
    copyTree(path.join(ROOT, 'plugin/skills'), path.join(stage, 'skills'))
    for (const entry of fs.readdirSync(path.join(ROOT, HOST_SKILLS), { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const target = path.join(stage, 'skills', entry.name)
      if (fs.existsSync(target)) throw new Error(`Two skills are named ${entry.name}: one in plugin/skills/, one in ${HOST_SKILLS}/`)
      copyTree(path.join(ROOT, HOST_SKILLS, entry.name), target)
    }
    copyTree(path.join(ROOT, 'plugin/lib'), path.join(stage, 'lib'), true)
    for (const script of ['office.mjs', 'dashboard.mjs', 'statusline.mjs']) {
      copyFile(path.join(ROOT, 'plugin/scripts', script), path.join(stage, 'scripts', script))
      fs.chmodSync(path.join(stage, 'scripts', script), 0o755)
    }
    // the MCP server the other hosts run, kept out of the Claude Code plugin: its launcher and the server beside it
    copyFile(path.join(ROOT, 'integrations/mcp/mcp.mjs'), path.join(stage, 'scripts/mcp.mjs'))
    fs.chmodSync(path.join(stage, 'scripts/mcp.mjs'), 0o755)
    copyFile(path.join(ROOT, 'integrations/mcp/mcp-server.mjs'), path.join(stage, 'scripts/mcp-server.mjs'))
    for (const [from, to] of [['plugin/README.md', 'README.md'], ['LICENSE', 'LICENSE'], ['plugin/assets/icon.png', 'assets/icon.png']]) copyFile(path.join(ROOT, from), path.join(stage, to))
    fs.writeFileSync(path.join(stage, MARKER), OWNERSHIP)

    if (ownedOutput(output)) {
      backup = fs.mkdtempSync(path.join(path.dirname(output), '.theoffice-plugin-backup-'))
      fs.renameSync(output, path.join(backup, 'previous'))
      preserveBackup = true
    }
    try { fs.renameSync(stage, output) } catch (error) {
      if (backup) {
        try { fs.renameSync(path.join(backup, 'previous'), output);preserveBackup = false } catch {
          throw new Error(`Could not finish packaging or restore the prior package; it remains at ${path.join(backup, 'previous')}`, { cause: error })
        }
      }
      throw error
    }
    preserveBackup = false
    return output
  } finally {
    fs.rmSync(stage, { recursive: true, force: true })
    if (backup && !preserveBackup) fs.rmSync(backup, { recursive: true, force: true })
  }
}

export function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) {
    process.stdout.write('Usage: node scripts/package-plugin.mjs [output-directory]\n')
    return
  }
  if (argv.length > 1 || argv[0]?.startsWith('-')) throw new Error('Usage: node scripts/package-plugin.mjs [output-directory]')
  process.stdout.write(packagePlugin(argv[0]) + '\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { process.stderr.write(`The Office: ${error.message}\n`);process.exitCode = 1 }
}
