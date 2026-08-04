import crypto from 'node:crypto';

const AUTH_COOKIE = 'facilimob.auth';
const AUTH_TTL_MS = 2 * 60 * 60 * 1000;

export function setAuthCookie(res, user) {
  const expiresAt = Date.now() + AUTH_TTL_MS;
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name || user.email,
    role: normalizeRole(user.role),
    exp: expiresAt
  };

  res.cookie(AUTH_COOKIE, signPayload(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: AUTH_TTL_MS,
    path: '/'
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
}

export function readAuthCookie(req) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return null;

  const [encodedPayload, signature] = String(token).split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload);
  if (!timingSafeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload.id || !payload.email || !payload.exp || Date.now() > Number(payload.exp)) {
      return null;
    }

    return {
      id: payload.id,
      email: payload.email,
      name: payload.name || payload.email,
      role: normalizeRole(payload.role)
    };
  } catch {
    return null;
  }
}

function signPayload(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function getSecret() {
  return process.env.SESSION_SECRET || 'facilimob-public-site-session';
}

function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeRole(role) {
  if (role === 'admin') return 'admin';
  return 'editor';
}
