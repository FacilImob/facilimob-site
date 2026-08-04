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

create table if not exists public.shared_simulations (
  id uuid primary key default gen_random_uuid(),
  share_hash text not null unique,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  criado_por uuid references auth.users(id),
  dados jsonb not null
);

alter table public.settings enable row level security;
alter table public.simulations enable row level security;
alter table public.shared_simulations enable row level security;

drop policy if exists "authenticated read settings" on public.settings;
drop policy if exists "authenticated update settings" on public.settings;
drop policy if exists "authenticated read simulations" on public.simulations;
drop policy if exists "authenticated insert simulations" on public.simulations;
drop policy if exists "authenticated read shared simulations" on public.shared_simulations;

create policy "authenticated read settings" on public.settings
  for select using (auth.role() = 'authenticated');
create policy "authenticated update settings" on public.settings
  for update using (auth.role() = 'authenticated');

create policy "authenticated read simulations" on public.simulations
  for select using (auth.role() = 'authenticated');
create policy "authenticated insert simulations" on public.simulations
  for insert with check (auth.role() = 'authenticated');

create policy "authenticated read shared simulations" on public.shared_simulations
  for select using (auth.role() = 'authenticated');

create index if not exists shared_simulations_share_hash_idx on public.shared_simulations (share_hash);
create index if not exists shared_simulations_expira_em_idx on public.shared_simulations (expira_em);

create table if not exists public.site_settings (
  id integer primary key generated always as identity,
  telefone text not null default '',
  whatsapp text not null default '5543936181186',
  email text not null default 'contato@facilimob.com',
  endereco text not null default '',
  horario_atendimento text not null default '',
  instagram_url text not null default '',
  facebook_url text not null default '',
  linkedin_url text not null default '',
  logo_url text not null default '/assets/logo-facilimob-horizontal-cropped.png',
  favicon_url text not null default '/assets/favicon.png',
  rodape_texto text not null default 'FacilImob - Garantia de Aluguel',
  politica_privacidade text not null default '',
  cta_principal text not null default 'Quero alugar sem fiador',
  cta_secundario text not null default 'Falar com um consultor',
  google_analytics_id text not null default '',
  meta_pixel_id text not null default '',
  crm_webhook_url text not null default '',
  blog_ativo boolean not null default false,
  depoimentos_ativo boolean not null default true,
  parceiros_ativo boolean not null default false,
  destinatarios_formularios text not null default 'contato@facilimob.com',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);

insert into public.site_settings (id) overriding system value values (1) on conflict (id) do nothing;

create table if not exists public.site_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  titulo text not null,
  subtitulo text not null default '',
  conteudo text not null default '',
  missao text not null default '',
  historia text not null default '',
  diferenciais text not null default '',
  banner_url text not null default '',
  seo_titulo text not null default '',
  seo_descricao text not null default '',
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);

insert into public.site_pages (slug, titulo, subtitulo)
values ('quem-somos', 'Quem somos', 'Garantia locaticia simples, segura e direta.')
on conflict (slug) do nothing;

create table if not exists public.site_blog_posts (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  slug text not null unique,
  resumo text not null default '',
  conteudo text not null default '',
  categoria text not null default '',
  autor text not null default '',
  publicado_em date,
  imagem_url text not null default '',
  seo_titulo text not null default '',
  seo_descricao text not null default '',
  ativo boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);

create table if not exists public.site_testimonials (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'cliente',
  texto text not null default '',
  foto_url text not null default '',
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);

create table if not exists public.site_partners (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  logo_url text not null default '',
  site_url text not null default '',
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);

create table if not exists public.site_leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null default '',
  email text not null default '',
  telefone text not null default '',
  perfil text not null default '',
  mensagem text not null default '',
  origem text not null default 'site',
  criado_em timestamptz not null default now()
);

create table if not exists public.site_change_logs (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references auth.users(id),
  usuario_email text not null default '',
  entidade text not null,
  entidade_id text not null default '',
  acao text not null,
  resumo text not null default '',
  criado_em timestamptz not null default now()
);

alter table public.site_settings enable row level security;
alter table public.site_pages enable row level security;
alter table public.site_blog_posts enable row level security;
alter table public.site_testimonials enable row level security;
alter table public.site_partners enable row level security;
alter table public.site_leads enable row level security;
alter table public.site_change_logs enable row level security;

drop policy if exists "authenticated read site settings" on public.site_settings;
drop policy if exists "authenticated update site settings" on public.site_settings;
drop policy if exists "authenticated manage site pages" on public.site_pages;
drop policy if exists "authenticated manage blog posts" on public.site_blog_posts;
drop policy if exists "authenticated manage testimonials" on public.site_testimonials;
drop policy if exists "authenticated manage partners" on public.site_partners;
drop policy if exists "authenticated read site leads" on public.site_leads;
drop policy if exists "authenticated read site change logs" on public.site_change_logs;

create policy "authenticated read site settings" on public.site_settings
  for select using (auth.role() = 'authenticated');
create policy "authenticated update site settings" on public.site_settings
  for update using (auth.role() = 'authenticated');
create policy "authenticated manage site pages" on public.site_pages
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated manage blog posts" on public.site_blog_posts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated manage testimonials" on public.site_testimonials
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated manage partners" on public.site_partners
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read site leads" on public.site_leads
  for select using (auth.role() = 'authenticated');
create policy "authenticated read site change logs" on public.site_change_logs
  for select using (auth.role() = 'authenticated');

insert into storage.buckets (id, name, public)
values ('site-media', 'site-media', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "authenticated upload site media" on storage.objects;
drop policy if exists "public read site media" on storage.objects;

create policy "authenticated upload site media" on storage.objects
  for all using (bucket_id = 'site-media' and auth.role() = 'authenticated')
  with check (bucket_id = 'site-media' and auth.role() = 'authenticated');
create policy "public read site media" on storage.objects
  for select using (bucket_id = 'site-media');
