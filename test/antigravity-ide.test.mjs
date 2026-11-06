// An IDE-only fake home: neither Gemini CLI nor the Antigravity App/CLI has ever run.
process.env.TZ = 'Europe/Paris'
process.env.THEOFFICE_NO_NOVI = '1'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { agentHomes } from '../plugin/lib/agents.mjs'
import { collect } from '../plugin/lib/collect.mjs'
import { FROZEN, NOW, ago, cleanup, writeLines } from './helpers/fake-claude.mjs'

test('Antigravity IDE alone discovers its home and books its transcript into live and history views', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-antigravity-ide-'))
  try {
    const app = path.join(root, 'work', 'ide-project')
    fs.mkdirSync(app, { recursive: true })
    const sid = 'a9a9a9a9-0000-4000-8000-000000000001'
    const home = path.join(root, '.gemini', 'antigravity-ide')
    const transcript = path.join(home, 'brain', sid, '.system_generated', 'logs', 'transcript.jsonl')
    writeLines(transcript, [
      { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: ago(120e3), content: 'Read the project' },
      { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'RUNNING', created_at: ago(30e3), input_tokens: 900, output_tokens: 40,
        tool_calls: [{ name: 'view_file', args: { AbsolutePath: path.join(app, 'index.js') } }] },
    ], NOW - 30e3)
    fs.mkdirSync(path.join(home, 'annotations'), { recursive: true })
    fs.writeFileSync(path.join(home, 'annotations', `${sid}.pbtxt`), 'title:"IDE fixture session"')

    const homes = agentHomes({ root, env: {}, agents: ['gemini'] })
    assert.equal(homes.length, 1, 'antigravity-ide is enough to recognize the Gemini home')
    assert.equal(homes[0].dir, path.join(root, '.gemini'))

    const facts = await collect({ view: 'week', home: root, cacheDir: null, now: FROZEN, novi: false, git: false, agents: 'gemini' })
    assert.equal(facts.live.desks.length, 1)
    const desk = facts.live.desks[0]
    assert.equal(desk.agent, 'gemini')
    assert.equal(desk.state, 'working')
    assert.equal(desk.activity.kind, 'reading')
    assert.equal(desk.project, 'ide-project')
    assert.equal(desk.title, 'IDE fixture session')

    const project = facts.projects.find((p) => p.name === 'ide-project')
    assert.ok(project, 'the IDE transcript contributes to history')
    assert.equal(project.activity.reading, 1)
    assert.ok(project.agents.gemini > 0)
    assert.ok(facts.totals.agents.gemini > 0)
  } finally {
    cleanup(root)
  }
})
