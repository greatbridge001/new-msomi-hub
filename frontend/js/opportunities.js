import { api, getWithCache, requireAuthOrRedirect, requireSubscriptionOrRedirect } from './api.js';
import { initIcons, toast, timeAgo } from './ui.js';
import { initShell } from './shell.js';
import { loadBookmarks, isBookmarked, toggleBookmark } from './bookmarks-store.js';

requireAuthOrRedirect();
initShell({ active: 'opportunities', title: 'Opportunities' });

const grid = document.getElementById('oppGrid');
const searchInput = document.getElementById('searchInput');
let currentType = '';
let debounceTimer;

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TYPE_LABELS = {
  internship: 'Internship', attachment: 'Attachment', graduate_trainee: 'Graduate Trainee',
  online_job: 'Online Job', competition: 'Competition'
};

function render(items) {
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i data-lucide="briefcase" class="icon"></i><p>No opportunities match your search.</p></div>`;
    initIcons();
    return;
  }
  grid.innerHTML = items.map((o) => {
    const saved = isBookmarked('opportunity', o.id);
    const deadline = o.deadline ? new Date(o.deadline) : null;
    const daysLeft = deadline ? Math.ceil((deadline - new Date()) / 86400000) : null;
    return `
    <div class="card card-pad card-hover">
      <div class="flex justify-between items-start mb-2">
        <span class="badge badge-navy">${TYPE_LABELS[o.opportunity_type] || o.opportunity_type}</span>
        <button class="icon-btn bookmark-btn" data-id="${o.id}" style="${saved ? 'color:var(--gold-500);' : ''}">
          <i data-lucide="bookmark" class="icon" style="${saved ? 'fill:currentColor;' : ''}"></i>
        </button>
      </div>
      <h3 style="font-size:1.02rem;margin-bottom:.3rem;">${escapeHtml(o.title)}</h3>
      <div class="text-sm text-secondary mb-2" style="font-weight:600;">${escapeHtml(o.organization || '')}</div>
      <p class="text-sm text-secondary" style="line-height:1.55;">${escapeHtml(o.description)}</p>
      <div class="flex justify-between items-center mt-4">
        <span class="text-sm ${daysLeft != null && daysLeft <= 3 ? 'badge badge-rose' : 'text-muted'}">
          ${deadline ? (daysLeft >= 0 ? `Deadline in ${daysLeft}d` : 'Deadline passed') : 'Rolling deadline'}
        </span>
        ${o.link ? `<a href="${escapeHtml(o.link)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">Apply <i data-lucide="external-link" class="icon"></i></a>` : ''}
      </div>
    </div>`;
  }).join('');
  initIcons();

  grid.querySelectorAll('.bookmark-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        const saved = await toggleBookmark('opportunity', btn.dataset.id);
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
  const isDefaultView = !searchInput.value.trim() && !currentType;

  // Only the default (no search/filter) view is worth caching - search
  // results are too specific to be useful as an "instant paint" guess.
  if (isDefaultView) {
    await getWithCache('/opportunities', 'opportunities_default', {
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
    if (currentType) params.set('type', currentType);
    const { data } = await api.get(`/opportunities?${params.toString()}`);
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

document.querySelectorAll('#typeTabs [data-type]').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentType = btn.dataset.type;
    document.querySelectorAll('#typeTabs [data-type]').forEach((b) => (b.className = 'btn btn-outline btn-sm'));
    btn.className = 'btn btn-dark btn-sm';
    fetchAndRender();
  });
});

(async () => {
  // Paint content immediately from cache via fetchAndRender/loadBookmarks
  // running in parallel, instead of waiting on the subscription check first.
  // The check still runs and still redirects to the paywall if needed - it
  // just no longer blocks the page from showing content right away.
  await Promise.all([requireSubscriptionOrRedirect(), loadBookmarks(), fetchAndRender()]);
})();
