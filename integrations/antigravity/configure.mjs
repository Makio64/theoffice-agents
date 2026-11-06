#!/usr/bin/env node
// Change only this plugin's opt-in sidecar setting; retain a private backup of that setting, not the user's config.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SIDECAR_ID, atomicJson, defaultDataDir, privateDataDir, readReady, readyIsLive, stopReady } from './sidecar.mjs'

const BACKUP_SPEC = 'theoffice-antigravity-setting/1'
const defaults = () => ({ configFile: path.join(os.homedir(), '.gemini/config/config.json'), dataDir: defaultDataDir() })

function readConfig(file) {
  let text = ''
  let mode = 0o600
  try {
    const stat = fs.lstatSync(file)
    if (!stat.isFile()) throw new Error('Antigravity config must be a regular JSON file')
    mode = stat.mode & 0o777
    text = fs.readFileSync(file, 'utf8')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const data = text ? JSON.parse(text) : {}
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      (Object.hasOwn(data, 'sidecars') && (!data.sidecars || typeof data.sidecars !== 'object' || Array.isArray(data.sidecars)))) throw new Error('Invalid Antigravity sidecar settings')
  const entry = data.sidecars?.[SIDECAR_ID]
  if (Object.hasOwn(data.sidecars ?? {}, SIDECAR_ID) && (!entry || typeof entry !== 'object' || Array.isArray(entry))) throw new Error('Invalid existing Office sidecar setting')
  return { data, text, mode }
}

function writeConfig(file, original, data) {
  let latest = ''
  try { latest = fs.readFileSync(file, 'utf8') } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (latest !== original.text) throw new Error('Antigravity settings changed while updating; retry the command')
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  atomicJson(file, data, original.mode)
}

function readBackup(file) {
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.size > 16_384) throw new Error('Invalid Office settings backup')
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (backup.spec !== BACKUP_SPEC || typeof backup.hadSidecars !== 'boolean' || typeof backup.existed !== 'boolean' ||
      (backup.existed && (!backup.previous || typeof backup.previous !== 'object' || Array.isArray(backup.previous)))) throw new Error('Unrecognized Office settings backup')
  return backup
}

export function configureSidecar(enabled, options = {}) {
  const { configFile, dataDir } = { ...defaults(), ...options }
  const original = readConfig(configFile)
  const old = original.data.sidecars?.[SIDECAR_ID]
  if (old?.enabled === enabled) return { enabled, changed: false }
  privateDataDir(dataDir)
  const backupFile = path.join(dataDir, 'setting-backup.json')
  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(backupFile, JSON.stringify({ spec: BACKUP_SPEC, hadSidecars: Object.hasOwn(original.data, 'sidecars'), existed: Object.hasOwn(original.data.sidecars ?? {}, SIDECAR_ID), previous: old ?? null }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  } else readBackup(backupFile)
  const next = { ...original.data, sidecars: { ...original.data.sidecars, [SIDECAR_ID]: { ...old, enabled } } }
  writeConfig(configFile, original, next)
  return { enabled, changed: true }
}

export function restoreSidecar(options = {}) {
  const { configFile, dataDir } = { ...defaults(), ...options }
  const file = path.join(dataDir, 'setting-backup.json')
  if (!fs.existsSync(file)) return { changed: false }
  const backup = readBackup(file)
  const original = readConfig(configFile)
  const next = { ...original.data, sidecars: { ...original.data.sidecars } }
  if (backup.existed) next.sidecars[SIDECAR_ID] = backup.previous
  else delete next.sidecars[SIDECAR_ID]
  if (!backup.hadSidecars && !Object.keys(next.sidecars).length) delete next.sidecars
  writeConfig(configFile, original, next)
  fs.unlinkSync(file)
  return { changed: true }
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || !['enable', 'disable', 'restore', 'status'].includes(argv[0])) throw new Error('Usage: node integrations/antigravity/configure.mjs <enable|disable|restore|status>')
  if (argv[0] === 'status') {
    const { configFile, dataDir } = defaults()
    const enabled = readConfig(configFile).data.sidecars?.[SIDECAR_ID]?.enabled === true
    process.stdout.write(JSON.stringify({ enabled, running: await readyIsLive(readReady(dataDir)) }) + '\n')
  } else if (argv[0] === 'restore') {
    restoreSidecar()
    if (readConfig(defaults().configFile).data.sidecars?.[SIDECAR_ID]?.enabled !== true) await stopReady()
    process.stdout.write('The previous Office sidecar setting is restored.\n')
  } else {
    configureSidecar(argv[0] === 'enable')
    if (argv[0] === 'disable') await stopReady()
    process.stdout.write(argv[0] === 'enable' ? 'The Office sidecar is enabled. Antigravity App starts it automatically.\n' : 'The Office sidecar is disabled.\n')
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`The Office: ${error.message}\n`);process.exitCode = 1 })
}
