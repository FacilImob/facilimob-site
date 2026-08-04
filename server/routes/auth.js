import { Router } from 'express';
import { supabaseAnon, userClient } from '../supabaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const otpCooldownByEmail = new Map();
const OTP_COOLDOWN_MS = 90 * 1000;

router.post('/request-code', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const redirectTo = `${getPublicBaseUrl(req)}/auth-callback.html`;

  if (!email) {
    return res.status(400).json({ error: 'Informe o e-mail.' });
  }

  const recentlySent = getOtpCooldownRemaining(email);
  if (recentlySent > 0) {
    return res.json({
      ok: true,
      reused: true,
      waitSeconds: recentlySent,
      message: 'Um link ja foi enviado ha pouco. Use o e-mail mais recente para entrar.'
    });
  }

  const { error } = await supabaseAnon.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false
    }
  });

  if (error) {
    logSupabaseOtpError(email, error);

    if (isRateLimitError(error)) {
      return res
        .status(429)
        .json({ error: 'Muitos links solicitados recentemente. Use o ultimo e-mail recebido ou aguarde alguns minutos para pedir outro.' });
    }

    if (isUnauthorizedOtpError(error)) {
      return res.status(401).json({ error: 'E-mail nao encontrado ou nao autorizado.' });
    }

    return res.status(500).json({ error: 'Nao foi possivel enviar o e-mail. Verifique a configuracao de e-mail do sistema.' });
  }

  otpCooldownByEmail.set(email, Date.now());
  res.json({ ok: true });
});

router.post('/password', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ error: 'Informe e-mail e senha.' });
  }

  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data?.session || !data?.user) {
    logSupabasePasswordError(email, error);
    return res.status(401).json({ error: 'E-mail ou senha invalidos.' });
  }

  req.session.accessToken = data.session.access_token;
  req.session.refreshToken = data.session.refresh_token;
  req.session.userId = data.user.id;
  req.session.role = normalizeRole(data.user.app_metadata?.role);

  res.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      name: displayName(data.user),
      role: req.session.role
    }
  });
});

router.post('/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const redirectTo = `${getPublicBaseUrl(req)}/reset-password.html`;

  if (!email) {
    return res.status(400).json({ error: 'Informe o e-mail.' });
  }

  const { error } = await supabaseAnon.auth.resetPasswordForEmail(email, {
    redirectTo
  });

  if (error) {
    logSupabasePasswordError(email, error);

    if (isRateLimitError(error)) {
      return res.status(429).json({ error: 'Muitos pedidos de recuperação. Aguarde alguns minutos e tente novamente.' });
    }

    return res.status(500).json({ error: 'Nao foi possivel enviar o e-mail de recuperacao.' });
  }

  res.json({ ok: true });
});

router.post('/update-password', requireAuth, async (req, res) => {
  const password = String(req.body.password || '');

  if (password.length < 8) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' });
  }

  const client = userClient(req.accessToken);
  const { error } = await client.auth.updateUser({ password });

  if (error) {
    logSupabasePasswordError(req.user.email, error);
    return res.status(500).json({ error: 'Nao foi possivel atualizar a senha.' });
  }

  res.json({ ok: true });
});

router.post('/session-from-link', async (req, res) => {
  const accessToken = String(req.body.access_token || '').trim();
  const refreshToken = String(req.body.refresh_token || '').trim();

  if (!accessToken || !refreshToken) {
    return res.status(400).json({ error: 'Link de acesso incompleto.' });
  }

  const { data, error } = await supabaseAnon.auth.getUser(accessToken);

  if (error || !data?.user) {
    return res.status(401).json({ error: 'Link de acesso invalido ou expirado.' });
  }

  req.session.accessToken = accessToken;
  req.session.refreshToken = refreshToken;
  req.session.userId = data.user.id;
  req.session.role = normalizeRole(data.user.app_metadata?.role);

  res.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      name: displayName(data.user),
      role: req.session.role
    }
  });
});

router.post('/verify-code', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const token = String(req.body.token || '').replace(/\D/g, '');

  if (!email || token.length !== 6) {
    return res.status(400).json({ error: 'Informe o codigo de 6 digitos.' });
  }

  const { data, error } = await supabaseAnon.auth.verifyOtp({
    email,
    token,
    type: 'email'
  });

  if (error || !data?.session || !data?.user) {
    return res.status(401).json({ error: 'Codigo invalido ou expirado.' });
  }

  req.session.accessToken = data.session.access_token;
  req.session.refreshToken = data.session.refresh_token;
  req.session.userId = data.user.id;
  req.session.role = normalizeRole(data.user.app_metadata?.role);

  res.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      name: displayName(data.user),
      role: req.session.role
    }
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
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

function getPublicBaseUrl(req) {
  const configuredUrl = String(process.env.PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  if (configuredUrl) return configuredUrl;

  const protocol = req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol;
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host');
  return `${protocol}://${host}`;
}

function normalizeRole(role) {
  if (role === 'admin') return 'admin';
  return 'editor';
}

function displayName(user) {
  return user.user_metadata?.name || user.app_metadata?.nome || user.email;
}

function isRateLimitError(error) {
  const message = String(error.message || '').toLowerCase();
  const code = String(error.code || '').toLowerCase();
  return error.status === 429 || code.includes('rate') || message.includes('rate limit');
}

function isUnauthorizedOtpError(error) {
  const message = String(error.message || '').toLowerCase();
  return error.status === 400 || error.status === 401 || error.status === 422 || message.includes('signup');
}

function logSupabaseOtpError(email, error) {
  console.error(
    '[auth:request-code] Supabase signInWithOtp error',
    JSON.stringify(
      {
        email,
        name: error.name,
        status: error.status,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        stack: error.stack
      },
      null,
      2
    )
  );
}

function logSupabasePasswordError(email, error) {
  if (!error) return;
  console.error(
    '[auth:password] Supabase signInWithPassword error',
    JSON.stringify(
      {
        email,
        name: error.name,
        status: error.status,
        code: error.code,
        message: error.message
      },
      null,
      2
    )
  );
}

function getOtpCooldownRemaining(email) {
  const sentAt = otpCooldownByEmail.get(email);
  if (!sentAt) return 0;

  const elapsed = Date.now() - sentAt;
  if (elapsed >= OTP_COOLDOWN_MS) {
    otpCooldownByEmail.delete(email);
    return 0;
  }

  return Math.ceil((OTP_COOLDOWN_MS - elapsed) / 1000);
}

export default router;
