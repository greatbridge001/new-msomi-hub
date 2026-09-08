import { api, getWithCache, requireAuthOrRedirect, requireSubscriptionOrRedirect } from './api.js';
import { initIcons, toast, timeAgo } from './ui.js';
import { initShell } from './shell.js';
import { loadBookmarks, isBookmarked, toggleBookmark } from './bookmarks-store.js';

requireAuthOrRedirect();
initShell({ active: 'helb', title: 'HELB & Funding' });

const grid = document.getElementById('helbGrid');
const searchInput = document.getElementById('searchInput');
const typeFilter = document.getElementById('typeFilter');
let debounceTimer;

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TYPE_META = {
  helb: { badge: 'badge-navy', icon: 'landmark', label: 'HELB' },
  scholarship: { badge: 'badge-gold', icon: 'award', label: 'Scholarship' },
  bursary: { badge: 'badge-green', icon: 'hand-coins', label: 'Bursary' }
};

function render(items) {
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i data-lucide="landmark" class="icon"></i><p>No updates match your search.</p></div>`;
    initIcons();
    return;
  }
  grid.innerHTML = items.map((h) => {
    const meta = TYPE_META[h.update_type] || TYPE_META.helb;
    const saved = isBookmarked('helb_update', h.id);
    return `
    <div class="card card-pad card-hover">
      <div class="flex justify-between items-start mb-2">
        <span class="badge ${meta.badge}"><i data-lucide="${meta.icon}" class="icon"></i> ${meta.label}</span>
        <button class="icon-btn bookmark-btn" data-id="${h.id}" style="${saved ? 'color:var(--gold-500);' : ''}">
          <i data-lucide="bookmark" class="icon" style="${saved ? 'fill:currentColor;' : ''}"></i>
        </button>
      </div>
      <h3 style="font-size:1.02rem;margin-bottom:.5rem;">${escapeHtml(h.title)}</h3>
      <p class="text-sm text-secondary" style="line-height:1.55;">${escapeHtml(h.content)}</p>
      <div class="text-sm text-muted mt-4">${timeAgo(h.created_at)}</div>
    </div>`;
  }).join('');
  initIcons();

  grid.querySelectorAll('.bookmark-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        const saved = await toggleBookmark('helb_update', btn.dataset.id);
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
  const isDefaultView = !searchInput.value.trim() && !typeFilter.value;

  // Only the default (no search/filter) view is worth caching - search
  // results are too specific to be useful as an "instant paint" guess.
  if (isDefaultView) {
    await getWithCache('/helb', 'helb_default', {
      onCache: (resp) => render(resp.data),
      onFresh: (resp) => render(resp.data),
      onError: (err) => {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i data-lucide="alert-triangle" class="icon"></i><p>${err.message}</p></div>`;
        initIcons();
      }
    }).catch(() => {});
    return;
  }

  grid.innerHTML = `<div class="loading-row" style="grid-column:1/-1;"><span class="spinner"></span> Searching...</div>`;
  try {
    const params = new URLSearchParams();
    if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
    if (typeFilter.value) params.set('type', typeFilter.value);
    const { data } = await api.get(`/helb?${params.toString()}`);
    render(data);
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i data-lucide="alert-triangle" class="icon"></i><p>${err.message}</p></div>`;
    initIcons();
  }
}

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fetchAndRender, 350);
});
typeFilter.addEventListener('change', fetchAndRender);

(async () => {
  // Paint content immediately from cache via fetchAndRender/loadBookmarks
  // running in parallel, instead of waiting on the subscription check first.
  // The check still runs and still redirects to the paywall if needed - it
  // just no longer blocks the page from showing content right away.
  await Promise.all([requireSubscriptionOrRedirect(), loadBookmarks(), fetchAndRender()]);
})();
