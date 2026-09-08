import { getCurrentUser, clearSession } from './api.js';
import { initIcons, initials, avatarHtml } from './ui.js';
import { wireThemeToggle } from './theme.js';
import { initCoffeeWidget } from './coffee.js';

const NAV = [
  { section: 'Overview' },
  { key: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', href: 'dashboard.html' },
  { key: 'reminders', label: 'CAT & Exam Reminders', icon: 'bell-ring', href: 'reminders.html' },
  { key: 'timetable', label: 'Study Timetable', icon: 'calendar-clock', href: 'timetable.html' },
  { key: 'pastpapers', label: 'Revision Materials', icon: 'file-stack', href: 'pastpapers.html' },
  { section: 'Finance & Grades' },
  { key: 'gpa', label: 'GPA Calculator', icon: 'graduation-cap', href: 'gpa.html' },
  { key: 'budget', label: 'Budget Tracker', icon: 'wallet', href: 'budget.html' },
  { section: 'Stay Informed' },
  { key: 'helb', label: 'HELB & Funding', icon: 'landmark', href: 'helb.html' },
  { key: 'opportunities', label: 'Opportunities', icon: 'briefcase', href: 'opportunities.html' },
  { key: 'announcements', label: 'Announcements', icon: 'megaphone', href: 'announcements.html' },
  { key: 'bookmarks', label: 'Saved Items', icon: 'bookmark', href: 'bookmarks.html' },
  { section: 'More' },
  { key: 'toolkit', label: 'Student Toolkit', icon: 'sparkles', href: 'toolkit.html' },
  { key: 'profile', label: 'Profile & Referrals', icon: 'user-circle', href: 'profile.html' }
];

function sidebarHtml(active, isAdmin, basePath) {
  const items = NAV.map((item) => {
    if (item.section) return `<div class="nav-section-label">${item.section}</div>`;
    return `<a href="${basePath}${item.href}" class="nav-link ${active === item.key ? 'active' : ''}">
      <i data-lucide="${item.icon}" class="icon"></i><span>${item.label}</span>
    </a>`;
  }).join('');

  const adminLink = isAdmin
    ? `<a href="${active === 'admin' ? 'index.html' : basePath + 'admin/index.html'}" class="nav-link ${active === 'admin' ? 'active' : ''}" style="color:var(--gold-300);">
        <i data-lucide="shield-check" class="icon"></i><span>Admin Panel</span>
      </a>`
    : '';

  return `
    <aside class="sidebar" id="appSidebar">
      <div class="sidebar-brand">
        <div class="logo-mark"><img src="${basePath}../photo/logo-icon.png" alt="Msomi Hub logo" /></div>
        <div>
          <div class="name" style="color:#fff;">Msomi Hub</div>
          <div style="font-size:.68rem;color:var(--slate-400);">Student Success Portal</div>
        </div>
      </div>
      <nav class="sidebar-nav">
        ${items}
        ${adminLink ? `<div class="nav-section-label">Admin</div>${adminLink}` : ''}
      </nav>
      <div class="sidebar-footer">
        <button class="btn btn-outline btn-block" id="logoutBtn" style="color:#fff;border-color:rgba(255,255,255,0.18);">
          <i data-lucide="log-out" class="icon"></i> Log Out
        </button>
      </div>
    </aside>`;
}

function topbarHtml(title, user) {
  return `
    <header class="topbar">
      <div class="topbar-left">
        <button class="icon-btn menu-toggle" id="menuToggle" aria-label="Open menu"><i data-lucide="menu" class="icon"></i></button>
        <h1 class="topbar-title">${title}</h1>
      </div>
      <div class="topbar-actions">
        <button class="icon-btn" id="themeToggle" aria-label="Toggle theme"></button>
        <div class="coffee-btn-wrap" id="coffeeBtnWrap">
          <button class="icon-btn" id="coffeeTopbarBtn" data-coffee-trigger aria-label="Buy me a coffee" style="color:var(--gold-600);"><i data-lucide="coffee" class="icon"></i></button>
          <span class="coffee-pointer" id="coffeePointer" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>
          </span>
        </div>
        <a href="${basePathFor()}reminders.html" class="icon-btn" aria-label="Reminders"><i data-lucide="bell" class="icon"></i></a>
        <a href="${basePathFor()}profile.html" class="flex items-center gap-2" style="text-decoration:none;">
          ${avatarHtml(user)}
        </a>
      </div>
    </header>`;
}

function basePathFor() {
  return window.location.pathname.includes('/admin/') ? '../' : '';
}

const COFFEE_HINT_KEY = 'msomi_coffee_hint_seen';

/**
 * Small looping arrow under the topbar coffee icon that fades in/out to draw
 * a student's eye to it. Stops appearing for good once they've clicked the
 * button at least once, so it doesn't nag returning/paying supporters.
 */
function wireCoffeeHintPointer() {
  const pointer = document.getElementById('coffeePointer');
  const btn = document.getElementById('coffeeTopbarBtn');
  if (!pointer || !btn) return;

  if (localStorage.getItem(COFFEE_HINT_KEY) === 'true') {
    pointer.style.display = 'none';
    return;
  }

  const dismiss = () => {
    localStorage.setItem(COFFEE_HINT_KEY, 'true');
    pointer.style.display = 'none';
  };
  btn.addEventListener('click', dismiss, { once: true });
}

export function initShell({ active, title } = {}) {
  const user = getCurrentUser();
  const basePath = basePathFor();
  const sidebarMount = document.getElementById('sidebarMount');
  const topbarMount = document.getElementById('topbarMount');
  if (sidebarMount) sidebarMount.outerHTML = sidebarHtml(active, !!user?.isAdmin || !!user?.is_admin, basePath);
  if (topbarMount) topbarMount.outerHTML = topbarHtml(title || '', user);

  initIcons();
  wireThemeToggle('themeToggle');
  initCoffeeWidget();
  wireCoffeeHintPointer();

  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('appSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const openMenu = () => { sidebar?.classList.add('open'); backdrop?.classList.add('open'); };
  const closeMenu = () => { sidebar?.classList.remove('open'); backdrop?.classList.remove('open'); };
  menuToggle?.addEventListener('click', openMenu);
  backdrop?.addEventListener('click', closeMenu);
  sidebar?.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeMenu));

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await clearSession();
    const inAdmin = window.location.pathname.includes('/admin/');
    window.location.href = inAdmin ? '../login.html' : 'login.html';
  });

  return user;
}