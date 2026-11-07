// The dashboard's watcher: what it looks at in a stand-in Claude folder, and when it tells.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { claudeDirsOf, othersOf, signature, watchOffice } from '../plugin/lib/dashboard-watch.mjs'

function claudeHome(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-watch-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const claude = path.join(root, '.claude')
  fs.mkdirSync(path.join(claude, 'sessions'), { recursive: true })
  const session = (pid, sessionId, cwd = '/work/app') => {
    fs.writeFileSync(path.join(claude, 'sessions', `${pid}.json`), JSON.stringify({ pid, sessionId, cwd, status: 'busy' }))
    const dir = path.join(claude, 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'))
    fs.mkdirSync(dir, { recursive: true })
    return path.join(dir, `${sessionId}.jsonl`)
  }
  return { root, claude, session }
}
const later = (file, ms) => { const at = new Date(Date.now() + ms);fs.utimesSync(file, at, at) }

test('a look reads the session records and stats their transcripts, never a transcript\'s contents', async (t) => {
  const { claude, session } = claudeHome(t)
  const transcript = session(101, 'abc-1')
  fs.writeFileSync(transcript, 'line\n')
  const records = new Map()
  const first = await signature({ claudeDirs: [claude], records })
  assert.match(first.state, /^101\.json:/)
  assert.match(first.noise, /^101\.json:\d/)
  fs.appendFileSync(transcript, 'another line\n')
  const grown = await signature({ claudeDirs: [claude], records })
  assert.equal(grown.state, first.state, 'a transcript growing is activity, not a change of state')
  assert.notEqual(grown.noise, first.noise)
  const record = path.join(claude, 'sessions', '101.json')
  fs.writeFileSync(record, JSON.stringify({ pid: 101, sessionId: 'abc-1', cwd: '/work/app', status: 'waiting' }))
  later(record, 2000)
  assert.notEqual((await signature({ claudeDirs: [claude], records })).state, grown.state, 'a status written is a change of state')
  fs.mkdirSync(path.join(path.dirname(transcript), 'abc-1', 'subagents'), { recursive: true })
  const intern = await signature({ claudeDirs: [claude], records })
  assert.notEqual(intern.state, grown.state, 'an intern starting is a change of state')
  fs.writeFileSync(path.join(claude, 'sessions', '202.json'), JSON.stringify({ sessionId: '../../etc', cwd: 'relative' }))
  const odd = await signature({ claudeDirs: [claude], records })
  assert.match(odd.state, /202\.json:[^>|]*$/, 'a record that names no safe session is looked at alone')
  assert.equal(records.size, 2)
  fs.rmSync(path.join(claude, 'sessions', '202.json'))
  await signature({ claudeDirs: [claude], records })
  assert.equal(records.size, 1, 'a record gone is forgotten')
  assert.equal((await signature({ claudeDirs: [path.join(claude, 'missing')] })).state, `${path.join(claude, 'missing')}:none`)
})

test('the folders and files looked at come from the facts, under home only', () => {
  const home = '/Users/me'
  assert.deepEqual(claudeDirsOf(null, home), ['/Users/me/.claude'])
  assert.deepEqual(claudeDirsOf({ sources: { homes: [{ agent: 'claude', dir: '/Users/me/.claude-work' }, { agent: 'codex', dir: '/Users/me/.codex' }, { agent: 'claude', dir: 'relative' }] } }, home), ['/Users/me/.claude-work'])
  assert.deepEqual(othersOf({ sources: { watch: ['/Users/me/.codex/sessions/a.jsonl', '/etc/passwd', '/Users/me/../x', 7, '/Users/meanwhile/a'] } }, home), ['/Users/me/.codex/sessions/a.jsonl'])
  assert.deepEqual(othersOf({}, home), [])
})

test('state is told at once, activity and the others after their gaps, and a beat whatever moved', async () => {
  let clock = 0
  let current = { state: 'a', noise: 'n', others: 'o' }
  const told = []
  const looks = []
  let resolveLook
  const watch = watchOffice({
    onChange: (why) => told.push([clock, why]), lookMs: 1, activityGapMs: 100, othersGapMs: 50, beatMs: 1000, now: () => clock,
    look: async () => { looks.push(clock);resolveLook?.();return { ...current } },
  })
  const step = async (ms, next = current) => {
    clock += ms
    current = next
    await new Promise((resolve) => { resolveLook = resolve })
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  await step(0)
  assert.deepEqual(told, [], 'the first look only notes where things stand')
  await step(10, { ...current, noise: 'n2' })
  assert.deepEqual(told, [], 'activity waits for its gap')
  await step(100)
  assert.deepEqual(told.at(-1), [110, 'activity'])
  await step(10, { ...current, state: 'b' })
  assert.deepEqual(told.at(-1), [120, 'state'], 'state is told at once')
  await step(10, { ...current, others: 'o2' })
  assert.equal(told.length, 2)
  await step(50)
  assert.deepEqual(told.at(-1), [180, 'others'])
  await step(1000)
  assert.deepEqual(told.at(-1), [1180, 'beat'])
  watch.stop()
  const count = looks.length
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(looks.length, count, 'a stopped watch looks no more')
})
