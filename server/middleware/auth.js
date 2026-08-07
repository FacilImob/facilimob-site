import { supabaseAnon } from '../supabaseAdmin.js';
import { readAuthCookie } from '../authCookie.js';
import { readAdminSessionCookie, renewAdminSessionCookie } from '../siteAdminSession.js';

const protectedPages = new Set([
  '/simulador',
  '/simulador.html',
  '/historico',
  '/historico.html',
  '/settings',
  '/settings.html',
  '/admin',
  '/admin.html'
]);

export async function requireAuth(req, res, next) {
  const cookieUser = readAuthCookie(req);
  if (cookieUser) {
    req.user = {
      id: cookieUser.id,
      email: cookieUser.email,
      role: normalizeRole(cookieUser.role),
      user_metadata: { name: cookieUser.name },
      app_metadata: { role: normalizeRole(cookieUser.role), nome: cookieUser.name }
    };
    req.accessToken = '';
    return next();
  }

  if (req.session?.customAuth && req.session?.userId && req.session?.email) {
    req.user = {
      id: req.session.userId,
      email: req.session.email,
      role: normalizeRole(req.session.role),
      user_metadata: { name: req.session.name },
      app_metadata: { role: normalizeRole(req.session.role), nome: req.session.name }
    };
    req.accessToken = '';
    return next();
  }

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
  if (req.path === '/admin.html') {
    return requireAdmin(req, res, next);
  }

  if (isSiteAdminPage(req.path)) {
    return requireSiteAdminPage(req, res, next);
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

function requireSiteAdminPage(req, res, next) {
  const user = readAdminSessionCookie(req);

  if (!user) {
    return res.redirect('/admin/login.html');
  }

  renewAdminSessionCookie(res, user);
  return next();
}

function isSiteAdminPage(path) {
  if (path === '/admin/login.html' || path === '/admin/login.js' || path === '/admin/admin.css') return false;
  return path === '/admin' || path.startsWith('/admin/');
}
