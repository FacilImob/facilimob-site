import { supabaseAnon } from '../supabaseAdmin.js';

const protectedPages = new Set([
  '/simulador',
  '/simulador.html',
  '/historico',
  '/historico.html',
  '/settings',
  '/settings.html',
  '/site-admin',
  '/site-admin.html',
  '/admin',
  '/admin.html'
]);

export async function requireAuth(req, res, next) {
  const token = req.session?.accessToken;

  if (!token) {
    return wantsHtml(req) ? res.redirect('/login.html') : res.status(401).json({ error: 'Sessao expirada.' });
  }

  let { data, error } = await supabaseAnon.auth.getUser(token);

  if ((error || !data?.user) && req.session.refreshToken) {
    const refreshed = await supabaseAnon.auth.refreshSession({
      refresh_token: req.session.refreshToken
    });

    if (!refreshed.error && refreshed.data?.session) {
      req.session.accessToken = refreshed.data.session.access_token;
      req.session.refreshToken = refreshed.data.session.refresh_token;
      ({ data, error } = await supabaseAnon.auth.getUser(req.session.accessToken));
    }
  }

  if (error || !data?.user) {
    req.session.destroy(() => {});
    return wantsHtml(req) ? res.redirect('/login.html') : res.status(401).json({ error: 'Sessao expirada.' });
  }

  const role = normalizeRole(req.session.role || data.user.app_metadata?.role);
  req.session.role = role;
  req.user = {
    ...data.user,
    role
  };
  req.accessToken = req.session.accessToken;
  next();
}

export async function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    if (req.user.role === 'admin') {
      return next();
    }

    return wantsHtml(req) ? res.redirect('/simulador.html') : res.status(403).json({ error: 'Acesso restrito a administradores.' });
  });
}

export function pageAuth(req, res, next) {
  if (req.path === '/admin' || req.path === '/admin.html') {
    return requireAdmin(req, res, next);
  }

  if (protectedPages.has(req.path)) {
    return requireAuth(req, res, next);
  }

  next();
}

function wantsHtml(req) {
  if (req.originalUrl?.startsWith('/api/')) {
    return false;
  }

  return req.accepts(['html', 'json']) === 'html';
}

function normalizeRole(role) {
  if (role === 'admin') return 'admin';
  return 'editor';
}
