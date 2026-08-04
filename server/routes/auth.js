import { Router } from 'express';
import { supabaseAnon } from '../supabaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/request-code', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const redirectTo = `${getPublicBaseUrl(req)}/auth-callback.html`;

  if (!email) {
    return res.status(400).json({ error: 'Informe o e-mail.' });
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
        .json({ error: 'O Supabase bloqueou novos envios por limite de seguranca. Aguarde alguns minutos ou aumente o limite em Authentication > Rate Limits.' });
    }

    if (isUnauthorizedOtpError(error)) {
      return res.status(401).json({ error: 'E-mail nao encontrado ou nao autorizado.' });
    }

    return res.status(500).json({ error: 'Nao foi possivel enviar o e-mail. Verifique a configuracao de e-mail do sistema.' });
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

  const { data, error } = await verifyEmailOtp(email, token);

  if (error || !data?.session || !data?.user) {
    logSupabaseVerifyError(email, error);
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

async function verifyEmailOtp(email, token) {
  const magicLinkResult = await supabaseAnon.auth.verifyOtp({
    email,
    token,
    type: 'magiclink'
  });

  if (!magicLinkResult.error && magicLinkResult.data?.session && magicLinkResult.data?.user) {
    return magicLinkResult;
  }

  const emailResult = await supabaseAnon.auth.verifyOtp({
    email,
    token,
    type: 'email'
  });

  if (emailResult.error) {
    return {
      data: emailResult.data,
      error: {
        name: emailResult.error.name,
        status: emailResult.error.status,
        code: emailResult.error.code,
        message: emailResult.error.message,
        firstAttempt: {
          name: magicLinkResult.error?.name,
          status: magicLinkResult.error?.status,
          code: magicLinkResult.error?.code,
          message: magicLinkResult.error?.message
        }
      }
    };
  }

  return emailResult;
}

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

function logSupabaseVerifyError(email, error) {
  console.error(
    '[auth:verify-code] Supabase verifyOtp error',
    JSON.stringify(
      {
        email,
        name: error?.name,
        status: error?.status,
        code: error?.code,
        message: error?.message,
        firstAttempt: error?.firstAttempt
      },
      null,
      2
    )
  );
}

export default router;
