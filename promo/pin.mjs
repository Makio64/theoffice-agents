#!/usr/bin/env node
// The promo draws with the plugin as committed, not as the working tree is right now: other sessions change plugin/lib/
// in this same checkout, and a video in the making should not change under them. This copies plugin/lib/, test/helpers/ and
// test/fixtures/ at a commit (HEAD unless named) into promo/.head/, which promo/scenes.mjs draws from, and notes the
// commit in promo/.head/COMMIT. Run it again to take a newer plugin into the promo.
//   node promo/pin.mjs            the plugin at HEAD
//   node promo/pin.mjs 0d28f1b    at that commit
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..')
const DIR = path.join(HERE, '.head')
const ref = process.argv[2] ?? 'HEAD'

const commit = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd: ROOT, encoding: 'utf8' }).trim()
const tar = execFileSync('git', ['archive', '--format=tar', commit, 'plugin/lib', 'test/helpers', 'test/fixtures'], { cwd: ROOT, maxBuffer: 1e9 })
fs.rmSync(DIR, { recursive: true, force: true })
fs.mkdirSync(DIR, { recursive: true })
execFileSync('tar', ['-x', '-C', DIR], { input: tar })
fs.writeFileSync(path.join(DIR, 'COMMIT'), `${commit}\n`)
console.log(`promo/.head: the plugin at ${commit.slice(0, 7)}`)
