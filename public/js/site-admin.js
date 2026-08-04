import { api, toast } from './api.js';
import { initLayout } from './layout.js';

await initLayout('site-admin');

const status = document.querySelector('#status');
const state = {
  pages: [],
  posts: [],
  testimonials: [],
  partners: [],
  leads: [],
  logs: [],
  settings: {}
};

const resources = {
  pages: {
    form: document.querySelector('#pageForm'),
    list: document.querySelector('#pagesList'),
    endpoint: '/api/site-admin/pages',
    title: 'titulo',
    subtitle: 'slug'
  },
  posts: {
    form: document.querySelector('#postForm'),
    list: document.querySelector('#postsList'),
    endpoint: '/api/site-admin/posts',
    title: 'titulo',
    subtitle: 'categoria'
  },
  testimonials: {
    form: document.querySelector('#testimonialForm'),
    list: document.querySelector('#testimonialsList'),
    endpoint: '/api/site-admin/testimonials',
    title: 'nome',
    subtitle: 'tipo'
  },
  partners: {
    form: document.querySelector('#partnerForm'),
    list: document.querySelector('#partnersList'),
    endpoint: '/api/site-admin/partners',
    title: 'nome',
    subtitle: 'site_url'
  }
};

bindTabs();
bindForms();
bindUploads();
bindNewButtons();
await loadAll();

function bindTabs() {
  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
      document.querySelectorAll('[data-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === button.dataset.tab));
    });
  });
}

function bindForms() {
  for (const [key, resource] of Object.entries(resources)) {
    resource.form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveResource(key);
    });
  }

  document.querySelector('#siteSettingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = formPayload(event.currentTarget);
    await api('/api/site-admin/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    toast(status, 'Configuracoes do site salvas.', 'success');
    await loadDashboard();
  });
}

function bindUploads() {
  document.querySelectorAll('[data-upload-target]').forEach((input) => {
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        toast(status, 'Enviando imagem...', 'success');
        const dataUrl = await readFile(file);
        const { url } = await api('/api/site-admin/uploads', {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            dataUrl
          })
        });
        const form = input.closest('form');
        form.elements[input.dataset.uploadTarget].value = url;
        toast(status, 'Imagem enviada.', 'success');
      } catch (error) {
        toast(status, error.message, 'error');
      } finally {
        input.value = '';
      }
    });
  });
}

function bindNewButtons() {
  document.querySelectorAll('[data-new]').forEach((button) => {
    button.addEventListener('click', () => {
      const form = document.querySelector(`#${button.dataset.new}`);
      resetForm(form);
    });
  });
}

async function loadAll() {
  await Promise.all([loadDashboard(), ...Object.keys(resources).map(loadResource), loadLeads(), loadLogs(), loadSettings()]);
}

async function loadDashboard() {
  const data = await api('/api/site-admin/dashboard');
  state.settings = data.settings;
  document.querySelector('#summaryCards').innerHTML = [
    ['Paginas', data.counts.pages],
    ['Artigos', data.counts.posts],
    ['Depoimentos', data.counts.testimonials],
    ['Parceiros', data.counts.partners],
    ['Contatos', data.counts.leads]
  ]
    .map(([label, value]) => `<article><strong>${value}</strong><span>${label}</span></article>`)
    .join('');
}

async function loadSettings() {
  const settings = await api('/api/site-admin/settings');
  state.settings = settings;
  fillForm(document.querySelector('#siteSettingsForm'), settings);
}

async function loadResource(key) {
  const resource = resources[key];
  state[key] = await api(resource.endpoint);
  renderResourceList(key);
}

async function saveResource(key) {
  const resource = resources[key];
  const payload = formPayload(resource.form);
  const id = payload.id;
  delete payload.id;

  const method = id ? 'PUT' : 'POST';
  const path = id ? `${resource.endpoint}/${id}` : resource.endpoint;

  await api(path, {
    method,
    body: JSON.stringify(payload)
  });

  toast(status, id ? 'Item atualizado.' : 'Item criado.', 'success');
  resetForm(resource.form);
  await Promise.all([loadResource(key), loadDashboard(), loadLogs()]);
}

function renderResourceList(key) {
  const resource = resources[key];
  const items = state[key];

  if (!items.length) {
    resource.list.innerHTML = '<p class="empty-state">Nenhum item cadastrado.</p>';
    return;
  }

  resource.list.innerHTML = items
    .map((item) => {
      const active = item.ativo ? 'Ativo' : 'Oculto';
      const subtitle = item[resource.subtitle] || 'Sem detalhe';
      const image = item.banner_url || item.imagem_url || item.foto_url || item.logo_url;
      return `
        <article class="admin-item">
          ${image ? `<img src="${escapeHtml(image)}" alt="">` : '<div class="image-placeholder"></div>'}
          <div>
            <strong>${escapeHtml(item[resource.title] || 'Sem titulo')}</strong>
            <span>${escapeHtml(subtitle)}</span>
            <em>${active}</em>
          </div>
          <div class="actions compact-actions">
            <button class="btn" type="button" data-edit="${key}" data-id="${item.id}">Editar</button>
            <button class="btn danger" type="button" data-delete="${key}" data-id="${item.id}">Excluir</button>
          </div>
        </article>
      `;
    })
    .join('');

  resource.list.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = state[button.dataset.edit].find((entry) => entry.id === button.dataset.id);
      fillForm(resources[button.dataset.edit].form, item);
    });
  });

  resource.list.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (!window.confirm('Excluir este item?')) return;
      const resourceConfig = resources[button.dataset.delete];
      await api(`${resourceConfig.endpoint}/${button.dataset.id}`, { method: 'DELETE' });
      toast(status, 'Item excluido.', 'success');
      await Promise.all([loadResource(button.dataset.delete), loadDashboard(), loadLogs()]);
    });
  });
}

async function loadLeads() {
  state.leads = await api('/api/site-admin/leads');
  const body = document.querySelector('#leadsBody');
  body.innerHTML =
    state.leads
      .map(
        (lead) => `
          <tr>
            <td>${escapeHtml(lead.nome)}</td>
            <td>${escapeHtml(lead.email)}</td>
            <td>${escapeHtml(lead.telefone)}</td>
            <td>${escapeHtml(lead.perfil)}</td>
            <td>${escapeHtml(lead.origem)}</td>
            <td>${formatDate(lead.criado_em)}</td>
          </tr>
        `
      )
      .join('') || '<tr><td colspan="6">Nenhum contato recebido.</td></tr>';
}

async function loadLogs() {
  state.logs = await api('/api/site-admin/logs');
  const body = document.querySelector('#logsBody');
  body.innerHTML =
    state.logs
      .map(
        (log) => `
          <tr>
            <td>${escapeHtml(log.usuario_email)}</td>
            <td>${escapeHtml(log.entidade)}</td>
            <td>${escapeHtml(log.acao)}</td>
            <td>${escapeHtml(log.resumo)}</td>
            <td>${formatDate(log.criado_em)}</td>
          </tr>
        `
      )
      .join('') || '<tr><td colspan="5">Nenhuma alteracao registrada.</td></tr>';
}

function formPayload(form) {
  const payload = {};
  Array.from(form.elements).forEach((field) => {
    if (!field.name) return;
    payload[field.name] = field.type === 'checkbox' ? field.checked : field.value;
  });
  return payload;
}

function fillForm(form, data = {}) {
  Array.from(form.elements).forEach((field) => {
    if (!field.name) return;
    if (field.type === 'checkbox') {
      field.checked = Boolean(data[field.name]);
    } else {
      field.value = data[field.name] ?? '';
    }
  });
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm(form) {
  form.reset();
  const id = form.elements.id;
  if (id) id.value = '';
  form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = false;
  });
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
