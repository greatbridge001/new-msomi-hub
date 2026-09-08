// Shared UI helpers used across all pages: toasts, confirm modal, scroll-reveal, icons.

export function initIcons() {
  if (window.lucide) window.lucide.createIcons();
}

export function toast(message, type = 'info', ms = 3800) {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const iconName = type === 'success' ? 'check-circle-2' : type === 'error' ? 'alert-circle' : 'info';
  el.innerHTML = `<i data-lucide="${iconName}" class="icon"></i><span>${message}</span>`;
  stack.appendChild(el);
  initIcons();
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(40px)';
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/** Simple confirm modal, returns a Promise<boolean>. */
export function confirmModal({ title = 'Are you sure?', body = '', confirmText = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" style="max-width:400px;">
        <div class="modal-header"><h3 style="font-size:1.05rem;">${title}</h3></div>
        <div class="modal-body"><p class="text-secondary text-sm">${body}</p></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" data-act="cancel">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${confirmText}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.dataset.act === 'cancel') {
        backdrop.remove();
        resolve(false);
      }
      if (e.target.dataset.act === 'ok') {
        backdrop.remove();
        resolve(true);
      }
    });
  });
}

/** Fade/slide elements into view as they scroll in. Call once per page. */
export function initScrollReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in-view');
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  items.forEach((el) => io.observe(el));
}

/** Animate a number counting up, used for hero/stat counters. */
export function animateCount(el, target, duration = 1400) {
  const start = performance.now();
  const from = 0;
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (target - from) * eased).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

export function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatKES(amount) {
  return `KES ${Number(amount || 0).toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function initials(name = '') {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || 'U';
}

/**
 * Renders an avatar: the student's photo if they've uploaded one, otherwise
 * the initials-on-gradient fallback used everywhere already. Pass an
 * `extraClass` like 'avatar-lg' for the bigger profile-page version.
 */
export function avatarHtml(user, extraClass = '') {
  const cls = `avatar ${extraClass}`.trim();
  if (user?.profilePicture) {
    return `<img class="${cls}" src="${user.profilePicture}" alt="${initials(user?.name)}" style="object-fit:cover;" />`;
  }
  return `<div class="${cls}">${initials(user?.name)}</div>`;
}
