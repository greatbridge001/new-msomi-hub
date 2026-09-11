// Hero inline typewriter — types each service phrase into the lead sentence,
// pauses, deletes it, then types the next one. Loops forever. Landing-page
// only; nothing here is shared with the dashboard.

const PHRASES = [
  'your weekly timetable',
  'CAT & exam reminders',
  'revision past papers',
  'your GPA',
  'your campus budget',
  'HELB & scholarship updates',
  'internships & opportunities',
  'daily motivation'
];

const TYPE_MS = 110;
const DELETE_MS = 60;
const HOLD_FULL_MS = 2200;
const HOLD_EMPTY_MS = 500;

export function initHeroDemo(rootId = 'heroTypewriter') {
  const root = document.getElementById(rootId);
  if (!root) return;
  const textEl = root.querySelector('.type-cycle-text');
  if (!textEl) return;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    textEl.textContent = PHRASES[0];
    return;
  }

  let phraseIndex = 0;
  let charIndex = 0;
  let deleting = false;
  let timer = null;

  function tick() {
    const phrase = PHRASES[phraseIndex];

    if (!deleting) {
      charIndex++;
      textEl.textContent = phrase.slice(0, charIndex);
      if (charIndex === phrase.length) {
        timer = setTimeout(() => { deleting = true; tick(); }, HOLD_FULL_MS);
        return;
      }
      timer = setTimeout(tick, TYPE_MS);
      return;
    }

    charIndex--;
    textEl.textContent = phrase.slice(0, charIndex);
    if (charIndex === 0) {
      deleting = false;
      phraseIndex = (phraseIndex + 1) % PHRASES.length;
      timer = setTimeout(tick, HOLD_EMPTY_MS);
      return;
    }
    timer = setTimeout(tick, DELETE_MS);
  }

  tick();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && timer) {
      clearTimeout(timer);
      timer = null;
    } else if (!document.hidden && !timer && root.isConnected) {
      tick();
    }
  });
}

initHeroDemo();