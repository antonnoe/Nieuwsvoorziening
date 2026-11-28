-- Redacteuren voor de redactie-app (28-11-2026): persoonlijke inloglinks voor vrijwilligers, zonder mailservice.
-- In de database staat ALLEEN de SHA-256-hash van het token (64 hexcijfers), nooit het token zelf; het token zit in de link die
-- de beheerder eenmalig te zien krijgt. Intrekken zet ingetrokken_op: daarna is de link dicht.
-- Wordt door de regisseur toegepast; zolang dit niet is gebeurd kan alleen de beheerder (met REDACTIE_SECRET) inloggen.
-- Veilig om opnieuw uit te voeren.
create table if not exists public.nv_redacteuren (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  hash text not null,
  rol text not null default 'redacteur',
  gemaakt_op timestamptz not null default now(),
  laatst_gezien timestamptz null,
  ingetrokken_op timestamptz null
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nv_redacteuren_rol_waarde') then
    alter table public.nv_redacteuren add constraint nv_redacteuren_rol_waarde check (rol in ('redacteur', 'beheerder'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nv_redacteuren_hash_vorm') then
    alter table public.nv_redacteuren add constraint nv_redacteuren_hash_vorm check (hash ~ '^[0-9a-f]{64}$');
  end if;
end $$;

create unique index if not exists nv_redacteuren_hash_uniek on public.nv_redacteuren (hash);

-- Alleen de server (service role) leest en schrijft; RLS aan zonder beleid.
alter table public.nv_redacteuren enable row level security;
