import { api, requireAuthOrRedirect } from './api.js';
import { toast, initIcons } from './ui.js';

requireAuthOrRedirect();
initIcons();

const form = document.getElementById('pay-form');
const stepPhone = document.getElementById('step-phone');
const stepWaiting = document.getElementById('step-waiting');
const stepSuccess = document.getElementById('step-success');
const alreadyActive = document.getElementById('already-active');
const payFlow = document.getElementById('pay-flow');

async function checkExistingSubscription() {
  try {
    const sub = await api.get('/payments/subscription');
    if (sub.status === 'active') {
      payFlow.style.display = 'none';
      alreadyActive.style.display = 'block';
      if (sub.expiresAt) {
        document.getElementById('expiry-date').textContent = new Date(sub.expiresAt).toLocaleDateString('en-KE', {
          year: 'numeric', month: 'long', day: 'numeric'
        });
      } else {
        document.getElementById('expiry-date').textContent = 'no expiry (admin access)';
      }
    }
  } catch (err) {
    console.error('Could not check subscription status', err);
  }
}

let pollTimer;
async function pollStatus(reference) {
  try {
    const { data } = await api.get(`/payments/status/${reference}`);
    if (data.status === 'success') {
      clearInterval(pollTimer);
      stepWaiting.style.display = 'none';
      stepSuccess.style.display = 'block';
      initIcons();
    } else if (data.status === 'failed' || data.status === 'cancelled') {
      clearInterval(pollTimer);
      stepWaiting.style.display = 'none';
      stepPhone.style.display = 'block';
      toast(data.result_desc || 'Payment was not completed. Please try again.', 'error');
    }
  } catch (err) {
    // transient network hiccup - keep polling silently
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const { reference } = await api.post('/payments/subscribe', { phoneNumber: form.phone.value.trim() });
    stepPhone.style.display = 'none';
    stepWaiting.style.display = 'block';

    pollTimer = setInterval(() => pollStatus(reference), 3000);
    setTimeout(() => clearInterval(pollTimer), 120000);
  } catch (err) {
    toast(err.message, 'error');
    submitBtn.disabled = false;
  }
});

checkExistingSubscription();
