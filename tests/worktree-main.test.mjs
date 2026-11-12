// mainOfGitdir: a linked worktree, a submodule's included, counts for its main checkout (connected-office fork).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mainOfGitdir } from '../plugin/lib/collect.mjs'

test('a repo worktree points at its repo', () => {
  assert.equal(mainOfGitdir('/w/tech/overseer/.git/worktrees/wt-x'), '/w/tech/overseer')
})
test("a submodule's worktree points at the submodule's checkout", () => {
  assert.equal(mainOfGitdir('/w/tech/connected-office/.git/modules/vendor/theoffice-agents/worktrees/wt-y'), '/w/tech/connected-office/vendor/theoffice-agents')
})
test('a nested submodule drops the inner modules segment', () => {
  assert.equal(mainOfGitdir('/w/a/.git/modules/b/modules/c/worktrees/z'), '/w/a/b/c')
})
test('anything else is not a worktree', () => {
  assert.equal(mainOfGitdir('/w/a/.git'), null)
  assert.equal(mainOfGitdir(''), null)
})
