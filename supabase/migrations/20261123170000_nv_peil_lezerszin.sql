-- Leesbare zin per aangekondigde PEIL-wijziging (besluit 23-11-2026). PEIL zelf wordt nooit aangepast.
create table if not exists public.nv_peil_lezerszin (
  parameter_id text primary key,
  bron_hash text not null,
  zin text not null,
  model text,
  aangemaakt_op timestamptz not null default now()
);
alter table public.nv_peil_lezerszin enable row level security;
