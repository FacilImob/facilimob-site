import { dynamicPageStyles, pageStyle, renderPageContent } from './renderCore.js';

let pageId = new URLSearchParams(window.location.search).get('page');
const canvas = document.querySelector('#canvas');
const propertiesPanel = document.querySelector('#propertiesPanel');
const elementPanelTitle = document.querySelector('#elementPanelTitle');
const saveStatus = document.querySelector('#saveStatus');
const pageTitle = document.querySelector('#pageTitle');
const pageMeta = document.querySelector('#pageMeta');
const rowDialog = document.querySelector('#rowDialog');
const imageUpload = document.querySelector('#imageUpload');
const sidebarPanels = document.querySelectorAll('[data-sidebar-panel]');
const sidebarTabs = document.querySelectorAll('[data-sidebar-tab]');
const inlineToolbar = document.createElement('div');
const colorPopover = document.createElement('div');

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
let columnResize = null;
let activeColorField = '';
const transientAlignment = new Map();
const COLUMN_RESIZE_MIN_RATIO = 0.1;
const COLUMN_RESIZE_STEP = 0.5;

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
colorPopover.className = 'editor-color-popover';
colorPopover.hidden = true;
colorPopover.innerHTML = `
  <div class="editor-color-picker-wrap">
    <input type="color" data-color-picker aria-label="Selecionar cor">
  </div>
  <label><span>HEX</span><input data-color-hex placeholder="#000000"></label>
  <div class="editor-used-colors">
    <span>Cores utilizadas</span>
    <div data-used-colors></div>
  </div>
`;
document.body.append(colorPopover);

init();

document.querySelector('[data-undo]').addEventListener('click', undo);
document.querySelector('[data-redo]').addEventListener('click', redo);
document.querySelector('[data-close-row]').addEventListener('click', () => rowDialog.close());
document.querySelectorAll('[data-page-settings]').forEach((button) => {
  button.addEventListener('click', () => showSidebarPanel('page'));
});
sidebarTabs.forEach((button) => {
  button.addEventListener('click', () => showSidebarPanel(button.dataset.sidebarTab));
});
document.querySelectorAll('[data-close-element-settings]').forEach((button) => {
  button.addEventListener('click', closeElementSettings);
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
    section.rows.push(newRow(widths));
  });
  rowDialog.close();
});

canvas.addEventListener('click', (event) => {
  if (event.target.closest('.dynamic-button')) event.preventDefault();
  if (event.target.closest('[data-column-resize]')) return;

  const structureButton = event.target.closest('[data-structure-action]');
  if (structureButton) {
    event.preventDefault();
    event.stopPropagation();
    handleStructureAction(structureButton);
    return;
  }

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

document.addEventListener('pointerdown', startColumnResize, true);
window.addEventListener('pointermove', resizeColumns);
window.addEventListener('pointerup', finishColumnResize);
window.addEventListener('pointercancel', finishColumnResize);

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
  const payload = readDragPayload(event);
  if (payload.newStructure && structureDropTarget(event, payload.newStructure)) {
    event.preventDefault();
    return;
  }
  if (event.target.closest('[data-drop-column], [data-drop-container]')) event.preventDefault();
});

canvas.addEventListener('drop', (event) => {
  const payload = readDragPayload(event);
  if (payload.newStructure) {
    event.preventDefault();
    handleStructureDrop(event, payload.newStructure);
    return;
  }

  const dropTarget = event.target.closest('[data-drop-column], [data-drop-container]');
  if (!dropTarget) return;
  event.preventDefault();
  const targetId = dropTarget.dataset.dropColumn || dropTarget.dataset.dropContainer;

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
  const structure = event.target.closest('[data-new-structure]');
  if (structure) {
    event.dataTransfer.setData('text/plain', JSON.stringify({ newStructure: structure.dataset.newStructure }));
    event.dataTransfer.effectAllowed = 'copy';
    return;
  }

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
document.querySelector('[data-sidebar-panel="page"]').addEventListener('input', updatePageSettingsField);
document.querySelector('[data-sidebar-panel="page"]').addEventListener('change', updatePageSettingsField);
propertiesPanel.addEventListener('click', async (event) => {
  const openColor = event.target.closest('[data-open-color-field]');
  if (openColor) {
    event.preventDefault();
    openColorPopover(openColor);
    return;
  }

  const clearColor = event.target.closest('[data-clear-color-field]');
  if (clearColor) {
    event.preventDefault();
    updateColorValue(clearColor.dataset.clearColorField, '');
    hideColorPopover();
    return;
  }

  const deleteButton = event.target.closest('[data-delete-selected]');
  if (deleteButton) {
    deleteSelectedEntity();
    return;
  }

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

colorPopover.addEventListener('input', (event) => {
  const picker = event.target.closest('[data-color-picker]');
  const hex = event.target.closest('[data-color-hex]');
  if (!activeColorField || (!picker && !hex)) return;
  const value = normalizeHexColor(event.target.value);
  if (!value) return;
  syncColorPopover(value);
  updateColorValue(activeColorField, value);
});

colorPopover.addEventListener('click', (event) => {
  const swatch = event.target.closest('[data-used-color]');
  if (!swatch || !activeColorField) return;
  const value = swatch.dataset.usedColor;
  syncColorPopover(value);
  updateColorValue(activeColorField, value);
});

document.addEventListener('mousedown', (event) => {
  if (colorPopover.hidden) return;
  if (colorPopover.contains(event.target) || event.target.closest('[data-open-color-field]')) return;
  hideColorPopover();
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
  if ((field === 'color' || field === 'background') && event.target.closest('.editor-color-field')) {
    const swatch = event.target.closest('.editor-color-field').querySelector('[data-open-color-field]');
    if (swatch) swatch.style.setProperty('--color-swatch', normalizeHexColor(value) || '#ffffff');
  }
  if (selected.kind === 'page') {
    setPageField(field, value);
  } else {
    const found = findEntity(selected.id);
    if (!found?.entity) return;
    if (field === 'backgroundMode') {
      found.entity.background = value === 'transparent' ? '' : (found.entity.background || '#ffffff');
      render();
      scheduleSave();
      return;
    }
    setFieldValue(found.entity, field, value);
  }

  render(false);
  scheduleSave();
}

function updatePageSettingsField(event) {
  const field = event.target.dataset.pageField;
  if (!field) return;
  pushEditHistory();
  setPageField(field, readFieldValue(event.target));
  render(false);
  scheduleSave();
}

function showSidebarPanel(name) {
  document.querySelector('.editor-sidebar').dataset.activePanel = name;
  sidebarTabs.forEach((button) => button.classList.toggle('active', button.dataset.sidebarTab === name));
  sidebarPanels.forEach((panel) => {
    panel.hidden = panel.dataset.sidebarPanel !== name;
  });
  if (name === 'page') renderPageSettingsPanel();
}

function closeElementSettings() {
  selected = null;
  render();
  showSidebarPanel('components');
}

function renderPageSettingsPanel() {
  const panel = document.querySelector('[data-sidebar-panel="page"]');
  if (!panel) return;
  const width = panel.querySelector('[data-page-field="pageWidth"]');
  const seoTitle = panel.querySelector('[data-page-field="seo_title"]');
  const seoDescription = panel.querySelector('[data-page-field="seo_description"]');
  if (width) width.value = draft.pageWidth || '1140px';
  if (seoTitle) seoTitle.value = page?.seo_title || '';
  if (seoDescription) seoDescription.value = page?.seo_description || '';
}

function handleStructureDrop(event, structure) {
  applyChange(() => {
    if (structure === 'section') {
      const section = newSection();
      draft.sections.push(section);
      selected = { id: section.id, kind: 'section' };
      return;
    }

    if (structure === 'row') {
      const section = nearestSection(event) || ensureLastSection();
      section.rows = Array.isArray(section.rows) ? section.rows : [];
      const row = newRow([1]);
      section.rows.push(row);
      selected = { id: row.id, kind: 'row' };
      return;
    }

    if (structure === 'column') {
      const row = nearestRow(event) || ensureLastRow();
      row.columns = Array.isArray(row.columns) ? row.columns : [];
      const column = newColumn(1);
      row.columns.push(column);
      selected = { id: column.id, kind: 'column' };
    }
  });
}

function handleStructureAction(button) {
  const action = button.dataset.structureAction;
  const kind = button.dataset.structureKind;
  const id = button.dataset.structureId;
  if (!action || !kind || !id) return;

  selected = { id, kind };

  if (action === 'align-top' || action === 'align-bottom') {
    transientAlignment.set(id, action === 'align-top' ? 'top' : 'bottom');
    render();
    return;
  }

  if (action === 'delete') {
    deleteSelectedEntity();
    return;
  }

  applyChange(() => {
    if (action === 'duplicate') duplicateStructure(kind, id);
    if (action === 'equalize') equalizeStructureColumns(kind, id);
    if (action === 'move-left') moveColumn(id, 'left');
    if (action === 'move-right') moveColumn(id, 'right');
  });
}

function startColumnResize(event) {
  const handle = event.target.closest('[data-column-resize]');
  if (!handle) return;
  if (!canvas.contains(handle)) return;

  const rowId = handle.dataset.rowId;
  const leftColumnId = handle.dataset.leftColumnId;
  const rightColumnId = handle.dataset.rightColumnId;
  const row = findEntity(rowId)?.entity;
  const leftColumn = findEntity(leftColumnId)?.entity;
  const rightColumn = findEntity(rightColumnId)?.entity;
  const rowElement = handle.closest('[data-editor-kind="row"]');
  const rowRectWidth = rowElement?.getBoundingClientRect().width || 0;
  if (!row?.columns?.length || !leftColumn || !rightColumn || rowRectWidth <= 0) return;
  const rowStyle = window.getComputedStyle(rowElement);
  const rowGap = Number.parseFloat(rowStyle.columnGap || rowStyle.gap) || 0;
  const rowWidth = Math.max(1, rowRectWidth - rowGap * Math.max(0, row.columns.length - 1));

  event.preventDefault();
  event.stopPropagation();
  selected = { id: rowId, kind: 'row' };
  markSelectedElement(rowElement);
  renderProperties();
  history.push(clone(draft));
  future = [];

  const leftStart = columnFraction(leftColumn);
  const rightStart = columnFraction(rightColumn);
  const pairTotal = leftStart + rightStart;
  const totalFractions = row.columns.reduce((sum, column) => sum + columnFraction(column), 0) || 12;

  columnResize = {
    pointerId: event.pointerId,
    startX: event.clientX,
    rowWidth,
    totalFractions,
    pairTotal,
    leftStart,
    rightStart,
    leftColumnId,
    rightColumnId
  };

  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('editor-column-resizing');
}

function resizeColumns(event) {
  if (!columnResize || event.pointerId !== columnResize.pointerId) return;

  event.preventDefault();
  const leftColumn = findEntity(columnResize.leftColumnId)?.entity;
  const rightColumn = findEntity(columnResize.rightColumnId)?.entity;
  if (!leftColumn || !rightColumn) return;

  const deltaPixels = event.clientX - columnResize.startX;
  const deltaFraction = (deltaPixels / columnResize.rowWidth) * columnResize.totalFractions;
  const min = Math.min(columnResize.pairTotal / 2, Math.max(0.25, columnResize.totalFractions * COLUMN_RESIZE_MIN_RATIO));
  const nextLeft = clampFraction(roundToStep(columnResize.leftStart + deltaFraction, COLUMN_RESIZE_STEP), min, columnResize.pairTotal - min);
  const nextRight = Number((columnResize.pairTotal - nextLeft).toFixed(2));

  leftColumn.widthFraction = nextLeft;
  rightColumn.widthFraction = nextRight;
  updateColumnFlex(columnResize.leftColumnId, nextLeft);
  updateColumnFlex(columnResize.rightColumnId, nextRight);
  saveStatus.textContent = 'Salvando...';
}

function finishColumnResize(event) {
  if (!columnResize || event.pointerId !== columnResize.pointerId) return;
  columnResize = null;
  document.body.classList.remove('editor-column-resizing');
  draft = normalizePageJson(draft);
  render();
  scheduleSave();
}

function structureDropTarget(event, structure) {
  if (structure === 'section') return canvas;
  if (structure === 'row') return event.target.closest('[data-editor-kind="section"]') || canvas;
  if (structure === 'column') return event.target.closest('[data-editor-kind="row"], [data-editor-kind="section"]') || canvas;
  return null;
}

function duplicateStructure(kind, id) {
  const parent = findStructureParent(kind, id);
  if (!parent) return;

  if (kind === 'row') {
    const copy = cloneWithNewIds(parent.item);
    parent.list.splice(parent.index + 1, 0, copy);
    selected = { id: copy.id, kind: 'row' };
    return;
  }

  if (kind === 'column') {
    const copy = cloneWithNewIds(parent.item);
    parent.list.splice(parent.index + 1, 0, copy);
    selected = { id: copy.id, kind: 'column' };
  }
}

function equalizeStructureColumns(kind, id) {
  const row = kind === 'row' ? findEntity(id)?.entity : findParentRowOfColumn(id)?.row;
  if (!row?.columns?.length) return;
  const width = 12 / row.columns.length;
  row.columns.forEach((column) => {
    column.widthFraction = width;
  });
}

function moveColumn(id, direction) {
  const parent = findStructureParent('column', id);
  if (!parent) return;
  const nextIndex = direction === 'left' ? parent.index - 1 : parent.index + 1;
  if (nextIndex < 0 || nextIndex >= parent.list.length) return;
  const [column] = parent.list.splice(parent.index, 1);
  parent.list.splice(nextIndex, 0, column);
  selected = { id, kind: 'column' };
}

function applyTransientAlignment() {
  transientAlignment.forEach((alignment, id) => {
    const element = canvas.querySelector(`[data-editor-id="${cssEscape(id)}"]`);
    if (!element) return;
    if (element.dataset.editorKind === 'row') {
      element.style.alignItems = alignment === 'bottom' ? 'flex-end' : 'flex-start';
    }
    if (element.dataset.editorKind === 'column') {
      element.style.display = 'flex';
      element.style.flexDirection = 'column';
      element.style.justifyContent = alignment === 'bottom' ? 'flex-end' : 'flex-start';
    }
  });
}

function findStructureParent(kind, id) {
  if (kind === 'row') {
    for (const section of draft.sections || []) {
      const rows = Array.isArray(section.rows) ? section.rows : [];
      const index = rows.findIndex((row) => row.id === id);
      if (index >= 0) return { list: rows, index, item: rows[index], parent: section };
    }
  }

  if (kind === 'column') {
    for (const section of draft.sections || []) {
      for (const row of section.rows || []) {
        const columns = Array.isArray(row.columns) ? row.columns : [];
        const index = columns.findIndex((column) => column.id === id);
        if (index >= 0) return { list: columns, index, item: columns[index], parent: row };
      }
    }
  }

  return null;
}

function findParentRowOfColumn(id) {
  const parent = findStructureParent('column', id);
  return parent ? { row: parent.parent, index: parent.index } : null;
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
    if (page?.id && page.id !== pageId) {
      pageId = page.id;
      window.history.replaceState({}, '', `/admin/editor.html?page=${encodeURIComponent(pageId)}`);
    }
    draft = normalizePageJson(page.draft_json);
    pageTitle.textContent = page.title;
    pageMeta.textContent = `/${page.slug}`;
    renderPageSettingsPanel();
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
  applyTransientAlignment();
  if (updateProperties) renderProperties();
}

function renderProperties() {
  if (!selected) {
    propertiesPanel.innerHTML = '<p class="editor-muted">Selecione uma secao, linha, coluna ou bloco.</p>';
    if (document.querySelector('.editor-sidebar').dataset.activePanel === 'element') showSidebarPanel('components');
    return;
  }

  if (selected.kind === 'page') {
    selected = null;
    renderProperties();
    return;
  }

  const found = findEntity(selected.id);
  if (!found?.entity) {
    selected = null;
    renderProperties();
    return;
  }

  showSidebarPanel('element');
  elementPanelTitle.textContent = found.kind === 'block' ? blockLabelTitle(found.entity) : labelForKind(found.kind);

  if (found.kind !== 'block') {
    if (found.kind === 'section') {
      const section = found.entity;
      propertiesPanel.innerHTML = `
        ${backgroundControls(section)}
        ${paddingControls(section.padding)}
        ${elementData(section, 'dynamic-section')}
        ${deleteAction('secao')}
      `;
      return;
    }

    if (found.kind === 'column') {
      propertiesPanel.innerHTML = `
        ${backgroundControls(found.entity)}
        ${paddingControls(found.entity.padding, 'Espacamento')}
        ${elementData(found.entity, 'dynamic-column')}
        ${deleteAction('coluna')}
      `;
      return;
    }

    if (found.kind === 'row') {
      propertiesPanel.innerHTML = `
        ${backgroundControls(found.entity)}
        ${elementData(found.entity, 'dynamic-row')}
        ${deleteAction('linha')}
      `;
      return;
    }

    propertiesPanel.innerHTML = `
      <p class="editor-muted">${labelForKind(found.kind)} selecionado.</p>
      ${deleteAction(labelForKind(found.kind).toLowerCase())}
    `;
    return;
  }

  const block = found.entity;
  const responsivePanel = renderResponsivePanel(block);
  if (block.type === 'text') {
    propertiesPanel.innerHTML = `
      ${responsivePanel}
      <p class="editor-muted">Edite o conteudo diretamente no canvas.</p>
      ${colorField('Cor', 'color', block.color || '', '#1f2937')}
      <label><span>Tamanho da fonte</span><input data-field="fontSize" value="${escapeHtml(block.fontSize || '')}" placeholder="18px"></label>
      <label><span>Alinhamento</span>${alignSelect(block.align)}</label>
      ${deleteAction('texto')}
    `;
    return;
  }

  if (block.type === 'button') {
    propertiesPanel.innerHTML = `
      ${responsivePanel}
      <label><span>Texto</span><input data-field="label" value="${escapeHtml(block.label || '')}"></label>
      <label><span>Link</span><input data-field="href" value="${escapeHtml(block.href || '')}" placeholder="https://..."></label>
      ${colorField('Cor', 'color', block.color || '', '#f4770b')}
      <label><span>Tamanho da fonte</span><input data-field="fontSize" value="${escapeHtml(block.fontSize || '')}" placeholder="16px"></label>
      <label><span>Alinhamento</span>${alignSelect(block.align)}</label>
      ${deleteAction('botao')}
    `;
    return;
  }

  if (block.type === 'container') {
    propertiesPanel.innerHTML = `
      ${responsivePanel}
      ${backgroundControls(block)}
      <label><span>Borda</span><input data-field="border" value="${escapeHtml(block.border || '')}" placeholder="1px solid #d9e2ec"></label>
      <label><span>Raio da borda</span><input data-field="radius" value="${escapeHtml(block.radius || '')}" placeholder="12px"></label>
      ${paddingControls(block.padding)}
      ${elementData(block, 'dynamic-container')}
      ${deleteAction('container')}
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
      ${deleteAction('imagem')}
    `;
    return;
  }

  if (block.type === 'video') {
    propertiesPanel.innerHTML = `
      ${responsivePanel}
      <label><span>URL do video</span><input data-field="url" value="${escapeHtml(block.url || '')}" placeholder="YouTube, Vimeo ou arquivo"></label>
      <label class="editor-check"><input type="checkbox" data-field="controls" ${block.controls === false ? '' : 'checked'}> <span>Mostrar controles</span></label>
      <label class="editor-check"><input type="checkbox" data-field="autoplay" ${block.autoplay ? 'checked' : ''}> <span>Autoplay</span></label>
      ${deleteAction('video')}
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
      ${colorField('Cor', 'color', block.color || '', '#004477')}
      <label><span>Tamanho</span><input data-field="size" value="${escapeHtml(block.size || '')}" placeholder="18px"></label>
      ${deleteAction('redes sociais')}
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
      ${deleteAction('menu')}
    `;
    return;
  }

  if (block.type === 'html') {
    propertiesPanel.innerHTML = `
      ${responsivePanel}
      <label><span>Codigo HTML</span><textarea data-field="code">${escapeHtml(block.code || '')}</textarea></label>
      <label><span>Altura</span><input data-field="height" value="${escapeHtml(block.height || '')}" placeholder="180px"></label>
      ${deleteAction('html')}
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

function deleteSelectedEntity() {
  if (!selected?.id) return;
  const found = findEntity(selected.id);
  if (!found?.entity) return;
  const label = labelForKind(found.kind).toLowerCase();
  const detail = found.kind === 'block' ? blockLabel(found.entity) : label;

  if (!window.confirm(`Excluir ${detail}? Esta acao nao pode ser desfeita depois de salvar.`)) return;

  applyChange(() => {
    removeEntity(selected.id, found.kind);
    selected = null;
  });
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

function removeEntity(id, kind) {
  if (kind === 'section') {
    const index = draft.sections.findIndex((section) => section.id === id);
    if (index >= 0) draft.sections.splice(index, 1);
    return;
  }

  if (kind === 'row') {
    for (const section of draft.sections) {
      const rows = Array.isArray(section.rows) ? section.rows : [];
      const index = rows.findIndex((row) => row.id === id);
      if (index >= 0) {
        rows.splice(index, 1);
        return;
      }
    }
    return;
  }

  if (kind === 'column') {
    for (const section of draft.sections) {
      for (const row of section.rows || []) {
        const columns = Array.isArray(row.columns) ? row.columns : [];
        const index = columns.findIndex((column) => column.id === id);
        if (index >= 0) {
          columns.splice(index, 1);
          return;
        }
      }
    }
    return;
  }

  if (kind === 'block') {
    removeBlock(id);
  }
}

function newSection() {
  return {
    id: uid('section'),
    background: '',
    padding: { top: 56, bottom: 56, left: 20, right: 20 },
    rows: []
  };
}

function newRow(widths = [1]) {
  return {
    id: uid('row'),
    columns: widths.map((width) => newColumn(width))
  };
}

function newColumn(width = 1) {
  return {
    id: uid('column'),
    widthFraction: width,
    blocks: []
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

function nearestSection(event) {
  const element = event.target.closest('[data-editor-kind="section"]');
  return element ? findEntity(element.dataset.editorId)?.entity : null;
}

function nearestRow(event) {
  const element = event.target.closest('[data-editor-kind="row"]');
  return element ? findEntity(element.dataset.editorId)?.entity : null;
}

function ensureLastSection() {
  draft.sections = Array.isArray(draft.sections) ? draft.sections : [];
  if (!draft.sections.length) draft.sections.push(newSection());
  return draft.sections[draft.sections.length - 1];
}

function ensureLastRow() {
  const section = ensureLastSection();
  section.rows = Array.isArray(section.rows) ? section.rows : [];
  if (!section.rows.length) section.rows.push(newRow([1]));
  return section.rows[section.rows.length - 1];
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

function paddingControls(value, title = 'Padding (px)') {
  const padding = paddingObject(value);
  return `
    <fieldset class="editor-fieldset">
      <legend>${escapeHtml(title)}</legend>
      <div class="editor-padding-grid">
        <label><span>Topo</span><input type="number" min="0" step="1" data-field="padding.top" data-number-field value="${padding.top}"></label>
        <label><span>Base</span><input type="number" min="0" step="1" data-field="padding.bottom" data-number-field value="${padding.bottom}"></label>
        <label><span>Esquerda</span><input type="number" min="0" step="1" data-field="padding.left" data-number-field value="${padding.left}"></label>
        <label><span>Direita</span><input type="number" min="0" step="1" data-field="padding.right" data-number-field value="${padding.right}"></label>
      </div>
    </fieldset>
  `;
}

function colorField(label, field, value, placeholder = '#000000') {
  const normalized = normalizeHexColor(value) || normalizeHexColor(placeholder) || '#000000';
  return `
    <label class="editor-color-field">
      <span>${escapeHtml(label)} <button type="button" data-clear-color-field="${escapeHtml(field)}" aria-label="Limpar cor">x</button></span>
      <div class="editor-color-control">
        <button type="button" class="editor-color-swatch" data-open-color-field="${escapeHtml(field)}" style="--color-swatch:${escapeHtml(normalized)}" aria-label="Abrir configuracao de cor"></button>
        <input data-field="${escapeHtml(field)}" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(placeholder)}">
      </div>
    </label>
  `;
}

function backgroundControls(entity) {
  const hasBackground = Boolean(entity.background);
  const colorOpacity = opacityPercent(entity.backgroundOpacity, 100);
  const imageOpacity = opacityPercent(entity.backgroundImageOpacity, 100);
  return `
    <fieldset class="editor-fieldset">
      <legend>Estilos de fundo</legend>
      <label><span>Tipo</span>
        <select data-field="backgroundMode">
          <option value="transparent"${hasBackground ? '' : ' selected'}>Transparente</option>
          <option value="color"${hasBackground ? ' selected' : ''}>Cor solida</option>
        </select>
      </label>
      ${colorField('Cor', 'background', entity.background || '', '#ffffff')}
      <label><span>Opacidade</span><input type="range" min="0" max="100" step="1" data-field="backgroundOpacity" data-number-field value="${colorOpacity}"></label>
      <label><span>Imagem de fundo</span><input data-field="backgroundImage" value="${escapeHtml(entity.backgroundImage || '')}" placeholder="https://..."></label>
      <div class="editor-background-position">
        <span>Alinhamento da imagem</span>
        <div class="editor-position-grid">
          ${backgroundPositionOptions(entity.backgroundImagePosition)}
        </div>
      </div>
      <label><span>Opacidade da imagem</span><input type="range" min="0" max="100" step="1" data-field="backgroundImageOpacity" data-number-field value="${imageOpacity}"></label>
    </fieldset>
  `;
}

function backgroundPositionOptions(value = 'center center') {
  const options = [
    ['left top', 'Topo esquerda'],
    ['center top', 'Topo centro'],
    ['right top', 'Topo direita'],
    ['left center', 'Centro esquerda'],
    ['center center', 'Centro'],
    ['right center', 'Centro direita'],
    ['left bottom', 'Base esquerda'],
    ['center bottom', 'Base centro'],
    ['right bottom', 'Base direita']
  ];
  return options.map(([position, label]) => `
    <label title="${escapeHtml(label)}">
      <input type="radio" name="background-position-${escapeHtml(selected?.id || 'item')}" data-field="backgroundImagePosition" value="${escapeHtml(position)}" ${position === value ? 'checked' : ''}>
      <span aria-hidden="true"></span>
    </label>
  `).join('');
}

function opacityPercent(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.max(0, Math.min(100, number > 1 ? number : number * 100)));
}

function openColorPopover(button) {
  activeColorField = button.dataset.openColorField || '';
  const input = propertiesPanel.querySelector(`[data-field="${cssEscape(activeColorField)}"]`);
  const value = normalizeHexColor(input?.value) || '#000000';
  syncColorPopover(value);
  renderUsedColors(value);
  colorPopover.hidden = false;
  const rect = button.closest('.editor-color-control')?.getBoundingClientRect() || button.getBoundingClientRect();
  colorPopover.style.left = `${Math.max(12, rect.left + window.scrollX)}px`;
  colorPopover.style.top = `${Math.max(12, rect.bottom + window.scrollY + 8)}px`;
}

function hideColorPopover() {
  colorPopover.hidden = true;
  activeColorField = '';
}

function syncColorPopover(value) {
  const color = normalizeHexColor(value) || '#000000';
  const picker = colorPopover.querySelector('[data-color-picker]');
  const hex = colorPopover.querySelector('[data-color-hex]');
  if (picker) picker.value = color;
  if (hex) hex.value = color.toUpperCase();
}

function updateColorValue(field, value) {
  if (!field || !selected) return;
  pushEditHistory();
  const found = findEntity(selected.id);
  if (!found?.entity) return;
  setFieldValue(found.entity, field, value);
  const input = propertiesPanel.querySelector(`[data-field="${cssEscape(field)}"]`);
  if (input) input.value = value;
  const swatch = propertiesPanel.querySelector(`[data-open-color-field="${cssEscape(field)}"]`);
  if (swatch) swatch.style.setProperty('--color-swatch', normalizeHexColor(value) || '#ffffff');
  render(false);
  scheduleSave();
}

function renderUsedColors(current) {
  const colors = [...new Set(collectUsedColors(draft))].slice(0, 12);
  const wrap = colorPopover.querySelector('[data-used-colors]');
  if (!wrap) return;
  wrap.innerHTML = colors.map((color) => `<button type="button" data-used-color="${escapeHtml(color)}" style="--color-swatch:${escapeHtml(color)}" aria-label="Usar cor ${escapeHtml(color)}"${color === current ? ' class="active"' : ''}></button>`).join('');
}

function collectUsedColors(value, found = []) {
  if (!value || typeof value !== 'object') return found;
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'background' || key === 'color') && normalizeHexColor(item)) found.push(normalizeHexColor(item));
    if (item && typeof item === 'object') collectUsedColors(item, found);
  }
  return found;
}

function normalizeHexColor(value) {
  const text = String(value || '').trim();
  const match = text.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return '';
  const hex = match[1];
  if (hex.length === 3) return `#${hex.split('').map((item) => item + item).join('')}`.toLowerCase();
  return `#${hex}`.toLowerCase();
}

function elementData(entity, className) {
  return `
    <fieldset class="editor-fieldset editor-element-data">
      <legend>Dados do elemento</legend>
      <p><span>ID:</span> <code>#${escapeHtml(entity.id || '')}</code></p>
      <p><span>Class:</span> <code>.${escapeHtml(className || '')}</code></p>
    </fieldset>
  `;
}

function deleteAction(label) {
  return `
    <div class="editor-danger-zone">
      <button class="secondary danger" type="button" data-delete-selected>Excluir ${escapeHtml(label)}</button>
    </div>
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

function blockLabelTitle(block) {
  const title = blockLabel(block);
  return title ? title.charAt(0).toUpperCase() + title.slice(1) : 'Bloco';
}

function blockLabel(block) {
  const labels = {
    button: 'botao',
    container: 'container',
    html: 'html',
    image: 'imagem',
    menu: 'menu',
    social: 'redes sociais',
    text: 'texto',
    video: 'video'
  };
  return labels[block?.type] || 'bloco';
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cloneWithNewIds(value) {
  const copy = clone(value);
  refreshIds(copy);
  return copy;
}

function refreshIds(entity) {
  if (!entity || typeof entity !== 'object') return;

  if (entity.id) {
    const prefix = String(entity.id).split('_')[0] || 'item';
    entity.id = uid(prefix);
  }

  for (const row of entity.rows || []) refreshIds(row);
  for (const column of entity.columns || []) refreshIds(column);
  for (const block of entity.blocks || []) refreshIds(block);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function columnFraction(column) {
  const value = Number(column?.widthFraction);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function roundToStep(value, step) {
  return Number((Math.round(value / step) * step).toFixed(2));
}

function clampFraction(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateColumnFlex(id, widthFraction) {
  const element = canvas.querySelector(`[data-editor-id="${cssEscape(id)}"]`);
  if (!element) return;
  element.style.setProperty('--column-width', `${widthFraction} ${widthFraction} 0`);
  element.style.flex = `${widthFraction} ${widthFraction} 0`;
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value || '').replace(/["\\]/g, '\\$&');
}
