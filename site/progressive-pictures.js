// Load only the rooms the visitor can see. Night floors and the street under them
// are already laid out at every native width; the sample facts and worker are
// needed only by later art (the day's light).
import { assetPath } from './asset-path.js';

const NAMES = ['office', 'week', 'month', 'front', 'subway'];
const FLOORS = new Set(['office', 'week', 'month']);
// Every picture has a prebuilt night file, the street included (build.mjs, initial-pictures.mjs).
const PREBUILT = new Set(NAMES);

function aborted(message) {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function until(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}

export function createProgressivePictures({ images, layouts, createRenderer, onCommit = () => {}, baseURL = document.baseURI, initialPicture }) {
  const records = new Map(NAMES.filter(name => images[name]).map(name => [name, {
    name, element: images[name], readyKey: undefined, ownedURL: undefined,
  }]));
  const parents = new Map([...records.values()].map(({ element }) => [element.parentElement, {
    pending: element.parentElement?.classList.contains('is-pending'),
    picture: element.parentElement?.classList.contains('has-picture'),
    busy: element.parentElement?.getAttribute('aria-busy'),
  }]));
  const ownedURLs = new Set();
  const inflight = new Map();
  const initialURL = initialPicture?.url ? new URL(initialPicture.url, baseURL).href : undefined;
  let runtimeResults = new Map();
  let generation = 0;
  let cancellation = new AbortController();
  let options;
  let currentKey;
  let rendererPromise;
  let renderer;
  let destroyed = false;

  function pending(record, value) {
    const parent = record.element.parentElement;
    parent?.classList.toggle('is-pending', value);
    parent?.classList.toggle('has-picture', Boolean(record.readyKey || record.element.getAttribute('src')));
    parent?.setAttribute('aria-busy', String(value));
  }

  function release(url) {
    if (!ownedURLs.delete(url)) return;
    URL.revokeObjectURL(url);
  }

  function getRenderer() {
    rendererPromise ??= Promise.resolve().then(() => {
      if (destroyed) throw aborted('Picture loading disposed');
      return createRenderer();
    }).then(value => {
      if (destroyed) {
        value.dispose?.();
        throw aborted('Picture loading disposed');
      }
      renderer = value;
      return value;
    });
    return rendererPromise;
  }

  function render(view, request) {
    if (!runtimeResults.has(view)) {
      runtimeResults.set(view, getRenderer().then(instance => {
        if (request.signal.aborted) throw request.signal.reason;
        return instance.render({ ...request.options, views: [view] });
      }));
    }
    return until(runtimeResults.get(view), request.signal);
  }

  async function decode(url, request, owned = false) {
    if (request.signal.aborted) { if (owned) release(url); throw request.signal.reason; }
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = request.priority;
    image.src = url;
    try {
      await until(image.decode(), request.signal);
      return { url, owned };
    } catch (error) {
      if (owned) release(url);
      image.removeAttribute?.('src');
      throw error;
    }
  }

  async function runtimePicture(name, request) {
    const view = FLOORS.has(name) ? name : 'week';
    const result = await render(view, request);
    const source = FLOORS.has(name) ? result.drawings?.[name] : result.street?.[name];
    if (!source) throw new Error(`The responsive ${name} picture is unavailable`);
    if (request.signal.aborted) throw request.signal.reason;
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
    ownedURLs.add(url);
    return decode(url, request, true);
  }

  async function fetchPicture(url, request) {
    // The head can start the first real fetch before the module graph loads.
    // Reuse its response body so the first picture needs only one HTTP request,
    // including when the development server disables HTTP caching.
    let blob;
    if (url === initialURL) blob = await until(initialPicture.promise, request.signal);
    else {
      const response = await until(fetch(url, { signal: request.signal, priority: request.priority }), request.signal);
      if (!response.ok) throw new Error(`Picture unavailable (${response.status}): ${url}`);
      blob = await until(response.blob(), request.signal);
    }
    if (request.signal.aborted) throw request.signal.reason;
    const objectURL = URL.createObjectURL(blob);
    ownedURLs.add(objectURL);
    return decode(objectURL, request, true);
  }

  async function sourceFor(name, request) {
    if (request.options.sky === 'night' && PREBUILT.has(name)) {
      try {
        const { width, animate } = request.options;
        return await fetchPicture(new URL(assetPath(`img/initial-${name}-${width}${animate ? '' : '-still'}.svg`), baseURL).href, request);
      } catch (error) { if (request.signal.aborted) throw error; }
    }
    try { return await runtimePicture(name, request); }
    catch (error) { if (request.signal.aborted) throw error; }
    // The older, wide drawing remains usable if a native asset or worker fails.
    // Its intrinsic dimensions never replace the reserved responsive geometry.
    return fetchPicture(new URL(assetPath(`img/${name}-${request.options.sky}.svg`), baseURL).href, request);
  }

  function loadOne(name, priority) {
    const record = records.get(name);
    if (!record || record.readyKey === currentKey) return Promise.resolve();
    if (inflight.has(name)) return inflight.get(name);
    const request = { generation, key: currentKey, options: { ...options }, signal: cancellation.signal, priority };
    const work = sourceFor(name, request).then(async picture => {
      if (destroyed || request.generation !== generation || request.signal.aborted) {
        if (picture.owned) release(picture.url);
        throw request.signal.reason ?? aborted('Picture options changed');
      }
      const previous = record.ownedURL;
      record.element.src = picture.url;
      record.ownedURL = picture.owned ? picture.url : undefined;
      // Readiness follows the actual mounted image. Clearing its old key also
      // prevents A→B→A from mistaking B's pending swap for the earlier A image.
      record.readyKey = undefined;
      try { await until(record.element.decode(), request.signal); }
      finally { if (previous) release(previous); }
      if (destroyed || request.generation !== generation || request.signal.aborted) {
        throw request.signal.reason ?? aborted('Picture options changed');
      }
      record.readyKey = request.key;
      pending(record, false);
      onCommit([name]);
    }).catch(error => {
      if (!destroyed && request.generation === generation && !request.signal.aborted) pending(record, false);
      throw error;
    }).finally(() => {
      if (inflight.get(name) === work) inflight.delete(name);
    });
    inflight.set(name, work);
    return work;
  }

  return {
    setOptions(next) {
      if (destroyed) throw aborted('Picture loading disposed');
      const width = Math.max(376, Math.min(1088, Math.round((Number(next.width) || 376) / 4) * 4));
      const sky = next.sky === 'day' ? 'day' : 'night';
      const animate = next.animate !== false;
      const key = `${sky}:${width}:${animate}`;
      if (key === currentKey) return key;
      const row = layouts[sky]?.[animate ? 'animated' : 'still']?.[(width - 376) / 4];
      if (!row) throw new Error(`No picture layout for ${key}`);
      cancellation.abort(aborted('Picture options changed'));
      cancellation = new AbortController();
      ++generation;
      currentKey = key;
      options = { sky, width, animate };
      inflight.clear();
      runtimeResults = new Map();
      for (const [name, record] of records) {
        const height = row[NAMES.indexOf(name)];
        record.element.width = width;
        record.element.height = height;
        record.element.style.aspectRatio = `${width} / ${height}`;
        pending(record, record.readyKey !== key);
      }
      return key;
    },
    get key() { return currentKey; },
    ready(name) { return !destroyed && currentKey !== undefined && records.get(name)?.readyKey === currentKey; },
    async load(names, { priority = 'auto' } = {}) {
      if (destroyed) throw aborted('Picture loading disposed');
      if (!options) throw new Error('Set picture options before loading');
      const list = [...new Set(typeof names === 'string' ? [names] : names)];
      for (const name of list) if (!NAMES.includes(name)) throw new Error(`Unknown picture: ${name}`);
      const requestPriority = ['high', 'low', 'auto'].includes(priority) ? priority : 'auto';
      await until(Promise.all(list.map(name => loadOne(name, requestPriority))), cancellation.signal);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancellation.abort(aborted('Picture loading disposed'));
      renderer?.dispose?.();
      for (const url of [...ownedURLs]) release(url);
      for (const [parent, state] of parents) {
        if (!parent) continue;
        parent.classList.toggle('is-pending', Boolean(state.pending));
        parent.classList.toggle('has-picture', Boolean(state.picture));
        if (state.busy == null) parent.removeAttribute('aria-busy');
        else parent.setAttribute('aria-busy', state.busy);
      }
      inflight.clear();
      runtimeResults.clear();
    },
  };
}
