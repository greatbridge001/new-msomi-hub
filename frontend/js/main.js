import { initIcons, initScrollReveal } from './ui.js';
import { wireThemeToggle } from './theme.js';
import { isLoggedIn } from './api.js';
import { initCoffeeWidget } from './coffee.js';

initIcons();
wireThemeToggle('themeToggle');
initScrollReveal();
initCoffeeWidget();
document.getElementById('year').textContent = new Date().getFullYear();

// Navbar scroll state
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
});

// Mobile nav
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileNav = document.getElementById('mobileNav');
const closeMobileNav = document.getElementById('closeMobileNav');
mobileMenuBtn?.addEventListener('click', () => {
  mobileNav.style.display = 'block';
  initIcons();
});
closeMobileNav?.addEventListener('click', () => (mobileNav.style.display = 'none'));
mobileNav?.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => (mobileNav.style.display = 'none')));

// Hero stat numbers - shown immediately, no count-up animation
const counters = document.querySelectorAll('[data-count]');
counters.forEach((c) => {
  c.textContent = Number(c.dataset.count).toLocaleString();
});

// If already logged in, send returning visitors straight to their dashboard
if (isLoggedIn() && (window.location.pathname === '/' || window.location.pathname.endsWith('index.html'))) {
  document.querySelectorAll('a[href="pages/register.html"]').forEach((a) => {
    a.textContent = a.textContent.includes('Get Started') ? 'Go to Dashboard' : a.textContent;
    if (a.classList.contains('btn')) a.href = 'pages/dashboard.html';
  });
}