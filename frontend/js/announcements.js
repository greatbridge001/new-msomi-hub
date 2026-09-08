import { api, requireAuthOrRedirect } from './api.js';
import { initIcons, toast, timeAgo } from './ui.js';
import { initShell } from './shell.js';
import { loadBookmarks, isBookmarked, toggleBookmark } from './bookmarks-store.js';

requireAuthOrRedirect();
initShell({ active: 'announcements', title: 'Announcements' });

const listEl = document.getElementById('announcementsList');
const searchInput = document.getElementById('searchInput');
let debounceTimer;

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const CATEGORY_META = {
  general: { badge: 'badge-navy', icon: 'megaphone' },
  academic: { badge: 'badge-gold', icon: 'book-open' },
  platform: { badge: 'badge-green', icon: 'sparkles' }
};

function render(items) {
  if (!items.length) {
    listEl.innerHTML = `<div class="empty-state"><i data-lucide="megaphone" class="icon"></i><p>No announcements found.</p></div>`;
    initIcons();
    return;
  }
  listEl.innerHTML = items.map((a) => {
    const meta = CATEGORY_META[a.category] || CATEGORY_META.general;
    const saved = isBookmarked('announcement', a.id);
    return `
    <div class="card card-pad card-hover">
      <div class="flex justify-between items-start gap-3">
        <div class="stat-icon ${a.category === 'academic' ? 'icon-tint-gold' : a.category === 'platform' ? 'icon-tint-green' : 'icon-tint-navy'}" style="width:44px;height:44px;flex-shrink:0;margin:0;">
          <i data-lucide="${meta.icon}" class="icon"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div class="flex justify-between items-start gap-2">
            <h3 style="font-size:1.02rem;">${escapeHtml(a.title)}</h3>
            <button class="icon-btn bookmark-btn" data-id="${a.id}" style="flex-shrink:0;${saved ? 'color:var(--gold-500);' : ''}">
              <i data-lucide="bookmark" class="icon" style="${saved ? 'fill:currentColor;' : ''}"></i>
            </button>
          </div>
          <p class="text-sm text-secondary mt-2" style="line-height:1.6;">${escapeHtml(a.content)}</p>
          <div class="flex items-center gap-3 mt-3">
            <span class="badge ${meta.badge}" style="text-transform:capitalize;">${a.category}</span>
            <span class="text-sm text-muted">${timeAgo(a.created_at)}</span>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
  initIcons();

  listEl.querySelectorAll('.bookmark-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        const saved = await toggleBookmark('announcement', btn.dataset.id);
        toast(saved ? 'Saved to bookmarks' : 'Removed from bookmarks', 'success', 1800);
        btn.style.color = saved ? 'var(--gold-500)' : '';
        btn.querySelector('i').style.fill = saved ? 'currentColor' : 'none';
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
}

async function fetchAndRender() {
  listEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Searching...</div>`;
  try {
    const params = new URLSearchParams();
    if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
    const { data } = await api.get(`/announcements?${params.toString()}`);
    render(data);
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state"><i data-lucide="alert-triangle" class="icon"></i><p>${err.message}</p></div>`;
    initIcons();
  }
}

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchAndRender, 350);
});

(async () => {
  try { await loadBookmarks(); } catch { /* bookmarks require subscription; ignore if not active */ }
  await fetchAndRender();
})();
