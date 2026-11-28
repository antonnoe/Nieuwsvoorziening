-- Radar (besluit opdrachtgever 28-11-2026, keuze A): onderwerpsignalen voor de redactie.
-- HARDE REGEL: de signaalbron (The Connexion) is uitsluitend een onderwerpsignaal en nooit een bron; in deze tabel
-- staan alleen de signaal-url, de datum, een eigen Nederlandse werktitel en de Franse overheidsbron(nen) uit onze eigen opslag.
-- Wordt door de regisseur toegepast; de motor werkt ook zolang dit nog niet is gebeurd (de radar slaat dan over).
-- Veilig om opnieuw uit te voeren.
create table if not exists public.nv_radar (
  id uuid primary key default gen_random_uuid(),
  signaal_url text not null unique,
  signaal_datum timestamptz not null,
  werktitel text not null,
  categorie text not null default 'Overig',
  relevantie text not null default '',
  status text not null,
  -- lijst van {naam, url, datum} (een Franse overheidsbron of publieke instelling), of null
  primaire_bron jsonb null,
  bericht_id uuid null references public.nv_berichten(id) on delete set null,
  beoordeeld_op timestamptz not null default now(),
  besluit text null,
  besluit_op timestamptz null
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nv_radar_status_waarde') then
    alter table public.nv_radar add constraint nv_radar_status_waarde
      check (status in ('klaar voor redactie', 'handmatige broncheck vereist', 'al gepubliceerd'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nv_radar_categorie_waarde') then
    alter table public.nv_radar add constraint nv_radar_categorie_waarde
      check (categorie in ('Vastgoed', 'Belastingen', 'Zorg', 'Verkeer', 'Energie', 'Consumentenrecht', 'Overig'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nv_radar_besluit_waarde') then
    alter table public.nv_radar add constraint nv_radar_besluit_waarde
      check (besluit is null or besluit in ('geaccepteerd', 'afgewezen'));
  end if;
end $$;

create index if not exists nv_radar_open_idx on public.nv_radar (signaal_datum desc) where besluit is null;
create index if not exists nv_radar_beoordeeld_idx on public.nv_radar (beoordeeld_op);

-- Alleen de server (service role) leest en schrijft; RLS aan zonder beleid. Opruimen na 30 dagen gebeurt door de motor.
alter table public.nv_radar enable row level security;
