export const dynamicPageStyles = `
  .dynamic-page { color: #1f2937; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .dynamic-section { background: var(--section-bg, transparent); padding: var(--section-padding, 56px 20px); position: relative; }
  .dynamic-row { display: flex; gap: 24px; margin: 0 auto; max-width: var(--page-width, 1120px); position: relative; width: 100%; }
  .dynamic-column { background: var(--column-bg, transparent); flex: var(--column-width, 1 1 0); min-width: 0; padding: var(--column-padding, 0); position: relative; }
  .dynamic-text { color: var(--block-color, inherit); font-size: var(--block-font-size, inherit); line-height: 1.65; margin: 0 0 18px; text-align: var(--block-align, left); }
  .dynamic-button-wrap { margin: 0 0 18px; text-align: var(--block-align, left); }
  .dynamic-button { background: var(--button-bg, #f4770b); border-radius: 8px; color: #fff; display: inline-flex; font-size: var(--block-font-size, inherit); font-weight: 700; padding: 12px 18px; text-decoration: none; }
  .dynamic-container { background: var(--container-bg, transparent); border: var(--container-border, 0 solid transparent); border-radius: var(--container-radius, 0); margin: 0 0 18px; padding: var(--container-padding, 20px); }
  .dynamic-image-wrap { margin: 0 0 18px; text-align: var(--block-align, left); }
  .dynamic-image { border-radius: var(--image-radius, 0); display: inline-block; height: auto; max-width: 100%; width: var(--image-width, auto); }
  .dynamic-image-placeholder { align-items: center; background: #f8fafc; border: 1px dashed #d9e2ec; border-radius: var(--image-radius, 8px); color: #64748b; display: inline-flex; flex-direction: column; font-weight: 700; gap: 8px; justify-content: center; min-height: 180px; padding: 28px; width: min(100%, var(--image-width, 100%)); }
  .dynamic-image-placeholder::before { content: ""; border: 2px solid currentColor; border-radius: 6px; display: block; height: 32px; opacity: 0.75; width: 42px; }
  .dynamic-video { margin: 0 0 18px; }
  .dynamic-video-frame { aspect-ratio: 16 / 9; background: #000; border: 0; border-radius: 8px; display: block; width: 100%; }
  .dynamic-video video { border-radius: 8px; display: block; width: 100%; }
  .dynamic-social { align-items: center; display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 18px; }
  .dynamic-social a { align-items: center; border: 1px solid currentColor; border-radius: 999px; color: var(--social-color, #004477); display: inline-flex; font-size: var(--social-size, 18px); height: calc(var(--social-size, 18px) * 2); justify-content: center; text-decoration: none; width: calc(var(--social-size, 18px) * 2); }
  .dynamic-menu { align-items: center; display: flex; flex-wrap: wrap; gap: 18px; margin: 0 0 18px; }
  .dynamic-menu a { color: #004477; font-weight: 700; text-decoration: none; }
  .dynamic-menu.hamburger { align-items: stretch; flex-direction: column; gap: 8px; }
  .dynamic-html { border: 0; display: block; margin: 0 0 18px; min-height: var(--html-height, 180px); width: 100%; }
  @media (max-width: 760px) { .dynamic-row { flex-direction: column; } }
`;

export function renderPageContent(pageJson, options = {}) {
  const sections = Array.isArray(pageJson?.sections) ? pageJson.sections : [];
  const editable = Boolean(options.editable);
  const selectedId = options.selectedId || '';
  const beforeFirst = editable ? renderAddSectionButton(0) : '';
  const content = sections.map((section, index) => `${renderSection(section, { ...options, editable, selectedId })}${editable ? renderAddSectionButton(index + 1) : ''}`).join('');
  return `${beforeFirst}${content || (editable ? '<div class="editor-empty-canvas">Adicione uma secao para comecar.</div>' : '')}`;
}

export function pageStyle(pageJson = {}) {
  const width = cleanCssValue(pageJson.pageWidth || '');
  if (!width || width === 'full-width') return '--page-width:none';
  return `--page-width:${width}`;
}

export function renderResponsiveStyles(pageJson = {}) {
  return [
    responsiveCssForBreakpoint(pageJson, 'tablet', '(max-width: 1024px)'),
    responsiveCssForBreakpoint(pageJson, 'mobile', '(max-width: 760px)')
  ].filter(Boolean).join('\n');
}

function renderSection(section, options) {
  const background = cleanCssValue(section?.background);
  const padding = paddingCss(section?.padding);
  const style = [
    background ? `--section-bg:${background}` : '',
    padding ? `--section-padding:${padding}` : ''
  ].filter(Boolean).join(';');
  const rows = Array.isArray(section?.rows) ? section.rows : [];
  const attrs = editableAttrs('section', section?.id, options);
  const addRow = options.editable ? `<button class="editor-inline-add" type="button" data-add-row="${escapeHtml(section?.id || '')}">+ Adicionar linha</button>` : '';
  return `<section class="dynamic-section${selectedClass(section?.id, options)}"${attrs}${style ? ` style="${escapeHtml(style)}"` : ''}>${rows.map((row) => renderRow(row, options)).join('')}${addRow}</section>`;
}

function renderRow(row, options) {
  const columns = Array.isArray(row?.columns) ? row.columns : [];
  const attrs = editableAttrs('row', row?.id, options);
  const chrome = options.editable ? renderStructureToolbar('row', row?.id) : '';
  return `<div class="dynamic-row${selectedClass(row?.id, options)}"${attrs}>${chrome}${columns.map((column, index) => renderColumn(column, options, row, columns[index + 1])).join('')}</div>`;
}

function renderColumn(column, options, row, nextColumn) {
  const width = Number(column?.widthFraction);
  const flex = Number.isFinite(width) && width > 0 ? `${width} ${width} 0` : '';
  const background = column?.background || '';
  const padding = paddingCss(column?.padding);
  const blocks = Array.isArray(column?.blocks) ? column.blocks : [];
  const style = [
    flex ? `--column-width:${flex}` : '',
    background ? `--column-bg:${background}` : '',
    padding ? `--column-padding:${padding}` : ''
  ].filter(Boolean).join(';');
  const attrs = editableAttrs('column', column?.id, options, ` data-drop-column="${escapeHtml(column?.id || '')}"`);
  const chrome = options.editable ? renderStructureToolbar('column', column?.id) : '';
  const resizeHandle = options.editable && nextColumn ? renderColumnResizeHandle(row?.id, column?.id, nextColumn?.id) : '';
  return `<div class="dynamic-column${selectedClass(column?.id, options)}"${attrs}${style ? ` style="${escapeHtml(style)}"` : ''}>${chrome}${blocks.map((block) => renderBlock(block, options)).join('')}${resizeHandle}${options.editable ? '<div class="editor-drop-hint">Solte blocos aqui</div>' : ''}</div>`;
}

function renderBlock(block, options) {
  const effective = effectiveBlock(block, options.breakpoint);
  const dragAttrs = ` data-block-id="${escapeHtml(block?.id || '')}" draggable="${options.editable ? 'true' : 'false'}"`;
  if (effective.hidden) return options.editable ? `<div class="editor-hidden-block${selectedClass(block?.id, options)}"${editableAttrs('block', block?.id, options, dragAttrs)}>Oculto neste breakpoint</div>` : '';
  if (effective?.type === 'text') return renderTextBlock(effective, options);
  if (effective?.type === 'button') return renderButtonBlock(effective, options);
  if (effective?.type === 'container') return renderContainerBlock(effective, options);
  if (effective?.type === 'image') return renderImageBlock(effective, options);
  if (effective?.type === 'video') return renderVideoBlock(effective, options);
  if (effective?.type === 'social') return renderSocialBlock(effective, options);
  if (effective?.type === 'menu') return renderMenuBlock(effective, options);
  if (effective?.type === 'html') return renderHtmlBlock(effective, options);
  return '';
}

function renderTextBlock(block, options) {
  const text = block.html || block.content || block.text || '';
  const tag = ['h1', 'h2', 'h3', 'p'].includes(block.tag) ? block.tag : 'p';
  const style = blockStyle(block);
  const editAttrs = options.editable ? ' contenteditable="true" spellcheck="true" data-inline-text="true"' : '';
  const attrs = editableAttrs('block', block?.id, options, ` data-block-id="${escapeHtml(block?.id || '')}" draggable="false"${editAttrs}`);
  return `<${tag} class="dynamic-text${selectedClass(block?.id, options)}"${attrs}${style ? ` style="${escapeHtml(style)}"` : ''}>${sanitizeRichText(text)}</${tag}>`;
}

function renderButtonBlock(block, options) {
  const label = block.label || block.text || 'Saiba mais';
  const href = safeHref(block.href || block.url || '#');
  const style = blockStyle(block, { button: true });
  const attrs = editableAttrs('block', block?.id, options, ` data-block-id="${escapeHtml(block?.id || '')}" draggable="${options.editable ? 'true' : 'false'}"`);
  return `<div class="dynamic-button-wrap${selectedClass(block?.id, options)}"${attrs}${style ? ` style="${escapeHtml(style)}"` : ''}><a class="dynamic-button" href="${escapeHtml(href)}">${escapeHtml(label)}</a></div>`;
}

function renderContainerBlock(block, options) {
  const children = Array.isArray(block.blocks) ? block.blocks : [];
  const padding = paddingCss(block.padding);
  const style = [
    cleanCssValue(block.background) ? `--container-bg:${cleanCssValue(block.background)}` : '',
    cleanCssValue(block.border) ? `--container-border:${cleanCssValue(block.border)}` : '',
    cleanCssValue(block.radius) ? `--container-radius:${cleanCssValue(block.radius)}` : '',
    padding ? `--container-padding:${padding}` : ''
  ].filter(Boolean).join(';');
  const attrs = editableAttrs('block', block?.id, options, ` data-block-id="${escapeHtml(block?.id || '')}" data-drop-container="${escapeHtml(block?.id || '')}" draggable="${options.editable ? 'true' : 'false'}"`);
  return `<div class="dynamic-container${selectedClass(block?.id, options)}"${attrs}${style ? ` style="${escapeHtml(style)}"` : ''}>${children.map((child) => renderBlock(child, options)).join('')}${options.editable ? '<div class="editor-drop-hint">Solte blocos no container</div>' : ''}</div>`;
}

function renderImageBlock(block, options) {
  const rawUrl = String(block.url || '').trim();
  const url = rawUrl ? safeHref(rawUrl) : '';
  const alt = block.alt || '';
  const width = cleanCssValue(block.width || '');
  const radius = cleanCssValue(block.radius || '');
  const align = ['left', 'center', 'right'].includes(block.align) ? block.align : '';
  const style = [
    width ? `--image-width:${width}` : '',
    radius ? `--image-radius:${radius}` : '',
    align ? `--block-align:${align}` : ''
  ].filter(Boolean).join(';');
  const attrs = editableAttrs('block', block?.id, options, ` data-block-id="${escapeHtml(block?.id || '')}" draggable="${options.editable ? 'true' : 'false'}"`);
  const image = url ? `<img class="dynamic-image" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">` : '<span class="dynamic-image-placeholder">Imagem</span>';
  const wrapped = block.href ? `<a href="${escapeHtml(safeHref(block.href))}">${image}</a>` : image;
  return `<div class="dynamic-image-wrap${selectedClass(block?.id, options)}"${attrs}${style ? ` style="${escapeHtml(style)}"` : ''}>${wrapped}</div>`;
}

function renderVideoBlock(block, options) {
  const embed = videoEmbed(block.url || '', block);
  const attrs = editableAttrs('block', block?.id, options, ` data-block-id="${escapeHtml(block?.id || '')}" draggable="${options.editable ? 'true' : 'false'}"`);
  const controls = block.controls === false ? '' : ' controls';
  const autoplay = block.autoplay ? ' autoplay muted playsinline' : '';
  let html = '<div class="dynamic-video-placeholder">Video</div>';
  if (embed.type === 'iframe') html = `<iframe class="dynamic-video-frame" src="${escapeHtml(embed.src)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
  if (embed.type === 'file') html = `<video src="${escapeHtml(embed.src)}"${controls}${autoplay}></video>`;
  return `<div class="dynamic-video${selectedClass(block?.id, options)}"${attrs}>${html}</div>`;
}

function renderSocialBlock(block, options) {
  const links = block.links || {};
  const style = [
    cleanCssValue(block.color) ? `--social-color:${cleanCssValue(block.color)}` : '',
    cleanCssValue(block.size) ? `--social-size:${cleanCssValue(block.size)}` : ''
  ].filter(Boolean).join(';');
  const attrs = editableAttrs('block', block?.id, options, ` data-block-id="${escapeHtml(block?.id || '')}" draggable="${options.editable ? 'true' : 'false'}"`);
  const items = ['instagram', 'facebook', 'whatsapp', 'linkedin']
    .filter((name) => links[name])
    .map((name) => `<a href="${escapeHtml(safeHref(links[name]))}" aria-label="${escapeHtml(socialLabel(name))}">${escapeHtml(socialIcon(name))}</a>`)
    .join('');
  return `<div class="dynamic-social${selectedClass(block?.id, options)}"${attrs}${style ? ` style="${escapeHtml(style)}"` : ''}>${items || (options.editable ? '<span class="editor-muted">Redes sociais</span>' : '')}</div>`;
}

function renderMenuBlock(block, options) {
  const pages = Array.isArray(options.menuPages) ? options.menuPages : [];
  const hidden = new Set(Array.isArray(block.hiddenPageIds) ? block.hiddenPageIds : []);
  const order = Array.isArray(block.order) ? block.order : [];
  const ordered = [...pages].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai === -1 && bi === -1) return a.title.localeCompare(b.title);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  }).filter((page) => !hidden.has(page.id));
  const layout = block.layout === 'hamburger' ? 'hamburger' : 'horizontal';
  const attrs = editableAttrs('block', block?.id, options, ` data-block-id="${escapeHtml(block?.id || '')}" draggable="${options.editable ? 'true' : 'false'}"`);
  const links = ordered.map((page) => `<a href="/${escapeHtml(page.slug)}">${escapeHtml(page.title)}</a>`).join('');
  return `<nav class="dynamic-menu ${layout}${selectedClass(block?.id, options)}"${attrs}>${links || (options.editable ? '<span class="editor-muted">Menu sem paginas publicadas</span>' : '')}</nav>`;
}

function renderHtmlBlock(block, options) {
  const attrs = editableAttrs('block', block?.id, options, ` data-block-id="${escapeHtml(block?.id || '')}" draggable="${options.editable ? 'true' : 'false'}"`);
  const height = cleanCssValue(block.height || '180px');
  const style = height ? `--html-height:${height}` : '';
  return `<iframe class="dynamic-html${selectedClass(block?.id, options)}"${attrs}${style ? ` style="${escapeHtml(style)}"` : ''} sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox" srcdoc="${escapeHtml(block.code || '')}"></iframe>`;
}

function renderAddSectionButton(index) {
  return `<div class="editor-add-section"><button type="button" data-add-section="${index}">+ Adicionar secao</button></div>`;
}

function renderStructureToolbar(kind, id) {
  const safeKind = escapeHtml(kind);
  const safeId = escapeHtml(id || '');
  const label = kind === 'row' ? 'linha' : 'coluna';
  return `
    <div class="editor-structure-chrome" data-structure-chrome="${safeKind}" data-structure-id="${safeId}">
      <span class="editor-structure-label">${label}</span>
      <div class="editor-structure-toolbar" aria-label="Ferramentas de ${label}">
        <button type="button" data-structure-action="duplicate" data-structure-kind="${safeKind}" data-structure-id="${safeId}" title="Duplicar" aria-label="Duplicar">${toolbarIcon('duplicate')}</button>
        <button type="button" data-structure-action="align-top" data-structure-kind="${safeKind}" data-structure-id="${safeId}" title="Alinhar ao topo" aria-label="Alinhar ao topo">${toolbarIcon('align-top')}</button>
        <button type="button" data-structure-action="equalize" data-structure-kind="${safeKind}" data-structure-id="${safeId}" title="Redistribuir colunas" aria-label="Redistribuir colunas">${toolbarIcon('equalize')}</button>
        <button type="button" data-structure-action="align-bottom" data-structure-kind="${safeKind}" data-structure-id="${safeId}" title="Alinhar a base" aria-label="Alinhar a base">${toolbarIcon('align-bottom')}</button>
        <button type="button" data-structure-action="move-left" data-structure-kind="${safeKind}" data-structure-id="${safeId}" title="Mover coluna para a esquerda" aria-label="Mover coluna para a esquerda">${toolbarIcon('move-left')}</button>
        <button type="button" data-structure-action="move-right" data-structure-kind="${safeKind}" data-structure-id="${safeId}" title="Mover coluna para a direita" aria-label="Mover coluna para a direita">${toolbarIcon('move-right')}</button>
        <button type="button" data-structure-action="delete" data-structure-kind="${safeKind}" data-structure-id="${safeId}" title="Excluir" aria-label="Excluir">${toolbarIcon('delete')}</button>
      </div>
    </div>
  `;
}

function renderColumnResizeHandle(rowId, leftColumnId, rightColumnId) {
  return `<button class="editor-column-resize-handle" type="button" data-column-resize="true" data-row-id="${escapeHtml(rowId || '')}" data-left-column-id="${escapeHtml(leftColumnId || '')}" data-right-column-id="${escapeHtml(rightColumnId || '')}" title="Arraste para ajustar a largura das colunas" aria-label="Arraste para ajustar a largura das colunas"><span aria-hidden="true"></span></button>`;
}

function toolbarIcon(action) {
  const icons = {
    duplicate: '<path d="M8 8h10v10H8z"/><path d="M5 15V5h10"/>',
    'align-top': '<path d="M5 5h14"/><path d="M8 9h4v10H8z"/><path d="M16 9v10"/>',
    equalize: '<path d="M5 12h14"/><path d="M9 7v10"/><path d="M15 7v10"/>',
    'align-bottom': '<path d="M5 19h14"/><path d="M8 5h4v10H8z"/><path d="M16 5v10"/>',
    'move-left': '<path d="M12 5l-6 7 6 7"/><path d="M7 12h12"/>',
    'move-right': '<path d="M12 5l6 7-6 7"/><path d="M5 12h12"/>',
    delete: '<path d="M6 7h12"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M8 7l1 12h6l1-12"/><path d="M10 7V5h4v2"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[action] || ''}</svg>`;
}

function editableAttrs(kind, id, options, extra = '') {
  const renderId = id ? ` data-render-id="${escapeHtml(id)}"` : '';
  if (!options.editable) return renderId;
  return `${renderId} data-editor-kind="${kind}" data-editor-id="${escapeHtml(id || '')}"${extra}`;
}

function selectedClass(id, options) {
  return options.editable && id && id === options.selectedId ? ' is-selected' : '';
}

function blockStyle(block, options = {}) {
  const color = cleanCssValue(block?.color);
  const align = ['left', 'center', 'right'].includes(block?.align) ? block.align : '';
  const fontSize = cleanCssValue(block?.fontSize);
  const background = options.button ? cleanCssValue(block?.background || block?.color) : '';
  return [
    color && !options.button ? `--block-color:${color}` : '',
    align ? `--block-align:${align}` : '',
    fontSize ? `--block-font-size:${fontSize}` : '',
    background ? `--button-bg:${background}` : ''
  ].filter(Boolean).join(';');
}

function effectiveBlock(block, breakpoint) {
  if (!block || breakpoint === 'desktop') return block || {};
  const overrides = block.responsiveOverrides?.[breakpoint];
  if (!overrides || typeof overrides !== 'object') return block;
  return { ...block, ...overrides, responsiveOverrides: block.responsiveOverrides };
}

function responsiveCssForBreakpoint(pageJson, breakpoint, media) {
  const rules = [];
  walkBlocks(pageJson, (block) => {
    const overrides = block.responsiveOverrides?.[breakpoint];
    if (!overrides || typeof overrides !== 'object') return;
    const declarations = [];
    if (overrides.hidden) declarations.push('display:none !important');
    if (['left', 'center', 'right'].includes(overrides.align)) declarations.push(`--block-align:${overrides.align}`);
    if (cleanCssValue(overrides.fontSize)) declarations.push(`--block-font-size:${cleanCssValue(overrides.fontSize)}`);
    if (declarations.length) rules.push(`[data-render-id="${cssEscape(block.id)}"]{${declarations.join(';')}}`);
  });
  return rules.length ? `@media ${media}{${rules.join('')}}` : '';
}

function walkBlocks(pageJson, visitor) {
  for (const section of pageJson?.sections || []) {
    for (const row of section.rows || []) {
      for (const column of row.columns || []) {
        walkBlockList(column.blocks || [], visitor);
      }
    }
  }
}

function walkBlockList(blocks, visitor) {
  for (const block of blocks || []) {
    visitor(block);
    walkBlockList(block.blocks || [], visitor);
  }
}

function videoEmbed(url, block = {}) {
  const href = String(url || '').trim();
  if (!href) return { type: 'empty', src: '' };
  const youtube = href.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  const iframeParams = new URLSearchParams();
  if (block.controls === false) iframeParams.set('controls', '0');
  if (block.autoplay) {
    iframeParams.set('autoplay', '1');
    iframeParams.set('mute', '1');
  }
  const suffix = iframeParams.toString() ? `?${iframeParams.toString()}` : '';
  if (youtube) return { type: 'iframe', src: `https://www.youtube.com/embed/${youtube[1]}${suffix}` };
  const vimeo = href.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { type: 'iframe', src: `https://player.vimeo.com/video/${vimeo[1]}${suffix}` };
  return { type: 'file', src: safeHref(href) };
}

function socialLabel(name) {
  return { instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp', linkedin: 'LinkedIn' }[name] || name;
}

function socialIcon(name) {
  return { instagram: 'IG', facebook: 'f', whatsapp: 'WA', linkedin: 'in' }[name] || name.slice(0, 2).toUpperCase();
}

function paddingCss(value) {
  if (!value) return '';
  if (typeof value === 'string') return cleanCssValue(value);
  if (typeof value !== 'object') return '';
  const top = pixelValue(value.top);
  const right = pixelValue(value.right);
  const bottom = pixelValue(value.bottom);
  const left = pixelValue(value.left);
  return `${top} ${right} ${bottom} ${left}`;
}

function pixelValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0px';
  return `${Math.max(0, number)}px`;
}

function sanitizeRichText(value) {
  const html = String(value || '');
  const allowed = new Set(['a', 'b', 'br', 'div', 'em', 'h1', 'h2', 'h3', 'i', 'p', 'strong']);
  return html.replace(/<[^>]*>|[^<]+/g, (token) => {
    if (!token.startsWith('<')) return escapeHtml(token);

    const match = token.match(/^<\/?\s*([a-z0-9]+)([^>]*)>$/i);
    if (!match) return '';
    const tag = match[1].toLowerCase();
    if (!allowed.has(tag)) return '';
    if (token.startsWith('</')) return `</${tag}>`;
    if (tag === 'br') return '<br>';
    if (tag !== 'a') return `<${tag}>`;

    const hrefMatch = match[2].match(/\shref\s*=\s*(["'])(.*?)\1/i);
    const href = hrefMatch ? safeHref(hrefMatch[2]) : '#';
    return `<a href="${escapeHtml(href)}" rel="noopener">`;
  });
}

function cleanCssValue(value) {
  const text = String(value || '').trim();
  if (!text || /[<>{}]/.test(text)) return '';
  return text;
}

function safeHref(value) {
  const href = String(value || '').trim();
  if (!href || /^javascript:/i.test(href)) return '#';
  return href;
}

function cssEscape(value) {
  return String(value || '').replace(/["\\]/g, '\\$&');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
