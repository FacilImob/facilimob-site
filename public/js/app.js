import { api, formatCpf, formatPhone, isValidCpf, money, parseCurrency, toast } from './api.js';
import { initLayout } from './layout.js';
import { exportJpeg, exportPdf, printTarget } from './export.js';
import { renderSummary } from './summary.js';

await initLayout('simulacao');

const form = document.querySelector('#simulationForm');
const status = document.querySelector('#status');
const summary = document.querySelector('#summary');
const emptySummary = document.querySelector('#emptySummary');
const optionButtons = document.querySelectorAll('[data-option]');
const resultActions = document.querySelector('#resultActions');
const pixModal = document.querySelector('#pixModal');
const pixModalSummary = document.querySelector('#pixModalSummary');

let settings = await api('/api/config');
let selectedOption = null;
let simulatedData = null;
let latestSimulation = null;

const fields = {
  cpf: document.querySelector('[name="cliente_cpf"]'),
  telefone: document.querySelector('[name="cliente_telefone"]'),
  valorAluguel: document.querySelector('[name="valor_aluguel"]')
};

fields.cpf.addEventListener('input', () => {
  fields.cpf.value = formatCpf(fields.cpf.value);
});

fields.telefone.addEventListener('input', () => {
  fields.telefone.value = formatPhone(fields.telefone.value);
});

fields.valorAluguel.addEventListener('input', () => {
  fields.valorAluguel.dataset.value = parseCurrency(fields.valorAluguel.value);
  fields.valorAluguel.value = money.format(fields.valorAluguel.dataset.value);
  updateOptions();
});

updateOptions();

optionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    selectOption(button.dataset.option);
    if (simulatedData) {
      refreshSimulationState();
    }
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = validateForm();
  if (error) {
    toast(status, error, 'error');
    return;
  }

  if (!selectedOption) {
    selectOption('com_fci');
  }

  refreshSimulationState();
  toast(status, 'Simulacao calculada.', 'success');
});

document.querySelector('[data-copy-pix]').addEventListener('click', async () => {
  const value = pixModal.querySelector('#pixPayload')?.value;
  if (value) {
    await navigator.clipboard.writeText(value);
    toast(status, 'Pix copiado.', 'success');
  }
});

document.querySelector('[data-generate-pix]').addEventListener('click', async () => {
  if (!simulatedData) {
    toast(status, 'Simule antes de gerar o Pix.', 'error');
    return;
  }

  if (latestSimulation) {
    openPixModal();
    return;
  }

  try {
    latestSimulation = await api('/api/simulations', {
      method: 'POST',
      body: JSON.stringify({
        cliente_nome: simulatedData.cliente_nome,
        cliente_cpf: simulatedData.cliente_cpf,
        cliente_telefone: simulatedData.cliente_telefone,
        cliente_email: simulatedData.cliente_email,
        valor_aluguel: simulatedData.valor_aluguel,
        opcao_escolhida: simulatedData.opcao_escolhida
      })
    });
    openPixModal();
    toast(status, 'Pix gerado e simulacao salva.', 'success');
  } catch (error) {
    toast(status, error.message, 'error');
  }
});

document.querySelector('[data-export-pdf]').addEventListener('click', () => {
  if (simulatedData) exportPdf(summary, fileName());
});

document.querySelector('[data-export-jpeg]').addEventListener('click', () => {
  if (simulatedData) exportJpeg(summary, fileName());
});

document.querySelector('[data-print]').addEventListener('click', () => {
  if (simulatedData) printTarget(summary);
});
document.querySelectorAll('[data-close-pix-modal]').forEach((button) => {
  button.addEventListener('click', closePixModal);
});

document.querySelector('[data-new]').addEventListener('click', () => {
  form.reset();
  fields.valorAluguel.dataset.value = 0;
  selectedOption = null;
  simulatedData = null;
  latestSimulation = null;
  optionButtons.forEach((item) => item.classList.remove('selected'));
  summary.hidden = true;
  resultActions.hidden = true;
  emptySummary.hidden = false;
  closePixModal();
  updateOptions();
});

function updateOptions() {
  const rent = Number(fields.valorAluguel.dataset.value || 0);
  const comFci = rent * (Number(settings.taxa_com_fci) / 100);
  const semFci = rent * (Number(settings.taxa_sem_fci) / 100);
  document.querySelector('[data-value="com_fci"]').textContent = money.format(comFci);
  document.querySelector('[data-value="sem_fci"]').textContent = money.format(semFci);
  document.querySelector('#selectedTotal').textContent = selectedOption ? money.format(getSelectedTotal()) : money.format(0);
}

function selectOption(option) {
  selectedOption = option;
  optionButtons.forEach((button) => {
    button.classList.toggle('selected', button.dataset.option === selectedOption);
  });
  updateOptions();
}

function refreshSimulationState() {
  const payload = Object.fromEntries(new FormData(form));
  payload.valor_aluguel = Number(fields.valorAluguel.dataset.value || 0);
  payload.taxa_setup_aplicada = getSetupFee();
  payload.opcao_escolhida = selectedOption;

  simulatedData = buildSimulationPreview(payload);
  latestSimulation = null;
  emptySummary.hidden = true;
  summary.hidden = false;
  resultActions.hidden = false;
  renderSummary(summary, simulatedData, { showPix: false, settings });
  updateOptions();
}

function getSelectedTotal() {
  const rent = Number(fields.valorAluguel.dataset.value || 0);
  const setup = getSetupFee();
  const rate = selectedOption === 'com_fci' ? Number(settings.taxa_com_fci) : Number(settings.taxa_sem_fci);
  return roundCurrency(rent * (rate / 100) + setup);
}

function validateForm() {
  const data = Object.fromEntries(new FormData(form));
  if (!data.cliente_nome || data.cliente_nome.trim().split(/\s+/).length < 2) return 'Informe o nome completo.';
  if (!isValidCpf(data.cliente_cpf)) return 'CPF invalido.';
  if (String(data.cliente_telefone || '').replace(/\D/g, '').length < 10) return 'Telefone invalido.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.cliente_email)) return 'E-mail invalido.';
  if (Number(fields.valorAluguel.dataset.value || 0) <= 0) return 'Informe o valor do aluguel.';
  return null;
}

function fileName() {
  const source = latestSimulation || simulatedData;
  return `simulacao-${source.cliente_nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function getSetupFee() {
  return Number(settings.taxa_setup_padrao || 0);
}

function buildSimulationPreview(payload) {
  const rate = payload.opcao_escolhida === 'com_fci' ? Number(settings.taxa_com_fci) : Number(settings.taxa_sem_fci);
  const parcela = roundCurrency(payload.valor_aluguel * (rate / 100));

  return {
    ...payload,
    colaborador_nome: document.querySelector('[data-user]')?.textContent || '',
    taxa_aplicada: rate,
    parcela_mensal: parcela,
    total_primeiro_pagamento: roundCurrency(parcela + getSetupFee())
  };
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function openPixModal() {
  renderSummary(pixModalSummary, latestSimulation, { showPix: true, settings });
  pixModal.classList.add('open');
  pixModal.setAttribute('aria-hidden', 'false');
}

function closePixModal() {
  pixModal.classList.remove('open');
  pixModal.setAttribute('aria-hidden', 'true');
}
