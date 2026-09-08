import { api, getWithCache, setCached, requireAuthOrRedirect } from './api.js';
import { initIcons, toast, confirmModal } from './ui.js';
import { initShell } from './shell.js';

requireAuthOrRedirect();
initShell({ active: 'gpa', title: 'GPA Calculator' });

let allUnits = [];
const modal = document.getElementById('unitModal');
const form = document.getElementById('unitForm');

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderTable() {
  const tbody = document.getElementById('unitsTbody');
  if (!allUnits.length) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i data-lucide="book-marked" class="icon"></i><p>No units logged yet.</p></div></td></tr>`;
    initIcons();
    return;
  }
  tbody.innerHTML = allUnits.map((u) => `
    <tr>
      <td>${escapeHtml(u.semester)}</td>
      <td>${escapeHtml(u.unit_name)}</td>
      <td><span class="badge badge-gold">${u.grade}</span></td>
      <td>${u.credit_hours}</td>
      <td>
        <button class="icon-btn btn-sm edit-unit" data-id="${u.id}" style="width:32px;height:32px;"><i data-lucide="pencil" class="icon"></i></button>
        <button class="icon-btn btn-sm delete-unit" data-id="${u.id}" style="width:32px;height:32px;"><i data-lucide="trash-2" class="icon"></i></button>
      </td>
    </tr>`).join('');
  initIcons();

  tbody.querySelectorAll('.edit-unit').forEach((b) => b.addEventListener('click', () => openEditModal(b.dataset.id)));
  tbody.querySelectorAll('.delete-unit').forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Delete this unit?', confirmText: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api.del(`/gpa/${b.dataset.id}`);
      toast('Unit deleted', 'success');
      await refreshAll();
    } catch (err) { toast(err.message, 'error'); }
  }));
}

function renderSummary(summary) {
  document.getElementById('cgpaValue').textContent = summary.cumulativeGpa != null ? summary.cumulativeGpa.toFixed(2) : '—';
  document.getElementById('semCount').textContent = summary.semesters.length;

  const barsEl = document.getElementById('semesterBars');
  if (!summary.semesters.length) {
    barsEl.innerHTML = `<div class="empty-state" style="padding:1rem;"><p class="text-sm">Add units to see your semester GPA breakdown.</p></div>`;
  } else {
    barsEl.innerHTML = summary.semesters.map((s) => `
      <div class="mb-4">
        <div class="flex justify-between items-center mb-2">
          <span class="text-sm" style="font-weight:600;">${escapeHtml(s.semester)}</span>
          <span class="badge badge-navy">${s.gpa != null ? s.gpa.toFixed(2) : '—'}</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${s.gpa ? (s.gpa / 4) * 100 : 0}%;"></div></div>
      </div>`).join('');
  }
}

async function loadSummary() {
  await getWithCache('/gpa/summary/all', 'gpa_summary', {
    onCache: renderSummary,
    onFresh: renderSummary,
    onError: (err) => toast(err.message, 'error')
  }).catch(() => {});
}

function openAddModal() {
  form.reset();
  document.getElementById('unitId').value = '';
  document.getElementById('modalTitle').textContent = 'Add Unit';
  modal.style.display = 'flex';
}
function openEditModal(id) {
  const u = allUnits.find((x) => x.id === id);
  if (!u) return;
  document.getElementById('unitId').value = u.id;
  document.getElementById('semester').value = u.semester;
  document.getElementById('unit_name').value = u.unit_name;
  document.getElementById('grade').value = u.grade;
  document.getElementById('credit_hours').value = u.credit_hours;
  document.getElementById('modalTitle').textContent = 'Edit Unit';
  modal.style.display = 'flex';
}
function closeModalFn() { modal.style.display = 'none'; }

document.getElementById('addUnitBtn').addEventListener('click', openAddModal);
document.getElementById('closeModal').addEventListener('click', closeModalFn);
document.getElementById('cancelModal').addEventListener('click', closeModalFn);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModalFn(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('unitId').value;
  const payload = {
    semester: document.getElementById('semester').value.trim(),
    unit_name: document.getElementById('unit_name').value.trim(),
    grade: document.getElementById('grade').value,
    credit_hours: Number(document.getElementById('credit_hours').value)
  };
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  try {
    if (id) {
      await api.put(`/gpa/${id}`, payload);
      toast('Unit updated', 'success');
    } else {
      await api.post('/gpa', payload);
      toast('Unit added', 'success');
    }
    closeModalFn();
    await refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

function renderUnitsList(resp) {
  allUnits = resp.data;
  document.getElementById('unitsCount').textContent = resp.data.length;
  renderTable();
}

/**
 * Initial load: paints cached units + cached summary instantly (both fire
 * independently and in parallel), then each refreshes quietly with live
 * data as it arrives. /gpa already enforces the subscription check
 * server-side via a 402, which we catch here and route to the paywall.
 */
async function loadAll() {
  await Promise.all([
    getWithCache('/gpa', 'gpa_list', {
      onCache: renderUnitsList,
      onFresh: renderUnitsList,
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
    const [unitsResp, summary] = await Promise.all([
      api.get('/gpa'),
      api.get('/gpa/summary/all')
    ]);
    setCached('gpa_list', unitsResp);
    setCached('gpa_summary', summary);
    renderUnitsList(unitsResp);
    renderSummary(summary);
  } catch (err) {
    toast(err.message, 'error');
  }
}

loadAll();
