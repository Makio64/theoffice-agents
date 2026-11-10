// Show the native pictures in the viewport first; the rest of the building follows as it approaches.
import * as art from './art.js';
import { CAST, INITIAL_LAYOUTS } from './data.js';
import { menuIconSvg } from './lib/svg-menu.mjs';
import { createPictureRenderer } from './picture-renderer.js';
import { createProgressivePictures } from './progressive-pictures.js';
import { mountFooter, updateStreet } from './footer.js';
import { livelySamples } from './demo.js';
import { mountLoader } from './loader.js';

const root = document.documentElement;
const navigation = performance.getEntriesByType('navigation')[0]?.type;
const startAtTop = !location.hash && navigation !== 'back_forward';
const scrollRestoration = history.scrollRestoration;
if (startAtTop) history.scrollRestoration = 'manual';
let showStreet;
const streetVisible = new Promise(resolve => { showStreet = resolve; });
const loader = mountLoader({ onTimeout: () => revealFirstView(true) });
// The sky's decoration and the guide are chunks of their own, off the way to the first view: the sky downloads beside
// the first pictures and is built once the curtain rises (the bottom-up reveal uncovers it last); the guide follows.
const skyModule = import('./scenery.js');
skyModule.catch(() => {});
// The floor in view keeps its lights on and leads the guide's text; it is mounted with the first view.
const spotlightModule = import('./spotlight.js');
spotlightModule.catch(() => {});
const cleanupFooter = mountFooter({ animationsReady: streetVisible });
let guide;
let spotlight;
const images = Object.fromEntries([...document.querySelectorAll('[data-floor-view]')].map(image => [image.dataset.floorView, image]));
images.front = document.querySelector('#simple-front');
images.subway = document.querySelector('#simple-subway');
const tower = document.querySelector('.tower');
const switcher = document.querySelector('#sky-switch');
const install = document.querySelector('#install');
const installLink = document.querySelector('#install-link');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
const fontReady = document.fonts.load('12px "Office Pixel"').catch(() => {});
let renderer;
let scenery;
let renderTimer;
let openingKey;
let firstDrawReady = false;
let destroyed = false;
let observer;

function getRenderer() {
  if (!renderer) {
    // These downloads belong to later views and light changes, never the first night-time screen.
    const samples = fetch(new URL('./sample.json', import.meta.url)).then(response => {
      if (!response.ok) throw new Error('Sample activity unavailable');
      return response.json();
    }).then(livelySamples);
    renderer = createPictureRenderer(samples);
  }
  return renderer;
}
const pictures = createProgressivePictures({
  images, layouts: INITIAL_LAYOUTS, createRenderer: getRenderer,
  initialPicture: window.__officeInitialPicture,
  baseURL: document.baseURI, onCommit: updateStreet,
});
delete window.__officeInitialPicture;

function options() {
  return {
    sky: root.dataset.sky,
    width: Math.max(376, Math.min(1088, Math.floor(tower.clientWidth / 4) * 4)),
    animate: !motion.matches,
  };
}

function visibleNames(margin = 0) {
  return Object.entries(images).filter(([, image]) => {
    const rect = image.getBoundingClientRect();
    return rect.bottom > -margin && rect.top < innerHeight + margin;
  }).map(([name]) => name);
}

function loadViews(names, priority = 'auto') {
  if (!names.length || destroyed) return Promise.resolve();
  return pictures.load(names, { priority }).then(() => {
    if (names.some(name => name === 'front' || name === 'subway')) showStreet();
    updateStreet();
  });
}

function watchLowerFloors() {
  if (observer || destroyed) return;
  observer = new IntersectionObserver(entries => {
    const names = entries.filter(entry => entry.isIntersecting).map(entry =>
      Object.keys(images).find(name => images[name] === entry.target));
    loadViews(names, 'low').catch(() => {});
  }, { rootMargin: '400px 0px' });
  for (const image of Object.values(images)) observer.observe(image);
}

async function revealFirstView(force = false) {
  if (destroyed || firstDrawReady) return;
  const key = pictures.key;
  if (!force && openingKey === key) return;
  openingKey = key;
  await nextFrame();
  if (destroyed || pictures.key !== key || firstDrawReady) return;
  if (startAtTop) scrollTo({ top: 0, left: 0, behavior: 'instant' });
  else if (location.hash === '#install' && navigation !== 'back_forward') {
    install.scrollIntoView({ behavior: 'instant', block: 'center' });
  }
  // Exact heights are already reserved. Only native floor pictures actually on screen gate the opening.
  const critical = visibleNames().filter(name => images[name].dataset.floorView);
  if (!force) {
    try { await loadViews(critical, 'high'); }
    catch (error) {
      if (error?.name === 'AbortError') return;
      // A failed picture retains its framed placeholder while the rest of the page remains usable.
    }
  }
  await nextFrame();
  if (destroyed || pictures.key !== key || firstDrawReady) return;
  if (startAtTop) scrollTo({ top: 0, left: 0, behavior: 'instant' });
  firstDrawReady = true;
  performance.mark('office:first-view');
  const lights = mountSpotlight();
  const opened = loader.ready();
  // after the curtain's first frame, so it starts to rise at once
  requestAnimationFrame(() => setTimeout(mountSky));
  loadGuide();
  await opened;
  if (startAtTop) history.scrollRestoration = scrollRestoration;
  if (destroyed) return;
  Promise.all([loadGuide(), fontReady, lights]).then(([dialogue]) => { if (!destroyed) dialogue?.start(spotlight?.section); });
  watchLowerFloors();
}

function mountSky() {
  skyModule.then(({ mountScenery }) => {
    if (destroyed || scenery) return;
    scenery = mountScenery({ onPhase });
    scenery.setPlaying(!motion.matches);
  }).catch(() => { /* The stylesheet's own night sky stays. */ });
}

function mountSpotlight() {
  return spotlightModule.then(({ mountSpotlight }) => {
    if (destroyed || spotlight) return;
    spotlight = mountSpotlight({ onSection: id => guide?.then(dialogue => dialogue?.follow(id)) });
  }).catch(() => { /* Every floor stays lit and the guide waits for clicks. */ });
}

function loadGuide() {
  guide ??= import('./dialogue.js')
    .then(({ mountDialogue }) => (destroyed ? undefined : mountDialogue({ autoStart: false })))
    .catch(() => undefined);
  return guide;
}

function onPhase({ sky }) {
  switcher.setAttribute('aria-label', sky === 'day' ? 'Switch to night' : 'Switch to day');
  draw();
}

function draw() {
  if (destroyed) return;
  pictures.setOptions(options());
  updateStreet();
  if (!firstDrawReady) revealFirstView();
  else loadViews(visibleNames(400), 'auto').catch(() => {});
}

document.querySelector('#neon').innerHTML = art.neonSvg(3);
document.querySelector('#header-mascot').innerHTML = art.castSvg(CAST.find(agent => agent.id === 'claude'), 2);
document.querySelector('#github-icon').innerHTML = art.iconSvg('cat');
const toggle = art.toggleIcons();
switcher.querySelector('.tg').innerHTML = toggle.sun + toggle.moon;
for (const icon of document.querySelectorAll('[data-floor-icon]')) icon.innerHTML = menuIconSvg(icon.dataset.floorIcon);
const props = art.roofProps();
document.querySelector('#roof-props').innerHTML = `<span class="prop water-tower" style="left:48px">${props.tower}</span><span class="prop" style="left:132px">${props.ac}</span><span class="prop wide" style="right:116px">${props.dish}</span><span class="prop antenna" style="right:44px">${props.antenna}</span>`;
document.querySelector('#roof-cat').innerHTML = props.cat;
document.querySelector('#roof-pigeon').innerHTML = props.pigeon;

const installUrl = new URL(location.href);
installUrl.hash = 'install';
installLink.href = installUrl.href;
install.tabIndex = -1;
installLink.addEventListener('click', event => {
  event.preventDefault();
  draw();
  history.replaceState(null, '', installUrl);
  install.focus({ preventScroll: true });
  install.scrollIntoView({ behavior: motion.matches ? 'instant' : 'smooth', block: 'center' });
  loadViews(['front', 'subway'], 'high').catch(() => {});
});
document.addEventListener('click', event => {
  const topic = event.target.closest?.('[data-dialogue-topic]')?.dataset.dialogueTopic;
  if (images[topic]) loadViews([topic], 'high').catch(() => {});
  else if (topic === 'live') loadViews(['office'], 'high').catch(() => {});
  else if (topic === 'install') loadViews(['front', 'subway'], 'high').catch(() => {});
});

function updateMotion() {
  const active = !motion.matches;
  root.dataset.playing = String(active);
  for (const svg of document.querySelectorAll('svg')) {
    if (active) svg.unpauseAnimations?.(); else svg.pauseAnimations?.();
  }
  scenery?.setPlaying(active);
  draw();
}
switcher.addEventListener('click', () => {
  if (!scenery) return;
  scenery.setTheme(root.dataset.sky === 'day' ? 'night' : 'day');
  scenery.setPlaying(!motion.matches);
});
motion.addEventListener('change', updateMotion);
let measuredWidth = tower.clientWidth;
const resize = new ResizeObserver(() => {
  const width = tower.clientWidth;
  if (width === measuredWidth) return;
  measuredWidth = width;
  clearTimeout(renderTimer);
  renderTimer = setTimeout(draw, 60);
});
resize.observe(tower);
updateMotion();
addEventListener('pagehide', event => {
  if (event.persisted) return;
  destroyed = true;
  if (startAtTop) history.scrollRestoration = scrollRestoration;
  pictures.destroy();
  loader.destroy();
  guide?.then(dialogue => dialogue?.destroy());
  spotlight?.destroy();
  scenery?.destroy();
  cleanupFooter();
  observer?.disconnect();
  resize.disconnect();
  clearTimeout(renderTimer);
  motion.removeEventListener('change', updateMotion);
});
