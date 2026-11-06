// The page's accelerated day: CSS paints the light; JS only changes the phase every 16 seconds.
import * as art from './art.js';
import { layoutCity, farSvg, neighboursSvg, starsSvg, skyBands, bandTile } from './sky.js';
import { startParallax } from './parallax.js';

const PHASE_MS = 16_000;
const CYCLE_MS = PHASE_MS * 4;
const PHASES = [
  { phase: 'night', sky: 'night', hour: 1, label: '01:00 · night shift' },
  { phase: 'dawn', sky: 'day', hour: 8, label: '08:00 · a new day' },
  { phase: 'day', sky: 'day', hour: 13, label: '13:00 · in the flow' },
  { phase: 'dusk', sky: 'night', hour: 19, label: '19:00 · golden hour' },
];
const CLOUDS = [
  ['streakB', 34, 13, .24], ['streakA', 126, 13, .72],
  ['puffB', 72, 26, .07], ['puffA', 190, 26, .58],
  ['streakA', 284, 13, .45], ['puffC', 354, 26, .9],
];

export function mountScenery({ onPhase = () => {} } = {}) {
  const root = document.documentElement;
  const sky = document.querySelector('.sky');
  const main = document.querySelector('main');
  const tower = document.querySelector('.tower');
  const far = document.querySelector('#far');
  const city = far?.closest('.city');
  const neighbours = document.querySelector('.nbrs');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!sky || !main || !tower || !far) throw new Error('The office scenery needs .sky, main, .tower, and #far.far.');
  // Measure the building before adding the sky's SVGs and their inherited styles.
  const initialBuilding = tower.getBoundingClientRect();
  far.classList.add('far');
  sky.classList.add('scenery');
  sky.innerHTML = PHASES.map(({ phase }) => `<div class="scenery-wash scenery-${phase}" data-scenery-phase="${phase}"></div>`).join('') +
    '<div class="stars" id="stars" aria-hidden="true"></div>' +
    `<div class="moon scenery-orb" id="moon" aria-hidden="true"><span class="scenery-orb-track">${art.orbSvg('moon')}</span></div>` +
    `<div class="sun scenery-orb" id="sun" aria-hidden="true"><span class="scenery-orb-track">${art.orbSvg('sun')}</span></div>` +
    '<div class="clouds" aria-hidden="true"></div>' +
    `<div class="scenery-meteor" aria-hidden="true">${art.svg(32, 8, art.rects([[0, 6, 5, 2, '#b1b7d8'], [5, 4, 8, 2, '#d1d1e3'], [13, 2, 8, 2, '#e6e0e7'], [21, 0, 7, 2, '#fff5dd']]))}</div>`;
  const washes = [...sky.querySelectorAll('.scenery-wash')];
  const stars = sky.querySelector('#stars');
  const cloudField = sky.querySelector('.clouds');
  const clouds = CLOUDS.map(([shape, y, speed, start]) => {
    const drawn = art.cloudSvg(shape);
    const el = document.createElement('div');
    el.className = `cloud${shape.startsWith('puff') ? ' near' : ''}`;
    el.innerHTML = drawn.svg;
    el.style.top = `${y}px`;
    cloudField.append(el);
    return { el, width: drawn.w * art.P, speed, start };
  });

  let timer;
  let running = false;
  let requestedPlaying = true;
  let elapsed = 0;
  let startedAt = 0;
  let phaseIndex = -1;
  let wasReduced = motion.matches;
  let destroyed = false;
  let sceneryKey = '';
  let neighbourhoodKey = '';
  let resizeTimer;
  const textureCache = new Map();

  function texture(phase, rows) {
    const key = `${phase}:${rows}`;
    if (!textureCache.has(key)) textureCache.set(key, art.uri(bandTile(skyBands(phase, rows))));
    // Retain only the current viewport's four textures after resizing.
    if (textureCache.size > 8) for (const old of [...textureCache.keys()].slice(0, 4)) textureCache.delete(old);
    return textureCache.get(key);
  }

  function paintScenery(building = tower.getBoundingClientRect()) {
    const curb = main.querySelector('.walk');
    const anchor = curb ? Math.max(0, Math.round(main.getBoundingClientRect().bottom - curb.getBoundingClientRect().top)) : 0;
    const width = Math.ceil(Math.max(innerWidth, 360) / 8) * 4;
    const rows = Math.max(300, Math.ceil(innerHeight / 2));
    const key = `${width}:${rows}`;
    if (key !== sceneryKey) {
      for (const wash of washes) wash.style.backgroundImage = texture(wash.dataset.sceneryPhase, rows);
      stars.innerHTML = starsSvg(width, rows);
      const skyline = layoutCity(width);
      far.innerHTML = `<span class="n">${farSvg(skyline, width, 'night')}</span><span class="d">${farSvg(skyline, width, 'day')}</span>`;
      // The orbit's endpoints are multiples of 96 so its stepped motion stays on whole pixels.
      sky.style.setProperty('--orb-middle', `${Math.round(innerWidth / 192) * 96}px`);
      sky.style.setProperty('--orb-right', `${Math.ceil(innerWidth / 96) * 96}px`);
      for (const cloud of clouds) {
        const from = Math.ceil(innerWidth / 2) * 2 + 80;
        const to = -cloud.width - 80;
        const duration = (from - to) / cloud.speed;
        cloud.el.style.setProperty('--from', `${from}px`);
        cloud.el.style.setProperty('--to', `${to}px`);
        cloud.el.style.setProperty('--n', Math.round((from - to) / 2));
        cloud.el.style.setProperty('--dur', `${duration}s`);
        cloud.el.style.setProperty('--dl', `${-cloud.start * duration}s`);
        cloud.el.style.setProperty('--x', `${Math.round((from - cloud.start * (from - to)) / 2) * 2}px`);
      }
      sceneryKey = key;
    }
    const left = Math.max(0, Math.round(building.left) + 8);
    const right = Math.max(0, Math.round(innerWidth - building.right) + 8);
    const next = `${left}:${right}`;
    if (neighbourhoodKey !== next) {
      for (const [side, space, first] of [['l', left, 224], ['r', right, 278]]) {
        const el = document.querySelector(`#nb${side}`);
        if (!el) continue;
        if (space < 26) { el.innerHTML = ''; continue; }
        const w = Math.ceil(space / 2);
        const h = Math.ceil(first * 1.4) + 16;
        el.style.left = `${side === 'l' ? 0 : Math.round(building.right) - 8}px`;
        el.style.width = `${w * 2}px`;
        el.style.height = `${h * 2}px`;
        el.innerHTML = `<span class="n">${neighboursSvg(w, h, side, 'night', first)}</span><span class="d">${neighboursSvg(w, h, side, 'day', first)}</span>`;
      }
      neighbourhoodKey = next;
    }
    if (neighbours) neighbours.style.bottom = `${anchor}px`;
    if (city) city.style.bottom = `${anchor}px`;
  }

  function publishPhase(force = false) {
    const index = Math.floor((elapsedNow() % CYCLE_MS) / PHASE_MS);
    if (!force && index === phaseIndex) return;
    phaseIndex = index;
    const phase = PHASES[index];
    root.dataset.sky = phase.sky;
    root.dataset.light = phase.phase;
    root.dataset.phase = phase.phase;
    onPhase({ ...phase });
  }

  function elapsedNow() { return elapsed + (running ? performance.now() - startedAt : 0); }

  function schedulePhase() {
    clearTimeout(timer);
    if (!running) return;
    const delay = PHASE_MS - (elapsedNow() % PHASE_MS);
    timer = setTimeout(() => { publishPhase(); schedulePhase(); }, delay + 5);
  }

  function updateRunning() {
    const reduced = motion.matches;
    const next = requestedPlaying && !reduced && !document.hidden && !destroyed;
    if (running && !next) elapsed = elapsedNow();
    // Reduced-motion CSS removes the animations, so they get a new clock when restored.
    // Rebase that clock to the retained replay time, whether playback resumes or stays paused.
    // This also runs when the caller handles the media event before this module does.
    if (wasReduced && !reduced && root.dataset.sceneryMode === 'cycle') {
      sky.style.setProperty('--scenery-delay', `${-(elapsed % CYCLE_MS) / 1000}s`);
    }
    wasReduced = reduced;
    if (!running && next) startedAt = performance.now();
    running = next;
    root.dataset.sceneryPlaying = String(running);
    schedulePhase();
  }

  function setPlaying(playing) {
    requestedPlaying = Boolean(playing);
    if (requestedPlaying && root.dataset.sceneryMode === 'manual') {
      // Commit the stopped orbit before restarting it at the selected phase in the same click.
      void sky.offsetWidth;
      sky.style.setProperty('--scenery-delay', `${-elapsed / 1000}s`);
      root.dataset.sceneryMode = 'cycle';
    }
    updateRunning();
  }

  function setTheme(theme) {
    requestedPlaying = false;
    updateRunning();
    elapsed = (theme === 'day' ? 2 : 0) * PHASE_MS;
    root.dataset.sceneryMode = 'manual';
    publishPhase(true);
  }

  const resize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(paintScenery, 60);
  };
  const visibility = () => updateRunning();
  const motionChange = () => updateRunning();
  root.dataset.sceneryMode = 'cycle';
  sky.style.setProperty('--scenery-delay', '0s');
  paintScenery(initialBuilding);
  publishPhase(true);
  updateRunning();
  // Its layer inventory is taken once, after the clouds and neighbours exist.
  startParallax();
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', visibility);
  motion.addEventListener('change', motionChange);
  const observer = new ResizeObserver(resize);
  observer.observe(main);
  observer.observe(tower);

  return {
    setTheme, setPlaying,
    get playing() { return requestedPlaying && !motion.matches; },
    destroy() {
      destroyed = true;
      requestedPlaying = false;
      updateRunning();
      clearTimeout(resizeTimer);
      observer.disconnect();
      removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', motionChange);
    },
  };
}
