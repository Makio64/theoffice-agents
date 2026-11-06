/** Small, warm street details on the Office's pixel grid. No extra lights or RAF. */
export function createStreetDetails({ THREE, parent, box }) {
  const group = new THREE.Group()
  group.name = 'Street details'
  parent.add(group)
  const pools = new THREE.Group()
  pools.name = 'Baked lamp pools'
  group.add(pools)

  const palette = {
    wood: ['#8a6744', '#b58a5f'],
    dark: ['#293133', '#46534f'],
    leaf: ['#6d8b56', '#82a66d'],
    petal: ['#d58d75', '#e5a38b'],
    paper: ['#d4c7a0', '#eee0bd'],
    brass: ['#b79b59', '#c4aa71'],
  }
  const ink = Object.fromEntries(Object.entries(palette).map(([name, [night]]) => {
    const material = new THREE.MeshStandardMaterial({ color: night, roughness: 1, metalness: 0 })
    material.name = `Street detail ${name}`
    return [name, material]
  }))
  const poolOuter = new THREE.MeshBasicMaterial({ color: '#edbd75', transparent: true, opacity: .035, depthWrite: false })
  const poolInner = new THREE.MeshBasicMaterial({ color: '#f3ce8b', transparent: true, opacity: .075, depthWrite: false })
  poolOuter.name = 'Street lamp outer pool'
  poolInner.name = 'Street lamp inner pool'
  let boxes = 0
  const b = (x, y, z, w, h, d, color, target = group) => {
    boxes++
    box(target, x, y, z, w, h, d, ink[color] || color, {
      castShadow: false, receiveShadow: target !== pools,
    })
  }

  function flowerBox(x, z, pale = false) {
    b(x, .205, z, 1.28, .30, .44, 'wood')
    b(x, .365, z, 1.36, .065, .49, 'brass')
    b(x, .403, z, 1.13, .025, .32, 'dark')
    for (let i = 0; i < 3; i++) {
      const xx = x + (i - 1) * .36, y = .66 + (i % 2) * .08
      b(xx, (y + .42) / 2, z, .035, y - .42, .035, 'leaf')
      b(xx + (i % 2 ? -.06 : .06), y - .11, z, .14, .045, .065, 'leaf')
      const color = (i === 1) === pale ? 'paper' : 'petal'
      b(xx, y, z + .035, .20, .07, .065, color)
      for (const side of [-1, 1]) b(xx, y + side * .0675, z + .035, .07, .065, .065, color)
      b(xx, y, z + .077, .065, .065, .025, 'brass')
    }
  }
  flowerBox(-6.05, 4.43)
  flowerBox(6.22, 4.40, true)

  // A little chalk menu beside the entrance, leaving the door and cat clear.
  const menuX = -2.65, menuZ = 4.37
  b(menuX, .58, menuZ, .64, .72, .09, 'wood')
  b(menuX, .59, menuZ + .06, .52, .59, .045, 'dark')
  for (const dx of [-.24, .24]) b(menuX + dx, .205, menuZ, .065, .30, .12, 'wood')
  b(menuX, .79, menuZ + .093, .34, .045, .018, 'paper')
  for (let i = 0; i < 3; i++) {
    b(menuX - .035, .67 - i * .11, menuZ + .094, [.29, .22, .33][i], .024, .018, 'paper')
    b(menuX + .19, .67 - i * .11, menuZ + .094, .035, .035, .018, 'brass')
  }

  // The neighboring bookshop has a crate of colorful spines under its awning.
  const bookX = -13.65, bookZ = 1.45
  b(bookX, .33, bookZ, 1.04, .55, .55, 'wood')
  b(bookX, .62, bookZ, 1.13, .065, .61, 'brass')
  b(bookX, .36, bookZ + .29, .83, .33, .025, 'dark')
  for (let i = 0; i < 5; i++) {
    const xx = bookX - .40 + i * .20, height = .23 + (i % 3) * .055
    const color = ['paper', 'petal', 'leaf', 'brass', 'paper'][i]
    b(xx, .66 + height / 2, bookZ, .15, height, .32, color)
    b(xx, .71, bookZ + .17, .105, .025, .02, 'dark')
  }

  // A cup and two stools belong to the café, well behind the passing pedestrians.
  const tableX = 13.8, tableZ = 1.35
  b(tableX, .10, tableZ, .44, .085, .42, 'dark')
  b(tableX, .43, tableZ, .09, .60, .09, 'dark')
  b(tableX, .77, tableZ, .93, .08, .78, 'wood')
  for (const dx of [-.20, .19]) {
    b(tableX + dx, .895, tableZ + .05, .115, .16, .115, 'paper')
    b(tableX + dx, .981, tableZ + .05, .078, .015, .078, 'dark')
  }
  for (const dx of [-.77, .77]) {
    b(tableX + dx, .49, tableZ, .35, .085, .35, 'wood')
    for (const leg of [-.11, .11]) b(tableX + dx + leg, .28, tableZ, .055, .40, .23, 'dark')
  }

  // Low posts sit behind the pedestrian lanes rather than fencing off the street.
  for (const x of [-8.47, 8.47]) {
    b(x, .105, 4.77, .24, .10, .24, 'dark')
    b(x, .36, 4.77, .10, .49, .10, 'dark')
    b(x, .625, 4.77, .15, .055, .15, 'brass')
  }
  for (const x of [-6.8, 6.8]) {
    b(x, .067, 5.66, .63, .014, .21, 'dark')
    for (let i = 0; i < 4; i++) b(x - .225 + i * .15, .080, 5.66, .045, .009, .18, 'brass')
  }

  // Non-overlapping stepped rings, lifted above the paving: no coplanar decals.
  // Only existing lamps illuminate this scene. These low-alpha shapes are static.
  for (const x of [-9.22, 9.22]) {
    const z = 4.19
    b(x, .073, z, 1.70, .006, 1.05, poolInner, pools)
    for (const sign of [-1, 1]) {
      b(x, .073, z + sign * .6375, 2.40, .006, .225, poolOuter, pools)
      b(x + sign * 1.025, .073, z, .35, .006, 1.05, poolOuter, pools)
    }
  }

  function setTheme(theme) {
    const night = theme === 'night'
    for (const [name, colors] of Object.entries(palette)) ink[name].color.set(colors[night ? 0 : 1])
    pools.visible = night
  }
  setTheme('night')
  return {
    group, materials: [...Object.values(ink), poolOuter, poolInner], setTheme,
    stats: { boxes, materials: 8, lights: 0, animatedObjects: 0 },
  }
}
