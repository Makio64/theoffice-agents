// The floor the reader is on: its lights come on, the others dim, and the guide's text follows it.
// The reading line sits a third of the way down what the guide box leaves of the window; the section whose top has
// passed it last is the current one, and the foot of the page is always the street's.

const SETTLE = 250;

/** Watch the scroll; onSection(id) fires once the reader has settled on a new section. */
export function mountSpotlight({ onSection } = {}) {
  const root = document.documentElement;
  const floor = (id) => document.querySelector(id)?.closest('.building-floor');
  const floors = { live: floor('#live-title'), week: floor('#weekly-title'), month: floor('#monthly-title') };
  // In page order: the roof welcomes, each floor speaks for itself, the entrance and the street invite you in.
  const sections = [
    ['live', floors.live],
    ['week', floors.week],
    ['month', floors.month],
    ['install', document.querySelector('.front') || document.querySelector('#street')],
  ].filter(([, element]) => element);
  // The roof has no floor of its own: the first one under it keeps its lights on.
  const lights = { welcome: floors.live, live: floors.live, week: floors.week, month: floors.month };
  let section;
  let lit;
  let frame = 0;
  let timer;
  let destroyed = false;

  function readingLine() {
    const guide = document.querySelector('.office-dialogue');
    const box = guide && !guide.hidden && !guide.classList.contains('is-folded') ? guide.getBoundingClientRect() : null;
    const bottom = box && box.height ? Math.min(innerHeight, box.top) : innerHeight;
    return Math.max(0, bottom) / 3;
  }

  function current() {
    const scroller = document.scrollingElement || root;
    if (sections.length && scroller.scrollTop > 0 && scroller.scrollTop + innerHeight >= scroller.scrollHeight - 2) {
      return sections.at(-1)[0];
    }
    const line = readingLine();
    let id = 'welcome';
    for (const [key, element] of sections) {
      if (element.getBoundingClientRect().top <= line) id = key;
    }
    return id;
  }

  function light(next) {
    const element = lights[next];
    if (element === lit) return;
    lit?.removeAttribute('data-lit');
    lit = element;
    lit?.setAttribute('data-lit', '');
  }

  function update(initial = false) {
    frame = 0;
    if (destroyed) return;
    const next = current();
    if (next === section) return;
    section = next;
    light(next);
    clearTimeout(timer);
    if (!initial) timer = setTimeout(() => { if (!destroyed && section === next) onSection?.(next); }, SETTLE);
  }

  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => update()); };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  update(true);
  root.dataset.lights = '';

  return {
    get section() { return section; },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      removeEventListener('scroll', schedule);
      removeEventListener('resize', schedule);
      lit?.removeAttribute('data-lit');
      delete root.dataset.lights;
    },
  };
}
