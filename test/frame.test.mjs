// The frame: The Office on a screen of its own (lib/frame-page.mjs, lib/dashboard.mjs `frame`, scripts/dashboard.mjs
// --frame). Every server here stays on this computer (`lan: false`, `--local`): a screen on the network is played by
// the Host a request names.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { fitScreen, frameOptions, renderDashboard, startDashboard } from '../plugin/lib/dashboard.mjs'
import { FRAME_BUILD, FRAME_VIEWS, framePage } from '../plugin/lib/frame-page.mjs'
import { qrMatrix, qrTerminal } from '../plugin/lib/qr.mjs'
import { dashboardArgs, frameAddresses, frameAnswer, frameDir, frameFile, frameReadyFile, frameWords, readFrameLink } from '../plugin/scripts/dashboard.mjs'
import { frameState, frameText, renderFrameCard, wrap } from '../plugin/lib/svg-frame.mjs'
import { renderMenu } from '../plugin/lib/svg-menu.mjs'
import { SAMPLE, clone, monthFacts } from './helpers/facts.mjs'
import { permits } from './helpers/permits.mjs'

const TOKEN = 'frameframeframeframeframeframe01'
const drawing = (view = 'live') => ({ svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>${view}</text></svg>`, text: `${view} text`, label: 'This week', status: 'Office empty', generatedAt: '2026-11-10T00:00:00Z' })
/** A request to this computer's server under the name a screen on the network would call it by. */
function named(app, host, route, { method = 'GET', origin } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: app.port, method, path: route, headers: { Host: host, ...(origin ? { Origin: origin } : {}) } }, (res) => {
      let body = ''
      res.setEncoding('utf8').on('data', (chunk) => { body += chunk }).on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', reject).end()
  })
}

test("the frame's page is the drawing alone, with nothing fetched from elsewhere and a script an old browser runs", () => {
  const html = framePage({ nonce: 'n0nce', view: 'week', rotate: 5 })
  assert.doesNotMatch(html, /<(?:script|link|img)\b[^>]*(?:src|href)=/, 'no outside asset')
  // the only keys are the tabs' (the one on screen lit) and Full screen: nothing that changes anything
  assert.deepEqual([...html.matchAll(/<button type="button" data-view="(\w+)" aria-pressed="(\w+)">/g)].map((m) => [m[1], m[2]]),
    [['live', 'false'], ['today', 'false'], ['week', 'true'], ['month', 'false'], ['work', 'false']])
  assert.equal((html.match(/<button/g) ?? []).length, 6)
  assert.match(html, /<button type="button" id="full" aria-label="Full screen" hidden>/)
  assert.match(html, /<nav id="bar" aria-label="Views">.*What they did.*<\/nav>\n<p id="note"/s, 'the bar, then the note that sits over it')
  assert.doesNotMatch(html, /Stop server|shutdown|preferences/)
  assert.match(html, /apple-mobile-web-app-capable/, 'Add to Home Screen opens it without the browser\'s bars')
  const script = /<script nonce="n0nce">([\s\S]*)<\/script>/.exec(html)[1]
  assert.doesNotThrow(() => new vm.Script(script))
  assert.doesNotMatch(script, /\?\.|\?\?|=>|\bconst\b|\blet\b|\basync\b|`/, 'no syntax newer than a picture frame\'s browser')
  assert.match(script, /var view="week"/)
  assert.match(FRAME_BUILD, /^[a-z0-9]{4,8}$/)
  assert.ok(script.includes(`BUILD="${FRAME_BUILD}"`), 'the page knows which page it is')
  assert.match(script, /renew\(response\.headers\.get\('X-Office-Page'\)\)/, 'and asks every answer which one the server serves')
  assert.match(script, /rotate=5\b/)
  assert.match(script, /smooth=false\b/)
  // the waiting rooms come with the page, so a tab picked shows its own at once however busy the server is
  const roomy = /<script nonce="x">([\s\S]*)<\/script>/.exec(framePage({ nonce: 'x', loaders: { week: '<svg id="w"></svg>', month: '<svg id="m"></svg>' } }))[1]
  assert.ok(roomy.includes('LOADERS={"week":"\\u003csvg id=\\"w\\">\\u003c/svg>","month":"\\u003csvg id=\\"m\\">\\u003c/svg>"}'), 'as text a page cannot be broken out of')
  assert.match(script, /LOADERS=\{\}/)
  // a tab picked that is not kept: its name, then the pane's waiting room in place of the drawing until its own comes
  // (a screen held upright takes the room drawn narrow for it, which stands bigger across it)
  assert.match(script, /function loader\(\)\{\s*var kind=view==='today'\|\|view==='month'\?view:'week',room=\(window\.innerHeight>window\.innerWidth&&LOADERS\[kind\+'-tall'\]\)\|\|LOADERS\[kind\];\s*if\(room\)\{stage\.innerHTML=room;place\(\)\}/)
  assert.match(script, /loadTimer=setTimeout\(function\(\)\{if\(key\(\)===k&&shown!==k\)loader\(\)\},250\)/)
  assert.match(/<script nonce="x">([\s\S]*)<\/script>/.exec(framePage({ nonce: 'x', smooth: true }))[1], /smooth=true\b/)
  assert.deepEqual(FRAME_VIEWS, ['live', 'today', 'week', 'month', 'work'], 'every tab but the replay')
})

test("the page lays a drawing of the screen's shape edge to edge, and stands any other whole in its middle", () => {
  const script = /<script nonce="x">([\s\S]*)<\/script>/.exec(framePage({ nonce: 'x' }))[1]
  const source = `${/function ratio\(\)\{[^\n]*\}/.exec(script)[0]}\n${/function place\(\)\{[\s\S]*?\n\}/.exec(script)[0]}`
  // the page's own place(), run on a screen `wide` x `high` CSS px at 2x that shows a drawing `w` x `h` art pixels
  const placed = ([wide, high], [w, h]) => {
    const svg = { viewBox: { baseVal: { width: w, height: h } }, style: {}, attrs: {}, setAttribute(name, value) { this.attrs[name] = value } }
    vm.runInNewContext(`${source}\nplace()`, { window: { innerWidth: wide, innerHeight: high, devicePixelRatio: 2 }, stage: { querySelector: () => svg }, Math })
    return { ...svg.style, fit: svg.attrs.preserveAspectRatio }
  }
  // an iPad held upright, 1640x2360 of its own pixels, and the drawing the server fits it: 448 art pixels across hold
  // 644.7 rows, so 644 are drawn. Two thirds of an art pixel would show as a line of the page over the sky: laid edge
  // to edge instead
  assert.deepEqual(placed([820, 1180], [448, 644]), { width: '820px', height: '1180px', left: '0px', top: '0px', fit: 'none' })
  assert.deepEqual(placed([1180, 820], [786, 546]), { width: '1180px', height: '820px', left: '0px', top: '0px', fit: 'none' })
  assert.deepEqual(placed([744, 1133], [304, 462]), { width: '744px', height: '1133px', left: '0px', top: '0px', fit: 'none' }, 'nearly an art pixel left over')
  // a waiting room, and a building too high for the screen at every width: whole, in the middle, in their own shape
  const room = placed([820, 1180], [260, 96])
  assert.equal(room.fit, 'xMidYMin meet')
  assert.equal(room.width, '820px')
  assert.ok(Math.abs(parseFloat(room.height) - (96 * 820) / 260) < 0.01 && room.left === '0px' && Math.abs(parseFloat(room.top) - (1180 - (96 * 820) / 260) / 2) < 1, JSON.stringify(room))
  const strip = placed([1200, 240], [1200, 520])
  assert.equal(strip.fit, 'xMidYMin meet')
  assert.ok(strip.height === '240px' && strip.top === '0px' && Math.abs(parseFloat(strip.width) - (1200 * 240) / 520) < 0.01 && Math.abs(parseFloat(strip.left) - (1200 - (1200 * 240) / 520) / 2) < 1, JSON.stringify(strip))
})

test('a frame names a tab and how often it turns, and nothing else', () => {
  const read = (query) => frameOptions(new URLSearchParams(query))
  assert.deepEqual(read(`token=${TOKEN}`), { view: 'live', rotate: 0, smooth: false })
  assert.deepEqual(read(`token=${TOKEN}&view=month&rotate=15&smooth=1`), { view: 'month', rotate: 15, smooth: true })
  for (const query of ['view=timelapse', 'view=all', 'rotate=-1', 'rotate=1.5', 'rotate=1000', 'rotate=05', 'view=week&view=month', 'back=1', 'width=900', 'smooth=yes', 'smooth=1&smooth=0']) assert.throws(() => read(query), query)
})

test("a frame's link opens the frame's page and the drawings of now, from this computer and by its network names; nothing else", async (t) => {
  const seen = []
  const app = await startDashboard({ renderer: async (selection) => { seen.push(selection);return drawing(selection.view) }, frame: { token: TOKEN, lan: false }, watcher: null })
  t.after(() => app.close())
  assert.equal(app.framePath, `/frame?token=${TOKEN}`)
  const own = new URL(app.url)
  const owner = own.searchParams.get('token')
  const local = (route, init) => fetch(new URL(route, own.origin), init)
  // from this computer
  const page = await local(app.framePath)
  assert.equal(page.status, 200)
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/)
  assert.equal(page.headers.get('cache-control'), 'no-store')
  const html = await page.text()
  assert.match(html, /id="stage"/)
  for (const room of ['LOADERS={"week":"\\u003csvg ', '","today":"\\u003csvg ', '","month":"\\u003csvg ']) assert.ok(html.includes(room), `the waiting rooms, in the page: ${room}`)
  // and each again drawn narrow, for a screen held upright: the same room, bigger across such a screen
  const rooms = JSON.parse(/LOADERS=(\{.*?\});\n/.exec(html)[1])
  assert.deepEqual(Object.keys(rooms), ['week', 'week-tall', 'today', 'today-tall', 'month', 'month-tall'])
  const across = (svg) => Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)[1])
  for (const kind of ['week', 'today', 'month']) assert.ok(across(rooms[`${kind}-tall`]) <= 0.6 * across(rooms[kind]) && rooms[`${kind}-tall`].includes(`data-loading="${kind}"`), kind)
  const shot = await local(`/snapshot?token=${TOKEN}&view=week&screen=2360x1640`)
  assert.equal(shot.status, 200)
  assert.deepEqual(seen.at(-1), { view: 'week', range: 'week', back: 0, screen: '2360x1640' })
  assert.equal(shot.headers.get('x-office-page'), FRAME_BUILD, 'a frame left open learns when the page changed')
  assert.deepEqual(Object.keys(await shot.json()).sort(), ['generatedAt', 'label', 'revision', 'status', 'svg', 'text'])
  assert.equal((await local(`/waiting?token=${TOKEN}`)).status, 200)
  // by the names a screen on the network calls it: an address, a Bonjour name
  for (const host of [`192.168.1.20:${app.port}`, `10.0.0.7:${app.port}`, `studio-mac.local:${app.port}`, `Studio-Mac.local:${app.port}`]) {
    assert.equal((await named(app, host, app.framePath)).status, 200, host)
    assert.equal((await named(app, host, `/snapshot?token=${TOKEN}&screen=1920x1080`)).status, 200, host)
    assert.equal((await named(app, host, `/frame?token=${owner}`)).status, 403, 'our own link stays on this computer')
    assert.equal((await named(app, host, `/?token=${owner}`)).status, 403)
    assert.equal((await named(app, host, '/lib/svg-menu.mjs')).status, 403)
    assert.equal((await named(app, host, app.framePath, { origin: 'http://evil.example' })).status, 403, 'a foreign page')
    assert.equal((await named(app, host, `/snapshot?token=${TOKEN}`, { origin: `http://${host.toLowerCase()}` })).status, 200, 'its own page')
  }
  // never by a domain (a foreign name pointed at this computer), another port, or no port
  for (const host of [`evil.example:${app.port}`, `192.168.1.20.evil.example:${app.port}`, `local:${app.port}`, `evil.local.example:${app.port}`, '192.168.1.20:1', '192.168.1.20', `[::1]:${app.port}`]) {
    assert.equal((await named(app, host, app.framePath)).status, 403, host)
  }
  // the link only looks
  for (const route of ['/', '/preferences', '/player?revision=aaaaaaaaaaaaaaaa', '/export?revision=aaaaaaaaaaaaaaaa']) assert.equal((await local(`${route}${route.includes('?') ? '&' : '?'}token=${TOKEN}`)).status, 403, route)
  assert.equal((await local(`/shutdown?token=${TOKEN}`, { method: 'POST', headers: { Origin: own.origin } })).status, 403)
  assert.equal((await local(`/preferences?token=${TOKEN}`, { method: 'POST', headers: { Origin: own.origin, 'Content-Type': 'application/json' }, body: '{}' })).status, 403)
  assert.equal(app.isClosed, false)
  // and only at now: no page of the calendar, no replay
  for (const query of ['view=week&back=3', 'view=today&back=1', 'view=timelapse', 'view=timelapse&range=month']) assert.equal((await local(`/snapshot?token=${TOKEN}&${query}`)).status, 403, query)
  for (const query of ['view=week&rotate=abc', 'view=timelapse', 'zoom=1']) assert.equal((await local(`${app.framePath}&${query}`)).status, 400, query)
  for (const query of ['screen=100x100', 'screen=2360', 'screen=99999x1000', 'screen=2360x1640x2', 'screen=0800x0600']) assert.equal((await local(`/snapshot?token=${TOKEN}&${query}`)).status, 400, query)
  assert.equal((await local(`/frame?token=${'x'.repeat(32)}`)).status, 403)
  assert.equal((await local(`/?token=${owner}`)).status, 200, 'our own page is as it was')
  assert.equal((await local(`/frame?token=${owner}`)).status, 200, 'and may look at the frame too')
})

test('a server with no frame answers no network name and has no frame page', async (t) => {
  const app = await startDashboard({ renderer: async () => drawing(), watcher: null })
  t.after(() => app.close())
  assert.equal(app.framePath, null)
  assert.equal((await named(app, `192.168.1.20:${app.port}`, `/?token=${new URL(app.url).searchParams.get('token')}`)).status, 403)
  assert.equal((await fetch(new URL(`/frame?token=${new URL(app.url).searchParams.get('token')}`, app.url))).status, 404)
  await assert.rejects(startDashboard({ renderer: async () => drawing(), frame: { token: 'short' } }), /32/)
})

test("the fit draws a screen's own shape, the building as big as it stands whole: pixel for pixel when that costs it little, and never blown up", () => {
  // a building 900 art pixels high in less than 700 across, 520 from there on (a floor fewer); `draws` counts the drawings
  let draws = 0
  const building = (low) => ({ width, minHeight = 0 }) => {
    draws++
    const high = Math.max(minHeight / 2, low(width / 2))
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${high * 2}" viewBox="0 0 ${width / 2} ${high}"></svg>`
  }
  const drawAt = building((across) => (across < 700 ? 900 : 520))
  const boxOf = (svg) => /viewBox="0 0 (\d+) (\d+)"/.exec(svg).slice(1).map(Number)

  // an iPad held wide, 2360x1640 of its own pixels: the building fits from 752 art pixels across (522 rows); three of
  // the screen's pixels to an art pixel is 786 across, where it still fills 95% of the 546 rows: drawn so, pixel for pixel
  const tablet = fitScreen('2360x1640', drawAt)
  assert.deepEqual(tablet.size, { width: 786 * 2, minHeight: 546 * 2 })
  assert.equal(tablet.narrowest, 752)
  assert.deepEqual(boxOf(tablet.svg), [786, 546], 'the screen\'s shape: bedrock grows under what the building leaves')
  assert.ok(draws <= 12, `found by halving, not by drawing every width (${draws} drawings)`)
  // the same screen again, told where it fitted: a few drawings, the same answer
  draws = 0
  assert.deepEqual(fitScreen('2360x1640', drawAt, { hint: tablet.narrowest }).size, tablet.size)
  assert.ok(draws <= 4, `${draws} drawings with a hint`)
  assert.deepEqual(fitScreen('2360x1640', drawAt, { hint: 1100 }).size, tablet.size, 'a hint that is no longer the narrowest is only a hint')

  // the same iPad with Safari's bars, 2360x1480: the building fits from 832 across; two pixels to one (1180 across)
  // would leave it 70% of the height, so it is drawn 832 across, 2.8 of the screen's pixels to an art pixel, and fills it
  const barred = fitScreen('2360x1480', drawAt)
  assert.deepEqual(barred.size, { width: 832 * 2, minHeight: 521 * 2 })
  assert.deepEqual(boxOf(barred.svg), [832, 521])
  assert.ok(520 / 521 > 0.99, 'the building fills the height')
  // held tall, 1640x2360: the 900-high building fits from 628 across... and 2 pixels to one (820 across) holds the lower one
  const tall = fitScreen('1640x2360', drawAt)
  assert.deepEqual(tall.size, { width: 628 * 2, minHeight: 903 * 2 })

  // a screen the building is too high for at every width: the widest drawing, for the page to scale down
  const strip = fitScreen('2400x480', drawAt)
  assert.deepEqual(strip.size, { width: 2400, minHeight: 480 })
  assert.deepEqual(boxOf(strip.svg), [1200, 520], 'higher than the screen holds: the page stands it in the middle')
  // a small office is not blown up to fill a wall: an art pixel is 8 of the screen's at most
  const small = fitScreen('2360x1640', building(() => 100))
  assert.deepEqual(small.size, { width: 296 * 2, minHeight: 205 * 2 })
  assert.ok(2360 / 296 <= 8)
  assert.deepEqual(fitScreen('240x8192', building(() => 100)).size.width, 320, 'nor drawn narrower than the narrowest drawing')
  assert.ok(fitScreen('7680x4320', drawAt).size.width <= 2400, 'nor wider than the widest')
  for (const screen of ['', '2360', '100x100', '9000x1000', 'axb']) assert.throws(() => fitScreen(screen, drawAt), /screen/i)
})

test('a screen held upright gets the upright plan of a view that has one, where the wide plan would leave it to the sky', () => {
  // a Month: its two rooms side by side from 452 art pixels across, 420 high; one over the other under that, 671 high,
  // and at any width when it is asked to stand (`tall`)
  const month = (stood = 671) => ({ width, minHeight = 0, tall = false }) => {
    const across = width / 2
    const high = Math.max(minHeight / 2, tall ? stood : across < 452 ? 671 : 420)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${high * 2}" viewBox="0 0 ${across} ${high}" data-plan="${tall ? 'tall' : 'wide'}"></svg>`
  }
  // an iPad held upright, 1640x2360: one over the other is too high until 452 across, where side by side fills 65% of
  // the 650 rows. Stood, it fits from 468 across and fills the 673 rows
  const wide = fitScreen('1640x2360', month())
  assert.deepEqual(wide.size, { width: 452 * 2, minHeight: 650 * 2 }, 'a view with no upright plan is fitted as it was')
  const air = fitScreen('1640x2360', month(), { upright: true })
  assert.deepEqual(air.size, { width: 468 * 2, minHeight: 673 * 2, tall: true })
  assert.match(air.svg, /viewBox="0 0 468 673" data-plan="tall"/)
  assert.equal(air.narrowest, 468)
  assert.deepEqual(fitScreen('1640x2360', month(), { upright: true, hint: air.narrowest }).size, air.size, 'the same with its hint')
  // the 10.2 inch one, 1620x2160: stood it fits from 504 across; three of the screen's pixels to an art pixel, 540
  // across, still fill 93% of the 720 rows: pixel for pixel
  assert.deepEqual(fitScreen('1620x2160', month(), { upright: true }).size, { width: 540 * 2, minHeight: 720 * 2, tall: true })
  // a narrower screen, where one over the other already fits under 452 across (an iPad mini): the plan it had
  assert.deepEqual(fitScreen('1488x2266', month(), { upright: true }).size, { width: 444 * 2, minHeight: 676 * 2 })
  // held wide, the wide plan, whatever it fills
  assert.equal(fitScreen('2360x1640', month(), { upright: true }).size.tall, undefined)
  assert.equal(fitScreen('2000x2000', month(), { upright: true }).size.tall, undefined, 'a square is not upright')
  // an upright plan too high for the screen at every width is not stood: the wide plan, whole
  assert.deepEqual(fitScreen('1640x2360', month(5000), { upright: true }).size, wide.size)
})

test('a screen gets the whole picture drawn to its shape, and the same office is the same drawing', async () => {
  const collectFacts = async () => clone(SAMPLE)
  const selection = { view: 'live', range: 'week', back: 0, screen: '2360x1640' }
  const first = await renderDashboard(selection, { collectFacts, now: Date.parse(SAMPLE.now.iso) })
  const [, wide, high] = /viewBox="0 0 (\d+) (\d+)"/.exec(first.svg).map(Number)
  assert.ok(wide >= 296 && wide <= 1200, `${wide} art pixels across`)
  assert.ok(Math.abs(high / wide - 1640 / 2360) < 0.01, `the screen's shape (${wide}x${high})`)
  assert.match(first.svg, /<svg[^>]*style="background:/, 'the picture with its sky and ground, not the pane\'s card')
  assert.deepEqual(first.fit, { width: wide * 2, minHeight: high * 2 })
  assert.ok(Number.isInteger(first.fitAt) && first.fitAt <= wide, 'where it fitted, for the next drawing')
  // the building itself stands whole in it, and takes most of its height
  const own = /viewBox="0 0 \d+ (\d+)"/.exec((await import('../plugin/lib/svg.mjs')).renderSvg(clone(SAMPLE), { view: 'all', width: wide * 2, liveClock: true, clockAt: Date.parse(SAMPLE.now.iso) }))
  assert.ok(Number(own[1]) <= high && Number(own[1]) >= 0.85 * high, `the building is ${own[1]} of ${high} rows`)
  const card = await renderDashboard({ view: 'live', range: 'week', back: 0 }, { collectFacts, now: Date.parse(SAMPLE.now.iso) })
  assert.doesNotMatch(card.svg, /<svg[^>]*style="background:/, 'the pane\'s drawing is the card it was')
  assert.equal(card.fit, undefined)
  const again = await renderDashboard(selection, { collectFacts, previous: first, now: Date.parse(SAMPLE.now.iso) + 20_000 })
  assert.equal(again, first, 'nothing moved: the frame keeps its drawing')
  for (const view of ['today', 'week', 'month', 'work']) {
    for (const screen of ['2360x1640', '1640x2360', '1920x1080']) {
      const other = await renderDashboard({ ...selection, view, screen }, { collectFacts })
      const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(other.svg).map(Number)
      const [sw, sh] = screen.split('x').map(Number)
      assert.ok(w <= 1200 && h >= Math.floor((w * sh) / sw), `${view} on ${screen}: no narrower than the screen's shape (${w}x${h})`)
    }
  }
})

test('every tab fills an iPad held upright: the building takes most of the height, the Month one room over the other', async () => {
  const { renderSvg } = await import('../plugin/lib/svg.mjs')
  // the common iPads, upright, in their own pixels: mini 8.3, 10.2, Air 10.9, Pro 11, Pro 12.9, the classic 9.7, and
  // the Air with Safari's bars over the page
  const screens = ['1488x2266', '1620x2160', '1640x2360', '1668x2388', '2048x2732', '1536x2048', '1640x2212']
  // a month as the collector reports one: 40 tenants on the directory, so its two rooms side by side are low and wide
  const busy = monthFacts()
  busy.projects = Array.from({ length: 40 }, (_, i) => ({ ...clone(SAMPLE.projects[i % SAMPLE.projects.length]), name: `tenant-${i}` }))
  const now = Date.parse(SAMPLE.now.iso)
  const stood = []
  for (const [view, facts, least] of [['live', SAMPLE, 0.85], ['today', SAMPLE, 0.85], ['week', SAMPLE, 0.85], ['work', SAMPLE, 0.8], ['month', SAMPLE, 0.9], ['month', busy, 0.9]]) {
    for (const screen of screens) {
      const shot = await renderDashboard({ view, range: 'week', back: 0, screen }, { collectFacts: async () => clone(facts), now })
      const [, wide, high] = /viewBox="0 0 (\d+) (\d+)"/.exec(shot.plain).map(Number)
      const [sw, sh] = screen.split('x').map(Number)
      assert.ok(Math.floor((wide * sh) / sw) === high || Math.floor(sh / Math.floor(sw / wide)) === high, `${view} on ${screen}: the screen's shape to the art pixel (${wide}x${high})`)
      const own = Number(/viewBox="0 0 \d+ (\d+)"/.exec(renderSvg(clone(facts), { view: view === 'live' ? 'all' : view, width: wide * 2, liveClock: true, clockAt: now, tall: shot.fit.tall === true }))[1])
      assert.ok(own <= high && own >= least * high, `${view} on ${screen}: the building is ${own} of ${high} rows`)
      assert.ok(sw / wide >= 2.5, `${view} on ${screen}: ${(sw / wide).toFixed(2)} of the screen's pixels to an art pixel`)
      if (facts === busy && shot.fit.tall) stood.push(screen)
      // nothing moved: the frame keeps its drawing, whichever plan it stands in
      if (view === 'month') assert.equal(await renderDashboard({ view, range: 'week', back: 0, screen }, { collectFacts: async () => clone(facts), previous: shot, now: now + 20_000 }), shot)
    }
  }
  assert.ok(stood.length >= 4, `the busy month stands one room over the other on most of them (${stood.join(' ')})`)
  // held wide, the same month is its two rooms side by side
  const wide = await renderDashboard({ view: 'month', range: 'week', back: 0, screen: '2360x1640' }, { collectFacts: async () => clone(busy), now })
  assert.equal(wide.fit.tall, undefined)
})

test('the launcher reads --frame and its own flags, and nothing of them without it', () => {
  const none = { stop: false, newLink: false, local: false, status: false, json: false }
  assert.deepEqual(dashboardArgs(['--frame']).frame, { view: 'live', rotate: 0, ...none })
  assert.deepEqual(dashboardArgs(['--frame', '--view', 'week', '--rotate', '5', '--local', '--detach', '--open']), { port: 0, open: true, detach: true, child: false, reuse: false, idleMs: 0, frame: { view: 'week', rotate: 5, ...none, local: true } })
  assert.deepEqual(dashboardArgs(['--frame', '--status', '--json']).frame, { view: 'live', rotate: 0, ...none, status: true, json: true })
  assert.equal(dashboardArgs(['--frame', '--detach', '--new-link', '--json']).frame.json, true)
  assert.equal(dashboardArgs(['--frame', '--stop']).frame.stop, true)
  assert.equal(dashboardArgs(['--frame', '--new-link', '--port', '4000']).frame.newLink, true)
  for (const args of [['--stop'], ['--new-link'], ['--local'], ['--status'], ['--json'], ['--frame', '--status', '--stop'], ['--frame', '--status', '--detach'], ['--frame', '--status', '--new-link'], ['--rotate', '5'], ['--frame', '--rotate'], ['--frame', '--rotate', '0'], ['--frame', '--rotate', '1000'], ['--frame', '--view', 'timelapse'], ['--frame', '--back', '2'], ['--frame', '--reuse'], ['--frame', '--idle', '5'], ['--frame', '--zoom'], ['--frame', '--quiet']]) assert.throws(() => dashboardArgs(args), args.join(' '))
})

test('the addresses a screen is given: the home network first, the Bonjour name last, the first one in the code', () => {
  const interfaces = {
    lo0: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    utun4: [{ family: 'IPv4', internal: false, address: '100.101.4.7' }],
    en5: [{ family: 'IPv4', internal: false, address: '169.254.10.2' }],
    en0: [{ family: 'IPv6', internal: false, address: 'fe80::1' }, { family: 'IPv4', internal: false, address: '192.168.1.20' }],
  }
  const urls = frameAddresses(3375, `/frame?token=${TOKEN}`, { interfaces, hostname: 'Studio-Mac.local' })
  assert.deepEqual(urls.map((url) => new URL(url).host), ['192.168.1.20:3375', '100.101.4.7:3375', '169.254.10.2:3375', 'studio-mac.local:3375'])
  assert.ok(urls.every((url) => url.endsWith(`/frame?token=${TOKEN}`)))
  assert.deepEqual(frameAddresses(3375, '/frame', { interfaces: { lo0: interfaces.lo0 }, hostname: 'box.fritz.box' }), [], 'no network, and no name that is not Bonjour\'s')
  const coded = []
  const words = frameWords(urls, { local: 'http://127.0.0.1:3375/frame', qr: (text) => { coded.push(text);return '[code]' } })
  assert.equal(words.split('\n')[0], urls[0], 'the first line is the address, as every launch prints its own')
  assert.deepEqual(coded, [urls[0]])
  for (const url of urls) assert.ok(words.includes(url))
  assert.match(words, /only looks/)
  assert.match(words, /Anyone on this network who has the link/)
  assert.match(words, /--frame --stop/)
  assert.match(frameWords([], { local: 'http://127.0.0.1:3375/frame' }), /^http:\/\/127\.0\.0\.1:3375\/frame\n\n.*no network/)
  assert.match(frameWords([], { local: 'http://127.0.0.1:3375/frame', onLan: false }), /^http:\/\/127\.0\.0\.1:3375\/frame\n\n.*this computer only/)
})

test('the code a tablet scans is a QR code of the address', () => {
  const url = `http://192.168.1.20:3375/frame?token=${TOKEN}`
  const modules = qrMatrix(url, { ecl: 'L' })
  assert.equal(modules.length, 33, 'version 4: 33 modules a side')
  assert.ok(modules.every((row) => row.length === 33))
  // the three finder patterns: a dark 7x7 ring around a dark 3x3 core
  for (const [x, y] of [[0, 0], [26, 0], [0, 26]]) {
    for (let i = 0; i < 7; i++) assert.ok(modules[y][x + i] && modules[y + 6][x + i] && modules[y + i][x] && modules[y + i][x + 6], `finder at ${x},${y}`)
    assert.ok(!modules[y + 1][x + 1] && modules[y + 3][x + 3])
  }
  const lines = qrTerminal(url).split('\n')
  assert.equal(lines.length, Math.ceil(37 / 2))
  assert.ok(lines.every((line) => line.length === 37 && /^[█▀▄ ]+$/.test(line)))
  assert.notDeepEqual(qrMatrix(`${url}x`, { ecl: 'L' }), modules)
  assert.throws(() => qrMatrix('x'.repeat(8000)), /too long/)
})

test("a frame's link is kept private, and only one that reads as a link is taken", { skip: process.platform === 'win32' && 'permissions' }, (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-frame-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  // one folder for the computer, whoever starts the frame: never the data folder an agent hands its own runs
  assert.equal(frameDir({ CLAUDE_PLUGIN_DATA: '/agent/data', HOME: os.homedir() }), path.join(os.homedir(), '.cache', 'theoffice'))
  assert.equal(frameDir({ THEOFFICE_CACHE_DIR: dir, CLAUDE_PLUGIN_DATA: '/agent/data' }), dir)
  assert.equal(readFrameLink(frameFile(dir)), null)
  fs.writeFileSync(frameFile(dir), JSON.stringify({ token: TOKEN, port: 3375 }))
  assert.deepEqual(readFrameLink(frameFile(dir)), { token: TOKEN, port: 3375 })
  for (const kept of [{ token: 'short', port: 3375 }, { token: TOKEN, port: 0 }, { token: TOKEN, port: 70000 }, { token: TOKEN }, [], 'x']) {
    fs.writeFileSync(frameFile(dir), JSON.stringify(kept))
    assert.equal(readFrameLink(frameFile(dir)), null, JSON.stringify(kept))
  }
})

test('--frame starts one server that stays, hands its address back, keeps its link across a restart, and stops when told', { skip: process.platform === 'win32' && 'permissions' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theoffice-frame-'))
  const script = fileURLToPath(new URL('../plugin/scripts/dashboard.mjs', import.meta.url))
  const env = { ...process.env, THEOFFICE_CACHE_DIR: dir, THEOFFICE_NO_OPEN: '1' }
  const launch = async (...args) => {
    const child = spawn(process.execPath, [script, '--frame', '--local', ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (chunk) => { out += chunk })
    await once(child, 'exit')
    return out
  }
  const pidOf = () => { try { return JSON.parse(fs.readFileSync(frameReadyFile(dir), 'utf8')).pid } catch { return 0 } }
  t.after(() => { const pid = pidOf();if (pid) try { process.kill(pid, 'SIGTERM') } catch {} fs.rmSync(dir, { recursive: true, force: true }) })
  // a port of this test's own: the person's own frame may be running on the usual one
  const port = await new Promise((resolve, reject) => {
    const probe = http.createServer().once('error', reject).listen(0, '127.0.0.1', () => { const free = probe.address().port;probe.close(() => resolve(free)) })
  })
  const first = (await launch('--detach', '--port', String(port), '--view', 'week', '--rotate', '5')).split('\n')[0]
  assert.equal(new URL(first).port, String(port))
  assert.match(first, /^http:\/\/127\.0\.0\.1:\d+\/frame\?token=[\w-]{32}&view=week&rotate=5$/)
  const link = readFrameLink(frameFile(dir))
  assert.equal(String(link.port), new URL(first).port)
  assert.equal(link.token, new URL(first).searchParams.get('token'))
  assert.equal(permits(frameFile(dir), 0o600), 0o600)
  assert.equal(permits(frameReadyFile(dir), 0o600), 0o600)
  assert.equal((await fetch(first)).status, 200)
  const pid = pidOf()
  // asked again: the same server, the same address
  const second = (await launch()).split('\n')[0]
  assert.equal(second, first.replace('&view=week&rotate=5', ''))
  assert.equal(pidOf(), pid)
  // stopped, then started again: another server, the address a screen was given still good
  assert.match(await launch('--stop'), /stopped/)
  await assert.rejects(fetch(first))
  assert.match(await launch('--stop'), /not running/)
  assert.deepEqual(readFrameLink(frameFile(dir)), link, 'the link outlives the server')
  assert.equal((await launch('--detach')).split('\n')[0], second)
  assert.notEqual(pidOf(), pid)
  assert.equal((await fetch(first)).status, 200)
  // asked where it stands, in one line a program reads: nothing started, the address as it is
  const standing = JSON.parse(await launch('--status', '--json'))
  assert.deepEqual(standing, { spec: 'theoffice-frame/1', running: true, lan: false, port: link.port, urls: [], local: second })
  assert.equal(pidOf() !== 0 && pidOf() !== pid, true)
  // a new link: the same port, another token, and the old one opens nothing
  const renewed = (await launch('--detach', '--new-link')).split('\n')[0]
  assert.equal(new URL(renewed).port, new URL(first).port)
  assert.notEqual(new URL(renewed).searchParams.get('token'), link.token)
  assert.equal((await fetch(renewed)).status, 200)
  assert.equal((await fetch(first)).status, 403)
  assert.deepEqual(JSON.parse(await launch('--stop', '--json')), { spec: 'theoffice-frame/1', running: false, lan: false, port: link.port, urls: [], local: '' })
  assert.deepEqual(JSON.parse(await launch('--status', '--json')), { spec: 'theoffice-frame/1', running: false, lan: false, port: link.port, urls: [], local: '' }, 'asking starts nothing')
  assert.equal(pidOf(), 0)
})

test('the one-line answer says where the frame stands and names no address of a frame that is off or off the network', () => {
  const urls = [`http://192.168.1.20:3375/frame?token=${TOKEN}`]
  const local = `http://127.0.0.1:3375/frame?token=${TOKEN}`
  assert.deepEqual(JSON.parse(frameAnswer({ running: true, lan: true, port: 3375, urls, local })), { spec: 'theoffice-frame/1', running: true, lan: true, port: 3375, urls, local })
  assert.deepEqual(JSON.parse(frameAnswer({ running: true, lan: false, port: 3375, urls, local })), { spec: 'theoffice-frame/1', running: true, lan: false, port: 3375, urls: [], local })
  assert.deepEqual(JSON.parse(frameAnswer({ running: false, lan: true, port: 3375, urls, local })), { spec: 'theoffice-frame/1', running: false, lan: false, port: 3375, urls: [], local: '' })
  assert.deepEqual(JSON.parse(frameAnswer()), { spec: 'theoffice-frame/1', running: false, lan: false, port: 0, urls: [], local: '' })
  assert.match(frameAnswer(), /\n$/)
  assert.equal(frameAnswer().split('\n').length, 2, 'one line')
})

test("the pane's Frame card: the code of the address and what the link lets a screen do while it is on, what turning it on does while it is off", () => {
  const urls = [`http://192.168.1.20:3375/frame?token=${TOKEN}`, `http://studio-mac.local:3375/frame?token=${TOKEN}`]
  const on = { running: true, lan: true, urls, local: `http://127.0.0.1:3375/frame?token=${TOKEN}` }
  const off = { running: false, lan: false, urls: [], local: '' }
  assert.deepEqual([frameState(null), frameState(off), frameState(on), frameState({ ...on, lan: false, urls: [] }), frameState({ ...on, urls: [] })],
    ['off', 'off', 'on your network', 'on this computer only', 'on, but this computer is on no network'])

  const card = renderFrameCard({ width: 900, link: on })
  assert.match(card.source, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="900" height="\d+" viewBox="0 0 450 \d+"/)
  assert.equal(card.px, 900)
  assert.equal(card.h, Number(/height="(\d+)"/.exec(card.source)[1]))
  assert.ok(card.h <= 4096 && card.source.length < 20_000, 'well inside what the pane draws')
  for (const url of urls) assert.ok(card.source.includes(url), 'each address in words')
  assert.match(card.alt, /^The Office on a screen of its own, on your network\. Scan the code/)
  // the code: every dark module of the address's QR code is under a dark rect of the card, on a slip of paper
  const modules = qrMatrix(urls[0], { ecl: 'L' })
  const dark = modules.flat().filter(Boolean).length
  const ink = /<path fill="#2a211b" d="([^"]+)"/.exec(card.source)[1]
  const area = [...ink.matchAll(/M[\d.]+ [\d.]+h([\d.]+)v([\d.]+)/g)].reduce((sum, m) => sum + Number(m[1]) * Number(m[2]), 0)
  assert.equal(area, dark * 9, 'three units a module, nothing else in that ink')
  // nothing the pane's scrub drops or that reaches out: no script, link, image or id, no colon-led attribute value
  assert.doesNotMatch(card.source, /<script|<a\b|<image|href=|\bid="|on\w+="/)
  for (const [, value] of card.source.matchAll(/\s[\w-]+="([^"]*)"/g)) assert.doesNotMatch(value, /^[a-z][\w+.-]*:(?!\/\/www\.w3\.org)/i, value)

  // off: no code, no address; on this computer only: its own address and no code
  const idle = renderFrameCard({ width: 900, link: off })
  assert.doesNotMatch(idle.source, /token=|192\.168/)
  assert.match(idle.alt, /^The Office on a screen of its own, off\. A tablet on a stand/)
  assert.equal(renderFrameCard({ width: 900 }).source, idle.source, 'not asked yet draws as off')
  const local = renderFrameCard({ width: 900, link: { ...on, lan: false, urls: [] } })
  assert.ok(local.source.includes('http://127.0.0.1:3375/frame?token='))
  assert.doesNotMatch(local.source, /192\.168/)

  // a narrow pane stacks the code over the words, which wrap; the address is cut after its port
  const narrow = renderFrameCard({ width: 360, link: on })
  assert.ok(narrow.h > card.h)
  assert.ok(narrow.source.includes('>http://192.168.1.20:3375<'), 'the host on a line of its own')
  for (const [, text] of narrow.source.matchAll(/<text[^>]*>([^<]*)<\/text>/g)) assert.ok(text.length <= 48, text)
  for (const width of [240, 320, 520, 700, 1116, 2400]) assert.doesNotThrow(() => renderFrameCard({ width, link: on }))
  assert.deepEqual(wrap('one two three', 7), ['one two', 'three'])
  assert.deepEqual(wrap(urls[0], 30), ['http://192.168.1.20:3375', '/frame?token=frameframeframefr', 'ameframeframe01'])

  // in a terminal: the same words, then the code in half blocks when the terminal is wide enough for it
  const lines = frameText({ link: on, columns: 80 })
  assert.equal(lines[0], 'The Office on a screen of its own: on your network.')
  assert.ok(lines.includes(urls[0]))
  assert.ok(lines.every((line) => line.length <= 80))
  assert.deepEqual(lines.slice(-qrTerminal(urls[0]).split('\n').length), qrTerminal(urls[0]).split('\n'))
  assert.ok(!frameText({ link: on, columns: 30 }).some((line) => /█{10}/.test(line)), 'no code where it would not fit')
  assert.ok(!frameText({ link: off }).some((line) => /█/.test(line)))
})

test("the menu's Frame key is its icon alone at every width, and its row a deck whose LED says whether the frame is on", () => {
  const tabs = [['all', 'Live', 'Live', 'live'], ['today', 'Today', 'Today', 'today'], ['week', 'Week', 'Week', 'week'], ['month', 'Month', 'Month', 'month'], ['work', 'What they did', 'Work', 'work'], ['timelapse', 'Timelapse', 'Lapse', 'timelapse']]
    .map(([id, label, short, icon]) => ({ id, label, short, icon, ...(id === 'all' ? { isOn: true } : {}) }))
  const switches = [{ id: 'quiet', label: 'Quiet', short: 'Quiet', icon: 'quiet', isSwitch: true }, { id: 'zoom', label: 'Zoom', short: 'Zoom', icon: 'zoom', isSwitch: true }]
  const frame = { id: 'frame', label: 'Frame', short: 'Frame', icon: 'frame', isSwitch: true, isIcon: true }
  for (const width of [340, 500, 700, 900, 1116]) {
    const row = renderMenu({ keys: [...tabs, ...switches, frame], width })
    const zone = row.zones.find((z) => z.id === 'frame')
    assert.ok(zone, `the Frame key goes somewhere at ${width}`)
    assert.ok(zone.w <= 20, `its icon alone at ${width}: ${zone.w} units`)
    assert.equal(zone.x + zone.w, row.W - 6, 'at the edge, the last of the keys apart')
    assert.doesNotMatch(row.source, />Frame</, 'no word on the key')
    assert.match(row.alt, /Frame off\.$/, 'its name is still said')
  }
  // it costs the tabs their full names over some fifty pixels of pane widths, no more
  const full = (keys) => { for (let width = 600; width <= 1200; width += 10) if (renderMenu({ keys, width }).tier === 'full') return width; return Infinity }
  assert.ok(full([...tabs, ...switches, frame]) - full([...tabs, ...switches]) <= 60)
  const deck = renderMenu({ keys: [{ id: 'stop', label: 'Turn off', short: 'Off', icon: 'power' }, { id: 'renew', label: 'New link', short: 'New', icon: 'renew' }, { id: 'back', label: 'Back', short: 'Back', icon: 'back' }], width: 900, under: true, prompt: 'Frame on' })
  assert.match(deck.source, />FRAME ON</)
  assert.deepEqual(deck.zones.map((z) => z.id), ['stop', 'renew', 'back'])
  assert.equal(deck.alt, 'Frame on: Turn off, New link, Back.')
})

test('what a screen leaves over the building is sky, the building standing on its foot; a frame that asks gets the drawing as it glides', async () => {
  const { renderSvg } = await import('../plugin/lib/svg.mjs')
  const facts = clone(SAMPLE)
  const own = renderSvg(facts, { view: 'all', width: 1600, liveClock: true })
  const high = Number(/viewBox="0 0 800 (\d+)"/.exec(own)[1])
  const rows = high + 60
  // as the pane has it: bedrock under the commits line
  const grown = renderSvg(facts, { view: 'all', width: 1600, minHeight: rows * 2, liveClock: true })
  assert.match(grown, new RegExp(`viewBox="0 0 800 ${rows}"`))
  assert.doesNotMatch(grown, /<g transform="translate\(0 60\)">/)
  // on a frame: 60 rows more of sky over the drawing, which stands 60 lower, whole: the light's own bands on toward the
  // zenith (three in 60 rows, dithered as the header's, the first past the top and both walls), with stars or clouds of their own
  const lifted = renderSvg(facts, { view: 'all', width: 1600, minHeight: rows * 2, skyFill: true, liveClock: true })
  assert.match(lifted, new RegExp(`viewBox="0 0 800 ${rows}"`))
  const over = /<g fill="currentColor" stroke="currentColor" stroke-width="2" stroke-dasharray="1">((?:<path color="#[0-9a-f]{6}" d="M-2 -?\d+h804v\d+H-2z"\/>)+)<\/g>(.*?)<g transform="translate\(0 60\)">/s.exec(lifted)
  assert.ok(over, 'the sky reaches 60 rows higher')
  const bands = [...over[1].matchAll(/color="(#[0-9a-f]{6})" d="M-2 (-?\d+)h804v(\d+)H-2z"/g)].map((m) => [m[1], Number(m[2]), Number(m[3])])
  assert.deepEqual(bands.map(([, y, h]) => [y, h]), [[-2, 22], [20, 20], [40, 20]])
  assert.equal(new Set(bands.map(([color]) => color)).size, 3, 'each band its own shade')
  assert.ok(over[2].length > 100, 'stars or clouds in it')
  assert.ok(lifted.length - own.length < 4000, 'for a few bands and what is in them')
  assert.equal(renderSvg(facts, { view: 'all', width: 1600, minHeight: high * 2, skyFill: true, liveClock: true }), renderSvg(facts, { view: 'all', width: 1600, minHeight: high * 2, liveClock: true }), 'nothing over: nothing added')
  // the band is the sky's own color at that hour: night and day differ
  const night = renderSvg({ ...facts, now: { ...facts.now, hour: 23, is_night: true } }, { view: 'all', width: 1600, minHeight: rows * 2, skyFill: true })
  const day = renderSvg({ ...facts, now: { ...facts.now, hour: 13, is_night: false } }, { view: 'all', width: 1600, minHeight: rows * 2, skyFill: true })
  const colorOf = (svg) => /<path color="(#[0-9a-f]{6})" d="M-2 -2h804v/.exec(svg)?.[1]
  assert.ok(colorOf(night) && colorOf(day) && colorOf(night) !== colorOf(day))
  const inSky = (svg) => /stroke-dasharray="1">.*?<\/g>(.*?)<g transform="translate\(0 60\)">/s.exec(svg)[1]
  assert.doesNotMatch(inSky(night), /<use /, 'stars at night, no clouds')
  assert.match(inSky(day), /<use /, 'clouds by day')
  // the Month stands on the Office's street front as the week's tower does, in the pane as on a frame: the same drawing
  const month = monthFacts()
  const pane = renderSvg(month, { view: 'month', width: 1600 })
  assert.equal(renderSvg(month, { view: 'month', width: 1600, skyFill: true }), pane)
  for (const sprite of ['fr-box', 'fr-hydrant', 'fr-bench', 'fr-tree']) assert.ok(pane.includes(`href="#to-${sprite}"`), `the street front's ${sprite}`)

  // the frame's drawing is drawn so, and comes on the pane's beat unless it asks to glide
  const collectFacts = async () => clone(SAMPLE)
  const selection = { view: 'live', range: 'week', back: 0, screen: '2360x1640' }
  const stepped = await renderDashboard(selection, { collectFacts })
  assert.notEqual(stepped.svg, stepped.plain)
  assert.doesNotMatch(stepped.svg, /<animate\b/, 'on the beat: no loop that needs a frame every 16 ms')
  const gliding = await renderDashboard({ ...selection, smooth: true }, { collectFacts })
  assert.equal(gliding.svg, gliding.plain)
  assert.match(gliding.svg, /<animate/)
})

test("a frame's tabs other than Live are handed out again for a while, whatever moved; Live and the pages keep their own rule", async (t) => {
  const drawn = []
  const app = await startDashboard({ renderer: async (selection) => { drawn.push(selection.view);return drawing(selection.view) }, frame: { token: TOKEN, lan: false }, watcher: null, cacheMs: 0 })
  t.after(() => app.close())
  const owner = new URL(app.url).searchParams.get('token')
  const ask = async (query, token = TOKEN) => (await fetch(new URL(`/snapshot?token=${token}&${query}`, app.url))).json()
  const count = (view) => drawn.filter((v) => v === view).length
  // the frame's Week: drawn once, the same drawing again; its Live: drawn each time it is asked
  const week = await ask('view=week&screen=2360x1640')
  assert.equal((await ask('view=week&screen=2360x1640')).revision, week.revision)
  assert.equal(count('week'), 1)
  await ask('view=live&screen=2360x1640')
  await ask('view=live&screen=2360x1640')
  assert.equal(count('live'), 2)
  // another screen is another drawing; a page (no screen) keeps the pages' rule
  await ask('view=week&screen=1640x2360')
  assert.equal(count('week'), 2)
  await ask('view=week', owner)
  await ask('view=week', owner)
  assert.equal(count('week'), 4)
  for (const view of ['today', 'month', 'work']) {
    await ask(`view=${view}&screen=2360x1640`)
    await ask(`view=${view}&screen=2360x1640`)
    assert.equal(count(view), 1, view)
  }
  // smooth is a frame's word: with a screen it is part of what is asked, without one it is nothing
  assert.equal((await fetch(new URL(`/snapshot?token=${TOKEN}&view=live&screen=2360x1640&smooth=2`, app.url))).status, 400)
})

