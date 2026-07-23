import { api, toast } from './api.js';
import { renderSummary } from './summary.js';

const status = document.querySelector('#shareStatus');
const summary = document.querySelector('#shareSummary');
const controls = document.querySelector('#shareControls');
const pixRoot = document.querySelector('#sharePix');
const hash = new URLSearchParams(window.location.search).get('s');

let sharedSimulation = null;
let settings = null;
let selectedOption = 'com_fci';

if (!hash) {
  showError('Link de compartilhamento invalido.');
} else {
  await loadSharedSimulation();
}

document.querySelectorAll('[name="share_pix_option"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    selectedOption = input.value;
    renderSharedSummary();
    generatePix();
  });
});

async function loadSharedSimulation() {
  try {
    const data = await api(`/api/share/${encodeURIComponent(hash)}`);
    sharedSimulation = {
      ...data.simulation,
      opcao_escolhida: selectedOption,
      taxa_aplicada: data.settings.taxa_com_fci
    };
    settings = data.settings;
    controls.hidden = false;
    setSelectedOption(selectedOption);
    renderSharedSummary();
    await generatePix();
  } catch (error) {
    showError(error.message);
  }
}

async function generatePix() {
  try {
    const pix = await api(`/api/share/${encodeURIComponent(hash)}/pix`, {
      method: 'POST',
      body: JSON.stringify({ opcao_escolhida: selectedOption })
    });
    renderPix(pix);
  } catch (error) {
    toast(status, error.message, 'error');
  }
}

function renderSharedSummary() {
  const taxa = selectedOption === 'com_fci' ? settings.taxa_com_fci : settings.taxa_sem_fci;
  renderSummary(
    summary,
    {
      ...sharedSimulation,
      opcao_escolhida: selectedOption,
      taxa_aplicada: taxa
    },
    { showPix: false, settings, activeOption: selectedOption }
  );
}

function setSelectedOption(option) {
  document.querySelectorAll('[name="share_pix_option"]').forEach((input) => {
    input.checked = input.value === option;
  });
}

function renderPix(pix) {
  const optionLabel = selectedOption === 'com_fci' ? 'Com FCI' : 'Sem FCI';
  pixRoot.innerHTML = `
    <div class="summary-box export-pix-box">
      <h2 class="section-title">Pix para ${optionLabel}</h2>
      <div class="pix-area">
        <div class="qr-box">${pix.qr_code ? `<img alt="QR Code Pix" src="${pix.qr_code}">` : ''}</div>
        <div class="field">
          <label class="label" for="sharePixPayload">Pix Copia e Cola</label>
          <textarea id="sharePixPayload" class="textarea" readonly>${escapeHtml(pix.pix_payload || '')}</textarea>
          <button class="btn primary" type="button" id="copySharePix">Copiar Pix</button>
        </div>
      </div>
    </div>
  `;

  document.querySelector('#copySharePix')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(pix.pix_payload || '');
    toast(status, 'Pix copiado.', 'success');
  });
}

function showError(message) {
  summary.innerHTML = '';
  pixRoot.innerHTML = '';
  controls.hidden = true;
  toast(status, message, 'error');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return map[char];
  });
}
