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
const STATIC_HOME_PAGE_ID = 'static-home';

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

  const pages = data || [];
  if (!pages.some((page) => page.is_home)) {
    pages.unshift(staticHomePageListItem());
  }

  return res.json(pages);
});

router.get('/pages/:id', async (req, res) => {
  const foundPage = req.params.id === STATIC_HOME_PAGE_ID ? null : await findPageById(req.params.id);
  const page = req.params.id === STATIC_HOME_PAGE_ID || foundPage?.is_home ? await ensureHomeDraftPage() : foundPage;

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

function staticHomePageListItem() {
  return {
    id: STATIC_HOME_PAGE_ID,
    title: 'Home atual',
    slug: '',
    is_home: true,
    status: 'static',
    seo_title: 'FacilImob | Garantia de Aluguel',
    seo_description: 'Garantia locaticia digital para alugar sem fiador, sem caucao e com processo simples.',
    created_at: null,
    updated_at: null,
    published_at: null,
    draft_json: emptyPageJson(),
    published_json: null,
    is_static_home: true
  };
}

async function ensureHomeDraftPage() {
  const { data: existing, error: findError } = await siteSupabaseAdmin
    .from('pages')
    .select('id,title,slug,is_home,status,seo_title,seo_description,created_at,updated_at,published_at,draft_json,published_json')
    .eq('is_home', true)
    .maybeSingle();

  if (findError) {
    console.error('[admin-pages:ensure-home] pages select error', findError.message);
    return null;
  }

  if (existing) {
    if (isEmptyPageJson(existing.draft_json)) {
      const seededDraft = isEmptyPageJson(existing.published_json) ? homePageJson() : normalizePageJson(existing.published_json);
      const { data, error } = await siteSupabaseAdmin
        .from('pages')
        .update({ draft_json: seededDraft, seo_title: existing.seo_title || 'FacilImob | Garantia de Aluguel', seo_description: existing.seo_description || 'Garantia locaticia digital para alugar sem fiador, sem caucao e com processo simples.' })
        .eq('id', existing.id)
        .select('id,title,slug,is_home,status,seo_title,seo_description,created_at,updated_at,published_at,draft_json,published_json')
        .single();

      if (error) {
        console.error('[admin-pages:ensure-home] pages seed update error', error.message);
        return existing;
      }

      return data;
    }

    return existing;
  }

  const slug = await uniquePageSlug('home');
  const { data, error } = await siteSupabaseAdmin
    .from('pages')
    .insert({
      title: 'Home atual',
      slug,
      is_home: true,
      status: 'draft',
      draft_json: homePageJson(),
      seo_title: 'FacilImob | Garantia de Aluguel',
      seo_description: 'Garantia locaticia digital para alugar sem fiador, sem caucao e com processo simples.'
    })
    .select('id,title,slug,is_home,status,seo_title,seo_description,created_at,updated_at,published_at,draft_json,published_json')
    .single();

  if (error) {
    console.error('[admin-pages:ensure-home] pages insert error', error.message);
    return null;
  }

  return data;
}

function normalizePageJson(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyPageJson();
  return { ...value, sections: Array.isArray(value.sections) ? value.sections : [] };
}

function isEmptyPageJson(value) {
  return !value || !Array.isArray(value.sections) || value.sections.length === 0;
}

function homePageJson() {
  return {
    pageWidth: '1180px',
    sections: [
      section('home_header', { padding: { top: 18, bottom: 18, left: 24, right: 24 }, background: '#ffffff' }, [
        row('home_header_row', [
          column('home_header_logo', 3, [image('home_logo', '/assets/logo-facilimob-horizontal-cropped.png', 'FacilImob Garantia de Aluguel', '220px')]),
          column('home_header_nav', 9, [
            html('home_nav', `<nav style="display:flex;gap:24px;align-items:center;justify-content:flex-end;flex-wrap:wrap;font-weight:700;color:#344054"><a href="#como-funciona">Como funciona</a><a href="#inquilino">Para inquilinos</a><a href="#proprietario">Para proprietarios</a><a href="#duvidas">Duvidas</a><a href="#contato" style="background:#f4770b;color:#fff;padding:12px 18px;border-radius:8px">Quero alugar sem fiador</a></nav>`, '64px')
          ])
        ])
      ]),
      section('home_hero', { padding: { top: 56, bottom: 44, left: 24, right: 24 }, background: '#f6f8fb' }, [
        row('home_hero_row', [
          column('home_hero_text', 6, [
            text('home_hero_eyebrow', 'Garantia locaticia digital', 'p', '#f4770b'),
            text('home_hero_title', 'Alugue sem fiador, sem caucao e com aprovacao rapida.', 'h1', '#003f75'),
            text('home_hero_copy', 'A Garantia FacilImob simplifica a locacao para quem quer alugar com menos burocracia e oferece mais seguranca para quem tem um imovel.', 'p', '#657180'),
            button('home_hero_cta', 'Quero alugar sem fiador', '#contato'),
            button('home_hero_whatsapp', 'Chamar no WhatsApp', 'https://wa.me/5543936181186?text=Ola%2C%20quero%20saber%20mais%20sobre%20a%20Garantia%20FacilImob%20para%20alugar%20sem%20fiador.', '#005da3'),
            html('home_trust', `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px"><span style="background:#fff;border:1px solid #d9e2ec;border-radius:8px;padding:10px 12px;font-weight:800;color:#003f75">Processo on-line</span><span style="background:#fff;border:1px solid #d9e2ec;border-radius:8px;padding:10px 12px;font-weight:800;color:#003f75">Sem fiador</span><span style="background:#fff;border:1px solid #d9e2ec;border-radius:8px;padding:10px 12px;font-weight:800;color:#003f75">Para inquilinos e proprietarios</span></div>`, '74px')
          ]),
          column('home_hero_image', 6, [
            image('home_hero_photo', '/assets/facilimob-hero-woman.png', 'Mulher sorrindo com chaves e tablet em ambiente residencial', '100%', ''),
            container('home_hero_card', [
              text('home_hero_card_title', 'Menos burocracia', 'h3', '#003f75'),
              text('home_hero_card_copy', 'Mais agilidade para seguir com a locacao.', 'p', '#657180')
            ], { background: '#ffffff', border: '1px solid #d9e2ec', radius: '8px', padding: { top: 18, bottom: 18, left: 18, right: 18 } })
          ])
        ])
      ]),
      section('home_intro', {}, [
        row('home_intro_row', [
          column('home_intro_title_col', 5, [text('home_intro_eyebrow', 'O que e', 'p', '#f4770b'), text('home_intro_title', 'Uma garantia de aluguel simples de entender.', 'h2', '#003f75')]),
          column('home_intro_copy_col', 7, [
            text('home_intro_copy', 'A FacilImob substitui alternativas tradicionais como fiador e caucao, ajudando o inquilino a avancar com mais facilidade e dando ao proprietario uma camada extra de seguranca no processo de locacao.', 'p', '#657180'),
            container('home_signal_card', [image('home_signal_icon', '/assets/favicon.png', '', '34px'), text('home_signal_title', 'Garantia analisada', 'h3', '#003f75'), text('home_signal_copy', 'Mais clareza antes de seguir com o contrato.', 'p', '#657180')], { background: '#ffffff', border: '1px solid #d9e2ec', radius: '8px' })
          ])
        ])
      ]),
      cardGridSection('home_features', 'Por que facilita', 'Menos travas para uma locacao mais fluida.', [
        card('feature_1', '/assets/icon-seguranca.png', 'Seguranca no processo', 'Mais confianca para organizar a garantia antes do fechamento do aluguel.'),
        card('feature_2', '/assets/icon-sem-fiador.png', 'Sem fiador ou caucao', 'Uma alternativa pratica para reduzir exigencias tradicionais da locacao.'),
        card('feature_3', '/assets/icon-atendimento.png', 'Atendimento direto', 'Orientacao simples para entender os proximos passos e seguir sem ruido.')
      ]),
      section('home_stats', { background: '#003f75', padding: { top: 36, bottom: 36, left: 24, right: 24 } }, [
        row('home_stats_row', [
          column('home_stat_1', 4, [text('home_stat_1_num', '100%', 'h2', '#ffffff'), text('home_stat_1_txt', 'processo orientado de forma digital', 'p', '#ffffff')]),
          column('home_stat_2', 4, [text('home_stat_2_num', '0', 'h2', '#ffffff'), text('home_stat_2_txt', 'fiador exigido na proposta da garantia', 'p', '#ffffff')]),
          column('home_stat_3', 4, [text('home_stat_3_num', '3 passos', 'h2', '#ffffff'), text('home_stat_3_txt', 'para enviar dados, analisar e receber retorno', 'p', '#ffffff')])
        ])
      ]),
      cardGridSection('home_steps', 'Como funciona', 'Quatro passos para sair da duvida.', [
        card('step_1', '', '1. Envie seus dados', 'Preencha o formulario com suas informacoes de contato e perfil.'),
        card('step_2', '', '2. Fazemos a analise', 'Avaliamos a solicitacao para orientar o melhor caminho.'),
        card('step_3', '', '3. Receba o retorno', 'Voce recebe as proximas orientacoes com clareza e objetividade.'),
        card('step_4', '', '4. Siga com a locacao', 'Com a garantia encaminhada, o aluguel pode avancar com menos entraves.')
      ]),
      section('home_audience', { background: '#e8f3fb' }, [
        row('home_audience_heading', [column('home_audience_heading_col', 12, [text('home_audience_eyebrow', 'Para cada etapa da locacao', 'p', '#f4770b'), text('home_audience_title', 'Informacao clara para quem aluga e para quem tem imovel.', 'h2', '#003f75')])]),
        row('home_audience_panels', [
          column('home_tenant_panel', 6, [container('home_tenant_card', [text('home_tenant_kicker', 'Para inquilinos', 'p', '#f4770b'), text('home_tenant_title', 'Alugue com menos exigencias.', 'h3', '#003f75'), text('home_tenant_copy', 'Uma alternativa simples para avancar na locacao sem depender de fiador ou caucao.', 'p', '#657180'), html('home_tenant_list', benefitList([['Sem fiador', 'Menos etapas para apresentar uma garantia aceita.'], ['Sem caucao', 'Evite imobilizar um valor alto logo no inicio da locacao.'], ['Processo direto', 'Atendimento objetivo para entender o que falta e seguir adiante.']]), '210px')])]),
          column('home_owner_panel', 6, [container('home_owner_card', [text('home_owner_kicker', 'Para proprietarios', 'p', '#f4770b'), text('home_owner_title', 'Mais confianca para fechar o aluguel.', 'h3', '#003f75'), text('home_owner_copy', 'A garantia ajuda a organizar a analise e traz mais seguranca para seguir com a locacao.', 'p', '#657180'), html('home_owner_list', benefitList([['Analise do perfil', 'Mais clareza antes de avancar com o contrato.'], ['Locacao mais agil', 'Menos dependencia de solucoes tradicionais e demoradas.'], ['Processo organizado', 'Informacoes centralizadas para uma decisao mais tranquila.']]), '210px')], { background: '#ffffff', border: '1px solid #005da3' })])
        ])
      ]),
      cardGridSection('home_testimonials', 'Experiencia de atendimento', 'O que clientes esperam de uma garantia simples.', [
        card('testimonial_1', '', 'Inquilina', '"Eu precisava entender rapido se conseguiria alugar sem fiador. O retorno claro fez diferenca."'),
        card('testimonial_2', '', 'Proprietario', '"Para o proprietario, o mais importante e ter seguranca sem transformar a locacao em um processo lento."'),
        card('testimonial_3', '', 'Cliente FacilImob', '"A explicacao simples ajuda a tomar decisao sem ficar perdido entre caucao, fiador e outras exigencias."')
      ]),
      section('home_faq', {}, [
        row('home_faq_heading', [column('home_faq_heading_col', 12, [text('home_faq_eyebrow', 'Duvidas frequentes', 'p', '#f4770b'), text('home_faq_title', 'Respostas diretas para decidir com tranquilidade.', 'h2', '#003f75')])]),
        row('home_faq_row', [column('home_faq_col', 12, [html('home_faq_html', faqHtml(), '420px')])])
      ]),
      section('home_final_cta', { background: '#003f75', padding: { top: 44, bottom: 44, left: 24, right: 24 } }, [
        row('home_final_cta_row', [column('home_final_cta_text', 8, [text('home_final_cta_eyebrow', 'Proximo passo', 'p', '#f4770b'), text('home_final_cta_title', 'Quer entender se a garantia serve para o seu aluguel?', 'h2', '#ffffff')]), column('home_final_cta_button', 4, [button('home_final_cta_btn', 'Quero alugar sem fiador', '#contato')])])
      ]),
      section('home_contact', {}, [
        row('home_contact_row', [
          column('home_contact_copy', 5, [text('home_contact_eyebrow', 'Fale conosco', 'p', '#f4770b'), text('home_contact_title', 'Quer alugar sem fiador?', 'h2', '#003f75'), text('home_contact_text', 'Preencha seus dados e fale com a equipe FacilImob diretamente pelo WhatsApp.', 'p', '#657180'), button('home_contact_email', 'contato@facilimob.com', 'mailto:contato@facilimob.com'), button('home_contact_whatsapp', '(43) 93618-1186', 'https://wa.me/5543936181186?text=Ola%2C%20quero%20saber%20mais%20sobre%20a%20Garantia%20FacilImob%20para%20alugar%20sem%20fiador.', '#005da3')]),
          column('home_contact_form', 7, [html('home_form_html', contactFormHtml(), '470px')])
        ])
      ]),
      section('home_footer', { background: '#ffffff', padding: { top: 34, bottom: 34, left: 24, right: 24 } }, [
        row('home_footer_row', [column('home_footer_col', 12, [image('home_footer_logo', '/assets/logo-facilimob-horizontal-cropped.png', 'FacilImob', '220px'), text('home_footer_copy', 'FacilImob Garantia de Aluguel. Informacao clara para uma locacao mais simples.', 'p', '#657180'), html('home_footer_links', `<nav style="display:flex;gap:18px;flex-wrap:wrap"><a href="/politica-de-privacidade.html">Politica de Privacidade</a><a href="/termos-de-uso.html">Termos de Uso</a></nav>`, '52px')])])
      ])
    ]
  };
}

function section(id, props = {}, rows = []) {
  return { id, background: props.background || '', padding: props.padding || { top: 86, bottom: 86, left: 24, right: 24 }, rows };
}

function row(id, columns = []) {
  return { id, columns };
}

function column(id, widthFraction, blocks = []) {
  return { id, widthFraction, blocks };
}

function text(id, content, tag = 'p', color = '') {
  return { id, type: 'text', text: content, tag, color, align: 'left' };
}

function button(id, label, href, color = '#f4770b') {
  return { id, type: 'button', label, href, color, align: 'left' };
}

function image(id, url, alt, width = '100%', href = '') {
  return { id, type: 'image', url, alt, href, width, radius: '8px', align: 'left' };
}

function container(id, blocks, props = {}) {
  return { id, type: 'container', background: props.background || '#ffffff', border: props.border || '1px solid #d9e2ec', radius: props.radius || '8px', padding: props.padding || { top: 22, bottom: 22, left: 22, right: 22 }, blocks };
}

function html(id, code, height = '180px') {
  return { id, type: 'html', code, height };
}

function cardGridSection(id, eyebrow, title, cards) {
  return section(id, {}, [
    row(`${id}_heading`, [column(`${id}_heading_col`, 12, [text(`${id}_eyebrow`, eyebrow, 'p', '#f4770b'), text(`${id}_title`, title, 'h2', '#003f75')])]),
    row(`${id}_cards`, cards.map((item, index) => column(`${id}_card_col_${index + 1}`, 12 / cards.length, [container(item.id, [...(item.image ? [image(`${item.id}_image`, item.image, '', '48px')] : []), text(`${item.id}_title`, item.title, 'h3', '#003f75'), text(`${item.id}_copy`, item.copy, 'p', '#657180')])])))
  ]);
}

function card(id, imageUrl, title, copy) {
  return { id, image: imageUrl, title, copy };
}

function benefitList(items) {
  return `<div style="display:grid;gap:14px">${items.map(([title, copy]) => `<div><strong style="display:block;color:#003f75">${title}</strong><span style="color:#657180">${copy}</span></div>`).join('')}</div>`;
}

function faqHtml() {
  const items = [
    ['Preciso de fiador?', 'Nao. A proposta da Garantia FacilImob e substituir a necessidade de fiador no processo de locacao.'],
    ['Preciso pagar caucao?', 'Em geral, a garantia evita a exigencia de caucao antecipada. Cada caso passa por analise e orientacao.'],
    ['Quem pode solicitar?', 'Inquilinos que desejam alugar sem fiador e proprietarios que querem entender melhor a seguranca da garantia.'],
    ['Quanto tempo demora?', 'O atendimento e feito para ser rapido e objetivo. Depois do envio dos dados, voce recebe as proximas orientacoes.'],
    ['A garantia tambem ajuda o proprietario?', 'Sim. Ela ajuda a organizar a locacao com mais seguranca, menos incerteza e mais clareza sobre o processo.'],
    ['Como falo com a FacilImob?', 'Voce pode preencher o formulario ou chamar diretamente pelo WhatsApp.']
  ];
  return `<div style="display:grid;gap:12px">${items.map(([question, answer], index) => `<details ${index === 0 ? 'open' : ''} style="background:#fff;border:1px solid #d9e2ec;border-radius:8px;padding:16px"><summary style="font-weight:800;color:#003f75">${question}</summary><p style="color:#657180">${answer}</p></details>`).join('')}</div>`;
}

function contactFormHtml() {
  return `<form data-whatsapp-form style="display:grid;gap:14px;background:#fff;border:1px solid #d9e2ec;border-radius:8px;padding:22px"><label>Nome completo<input name="name" required style="display:block;width:100%;min-height:42px;margin-top:6px"></label><label>Telefone/WhatsApp<input name="phone" required style="display:block;width:100%;min-height:42px;margin-top:6px"></label><label>E-mail<input name="email" type="email" required style="display:block;width:100%;min-height:42px;margin-top:6px"></label><label style="display:flex;gap:8px"><input name="consent" type="checkbox" required><span>Concordo em enviar meus dados para receber contato da FacilImob.</span></label><button type="submit" style="background:#f4770b;color:#fff;border:0;border-radius:8px;min-height:46px;font-weight:800">Falar com um consultor</button><p data-form-status role="status"></p></form>`;
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
