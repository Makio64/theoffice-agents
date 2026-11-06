import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { packagePlugin } from '../scripts/package-plugin.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

test('the portable bundle is self-contained, excludes host adapters, and validates with the native loader when available', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-plugin-test-'))
  try {
    const output = path.join(temp, 'Plugin with spaces')
    const build = spawnSync(process.execPath, [path.join(root, 'scripts/package-plugin.mjs'), output], { encoding: 'utf8', timeout: 15_000 })
    assert.equal(build.status, 0, build.stderr)
    assert.equal(build.stdout.trim(), fs.realpathSync(output))
    const version = readJson(path.join(root, 'package.json')).version
    assert.equal(readJson(path.join(output, 'plugin.json')).version, version)
    assert.equal(readJson(path.join(output, '.antigravity-plugin/plugin.json')).version, version)
    assert.equal(readJson(path.join(output, '.agents/plugins/marketplace.json')).plugins[0].name, 'theoffice')
    for (const file of ['skills/office/SKILL.md', 'skills/theoffice/SKILL.md', '.cursor-plugin/plugin.json', 'integrations/cursor/mcp.json', 'mcp.json', 'scripts/mcp.mjs', 'sidecars/office/sidecar.json', 'integrations/antigravity/sidecar.mjs', 'integrations/antigravity/configure.mjs', 'lib/collect.mjs', 'lib/dashboard.mjs', 'scripts/office.mjs', 'scripts/dashboard.mjs', 'README.md', 'LICENSE']) {
      assert.ok(fs.statSync(path.join(output, file)).isFile(), `${file} is bundled`)
    }
    for (const file of ['.claude-plugin', 'hooks', 'types', 'site', 'promo', '.git', 'node_modules', 'scripts/package-plugin.mjs', 'lib/ascii.d.mts']) {
      assert.equal(fs.existsSync(path.join(output, file)), false, `${file} stays outside the portable bundle`)
    }

    // the short skill, kept out of Claude's skills/ (integrations/skills), sits beside the skill it leads to
    const short = path.join(output, 'skills/theoffice/SKILL.md')
    assert.equal(fs.readFileSync(short, 'utf8'), fs.readFileSync(path.join(root, 'integrations/skills/theoffice/SKILL.md'), 'utf8'))
    assert.ok(fs.statSync(path.resolve(path.dirname(short), '../office/SKILL.md')).isFile())
    assert.deepEqual(fs.readdirSync(path.join(output, 'skills')).sort(), ['office', 'theoffice'])

    const skill = path.join(output, 'skills/office/SKILL.md')
    assert.match(fs.readFileSync(skill, 'utf8'), /\.\.\/\.\.\/scripts\/office\.mjs/)
    const command = path.resolve(path.dirname(skill), '../../scripts/office.mjs')
    const run = spawnSync(process.execPath, [command, 'live', '--json', '--no-cache', '--no-git', '--no-novi', '--agents', 'cursor'], {
      cwd: temp, encoding: 'utf8', timeout: 15_000,
      env: { ...process.env, THEOFFICE_HOME: path.join(temp, 'empty-home'), THEOFFICE_CACHE_DIR: path.join(temp, 'cache') },
    })
    assert.equal(run.status, 0, run.stderr)
    const facts = JSON.parse(run.stdout)
    assert.equal(facts.spec, 'theoffice/1')
    assert.equal(facts.error, undefined)
    assert.deepEqual(facts.live.desks, [])
    const dashboard = spawnSync(process.execPath, ['--input-type=module', '-e', 'await import(process.argv[1])', pathToFileURL(path.join(output, 'lib/dashboard.mjs')).href], {
      cwd: temp, encoding: 'utf8', timeout: 15_000,
    })
    assert.equal(dashboard.status, 0, dashboard.stderr)

    const validation = spawnSync('agy', ['plugin', 'validate', '--strict', '--json', output], { encoding: 'utf8', timeout: 15_000 })
    if (validation.error?.code === 'ENOENT') t.diagnostic('agy is unavailable; bundle runtime and manifest checks passed')
    else {
      const report = JSON.parse(validation.stdout)
      assert.equal(report.components.skills, 2)
      assert.equal(report.components.sidecars, 1)
      assert.equal(report.components.mcpServers, 0, 'Antigravity uses its managed sidecar rather than a duplicate MCP server')
      assert.equal(report.components.hooks, 0, 'the Claude UI module is never loaded')
      const warnings = report.findings.filter((finding) => ['error', 'warning'].includes(finding.severity))
      // The installed loader treats its documented overlay precedence as a warning in multi-provider bundles.
      const expected = [
        { severity: 'warning', file: 'plugin.json', message: 'ignored: .antigravity-plugin/plugin.json takes precedence' },
        { severity: 'warning', file: 'mcp.json', message: 'never loaded: mcp.json is read only for Agent Plugins plugins (plugin.json "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"). Move the servers to mcp_config.json' },
      ]
      for (const finding of warnings) assert.ok(expected.some((item) => JSON.stringify(item) === JSON.stringify(finding)), JSON.stringify(finding))
      assert.equal(validation.status, warnings.length ? 1 : 0, validation.stdout + validation.stderr)
      if (warnings.length) {
        t.diagnostic('agy strict flags only the intentional host-specific manifest and MCP selections; normal validation must still pass')
        const normal = spawnSync('agy', ['plugin', 'validate', '--json', output], { encoding: 'utf8', timeout: 15_000 })
        assert.equal(normal.status, 0, normal.stdout + normal.stderr)
      }
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})

test('packaging refuses unrelated directories, manifest-only directories, symlinks, and source locations', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-plugin-safety-'))
  try {
    const output = path.join(temp, 'unrelated')
    fs.mkdirSync(output)
    fs.writeFileSync(path.join(output, 'notes.txt'), 'keep these notes')
    assert.throws(() => packagePlugin(output), /Refusing to replace an unrelated output/)
    fs.writeFileSync(path.join(output, 'plugin.json'), JSON.stringify({ name: 'theoffice' }))
    assert.throws(() => packagePlugin(output), /Refusing to replace an unrelated output/)
    assert.equal(fs.readFileSync(path.join(output, 'notes.txt'), 'utf8'), 'keep these notes')

    const bundle = packagePlugin(path.join(temp, 'owned'))
    const link = path.join(temp, 'linked-output')
    fs.symlinkSync(bundle, link, 'dir')
    assert.throws(() => packagePlugin(link), /Refusing to replace an unrelated output/)
    assert.ok(fs.statSync(path.join(bundle, 'plugin.json')).isFile())
    for (const source of [root, path.dirname(root), path.join(root, 'plugin/lib/portable-output')]) {
      assert.throws(() => packagePlugin(source), /outside the source files/)
    }
    assert.deepEqual(fs.readdirSync(temp).sort(), ['linked-output', 'owned', 'unrelated'])
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})

test('a package-owned output is replaced without leftover staging directories', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-plugin-rebuild-'))
  try {
    const output = packagePlugin(path.join(temp, 'bundle'))
    fs.writeFileSync(path.join(output, 'old-generated-file.txt'), 'old build')
    assert.equal(packagePlugin(output), output)
    assert.equal(fs.existsSync(path.join(output, 'old-generated-file.txt')), false)
    assert.ok(fs.statSync(path.join(output, 'scripts/dashboard.mjs')).isFile())
    assert.deepEqual(fs.readdirSync(temp), ['bundle'])
  } finally {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})
