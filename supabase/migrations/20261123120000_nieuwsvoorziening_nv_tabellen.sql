-- Nieuwsvoorziening: tabellen van de nieuwsmotor (prefix nv_).
-- Raakt de bestaande tabel news_items NIET aan. Wordt door de regisseur toegepast.
-- Alleen de server (service role) leest en schrijft; RLS staat aan zonder beleid.

create table if not exists public.nv_berichten (
  id uuid primary key default gen_random_uuid(),
  sleutel text not null unique,
  kop text not null,
  samenvatting text not null default '',
  tekst text not null default '',
  categorie text not null check (categorie in (
    'algemeen','politiek','economie en ondernemen','reizen en verkeer',
    'natuur en rampen','toerisme en evenementen','merkwaardig')),
  score integer not null default 0,
  regime text not null default 'pers' check (regime in ('pers','overheid')),
  status text not null default 'concept' check (status in ('gepubliceerd','geblokkeerd','concept')),
  blokkade_redenen text[] not null default '{}',
  beeld_url text,
  peil_raakt jsonb not null default '[]'::jsonb,
  peil_mogelijk_gewijzigd jsonb not null default '[]'::jsonb,
  model text,
  gepubliceerd_op timestamptz not null default now(),
  aangemaakt_op timestamptz not null default now()
);
create index if not exists nv_berichten_status_datum on public.nv_berichten (status, gepubliceerd_op desc);
create index if not exists nv_berichten_categorie on public.nv_berichten (categorie, gepubliceerd_op desc);

create table if not exists public.nv_bron_items (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  bron_id text not null,
  bron_naam text not null,
  regime text not null default 'pers',
  groep text,
  taal text,
  land text,
  titel text not null,
  samenvatting text not null default '',
  gepubliceerd_op timestamptz not null,
  opgehaald_op timestamptz not null default now(),
  verwerkt_op timestamptz,
  verwerking text,
  bericht_id uuid references public.nv_berichten(id) on delete set null
);
create index if not exists nv_bron_items_open on public.nv_bron_items (gepubliceerd_op desc) where verwerkt_op is null;
create index if not exists nv_bron_items_opgehaald on public.nv_bron_items (opgehaald_op);

create table if not exists public.nv_bronnen_per_bericht (
  id bigint generated always as identity primary key,
  bericht_id uuid not null references public.nv_berichten(id) on delete cascade,
  volgorde integer not null default 0,
  bron_naam text not null,
  originele_kop text not null,
  datum timestamptz,
  url text not null,
  unique (bericht_id, url)
);
create index if not exists nv_bronnen_per_bericht_bericht on public.nv_bronnen_per_bericht (bericht_id);

create table if not exists public.nv_peil_signalen (
  id uuid primary key default gen_random_uuid(),
  bericht_id uuid not null references public.nv_berichten(id) on delete cascade,
  parameter_id text not null,
  parameter_naam text,
  toelichting text,
  status text not null default 'gesignaleerd' check (status in ('gesignaleerd','bekeken','verwerkt','afgewezen')),
  aangemaakt_op timestamptz not null default now(),
  unique (bericht_id, parameter_id)
);
create index if not exists nv_peil_signalen_status on public.nv_peil_signalen (status, aangemaakt_op desc);

create table if not exists public.nv_oogst_runs (
  id uuid primary key default gen_random_uuid(),
  gestart_op timestamptz not null default now(),
  klaar_op timestamptz,
  droog boolean not null default false,
  stappen jsonb not null default '[]'::jsonb,
  aantallen jsonb not null default '{}'::jsonb,
  fouten jsonb not null default '[]'::jsonb
);
create index if not exists nv_oogst_runs_start on public.nv_oogst_runs (gestart_op desc);

alter table public.nv_berichten enable row level security;
alter table public.nv_bron_items enable row level security;
alter table public.nv_bronnen_per_bericht enable row level security;
alter table public.nv_peil_signalen enable row level security;
alter table public.nv_oogst_runs enable row level security;
-- Bewust geen beleid: alleen de service role (server) komt erbij. Publieke toegang loopt via /api/*.
