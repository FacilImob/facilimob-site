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
    if (error.status === 429) {
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
    }

    return res.status(401).json({ error: 'E-mail nao encontrado ou nao autorizado.' });
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

  res.json({
    user: {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.name || data.user.email
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
      name: req.user.user_metadata?.name || req.user.email
    }
  });
});

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export default router;
