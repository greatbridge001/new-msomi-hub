import { api, getWithCache, setCached, requireAuthOrRedirect } from './api.js';
import { initIcons, toast, confirmModal } from './ui.js';
import { initShell } from './shell.js';

requireAuthOrRedirect();
initShell({ active: 'reminders', title: 'CAT & Exam Reminders' });

let allReminders = [];
let currentFilter = 'upcoming';

const listEl = document.getElementById('remindersList');
const modal = document.getElementById('reminderModal');
const form = document.getElementById('reminderForm');

function typeIcon(type) {
  return { cat: 'file-text', assignment: 'clipboard-list', exam: 'graduation-cap', other: 'bell' }[type] || 'bell';
}
function typeBadgeClass(type) {
  return { cat: 'badge-gold', assignment: 'badge-navy', exam: 'badge-rose', other: 'badge' }[type] || 'badge';
}
function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function daysLabel(dueDate) {
  const diff = Math.ceil((new Date(dueDate) - new Date()) / 86400000);
  if (diff < 0) return { label: 'Overdue', urgent: true };
  if (diff === 0) return { label: 'Due today', urgent: true };
  if (diff === 1) return { label: 'Due tomorrow', urgent: true };
  if (diff <= 3) return { label: `${diff} days left`, urgent: true };
  return { label: `${diff} days left`, urgent: false };
}

function render() {
  let items = [...allReminders];
  if (currentFilter === 'upcoming') items = items.filter((r) => !r.completed).sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  else if (currentFilter === 'completed') items = items.filter((r) => r.completed);
  else items.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  if (!items.length) {
    listEl.innerHTML = `<div class="empty-state">
      <i data-lucide="bell-off" class="icon"></i>
      <p>Nothing here yet.</p>
      <button class="btn btn-primary btn-sm mt-2" id="emptyAddBtn"><i data-lucide="plus" class="icon"></i> Add your first reminder</button>
    </div>`;
    document.getElementById('emptyAddBtn')?.addEventListener('click', openAddModal);
    initIcons();
    return;
  }

  listEl.innerHTML = items.map((r) => {
    const { label, urgent } = daysLabel(r.due_date);
    return `
    <div class="list-row" style="border-bottom:1px solid var(--border-subtle);" data-id="${r.id}">
      <button class="icon-btn complete-btn" style="${r.completed ? 'color:var(--emerald-500);' : ''}" data-id="${r.id}" title="${r.completed ? 'Completed' : 'Mark complete'}">
        <i data-lucide="${r.completed ? 'check-circle-2' : 'circle'}" class="icon"></i>
      </button>
      <div class="stat-icon ${r.completed ? 'icon-tint-green' : 'icon-tint-navy'}" style="width:40px;height:40px;margin:0;"><i data-lucide="${typeIcon(r.reminder_type)}" class="icon"></i></div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:.95rem;${r.completed ? 'text-decoration:line-through;color:var(--text-muted);' : ''}">${escapeHtml(r.title)}</div>
        <div class="text-sm text-secondary">${escapeHtml(r.subject || '')} · ${new Date(r.due_date).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
      </div>
      <span class="badge ${typeBadgeClass(r.reminder_type)}" style="text-transform:capitalize;">${r.reminder_type}</span>
      ${!r.completed ? `<span class="badge ${urgent ? 'badge-rose' : ''}">${label}</span>` : ''}
      <button class="icon-btn edit-btn" data-id="${r.id}"><i data-lucide="pencil" class="icon"></i></button>
      <button class="icon-btn delete-btn" data-id="${r.id}"><i data-lucide="trash-2" class="icon"></i></button>
    </div>`;
  }).join('');

  initIcons();
  wireRowActions();
}

function wireRowActions() {
  document.querySelectorAll('.complete-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const rem = allReminders.find((r) => r.id === id);
      try {
        if (!rem.completed) {
          await api.patch(`/reminders/${id}/complete`);
          toast('Marked as complete', 'success');
        } else {
          await api.put(`/reminders/${id}`, { completed: false });
          toast('Marked as pending', 'info');
        }
        await refreshReminders();
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
  document.querySelectorAll('.edit-btn').forEach((btn) =>
    btn.addEventListener('click', () => openEditModal(btn.dataset.id))
  );
  document.querySelectorAll('.delete-btn').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const ok = await confirmModal({ title: 'Delete reminder?', body: 'This cannot be undone.', confirmText: 'Delete', danger: true });
      if (!ok) return;
      try {
        await api.del(`/reminders/${btn.dataset.id}`);
        toast('Reminder deleted', 'success');
        await refreshReminders();
      } catch (err) {
        toast(err.message, 'error');
      }
    })
  );
}

function openAddModal() {
  form.reset();
  document.getElementById('reminderId').value = '';
  document.getElementById('modalTitle').textContent = 'Add Reminder';
  modal.style.display = 'flex';
}
function openEditModal(id) {
  const r = allReminders.find((x) => x.id === id);
  if (!r) return;
  document.getElementById('reminderId').value = r.id;
  document.getElementById('title').value = r.title;
  document.getElementById('subject').value = r.subject || '';
  document.getElementById('reminder_type').value = r.reminder_type;
  document.getElementById('due_date').value = new Date(r.due_date).toISOString().slice(0, 16);
  document.getElementById('modalTitle').textContent = 'Edit Reminder';
  modal.style.display = 'flex';
}
function closeModalFn() { modal.style.display = 'none'; }

document.getElementById('addReminderBtn').addEventListener('click', openAddModal);
document.getElementById('closeModal').addEventListener('click', closeModalFn);
document.getElementById('cancelModal').addEventListener('click', closeModalFn);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModalFn(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('reminderId').value;
  const payload = {
    title: document.getElementById('title').value.trim(),
    subject: document.getElementById('subject').value.trim(),
    reminder_type: document.getElementById('reminder_type').value,
    due_date: new Date(document.getElementById('due_date').value).toISOString()
  };
  const saveBtn = document.getElementById('saveReminderBtn');
  saveBtn.disabled = true;
  try {
    if (id) {
      await api.put(`/reminders/${id}`, payload);
      toast('Reminder updated', 'success');
    } else {
      await api.post('/reminders', payload);
      toast('Reminder added', 'success');
    }
    closeModalFn();
    await refreshReminders();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

document.querySelectorAll('#filterTabs [data-filter]').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    document.querySelectorAll('#filterTabs [data-filter]').forEach((b) => b.className = 'btn btn-outline btn-sm');
    btn.className = 'btn btn-dark btn-sm';
    render();
  });
});

async function loadReminders() {
  // Instant paint: render last-known reminders from cache immediately, then
  // quietly refresh with live data. /reminders already enforces the
  // subscription check server-side, so there's no separate check to wait on.
  await getWithCache('/reminders', 'reminders', {
    onCache: (resp) => { allReminders = resp.data; render(); },
    onFresh: (resp) => { allReminders = resp.data; render(); },
    onError: (err) => {
      if (err.code === 'SUBSCRIPTION_REQUIRED' || err.code === 'SUBSCRIPTION_EXPIRED') {
        window.location.href = 'subscribe.html';
        return;
      }
      listEl.innerHTML = `<div class="empty-state"><i data-lucide="alert-triangle" class="icon"></i><p>${err.message}</p></div>`;
      initIcons();
    }
  }).catch(() => {});
}

/** Used after add/edit/complete/delete - always fetches fresh, no stale-cache flash. */
async function refreshReminders() {
  try {
    const resp = await api.get('/reminders');
    allReminders = resp.data;
    setCached('reminders', resp);
    render();
  } catch (err) {
    toast(err.message, 'error');
  }
}

loadReminders();