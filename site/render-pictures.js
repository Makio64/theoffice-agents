// The responsive floors use exactly the same renderer and crops as the static pictures.
import { renderSvg } from './lib/svg.mjs';
import * as kit from './lib/svg-kit.mjs';
import { EDGE, pictureParts } from './pictures.mjs';

const parts = pictureParts(kit);

export function renderPictures(samples, { sky, width, animate, views }) {
  const options = { width: width + EDGE * 4, animate, quiet: true };
  const drawings = {};
  let street;
  for (const name of views) {
    const source = renderSvg(samples[sky][name], { ...options, view: name === 'office' ? 'live' : name, idPrefix: `simple-${name}-${sky}` });
    drawings[name] = parts.rooms(source, name);
    if (name === 'week') street = parts.ground(source);
  }
  return { drawings, street };
}
