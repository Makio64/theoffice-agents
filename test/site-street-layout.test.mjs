import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

for (const entry of ['../site/footer.js', '../site/alternative/simple/footer.js']) {
  test(`${entry}: picture loads share a frame and responsive street geometry is measured before mutations`, async () => {
    const operations = [];
    const callbacks = new Map();
    let frame = 0;
    let footerWidth = 1440;
    let pictureWidth = 1088;
    const styles = () => ({ values: {}, setProperty(key, value) { operations.push('write'); this.values[key] = value; } });
    const walkers = Array.from({ length: 3 }, () => ({ style: styles() }));
    const subway = {
      get clientWidth() { operations.push('read'); return pictureWidth; },
      getAttribute() { return '1088'; }, parentElement: { style: styles() },
    };
    const entrance = {
      get clientWidth() { operations.push('read'); return pictureWidth; },
      getAttribute() { return '1088'; },
    };
    const footer = {
      get clientWidth() { operations.push('read'); return footerWidth; },
      style: styles(), querySelector() { return subway; }, querySelectorAll() { return walkers; },
    };
    const context = vm.createContext({
      document: { querySelector(selector) { return selector === '#street' ? footer : entrance; } },
      requestAnimationFrame(callback) { callbacks.set(++frame, callback); return frame; },
      cancelAnimationFrame(id) { callbacks.delete(id); },
    });
    // Only exercise the public layout operation; sprite drawing dependencies are unrelated to its DOM contract.
    const source = (await readFile(new URL(entry, import.meta.url), 'utf8'))
      .replace(/^import .*;\n/gm, '').replace(/export function /g, 'function ')
      .replace(/import\.meta\.url/g, JSON.stringify(new URL(entry, import.meta.url).href));
    vm.runInContext(`${source}\nglobalThis.refresh = updateStreet;`, context);
    const flush = () => {
      const queued = [...callbacks.values()]; callbacks.clear();
      for (const callback of queued) callback();
    };

    for (let i = 0; i < 10; i++) context.refresh();
    assert.equal(callbacks.size, 1, 'a burst of image loads queues one street update');
    assert.equal(operations.length, 0, 'image load handlers leave the DOM untouched until that frame');
    flush();
    assert.deepEqual(operations.slice(0, 3), ['read', 'read', 'read']);
    assert.ok(operations.slice(3).every(operation => operation === 'write'), 'no dimension reads can force layout after a mutation');
    assert.equal(footer.style.values['--footer-walk-distance'], '1560px');
    assert.equal(footer.style.values['--footer-walker-size'], '50px');
    assert.equal(subway.parentElement.style.values['--picture-scale'], '1.000');
    assert.equal(walkers[0].style.values['--duration'], '52.00s');
    assert.equal(walkers[0].style.values['--still-x'], '332px');

    operations.length = 0;
    context.refresh();
    // A resize occurring in the same frame uses its latest dimensions, rather than stale image-load geometry.
    footerWidth = 390;
    pictureWidth = 376;
    context.refresh();
    assert.equal(callbacks.size, 1);
    flush();
    assert.equal(footer.style.values['--footer-walk-distance'], '512px');
    assert.equal(footer.style.values['--footer-walker-size'], '17.27941176470588px');
    assert.equal(subway.parentElement.style.values['--picture-scale'], '0.346');
    assert.equal(walkers[0].style.values['--duration'], '17.07s');
    assert.equal(walkers[0].style.values['--still-x'], '90px');
    assert.ok(operations.slice(3).every(operation => operation === 'write'));
  });
}
