/**
 * The parts of the building every view shares: the street and the commits line under it, the street lobby (1F:
 * reception, the café that is the office's kitchen, the meeting room), the roof with its neon sign, and the brick shell
 * (side walls, quoins, floor numbers) around whatever storeys a view stacks on the lobby. Built from the kit
 * (kit.js); words go on labels (labels.js).
 */
import { K, ROLE, NEON, ROBOT, ROBOT_LEG } from '../../plugin/lib/svg-kit.mjs'

/** Where the lobby ends and the first storey starts; the storeys' outer width; the building's half width. */
export const LOBBY_TOP = 3.80
export const HALF = 8.18
export const INNER = 8.0
export const FRONT = 3.2
/** The basement (B1) under the building: from under the sidewalk down to its floor; the commits line runs under it. */
export const BASEMENT = { top: -.22, floor: -3.4 }
export const METRO_DROP = -2.75

export function createBuilding({ THREE, kit, labels }) {
  const { box, beam, pixels, plant, sprite, stone, stoneHi, steel, darkSteel } = kit
  const bulbMaterial = new THREE.MeshStandardMaterial({ color: '#fff3c0', emissive: '#ffcf2e', emissiveIntensity: 1.25, roughness: 1 })
  kit.disposables.add(bulbMaterial)
  const lights = []

  // ---------------------------------------------------------------- the street and the commits line
  /**
   * The street, the earth under it and the commits line's tunnel at its foot. Under the building the earth is dug out
   * for the basement (B1, the Live tab's departments, as the pixel office's): every other view fills it with `plug`.
   */
  function ground(parent) {
    const plug = new THREE.Group(); parent.add(plug)
    // the earth round the basement: both sides, behind it and under it
    for (const x of [-9.4, 9.4]) box(parent, x, -2.9, .1, 2.2, 5.4, 11.2, '#1b1713')
    box(parent, 0, -1.8, -4.4, 16.6, 3.2, 2.2, '#1b1713')
    box(parent, 0, -4.5, .1, 16.6, 2.2, 11.2, '#1b1713')
    box(parent, 0, -5.68, .1, 21.2, .15, 11.4, '#110f0d')
    // the basement's plug of earth, its pebbled face to the street
    box(plug, 0, -1.8, 1.1, 16.6, 3.2, 8.9, '#1b1713')
    for (let i = 0; i < 46; i++) { const x = -8 + ((i * 61) % 161) / 10, y = -.45 - ((i * 37) % 280) / 100; box(plug, x, y, 5.57, .06 + (i % 3) * .03, .06, .025, i % 2 ? '#2a241e' : '#352b20') }
    box(parent, 0, -.10, .4, 21.3, .20, 11.5, K.walk)
    for (let x = -10; x <= 10; x += .8) for (let z = -4.8; z < 5.7; z += .8) box(parent, x, .035, z, .77, .040, .77, ((Math.round(x * 10) + Math.round(z * 10)) % 3) ? K.walk : '#625a50', { castShadow: false })
    box(parent, 0, -.02, 5.95, 21.4, .25, .28, '#918373')
    box(parent, 0, -.18, 7.05, 21.5, .12, 1.95, '#1d1b19')
    for (let x = -10; x <= 10; x += 1.5) box(parent, x, -.10, 7.42, .75, .02, .08, '#8a7f5a')
    // the commits line's tunnel, under the basement as the pixel office runs it
    const T = -2.75
    box(parent, 0, -1.55 + T, 5.68, 20.7, 1.65, .17, '#0e0d0c')
    box(parent, 0, -2.41 + T, 5.86, 21, .11, .62, '#2b2622')
    box(parent, 0, -2.20 + T, 6.08, 20.8, .07, .06, '#6a625a')
    box(parent, 0, -2.20 + T, 5.66, 20.8, .07, .06, '#6a625a')
    for (let x = -10; x < 10; x += .34) box(parent, x, -2.24 + T, 5.86, .09, .06, .61, '#2f2924')
    for (let x = -9; x <= 9; x += 3) { box(parent, x, -.72 + T, 5.95, .35, .09, .12, bulbMaterial); box(parent, x, -.88 + T, 5.86, .08, .23, .1, darkSteel) }
    for (let i = 0; i < 60; i++) { const x = -10 + ((i * 61) % 201) / 10, y = -3.6 - ((i * 37) % 180) / 100; if (Math.abs(x) > 8.2 || y < -3.6) box(parent, x, y, 5.77, .06 + (i % 3) * .03, .06, .025, i % 2 ? '#2a241e' : '#352b20') }
    for (let i = 0; i < 24; i++) { const x = (i % 2 ? 1 : -1) * (8.5 + ((i * 37) % 17) / 10), y = -.5 - ((i * 53) % 280) / 100; box(parent, x, y, 5.77, .07, .06, .025, i % 3 ? '#2a241e' : '#352b20') }
    // the station's sign, a dark enamel plate with the line's name in cream
    box(parent, -6, -1.03 + T, 6.0, 3.3, .5, .1, K.plate)
    const sign = labels.label({ lines: [{ spans: [['COMMITS LINE', UNDER_CREAM, { pixel: true }]], size: .3, align: 'center' }], width: 3.1, pad: .07, bg: '#16203e' })
    sign.position.set(-6, -1.03 + T, 6.07); parent.add(sign)
    // street furniture and a sleepy cat: small familiar life at the building's feet
    const lamp = (x, z) => { box(parent, x, 1.56, z, .09, 3.05, .09, '#34353d'); box(parent, x, 3.13, z, .50, .12, .28, '#34353d'); box(parent, x, 2.91, z, .31, .34, .25, '#f6d860', { glow: 1.0 }); box(parent, x, 2.66, z, .42, .09, .35, '#34353d'); box(parent, x, .10, z, .34, .20, .34, '#34353d'); const l = new THREE.PointLight('#ffd98a', 4.0, 7, 2); l.position.set(x, 2.83, z); l.userData.nightIntensity = 4; parent.add(l); lights.push(l) }
    lamp(-9.22, 4.19); lamp(9.22, 4.19)
    plant(parent, -7.5, .03, 4.16, .66); plant(parent, 7.38, .03, 4.16, .66)
    box(parent, 4.1, .41, 4.43, 2.0, .10, .47, '#86633e'); box(parent, 4.1, .73, 4.64, 2.0, .46, .09, '#86633e'); for (const x of [3.30, 4.90]) box(parent, x, .2, 4.43, .10, .39, .42, darkSteel)
    sprite(parent, ['..cc...cc', '..ccccccc', '...cEcEcc', '.cccccccc', 'cccccccc.', 'ccccccc..'], { c: '#b68b5f', E: '#1a1b1f' }, -3.48, .08, 4.33, .05, .23)
    return { plug }
  }
  const UNDER_CREAM = '#f3ead0'

  // The Clawd locomotive and its parcel wagons, one green parcel a commit, ten to a wagon
  function metro(parent) {
    const train = new THREE.Group(); train.position.set(0, -2.08 + -2.75, 5.97); parent.add(train)
    box(train, 4.25, .39, 0, 2.22, .62, .43, '#d77757'); box(train, 4.25, .72, 0, 1.92, .07, .39, '#d77757')
    box(train, 4.25, .05, 0, 2.22, .13, .45, '#a8533a')
    for (const x of [3.42, 3.82, 4.80, 5.20]) box(train, x, -.04, 0, .18, .13, .47, '#2a2622')
    for (const x of [4.65, 5.04]) box(train, x, .47, .244, .13, .25, .025, '#141414')
    for (const x of [3.53, 3.97]) box(train, x, .47, .242, .27, .26, .03, '#ffd98a', { glow: .5 })
    box(train, 5.41, .24, .03, .11, .08, .46, '#fff3c0', { glow: 1.5 })
    const cars = [], loads = []
    for (let car = 0; car < 4; car++) {
      const wagon = new THREE.Group(), load = new THREE.Group(); train.add(wagon); wagon.add(load); cars.push(wagon); loads.push(load)
      const x = 2.0 - car * 2.16
      box(wagon, x, .13, 0, 1.91, .15, .54, '#d77757'); box(wagon, x, .02, 0, 1.91, .08, .57, '#a8533a')
      for (const dx of [-.62, .62]) box(wagon, x + dx, -.08, 0, .28, .17, .48, '#2a2622')
      box(wagon, x + 1.03, .15, 0, .24, .035, .055, '#6a625a')
      wagon.visible = false
    }
    const plate = new THREE.Group(); parent.add(plate)
    return { train, cars, loads, plate }
  }

  // ---------------------------------------------------------------- the street lobby (1F)
  function lobby(parent) {
    const life = []
    box(parent, 0, .025, 0, 16.4, .05, 6.4, '#302b28', { castShadow: false })
    for (let row = 0; row < 12; row++) for (let col = 0; col < 32; col++) box(parent, -7.75 + col * .50, .071, -2.75 + row * .50, .50, .032, .50, (row + col) % 2 ? '#716650' : '#8f8065', { castShadow: false })
    box(parent, 0, 1.83, -3.12, 16.6, 3.66, .20, '#17251a')
    box(parent, 0, .52, -2.98, 16.4, 1.04, .075, '#121f14')
    box(parent, 0, 1.07, -2.92, 16.4, .095, .13, '#2a422f')
    box(parent, 0, .10, -2.88, 16.4, .13, .17, '#243928')
    // the lobby's ceiling and the brick lintel over its front, under the first storey's label band
    box(parent, 0, 3.73, 0, 16.4, .14, 6.4, '#2a2420')
    box(parent, 0, 3.74, 3.16, 16.9, .16, .36, K.brick)
    for (const x of [-4.90, 4.90]) { box(parent, x, .25, 3.16, 6.30, .50, .24, K.brick); box(parent, x, .54, 3.16, 6.48, .10, .39, stone) }
    for (const x of [-8.18, -1.54, 1.54, 8.18]) { box(parent, x, 1.85, 3.13, .35, 3.70, .38, K.brick); box(parent, x, 3.59, 3.16, .55, .15, .51, stoneHi) }
    // a deep green striped entrance canopy, its glass doors opened into the model
    for (let i = 0; i < 7; i++) box(parent, 0, 3.48 - i * .065, 3.13 + i * .16, 3.36, .105, .18, i % 2 ? '#446b5c' : '#5c8069')
    box(parent, 0, 3.03, 4.22, 3.47, .39, .14, '#2a493d')
    const canopy = labels.label({ lines: [{ spans: [['THE OFFICE', '#ead9ab', { pixel: true }]], size: .3, align: 'center' }], width: 3.2, pad: .03 })
    canopy.position.set(0, 3.03, 4.30); parent.add(canopy)
    for (const x of [-1.12, 1.12]) box(parent, x, 1.52, 3.12, .16, 3.00, .23, '#587165')
    box(parent, 0, 3.02, 3.12, 2.39, .15, .25, '#73816d')
    for (const side of [-1, 1]) {
      box(parent, side * .77, 1.49, 2.87, .73, 2.88, .08, '#566b5a', { yaw: side * .58 })
      box(parent, side * .76, 1.82, 2.91, .56, 1.86, .045, '#78958e', { yaw: side * .58 })
      box(parent, side * .49, 1.42, 3.13, .04, .31, .055, '#d3b66f')
    }
    box(parent, 0, .10, 3.73, 2.54, .18, .82, stone)
    for (const x of [-2.13, 2.13]) { box(parent, x, 2.44, 3.31, .18, .59, .23, darkSteel); box(parent, x, 2.47, 3.47, .15, .37, .13, bulbMaterial); box(parent, x, 2.80, 3.43, .28, .11, .23, darkSteel) }
    // reception: the counter, the visitor robot, pigeonholes and a monitor
    box(parent, 0, .68, -1.08, 3.44, 1.28, 1.10, '#6c4e35')
    box(parent, 0, 1.36, -1.08, 3.68, .15, 1.26, '#b58d59')
    for (let i = 0; i < 11; i++) box(parent, -1.54 + i * .31, .75, -.49, .09, .92, .035, '#8b6b43')
    box(parent, -.78, 1.62, -1.23, .68, .44, .11, '#242c31')
    box(parent, -.78, 1.62, -1.16, .57, .33, .025, '#547d6c', { glow: .45 })
    box(parent, -.78, 1.40, -.85, .52, .035, .20, '#bdb5a4')
    box(parent, .98, 1.47, -.85, .36, .07, .39, '#c9b58c')
    sprite(parent, ROBOT, ROBOT_LEG, .69, 1.04, -1.65, .068, .31)
    const reception = labels.label({ lines: [{ spans: [['RECEPTION', '#eec96f', { pixel: true }]], size: .3, align: 'center' }], width: 2.3, pad: .05, bg: K.plate })
    reception.position.set(0, .9, -.45); parent.add(reception)
    const welcome = labels.label({ lines: [{ spans: [['WELCOME TO THE OFFICE', '#c9bda3', { pixel: true }]], size: .26, align: 'center' }], width: 4.6, pad: .02 })
    welcome.position.set(0, 3.18, -2.99); parent.add(welcome)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const x = -.80 + i * .80, y = 2.02 + j * .37
      box(parent, x, y, -2.91, .71, .31, .22, '#665338'); box(parent, x, y, -2.775, .54, .17, .025, '#252c23')
      box(parent, x, y - .02, -2.744, .31, .04, .025, '#d1c39e')
    }
    // the café, the office's kitchen: counter, coffee machine, cups, a microwave shelf, the cooler and a shared table
    box(parent, -5.87, .68, -2.20, 3.60, 1.25, .97, '#38513d')
    box(parent, -5.87, 1.36, -2.20, 3.75, .14, 1.08, '#b98a58')
    for (const x of [-6.98, -5.87, -4.76]) { box(parent, x, .67, -1.67, 1.03, 1.08, .06, '#48624b'); box(parent, x + .32, 1.02, -1.62, .15, .035, .05, '#c8ae73') }
    box(parent, -6.67, 1.78, -2.19, .65, .67, .55, '#505a55'); box(parent, -6.67, 1.80, -1.88, .48, .34, .08, '#a0a596')
    box(parent, -6.67, 1.62, -1.81, .14, .20, .10, '#303c33'); box(parent, -6.67, 1.48, -1.78, .44, .05, .31, '#b9b8a2')
    box(parent, -6.67, 1.61, -1.75, .17, .20, .17, '#d77757'); box(parent, -6.46, 2.01, -1.84, .06, .05, .025, '#b5d67f', { glow: .5 })
    for (let i = 0; i < 3; i++) {
      const steam = box(parent, -6.67 + (i % 2) * .04, 1.83 + i * .11, -1.75, .045, .08, .045, '#d5c3a2', { dynamic: true, castShadow: false })
      steam.userData.baseY = steam.position.y; steam.userData.phase = i * .9; life.push(steam)
    }
    for (let i = 0; i < 4; i++) box(parent, -5.74 + i * .26, 1.52, -2.08, .16, .22, .16, ['#6a9c88', '#c5a166', '#d0c4a0', '#b4816a'][i])
    box(parent, -5.83, 2.64, -2.86, 3.66, .11, .54, '#8c6b42')
    box(parent, -6.46, 2.97, -2.87, 1.19, .55, .42, '#5d6168'); box(parent, -6.62, 2.98, -2.62, .71, .38, .055, '#20232e')
    box(parent, -6.01, 3.00, -2.60, .08, .08, .035, '#b5d67f', { glow: .5 })
    for (let i = 0; i < 4; i++) box(parent, -5.30 + i * .19, 2.79, -2.85, .14, .20, .15, ['#d77757', '#eec96f', '#b5d67f', '#eec96f'][i])
    box(parent, -3.46, .72, -2.34, .63, 1.36, .56, '#b9bab0'); box(parent, -3.46, 1.68, -2.34, .44, .53, .43, '#70a8b6'); box(parent, -3.46, 1.98, -2.34, .29, .09, .30, '#abcbd0')
    box(parent, -3.46, 1.06, -2.02, .36, .20, .03, '#505852'); box(parent, -3.57, 1.08, -1.98, .055, .055, .04, '#b56556'); box(parent, -3.34, 1.08, -1.98, .055, .055, .04, '#588cb0')
    // bunting over the café, as the pixel kitchen's
    for (let i = 0; i < 14; i++) box(parent, -7.4 + i * .27, 3.28 - (i % 2) * .05, -2.6, .16, .16, .02, ['#e85d75', '#f6d34a', '#7fbde8', '#9ab86a'][i % 4], { rotate: Math.PI / 4 })
    // a small round café table by the window, out of the way of whoever stands at the counter with a mug
    box(parent, -7.05, .78, 1.55, 1.1, .1, .9, '#b38956')
    box(parent, -7.05, .4, 1.55, .12, .72, .12, '#5b503d')
    for (const x of [-7.55, -6.55]) { box(parent, x, .38, 2.25, .42, .1, .36, '#38593f'); box(parent, x, .18, 2.25, .08, .34, .08, darkSteel) }
    box(parent, -7.05, .86, 1.55, .3, .05, .22, '#c7b888')
    // the meeting room: a woven rug, the table, chairs and a physical workflow whiteboard
    box(parent, 5.28, .095, -.40, 4.80, .025, 4.03, '#52604a', { castShadow: false })
    for (let i = 0; i < 13; i++) box(parent, 5.28, .112, -2.20 + i * .29, 4.63, .014, .025, '#737960', { castShadow: false })
    box(parent, 5.17, .97, -.73, 2.85, .14, 1.46, '#b58c59')
    for (const x of [4.10, 6.24]) for (const z of [-1.19, -.27]) box(parent, x, .47, z, .09, .92, .09, '#5b4a33')
    box(parent, 5.20, 2.48, -2.86, 4.04, 1.62, .12, '#927947'); box(parent, 5.20, 2.48, -2.77, 3.86, 1.44, .045, '#d4d4b8')
    plant(parent, -7.57, .08, 2.30, .76); plant(parent, 7.40, .10, 2.27, .72)
    for (const x of [-4.7, 0, 4.7]) {
      box(parent, x, 3.44, -.43, .04, .30, .04, darkSteel); box(parent, x, 3.22, -.43, .66, .12, .43, '#81704f'); box(parent, x, 3.14, -.43, .55, .025, .34, bulbMaterial)
      const light = new THREE.PointLight('#ffd28c', 16, 7, 2); light.position.set(x, 3.02, -.10); light.userData.nightIntensity = 16; parent.add(light); lights.push(light)
    }
    return {
      life,
      // where the views put people and boards: the café's standing room, the meeting table, the whiteboard, the coat rack
      cafe: { x0: -6.9, x1: -3.9, z: -.72, y: .1, table: { x: -7.05, z: 1.55 }, plaque: { x: -4.9, y: 2.3, z: -2.68 } },
      meeting: { x0: 3.4, x1: 7.0, table: { x: 5.17, z: -.73, y: .97 }, board: { x: 5.20, y: 2.48, z: -2.74, w: 3.86, h: 1.44 } },
      reception: { x: 0, z: -.2 },
      rack: { x: 2.75, z: -2.3 },
    }
  }

  // ---------------------------------------------------------------- the roof and its neon sign
  const neonMaterial = new THREE.MeshStandardMaterial({ color: '#fffbe0', emissive: '#ffcf2e', emissiveIntensity: 1.7, roughness: 1 })
  const neonFlicker = neonMaterial.clone()
  const neonGlass = new THREE.MeshStandardMaterial({ color: '#ffcf2e', emissive: '#ffcf2e', emissiveIntensity: 1.1, roughness: 1 })
  const neonGlassFlicker = neonGlass.clone()
  const neonHalo = new THREE.MeshBasicMaterial({ color: '#ffcf2e', transparent: true, opacity: .12, blending: THREE.AdditiveBlending, depthWrite: false })
  const neonHaloOuter = neonHalo.clone(); neonHaloOuter.opacity = .055
  for (const m of [neonMaterial, neonFlicker, neonGlass, neonGlassFlicker, neonHalo, neonHaloOuter]) kit.disposables.add(m)

  function roof(group) {
    box(group, 0, -.28, 0, 17.0, .18, 6.75, stone)
    box(group, 0, -.10, 0, 17.35, .19, 7.0, '#75624f')
    for (let x = -8.25; x <= 8.3; x += .43) box(group, x, -.32, 3.40, .19, .30, .20, '#a38c6c')
    box(group, 0, 0, 0, 17.1, .18, 6.7, K.parapet)
    for (const z of [-3.25, 3.25]) { box(group, 0, .25, z, 17, .50, .21, K.brick); box(group, 0, .53, z, 17.30, .13, .34, K.parapetTop) }
    for (const x of [-8.35, 8.35]) { box(group, x, .25, 0, .22, .50, 6.7, K.brick); box(group, x, .53, 0, .34, .13, 6.85, K.parapetTop) }
    box(group, 5.83, .71, -1.90, 2.0, 1.42, 1.67, K.brick)
    box(group, 5.83, 1.49, -1.90, 2.22, .16, 1.89, '#787164')
    box(group, 5.80, .67, -.99, .70, 1.20, .11, '#555b57')
    box(group, 5.80, .82, -.92, .43, .27, .04, '#96aab2')
    box(group, 6.09, .60, -.88, .05, .16, .05, ROLE.accent)
    for (const x of [-6.55, -5.35]) for (const z of [-1.66, -.46]) box(group, x, .70, z, .11, 1.3, .11, '#6a5c4b')
    beam(group, -6.55, .12, -5.35, 1.31, -.46, .08, '#655a4b'); beam(group, -5.35, .12, -6.55, 1.31, -1.66, .08, '#655a4b')
    box(group, -5.95, 1.89, -1.06, 1.52, 1.43, 1.49, '#8c633d')
    for (const y of [1.29, 1.92, 2.52]) box(group, -5.95, y, -1.06, 1.62, .09, 1.58, '#4f5150')
    for (let i = 0; i < 7; i++) box(group, -6.58 + i * .21, 1.90, -.28, .025, 1.31, .025, '#5d452d')
    box(group, -5.95, 2.66, -1.06, 1.66, .14, 1.65, '#5b5144')
    box(group, -5.95, 2.79, -1.06, 1.32, .15, 1.29, '#75614a')
    box(group, -5.95, 2.91, -1.06, .92, .10, .91, '#75614a')
    for (let i = 0; i < 4; i++) {
      const y = .6 + i * .55, w = .8 - i * .13, c = i % 2 ? '#d0c7b5' : '#c36c48'
      box(group, 7.16 - w / 2, y, -1.8, .075, .6, .075, c); box(group, 7.16 + w / 2, y, -1.8, .075, .6, .075, c)
      beam(group, 7.16 - w / 2, y - .28, 7.16 + w / 2, y + .28, -1.8, .055, c)
    }
    box(group, 7.16, 3.0, -1.8, .05, 1.0, .05, '#a4a9b0')
    box(group, 7.16, 3.15, -1.8, 1.0, .045, .045, '#8a8f96')
    box(group, 7.16, 2.85, -1.8, .72, .045, .045, '#8a8f96')
    const beacon = box(group, 7.16, 3.55, -1.8, .12, .12, .12, '#ff5a4a', { glow: 1.5, dynamic: true })
    box(group, -3.0, .48, -1.55, 1.4, .84, .92, '#747774'); box(group, -3.0, .92, -1.55, 1.50, .06, 1.03, '#959990')
    for (let i = 0; i < 7; i++) box(group, -3.55 + i * .18, .50, -1.06, .07, .53, .04, '#464c4d')
    for (const x of [3.7, 4.55]) plant(group, x, .11, 1.88, .60)
    for (const x of [-7.4, -4.3, 5.75]) { box(group, x, .49, 1.65, .35, .79, .35, '#65676a'); box(group, x, .92, 1.65, .53, .08, .52, '#969b9a') }
    // the exact original neon paths: each SVG rect an extruded glass segment, over a dark board with bulbs on its edges
    const sign = new THREE.Group(); sign.position.set(.1, 2.15, 1.40); group.add(sign)
    const sw = 10.35, sh = 2.12
    box(sign, 0, 0, 0, sw, sh, .31, '#1a1714')
    box(sign, 0, sh / 2, 0, sw + .18, .11, .37, '#756044'); box(sign, 0, -sh / 2, 0, sw + .18, .11, .37, '#756044')
    for (const x of [-sw / 2, sw / 2]) box(sign, x, 0, 0, .10, sh, .37, '#756044')
    const ns = 9.80 / NEON.w
    const pathRects = path => [...path.matchAll(/M(-?[\d.]+) (-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)h(-?[\d.]+)z/g)].map(m => m.slice(1, 5).map(Number))
    NEON.glow.forEach((path, layer) => pathRects(path).forEach(([x, y, w, h]) => box(sign, (x + w / 2 - NEON.w / 2) * ns, .42 - (y + h / 2 - NEON.h / 2) * ns, .177 - layer * .012, w * ns, h * ns, .015, layer ? neonHaloOuter : neonHalo)))
    const flickerRects = new Set(pathRects(NEON.flick).map(r => r.join(':')))
    NEON.d.forEach(path => pathRects(path).forEach(([x, y, w, h]) => {
      const flicker = flickerRects.has([x, y, w, h].join(':'))
      const xx = (x + w / 2 - NEON.w / 2) * ns, yy = .42 - (y + h / 2 - NEON.h / 2) * ns
      box(sign, xx, yy, .20, w * ns + (w === 1 ? .036 : 0), h * ns + (h === 1 ? .036 : 0), .10, flicker ? neonGlassFlicker : neonGlass)
      box(sign, xx, yy, .26, w * ns, h * ns, .04, flicker ? neonFlicker : neonMaterial)
    }))
    box(sign, 0, -.25, .20, 9.75, .025, .05, '#6a5740')
    for (let x = -4.82; x <= 4.83; x += .32) for (const y of [-.98, .98]) box(sign, x, y, .24, .065, .065, .07, bulbMaterial)
    for (const x of [-3.6, 3.6]) {
      box(group, x, .91, 1.40, .15, 1.82, .15, steel)
      box(group, x - .34, .89, 1.40, .08, 1.77, .08, darkSteel)
      for (let i = 0; i < 3; i++) beam(group, x - .34, .10 + i * .52, x, .56 + i * .52, 1.40, .055, steel)
      beam(group, x, .16, x, 1.5, -.10, .10, steel)
    }
    box(group, 0, .65, 1.65, 10.6, .10, .72, steel)
    for (const x of [-4.9, -2.4, 0, 2.4, 4.9]) box(group, x, .97, 2.0, .055, .57, .055, steel)
    box(group, 0, 1.23, 2.0, 10.3, .055, .055, steel)
    const pigeon = (x, z, flip = 1) => { box(group, x, .72, z, .23, .25, .32, '#9a9a99'); box(group, x + .09 * flip, .88, z + .12, .18, .21, .20, '#aeb1b0'); box(group, x + .20 * flip, .87, z + .15, .12, .045, .08, '#c0a46c'); box(group, x - .08 * flip, .71, z - .16, .14, .10, .21, '#666c70'); box(group, x + .14 * flip, .92, z + .22, .025, .028, .025, '#171c22'); for (const dx of [-.06, .06]) box(group, x + dx, .57, z, .025, .12, .025, '#b58e75') }
    pigeon(-7.2, 3.25); pigeon(5.3, 3.25, -1)
    // the sign's own lines (the view's numbers) and the building's status fascia under the cornice
    const info = new THREE.Group(); info.position.set(0, -.62, .34); sign.add(info)
    const fascia = new THREE.Group(); fascia.position.set(0, -.62, 3.52); group.add(fascia)
    return { beacon, sign, info, fascia }
  }
  function tickNeon(elapsed, night) {
    const tired = Math.sin(elapsed * 3.1) > .985 || Math.sin(elapsed * 37) > .998
    neonFlicker.emissiveIntensity = tired ? .01 : (night ? 1.7 : .6)
    neonFlicker.color.set(tired ? '#54482a' : '#fffbe0')
    neonGlassFlicker.emissiveIntensity = tired ? .01 : (night ? 1.1 : .4)
    neonGlassFlicker.color.set(tired ? '#54482a' : '#ffcf2e')
  }
  function setTheme(night) {
    neonMaterial.emissiveIntensity = night ? 1.7 : .6
    bulbMaterial.emissiveIntensity = night ? 1.25 : .4
  }

  // ---------------------------------------------------------------- the shell around the storeys
  /**
   * Brick returns on both sides of every storey, the quoins up both front corners, the floor number on each storey's
   * corner pier. `storeys` are `{ base, height, number }` (base: where the storey's label band starts).
   */
  function shell(parent, storeys, top) {
    for (const s of storeys) {
      // each storey's own brick returns and number ride with it when the floors are pulled apart
      const host = s.group ?? parent
      const y = s.base + s.height / 2
      for (const xx of [-HALF, HALF]) {
        box(host, xx, y, 0, .22, s.height, 6.45, K.mortar)
        for (let r = 0; r < Math.floor(s.height / .218); r++) for (let c = 0; c < 10; c++) box(host, xx + (xx > 0 ? .13 : -.13), s.base + .12 + r * .218, -2.78 + c * .63, .05, .183, .59, ['#614837', K.brick, '#6a503c'][(r + c) % 3])
      }
      if (s.number == null || s.plate === false) continue
      const plate = labels.label({ lines: [{ spans: [[`${s.number}F`, ROLE.dim, { pixel: true }]], size: .34, align: 'center' }], width: .62, pad: .05, bg: K.plate })
      plate.position.set(-HALF + .24, s.base + .34, FRONT + .36); host.add(plate)
    }
    const lobbyPlate = labels.label({ lines: [{ spans: [['1F', ROLE.dim, { pixel: true }]], size: .34, align: 'center' }], width: .62, pad: .05, bg: K.plate })
    lobbyPlate.position.set(-7.62, 1.45, FRONT + .32); parent.add(lobbyPlate)
    for (const x of [-8.25, 8.25]) for (let i = 0; i < Math.ceil((top - .20) / .228); i++) box(parent, x, .11 + i * .228, 3.19, i % 2 ? .34 : .48, .20, .31, i % 2 ? stone : stoneHi)
  }

  return { ground, metro, lobby, roof, shell, tickNeon, setTheme, lights, bulbMaterial }
}
