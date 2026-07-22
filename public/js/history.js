import { api, formatCpf, money, toast } from './api.js';
import { initLayout } from './layout.js';
import { exportJpeg, exportPdf, printTarget } from './export.js';
import { renderSummary } from './summary.js';

await initLayout('historico');

const status = document.querySelector('#status');
const tableBody = document.querySelector('#historyBody');
const search = document.querySelector('#search');
const drawer = document.querySelector('#drawer');
const drawerSummary = document.querySelector('#drawerSummary');
const clearHistoryButton = document.querySelector('[data-clear-history]');
const settings = await api('/api/config');
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
document.querySelector('[data-print]').addEventListener('click', () => {
  if (activeSimulation) printTarget(drawerSummary);
});
document.querySelector('[data-delete-active]').addEventListener('click', () => {
  if (activeSimulation) deleteSimulation(activeSimulation.id);
});
clearHistoryButton.addEventListener('click', clearHistory);

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
        <td>
          <button class="btn danger icon-btn" type="button" data-delete-simulation="${item.id}" aria-label="Excluir simulação" title="Excluir simulação">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </td>
      </tr>
    `)
    .join('');

  tableBody.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', () => openSimulation(row.dataset.id));
  });

  tableBody.querySelectorAll('[data-delete-simulation]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteSimulation(button.dataset.deleteSimulation);
    });
  });
}

async function openSimulation(id) {
  try {
    activeSimulation = await api(`/api/simulations/${id}`);
    renderSummary(drawerSummary, activeSimulation, { settings });
    drawer.classList.add('open');
  } catch (error) {
    toast(status, error.message, 'error');
  }
}

async function deleteSimulation(id) {
  if (!window.confirm('Excluir esta simulacao do historico?')) {
    return;
  }

  try {
    await api(`/api/simulations/${id}`, { method: 'DELETE' });
    if (activeSimulation?.id === id) {
      activeSimulation = null;
      drawer.classList.remove('open');
      drawerSummary.innerHTML = '';
    }
    await loadHistory();
    toast(status, 'Simulacao excluida.', 'success');
  } catch (error) {
    toast(status, error.message, 'error');
  }
}

async function clearHistory() {
  if (!window.confirm('Excluir todo o historico de simulacoes? Esta acao nao pode ser desfeita.')) {
    return;
  }

  try {
    await api('/api/simulations', { method: 'DELETE' });
    activeSimulation = null;
    drawer.classList.remove('open');
    drawerSummary.innerHTML = '';
    await loadHistory();
    toast(status, 'Historico limpo.', 'success');
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
