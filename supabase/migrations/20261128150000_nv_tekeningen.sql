-- Getekende beelden voor de redactie-app (28-11-2026): de redactie laat het synthesemodel een SVG tekenen bij een bericht.
-- 1. Een publiek leesbare Storage-bucket 'nv-tekeningen' (alleen SVG, hooguit 60 kB per bestand). Schrijven gaat met de service-role-sleutel
--    vanuit de server. Bestaat de bucket niet (deze migratie nog niet toegepast), dan maakt de app hem bij het eerste gebruik zelf via de
--    Storage-API met dezelfde sleutel; deze migratie legt vast wat daar nodig is.
-- 2. Een lijst nv_tekeningen (id, bericht_id, url, naam, gemaakt_op), zodat getekende beelden later in de beeldbank kunnen.
--    Tekeningen komen NIET automatisch in public/illustraties/: dat blijft een handmatige beeldbankstap.
-- Wordt door de regisseur toegepast. Veilig om opnieuw uit te voeren.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('nv-tekeningen', 'nv-tekeningen', true, 61440, array['image/svg+xml'])
    on conflict (id) do update set public = true, file_size_limit = 61440, allowed_mime_types = array['image/svg+xml'];
  end if;
end $$;

create table if not exists public.nv_tekeningen (
  id uuid primary key default gen_random_uuid(),
  bericht_id uuid null references public.nv_berichten(id) on delete set null,
  url text not null,
  naam text not null,
  gemaakt_op timestamptz not null default now()
);

create index if not exists nv_tekeningen_bericht_idx on public.nv_tekeningen (bericht_id);

-- Alleen de server (service role) leest en schrijft de lijst; RLS aan zonder beleid.
alter table public.nv_tekeningen enable row level security;
