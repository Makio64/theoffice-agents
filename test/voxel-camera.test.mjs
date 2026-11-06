import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Box3, PerspectiveCamera, Vector3 } from 'three/webgpu'
import { framePerspective } from '../site/voxel/camera-framing.js'

const box = (min, max) => new Box3(new Vector3(...min), new Vector3(...max))
const parts = [box([-10.8, -3, -5.7], [10.8, .1, 8]), box([-8.5, 0, -3.4], [8.5, 19.19, 4.5]), box([-8.7, 18.7, -3.5], [8.7, 23.0, 3.6])]
const directions = [[16,8.5,30], [0,1.5,42], [25,20,31], [18,31,20], [14,1.4,38]]

function assertFits(camera, boxes, direction) {
  const bounds = boxes.reduce((total, part) => total.union(part), new Box3())
  const target = bounds.getCenter(new Vector3())
  const originalTarget = target.clone()
  const framing = framePerspective(camera, boxes, target, new Vector3(...direction))
  assert.ok(target.equals(originalTarget), 'fitting must not move its input target')
  camera.position.copy(framing.position)
  camera.lookAt(framing.target)
  camera.updateMatrixWorld(true)
  for (const part of boxes) for (const x of [part.min.x, part.max.x]) for (const y of [part.min.y, part.max.y]) for (const z of [part.min.z, part.max.z]) {
    const projected = new Vector3(x,y,z).project(camera)
    assert.ok(Math.abs(projected.x) <= 1 / 1.04 + 1e-7, `horizontal crop: ${projected.x}`)
    assert.ok(Math.abs(projected.y) <= 1 / 1.04 + 1e-7, `vertical crop: ${projected.y}`)
    assert.ok(projected.z >= -1 && projected.z <= 1, `depth crop: ${projected.z}`)
  }
  return framing
}

test('all five perspective views fit the roof, pavement and front edges on portrait and desktop screens', () => {
  for (const aspect of [320/700,390/610, 822/510, 1280/570]) for (const direction of directions) {
    assertFits(new PerspectiveCamera(45,aspect,.1,250), parts, direction)
  }
})

test('perspective fitting includes the expanded roof and separated upper floor', () => {
  const expanded = [parts[0], parts[1], parts[2].clone().translate(new Vector3(0,7.25,0)), ...Array.from({length:4},(_,i)=>{const y=3.8+i*3.8+(i+1)*1.45;return box([-8.5,y-.45,-3.4],[8.5,y+3.58,3.7])})]
  for (const aspect of [390/610,822/510]) for (const direction of directions) {
    assertFits(new PerspectiveCamera(45,aspect,.1,250), expanded, direction)
  }
})

test('desk close-ups keep the selected floor destination in frame', () => {
  const selectedDesk = box([-6,21.4,-1],[-1,24.3,2.5])
  for (const aspect of [390/610,822/510]) assertFits(new PerspectiveCamera(45,aspect,.1,250),[selectedDesk],[3,1.4,12])
})

 test('top project room and lobby close-ups fit independently of the full five-storey tower',()=>{
  const rooms=[box([-8.4,14.7,-3.4],[-.13,18.9,3.72]),box([-8.5,-.18,-3.4],[8.5,3.9,4.48])]
  for(const room of rooms)for(const aspect of [320/700,822/510])assertFits(new PerspectiveCamera(45,aspect,.1,250),[room],[5,2,19])
})
