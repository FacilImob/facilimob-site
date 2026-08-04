import express from 'express';
import { supabaseAdmin } from '../supabaseAdmin.js';

const router = express.Router();
const RD_CONVERSIONS_URL = 'https://www.rdstation.com.br/api/1.3/conversions';

router.post('/', async (req, res) => {
  const token = process.env.RD_STATION_TOKEN;
  const lead = normalizeLead(req.body);

  if (!lead.name || !lead.email || !lead.personal_phone || !lead.cf_perfil) {
    return res.status(400).json({ error: 'Dados obrigatorios nao informados.' });
  }

  await storeLead(lead);

  if (!token) {
    return res.status(202).json({ ok: true, rdConfigured: false });
  }

  try {
    const response = await fetch(RD_CONVERSIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...lead,
        token_rdstation: token
      })
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Falha ao enviar lead ao RD Station.' });
    }

    return res.json({ ok: true, rdConfigured: true });
  } catch {
    return res.status(502).json({ error: 'Falha ao enviar lead ao RD Station.' });
  }
});

function normalizeLead(body = {}) {
  return {
    name: clean(body.name),
    email: clean(body.email),
    personal_phone: clean(body.personal_phone || body.phone),
    cf_perfil: clean(body.cf_perfil || body.profile),
    cf_mensagem: clean(body.cf_mensagem || body.message),
    identificador: clean(body.identificador) || 'site-facilimob-garantia',
    traffic_source: 'Site FacilImob'
  };
}

async function storeLead(lead) {
  try {
    await supabaseAdmin.from('site_leads').insert({
      nome: lead.name,
      email: lead.email,
      telefone: lead.personal_phone,
      perfil: lead.cf_perfil,
      mensagem: lead.cf_mensagem,
      origem: lead.identificador
    });
  } catch (error) {
    console.warn('[leads] Nao foi possivel registrar lead no painel do site:', error.message);
  }
}

function clean(value) {
  return String(value || '').trim();
}

export default router;
