import { api, setSession, isLoggedIn, setCached } from './api.js';
import { toast, initIcons } from './ui.js';
import { wireThemeToggle } from './theme.js';

initIcons();
wireThemeToggle('themeToggle');

// Already logged in? Skip straight past the auth forms.
if (isLoggedIn() && (document.querySelector('#login-form') || document.querySelector('#register-form'))) {
  window.location.href = 'dashboard.html';
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<span class="spinner"></span> Please wait...`
    : label;
}

// Password show/hide toggles
document.querySelectorAll('.toggle-visibility').forEach((btn) => {
  btn.addEventListener('click', () => {
    const input = btn.previousElementSibling;
    const isPw = input.type === 'password';
    input.type = isPw ? 'text' : 'password';
    btn.innerHTML = `<i data-lucide="${isPw ? 'eye-off' : 'eye'}" class="icon"></i>`;
    initIcons();
  });
});

const loginForm = document.querySelector('#login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalLabel = submitBtn.innerHTML;
    setLoading(submitBtn, true);
    try {
      const email = loginForm.email.value.trim();
      const password = loginForm.password.value;
      const { token, user } = await api.post('/auth/login', { email, password }, { auth: false });
      setSession(token, user);

      api.get('/dashboard').then((dash) => setCached('dashboard', dash)).catch(() => {});

      toast('Welcome back! Redirecting...', 'success', 1500);
      setTimeout(() => (window.location.href = 'dashboard.html'), 500);
    } catch (err) {
      toast(err.message || 'Login failed', 'error');
      setLoading(submitBtn, false, originalLabel);
    }
  });
}

const registerForm = document.querySelector('#register-form');
if (registerForm) {
  const referralCode = new URLSearchParams(window.location.search).get('ref');
  const referralBanner = document.querySelector('#referral-banner');
  if (referralCode && referralBanner) {
    referralBanner.style.display = 'flex';
    referralBanner.querySelector('[data-ref-code]').textContent = referralCode;
  }

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = registerForm.querySelector('button[type="submit"]');
    const originalLabel = submitBtn.innerHTML;

    const password = registerForm.password.value;
    const confirmPassword = registerForm.confirmPassword.value;
    if (password.length < 8) {
      toast('Password must be at least 8 characters', 'error');
      return;
    }
    if (password !== confirmPassword) {
      toast('Passwords do not match', 'error');
      return;
    }

    setLoading(submitBtn, true);
    try {
      const payload = {
        name: registerForm.name.value.trim(),
        email: registerForm.email.value.trim(),
        password,
        university: registerForm.university.value.trim(),
        course: registerForm.course.value.trim(),
        yearOfStudy: registerForm.yearOfStudy.value ? Number(registerForm.yearOfStudy.value) : undefined,
        referralCode: referralCode || undefined
      };
      const { token, user } = await api.post('/auth/register', payload, { auth: false });
      setSession(token, user);

      toast('Account created! Redirecting to your dashboard...', 'success', 1500);
      setTimeout(() => (window.location.href = 'dashboard.html'), 500);
    } catch (err) {
      toast(err.message || 'Registration failed', 'error');
      setLoading(submitBtn, false, originalLabel);
    }
  });
}

const forgotForm = document.querySelector('#forgot-form');
if (forgotForm) {
  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = forgotForm.querySelector('button[type="submit"]');
    const originalLabel = submitBtn.innerHTML;
    setLoading(submitBtn, true);
    try {
      const email = forgotForm.email.value.trim();
      const result = await api.post('/auth/forgot-password', { email }, { auth: false });
      toast(result.message || 'If that email exists, a reset link has been generated.', 'success', 6000);
      forgotForm.reset();
    } catch (err) {
      toast(err.message || 'Something went wrong', 'error');
    } finally {
      setLoading(submitBtn, false, originalLabel);
    }
  });
}