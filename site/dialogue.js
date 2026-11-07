// The promo's RPG text box, brought into the office: the same palette, 36 letters a second and yellow ▼. It is docked in
// the console's case under the screen (shell.css), its keys a command list beside it.
import { menuIconSvg, renderMenu } from './lib/svg-menu.mjs';

const PAGES = {
  welcome: [
    'Welcome to */theoffice*.\nA Claude Code extension.',
    'Your coding agents share one *pixel-art office*.\nChoose a view to look inside.',
  ],
  live: [
    'See what your agents are doing *right now*.',
    'A room is a *project*. A desk is a *session*.\nA big *?* means an agent needs you.',
    'The bar on top counts who is *working*,\nwho *needs you* and who is on a break.',
  ],
  today: [
    'See what your agents have worked on *today*.',
    'Follow the day project by project,\nwith the time each agent spent at work.',
  ],
  week: [
    'See which *projects* they worked on this *week*.',
    'One floor per project, one window per day:\neach window shows that day\'s *hours*.',
  ],
  month: [
    'Look back through your *monthly activity*.',
    'Each date keeps the work your agents did.\nThe calendar changes with the *seasons*.',
    'Beside it, *the crew*: which AI did the work,\nand for how long.',
  ],
  work: [
    'Find out *what they did* while you were away.',
    'Coding, testing, reading and more:\ntheir tool calls become a picture of the work.',
  ],
  install: [
    'Ready to move in? Install */theoffice*\nfrom *Claude Code* or *Claude Desktop* below.',
    'Then open a *new session* and type */theoffice*.\nYour own agents will be waiting inside.',
  ],
  sky: [
    'Morning or midnight, the office keeps going.\nSwitch the lights to see it in *day or night*.',
  ],
};
const TOPICS = [['live', 'Live'], ['week', 'Week'], ['month', 'Month'], ['install', 'Install']];
const MORE = '<svg viewBox="0 0 7 5" width="21" height="15" aria-hidden="true"><path fill="#ffd23f" d="M0 0h7v1H0zM1 1h5v1H1zM2 2h3v1H2zM3 3h1v1H3z"/><path fill="#000" fill-opacity=".4" d="M1 4h5v1H1z"/></svg>';

/** Mount before the first draw; call start() after the loader has revealed the sized office. */
export function mountDialogue({ autoStart = true } = {}) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 599px)');
  const listeners = new AbortController();
  const { signal } = listeners;
  const panel = document.createElement('aside');
  panel.className = 'office-dialogue';
  panel.setAttribute('aria-label', 'The Office guide');
  panel.hidden = !autoStart;
  panel.innerHTML = `
    <div class="office-dialogue-board">
      <span class="office-dialogue-name" aria-hidden="true">THE OFFICE</span>
      <button class="office-dialogue-page" type="button" aria-label="Finish the message" aria-describedby="office-dialogue-message">
        <span class="office-dialogue-text" aria-hidden="true"></span>
        <span class="office-dialogue-more" aria-hidden="true">${MORE}</span>
      </button>
      <p class="office-dialogue-sr" id="office-dialogue-message" role="status" aria-live="polite" aria-atomic="true"></p>
    </div>
    <nav class="office-dialogue-topics" aria-label="Ask about the office"><span class="office-dialogue-deck" aria-hidden="true"></span>${TOPICS.map(([id, label]) => `<button type="button" data-dialogue-topic="${id}" aria-pressed="false"><span class="office-dialogue-ico" aria-hidden="true">${menuIconSvg(id === 'install' ? 'export' : id, { scale: 2, ink: '#ece2cd', accent: '#d77757' })}</span><span>${label}</span></button>`).join('')}</nav>`;
  document.body.append(panel);
  document.body.classList.add('has-office-dialogue');
  const pageButton = panel.querySelector('.office-dialogue-page');
  const visual = panel.querySelector('.office-dialogue-text');
  const announcement = panel.querySelector('#office-dialogue-message');
  const topics = panel.querySelector('.office-dialogue-topics');
  const deck = panel.querySelector('.office-dialogue-deck');
  const topicButtons = [...topics.querySelectorAll('button')];
  const install = document.querySelector('#install');
  const destinations = {
    live: document.querySelector('#live-title')?.closest('.building-floor'),
    week: document.querySelector('#weekly-title')?.closest('.building-floor'),
    month: document.querySelector('#monthly-title')?.closest('.building-floor'),
    install,
  };
  const bedrock = document.querySelector('#street .bedrock');
  const bedrockSpace = bedrock?.style.getPropertyValue('--dialogue-space');
  const bedrockSpacePriority = bedrock?.style.getPropertyPriority('--dialogue-space');
  const headingButtons = [];
  let topic = 'welcome';
  let page = 0;
  let letters = [];
  let count = 0;
  let frame = 0;
  let started = autoStart;
  let destroyed = false;
  let menuKey;
  let pressed = null;
  // While a topic key scrolls the page to its floor, the floors it passes keep quiet.
  let travelling = false;
  let travelTimer;
  let travelEnd;

  function drawTopicMenu() {
    if (!mobile.matches) {
      topics.classList.remove('is-app-menu');
      menuKey = undefined;
      return;
    }
    const width = topics.clientWidth;
    if (!width) return;
    const key = `${width}:${topic}:${pressed}`;
    if (key === menuKey) return;
    const row = renderMenu({ width, pressed, keys: TOPICS.map(([id, label]) => ({
      id, label, icon: id === 'install' ? 'export' : id, isOn: id === topic, isRepeatable: true,
    })) });
    deck.innerHTML = row.source;
    for (const button of topicButtons) {
      const zone = row.zones.find(zone => zone.id === button.dataset.dialogueTopic);
      button.style.setProperty('--topic-left', `${zone.x / row.W * 100}%`);
      button.style.setProperty('--topic-width', `${zone.w / row.W * 100}%`);
    }
    topics.classList.add('is-app-menu');
    menuKey = key;
  }

  function measure() {
    drawTopicMenu();
    if (!panel.hidden) {
      // the case sizes the screen above it to the guide (shell.css)
      const height = Math.ceil(panel.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--shell-dock', `${height}px`);
      const space = `${height + 32}px`;
      bedrock?.style.setProperty('--dialogue-space', space);
    }
  }
  let measureFrame = 0;
  const resize = new ResizeObserver(() => {
    if (measureFrame) return;
    measureFrame = requestAnimationFrame(() => { measureFrame = 0; measure(); });
  });
  resize.observe(panel);

  function finish() {
    cancelAnimationFrame(frame);
    frame = 0;
    while (count < letters.length) letters[count++].classList.add('on');
    panel.dataset.typing = 'false';
    pageButton.setAttribute('aria-label', page < PAGES[topic].length - 1 ? 'Next message' : 'Back to the welcome message');
  }

  function render() {
    cancelAnimationFrame(frame);
    visual.replaceChildren();
    letters = [];
    count = 0;
    let highlighted = false;
    const text = PAGES[topic][page];
    for (const ch of text) {
      if (ch === '*') { highlighted = !highlighted; continue; }
      if (ch === '\n') { visual.append(document.createElement('br')); continue; }
      const letter = document.createElement('span');
      letter.className = highlighted ? 'office-dialogue-letter key-word' : 'office-dialogue-letter';
      letter.textContent = ch;
      visual.append(letter);
      letters.push(letter);
    }
    announcement.textContent = text.replaceAll('*', '').replaceAll('\n', ' ');
    panel.dataset.typing = 'true';
    pageButton.setAttribute('aria-label', 'Finish the message');
    for (const button of topicButtons) button.setAttribute('aria-pressed', String(button.dataset.dialogueTopic === topic));
    drawTopicMenu();
    if (motion.matches) { finish(); return; }
    let from;
    const type = (now) => {
      from ??= now;
      const to = Math.min(letters.length, Math.floor((now - from) * 36 / 1000) + 1);
      while (count < to) letters[count++].classList.add('on');
      if (count < letters.length) frame = requestAnimationFrame(type);
      else finish();
    };
    frame = requestAnimationFrame(type);
  }

  function explain(next) {
    if (destroyed || !PAGES[next]) return;
    started = true;
    panel.hidden = false;
    topic = next;
    page = 0;
    render();
    measure();
  }

  /** The reader scrolled onto another section: talk about it. */
  function follow(next) {
    if (destroyed || !started || travelling || !PAGES[next] || next === topic) return;
    topic = next;
    page = 0;
    render();
  }

  /** The section in the middle of the screen (the page's scroll-padding keeps the case and the guide out of it, shell.css),
   *  or its top at the screen's top when it is taller than the screen. */
  function center(element) {
    const style = getComputedStyle(document.documentElement);
    const room = innerHeight - (parseFloat(style.scrollPaddingTop) || 0) - (parseFloat(style.scrollPaddingBottom) || 0);
    element.scrollIntoView({
      behavior: motion.matches ? 'instant' : 'smooth',
      block: element.getBoundingClientRect().height <= room ? 'center' : 'start',
    });
  }

  function travel() {
    travelling = true;
    travelEnd?.abort();
    travelEnd = new AbortController();
    const listening = { passive: true, signal: AbortSignal.any([signal, travelEnd.signal]) };
    const arrive = () => {
      travelEnd.abort();
      clearTimeout(travelTimer);
      // the spotlight settles a moment after the scroll stops: let it see where the page arrived, then listen again
      travelTimer = setTimeout(() => { travelling = false; }, 400);
    };
    // scrollend, or a quiet moment where it is missing (and on a page already in place)
    const wait = () => { clearTimeout(travelTimer); travelTimer = setTimeout(arrive, 300); };
    addEventListener('scroll', wait, listening);
    addEventListener('scrollend', arrive, listening);
    wait();
  }

  pageButton.addEventListener('click', () => {
    if (count < letters.length) { finish(); return; }
    if (page < PAGES[topic].length - 1) { ++page; render(); }
    else explain('welcome');
  }, { signal });

  // Keep the floor headings as headings, with native buttons inside for pointer and keyboard interaction.
  for (const [selector, key] of [['#live-title', 'live'], ['#weekly-title', 'week'], ['#monthly-title', 'month']]) {
    const heading = document.querySelector(selector);
    if (!heading) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'floor-dialogue-trigger';
    button.dataset.dialogueTopic = key;
    button.title = `About the ${key === 'live' ? 'Live' : key === 'week' ? 'Weekly' : 'Monthly'} view`;
    button.append(...heading.childNodes);
    heading.append(button);
    headingButtons.push(button);
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest?.('[data-dialogue-topic], [data-floor-view], [data-view], #install-link, #sky-switch');
    if (!target) return;
    const key = target.dataset.dialogueTopic || target.dataset.floorView || target.dataset.view;
    if (target.id === 'install-link') { travel(); explain('install'); }
    else if (target.id === 'sky-switch') explain('sky');
    else explain(key === 'office' ? 'live' : key);
    if ((topics.contains(target) || headingButtons.includes(target)) && destinations[key]) {
      travel();
      center(destinations[key]);
    }
  }, { signal });
  topics.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const button = event.target.closest('[data-dialogue-topic]');
    if (button) { pressed = button.dataset.dialogueTopic; drawTopicMenu(); }
  }, { signal });
  const release = () => {
    if (pressed == null) return;
    pressed = null;
    drawTopicMenu();
  };
  addEventListener('pointerup', release, { signal });
  addEventListener('pointercancel', release, { signal });
  topics.addEventListener('pointerleave', release, { signal });
  topics.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    const button = event.target.closest('[data-dialogue-topic]');
    if (button) { pressed = button.dataset.dialogueTopic; drawTopicMenu(); }
  }, { signal });
  topics.addEventListener('keyup', release, { signal });
  topics.addEventListener('focusout', release, { signal });
  mobile.addEventListener('change', measure, { signal });
  motion.addEventListener('change', () => { if (motion.matches) finish(); }, { signal });
  if (autoStart) render();

  return {
    start(first = 'welcome') { if (!started) explain(PAGES[first] ? first : 'welcome'); },
    explain,
    follow,
    destroy() {
      destroyed = true;
      listeners.abort();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(measureFrame);
      clearTimeout(travelTimer);
      travelEnd?.abort();
      resize.disconnect();
      for (const button of headingButtons) button.replaceWith(...button.childNodes);
      panel.remove();
      document.body.classList.remove('has-office-dialogue');
      if (bedrockSpace) bedrock.style.setProperty('--dialogue-space', bedrockSpace, bedrockSpacePriority);
      else bedrock?.style.removeProperty('--dialogue-space');
    },
  };
}
