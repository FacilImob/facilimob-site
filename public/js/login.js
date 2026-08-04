import { api, toast } from './api.js';

const form = document.querySelector('#loginForm');
const codeForm = document.querySelector('#codeForm');
const status = document.querySelector('#status');
const sentTo = document.querySelector('[data-sent-to]');
const tokenInput = codeForm.querySelector('[name="token"]');
const submitButton = form.querySelector('button[type="submit"]');
const resendButton = document.querySelector('[data-resend]');
let currentEmail = '';
let sending = false;
let verifying = false;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (sending) return;

  const email = form.elements.email.value.trim().toLowerCase();

  try {
    setSending(true, submitButton, 'Enviando...');
    await requestCode(email);
    showCodeStep(email);
  } catch (error) {
    showEmailStep();
    toast(status, error.message, 'error');
  } finally {
    setSending(false, submitButton, 'Enviar link');
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
    window.location.href = '/simulador.html';
  } catch (error) {
    toast(status, error.message, 'error');
    tokenInput.value = '';
    tokenInput.disabled = false;
    tokenInput.focus();
    verifying = false;
  }
}

resendButton.addEventListener('click', async () => {
  if (sending) return;

  try {
    setSending(true, resendButton, 'Reenviando...');
    await requestCode(currentEmail);
    toast(status, 'Novo link enviado.', 'success');
  } catch (error) {
    showEmailStep(currentEmail);
    toast(status, error.message, 'error');
  } finally {
    setSending(false, resendButton, 'Reenviar link');
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
  sentTo.textContent = `Link de acesso enviado para ${email}. Abra o e-mail e clique no link.`;
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
}

function setSending(value, button, label) {
  sending = value;
  button.disabled = value;
  if (label) {
    const icon = button.querySelector('svg')?.outerHTML || '';
    button.innerHTML = icon ? `${icon}${label}` : label;
  }
}
