import { money, formatCpf, formatPhone } from './api.js';

export function renderSummary(target, simulation, options = {}) {
  const showPix = options.showPix !== false;
  const optionLabel = simulation.opcao_escolhida === 'com_fci' ? 'Com FCI' : 'Sem FCI';
  target.innerHTML = `
    <div class="summary-box">
      <h2 class="section-title">Resumo da simulacao</h2>
      <div class="summary-grid">
        <div class="summary-item"><span>Cliente</span><strong>${escapeHtml(simulation.cliente_nome)}</strong></div>
        <div class="summary-item"><span>CPF</span><strong>${formatCpf(simulation.cliente_cpf)}</strong></div>
        <div class="summary-item"><span>Telefone</span><strong>${formatPhone(simulation.cliente_telefone)}</strong></div>
        <div class="summary-item"><span>E-mail</span><strong>${escapeHtml(simulation.cliente_email)}</strong></div>
        <div class="summary-item"><span>Opcao</span><strong>${optionLabel}</strong></div>
        <div class="summary-item"><span>Responsavel</span><strong>${escapeHtml(simulation.colaborador_nome || '')}</strong></div>
      </div>
    </div>
    <div class="summary-box">
      <div class="summary-grid">
        <div class="summary-item"><span>Parcela mensal</span><strong>${money.format(simulation.parcela_mensal)}</strong></div>
        <div class="summary-item"><span>Taxa de setup</span><strong>${money.format(simulation.taxa_setup_aplicada)}</strong></div>
        <div class="summary-item"><span>Total do Pix</span><strong>${money.format(simulation.total_primeiro_pagamento)}</strong></div>
      </div>
    </div>
    ${
      showPix
        ? `<div class="summary-box">
            <div class="pix-area">
              <div class="qr-box">${simulation.qr_code ? `<img alt="QR Code Pix" src="${simulation.qr_code}">` : ''}</div>
              <div class="field">
                <label class="label" for="pixPayload">Pix Copia e Cola</label>
                <textarea id="pixPayload" class="textarea" readonly>${escapeHtml(simulation.pix_payload || '')}</textarea>
              </div>
            </div>
          </div>`
        : ''
    }
  `;
}

export function bindSummaryActions(root, statusElement) {
  root.querySelector('[data-copy-pix]')?.addEventListener('click', async () => {
    const value = root.querySelector('#pixPayload')?.value;
    if (value) {
      await navigator.clipboard.writeText(value);
      statusElement.textContent = 'Pix copiado.';
      statusElement.className = 'status success show';
      setTimeout(() => statusElement.classList.remove('show'), 2500);
    }
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return map[char];
  });
}
