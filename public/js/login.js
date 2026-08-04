import { api, toast } from './api.js';

const form = document.querySelector('#loginForm');
const codeForm = document.querySelector('#codeForm');
const status = document.querySelector('#status');
const sentTo = document.querySelector('[data-sent-to]');
const submitButton = form.querySelector('button[type="submit"]');
const resendButton = document.querySelector('[data-resend]');
const changeEmailButton = document.querySelector('[data-change-email]');
const resendDefaultLabel = 'Reenviar link';
const RESEND_COOLDOWN_SECONDS = 90;
const RESEND_KEY_PREFIX = 'facilimob-login-link-sent-at:';
let currentEmail = '';
let sending = false;
let cooldownTimer = null;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (sending) return;

  const email = form.elements.email.value.trim().toLowerCase();

  try {
    setSending(true, submitButton, 'Enviando...');
    await requestCode(email);
    showCodeStep(email);
    toast(status, 'Link de acesso enviado. Abra o e-mail e clique no botão para entrar.', 'success');
  } catch (error) {
    showEmailStep(email);
    toast(status, error.message, 'error');
  } finally {
    setSending(false, submitButton, 'Enviar link');
  }
});

resendButton.addEventListener('click', async () => {
  if (sending) return;
  const remaining = getCooldownRemaining(currentEmail);

  if (remaining > 0) {
    toast(status, `O link ja foi enviado. Aguarde ${remaining}s para solicitar outro.`, 'success');
    return;
  }

  try {
    setSending(true, resendButton, 'Reenviando...');
    await requestCode(currentEmail);
    showCodeStep(currentEmail);
    toast(status, 'Novo link enviado. Use o e-mail mais recente para entrar.', 'success');
  } catch (error) {
    toast(status, error.message, 'error');
  } finally {
    setSending(false, resendButton, resendDefaultLabel);
    updateResendState();
  }
});

changeEmailButton.addEventListener('click', () => {
  showEmailStep(currentEmail);
  status.classList.remove('show', 'error', 'success');
  status.textContent = '';
});

async function requestCode(email) {
  const response = await api('/api/auth/request-code', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
  rememberSentAt(email);
  return response;
}

function showCodeStep(email) {
  currentEmail = email;
  status.classList.remove('show', 'error', 'success');
  status.textContent = '';
  sentTo.textContent = `Enviamos o link de acesso para ${email}.`;
  form.hidden = true;
  codeForm.hidden = false;
  updateResendState();
}

function showEmailStep(email = currentEmail) {
  window.clearInterval(cooldownTimer);
  form.hidden = false;
  codeForm.hidden = true;
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

function rememberSentAt(email) {
  window.localStorage.setItem(`${RESEND_KEY_PREFIX}${email}`, String(Date.now()));
}

function getCooldownRemaining(email) {
  const sentAt = Number(window.localStorage.getItem(`${RESEND_KEY_PREFIX}${email}`) || 0);
  const elapsed = Math.floor((Date.now() - sentAt) / 1000);
  return Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed);
}

function updateResendState() {
  window.clearInterval(cooldownTimer);

  const render = () => {
    const remaining = getCooldownRemaining(currentEmail);
    resendButton.disabled = sending || remaining > 0;
    resendButton.textContent = remaining > 0 ? `Reenviar em ${remaining}s` : resendDefaultLabel;

    if (remaining <= 0) {
      window.clearInterval(cooldownTimer);
    }
  };

  render();
  cooldownTimer = window.setInterval(render, 1000);
}
