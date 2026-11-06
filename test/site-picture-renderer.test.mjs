import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker as NodeWorker } from 'node:worker_threads';
import { renderSvg } from '../plugin/lib/svg.mjs';
import * as kit from '../plugin/lib/svg-kit.mjs';
import { EDGE, pictureParts } from '../site/pictures.mjs';
import { SAMPLE, clone, monthFacts } from './helpers/facts.mjs';

const views = ['office', 'week', 'month'];
const samples = Object.fromEntries(['day', 'night'].map(sky => [sky,
  Object.fromEntries(views.map(view => {
    const facts = view === 'month' ? monthFacts() : clone(SAMPLE);
    facts.now = { ...facts.now, is_night: sky === 'night', hour: sky === 'night' ? 1 : 14 };
    return [view, facts];
  })),
]));
const parts = pictureParts(kit);
function original(options) {
  const drawings = {};
  let street;
  for (const name of options.views) {
    const source = renderSvg(samples[options.sky][name], {
      width: options.width + EDGE * 4, animate: options.animate, quiet: true,
      view: name === 'office' ? 'live' : name, idPrefix: `simple-${name}-${options.sky}`,
    });
    drawings[name] = parts.rooms(source, name);
    if (name === 'week') street = parts.ground(source);
  }
  return { drawings, street };
}

test('responsive picture workers retain exact drawings, request identity and browser fallbacks', async t => {
  // Build the browser's module layout in isolation; npm test does not require generated site/lib/.
  const folder = await mkdtemp(path.join(tmpdir(), 'office-picture-renderer-'));
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  t.after(async () => {
    if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor);
    else delete globalThis.Worker;
    await rm(folder, { recursive: true, force: true });
  });
  await cp(new URL('../plugin/lib/', import.meta.url), path.join(folder, 'lib'), { recursive: true });
  for (const name of ['picture-renderer.js', 'pictures-worker.js', 'render-pictures.js', 'pictures.mjs']) {
    await writeFile(path.join(folder, name), await readFile(new URL(`../site/${name}`, import.meta.url)));
  }
  await writeFile(path.join(folder, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(folder, 'browser-worker.mjs'), `
    import { parentPort, workerData } from 'node:worker_threads';
    globalThis.self = {
      addEventListener(type, listener) { parentPort.on(type, data => listener({ data })); },
      postMessage(data) { parentPort.postMessage(data); },
    };
    await import(workerData.entry);
  `);
  const { createPictureRenderer } = await import(pathToFileURL(path.join(folder, 'picture-renderer.js')));
  const setWorker = value => Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value });
  const options = { sky: 'night', width: 768, animate: false, views };

  await t.test('worker output matches every SVG byte for both skies, motion settings and responsive widths', async () => {
    setWorker(class {
      constructor(url) {
        this.thread = new NodeWorker(pathToFileURL(path.join(folder, 'browser-worker.mjs')), { workerData: { entry: url.href } });
      }
      addEventListener(type, listener) {
        this.thread.on(type, value => listener(type === 'message' ? { data: value } : value));
      }
      postMessage(data) { this.thread.postMessage(data); }
      terminate() { this.thread.terminate(); }
    });
    const renderer = createPictureRenderer(samples);
    try {
      const requests = [];
      for (const sky of ['night', 'day']) for (const width of [376, 1088]) for (const animate of [false, true]) {
        const request = { sky, width, animate, views };
        requests.push(renderer.render(request).then(actual => assert.deepEqual(actual, original(request))));
      }
      await Promise.all(requests);
    } finally { renderer.dispose(); }
  });

  await t.test('a browser without Workers or with a restrictive CSP keeps the same SVGs', async () => {
    for (const implementation of [undefined, class { constructor() { throw new Error('Blocked by CSP'); } }]) {
      setWorker(implementation);
      const renderer = createPictureRenderer(samples);
      try { assert.deepEqual(await renderer.render(options), original(options)); }
      finally { renderer.dispose(); }
    }
  });

  class ControlledWorker {
    static last;
    listeners = new Map();
    messages = [];
    constructor() { ControlledWorker.last = this; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
    emit(type, data) { this.listeners.get(type)?.({ data, preventDefault() {} }); }
  }
  await t.test('promised samples start the worker immediately and initialize it before queued renders', async () => {
    setWorker(ControlledWorker);
    let resolveSamples;
    const data = new Promise(resolve => { resolveSamples = resolve; });
    const renderer = createPictureRenderer(data);
    const worker = ControlledWorker.last;
    try {
      assert.ok(worker instanceof ControlledWorker, 'the module worker exists before sample data arrives');
      assert.deepEqual(worker.messages, [], 'a Promise is never posted to the worker');
      const first = renderer.render(options);
      const secondOptions = { ...options, sky: 'day', width: 376 };
      const second = renderer.render(secondOptions);
      assert.equal(worker.messages.length, 0, 'renders wait for initialization');
      resolveSamples(samples);
      await Promise.resolve();
      assert.deepEqual(worker.messages[0], { type: 'init', samples });
      assert.deepEqual(worker.messages.slice(1).map(message => message.options), [options, secondOptions]);
      worker.emit('message', { id: worker.messages[2].id, result: 'second drawing' });
      worker.emit('message', { id: worker.messages[1].id, result: 'first drawing' });
      assert.deepEqual(await Promise.all([first, second]), ['first drawing', 'second drawing']);
    } finally { renderer.dispose(); }
  });

  await t.test('disposal rejects renders waiting for samples and prevents a late initialization', async () => {
    setWorker(ControlledWorker);
    let resolveSamples;
    const data = new Promise(resolve => { resolveSamples = resolve; });
    const renderer = createPictureRenderer(data);
    const worker = ControlledWorker.last;
    const rejected = assert.rejects(renderer.render(options), /disposed/);
    renderer.dispose();
    assert.equal(worker.terminated, true);
    await rejected;
    resolveSamples(samples);
    await Promise.resolve();
    assert.deepEqual(worker.messages, [], 'resolved data never reaches a disposed worker');
    await assert.rejects(renderer.render(options), /disposed/);
  });

  await t.test('fallbacks wait for promised samples, including worker errors before initialization', async () => {
    for (const implementation of [undefined, ControlledWorker]) {
      setWorker(implementation);
      let resolveSamples;
      const data = new Promise(resolve => { resolveSamples = resolve; });
      const renderer = createPictureRenderer(data);
      try {
        const drawing = renderer.render(options);
        let settled = false;
        drawing.then(() => { settled = true; }, () => { settled = true; });
        if (implementation) {
          ControlledWorker.last.emit('error');
          assert.equal(ControlledWorker.last.terminated, true);
        }
        await Promise.resolve();
        assert.equal(settled, false, 'fallback cannot draw until its samples arrive');
        resolveSamples(samples);
        assert.deepEqual(await drawing, original(options));
        if (implementation) assert.deepEqual(ControlledWorker.last.messages, []);
      } finally { renderer.dispose(); }
    }
  });

  await t.test('sample failures reject waiting and future renders without an unused rejection', async () => {
    setWorker(ControlledWorker);
    const error = new Error('Sample request failed');
    let rejectSamples;
    const data = new Promise((resolve, reject) => { rejectSamples = reject; });
    const renderer = createPictureRenderer(data);
    const rejected = assert.rejects(renderer.render(options), actual => actual === error);
    rejectSamples(error);
    await rejected;
    assert.equal(ControlledWorker.last.terminated, true);
    assert.deepEqual(ControlledWorker.last.messages, []);
    await assert.rejects(renderer.render(options), actual => actual === error);
    renderer.dispose();

    // main.js also observes this request; the renderer must handle its own
    // initialization chain even when no render() has been requested yet.
    const failed = Promise.reject(error);
    const mainRequest = failed.catch(() => {});
    const unused = createPictureRenderer(failed);
    await mainRequest;
    await assert.rejects(unused.render(options), actual => actual === error);
    unused.dispose();
  });

  await t.test('out-of-order replies retain the width and sky of their own request', async () => {
    setWorker(ControlledWorker);
    const renderer = createPictureRenderer(samples);
    try {
      const first = renderer.render(options);
      const second = renderer.render({ ...options, sky: 'day', width: 376 });
      const worker = ControlledWorker.last;
      worker.emit('message', { id: worker.messages[2].id, result: 'day at 376' });
      worker.emit('message', { id: worker.messages[1].id, result: 'night at 768' });
      assert.deepEqual(await Promise.all([first, second]), ['night at 768', 'day at 376']);
    } finally { renderer.dispose(); }
  });

  await t.test('module loading failures resolve all pending drawings using the local renderer', async () => {
    setWorker(ControlledWorker);
    const renderer = createPictureRenderer(samples);
    try {
      const first = renderer.render(options);
      const day = { ...options, sky: 'day' };
      const second = renderer.render(day);
      ControlledWorker.last.emit('error');
      assert.equal(ControlledWorker.last.terminated, true);
      assert.deepEqual(await first, original(options));
      assert.deepEqual(await second, original(day));
      assert.deepEqual(await renderer.render(options), original(options));
    } finally { renderer.dispose(); }
  });

  await t.test('leaving the page terminates the worker and releases pending requests', async () => {
    setWorker(ControlledWorker);
    const renderer = createPictureRenderer(samples);
    const pending = renderer.render(options);
    renderer.dispose();
    assert.equal(ControlledWorker.last.terminated, true);
    await assert.rejects(pending, /disposed/);
    await assert.rejects(renderer.render(options), /disposed/);
  });
});
