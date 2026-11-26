-- PEIL streng (besluit 26-11-2026): signalen met soort, zekerheid en redactiebesluit.
-- Wordt door de regisseur toegepast; de code werkt ook zolang dit nog niet is gebeurd.
alter table public.nv_peil_signalen
  add column if not exists soort text not null default 'wijziging',
  add column if not exists zekerheid text,
  add column if not exists nieuwe_waarde text,
  add column if not exists huidige_waarde text,
  add column if not exists vanaf text,
  add column if not exists definitief boolean,
  add column if not exists twijfel text,
  add column if not exists citaat text,
  add column if not exists bron_url text,
  add column if not exists titel text,
  add column if not exists aantal integer not null default 1,
  add column if not exists besluit text,
  add column if not exists besluit_op timestamptz;

alter table public.nv_peil_signalen drop constraint if exists nv_peil_signalen_status_check;
alter table public.nv_peil_signalen add constraint nv_peil_signalen_status_check
  check (status in ('gesignaleerd','bekeken','verwerkt','afgewezen','vastgesteld','verwacht','raakt_niet','lijst','niet_nodig'));
alter table public.nv_peil_signalen drop constraint if exists nv_peil_signalen_soort_check;
alter table public.nv_peil_signalen add constraint nv_peil_signalen_soort_check check (soort in ('wijziging','ontbreekt'));
alter table public.nv_peil_signalen drop constraint if exists nv_peil_signalen_zekerheid_check;
alter table public.nv_peil_signalen add constraint nv_peil_signalen_zekerheid_check check (zekerheid is null or zekerheid in ('groen','oranje'));

create index if not exists nv_peil_signalen_soort_status on public.nv_peil_signalen (soort, status);
-- Oude signalen (zekerheid leeg, van vóór PEIL streng) blijven staan maar worden nergens meer getoond.
