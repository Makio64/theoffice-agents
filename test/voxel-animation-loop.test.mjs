import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Renderer } from 'three/webgpu'
import Animation from 'three/src/renderers/common/Animation.js'
import { suspendAnimation } from '../site/voxel/animation-loop.js'

// Use the installed renderer's public setter and actual Animation controller.
// Only the display clock, inspector, node counter and drawing backend are fake;
// no GPU or browser is needed to detect an otherwise invisible RAF leak.
function fixture(t) {
  let requestId = 0, now = 0, appFrames = 0, nodeFrames = 0, draws = 0
  const pending = new Map(), events = []
  const clock = {
    requestAnimationFrame(callback) { const id = ++requestId; pending.set(id, callback); return id },
    cancelAnimationFrame(id) { pending.delete(id) },
    tick() {
      now += 1000 / 60
      for (const [id, callback] of [...pending]) {
        if (!pending.delete(id)) continue
        callback(now)
      }
    },
  }
  const renderer = Object.create(Renderer.prototype)
  renderer._initialized = true
  renderer._inspector = {
    isRunning: false,
    finish() { this.isRunning = false; events.push('inspector finish') },
    begin() { this.isRunning = true },
  }
  const nodeFrame = { frameId: 0, update() { this.frameId++; nodeFrames++ } }
  const info = { autoReset: true, reset() {}, frame: 0 }
  const animation = new Animation(renderer, { nodeFrame }, info)
  animation.setContext(clock)
  renderer._animation = animation
  renderer._renderScene = () => { draws++ }
  const publicSetter = Renderer.prototype.setAnimationLoop.bind(renderer)
  renderer.setAnimationLoop = callback => { events.push(callback === null ? 'public null' : 'public callback'); return publicSetter(callback) }
  const stop = animation.stop.bind(animation)
  animation.stop = () => { events.push('private stop'); stop() }
  const frame = () => { appFrames++ }
  t.after(() => animation.dispose())
  return {
    renderer, animation, clock, pending, events, frame,
    get appFrames() { return appFrames }, get nodeFrames() { return nodeFrames }, get draws() { return draws },
  }
}

test('suspension removes the installed renderer clock after clearing the public callback', async t => {
  const app = fixture(t)
  await app.renderer.setAnimationLoop(app.frame)
  app.clock.tick()
  assert.equal(app.appFrames, 1)
  // Three 0.187's public null callback alone leaves its node-frame RAF running.
  await app.renderer.setAnimationLoop(null)
  const nodeFramesBefore = app.nodeFrames
  app.clock.tick()
  assert.equal(app.appFrames, 1)
  assert.equal(app.nodeFrames, nodeFramesBefore + 1)
  assert.equal(app.pending.size, 1)
  app.events.length = 0
  await suspendAnimation(app.renderer)
  assert.deepEqual(app.events.slice(0, 2), ['public null', 'private stop'])
  assert.equal(app.renderer.getAnimationLoop(), null)
  assert.equal(app.pending.size, 0)
  const suspendedNodeFrames = app.nodeFrames
  for (let i = 0; i < 60; i++) app.clock.tick()
  assert.equal(app.nodeFrames, suspendedNodeFrames)
  assert.equal(app.appFrames, 1)
})

test('the public renderer API resumes exactly one clock and waits until the next tick to call the app', async t => {
  const app = fixture(t)
  await app.renderer.setAnimationLoop(app.frame)
  app.clock.tick()
  await suspendAnimation(app.renderer)
  assert.equal(app.pending.size, 0)
  await app.renderer.setAnimationLoop(app.frame)
  assert.equal(app.appFrames, 1, 'start must not synchronously re-enter the app frame')
  assert.equal(app.pending.size, 1)
  app.clock.tick()
  assert.equal(app.appFrames, 2)
  assert.equal(app.pending.size, 1)
  await suspendAnimation(app.renderer)
  await suspendAnimation(app.renderer)
  assert.equal(app.pending.size, 0)
})

test('a manual render while suspended restarts the Three clock, and resuspension removes it without calling the app', async t => {
  const app = fixture(t)
  await app.renderer.setAnimationLoop(app.frame)
  app.clock.tick()
  await suspendAnimation(app.renderer)
  const appFramesBefore = app.appFrames
  app.renderer.render({}, {})
  assert.equal(app.draws, 1)
  assert.equal(app.appFrames, appFramesBefore)
  assert.equal(app.pending.size, 1)
  await suspendAnimation(app.renderer)
  assert.equal(app.pending.size, 0)
  app.clock.tick()
  assert.equal(app.appFrames, appFramesBefore)
})

test('a failed manual render can be resuspended in finally without leaking a scheduled clock', async t => {
  const app = fixture(t)
  await app.renderer.setAnimationLoop(app.frame)
  await suspendAnimation(app.renderer)
  app.renderer._renderScene = () => { throw new Error('Expected drawing failure') }
  await assert.rejects(async () => {
    try { app.renderer.render({}, {}) }
    finally { await suspendAnimation(app.renderer) }
  }, /Expected drawing failure/)
  assert.equal(app.pending.size, 0)
  assert.equal(app.renderer.getAnimationLoop(), null)
})

test('a renderer with no usable private stop method still receives the public suspension call', async () => {
  for (const animation of [undefined, {}, { stop: true }]) {
    const calls = []
    const renderer = { _animation: animation, setAnimationLoop(callback) { calls.push(callback) } }
    await assert.doesNotReject(async () => { await suspendAnimation(renderer) })
    assert.deepEqual(calls, [null])
  }
})
