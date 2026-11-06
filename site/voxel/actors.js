/**
 * The cast in voxels: every character's own pixel sprite (lib/cast.mjs, 17 × 10 on Clawd's skeleton) extruded, cut into
 * a body, two arms and the eyes so it can take the pixel office's poses (svg-kit POSES): typing, reading, thinking,
 * pointing at its helpers, the boss with its arms up, a hand up, sitting back done, scratching its head when stuck,
 * dozing, standing with a mug. Interns are the cast's mini sprites (11 × 6). Screens are the pixel office's own
 * 16 × 10 screens (svg-kit SCREEN), drawn once per kind on a tiny canvas and shown unfiltered.
 */
import { CAST } from '../../plugin/lib/cast.mjs'
import { ROLE } from '../../plugin/lib/svg-kit.mjs'

/** A desk class → the pose its character takes (svg-live DESK_SCRIPT, in this file's words). */
export const DESK_POSE = { working: 'type', thinking: 'think', waiting: 'boss', asking: 'hand', done: 'back', break: 'back', stopped: 'stuck', error: 'stuck', dozing: 'doze' }
/** A desk class → its monitor's screen (svg-live DESK_SCREEN); a desk at work shows its kind of work. */
export const DESK_SCREEN = { waiting: 'wait', asking: 'ask', thinking: 'think', done: 'done', break: 'done', stopped: 'stop', error: 'err', dozing: 'doze' }
const READING = new Set(['reading', 'web', 'planning'])

// The screens, 16 × 10: [x, y, w, h, color] rects on a background (svg-kit SCREEN_BG and SCREEN, still frames)
const SCREEN_BG = {
  coding: '#1b2030', reading: '#e9e4d6', terminal: '#0b100b', testing: '#0f1716', web: '#eef0f3', delegating: '#1d1828',
  planning: '#f2eee2', talking: '#1b2030', design: '#24202a', tools: '#1b2030', think: '#1b2030', wait: '#1f1a26',
  ask: '#2a1814', done: '#0f1716', stop: '#1d1a12', err: '#2a1410', doze: '#0b0f12', off: '#0b0d10',
}
const check = x => [[x + 4, 2, 1, 1], [x + 3, 3, 1, 1], [x, 4, 1, 1], [x + 2, 4, 1, 1], [x + 1, 5, 1, 1]].map(r => [...r, '#9ab86a'])
const SCREEN_ART = {
  coding: [[[1, 1, 3, 1, '#c678dd'], [5, 1, 5, 1, '#9ab86a'], [3, 3, 7, 1, '#eec96f'], [3, 5, 2, 1, '#6f91dc'], [6, 5, 6, 1, '#ece2cd'], [1, 7, 4, 1, '#c678dd'], [6, 7, 3, 1, '#9ab86a'], [9, 7, 1, 1, '#ffffff']],
    [[1, 1, 3, 1, '#c678dd'], [5, 1, 5, 1, '#9ab86a'], [3, 3, 7, 1, '#eec96f'], [3, 5, 2, 1, '#6f91dc'], [6, 5, 6, 1, '#ece2cd'], [1, 7, 4, 1, '#c678dd'], [6, 7, 6, 1, '#9ab86a'], [12, 7, 1, 1, '#ffffff']]],
  reading: [[[1, 1, 13, 1, '#9a9282'], [1, 3, 11, 1, '#9a9282'], [1, 5, 13, 1, '#9a9282'], [1, 7, 9, 1, '#9a9282'], [0, 3, 16, 1, '#eec96f88']],
    [[1, 1, 13, 1, '#9a9282'], [1, 3, 11, 1, '#9a9282'], [1, 5, 13, 1, '#9a9282'], [1, 7, 9, 1, '#9a9282'], [0, 5, 16, 1, '#eec96f88']]],
  terminal: [[[1, 1, 8, 1, '#4d5a4d'], [1, 3, 5, 1, '#4d5a4d'], [1, 5, 1, 1, '#9ab86a'], [2, 6, 1, 1, '#9ab86a'], [1, 7, 1, 1, '#9ab86a'], [5, 8, 3, 1, '#9ab86a']],
    [[1, 1, 8, 1, '#4d5a4d'], [1, 3, 5, 1, '#4d5a4d'], [1, 5, 1, 1, '#9ab86a'], [2, 6, 1, 1, '#9ab86a'], [1, 7, 1, 1, '#9ab86a']]],
  testing: [[...check(1), [1, 8, 14, 1, '#2c3a33'], [1, 8, 6, 1, '#9ab86a']], [...check(1), ...check(6), ...check(11), [1, 8, 14, 1, '#9ab86a']]],
  web: [[[0, 0, 16, 2, '#c9ced8'], [1, 0, 1, 1, '#e07a61'], [3, 0, 1, 1, '#eec96f'], [5, 0, 1, 1, '#9ab86a'], [1, 3, 6, 5, '#6f91dc'], [1, 6, 6, 2, '#9ab86a'], [5, 4, 1, 1, '#eec96f'], [8, 3, 7, 1, '#a6abb5'], [8, 5, 6, 1, '#a6abb5'], [8, 7, 7, 1, '#a6abb5'], [0, 2, 8, 1, '#6f91dc']]],
  delegating: [[[12, 1, 2, 2, '#c678dd'], [12, 4, 2, 2, '#c678dd'], [12, 7, 2, 2, '#c678dd'], [5, 4, 1, 1, '#ece2cd'], [3, 5, 4, 1, '#ece2cd'], [5, 6, 1, 1, '#ece2cd']]],
  planning: [[[1, 0, 3, 1, '#8a8478'], [1, 2, 3, 1, '#8a8478'], [1, 1, 1, 1, '#8a8478'], [3, 1, 1, 1, '#8a8478'], [1, 3, 3, 1, '#8a8478'], [1, 5, 3, 1, '#8a8478'], [1, 4, 1, 1, '#8a8478'], [3, 4, 1, 1, '#8a8478'], [1, 6, 3, 1, '#8a8478'], [1, 8, 3, 1, '#8a8478'], [1, 7, 1, 1, '#8a8478'], [3, 7, 1, 1, '#8a8478'], [6, 1, 8, 1, '#a59d8c'], [6, 4, 6, 1, '#a59d8c'], [6, 7, 8, 1, '#a59d8c'], [2, 1, 1, 1, '#4f7a1f'], [2, 4, 1, 1, '#4f7a1f']]],
  talking: [[[2, 1, 12, 5, '#ece2cd'], [4, 6, 2, 1, '#ece2cd'], [4, 7, 1, 1, '#ece2cd'], [9, 7, 6, 2, '#9ab86a'], [4, 3, 2, 1, '#7a6f5c'], [7, 3, 2, 1, '#7a6f5c'], [10, 3, 2, 1, '#7a6f5c']]],
  design: [[[1, 2, 4, 6, '#e07a61'], [6, 2, 4, 6, '#eec96f'], [11, 2, 4, 6, '#6f91dc']], [[1, 2, 4, 6, '#eec96f'], [6, 2, 4, 6, '#6f91dc'], [11, 2, 4, 6, '#e07a61']]],
  tools: [[[6, 3, 5, 1, '#a4977c'], [6, 7, 5, 1, '#a4977c'], [6, 4, 1, 3, '#a4977c'], [10, 4, 1, 3, '#a4977c'], [8, 2, 1, 1, '#a4977c'], [8, 8, 1, 1, '#a4977c'], [5, 5, 1, 1, '#a4977c'], [11, 5, 1, 1, '#a4977c']]],
  think: [[[3, 4, 2, 2, '#9ab86a']], [[3, 4, 2, 2, '#9ab86a'], [7, 4, 2, 2, '#9ab86a']], [[3, 4, 2, 2, '#9ab86a'], [7, 4, 2, 2, '#9ab86a'], [11, 4, 2, 2, '#9ab86a']]],
  wait: [[[14, 8, 1, 1, '#b48ead'], [2, 2, 3, 3, '#c678dd'], [7, 2, 3, 3, '#c678dd'], [12, 2, 3, 3, '#c678dd']], [[2, 2, 3, 3, '#c678dd'], [7, 2, 3, 3, '#c678dd'], [12, 2, 3, 3, '#c678dd']]],
  ask: [[[7, 1, 3, 1, ROLE.ask], [6, 2, 1, 1, ROLE.ask], [10, 2, 1, 1, ROLE.ask], [10, 3, 1, 1, ROLE.ask], [8, 4, 2, 1, ROLE.ask], [8, 5, 1, 1, ROLE.ask], [8, 7, 1, 1, ROLE.ask]], []],
  done: [[[11, 2, 1, 1], [10, 3, 2, 1], [4, 4, 1, 1], [9, 4, 2, 1], [4, 5, 2, 1], [8, 5, 2, 1], [5, 6, 4, 1], [6, 7, 2, 1]].map(r => [...r, ROLE.idle])],
  stop: [[[5, 2, 2, 6, ROLE.accent], [9, 2, 2, 6, ROLE.accent]]],
  err: [[[7, 1, 1, 1], [6, 2, 1, 2], [8, 2, 1, 2], [5, 4, 1, 2], [9, 4, 1, 2], [4, 6, 1, 2], [10, 6, 1, 2], [3, 8, 9, 1], [7, 3, 1, 3], [7, 7, 1, 1]].map(r => [...r, ROLE.warn]), []],
  doze: [[[3, 3, 2, 2, '#2e4a52']], [[9, 6, 2, 2, '#2e4a52']]],
  off: [[[11, 1, 1, 1, '#1d232c'], [12, 2, 1, 1, '#1d232c'], [13, 3, 1, 1, '#1d232c']]],
}
/** The screen a desk shows, its frames (a few kinds blink or type). */
export function screenOf(kind, activityKind) {
  const name = DESK_SCREEN[kind] ?? (SCREEN_ART[activityKind] ? activityKind : 'tools')
  return name
}

export function createActors({ THREE, kit }) {
  const { box, actorInk, flush } = kit
  const screens = new Map()
  // One canvas per screen frame, 16 × 10 pixels, shown with nearest filtering: the pixel office's own screens.
  function screenMaterial(name, frame = 0) {
    const art = SCREEN_ART[name] ?? SCREEN_ART.tools
    const key = `${name}:${frame % art.length}`
    if (!screens.has(key)) {
      const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 10
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = SCREEN_BG[name] ?? '#1b2030'; ctx.fillRect(0, 0, 16, 10)
      for (const [x, y, w, h, color] of art[frame % art.length]) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h) }
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false
      const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })
      kit.disposables.add(texture); kit.disposables.add(material)
      screens.set(key, material)
    }
    return screens.get(key)
  }
  const frames = name => (SCREEN_ART[name] ?? SCREEN_ART.tools).length
  const planes = new THREE.PlaneGeometry(1, 1)
  kit.disposables.add(planes)
  /** A screen plane (w × h), its frames swapped by `tick(t)`. */
  function screen(parent, name, x, y, z, w, h) {
    const mesh = new THREE.Mesh(planes, screenMaterial(name))
    mesh.position.set(x, y, z); mesh.scale.set(w, h, 1)
    mesh.userData.screen = name
    parent.add(mesh)
    return mesh
  }
  /** Show another screen on a monitor (its first frame). */
  function setScreen(mesh, name) {
    if (mesh.userData.screen === name) return
    mesh.userData.screen = name
    mesh.material = screenMaterial(name, 0)
  }
  function tickScreen(mesh, t, phase = 0) {
    const name = mesh.userData.screen, n = frames(name)
    if (n < 2) return false
    const rate = name === 'think' ? 2 : name === 'ask' || name === 'err' ? 1.6 : name === 'doze' ? .4 : 2.4
    const material = screenMaterial(name, Math.floor((t + phase) * rate) % n)
    if (mesh.material === material) return false
    mesh.material = material
    return true
  }

  /**
   * A character: `agent` (a cast id), extruded at `p` world units a pixel. The root's origin is its feet's middle;
   * `parts.body`, `leftArm`, `rightArm`, `eyes` move for a pose. With `legs: false` the last two rows are left out (a
   * figure seated behind its desk).
   */
  function figure(agent, { p = .085, depth = .34, legs = true, id = null } = {}) {
    const spec = CAST[agent] ?? CAST.claude
    const root = new THREE.Group(), body = new THREE.Group(), leftArm = new THREE.Group(), rightArm = new THREE.Group(), eyes = new THREE.Group(), lids = new THREE.Group()
    root.userData.renderBundleActor = true
    root.add(body, leftArm, rightArm, eyes)
    eyes.add(lids)
    const rows = legs ? spec.sprite : spec.sprite.slice(0, 8)
    const base = legs ? 0 : 2
    const yOf = y => (9 - y - base + .5) * p
    // the eyes shut and blink about their own row, not the feet
    const eyeRows = rows.flatMap((row, y) => [...row].some(ch => spec.eyes.includes(ch)) ? [y] : [])
    const eyeY = eyeRows.length ? eyeRows.reduce((a, y) => a + yOf(y), 0) / eyeRows.length : 0
    lids.position.y = eyeY
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      const color = spec.legend[ch]
      if (!color) return
      const part = y < 8 && x < 2 ? leftArm : y < 8 && x > 14 ? rightArm : body
      // only the body casts a shadow: the arms' would add a draw each for a speck nobody sees
      box(part, (x - 8) * p, yOf(y), 0, p, p, depth, actorInk(color), { castShadow: part === body })
      if (spec.eyes.includes(ch)) box(lids, (x - 8) * p, yOf(y) - eyeY, depth / 2 + .012, p * .88, p * .95, .03, spec.eye, { glow: agent === 'codex' ? .25 : 0, castShadow: false })
    }))
    return { root, body, leftArm, rightArm, eyes, lids, agent, p, id, pose: 'look', phase: Math.random() * 7 }
  }
  /** An intern: the character's mini sprite (11 × 6), feet at the origin. */
  function mini(agent, { p = .06, depth = .24 } = {}) {
    const spec = CAST[agent] ?? CAST.claude
    const root = new THREE.Group()
    spec.mini.forEach((row, y) => [...row].forEach((ch, x) => {
      const eye = ch === 'E'
      const color = eye ? spec.miniEye : spec.legend[ch]
      if (!color) return
      box(root, (x - 5) * p, (5 - y + .5) * p, 0, p, p, depth, eye ? color : actorInk(color), { castShadow: false })
    }))
    return root
  }
  /** The ? bubble over a raised hand: white, inked, its coral ? fat (svg-kit bq at voxel size). */
  function bubble(parent, x, y, z, s = .055) {
    const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group)
    const rows = ['.wwwwwww.', 'wwwqqqwww', 'wwqqwqqww', 'wwwwwqqww', 'wwwwqqwww', 'wwwwqwwww', 'wwwwwwwww', 'wwwwqwwww', '.wwwwwww.', '..ww.....', '..w......']
    // lit from within, as the pixel bubble is white whatever the hour
    kit.sprite(group, rows, { w: kit.mat('#fbf6ea', .55), q: kit.mat(ROLE.ask, .5) }, 0, 0, 0, s, s * 1.4)
    kit.sprite(group, rows.map(r => r.replace(/q/g, 'w')), { w: '#2b2520' }, 0, -s * .1, -s * .9, s * 1.12, s * .6)
    return group
  }
  /** zZ drifting over a dozer: two pixel z's. */
  function snore(parent, x, y, z, s = .06) {
    const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group)
    const zed = ['zzzzz', '...z.', '..z..', '.z...', 'zzzzz']
    kit.sprite(group, zed, { z: kit.mat('#cfe3ff', .5) }, 0, 0, 0, s, s)
    kit.sprite(group, zed, { z: kit.mat('#9fb6d8', .4) }, s * 6, s * 6, 0, s * .75, s * .75)
    return group
  }

  /**
   * Move a figure into its pose at time `t` (seconds). Arms and eyes move by whole pixels, as the pixel art does.
   * Returns nothing: the caller marks the frame as changed.
   */
  function animate(actor, pose, t) {
    const { body, leftArm, rightArm, eyes, lids, p } = actor
    const tt = t + actor.phase
    let bodyY = 0, lx = 0, ly = 0, rx = 0, ry = 0, ex = 0, ey = 0, shut = false
    if (pose === 'type') { ly = (Math.floor(tt * 7) % 2) * p * .5; ry = (Math.floor(tt * 7 + 1) % 2) * p * .5; ex = -p * 1.2; bodyY = Math.sin(tt * 5) * p * .08 }
    else if (pose === 'look') { ex = -p * 1.2 }
    else if (pose === 'read') { ex = -p * 1.2; ey = -p * .6 + (Math.floor(tt * .8) % 3) * -p * .2 }
    else if (pose === 'think') { ex = p * .8; ey = p * .9; bodyY = Math.sin(tt * 1.2) * p * .06 }
    else if (pose === 'point') { rx = p * 1.6; ry = p; ex = p * 1.2 }
    else if (pose === 'boss') { ly = p * 2.6; ry = p * 2.6; ex = -p * .6; ey = -p * .6 }
    else if (pose === 'hand') { ry = p * 4.2 + (Math.floor(tt * 2) % 2) * p * .6; rx = -p * .3 }
    else if (pose === 'back') { bodyY = 0 }
    else if (pose === 'stuck') { ly = p * 3.4; lx = p * 1.1; ey = p * .5 }
    else if (pose === 'doze') { shut = true; bodyY = -p * .8 + Math.sin(tt * .9) * p * .12; ly = -p * .8; ry = -p * .8 }
    else if (pose === 'stand') { ex = Math.sin(tt * .7) > .4 ? p : -p * .4 }
    // blink now and then (never while dozing: the eyes are shut)
    const blink = !shut && Math.sin(tt * .93) > .992
    body.position.y = bodyY
    leftArm.position.set(lx, bodyY + ly, 0); rightArm.position.set(rx, bodyY + ry, 0)
    eyes.position.set(ex, bodyY + ey, 0)
    lids.scale.y = shut || blink ? .18 : 1
  }

  return { figure, mini, bubble, snore, animate, screen, setScreen, tickScreen, screenOf, flush, readingPose: kind => READING.has(kind) }
}
