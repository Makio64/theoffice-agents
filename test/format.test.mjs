import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { center, clip, displayWidth, fmtAgentTime, fmtAgo, fmtHours, fmtInt, fmtMinutes, padEnd, padStart, redact, safeText, truncate } from '../plugin/lib/format.mjs'
import { KINDS, emptyActivity, jobTitle, kindOf, labelOf } from '../plugin/lib/activity.mjs'

describe('format', () => {
  test('fmtMinutes', () => {
    assert.equal(fmtMinutes(0), '0m')
    assert.equal(fmtMinutes(45), '45m')
    assert.equal(fmtMinutes(65), '1h05')
    assert.equal(fmtMinutes(600), '10h00')
    assert.equal(fmtMinutes(321 * 60 + 7), '321h')
    assert.equal(fmtMinutes(-5), '0m')
  })

  test('fmtInt', () => {
    assert.equal(fmtInt(950), '950')
    assert.equal(fmtInt(1000), '1k')
    assert.equal(fmtInt(1234), '1.2k')
    assert.equal(fmtInt(12_345), '12.3k')
    assert.equal(fmtInt(123_456), '123k')
    assert.equal(fmtInt(999_999), '1M')
    assert.equal(fmtInt(1_234_567), '1.2M')
    assert.equal(fmtInt(-1500), '-1.5k')
  })

  test('fmtAgo', () => {
    const now = Date.parse('2026-10-26T00:40:00Z')
    assert.equal(fmtAgo(now - 5e3, now), 'just now')
    assert.equal(fmtAgo(now + 5e3, now), 'just now')
    assert.equal(fmtAgo(now - 12 * 60e3, now), '12m ago')
    assert.equal(fmtAgo('2026-10-25T21:40:00Z', now), '3h ago')
    assert.equal(fmtAgo(now - 4 * 864e5, now), '4d ago')
  })

  test('safeText strips ANSI, OSC, C0/C1 and bidi controls', () => {
    assert.equal(safeText('\x1b[31mred\x1b[0m title'), 'red title')
    assert.equal(safeText('\x1b]8;;http://evil\x07link\x1b]8;;\x07'), 'link')
    assert.equal(safeText('a\x00b\x07c\x85d\u202ee'), 'a b c d e')
    assert.equal(safeText('x\x9b2Jy'), 'xy')   // 8-bit CSI
    assert.equal(safeText('line\nbreak\ttab'), 'line break tab')
    assert.equal(safeText(null), '')
  })

  test('redact', () => {
    assert.equal(redact('export KEY=sk-ant-abcdefghijklmnopqrstuvwxyz'), 'export KEY=sk-…')
    assert.match(redact('curl -H "Authorization: Bearer abcdef123456"'), /Bearer \[redacted\]/)
    assert.equal(redact('https://user:hunter2@example.com/x'), 'https://[redacted]@example.com/x')
    assert.equal(redact('ghp_abcdefghijklmnopqrstuvwxyz0123'), 'gh_…')
    const sha = 'a'.repeat(20) + '0123456789abcdef0123'
    assert.equal(redact(sha), sha)   // plain hex is not a secret
    assert.equal(redact('token AbCdEfGh1234567890AbCdEfGh12345678'), 'token [redacted]')
  })

  test('redact: keyword inside a longer name, glued -p passwords, user:pass logins', () => {
    assert.equal(redact('PGPASSWORD=hunter22 psql -h db'), 'PGPASSWORD=[redacted] psql -h db')
    assert.equal(redact('NPM_TOKEN=abcdef123456 npm publish'), 'NPM_TOKEN=[redacted] npm publish')
    assert.equal(redact('MY_API_KEY=abcd1234efgh npm run'), 'MY_API_KEY=[redacted] npm run')
    assert.equal(redact('export DB_PASS="s3cr3tpw" && go'), 'export DB_PASS="[redacted]" && go')
    assert.equal(redact('gh --auth-token=abcd1234 x'), 'gh --auth-token=[redacted] x')
    assert.equal(redact('mysql -u root -phunter22 db'), 'mysql -u root -p[redacted] db')
    assert.equal(redact('mysqldump -h h -u me -p\'hunter 2\' db'), 'mysqldump -h h -u me -p[redacted] db')
    assert.equal(redact('mysql -u root -p db'), 'mysql -u root -p db')   // prompts for the password: nothing to hide
    assert.equal(redact('curl -u admin:s3cretpw https://x'), 'curl -u admin:[redacted] https://x')
    assert.equal(redact('curl --user admin:s3cretpw https://x'), 'curl --user admin:[redacted] https://x')
    assert.match(redact('curl -H "Authorization: Bearer abcdef123456"'), /Authorization: Bearer \[redacted\]/)
    assert.equal(redact('git status'), 'git status')
    assert.equal(redact('token=abc'), 'token=abc')   // too short to be a secret
    const long = `${'auth'.repeat(5000)}`
    const t0 = performance.now()
    redact(long)
    assert.ok(performance.now() - t0 < 200, 'no quadratic backtracking on long words')
  })

  test('displayWidth: ASCII/box/blocks 1, emoji and CJK 2, combining 0', () => {
    assert.equal(displayWidth('abc'), 3)
    assert.equal(displayWidth('┌─┐│█▓░'), 7)
    assert.equal(displayWidth('🏢'), 2)
    assert.equal(displayWidth('日本'), 4)
    assert.equal(displayWidth('e\u0301'), 1)
    assert.equal(displayWidth('☕'), 2)
    assert.equal(displayWidth('⚙\uFE0F'), 2)
    assert.equal(displayWidth('👨\u200D💻'), 2)
    assert.equal(displayWidth('·…→'), 3)
    // invisible format chars and Hangul medial vowels take no column
    assert.equal(displayWidth('a\u2060b\u2061c\u180ed\u202ae\u2066f'), 6)
    assert.equal(displayWidth('\u1100\u1161'), 2)
  })

  test('truncate / padEnd / padStart / center / clip by display width', () => {
    assert.equal(truncate('hello world', 8), 'hello w…')
    assert.equal(truncate('hello', 8), 'hello')
    assert.equal(truncate('🏢🏢🏢', 5), '🏢🏢…')
    assert.equal(truncate('abc', 0), '')
    assert.equal(padEnd('ab', 4), 'ab  ')
    assert.equal(padEnd('🏢', 4), '🏢  ')
    assert.equal(padEnd('abcdef', 4), 'abc…')
    assert.equal(padStart('7', 3), '  7')
    assert.equal(center('ab', 6), '  ab  ')
    assert.equal(clip('\x1b[1mBold\x1b[0m and a long tail', 10), 'Bold and…')
  })
})

describe('activity', () => {
  test('kindOf', () => {
    assert.equal(kindOf('Edit'), 'coding')
    assert.equal(kindOf('Read'), 'reading')
    assert.equal(kindOf('ToolSearch'), 'reading')
    assert.equal(kindOf('Bash', { command: 'ls -la' }), 'terminal')
    assert.equal(kindOf('Bash', { command: 'npm run test -- --watch' }), 'testing')
    assert.equal(kindOf('Bash', { command: 'x', description: 'Run node --test suite' }), 'testing')
    assert.equal(kindOf('Bash', { command: 'cat latest.txt' }), 'terminal')   // "latest" is not "test"
    assert.equal(kindOf('WebFetch'), 'web')
    assert.equal(kindOf('mcp__Claude_Browser__navigate'), 'web')
    assert.equal(kindOf('mcp__claude-in-chrome__computer'), 'web')
    assert.equal(kindOf('Workflow'), 'delegating')
    assert.equal(kindOf('mcp__ccd_session__start_session'), 'delegating')
    assert.equal(kindOf('mcp__ccd_turn__update_plan'), 'planning')
    assert.equal(kindOf('Skill'), 'planning')
    assert.equal(kindOf('mcp__ccd_turn__wrap_up'), 'talking')
    assert.equal(kindOf('AskUserQuestion'), 'talking')
    assert.equal(kindOf('Artifact'), 'design')
    assert.equal(kindOf('mcp__visualize__show_widget'), 'design')
    assert.equal(kindOf('mcp__Blender__execute_blender_code'), 'design')
    assert.equal(kindOf('mcp__abc__creative_generate_image'), 'design')
    assert.equal(kindOf('mcp__github__create_pull_request'), 'tools')
    assert.equal(kindOf('SomethingNew'), 'tools')
    assert.equal(kindOf(undefined), 'tools')
  })

  test('labelOf', () => {
    assert.equal(labelOf('Bash', { command: 'git status', description: 'Show status' }), 'Show status')
    assert.equal(labelOf('Bash', { command: 'git log --oneline --graph --decorate --all --color=always | head -50' }), 'git log --oneline --graph --decorate --…')
    assert.equal(labelOf('Edit', { file_path: '/a/b/collect.mjs' }), 'collect.mjs')
    assert.equal(labelOf('NotebookEdit', { notebook_path: '/a/n.ipynb' }), 'n.ipynb')
    assert.equal(labelOf('Grep', { pattern: 'TODO' }), 'TODO')
    assert.equal(labelOf('WebFetch', { url: 'https://docs.example.com/x?y=1' }), 'docs.example.com')
    assert.equal(labelOf('WebSearch', { query: 'node test runner' }), 'node test runner')
    assert.equal(labelOf('Agent', { description: 'Survey assets' }), 'Survey assets')
    assert.equal(labelOf('Workflow', { scriptPath: '/x/review-flow.js' }), 'review-flow')
    assert.equal(labelOf('Workflow', {}), 'workflow')
    assert.equal(labelOf('Skill', { skill: 'pdf' }), 'pdf')
    assert.equal(labelOf('mcp__github__create_pull_request', {}), 'create_pull_request')
    assert.equal(labelOf('Bash', { command: 'export X=sk-ant-abcdefghijklmnopqrstuvwxyz && run' }), 'export X=sk-… && run')
    assert.equal(labelOf('Bash', { command: 'PGPASSWORD=hunter22 psql -h db' }), 'PGPASSWORD=[redacted] psql -h db')
    assert.equal(labelOf('Bash', { command: 'NPM_TOKEN=abcdef123456 npm publish' }), 'NPM_TOKEN=[redacted] npm publish')
    assert.equal(labelOf('Bash', { command: 'mysql -u root -phunter22 db' }), 'mysql -u root -p[redacted] db')
    assert.equal(labelOf('Bash', { command: 'curl -u admin:s3cretpw https://x' }), 'curl -u admin:[redacted] https://x')
    assert.equal(labelOf('Bash', { description: '\x1b[2Jclear\x07' }), 'clear')
  })

  test('job titles and empty activity', () => {
    assert.equal(jobTitle('Explore'), 'researcher')
    assert.equal(jobTitle('workflow-subagent'), 'consultant')
    assert.equal(jobTitle('my-custom-agent'), 'specialist')
    assert.deepEqual(Object.keys(emptyActivity()), KINDS)
    assert.ok(Object.values(emptyActivity()).every((v) => v === 0))
  })
})

test('fmtAgentTime keeps the unit past 1000h, where fmtHours turns to a bare k', () => {
  assert.equal(fmtHours(134_381), '2.2k')
  assert.equal(fmtAgentTime(134_381), '2239h')
  for (const m of [0, 45, 444, 13_369, 59_999]) assert.equal(fmtAgentTime(m), fmtHours(m))
})
