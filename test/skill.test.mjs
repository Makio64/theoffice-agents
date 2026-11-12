// The skill must work when the complete portable plugin is installed outside the user's project,
// without Claude's environment variables or skill-time shell expansion.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { FROZEN, buildFakeClaude, cleanup } from './helpers/fake-claude.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
// a Windows checkout may hold the skills with CRLF line ends
const readText = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
const SKILL = readText(path.join(ROOT, 'plugin/skills/office/SKILL.md'))
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'))

test('portable and Claude manifests identify the same plugin and release', () => {
  const portable = readJson('plugin.json')
  const claude = readJson('plugin/.claude-plugin/plugin.json')
  const pkg = readJson('package.json')
  assert.equal(portable.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json')
  assert.equal(portable.name, claude.name)
  assert.equal(portable.version, claude.version)
  assert.equal(portable.version, pkg.version)
  // An explicit empty definition prevents Codex from discovering Claude's UI module in hooks/hooks.json.
  assert.deepEqual(portable.extensions['com.openai'].hooks, { hooks: {} })
  assert.ok(fs.existsSync(path.join(ROOT, 'plugin/skills/office/SKILL.md')))
})

test("Claude's plugin ships no `theoffice` skill: it would take /theoffice from the desktop pane's command", () => {
  // Claude Code makes every folder of the plugin's skills/ a command /theoffice:<folder>, and one named `theoffice`
  // answers to /theoffice, so the engine refuses the mod's own /theoffice (hooks/register.tsx). The short skill is the
  // other hosts' alone: package-plugin.mjs lays it into the portable bundle's skills/.
  const skills = fs.readdirSync(path.join(ROOT, 'plugin/skills'), { withFileTypes: true }).filter((entry) => entry.isDirectory())
  assert.ok(skills.length > 0)
  for (const { name } of skills) {
    assert.notEqual(name, 'theoffice')
    const declared = /^---\n[\s\S]*?^name: *(\S+)/m.exec(readText(path.join(ROOT, 'plugin', 'skills', name, 'SKILL.md')))?.[1]
    assert.notEqual(declared, 'theoffice', `skills/${name}/SKILL.md is not named theoffice`)
  }
  const short = readText(path.join(ROOT, 'integrations/skills/theoffice/SKILL.md'))
  assert.match(short, /^---\nname: theoffice\n/)
  assert.ok(short.includes('`../office/SKILL.md`'), 'the short skill leads to office beside it in the bundle')
})

test('portable skill has normal discovery metadata and no host-specific execution dependency', () => {
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(SKILL)?.[1]
  assert.ok(frontmatter, 'skill has frontmatter')
  const keys = frontmatter.split('\n').map((line) => line.split(':', 1)[0])
  assert.deepEqual(keys.sort(), ['description', 'name'])
  assert.doesNotMatch(SKILL, /^!`|\$\{CLAUDE_PLUGIN_ROOT\}|\$ARGUMENTS/m)
  assert.ok(SKILL.includes('../../scripts/office.mjs'), 'script is relative to the installed skill')
})

test('a relocated skill can render pixel art and text from an unrelated project with no Claude plugin environment', () => {
  const fx = buildFakeClaude()
  try {
    const installed = path.join(fx.root, 'installed plugins', 'The Office')
    for (const dir of ['skills', 'scripts', 'lib', 'themes']) fs.cpSync(path.join(ROOT, 'plugin', dir), path.join(installed, dir), { recursive: true })
    fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(installed, 'package.json'))
    fs.copyFileSync(path.join(ROOT, 'plugin.json'), path.join(installed, 'plugin.json'))
    const skillFile = path.join(installed, 'skills/office/SKILL.md')
    const installedSkill = fs.readFileSync(skillFile, 'utf8')
    const relativeScript = /`(\.\.\/\.\.\/scripts\/office\.mjs)`/.exec(installedSkill)?.[1]
    assert.ok(relativeScript)
    const script = path.resolve(path.dirname(skillFile), relativeScript)
    const env = {
      ...process.env,
      THEOFFICE_CLAUDE_DIR: fx.claudeDir, THEOFFICE_CACHE_DIR: fx.cacheDir, THEOFFICE_NOW: FROZEN,
      THEOFFICE_SKIP_PID_CHECK: '1', THEOFFICE_NO_NOVI: '1', THEOFFICE_NO_GIT: '1', THEOFFICE_NO_OPEN: '1',
      TZ: 'Europe/Paris',
    }
    for (const key of ['CLAUDE_PLUGIN_ROOT', 'CLAUDE_PLUGIN_DATA', 'CURSOR_PLUGIN_ROOT', 'PLUGIN_ROOT', 'ARGUMENTS', 'FORCE_COLOR']) delete env[key]
    const run = (...extra) => {
      const result = spawnSync(process.execPath, [script, 'live', '--agents', 'claude', '--no-color', ...extra], {
        cwd: fx.other, env, encoding: 'utf8', timeout: 20_000,
      })
      assert.equal(result.error, undefined)
      assert.equal(result.status, 0, result.stderr)
      assert.equal(result.stderr, '')
      return result.stdout
    }
    const pixelFile = run('--pixel').trim()
    assert.ok(path.isAbsolute(pixelFile))
    assert.match(pixelFile, /\.svg$/)
    assert.match(fs.readFileSync(pixelFile, 'utf8'), /<svg[ >]/)
    const text = run()
    assert.match(text, /^THE OFFICE/)
    assert.doesNotMatch(text, /\x1b\[|^<svg|^\{/)
    assert.ok(text.includes('▛█▜'), 'text preserves the agent character')
  } finally {
    cleanup(fx.root)
  }
})
