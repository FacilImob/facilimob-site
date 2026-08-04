import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabaseAdmin.js';

const router = Router();
const MEDIA_BUCKET = 'site-media';
const ENTITIES = {
  pages: {
    table: 'site_pages',
    singular: 'pagina',
    order: { column: 'titulo', ascending: true },
    fields: ['slug', 'titulo', 'subtitulo', 'conteudo', 'missao', 'historia', 'diferenciais', 'banner_url', 'seo_titulo', 'seo_descricao', 'ativo']
  },
  posts: {
    table: 'site_blog_posts',
    singular: 'artigo',
    order: { column: 'atualizado_em', ascending: false },
    fields: ['titulo', 'slug', 'resumo', 'conteudo', 'categoria', 'autor', 'publicado_em', 'imagem_url', 'seo_titulo', 'seo_descricao', 'ativo']
  },
  testimonials: {
    table: 'site_testimonials',
    singular: 'depoimento',
    order: { column: 'ordem', ascending: true },
    fields: ['nome', 'tipo', 'texto', 'foto_url', 'ativo', 'ordem']
  },
  partners: {
    table: 'site_partners',
    singular: 'parceiro',
    order: { column: 'ordem', ascending: true },
    fields: ['nome', 'logo_url', 'site_url', 'ativo', 'ordem']
  }
};

router.use(requireAuth);

router.get('/dashboard', async (_req, res) => {
  const [settings, pages, posts, testimonials, partners, leads] = await Promise.all([
    single('site_settings'),
    count('site_pages'),
    count('site_blog_posts'),
    count('site_testimonials'),
    count('site_partners'),
    count('site_leads')
  ]);

  const error = [settings, pages, posts, testimonials, partners, leads].find((item) => item.error)?.error;
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    settings: settings.data,
    counts: {
      pages: pages.count || 0,
      posts: posts.count || 0,
      testimonials: testimonials.count || 0,
      partners: partners.count || 0,
      leads: leads.count || 0
    }
  });
});

router.get('/settings', async (_req, res) => {
  const { data, error } = await single('site_settings');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/settings', async (req, res) => {
  const fields = [
    'telefone',
    'whatsapp',
    'email',
    'endereco',
    'horario_atendimento',
    'instagram_url',
    'facebook_url',
    'linkedin_url',
    'logo_url',
    'favicon_url',
    'rodape_texto',
    'politica_privacidade',
    'cta_principal',
    'cta_secundario',
    'google_analytics_id',
    'meta_pixel_id',
    'crm_webhook_url',
    'blog_ativo',
    'depoimentos_ativo',
    'parceiros_ativo',
    'destinatarios_formularios'
  ];
  const payload = pick(req.body, fields);
  payload.atualizado_em = new Date().toISOString();
  payload.atualizado_por = req.user.id;

  const { data, error } = await supabaseAdmin.from('site_settings').update(payload).eq('id', 1).select('*').single();
  if (error) return res.status(500).json({ error: error.message });

  await logChange(req, 'configuracoes', '1', 'atualizar', 'Configuracoes gerais do site');
  res.json(data);
});

for (const [entity, config] of Object.entries(ENTITIES)) {
  router.get(`/${entity}`, async (_req, res) => {
    const { data, error } = await supabaseAdmin.from(config.table).select('*').order(config.order.column, { ascending: config.order.ascending });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  router.post(`/${entity}`, async (req, res) => {
    const payload = sanitizePayload(req.body, config.fields, req.user.id);
    const { data, error } = await supabaseAdmin.from(config.table).insert(payload).select('*').single();
    if (error) return res.status(400).json({ error: error.message });

    await logChange(req, config.singular, data.id, 'criar', data.titulo || data.nome || data.slug);
    res.status(201).json(data);
  });

  router.put(`/${entity}/:id`, async (req, res) => {
    const payload = sanitizePayload(req.body, config.fields, req.user.id);
    const { data, error } = await supabaseAdmin.from(config.table).update(payload).eq('id', req.params.id).select('*').single();
    if (error) return res.status(400).json({ error: error.message });

    await logChange(req, config.singular, data.id, 'atualizar', data.titulo || data.nome || data.slug);
    res.json(data);
  });

  router.delete(`/${entity}/:id`, async (req, res) => {
    const { error } = await supabaseAdmin.from(config.table).delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });

    await logChange(req, config.singular, req.params.id, 'excluir', `Exclusao de ${config.singular}`);
    res.json({ ok: true });
  });
}

router.get('/leads', async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('site_leads').select('*').order('criado_em', { ascending: false }).limit(500);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.get('/leads/export.csv', async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('site_leads').select('*').order('criado_em', { ascending: false }).limit(5000);
  if (error) return res.status(500).json({ error: error.message });

  const rows = [['Nome', 'E-mail', 'Telefone', 'Perfil', 'Mensagem', 'Origem', 'Criado em'], ...data.map((lead) => [
    lead.nome,
    lead.email,
    lead.telefone,
    lead.perfil,
    lead.mensagem,
    lead.origem,
    lead.criado_em
  ])];

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads-facilimob.csv"');
  res.send(`\uFEFF${rows.map((row) => row.map(csv).join(';')).join('\n')}`);
});

router.get('/logs', async (_req, res) => {
  const { data, error } = await supabaseAdmin.from('site_change_logs').select('*').order('criado_em', { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/uploads', async (req, res) => {
  const { fileName, contentType, dataUrl } = req.body || {};
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  const type = clean(contentType || match?.[1]);

  if (!fileName || !match || !type.startsWith('image/')) {
    return res.status(400).json({ error: 'Envie uma imagem valida.' });
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 4 * 1024 * 1024) {
    return res.status(400).json({ error: 'Imagem muito grande. Use arquivo de ate 4 MB.' });
  }

  const extension = extensionFrom(fileName, type);
  const storagePath = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${slugify(fileName).slice(0, 60)}.${extension}`;
  const { error } = await supabaseAdmin.storage.from(MEDIA_BUCKET).upload(storagePath, buffer, {
    contentType: type,
    upsert: false
  });

  if (error) return res.status(500).json({ error: error.message });

  const { data } = supabaseAdmin.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
  await logChange(req, 'midia', storagePath, 'upload', fileName);
  res.status(201).json({ url: data.publicUrl, path: storagePath });
});

async function single(table) {
  return supabaseAdmin.from(table).select('*').eq('id', 1).single();
}

async function count(table) {
  return supabaseAdmin.from(table).select('id', { count: 'exact', head: true });
}

function sanitizePayload(body, fields, userId) {
  const payload = pick(body, fields);
  if ('slug' in payload) payload.slug = slugify(payload.slug || payload.titulo || payload.nome);
  if ('ordem' in payload) payload.ordem = Number(payload.ordem || 0);
  if ('publicado_em' in payload && !payload.publicado_em) payload.publicado_em = null;
  payload.atualizado_em = new Date().toISOString();
  payload.atualizado_por = userId;
  return payload;
}

function pick(body = {}, fields) {
  return fields.reduce((payload, field) => {
    if (body[field] !== undefined) {
      payload[field] = typeof body[field] === 'boolean' ? body[field] : clean(body[field]);
    }
    return payload;
  }, {});
}

async function logChange(req, entidade, entidadeId, acao, resumo = '') {
  const email = req.user.email || '';
  await supabaseAdmin.from('site_change_logs').insert({
    usuario_id: req.user.id,
    usuario_email: email,
    entidade,
    entidade_id: String(entidadeId || ''),
    acao,
    resumo: clean(resumo).slice(0, 240)
  });
}

function clean(value) {
  return String(value ?? '').trim();
}

function slugify(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

function extensionFrom(fileName, type) {
  const extension = clean(fileName).split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(extension)) return extension;
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/svg+xml') return 'svg';
  return 'jpg';
}

function csv(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export default router;
