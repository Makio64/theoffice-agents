// Keep SVG generation off the UI thread. Restricted browsers retain the same local renderer.
export function createPictureRenderer(samples) {
  let worker;
  let fallback;
  let nextId = 0;
  let disposed = false;
  let initialized = false;
  let resolvedSamples;
  let initializationFailed = false;
  let initializationError;
  const pending = new Map();
  const disposedError = () => new Error('Picture renderer disposed');
  const renderFallback = (options) => {
    fallback ??= import('./render-pictures.js');
    return fallback.then(({ renderPictures }) => {
      if (disposed) throw disposedError();
      return renderPictures(resolvedSamples, options);
    });
  };
  function finish(request, succeeded, value) {
    if (!pending.delete(request.id)) return;
    if (succeeded) request.resolve(value);
    else request.reject(value);
  }
  function useLocalRenderer(request) {
    request.state = 'fallback';
    renderFallback(request.options).then(
      result => finish(request, true, result),
      error => finish(request, false, error),
    );
  }
  function dispatch(request) {
    if (disposed || !initialized || request.state !== 'waiting') return;
    if (!worker) { useLocalRenderer(request); return; }
    request.state = 'worker';
    try { worker.postMessage({ id: request.id, options: request.options }); }
    catch { useFallback(); }
  }
  function useFallback(event) {
    event?.preventDefault?.();
    worker?.terminate();
    worker = undefined;
    for (const request of pending.values()) {
      if (request.state === 'worker') request.state = 'waiting';
      dispatch(request);
    }
  }
  function initialize(data) {
    if (disposed) return;
    resolvedSamples = data;
    initialized = true;
    try { worker?.postMessage({ type: 'init', samples: data }); }
    catch { useFallback(); }
    for (const request of pending.values()) dispatch(request);
  }
  function failInitialization(error) {
    if (disposed) return;
    initializationFailed = true;
    initializationError = error;
    worker?.terminate();
    worker = undefined;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }
  try {
    worker = new Worker(new URL('./pictures-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', ({ data }) => {
      const request = pending.get(data.id);
      if (!request || request.state !== 'worker') return;
      if (data.error) useLocalRenderer(request);
      else finish(request, true, data.result);
    });
    worker.addEventListener('error', useFallback);
    worker.addEventListener('messageerror', useFallback);
  } catch { useFallback(); }
  if (samples && typeof samples.then === 'function') {
    // Fetch sample data and the worker's module graph concurrently. Handle an
    // unused renderer's rejection too; callers still receive it from render().
    Promise.resolve(samples).then(initialize, failInitialization).catch(failInitialization);
  } else initialize(samples);

  return {
    render(options) {
      if (disposed) return Promise.reject(disposedError());
      if (initializationFailed) return Promise.reject(initializationError);
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const request = { id, options, resolve, reject, state: 'waiting' };
        pending.set(id, request);
        dispatch(request);
      });
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      worker = undefined;
      for (const { reject } of pending.values()) reject(disposedError());
      pending.clear();
    },
  };
}
