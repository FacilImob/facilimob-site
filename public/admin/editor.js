import { dynamicPageStyles, pageStyle, renderPageContent } from './renderCore.js';

const pageId = new URLSearchParams(window.location.search).get('page');
const canvas = document.querySelector('#canvas');
const propertiesPanel = document.querySelector('#propertiesPanel');
const saveStatus = document.querySelector('#saveStatus');
const pageTitle = document.querySelector('#pageTitle');
const pageMeta = document.querySelector('#pageMeta');
const rowDialog = document.querySelector('#rowDialog');
const imageUpload = document.querySelector('#imageUpload');
const inlineToolbar = document.createElement('div');

let page = null;
let draft = { pageWidth: '1140px', sections: [] };
let menuPages = [];
let selected = null;
let rowTargetSectionId = '';
let saveTimer = null;
let draggedBlockId = '';
let history = [];
let future = [];
let suppressHistory = false;
let currentBreakpoint = 'desktop';

document.querySelector('#dynamicStyles').textContent = dynamicPageStyles;
inlineToolbar.className = 'editor-inline-toolbar';
inlineToolbar.hidden = true;
inlineToolbar.innerHTML = `
  <button type="button" data-inline-command="bold"><strong>B</strong></button>
  <button type="button" data-inline-command="italic"><em>I</em></button>
  <button type="button" data-inline-command="link">Link</button>
  <select data-inline-heading aria-label="Formato do texto">
    <option value="p">P</option>
    <option value="h1">H1</option>
    <option value="h2">H2</option>
    <option value="h3">H3</option>
  </select>
`;
document.body.append(inlineToolbar);

init();

document.querySelector('[data-undo]').addEventListener('click', undo);
document.querySelector('[data-redo]').addEventListener('click', redo);
document.querySelector('[data-close-row]').addEventListener('click', () => rowDialog.close());
document.querySelector('[data-page-settings]').addEventListener('click', () => {
  selected = { id: 'page', kind: 'page' };
  render();
});
document.querySelector('[data-preview]').addEventListener('click', () => {
  window.open(`/admin/preview/${pageId}`, '_blank', 'noopener');
});
document.querySelector('[data-publish]').addEventListener('click', publishPage);
document.querySelectorAll('[data-breakpoint]').forEach((button) => {
  button.addEventListener('click', () => {
    currentBreakpoint = button.dataset.breakpoint;
    document.querySelectorAll('[data-breakpoint]').forEach((item) => item.classList.toggle('active', item === button));
    canvas.classList.toggle('editor-canvas-tablet', currentBreakpoint === 'tablet');
    canvas.classList.toggle('editor-canvas-mobile', currentBreakpoint === 'mobile');
    render();
  });
});

rowDialog.addEventListener('click', (event) => {
  const button = event.target.closest('[data-layout]');
  if (!button) return;

  const widths = button.dataset.layout.split(',').map(Number);
  applyChange(() => {
    const section = findEntity(rowTargetSectionId)?.entity;
    if (!section) return;
    section.rows = Array.isArray(section.rows) ? section.rows : [];
    section.rows.push({
      id: uid('row'),
      columns: widths.map((width) => ({ id: uid('column'), widthFraction: width, blocks: [] }))
    });
  });
  rowDialog.close();
});

canvas.addEventListener('click', (event) => {
  if (event.target.closest('.dynamic-button')) event.preventDefault();

  const addSection = event.target.closest('[data-add-section]');
  if (addSection) {
    const index = Number(addSection.dataset.addSection);
    applyChange(() => {
      draft.sections.splice(index, 0, newSection());
    });
    return;
  }

  const addRow = event.target.closest('[data-add-row]');
  if (addRow) {
    rowTargetSectionId = addRow.dataset.addRow;
    rowDialog.showModal();
    return;
  }

  const editable = event.target.closest('[data-editor-id]');
  if (editable) {
    selected = {
      id: editable.dataset.editorId,
      kind: editable.dataset.editorKind
    };
    if (event.target.closest('.dynamic-image-placeholder')) {
      const block = findEntity(selected.id)?.entity;
      if (block?.type === 'image' && !block.url) {
        markSelectedElement(editable);
        renderProperties();
        imageUpload.click();
        return;
      }
    }
    if (editable.matches('[data-inline-text]')) {
      markSelectedElement(editable);
      renderProperties();
      showInlineToolbar(editable);
      return;
    }
    render();
  }
});

canvas.addEventListener('input', (event) => {
  const editableText = event.target.closest('[data-inline-text]');
  if (!editableText) return;
  updateInlineText(editableText, false);
});

canvas.addEventListener('blur', (event) => {
  const editableText = event.target.closest('[data-inline-text]');
  if (!editableText) return;
  updateInlineText(editableText, true);
}, true);

canvas.addEventListener('dragstart', (event) => {
  if (event.target.closest('[data-inline-text]')) {
    event.preventDefault();
    return;
  }
  const block = event.target.closest('[data-block-id]');
  if (!block) return;
  draggedBlockId = block.dataset.blockId;
  event.dataTransfer.setData('text/plain', JSON.stringify({ existingBlockId: draggedBlockId }));
  event.dataTransfer.effectAllowed = 'move';
});

canvas.addEventListener('dragover', (event) => {
  if (event.target.closest('[data-drop-column], [data-drop-container]')) event.preventDefault();
});

canvas.addEventListener('drop', (event) => {
  const dropTarget = event.target.closest('[data-drop-column], [data-drop-container]');
  if (!dropTarget) return;
  event.preventDefault();
  const targetId = dropTarget.dataset.dropColumn || dropTarget.dataset.dropContainer;
  const payload = readDragPayload(event);

  applyChange(() => {
    const target = findEntity(targetId)?.entity;
    if (!target) return;
    target.blocks = Array.isArray(target.blocks) ? target.blocks : [];

    if (payload.newBlockType) {
      const block = newBlock(payload.newBlockType);
      target.blocks.push(block);
      selected = { id: block.id, kind: 'block' };
      return;
    }

    if (payload.existingBlockId || draggedBlockId) {
      const block = removeBlock(payload.existingBlockId || draggedBlockId);
      if (block) {
        target.blocks.push(block);
        selected = { id: block.id, kind: 'block' };
      }
    }
  });
  draggedBlockId = '';
});

document.addEventListener('dragstart', (event) => {
  const palette = event.target.closest('[data-new-block]');
  if (!palette) return;
  event.dataTransfer.setData('text/plain', JSON.stringify({ newBlockType: palette.dataset.newBlock }));
  event.dataTransfer.effectAllowed = 'copy';
});

document.addEventListener('selectionchange', () => {
  const node = document.getSelection()?.anchorNode;
  const element = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  const editableText = element?.closest?.('[data-inline-text]');
  if (!editableText || !canvas.contains(editableText)) {
    inlineToolbar.hidden = true;
    return;
  }
  showInlineToolbar(editableText);
});

inlineToolbar.addEventListener('mousedown', (event) => {
  event.preventDefault();
});

inlineToolbar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-inline-command]');
  if (!button) return;
  const editableText = selected?.id ? canvas.querySelector(`[data-editor-id="${cssEscape(selected.id)}"][data-inline-text]`) : null;
  if (!editableText) return;
  editableText.focus();

  const command = button.dataset.inlineCommand;
  if (command === 'link') {
    const href = window.prompt('URL do link');
    if (!href) return;
    document.execCommand('createLink', false, href);
  } else {
    document.execCommand(command, false, null);
  }
  updateInlineText(editableText, true);
});

inlineToolbar.addEventListener('change', (event) => {
  const select = event.target.closest('[data-inline-heading]');
  if (!select || !selected?.id) return;
  const found = findEntity(selected.id);
  if (!found?.entity || found.kind !== 'block' || found.entity.type !== 'text') return;
  applyChange(() => {
    found.entity.tag = select.value;
  });
});

propertiesPanel.addEventListener('input', updateSelectedField);
propertiesPanel.addEventListener('change', updateSelectedField);
propertiesPanel.addEventListener('click', async (event) => {
  const uploadButton = event.target.closest('[data-upload-image]');
  if (uploadButton) {
    imageUpload.click();
    return;
  }

  const toggleMenu = event.target.closest('[data-toggle-menu-page]');
  if (toggleMenu) {
    const pageIdToToggle = toggleMenu.dataset.toggleMenuPage;
    applyChange(() => {
      const block = findEntity(selected?.id)?.entity;
      if (!block) return;
      block.hiddenPageIds = Array.isArray(block.hiddenPageIds) ? block.hiddenPageIds : [];
      if (block.hiddenPageIds.includes(pageIdToToggle)) {
        block.hiddenPageIds = block.hiddenPageIds.filter((id) => id !== pageIdToToggle);
      } else {
        block.hiddenPageIds.push(pageIdToToggle);
      }
    });
  }

  const moveMenu = event.target.closest('[data-menu-move]');
  if (moveMenu) {
    const pageIdToMove = moveMenu.dataset.pageId;
    const direction = moveMenu.dataset.menuMove;
    applyChange(() => {
      const block = findEntity(selected?.id)?.entity;
      if (!block) return;
      block.order = normalizeMenuOrder(block.order);
      const index = block.order.indexOf(pageIdToMove);
      const nextIndex = direction === 'up' ? index - 1 : index + 1;
      if (index < 0 || nextIndex < 0 || nextIndex >= block.order.length) return;
      const [item] = block.order.splice(index, 1);
      block.order.splice(nextIndex, 0, item);
    });
  }
});

imageUpload.addEventListener('change', async () => {
  const file = imageUpload.files?.[0];
  const block = findEntity(selected?.id)?.entity;
  if (!file || !block || block.type !== 'image') return;

  try {
    saveStatus.textContent = 'Enviando imagem...';
    const dataUrl = await fileToDataUrl(file);
    const { url } = await api('/api/admin/uploads', {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, contentType: file.type, dataUrl })
    });
    applyChange(() => {
      block.url = url;
    });
  } catch (error) {
    saveStatus.textContent = error.message;
  } finally {
    imageUpload.value = '';
  }
});

function updateSelectedField(event) {
  const field = event.target.dataset.field;
  if (!field || !selected) return;
  pushEditHistory();

  const value = readFieldValue(event.target);
  if (selected.kind === 'page') {
    setPageField(field, value);
  } else {
    const found = findEntity(selected.id);
    if (!found?.entity) return;
    setFieldValue(found.entity, field, value);
  }

  render(false);
  scheduleSave();
}

async function init() {
  if (!pageId) {
    saveStatus.textContent = 'Pagina nao informada';
    return;
  }

  try {
    [page, menuPages] = await Promise.all([
      api(`/api/admin/pages/${pageId}`),
      api('/api/admin/menu-pages')
    ]);
    draft = normalizePageJson(page.draft_json);
    pageTitle.textContent = page.title;
    pageMeta.textContent = `/${page.slug}`;
    saveStatus.textContent = 'Salvo';
    render();
  } catch (error) {
    saveStatus.textContent = error.message;
  }
}

function render(updateProperties = true) {
  inlineToolbar.hidden = true;
  canvas.style.cssText = pageStyle(draft);
  canvas.innerHTML = renderPageContent(draft, { editable: true, selectedId: selected?.id, menuPages, breakpoint: currentBreakpoint });
  if (updateProperties) renderProperties();
}

function renderProperties() {
  if (!selected) {
    propertiesPanel.innerHTML = '<p class="editor-muted">Selecione uma secao, linha, coluna ou bloco.</p>';
    return;
  }

  if (selected.kind === 'page') {
    propertiesPanel.innerHTML = `
      <label><span>Largura da pagina</span>
        <select data-field="pageWidth">
          ${['1140px', '1280px', 'full-width'].map((value) => `<option value="${value}"${(draft.pageWidth || '1140px') === value ? ' selected' : ''}>${value}</option>`).join('')}
        </select>
      </label>
      <label><span>SEO title</span><input data-field="seo_title" value="${escapeHtml(page?.seo_title || '')}"></label>
      <label><span>SEO description</span><textarea data-field="seo_description">${escapeHtml(page?.seo_description || '')}</textarea></label>
    `;
    return;
  }

  const found = findEntity(selected.id);
  if (!found?.entity) {
    selected = null;
    renderProperties();
    return;
  }

  if (found.kind !== 'block') {
    if (found.kind === 'section') {
      const section = found.entity;
      propertiesPanel.innerHTML = `
        <label><span>Fundo</span><input data-field="background" value="${escapeHtml(section.background || '')}" placeholder="#ffffff"></label>
        ${paddingControls(section.padding)}
      `;
      return;
    }

    if (found.kind === 'column') {
      propertiesPanel.innerHTML = paddingControls(found.entity.padding);
      return;
    }

    propertiesPanel.innerHTML = `<p class="editor-muted">${labelForKind(found.kind)} selecionado.</p>`;
    return;
  }

  const block = found.entity;
  const responsivePanel = renderResponsivePanel(block);
  if (block.type === 'text') {
    propertiesPanel.innerHTML = `
      ${responsivePanel}
      <p class="editor-muted">Edite o conteudo diretamente no canvas.</p>
      <label><span>Cor</span><input data-field="color" value="${escapeHtml(block.color || '')}" placeholder="#1f2937"></label>
      <label><span>Tamanho da fonte</span><input data-field="fontSize" value="${escapeHtml(block.fontSize || '')}" placeholder="18px"></label>
      <label><span>Alinhamento</span>${alignSelect(block.align)}</label>
    `;
    return;
  }

  if (block.type === 'button') {
    propertiesPanel.innerHTML = `
      ${responsivePanel}
      <label><span>Texto</span><input data-field="label" value="${escapeHtml(block.label || '')}"></label>
      <label><span>Link</span><input data-field="href" value="${escapeHtml(block.href || '')}" placeholder="https://..."></label>
      <label><span>Cor</span><input data-field="color" value="${escapeHtml(block.color || '')}" placeholder="#f4770b"></label>
      <label><span>Tamanho da fonte</span><input data-field="fontSize" value="${escapeHtml(block.fontSize || '')}" placeholder="16px"></label>
      <label><span>Alinhamento</span>${alignSelect(block.align)}</label>
    `;
    return;
  }

  if (block.type === 'container') {
    propertiesPanel.innerHTML = `
      ${responsivePanel}
      <label><span>Fundo</span><input data-field="background" value="${escapeHtml(block.background || '')}" placeholder="#ffffff"></label>
      <label><span>Borda</span><input data-field="border" value="${escapeHtml(block.border || '')}" placeholder="1px solid #d9e2ec"></label>
      <label><span>Raio da borda</span><input data-field="radius" value="${escapeHtml(block.radius || '')}" placeholder="12px"></label>
      ${paddingControls(block.padding)}
    `;
    return;
  }

  if (block.type === 'image') {
    propertiesPanel.innerHTML = `
      ${responsivePanel}
      <label><span>URL da imagem</span><input data-field="url" value="${escapeHtml(block.url || '')}" placeholder="https://..."></label>
      <button class="secondary" type="button" data-upload-image>Enviar imagem</button>
      <label><span>Texto alternativo</span><input data-field="alt" value="${escapeHtml(block.alt || '')}"></label>
      <label><span>Link opcional</span><input data-field="href" value="${escapeHtml(block.href || '')}" placeholder="https://..."></label>
      <label><span>Largura</span><input data-field="width" value="${escapeHtml(block.width || '')}" placeholder="100%"></label>
      <label><span>Arredondamento</span><input data-field="radius" value="${escapeHtml(block.radius || '')}" placeholder="12px"></label>
      <label><span>Alinhamento</span>${alignSelect(block.align)}</label>
    `;
    return;
  }

  if (block.type === 'video') {
    propertiesPanel.innerHTML = `
      ${responsivePanel}
      <label><span>URL do video</span><input data-field="url" value="${escapeHtml(block.url || '')}" placeholder="YouTube, Vimeo ou arquivo"></label>
      <label class="editor-check"><input type="checkbox" data-field="controls" ${block.controls === false ? '' : 'checked'}> <span>Mostrar controles</span></label>
      <label class="editor-check"><input type="checkbox" data-field="autoplay" ${block.autoplay ? 'checked' : ''}> <span>Autoplay</span></label>
    `;
    return;
  }

  if (block.type === 'social') {
    propertiesPanel.innerHTML = `
      ${responsivePanel}
      <label><span>Instagram</span><input data-field="links.instagram" value="${escapeHtml(block.links?.instagram || '')}" placeholder="https://instagram.com/..."></label>
      <label><span>Facebook</span><input data-field="links.facebook" value="${escapeHtml(block.links?.facebook || '')}" placeholder="https://facebook.com/..."></label>
      <label><span>WhatsApp</span><input data-field="links.whatsapp" value="${escapeHtml(block.links?.whatsapp || '')}" placeholder="https://wa.me/..."></label>
      <label><span>LinkedIn</span><input data-field="links.linkedin" value="${escapeHtml(block.links?.linkedin || '')}" placeholder="https://linkedin.com/..."></label>
      <label><span>Cor</span><input data-field="color" value="${escapeHtml(block.color || '')}" placeholder="#004477"></label>
      <label><span>Tamanho</span><input data-field="size" value="${escapeHtml(block.size || '')}" placeholder="18px"></label>
    `;
    return;
  }

  if (block.type === 'menu') {
    const orderedPages = orderedMenuPages(block);
    propertiesPanel.innerHTML = `
      ${responsivePanel}
      <label><span>Layout</span>
        <select data-field="layout">
          <option value="horizontal"${block.layout !== 'hamburger' ? ' selected' : ''}>Horizontal</option>
          <option value="hamburger"${block.layout === 'hamburger' ? ' selected' : ''}>Hamburguer</option>
        </select>
      </label>
      <div class="editor-menu-list">
        ${orderedPages.map((pageItem) => `
          <div class="editor-menu-item">
            <span>${escapeHtml(pageItem.title)}</span>
            <button type="button" class="secondary compact" data-menu-move="up" data-page-id="${pageItem.id}">Subir</button>
            <button type="button" class="secondary compact" data-menu-move="down" data-page-id="${pageItem.id}">Descer</button>
            <button type="button" class="secondary compact" data-toggle-menu-page="${pageItem.id}">${(block.hiddenPageIds || []).includes(pageItem.id) ? 'Mostrar' : 'Ocultar'}</button>
          </div>
        `).join('') || '<p class="editor-muted">Nenhuma pagina publicada.</p>'}
      </div>
    `;
    return;
  }

  if (block.type === 'html') {
    propertiesPanel.innerHTML = `
      ${responsivePanel}
      <label><span>Codigo HTML</span><textarea data-field="code">${escapeHtml(block.code || '')}</textarea></label>
      <label><span>Altura</span><input data-field="height" value="${escapeHtml(block.height || '')}" placeholder="180px"></label>
    `;
  }
}

function renderResponsivePanel(block) {
  if (currentBreakpoint === 'desktop') {
    return '<div class="editor-responsive-panel"><strong>Desktop</strong><span>Propriedades base.</span></div>';
  }

  const overrides = block.responsiveOverrides?.[currentBreakpoint] || {};
  return `
    <div class="editor-responsive-panel">
      <strong>${currentBreakpoint === 'tablet' ? 'Tablet' : 'Mobile'}</strong>
      <label class="editor-check"><input type="checkbox" data-field="responsive.hidden" ${overrides.hidden ? 'checked' : ''}> <span>Ocultar neste breakpoint</span></label>
      <label><span>Alinhamento neste breakpoint</span>${alignSelect(overrides.align || '', 'responsive.align', true)}</label>
      <label><span>Fonte neste breakpoint</span><input data-field="responsive.fontSize" value="${escapeHtml(overrides.fontSize || '')}" placeholder="ex.: 16px"></label>
    </div>
  `;
}

function applyChange(mutator) {
  history.push(clone(draft));
  future = [];
  mutator();
  draft = normalizePageJson(draft);
  render();
  scheduleSave();
}

function pushEditHistory() {
  if (suppressHistory) return;
  history.push(clone(draft));
  future = [];
  suppressHistory = true;
  window.setTimeout(() => {
    suppressHistory = false;
  }, 500);
}

function undo() {
  if (!history.length) return;
  future.push(clone(draft));
  draft = history.pop();
  selected = null;
  render();
  scheduleSave();
}

function redo() {
  if (!future.length) return;
  history.push(clone(draft));
  draft = future.pop();
  selected = null;
  render();
  scheduleSave();
}

function scheduleSave() {
  saveStatus.textContent = 'Salvando...';
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveDraft, 1400);
}

async function saveDraft() {
  try {
    const payload = { draft_json: draft };
    if (page) {
      payload.seo_title = page.seo_title || '';
      payload.seo_description = page.seo_description || '';
    }
    page = await api(`/api/admin/pages/${pageId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    saveStatus.textContent = 'Salvo';
  } catch (error) {
    saveStatus.textContent = error.message;
  }
}

async function publishPage() {
  if (!window.confirm('Publicar esta pagina agora?')) return;

  try {
    window.clearTimeout(saveTimer);
    await saveDraft();
    saveStatus.textContent = 'Publicando...';
    page = await api(`/api/admin/pages/${pageId}/publish`, { method: 'POST' });
    saveStatus.textContent = 'Publicado';
  } catch (error) {
    saveStatus.textContent = error.message;
  }
}

function findEntity(id) {
  for (const section of draft.sections) {
    if (section.id === id) return { kind: 'section', entity: section };
    for (const row of section.rows || []) {
      if (row.id === id) return { kind: 'row', entity: row };
      for (const column of row.columns || []) {
        if (column.id === id) return { kind: 'column', entity: column };
        const block = findBlockInList(column.blocks || [], id);
        if (block) return { kind: 'block', entity: block };
      }
    }
  }
  return null;
}

function removeBlock(id) {
  for (const section of draft.sections) {
    for (const row of section.rows || []) {
      for (const column of row.columns || []) {
        const block = removeBlockFromList(column.blocks || [], id);
        if (block) return block;
      }
    }
  }
  return null;
}

function newSection() {
  return {
    id: uid('section'),
    background: '',
    padding: { top: 56, bottom: 56, left: 20, right: 20 },
    rows: []
  };
}

function newBlock(type) {
  if (type === 'container') return { id: uid('block'), type: 'container', background: '#ffffff', border: '1px solid #d9e2ec', radius: '12px', padding: { top: 24, bottom: 24, left: 24, right: 24 }, blocks: [] };
  if (type === 'image') return { id: uid('block'), type: 'image', url: '', alt: '', href: '', width: '100%', radius: '12px', align: 'left' };
  if (type === 'video') return { id: uid('block'), type: 'video', url: '', controls: true, autoplay: false };
  if (type === 'social') return { id: uid('block'), type: 'social', links: { instagram: '', facebook: '', whatsapp: '', linkedin: '' }, color: '#004477', size: '18px' };
  if (type === 'menu') return { id: uid('block'), type: 'menu', layout: 'horizontal', hiddenPageIds: [], order: menuPages.map((item) => item.id) };
  if (type === 'html') return { id: uid('block'), type: 'html', code: '<div>HTML livre</div>', height: '180px' };
  if (type === 'button') return { id: uid('block'), type: 'button', label: 'Saiba mais', href: '#', color: '#f4770b', align: 'left' };
  return { id: uid('block'), type: 'text', text: 'Novo texto', color: '#1f2937', align: 'left', tag: 'p' };
}

function findBlockInList(blocks, id) {
  for (const block of blocks || []) {
    if (block.id === id) return block;
    const child = findBlockInList(block.blocks || [], id);
    if (child) return child;
  }
  return null;
}

function removeBlockFromList(blocks, id) {
  const list = Array.isArray(blocks) ? blocks : [];
  const index = list.findIndex((block) => block.id === id);
  if (index >= 0) return list.splice(index, 1)[0];
  for (const block of list) {
    const child = removeBlockFromList(block.blocks || [], id);
    if (child) return child;
  }
  return null;
}

function setPageField(field, value) {
  if (field === 'pageWidth') draft.pageWidth = value;
  if (field === 'seo_title' && page) page.seo_title = value;
  if (field === 'seo_description' && page) page.seo_description = value;
}

function setFieldValue(block, field, value) {
  if (field.startsWith('responsive.')) {
    const key = field.replace('responsive.', '');
    block.responsiveOverrides = block.responsiveOverrides || {};
    block.responsiveOverrides[currentBreakpoint] = block.responsiveOverrides[currentBreakpoint] || {};
    if (value === '' || value === false) {
      delete block.responsiveOverrides[currentBreakpoint][key];
    } else {
      block.responsiveOverrides[currentBreakpoint][key] = value;
    }
    return;
  }

  const parts = field.split('.');
  let target = block;
  while (parts.length > 1) {
    const part = parts.shift();
    target[part] = target[part] && typeof target[part] === 'object' ? target[part] : {};
    target = target[part];
  }
  target[parts[0]] = value;
}

function updateInlineText(editableText, sanitize) {
  const block = findEntity(editableText.dataset.editorId)?.entity;
  if (!block || block.type !== 'text') return;
  pushEditHistory();
  const html = sanitizeEditorHtml(editableText.innerHTML);
  block.text = html;
  if (sanitize) editableText.innerHTML = html;
  scheduleSave();
}

function showInlineToolbar(editableText) {
  const rect = selectionRect() || editableText.getBoundingClientRect();
  const block = findEntity(editableText.dataset.editorId)?.entity;
  const heading = inlineToolbar.querySelector('[data-inline-heading]');
  if (heading && block?.tag) heading.value = ['h1', 'h2', 'h3', 'p'].includes(block.tag) ? block.tag : 'p';
  inlineToolbar.hidden = false;
  inlineToolbar.style.left = `${Math.max(12, rect.left + window.scrollX)}px`;
  inlineToolbar.style.top = `${Math.max(12, rect.top + window.scrollY - inlineToolbar.offsetHeight - 10)}px`;
}

function selectionRect() {
  const selection = document.getSelection();
  if (!selection || !selection.rangeCount) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return rect;
}

function markSelectedElement(element) {
  canvas.querySelectorAll('.is-selected').forEach((item) => item.classList.remove('is-selected'));
  element.classList.add('is-selected');
}

function paddingControls(value) {
  const padding = paddingObject(value);
  return `
    <fieldset class="editor-fieldset">
      <legend>Padding (px)</legend>
      <div class="editor-padding-grid">
        <label><span>Topo</span><input type="number" min="0" step="1" data-field="padding.top" data-number-field value="${padding.top}"></label>
        <label><span>Base</span><input type="number" min="0" step="1" data-field="padding.bottom" data-number-field value="${padding.bottom}"></label>
        <label><span>Esquerda</span><input type="number" min="0" step="1" data-field="padding.left" data-number-field value="${padding.left}"></label>
        <label><span>Direita</span><input type="number" min="0" step="1" data-field="padding.right" data-number-field value="${padding.right}"></label>
      </div>
    </fieldset>
  `;
}

function paddingObject(value) {
  if (value && typeof value === 'object') {
    return {
      top: numberOrZero(value.top),
      bottom: numberOrZero(value.bottom),
      left: numberOrZero(value.left),
      right: numberOrZero(value.right)
    };
  }

  const parts = String(value || '').match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  if (parts.length >= 4) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
  return { top: 0, bottom: 0, left: 0, right: 0 };
}

function readFieldValue(field) {
  if (field.type === 'checkbox') return field.checked;
  if (field.dataset.numberField !== undefined) return Math.max(0, Number(field.value) || 0);
  return field.value;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function sanitizeEditorHtml(value) {
  const template = document.createElement('template');
  template.innerHTML = String(value || '');
  const allowed = new Set(['A', 'B', 'BR', 'DIV', 'EM', 'H1', 'H2', 'H3', 'I', 'P', 'STRONG']);
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      if (!allowed.has(child.tagName)) {
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attribute of [...child.attributes]) {
        if (child.tagName === 'A' && attribute.name === 'href') continue;
        child.removeAttribute(attribute.name);
      }
      if (child.tagName === 'A') {
        const href = child.getAttribute('href') || '#';
        child.setAttribute('href', /^javascript:/i.test(href) ? '#' : href);
        child.setAttribute('rel', 'noopener');
      }
      walk(child);
    }
  };
  walk(template.content);
  return template.innerHTML;
}

function orderedMenuPages(block) {
  const order = normalizeMenuOrder(block.order);
  return [...menuPages].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai === -1 && bi === -1) return a.title.localeCompare(b.title);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function normalizeMenuOrder(order = []) {
  const existing = new Set(Array.isArray(order) ? order : []);
  const normalized = Array.isArray(order) ? order.filter((id) => menuPages.some((pageItem) => pageItem.id === id)) : [];
  for (const pageItem of menuPages) {
    if (!existing.has(pageItem.id)) normalized.push(pageItem.id);
  }
  return normalized;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function readDragPayload(event) {
  try {
    return JSON.parse(event.dataTransfer.getData('text/plain') || '{}');
  } catch (_error) {
    return {};
  }
}

function normalizePageJson(value) {
  return {
    ...value,
    pageWidth: value?.pageWidth || '1140px',
    sections: Array.isArray(value?.sections) ? value.sections : []
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Nao foi possivel concluir a acao.');
  return data;
}

function alignSelect(value = 'left', field = 'align', includeInherit = false) {
  const options = includeInherit ? ['', 'left', 'center', 'right'] : ['left', 'center', 'right'];
  return `
    <select data-field="${field}">
      ${options.map((item) => `<option value="${item}"${item === value ? ' selected' : ''}>${item ? alignLabel(item) : 'Herdar'}</option>`).join('')}
    </select>
  `;
}

function alignLabel(value) {
  if (value === 'center') return 'Centro';
  if (value === 'right') return 'Direita';
  return 'Esquerda';
}

function labelForKind(kind) {
  if (kind === 'section') return 'Secao';
  if (kind === 'row') return 'Linha';
  if (kind === 'column') return 'Coluna';
  return 'Item';
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value || '').replace(/["\\]/g, '\\$&');
}
