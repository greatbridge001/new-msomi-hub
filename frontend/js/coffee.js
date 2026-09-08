// Reusable "Buy Me a Coffee" widget. Injects its own modal HTML once, then
// any element with [data-coffee-trigger] on the page opens it. Works for
// logged-in students and anonymous landing-page visitors alike, since the
// /api/coffee endpoints require no authentication.
import { api } from './api.js';
import { toast, initIcons } from './ui.js';

const AMOUNTS = [50, 100, 200, 500];
let injected = false;
let pollTimer;

function modalHtml() {
  return `
  <div class="modal-backdrop" id="coffeeModal" style="display:none;">
    <div class="modal" style="max-width:420px;">
      <div class="modal-header">
        <h3 style="font-size:1.1rem;display:flex;align-items:center;gap:.5rem;"><i data-lucide="coffee" class="icon" style="color:var(--gold-500);"></i> Buy Me a Coffee</h3>
        <button class="icon-btn" id="closeCoffeeModal"><i data-lucide="x" class="icon"></i></button>
      </div>

      <div id="coffeeStepForm">
        <div class="modal-body">
          <p class="text-sm text-secondary mb-4">Enjoying Msomi Hub? A small tip helps keep it running and growing. Any amount is appreciated!</p>
          <div class="field">
            <label>Choose an amount (KES)</label>
            <div class="flex gap-2" id="coffeeAmountChips" style="flex-wrap:wrap;">
              ${AMOUNTS.map((a, i) => `<button type="button" class="btn ${i === 1 ? 'btn-dark' : 'btn-outline'} btn-sm coffee-amount-chip" data-amount="${a}">KES ${a}</button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label for="coffeeAmount">Or enter your own amount</label>
            <input type="number" id="coffeeAmount" min="1" step="1" placeholder="e.g. 150" value="100" />
          </div>
          <div class="field">
            <label for="coffeePhone">M-Pesa phone number</label>
            <div class="input-wrap">
              <i data-lucide="smartphone" class="icon"></i>
              <input type="tel" id="coffeePhone" placeholder="07XXXXXXXX" pattern="0[17][0-9]{8}" required />
            </div>
          </div>
          <div class="field">
            <label for="coffeeName">Your name (optional)</label>
            <input type="text" id="coffeeName" placeholder="So we can say thank you!" />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" id="cancelCoffeeModal">Cancel</button>
          <button type="button" class="btn btn-primary" id="sendCoffeeBtn"><i data-lucide="coffee" class="icon"></i> Send Tip</button>
        </div>
      </div>

      <div id="coffeeStepWaiting" class="modal-body text-center" style="display:none;">
        <div class="spinner spinner-lg" style="margin:0 auto 1.2rem;"></div>
        <h3 style="font-size:1.05rem;margin-bottom:.4rem;">Check your phone</h3>
        <p class="text-sm text-secondary">Enter your M-Pesa PIN to complete your tip.</p>
      </div>

      <div id="coffeeStepTimeout" class="modal-body text-center" style="display:none;">
        <div class="f-icon icon-tint-gold" style="margin:0 auto 1rem;width:56px;height:56px;"><i data-lucide="clock" class="icon"></i></div>
        <h3 style="font-size:1.05rem;margin-bottom:.4rem;">Still confirming...</h3>
        <p class="text-sm text-secondary mb-4">This is taking longer than usual. If you already entered your PIN, tap below to check again.</p>
        <button type="button" class="btn btn-primary btn-block mb-2" id="coffeeRecheckBtn">Check again</button>
        <button type="button" class="btn btn-ghost btn-block" id="coffeeCancelTimeoutBtn">Cancel</button>
      </div>

      <div id="coffeeStepSuccess" class="modal-body text-center" style="display:none;">
        <div class="f-icon icon-tint-gold" style="margin:0 auto 1rem;width:56px;height:56px;"><i data-lucide="heart-handshake" class="icon"></i></div>
        <h3 style="font-size:1.15rem;margin-bottom:.4rem;">Thank you so much!</h3>
        <p class="text-sm text-secondary mb-4">Your support means a lot and helps keep Msomi Hub running.</p>
        <button type="button" class="btn btn-primary btn-block" id="closeCoffeeSuccess">Close</button>
      </div>
    </div>
  </div>`;
}

function ensureInjected() {
  if (injected) return;
  document.body.insertAdjacentHTML('beforeend', modalHtml());
  injected = true;
  wireModal();
}

let timeoutTimer;
let currentTipReference = null;

function wireModal() {
  const modal = document.getElementById('coffeeModal');
  const stepForm = document.getElementById('coffeeStepForm');
  const stepWaiting = document.getElementById('coffeeStepWaiting');
  const stepTimeout = document.getElementById('coffeeStepTimeout');
  const stepSuccess = document.getElementById('coffeeStepSuccess');
  const amountInput = document.getElementById('coffeeAmount');

  const closeModal = () => {
    modal.style.display = 'none';
    clearInterval(pollTimer);
    clearTimeout(timeoutTimer);
    stepForm.style.display = 'block';
    stepWaiting.style.display = 'none';
    stepTimeout.style.display = 'none';
    stepSuccess.style.display = 'none';
  };

  const showTimeoutStep = () => {
    clearInterval(pollTimer);
    clearTimeout(timeoutTimer);
    stepWaiting.style.display = 'none';
    stepTimeout.style.display = 'block';
  };

  document.getElementById('closeCoffeeModal').addEventListener('click', closeModal);
  document.getElementById('cancelCoffeeModal').addEventListener('click', closeModal);
  document.getElementById('closeCoffeeSuccess').addEventListener('click', closeModal);
  document.getElementById('coffeeCancelTimeoutBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  document.getElementById('coffeeRecheckBtn').addEventListener('click', () => {
    if (!currentTipReference) return;
    stepTimeout.style.display = 'none';
    stepWaiting.style.display = 'block';
    pollTipStatus(currentTipReference, stepWaiting, stepSuccess, { manual: true });
    pollTimer = setInterval(() => pollTipStatus(currentTipReference, stepWaiting, stepSuccess), 3000);
    timeoutTimer = setTimeout(showTimeoutStep, 60000);
  });

  modal.querySelectorAll('.coffee-amount-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      amountInput.value = chip.dataset.amount;
      modal.querySelectorAll('.coffee-amount-chip').forEach((c) => (c.className = 'btn btn-outline btn-sm coffee-amount-chip'));
      chip.className = 'btn btn-dark btn-sm coffee-amount-chip';
    });
  });

  document.getElementById('sendCoffeeBtn').addEventListener('click', async () => {
    const amount = Number(amountInput.value);
    const phoneNumber = document.getElementById('coffeePhone').value.trim();
    const supporterName = document.getElementById('coffeeName').value.trim();

    if (!amount || amount <= 0) return toast('Enter a valid amount', 'error');
    if (!/^0[17][0-9]{8}$/.test(phoneNumber)) return toast('Enter a valid M-Pesa phone number (07XXXXXXXX)', 'error');

    const btn = document.getElementById('sendCoffeeBtn');
    btn.disabled = true;
    try {
      const { reference } = await api.post('/coffee/tip', { amount, phoneNumber, supporterName }, { auth: false });
      currentTipReference = reference;
      stepForm.style.display = 'none';
      stepWaiting.style.display = 'block';
      pollTimer = setInterval(() => pollTipStatus(reference, stepWaiting, stepSuccess), 3000);
      // After 60s of no resolution, stop silently polling and show a clear
      // "still confirming" message with a manual recheck button, instead of
      // leaving the spinner running forever with no feedback.
      timeoutTimer = setTimeout(showTimeoutStep, 60000);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
}

async function pollTipStatus(reference, stepWaiting, stepSuccess, { manual = false } = {}) {
  try {
    const { data } = await api.get(`/coffee/status/${reference}`, { auth: false });
    if (data.status === 'success') {
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      document.getElementById('coffeeStepTimeout').style.display = 'none';
      stepWaiting.style.display = 'none';
      stepSuccess.style.display = 'block';
      initIcons();
    } else if (data.status === 'failed' || data.status === 'cancelled') {
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
      toast(data.result_desc || 'Tip was not completed.', 'error');
      document.getElementById('coffeeModal').style.display = 'none';
    } else if (manual) {
      toast('Still waiting for confirmation. We\'ll keep checking.', 'info');
    }
  } catch { /* transient error, keep polling */ }
}

export function openCoffeeModal() {
  ensureInjected();
  document.getElementById('coffeeModal').style.display = 'flex';
  initIcons();
}

/** Wires up every element with [data-coffee-trigger] on the current page. */
export function initCoffeeWidget() {
  document.querySelectorAll('[data-coffee-trigger]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openCoffeeModal();
    });
  });
}