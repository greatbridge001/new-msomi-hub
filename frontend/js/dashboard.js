import { api, getWithCache, requireAuthOrRedirect, getCurrentUser } from './api.js';
import { initIcons, formatKES, timeAgo } from './ui.js';
import { initShell } from './shell.js';

requireAuthOrRedirect();
const user = initShell({ active: 'dashboard', title: 'Dashboard' });

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hour = Number(h);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hr12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hr12}:${m} ${period}`;
}

function greetingByHour() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// Paint the name-based greeting the instant the page loads, straight from
// the session we already have in localStorage. No network call needed for
// this - it should never be blank or generic while data loads.
document.getElementById('greetingText').textContent =
  `${greetingByHour()}, ${(user?.name || 'Student').split(' ')[0]}`;
document.getElementById('greetingSub').textContent =
  `Here's what's happening on ${new Date().toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}.`;

function renderDashboard(dash) {
  document.getElementById('greetingSub').textContent = `Here's what's happening on ${new Date(dash.date).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long' })}.`;

  // Verse + quote
  if (dash.dailyBibleVerse) {
    document.getElementById('verseBadge').querySelector('span').textContent = `"${dash.dailyBibleVerse.verse_text}" — ${dash.dailyBibleVerse.reference}`;
  }
  if (dash.dailyMotivation) {
    document.getElementById('quoteText').textContent = `"${dash.dailyMotivation.quote_text}"`;
    document.getElementById('quoteAuthor').textContent = `— ${dash.dailyMotivation.author || 'Unknown'}`;
  }

  // Stats
  document.getElementById('statBalance').textContent = formatKES(dash.budgetSummary?.balance ?? 0);
  document.getElementById('statGpa').textContent = dash.cumulativeGpa != null ? dash.cumulativeGpa.toFixed(2) : '—';

  // Timetable
  const ttEl = document.getElementById('todayTimetable');
  if (!dash.todaysTimetable?.length) {
    ttEl.innerHTML = emptyState('calendar-off', 'No classes scheduled for today.', 'timetable.html', 'Add to timetable');
  } else {
    ttEl.innerHTML = dash.todaysTimetable.map((t) => `
      <div class="list-row">
        <div class="stat-icon icon-tint-navy" style="width:40px;height:40px;margin:0;"><i data-lucide="book-open" class="icon"></i></div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:.92rem;">${escapeHtml(t.subject)}</div>
          <div class="text-sm text-secondary">${formatTime(t.start_time)} – ${formatTime(t.end_time)}${t.location ? ' · ' + escapeHtml(t.location) : ''}</div>
        </div>
      </div>`).join('');
  }

  // Reminders
  const remEl = document.getElementById('upcomingReminders');
  if (!dash.upcomingReminders?.length) {
    remEl.innerHTML = emptyState('bell-off', 'No upcoming reminders. You\'re all caught up!', 'reminders.html', 'Add a reminder');
  } else {
    remEl.innerHTML = dash.upcomingReminders.map((r) => {
      const days = Math.ceil((new Date(r.due_date) - new Date()) / 86400000);
      const urgent = days <= 2;
      return `
      <div class="list-row">
        <div class="stat-icon ${urgent ? 'icon-tint-rose' : 'icon-tint-gold'}" style="width:40px;height:40px;margin:0;"><i data-lucide="${typeIcon(r.reminder_type)}" class="icon"></i></div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:.92rem;">${escapeHtml(r.title)}</div>
          <div class="text-sm text-secondary">${escapeHtml(r.subject || '')}</div>
        </div>
        <span class="badge ${urgent ? 'badge-rose' : 'badge-gold'}">${days <= 0 ? 'Due today' : days + 'd left'}</span>
      </div>`;
    }).join('');
  }

  // Opportunities
  const oppEl = document.getElementById('latestOpportunities');
  if (!dash.latestInternships?.length) {
    oppEl.innerHTML = emptyState('briefcase', 'No internships listed right now. Check back soon.', 'opportunities.html', 'Browse opportunities');
  } else {
    oppEl.innerHTML = dash.latestInternships.map((o) => `
      <div class="list-row">
        <div class="stat-icon icon-tint-green" style="width:40px;height:40px;margin:0;"><i data-lucide="briefcase" class="icon"></i></div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:.92rem;">${escapeHtml(o.title)}</div>
          <div class="text-sm text-secondary">${escapeHtml(o.organization || '')}</div>
        </div>
      </div>`).join('');
  }

  // HELB feed
  const helbEl = document.getElementById('helbFeed');
  if (!dash.helbUpdates?.length) {
    helbEl.innerHTML = emptyState('landmark', 'No HELB updates yet.', 'helb.html', 'View HELB hub');
  } else {
    helbEl.innerHTML = dash.helbUpdates.slice(0, 4).map((h) => `
      <div class="list-row" style="align-items:flex-start;">
        <span class="badge badge-navy" style="text-transform:capitalize;flex-shrink:0;">${h.update_type}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:600;font-size:.88rem;">${escapeHtml(h.title)}</div>
          <div class="text-sm text-muted">${timeAgo(h.created_at)}</div>
        </div>
      </div>`).join('');
  }

  initIcons();
}

async function loadDashboard() {
  // Single call now (GPA summary is folded into /dashboard server-side),
  // and no separate subscription pre-check - the /dashboard route already
  // enforces an active subscription itself, so we just handle a 402 here.
  // getWithCache paints any previously-cached dashboard INSTANTLY (0ms),
  // then quietly fetches the live data and re-renders when it lands -
  // the student never stares at a blank/spinner screen on repeat visits.
  await getWithCache('/dashboard', 'dashboard', {
    onCache: renderDashboard,
    onFresh: renderDashboard,
    onError: (err) => {
      if (err.code === 'SUBSCRIPTION_REQUIRED' || err.code === 'SUBSCRIPTION_EXPIRED') {
        window.location.href = 'subscribe.html';
        return;
      }
      console.error(err);
    }
  });
}

function typeIcon(type) {
  return { cat: 'file-text', assignment: 'clipboard-list', exam: 'graduation-cap', other: 'bell' }[type] || 'bell';
}

function emptyState(icon, text, href, cta) {
  return `<div class="empty-state" style="padding:1.5rem;">
    <i data-lucide="${icon}" class="icon"></i>
    <p class="text-sm">${text}</p>
    ${href ? `<a href="${href}" class="btn btn-outline btn-sm mt-2">${cta}</a>` : ''}
  </div>`;
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

loadDashboard();
