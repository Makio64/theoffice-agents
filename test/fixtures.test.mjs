// The sample facts ship with the repo: they must stay made-up (no real home paths or project names) and the mod
// suite's TypeScript copy (tests/fixtures/facts-sample.ts, the plugin test kit loads only code files) must not drift.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
const JSON_SRC = read('./fixtures/facts-sample.json')
// a Windows checkout may hold it with CRLF line ends
const TS_SRC = read('../tests/fixtures/facts-sample.ts').replace(/\r\n/g, '\n')

test('sample facts carry no real home folder', () => {
  for (const [name, src] of [['facts-sample.json', JSON_SRC], ['facts-sample.ts', TS_SRC]]) {
    assert.doesNotMatch(src, /\/Users\/|\/home\/(?!demo\/)|[A-Z]:\\\\Users/, name)
  }
})

test('the TypeScript copy of the sample facts matches the JSON', () => {
  const head = 'const SAMPLE: OfficeFacts = '
  const start = TS_SRC.indexOf(head)
  const end = TS_SRC.lastIndexOf('\n\nexport default SAMPLE')
  assert.ok(start > 0 && end > start, 'facts-sample.ts keeps its `const SAMPLE: OfficeFacts = {…}` shape')
  assert.deepEqual(JSON.parse(TS_SRC.slice(start + head.length, end)), JSON.parse(JSON_SRC))
})
