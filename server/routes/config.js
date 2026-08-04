import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabaseAdmin.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabaseAdmin.from('settings').select('*').eq('id', 1).single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

router.put('/', requireAuth, async (req, res) => {
  const fields = [
    'taxa_com_fci',
    'taxa_sem_fci',
    'taxa_setup_padrao',
    'pix_tipo_chave',
    'pix_chave',
    'pix_nome_recebedor',
    'pix_cidade',
    'pix_descricao_padrao'
  ];
  const payload = {};

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      payload[field] = req.body[field];
    }
  }

  payload.atualizado_em = new Date().toISOString();

  const { data, error } = await supabaseAdmin.from('settings').update(payload).eq('id', 1).select('*').single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

export default router;
