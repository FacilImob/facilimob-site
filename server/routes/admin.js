import { Router } from 'express';
import { sendLoginCodeEmail } from '../email.js';
import { siteSupabaseAdmin } from '../siteSupabaseAdmin.js';
import {
  createLoginCode,
  hashLoginCode,
  readAdminSessionCookie,
  renewAdminSessionCookie,
  setAdminSessionCookie,
} from '../siteAdminSession.js';

const router = Router();
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const MEDIA_BUCKET = 'site-media';

router.post('/auth/request-code', async (req, res) => {
  const email = normalizeEmail(req.body?.email);

  if (!email) {
    return res.status(400).json({ error: 'Informe o e-mail.' });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'E-mail nao autorizado para o painel.' });
  }

  const code = createLoginCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
  const { error: retireError } = await siteSupabaseAdmin.from('admin_login_codes').update({ used: true }).eq('email', email).eq('used', false);

  if (retireError) {
    console.error('[admin-auth:request-code] admin_login_codes retire error', retireError.message);
    return res.status(500).json({ error: 'Nao foi possivel gerar o codigo de acesso.' });
  }

  const { error: insertError } = await siteSupabaseAdmin.from('admin_login_codes').insert({
    email,
    user_id: user.id,
    code_hash: hashLoginCode(code),
    expires_at: expiresAt
  });

  if (insertError) {
    console.error('[admin-auth:request-code] admin_login_codes insert error', insertError.message);
    return res.status(500).json({ error: 'Nao foi possivel gerar o codigo de acesso.' });
  }

  try {
    await sendLoginCodeEmail({ to: email, code });
  } catch (error) {
    await siteSupabaseAdmin.from('admin_login_codes').update({ used: true, used_at: new Date().toISOString() }).eq('email', email).eq('code_hash', hashLoginCode(code));
    console.error('[admin-auth:request-code] SMTP send error', error.message);
    return res.status(500).json({ error: 'Nao foi possivel enviar o codigo por e-mail.' });
  }

  return res.json({ ok: true });
});

router.post('/auth/verify-code', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const token = String(req.body?.token || '').replace(/\D/g, '');

  if (!email || token.length !== 6) {
    return res.status(400).json({ error: 'Informe o codigo de 6 digitos.' });
  }

  const otp = await findLatestLoginCode(email);
  if (!otp || new Date(otp.expires_at) < new Date()) {
    if (otp) await markLoginCodeUsed(otp.id);
    return res.status(401).json({ error: 'Codigo invalido ou expirado.' });
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await markLoginCodeUsed(otp.id);
    return res.status(401).json({ error: 'Muitas tentativas com este codigo. Solicite um novo.' });
  }

  if (otp.code_hash !== hashLoginCode(token)) {
    await incrementLoginCodeAttempts(otp);
    return res.status(401).json({ error: 'Codigo invalido ou expirado.' });
  }

  const user = await findUserById(otp.user_id);
  if (!user || normalizeEmail(user.email) !== email) {
    await markLoginCodeUsed(otp.id);
    return res.status(401).json({ error: 'Usuario nao autorizado para o painel.' });
  }

  const sessionUser = formatUser(user);
  await markLoginCodeUsed(otp.id);
  setAdminSessionCookie(res, sessionUser);

  return res.json({ user: sessionUser });
});

router.use(requireSiteAdminSession);

router.get('/pages', async (_req, res) => {
  const { data, error } = await siteSupabaseAdmin
    .from('pages')
    .select('id,title,slug,is_home,status,seo_title,seo_description,created_at,updated_at,published_at,draft_json,published_json')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[admin-pages:list] pages select error', error.message);
    return res.status(500).json({ error: 'Nao foi possivel listar as paginas.' });
  }

  return res.json(data || []);
});

router.get('/pages/:id', async (req, res) => {
  const page = await findPageById(req.params.id);

  if (!page) {
    return res.status(404).json({ error: 'Pagina nao encontrada.' });
  }

  return res.json(page);
});

router.get('/menu-pages', async (_req, res) => {
  const { data, error } = await siteSupabaseAdmin
    .from('pages')
    .select('id,title,slug')
    .eq('status', 'published')
    .order('title', { ascending: true });

  if (error) {
    console.error('[admin-menu-pages:list] pages select error', error.message);
    return res.status(500).json({ error: 'Nao foi possivel listar as paginas publicadas.' });
  }

  return res.json(data || []);
});

router.post('/uploads', async (req, res) => {
  const { fileName, contentType, dataUrl } = req.body || {};
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  const type = clean(contentType || match?.[1]);

  if (!fileName || !match || !type.startsWith('image/')) {
    return res.status(400).json({ error: 'Envie uma imagem valida.' });
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: 'Imagem muito grande. Use arquivo de ate 5 MB.' });
  }

  const extension = imageExtension(fileName, type);
  const storagePath = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${slugify(fileName).slice(0, 60)}.${extension}`;
  const { error } = await siteSupabaseAdmin.storage.from(MEDIA_BUCKET).upload(storagePath, buffer, {
    contentType: type,
    upsert: false
  });

  if (error) {
    console.error('[admin-uploads:create] storage upload error', error.message);
    return res.status(500).json({ error: 'Nao foi possivel enviar a imagem.' });
  }

  const { data } = siteSupabaseAdmin.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
  return res.status(201).json({ url: data.publicUrl, path: storagePath });
});

router.post('/pages', async (req, res) => {
  const title = clean(req.body?.title);
  const slug = slugify(req.body?.slug || title);

  if (!title) {
    return res.status(400).json({ error: 'Informe o titulo da pagina.' });
  }

  if (!slug) {
    return res.status(400).json({ error: 'Informe um slug valido.' });
  }

  const { data, error } = await siteSupabaseAdmin
    .from('pages')
    .insert({
      title,
      slug,
      status: 'draft',
      draft_json: emptyPageJson(),
      seo_title: title,
      seo_description: ''
    })
    .select('id,title,slug,is_home,status,seo_title,seo_description,created_at,updated_at,published_at,draft_json,published_json')
    .single();

  if (error) {
    console.error('[admin-pages:create] pages insert error', error.message);
    return res.status(400).json({ error: pageErrorMessage(error) });
  }

  return res.status(201).json(data);
});

router.put('/pages/:id', async (req, res) => {
  const payload = {};

  if (req.body?.title !== undefined) {
    const title = clean(req.body.title);
    if (!title) return res.status(400).json({ error: 'Informe o titulo da pagina.' });
    payload.title = title;
  }

  if (req.body?.slug !== undefined) {
    const slug = slugify(req.body.slug);
    if (!slug) return res.status(400).json({ error: 'Informe um slug valido.' });
    payload.slug = slug;
  }

  if (req.body?.seo_title !== undefined) payload.seo_title = clean(req.body.seo_title);
  if (req.body?.seo_description !== undefined) payload.seo_description = clean(req.body.seo_description);
  if (req.body?.draft_json !== undefined) payload.draft_json = normalizePageJson(req.body.draft_json);

  if (!Object.keys(payload).length) {
    return res.status(400).json({ error: 'Nenhum campo enviado para atualizar.' });
  }

  const { data, error } = await siteSupabaseAdmin
    .from('pages')
    .update(payload)
    .eq('id', req.params.id)
    .select('id,title,slug,is_home,status,seo_title,seo_description,created_at,updated_at,published_at,draft_json,published_json')
    .single();

  if (error) {
    console.error('[admin-pages:update] pages update error', error.message);
    return res.status(400).json({ error: pageErrorMessage(error) });
  }

  return res.json(data);
});

router.delete('/pages/:id', async (req, res) => {
  const page = await findPageById(req.params.id);

  if (!page) {
    return res.status(404).json({ error: 'Pagina nao encontrada.' });
  }

  if (page.is_home) {
    return res.status(400).json({ error: 'Nao e possivel excluir a pagina home atual.' });
  }

  const { error } = await siteSupabaseAdmin.from('pages').delete().eq('id', req.params.id);

  if (error) {
    console.error('[admin-pages:delete] pages delete error', error.message);
    return res.status(500).json({ error: 'Nao foi possivel excluir a pagina.' });
  }

  return res.json({ ok: true });
});

router.post('/pages/:id/duplicate', async (req, res) => {
  const source = await findPageById(req.params.id);

  if (!source) {
    return res.status(404).json({ error: 'Pagina nao encontrada.' });
  }

  const title = clean(req.body?.title) || `${source.title} copia`;
  const baseSlug = slugify(req.body?.slug || title);
  const slug = await uniquePageSlug(baseSlug);

  const { data, error } = await siteSupabaseAdmin
    .from('pages')
    .insert({
      title,
      slug,
      is_home: false,
      status: 'draft',
      draft_json: normalizePageJson(source.draft_json),
      seo_title: source.seo_title || title,
      seo_description: source.seo_description || ''
    })
    .select('id,title,slug,is_home,status,seo_title,seo_description,created_at,updated_at,published_at,draft_json,published_json')
    .single();

  if (error) {
    console.error('[admin-pages:duplicate] pages insert error', error.message);
    return res.status(400).json({ error: pageErrorMessage(error) });
  }

  return res.status(201).json(data);
});

router.post('/pages/:id/set-home', async (req, res) => {
  const page = await findPageById(req.params.id);

  if (!page) {
    return res.status(404).json({ error: 'Pagina nao encontrada.' });
  }

  const { error: clearError } = await siteSupabaseAdmin.from('pages').update({ is_home: false }).eq('is_home', true);

  if (clearError) {
    console.error('[admin-pages:set-home] pages clear home error', clearError.message);
    return res.status(500).json({ error: 'Nao foi possivel alterar a pagina home.' });
  }

  const { data, error } = await siteSupabaseAdmin
    .from('pages')
    .update({ is_home: true })
    .eq('id', req.params.id)
    .select('id,title,slug,is_home,status,seo_title,seo_description,created_at,updated_at,published_at,draft_json,published_json')
    .single();

  if (error) {
    console.error('[admin-pages:set-home] pages set home error', error.message);
    return res.status(500).json({ error: 'Nao foi possivel definir a pagina home.' });
  }

  return res.json(data);
});

router.post('/pages/:id/publish', async (req, res) => {
  const page = await findPageById(req.params.id);

  if (!page) {
    return res.status(404).json({ error: 'Pagina nao encontrada.' });
  }

  const now = new Date().toISOString();
  const { data, error } = await siteSupabaseAdmin
    .from('pages')
    .update({
      published_json: normalizePageJson(page.draft_json),
      status: 'published',
      published_at: now
    })
    .eq('id', req.params.id)
    .select('id,title,slug,is_home,status,seo_title,seo_description,created_at,updated_at,published_at,draft_json,published_json')
    .single();

  if (error) {
    console.error('[admin-pages:publish] pages update error', error.message);
    return res.status(500).json({ error: 'Nao foi possivel publicar a pagina.' });
  }

  return res.json(data);
});

router.use((_req, res) => {
  return res.status(404).json({ error: 'Rota nao encontrada.' });
});

export function requireSiteAdminSession(req, res, next) {
  const user = readAdminSessionCookie(req);

  if (!user) {
    return res.status(401).json({ error: 'Sessao expirada.' });
  }

  req.siteAdminUser = user;
  renewAdminSessionCookie(res, user);
  return next();
}

async function findUserByEmail(emailToFind) {
  let page = 1;

  try {
    while (page <= 20) {
      const { data, error } = await siteSupabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 100
      });

      if (error) {
        console.error('[admin-auth:find-user] Supabase listUsers error', error.message);
        return null;
      }

      const user = data.users.find((item) => normalizeEmail(item.email) === emailToFind);
      if (user || data.users.length < 100) return user || null;
      page += 1;
    }
  } catch (error) {
    console.error('[admin-auth:find-user] Supabase client error', error.message);
    return null;
  }

  return null;
}

async function findUserById(userId) {
  let data;
  let error;

  try {
    ({ data, error } = await siteSupabaseAdmin.auth.admin.getUserById(userId));
  } catch (clientError) {
    console.error('[admin-auth:find-user-by-id] Supabase client error', clientError.message);
    return null;
  }

  if (error) {
    console.error('[admin-auth:find-user-by-id] Supabase getUserById error', error.message);
    return null;
  }

  return data?.user || null;
}

async function findLatestLoginCode(email) {
  const { data, error } = await siteSupabaseAdmin
    .from('admin_login_codes')
    .select('*')
    .eq('email', email)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[admin-auth:verify-code] admin_login_codes select error', error.message);
    return null;
  }

  return data;
}

async function incrementLoginCodeAttempts(otp) {
  const attempts = Number(otp.attempts || 0) + 1;
  const payload = attempts >= OTP_MAX_ATTEMPTS ? { attempts, used: true, used_at: new Date().toISOString() } : { attempts };
  const { error } = await siteSupabaseAdmin.from('admin_login_codes').update(payload).eq('id', otp.id);

  if (error) {
    console.error('[admin-auth:verify-code] admin_login_codes attempts update error', error.message);
  }
}

async function markLoginCodeUsed(id) {
  const { error } = await siteSupabaseAdmin.from('admin_login_codes').update({ used: true, used_at: new Date().toISOString() }).eq('id', id);

  if (error) {
    console.error('[admin-auth:verify-code] admin_login_codes used update error', error.message);
  }
}

async function findPageById(id) {
  const { data, error } = await siteSupabaseAdmin
    .from('pages')
    .select('id,title,slug,is_home,status,seo_title,seo_description,created_at,updated_at,published_at,draft_json,published_json')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[admin-pages:find] pages select error', error.message);
    return null;
  }

  return data;
}

async function uniquePageSlug(baseSlug) {
  const fallback = baseSlug || 'pagina';
  let candidate = fallback;
  let suffix = 2;

  while (suffix < 1000) {
    const { data, error } = await siteSupabaseAdmin.from('pages').select('id').eq('slug', candidate).maybeSingle();
    if (error) {
      console.error('[admin-pages:unique-slug] pages select error', error.message);
      return `${fallback}-${Date.now()}`;
    }
    if (!data) return candidate;
    candidate = `${fallback}-${suffix}`;
    suffix += 1;
  }

  return `${fallback}-${Date.now()}`;
}

function emptyPageJson() {
  return { sections: [] };
}

function normalizePageJson(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyPageJson();
  return { ...value, sections: Array.isArray(value.sections) ? value.sections : [] };
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
    .replace(/^-+|-+$/g, '');
}

function imageExtension(fileName, type) {
  const extension = clean(fileName).split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(extension)) return extension;
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/gif') return 'gif';
  if (type === 'image/svg+xml') return 'svg';
  return 'jpg';
}

function pageErrorMessage(error) {
  if (error.code === '23505' || error.message?.toLowerCase().includes('duplicate')) {
    return 'Ja existe uma pagina com este slug.';
  }

  return error.message || 'Nao foi possivel salvar a pagina.';
}

function formatUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name || user.user_metadata?.nome || user.app_metadata?.nome || user.email,
    role: user.app_metadata?.role === 'admin' ? 'admin' : 'editor'
  };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export default router;
