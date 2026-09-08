import { api, requireAuthOrRedirect } from './api.js';
import { toast, initIcons } from './ui.js';
import { initShell } from './shell.js';

requireAuthOrRedirect();
initShell({ active: 'pastpapers', title: 'Revision Materials' });

const loadingState = document.getElementById('loadingState');
const paywallCard = document.getElementById('paywallCard');
const libraryView = document.getElementById('libraryView');

/* ---------------- Access check ---------------- */
async function checkAccess() {
  try {
    const access = await api.get('/pastpapers/access');
    loadingState.style.display = 'none';
    if (access.status === 'active') {
      showLibrary(access);
    } else {
      paywallCard.style.display = 'block';
      initIcons();
    }
  } catch (err) {
    loadingState.style.display = 'none';
    toast(err.message, 'error');
  }
}

function showLibrary(access) {
  paywallCard.style.display = 'none';
  libraryView.style.display = 'block';
  const hint = document.getElementById('expiryHint');
  if (access.expiresAt) {
    hint.textContent = `Your access is valid until ${new Date(access.expiresAt).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })}.`;
  } else {
    hint.textContent = '';
  }
  initIcons();
  loadMeta();
  loadPapers();
}

/* ---------------- Unlock payment flow (same pattern as subscribe.js) ---------------- */
const unlockForm = document.getElementById('unlockForm');
const stepPay = document.getElementById('unlockStepPay');
const stepWaiting = document.getElementById('unlockStepWaiting');
const stepSuccess = document.getElementById('unlockStepSuccess');

let pollTimer;
async function pollUnlockStatus(reference) {
  try {
    const { data } = await api.get(`/pastpapers/unlock/status/${reference}`);
    if (data.status === 'success') {
      clearInterval(pollTimer);
      stepWaiting.style.display = 'none';
      stepSuccess.style.display = 'block';
      initIcons();
    } else if (data.status === 'failed' || data.status === 'cancelled') {
      clearInterval(pollTimer);
      stepWaiting.style.display = 'none';
      stepPay.style.display = 'block';
      toast(data.result_desc || 'Payment was not completed. Please try again.', 'error');
    }
  } catch (err) {
    // transient network hiccup - keep polling silently
  }
}

unlockForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = unlockForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    const { reference } = await api.post('/pastpapers/unlock', { phoneNumber: unlockForm.phone.value.trim() });
    stepPay.style.display = 'none';
    stepWaiting.style.display = 'block';
    pollTimer = setInterval(() => pollUnlockStatus(reference), 3000);
    setTimeout(() => clearInterval(pollTimer), 120000);
  } catch (err) {
    toast(err.message, 'error');
    submitBtn.disabled = false;
  }
});

document.getElementById('afterUnlockBtn').addEventListener('click', () => checkAccess());

/* ---------------- Meta (filter dropdown options) ---------------- */
async function loadMeta() {
  try {
    const meta = await api.get('/pastpapers/meta');
    const schoolFilter = document.getElementById('schoolFilter');
    meta.schools.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      schoolFilter.appendChild(opt);
    });
    const yearFilter = document.getElementById('yearFilter');
    meta.academicYears.forEach((y) => {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      yearFilter.appendChild(opt);
    });
  } catch (err) {
    // non-critical - filters just stay at "All" if this fails
  }
}

/* ---------------- Search / list ---------------- */
function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const grid = document.getElementById('paperGrid');
let currentPapers = [];

async function loadPapers() {
  grid.innerHTML = `<div class="loading-row" style="grid-column:1/-1;"><span class="spinner"></span> Loading papers...</div>`;
  const params = new URLSearchParams();
  const q = document.getElementById('searchInput').value.trim();
  const school = document.getElementById('schoolFilter').value;
  const paperType = document.getElementById('typeFilter').value;
  const academicYear = document.getElementById('yearFilter').value;
  if (q) params.set('q', q);
  if (school) params.set('school', school);
  if (paperType) params.set('paperType', paperType);
  if (academicYear) params.set('academicYear', academicYear);

  try {
    const { data } = await api.get(`/pastpapers?${params.toString()}`);
    currentPapers = data;
    if (!data.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><i data-lucide="file-search" class="icon"></i><p>No papers match your search yet. Try a different course or check back soon.</p></div>`;
      initIcons();
      return;
    }
    grid.innerHTML = data.map((p) => `
      <div class="card card-pad">
        <div class="flex items-center gap-2 mb-2">
          <span class="badge ${p.paper_type === 'cat' ? 'badge-gold' : 'badge-navy'}" style="text-transform:uppercase;">${p.paper_type}</span>
          <span class="text-sm text-muted">${escapeHtml(p.academic_year)}</span>
        </div>
        <h3 style="font-size:1rem;margin-bottom:.2rem;">${escapeHtml(p.course)}</h3>
        ${p.unit ? `<div class="text-sm text-secondary mb-2">${escapeHtml(p.unit)}</div>` : ''}
        <div class="text-sm text-muted mb-3">${escapeHtml(p.school)}</div>
        <button class="btn btn-outline btn-sm btn-block view-paper" data-id="${p.id}">
          <i data-lucide="images" class="icon"></i> View ${p.page_count} file${p.page_count === 1 ? '' : 's'}
        </button>
      </div>`).join('');
    initIcons();

    grid.querySelectorAll('.view-paper').forEach((btn) =>
      btn.addEventListener('click', () => openGallery(btn.dataset.id))
    );
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><p>${err.message}</p></div>`;
    initIcons();
  }
}

let searchDebounce;
document.getElementById('searchInput').addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadPapers, 350);
});
['schoolFilter', 'typeFilter', 'yearFilter'].forEach((id) =>
  document.getElementById(id).addEventListener('change', loadPapers)
);

/* ---------------- Gallery viewer ----------------
 * File bytes never live on our server or in the paper list response - each
 * file is a Supabase Storage object behind a paywall RLS policy. Opening a
 * paper mints short-lived (5 min) signed URLs just for viewing; the
 * download button mints a second signed URL with a forced
 * content-disposition so it saves to the student's device instead of
 * opening inline. Both expire quickly, so a shared link stops working fast.
 */
const galleryModal = document.getElementById('galleryModal');
async function openGallery(id) {
  const paper = currentPapers.find((p) => p.id === id);
  if (!paper) return;
  document.getElementById('galleryTitle').textContent = `${paper.course}${paper.unit ? ' — ' + paper.unit : ''}`;
  const imagesEl = document.getElementById('galleryImages');
  imagesEl.innerHTML = `<div class="loading-row"><span class="spinner"></span> Preparing files...</div>`;
  galleryModal.style.display = 'flex';

  try {
    const { data: files } = await api.get(`/pastpapers/${id}/access-url?mode=view`);
    const { data: downloadFiles } = await api.get(`/pastpapers/${id}/access-url?mode=download`);

    imagesEl.innerHTML = files.map((f, i) => {
      const dl = downloadFiles[i]?.url || f.url;
      const viewer = f.type === 'pdf'
        ? `<iframe src="${f.url}" style="width:100%;height:70vh;border:1px solid var(--border-subtle);border-radius:var(--radius-md);" title="Page ${i + 1}"></iframe>`
        : `<img src="${f.url}" alt="Page ${i + 1}" style="width:100%;border-radius:var(--radius-md);border:1px solid var(--border-subtle);" loading="lazy" />`;
      return `
        <div style="margin-bottom:1rem;">
          ${viewer}
          <a href="${dl}" class="btn btn-outline btn-sm mt-2" download>
            <i data-lucide="download" class="icon"></i> Download page ${i + 1}
          </a>
        </div>`;
    }).join('');
    initIcons();
  } catch (err) {
    imagesEl.innerHTML = `<div class="empty-state"><p>${err.message || 'Could not load this paper. Please try again.'}</p></div>`;
    initIcons();
  }
}
document.getElementById('closeGalleryModal').addEventListener('click', () => (galleryModal.style.display = 'none'));
galleryModal.addEventListener('click', (e) => { if (e.target === galleryModal) galleryModal.style.display = 'none'; });

checkAccess();