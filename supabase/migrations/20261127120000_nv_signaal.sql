-- Signaal voor InfoPoche ("Let op", besluit opdrachtgever 27-11-2026): een bericht is een wetswijziging, een kans of geen van beide.
-- Veilig op een gevulde tabel: alleen toevoegen; opnieuw uitvoeren doet niets. Bestaande berichten krijgen signaal null en
-- signaal_beoordeeld false; de nalooprun van de motor (laatste 14 dagen, 15 per run) beoordeelt ze en zet signaal_beoordeeld op true.

alter table public.nv_berichten add column if not exists signaal text null;
alter table public.nv_berichten add column if not exists signaal_beoordeeld boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nv_berichten_signaal_waarde') then
    alter table public.nv_berichten add constraint nv_berichten_signaal_waarde check (signaal is null or signaal in ('wetswijziging', 'kans'));
  end if;
end $$;

-- De nalooprun zoekt gepubliceerde berichten die nog niet beoordeeld zijn.
create index if not exists nv_berichten_signaal_onbeoordeeld_idx on public.nv_berichten (gepubliceerd_op desc) where signaal_beoordeeld = false;
