import { api, money, parseCurrency, toast } from './api.js';
import { initLayout } from './layout.js';

await initLayout('settings');

const form = document.querySelector('#settingsForm');
const status = document.querySelector('#status');
const settings = await api('/api/config');

for (const [key, value] of Object.entries(settings)) {
  const input = form.elements[key];
  if (!input) continue;
  input.value = value ?? '';
  if (input.dataset.money === 'true') {
    input.dataset.value = Number(value || 0);
    input.value = money.format(value || 0);
  }
}

form.querySelectorAll('[data-money="true"]').forEach((input) => {
  input.addEventListener('input', () => {
    input.dataset.value = parseCurrency(input.value);
    input.value = money.format(input.dataset.value);
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(form));
  payload.taxa_com_fci = Number(payload.taxa_com_fci);
  payload.taxa_sem_fci = Number(payload.taxa_sem_fci);
  payload.taxa_setup_padrao = Number(form.elements.taxa_setup_padrao.dataset.value || 0);

  try {
    await api('/api/config', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    toast(status, 'Configuracoes salvas.', 'success');
  } catch (error) {
    toast(status, error.message, 'error');
  }
});
