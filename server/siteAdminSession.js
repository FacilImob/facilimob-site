import crypto from 'node:crypto';

const SESSION_COOKIE = 'facilimob_site_admin_session';
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const cookieDefaults = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  signed: true,
  path: '/'
};

export function createLoginCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

export function hashLoginCode(code) {
  const secret = process.env.SITE_SESSION_SECRET || process.env.SESSION_SECRET || 'facilimob-site-admin-session';
  return crypto.createHash('sha256').update(`${secret}:${code}`).digest('hex');
}

export function setAdminSessionCookie(res, user) {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name || user.email,
    role: normalizeRole(user.role),
    expiresAt: Date.now() + SESSION_MAX_AGE_MS
  };

  res.cookie(SESSION_COOKIE, encode(payload), { ...cookieDefaults, maxAge: SESSION_MAX_AGE_MS });
}

export function readAdminSessionCookie(req) {
  const payload = decode(req.signedCookies?.[SESSION_COOKIE]);
  if (!payload || payload.expiresAt < Date.now()) return null;
  return {
    id: payload.id,
    email: payload.email,
    name: payload.name || payload.email,
    role: normalizeRole(payload.role)
  };
}

export function renewAdminSessionCookie(res, user) {
  setAdminSessionCookie(res, user);
}

export function clearAdminSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieDefaults);
}

function encode(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decode(value) {
  if (!value || typeof value !== 'string') return null;

  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch (_error) {
    return null;
  }
}

function normalizeRole(role) {
  return role === 'admin' ? 'admin' : 'editor';
}
