import * as art from '../../art.js';
import { CAST, LAMPS } from '../../data.js';
import { figure } from '../../lib/svg-kit.mjs';

const COMMANDS = [
  '/plugin install theoffice --marketplace Makio64/theoffice-agents',
  '/theoffice',
];
// The desktop app's chat gets a prompt instead: a /plugin typed there only opens Settings, so Claude follows the steps
// in install.md (site/install.md), with the app's own Claude Code where `claude` is not on the PATH.
const PROMPT = "Install The Office for me by following https://theoffice.makio.io/install.md";
const attr = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// a long command breaks at its spaces, never inside the option or the repository's name (style.css .keep); the copy
// keeps its text
const shown = (command) => command.replace(/ --marketplace (\S+)$/, ' <span class="keep">--marketplace</span> <span class="keep">$1</span>');
const WALKERS = [
  { agent: 'claude', speed: 7.5, at: .23, lane: 6 },
  { agent: 'codex', speed: 5.7, at: .61, lane: 9, reverse: true },
  { agent: 'gemini', speed: 9, at: .84, lane: 4 },
];
let dispose;
let streetFrame = 0;

/** Refit once before the next paint, even when several responsive pictures load together. */
export function updateStreet() {
  if (streetFrame) return;
  streetFrame = requestAnimationFrame(() => {
    streetFrame = 0;
    layoutStreet();
  });
}

function layoutStreet() {
  const footer = document.querySelector('#street');
  if (!footer) return;
  const subway = footer.querySelector('#simple-subway');
  const entrance = document.querySelector('#simple-front');
  // Read every dimension before changing inherited properties on the sidewalk's SVGs.
  const subwayScale = subway ? subway.clientWidth / (Number(subway.getAttribute('width')) || 1088) : null;
  const scale = entrance ? Math.min(1, entrance.clientWidth / (Number(entrance.getAttribute('width')) || 1088)) : 1;
  const width = footer.clientWidth;
  const distance = Math.ceil((width + 120) / 4) * 4;
  if (subway) subway.parentElement.style.setProperty('--picture-scale', subwayScale.toFixed(3));
  footer.style.setProperty('--footer-walk-distance', `${distance}px`);
  footer.style.setProperty('--footer-walker-size', `${50 * scale}px`);
  footer.querySelectorAll('.footer-walker').forEach((walker, index) => {
    const config = WALKERS[index];
    const duration = distance / (config.speed * 4);
    walker.style.setProperty('--duration', `${duration.toFixed(2)}s`);
    walker.style.setProperty('--delay', `${(-duration * config.at).toFixed(2)}s`);
    walker.style.setProperty('--steps', distance / 4);
    walker.style.setProperty('--still-x', `${Math.round(width * config.at / 2) * 2}px`);
  });
}

/** Restore the original street and put the installation console below its train. */
export function mountFooter() {
  dispose?.();
  const footer = document.querySelector('footer#street');
  if (!footer) return () => {};
  footer.classList.add('street');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  const timers = new Set();
  const copy = (index, last = false, text) => `<button class="${last ? 'btn lit sq' : 'key'} copy" type="button" data-copy="${index}"${text ? ` data-text="${attr(text)}"` : ''} aria-label="Copy ${['install command', 'open command', 'install prompt'][index]}" title="Copy ${text ? 'prompt' : 'command'}">${art.iconSvg('copy')}</button>`;
  footer.innerHTML = `
    <div class="walk" id="walk" aria-hidden="true"></div>
    <div class="road" aria-hidden="true"></div>
    <div class="far-walk" aria-hidden="true"></div>
    <div class="underground">
      <div class="tracks"><img id="simple-subway" src="${new URL('../../img/subway-night.svg', import.meta.url).href}" width="1088" height="80" alt="Sample commits riding the train under the street, one green parcel per commit."></div>
      <section class="footer-install" aria-labelledby="move-in">
        <div class="term" id="install" role="group" aria-labelledby="move-in">
          <h2 class="box-title" id="move-in">Move in.</h2>
          <div class="screen">
            <div class="line note"><span class="cmd">Run in Claude Code</span></div>
            <div class="line"><span class="pr" aria-hidden="true">&gt;</span><code class="cmd">${shown(COMMANDS[0])}</code>${copy(0)}</div>
            <div class="line note"><span class="cmd"># in the desktop app, paste this prompt instead</span></div>
            <div class="line"><span class="pr" aria-hidden="true">&gt;</span><code class="cmd">${PROMPT}</code>${copy(2, false, PROMPT)}</div>
            <div class="line note"><span class="cmd"># then, in a new session</span></div>
            <div class="line go"><span class="pr" aria-hidden="true">&gt;</span><code class="cmd">${COMMANDS[1]}</code>${copy(1, true)}</div>
          </div>
        </div>
        <p class="footer-requirements">Claude Code 2.1.308+ · Node 24+</p>
        <p class="footer-copy-status" role="status" aria-live="polite"></p>
      </section>
      <p class="credit"><span>MIT · made by <a href="https://github.com/Makio64">Makio64</a></span></p>
    </div>
    <div class="bedrock" aria-hidden="true"></div>`;

  const walk = footer.querySelector('#walk');
  const lamp = art.streetLampSvg();
  walk.innerHTML = ['l', 'r'].map((side) => `<span class="pool ${side}"></span><span class="lamp-post ${side}">${lamp}<i class="halo"></i></span>`).join('') +
    LAMPS.map((x) => `<span class="pool door" style="--at:${x}px"></span>`).join('') +
    WALKERS.map(({ agent, lane, reverse }) => `<span class="footer-walker${reverse ? ' reverse' : ''}" data-agent="${agent}" style="bottom:${lane}px"><span class="walker-figure"></span></span>`).join('');

  function drawWalkers() {
    walk.querySelectorAll('.footer-walker').forEach((walker, index) => {
      const { agent, reverse } = WALKERS[index];
      if (!CAST.some((member) => member.id === agent)) return;
      const body = figure({ animate: !motion.matches }, agent, { legs: 'walk', look: [reverse ? -2 : 2, 0], blinkAt: -1.3 - index });
      walker.querySelector('.walker-figure').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="30" viewBox="0 0 25 15" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
    });
  }
  drawWalkers();
  motion.addEventListener('change', drawWalkers, { signal: listeners.signal });

  footer.querySelectorAll('[data-copy]').forEach((button) => {
    const label = button.getAttribute('aria-label');
    let reset;
    button.addEventListener('click', async () => {
      const command = button.parentElement.querySelector('code.cmd');
      const status = footer.querySelector('.footer-copy-status');
      let copied = false;
      try { await navigator.clipboard.writeText(button.dataset.text ?? command.textContent); copied = true; } catch {
        const range = document.createRange();
        range.selectNodeContents(command);
        const selection = getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      if (listeners.signal.aborted) return;
      button.innerHTML = art.iconSvg(copied ? 'check' : 'copy');
      button.classList.toggle('ok', copied);
      const what = button.dataset.text ? 'prompt' : 'command';
      button.setAttribute('aria-label', copied ? `Copied ${what}` : `${what === 'prompt' ? 'Prompt' : 'Command'} selected`);
      button.title = copied ? 'Copied' : `${what === 'prompt' ? 'Prompt' : 'Command'} selected`;
      status.textContent = copied ? (button.dataset.text ? 'Prompt copied: paste it into the chat.' : 'Command copied.') : 'Command selected. Use your device’s copy command.';
      clearTimeout(reset);
      timers.delete(reset);
      reset = setTimeout(() => {
        button.innerHTML = art.iconSvg('copy');
        button.classList.remove('ok');
        button.setAttribute('aria-label', label);
        button.title = `Copy ${button.dataset.text ? 'prompt' : 'command'}`;
        status.textContent = '';
        timers.delete(reset);
      }, 2400);
      timers.add(reset);
    }, { signal: listeners.signal });
  });
  footer.querySelector('#simple-subway').addEventListener('load', updateStreet, { signal: listeners.signal });
  addEventListener('resize', updateStreet, { signal: listeners.signal });
  updateStreet();
  dispose = () => {
    cancelAnimationFrame(streetFrame);
    streetFrame = 0;
    listeners.abort();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
  return dispose;
}
