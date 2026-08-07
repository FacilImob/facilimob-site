create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  is_home boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published')),
  draft_json jsonb not null default '{}'::jsonb,
  published_json jsonb,
  seo_title text not null default '',
  seo_description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create unique index if not exists pages_single_home_idx
  on public.pages (is_home)
  where is_home;

create or replace function public.set_pages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_pages_updated_at on public.pages;

create trigger set_pages_updated_at
before update on public.pages
for each row
execute function public.set_pages_updated_at();
