import { api, toast } from './api.js';

const form = document.querySelector('#resetPasswordForm');
const status = document.querySelector('#status');
const submitButton = form.querySelector('button[type="submit"]');
const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const accessToken = params.get('access_token');
const refreshToken = params.get('refresh_token');
let ready = false;

if (!accessToken || !refreshToken) {
  toast(status, 'Link de recuperação incompleto ou expirado. Solicite um novo link.', 'error');
} else {
  try {
    await api('/api/auth/session-from-link', {
      method: 'POST',
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken
      })
    });

    window.history.replaceState({}, document.title, '/reset-password.html');
    form.hidden = false;
    ready = true;
  } catch (error) {
    toast(status, error.message, 'error');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!ready) return;

  const password = form.elements.password.value;
  const confirmPassword = form.elements.confirmPassword.value;

  if (password !== confirmPassword) {
    toast(status, 'As senhas informadas não são iguais.', 'error');
    return;
  }

  try {
    submitButton.disabled = true;
    submitButton.textContent = 'Salvando...';
    await api('/api/auth/update-password', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    window.location.href = '/site-admin.html';
  } catch (error) {
    toast(status, error.message, 'error');
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Salvar senha e entrar';
  }
});
