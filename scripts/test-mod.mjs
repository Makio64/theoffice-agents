#!/usr/bin/env node
// Runs the desktop mod's own suite (tests/*.test.tsx) with `claude plugin test`, which runs the tests it finds under the
// mod's folder. The tests stay out of plugin/ (what users install and the plugin directory reviews), so this lays
// plugin/ and tests/ together in a scratch folder, the tests' `../plugin/` imports made `../`, runs it there, and
// removes it. CLAUDE_BIN names the claude binary when the one on PATH is not the one to test with.
//   npm run test:mod
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const TEXT = /\.(tsx?|mts|mjs|js|json)$/

/** Copies the tests into `to`, each relative import into plugin/ pointing at the same file beside them instead. */
function copyTests(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name)
    const target = path.join(to, entry.name)
    if (entry.isDirectory()) copyTests(source, target)
    else if (TEXT.test(entry.name)) fs.writeFileSync(target, fs.readFileSync(source, 'utf8').replace(/((?:\.\.\/)+)plugin\//g, '$1'))
    else fs.copyFileSync(source, target)
  }
}

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-mod-test-'))
try {
  fs.cpSync(path.join(ROOT, 'plugin'), stage, { recursive: true })
  copyTests(path.join(ROOT, 'tests'), path.join(stage, 'tests'))
  const ran = spawnSync(process.env.CLAUDE_BIN || 'claude', ['plugin', 'test', stage], { stdio: 'inherit' })
  if (ran.error) throw ran.error
  process.exitCode = ran.status ?? 1
} finally {
  fs.rmSync(stage, { recursive: true, force: true })
}
