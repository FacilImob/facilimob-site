import { api, toast } from './api.js';

const form = document.querySelector('#loginForm');
const codeForm = document.querySelector('#codeForm');
const status = document.querySelector('#status');
const tokenInput = codeForm.elements.token;
let currentEmail = '';

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = form.elements.email.value.trim().toLowerCase();

  try {
    await requestCode(email);
    showCodeStep(email);
    toast(status, 'Codigo enviado para o e-mail informado.', 'success');
  } catch (error) {
    toast(status, error.message, 'error');
  }
});

codeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const token = tokenInput.value.replace(/\D/g, '');

  try {
    await api('/api/auth/verify-code', {
      method: 'POST',
      body: JSON.stringify({ email: currentEmail, token })
    });
    window.location.href = '/index.html';
  } catch (error) {
    toast(status, error.message, 'error');
  }
});

tokenInput.addEventListener('input', () => {
  tokenInput.value = tokenInput.value.replace(/\D/g, '').slice(0, 6);
});

document.querySelector('[data-resend]').addEventListener('click', async () => {
  try {
    await requestCode(currentEmail);
    toast(status, 'Novo codigo enviado.', 'success');
  } catch (error) {
    toast(status, error.message, 'error');
  }
});

document.querySelector('[data-change-email]').addEventListener('click', () => {
  currentEmail = '';
  codeForm.hidden = true;
  form.hidden = false;
  form.elements.email.focus();
});

async function requestCode(email) {
  await api('/api/auth/request-code', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

function showCodeStep(email) {
  currentEmail = email;
  codeForm.elements.email.value = email;
  form.hidden = true;
  codeForm.hidden = false;
  tokenInput.value = '';
  tokenInput.focus();
}
