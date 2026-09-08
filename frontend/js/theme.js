// Light/dark theme toggle, shared across the whole site.
const THEME_KEY = 'msomi_theme';

export function applyStoredTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  return next;
}

export function wireThemeToggle(btnId = 'themeToggle') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const setIcon = () => {
    const t = document.documentElement.getAttribute('data-theme');
    btn.innerHTML = `<i data-lucide="${t === 'dark' ? 'sun' : 'moon'}" class="icon"></i>`;
    if (window.lucide) window.lucide.createIcons();
  };
  setIcon();
  btn.addEventListener('click', () => {
    toggleTheme();
    setIcon();
  });
}

applyStoredTheme();
