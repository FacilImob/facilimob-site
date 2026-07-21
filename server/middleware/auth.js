import { supabaseAnon } from '../supabaseAdmin.js';

const protectedPages = new Set([
  '/',
  '/index',
  '/index.html',
  '/historico',
  '/historico.html',
  '/settings',
  '/settings.html'
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

  req.user = data.user;
  req.accessToken = req.session.accessToken;
  next();
}

export function pageAuth(req, res, next) {
  if (protectedPages.has(req.path)) {
    return requireAuth(req, res, next);
  }

  next();
}

function wantsHtml(req) {
  return req.accepts(['html', 'json']) === 'html';
}
