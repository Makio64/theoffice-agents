import { MathUtils, Vector3 } from 'three/webgpu'

/** Fit world-space corners with their actual perspective depth, including the nearest roof and pavement edges. */
export function framePerspective(camera, boxes, target, direction, padding = 1.04) {
  const center = target.clone()
  const forward = direction.clone().normalize()
  const right = new Vector3().crossVectors(camera.up, forward).normalize()
  const up = new Vector3().crossVectors(forward, right).normalize()
  const corners = []
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const box of boxes) {
    if (box.isEmpty()) continue
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const relative = new Vector3(x, y, z).sub(center)
      const corner = { x: relative.dot(right), y: relative.dot(up), z: relative.dot(forward) }
      corners.push(corner)
      minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x)
      minY = Math.min(minY, corner.y); maxY = Math.max(maxY, corner.y)
    }
  }
  if (!corners.length) return { target: center, position: center.clone().addScaledVector(forward, 10) }
  const shiftX = (minX + maxX) / 2, shiftY = (minY + maxY) / 2
  center.addScaledVector(right, shiftX).addScaledVector(up, shiftY)
  const tanVertical = Math.tan(MathUtils.degToRad(camera.getEffectiveFOV()) / 2)
  const tanHorizontal = tanVertical * camera.aspect
  let distance = camera.near * 2
  for (const corner of corners) {
    distance = Math.max(distance,
      corner.z + Math.abs(corner.x - shiftX) * padding / tanHorizontal,
      corner.z + Math.abs(corner.y - shiftY) * padding / tanVertical,
      corner.z + camera.near * 2)
  }
  return { target: center, position: center.clone().addScaledVector(forward, distance) }
}
