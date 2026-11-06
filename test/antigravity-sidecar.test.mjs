import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { startDashboard } from '../plugin/lib/dashboard.mjs'
import { READY_SPEC, SIDECAR_ID, readReady, readyIsLive, startSidecar, stopReady } from '../integrations/antigravity/sidecar.mjs'
import { configureSidecar, restoreSidecar } from '../integrations/antigravity/configure.mjs'
import { permits } from './helpers/permits.mjs'

test('the managed sidecar stays idle, reuses its endpoint, and cleans up private runtime files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-sidecar-'))
  let renders = 0
  let first
  try {
    first = await startSidecar({ dataDir: dir, start: (options) => startDashboard({ ...options, renderer: async () => {
      renders++
      return { svg: '<svg xmlns="http://www.w3.org/2000/svg"/>', text: 'Synthetic Office', label: 'Fixture', status: '1 desk' }
    } }) })
    assert.equal(first.reused, false)
    assert.equal(renders, 0, 'starting the sidecar does not read activity')
    const ready = readReady(dir)
    assert.equal(ready.spec, READY_SPEC)
    assert.equal(ready.sidecarId, SIDECAR_ID)
    assert.equal(await readyIsLive(ready), true)
    assert.equal(permits(dir, 0o700), 0o700)
    for (const name of ['ready.json', 'server.lock']) assert.equal(permits(path.join(dir, name), 0o600), 0o600)

    const again = await startSidecar({ dataDir: dir, start: () => { throw new Error('must reuse the existing dashboard') } })
    assert.equal(again.reused, true)
    assert.equal(again.url, first.url)
    assert.equal(renders, 0, 'readiness checks do not collect activity')
    const url = new URL('/snapshot', first.url)
    url.search = new URL(first.url).search
    assert.equal((await fetch(url)).status, 200)
    assert.equal(renders, 1)
    await first.stop()
    assert.equal(fs.existsSync(path.join(dir, 'ready.json')), false)
    assert.equal(fs.existsSync(path.join(dir, 'server.lock')), false)
    assert.equal(await readyIsLive(ready), false)
  } finally {
    await first?.stop()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('a crashed sidecar is replaced, an unrelated runtime file is preserved, and shutdown uses its capability URL', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-sidecar-stale-'))
  let sidecar
  try {
    fs.writeFileSync(path.join(dir, 'ready.json'), JSON.stringify({ spec: READY_SPEC, sidecarId: SIDECAR_ID, pid: 2147483000, url: 'http://127.0.0.1:1/?token=stale', startedAt: new Date().toISOString() }))
    fs.writeFileSync(path.join(dir, 'server.lock'), JSON.stringify({ spec: 'theoffice-antigravity-lock/1', pid: 2147483000 }))
    sidecar = await startSidecar({ dataDir: dir })
    assert.equal(sidecar.reused, false)
    assert.equal(readReady(dir).pid, process.pid)
    assert.equal(await stopReady(dir), true)
    await sidecar.stop()
    fs.writeFileSync(path.join(dir, 'ready.json'), 'unrelated file')
    await assert.rejects(startSidecar({ dataDir: dir }), /JSON/)
    assert.equal(fs.readFileSync(path.join(dir, 'ready.json'), 'utf8'), 'unrelated file')
  } finally {
    await sidecar?.stop()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('sidecar opt-in and restore change only its setting, backing up no other configuration', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-sidecar-config-'))
  try {
    const configFile = path.join(dir, 'config.json')
    const dataDir = path.join(dir, 'data')
    const other = { privateSentinel: 'never-copy-to-backup' }
    const previous = { enabled: false, projectId: 'existing-project' }
    fs.writeFileSync(configFile, JSON.stringify({ other, sidecars: { other: { enabled: true }, [SIDECAR_ID]: previous } }), { mode: 0o600 })
    assert.deepEqual(configureSidecar(true, { configFile, dataDir }), { enabled: true, changed: true })
    const enabled = JSON.parse(fs.readFileSync(configFile, 'utf8'))
    assert.deepEqual(enabled.other, other)
    assert.deepEqual(enabled.sidecars.other, { enabled: true })
    assert.deepEqual(enabled.sidecars[SIDECAR_ID], { ...previous, enabled: true })
    const backupFile = path.join(dataDir, 'setting-backup.json')
    const backupText = fs.readFileSync(backupFile, 'utf8')
    assert.equal(permits(backupFile, 0o600), 0o600)
    assert.equal(backupText.includes(other.privateSentinel), false)
    assert.deepEqual(JSON.parse(backupText).previous, previous)
    assert.deepEqual(configureSidecar(true, { configFile, dataDir }), { enabled: true, changed: false })
    fs.writeFileSync(configFile, JSON.stringify({ ...enabled, laterSetting: 'keep' }))
    assert.deepEqual(restoreSidecar({ configFile, dataDir }), { changed: true })
    const restored = JSON.parse(fs.readFileSync(configFile, 'utf8'))
    assert.deepEqual(restored.sidecars[SIDECAR_ID], previous)
    assert.deepEqual(restored.other, other)
    assert.equal(restored.laterSetting, 'keep')
    assert.equal(fs.existsSync(backupFile), false)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('restoring a newly enabled sidecar removes only the setting it added', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-sidecar-new-'))
  try {
    const options = { configFile: path.join(dir, 'config.json'), dataDir: path.join(dir, 'data') }
    configureSidecar(true, options)
    restoreSidecar(options)
    assert.deepEqual(JSON.parse(fs.readFileSync(options.configFile, 'utf8')), {})
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('malformed settings and an unrelated backup are preserved rather than replaced', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-sidecar-refuse-'))
  try {
    const configFile = path.join(dir, 'config.json'), dataDir = path.join(dir, 'data')
    const malformed = JSON.stringify({ sidecars: { [SIDECAR_ID]: null }, keep: 'unchanged' })
    fs.writeFileSync(configFile, malformed)
    assert.throws(() => configureSidecar(true, { configFile, dataDir }), /Invalid existing Office/)
    assert.equal(fs.readFileSync(configFile, 'utf8'), malformed)
    const original = JSON.stringify({ keep: 'unchanged' })
    fs.writeFileSync(configFile, original)
    fs.mkdirSync(dataDir)
    fs.writeFileSync(path.join(dataDir, 'setting-backup.json'), JSON.stringify({ owner: 'somebody else' }))
    assert.throws(() => configureSidecar(true, { configFile, dataDir }), /Unrecognized Office/)
    assert.equal(fs.readFileSync(configFile, 'utf8'), original)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
