import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { suspendAnimation } from './animation-loop.js'
import { framePerspective } from './camera-framing.js'
import { createDistrict } from './district.js'
import { createStreetLife } from './street-life.js'
import { createStreetDetails } from './street-details.js'
import { createAtmosphere, skyOfHour } from './atmosphere.js'
import { createRenderQuality } from './render-quality.js'
import { renderResolution } from './render-settings.js'
import { K, ROLE, MOON } from '../../plugin/lib/svg-kit.mjs'
import { createKit } from './kit.js'
import { createLabels, labelFontsReady } from './labels.js'
import { createActors } from './actors.js'
import { createBuilding, FRONT, LOBBY_TOP, METRO_DROP } from './building.js'
import { VIEW_BUILDERS } from './views/index.js'

const EXPLODE_GAP = 1.45
/** The front page view: the building filling the width, the page scrolling through its floors. */
const PAGE_HALF_WIDTH = 9.4
const PAGE_DIRECTION = new THREE.Vector3(0, .9, 42).normalize()

/** The original pixel art, extruded, one building per view. Shared by the website and the local plugin. */
export async function createOfficeScene(container, { onSelect = () => {}, onReady = () => {}, onHover = () => {}, onLayout = () => {}, lapse = () => {} } = {}) {
  container.dataset.cameraSettled = 'false'
  const scene = new THREE.Scene()
  const atmosphere = createAtmosphere(scene, container.closest('.scene-wrap') ?? container.parentElement)
  const camera = new THREE.PerspectiveCamera(45, 1, .1, 250)
  container.dataset.projection = 'perspective'
  const renderer = new THREE.WebGPURenderer({ antialias: false, alpha: true })
  renderer.setPixelRatio(renderResolution(1, 1, globalThis.devicePixelRatio).dpr)
  renderer.setClearColor('#0e1426', 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.NoToneMapping
  await renderer.init()
  const quality = createRenderQuality({ renderer, scene, camera })
  const canvas = renderer.domElement
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;image-rendering:pixelated;outline:none'
  canvas.setAttribute('aria-label', 'The Office in three dimensions. Scroll through the floors, or explore in 3D to orbit and zoom. Click a character to inspect it.')
  canvas.setAttribute('role', 'img')
  container.append(canvas)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = .10
  controls.minPolarAngle = .08
  controls.maxPolarAngle = Math.PI * .53
  controls.minDistance = 2.8
  controls.maxDistance = 160
  let exploration = false
  function setExploration(enabled) {
    exploration = Boolean(enabled); controls.enabled = exploration
    controls.enableRotate = exploration; controls.enableZoom = exploration; controls.enablePan = exploration
    canvas.style.touchAction = exploration ? 'none' : 'pan-y'
    canvas.style.cursor = exploration ? 'grab' : 'default'
    container.dataset.exploration = String(exploration)
  }
  setExploration(false)

  const kit = createKit({ THREE, renderer })
  const labels = createLabels({ THREE, renderer })
  await labelFontsReady()
  const actors = createActors({ THREE, kit })
  const building = createBuilding({ THREE, kit, labels })
  const { box, pixels, flush, releaseGroup } = kit
  const release = group => releaseGroup(group, labels.release)
  const windowMaterial = new THREE.MeshStandardMaterial({ color: '#142440', roughness: 1 })
  kit.disposables.add(windowMaterial)
  const colliderGeometry = new THREE.BoxGeometry(1, 1, 1), colliderMaterial = new THREE.MeshBasicMaterial({ visible: false })
  kit.disposables.add(colliderGeometry); kit.disposables.add(colliderMaterial)

  const ground = new THREE.Group(), structure = new THREE.Group(), lobbyGroup = new THREE.Group(), roof = new THREE.Group(), scenery = new THREE.Group()
  const shellGroup = new THREE.Group(), viewGroup = new THREE.Group(), lobbyPeople = new THREE.Group()
  scene.add(ground, structure, roof, scenery)
  structure.add(lobbyGroup, shellGroup, viewGroup)
  lobbyGroup.add(lobbyPeople)
  const groundParts = building.ground(ground)
  const metro = building.metro(ground)
  const lobby = building.lobby(lobbyGroup)
  const roofParts = building.roof(roof)
  // the neighborhood stays outside the office's framing bounds
  const district = createDistrict({ THREE, parent: scenery, box, pixels })
  district.materials.forEach(material => kit.disposables.add(material))
  const streetLife = createStreetLife({ THREE, parent: scenery })
  const streetDetails = createStreetDetails({ THREE, parent: scenery, box })
  streetDetails.materials.forEach(material => kit.disposables.add(material))
  const stars = new THREE.Group(), daylight = new THREE.Group(), moon = new THREE.Group()
  scenery.add(stars, daylight, moon)
  const moonGrid = MOON?.length ? MOON : ['...mmm...', '..mmmmm..', '.mmmmmmm.', 'mmmmmmmmm', 'mmmmmmmmm', '.mmmmmmm.', '..mmmmm..', '...mmm...']
  kit.sprite(moon, moonGrid, { m: K.moon, M: '#d9cfb0' }, 0, 0, 0, .105, .10)
  for (let i = 0; i < 85; i++) {
    const x = -23 + ((i * 71) % 470) / 10, y = 4.5 + ((i * 43) % 260) / 10, z = -13 - (i % 4)
    box(stars, x, y, z, i % 9 === 0 ? .10 : .045, i % 9 === 0 ? .10 : .045, .018, i % 4 ? '#6f91dc' : '#e9e6ff', { glow: .6 })
  }
  kit.sprite(daylight, ['...sss...', '..sssss..', '.sssssss.', 'sssssssss', 'sssssssss', '.sssssss.', '..sssss..', '...sss...'], { s: '#f6d860' }, 0, 0, 0, .12, .10)
  flush()

  const ambient = new THREE.HemisphereLight('#a9b8dd', '#6b4b2e', .78)
  const key = new THREE.DirectionalLight('#ffe1a0', 1.20); key.position.set(-10, 26, 16); key.castShadow = true
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -20, right: 20, top: 36, bottom: -8, near: .5, far: 110 }); key.shadow.normalBias = .04; key.shadow.bias = -.0002
  const rim = new THREE.DirectionalLight('#7795d1', .75); rim.position.set(14, 12, -8)
  scene.add(ambient, key, rim, key.target)
  const signLight = new THREE.PointLight('#ffcb48', 13, 12, 2); scene.add(signLight)
  const staticLights = [...building.lights]

  // ---------------------------------------------------------------- state
  let facade = false
  let tab = 'live', snapshot = null, current = null, quiet = false, theme = 'night', playing = true, exploded = false, view = 'front', disposed = false
  let elapsed = 0, lastTime = performance.now(), pointerDown = null, pixelScale = 1, renderSize = renderResolution(1, 1, globalThis.devicePixelRatio)
  let selected = null, selectedProject = null, focusedProject = null, focusedFloor = null, cameraTransition = null, cameraInitialized = false, dollyTarget = null
  let sceneVisible = true, renderRequested = true, scroll = 0, roofY = LOBBY_TOP + .19, storeys = [], frameSamples = [], trainCommitCount = -1
  const viewLights = []
  const orders = {}

  // ---------------------------------------------------------------- the view's building
  function rebuild() {
    if (!snapshot) return
    const builder = VIEW_BUILDERS[tab] ?? VIEW_BUILDERS.live
    const nowMs = Date.now()
    current?.dispose?.()
    release(viewGroup); release(shellGroup); release(lobbyPeople)
    for (const light of viewLights) light.removeFromParent()
    viewLights.length = 0
    const ctx = { THREE, kit, labels, actors, building, lobby, windowMaterial, colliderGeometry, colliderMaterial, lights: viewLights, nowMs, night: (appliedTheme ?? theme) === 'night',
      setClock, setSkyHour, setCommits: count => setStats({ commits: count, word: commitWord(snapshot) }), onLapse: info => lapse(info) }
    skyHour = null
    release(clockGroup); clockText = ''
    current = builder(ctx, snapshot, { previous: orders[tab] ?? [], quiet })
    orders[tab] = current.order ?? orders[tab]
    viewGroup.add(current.group)
    groundParts.plug.visible = !current.basement
    if (current.lobbyPeople) lobbyPeople.add(current.lobbyPeople)
    storeys = current.storeys
    const top = storeys.length ? storeys.at(-1).base + storeys.at(-1).height : LOBBY_TOP
    // the building's status bar on a band of its own under the roof, as the pixel office's (svg-live statusBar)
    const band = current.status ? .74 : 0
    roofY = top + .19 + band
    building.shell(shellGroup, storeys, roofY)
    if (band) {
      box(shellGroup, 0, top + band / 2, 0, 16.7, band, 6.4, '#1f1a16')
      for (const xx of [-8.18, 8.18]) box(shellGroup, xx, top + band / 2, 0, .3, band, 6.5, K.brick)
    }
    roofParts.fascia.position.set(0, -(.19 + band / 2), FRONT + .3)
    flush()
    // the sign's lines and the fascia under the cornice
    release(roofParts.info); release(roofParts.fascia)
    if (current.sign?.length) {
      // the view's numbers on the sign's lower board, as the pixel sign's one or two lines (· between their groups)
      const dotted = spans => spans.flatMap((span, i) => i ? [['·', '#7a6e58', { sep: ' ' }], [span[0], span[1], { ...span[2], sep: ' ' }]] : [span])
      const signWidth = current.signClock ? 7.1 : 9.7
      const info = labels.label({ lines: current.sign.map((spans, i) => ({ spans: dotted(spans), size: i ? .165 : .18, align: 'center', gap: .3 })), width: signWidth, pad: .02 })
      info.position.set(current.signClock ? -1.25 : 0, current.sign.length > 1 ? .07 : -.04, 0)
      roofParts.info.add(info)
    }
    if (current.status) {
      const fascia = roofParts.fascia
      box(fascia, 0, 0, 0, 16.6, .56, .12, '#14100d')
      box(fascia, 0, .3, .02, 16.7, .05, .14, K.wood)
      box(fascia, 0, -.3, .02, 16.7, .05, .14, K.woodD)
      const strip = current.status.strip.slice(0, 24)
      const stripW = strip.length * .14
      // only the number in its state's color, the words calm (svg-live statusBar, the calmer bar)
      const spans = current.status.counts.flatMap(([n, word, color], i) => [...(i ? [['·', '#6b604c', { sep: '  ' }]] : []), [n, color, { bold: true, sep: '  ' }], [word, '#b3a68a', { sep: ' ' }]])
      const counts = labels.label({ lines: [{ spans, size: .21, gap: 0 }], pad: .02, anchor: 'left' })
      const countW = counts.userData.size[0]
      const x0 = -(stripW + .3 + countW) / 2
      strip.forEach((color, i) => box(fascia, x0 + i * .14 + .05, 0, .07, .09, .24, .03, color, { glow: .35, castShadow: false }))
      counts.position.set(x0 + stripW + .3, 0, .08)
      fascia.add(counts)
    }
    flush()
    applyExplode(true)
    current.setFacade?.(facade)
    selectionMarker = projectMarker = null
    setSelectedProject(selectedProject)
    selectAgent(selected)
    for (const l of viewLights) l.intensity = (appliedTheme ?? theme) === 'night' ? (l.userData.nightIntensity || 20) : (l.userData.dayIntensity ?? 2.3)
    moon.position.set(-10.2, roofY + 2.6, -8.0); daylight.position.set(-10.2, roofY + 2.6, -8.0)
    renderRequested = true
    if (!current.signClock && (appliedTheme !== theme || appliedSky !== (userSky ?? theme))) applyTheme(theme, userSky ?? theme)
    if (current.lapse) lapse({ lanes: current.lapse.lanes, slots: current.lapse.slots, label: current.lapse.label, at: 0 })
    layoutChanged()
    if (cameraInitialized) applyCamera(view, { immediate: view === 'front' })
  }

  // the replay's clock in gold on the sign's corner, and the sky of the replayed hour
  const clockGroup = new THREE.Group(); roofParts.info.parent.add(clockGroup); clockGroup.position.set(3.75, -.55, .34)
  let clockText = '', skyHour = null
  function setClock(text) {
    if (text === clockText) return
    clockText = text
    release(clockGroup)
    if (text) clockGroup.add(labels.label({ lines: [{ spans: [[text, '#ffcf2e', { pixel: true }]], size: .42, align: 'center' }], width: 2.3, height: .58, valign: 'middle', pad: .04, bg: '#120e0b', radius: .03 }))
    renderRequested = true
  }
  function setSkyHour(hour) {
    skyHour = hour
    const sky = skyOfHour(hour), theme = sky === 'night' ? 'night' : 'day'
    if (sky !== appliedSky) applyTheme(theme, sky)
  }
  function setSnapshot(next, { tab: nextTab = tab } = {}) {
    snapshot = next
    tab = nextTab
    setStats({ commits: commitsOf(next), word: commitWord(next) })
    rebuild()
  }
  const commitsOf = s => s?.view === 'live' || !s?.view ? s?.days?.at?.(-1)?.commits ?? s?.dayStats?.at?.(-1)?.commits ?? s?.totals?.commits ?? 0 : s?.totals?.commits ?? 0
  const commitWord = s => !s?.view || s.view === 'live' || s.view === 'today' ? (s?.period?.past ? 'that day' : 'today') : s?.period?.past ? `that ${s.view === 'month' ? 'month' : 'week'}` : `this ${s.view === 'month' ? 'month' : 'week'}`
  function setQuiet(value) { quiet = Boolean(value); rebuild() }

  // ---------------------------------------------------------------- the commits line
  function setStats({ commits = 0, word = 'today' } = {}) {
    const count = Number.isFinite(Number(commits)) ? Math.max(0, Math.min(999999999, Math.floor(Number(commits)))) : 0
    const key = `${count}:${word}`
    if (key === trainCommitCount) return
    trainCommitCount = key
    renderRequested = true
    metro.loads.forEach((load, car) => {
      release(load); const parcels = Math.min(10, Math.max(0, count - car * 10)); metro.cars[car].visible = parcels > 0
      const cx = 2.0 - car * 2.16
      for (let n = 0; n < parcels; n++) {
        const xx = cx - .73 + (n % 5) * .36, yy = .32 + Math.floor(n / 5) * .26
        box(load, xx, yy, 0, .29, .23, .38, '#88a95d'); box(load, xx, yy + .12, 0, .29, .035, .38, '#b5d67f'); box(load, xx, yy, .21, .06, .23, .025, '#4c6f37')
      }
    })
    release(metro.plate)
    const plate = labels.label({ lines: [{ spans: [[`${count} commits ${word}`, '#b5d67f', { bold: true }], ...(count > 40 ? [[`40 shown · +${count - 40}`, '#a4977c']] : [])], size: .2 }], pad: .08, bg: '#16203e', radius: .03 })
    plate.position.set(5.6, -1.03 + METRO_DROP, 6.07); metro.plate.add(plate)
    metro.trainCount = count
    flush()
  }

  // ---------------------------------------------------------------- floors apart, the selection
  function applyExplode(immediate = false) {
    storeys.forEach((s, i) => { s.target = exploded ? (i + 1) * EXPLODE_GAP : 0; if (immediate) s.group.position.y = s.target })
    roof.userData.target = roofY + (exploded ? (storeys.length + 1) * EXPLODE_GAP : 0)
    if (immediate) roof.position.y = roof.userData.target
    signLight.position.set(0, roof.userData.target + 2.31, 3.4)
  }
  let selectionMarker = null, projectMarker = null
  function dropMarker(marker) { if (!marker) return null; release(marker); marker.removeFromParent(); return null }
  function selectAgent(id) {
    renderRequested = true
    selected = id ?? null
    selectionMarker = dropMarker(selectionMarker)
    const anchor = selected && current?.anchors?.get(selected)
    if (anchor) {
      // gold corner brackets round the desk, as the pixel office marks a picked desk
      selectionMarker = new THREE.Group(); anchor.level.add(selectionMarker)
      for (const [x, y, w, h] of [[-1.15, .55, .24, .07], [1.15, .55, .24, .07], [-1.15, -.55, .24, .07], [1.15, -.55, .24, .07], [-1.24, .45, .07, .24], [1.24, .45, .07, .24], [-1.24, -.45, .07, .24], [1.24, -.45, .07, .24]]) box(selectionMarker, anchor.x + x, anchor.y + y, anchor.z + .75, w, h, .05, '#ffcf2e', { glow: .8, castShadow: false })
      flush()
    }
    if (view === 'focus' && anchor) applyCamera('focus')
  }
  function setSelectedProject(name) {
    renderRequested = true
    selectedProject = name || null
    projectMarker = dropMarker(projectMarker)
    const room = current?.rooms?.find(r => r.project === selectedProject)
    if (!room || !storeys[room.floor]) return
    projectMarker = new THREE.Group(); storeys[room.floor].group.add(projectMarker)
    box(projectMarker, (room.x0 + room.x1) / 2, room.base + .02, FRONT + .42, room.x1 - room.x0 - .1, .04, .06, '#ffcf2e', { glow: .8, castShadow: false })
    flush()
  }

  // ---------------------------------------------------------------- the camera
  function modelBounds() {
    scene.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(ground)
    bounds.union(new THREE.Box3(new THREE.Vector3(-8.7, -.2, -3.5), new THREE.Vector3(8.7, roofY, 4.5)))
    const lift = exploded ? (storeys.length + 1) * EXPLODE_GAP : 0
    bounds.union(new THREE.Box3(new THREE.Vector3(-8.8, roofY + lift - .5, -3.5), new THREE.Vector3(8.8, roofY + lift + 3.5, 3.6)))
    return bounds
  }
  const cameraModes = { office: [2, 1.5, 42], isometric: [25, 20, 31], overview: [18, 31, 20], street: [14, 1.4, 38] }
  let panX = 0
  const pageHalfWidth = () => (camera.aspect < .8 ? 4.6 : PAGE_HALF_WIDTH)
  /** The page view's frame: the building as wide as the canvas, `scroll` (0 the roof … 1 the street) picking the floors in view. */
  function pageFrame() {
    const bounds = modelBounds()
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tanH = tanV * camera.aspect
    const targetZ = 1.2
    // a narrow stage frames half the building's width, and a sideways drag walks along its floors
    const half = pageHalfWidth()
    panX = THREE.MathUtils.clamp(panX, -(PAGE_HALF_WIDTH - half), PAGE_HALF_WIDTH - half)
    const distance = Math.max(half / tanH, 8)
    const visible = 2 * distance * tanV * .96
    // the street and the commits line stand nearer the camera than the floors: look a little lower for them
    const yMin = camera.aspect < .8 ? -7.6 : -6.85, yMax = bounds.max.y + .5
    const range = yMax - yMin
    const overflow = Math.max(0, range - visible)
    const centerY = overflow ? yMax - visible / 2 - scroll * overflow : (yMin + yMax) / 2
    const target = new THREE.Vector3(panX, centerY, targetZ)
    return { position: target.clone().addScaledVector(PAGE_DIRECTION, distance), target, overflowRatio: overflow / visible }
  }
  function layoutChanged() {
    if (!cameraInitialized && camera.aspect <= 0) return
    const frame = pageFrame()
    // only the page view scrolls through the floors; the other cameras frame the whole building in one stage
    onLayout({ pages: view === 'front' ? 1 + frame.overflowRatio : 1, tab, floors: storeys.map(s => s.number).filter(n => n != null) })
  }
  function applyCamera(value, { immediate = false } = {}) {
    renderRequested = true
    container.dataset.cameraSettled = 'false'
    const wasPage = view === 'front'
    view = value
    if (wasPage !== (value === 'front')) layoutChanged()
    let framing
    if (value === 'front') framing = pageFrame()
    else {
      let bounds = modelBounds(), offset = cameraModes[value] || cameraModes.office
      const anchor = selected && current?.anchors?.get(selected)
      if (value === 'focus' && anchor) {
        const lift = anchor.floor >= 0 && exploded ? (anchor.floor + 1) * EXPLODE_GAP : 0
        bounds = new THREE.Box3(new THREE.Vector3(anchor.x - 1.9, anchor.y - 1.5 + lift, anchor.z - 1.2), new THREE.Vector3(anchor.x + 1.9, anchor.y + 1.3 + lift, anchor.z + 2.9)); offset = [2.4, 1.4, 12]
      }
      const room = current?.rooms?.find(r => r.project === focusedProject)
      if (value === 'project' && room) {
        const lift = exploded ? (room.floor + 1) * EXPLODE_GAP : 0
        bounds = new THREE.Box3(new THREE.Vector3(room.x0 - .2, room.base - .1 + lift, -3.3), new THREE.Vector3(room.x1 + .2, room.top + .1 + lift, 3.7)); offset = [3.5, 2.0, 19]
      }
      if (value === 'floor' && focusedFloor) {
        if (focusedFloor === 1) { bounds = new THREE.Box3(new THREE.Vector3(-8.5, -.18, -3.4), new THREE.Vector3(8.5, LOBBY_TOP + .1, 4.48)); offset = [13, 4.5, 29] }
        else {
          const s = storeys.find(s => s.number === focusedFloor)
          if (s) { const lift = exploded ? (storeys.indexOf(s) + 1) * EXPLODE_GAP : 0; bounds = new THREE.Box3(new THREE.Vector3(-8.5, s.base + lift - .1, -3.4), new THREE.Vector3(8.5, s.base + s.height + lift, 3.7)); offset = [10, 4.0, 30] }
        }
      }
      framing = framePerspective(camera, [bounds], bounds.getCenter(new THREE.Vector3()), new THREE.Vector3().fromArray(offset))
    }
    dollyTarget = null
    if (!cameraInitialized || immediate) { camera.position.copy(framing.position); controls.target.copy(framing.target); cameraInitialized = true; cameraTransition = null; controls.update(); container.dataset.cameraSettled = 'true' }
    else cameraTransition = framing
  }
  function setView(value) { if (value === 'focus' && !selected) selected = current?.anchors?.keys().next().value ?? null; applyCamera(value) }
  function setScroll(value) {
    const next = Math.max(0, Math.min(1, Number(value) || 0))
    if (next === scroll && view === 'front') return
    scroll = next
    if (view === 'front' && !exploration) { const frame = pageFrame(); camera.position.copy(frame.position); controls.target.copy(frame.target); cameraTransition = null; controls.update(); renderRequested = true }
  }
  function focusProject(name) {
    if (!current?.rooms?.some(r => r.project === name)) return false
    focusedProject = name; focusedFloor = null; setSelectedProject(name); applyCamera('project'); return true
  }
  function focusFloor(number) {
    const floor = Number(number)
    if (!Number.isInteger(floor) || (floor !== 1 && !storeys.some(s => s.number === floor))) return false
    focusedFloor = floor; focusedProject = null; applyCamera('floor'); return true
  }

  // ---------------------------------------------------------------- theme
  let appliedTheme = null, appliedSky = null, userSky = null
  function setTheme(value, { sky = null } = {}) {
    const changed = (value === 'day' ? 'day' : 'night') !== theme
    theme = value === 'day' ? 'day' : 'night'
    userSky = sky
    if (!current?.signClock || skyHour == null) applyTheme(theme, sky ?? theme)
    // a view lights its rooms for the hour it was built at: build it again for the other shift (not the replay, whose sky turns by itself)
    if (changed && current && !current.signClock) rebuild()
  }
  function applyTheme(value, sky = value) {
    renderRequested = true
    appliedTheme = value === 'day' ? 'day' : 'night'; appliedSky = sky; const night = appliedTheme === 'night'
    ambient.color.set(night ? '#a9b8dd' : '#e9e3cf'); ambient.groundColor.set(night ? '#6b4b2e' : '#8b7960'); ambient.intensity = night ? .78 : 1.70
    key.color.set(night ? '#ffe1a0' : '#fff1ce'); key.intensity = night ? 1.20 : 2.3; rim.intensity = night ? .65 : .5
    signLight.intensity = night ? 13 : 2
    for (const l of [...staticLights, ...viewLights]) l.intensity = night ? (l.userData.nightIntensity || 20) : (l.userData.dayIntensity ?? 2.3)
    kit.setTheme(appliedTheme); building.setTheme(night)
    const desktop = kit.materials.get('#dcab72:0'); if (desktop) { desktop.emissive.set('#dcab72'); desktop.emissiveIntensity = night ? .07 : 0 }
    windowMaterial.color.set(night ? '#142440' : '#80b9e8')
    district.setTheme(appliedTheme); streetDetails.setTheme(appliedTheme); streetLife.setTheme(appliedTheme); atmosphere.setTheme(appliedTheme, sky); quality.setTheme(appliedTheme)
    moon.visible = night; stars.visible = night; daylight.visible = !night
  }

  // ---------------------------------------------------------------- size
  let rendererSized = false
  function resize() {
    const w = Math.max(container.clientWidth, 1), h = Math.max(container.clientHeight, 1), aspect = w / h, changed = Math.abs(camera.aspect - aspect) > .0001
    if (camera.aspect !== aspect) { renderRequested = true; camera.aspect = aspect; camera.updateProjectionMatrix() }
    const next = renderResolution(w, h, globalThis.devicePixelRatio, pixelScale)
    // ResizeObserver, window resize and preferences can report the same size; assigning the canvas again resets its GPU buffer
    if (!rendererSized || next.renderWidth !== renderSize.renderWidth || next.renderHeight !== renderSize.renderHeight || next.dpr !== renderSize.dpr) {
      renderRequested = true
      renderer.setDrawingBufferSize(next.renderWidth, next.renderHeight, next.dpr); quality.resize(); rendererSized = true
    }
    renderSize = next
    container.dataset.displayDpr = String(renderSize.nativeDpr); container.dataset.renderDpr = String(renderSize.dpr)
    container.dataset.bufferSize = `${canvas.width}x${canvas.height}`
    if (changed) layoutChanged()
    if (cameraInitialized && changed) applyCamera(view, { immediate: true })
  }
  let densityQuery
  function densityChanged() { resize(); watchDensity() }
  function watchDensity() {
    densityQuery?.removeEventListener('change', densityChanged)
    densityQuery = matchMedia(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`)
    densityQuery.addEventListener('change', densityChanged, { once: true })
  }
  const observer = new ResizeObserver(resize); observer.observe(container); window.addEventListener('resize', resize)
  resize(); watchDensity(); setTheme('night'); setStats({ commits: 0 })
  applyCamera('front', { immediate: true })

  // ---------------------------------------------------------------- picking
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2()
  function hit(event) {
    if (!current?.pickables?.length) return null
    const r = canvas.getBoundingClientRect(); pointer.set((event.clientX - r.left) / r.width * 2 - 1, -(event.clientY - r.top) / r.height * 2 + 1)
    raycaster.setFromCamera(pointer, camera); return raycaster.intersectObjects(current.pickables, false)[0]
  }
  const down = e => { pointerDown = { x: e.clientX, y: e.clientY, pan: panX } }
  const up = e => { if (!pointerDown || Math.hypot(pointerDown.x - e.clientX, pointerDown.y - e.clientY) > 6) return; pointerDown = null; const match = hit(e); if (match?.object.userData.id) { selectAgent(match.object.userData.id); onSelect(match.object.userData.id) } else if (match?.object.userData.project) onSelect(null, match.object.userData.project) }
  const move = e => {
    if (pointerDown && e.buttons && view === 'front' && !exploration && pageHalfWidth() < PAGE_HALF_WIDTH) {
      panX = pointerDown.pan - (e.clientX - pointerDown.x) / Math.max(1, canvas.clientWidth) * 2 * pageHalfWidth()
      const frame = pageFrame(); camera.position.copy(frame.position); controls.target.copy(frame.target); controls.update(); renderRequested = true
      return
    }
    const match = hit(e); canvas.style.cursor = match ? 'pointer' : exploration ? 'grab' : 'default'; onHover(match ? { id: match.object.userData.id, project: match.object.userData.project, day: match.object.userData.day, text: match.object.userData.text, clientX: e.clientX, clientY: e.clientY } : null) }
  const leave = () => { canvas.style.cursor = exploration ? 'grab' : 'default'; onHover(null) }
  const wheel = () => { dollyTarget = null }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerleave', leave); canvas.addEventListener('wheel', wheel, { passive: true })
  controls.addEventListener('start', () => { cameraTransition = null; dollyTarget = null })

  // ---------------------------------------------------------------- the frame
  function frame() {
    if (disposed) return
    const now = performance.now(), rawDt = now - lastTime, dt = Math.min(rawDt / 1000, .1); lastTime = now
    if (rawDt > 0 && rawDt < 1000) { frameSamples.push(rawDt); if (frameSamples.length > 90) frameSamples.shift() }
    if (playing) elapsed += dt
    streetLife.update(elapsed)
    for (const steam of lobby.life) steam.position.y = steam.userData.baseY + (Math.floor(elapsed * 2 + steam.userData.phase) % 3) * .035
    if (playing && current?.update) current.update(elapsed, dt)
    let moved = false
    for (const s of storeys) {
      let next = THREE.MathUtils.damp(s.group.position.y, s.target ?? 0, 4, dt)
      // finish the asymptotic movement far below a visible pixel, so a paused floor stops submitting frames
      if (Math.abs(next - (s.target ?? 0)) < 1e-7) next = s.target ?? 0
      if (next !== s.group.position.y) moved = true
      s.group.position.y = next
    }
    const roofTarget = roof.userData.target ?? roofY
    let ry = THREE.MathUtils.damp(roof.position.y, roofTarget, 4, dt)
    if (Math.abs(ry - roofTarget) < 1e-7) ry = roofTarget
    if (ry !== roof.position.y) moved = true
    roof.position.y = ry
    building.tickNeon(elapsed, appliedTheme === 'night')
    roofParts.beacon.material.emissiveIntensity = (Math.floor(elapsed * 1.3) % 2) ? 1.8 : .15
    // the commits line shunts along its platform, faster the more commits it carries
    metro.train.position.x = metro.trainCount > 0 ? Math.sin(elapsed * (.12 + Math.min(.2, metro.trainCount / 400))) * 4.35 : 0
    const cameraMoving = Boolean(cameraTransition) || dollyTarget !== null
    if (cameraTransition) {
      const blend = 1 - Math.exp(-dt * 5); camera.position.lerp(cameraTransition.position, blend); controls.target.lerp(cameraTransition.target, blend)
      if (camera.position.distanceTo(cameraTransition.position) < .008) { camera.position.copy(cameraTransition.position); controls.target.copy(cameraTransition.target); cameraTransition = null }
    }
    if (dollyTarget !== null) {
      const offset = camera.position.clone().sub(controls.target), distance = offset.length()
      const next = THREE.MathUtils.damp(distance, dollyTarget, 7, dt)
      camera.position.copy(controls.target).addScaledVector(offset.normalize(), next)
      if (Math.abs(next - dollyTarget) < .004) dollyTarget = null
    }
    const controlsChanged = controls.update()
    container.dataset.cameraSettled = String(!cameraTransition && dollyTarget === null && !moved)
    // a paused, unchanged frame has the same pixels: camera and floor motion and edits still repaint at once
    if (playing || renderRequested || cameraMoving || moved || controlsChanged) {
      const processing = quality.render() ? 'ao-bloom' : 'direct'
      if (container.dataset.postProcessing !== processing) container.dataset.postProcessing = processing
      renderRequested = false
    }
  }
  function setVisible(value) {
    const visible = Boolean(value)
    if (visible === sceneVisible) return
    sceneVisible = visible; lastTime = performance.now(); renderRequested = true
    if (visible) renderer.setAnimationLoop(frame)
    else suspendAnimation(renderer)
    container.dataset.rendering = visible ? 'active' : 'paused'
  }
  function getMetrics() {
    const info = renderer.info, frameMs = frameSamples.length ? frameSamples.reduce((sum, n) => sum + n, 0) / frameSamples.length : 0
    return { ...quality.getMetrics(), nativeDpr: renderSize.nativeDpr, dpr: renderSize.dpr, pixelScale, bufferWidth: canvas.width, bufferHeight: canvas.height, district: district.stats, streetLife: streetLife.stats, streetDetails: streetDetails.stats, drawCalls: info.render.drawCalls, triangles: info.render.triangles, geometries: info.memory.geometries, attributes: info.memory.attributes, bytes: info.memory.total, programs: info.memory.programs, instances: kit.instanceMeshes.size, labels: labels.count, frameMs, fps: frameMs ? 1000 / frameMs : 0, backend: renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2' }
  }
  await quality.init()
  container.dataset.postProcessing = quality.getMetrics().postProcessing ? 'ao-bloom' : 'direct'
  renderer.setAnimationLoop(frame); container.dataset.rendering = 'active'
  onReady({ backend: renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2', revision: THREE.REVISION })
  return {
    renderer, setSnapshot, setQuiet, selectAgent, setTheme, setView, setVisible, setExploration, setScroll, setStats, focusProject, focusFloor, setSelectedProject, getMetrics,
    resetCamera() { setView('front') },
    getVisibleAgents() { return [...(current?.anchors?.keys() ?? [])] },
    get tab() { return tab },
    get storeyCount() { return storeys.length },
    setPlaying(value) { playing = Boolean(value); renderRequested = true },
    setLapse(options) { current?.setLapse?.(options); renderRequested = true },
    setExploded(value) { exploded = Boolean(value); applyExplode(); applyCamera(view) },
    setFacade(value) { facade = Boolean(value); current?.setFacade?.(facade); renderRequested = true },
    setPixelScale(value) { pixelScale = [1, 2, 3].includes(value) ? value : 1; resize() },
    zoomBy(value) { if (!Number.isFinite(value) || value <= 0) return; container.dataset.cameraSettled = 'false'; cameraTransition = null; dollyTarget = THREE.MathUtils.clamp((dollyTarget ?? camera.position.distanceTo(controls.target)) / value, controls.minDistance, controls.maxDistance) },
    screenshot() { try { quality.render(); return canvas.toDataURL('image/png') } finally { if (!sceneVisible) suspendAnimation(renderer) } },
    dispose() { if (disposed) return; disposed = true; suspendAnimation(renderer); observer.disconnect(); window.removeEventListener('resize', resize); densityQuery?.removeEventListener('change', densityChanged); controls.dispose(); quality.dispose(); streetLife.dispose(); atmosphere.dispose(); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerleave', leave); canvas.removeEventListener('wheel', wheel); current?.dispose?.(); labels.dispose(); kit.dispose(); renderer.dispose(); canvas.remove() },
  }
}
