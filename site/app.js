// The page: draws its sprites from the plugin's own data (art.js, data.js; its frames and tiles are in art.css, from
// theme.js), then runs it: the day and night sky and the neighbours, the console's copy keys, the plugin's menu of tabs
// that picks a view, the crew in the lobby, Clawd walking down the street past the plugin's street front, its commits
// line under it.
import { CAST, LAMPS, VERSION } from './data.js'
import * as A from './art.js'
import { layoutCity, farSvg, starsSvg, skyBands, bandTile, neighboursSvg, lightPhase } from './sky.js'
import { startParallax } from './parallax.js'
import { EDGE, FEATURE_VIEWS, pictureParts } from './pictures.mjs'
import { officeScene, deskScene } from './office.mjs'

const { P, svg } = A
const $ = (s, el = document) => el.querySelector(s)
const $$ = (s, el = document) => [...el.querySelectorAll(s)]
const byId = Object.fromEntries(CAST.map((c) => [c.id, c]))

// ---------------------------------------------------------------- sprites and icons into the page

const ICONS = Object.keys(A.ICON)
for (const el of $$('[data-ico]')) if (ICONS.includes(el.dataset.ico)) el.outerHTML = A.iconSvg(el.dataset.ico, Number(el.dataset.scale) || P)
for (const el of $$('[data-sprite]')) el.innerHTML = A.castSvg(byId[el.dataset.sprite], Number(el.dataset.scale) || P)
$('#ver').textContent = `v${VERSION}`

const tg = A.toggleIcons()
$('#sky .tg').innerHTML = tg.sun + tg.moon

// the neon: 4 px to its pixel on a wide sign, 3 on a narrow one
$('.neon .wide').innerHTML = A.neonSvg(4)
$('.neon .narrow').innerHTML = A.neonSvg(3)
// the legs under the sign and the terminal, and the catwalks
for (const el of $$('.sign, .term')) el.insertAdjacentHTML('beforeend', '<i class="leg" style="left:64px"></i><i class="leg" style="right:64px"></i><i class="catwalk"></i>')

// the sky's bodies, haloed, on the page's grid
$('.moon').innerHTML = A.orbSvg('moon')
$('.sun').innerHTML = A.orbSvg('sun')

// The clouds, the trailer's (art.js CLOUDS) in the sky's light (style.css): streaks far off and slow, puffs nearer and
// faster, each crossing the window right to left in steps of a pixel; over the header, beside the sign, and clear of
// the roof deck's gap under it. [shape, its row (px from the window's top), art px a second, where it is in its crossing]
const CLOUDS = [['streakB', 14, 2.4, 0.3], ['streakA', 112, 2, 0.75], ['puffB', 186, 3.6, 0.1], ['streakA', 356, 2.2, 0.45],
  ['puffA', 436, 4, 0.62], ['puffC', 528, 3.4, 0.88]]
const clouds = CLOUDS.map(([shape, y, speed, at]) => {
  const { svg: art, w } = A.cloudSvg(shape)
  const el = document.createElement('div')
  el.className = `cloud${shape.startsWith('puff') ? ' near' : ''}`
  el.innerHTML = art
  el.style.top = `${y}px`
  $('#clouds').append(el)
  return { el, w: w * P, speed: speed * P, at }
})
function drift() {
  for (const { el, w, speed, at } of clouds) {
    const from = Math.ceil(innerWidth / P) * P, dur = (from + w) / speed
    // where it rests when nothing moves (prefers-reduced-motion): where its crossing has it
    const x = from - Math.round((at * (from + w)) / P) * P
    const vars = { '--from': `${from}px`, '--to': `${-w}px`, '--x': `${x}px`, '--n': (from + w) / P, '--dur': `${dur.toFixed(1)}s`, '--dl': `${(-at * dur).toFixed(1)}s` }
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v)
  }
}

// The stars, the skyline on the horizon and the sky's bands, drawn as wide as the widest the window has been and the
// bands as tall as it is: the zenith at its top, the horizon at its foot (art.css has a sky for a window 900 tall)
let cityW = 0, skyRows = 0, skyLight = ''
function skyline() {
  const W = Math.ceil(Math.max(innerWidth, screen.width || 0, 360) / P / 4) * 4 + 8
  const rows = Math.max(300, Math.ceil(innerHeight / P))
  const light = document.documentElement.dataset.light || lightPhase(document.documentElement.dataset.sky, document.documentElement.dataset.sky === 'day' ? 8 : 1)
  if (rows !== skyRows || light !== skyLight) {
    skyRows = rows
    skyLight = light
    const sky = $('.sky')
    sky.style.setProperty('--sky-active', A.uri(bandTile(skyBands(light, rows))))
    sky.classList.add('fitted')
  }
  if (W <= cityW) return
  cityW = W
  $('#stars').innerHTML = starsSvg(W, Math.ceil((Math.max(innerHeight, screen.height || 0) * 0.6) / P))
  const city = layoutCity(W)
  $('#far').innerHTML = `<span class="n">${farSvg(city, W, 'night')}</span><span class="d">${farSvg(city, W, 'day')}</span>`
}
skyline()
drift()
addEventListener('resize', () => { skyline(); drift() })

// The neighbours either side of the tower, standing on its street (sky.js neighboursSvg): drawn as wide as the window
// leaves them (tucked under its quoins) and as tall as the tallest of them; none beside a tower that fills the page.
// The first on each side is `l` or `r` art px tall, about half the tower and three fifths of it with the Live view in
// it, lower than its roof as the trailer's are; they stand as tall whichever view it holds.
const NB = { l: 300, r: 372, tuck: 8 }
let nbKey = ''
function neighbours() {
  const t = $('.tower').getBoundingClientRect()
  const sides = { l: Math.round(t.left) + NB.tuck, r: Math.round(innerWidth - t.right) + NB.tuck }
  const key = `${sides.l}:${sides.r}`
  if (key === nbKey) return
  nbKey = key
  for (const [s, px] of Object.entries(sides)) {
    const box = $(`#nb${s}`)
    if (px < 16 + NB.tuck) { box.innerHTML = ''; continue }
    const w = Math.ceil(px / P), h = Math.ceil(NB[s] * 1.4) + 16
    box.style.cssText = `left:${s === 'l' ? 0 : Math.round(t.right) - NB.tuck}px;width:${w * P}px;height:${h * P}px`
    box.innerHTML = `<span class="n">${neighboursSvg(w, h, s, 'night', NB[s])}</span><span class="d">${neighboursSvg(w, h, s, 'day', NB[s])}</span>`
  }
}
neighbours()
addEventListener('resize', neighbours)
startParallax()

// the roof deck: the water tower, the AC, two vents on the left, the dish and the antenna on the right, pigeons and the
// cat on the coping
const props = A.roofProps()
$('#roofline').innerHTML =
  `<span class="prop" style="left:28px">${props.tower}</span><span class="prop" style="left:88px">${props.ac}</span>` +
  `<span class="prop wide" style="left:126px">${props.vent}</span><span class="prop wide" style="left:142px">${props.vent}</span>` +
  `<span class="prop wide" style="right:96px">${props.dish}</span><span class="prop" style="right:30px">${props.antenna}</span>`
$('.parapet').insertAdjacentHTML('beforeend', '<i class="spill"></i>' +
  `<span class="prop pigeon" style="left:round(down, 22%, 2px)">${props.pigeon}</span>` +
  `<span class="prop pigeon wide" style="left:round(down, 22% + 20px, 2px)">${props.pigeon}</span>` +
  `<span class="prop cat" style="left:round(down, 82%, 2px)">${props.cat}</span>`)

// the facts' rooms, each scene drawn 4 px to its pixel: a featured picture in its window
const SCENES = { live: A.liveScene, crowd: A.crowdScene, local: A.localScene }
for (const el of $$('[data-scene]')) {
  const draw = SCENES[el.dataset.scene]
  if (draw) el.innerHTML = `<span class="scene">${draw(4)}</span>`
}

// ---------------------------------------------------------------- the inhabited office floor
const decor = A.lobbyDecor()
$('.hall').insertAdjacentHTML('afterbegin', [12.5, 37.5, 62.5, 87.5].map((f) =>
  `<span class="pendant" style="left:round(down, ${f}% - 9px, 2px)">${A.pendantSvg()}</span>`).join('') +
  `<span class="decor" style="left:round(down, 25% - 14px, 2px)">${decor.clock}</span>` +
  `<span class="decor" style="left:round(down, 50% - 24px, 2px)">${decor.portrait}</span>` +
  `<span class="decor" style="left:round(down, 75% - 24px, 2px)">${decor.painting}</span>`)

// ---------------------------------------------------------------- the console

// its lines type themselves in, one after the other, the cursor ahead of them: each line's text keeps its place, out of
// sight until typed (so nothing moves, and a copy key always has the whole command)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const caret = document.createElement('i')
caret.className = 'caret'
async function typeIn() {
  for (const line of $$('.term .line')) {
    line.classList.add('on')
    if (line.classList.contains('note')) { await sleep(90); continue }
    const cmd = $('.cmd', line), full = cmd.textContent
    const typed = document.createElement('span'), rest = document.createElement('span')
    rest.className = 'rest'
    cmd.replaceChildren(typed, caret, rest)
    const tick = line.classList.contains('go') ? 70 : Math.min(26, 620 / full.length)
    for (let i = 1; i <= full.length; i++) {
      typed.textContent = full.slice(0, i)
      rest.textContent = full.slice(i)
      await sleep(tick)
    }
    cmd.textContent = full
    await sleep(120)
  }
  delete document.documentElement.dataset.typing
}
if ('typing' in document.documentElement.dataset) typeIn()

// copy a line: the clipboard, else the line selected for the hand to copy; a check for a moment either way
for (const b of $$('.copy')) {
  b.addEventListener('click', async () => {
    const code = b.parentElement.querySelector('.cmd')
    const text = b.dataset.text ?? code.textContent // a prompt's button carries its own text
    let ok = false
    try { await navigator.clipboard.writeText(text); ok = true } catch { /* the clipboard is shut: select the line */ }
    if (!ok) {
      const r = document.createRange()
      r.selectNodeContents(code)
      const s = getSelection()
      s.removeAllRanges()
      s.addRange(r)
    }
    b.innerHTML = A.iconSvg('check')
    b.classList.add('ok')
    b.setAttribute('aria-label', ok ? 'Copied' : 'Selected')
    clearTimeout(b._t)
    b._t = setTimeout(() => {
      b.innerHTML = A.iconSvg('copy')
      b.classList.remove('ok')
      b.setAttribute('aria-label', 'Copy')
    }, 1400)
  })
}

// ---------------------------------------------------------------- the street

// a lamp each side of the building, where the page is wide enough: the street front has its own by the door
const walk = $('#walk')
const LAMP = A.streetLampSvg()
walk.innerHTML = ['l', 'r'].map((s) => `<span class="pool ${s}"></span><span class="lamp-post ${s}">${LAMP}<i class="halo"></i></span>`).join('') +
  // and a pool under each lamp by the street front's door (data.js LAMPS), where the tower is at its full width
  LAMPS.map((x) => `<span class="pool door" style="--at:${x}px"></span>`).join('')
// Clawd walking: his legs together, then apart, two pixels (4 px) at each step; as big as the agents going in and out of
// the street front over him (at 1.5×)
const clawd = byId.claude
const stride = clawd.sprite.map((row, y) => (y === 9 ? '.C...C.....C...C.' : row))
const walker = document.createElement('span')
walker.className = 'walker'
walker.setAttribute('aria-hidden', 'true')
walker.innerHTML = A.castSvg({ ...clawd, sprite: A.at15(clawd.sprite) }, P, ' class="a"') + A.castSvg({ ...clawd, sprite: A.at15(stride) }, P, ' class="b"')
walk.append(walker)

// The walk, measured on the street: whole steps of 4 px. The entrance is laid out again on narrow pages, so Clawd
// keeps its agents' size; only the renderer's minimum width needs a little scaling on the smallest screens.
function street() {
  const n = Math.ceil((document.querySelector('.street').clientWidth + 80) / 4) + 1
  const front = $('[data-art="front"]')
  document.documentElement.style.setProperty('--k', Math.min(1, front.clientWidth / Number(front.getAttribute('width'))).toFixed(3))
  const subway = $('[data-art="subway"]')
  subway.parentElement.style.setProperty('--picture-scale', (subway.clientWidth / Number(subway.getAttribute('width'))).toFixed(3))
  document.documentElement.style.setProperty('--walk-n', n)
  document.documentElement.style.setProperty('--walk-dur', `${(n / 10).toFixed(1)}s`)
  document.documentElement.style.setProperty('--walk-delay', `${(-n / 10 * 0.32).toFixed(1)}s`)
}
street()
addEventListener('resize', street)

// the plugin's own street front over the sidewalk and its commits line under the road (build.mjs ground()), each by the
// page's sky; a release that drew neither leaves the page its street alone
const arts = $$('[data-art]')
const featurePictures = $$('[data-feature]')
for (const el of arts) el.addEventListener('error', () => { el.parentElement.hidden = true })
for (const el of arts) el.addEventListener('load', () => { el.parentElement.hidden = false; street() })

// ---------------------------------------------------------------- the views: the plugin's menu of tabs

// each view: its key's name, short name and icon (as the plugin's tabs: hooks/register.tsx), and the caption under it
const VIEWS = {
  office: ['Live', 'Live', 'live', 'Who is typing, who has a hand up, who is on a break.'],
  today: ['Today', 'Today', 'today', 'Hour by hour, project by project.'],
  week: ['Week', 'Week', 'week', 'One lit window per project and day.'],
  month: ['Month', 'Month', 'month', 'A wall calendar of the busy days.'],
  work: ['What they did', 'Work', 'work', 'One room per kind of work.'],
}
const KEYS = Object.keys(VIEWS)
const tabs = $$('.tab')
const pic = $('#pic'), caption = $('#caption'), panel = $('#view')
let current = 'office'
let quiet = false
const sky = () => document.documentElement.dataset.sky
const file = (k) => `img/${k}-${sky()}.svg`

// Use the app's renderer at the space each picture actually has. Its room packing adds floors instead of shrinking
// a desktop drawing. The built SVGs remain the fallback while the renderer and made-up sample facts load.
let drawings = null
let officeKey = ''
let featureKey = ''
let pictureTimer = 0
const pictureKeys = new WeakMap()
const pictureUrls = new WeakMap()
function putPicture(el, source, key) {
  const [, width, height] = source.match(/width="(\d+)" height="(\d+)" viewBox=/)
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }))
  const previous = pictureUrls.get(el)
  el.setAttribute('width', width)
  el.setAttribute('height', height)
  el.src = url
  el.parentElement.hidden = false
  pictureUrls.set(el, url)
  pictureKeys.set(el, key)
  if (previous) URL.revokeObjectURL(previous)
}
function drawPictures() {
  if (!drawings) return
  const { renderSvg, samples, parts } = drawings
  const light = sky(), facts = samples[light]
  const animate = !matchMedia('(prefers-reduced-motion: reduce)').matches
  // The native renderer's smallest cropped drawing is 376px wide. Below that, keep its compact room arrangement.
  const widthOf = (el) => Math.max(376, Math.round(el.parentElement.clientWidth / 2) * 2)
  const options = (width, name) => ({ width: width + EDGE * 4, view: name === 'office' ? 'live' : name, quiet: name === 'office' && quiet, animate, idPrefix: `${name}${light}` })
  const rendered = new Map()
  const drawing = (width, name, feature = false) => {
    const key = `${name}:${width}:${feature}`
    if (!rendered.has(key)) rendered.set(key, renderSvg(facts[name], { ...options(width, name), ...(feature ? { quiet: false } : {}) }))
    return rendered.get(key)
  }
  const width = widthOf(pic), key = `${current}:${light}:${width}:${animate}:${quiet}`
  if (pictureKeys.get(pic) !== key) putPicture(pic, parts.rooms(drawing(width, current), current), key)
  for (const el of arts) {
    const width = widthOf(el), key = `${el.dataset.art}:${light}:${width}:${animate}`
    if (pictureKeys.get(el) === key) continue
    const foot = parts.ground(drawing(width, 'week'))
    if (foot?.[el.dataset.art]) putPicture(el, foot[el.dataset.art], key)
  }
  // These are crops of the existing animated views, with the same rendering as the main preview.
  for (const el of featurePictures) {
    const name = el.dataset.feature, width = widthOf(el), key = `${name}:${light}:${width}:${animate}`
    if (pictureKeys.get(el) === key) continue
    const source = parts.feature(drawing(width, FEATURE_VIEWS[name], true), name)
    if (source) putPicture(el, source, key)
  }
  const lobby = $('#officeLife'), lobbyWidth = Math.round(lobby.clientWidth / 4) * 4
  const nextOffice = `${light}:${lobbyWidth}:${animate}`
  if (officeKey !== nextOffice) {
    lobby.innerHTML = officeScene(drawings.kit, { width: lobbyWidth, night: light === 'night', animate, deskProps: drawings.deskProps })
    officeKey = nextOffice
  }
  const nextFeature = `${light}:${animate}`
  if (featureKey !== nextFeature) {
    $('[data-scene="live"] .scene').innerHTML = deskScene(drawings.kit, { night: light === 'night', animate, deskProps: drawings.deskProps })
    featureKey = nextFeature
  }
  street()
}
function requestPictures() {
  clearTimeout(pictureTimer)
  pictureTimer = setTimeout(drawPictures, 80)
}
Promise.all([
  import('./lib/svg.mjs'), import('./lib/svg-kit.mjs'), import('./lib/svg-live.mjs'),
  fetch(new URL('./sample.json', import.meta.url)).then((r) => {
    if (!r.ok) throw new Error('Sample pictures unavailable')
    return r.json()
  }),
]).then(([renderer, kit, live, samples]) => {
  drawings = { renderSvg: renderer.renderSvg, kit, deskProps: live.deskProps, samples, parts: pictureParts(kit) }
  const observer = new ResizeObserver(requestPictures)
  for (const el of [panel, $('#officeLife'), ...arts.map((el) => el.parentElement), ...featurePictures.map((el) => el.parentElement)]) observer.observe(el)
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', requestPictures)
  drawPictures()
  setSky(sky(), false)
}).catch(() => { /* an older release: the built pictures */ })

function show(k, focus = false) {
  current = k
  $('#quiet').hidden = k !== 'office'
  const [label, , , text] = VIEWS[k]
  if (drawings) drawPictures()
  else pic.src = file(k)
  pic.alt = `The ${label} view, drawn by the plugin from sample data`
  caption.textContent = text
  for (const t of tabs) {
    const on = t.dataset.view === k
    t.setAttribute('aria-selected', String(on))
    t.tabIndex = on ? 0 : -1
    if (on) {
      panel.setAttribute('aria-labelledby', t.id)
      if (focus) t.focus()
    }
  }
  drawMenu()
}
for (const t of tabs) t.addEventListener('click', () => show(t.dataset.view))
$('#quiet').addEventListener('click', () => {
  quiet = !quiet
  $('#quiet').setAttribute('aria-pressed', String(quiet))
  $('#quiet').title = quiet ? 'Show desk activity tags' : 'Show project names without desk tags'
  drawPictures()
})
$('.keys').addEventListener('keydown', (e) => {
  const i = KEYS.indexOf(current)
  const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: KEYS.length - 1 }[e.key]
  if (to === undefined) return
  e.preventDefault()
  show(KEYS[(to + KEYS.length) % KEYS.length], true)
})

// The keys are the plugin's own console (lib/svg-menu.mjs, copied next to the page by build.mjs), drawn at the width the
// menu has, the key on screen lit and the one held down sunk, the caption on the deck under it; the tabs stay, each laid
// over its key with nothing of its own to show. Without the plugin's menu the page keeps its own keys.
const keys = $('.keys')
const deck = document.createElement('span')
deck.className = 'deck'
deck.setAttribute('aria-hidden', 'true')
let menu = null
let pressed = null
function drawMenu() {
  if (!menu) return
  const row = menu.renderMenu({
    keys: KEYS.map((k) => ({ id: k, label: VIEWS[k][0], short: VIEWS[k][1], icon: VIEWS[k][2], isOn: k === current })),
    width: keys.clientWidth, pressed, joined: true,
  })
  deck.innerHTML = row.source.replace(/<title>[^<]*<\/title>/, '')
  // the lit key goes nowhere, so the drawing lists it as still, not as a zone
  const still = [...(row.still ?? [])]
  for (const t of tabs) {
    const z = row.zones.find((z) => z.id === t.dataset.view) ?? still.shift()
    if (z) t.style.cssText = `left:${(z.x / row.W) * 100}%;width:${(z.w / row.W) * 100}%`
  }
}
import('./lib/svg-menu.mjs').then(async (m) => {
  if (typeof m.renderMenu !== 'function') return
  // the caption's deck in the console's own colors: its plate, the LED glass, the amber, a brass rivet at each end
  const { C: CN } = await import('./lib/svg-console.mjs').catch(() => ({}))
  const root = $('.menu')
  if (CN) {
    const rivet = A.uri(svg(2, 2, A.rects([[0, 0, 2, 2, CN.rivet], [0, 0, 1, 1, CN.rivetHi], [1, 1, 1, 1, CN.rivetLo]])))
    root.style.cssText = `--cn-plate:${CN.plate};--cn-led:${CN.led};--cn-ink:${CN.amber};--cn-rivet:${rivet}`
  }
  menu = m
  keys.prepend(deck)
  root.classList.add('drawn')
  new ResizeObserver(drawMenu).observe(keys)
  for (const t of tabs) {
    t.addEventListener('pointerdown', () => { pressed = t.dataset.view; drawMenu() })
    for (const e of ['pointerup', 'pointerleave', 'pointercancel']) t.addEventListener(e, () => { if (pressed) { pressed = null; drawMenu() } })
  }
}).catch(() => { /* an older release: the page's own keys */ })

// ---------------------------------------------------------------- day and night

const skyKey = $('#sky')
function setSky(s, save = true) {
  document.documentElement.dataset.sky = s
  document.documentElement.dataset.light = lightPhase(s, drawings?.samples[s].office.now.hour ?? (s === 'day' ? 8 : 1))
  skyline()
  skyKey.setAttribute('aria-label', s === 'day' ? 'Switch to night' : 'Switch to day')
  if (drawings) drawPictures()
  else {
    pic.src = file(current)
    for (const el of arts) el.src = `img/${el.dataset.art}-${s}.svg`
    for (const el of featurePictures) el.src = `img/feature-${el.dataset.feature}-${s}.svg`
    $('#officeLife img')?.setAttribute('src', `img/lobby-${s}.svg`)
  }
  if (save) try { localStorage.setItem('theoffice-sky', s) } catch { /* private window: the sky just is not remembered */ }
}
skyKey.addEventListener('click', () => setSky(sky() === 'day' ? 'night' : 'day'))
setSky(sky(), false)
show('office')
