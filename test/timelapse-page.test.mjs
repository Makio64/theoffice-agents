// The timelapse's own page (lib/timelapse-page.mjs) and its player (lib/timelapse-player.mjs): the page is one
// self-contained document (the generator mark early, a CSP that loads nothing and runs only the player, by the hash
// its caller computes from PLAYER_JS), every facts string escaped, no event attribute, no URL out, the slots' labels
// carried as JSON; the player bakes SMIL frames as the browser draws them (valueAt), picks the GIF's palette by
// popularity and maps the rest to the nearest color, and its GIF encoder writes a GIF89a that a hand-written decoder
// reads back pixel for pixel, its delays, its endless loop, its clear codes and 12-bit codes included. PLAYER_JS is
// the module's own functions as source: it parses as a script, and the same source run in a VM encodes the same GIF.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import vm from 'node:vm'
import { PLAYER_JS, renderTimelapsePage } from '../plugin/lib/timelapse-page.mjs'
import {
  PLAYER, animSpec, buildPalette, clockSeconds, compileGroup, compose, encodeGif, exportSize, fileName, frameValues, gifEncoder, indexFrame,
  lerpValue, lzwEncode, motionPoint, nearestColor, paceOf, paletteMapper, pickMime, playerScript, slotAt, splitList, valueAt, webmDuration,
} from '../plugin/lib/timelapse-player.mjs'
import * as svgModule from '../plugin/lib/svg.mjs'
import { cropTimeline, lapseSlot } from '../plugin/lib/model.mjs'
import { clone, timelapseFacts } from './helpers/facts.mjs'

// ---------------------------------------------------------------- fixtures

const hashOf = (js) => `sha256-${crypto.createHash('sha256').update(js, 'utf8').digest('base64')}`
const HASH = hashOf(PLAYER_JS)
const CSP = `default-src 'none'; style-src 'unsafe-inline'; script-src '${HASH}'; img-src blob: data:; media-src blob:`

// A tiny timelapse as the SVG renderer draws one: 4 slots (D = 4 × 0.25 + 2.5 = 3.5 s), a desk that lights up in slots
// 1 and 2, a linear playhead, and a star twinkling on a short loop with a negative begin (a decoration).
const TINY = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32" viewBox="0 0 32 16" data-timelapse="week" data-loop="3.5" ' +
  'data-slots="4" data-slot-seconds="0.25" data-hold="2.5" shape-rendering="crispEdges" style="background:#14120f">' +
  '<rect width="32" height="16" fill="#1d1916"/>' +
  '<rect x="2" y="2" width="4" height="4" fill="#9ab86a" display="none"><animate attributeName="display" values="none;inline;inline;none" ' +
  'keyTimes="0;0.07143;0.14286;0.21429" dur="3.5s" calcMode="discrete" repeatCount="indefinite"/></rect>' +
  '<g><rect x="0" y="12" width="2" height="2" fill="#eec96f"/><animateTransform attributeName="transform" type="translate" ' +
  'values="0 0;30 0;30 0" keyTimes="0;0.28571;1" dur="3.5s" repeatCount="indefinite"/></g>' +
  '<rect x="20" y="2" width="3" height="3" fill="#e9e6ff"><animate attributeName="opacity" values="1;0" dur="0.8s" begin="-0.3s" ' +
  'calcMode="discrete" repeatCount="indefinite"/></rect></svg>'

const page = (over = {}) => renderTimelapsePage({ svg: TINY, facts: timelapseFacts('week'), scriptHash: HASH, ...over })

// HTML attribute value → text (the five escapes svg-kit esc writes)
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

// Every attribute of every tag, the script's text left out: [tag, name, raw value]
function attributesOf(html) {
  const out = []
  for (const [, tag, rest] of html.replace(PLAYER_JS, '').matchAll(/<([a-zA-Z][\w:-]*)([^>]*)>/g)) {
    for (const m of rest.matchAll(/\s([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)) out.push([tag, m[1], m[2] ?? ''])
  }
  return out
}

// ---------------------------------------------------------------- a GIF decoder, by hand

function lzwDecode(data, minCode, stats) {
  const clear = 1 << minCode
  const end = clear + 1
  let size = minCode + 1
  let next = end + 1
  const dict = Array.from({ length: clear }, (_, i) => [i])
  let prev = null
  let pos = 0
  const out = []
  const read = () => {
    let v = 0
    for (let i = 0; i < size; i++, pos++) v |= ((data[pos >> 3] >> (pos & 7)) & 1) << i
    return v
  }
  while (pos + size <= data.length * 8) {
    const code = read()
    stats.maxSize = Math.max(stats.maxSize, size)
    if (code === clear) {
      stats.clears++
      size = minCode + 1
      next = end + 1
      dict.length = end + 1
      prev = null
      continue
    }
    if (code === end) { stats.ended = true; break }
    let entry
    if (prev === null) entry = dict[code]
    else if (code < next && dict[code]) entry = dict[code]
    else if (code === next) entry = [...dict[prev], dict[prev][0]]
    if (!entry) throw new Error(`bad code ${code} (next ${next})`)
    out.push(...entry)
    if (prev !== null && next < 4096) dict[next++] = [...dict[prev], entry[0]]
    if (next === 1 << size && size < 12) size++
    prev = code
  }
  return out
}

// Header, global table, extensions, images (composited on a canvas of indices), trailer.
function decodeGif(bytes) {
  let p = 0
  const u8 = () => bytes[p++]
  const u16 = () => { const v = bytes[p] | (bytes[p + 1] << 8); p += 2; return v }
  const blocks = () => {
    const out = []
    for (let n = u8(); n; n = u8()) { assert.ok(n <= 255); out.push(bytes.subarray(p, p + n)); p += n }
    return out
  }
  const sig = String.fromCharCode(...bytes.subarray(0, 6))
  p = 6
  const width = u16()
  const height = u16()
  const packed = u8()
  p += 2
  const table = []
  if (packed & 0x80) for (let i = 0; i < 1 << ((packed & 7) + 1); i++) table.push([u8(), u8(), u8()])
  const canvas = new Array(width * height).fill(-1)
  const frames = []
  const stats = { clears: 0, maxSize: 0, ended: false, blocks: 0 }
  let loop = null
  let gce = null
  for (;;) {
    const b = u8()
    if (b === 0x3b) break
    if (b === 0x21) {
      const label = u8()
      const bl = blocks()
      if (label === 0xf9) gce = { disposal: (bl[0][0] >> 2) & 7, transparent: bl[0][0] & 1 ? bl[0][3] : -1, delay: bl[0][1] | (bl[0][2] << 8) }
      if (label === 0xff && String.fromCharCode(...bl[0]) === 'NETSCAPE2.0') loop = bl[1][1] | (bl[1][2] << 8)
      continue
    }
    assert.equal(b, 0x2c, `block ${b} at ${p - 1}`)
    const [x, y, w, h] = [u16(), u16(), u16(), u16()]
    assert.equal(u8(), 0, 'no local table, no interlace')
    const min = u8()
    const bl = blocks()
    stats.blocks += bl.length
    const idx = lzwDecode(Uint8Array.from(bl.flatMap((x) => [...x])), min, stats)
    assert.equal(idx.length, w * h, 'one index per pixel of the box')
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const v = idx[j * w + i]
        if (v !== gce?.transparent) canvas[(y + j) * width + x + i] = v
      }
    }
    frames.push({ ...gce, box: [x, y, w, h], rgb: canvas.map((v) => table[v]) })
    gce = null
  }
  return { sig, width, height, depth: (packed & 7) + 1, table, loop, frames, stats, rest: bytes.length - p }
}

// ---------------------------------------------------------------- the page

describe('the page', () => {
  test('opens with a doctype, utf-8, the viewport and the generator mark in its first 1024 bytes', () => {
    const html = page({ title: 'x'.repeat(3000) })
    assert.ok(html.startsWith('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'))
    const head = Buffer.from(html, 'utf8').subarray(0, 1024).toString('utf8')
    assert.ok(head.includes('<meta name="generator" content="theoffice">'))
    assert.ok(head.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'))
    assert.ok(html.endsWith('</html>\n'))
  })

  test('carries a CSP that loads nothing and runs only the player, by the hash the caller passes', () => {
    const csp = [...page().matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g)]
    assert.equal(csp.length, 1)
    assert.equal(csp[0][1], CSP)
    assert.doesNotMatch(csp[0][1], /connect-src/)
  })

  test('runs no script at all when the hash is missing or not a hash', () => {
    for (const scriptHash of [undefined, '', 'sha256-abc\' \'unsafe-inline', "'unsafe-inline'", 'md5-xyz', 42]) {
      const html = page({ scriptHash })
      assert.ok(html.includes("script-src 'none';"), String(scriptHash))
      assert.doesNotMatch(html, /unsafe-inline'; img|unsafe-eval/)
    }
  })

  test('has exactly one script, the player, whose sha256 a caller computes from PLAYER_JS', () => {
    const html = page()
    assert.equal(html.match(/<script/gi).length, 1)
    const [, text] = /<script>([\s\S]*?)<\/script>/.exec(html)
    assert.equal(text, PLAYER_JS)
    assert.equal(hashOf(text), HASH)
    assert.ok(html.includes(`script-src '${hashOf(text)}'`))
  })

  test('sets no event handler attribute and points at nothing outside itself', () => {
    for (const kind of ['yesterday', 'week', 'month']) {
      const html = page({ facts: timelapseFacts(kind, { heavy: true }) })
      const attrs = attributesOf(html)
      assert.ok(attrs.length > 20)
      assert.deepEqual(attrs.filter(([, name]) => /^on/i.test(name)), [])
      const links = attrs.filter(([, name]) => /^(?:xlink:)?(?:href|src|srcset|action|formaction|poster|background)$/i.test(name))
      for (const [tag, name, value] of links) assert.match(value, /^["']?#/, `${tag} ${name}`)
      assert.doesNotMatch(html, /https?:|ftp:|file:|javascript:|@import/i)
      assert.doesNotMatch(html, /<(?:link|img|iframe|frame|object|embed|base|form|audio|video|source|foreignObject)\b/i)
      // CSS and SVG url() only ever point inside the drawing (createObjectURL( is the player's, not a url())
      assert.doesNotMatch(html, /(?<![\w.])url\(\s*['"]?(?!#)/i)
      assert.doesNotMatch(html.replace(PLAYER_JS, ''), /\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+/i)
    }
  })

  test('escapes the title and every facts string', () => {
    const evil = '</title><script>alert(1)</script><img src=x onerror=alert(1)>"\' onload="x" &amp;'
    const f = timelapseFacts('week')
    f.timeline.label = evil
    f.generated_at = evil
    f.spec = evil
    f.range.label = evil
    f.now.local_date = `2026-10-26"${evil}`
    f.timeline.kind = evil
    const html = page({ facts: f, title: evil })
    assert.equal(html.match(/<script/gi).length, 1)
    assert.doesNotMatch(html, /<img|<\/title><script|onerror=alert\(1\)>/i)
    assert.deepEqual(attributesOf(html).filter(([, name]) => /^on/i.test(name)), [])
    const escaped = '&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;&quot;&#39; onload=&quot;x&quot; &amp;amp;'
    assert.ok(html.includes(`<title>${escaped}</title>`))
    assert.ok(html.includes('<h1>&lt;/TITLE&gt;&lt;SCRIPT&gt;'))
    assert.ok(html.includes('<span class="when">&lt;/title&gt;'))
    // a kind or a date that is not one is left out, not escaped into the data
    assert.ok(html.includes('<div id="tl-data" hidden data-kind="week" data-date="" '))
    // control characters and bidi overrides never reach the page
    const odd = page({ title: 'a\u0007b‮c\u0000d' })
    assert.ok(odd.includes('<title>abcd</title>'))
  })

  test('says the range as the facts do, and the title it is given or the timelapse words for the kind', () => {
    assert.ok(page().includes('<title>The Office · timelapse · this week</title>'))
    assert.ok(page().includes('<h1>THE OFFICE · TIMELAPSE · THIS WEEK</h1><span class="when">Tue 20 Oct → Mon 26 Oct</span>'))
    assert.ok(page({ facts: timelapseFacts('yesterday') }).includes('<title>The Office · timelapse · yesterday</title>'))
    assert.ok(page({ facts: timelapseFacts('month') }).includes('<title>The Office · timelapse · this month</title>'))
    assert.ok(page({ title: 'My week' }).includes('<title>My week</title>'))
  })

  test('carries every slot\'s label as JSON a script reads back', () => {
    for (const kind of ['yesterday', 'week', 'month']) {
      const f = timelapseFacts(kind)
      // the range cut to where something happened, as the drawing plays it
      const tl = cropTimeline(f.timeline)
      const html = page({ facts: f })
      const [, raw] = /<div id="tl-data" hidden data-kind="([a-z]+)" data-date="2026-10-26" data-labels="([^"]*)"><\/div>/.exec(html).slice(1)
      const labels = JSON.parse(unescape(raw))
      assert.equal(labels.length, tl.slots)
      assert.deepEqual(labels, Array.from({ length: tl.slots }, (_, i) => lapseSlot(tl, i).label))
      assert.ok(html.includes(`data-kind="${kind}"`))
      assert.ok(html.includes(`max="${tl.slots - 1}"`))
      assert.ok(html.includes(`<output id="tl-slot" for="tl-scrub">${labels[0]}</output>`))
    }
    const month = JSON.parse(unescape(/data-labels="([^"]*)"/.exec(page({ facts: timelapseFacts('month') }))[1]))
    assert.deepEqual(month.slice(0, 2), ['Sun 27 00:00', 'Sun 27 04:00'])
    // yesterday from 06:45, its first desk in at 08:00
    const day = JSON.parse(unescape(/data-labels="([^"]*)"/.exec(page({ facts: timelapseFacts('yesterday') }))[1]))
    assert.deepEqual(day.slice(0, 2), ['Sun 06:45', 'Sun 07:00'])
    assert.ok(page({ facts: timelapseFacts('yesterday') }).includes('69 slots of 15 min, a twentieth of a second each'))
  })

  test('puts the drawing inline without its namespaces, and says there is nothing to replay without one', () => {
    const html = page({ svg: TINY.replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ') })
    assert.ok(html.includes('<figure id="tl-stage"><svg width="64" height="32" viewBox="0 0 32 16" data-timelapse="week"'))
    assert.ok(html.includes('<animate attributeName="display"'))
    for (const svg of [undefined, '', '<div>no</div>', '<svg>unclosed', 42]) {
      const empty = page({ svg })
      assert.ok(empty.includes('<figure id="tl-stage"><p class="empty">Nothing to replay here.</p></figure>'), String(svg))
    }
  })

  test('renders partial facts without throwing: no timeline is no slots', () => {
    for (const facts of [undefined, null, {}, { timeline: null }, { timeline: { kind: 'week', slots: 'many' } }, { timeline: { slots: 1e9, days: [] } }]) {
      const html = renderTimelapsePage({ facts, svg: TINY, scriptHash: HASH })
      assert.ok(html.includes('data-labels="'))
      assert.ok(html.length < 200_000)
    }
    assert.ok(renderTimelapsePage().includes('Nothing to replay here.'))
  })

  test('hides the controls until its script shows them, binding every listener itself', () => {
    const html = page()
    assert.ok(html.includes('<div class="bar" id="tl-controls" hidden>'))
    assert.ok(html.includes('<div class="bar" id="tl-export" hidden>'))
    for (const id of ['tl-play', 'tl-scrub', 'tl-slot', 'tl-gif', 'tl-video', 'tl-svg', 'tl-progress', 'tl-status', 'tl-data']) {
      assert.ok(html.includes(`id="${id}"`), id)
    }
    assert.deepEqual([...html.matchAll(/data-speed="([^"]+)"/g)].map((m) => m[1]), ['0.5', '1', '2', '4'])
    assert.ok(html.includes('data-speed="1" aria-pressed="true"'))
    assert.ok(/^<input type="range" id="tl-scrub" min="0" max="159" step="1" value="0"/m.test(html)) // the week's 160 slots from 03:00
  })

  const real = typeof svgModule.renderTimelapse === 'function'
  test('wraps the real timelapse drawing within the same rules', { skip: !real && 'lib/svg.mjs has no renderTimelapse yet' }, () => {
    for (const kind of ['yesterday', 'week', 'month']) {
      const f = timelapseFacts(kind, { heavy: true })
      const html = renderTimelapsePage({ svg: svgModule.renderTimelapse(f), facts: f, scriptHash: HASH })
      assert.match(html, new RegExp(`<figure id="tl-stage"><svg [^>]*data-timelapse="${kind}"`))
      assert.equal(html.match(/<script/gi).length, 1)
      assert.deepEqual(attributesOf(html).filter(([, name]) => /^on/i.test(name)), [])
      assert.doesNotMatch(html, /https?:/)
    }
  })
})

// ---------------------------------------------------------------- PLAYER_JS

describe('PLAYER_JS', () => {
  test('parses as a script without running, and stays ASCII so every encoding hashes it alike', () => {
    assert.doesNotThrow(() => new vm.Script(PLAYER_JS))
    assert.match(PLAYER_JS, /^[\x00-\x7f]*$/)
    assert.doesNotMatch(PLAYER_JS, /<\/script|<script|<!--|\r/i)
    assert.ok(PLAYER_JS.startsWith('(function () {\n\'use strict\'\n'))
    assert.ok(PLAYER_JS.endsWith('\nmain()\n})()\n'))
    assert.equal(PLAYER_JS, playerScript())
  })

  test('declares every helper it calls: run with a page that has no drawing, it says so and stops', () => {
    const said = []
    const status = { set textContent(v) { said.push(v) } }
    const document = { getElementById: (id) => (id === 'tl-status' ? status : null), querySelector: () => null }
    vm.runInNewContext(PLAYER_JS, { document })
    assert.deepEqual(said, ['This page has no drawing to replay.'])
  })

  test('is the module\'s own functions: its source, run in a VM, encodes the GIF the module encodes', () => {
    const sandbox = vm.runInNewContext(playerScript('return { encodeGif, valueAt, buildPalette, paletteMapper, indexFrame, exportSize, PLAYER }'), {})
    const frames = [Uint8Array.from({ length: 35 }, (_, i) => i % 3), Uint8Array.from({ length: 35 }, (_, i) => (i * 7) % 4)]
    const args = { width: 7, height: 5, palette: [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]], frames: frames.map((indices) => ({ indices, delay: 25 })) }
    assert.deepEqual([...sandbox.encodeGif(args)], [...encodeGif(args)])
    assert.equal(sandbox.valueAt({ values: '0;10', dur: '2s' }, 0.5), '2.5')
    assert.deepEqual({ ...sandbox.exportSize({ width: 960, height: 600, viewBox: '0 0 480 300' }, 1600) }, { width: 960, height: 600, scale: 2 })
    assert.equal(sandbox.PLAYER.GIF_WIDTH, PLAYER.GIF_WIDTH)
  })

  test('the player and the page are PURE: no node:* import, the player no import at all', () => {
    for (const file of ['timelapse-player.mjs', 'timelapse-page.mjs']) {
      const src = fs.readFileSync(new URL(`../plugin/lib/${file}`, import.meta.url), 'utf8')
      assert.doesNotMatch(src, /from ['"]node:|require\(|import\(/, file)
      const from = [...src.matchAll(/^(?:import|export)\b[^'"]*?\bfrom '([^']+)'/gm)].map((m) => m[1])
      assert.deepEqual(from, file === 'timelapse-player.mjs' ? [] : ['./model.mjs', './svg-kit.mjs', './timelapse-player.mjs'], file)
    }
  })

  test('weighs what a page can carry', () => {
    assert.ok(PLAYER_JS.length < 40_000, `${PLAYER_JS.length} chars`)
  })
})

// ---------------------------------------------------------------- SMIL values

describe('valueAt', () => {
  test('steps a discrete animation at even quarters, and repeats', () => {
    const spec = { values: 'a;b;c;d', dur: '4s', calcMode: 'discrete', repeatCount: 'indefinite' }
    assert.deepEqual([0, 0.99, 1, 2.5, 3.99, 4, 5.2, 403.5].map((t) => valueAt(spec, t)), ['a', 'a', 'b', 'c', 'd', 'a', 'b', 'd'])
    assert.equal(valueAt({ values: 'x;y', dur: 2, calcMode: 'discrete' }, 0.9), 'x')
    assert.equal(valueAt({ values: 'x;y', dur: 2, calcMode: 'discrete' }, 1), 'y')
  })

  test('blends a linear one between values evenly spaced, and keeps to its keyTimes', () => {
    assert.equal(valueAt({ values: '0;10', dur: '2s' }, 0.5), '2.5')
    assert.deepEqual([0.5, 1, 1.5].map((t) => valueAt({ values: '0;10;0', dur: '2s' }, t)), ['5', '10', '5'])
    const keyed = { values: '0;10;20', keyTimes: '0;0.8;1', dur: '10s', repeatCount: 'indefinite' }
    assert.deepEqual([4, 8, 9, 14].map((t) => valueAt(keyed, t)), ['5', '10', '15', '5'])
    const stepped = { values: 'a;b;c', keyTimes: '0;0.5;0.75', dur: '4s', calcMode: 'discrete', repeatCount: 'indefinite' }
    assert.deepEqual([1.9, 2, 2.9, 3, 3.99].map((t) => valueAt(stepped, t)), ['a', 'b', 'b', 'c', 'c'])
    // keyTimes that do not fit the values fall back to even spacing
    assert.equal(valueAt({ values: '0;10', keyTimes: '0;0.5;1', dur: '2s' }, 0.5), '2.5')
  })

  test('starts mid-loop on a negative begin, and has no effect before a positive one', () => {
    const twinkle = { values: '1;0', dur: '0.8s', begin: '-0.3s', calcMode: 'discrete', repeatCount: 'indefinite' }
    assert.deepEqual([0, 0.09, 0.1, 0.49, 0.5].map((t) => valueAt(twinkle, t)), ['1', '1', '0', '0', '1'])
    assert.equal(valueAt({ values: '1;2', dur: '1s', begin: '1s' }, 0.5), null)
    assert.equal(valueAt({ values: '1;2', dur: '1s', begin: '1s', calcMode: 'discrete' }, 1.6), '2')
    assert.equal(valueAt({ values: '1;2', dur: '1s', begin: 'click' }, 5), null)
    assert.equal(valueAt({ values: '0;10', dur: '1s', begin: '0s;5s', repeatCount: 'indefinite' }, 5.5), '5')
  })

  test('ends after its repeats unless frozen, frozen where its last repeat ended', () => {
    const twice = { values: '0;10', dur: '1s', repeatCount: '2' }
    assert.equal(valueAt(twice, 1.5), '5')
    assert.equal(valueAt(twice, 2.5), null)
    assert.equal(valueAt({ ...twice, fill: 'freeze' }, 2.5), '10')
    assert.equal(valueAt({ values: '0;10', dur: '1s', repeatCount: '1.5', fill: 'freeze' }, 3), '5')
    assert.equal(valueAt({ values: '0;10', dur: '2s', repeatDur: '3s', fill: 'freeze' }, 9), '5')
    assert.equal(valueAt({ values: '0;10', dur: '1s' }, 1), null)
    assert.equal(valueAt({ values: 'on', dur: 'indefinite' }, 99), 'on')
  })

  test('blends number lists, paths and hex colors, and steps what cannot blend', () => {
    assert.equal(valueAt({ values: '3 4;7 8', dur: '1s' }, 0.5), '5 6')
    assert.equal(valueAt({ values: '0,0;10,5', dur: '1s' }, 0.5), '5,2.5')
    assert.equal(valueAt({ values: 'M0 0h4;M2 2h8', dur: '1s' }, 0.5), 'M1 1h6')
    assert.equal(valueAt({ values: '#000000;#ffffff', dur: '1s' }, 0.5), '#808080')
    assert.equal(valueAt({ values: '#000;#f00', dur: '1s' }, 0.25), '#400000')
    // display and color names cannot blend: they step on even quarters as browsers fall back to discrete
    assert.deepEqual([0.4, 0.5, 0.9].map((t) => valueAt({ values: 'none;inline', dur: '1s' }, t)), ['none', 'inline', 'inline'])
    assert.equal(valueAt({ values: 'red;blue', dur: '1s' }, 0.3), 'red')
    assert.equal(valueAt({ values: 'M0 0h4;M0 0v4', dur: '1s' }, 0.3), 'M0 0h4')
    assert.equal(lerpValue('1 2', '3', 0.5), null)
    assert.equal(lerpValue('-1.5', '2.5', 0.25), '-0.5')
  })

  test('reads clock values and lists as SMIL writes them', () => {
    assert.deepEqual(['2.5s', '-1.25s', '300ms', '0.5min', '1h', '12', '01:02.5', '0:01:02.5', 'indefinite', 'click', '', 3].map((v) => clockSeconds(v)),
      [2.5, -1.25, 0.3, 30, 3600, 12, 62.5, 62.5, Infinity, NaN, NaN, 3])
    assert.deepEqual(splitList('a; b;c;'), ['a', 'b', 'c'])
    assert.deepEqual(splitList(['x ', ' y']), ['x', 'y'])
  })
})

describe('the frame baker', () => {
  const get = (attrs) => (k) => attrs[k] ?? null
  test('reads each SMIL element as the baker needs it', () => {
    assert.deepEqual(animSpec('set', get({ attributeName: 'display', to: 'none', begin: '1s' })).spec.values, ['none'])
    assert.equal(animSpec('set', get({ attributeName: 'display', to: 'none' })).spec.calcMode, 'discrete')
    assert.equal(animSpec('animateTransform', get({ attributeName: 'transform', values: '0 0;1 1' })).type, 'translate')
    assert.equal(animSpec('animateTransform', get({ attributeName: 'transform', type: 'rotate', values: '0;90' })).type, 'rotate')
    assert.deepEqual(animSpec('animate', get({ attributeName: 'x', from: '1', to: '5' })).spec.values, ['1', '5'])
    assert.equal(animSpec('animate', get({ attributeName: 'x', to: '5' })).fromBase, true)
    assert.equal(animSpec('animateMotion', get({ attributeName: 'x', values: '1;2' })), null)
    assert.equal(animSpec('animate', get({ values: '1;2' })), null)
    // a move along a path: a translate added to the target's own transform, keyed by the share of the way
    const motion = animSpec('animateMotion', get({ path: 'M0 0H10', keyPoints: '0;1;0', keyTimes: '0;.5;1', calcMode: 'linear', dur: '2s' }))
    assert.deepEqual([motion.attr, motion.type, motion.additive, motion.path, motion.spec.values], ['transform', 'translate', true, 'M0 0H10', '0;1;0'])
    assert.equal(animSpec('animateMotion', get({ path: 'M0 0H10', dur: '2s' })).spec.values, '0;1')
  })

  test('finds a moving body where the browser puts it: the share of its way by length, arcs and all', () => {
    // a line, then the sky's way: up a quarter of an ellipse, along, down another
    assert.deepEqual(motionPoint('M0 0H10V10', 0.75), [10, 5])
    const way = 'M88 63A26 51 0 0 1 114 12H366A26 51 0 0 1 392 63'
    assert.deepEqual(motionPoint(way, 0), [88, 63])
    assert.deepEqual(motionPoint(way, 1), [392, 63])
    assert.deepEqual(motionPoint(way, 0.5), [240, 12])
    const [x, y] = motionPoint(way, 0.05)
    assert.ok(x > 88 && x < 100 && y < 63 && y > 30, `on the way up, curving: ${x}, ${y}`)
    assert.deepEqual(motionPoint('', 0.5), [0, 0])
    // baked: the sun halfway up its first crossing, back at its rising out of sight once it has set
    const g = compileGroup('translate(5 5)', [animSpec('animateMotion', get({ path: 'M0 0H10', keyPoints: '0;1;0;0', keyTimes: '0;.5;.5;1', calcMode: 'linear', dur: '2s', repeatCount: 'indefinite' }))], 2)
    assert.deepEqual(frameValues([g], 0.5, false), ['translate(5 5) translate(5 0)'])
    assert.deepEqual(frameValues([g], 1.5, false), ['translate(5 5) translate(0 0)'])
  })

  test('composes the animations on an attribute over its base, by priority', () => {
    assert.equal(compose('5', [{ value: null }]), '5')
    assert.equal(compose(null, [{ value: '3 4', type: 'translate' }]), 'translate(3 4)')
    const sums = [{ value: '3 4', type: 'translate', additive: true }, { value: '90', type: 'rotate', additive: true }]
    assert.equal(compose('scale(2)', sums), 'scale(2) translate(3 4) rotate(90)')
    assert.equal(compose('scale(2)', [{ value: '3 4', type: 'translate' }]), 'translate(3 4)')
    assert.equal(compose('10', [{ value: '2.5', additive: true }]), '12.5')
    assert.equal(compose('1', [{ value: '2' }, { value: '3' }]), '3')
    // a to-animation starts from the base
    const g = compileGroup('10', [animSpec('animate', get({ attributeName: 'x', to: '20', dur: '1s', fill: 'freeze' }))], 3.5)
    assert.deepEqual(frameValues([g], 0.5, true), ['15'])
    // the later begin wins whatever the document order
    const late = compileGroup('0', [
      { ...animSpec('animate', get({ attributeName: 'x', values: '7', dur: '1s', begin: '1s', fill: 'freeze' })), order: 0 },
      { ...animSpec('animate', get({ attributeName: 'x', values: '3', dur: '1s', fill: 'freeze' })), order: 1 },
    ], 3.5)
    assert.deepEqual(frameValues([late], 2, true), ['7'])
    assert.deepEqual(frameValues([late], 0.5, true), ['3'])
  })

  test('runs only the timeline for the GIF, every animation for the video', () => {
    const loop = { dur: '3.5s', repeatCount: 'indefinite' }
    const desk = compileGroup('none', [animSpec('animate', get({
      ...loop, attributeName: 'display', values: 'none;inline;inline;none', keyTimes: '0;0.07143;0.14286;0.21429', calcMode: 'discrete',
    }))], 3.5)
    const twinkle = { attributeName: 'opacity', values: '1;0', dur: '0.8s', begin: '-0.3s', calcMode: 'discrete', repeatCount: 'indefinite' }
    const star = compileGroup(null, [animSpec('animate', get(twinkle))], 3.5)
    const walk = { ...loop, attributeName: 'transform', values: '0 0;30 0;30 0', keyTimes: '0;0.28571;1' }
    const head = compileGroup(null, [animSpec('animateTransform', get(walk))], 3.5)
    const at = (t, lively) => frameValues([desk, star, head], t, lively)
    // slot i at mid-slot: the desk lights in slots 1 and 2, the star holds its t = 0 look in the GIF
    assert.deepEqual([0, 1, 2, 3].map((i) => at((i + 0.5) * 0.25, false)[0]), ['none', 'inline', 'inline', 'none'])
    assert.deepEqual([0, 1, 2, 3].map((i) => at((i + 0.5) * 0.25, false)[1]), ['1', '1', '1', '1'])
    assert.equal(at(0.375, true)[1], '0')
    assert.ok(Math.abs(Number(/^translate\(([\d.]+) 0\)$/.exec(at(0.5, false)[2])[1]) - 15) < 1e-3)
    assert.equal(at(3, false)[2], 'translate(30 0)')
  })
})

// ---------------------------------------------------------------- pace, sizes, names

describe('pace, sizes and names', () => {
  test('reads the pace off the drawing\'s root', () => {
    const attrs = { 'data-slots': '160', 'data-slot-seconds': '0.05', 'data-hold': '2.5', 'data-loop': '10.5' }
    assert.deepEqual(paceOf((k) => attrs[k] ?? null), { slots: 160, slotSeconds: 0.05, hold: 2.5, loop: 10.5 })
    assert.deepEqual(paceOf((k) => ({ 'data-slots': '4' })[k] ?? null), { slots: 4, slotSeconds: 0.05, hold: 2.5, loop: 2.7 })
    assert.deepEqual(paceOf(() => null), { slots: 0, slotSeconds: 0.05, hold: 2.5, loop: 2.5 })
  })

  test('puts each moment of the loop in its slot, the last held to the end', () => {
    assert.deepEqual([0, 0.24, 0.25, 0.9, 1.1, 3.4].map((t) => slotAt(t, 0.25, 4)), [0, 0, 1, 3, 3, 3])
    assert.equal(slotAt(7.5, 0.25, 96), 30)
    assert.equal(slotAt(1, 0.25, 0), 0)
  })

  test('sizes the export at a whole scale of the viewBox, capped by whole steps', () => {
    assert.deepEqual(exportSize({ width: '960', height: '700', viewBox: '0 0 480 350' }, 1600), { width: 960, height: 700, scale: 2 })
    assert.deepEqual(exportSize({ width: '960', height: '700', viewBox: '0 0 480 350' }, 800), { width: 480, height: 350, scale: 1 })
    assert.deepEqual(exportSize({ width: '2400', height: '1200', viewBox: '0 0 600 300' }, 1600), { width: 1200, height: 600, scale: 2 })
    assert.deepEqual(exportSize({ width: '300', height: '100', viewBox: '0 0 600 200' }, 1600), { width: 600, height: 200, scale: 1 })
    assert.deepEqual(exportSize({ width: '4000', height: '1000', viewBox: '0 0 4000 1000' }, 1600), { width: 1333, height: 333, scale: 1 / 3 })
    assert.deepEqual(exportSize({ width: '640', height: '480' }), { width: 640, height: 480, scale: 1 })
    assert.deepEqual(exportSize({}), { width: 960, height: 540, scale: 1 })
  })

  test('names the downloads by kind and date, never by anything else', () => {
    assert.equal(fileName('week', '2026-10-26', 'gif'), 'theoffice-timelapse-week-2026-10-26.gif')
    assert.equal(fileName('yesterday', '', 'webm', '2026-10-28'), 'theoffice-timelapse-yesterday-2026-10-28.webm')
    assert.equal(fileName('../../etc', '2026-10-26/../x', 'svg', 'nope'), 'theoffice-timelapse-week.svg')
  })

  test('records the first video type the browser takes', () => {
    assert.equal(pickMime(() => true), 'video/webm;codecs=vp9')
    assert.equal(pickMime((t) => t === 'video/mp4'), 'video/mp4')
    assert.equal(pickMime((t) => { if (t.includes('vp9')) throw new Error('no'); return t === 'video/webm' }), 'video/webm')
    assert.equal(pickMime(() => false), '')
  })
})

// ---------------------------------------------------------------- palette

const rgba = (colors) => Uint8ClampedArray.from(colors.flatMap(([r, g, b]) => [r, g, b, 255]))

describe('the palette', () => {
  test('keeps the most used colors first, ties in color order, at most max', () => {
    const a = [10, 20, 30]
    const b = [200, 0, 0]
    const c = [0, 0, 200]
    const d = [1, 1, 1]
    const pal = buildPalette([rgba([a, a, b, c, a, b]), rgba([c, d, b, b])], 255)
    assert.deepEqual(pal, [b, a, c, d])
    assert.deepEqual(buildPalette([rgba([a, a, b, c, a, b]), rgba([c, d, b, b])], 2), [b, a])
    assert.deepEqual(buildPalette([rgba([a, c])]), [c, a])
  })

  test('maps a color to its own index, or else to the nearest', () => {
    const pal = [[0, 0, 0], [255, 255, 255], [200, 40, 40], [40, 160, 60]]
    const map = paletteMapper(pal)
    const key = ([r, g, b]) => (r << 16) | (g << 8) | b
    assert.deepEqual(pal.map((c) => map(key(c))), [0, 1, 2, 3])
    assert.equal(map(key([190, 50, 45])), 2)
    assert.equal(map(key([20, 20, 20])), 0)
    assert.equal(map(key([240, 230, 250])), 1)
    assert.equal(map(key([60, 140, 80])), 3)
    assert.equal(nearestColor(pal, 60, 60, 60), 0)
    assert.equal(nearestColor(pal, 200, 200, 200), 1)
    assert.equal(nearestColor(pal, 130, 130, 130), 3)
  })

  test('indexes a frame, reusing the indices of the pixels that did not change', () => {
    const pal = [[0, 0, 0], [255, 0, 0], [0, 0, 255]]
    let lookups = 0
    const base = paletteMapper(pal)
    const map = (c) => { lookups++; return base(c) }
    const one = rgba([[0, 0, 0], [250, 5, 5], [250, 5, 5], [0, 0, 250]])
    const idx = indexFrame(one, map)
    assert.deepEqual([...idx], [0, 1, 1, 2])
    assert.equal(lookups, 3)
    lookups = 0
    const two = rgba([[0, 0, 0], [250, 5, 5], [0, 0, 255], [0, 0, 250]])
    assert.deepEqual([...indexFrame(two, map, one, idx)], [0, 1, 2, 2])
    assert.equal(lookups, 1)
  })
})

// ---------------------------------------------------------------- GIF

describe('the GIF encoder', () => {
  const PAL = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]]
  const W = 7
  const H = 5
  // three different pictures, the second shown twice in a row
  const f0 = Uint8Array.from({ length: W * H }, (_, i) => (i * 5 + (i >> 2)) % 4)
  const f1 = Uint8Array.from(f0)
  f1[8] = (f1[8] + 1) % 4
  f1[9] = (f1[9] + 2) % 4
  f1[16] = (f1[16] + 3) % 4
  const f3 = Uint8Array.from(f1)
  f3[34] = (f3[34] + 1) % 4
  f3[0] = (f3[0] + 2) % 4
  const frames = [{ indices: f0, delay: 25 }, { indices: f1, delay: 25 }, { indices: f1, delay: 25 }, { indices: f3, delay: 275 }]
  const gif = decodeGif(encodeGif({ width: W, height: H, palette: PAL, frames }))

  test('writes a GIF89a header, a global table of a power of two, an endless loop and the trailer', () => {
    assert.equal(gif.sig, 'GIF89a')
    assert.deepEqual([gif.width, gif.height], [W, H])
    // four colors and the transparent index: a table of 8
    assert.equal(gif.table.length, 8)
    assert.deepEqual(gif.table.slice(0, 4), PAL)
    assert.equal(gif.loop, 0)
    assert.equal(gif.rest, 0)
    assert.ok(gif.stats.ended)
  })

  test('decodes to the frames it was given, a frame that changes nothing folded into the one before', () => {
    const want = [f0, f1, f3].map((f) => [...f].map((v) => PAL[v]))
    assert.equal(gif.frames.length, 3)
    gif.frames.forEach((fr, k) => assert.deepEqual(fr.rgb, want[k], `frame ${k}`))
    assert.deepEqual(gif.frames.map((f) => f.delay), [25, 50, 275])
    assert.ok(gif.frames.every((f) => f.disposal === 1))
  })

  test('sends only the box that changed, the unchanged pixels in it transparent', () => {
    assert.deepEqual(gif.frames[0].box, [0, 0, W, H])
    assert.equal(gif.frames[0].transparent, -1)
    // pixels 8, 9 and 16 changed: x 1…2, y 1…2
    assert.deepEqual(gif.frames[1].box, [1, 1, 2, 2])
    assert.equal(gif.frames[1].transparent, 4)
    // pixels 0 and 34: the whole picture
    assert.deepEqual(gif.frames[2].box, [0, 0, W, H])
  })

  test('grows its codes to 12 bits and clears a full table, in sub-blocks of 255 bytes at most', () => {
    let seed = 7
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const pal = Array.from({ length: 256 }, (_, i) => [i, 255 - i, (i * 37) % 256])
    const big = Uint8Array.from({ length: 64 * 160 }, () => Math.floor(rnd() * 256))
    const next = Uint8Array.from(big, (v, i) => (i % 97 === 0 ? 255 - v : v))
    const out = decodeGif(encodeGif({ width: 64, height: 160, palette: pal, frames: [{ indices: big, delay: 10 }, { indices: next, delay: 10 }] }))
    assert.equal(out.stats.maxSize, 12)
    assert.ok(out.stats.clears > 2, `${out.stats.clears} clears`)
    assert.ok(out.stats.blocks > 40)
    // 256 colors leave no index free: no transparency, the changed box sent whole
    assert.ok(out.frames.every((f) => f.transparent === -1))
    assert.deepEqual(out.frames[0].rgb, [...big].map((v) => pal[v]))
    assert.deepEqual(out.frames[1].rgb, [...next].map((v) => pal[v]))
  })

  test('packs a picture of one color into a handful of bytes and still decodes it', () => {
    const flat = new Uint8Array(200 * 100).fill(1)
    const bytes = encodeGif({ width: 200, height: 100, palette: [[9, 9, 9], [200, 100, 50]], frames: [{ indices: flat, delay: 25 }] })
    assert.ok(bytes.length < 400, `${bytes.length} bytes`)
    const out = decodeGif(bytes)
    assert.ok(out.frames[0].rgb.every((c) => c[0] === 200 && c[1] === 100 && c[2] === 50))
    assert.equal(out.depth, 2)
  })

  test('streams frames one at a time, a too long hold carried by a frame of its own', () => {
    const enc = gifEncoder(2, 2, [[0, 0, 0], [255, 255, 255]])
    const a = Uint8Array.of(0, 1, 1, 0)
    enc.add(a, 60000)
    enc.add(a, 10000)
    enc.add(Uint8Array.of(1, 1, 1, 0), 30)
    const out = decodeGif(enc.end())
    assert.deepEqual(out.frames.map((f) => f.delay), [60000, 10000, 30])
    assert.deepEqual(out.frames[1].box, [0, 0, 1, 1])
    assert.deepEqual(out.frames[2].rgb.map((c) => c[0]), [255, 255, 255, 0])
  })

  test('encodes LZW a decoder reads back, from one pixel up', () => {
    for (const data of [[0], [1, 1, 1, 1, 1, 1, 1], [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3], Array.from({ length: 5000 }, (_, i) => (i * i) % 4)]) {
      const stats = { clears: 0, maxSize: 0 }
      assert.deepEqual(lzwDecode(lzwEncode(Uint8Array.from(data), 2), 2, stats), data)
    }
  })
})

// ---------------------------------------------------------------- WebM

describe('the video\'s duration', () => {
  // EBML as MediaRecorder writes it: a header, a Segment of unknown size, its Info (TimecodeScale only), a Cluster
  const el = (id, body) => [...id, 0x80 | body.length, ...body]
  const UNKNOWN = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
  const INFO = [0x15, 0x49, 0xa9, 0x66]
  const SCALE = el([0x2a, 0xd7, 0xb1], [0x0f, 0x42, 0x40])
  const HEAD = el([0x1a, 0x45, 0xdf, 0xa3], el([0x42, 0x82], [...'webm'].map((c) => c.charCodeAt(0))))
  const CLUSTER = [0x1f, 0x43, 0xb6, 0x75, ...UNKNOWN, 0xe7, 0x81, 0x00, 0xa3, 0x84, 1, 2, 3, 4]
  const file = (...segment) => Uint8Array.from([...HEAD, 0x18, 0x53, 0x80, 0x67, ...UNKNOWN, ...segment])

  test('writes a Duration into the Info a recording left without one', () => {
    const before = file(...el(INFO, SCALE), ...CLUSTER)
    const after = webmDuration(before, 26500)
    const at = HEAD.length + 12
    assert.equal(after.length, before.length + 7 + 11)
    assert.deepEqual([...after.subarray(at, at + 4)], INFO)
    // the size, on 8 bytes: the old children and the 11 bytes of Duration
    assert.deepEqual([...after.subarray(at + 4, at + 12)], [0x01, 0, 0, 0, 0, 0, 0, SCALE.length + 11])
    assert.deepEqual([...after.subarray(at + 12, at + 12 + SCALE.length)], SCALE)
    const dur = at + 12 + SCALE.length
    assert.deepEqual([...after.subarray(dur, dur + 3)], [0x44, 0x89, 0x88])
    assert.equal(new DataView(after.buffer).getFloat64(dur + 3), 26500)
    assert.deepEqual([...after.subarray(dur + 11)], CLUSTER)
  })

  test('writes over a Duration already there, and leaves alone what it does not follow', () => {
    const had = file(...el(INFO, [...SCALE, ...el([0x44, 0x89], [0, 0, 0, 0, 0, 0, 0, 0])]), ...CLUSTER)
    const after = webmDuration(had, 43250)
    assert.equal(after.length, had.length)
    assert.equal(new DataView(after.buffer).getFloat64(HEAD.length + 12 + 5 + SCALE.length + 3), 43250)
    assert.equal(had[HEAD.length + 12 + 5 + SCALE.length + 3], 0, 'the bytes it was given stay as they were')
    // a SeekHead first (its offsets would move), no Info before the first Cluster, a cut stream, not WebM at all
    const seek = file(...el([0x11, 0x4d, 0x9b, 0x74], [0xec, 0x80]), ...el(INFO, SCALE), ...CLUSTER)
    const cut = file(...el(INFO, SCALE)).subarray(0, HEAD.length + 14)
    for (const bytes of [seek, file(...CLUSTER, ...el(INFO, SCALE)), cut, Uint8Array.of(0, 1, 2), new Uint8Array(0)]) {
      assert.equal(webmDuration(bytes, 1000), bytes)
    }
  })
})
