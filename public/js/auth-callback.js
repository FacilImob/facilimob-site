import { api, toast } from './api.js';

const status = document.querySelector('#status');
const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const accessToken = params.get('access_token');
const refreshToken = params.get('refresh_token');

if (!accessToken || !refreshToken) {
  toast(status, 'Link de acesso incompleto ou expirado. Solicite um novo link.', 'error');
} else {
  try {
    await api('/api/auth/session-from-link', {
      method: 'POST',
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken
      })
    });

    window.history.replaceState({}, document.title, '/auth-callback.html');
    window.location.href = '/site-admin.html';
  } catch (error) {
    toast(status, error.message, 'error');
  }
}
