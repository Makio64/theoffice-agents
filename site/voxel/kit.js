/**
 * The voxel construction kit every part of the office builds with: unit boxes batched per parent and material into
 * instanced meshes (one draw per batch), shared materials keyed by color, and the small props of the original office
 * (pixel glyphs, plants, plaques, sprites extruded from the pixel art). Views call `box()` then `flush()`; a group they
 * rebuild is emptied with `releaseGroup()`, which frees its instance buffers.
 */
import { K } from '../../plugin/lib/svg-kit.mjs'

// Pixel glyphs on plaques use the same tiny grid as the original neon and SVG UI.
export const GLYPHS = {A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'101111111111101',O:'010101101101010',P:'110101110100100',Q:'010101101111011',R:'110101110101101',S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',Z:'111001010100111',0:'111101101101111',1:'010110010010111',2:'111001111100111',3:'111001111001111',4:'101101111001001',5:'111100111001111',6:'111100111101111',7:'111001010010010',8:'111101111101111',9:'111101111001111','-':'000000111000000','.':'000000000000010',':':'000010000010000','/':'001001010100100','+':'000010111010000','?':'111001010000010','!':'010010010000010','%':'101001010100101','<':'001010100010001','>':'100010001010100','*':'000101010101000'}

/** The night paint's day colors: the walls and floors of the original office by day (scene setTheme). */
export const DAY_PALETTE = {'#17251a':'#475b4a','#121f14':'#394a3c','#2a422f':'#6a806d','#243928':'#566b5a','#4b3534':'#8f6440','#6e4d3f':'#b98a58','#593e35':'#9e7047','#76644b':'#d8d2c4','#6f624e':'#b5ae9e','#917956':'#c9c2b2','#dcab72':'#efc488'}

export function createKit({ THREE, renderer }) {
  const unit = new THREE.BoxGeometry(1, 1, 1)
  const materials = new Map(), actorMaterials = new Map(), disposables = new Set([unit])
  const batches = new Map(), instanceMeshes = new Set(), staticBundles = new WeakMap()
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), euler = new THREE.Euler()
  let night = true
  const dayPalette = { ...DAY_PALETTE }

  function mat(color, glow = 0) {
    if (color?.isMaterial) return color
    const key = `${color}:${glow}`
    if (!materials.has(key)) {
      const original = String(color)
      const m = new THREE.MeshStandardMaterial({ color: !night && dayPalette[original] ? dayPalette[original] : original, roughness: 1, metalness: 0, ...(glow ? { emissive: original, emissiveIntensity: glow } : {}) })
      materials.set(key, m); disposables.add(m)
    }
    return materials.get(key)
  }
  /** A material for the cast's pixels: faintly self-lit at night so a character never sinks into the dark. */
  function actorInk(color) {
    if (!actorMaterials.has(color)) {
      const ink = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: night ? .16 : .025, roughness: 1 })
      actorMaterials.set(color, ink); disposables.add(ink)
    }
    return actorMaterials.get(color)
  }
  function box(parent, x, y, z, w, h, d, color, { glow = 0, rotate = 0, yaw = 0, dynamic = false, castShadow = true, receiveShadow = true } = {}) {
    const material = mat(color, glow)
    if (dynamic) {
      const mesh = new THREE.Mesh(unit, material)
      mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.rotation.set(0, yaw, rotate)
      mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow
      parent.add(mesh); return mesh
    }
    const key = `${parent.uuid}:${material.uuid}:${castShadow}:${receiveShadow}`
    if (!batches.has(key)) batches.set(key, { parent, material, castShadow, receiveShadow, items: [] })
    quaternion.setFromEuler(euler.set(0, yaw, rotate))
    matrix.compose(position.set(x, y, z), quaternion, scale.set(w, h, d))
    batches.get(key).items.push(matrix.clone())
  }
  function bundled(parent) {
    for (let ancestor = parent; ancestor; ancestor = ancestor.parent) if (ancestor.userData.renderBundleActor) return true
    return false
  }
  function flush() {
    // Keep architectural and transparent draw ordering intact, including touching voxel shadow edges.
    const transparentParents = new Set([...batches.values()].filter(batch => batch.material.transparent).map(batch => batch.parent))
    for (const { parent, material, castShadow, receiveShadow, items } of batches.values()) {
      const mesh = new THREE.InstancedMesh(unit, material, items.length)
      items.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.instanceMatrix.needsUpdate = true
      mesh.castShadow = castShadow && !material.isMeshBasicMaterial; mesh.receiveShadow = receiveShadow && !material.isMeshBasicMaterial
      mesh.computeBoundingSphere?.()
      // WebGPU can reuse static draw commands while the original parents still animate their transforms.
      // Lights, colliders and transparent glows remain outside these renderable-only bundles.
      if (renderer.backend?.isWebGPUBackend && bundled(parent) && !material.transparent && !transparentParents.has(parent)) {
        let bundle = staticBundles.get(parent)
        if (!bundle || bundle.parent !== parent) {
          bundle = new THREE.BundleGroup()
          // keep the recorded draws, but let its objects move: a static bundle (three's default) never refreshes their
          // transforms, so a pose, a hop or a floor pulled apart would stay where it was recorded
          bundle.static = false
          staticBundles.set(parent, bundle); parent.add(bundle)
        }
        // Record every mesh so a later camera move cannot retain an initially culled render list.
        mesh.frustumCulled = false; bundle.add(mesh); bundle.needsUpdate = true
      } else parent.add(mesh)
      instanceMeshes.add(mesh)
    }
    batches.clear()
  }
  /** Empty a group, freeing its instance buffers and anything `extra` releases (labels). */
  function releaseGroup(group, extra) {
    group.traverse(obj => { if (obj.isInstancedMesh) { obj.dispose(); instanceMeshes.delete(obj) } })
    extra?.(group)
    for (const [key, batch] of batches) if (batch.parent === group || isInside(batch.parent, group)) batches.delete(key)
    group.clear()
  }
  const isInside = (child, group) => { for (let p = child; p; p = p.parent) if (p === group) return true; return false }
  function beam(parent, x1, y1, x2, y2, z, width, color, options = {}) {
    const dx = x2 - x1, dy = y2 - y1
    box(parent, (x1 + x2) / 2, (y1 + y2) / 2, z, width, Math.hypot(dx, dy), width, color, { ...options, rotate: -Math.atan2(dx, dy) })
  }
  function pixels(parent, value, x, y, z, pixel, color, depth = .035) {
    const txt = String(value).toUpperCase(), width = (txt.length * 4 - 1) * pixel
    ;[...txt].forEach((ch, i) => { const g = GLYPHS[ch]; if (!g) return; for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) if (g[row * 3 + col] === '1') box(parent, x - width / 2 + (i * 4 + col + .5) * pixel, y + (2 - row) * pixel, z, pixel * .95, pixel * .95, depth, color) })
  }
  function plant(parent, x, y, z, s = 1) {
    box(parent, x, y + .2 * s, z, .40 * s, .40 * s, .40 * s, '#895c3b'); box(parent, x, y + .42 * s, z, .46 * s, .08 * s, .46 * s, '#b68a55'); box(parent, x, y + .70 * s, z, .07 * s, .6 * s, .07 * s, '#6b5032')
    ;[[0, .98, 0, .42, .45, .40], [-.23, .80, .04, .34, .25, .28], [.23, .87, -.03, .31, .32, .29], [.01, 1.25, 0, .27, .24, .25]].forEach(([a, b, c, w, h, d], i) => box(parent, x + a * s, y + b * s, z + c * s, w * s, h * s, d * s, ['#4f7f34', '#9ab86a', '#3a5f28', '#6f9149'][i]))
  }
  /** Pixel-art rows extruded: one box per pixel, `legend` char → color (a material or a hex). */
  function sprite(parent, rows, legend, x, y, z, pixel = .07, depth = .32, { dynamic = false, castShadow = true, receiveShadow = true } = {}) {
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const color = legend[row[i]]; if (color) box(parent, x + (i - (row.length - 1) / 2) * pixel, y + (rows.length - 1 - j) * pixel, z, pixel, pixel, depth, color, { dynamic, castShadow, receiveShadow }) } })
  }
  function setTheme(value) {
    night = value !== 'day'
    materials.forEach((m, k) => { const original = k.split(':')[0]; if (dayPalette[original]) m.color.set(night ? original : dayPalette[original]) })
    actorMaterials.forEach(m => { m.emissiveIntensity = night ? .16 : .025 })
  }
  return {
    unit, materials, actorMaterials, disposables, instanceMeshes, dayPalette, mat, actorInk, box, flush, releaseGroup, beam, pixels, plant, sprite, setTheme,
    get night() { return night },
    stone: '#aa9172', stoneHi: '#c6b18e', steel: '#5d6168', darkSteel: '#34353d', K,
    dispose() { for (const mesh of instanceMeshes) mesh.dispose(); instanceMeshes.clear(); for (const obj of disposables) obj.dispose() },
  }
}
