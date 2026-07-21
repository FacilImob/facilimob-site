import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabaseAdmin.js';

const router = Router();

router.use(requireAdmin);

router.get('/users', async (_req, res) => {
  const users = [];
  let page = 1;

  while (page <= 20) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 100
    });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    users.push(...data.users);

    if (data.users.length < 100) {
      break;
    }

    page += 1;
  }

  res.json(users.map(formatUser).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
});

router.post('/users', async (req, res) => {
  const nome = String(req.body.nome || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = normalizeRole(req.body.role);

  if (!nome || !email) {
    return res.status(400).json({ error: 'Informe nome e e-mail.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'E-mail invalido.' });
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: nome },
    app_metadata: { role, nome }
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.status(201).json(formatUser(data.user));
});

router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Voce nao pode remover seu proprio usuario.' });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true });
});

function formatUser(user) {
  return {
    id: user.id,
    nome: user.user_metadata?.name || user.app_metadata?.nome || '',
    email: user.email,
    role: normalizeRole(user.app_metadata?.role),
    created_at: user.created_at
  };
}

function normalizeRole(role) {
  return role === 'admin' ? 'admin' : 'colaborador';
}

export default router;
