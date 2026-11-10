import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { fingerprintSite } from '../site/fingerprint.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'office-site-cache-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = {
    'index.html': `<!doctype html>
<script>const initialFiles = /* build:initial-files */ null;</script>
<script type="module" src="main.js"></script>
<link rel="stylesheet" href="style.css">
<img src="img/initial-office-376.svg" srcset="img/initial-office-376.svg 1x, img/initial-office-376-still.svg 2x">
<meta property="og:image" content="https://example.com/og.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png"><a href="install.md">Install</a>`,
    'alternative/index.html': '<!doctype html><base href="../"><script type="module" src="main.js"></script><img src="img/office-day.svg">',
    'main.js': `import { createRenderer } from './picture-renderer.js';
import { assetPath } from './asset-path.js';
export const scenery = () => import('./scenery.js');
export const sample = () => fetch(new URL('./sample.json', import.meta.url));
export const picture = width => assetPath(\`img/initial-office-\${width}.svg\`);
export { createRenderer };`,
    'picture-renderer.js': `export const createRenderer = () => new Worker(new URL('./pictures-worker.js', import.meta.url), { type: 'module' });`,
    'pictures-worker.js': `import { color } from './lib/color.mjs'; self.postMessage(color);`,
    'lib/color.mjs': `export const color = 'red';`,
    'scenery.js': `export const sky = 'night';`,
    'asset-path.js': 'export const assetPath = file => file;',
    'style.css': '@font-face { font-family: Office; src: url("fonts/office.woff2?#font"); } .picture { background: url(img/office-day.svg); }',
    'fonts/office.woff2': Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 1]),
    'sample.json': '{"sky":"night"}',
    'img/initial-office-376.svg': '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>',
    'img/initial-office-376-still.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'img/office-day.svg': '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="yellow"/></svg>',
    'og.png': Buffer.from('fixed share card'),
    'apple-touch-icon.png': Buffer.from('fixed touch icon'),
    'install.md': '# Install\n',
    'voxel/ignored.js': 'export const notBuiltHere = true;',
    'build.mjs': '// build source is not a browser asset',
    'serve.mjs': '// server source is not a browser asset',
  };
  for (const [name, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), contents);
  }
  const read = name => fs.readFileSync(path.join(root, name), 'utf8');
  const build = () => {
    fingerprintSite(root);
    return JSON.parse(read('assets/manifest.json'));
  };
  return { root, files, read, build };
}

function relative(from, to) {
  const result = path.posix.relative(path.posix.dirname(from), to);
  return result.startsWith('.') ? result : `./${result}`;
}

function headersByPath(text) {
  const rules = new Map();
  let current;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (line.startsWith('/')) { current = line.trim(); rules.set(current, {}); }
    else {
      const [, name, value] = line.match(/^\s+([^:]+):\s*(.*)$/) ?? [];
      assert.ok(current && name, `invalid header rule: ${line}`);
      rules.get(current)[name.toLowerCase()] = value;
    }
  }
  return rules;
}

test('publish URLs cover module workers, lazy imports, CSS resources and HTML base/srcset references', async t => {
  const app = fixture(t);
  const manifest = app.build();
  const entry = app.read(manifest['main.js']);
  for (const dependency of ['picture-renderer.js', 'asset-path.js', 'scenery.js', 'sample.json']) {
    assert.ok(entry.includes(relative(manifest['main.js'], manifest[dependency])), `${dependency} points at its versioned URL`);
  }
  assert.ok(app.read(manifest['picture-renderer.js']).includes(relative(manifest['picture-renderer.js'], manifest['pictures-worker.js'])), 'module worker entry is rewritten');
  assert.ok(app.read(manifest['pictures-worker.js']).includes(relative(manifest['pictures-worker.js'], manifest['lib/color.mjs'])), 'worker dependencies are rewritten');
  const css = app.read(manifest['style.css']);
  assert.ok(css.includes(`${relative(manifest['style.css'], manifest['fonts/office.woff2']).replace(/^\.\//, '')}?#font`), 'font URL retains its query and fragment');
  assert.ok(css.includes(relative(manifest['style.css'], manifest['img/office-day.svg']).replace(/^\.\//, '')), 'unquoted CSS url is versioned');
  const page = app.read('assets/pages/index.html');
  assert.ok(page.includes(`src="${relative('index.html', manifest['main.js'])}"`));
  assert.ok(page.includes(`href="${relative('index.html', manifest['style.css'])}"`));
  assert.ok(page.includes(`srcset="${relative('index.html', manifest['img/initial-office-376.svg'])} 1x, ${relative('index.html', manifest['img/initial-office-376-still.svg'])} 2x"`));
  assert.ok(page.includes(manifest['img/initial-office-376.svg']), 'head prefetch lookup uses the same picture as the main renderer');
  assert.doesNotMatch(page, /build:initial-files\s*\*\/\s*null/);
  const alternative = app.read('assets/pages/alternative/index.html');
  assert.ok(alternative.includes('<base href="../">'));
  assert.ok(alternative.includes(`src="${relative('index.html', manifest['main.js'])}"`), 'nested page references resolve from its declared site-root base');

  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'https://example.com/project/' } });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });
  const { assetPath } = await import(pathToFileURL(path.join(app.root, manifest['asset-path.js'])));
  assert.equal(new URL(assetPath('img/initial-office-376.svg'), document.baseURI).href,
    `https://example.com/project/${manifest['img/initial-office-376.svg']}`, 'computed picture paths work under a repository URL prefix');
});

test('immutable rules name only existing final-byte hashes; fixed public URLs and HTML revalidate', t => {
  const app = fixture(t);
  const manifest = app.build();
  const rules = headersByPath(app.read('_headers'));
  const immutable = [...rules].filter(([, headers]) => headers['cache-control']?.includes('immutable'));
  assert.deepEqual(immutable.map(([name]) => name).sort(), Object.values(manifest).map(name => `/${name}`).sort());
  for (const [name, headers] of immutable) {
    assert.doesNotMatch(name, /[*:]/, 'an unknown URL or 404 cannot match a long-cache wildcard');
    assert.equal(headers['cache-control'], 'public, max-age=31536000, immutable');
    const bytes = fs.readFileSync(path.join(app.root, name.slice(1)));
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    assert.ok(name.includes(`.${hash}.`), `${name} is derived from the bytes actually served`);
  }
  for (const name of ['/', '/index.html', '/alternative/', '/alternative/index.html', '/og.png', '/apple-touch-icon.png', '/install.md']) {
    assert.equal(rules.get(name)?.['cache-control'], 'public, max-age=0, must-revalidate', `${name} keeps revalidating`);
  }
  for (const name of ['og.png', 'apple-touch-icon.png', 'install.md', 'build.mjs', 'serve.mjs', 'voxel/ignored.js']) {
    assert.equal(manifest[name], undefined, `${name} is not fingerprinted by the landing build`);
  }
  for (const [name, original] of Object.entries(app.files)) {
    assert.deepEqual(fs.readFileSync(path.join(app.root, name)), Buffer.from(original), `${name} source remains untouched`);
  }
  const pages = JSON.parse(app.read('assets/pages.json'));
  assert.equal(pages['index.html'], 'assets/pages/index.html');
  assert.equal(pages['alternative/index.html'], 'assets/pages/alternative/index.html');
  const redirects = app.read('_redirects').split('\n').filter(line => line.trim() && !line.startsWith('#'));
  for (const route of ['/', '/index.html', '/alternative/', '/alternative/index.html']) {
    const rule = redirects.find(line => line.split(/\s+/)[0] === route);
    assert.ok(rule, `${route} serves generated HTML`);
    const [, target, status] = rule.split(/\s+/);
    assert.equal(status, '200!');
    assert.ok(fs.existsSync(path.join(app.root, target.slice(1))), `${route} rewrite names an existing page`);
  }
  assert.ok(redirects.every(line => !line.includes('*')), 'HTML rewrites leave unknown assets and 404s alone');
});

test('unchanged builds retain URLs; a leaf edit updates every importer and removes obsolete output', t => {
  const app = fixture(t);
  const first = app.build();
  const firstHeaders = app.read('_headers');
  assert.deepEqual(app.build(), first, 'building generated output again is deterministic');
  assert.equal(app.read('_headers'), firstHeaders);
  fs.writeFileSync(path.join(app.root, 'lib/color.mjs'), `export const color = 'blue';`);
  const second = app.build();
  for (const name of ['lib/color.mjs', 'pictures-worker.js', 'picture-renderer.js', 'main.js']) {
    assert.notEqual(second[name], first[name], `${name} URL changes when its transitive dependency changes`);
    assert.equal(fs.existsSync(path.join(app.root, first[name])), false, 'obsolete generated files are removed');
    assert.ok(fs.existsSync(path.join(app.root, second[name])));
  }
  for (const name of ['style.css', 'scenery.js', 'sample.json', 'img/office-day.svg']) {
    assert.equal(second[name], first[name], `${name} keeps its URL when its bytes and dependencies are unchanged`);
  }
  assert.ok(app.read('assets/pages/index.html').includes(second['main.js']));
  assert.ok(!app.read('_headers').includes(first['main.js']), 'old hashes receive no lingering immutable rules');
});

test('a computed image edit updates the lookup, its importers and the inline preload together', async t => {
  const app = fixture(t);
  const first = app.build();
  fs.writeFileSync(path.join(app.root, 'img/initial-office-376.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><path fill="blue" d="M0 0h2v2z"/></svg>');
  const second = app.build();
  for (const name of ['img/initial-office-376.svg', 'asset-path.js', 'main.js']) {
    assert.notEqual(second[name], first[name], `${name} URL changes with the computed image`);
    assert.equal(fs.existsSync(path.join(app.root, first[name])), false);
  }
  for (const name of ['style.css', 'scenery.js', 'pictures-worker.js', 'sample.json', 'img/office-day.svg']) {
    assert.equal(second[name], first[name], `${name} has no dependency on the edited image`);
  }
  const page = app.read('assets/pages/index.html');
  const [, initialFiles] = page.match(/const initialFiles = ([^;\n]+);/);
  assert.equal(JSON.parse(initialFiles)['376'], second['img/initial-office-376.svg'], 'inline preload and runtime lookup share the current image URL');
  assert.ok(page.includes(relative('index.html', second['img/initial-office-376.svg'])), 'HTML picture references change too');
  assert.ok(!page.includes(first['img/initial-office-376.svg']), 'the generated page contains no obsolete picture URL');

  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { baseURI: 'https://example.com/project/' } });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  });
  const { assetPath } = await import(pathToFileURL(path.join(app.root, second['asset-path.js'])));
  assert.equal(assetPath('img/initial-office-376.svg'), `https://example.com/project/${second['img/initial-office-376.svg']}`);
  assert.equal(assetPath('img/unknown.svg'), 'https://example.com/project/img/unknown.svg', 'unknown paths remain fixed URLs');
  const rules = headersByPath(app.read('_headers'));
  assert.equal(rules.get('/img/unknown.svg'), undefined, 'an unknown image cannot receive an immutable rule');
});
