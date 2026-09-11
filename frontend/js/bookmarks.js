import { api, getCached, setCached, requireAuthOrRedirect } from './api.js';
import { initIcons, toast, timeAgo } from './ui.js';
import { initShell } from './shell.js';

requireAuthOrRedirect();
initShell({ active: 'bookmarks', title: 'Saved Items' });

const listEl = document.getElementById('savedList');
let allSaved = []; // enriched: { bookmarkId, item_type, item }
let currentType = '';

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TYPE_ENDPOINT = { announcement: '/announcements', helb_update: '/helb', opportunity: '/opportunities' };
const TYPE_LABEL = { announcement: 'Announcement', helb_update: 'HELB Update', opportunity: 'Opportunity' };
const TYPE_ICON = { announcement: 'megaphone', helb_update: 'landmark', opportunity: 'briefcase' };

function render() {
  const items = currentType ? allSaved.filter((s) => s.item_type === currentType) : allSaved;
  if (!items.length) {
    listEl.innerHTML = `<div class="empty-state"><i data-lucide="bookmark" class="icon"></i><p>Nothing saved here yet. Bookmark items from HELB updates, opportunities or announcements.</p></div>`;
    initIcons();
    return;
  }
  listEl.innerHTML = items.map(({ bookmarkId, item_type, item }) => `
    <div class="card card-pad card-hover">
      <div class="flex justify-between items-start gap-3">
        <div class="stat-icon icon-tint-gold" style="width:44px;height:44px;flex-shrink:0;margin:0;"><i data-lucide="${TYPE_ICON[item_type]}" class="icon"></i></div>
        <div style="flex:1;min-width:0;">
          <div class="flex justify-between items-start gap-2">
            <h3 style="font-size:1.02rem;">${escapeHtml(item.title)}</h3>
            <button class="icon-btn remove-btn" data-bid="${bookmarkId}"><i data-lucide="bookmark-x" class="icon"></i></button>
          </div>
          <p class="text-sm text-secondary mt-2" style="line-height:1.6;">${escapeHtml(item.content || item.description || '')}</p>
          <div class="flex items-center gap-3 mt-3">
            <span class="badge badge-navy">${TYPE_LABEL[item_type]}</span>
            ${item.created_at ? `<span class="text-sm text-muted">${timeAgo(item.created_at)}</span>` : ''}
            ${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm" style="margin-left:auto;">Open <i data-lucide="external-link" class="icon"></i></a>` : ''}
          </div>
        </div>
      </div>
    </div>`).join('');
  initIcons();

  listEl.querySelectorAll('.remove-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        await api.del(`/bookmarks/${btn.dataset.bid}`);
        allSaved = allSaved.filter((s) => s.bookmarkId !== btn.dataset.bid);
        setCached('bookmarks_resolved', allSaved);
        toast('Removed from saved items', 'success', 1800);
        render();
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
}

document.querySelectorAll('#filterTabs [data-type]').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentType = btn.dataset.type;
    document.querySelectorAll('#filterTabs [data-type]').forEach((b) => (b.className = 'btn btn-outline btn-sm'));
    btn.className = 'btn btn-dark btn-sm';
    render();
  });
});

async function loadSaved() {
  const cached = getCached('bookmarks_resolved');
  if (cached) { allSaved = cached; render(); }

  try {
    const { data: bookmarks } = await api.get('/bookmarks');
    const resolved = await Promise.all(
      bookmarks.map(async (b) => {
        try {
          const { data: item } = await api.get(`${TYPE_ENDPOINT[b.item_type]}/${b.item_id}`);
          return { bookmarkId: b.id, item_type: b.item_type, item };
        } catch {
          return null;
        }
      })
    );
    allSaved = resolved.filter(Boolean);
    setCached('bookmarks_resolved', allSaved);
    render();
  } catch (err) {
    if (!cached) {
      listEl.innerHTML = `<div class="empty-state"><i data-lucide="alert-triangle" class="icon"></i><p>${err.message}</p></div>`;
      initIcons();
    }
  }
}

(async () => {
  await loadSaved();
})();