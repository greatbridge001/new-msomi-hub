import { api, getWithCache, setCached, requireAuthOrRedirect } from './api.js';
import { initIcons, toast, confirmModal } from './ui.js';
import { initShell } from './shell.js';

requireAuthOrRedirect();
initShell({ active: 'timetable', title: 'Study Timetable' });

const DAYS = [
  { num: 1, label: 'Mon' }, { num: 2, label: 'Tue' }, { num: 3, label: 'Wed' },
  { num: 4, label: 'Thu' }, { num: 5, label: 'Fri' }, { num: 6, label: 'Sat' }, { num: 0, label: 'Sun' }
];

let allClasses = [];
const grid = document.getElementById('weekGrid');
const modal = document.getElementById('classModal');
const form = document.getElementById('classForm');

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = Number(h);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hr12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hr12}:${m}${period}`;
}
const COLORS = ['icon-tint-navy', 'icon-tint-gold', 'icon-tint-green', 'icon-tint-rose'];

function render() {
  const todayNum = new Date().getDay();
  grid.innerHTML = DAYS.map((day) => {
    const classes = allClasses.filter((c) => c.day_of_week === day.num).sort((a, b) => a.start_time.localeCompare(b.start_time));
    const isToday = day.num === todayNum;
    return `
    <div class="card" style="min-height:200px;${isToday ? 'border-color:var(--accent);box-shadow:var(--shadow-accent);' : ''}">
      <div style="padding:.85rem;border-bottom:1px solid var(--border-subtle);text-align:center;${isToday ? 'background:var(--gold-100);border-radius:var(--radius-lg) var(--radius-lg) 0 0;' : ''}">
        <div style="font-weight:700;font-size:.85rem;${isToday ? 'color:var(--gold-600);' : ''}">${day.label}</div>
      </div>
      <div style="padding:.6rem;display:flex;flex-direction:column;gap:.5rem;">
        ${classes.length ? classes.map((c, i) => `
          <div class="card ${COLORS[i % COLORS.length]}" style="padding:.6rem;border:none;box-shadow:none;cursor:pointer;" data-id="${c.id}">
            <div style="font-weight:700;font-size:.78rem;">${escapeHtml(c.subject)}</div>
            <div class="text-sm" style="font-size:.72rem;opacity:.85;">${formatTime(c.start_time)}–${formatTime(c.end_time)}</div>
            ${c.location ? `<div class="text-sm" style="font-size:.7rem;opacity:.7;">${escapeHtml(c.location)}</div>` : ''}
          </div>
        `).join('') : `<div class="text-muted text-sm" style="text-align:center;padding:1rem 0;">No classes</div>`}
      </div>
    </div>`;
  }).join('');

  document.getElementById('loadingRow').style.display = 'none';
  initIcons();

  grid.querySelectorAll('[data-id]').forEach((el) =>
    el.addEventListener('click', () => openEditModal(el.dataset.id))
  );
}

function openAddModal() {
  form.reset();
  document.getElementById('classId').value = '';
  document.getElementById('modalTitle').textContent = 'Add Class';
  modal.style.display = 'flex';
}
function openEditModal(id) {
  const c = allClasses.find((x) => x.id === id);
  if (!c) return;
  document.getElementById('classId').value = c.id;
  document.getElementById('subject').value = c.subject;
  document.getElementById('day_of_week').value = c.day_of_week;
  document.getElementById('start_time').value = c.start_time.slice(0, 5);
  document.getElementById('end_time').value = c.end_time.slice(0, 5);
  document.getElementById('location').value = c.location || '';
  document.getElementById('notes').value = c.notes || '';
  document.getElementById('modalTitle').innerHTML = `Edit Class <button type="button" id="deleteClassBtn" class="btn btn-danger btn-sm" style="float:right;"><i data-lucide="trash-2" class="icon"></i></button>`;
  modal.style.display = 'flex';
  initIcons();
  document.getElementById('deleteClassBtn')?.addEventListener('click', async () => {
    const ok = await confirmModal({ title: 'Delete this class?', confirmText: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api.del(`/timetable/${id}`);
      toast('Class removed', 'success');
      closeModalFn();
      await refreshClasses();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}
function closeModalFn() { modal.style.display = 'none'; }

document.getElementById('addClassBtn').addEventListener('click', openAddModal);
document.getElementById('closeModal').addEventListener('click', closeModalFn);
document.getElementById('cancelModal').addEventListener('click', closeModalFn);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModalFn(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('classId').value;
  const payload = {
    subject: document.getElementById('subject').value.trim(),
    day_of_week: Number(document.getElementById('day_of_week').value),
    start_time: document.getElementById('start_time').value,
    end_time: document.getElementById('end_time').value,
    location: document.getElementById('location').value.trim(),
    notes: document.getElementById('notes').value.trim()
  };
  if (payload.end_time <= payload.start_time) {
    toast('End time must be after start time', 'error');
    return;
  }
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  try {
    if (id) {
      await api.put(`/timetable/${id}`, payload);
      toast('Class updated', 'success');
    } else {
      await api.post('/timetable', payload);
      toast('Class added', 'success');
    }
    closeModalFn();
    await refreshClasses();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

async function loadClasses() {
  // Instant paint: render last-known classes from cache immediately (0ms),
  // then quietly refresh with live data. /timetable already enforces the
  // subscription check server-side, so there's no separate check to wait on.
  await getWithCache('/timetable', 'timetable', {
    onCache: (resp) => { allClasses = resp.data; render(); },
    onFresh: (resp) => { allClasses = resp.data; render(); },
    onError: (err) => {
      if (err.code === 'SUBSCRIPTION_REQUIRED' || err.code === 'SUBSCRIPTION_EXPIRED') {
        window.location.href = 'subscribe.html';
        return;
      }
      toast(err.message, 'error');
    }
  }).catch(() => {});
}

/** Used after add/edit/delete - always fetches fresh, no stale-cache flash. */
async function refreshClasses() {
  try {
    const resp = await api.get('/timetable');
    allClasses = resp.data;
    setCached('timetable', resp);
    render();
  } catch (err) {
    toast(err.message, 'error');
  }
}

loadClasses();