-- Overheidskort (28-11-2026): per overheidsitem een korte Nederlandse kaart (titel, één of twee zinnen, thema) voor het tabblad Overheid
-- van /inbed, de redactie-app en /api/overheid. Wordt door de regisseur toegepast; de motor werkt ook zolang dit nog niet is gebeurd
-- (de stap overheidkort slaat dan over). Veilig om opnieuw uit te voeren.
create table if not exists public.nv_overheid_kort (
  id uuid primary key default gen_random_uuid(),
  -- de url van het bronitem (nv_bron_items.url) en tevens de link naar de officiële pagina; uniek zodat een item één kaart heeft
  item_url text not null unique,
  bron_naam text not null default '',
  bron_domein text not null default '',
  -- publicatiedatum van het item
  datum timestamptz not null,
  titel text not null,
  samenvatting text not null default '',
  thema text null,
  -- false: niet getoond (model vond het niet relevant, R17, Caribisch Nederland of afgekeurd; zie reden)
  relevant boolean not null default false,
  reden text null,
  gemaakt_op timestamptz not null default now(),
  redactie text null
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nv_overheid_kort_thema_waarde') then
    alter table public.nv_overheid_kort add constraint nv_overheid_kort_thema_waarde
      check (thema is null or thema in ('geld-belasting', 'praktisch', 'ondernemen', 'sociale-zekerheid', 'douane', 'economie', 'wetgeving', 'natuur-milieu'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nv_overheid_kort_redactie_waarde') then
    alter table public.nv_overheid_kort add constraint nv_overheid_kort_redactie_waarde
      check (redactie is null or redactie = 'weg');
  end if;
end $$;

create index if not exists nv_overheid_kort_datum_idx on public.nv_overheid_kort (datum desc) where relevant;
create index if not exists nv_overheid_kort_gemaakt_idx on public.nv_overheid_kort (gemaakt_op);

-- Alleen de server (service role) leest en schrijft; RLS aan zonder beleid. Opruimen na 60 dagen gebeurt door de motor.
alter table public.nv_overheid_kort enable row level security;
