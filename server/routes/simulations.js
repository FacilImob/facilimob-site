import { Router } from 'express';
import QRCode from 'qrcode';
import { createStaticPix, hasError } from 'pix-utils';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin, userClient } from '../supabaseAdmin.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const search = String(req.query.search || '').trim();
  const supabase = userClient(req.accessToken);
  let query = supabase.from('simulations').select('*').order('criado_em', { ascending: false }).limit(100);

  if (search) {
    const digits = onlyDigits(search);
    query = query.or(`cliente_nome.ilike.%${escapeSearch(search)}%,cliente_cpf.ilike.%${escapeSearch(digits || search)}%`);
  }

  const { data, error } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const simulations = await attachCollaborators(data || []);
  res.json(simulations);
});

router.get('/:id', requireAuth, async (req, res) => {
  const supabase = userClient(req.accessToken);
  const { data, error } = await supabase.from('simulations').select('*').eq('id', req.params.id).single();

  if (error) {
    return res.status(404).json({ error: 'Simulacao nao encontrada.' });
  }

  const qr_code = await QRCode.toDataURL(data.pix_payload, { margin: 1, width: 260 });
  const [simulation] = await attachCollaborators([data]);
  res.json({ ...simulation, qr_code });
});

router.post('/', requireAuth, async (req, res) => {
  const validation = validateSimulation(req.body);

  if (validation) {
    return res.status(400).json({ error: validation });
  }

  const supabase = userClient(req.accessToken);
  const { data: settings, error: settingsError } = await supabase.from('settings').select('*').eq('id', 1).single();

  if (settingsError) {
    return res.status(500).json({ error: settingsError.message });
  }

  if (!settings.pix_chave || !settings.pix_nome_recebedor || !settings.pix_cidade) {
    return res.status(400).json({ error: 'Configure a chave Pix, recebedor e cidade antes de gerar o Pix.' });
  }

  const valorAluguel = money(req.body.valor_aluguel);
  const taxaSetup =
    req.body.taxa_setup_aplicada === undefined
      ? money(settings.taxa_setup_padrao)
      : money(req.body.taxa_setup_aplicada);
  const opcao = req.body.opcao_escolhida;
  const taxaAplicada = Number(opcao === 'com_fci' ? settings.taxa_com_fci : settings.taxa_sem_fci);
  const parcelaMensal = roundCurrency(valorAluguel * (taxaAplicada / 100));
  const totalPrimeiroPagamento = roundCurrency(parcelaMensal + taxaSetup);
  const description = `${settings.pix_descricao_padrao || 'Facil Imob'} - ${req.body.cliente_nome}`.slice(0, 72);

  const pix = createStaticPix({
    merchantName: settings.pix_nome_recebedor,
    merchantCity: settings.pix_cidade,
    pixKey: settings.pix_chave,
    infoAdicional: description,
    transactionAmount: totalPrimeiroPagamento
  });

  if (hasError(pix)) {
    return res.status(400).json({ error: 'Dados Pix invalidos nas configuracoes.' });
  }

  const pixPayload = pix.toBRCode();
  const { data, error } = await supabase
    .from('simulations')
    .insert({
      colaborador_id: req.user.id,
      cliente_nome: req.body.cliente_nome.trim(),
      cliente_cpf: onlyDigits(req.body.cliente_cpf),
      cliente_telefone: onlyDigits(req.body.cliente_telefone),
      cliente_email: req.body.cliente_email.trim().toLowerCase(),
      valor_aluguel: valorAluguel,
      taxa_setup_aplicada: taxaSetup,
      opcao_escolhida: opcao,
      taxa_aplicada: taxaAplicada,
      parcela_mensal: parcelaMensal,
      total_primeiro_pagamento: totalPrimeiroPagamento,
      pix_payload: pixPayload
    })
    .select('*')
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const qr_code = await QRCode.toDataURL(pixPayload, { margin: 1, width: 260 });
  const [simulation] = await attachCollaborators([data]);
  res.status(201).json({ ...simulation, qr_code });
});

function validateSimulation(body) {
  if (!body.cliente_nome || body.cliente_nome.trim().split(/\s+/).length < 2) {
    return 'Informe o nome completo do cliente.';
  }

  if (!isValidCpf(body.cliente_cpf)) {
    return 'CPF invalido.';
  }

  if (onlyDigits(body.cliente_telefone).length < 10) {
    return 'Telefone invalido.';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.cliente_email || ''))) {
    return 'E-mail invalido.';
  }

  if (money(body.valor_aluguel) <= 0) {
    return 'Informe o valor mensal do aluguel.';
  }

  if (money(body.taxa_setup_aplicada) < 0) {
    return 'A taxa de setup nao pode ser negativa.';
  }

  if (!['com_fci', 'sem_fci'].includes(body.opcao_escolhida)) {
    return 'Selecione uma opcao.';
  }

  return null;
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);

  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
    return false;
  }

  const calc = (factor) => {
    let total = 0;
    for (let i = 0; i < factor - 1; i += 1) {
      total += Number(cpf[i]) * (factor - i);
    }
    const digit = (total * 10) % 11;
    return digit === 10 ? 0 : digit;
  };

  return calc(10) === Number(cpf[9]) && calc(11) === Number(cpf[10]);
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function money(value) {
  return Number(value || 0);
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function escapeSearch(value) {
  return String(value).replace(/[%*,()]/g, '');
}

async function attachCollaborators(rows) {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.colaborador_id) {
        return { ...row, colaborador_nome: 'Sem colaborador', colaborador_email: '' };
      }

      const { data } = await supabaseAdmin.auth.admin.getUserById(row.colaborador_id);
      return {
        ...row,
        colaborador_nome: data?.user?.user_metadata?.name || data?.user?.email || 'Colaborador',
        colaborador_email: data?.user?.email || ''
      };
    })
  );
}

export default router;
