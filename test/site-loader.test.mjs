import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constructionMask } from '../site/loader.js';

const covered = (mask, x, y) => y < mask.opaqueHeight || mask.cells.some(([left, top, width, height]) =>
  x >= left && x < left + width && y >= top && y < top + height);

for (const [width, height] of [[1920, 1080], [390, 844], [320, 740]]) {
  test(`construction reveal opens from the bottom and never covers a revealed pixel at ${width}×${height}`, () => {
    const start = constructionMask(width, height, 0);
    const end = constructionMask(width, height, 1);
    assert.equal(start.opaqueHeight, height, 'the first frame covers the full viewport');
    assert.equal(end.opaqueHeight, 0);
    assert.deepEqual(end.cells, [], 'the last frame fully reveals the site');
    assert.ok(start.cell >= 16, 'the reveal uses large pixel blocks');

    const early = constructionMask(width, height, 0.25);
    const late = constructionMask(width, height, 0.75);
    assert.ok(covered(early, width / 2, height / 4), 'the upper building remains covered early');
    assert.equal(covered(early, width / 2, height - 1), false, 'the foundations appear first');
    assert.equal(covered(late, width / 2, height * 3 / 4), false, 'the lower screen stays revealed');

    const opened = new Set();
    for (let frame = 0; frame <= 40; frame++) {
      const mask = constructionMask(width, height, frame / 40);
      for (let y = 0; y < height; y += mask.cell) {
        for (let x = 0; x < width; x += mask.cell) {
          const key = `${x}:${y}`;
          const opaque = covered(mask, x, y);
          if (opened.has(key)) assert.equal(opaque, false, 'a revealed block never flashes closed');
          if (!opaque) opened.add(key);
        }
      }
      for (const [x, y, w, h] of mask.cells) {
        assert.ok(x >= 0 && y >= 0 && x + w <= width && y + h <= height, 'frontier blocks fit the viewport');
      }
    }
  });
}

test('the meter heads forward through the stages and never claims the next one early', async () => {
  const { STAGES, loaderGoal } = await import('../site/loader.js');
  const order = ['script', 'drawing', 'pictures', 'open'];
  order.reduce((previous, stage) => {
    assert.ok(STAGES[stage].floor >= previous, `${stage} starts after the stage before it`);
    return STAGES[stage].floor;
  }, 0);
  for (const stage of order.slice(0, 3)) {
    let last = 0;
    for (const elapsed of [0, 250, 1000, 4000, 60000]) {
      const goal = loaderGoal({ stage, requested: 3, loaded: 1, elapsed });
      assert.ok(goal >= last, `${stage} keeps moving while it waits`);
      assert.ok(goal >= STAGES[stage].floor && goal < STAGES[stage].to, `${stage} stays inside its own share`);
      last = goal;
    }
  }
  assert.ok(loaderGoal({ stage: 'pictures', requested: 3, loaded: 3 }) > loaderGoal({ stage: 'pictures', requested: 3, loaded: 1 }),
    'each picture that arrives moves the meter');
  assert.equal(loaderGoal({ stage: 'open' }), 1);
});

const page = await import('node:fs').then(fs => fs.readFileSync(new URL('../site/index.html', import.meta.url), 'utf8'));
const cssUrl = (markup) => `url("data:image/svg+xml,${markup.replace(/"/g, "'").replace(/[%#<>]/g, encodeURIComponent)}")`;
// sky.js and art.js read site/data.js, which site/build.mjs writes (it is not in git): a fresh clone skips these two
const built = await import('node:fs').then(fs => fs.existsSync(new URL('../site/data.js', import.meta.url)));
const needsBuild = { skip: !built && 'needs the site built first: node site/build.mjs' };

test('the loader paints from the page alone: its sky, stars and type are inline, the stylesheets wait below it', needsBuild, async () => {
  const fs = await import('node:fs');
  const { bandTile, skyBands, starsSvg } = await import('../site/sky.js');
  const head = page.slice(0, page.indexOf('</head>'));
  assert.doesNotMatch(head, /<link rel="stylesheet"/, 'no stylesheet holds back the first frame');
  const loaderAt = page.indexOf('id="site-loader"');
  const sheets = [...page.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)];
  assert.ok(sheets.length >= 5 && sheets.every(sheet => sheet.index > loaderAt), 'the page\'s stylesheets come after the loader');
  assert.ok(sheets.every(sheet => fs.existsSync(new URL(`../site/${sheet[1]}`, import.meta.url)) || sheet[1] === 'art.css'), 'every stylesheet exists (art.css is built)');
  // The night as the page draws it (scenery.js), and its stars: a change to sky.js shows here first.
  assert.ok(head.includes(`--l-sky: ${cssUrl(bandTile(skyBands('night')))};`), 'the loader\'s sky is sky.js\'s night');
  const stars = starsSvg(320, 225);
  assert.ok(head.includes(`--l-stars: ${cssUrl(stars.replace(/<g class="twk"[^>]*>[\s\S]*?<\/g>/g, ''))};`), 'the loader\'s stars are sky.js\'s');
  const font = fs.readFileSync(new URL('../site/fonts/office-pixel.woff2', import.meta.url)).toString('base64');
  assert.ok(head.includes(`url(data:font/woff2;base64,${font})`), 'Office Pixel is inline, as fonts/office-pixel.woff2');
  assert.doesNotMatch(page, /press-start-2p/, 'the full Press Start 2P is not fetched');
});

test('wide dithered bands paint the same pixels as the pixel-by-pixel ones', needsBuild, async () => {
  const { bands } = await import('../site/art.js');
  // A rasterizer for what bands() writes: rect paths filled with a color or with a 2 × 1 pattern of one pixel.
  function raster(svg, w, h) {
    const grid = Array.from({ length: h }, () => Array(w).fill(null));
    const patterns = Object.fromEntries([...svg.matchAll(/<pattern id="(\w+)"[^>]*><path fill="([^"]+)" d="M(\d) 0h1v1h-1z"\/><\/pattern>/g)]
      .map(([, id, fill, x]) => [id, { fill, x: Number(x) }]));
    for (const [, fill, d] of svg.replace(/<defs>[\s\S]*?<\/defs>/, '').matchAll(/<path fill="([^"]+)" d="([^"]+)"\/>/g)) {
      const pattern = patterns[fill.match(/^url\(#(\w+)\)$/)?.[1]];
      for (const [, x, y, rw, rh] of d.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)h-\d+z/g)) {
        for (let yy = +y; yy < +y + +rh; yy++) for (let xx = +x; xx < +x + +rw; xx++) {
          if (!pattern) grid[yy][xx] = fill;
          else if (xx % 2 === pattern.x) grid[yy][xx] = pattern.fill;
        }
      }
    }
    return grid.map(row => row.join(','));
  }
  const list = [['#a00000', 7], ['#00b000', 9], ['#0000c0', 11], ['#d0d0d0', 6]];
  for (const t of [1, 2, 3]) {
    const narrow = bands(list, t, 4), wide = bands(list, t, 32);
    assert.match(wide.svg, /<pattern /, 'a wide tile uses patterns');
    const tiled = raster(narrow.svg, 4, narrow.h).map(row => Array(8).fill(row).join(','));
    assert.ok(tiled.every(row => row.split(',').every(Boolean)), 'the bands cover every pixel');
    assert.deepEqual(raster(wide.svg, 32, wide.h), tiled, `t = ${t}: the same dither, every row`);
  }
});

test('the first view does not wait for the sky\'s decoration or the guide', async () => {
  const fs = await import('node:fs');
  const main = fs.readFileSync(new URL('../site/main.js', import.meta.url), 'utf8');
  // Static imports are part of main.js's own download and evaluation; these load beside it and are mounted later.
  for (const module of ['scenery.js', 'dialogue.js', 'spotlight.js']) {
    assert.doesNotMatch(main, new RegExp(`^import [^;]*from '\\./${module.replace('.', '\\.')}'`, 'm'), `${module} is not a static import`);
    assert.match(main, new RegExp(`import\\('\\./${module.replace('.', '\\.')}'\\)`), `${module} is imported on demand`);
  }
});
