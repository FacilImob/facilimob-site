import { api } from './api.js';

export async function initLayout(active) {
  const userSlot = document.querySelector('[data-user]');
  const logoutButton = document.querySelector('[data-logout]');
  const menuButton = document.querySelector('[data-menu]');
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.querySelector('.sidebar-backdrop');

  document.querySelectorAll('.side-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.nav === active);
  });

  try {
    const { user } = await api('/api/auth/me');
    if (userSlot) userSlot.textContent = user.name;
    document.querySelectorAll('[data-admin-only]').forEach((element) => {
      element.hidden = user.role !== 'admin';
    });
  } catch {
    window.location.href = '/login.html';
  }

  logoutButton?.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  const toggleMenu = () => {
    sidebar?.classList.toggle('open');
    backdrop?.classList.toggle('open');
  };

  menuButton?.addEventListener('click', toggleMenu);
  backdrop?.addEventListener('click', toggleMenu);
}
