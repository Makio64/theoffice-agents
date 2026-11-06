const ROAD_MIN = -26
const ROAD_MAX = 26
const ROAD_LENGTH = ROAD_MAX - ROAD_MIN
const STEP_POSES = [0, 1, 0, -1]
const WALKING_PARTS = [['leftLeg', 1], ['rightLeg', -1], ['leftArm', -1], ['rightArm', 1]]

const cars = Object.freeze([
  { direction: 1, speed: 1.32, phase: 18, z: 6.60, color: 'teal' },
  { direction: 1, speed: 1.32, phase: 44, z: 6.60, color: 'cream' },
  { direction: -1, speed: 1.13, phase: 31, z: 7.52, color: 'red' },
])
const walkers = Object.freeze([
  { direction: 1, speed: .44, phase: 28, stop: -14, hold: 3.5, z: 5.18, coat: 'teal', skin: 'skin', bag: true },
  { direction: -1, speed: .39, phase: 54, stop: .8, hold: 4, z: 5.43, coat: 'red', skin: 'skinLight' },
  { direction: 1, speed: .36, phase: 72, stop: 0, hold: 5, z: 5.18, coat: 'blue', skin: 'skinLight' },
  { direction: -1, speed: .47, phase: 23, stop: 14, hold: 4, z: 5.43, coat: 'cream', skin: 'skin', bag: true },
  { direction: 1, speed: .41, phase: 43, stop: 14.3, hold: 6, z: 5.18, coat: 'gold', skin: 'skin' },
  { direction: -1, speed: .34, phase: 15, stop: -14, hold: 5, z: 5.43, coat: 'blue', skin: 'skinLight', bag: true },
])
const modulo = (value, divisor) => ((value % divisor) + divisor) % divisor
const seconds = elapsed => Number.isFinite(elapsed) ? elapsed : 0

/** Deterministic lanes keep the same-direction cars 26 m apart, including at wrap. */
export function vehicleState(elapsed, index, result = {}) {
  const route = cars[index % cars.length]
  const distance = modulo(route.phase + seconds(elapsed) * route.speed, ROAD_LENGTH)
  result.x = route.direction > 0 ? ROAD_MIN + distance : ROAD_MAX - distance
  result.z = route.z
  result.direction = route.direction
  return result
}

/** A walk, a short stop at an entrance, then a walk; wrapping happens in the haze. */
export function pedestrianState(elapsed, index, result = {}) {
  const route = walkers[index % walkers.length]
  const start = route.direction > 0 ? -24 : 24
  const travel = 48 / route.speed
  const stopAt = Math.abs(route.stop - start) / route.speed
  const time = modulo(seconds(elapsed) + route.phase, travel + route.hold)
  const waiting = time >= stopAt && time < stopAt + route.hold
  const walkingTime = time < stopAt ? time : waiting ? stopAt : time - route.hold
  const distance = walkingTime * route.speed
  result.x = start + route.direction * distance
  result.z = route.z
  result.direction = route.direction
  result.walking = !waiting
  result.step = waiting ? 0 : STEP_POSES[Math.floor(distance / .09) % 4]
  return result
}

/**
 * Nine little street actors, drawn in three material batches. Voxel templates,
 * instance ranges and matrices are allocated once; there is no extra RAF,
 * point light, shadow map, texture or per-frame geometry allocation.
 */
export function createStreetLife({ THREE, parent }) {
  const group = new THREE.Group()
  group.name = 'Street life'
  parent.add(group)
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 })
  const lampMaterial = new THREE.MeshStandardMaterial({ color: '#eed9a3', emissive: '#eed9a3', emissiveIntensity: 1.25, roughness: 1 })
  const tailMaterial = new THREE.MeshStandardMaterial({ color: '#c87360', emissive: '#c87360', emissiveIntensity: .35, roughness: 1 })
  bodyMaterial.name = 'Street voxel colors'
  lampMaterial.name = 'Street headlights'
  tailMaterial.name = 'Street tail lights'
  const palette = {
    outline: ['#252a35', '#4c5264'], pants: ['#35445c', '#48586b'],
    skin: ['#c6906c', '#d2a17e'], skinLight: ['#dcc2a0', '#e6ceb3'],
    hair: ['#52463b', '#706052'], red: ['#a26555', '#c17b63'],
    teal: ['#658e83', '#7da99c'], blue: ['#6e86a1', '#86a5bf'],
    gold: ['#ae9258', '#c5ab70'], cream: ['#b9b4a0', '#ded4bc'],
    glass: ['#1d334b', '#668aa0'], tyre: ['#242731', '#343c46'],
  }
  const batches = [
    { material: bodyMaterial, items: [], mesh: null },
    { material: lampMaterial, items: [], mesh: null },
    { material: tailMaterial, items: [], mesh: null },
  ]
  const actors = []
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion()
  const position = new THREE.Vector3(), scale = new THREE.Vector3()
  const partOffset = new THREE.Matrix4()
  const ink = new THREE.Color()
  let lastTick = null, disposed = false

  function actor(kind, index) {
    const value = { kind, index, state: {}, world: new THREE.Matrix4(), parts: {} }
    for (const key of ['body', 'leftLeg', 'rightLeg', 'leftArm', 'rightArm']) value.parts[key] = new THREE.Matrix4()
    actors.push(value)
    return value
  }
  function voxel(target, x, y, z, w, h, d, color, part = 'body', batch = 0) {
    const local = new THREE.Matrix4().makeScale(w, h, d)
    local.setPosition(x, y, z)
    batches[batch].items.push({ actor: target, part, local, color })
  }

  cars.forEach((route, index) => {
    const a = actor('car', index), body = route.color
    voxel(a, 0, .30, 0, 2.34, .32, .66, body)
    voxel(a, -.13, .59, 0, 1.30, .34, .58, body)
    voxel(a, -.13, .78, 0, 1.36, .065, .61, body)
    voxel(a, .87, .49, 0, .57, .055, .63, body)
    for (const side of [-1, 1]) {
      voxel(a, -.13, .62, side * .302, 1.10, .22, .024, 'glass')
      voxel(a, -.23, .63, side * .32, .055, .26, .028, body)
      voxel(a, .25, .38, side * .35, .19, .035, .025, 'cream')
      for (const x of [-.74, .78]) {
        voxel(a, x, .105, side * .32, .36, .21, .13, 'tyre')
        voxel(a, x, .105, side * .39, .13, .10, .025, 'outline')
      }
      voxel(a, 1.18, .34, side * .22, .035, .14, .17, null, 'body', 1)
      voxel(a, -1.18, .32, side * .22, .035, .12, .14, null, 'body', 2)
    }
    voxel(a, 1.19, .20, 0, .06, .065, .61, 'outline')
    voxel(a, -1.19, .20, 0, .06, .065, .61, 'outline')
  })

  walkers.forEach((route, index) => {
    const a = actor('walker', index), coat = route.coat, skin = route.skin
    // A twelve-pixel silhouette: square head, coat, little hands and two feet.
    voxel(a, 0, .80, 0, .235, .22, .20, skin)
    voxel(a, -.018, .93, -.005, .25, .08, .22, 'hair')
    voxel(a, -.11, .86, -.014, .045, .14, .19, 'hair')
    voxel(a, .087 * route.direction, .82, .111, .028, .035, .025, 'outline')
    voxel(a, .132 * route.direction, .77, .10, .055, .055, .065, skin)
    voxel(a, 0, .68, 0, .105, .075, .13, skin)
    voxel(a, 0, .535, 0, .29, .28, .20, coat)
    voxel(a, 0, .67, .112, .09, .075, .04, index % 2 ? 'cream' : 'gold')
    voxel(a, 0, .36, -.005, .25, .17, .19, 'pants')
    for (const side of [-1, 1]) {
      const leg = side < 0 ? 'leftLeg' : 'rightLeg', arm = side < 0 ? 'leftArm' : 'rightArm'
      voxel(a, side * .075, .17, 0, .095, .26, .13, 'pants', leg)
      voxel(a, side * .075 + .025 * route.direction, .035, .028, .14, .07, .19, 'outline', leg)
      voxel(a, side * .19, .53, 0, .085, .25, .16, coat, arm)
      voxel(a, side * .19, .365, .015, .08, .09, .12, skin, arm)
    }
    if (route.bag) {
      voxel(a, -.25, .39, -.005, .15, .22, .15, 'hair', 'leftArm')
      voxel(a, -.245, .58, .012, .035, .20, .045, 'gold', 'leftArm')
    }
  })

  for (const batch of batches) {
    const mesh = new THREE.InstancedMesh(geometry, batch.material, batch.items.length)
    mesh.name = batch.material.name
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.castShadow = false
    mesh.receiveShadow = true
    // Fixed bounds cover every route: they never have to be recomputed as traffic moves.
    mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-28, -.12, 4.9), new THREE.Vector3(28, 1.1, 8))
    mesh.boundingSphere = mesh.boundingBox.getBoundingSphere(new THREE.Sphere())
    group.add(mesh)
    batch.mesh = mesh
  }

  function setTheme(theme) {
    const day = theme === 'day'
    const batch = batches[0]
    batch.items.forEach((item, index) => batch.mesh.setColorAt(index, ink.set(palette[item.color][day ? 1 : 0])))
    batch.mesh.instanceColor.needsUpdate = true
    lampMaterial.emissiveIntensity = day ? .08 : 1.25
    tailMaterial.emissiveIntensity = day ? .05 : .35
  }
  function update(elapsed) {
    if (disposed) return false
    const tick = Math.floor(seconds(elapsed) * 30)
    if (tick === lastTick) return false
    lastTick = tick
    const time = tick / 30
    for (const a of actors) {
      if (a.kind === 'car') {
        vehicleState(time, a.index, a.state)
        quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a.state.direction > 0 ? 0 : Math.PI)
        a.world.compose(position.set(a.state.x, -.12, a.state.z), quaternion, scale.set(1, 1, 1))
        a.parts.body.copy(a.world)
      } else {
        pedestrianState(time, a.index, a.state)
        a.world.makeTranslation(a.state.x, .055, a.state.z)
        a.parts.body.copy(a.world)
        const step = a.state.step, swing = step * .035 * a.state.direction
        for (const [key, direction] of WALKING_PARTS) {
          const lift = key.endsWith('Leg') ? Math.max(0, step * direction) * .03 : 0
          partOffset.makeTranslation(swing * direction, lift, key.endsWith('Arm') ? step * direction * .025 : 0)
          a.parts[key].multiplyMatrices(a.world, partOffset)
        }
      }
    }
    for (const batch of batches) {
      for(let index=0;index<batch.items.length;index++){
        const item=batch.items[index]
        matrix.multiplyMatrices(item.actor.parts[item.part], item.local)
        batch.mesh.setMatrixAt(index, matrix)
      }
      batch.mesh.instanceMatrix.needsUpdate = true
    }
    return true
  }
  setTheme('night')
  update(0)
  return {
    group, update, setTheme,
    stats: Object.freeze({ vehicles: cars.length, pedestrians: walkers.length, batches: batches.length,
      instances: batches.reduce((sum, batch) => sum + batch.items.length, 0), updateHz: 30, lights: 0 }),
    dispose() {
      if (disposed) return
      disposed = true
      group.removeFromParent()
      for (const batch of batches) { batch.mesh.dispose(); batch.material.dispose() }
      geometry.dispose()
    },
  }
}
