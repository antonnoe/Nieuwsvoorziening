-- Kanalen en redactiebesluit (besluit opdrachtgever 26-11-2026, keuze A): Nieuwsvoorziening wordt de enige
-- nieuwsmotor. Veilig op een gevulde tabel: alleen toevoegen met standaardwaarden, geen herschrijving van bestaande
-- gegevens behalve de afleiding van `soort` uit het bestaande `regime`; opnieuw uitvoeren doet niets.

-- Waar een bericht verschijnt; de redactietool zet kanalen per bericht aan of uit.
alter table public.nv_berichten
  add column if not exists kanalen jsonb not null
  default '{"actueel":true,"nieuwsbrief":true,"infopoche":true,"zijbalk":true,"infofrankrijk":true}'::jsonb;

-- Redactiebesluit: null of 'weg' (een bericht met 'weg' verschijnt nergens).
alter table public.nv_berichten add column if not exists redactie text null;
alter table public.nv_berichten add column if not exists redactie_op timestamptz null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nv_berichten_redactie_waarde') then
    alter table public.nv_berichten add constraint nv_berichten_redactie_waarde check (redactie is null or redactie = 'weg');
  end if;
end $$;

-- Handmatige correctie door de redactie: een bericht met handmatig_op wordt door de motor nooit meer herschreven of overschreven.
alter table public.nv_berichten add column if not exists handmatig_op timestamptz null;

-- Herkenbaar kenmerk: 'overheid' of 'pers'.
alter table public.nv_berichten add column if not exists soort text not null default 'pers';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nv_berichten_soort_waarde') then
    alter table public.nv_berichten add constraint nv_berichten_soort_waarde check (soort in ('overheid', 'pers'));
  end if;
end $$;

-- Bestaande berichten met overheidsregime krijgen het kenmerk overheid (de rest blijft pers).
update public.nv_berichten set soort = 'overheid' where regime = 'overheid' and soort <> 'overheid';

-- Filter van de voorpagina en API: alleen wat niet 'weg' is.
create index if not exists nv_berichten_redactie_idx on public.nv_berichten (gepubliceerd_op desc) where redactie is null;
