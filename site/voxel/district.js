/** The same pixel city, around the Office rather than competing with it.
 * All boxes are submitted to the scene's shared instance batches. No update loop,
 * additional shadow maps, textures or point lights are required by the district.
 */
export function createDistrict({ THREE, parent, box, pixels }) {
  const group = new THREE.Group()
  group.name = 'The Office neighborhood'
  parent.add(group)
  const street = new THREE.Group(), neighbors = new THREE.Group(), skyline = new THREE.Group()
  group.add(skyline, neighbors, street)

  const definitions = {
    brick: ['#423c3c', '#886e65'], brickWarm: ['#4d3e35', '#a1846c'], brickCool: ['#303b46', '#758698'],
    mortar: ['#2d3035', '#5b6572'], stone: ['#6a6256', '#b4aa95'], stoneD: ['#484747', '#878d91'],
    iron: ['#29313a', '#555f6b'], dark: ['#151e2b', '#344657'], roof: ['#29303b', '#667588'],
    glass: ['#14243a', '#7199af'], lit: ['#b69a63', '#9eb6bd', .16], warm: ['#89764e', '#91a6b0', .10],
    walk: ['#514e4a', '#8e918f'], walkD: ['#3d4147', '#777f87'], asphalt: ['#242a34', '#53616e'],
    lane: ['#77776c', '#bdc1b6'], soil: ['#23252e', '#5c606b'], bark: ['#51483c', '#776955'],
    green: ['#354b42', '#63856b'], greenHi: ['#4c6451', '#86a17c'], red: ['#74594e', '#a37866'],
    teal: ['#3f6767', '#77a9a4'], paper: ['#a39b7f', '#e0d8bd'], amber: ['#b39b64', '#cdb98a', .14],
  }
  const materials = Object.fromEntries(Object.entries(definitions).map(([key, [night, , glow = 0]]) => {
    const material = new THREE.MeshStandardMaterial({ color: night, roughness: 1, metalness: 0,
      emissive: glow ? night : '#000000', emissiveIntensity: glow })
    material.name = `District ${key}`
    return [key, material]
  }))
  let boxes = 0
  const b = (target, x, y, z, w, h, d, key, options = {}) => {
    boxes++
    box(target, x, y, z, w, h, d, materials[key] || key, { castShadow: false, receiveShadow: true, ...options })
  }
  const beam = (target, x1, y1, x2, y2, z, width, key) => {
    const dx = x2 - x1, dy = y2 - y1
    b(target, (x1 + x2) / 2, (y1 + y2) / 2, z, width, Math.hypot(dx, dy), width, key, { rotate: -Math.atan2(dx, dy) })
  }
  const text = (value, x, y, z, pixel = .075, color = 'paper') => {
    if (pixels) pixels(neighbors, value, x, y, z, pixel, materials[color], .025)
  }

  function window(x, y, z, w, h, lit, style = 0) {
    b(neighbors, x, y, z, w + .22, h + .20, .15, 'stoneD')
    b(neighbors, x, y, z + .095, w, h, .055, lit ? (style % 3 ? 'warm' : 'lit') : 'glass')
    b(neighbors, x, y, z + .14, .065, h + .02, .065, 'mortar')
    b(neighbors, x, y + .15, z + .14, w + .03, .065, .065, 'mortar')
    b(neighbors, x, y - h / 2 - .11, z + .13, w + .38, .12, .30, 'stone')
    b(neighbors, x, y + h / 2 + .16, z + .06, w + .30, .12, .20, 'stoneD')
    if (lit && style % 2 === 0) {
      b(neighbors, x - w * .25, y, z + .15, w * .15, h * .87, .02, 'paper')
      b(neighbors, x + w * .28, y, z + .15, w * .14, h * .87, .02, 'paper')
    }
  }

  function awning(x, y, z, width, key) {
    b(neighbors, x, y, z, width, .16, 1.12, key)
    b(neighbors, x, y - .18, z + .48, width, .30, .13, key)
    for (let i = 0; i < Math.floor(width / .42); i++) {
      const xx = x - width / 2 + .22 + i * .42
      b(neighbors, xx, y + .09, z, .15, .025, 1.10, 'stone')
      b(neighbors, xx, y - .18, z + .56, .15, .28, .02, 'stone')
    }
  }

  function shop(x, width, front, sign, accent, index) {
    b(neighbors, x, 1.60, front + .05, width - .65, 2.9, .20, 'iron')
    for (const dx of [-.26, .26]) {
      b(neighbors, x + dx * width, 1.58, front + .19, width * .38, 2.40, .10, index % 2 ? 'glass' : 'warm')
      b(neighbors, x + dx * width, .38, front + .27, width * .38, .36, .09, 'dark')
    }
    b(neighbors, x, 1.54, front + .22, .16, 2.72, .17, 'stoneD')
    b(neighbors, x + .11, 1.42, front + .34, .035, .36, .045, 'amber')
    b(neighbors, x, 3.17, front + .27, width - .55, .46, .16, 'iron')
    text(sign, x, 3.19, front + .37, .075)
    awning(x, 2.85, front + .80, width - .48, accent)
    for (let n = 0; n < 4; n++) {
      const xx = x - width * .28 + n * width * .19
      b(neighbors, xx, .83, front + .28, .32, .35 + (n % 2) * .15, .04, n % 2 ? 'paper' : accent)
    }
  }

  function fireEscape(x, width, front, levels, start = 4.5) {
    const z = front + .48
    for (let f = 0; f < levels; f++) {
      const y = start + f * 3.15
      b(neighbors, x, y, z, width, .10, .78, 'iron')
      b(neighbors, x, y + .62, z + .35, width, .055, .055, 'iron')
      for (let col = 0; col < 7; col++) {
        const xx = x - width / 2 + col * width / 6
        b(neighbors, xx, y + .32, z + .35, .035, .62, .035, 'iron')
      }
      if (f < levels - 1) {
        const dir = f % 2 ? -1 : 1
        for (const dz of [-.20, .20]) beam(neighbors, x - dir * width * .43, y + .1, x + dir * width * .43, y + 3.08, z + dz, .055, 'iron')
        for (let step = 0; step < 11; step++) b(neighbors, x - dir * width * .43 + dir * width * .086 * step,
          y + .17 + step * .283, z, width * .11, .055, .47, 'iron')
      }
    }
  }

  function building({ x, front, width, height, key, floors, sign, accent, escape = false, index = 0 }) {
    const depth = 5.2, centerZ = front - depth / 2
    b(neighbors, x, height / 2, centerZ, width, height, depth, key)
    // A restrained, coarse brick grid is legible at the edge of the composition.
    for (let row = 0; row < Math.floor(height / .46); row++) {
      const y = .23 + row * .46
      b(neighbors, x, y, front + .012, width - .03, .025, .025, 'mortar')
      for (let col = 0; col < Math.floor(width / .88); col++) {
        const xx = x - width / 2 + .38 + col * .88 + (row % 2) * .44
        if (xx < x + width / 2 - .08) b(neighbors, xx, y + .23, front + .012, .027, .43, .025, 'mortar')
      }
    }
    for (const side of [-1, 1]) b(neighbors, x + side * (width / 2 - .16), height / 2, front + .09, .30, height, .23, 'stoneD')
    b(neighbors, x, .11, front + .15, width + .20, .22, .38, 'stoneD')
    shop(x, width, front, sign, accent, index)
    const columns = width > 6.1 ? 3 : 2
    for (let f = 0; f < floors; f++) {
      const yy = 4.65 + f * 3.15
      for (let col = 0; col < columns; col++) {
        const xx = x + (col - (columns - 1) / 2) * (width / (columns + .5))
        window(xx, yy, front + .04, columns === 3 ? 1.05 : 1.20, 1.90, (f * 7 + col * 3 + index) % 4 !== 0, f + col + index)
      }
      b(neighbors, x, yy + 1.45, front + .04, width + .20, .13, .28, 'stoneD')
    }
    b(neighbors, x, height + .04, centerZ, width + .36, .20, depth + .30, 'stoneD')
    b(neighbors, x, height + .31, front - .08, width + .17, .38, .28, key)
    b(neighbors, x, height + .57, front - .06, width + .48, .16, .43, 'stone')
    for (let n = 0; n < Math.floor(width / .43); n++) b(neighbors, x - width / 2 + .22 + n * .43,
      height - .20, front + .11, .16, .30, .22, 'stone')
    // Chimneys, stepped roof ventilation and a square water tank echo the Office roof.
    b(neighbors, x - width * .28, height + .66, front - 3.9, .65, 1.20, .71, key)
    b(neighbors, x - width * .28, height + 1.30, front - 3.9, .82, .11, .86, 'stoneD')
    b(neighbors, x + width * .24, height + .43, front - 2.4, 1.15, .70, 1.0, 'iron')
    for (let n = 0; n < 5; n++) b(neighbors, x + width * .24 - .43 + n * .21, height + .44, front - 1.86, .08, .44, .03, 'stoneD')
    if (escape) fireEscape(x + width * .23, 1.62, front, Math.min(floors, 4), 3.47)
    else {
      for (let f = 1; f < Math.min(floors, 4); f += 2) {
        const yy = 3.62 + f * 3.15
        b(neighbors, x, yy, front + .36, width * .69, .11, .65, 'stoneD')
        b(neighbors, x, yy + .59, front + .65, width * .69, .05, .05, 'iron')
        for (let n = 0; n < 9; n++) b(neighbors, x - width * .34 + n * width * .085, yy + .29, front + .65, .035, .59, .035, 'iron')
      }
    }
  }

  building({ x: -13.75, front: .15, width: 5.85, height: 17.35, floors: 4, key: 'brickWarm', sign: 'BOOKS', accent: 'red', escape: false, index: 1 })
  building({ x: 13.85, front: -.30, width: 6.00, height: 20.40, floors: 5, key: 'brickCool', sign: 'CAFE', accent: 'teal', escape: true, index: 2 })
  building({ x: -20.30, front: -3.20, width: 6.40, height: 22.00, floors: 5, key: 'brick', sign: 'STUDIO', accent: 'teal', escape: true, index: 3 })
  building({ x: 20.85, front: -4.10, width: 6.70, height: 16.55, floors: 4, key: 'brickWarm', sign: 'MARKET', accent: 'red', escape: false, index: 4 })

  // Skyline layers use large shapes and sparse lights; their contrast belongs below the office.
  for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 9; i++) {
    const x = side * (22.5 + i * 3.45), h = 11.5 + ((i * 7 + (side > 0 ? 3 : 0)) % 13)
    const z = -14.5 - (i % 3) * 5.0, width = 2.7 + (i % 3) * .5
    b(skyline, x, h / 2 - .4, z, width, h, 3.2, i % 2 ? 'roof' : 'dark')
    b(skyline, x, h - .26, z, width + .18, .21, 3.45, 'iron')
    if (i % 3 === 0) b(skyline, x - .25, h + .43, z, .10, 1.25, .10, 'iron')
    for (let row = 0; row < Math.floor(h / 1.5); row++) for (let col = 0; col < 3; col++) if ((row * 7 + col * 11 + i * 3) % 5 === 0) {
      b(skyline, x + (col - 1) * width * .24, 1.7 + row * 1.36, z + 1.64, .22, .36, .025, 'warm')
    }
  }

  function bench(x, z, flip = 1) {
    b(street, x, .49, z, 1.75, .12, .48, 'bark')
    for (let row = 0; row < 3; row++) b(street, x, .72 + row * .14, z - flip * .20, 1.75, .10, .08, 'bark')
    for (const dx of [-.63, .63]) {
      b(street, x + dx, .25, z, .09, .48, .36, 'iron')
      b(street, x + dx, .64, z - flip * .23, .09, .72, .09, 'iron')
    }
  }
  function tree(x, z, size = 1) {
    b(street, x, .055, z, 1.34, .07, 1.12, 'walkD')
    b(street, x, .11, z, 1.08, .07, .88, 'soil')
    b(street, x, 1.65 * size, z, .22 * size, 3.2 * size, .22 * size, 'bark')
    beam(street, x, 2.1 * size, x - .58 * size, 2.9 * size, z, .15 * size, 'bark')
    beam(street, x, 2.2 * size, x + .54 * size, 3.1 * size, z, .14 * size, 'bark')
    const crowns = [[0, 3.2, 0, 1.8, 1.65, 1.52], [-.72, 3.30, .03, 1.10, 1.13, 1.22], [.66, 3.55, .05, 1.23, 1.22, 1.1], [.10, 4.22, -.04, 1.40, .70, 1.10]]
    crowns.forEach(([dx, y, dz, w, h, d], i) => b(street, x + dx * size, y * size, z + dz * size, w * size, h * size, d * size, i % 2 ? 'greenHi' : 'green'))
  }
  function car(x, z, key, direction = 1) {
    const draw=(xx,yy,zz,w,h,d,ink)=>b(street,xx,yy+.035,zz,w,h,d,ink)
    draw(x, .32, z, 2.70, .40, 1.10, key)
    draw( x - .10 * direction, .70, z, 1.43, .48, .96, key)
    draw( x - .10 * direction, .74, z + .50, 1.18, .27, .025, 'glass')
    draw( x - .10 * direction, .75, z + .53, .07, .35, .035, 'iron')
    draw( x + 1.0 * direction, .51, z, .57, .08, 1.03, key)
    for (const dx of [-.85, .85]) for (const dz of [-.55, .55]) {
      draw( x + dx, .21, z + dz, .42, .35, .15, 'dark')
      draw( x + dx, .21, z + dz * 1.14, .17, .16, .03, 'stoneD')
    }
    for (const dz of [-.34, .34]) {
      draw( x + 1.36 * direction, .39, z + dz, .035, .17, .24, 'amber')
      draw( x - 1.36 * direction, .38, z + dz, .035, .15, .23, 'red')
    }
    draw( x + 1.39 * direction, .18, z, .065, .08, .90, 'stoneD')
  }
  function bicycle(x, z) {
    // Square-loop wheels keep the silhouette on the same voxel grid as the cast.
    for (const cx of [x - .56, x + .56]) {
      for (const [dx, dy, w, h] of [[0, .29, .42, .065], [0, -.29, .42, .065], [-.25, 0, .065, .52], [.25, 0, .065, .52]]) {
        b(street, cx + dx, .42 + dy, z, w, h, .10, 'iron')
      }
      b(street, cx, .42, z + .01, .09, .09, .13, 'stoneD')
    }
    beam(street, x - .56, .42, x - .20, .99, z, .055, 'teal')
    beam(street, x - .56, .42, x + .20, .42, z, .055, 'teal')
    beam(street, x - .20, .99, x + .20, .42, z, .055, 'teal')
    beam(street, x - .20, .99, x + .40, .99, z, .055, 'teal')
    beam(street, x + .40, .99, x + .20, .42, z, .055, 'teal')
    beam(street, x + .40, .99, x + .56, .42, z, .055, 'iron')
    b(street, x - .20, 1.09, z, .34, .065, .17, 'dark')
    b(street, x + .39, 1.17, z, .07, .33, .065, 'iron')
    b(street, x + .45, 1.31, z, .22, .05, .065, 'iron')
  }
  function streetLamp(x, z) {
    b(street, x, 2.0, z, .10, 3.95, .10, 'iron')
    b(street, x, .13, z, .35, .24, .35, 'iron')
    b(street, x, 4.02, z, .53, .13, .41, 'iron')
    b(street, x, 3.78, z, .31, .34, .27, 'amber')
    b(street, x, 3.52, z, .43, .10, .36, 'iron')
    // Baked stepped light on the paving avoids a row of expensive point lights.
    b(street, x, .061, z + .12, 1.25, .008, 1.25, 'warm', { receiveShadow: false })
  }

  for (const side of [-1, 1]) {
    const x = side * 18.90
    // The center Office/platform is untouched. Side wings meet it at a separate edge.
    b(street, x, -1.55, .10, 16.20, 2.70, 11.20, 'soil')
    b(street, x, -.10, .40, 16.20, .20, 11.50, 'walkD')
    b(street, x, -.02, 5.95, 16.20, .25, .28, 'stoneD')
    b(street, x, -.18, 7.05, 16.20, .12, 1.95, 'asphalt')
    b(street, x, -2.91, .10, 16.20, .15, 11.4, 'dark')
    for (let col = 0; col < 20; col++) for (let row = 0; row < 14; row++) {
      const xx = side * (11.20 + col * .80), zz = -4.80 + row * .80
      b(street, xx, .035, zz, .77, .040, .77, (col + row) % 4 ? 'walk' : 'walkD')
    }
    for (let i = 0; i < 11; i++) b(street, side * (11.25 + i * 1.5), -.10, 7.42, .75, .02, .08, 'lane')
    // Outer pedestrian crossing and a rain grate, away from the office entrance.
    for (let i = 0; i < 5; i++) b(street, side * (23.25 + i * .45), -.106, 7.05, .27, .018, 1.58, 'lane')
    b(street, side * 11.53, .064, 5.47, .73, .018, .28, 'iron')
    for (let i = 0; i < 6; i++) b(street, side * (11.24 + i * .115), .078, 5.47, .040, .01, .24, 'dark')
    tree(side * 11.95, 3.52, .94)
    tree(side * 23.15, 3.52, 1.12)
    bench(side * 16.5, 4.65)
    streetLamp(side * 18.85, 5.32)
    streetLamp(side * 25.6, 5.32)
    bicycle(side * 11.85, 4.90)
    car(side * 18.9, 3.8, side < 0 ? 'teal' : 'red', side)
    car(side * 25.4, 3.8, 'stoneD', -side)
    // A compact newspaper box, bins, a hydrant and posted notices.
    b(street, side * 18.1, .64, 4.72, .54, 1.16, .51, 'red')
    b(street, side * 18.1, .94, 5.00, .39, .44, .035, 'glass')
    b(street, side * 18.1, .93, 5.03, .26, .31, .025, 'paper')
    b(street, side * 18.1, 1.26, 4.72, .64, .10, .61, 'iron')
    b(street, side * 20.0, .44, 4.71, .52, .80, .50, 'iron')
    b(street, side * 20.0, .88, 4.71, .59, .08, .57, 'stoneD')
    b(street, side * 12.15, .36, 5.39, .23, .65, .23, 'red')
    b(street, side * 12.15, .69, 5.39, .34, .12, .33, 'red')
    b(street, side * 12.15, .45, 5.39, .54, .15, .18, 'red')
    b(street, side * 17.4, 1.18, 4.14, .08, 2.30, .08, 'iron')
    b(street, side * 17.4, 2.13, 4.14, .77, .62, .10, 'teal')
    b(street, side * 17.4, 2.13, 4.21, .44, .09, .025, 'paper')
  }

  // The near left crossing frames the entrance; the road stays clear for traffic.
  for(let i=0;i<5;i++)b(street,-12.0-i*.43,-.106,7.05,.25,.018,1.58,'lane')

  function setTheme(theme) {
    const night = theme === 'night'
    for (const [key, [dark, light, glow = 0]] of Object.entries(definitions)) {
      const material = materials[key]
      material.color.set(night ? dark : light)
      material.emissive.set(night && glow ? dark : '#000000')
      material.emissiveIntensity = night ? glow : 0
    }
  }
  setTheme('night')
  return { group, materials: Object.values(materials), setTheme,
    stats: { boxes, neighbors: 4, skylineBuildings: 18, lights: 0, animatedObjects: 0 } }
}
