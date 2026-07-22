create table if not exists public.settings (
  id integer primary key generated always as identity,
  taxa_com_fci numeric not null default 10,
  taxa_sem_fci numeric not null default 13,
  taxa_setup_padrao numeric not null default 0,
  pix_tipo_chave text not null default 'cpf',
  pix_chave text not null default '',
  pix_nome_recebedor text not null default '',
  pix_cidade text not null default '',
  pix_descricao_padrao text not null default 'Facil Imob',
  atualizado_em timestamptz not null default now()
);

insert into public.settings (id) overriding system value values (1) on conflict (id) do nothing;

create table if not exists public.simulations (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  cliente_nome text not null,
  cliente_cpf text not null,
  cliente_telefone text not null,
  cliente_email text not null,
  valor_aluguel numeric not null,
  taxa_setup_aplicada numeric not null,
  opcao_escolhida text not null check (opcao_escolhida in ('com_fci','sem_fci')),
  taxa_aplicada numeric not null,
  parcela_mensal numeric not null,
  total_primeiro_pagamento numeric not null,
  pix_payload text not null
);

alter table public.settings enable row level security;
alter table public.simulations enable row level security;

drop policy if exists "authenticated read settings" on public.settings;
drop policy if exists "authenticated update settings" on public.settings;
drop policy if exists "authenticated read simulations" on public.simulations;
drop policy if exists "authenticated insert simulations" on public.simulations;

create policy "authenticated read settings" on public.settings
  for select using (auth.role() = 'authenticated');
create policy "authenticated update settings" on public.settings
  for update using (auth.role() = 'authenticated');

create policy "authenticated read simulations" on public.simulations
  for select using (auth.role() = 'authenticated');
create policy "authenticated insert simulations" on public.simulations
  for insert with check (auth.role() = 'authenticated');
