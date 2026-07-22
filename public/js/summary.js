import { money, formatCpf, formatPhone } from './api.js';

export function renderSummary(target, simulation, options = {}) {
  const showPix = options.showPix !== false;
  const comparison = buildComparison(simulation, options.settings || {});
  const generatedAt = simulation.criado_em ? new Date(simulation.criado_em) : new Date();
  const difference = comparison.comFci.parcela_mensal - comparison.semFci.parcela_mensal;
  const differenceBlock =
    Math.abs(difference) < 0.01
      ? ''
      : `<div class="export-highlight">
          <span>${difference < 0 ? 'Economia mensal com FCI' : 'Sem FCI é mais barato neste caso'}</span>
          <strong>${difference < 0 ? money.format(Math.abs(difference)) : money.format(Math.abs(difference))}</strong>
        </div>`;

  target.innerHTML = `
    <article class="export-sheet">
      <header class="export-header">
        <img class="export-logo" src="/assets/logo-facilimob.png" alt="Facil Imob">
        <div class="export-meta">
          <span>Simulação de garantia</span>
          <h2>${escapeHtml(simulation.cliente_nome)}</h2>
          <p>${generatedAt.toLocaleDateString('pt-BR')} - Responsável: ${escapeHtml(simulation.colaborador_nome || '')}</p>
        </div>
      </header>

      <section class="export-client-grid" aria-label="Dados do cliente">
        <div><span>CPF</span><strong>${formatCpf(simulation.cliente_cpf)}</strong></div>
        <div><span>Telefone</span><strong>${formatPhone(simulation.cliente_telefone)}</strong></div>
        <div><span>Aluguel mensal</span><strong>${money.format(simulation.valor_aluguel)}</strong></div>
      </section>

      <section class="export-option-grid" aria-label="Opcoes simuladas">
        ${renderOptionCard('Com FCI', comparison.comFci)}
        ${renderOptionCard('Sem FCI', comparison.semFci)}
      </section>

      <section class="export-table-wrap" aria-label="Tabela comparativa">
        <table class="export-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Com FCI</th>
              <th>Sem FCI</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Taxa aplicada</td>
              <td>${formatRate(comparison.comFci.taxa_aplicada)}</td>
              <td>${formatRate(comparison.semFci.taxa_aplicada)}</td>
            </tr>
            <tr>
              <td>Parcela mensal</td>
              <td>${money.format(comparison.comFci.parcela_mensal)}</td>
              <td>${money.format(comparison.semFci.parcela_mensal)}</td>
            </tr>
            <tr>
              <td>Taxa de setup</td>
              <td>${money.format(comparison.comFci.taxa_setup_aplicada)}</td>
              <td>${money.format(comparison.semFci.taxa_setup_aplicada)}</td>
            </tr>
            <tr>
              <td>Total do 1º pagamento</td>
              <td>${money.format(comparison.comFci.total_primeiro_pagamento)}</td>
              <td>${money.format(comparison.semFci.total_primeiro_pagamento)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      ${differenceBlock}
    </article>

    ${
      showPix
        ? `<div class="summary-box export-pix-box">
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

function renderOptionCard(title, option) {
  return `
    <div class="export-option-card">
      <span>${title}</span>
      <h3>${formatRate(option.taxa_aplicada)}</h3>
      <p>Parcela mensal</p>
      <strong>${money.format(option.parcela_mensal)}</strong>
    </div>
  `;
}

function buildComparison(simulation, settings) {
  const valorAluguel = Number(simulation.valor_aluguel || 0);
  const taxaSetup = Number(simulation.taxa_setup_aplicada || settings.taxa_setup_padrao || 0);
  const comFciRate = getRate('com_fci', simulation, settings);
  const semFciRate = getRate('sem_fci', simulation, settings);

  return {
    comFci: buildOption(valorAluguel, taxaSetup, comFciRate),
    semFci: buildOption(valorAluguel, taxaSetup, semFciRate)
  };
}

function buildOption(valorAluguel, taxaSetup, taxaAplicada) {
  const parcela = roundCurrency(valorAluguel * (taxaAplicada / 100));
  return {
    taxa_aplicada: taxaAplicada,
    parcela_mensal: parcela,
    taxa_setup_aplicada: taxaSetup,
    total_primeiro_pagamento: roundCurrency(parcela + taxaSetup)
  };
}

function getRate(option, simulation, settings) {
  if (simulation.opcao_escolhida === option && simulation.taxa_aplicada !== undefined) {
    return Number(simulation.taxa_aplicada || 0);
  }

  if (option === 'com_fci' && settings.taxa_com_fci !== undefined) {
    return Number(settings.taxa_com_fci || 0);
  }

  if (option === 'sem_fci' && settings.taxa_sem_fci !== undefined) {
    return Number(settings.taxa_sem_fci || 0);
  }

  return 0;
}

function formatRate(value) {
  return `${Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}%`;
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function createPrintableSummary(simulation, options = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'summary';
  renderSummary(wrapper, simulation, options);
  return wrapper;
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
