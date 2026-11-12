import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInitialPictures, INITIAL_VIEWS, INITIAL_WIDTHS } from '../site/initial-pictures.mjs';
import { livelySamples } from '../site/demo.js';
import { SAMPLE, clone, monthFacts } from './helpers/facts.mjs';

const floorViews = ['office', 'week', 'month'];
const widths = [376, 768, 1088];
const samples = Object.fromEntries(['night', 'day'].map(sky => [sky,
  Object.fromEntries(floorViews.map(view => {
    const facts = view === 'month' ? monthFacts() : clone(SAMPLE);
    facts.now = { ...facts.now, is_night: sky === 'night', hour: sky === 'night' ? 1 : 14 };
    facts.live.desks.forEach((desk, index) => { desk.agent = ['claude', 'codex', 'grok'][index % 3]; });
    return [view, facts];
  })),
]));

function dimensions(svg) {
  const match = /^<svg\b[^>]*width="(\d+)" height="(\d+)" viewBox="([\d. ]+)"/.exec(svg);
  assert.ok(match, 'a startup picture has explicit native dimensions');
  const [x, y, w, h] = match[3].split(' ').map(Number);
  return { width: Number(match[1]), height: Number(match[2]), x, y, w, h };
}

test('startup width coverage includes every supported native layout', () => {
  assert.equal(INITIAL_WIDTHS.length, 179);
  assert.equal(INITIAL_WIDTHS[0], 376);
  assert.equal(INITIAL_WIDTHS.at(-1), 1088);
  for (let index = 1; index < INITIAL_WIDTHS.length; index++) {
    assert.equal(INITIAL_WIDTHS[index] - INITIAL_WIDTHS[index - 1], 4, 'the table has no missing width');
  }
  assert.deepEqual(INITIAL_VIEWS, ['office', 'week', 'month', 'front', 'subway']);
});

test('prebuilt startup pictures and heights match the responsive renderer', async t => {
  // Import the real browser helper in an isolated layout, so these tests do not
  // rely on generated site/lib/ or an earlier local site build.
  const folder = await mkdtemp(path.join(tmpdir(), 'office-initial-pictures-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await cp(new URL('../plugin/lib/', import.meta.url), path.join(folder, 'lib'), { recursive: true });
  await cp(new URL('../plugin/themes/', import.meta.url), path.join(folder, 'themes'), { recursive: true });
  for (const name of ['render-pictures.js', 'pictures.mjs']) {
    await writeFile(path.join(folder, name), await readFile(new URL(`../site/${name}`, import.meta.url)));
  }
  await writeFile(path.join(folder, 'package.json'), '{"type":"module"}');
  const { renderPictures } = await import(pathToFileURL(path.join(folder, 'render-pictures.js')));

  const before = clone(samples);
  const initial = createInitialPictures(samples, { widths });
  const lively = livelySamples(samples);
  assert.deepEqual(samples, before, 'build-time preparation leaves the shared sample data untouched');
  assert.deepEqual(initial.widths, widths);
  const expected = new Map();
  for (const sky of ['night', 'day']) for (const animate of [true, false]) for (const width of widths) {
    expected.set(`${sky}:${animate}:${width}`, renderPictures(lively, { sky, width, animate, views: floorViews }));
  }

  await t.test('night assets preserve every SVG byte, native scale and responsive floor height', () => {
    for (const animate of [true, false]) for (const width of widths) {
      const rendered = expected.get(`night:${animate}:${width}`);
      // The street (front and subway) is cut from the week's drawing, as the worker does it.
      const crops = { ...rendered.drawings, ...rendered.street };
      for (const view of INITIAL_VIEWS) {
        const file = `initial-${view}-${width}${animate ? '' : '-still'}.svg`;
        const svg = initial.pictures.get(file);
        assert.equal(svg, crops[view], `${file}: exact live-renderer source`);
        const box = dimensions(svg);
        assert.equal(box.width, width, `${file}: correct first-draw width`);
        assert.equal(box.width / box.w, 2, `${file}: native two-pixel horizontal scale`);
        assert.equal(box.height / box.h, 2, `${file}: native two-pixel vertical scale`);
        assert.ok(box.height > 0);
      }
    }
    assert.equal(initial.pictures.size, widths.length * INITIAL_VIEWS.length * 2);
    assert.ok([...initial.pictures.keys()].every(file => /^initial-(office|week|month|front|subway)-\d+(-still)?\.svg$/.test(file)));
  });

  await t.test('layout tables reserve the exact five-crop geometry in both skies and motion settings', () => {
    for (const sky of ['night', 'day']) for (const animate of [true, false]) {
      const rows = initial.layouts[sky][animate ? 'animated' : 'still'];
      assert.equal(rows.length, widths.length);
      for (const [index, width] of widths.entries()) {
        const rendered = expected.get(`${sky}:${animate}:${width}`);
        const crops = { ...rendered.drawings, ...rendered.street };
        assert.deepEqual(rows[index], INITIAL_VIEWS.map(view => dimensions(crops[view]).height), `${sky}/${animate}/${width}`);
      }
    }
  });

  await t.test('asset statistics count the generated files and their UTF-8 bytes', () => {
    assert.equal(initial.stats.count, initial.pictures.size);
    assert.equal(initial.stats.bytes, [...initial.pictures.values()].reduce((sum, svg) => sum + Buffer.byteLength(svg), 0));
  });

  await t.test('selected generation options avoid unrelated skies, modes and assets', () => {
    const selected = createInitialPictures(samples, { widths: [376], skies: ['day'], motions: [false] });
    assert.equal(selected.pictures.size, 0, 'day metadata does not create night startup files');
    assert.equal(selected.layouts.day.still.length, 1);
    assert.deepEqual(selected.layouts.day.still[0], initial.layouts.day.still[0]);
    assert.equal(selected.layouts.day.animated, undefined);
    assert.equal(selected.layouts.night, undefined);
  });
});
