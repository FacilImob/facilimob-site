import { api, formatCpf, money, toast } from './api.js';
import { initLayout } from './layout.js';
import { exportJpeg, exportPdf, printTarget } from './export.js';
import { renderSummary } from './summary.js';

await initLayout('historico');

const status = document.querySelector('#status');
const tableBody = document.querySelector('#historyBody');
const drawer = document.querySelector('#drawer');
const drawerSummary = document.querySelector('#drawerSummary');
const historyPixModePanel = document.querySelector('#historyPixModePanel');
const historyPixModeInputs = document.querySelectorAll('[name="history_pix_option"]');
const shareModal = document.querySelector('#shareModal');
const shareLinkInput = document.querySelector('#shareLink');
const nativeShareButton = document.querySelector('[data-native-share]');
const settings = await api('/api/config');

const filters = {
  search: document.querySelector('#search'),
  dateFrom: document.querySelector('#dateFrom'),
  dateTo: document.querySelector('#dateTo'),
  option: document.querySelector('#optionFilter'),
  rentMin: document.querySelector('#rentMin'),
  rentMax: document.querySelector('#rentMax')
};

const bulkModal = document.querySelector('#bulkDeleteModal');
const bulkDeleteMessage = document.querySelector('#bulkDeleteMessage');

let activeSimulation = null;
let activeRenderedSimulation = null;
let activeHistoryOption = null;
let selectedIds = new Set();
let lastRows = [];

await loadHistory();

Object.values(filters).forEach((element) => {
  element.addEventListener('input', debounce(loadHistory, 250));
  element.addEventListener('change', loadHistory);
});

document.querySelector('[data-close-drawer]').addEventListener('click', closeDrawer);
document.querySelector('[data-select-all]').addEventListener('click', toggleSelectAll);
document.querySelector('[data-delete-selected]').addEventListener('click', openBulkDeleteModal);
document.querySelector('[data-confirm-bulk-delete]').addEventListener('click', deleteSelected);
document.querySelectorAll('[data-close-bulk-modal]').forEach((button) => {
  button.addEventListener('click', closeBulkDeleteModal);
});
document.querySelector('[data-clear-history]').addEventListener('click', clearHistory);
document.querySelector('[data-delete-active]').addEventListener('click', () => {
  if (activeSimulation) deleteSimulation(activeSimulation.id);
});
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
document.querySelector('[data-share-active]').addEventListener('click', shareActiveSimulation);
document.querySelector('[data-copy-share-link]').addEventListener('click', copyShareLink);
nativeShareButton.addEventListener('click', nativeShare);
document.querySelectorAll('[data-close-share-modal]').forEach((button) => {
  button.addEventListener('click', closeShareModal);
});
historyPixModeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    setHistoryOption(input.value);
  });
});

async function loadHistory() {
  const params = buildFilterParams();

  if (params.error) {
    toast(status, params.error, 'error');
    return;
  }

  const simulations = await api(`/api/simulations?${params.toString()}`);
  lastRows = simulations;
  selectedIds = new Set([...selectedIds].filter((id) => simulations.some((item) => item.id === id)));

  tableBody.innerHTML = simulations
    .map((item) => `
      <tr data-id="${item.id}">
        <td>
          <input type="checkbox" data-select-row="${item.id}" aria-label="Selecionar simulacao" ${selectedIds.has(item.id) ? 'checked' : ''}>
        </td>
        <td><strong>${escapeHtml(item.cliente_nome)}</strong><br><span class="muted">${formatCpf(item.cliente_cpf)}</span></td>
        <td>${new Date(item.criado_em).toLocaleString('pt-BR')}</td>
        <td>${item.opcao_escolhida === 'com_fci' ? 'Com FCI' : 'Sem FCI'}</td>
        <td>${money.format(item.valor_aluguel)}</td>
        <td>${money.format(item.total_primeiro_pagamento)}</td>
        <td>${escapeHtml(item.colaborador_nome || '')}</td>
        <td>
          <button class="btn danger icon-btn" type="button" data-delete-simulation="${item.id}" aria-label="Excluir simulacao" title="Excluir simulacao">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </td>
      </tr>
    `)
    .join('');

  tableBody.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.closest('button') || event.target.closest('input')) return;
      openSimulation(row.dataset.id);
    });
  });

  tableBody.querySelectorAll('[data-select-row]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        selectedIds.add(checkbox.dataset.selectRow);
      } else {
        selectedIds.delete(checkbox.dataset.selectRow);
      }
    });
  });

  tableBody.querySelectorAll('[data-delete-simulation]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteSimulation(button.dataset.deleteSimulation);
    });
  });
}

function buildFilterParams() {
  const dateFrom = filters.dateFrom.value;
  const dateTo = filters.dateTo.value;
  const rentMin = filters.rentMin.value;
  const rentMax = filters.rentMax.value;

  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { error: 'Data inicial nao pode ser maior que a data final.' };
  }

  if (rentMin && rentMax && Number(rentMin) > Number(rentMax)) {
    return { error: 'Aluguel minimo nao pode ser maior que o maximo.' };
  }

  const params = new URLSearchParams();
  if (filters.search.value.trim()) params.set('search', filters.search.value.trim());
  if (dateFrom) params.set('data_inicial', dateFrom);
  if (dateTo) params.set('data_final', dateTo);
  if (filters.option.value) params.set('opcao', filters.option.value);
  if (rentMin) params.set('valor_min', rentMin);
  if (rentMax) params.set('valor_max', rentMax);
  return params;
}

async function openSimulation(id) {
  try {
    activeSimulation = await api(`/api/simulations/${id}`);
    activeHistoryOption = activeSimulation.opcao_escolhida || 'com_fci';
    historyPixModePanel.hidden = false;
    updateHistoryOptionInputs();
    renderActiveSimulation(activeSimulation);
    drawer.classList.add('open');
  } catch (error) {
    toast(status, error.message, 'error');
  }
}

async function setHistoryOption(option) {
  if (!activeSimulation) return;
  activeHistoryOption = option;
  updateHistoryOptionInputs();
  await refreshHistoryPix();
}

async function refreshHistoryPix() {
  try {
    const preview = await api('/api/simulations/pix-preview', {
      method: 'POST',
      body: JSON.stringify(buildHistoryPixPayload(activeHistoryOption))
    });
    renderActiveSimulation({
      ...activeSimulation,
      ...preview,
      id: activeSimulation.id,
      criado_em: activeSimulation.criado_em,
      colaborador_nome: activeSimulation.colaborador_nome
    });
  } catch (error) {
    toast(status, error.message, 'error');
  }
}

function renderActiveSimulation(simulation) {
  activeRenderedSimulation = simulation;
  renderSummary(drawerSummary, simulation, {
    settings,
    activeOption: activeHistoryOption
  });
}

function updateHistoryOptionInputs() {
  historyPixModeInputs.forEach((input) => {
    input.checked = input.value === activeHistoryOption;
  });
}

function buildHistoryPixPayload(option) {
  return {
    cliente_nome: activeSimulation.cliente_nome,
    cliente_cpf: activeSimulation.cliente_cpf,
    cliente_telefone: activeSimulation.cliente_telefone,
    cliente_email: activeSimulation.cliente_email,
    valor_aluguel: activeSimulation.valor_aluguel,
    taxa_setup_aplicada: activeSimulation.taxa_setup_aplicada,
    opcao_escolhida: option
  };
}

async function shareActiveSimulation() {
  if (!activeSimulation) {
    toast(status, 'Abra uma simulacao antes de compartilhar.', 'error');
    return;
  }

  const params = new URLSearchParams({
    cliente_nome: activeRenderedSimulation?.cliente_nome || activeSimulation.cliente_nome,
    cliente_cpf: activeRenderedSimulation?.cliente_cpf || activeSimulation.cliente_cpf,
    cliente_telefone: activeRenderedSimulation?.cliente_telefone || activeSimulation.cliente_telefone,
    valor_aluguel: String(activeRenderedSimulation?.valor_aluguel || activeSimulation.valor_aluguel),
    taxa_setup_aplicada: String(activeRenderedSimulation?.taxa_setup_aplicada || activeSimulation.taxa_setup_aplicada),
    taxa_com_fci: String(settings.taxa_com_fci),
    taxa_sem_fci: String(settings.taxa_sem_fci),
    opcao_escolhida: activeHistoryOption || activeSimulation.opcao_escolhida || 'com_fci',
    colaborador_nome: activeSimulation.colaborador_nome || ''
  });

  try {
    const result = await api('/api/share', {
      method: 'POST',
      body: JSON.stringify({ encoded: params.toString() })
    });
    openShareModal(result.url);
    toast(status, 'Link de compartilhamento gerado.', 'success');
  } catch (error) {
    toast(status, error.message, 'error');
  }
}

function toggleSelectAll() {
  const visibleIds = lastRows.map((item) => item.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  if (allSelected) {
    visibleIds.forEach((id) => selectedIds.delete(id));
  } else {
    visibleIds.forEach((id) => selectedIds.add(id));
  }

  tableBody.querySelectorAll('[data-select-row]').forEach((checkbox) => {
    checkbox.checked = selectedIds.has(checkbox.dataset.selectRow);
  });
}

function openBulkDeleteModal() {
  if (!selectedIds.size) {
    toast(status, 'Selecione ao menos uma simulacao.', 'error');
    return;
  }

  bulkDeleteMessage.textContent = `Voce esta prestes a excluir ${selectedIds.size} registro(s) do historico. Esta acao nao pode ser desfeita.`;
  bulkModal.classList.add('open');
  bulkModal.setAttribute('aria-hidden', 'false');
}

function closeBulkDeleteModal() {
  bulkModal.classList.remove('open');
  bulkModal.setAttribute('aria-hidden', 'true');
}

async function deleteSelected() {
  const ids = [...selectedIds];

  try {
    await api('/api/simulations/bulk', {
      method: 'DELETE',
      body: JSON.stringify({ ids })
    });
    selectedIds.clear();
    closeBulkDeleteModal();
    activeSimulation = null;
    activeRenderedSimulation = null;
    activeHistoryOption = null;
    closeDrawer();
    await loadHistory();
    toast(status, 'Registros selecionados excluidos.', 'success');
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
    selectedIds.delete(id);
    if (activeSimulation?.id === id) {
      activeSimulation = null;
      activeRenderedSimulation = null;
      activeHistoryOption = null;
      closeDrawer();
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
    selectedIds.clear();
    activeSimulation = null;
    activeRenderedSimulation = null;
    activeHistoryOption = null;
    closeDrawer();
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

function closeDrawer() {
  drawer.classList.remove('open');
  historyPixModePanel.hidden = true;
  drawerSummary.innerHTML = '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return map[char];
  });
}

function openShareModal(url) {
  shareLinkInput.value = url;
  nativeShareButton.hidden = !navigator.share;
  shareModal.classList.add('open');
  shareModal.setAttribute('aria-hidden', 'false');
  shareLinkInput.focus();
  shareLinkInput.select();
}

function closeShareModal() {
  shareModal.classList.remove('open');
  shareModal.setAttribute('aria-hidden', 'true');
}

async function copyShareLink() {
  if (!shareLinkInput.value) return;
  await navigator.clipboard.writeText(shareLinkInput.value);
  toast(status, 'Link copiado.', 'success');
}

async function nativeShare() {
  if (!shareLinkInput.value || !navigator.share) return;

  try {
    await navigator.share({
      title: 'Simulacao Facil Imob',
      text: 'Confira sua simulacao de garantia de aluguel.',
      url: shareLinkInput.value
    });
  } catch (error) {
    if (error.name !== 'AbortError') {
      toast(status, 'Nao foi possivel abrir o compartilhamento.', 'error');
    }
  }
}
