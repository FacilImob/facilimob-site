import { api, toast } from './api.js';

const form = document.querySelector('#loginForm');
const codeForm = document.querySelector('#codeForm');
const status = document.querySelector('#status');
const sentTo = document.querySelector('[data-sent-to]');
const tokenInput = codeForm.querySelector('[name="token"]');
let currentEmail = '';
let verifying = false;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = form.elements.email.value.trim().toLowerCase();

  try {
    await requestCode(email);
    showCodeStep(email);
  } catch (error) {
    toast(status, error.message, 'error');
  }
});

tokenInput.addEventListener('input', async () => {
  tokenInput.value = tokenInput.value.replace(/\D/g, '').slice(0, 6);

  if (tokenInput.value.length === 6 && !verifying) {
    await verifyCode();
  }
});

async function verifyCode() {
  const token = tokenInput.value.replace(/\D/g, '');
  verifying = true;
  tokenInput.disabled = true;

  try {
    await api('/api/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email: currentEmail, token })
    });
    window.location.href = '/index.html';
  } catch (error) {
    toast(status, error.message, 'error');
    tokenInput.value = '';
    tokenInput.disabled = false;
    tokenInput.focus();
    verifying = false;
  }
}

document.querySelector('[data-resend]').addEventListener('click', async () => {
  try {
    await requestCode(currentEmail);
    toast(status, 'Novo codigo enviado.', 'success');
  } catch (error) {
    toast(status, error.message, 'error');
  }
});

async function requestCode(email) {
  await api('/api/auth/request-code', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

function showCodeStep(email) {
  currentEmail = email;
  verifying = false;
  status.classList.remove('show', 'error', 'success');
  status.textContent = '';
  sentTo.textContent = `Codigo enviado para ${email}`;
  form.hidden = true;
  codeForm.hidden = false;
  tokenInput.value = '';
  tokenInput.disabled = false;
  tokenInput.focus();
}
