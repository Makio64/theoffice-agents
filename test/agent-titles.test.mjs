import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { READERS } from '../plugin/lib/agents.mjs'

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-titles-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'session_index.jsonl')
  const titles = () => READERS.codex.titles({ dir })
  const rename = (name, id = 'session') => JSON.stringify({ id, thread_name: name })
  return { dir, file, titles, rename }
}

test('title indexes keep the last rename, skip malformed rows and isolate returned maps', t => {
  const { file, titles, rename } = fixture(t)
  fs.writeFileSync(file, `${rename('First')}\ninvalid json\nnull\n${rename('Last')}\n`)
  const first = titles()
  assert.deepEqual([...first], [['session', 'Last']])
  first.set('session', 'Caller edit');first.set('extra', 'Unrelated')
  assert.deepEqual([...titles()], [['session', 'Last']], 'a consumer cannot alter the next dashboard revision')
  fs.appendFileSync(file, rename('Newest'))
  assert.deepEqual([...titles()], [['session', 'Newest']], 'an appended rename is immediately visible without a trailing newline')
})

test('same-sized rewrites with restored mtime, atomic replacements and deleted indexes invalidate immediately', t => {
  const { dir, file, titles, rename } = fixture(t)
  fs.writeFileSync(file, rename('First'))
  assert.equal(titles().get('session'), 'First')
  const original = fs.statSync(file)
  fs.writeFileSync(file, rename('Other'))
  fs.utimesSync(file, original.atime, original.mtime)
  assert.equal(titles().get('session'), 'Other')
  const replacement = path.join(dir, 'replacement.jsonl')
  fs.writeFileSync(replacement, rename('Third'))
  fs.utimesSync(replacement, original.atime, original.mtime)
  fs.renameSync(replacement, file)
  assert.equal(titles().get('session'), 'Third')
  fs.unlinkSync(file)
  assert.equal(titles().size, 0, 'a removed account index cannot leave stale titles')
  fs.writeFileSync(file, rename('Again'))
  assert.equal(titles().get('session'), 'Again')
})

test('accounts remain independent and a previously missing index is read on its first appearance', t => {
  const first = fixture(t), second = fixture(t)
  assert.equal(first.titles().size, 0)
  fs.writeFileSync(first.file, first.rename('Account one'))
  fs.writeFileSync(second.file, second.rename('Account two'))
  assert.equal(first.titles().get('session'), 'Account one')
  assert.equal(second.titles().get('session'), 'Account two')
  assert.equal(first.titles().get('session'), 'Account one')
})
