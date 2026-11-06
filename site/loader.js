// The building appears from its foundations upward, through a chunky Bayer
// frontier. Only that moving band needs individual pixels; the roof stays behind
// one opaque rectangle until the reveal reaches it.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const FRONTIER_ROWS = 5;
// Long enough to read as the building going up, short enough not to hold the page back.
const DURATION = 330;

/** Opaque mask geometry, in CSS pixels. Exported so the reveal direction and its
 * fully covered/open endpoints can be checked without a browser or timers. */
export function constructionMask(width, height, progress) {
  width = Math.max(1, Math.round(width) || 1);
  height = Math.max(1, Math.round(height) || 1);
  const cell = width < 600 ? 16 : 24;
  const rows = Math.ceil(height / cell);
  const columns = Math.ceil(width / cell);
  const steps = (rows + FRONTIER_ROWS) * 4;
  const step = Math.floor(Math.max(0, Math.min(1, Number(progress) || 0)) * steps);
  // Quarter-row steps change only complete cells, never their size or opacity.
  const top = rows - step / 4;
  const firstRow = Math.max(0, Math.floor(top));
  const lastRow = Math.min(rows, Math.ceil(top + FRONTIER_ROWS));
  const opaqueHeight = Math.min(height, firstRow * cell);
  const cells = [];
  for (let row = firstRow; row < lastRow; row++) {
    const coverage = Math.min(1, Math.max(0, (top + FRONTIER_ROWS - row) / FRONTIER_ROWS));
    for (let column = 0; column < columns; column++) {
      if ((BAYER[row % 4 * 4 + column % 4] + 0.5) / 16 >= coverage) continue;
      const x = column * cell, y = row * cell;
      cells.push([x, y, Math.min(cell, width - x), Math.min(cell, height - y)]);
    }
  }
  return { width, height, cell, step, steps, opaqueHeight, cells };
}

function mask({ width, height, opaqueHeight, cells }) {
  const solid = opaqueHeight > 0 ? `<rect width="${width}" height="${opaqueHeight}"/>` : '';
  const pixels = cells.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h-${w}z`).join('');
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${solid}${pixels ? `<path d="${pixels}"/>` : ''}</svg>`)}")`;
}

// What the meter says at each real step. The page itself shows the first line and fills the first third in CSS,
// before this module has arrived; `floor` is where a stage starts, `to` the most it creeps towards while it lasts.
export const STAGES = {
  script: { floor: 0.36, to: 0.58, text: 'Switching on the lights…' },
  drawing: { floor: 0.6, to: 0.86, text: 'Waking up the agents…' },
  pictures: { floor: 0.66, to: 0.9, text: 'Tidying the desks…' },
  open: { floor: 1, to: 1, text: 'Welcome in!' },
};
const CREEP_MS = 2500;

/** Where the meter heads: the stage's floor, the share of the floors' pictures already here, then a slow creep that
 * never quite reaches the next stage, so a long wait still moves. */
export function loaderGoal({ stage = 'script', requested = 0, loaded = 0, elapsed = 0 } = {}) {
  const { floor, to } = STAGES[stage] ?? STAGES.script;
  const share = stage === 'pictures' && requested > 0 ? Math.min(1, loaded / requested) : 0;
  const base = floor + (to - floor) * share * 0.8;
  return Math.min(to, base + (to - base) * 0.8 * (1 - Math.exp(-Math.max(0, elapsed) / CREEP_MS)));
}

/**
 * Mount over the static startup curtain before rendering the responsive pictures.
 * Call ready() only after the final-sized images have decoded and layout is ready.
 * onTimeout can prepare a usable fallback before the curtain is removed.
 */
export function mountLoader({ element = document.querySelector('#site-loader'), timeout = 12000, onTimeout } = {}) {
  if (!element) return { ready: () => Promise.resolve(), reveal: () => Promise.resolve(), destroy() {} };
  const root = document.documentElement;
  const main = document.querySelector('main');
  const busy = main?.getAttribute('aria-busy');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const surfaces = [...document.body.children].filter(child => child !== element && !['SCRIPT', 'LINK', 'STYLE'].includes(child.tagName));
  const inertBefore = surfaces.map(surface => surface.inert);
  const status = element.querySelector('#site-loader-text');
  let frame = 0;
  let timer;
  let resolve;
  let revealed;
  let stopped = false;
  let maskKey;
  root.dataset.loading = 'true';
  main?.setAttribute('aria-busy', 'true');
  surfaces.forEach(surface => { surface.inert = true; });

  // The meter takes over from the page's CSS where it has got to, and only ever goes forward.
  let shown = Math.max(0, Number.parseFloat(getComputedStyle(element).getPropertyValue('--p')) || 0);
  let stage;
  let stageAt = 0;
  element.style.animation = 'none';
  function show(progress) {
    shown = Math.max(shown, Math.min(1, progress));
    element.style.setProperty('--p', shown.toFixed(3));
  }
  function enter(next) {
    if (stage === next) return;
    stage = next;
    stageAt = performance.now();
    if (status) status.textContent = STAGES[next].text;
  }
  function measure() {
    // The floors' own pictures, whichever the page requests first: requested once they have a source, here once decoded.
    const pictures = [...document.querySelectorAll('[data-floor-view], #simple-front')].filter(image => image.getAttribute('src'));
    const loaded = pictures.filter(image => image.complete && image.naturalWidth > 0).length;
    if (loaded) enter('pictures');
    else if (pictures.length && stage === 'script') enter('drawing');
    const goal = loaderGoal({ stage, requested: pictures.length, loaded, elapsed: performance.now() - stageAt });
    show(shown + Math.min(goal - shown, Math.max(0.02, (goal - shown) / 3)));
  }
  enter('script');
  show(STAGES.script.floor * 0.5 + shown * 0.5);
  const meter = setInterval(measure, 60);

  function restore() {
    surfaces.forEach((surface, index) => { surface.inert = inertBefore[index]; });
    if (busy == null) main?.removeAttribute('aria-busy');
    else main?.setAttribute('aria-busy', busy);
  }

  function finish() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    clearInterval(meter);
    cancelAnimationFrame(frame);
    motion.removeEventListener('change', onMotion);
    root.dataset.loading = 'ready';
    restore();
    element.remove();
    resolve?.();
  }

  function onMotion() {
    if (motion.matches && revealed) finish();
  }
  motion.addEventListener('change', onMotion);

  function reveal() {
    if (revealed) return revealed;
    if (stopped) return Promise.resolve();
    clearTimeout(timer);
    clearInterval(meter);
    // The meter is full on the frame the building starts to rise through it. A load quick enough that the console
    // never came up (index.html holds it back a moment) opens straight from the sky: it must not pop up mid-reveal.
    enter('open');
    show(1);
    const box = element.querySelector('.site-loader__box');
    if (box && getComputedStyle(box).visibility === 'hidden') box.hidden = true;
    revealed = new Promise(done => { resolve = done; });
    root.dataset.loading = 'revealing';
    element.dataset.revealing = 'true';
    element.setAttribute('aria-hidden', 'true');
    const supported = globalThis.CSS?.supports?.('mask-image', 'linear-gradient(#000,#000)')
      || globalThis.CSS?.supports?.('-webkit-mask-image', 'linear-gradient(#000,#000)');
    if (motion.matches || !supported) {
      finish();
      return revealed;
    }
    const start = performance.now();
    function tick(now) {
      if (stopped) return;
      const progress = Math.min(1, (now - start) / DURATION);
      if (progress === 1) { finish(); return; }
      // Read the actual curtain dimensions, including browser chrome changes on
      // mobile. A resize redraws the same progress at the new viewport geometry.
      const geometry = constructionMask(element.clientWidth, element.clientHeight, progress);
      const nextKey = `${geometry.width}:${geometry.height}:${geometry.step}`;
      if (nextKey !== maskKey) {
        maskKey = nextKey;
        const image = mask(geometry);
        element.style.maskImage = image;
        element.style.webkitMaskImage = image;
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return revealed;
  }

  timer = setTimeout(async () => {
    try { await onTimeout?.(); }
    catch { /* The prebuilt floors remain usable if fallback preparation fails. */ }
    finally { reveal(); }
  }, timeout);
  return { ready: reveal, reveal, destroy: finish };
}
