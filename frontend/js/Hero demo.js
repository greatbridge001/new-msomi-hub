// Hero interactive demo — types out each core action, checks it off, moves to
// the next, and loops. Used only on the landing page hero; nothing here is
// shared with the dashboard.

const ACTIONS = [
  'Write your weekly timetable',
  'Upload revision papers',
  'Set CAT & exam reminders',
  'Calculate your GPA',
  'Track your budget',
  'Check HELB updates',
  'Browse new opportunities',
  "Read today's motivation"
];

const TYPE_MS = 34;
const HOLD_AFTER_DONE_MS = 420;
const HOLD_AFTER_ALL_DONE_MS = 1800;

export function initHeroDemo(rootId = 'heroDemoList') {
  const root = document.getElementById(rootId);
  if (!root) return;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    root.innerHTML = ACTIONS.map(
      (a) => `<div class="demo-row done"><span class="demo-text">${a}</span></div>`
    ).join('');
    return;
  }

  let phraseIndex = 0;
  let charIndex = 0;
  let currentRow = null;
  let timer = null;

  function startRow() {
    currentRow = document.createElement('div');
    currentRow.className = 'demo-row active';
    currentRow.innerHTML = '<span class="demo-text"></span><span class="demo-cursor"></span>';
    root.appendChild(currentRow);
  }

  function step() {
    if (phraseIndex >= ACTIONS.length) {
      timer = setTimeout(resetCycle, HOLD_AFTER_ALL_DONE_MS);
      return;
    }
    if (!currentRow) startRow();

    const phrase = ACTIONS[phraseIndex];
    const textEl = currentRow.querySelector('.demo-text');

    if (charIndex < phrase.length) {
      charIndex++;
      textEl.textContent = phrase.slice(0, charIndex);
      timer = setTimeout(step, TYPE_MS);
      return;
    }

    currentRow.classList.remove('active');
    currentRow.classList.add('done');
    currentRow.querySelector('.demo-cursor')?.remove();
    currentRow = null;
    phraseIndex++;
    charIndex = 0;
    timer = setTimeout(step, HOLD_AFTER_DONE_MS);
  }

  function resetCycle() {
    root.innerHTML = '';
    currentRow = null;
    phraseIndex = 0;
    charIndex = 0;
    step();
  }

  step();

  // Pause the loop while the tab isn't visible, resume cleanly when it is.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && timer) {
      clearTimeout(timer);
      timer = null;
    } else if (!document.hidden && !timer && root.isConnected) {
      step();
    }
  });
}

initHeroDemo();