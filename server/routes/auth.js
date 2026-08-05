import { Router } from 'express';
import { supabaseAdmin, supabaseAnon } from '../supabaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';
import { clearAuthCookie, setAuthCookie } from '../authCookie.js';

const router = Router();

router.post('/request-code', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return res.status(400).json({ error: 'Informe o e-mail.' });
  }

  const user = await findUserByEmail(email);

  if (!user) {
    return res.status(401).json({ error: 'E-mail nao encontrado ou nao autorizado.' });
  }

  const redirectTo = buildRedirectUrl(req);
  const { error } = await supabaseAnon.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo
    }
  });

  if (error) {
    console.error(
      '[auth:request-code] Supabase magic link error',
      JSON.stringify({
        email,
        redirectTo,
        name: error.name,
        status: error.status,
        code: error.code,
        message: error.message
      })
    );

    if (isRateLimitError(error)) {
      return res
        .status(429)
        .json({ error: 'Muitos acessos solicitados recentemente. Aguarde alguns minutos e tente novamente.' });
    }

    return res.status(500).json({ error: 'Nao foi possivel enviar o link de acesso pelo Supabase.' });
  }

  res.json({ ok: true });
});

router.post('/complete-link', async (req, res) => {
  const accessToken = String(req.body.access_token || '').trim();

  if (!accessToken) {
    return res.status(400).json({ error: 'Link de acesso invalido.' });
  }

  const { data, error } = await supabaseAnon.auth.getUser(accessToken);

  if (error || !data?.user) {
    return res.status(401).json({ error: 'Link de acesso invalido ou expirado.' });
  }

  const user = await findUserByEmail(data.user.email);

  if (!user) {
    return res.status(401).json({ error: 'E-mail nao encontrado ou nao autorizado.' });
  }

  const responseUser = {
    id: user.id,
    email: user.email,
    name: displayName(user),
    role: normalizeRole(user.app_metadata?.role)
  };

  req.session.userId = responseUser.id;
  req.session.email = responseUser.email;
  req.session.name = responseUser.name;
  req.session.role = responseUser.role;
  setAuthCookie(res, responseUser);

  res.json({
    user: responseUser
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    clearAuthCookie(res);
    res.clearCookie('facilimob.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: displayName(req.user),
      role: req.user.role
    }
  });
});

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function buildRedirectUrl(req) {
  const baseUrl = String(process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  return `${baseUrl}/login.html`;
}

async function findUserByEmail(emailToFind) {
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 100
    });

    if (error) {
      console.error('[auth:find-user] Supabase listUsers error', error.message);
      return null;
    }

    const user = data.users.find((item) => item.email?.toLowerCase() === emailToFind);

    if (user || data.users.length < 100) {
      return user || null;
    }

    page += 1;
  }

  return null;
}

function isRateLimitError(error) {
  const message = String(error.message || '').toLowerCase();
  const code = String(error.code || '').toLowerCase();
  return error.status === 429 || code.includes('rate') || message.includes('rate limit');
}

function normalizeRole(role) {
  return role === 'admin' ? 'admin' : 'colaborador';
}

function displayName(user) {
  return user.user_metadata?.name || user.app_metadata?.nome || user.email;
}

export default router;
