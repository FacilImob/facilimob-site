import { api, toast } from './api.js';

const form = document.querySelector('#loginForm');
const status = document.querySelector('#status');

completeMagicLink();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = form.elements.email.value.trim().toLowerCase();
  const button = form.querySelector('button[type="submit"]');
  const originalText = button.innerHTML;

  try {
    button.disabled = true;
    button.innerHTML = 'Enviando link...';
    toast(status, 'Enviando link de acesso...', 'success');
    await requestCode(email);
    toast(status, `Enviamos um link de acesso para ${email}. Abra o e-mail e clique no link para entrar.`, 'success');
  } catch (error) {
    toast(status, error.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = originalText;
  }
});

async function requestCode(email) {
  await api('/api/auth/request-code', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
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
