import { siteSupabaseAdmin } from './siteSupabaseAdmin.js';
import { dynamicPageStyles, pageStyle, renderPageContent, renderResponsiveStyles } from '../public/admin/renderCore.js';

export async function renderPublishedPage(req, res, next) {
  const slug = cleanSlug(req.params.slug);

  if (!slug || req.path.includes('.')) {
    return next();
  }

  let page;
  let menuPages = [];
  let error;

  try {
    const [pageResult, menuResult] = await Promise.all([
      siteSupabaseAdmin
        .from('pages')
        .select('title,slug,published_json,seo_title,seo_description')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle(),
      siteSupabaseAdmin
        .from('pages')
        .select('id,title,slug')
        .eq('status', 'published')
        .order('title', { ascending: true })
    ]);
    page = pageResult.data;
    error = pageResult.error;
    if (menuResult.error) {
      console.error('[site-render] menu pages select error', menuResult.error.message);
    } else {
      menuPages = menuResult.data || [];
    }
  } catch (clientError) {
    console.error('[site-render] Supabase client error', clientError.message);
    return next();
  }

  if (error) {
    console.error('[site-render] pages select error', error.message);
    return next();
  }

  if (!page?.published_json) {
    return next();
  }

  return res.type('html').send(renderHtml(page, { menuPages }));
}

export async function renderAdminPreviewPage(req, res, next) {
  const pageId = String(req.params.id || '').trim();
  let page;
  let menuPages = [];

  try {
    const [pageResult, menuResult] = await Promise.all([
      siteSupabaseAdmin
        .from('pages')
        .select('title,slug,draft_json,seo_title,seo_description')
        .eq('id', pageId)
        .maybeSingle(),
      siteSupabaseAdmin
        .from('pages')
        .select('id,title,slug')
        .eq('status', 'published')
        .order('title', { ascending: true })
    ]);

    page = pageResult.data;
    if (pageResult.error) {
      console.error('[site-preview] pages select error', pageResult.error.message);
      return next();
    }
    if (menuResult.error) {
      console.error('[site-preview] menu pages select error', menuResult.error.message);
    } else {
      menuPages = menuResult.data || [];
    }
  } catch (clientError) {
    console.error('[site-preview] Supabase client error', clientError.message);
    return next();
  }

  if (!page?.draft_json) return next();
  return res.type('html').send(renderHtml({ ...page, published_json: page.draft_json }, { menuPages, noindex: true }));
}

function renderHtml(page, options = {}) {
  const title = page.seo_title || page.title || 'FacilImob';
  const description = page.seo_description || '';
  const pageJson = page.published_json || { sections: [] };

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    ${options.noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}
    <link rel="icon" type="image/png" href="/assets/favicon.png">
    <link rel="stylesheet" href="/css/site.css">
    <style>
      ${dynamicPageStyles}
      ${renderResponsiveStyles(pageJson)}
    </style>
  </head>
  <body>
    <main class="dynamic-page" style="${escapeHtml(pageStyle(pageJson))}">
      ${renderPageContent(pageJson, { menuPages: options.menuPages || [] })}
    </main>
  </body>
</html>`;
}

function cleanSlug(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
