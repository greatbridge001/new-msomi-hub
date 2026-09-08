import { api, getWithCache, setCached, requireAuthOrRedirect } from './api.js';
import { initIcons, toast, confirmModal, formatKES } from './ui.js';
import { initShell } from './shell.js';

requireAuthOrRedirect();
initShell({ active: 'budget', title: 'Budget Tracker' });

let allEntries = [];
let currentMonth = new Date().toISOString().slice(0, 7);
const modal = document.getElementById('entryModal');
const form = document.getElementById('entryForm');
const monthPicker = document.getElementById('monthPicker');
monthPicker.value = currentMonth;

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const CATEGORY_ICONS = {
  'Food': 'utensils', 'Transport': 'bus', 'Rent': 'home', 'Airtime & Data': 'wifi',
  'Books & Supplies': 'book', 'Fees': 'landmark', 'Entertainment': 'music', 'Other': 'more-horizontal',
  'HELB Disbursement': 'banknote', 'Allowance': 'gift'
};

function renderSummary(summary) {
  document.getElementById('incomeValue').textContent = formatKES(summary.income);
  document.getElementById('expenseValue').textContent = formatKES(summary.expenses);
  document.getElementById('balanceValue').textContent = formatKES(summary.balance);

  const catEl = document.getElementById('categoryBreakdown');
  const entries = Object.entries(summary.byCategory || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    catEl.innerHTML = `<div class="empty-state" style="padding:1rem;"><p class="text-sm">No transactions this month yet.</p></div>`;
  } else {
    const max = Math.max(...entries.map(([, v]) => v));
    catEl.innerHTML = entries.map(([cat, amt]) => `
      <div class="mb-4">
        <div class="flex justify-between items-center mb-2">
          <span class="text-sm flex items-center gap-2" style="font-weight:600;"><i data-lucide="${CATEGORY_ICONS[cat] || 'circle'}" class="icon"></i>${escapeHtml(cat)}</span>
          <span class="text-sm text-secondary">${formatKES(amt)}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${(amt / max) * 100}%;"></div></div>
      </div>`).join('');
  }
  initIcons();
}

// Instant paint per month: uses a per-month cache key so switching months
// still benefits from caching once you've visited that month before.
async function loadSummary() {
  await getWithCache(`/budget/summary/month?month=${currentMonth}`, `budget_summary_${currentMonth}`, {
    onCache: renderSummary,
    onFresh: renderSummary,
    onError: (err) => toast(err.message, 'error')
  }).catch(() => {});
}

function renderList() {
  const listEl = document.getElementById('entriesList');
  const monthly = allEntries.filter((e) => e.record_date.startsWith(currentMonth)).sort((a, b) => new Date(b.record_date) - new Date(a.record_date));
  if (!monthly.length) {
    listEl.innerHTML = `<div class="empty-state"><i data-lucide="receipt" class="icon"></i><p>No transactions logged for this month.</p></div>`;
    initIcons();
    return;
  }
  listEl.innerHTML = monthly.map((e) => `
    <div class="list-row" style="border-bottom:1px solid var(--border-subtle);">
      <div class="stat-icon ${e.entry_type === 'income' ? 'icon-tint-green' : 'icon-tint-rose'}" style="width:40px;height:40px;margin:0;">
        <i data-lucide="${CATEGORY_ICONS[e.category] || 'circle'}" class="icon"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:.92rem;">${escapeHtml(e.category)}</div>
        <div class="text-sm text-secondary">${escapeHtml(e.description || '')} · ${new Date(e.record_date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</div>
      </div>
      <span style="font-weight:700;color:${e.entry_type === 'income' ? 'var(--emerald-600)' : 'var(--rose-600)'};">${e.entry_type === 'income' ? '+' : '-'}${formatKES(e.amount)}</span>
      <button class="icon-btn edit-entry" data-id="${e.id}"><i data-lucide="pencil" class="icon"></i></button>
      <button class="icon-btn delete-entry" data-id="${e.id}"><i data-lucide="trash-2" class="icon"></i></button>
    </div>`).join('');
  initIcons();

  listEl.querySelectorAll('.edit-entry').forEach((b) => b.addEventListener('click', () => openEditModal(b.dataset.id)));
  listEl.querySelectorAll('.delete-entry').forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Delete this entry?', confirmText: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api.del(`/budget/${b.dataset.id}`);
      toast('Entry deleted', 'success');
      await refreshAll();
    } catch (err) { toast(err.message, 'error'); }
  }));
}

function openAddModal() {
  form.reset();
  document.getElementById('entryId').value = '';
  document.getElementById('record_date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('modalTitle').textContent = 'Add Entry';
  modal.style.display = 'flex';
}
function openEditModal(id) {
  const e = allEntries.find((x) => x.id === id);
  if (!e) return;
  document.getElementById('entryId').value = e.id;
  form.querySelector(`input[name="entry_type"][value="${e.entry_type}"]`).checked = true;
  document.getElementById('amount').value = e.amount;
  document.getElementById('category').value = e.category;
  document.getElementById('record_date').value = e.record_date.slice(0, 10);
  document.getElementById('description').value = e.description || '';
  document.getElementById('modalTitle').textContent = 'Edit Entry';
  modal.style.display = 'flex';
}
function closeModalFn() { modal.style.display = 'none'; }

document.getElementById('addEntryBtn').addEventListener('click', openAddModal);
document.getElementById('closeModal').addEventListener('click', closeModalFn);
document.getElementById('cancelModal').addEventListener('click', closeModalFn);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModalFn(); });

monthPicker.addEventListener('change', () => {
  currentMonth = monthPicker.value;
  loadSummary();
  renderList();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('entryId').value;
  const payload = {
    entry_type: form.querySelector('input[name="entry_type"]:checked').value,
    amount: Number(document.getElementById('amount').value),
    category: document.getElementById('category').value,
    record_date: document.getElementById('record_date').value,
    description: document.getElementById('description').value.trim()
  };
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  try {
    if (id) {
      await api.put(`/budget/${id}`, payload);
      toast('Entry updated', 'success');
    } else {
      await api.post('/budget', payload);
      toast('Entry added', 'success');
    }
    closeModalFn();
    await refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

/**
 * Initial load: paints cached entries + cached month summary instantly,
 * then each refreshes quietly with live data. /budget already enforces the
 * subscription check server-side via a 402, which we catch here and route
 * to the paywall.
 */
async function loadAll() {
  await Promise.all([
    getWithCache('/budget', 'budget_list', {
      onCache: (resp) => { allEntries = resp.data; renderList(); },
      onFresh: (resp) => { allEntries = resp.data; renderList(); },
      onError: (err) => {
        if (err.code === 'SUBSCRIPTION_REQUIRED' || err.code === 'SUBSCRIPTION_EXPIRED') {
          window.location.href = 'subscribe.html';
          return;
        }
        toast(err.message, 'error');
      }
    }).catch(() => {}),
    loadSummary()
  ]);
}

/** Used after add/edit/delete - always fetches fresh, no stale-cache flash. */
async function refreshAll() {
  try {
    const [entriesResp, summary] = await Promise.all([
      api.get('/budget'),
      api.get(`/budget/summary/month?month=${currentMonth}`)
    ]);
    setCached('budget_list', entriesResp);
    setCached(`budget_summary_${currentMonth}`, summary);
    allEntries = entriesResp.data;
    renderList();
    renderSummary(summary);
  } catch (err) {
    toast(err.message, 'error');
  }
}

loadAll();