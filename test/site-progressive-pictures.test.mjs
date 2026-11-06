import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgressivePictures } from '../site/progressive-pictures.js';

const NAMES = ['office', 'week', 'month', 'front', 'subway'];
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function element() {
  const attributes = new Map();
  const classes = new Set();
  const parent = {
    classList: {
      contains: name => classes.has(name),
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
    },
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: name => attributes.delete(name),
  };
  return {
    width: 1088, height: 0, style: {}, parentElement: parent,
    getAttribute(name) { return name === 'src' ? this.src || null : null; },
    decode() { return this.decodeWait?.promise ?? Promise.resolve(); },
  };
}

function fixture(t, { factory, fetcher, initialPicture } = {}) {
  const requests = [], fetches = [], blobs = [], revoked = [], commits = [], renders = [];
  let factories = 0, disposals = 0;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  class ControlledImage {
    constructor() { this.wait = deferred(); }
    set src(url) { this.url = url; requests.push(this); }
    decode() { return this.wait.promise; }
    removeAttribute() { this.removed = true; }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: ControlledImage });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'Image', descriptor);
    else delete globalThis.Image;
  });
  t.mock.method(URL, 'createObjectURL', blob => {
    const url = `blob:picture-${blobs.length}`;
    blobs.push({ url, blob });
    return url;
  });
  t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  t.mock.method(globalThis, 'fetch', (url, options) => {
    fetches.push({ url, options });
    return fetcher ? fetcher(url, options) : Promise.resolve({
      ok: true,
      blob: async () => new Blob([`<svg>${url}</svg>`], { type: 'image/svg+xml' }),
    });
  });
  const images = Object.fromEntries(NAMES.map(name => [name, element()]));
  const layouts = Object.fromEntries(['night', 'day'].map(sky => [sky, Object.fromEntries(['animated', 'still'].map(mode => [mode,
    [[756, 590, 1314, 112, 80], [648, 590, 1086, 112, 80]],
  ]))]));
  const renderer = {
    render(options) {
      const wait = deferred();
      renders.push({ options, ...wait });
      return wait.promise;
    },
    dispose() { ++disposals; },
  };
  const controller = createProgressivePictures({
    images, layouts, baseURL: 'https://office.test/', initialPicture, onCommit: names => commits.push(names),
    createRenderer() { ++factories; return factory ? factory(renderer) : renderer; },
  });
  t.after(() => controller.destroy());
  return {
    images, layouts, requests, fetches, blobs, revoked, commits, renders, controller,
    get factories() { return factories; }, get disposals() { return disposals; },
    options: (next = {}) => controller.setOptions({ sky: 'night', width: 376, animate: true, ...next }),
    resolve(index = requests.length - 1) { requests[index].wait.resolve(); },
    reject(index = requests.length - 1) { requests[index].wait.reject(new Error('Image unavailable')); },
  };
}

test('native first floors reserve exact layout without starting facts, worker or lower images', async t => {
  const app = fixture(t);
  const key = app.options();
  assert.equal(key, 'night:376:true');
  for (const [index, name] of NAMES.entries()) {
    const image = app.images[name];
    assert.equal(image.width, 376);
    assert.equal(image.height, app.layouts.night.animated[0][index]);
    assert.equal(image.style.aspectRatio, `376 / ${image.height}`);
    assert.equal(image.parentElement.getAttribute('aria-busy'), 'true');
    assert.equal(image.parentElement.classList.contains('is-pending'), true);
    assert.equal(image.src, undefined);
  }
  const first = app.controller.load(['office'], { priority: 'high' });
  assert.equal(app.factories, 0);
  assert.equal(app.fetches.length, 1);
  assert.equal(app.fetches[0].url, 'https://office.test/img/initial-office-376.svg');
  assert.deepEqual(Object.keys(app.fetches[0].options).sort(), ['priority', 'signal'], 'use ordinary fetch semantics with priority and cancellation');
  assert.equal(app.fetches[0].options.priority, 'high');
  assert.ok(app.fetches[0].options.signal instanceof AbortSignal);
  await flush();
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].url, 'blob:picture-0');
  assert.equal(app.requests[0].fetchPriority, 'high');
  assert.equal(app.images.office.src, undefined, 'the real image waits for detached decoding');
  app.resolve();
  await first;
  assert.equal(app.images.office.src, 'blob:picture-0', 'the mounted image uses the decoded Blob, never a second HTTP URL');
  assert.equal(app.fetches.length, 1, 'one native HTTP fetch covers detached and mounted decoding');
  assert.equal(app.controller.ready('office'), true);
  assert.equal(app.images.office.parentElement.getAttribute('aria-busy'), 'false');
  assert.equal(app.images.office.parentElement.classList.contains('has-picture'), true);
  for (const name of ['week', 'month', 'front', 'subway']) {
    assert.equal(app.controller.ready(name), false);
    assert.equal(app.images[name].src, undefined);
  }
  assert.deepEqual(app.commits, [['office']]);
  assert.equal(app.factories, 0);
  const lower = app.controller.load(['month']);
  assert.equal(app.fetches[1].url, 'https://office.test/img/initial-month-376.svg');
  await flush();
  app.resolve(1);
  await lower;
  assert.equal(app.controller.ready('month'), true);
  assert.equal(app.factories, 0);
});

test('reduced motion selects the native still drawing and identical requests share decoding', async t => {
  const app = fixture(t);
  app.options({ animate: false });
  const one = app.controller.load(['week']);
  const two = app.controller.load(['week']);
  assert.equal(app.fetches.length, 1);
  assert.equal(app.fetches[0].url, 'https://office.test/img/initial-week-376-still.svg');
  await flush();
  assert.equal(app.requests.length, 1);
  app.resolve();
  await Promise.all([one, two]);
  assert.deepEqual(app.commits, [['week']]);
});

test('the head-started Blob promise supplies the initial floor without another fetch or renderer', async t => {
  const initial = deferred();
  const app = fixture(t, { initialPicture: { url: 'https://office.test/img/initial-office-376.svg', promise: initial.promise } });
  app.options();
  const work = app.controller.load(['office'], { priority: 'high' });
  await flush();
  assert.deepEqual(app.fetches, []);
  assert.deepEqual(app.requests, []);
  assert.equal(app.factories, 0);
  const blob = new Blob(['<svg>initial office</svg>'], { type: 'image/svg+xml' });
  initial.resolve(blob);
  await flush();
  assert.equal(app.blobs.length, 1);
  assert.equal(app.blobs[0].blob, blob, 'consume the exact response body already fetched in the head');
  app.resolve();
  await work;
  assert.equal(app.controller.ready('office'), true);
  assert.deepEqual(app.fetches, []);
  assert.equal(app.factories, 0);
  const lower = app.controller.load(['month']);
  await flush();
  assert.equal(app.fetches.length, 1, 'unmatched lower assets keep the normal fetch path');
  app.resolve();
  await lower;
});

test('aborting a shared initial Blob consumer cannot commit late or cancel a later matching load', async t => {
  const initial = deferred();
  const app = fixture(t, { initialPicture: { url: 'https://office.test/img/initial-office-376.svg', promise: initial.promise } });
  app.options();
  const old = app.controller.load(['office']);
  const rejected = assert.rejects(old, { name: 'AbortError' });
  app.options({ width: 380 });
  await rejected;
  initial.resolve(new Blob(['<svg/>'], { type: 'image/svg+xml' }));
  await flush();
  assert.deepEqual(app.blobs, [], 'the aborted generation never creates or mounts a late Blob URL');
  assert.deepEqual(app.commits, []);
  app.options();
  const fresh = app.controller.load(['office']);
  await flush();
  assert.equal(app.blobs.length, 1);
  app.resolve();
  await fresh;
  assert.equal(app.controller.ready('office'), true);
  assert.deepEqual(app.fetches, []);
  assert.equal(app.factories, 0);
});

test('readiness and notifications wait for the mounted image to acquire its decoded Blob', async t => {
  const app = fixture(t);
  app.options();
  const mounted = app.images.office.decodeWait = deferred();
  const work = app.controller.load(['office']);
  await flush();
  app.resolve(0);
  await flush();
  assert.equal(app.images.office.src, 'blob:picture-0');
  assert.equal(app.controller.ready('office'), false);
  assert.equal(app.images.office.parentElement.getAttribute('aria-busy'), 'true');
  assert.deepEqual(app.commits, []);
  assert.equal(app.fetches.length, 1);
  mounted.resolve();
  await work;
  assert.equal(app.controller.ready('office'), true);
  assert.deepEqual(app.commits, [['office']]);
  assert.equal(app.fetches.length, 1, 'mounted decode cannot repeat the native HTTP request');
});

test('A to B to A keeps committed art and rejects late decoding from either stale generation', async t => {
  const app = fixture(t);
  app.options();
  const first = app.controller.load(['office']);
  await flush();
  app.resolve(0);
  await first;
  const original = app.images.office.src;
  const staleMonth = app.controller.load(['month']);
  const monthRejected = assert.rejects(staleMonth, { name: 'AbortError' });
  await flush();
  app.options({ width: 380 });
  assert.equal(app.images.office.src, original, 'retain usable art while replacement loads');
  assert.equal(app.images.office.style.aspectRatio, '380 / 648', 'new geometry is reserved immediately');
  const other = app.controller.load(['office']);
  const otherRejected = assert.rejects(other, { name: 'AbortError' });
  await flush();
  assert.equal(app.fetches[2].url, 'https://office.test/img/initial-office-380.svg');
  app.options();
  assert.equal(app.controller.ready('office'), true);
  app.resolve(1);
  app.resolve(2);
  await Promise.all([monthRejected, otherRejected]);
  await flush();
  assert.equal(app.images.office.src, original);
  assert.equal(app.images.month.src, undefined);
  assert.equal(app.factories, 0, 'cancelled native requests never start the runtime fallback');
  assert.deepEqual(app.commits, [['office']]);
  const fresh = app.controller.load(['month']);
  await flush();
  assert.equal(app.requests.length, 4, 'returning to A needs a new request for its uncommitted month');
  app.resolve(3);
  await fresh;
  assert.equal(app.controller.ready('month'), true);
});

const missingStreet = url => url.includes('/initial-front') || url.includes('/initial-subway')
  ? Promise.resolve({ ok: false, status: 404, blob() { throw new Error('Do not decode a 404'); } })
  : Promise.resolve({ ok: true, blob: async () => new Blob([`<svg>${url}</svg>`], { type: 'image/svg+xml' }) });

test('night street pictures are prebuilt at every width, without the facts or worker', async t => {
  const app = fixture(t);
  app.options();
  const streets = app.controller.load(['front', 'subway']);
  await flush();
  assert.deepEqual(app.fetches.map(({ url }) => url), [
    'https://office.test/img/initial-front-376.svg',
    'https://office.test/img/initial-subway-376.svg',
  ]);
  app.resolve(0);
  app.resolve(1);
  await streets;
  assert.equal(app.factories, 0, 'no worker for the street');
  assert.equal(app.controller.ready('front'), true);
  assert.equal(app.controller.ready('subway'), true);
  app.options({ animate: false, width: 380 });
  const still = app.controller.load(['front']);
  await flush();
  assert.equal(app.fetches.at(-1).url, 'https://office.test/img/initial-front-380-still.svg');
  app.resolve();
  await still;
  assert.equal(app.factories, 0);
});

test('street requests share one week render without replacing the already ready native week', async t => {
  // A missing street file falls back to the worker, which cuts both from one week drawing.
  const app = fixture(t, { fetcher: missingStreet });
  app.options();
  const week = app.controller.load(['week']);
  await flush();
  app.resolve(0);
  await week;
  const nativeWeek = app.images.week.src;
  const streets = app.controller.load(['front', 'subway']);
  await flush();
  assert.equal(app.factories, 1);
  assert.equal(app.renders.length, 1);
  assert.deepEqual(app.renders[0].options, { sky: 'night', width: 376, animate: true, views: ['week'] });
  app.renders[0].resolve({ drawings: { week: '<svg>runtime week</svg>' }, street: { front: '<svg>front</svg>', subway: '<svg>subway</svg>' } });
  await flush();
  assert.equal(app.blobs.length, 3, 'one native week and two runtime street Blobs');
  assert.equal(app.requests.length, 3);
  app.resolve(1);
  app.resolve(2);
  await streets;
  assert.equal(app.images.week.src, nativeWeek);
  assert.equal(app.controller.ready('front'), true);
  assert.equal(app.controller.ready('subway'), true);
  assert.equal(app.images.office.src, undefined);
  app.controller.destroy();
  assert.deepEqual(new Set(app.revoked), new Set(app.blobs.map(blob => blob.url)));
  assert.equal(app.disposals, 1);
});

test('A to B to A during mounted decoding never reports B as the old ready A', async t => {
  const app = fixture(t);
  app.options();
  const first = app.controller.load(['office']);
  await flush();
  app.resolve(0);
  await first;
  app.options({ width: 380 });
  const other = app.controller.load(['office']);
  const otherRejected = assert.rejects(other, { name: 'AbortError' });
  await flush();
  const mounted = app.images.office.decodeWait = deferred();
  app.resolve(1);
  await flush();
  assert.equal(app.images.office.src, 'blob:picture-1');
  app.options();
  await otherRejected;
  assert.equal(app.controller.ready('office'), false, 'the original A source was replaced before B finished');
  delete app.images.office.decodeWait;
  const fresh = app.controller.load(['office']);
  await flush();
  app.resolve(2);
  await fresh;
  mounted.resolve();
  await flush();
  assert.equal(app.images.office.src, 'blob:picture-2');
  assert.equal(app.controller.ready('office'), true);
  assert.deepEqual(app.commits, [['office'], ['office']]);
  assert.deepEqual(app.revoked, ['blob:picture-0', 'blob:picture-1']);
});

test('runtime fallbacks preserve responsive metadata and retain old art until decoded', async t => {
  const app = fixture(t);
  app.options();
  const work = app.controller.load(['office']);
  await flush();
  app.reject(0);
  await flush();
  assert.equal(app.factories, 1);
  assert.equal(app.renders.length, 1);
  app.renders[0].resolve({ drawings: { office: '<svg width="1088" height="242">office</svg>' } });
  await flush();
  assert.equal(app.requests[1].url, 'blob:picture-1');
  app.resolve(1);
  await work;
  assert.equal(app.images.office.width, 376);
  assert.equal(app.images.office.height, 756);
  app.options({ sky: 'day' });
  const next = app.controller.load(['office']);
  await flush();
  assert.equal(app.renders.length, 2);
  assert.equal(app.images.office.src, 'blob:picture-1');
  app.renders[1].reject(new Error('Worker unavailable'));
  await flush();
  assert.equal(app.fetches[1].url, 'https://office.test/img/office-day.svg');
  assert.equal(app.requests[2].url, 'blob:picture-2');
  app.resolve(2);
  await next;
  await flush();
  assert.equal(app.images.office.src, 'blob:picture-2');
  assert.equal(app.images.office.style.aspectRatio, '376 / 756');
  assert.deepEqual(app.revoked, ['blob:picture-0', 'blob:picture-1']);
});

test('failed native, runtime and static sources reject cleanly instead of claiming readiness', async t => {
  const app = fixture(t, { factory() { throw new Error('No renderer'); } });
  app.options();
  const work = app.controller.load(['month']);
  const rejected = assert.rejects(work, /Image unavailable/);
  await flush();
  app.reject(0);
  await flush();
  assert.equal(app.fetches[1].url, 'https://office.test/img/month-night.svg');
  app.reject(1);
  await rejected;
  assert.equal(app.controller.ready('month'), false);
  assert.equal(app.images.month.parentElement.getAttribute('aria-busy'), 'false');
  assert.equal(app.images.month.src, undefined);
});

test('a missing native HTTP asset falls back without decoding its error response', async t => {
  const app = fixture(t, {
    factory() { throw new Error('No renderer'); },
    fetcher(url) {
      if (url.includes('/initial-')) return Promise.resolve({ ok: false, status: 404, blob() { throw new Error('Do not decode a 404'); } });
      return Promise.resolve({ ok: true, blob: async () => new Blob(['<svg>fallback</svg>'], { type: 'image/svg+xml' }) });
    },
  });
  app.options();
  const work = app.controller.load(['office']);
  await flush();
  assert.equal(app.fetches.length, 2);
  assert.equal(app.fetches[1].url, 'https://office.test/img/office-night.svg');
  assert.equal(app.requests.length, 1);
  assert.equal(app.blobs.length, 1);
  app.resolve();
  await work;
  assert.equal(app.controller.ready('office'), true);
});

test('disposing aborts hung decode and cleans late renderer creation and owned URLs', async t => {
  const created = deferred();
  const app = fixture(t, { factory(renderer) { return created.promise.then(() => renderer); }, fetcher: missingStreet });
  app.options();
  const native = app.controller.load(['office']);
  const nativeRejected = assert.rejects(native, { name: 'AbortError' });
  const street = app.controller.load(['front']);
  const streetRejected = assert.rejects(street, { name: 'AbortError' });
  await flush();
  app.controller.destroy();
  await Promise.all([nativeRejected, streetRejected]);
  created.resolve();
  app.resolve(0);
  await flush();
  assert.equal(app.disposals, 1);
  assert.equal(app.renders.length, 0);
  assert.deepEqual(app.commits, []);
  assert.equal(app.images.office.parentElement.getAttribute('aria-busy'), null);
  await assert.rejects(app.controller.load(['office']), { name: 'AbortError' });
  assert.throws(() => app.options(), { name: 'AbortError' });
});

test('a stale decoded runtime image cannot commit and its Blob is released', async t => {
  const app = fixture(t);
  app.options({ sky: 'day' });
  const old = app.controller.load(['office']);
  const rejected = assert.rejects(old, { name: 'AbortError' });
  await flush();
  app.renders[0].resolve({ drawings: { office: '<svg>day</svg>' } });
  await flush();
  assert.equal(app.blobs.length, 1);
  app.options();
  app.resolve(0);
  await rejected;
  await flush();
  assert.deepEqual(app.revoked, ['blob:picture-0']);
  assert.equal(app.images.office.src, undefined);
});

test('destroy aborts an unfinished native fetch and ignores its late response', async t => {
  const response = deferred();
  const app = fixture(t, { fetcher: () => response.promise });
  app.options();
  const work = app.controller.load(['office']);
  const rejected = assert.rejects(work, { name: 'AbortError' });
  assert.equal(app.fetches.length, 1);
  app.controller.destroy();
  assert.equal(app.fetches[0].options.signal.aborted, true);
  await rejected;
  response.resolve({ ok: true, blob: async () => new Blob(['<svg/>']) });
  await flush();
  assert.deepEqual(app.blobs, []);
  assert.deepEqual(app.requests, []);
  assert.equal(app.factories, 0);
});
