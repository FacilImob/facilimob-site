import { api, toast } from './api.js';

const form = document.querySelector('#loginForm');
const codeForm = document.querySelector('#codeForm');
const status = document.querySelector('#status');
const sentTo = document.querySelector('[data-sent-to]');
const tokenInput = codeForm.querySelector('[name="token"]');
const resendButton = document.querySelector('[data-resend]');
const changeEmailButton = document.querySelector('[data-change-email]');
const resendDefaultLabel = 'Reenviar acesso';
let currentEmail = '';
let sending = false;
let verifying = false;

completeMagicLink();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (sending) return;

  const email = form.elements.email.value.trim().toLowerCase();
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.innerHTML;

  try {
    setSending(true, button, 'Enviando...');
    button.innerHTML = 'Enviando link...';
    toast(status, 'Enviando link de acesso...', 'success');
    await requestCode(email);
    showCodeStep(email);
    toast(status, `Enviamos o acesso para ${email}. Clique no link do e-mail ou cole o codigo de 6 digitos aqui.`, 'success');
  } catch (error) {
    showEmailStep(email);
    toast(status, error.message, 'error');
  } finally {
    setSending(false, button);
    button.innerHTML = originalText;
  }
});

tokenInput.addEventListener('input', async () => {
  tokenInput.value = tokenInput.value.replace(/\D/g, '').slice(0, 6);

  if (tokenInput.value.length === 6 && !verifying) {
    await verifyCode();
  }
});

resendButton.addEventListener('click', async () => {
  if (sending) return;

  try {
    setSending(true, resendButton, 'Reenviando...');
    await requestCode(currentEmail);
    showCodeStep(currentEmail);
    toast(status, 'Novo acesso enviado. Use o e-mail mais recente para entrar.', 'success');
  } catch (error) {
    toast(status, error.message, 'error');
  } finally {
    setSending(false, resendButton, resendDefaultLabel);
  }
});

changeEmailButton.addEventListener('click', () => {
  showEmailStep(currentEmail);
  status.classList.remove('show', 'error', 'success');
  status.textContent = '';
});

async function requestCode(email) {
  await api('/api/auth/request-code', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

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

async function completeMagicLink() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');

  if (!accessToken) return;

  history.replaceState(null, '', window.location.pathname);
  form.hidden = true;
  toast(status, 'Validando link de acesso...', 'success');

  try {
    await api('/api/auth/complete-link', {
      method: 'POST',
      body: JSON.stringify({ access_token: accessToken })
    });
    window.location.href = '/index.html';
  } catch (error) {
    form.hidden = false;
    toast(status, error.message, 'error');
  }
}

function showCodeStep(email) {
  currentEmail = email;
  verifying = false;
  status.classList.remove('show', 'error', 'success');
  status.textContent = '';
  sentTo.textContent = `Enviamos o acesso para ${email}.`;
  form.hidden = true;
  codeForm.hidden = false;
  tokenInput.value = '';
  tokenInput.disabled = false;
  tokenInput.focus();
}

function showEmailStep(email = currentEmail) {
  form.hidden = false;
  codeForm.hidden = true;
  tokenInput.value = '';
  tokenInput.disabled = false;
  if (email) form.elements.email.value = email;
  form.elements.email.focus();
}

function setSending(value, button, label) {
  sending = value;
  button.disabled = value;
  if (label) {
    const icon = button.querySelector('svg')?.outerHTML || '';
    button.innerHTML = icon ? `${icon}${label}` : label;
  }
}
