import { Router } from 'express';
import { supabaseAnon } from '../supabaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/request-code', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return res.status(400).json({ error: 'Informe o e-mail.' });
  }

  const { error } = await supabaseAnon.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false
    }
  });

  if (error) {
    logSupabaseOtpError(email, error);

    if (isRateLimitError(error)) {
      return res
        .status(429)
        .json({ error: 'Muitos codigos solicitados recentemente. Aguarde alguns minutos e tente novamente.' });
    }

    if (isUnauthorizedOtpError(error)) {
      return res.status(401).json({ error: 'E-mail nao encontrado ou nao autorizado.' });
    }

    return res.status(500).json({ error: 'Nao foi possivel enviar o e-mail. Verifique a configuracao de e-mail do sistema.' });
  }

  res.json({ ok: true });
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

function normalizeRole(role) {
  return role === 'admin' ? 'admin' : 'colaborador';
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

export default router;
