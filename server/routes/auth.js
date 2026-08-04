import { Router } from 'express';
import crypto from 'node:crypto';
import { supabaseAdmin } from '../supabaseAdmin.js';
import { requireAuth } from '../middleware/auth.js';
import { sendLoginCodeEmail } from '../email.js';
import { clearAuthCookie, setAuthCookie } from '../authCookie.js';

const router = Router();
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;

router.post('/request-code', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  if (!email) {
    return res.status(400).json({ error: 'Informe o e-mail.' });
  }

  const user = await findUserByEmail(email);

  if (!user) {
    return res.status(401).json({ error: 'E-mail nao encontrado ou nao autorizado.' });
  }

  const code = createOtpCode();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
  const { error: insertError } = await supabaseAdmin.from('login_otps').insert({
    user_id: user.id,
    email,
    code_hash: hashOtp(code),
    expires_at: expiresAt
  });

  if (insertError) {
    console.error('[auth:request-code] login_otps insert error', insertError.message);
    return res.status(500).json({ error: 'Nao foi possivel gerar o codigo de acesso.' });
  }

  try {
    await sendLoginCodeEmail({ to: email, code });
  } catch (error) {
    console.error('[auth:request-code] SMTP send error', error.message);
    return res.status(500).json({ error: 'Nao foi possivel enviar o e-mail. Verifique a configuracao SMTP do sistema.' });
  }

  res.json({ ok: true });
});

router.post('/verify-code', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const token = String(req.body.token || '').replace(/\D/g, '');

  if (!email || token.length !== 6) {
    return res.status(400).json({ error: 'Informe o codigo de 6 digitos.' });
  }

  const otp = await findLatestOtp(email);
  if (!otp || new Date(otp.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Codigo invalido ou expirado.' });
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return res.status(401).json({ error: 'Muitas tentativas com este codigo. Solicite um novo.' });
  }

  if (otp.code_hash !== hashOtp(token)) {
    await supabaseAdmin.from('login_otps').update({ attempts: otp.attempts + 1 }).eq('id', otp.id);
    return res.status(401).json({ error: 'Codigo invalido ou expirado.' });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(otp.user_id);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Usuario nao encontrado.' });
  }

  await supabaseAdmin.from('login_otps').update({ consumed_at: new Date().toISOString() }).eq('id', otp.id);

  req.session.accessToken = '';
  req.session.refreshToken = '';
  req.session.userId = userData.user.id;
  req.session.email = userData.user.email;
  req.session.name = displayName(userData.user);
  req.session.role = normalizeRole(userData.user.app_metadata?.role);
  req.session.customAuth = true;

  const responseUser = {
    id: userData.user.id,
    email: userData.user.email,
    name: displayName(userData.user),
    role: req.session.role
  };
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

function createOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashOtp(code) {
  return crypto.createHash('sha256').update(`${process.env.SESSION_SECRET || 'facilimob'}:${code}`).digest('hex');
}

async function findLatestOtp(email) {
  const { data, error } = await supabaseAdmin
    .from('login_otps')
    .select('*')
    .eq('email', email)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[auth:verify-code] login_otps select error', error.message);
    return null;
  }

  return data;
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

function normalizeRole(role) {
  if (role === 'admin') return 'admin';
  return 'editor';
}

function displayName(user) {
  return user.user_metadata?.name || user.app_metadata?.nome || user.email;
}

export default router;
