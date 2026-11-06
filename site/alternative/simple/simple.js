// Three floors of one living building, with the installation console under the street.
import * as art from '../../art.js';
import { createPictureRenderer } from '../../picture-renderer.js';
import { mountFooter, updateStreet } from './footer.js';
import { mountScenery } from './scenery.js';
import { livelySamples } from './demo.js';

const root = document.documentElement;
const cleanupFooter = mountFooter();
const pictures = [...document.querySelectorAll('[data-floor-view]')];
const entrance = document.querySelector('#simple-front');
const subway = document.querySelector('#simple-subway');
const tower = document.querySelector('.tower');
const switcher = document.querySelector('#sky-switch');
const install = document.querySelector('#install');
const installLink = document.querySelector('#install-link');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let samples;
let renderer;
let pendingKey;
let drawRevision = 0;
let scenery;
let renderKey;
let renderTimer;
let destroyed = false;
const urls = new Map();
const cache = new Map();

document.querySelector('#neon').innerHTML = art.neonSvg(3);
document.querySelector('#github-icon').innerHTML = art.iconSvg('cat');
const toggle = art.toggleIcons();
switcher.querySelector('.tg').innerHTML = toggle.sun + toggle.moon;
for (const icon of document.querySelectorAll('[data-floor-icon]')) icon.innerHTML = art.iconSvg(icon.dataset.floorIcon);
const props = art.roofProps();
document.querySelector('#roof-props').innerHTML = `<span class="prop water-tower" style="left:48px">${props.tower}</span><span class="prop" style="left:132px">${props.ac}</span><span class="prop wide" style="right:116px">${props.dish}</span><span class="prop antenna" style="right:44px">${props.antenna}</span>`;
document.querySelector('#roof-cat').innerHTML = props.cat;
document.querySelector('#roof-pigeon').innerHTML = props.pigeon;

// Keep the jump on this route despite the shared asset base, including any preview query.
const installUrl = new URL(location.href);
installUrl.hash = 'install';
installLink.href = installUrl.href;
install.tabIndex = -1;
installLink.addEventListener('click', (event) => {
  event.preventDefault();
  history.replaceState(null, '', installUrl);
  install.focus({ preventScroll: true });
  install.scrollIntoView({ behavior: motion.matches ? 'instant' : 'smooth', block: 'center' });
});

function putPicture(element, source) {
  const size = source.match(/width="(\d+)" height="(\d+)" viewBox=/);
  if (size) { element.width = Number(size[1]); element.height = Number(size[2]); }
  const next = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
  const old = urls.get(element);
  element.addEventListener('load', () => { if (old) URL.revokeObjectURL(old); updateStreet(); }, { once: true });
  element.src = next;
  urls.set(element, next);
}

function draw() {
  if (destroyed) return;
  const sky = root.dataset.sky;
  const animate = !motion.matches;
  if (!samples) {
    for (const element of [...pictures, entrance, subway]) {
      const name = element.dataset.floorView || (element === entrance ? 'front' : 'subway');
      element.src = new URL(`../../img/${name}-${sky}.svg`, import.meta.url).href;
    }
    return;
  }
  const width = Math.max(376, Math.round(tower.clientWidth / 2) * 2);
  const key = `${sky}:${width}:${animate}`;
  if (key === renderKey) {
    // Returning to the current drawing also cancels a pending resize or theme change.
    ++drawRevision;
    pendingKey = undefined;
    return;
  }
  if (key === pendingKey) return;
  pendingKey = key;
  const revision = ++drawRevision;
  const drawing = cache.has(key) ? Promise.resolve(cache.get(key)) : renderer.render({ sky, width, animate, views: pictures.map(picture => picture.dataset.floorView) });
  drawing.then((result) => {
    if (destroyed || revision !== drawRevision) return;
    if (!cache.has(key)) {
      cache.set(key, result);
      while (cache.size > 6) cache.delete(cache.keys().next().value);
    }
    const { drawings, street } = result;
    for (const picture of pictures) putPicture(picture, drawings[picture.dataset.floorView]);
    if (street?.front) putPicture(entrance, street.front);
    if (street?.subway) putPicture(subway, street.subway);
    updateStreet();
    // Keep direct installation links anchored after the first responsive drawing acquires its height.
    if (!renderKey && location.hash === '#install') install.scrollIntoView({ block: 'center' });
    renderKey = key;
  }).catch(() => { /* Keep the last drawing if the responsive renderer is unavailable. */ }).finally(() => {
    if (revision === drawRevision) pendingKey = undefined;
  });
}

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
  scenery.setTheme(root.dataset.sky === 'day' ? 'night' : 'day');
  // The chosen light is a starting point; the ambient day keeps moving on its own.
  scenery.setPlaying(!motion.matches);
});
motion.addEventListener('change', updateMotion);
scenery = mountScenery({ onPhase: ({ sky }) => {
  switcher.setAttribute('aria-label', sky === 'day' ? 'Switch to night' : 'Switch to day');
  draw();
} });
const resize = new ResizeObserver(() => {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(draw, 60);
});
resize.observe(tower);
updateMotion();
fetch(new URL('../../sample.json', import.meta.url)).then((response) => {
  if (!response.ok) throw new Error('Sample activity unavailable');
  return response.json();
}).then((data) => {
  if (destroyed) return;
  samples = livelySamples(data);
  renderer = createPictureRenderer(samples);
  draw();
}).catch(() => { /* The prebuilt floors stay visible if the responsive sample is unavailable. */ });
addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  destroyed = true;
  renderer?.dispose();
  scenery.destroy();
  cleanupFooter();
  resize.disconnect();
  clearTimeout(renderTimer);
  for (const url of urls.values()) URL.revokeObjectURL(url);
});
