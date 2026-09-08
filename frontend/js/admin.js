import { api, requireAuthOrRedirect, getCurrentUser } from './api.js';
import { initIcons, toast, confirmModal, formatKES, timeAgo } from './ui.js';
import { initShell } from './shell.js';

requireAuthOrRedirect();
const user = getCurrentUser();
if (!user?.isAdmin) {
  window.location.href = '../dashboard.html';
}
initShell({ active: 'admin', title: 'Admin Panel' });

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- Tabs ---------------- */
const TABS = ['overview', 'content', 'pastpapers', 'users', 'transactions', 'referrals'];
document.querySelectorAll('#adminTabs [data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    TABS.forEach((t) => (document.getElementById(`tab-${t}`).style.display = t === btn.dataset.tab ? 'block' : 'none'));
    document.querySelectorAll('#adminTabs [data-tab]').forEach((b) => (b.className = 'btn btn-outline btn-sm'));
    btn.className = 'btn btn-dark btn-sm';
    if (btn.dataset.tab === 'overview') loadStats();
    if (btn.dataset.tab === 'content') loadContent();
    if (btn.dataset.tab === 'pastpapers') loadPastPapers();
    if (btn.dataset.tab === 'users') loadUsers();
    if (btn.dataset.tab === 'transactions') loadTransactions();
    if (btn.dataset.tab === 'referrals') loadReferrals();
  });
});

/* ---------------- Overview ---------------- */
async function loadStats() {
  try {
    const s = await api.get('/admin/stats');
    document.getElementById('stUsers').textContent = s.totalUsers;
    document.getElementById('stActive').textContent = s.activeSubscriptions;
    document.getElementById('stRevenue').textContent = formatKES(s.totalRevenue);
    document.getElementById('stReferrals').textContent = s.totalReferrals;
    document.getElementById('cAnnouncements').textContent = s.content.announcements;
    document.getElementById('cHelb').textContent = s.content.helb_updates;
    document.getElementById('cOpportunities').textContent = s.content.opportunities;
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ---------------- Content management ---------------- */
const CONTENT_CONFIG = {
  announcements: {
    endpoint: '/announcements', titleField: 'title', subField: 'content', icon: 'megaphone',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'content', label: 'Content', type: 'textarea' },
      { key: 'category', label: 'Category', type: 'select', options: ['general', 'academic', 'platform'] }
    ]
  },
  helb: {
    endpoint: '/helb', titleField: 'title', subField: 'content', icon: 'landmark',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'content', label: 'Content', type: 'textarea' },
      { key: 'update_type', label: 'Type', type: 'select', options: ['helb', 'scholarship', 'bursary'] }
    ]
  },
  opportunities: {
    endpoint: '/opportunities', titleField: 'title', subField: 'description', icon: 'briefcase',
    fields: [
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'organization', label: 'Organization', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'opportunity_type', label: 'Type', type: 'select', options: ['internship', 'attachment', 'graduate_trainee', 'online_job', 'competition'] },
      { key: 'link', label: 'Application link', type: 'text' },
      { key: 'deadline', label: 'Deadline (optional)', type: 'date' }
    ]
  },
  verses: {
    endpoint: '/inspiration/verses', titleField: 'verse_text', subField: 'reference', icon: 'book-open',
    fields: [
      { key: 'verse_text', label: 'Verse text', type: 'textarea' },
      { key: 'reference', label: 'Reference', type: 'text' },
      { key: 'date_assigned', label: 'Date assigned', type: 'date' }
    ]
  },
  quotes: {
    endpoint: '/inspiration/quotes', titleField: 'quote_text', subField: 'author', icon: 'sparkles',
    fields: [
      { key: 'quote_text', label: 'Quote text', type: 'textarea' },
      { key: 'author', label: 'Author', type: 'text' },
      { key: 'date_assigned', label: 'Date assigned', type: 'date' }
    ]
  }
};

let currentContentType = 'announcements';
let currentContentItems = [];

document.querySelectorAll('#contentSubTabs [data-ctype]').forEach((btn) => {
  btn.addEventListener('click', () => {
    currentContentType = btn.dataset.ctype;
    document.querySelectorAll('#contentSubTabs [data-ctype]').forEach((b) => (b.className = 'btn btn-outline btn-sm'));
    btn.className = 'btn btn-dark btn-sm';
    loadContent();
  });
});

async function loadContent() {
  const listEl = document.getElementById('contentList');
  listEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Loading...</div>`;
  const config = CONTENT_CONFIG[currentContentType];
  try {
    const { data } = await api.get(config.endpoint);
    currentContentItems = data;
    if (!data.length) {
      listEl.innerHTML = `<div class="empty-state"><i data-lucide="${config.icon}" class="icon"></i><p>No items yet. Click "Add New" to create one.</p></div>`;
      initIcons();
      return;
    }
    listEl.innerHTML = data.map((item) => `
      <div class="list-row" style="border-bottom:1px solid var(--border-subtle);">
        <div class="stat-icon icon-tint-navy" style="width:38px;height:38px;margin:0;"><i data-lucide="${config.icon}" class="icon"></i></div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:.9rem;">${escapeHtml(String(item[config.titleField]).slice(0, 90))}</div>
          <div class="text-sm text-secondary">${escapeHtml(String(item[config.subField] || '').slice(0, 90))}</div>
        </div>
        ${item.created_at ? `<span class="text-sm text-muted">${timeAgo(item.created_at)}</span>` : ''}
        <button class="icon-btn edit-content" data-id="${item.id}"><i data-lucide="pencil" class="icon"></i></button>
        <button class="icon-btn delete-content" data-id="${item.id}"><i data-lucide="trash-2" class="icon"></i></button>
      </div>`).join('');
    initIcons();

    listEl.querySelectorAll('.edit-content').forEach((b) => b.addEventListener('click', () => openContentModal(b.dataset.id)));
    listEl.querySelectorAll('.delete-content').forEach((b) => b.addEventListener('click', async () => {
      const ok = await confirmModal({ title: 'Delete this item?', confirmText: 'Delete', danger: true });
      if (!ok) return;
      try {
        await api.del(`${config.endpoint}/${b.dataset.id}`);
        toast('Deleted', 'success');
        loadContent();
      } catch (err) { toast(err.message, 'error'); }
    }));
  } catch (err) {
    listEl.innerHTML = `<div class="empty-state"><i data-lucide="alert-triangle" class="icon"></i><p>${err.message}</p></div>`;
    initIcons();
  }
}

const contentModal = document.getElementById('contentModal');
const contentForm = document.getElementById('contentForm');

function fieldHtml(field, value = '') {
  if (field.type === 'textarea') return `<div class="field"><label>${field.label}</label><textarea data-key="${field.key}" rows="4">${escapeHtml(value)}</textarea></div>`;
  if (field.type === 'select') return `<div class="field"><label>${field.label}</label><select data-key="${field.key}">${field.options.map((o) => `<option value="${o}" ${o === value ? 'selected' : ''}>${o.replace(/_/g, ' ')}</option>`).join('')}</select></div>`;
  return `<div class="field"><label>${field.label}</label><input type="${field.type}" data-key="${field.key}" value="${escapeHtml(value)}" /></div>`;
}

function openContentModal(id) {
  const config = CONTENT_CONFIG[currentContentType];
  const item = id ? currentContentItems.find((x) => x.id === id) : null;
  document.getElementById('contentModalTitle').textContent = id ? 'Edit Item' : 'Add New Item';
  document.getElementById('contentFormBody').innerHTML =
    `<input type="hidden" id="contentId" value="${id || ''}" />` +
    config.fields.map((f) => fieldHtml(f, item ? (item[f.key] != null ? String(item[f.key]).slice(0, 10) : '') : '')).join('');
  contentModal.style.display = 'flex';
}

document.getElementById('addContentBtn').addEventListener('click', () => openContentModal(null));
document.getElementById('closeContentModal').addEventListener('click', () => (contentModal.style.display = 'none'));
document.getElementById('cancelContentModal').addEventListener('click', () => (contentModal.style.display = 'none'));
contentModal.addEventListener('click', (e) => { if (e.target === contentModal) contentModal.style.display = 'none'; });

contentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const config = CONTENT_CONFIG[currentContentType];
  const id = document.getElementById('contentId').value;
  const payload = {};
  document.querySelectorAll('#contentFormBody [data-key]').forEach((el) => {
    payload[el.dataset.key] = el.value || null;
  });
  const saveBtn = document.getElementById('saveContentBtn');
  saveBtn.disabled = true;
  try {
    if (id) {
      await api.put(`${config.endpoint}/${id}`, payload);
      toast('Updated', 'success');
    } else {
      await api.post(config.endpoint, payload);
      toast('Created', 'success');
    }
    contentModal.style.display = 'none';
    loadContent();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

/* ---------------- Past Papers ---------------- */
// Files now go through our own API (multipart/form-data) instead of
// Cloudinary - Express uploads them to a private Supabase Storage bucket
// using the service role key, so a student can never guess/share a public
// URL to a paper they haven't paid to unlock.
let currentPastPapers = [];
let editingPaperFileCount = 0; // existing files on the paper being edited (display only)

async function loadPastPapers(search = '') {
  const tbody = document.getElementById('ppTbody');
  tbody.innerHTML = `<tr><td colspan="7"><div class="loading-row"><span class="spinner"></span> Loading...</div></td></tr>`;
  try {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    const { data } = await api.get(`/pastpapers?${params.toString()}`);
    currentPastPapers = data;
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i data-lucide="file-stack" class="icon"></i><p>No past papers yet. Click "Add New" to upload one.</p></div></td></tr>`;
      initIcons();
      return;
    }
    tbody.innerHTML = data.map((p) => `
      <tr>
        <td><div style="font-weight:600;">${escapeHtml(p.course)}</div>${p.unit ? `<div class="text-sm text-muted">${escapeHtml(p.unit)}</div>` : ''}</td>
        <td class="text-sm">${escapeHtml(p.school)}</td>
        <td><span class="badge ${p.paper_type === 'cat' ? 'badge-gold' : 'badge-navy'}" style="text-transform:uppercase;">${p.paper_type}</span></td>
        <td class="text-sm">${escapeHtml(p.academic_year)}</td>
        <td class="text-sm">${p.page_count}</td>
        <td class="text-sm">${timeAgo(p.created_at)}</td>
        <td>
          <button class="icon-btn edit-paper" data-id="${p.id}"><i data-lucide="pencil" class="icon"></i></button>
          <button class="icon-btn delete-paper" data-id="${p.id}"><i data-lucide="trash-2" class="icon"></i></button>
        </td>
      </tr>`).join('');
    initIcons();

    tbody.querySelectorAll('.edit-paper').forEach((b) => b.addEventListener('click', () => openPastPaperModal(b.dataset.id)));
    tbody.querySelectorAll('.delete-paper').forEach((b) => b.addEventListener('click', async () => {
      const ok = await confirmModal({ title: 'Delete this past paper?', confirmText: 'Delete', danger: true });
      if (!ok) return;
      try {
        await api.del(`/pastpapers/${b.dataset.id}`);
        toast('Deleted', 'success');
        loadPastPapers(document.getElementById('ppSearch').value.trim());
      } catch (err) { toast(err.message, 'error'); }
    }));
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><p>${err.message}</p></div></td></tr>`;
    initIcons();
  }
}

let ppSearchDebounce;
document.getElementById('ppSearch').addEventListener('input', (e) => {
  clearTimeout(ppSearchDebounce);
  ppSearchDebounce = setTimeout(() => loadPastPapers(e.target.value.trim()), 350);
});

const pastPaperModal = document.getElementById('pastPaperModal');
const pastPaperForm = document.getElementById('pastPaperForm');

function renderThumbs() {
  // Files live in a private Storage bucket now - no public URL to preview
  // client-side without minting a signed URL per file, so this is a plain
  // count instead of image thumbnails. Uploading new files below replaces
  // the full set for this paper (old files are deleted from Storage).
  const wrap = document.getElementById('ppThumbs');
  wrap.innerHTML = editingPaperFileCount
    ? `<p class="text-sm text-secondary">${editingPaperFileCount} file(s) currently attached. Choosing new files below will replace all of them.</p>`
    : '';
}

function openPastPaperModal(id) {
  const paper = id ? currentPastPapers.find((p) => p.id === id) : null;
  document.getElementById('ppModalTitle').textContent = id ? 'Edit Past Paper' : 'Add Past Paper';
  document.getElementById('ppId').value = id || '';
  document.getElementById('ppSchool').value = paper?.school || '';
  document.getElementById('ppCourse').value = paper?.course || '';
  document.getElementById('ppUnit').value = paper?.unit || '';
  document.getElementById('ppType').value = paper?.paper_type || 'cat';
  document.getElementById('ppYear').value = paper?.academic_year || '';
  document.getElementById('ppFiles').value = '';
  document.getElementById('ppUploadProgress').style.display = 'none';
  editingPaperFileCount = paper?.page_count || 0;
  renderThumbs();
  pastPaperModal.style.display = 'flex';
  initIcons();
}

document.getElementById('addPastPaperBtn').addEventListener('click', () => openPastPaperModal(null));
document.getElementById('closePastPaperModal').addEventListener('click', () => (pastPaperModal.style.display = 'none'));
document.getElementById('cancelPastPaperModal').addEventListener('click', () => (pastPaperModal.style.display = 'none'));
pastPaperModal.addEventListener('click', (e) => { if (e.target === pastPaperModal) pastPaperModal.style.display = 'none'; });

pastPaperForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('ppId').value;
  const files = Array.from(document.getElementById('ppFiles').files);
  const progressEl = document.getElementById('ppUploadProgress');
  const saveBtn = document.getElementById('savePastPaperBtn');

  if (!id && files.length === 0) {
    toast('Add at least one PDF or photo', 'error');
    return;
  }

  saveBtn.disabled = true;
  try {
    const formData = new FormData();
    formData.append('school', document.getElementById('ppSchool').value.trim());
    formData.append('course', document.getElementById('ppCourse').value.trim());
    formData.append('unit', document.getElementById('ppUnit').value.trim());
    formData.append('paperType', document.getElementById('ppType').value);
    formData.append('academicYear', document.getElementById('ppYear').value.trim());
    files.forEach((f) => formData.append('files', f));

    if (files.length) {
      progressEl.style.display = 'block';
      progressEl.textContent = `Uploading ${files.length} file(s)...`;
    }

    if (id) {
      await api.putForm(`/pastpapers/${id}`, formData);
      toast('Updated', 'success');
    } else {
      await api.postForm('/pastpapers', formData);
      toast('Uploaded', 'success');
    }
    pastPaperModal.style.display = 'none';
    loadPastPapers(document.getElementById('ppSearch').value.trim());
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    progressEl.style.display = 'none';
  }
});

/* ---------------- Users ---------------- */
let allUsers = [];
let selectedUserId = null;

async function loadUsers(search = '') {
  const tbody = document.getElementById('usersTbody');
  tbody.innerHTML = `<tr><td colspan="5"><div class="loading-row"><span class="spinner"></span> Loading...</div></td></tr>`;
  try {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    const { data } = await api.get(`/admin/users?${params.toString()}`);
    allUsers = data;
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>No students found.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = data.map((u) => `
      <tr>
        <td>
          <div class="flex items-center gap-2">
            <div class="avatar" style="width:32px;height:32px;font-size:.75rem;">${(u.name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}</div>
            <div><div style="font-weight:600;">${escapeHtml(u.name)}${u.is_admin ? ' <span class=\"badge badge-gold\">Admin</span>' : ''}</div><div class="text-sm text-muted">${escapeHtml(u.email)}</div></div>
          </div>
        </td>
        <td class="text-sm">${escapeHtml(u.university || '—')}</td>
        <td>${u.subscription_status === 'active' ? '<span class="badge badge-green">Active</span>' : '<span class="badge badge-rose">Inactive</span>'}</td>
        <td class="text-sm">${new Date(u.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
        <td><button class="btn btn-outline btn-sm manage-user" data-id="${u.id}">Manage</button></td>
      </tr>`).join('');

    tbody.querySelectorAll('.manage-user').forEach((b) => b.addEventListener('click', () => openUserModal(b.dataset.id)));
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="empty-state"><p>${err.message}</p></div></td></tr>`;
  }
}

let searchDebounce;
document.getElementById('userSearch').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => loadUsers(e.target.value.trim()), 350);
});

const userModal = document.getElementById('userModal');
function openUserModal(id) {
  selectedUserId = id;
  const u = allUsers.find((x) => x.id === id);
  document.getElementById('userModalName').textContent = `${u.name} · ${u.email}`;
  userModal.style.display = 'flex';
}
document.getElementById('closeUserModal').addEventListener('click', () => (userModal.style.display = 'none'));
userModal.addEventListener('click', (e) => { if (e.target === userModal) userModal.style.display = 'none'; });

document.querySelectorAll('.grant-btn').forEach((btn) =>
  btn.addEventListener('click', async () => {
    try {
      await api.patch(`/admin/users/${selectedUserId}`, { grantSubscriptionDays: Number(btn.dataset.days) });
      toast('Subscription granted', 'success');
      userModal.style.display = 'none';
      loadUsers(document.getElementById('userSearch').value.trim());
    } catch (err) { toast(err.message, 'error'); }
  })
);
document.getElementById('makeAdminBtn').addEventListener('click', async () => {
  try {
    await api.patch(`/admin/users/${selectedUserId}`, { isAdmin: true });
    toast('User is now an admin', 'success');
    userModal.style.display = 'none';
    loadUsers(document.getElementById('userSearch').value.trim());
  } catch (err) { toast(err.message, 'error'); }
});
document.getElementById('removeAdminBtn').addEventListener('click', async () => {
  try {
    await api.patch(`/admin/users/${selectedUserId}`, { isAdmin: false });
    toast('Admin access removed', 'success');
    userModal.style.display = 'none';
    loadUsers(document.getElementById('userSearch').value.trim());
  } catch (err) { toast(err.message, 'error'); }
});

/* ---------------- Transactions ---------------- */
async function loadTransactions() {
  const tbody = document.getElementById('txTbody');
  tbody.innerHTML = `<tr><td colspan="6"><div class="loading-row"><span class="spinner"></span> Loading...</div></td></tr>`;
  try {
    const { data } = await api.get('/admin/transactions');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>No transactions yet.</p></div></td></tr>`;
      return;
    }
    const statusBadge = { success: 'badge-green', pending: 'badge-gold', failed: 'badge-rose', cancelled: 'badge-rose' };
    tbody.innerHTML = data.map((t) => `
      <tr>
        <td><div style="font-weight:600;">${escapeHtml(t.user_name)}</div><div class="text-sm text-muted">${escapeHtml(t.user_email)}</div></td>
        <td class="text-sm">${escapeHtml(t.phone_number)}</td>
        <td>${formatKES(t.amount)}</td>
        <td><span class="badge ${statusBadge[t.status] || ''}" style="text-transform:capitalize;">${t.status}</span></td>
        <td class="text-sm">${escapeHtml(t.mpesa_receipt_number || '—')}</td>
        <td class="text-sm">${new Date(t.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><p>${err.message}</p></div></td></tr>`;
  }
}

/* ---------------- Referral leaderboard ---------------- */
async function loadReferrals() {
  const tbody = document.getElementById('refTbody');
  tbody.innerHTML = `<tr><td colspan="4"><div class="loading-row"><span class="spinner"></span> Loading...</div></td></tr>`;
  try {
    const { data } = await api.get('/admin/referral-leaderboard');
    if (!data.length) {
      tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><p>No referrals yet.</p></div></td></tr>`;
      return;
    }
    tbody.innerHTML = data.map((r, i) => `
      <tr>
        <td>${i < 3 ? `<span class="badge badge-gold">#${i + 1}</span>` : `#${i + 1}`}</td>
        <td><div style="font-weight:600;">${escapeHtml(r.name)}</div><div class="text-sm text-muted">${escapeHtml(r.email)}</div></td>
        <td><span class="badge badge-navy">${r.referral_code}</span></td>
        <td style="font-weight:700;">${r.referred_count}</td>
      </tr>`).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><p>${err.message}</p></div></td></tr>`;
  }
}

loadStats();