// Scroll depth for the scenery: one ladder from the farthest layer to the tower, which scrolls at 1 (the page itself).
// The sky's layers drift up a little as you go down the building, the farther the slower. The city stands on the
// street and climbs into the window from its foot, the sky's horizon: the far skyline slowest, from the first scroll,
// the neighbours faster in front of it, all landing on the street as it enters the window. A street layer moving at s of
// the page is (1 - s) of the way to the street above its place, so its foot never rises over the window's foot before
// the street does and no sky shows under it. All movement is on the pixel grid, without scroll easing that would make
// the artwork lag behind the page.
const SKY = { stars: 0.05, orb: 0.08, cloud: 0.15, nearCloud: 0.3 }
const SKYLINE = 0.15
const NEIGHBOURS = 0.7
// The city keeps to the street where the tower leaves it no room either side (the neighbours are not drawn there).
const ROOM = 18

export function startParallax() {
  const main = document.querySelector('main')
  const tower = document.querySelector('.tower')
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const layers = [
    ...[...document.querySelectorAll('.stars')].map((el) => ({ el, speed: SKY.stars })),
    ...[...document.querySelectorAll('.moon, .sun')].map((el) => ({ el, speed: SKY.orb })),
    ...[...document.querySelectorAll('.cloud')].map((el) => ({ el, speed: el.classList.contains('near') ? SKY.nearCloud : SKY.cloud })),
  ]
  const neighbours = [...document.querySelectorAll('.nb')]
  const far = document.querySelector('.far')
  let frame = 0, measure = true, streetAt = 0, maxScroll = 0, strength = 1
  let neighbourTravel = 0, skylineTravel = 0

  function move(el, y) {
    if (!el) return
    // Integer art pixels keep every window and star crisp while the layers move.
    const offset = `${Math.round(y / 2) * 2}px`
    if (el.style.getPropertyValue('--parallax-y') !== offset) el.style.setProperty('--parallax-y', offset)
  }

  // How far a street layer stands above its place at the top of the page: as slow as its depth asks, but never so
  // slow that it shows in the first window, which stays the roof's and the sky's.
  function travel(speed, height) {
    if (!streetAt || !height) return 0
    return Math.max(0, Math.min(streetAt * (1 - speed), streetAt - height))
  }

  function draw() {
    frame = 0
    if (measure) {
      // Layout is read only after a resize, including tab images changing the building's height.
      streetAt = Math.max(0, main.getBoundingClientRect().bottom + scrollY - innerHeight)
      maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight)
      strength = innerWidth < 760 ? 0.65 : 1
      const room = !tower || tower.getBoundingClientRect().left >= ROOM
      neighbourTravel = room ? travel(NEIGHBOURS, Math.max(0, ...neighbours.map((el) => el.offsetHeight))) : 0
      // A sticky skyline already stands on the window's foot all the way down (the alternative page's): it only sinks
      // a little under it at the top, to rise out of the horizon as you go down.
      const sticky = far?.parentElement && getComputedStyle(far.parentElement).position === 'sticky'
      if (sticky) skylineTravel = -Math.min(48, streetAt * 0.07)
      else skylineTravel = room ? travel(SKYLINE, far?.offsetHeight) : 0
      measure = false
    }
    const y = Math.min(maxScroll, Math.max(0, scrollY))
    const remaining = motion.matches || !streetAt ? 0 : Math.max(0, 1 - y / streetAt)
    for (const layer of layers) move(layer.el, motion.matches ? 0 : -y * layer.speed * strength)
    for (const el of neighbours) move(el, -neighbourTravel * remaining)
    move(far, -skylineTravel * remaining)
  }

  function requestDraw() {
    if (!frame) frame = requestAnimationFrame(draw)
  }
  function resize() {
    measure = true
    requestDraw()
  }

  addEventListener('scroll', () => { if (!motion.matches) requestDraw() }, { passive: true })
  addEventListener('resize', resize, { passive: true })
  motion.addEventListener('change', requestDraw)
  // Image loads, view switching and responsive text wrapping can all move the street without a window resize, and the
  // neighbours are redrawn to the room the tower leaves them.
  const observer = new ResizeObserver(resize)
  observer.observe(main)
  observer.observe(document.body)
  for (const el of neighbours) observer.observe(el)
  draw()
}
