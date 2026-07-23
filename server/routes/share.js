import crypto from 'node:crypto';
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../supabaseAdmin.js';
import { buildPixSimulation } from './simulations.js';

const router = Router();
const shareRateLimit = new Map();
const SHARE_LIMIT = 10;
const SHARE_WINDOW_MS = 60 * 60 * 1000;
const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

router.post('/', requireAuth, async (req, res) => {
  const limit = checkShareRateLimit(req.user.id);

  if (!limit.ok) {
    return res.status(429).json({ error: 'Muitos links gerados recentemente. Tente novamente mais tarde.' });
  }

  const encoded = String(req.body.encoded || '').trim();
  const parsed = parseSharedPayload(encoded);

  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const hash = createShareHash(encoded, req.user.id);
  const expiresAt = new Date(Date.now() + SHARE_TTL_MS).toISOString();

  const { error } = await supabaseAdmin.from('shared_simulations').insert({
    share_hash: hash,
    expira_em: expiresAt,
    criado_por: req.user.id,
    dados: parsed.payload
  });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json({
    hash,
    expires_at: expiresAt,
    url: `${req.protocol}://${req.get('host')}/compartilhar.html?s=${encodeURIComponent(hash)}`
  });
});

router.get('/:hash', async (req, res) => {
  const shared = await findSharedSimulation(req.params.hash);

  if (shared.error) {
    return res.status(shared.status).json({ error: shared.error });
  }

  const { data: settings, error: settingsError } = await supabaseAdmin.from('settings').select('*').eq('id', 1).single();

  if (settingsError) {
    return res.status(500).json({ error: settingsError.message });
  }

  res.json({
    simulation: publicSimulation(shared.data.dados),
    expires_at: shared.data.expira_em,
    settings: publicSettings(settings, shared.data.dados)
  });
});

router.post('/:hash/pix', async (req, res) => {
  const opcao = String(req.body.opcao_escolhida || '').trim();

  if (!['com_fci', 'sem_fci'].includes(opcao)) {
    return res.status(400).json({ error: 'Modalidade invalida.' });
  }

  const shared = await findSharedSimulation(req.params.hash);

  if (shared.error) {
    return res.status(shared.status).json({ error: shared.error });
  }

  const { data: settings, error: settingsError } = await supabaseAdmin.from('settings').select('*').eq('id', 1).single();

  if (settingsError) {
    return res.status(500).json({ error: settingsError.message });
  }

  const result = await buildPixSimulation(
    {
      ...shared.data.dados,
      cliente_email: 'cliente@facilimob.local',
      opcao_escolhida: opcao
    },
    {
      ...settings,
      taxa_com_fci: shared.data.dados.taxa_com_fci,
      taxa_sem_fci: shared.data.dados.taxa_sem_fci,
      taxa_setup_padrao: shared.data.dados.taxa_setup_aplicada
    }
  );

  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }

  const { cliente_email, ...data } = result.data;
  const sharedUpdate = await updateSharedSelection(shared.data.share_hash, shared.data.dados, opcao);

  if (sharedUpdate.error) {
    return res.status(500).json({ error: sharedUpdate.error });
  }

  const updateResult = await updateLinkedSimulation(shared.data.dados.simulation_id, data);

  if (updateResult.error) {
    return res.status(500).json({ error: updateResult.error });
  }

  res.json(data);
});

async function findSharedSimulation(hash) {
  const normalizedHash = String(hash || '').trim();

  if (!/^[A-Za-z0-9_-]{32,64}$/.test(normalizedHash)) {
    return { error: 'Link de compartilhamento invalido.', status: 404 };
  }

  const { data, error } = await supabaseAdmin
    .from('shared_simulations')
    .select('*')
    .eq('share_hash', normalizedHash)
    .single();

  if (error || !data) {
    return { error: 'Link de compartilhamento nao encontrado.', status: 404 };
  }

  if (new Date(data.expira_em) < new Date()) {
    return { error: 'Link de compartilhamento expirado.', status: 410 };
  }

  return { data };
}

function parseSharedPayload(encoded) {
  if (!encoded) {
    return { error: 'Dados da simulacao ausentes.' };
  }

  const params = new URLSearchParams(encoded);
  const payload = {
    cliente_nome: String(params.get('cliente_nome') || '').trim(),
    cliente_cpf: String(params.get('cliente_cpf') || '').replace(/\D/g, ''),
    cliente_telefone: String(params.get('cliente_telefone') || '').replace(/\D/g, ''),
    valor_aluguel: Number(params.get('valor_aluguel') || 0),
    taxa_setup_aplicada: Number(params.get('taxa_setup_aplicada') || 0),
    taxa_com_fci: Number(params.get('taxa_com_fci') || 0),
    taxa_sem_fci: Number(params.get('taxa_sem_fci') || 0),
    opcao_escolhida: String(params.get('opcao_escolhida') || 'com_fci').trim(),
    simulation_id: String(params.get('simulation_id') || '').trim(),
    colaborador_nome: String(params.get('colaborador_nome') || '').trim()
  };

  if (!payload.cliente_nome || payload.cliente_nome.split(/\s+/).length < 2) {
    return { error: 'Nome do cliente invalido.' };
  }

  if (payload.cliente_cpf.length !== 11) {
    return { error: 'CPF invalido.' };
  }

  if (payload.cliente_telefone.length < 10) {
    return { error: 'Telefone invalido.' };
  }

  if (!Number.isFinite(payload.valor_aluguel) || payload.valor_aluguel <= 0) {
    return { error: 'Valor do aluguel invalido.' };
  }

  if (!Number.isFinite(payload.taxa_setup_aplicada) || payload.taxa_setup_aplicada < 0) {
    return { error: 'Taxa de setup invalida.' };
  }

  if (!Number.isFinite(payload.taxa_com_fci) || !Number.isFinite(payload.taxa_sem_fci)) {
    return { error: 'Taxas invalidas.' };
  }

  if (!['com_fci', 'sem_fci'].includes(payload.opcao_escolhida)) {
    return { error: 'Modalidade invalida.' };
  }

  if (payload.simulation_id && !isUuid(payload.simulation_id)) {
    return { error: 'Simulacao vinculada invalida.' };
  }

  return { payload };
}

async function updateSharedSelection(hash, payload, option) {
  const { error } = await supabaseAdmin
    .from('shared_simulations')
    .update({
      dados: {
        ...payload,
        opcao_escolhida: option
      }
    })
    .eq('share_hash', hash);

  if (error) {
    return { error: error.message };
  }

  return { ok: true };
}

async function updateLinkedSimulation(simulationId, data) {
  if (!simulationId) {
    return { ok: true };
  }

  const { error } = await supabaseAdmin
    .from('simulations')
    .update({
      opcao_escolhida: data.opcao_escolhida,
      taxa_aplicada: data.taxa_aplicada,
      parcela_mensal: data.parcela_mensal,
      total_primeiro_pagamento: data.total_primeiro_pagamento,
      pix_payload: data.pix_payload
    })
    .eq('id', simulationId);

  if (error) {
    return { error: error.message };
  }

  return { ok: true };
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function publicSimulation(payload = {}) {
  const { simulation_id, ...data } = payload;
  return data;
}

function createShareHash(encoded, userId) {
  return crypto
    .createHash('sha256')
    .update(`${encoded}:${userId}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`)
    .digest('base64url')
    .slice(0, 43);
}

function checkShareRateLimit(userId) {
  const key = String(userId || 'anonymous');
  const now = Date.now();
  const current = shareRateLimit.get(key);

  if (!current || now - current.startedAt > SHARE_WINDOW_MS) {
    shareRateLimit.set(key, { startedAt: now, count: 1 });
    return { ok: true };
  }

  if (current.count >= SHARE_LIMIT) {
    return { ok: false };
  }

  current.count += 1;
  return { ok: true };
}

function publicSettings(settings, payload = {}) {
  return {
    taxa_com_fci: Number(payload.taxa_com_fci ?? settings.taxa_com_fci ?? 0),
    taxa_sem_fci: Number(payload.taxa_sem_fci ?? settings.taxa_sem_fci ?? 0),
    taxa_setup_padrao: Number(payload.taxa_setup_aplicada ?? settings.taxa_setup_padrao ?? 0)
  };
}

export default router;
