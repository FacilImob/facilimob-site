import { api, formatCpf, money, toast } from './api.js';
import { initLayout } from './layout.js';
import { exportJpeg, exportPdf } from './export.js';
import { renderSummary } from './summary.js';

await initLayout('historico');

const status = document.querySelector('#status');
const tableBody = document.querySelector('#historyBody');
const search = document.querySelector('#search');
const drawer = document.querySelector('#drawer');
const drawerSummary = document.querySelector('#drawerSummary');
let activeSimulation = null;

await loadHistory();

search.addEventListener('input', debounce(loadHistory, 250));

document.querySelector('[data-close-drawer]').addEventListener('click', () => drawer.classList.remove('open'));
document.querySelector('[data-copy-pix]').addEventListener('click', async () => {
  const value = drawer.querySelector('#pixPayload')?.value;
  if (value) {
    await navigator.clipboard.writeText(value);
    toast(status, 'Pix copiado.', 'success');
  }
});
document.querySelector('[data-export-pdf]').addEventListener('click', () => {
  if (activeSimulation) exportPdf(drawerSummary, `simulacao-${activeSimulation.id}`);
});
document.querySelector('[data-export-jpeg]').addEventListener('click', () => {
  if (activeSimulation) exportJpeg(drawerSummary, `simulacao-${activeSimulation.id}`);
});
document.querySelector('[data-print]').addEventListener('click', () => window.print());

async function loadHistory() {
  const simulations = await api(`/api/simulations?search=${encodeURIComponent(search.value || '')}`);
  tableBody.innerHTML = simulations
    .map((item) => `
      <tr data-id="${item.id}">
        <td><strong>${item.cliente_nome}</strong><br><span class="muted">${formatCpf(item.cliente_cpf)}</span></td>
        <td>${new Date(item.criado_em).toLocaleString('pt-BR')}</td>
        <td>${item.opcao_escolhida === 'com_fci' ? 'Com FCI' : 'Sem FCI'}</td>
        <td>${money.format(item.total_primeiro_pagamento)}</td>
        <td>${item.colaborador_nome || ''}</td>
      </tr>
    `)
    .join('');

  tableBody.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => openSimulation(row.dataset.id));
  });
}

async function openSimulation(id) {
  try {
    activeSimulation = await api(`/api/simulations/${id}`);
    renderSummary(drawerSummary, activeSimulation);
    drawer.classList.add('open');
  } catch (error) {
    toast(status, error.message, 'error');
  }
}

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
