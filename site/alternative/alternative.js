// The original renderer and interactions stay shared; this page adds the explanation around them.
const intro = document.documentElement.dataset.intro;
// The shared asset base points to the original site's root; section links stay on this introduction.
for (const link of document.querySelectorAll('a[href^="alternative/#"]')) {
  const url = new URL(location.href);
  url.hash = link.getAttribute('href').split('#')[1];
  link.href = url.href;
}
for (const link of document.querySelectorAll('[data-intro-link]')) {
  if (link.dataset.introLink === intro) link.setAttribute('aria-current', 'page');
}

const guides = {
  office: {
    question: 'Who’s working, and who needs my input?',
    items: [
      ['A room is a project.', 'Sessions working on the same project sit together.'],
      ['A desk is a session.', 'Its screen and label show what the agent is doing.'],
      ['A hand means it needs you.', 'The agent is waiting for your answer or approval.'],
    ],
  },
  today: {
    question: 'When were my agents active today?',
    items: [
      ['A row is a project.', 'Read across to see when its agents were active.'],
      ['A column is an hour.', 'The current hour is marked so you can place yourself in the day.'],
      ['More activity, more color.', 'Agent-time adds up across all sessions working at once.'],
    ],
  },
  week: {
    question: 'Which projects were busiest this week?',
    items: [
      ['A floor is a project.', 'The busiest project gets the penthouse.'],
      ['A window is a day.', 'Read from left to right across the last seven days.'],
      ['Brighter means busier.', 'A shuttered window means no activity that day.'],
    ],
  },
  month: {
    question: 'Where did my agents spend their time?',
    items: [
      ['A square is a day.', 'More color means more combined active time.'],
      ['The directory lists projects.', 'Compare the time spent on each one.'],
      ['The badges show each AI.', 'See its session count, active time, and share of active time.'],
    ],
  },
  work: {
    question: 'How much was coding, testing, reading, and more?',
    items: [
      ['A room is a kind of work.', 'Coding, tests, reading, and other tools each have a department.'],
      ['A bigger room means more calls.', 'Room sizes follow each department’s share of tool calls.'],
      ['Percentages count tool calls.', 'They describe the activity mix, rather than time spent.'],
    ],
  },
};

function explainView() {
  const tab = document.querySelector('.tab[aria-selected="true"]');
  const guide = guides[tab?.dataset.view];
  if (!guide) return;
  document.querySelector('#caption').textContent = guide.question;
  guide.items.forEach(([title, copy], index) => {
    document.querySelector(`#guide-title-${index + 1}`).textContent = title;
    document.querySelector(`#guide-copy-${index + 1}`).textContent = copy;
  });
}
const observer = new MutationObserver(explainView);
observer.observe(document.querySelector('.keys'), { attributes: true, subtree: true, attributeFilter: ['aria-selected'] });
explainView();

const dialog = document.querySelector('.film-dialog');
const dialogVideo = dialog.querySelector('video');
let returnFocus;
for (const button of document.querySelectorAll('[data-watch]')) {
  button.addEventListener('click', () => {
    returnFocus = button;
    dialog.showModal();
    dialogVideo.play().catch(() => { /* Native controls stay available if playback is restricted. */ });
  });
}
document.querySelector('[data-close-film]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
dialog.addEventListener('close', () => {
  dialogVideo.pause();
  returnFocus?.focus();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    dialogVideo.pause();
  }
});
