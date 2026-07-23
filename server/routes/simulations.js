import { Router } from 'express';
import QRCode from 'qrcode';
import { createStaticPix, hasError } from 'pix-utils';
import { requireAuth } from '../middleware/auth.js';
import { supabaseAdmin, userClient } from '../supabaseAdmin.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const filters = parseSimulationFilters(req.query);

  if (filters.error) {
    return res.status(400).json({ error: filters.error });
  }

  const { search, dateFrom, dateTo, option, rentMin, rentMax } = filters;
  const supabase = userClient(req.accessToken);
  let query = supabase.from('simulations').select('*').order('criado_em', { ascending: false }).limit(100);

  if (search) {
    const digits = onlyDigits(search);
    query = query.or(`cliente_nome.ilike.%${escapeSearch(search)}%,cliente_cpf.ilike.%${escapeSearch(digits || search)}%`);
  }

  if (dateFrom) {
    query = query.gte('criado_em', dateFrom.toISOString());
  }

  if (dateTo) {
    query = query.lte('criado_em', dateTo.toISOString());
  }

  if (option) {
    query = query.eq('opcao_escolhida', option);
  }

  if (rentMin !== null) {
    query = query.gte('valor_aluguel', rentMin);
  }

  if (rentMax !== null) {
    query = query.lte('valor_aluguel', rentMax);
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

router.post('/pix-preview', requireAuth, async (req, res) => {
  const supabase = userClient(req.accessToken);
  const { data: settings, error: settingsError } = await supabase.from('settings').select('*').eq('id', 1).single();

  if (settingsError) {
    return res.status(500).json({ error: settingsError.message });
  }

  const result = await buildPixSimulation(req.body, settings, req.user);

  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }

  res.json(result.data);
});

router.patch('/:id/option', requireAuth, async (req, res) => {
  const opcao = String(req.body.opcao_escolhida || '').trim();

  if (!isUuid(req.params.id)) {
    return res.status(400).json({ error: 'Simulacao invalida.' });
  }

  if (!['com_fci', 'sem_fci'].includes(opcao)) {
    return res.status(400).json({ error: 'Modalidade invalida.' });
  }

  const supabase = userClient(req.accessToken);
  const { data: current, error: currentError } = await supabase
    .from('simulations')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (currentError || !current) {
    return res.status(404).json({ error: 'Simulacao nao encontrada.' });
  }

  const { data: settings, error: settingsError } = await supabase.from('settings').select('*').eq('id', 1).single();

  if (settingsError) {
    return res.status(500).json({ error: settingsError.message });
  }

  const result = await buildPixSimulation(
    {
      cliente_nome: current.cliente_nome,
      cliente_cpf: current.cliente_cpf,
      cliente_telefone: current.cliente_telefone,
      cliente_email: current.cliente_email,
      valor_aluguel: current.valor_aluguel,
      taxa_setup_aplicada: current.taxa_setup_aplicada,
      opcao_escolhida: opcao
    },
    settings,
    req.user
  );

  if (result.error) {
    return res.status(result.status || 400).json({ error: result.error });
  }

  const { qr_code, ...updatedValues } = result.data;
  const { data, error } = await supabaseAdmin
    .from('simulations')
    .update({
      opcao_escolhida: updatedValues.opcao_escolhida,
      taxa_aplicada: updatedValues.taxa_aplicada,
      parcela_mensal: updatedValues.parcela_mensal,
      total_primeiro_pagamento: updatedValues.total_primeiro_pagamento,
      pix_payload: updatedValues.pix_payload
    })
    .eq('id', req.params.id)
    .select('*')
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const [simulation] = await attachCollaborators([data]);
  res.json({ ...simulation, qr_code });
});

router.delete('/', requireAuth, async (req, res) => {
  const { data: rows } = await supabaseAdmin.from('simulations').select('id');
  const { error } = await supabaseAdmin.from('simulations').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  console.info(
    '[simulations:clear-history]',
    JSON.stringify({
      userId: req.user.id,
      userEmail: req.user.email,
      count: rows?.length || 0
    })
  );

  res.json({ ok: true, count: rows?.length || 0 });
});

router.delete('/bulk', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.filter((id) => isUuid(id)) : [];

  if (!ids.length) {
    return res.status(400).json({ error: 'Selecione ao menos uma simulacao.' });
  }

  const { error } = await supabaseAdmin.from('simulations').delete().in('id', ids);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  console.info(
    '[simulations:bulk-delete]',
    JSON.stringify({
      userId: req.user.id,
      userEmail: req.user.email,
      count: ids.length,
      ids
    })
  );

  res.json({ ok: true, count: ids.length });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabaseAdmin.from('simulations').delete().eq('id', req.params.id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ ok: true });
});

function parseSimulationFilters(query) {
  const search = String(query.search || '').trim();
  const option = String(query.opcao || query.option || '').trim();
  const rentMinRaw = String(query.valor_min || query.rent_min || '').trim();
  const rentMaxRaw = String(query.valor_max || query.rent_max || '').trim();
  const dateFromRaw = String(query.data_inicial || query.date_from || '').trim();
  const dateToRaw = String(query.data_final || query.date_to || '').trim();

  if (option && !['com_fci', 'sem_fci'].includes(option)) {
    return { error: 'Modalidade invalida.' };
  }

  const rentMin = rentMinRaw ? Number(rentMinRaw) : null;
  const rentMax = rentMaxRaw ? Number(rentMaxRaw) : null;

  if ((rentMinRaw && !Number.isFinite(rentMin)) || (rentMaxRaw && !Number.isFinite(rentMax))) {
    return { error: 'Filtro de valor invalido.' };
  }

  if (rentMin !== null && rentMax !== null && rentMin > rentMax) {
    return { error: 'Valor minimo nao pode ser maior que o valor maximo.' };
  }

  const dateFrom = dateFromRaw ? new Date(`${dateFromRaw}T00:00:00`) : null;
  const dateTo = dateToRaw ? new Date(`${dateToRaw}T23:59:59.999`) : null;

  if ((dateFromRaw && Number.isNaN(dateFrom.getTime())) || (dateToRaw && Number.isNaN(dateTo.getTime()))) {
    return { error: 'Filtro de periodo invalido.' };
  }

  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { error: 'Data inicial nao pode ser maior que a data final.' };
  }

  return {
    search,
    option: option || '',
    rentMin,
    rentMax,
    dateFrom,
    dateTo
  };
}

export async function buildPixSimulation(body, settings, user = {}) {
  const validation = validateSimulation(body);

  if (validation) {
    return { error: validation, status: 400 };
  }

  if (!settings.pix_chave || !settings.pix_nome_recebedor || !settings.pix_cidade) {
    return { error: 'Configure a chave Pix, recebedor e cidade antes de gerar o Pix.', status: 400 };
  }

  const valorAluguel = money(body.valor_aluguel);
  const taxaSetup =
    body.taxa_setup_aplicada === undefined
      ? money(settings.taxa_setup_padrao)
      : money(body.taxa_setup_aplicada);
  const opcao = body.opcao_escolhida;
  const taxaAplicada = Number(opcao === 'com_fci' ? settings.taxa_com_fci : settings.taxa_sem_fci);
  const parcelaMensal = roundCurrency(valorAluguel * (taxaAplicada / 100));
  const totalPrimeiroPagamento = roundCurrency(parcelaMensal + taxaSetup);
  const description = `${settings.pix_descricao_padrao || 'Facil Imob'} - ${body.cliente_nome}`.slice(0, 72);

  const pix = createStaticPix({
    merchantName: settings.pix_nome_recebedor,
    merchantCity: settings.pix_cidade,
    pixKey: settings.pix_chave,
    infoAdicional: description,
    transactionAmount: totalPrimeiroPagamento
  });

  if (hasError(pix)) {
    return { error: 'Dados Pix invalidos nas configuracoes.', status: 400 };
  }

  const pixPayload = pix.toBRCode();
  const qr_code = await QRCode.toDataURL(pixPayload, { margin: 1, width: 260 });

  return {
    data: {
      cliente_nome: body.cliente_nome.trim(),
      cliente_cpf: onlyDigits(body.cliente_cpf),
      cliente_telefone: onlyDigits(body.cliente_telefone),
      cliente_email: String(body.cliente_email || '').trim().toLowerCase(),
      valor_aluguel: valorAluguel,
      taxa_setup_aplicada: taxaSetup,
      opcao_escolhida: opcao,
      taxa_aplicada: taxaAplicada,
      parcela_mensal: parcelaMensal,
      total_primeiro_pagamento: totalPrimeiroPagamento,
      pix_payload: pixPayload,
      qr_code,
      colaborador_nome: user.user_metadata?.name || user.app_metadata?.nome || user.email || ''
    }
  };
}

function validateSimulation(body) {
  if (!body.cliente_nome || body.cliente_nome.trim().split(/\s+/).length < 2) {
    return 'Informe o nome completo do cliente.';
  }

  if (!isValidCpfOrCnpj(body.cliente_cpf)) {
    return 'CPF/CNPJ invalido.';
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

function isValidCpfOrCnpj(value) {
  const digits = onlyDigits(value);

  if (digits.length === 14) {
    return isValidCnpj(digits);
  }

  const cpf = digits;
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

function isValidCnpj(cnpj) {
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) {
    return false;
  }

  const calc = (length) => {
    const factors = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const total = cnpj
      .slice(0, length)
      .split('')
      .reduce((sum, digit, index) => sum + Number(digit) * factors[index], 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
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
        colaborador_nome: data?.user?.user_metadata?.name || data?.user?.app_metadata?.nome || data?.user?.email || 'Colaborador',
        colaborador_email: data?.user?.email || ''
      };
    })
  );
}

export default router;
