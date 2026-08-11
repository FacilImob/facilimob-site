const pagesBody = document.querySelector('#pagesBody');
const statusBox = document.querySelector('#status');
const createDialog = document.querySelector('#createDialog');
const createForm = document.querySelector('#createForm');
const titleInput = createForm.elements.title;
const slugInput = createForm.elements.slug;
const openCreateButton = document.querySelector('[data-open-create]');
const closeCreateButton = document.querySelector('[data-close-create]');

let pages = [];
let slugTouched = false;

loadPages();

openCreateButton.addEventListener('click', () => {
  slugTouched = false;
  createForm.reset();
  showStatus('', '');
  createDialog.showModal();
  titleInput.focus();
});

closeCreateButton.addEventListener('click', () => {
  createDialog.close();
});

titleInput.addEventListener('input', () => {
  if (!slugTouched) slugInput.value = slugify(titleInput.value);
});

slugInput.addEventListener('input', () => {
  slugTouched = true;
  slugInput.value = slugify(slugInput.value);
});

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await api('/api/admin/pages', {
      method: 'POST',
      body: JSON.stringify({
        title: titleInput.value,
        slug: slugInput.value
      })
    });
    createDialog.close();
    showStatus('Pagina criada.', 'success');
    await loadPages();
  } catch (error) {
    showStatus(error.message, 'error');
  }
});

pagesBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  const id = button.dataset.id;
  const page = pages.find((item) => item.id === id);
  if (!page) return;

  try {
    button.disabled = true;

    if (button.dataset.action === 'duplicate') {
      const title = window.prompt('Titulo da nova pagina:', `${page.title} copia`);
      if (!title) return;
      await api(`/api/admin/pages/${id}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ title, slug: slugify(title) })
      });
      showStatus('Pagina duplicada.', 'success');
    }

    if (button.dataset.action === 'delete') {
      if (page.is_home) {
        showStatus('A pagina home atual nao pode ser excluida.', 'error');
        return;
      }
      if (!window.confirm(`Excluir a pagina "${page.title}"?`)) return;
      await api(`/api/admin/pages/${id}`, { method: 'DELETE' });
      showStatus('Pagina excluida.', 'success');
    }

    if (button.dataset.action === 'home') {
      await api(`/api/admin/pages/${id}/set-home`, { method: 'POST' });
      showStatus('Pagina definida como home.', 'success');
    }

    await loadPages();
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

async function loadPages() {
  pages = await api('/api/admin/pages');
  renderPages();
}

function renderPages() {
  if (!pages.length) {
    pagesBody.innerHTML = '<tr><td colspan="6" class="admin-empty">Nenhuma pagina criada.</td></tr>';
    return;
  }

  pagesBody.innerHTML = pages.map((page) => `
    <tr>
      <td><strong>${escapeHtml(page.title)}</strong></td>
      <td><code>${page.slug ? `/${escapeHtml(page.slug)}` : '/'}</code></td>
      <td><span class="admin-badge ${page.status === 'published' ? 'published' : ''}">${escapeHtml(statusLabel(page.status))}</span></td>
      <td>${escapeHtml(formatDate(page.updated_at))}</td>
      <td>${page.is_home ? '<span class="admin-badge home">Home</span>' : `<button class="secondary compact" type="button" data-action="home" data-id="${page.id}">Definir</button>`}</td>
      <td>
        <div class="admin-row-actions">
          <a class="admin-link compact-link" href="/admin/editor.html?page=${page.id}">Editar</a>
          <button class="secondary compact" type="button" data-action="duplicate" data-id="${page.id}">Duplicar</button>
          <button class="secondary compact danger" type="button" data-action="delete" data-id="${page.id}" ${page.is_home ? 'disabled' : ''}>Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Nao foi possivel concluir a acao.');
  }

  return data;
}

function showStatus(message, type) {
  statusBox.textContent = message;
  statusBox.className = `admin-status ${type || ''}`.trim();
}

function statusLabel(status) {
  if (status === 'static') return 'Home atual';
  return status === 'published' ? 'Publicado' : 'Rascunho';
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
