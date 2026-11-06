import { renderPictures } from './render-pictures.js';

let samples;
self.addEventListener('message', ({ data }) => {
  if (data.type === 'init') { samples = data.samples; return; }
  try {
    self.postMessage({ id: data.id, result: renderPictures(samples, data.options) });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
});
