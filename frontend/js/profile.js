import { api, requireAuthOrRedirect, getCurrentUser, setSession, clearSession } from './api.js';
import { initIcons, toast, initials, avatarHtml, formatKES } from './ui.js';
import { initShell } from './shell.js';

requireAuthOrRedirect();
initShell({ active: 'profile', title: 'Profile & Referrals' });

const user = getCurrentUser();
let pendingPhotoDataUrl = null; // set only when the student picks a new photo this visit

function renderAvatar(u) {
  document.getElementById('profileAvatarSlot').innerHTML = avatarHtml(u, 'avatar-lg');
  initIcons();
}

renderAvatar(user);
function renderBioDisplay(bio) {
  const el = document.getElementById('profileBioDisplay');
  if (bio && bio.trim()) {
    el.textContent = bio;
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
}

document.getElementById('profileName').textContent = user?.name || '';
document.getElementById('profileEmail').textContent = user?.email || '';
document.getElementById('name').value = user?.name || '';
document.getElementById('university').value = user?.university || '';
document.getElementById('course').value = user?.course || '';
document.getElementById('yearOfStudy').value = user?.yearOfStudy || '';
document.getElementById('bio').value = user?.bio || '';
document.getElementById('bioCount').textContent = `${(user?.bio || '').length} / 280`;
renderBioDisplay(user?.bio);

document.getElementById('bio').addEventListener('input', (e) => {
  document.getElementById('bioCount').textContent = `${e.target.value.length} / 280`;
});

/**
 * Resizes and compresses an image client-side before we ever send it
 * anywhere. This keeps the upload fast on a slow connection, keeps the
 * request well under the server's body-size limit, and keeps the database
 * row small since the picture is stored as a data URL. Caps the longest
 * side at 400px and re-encodes as JPEG at 80% quality.
 */
function compressImage(file, maxDimension = 400, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file doesn\'t look like a valid image'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const avatarInput = document.getElementById('avatarInput');
document.getElementById('avatarUploadWrap').addEventListener('click', () => avatarInput.click());
document.getElementById('changePhotoBtn').addEventListener('click', () => avatarInput.click());

avatarInput.addEventListener('change', async () => {
  const file = avatarInput.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    toast('Please choose an image file', 'error');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    toast('That image is too large - please choose one under 8MB', 'error');
    return;
  }

  try {
    pendingPhotoDataUrl = await compressImage(file);
    // Instant preview - swap the avatar to the new photo right away, before
    // the student even hits "Save Changes".
    renderAvatar({ ...user, profilePicture: pendingPhotoDataUrl });
    toast('Photo ready - click "Save Changes" to apply it', 'info', 3000);
  } catch (err) {
    toast(err.message, 'error');
  }
});

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveProfileBtn');
  btn.disabled = true;
  try {
    const payload = {
      name: document.getElementById('name').value.trim(),
      university: document.getElementById('university').value.trim(),
      course: document.getElementById('course').value.trim(),
      yearOfStudy: document.getElementById('yearOfStudy').value ? Number(document.getElementById('yearOfStudy').value) : undefined,
      bio: document.getElementById('bio').value.trim(),
      profilePicture: pendingPhotoDataUrl || undefined
    };
    const { user: updated } = await api.put('/auth/me', payload);
    setSession(localStorage.getItem('studentflow_token'), updated);
    pendingPhotoDataUrl = null;
    document.getElementById('profileName').textContent = updated.name;
    renderBioDisplay(updated.bio);
    renderAvatar(updated);
    toast('Profile updated', 'success');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('copyRefBtn').addEventListener('click', () => {
  const input = document.getElementById('referralLink');
  input.select();
  navigator.clipboard?.writeText(input.value).then(
    () => toast('Referral link copied!', 'success'),
    () => document.execCommand('copy')
  );
});

document.getElementById('logoutBtn2').addEventListener('click', async () => {
  await clearSession();
  window.location.href = 'login.html';
});

async function loadReferrals() {
  try {
    const stats = await api.get('/auth/referrals');
    const link = `${window.location.origin}/pages/register.html?ref=${stats.referralCode}`;
    document.getElementById('referralLink').value = link;
    document.getElementById('referredCount').textContent = `${stats.referredCount} student${stats.referredCount === 1 ? '' : 's'} referred`;
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function loadSubscription() {
  const box = document.getElementById('subStatusBox');
  try {
    const sub = await api.get('/payments/subscription');
    if (sub.isAdminBypass) {
      box.innerHTML = `<div class="badge badge-gold"><i data-lucide="shield-check" class="icon"></i> Admin — full access</div>`;
    } else if (sub.status === 'active') {
      box.innerHTML = `
        <div class="badge badge-green mb-2"><i data-lucide="check-circle-2" class="icon"></i> Active</div>
        <p class="text-sm text-secondary">Expires ${sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</p>
        ${sub.amountPaid ? `<p class="text-sm text-secondary mt-1">Paid ${formatKES(sub.amountPaid)}</p>` : ''}`;
    } else {
      box.innerHTML = `
        <div class="badge badge-rose mb-2"><i data-lucide="alert-circle" class="icon"></i> ${sub.status === 'expired' ? 'Expired' : 'Not subscribed'}</div>
        <a href="subscribe.html" class="btn btn-primary btn-sm btn-block mt-2">Subscribe for KES 100</a>`;
    }
    initIcons();
  } catch (err) {
    box.innerHTML = `<p class="text-sm text-secondary">Could not load subscription status.</p>`;
  }
}

loadReferrals();
loadSubscription();
