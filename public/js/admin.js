import { api, toast } from './api.js';
import { initLayout } from './layout.js';

await initLayout('admin');

const status = document.querySelector('#status');
const form = document.querySelector('#inviteForm');
const usersBody = document.querySelector('#usersBody');

await loadUsers();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form));

  try {
    await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    form.reset();
    await loadUsers();
    toast(status, 'Colaborador criado. Um codigo de acesso foi enviado para o e-mail informado.', 'success');
  } catch (error) {
    toast(status, error.message, 'error');
  }
});

async function loadUsers() {
  const users = await api('/api/admin/users');

  usersBody.innerHTML = users
    .map((user) => `
      <tr>
        <td><strong>${escapeHtml(user.nome || 'Sem nome')}</strong></td>
        <td>${escapeHtml(user.email)}</td>
        <td><span class="role-pill ${user.role === 'admin' ? 'admin' : ''}">${user.role === 'admin' ? 'Admin' : 'Colaborador'}</span></td>
        <td>${new Date(user.created_at).toLocaleString('pt-BR')}</td>
        <td><button class="btn" type="button" data-delete-user="${user.id}">Remover</button></td>
      </tr>
    `)
    .join('');

  usersBody.querySelectorAll('[data-delete-user]').forEach((button) => {
    button.addEventListener('click', () => removeUser(button.dataset.deleteUser));
  });
}

async function removeUser(id) {
  if (!window.confirm('Remover este colaborador?')) {
    return;
  }

  try {
    await api(`/api/admin/users/${id}`, { method: 'DELETE' });
    await loadUsers();
    toast(status, 'Colaborador removido.', 'success');
  } catch (error) {
    toast(status, error.message, 'error');
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return map[char];
  });
}
