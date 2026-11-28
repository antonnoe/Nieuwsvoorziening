-- Bronnen in de database (28-11-2026, redactie-app): de motor leest zijn bronnen uit deze tabel; ontbreekt ze, dan valt hij terug op
-- data/bronnen.json. Soort 'nieuws' wordt geoogst, soort 'radar' is uitsluitend onderwerpsignaal (nooit bron; The Connexion is de eerste rij).
-- HARDE REGEL ook hier: een domein dat radarbron is, kan niet ook nieuwsbron zijn (trigger hieronder, naast de controle in de code).
-- Wordt door de regisseur toegepast, VOOR de redactie-app wordt gebruikt om bronnen toe te voegen of weg te halen. Veilig om opnieuw uit te voeren.
-- De INSERT-regels zijn gegenereerd met: npx tsx scripts/genereer-bronnen-migratie.ts
create table if not exists public.nv_bronnen (
  id text primary key,
  naam text not null,
  feed text not null,
  domein text not null default '',
  taal text not null default 'fr',
  land text not null default 'FR',
  groep text not null default 'fr_pers',
  regime text not null default 'pers',
  status text not null default 'CONCEPT',
  prioriteit integer not null default 2,
  frankrijk_filter boolean not null default false,
  venster_uren integer not null default 48,
  notitie text null,
  soort text not null default 'nieuws',
  actief boolean not null default true,
  toegevoegd_op timestamptz not null default now(),
  toegevoegd_door text null,
  -- laatst_gelezen: laatste leesbeurt; laatst_items: laatste keer dat er minstens een item binnenkwam; laatste_fout: fout van de laatste beurt (null = gelukt)
  laatst_gelezen timestamptz null,
  laatst_items timestamptz null,
  laatste_fout text null,
  -- alleen radarbronnen: eigen uitsluitregels als lijst van {reden, patroon, vlaggen}; null = standaardlijst uit de code
  uitsluit jsonb null
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'nv_bronnen_soort_waarde') then
    alter table public.nv_bronnen add constraint nv_bronnen_soort_waarde check (soort in ('nieuws', 'radar'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nv_bronnen_status_waarde') then
    alter table public.nv_bronnen add constraint nv_bronnen_status_waarde check (status in ('ACTIVE', 'CONCEPT'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'nv_bronnen_regime_waarde') then
    alter table public.nv_bronnen add constraint nv_bronnen_regime_waarde check (regime in ('pers', 'overheid'));
  end if;
end $$;

create unique index if not exists nv_bronnen_feed_uniek on public.nv_bronnen (feed);
create index if not exists nv_bronnen_soort_idx on public.nv_bronnen (soort, actief);

-- Domeinscheiding: een actief radardomein kan geen nieuwsbron zijn en andersom.
create or replace function public.nv_bronnen_domeinscheiding() returns trigger language plpgsql as $f$
declare
  eigen text := lower(regexp_replace(coalesce(new.domein, ''), '^www\.', ''));
begin
  if eigen = '' then
    return new;
  end if;
  if exists (
    select 1 from public.nv_bronnen b
    where b.id <> new.id
      and b.soort <> new.soort
      and (b.soort = 'radar' and b.actief or new.soort = 'radar' and new.actief)
      and (lower(regexp_replace(coalesce(b.domein, ''), '^www\.', '')) = eigen
        or lower(regexp_replace(coalesce(b.domein, ''), '^www\.', '')) like '%.' || eigen
        or eigen like '%.' || lower(regexp_replace(coalesce(b.domein, ''), '^www\.', '')))
  ) then
    raise exception 'Een domein dat radarbron is, kan niet ook nieuwsbron zijn (%).', eigen;
  end if;
  return new;
end
$f$;

drop trigger if exists nv_bronnen_domeinscheiding on public.nv_bronnen;
create trigger nv_bronnen_domeinscheiding before insert or update of domein, soort, actief on public.nv_bronnen
  for each row execute function public.nv_bronnen_domeinscheiding();

-- Alleen de server (service role) leest en schrijft; RLS aan zonder beleid.
alter table public.nv_bronnen enable row level security;

-- Eenmalige vulling uit data/bronnen.json (ACTIVE en CONCEPT) en The Connexion als radarbron (met de standaard uitsluitlijst).
insert into public.nv_bronnen (id, naam, feed, domein, taal, land, groep, regime, status, prioriteit, frankrijk_filter, venster_uren, notitie, soort, actief, toegevoegd_door, uitsluit) values
  ('bbc-europe', 'BBC News - Europe', 'https://feeds.bbci.co.uk/news/world/europe/rss.xml', 'bbc.co.uk', 'en', 'GB', 'buitenlandse_pers', 'pers', 'CONCEPT', 2, true, 48, 'Nieuw voorgesteld; feed-URL nog niet gecontroleerd, daarom CONCEPT.', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('dw-europe', 'DW - Europe', 'https://rss.dw.com/rdf/rss-en-eu', 'dw.com', 'en', 'DE', 'buitenlandse_pers', 'pers', 'CONCEPT', 2, true, 48, 'Nieuw voorgesteld; feed-URL nog niet gecontroleerd, daarom CONCEPT.', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('guardian-france', 'The Guardian - France', 'https://www.theguardian.com/world/france/rss', 'theguardian.com', 'en', 'GB', 'buitenlandse_pers', 'pers', 'CONCEPT', 2, true, 48, 'Nieuw voorgesteld; feed-URL nog niet gecontroleerd, daarom CONCEPT.', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('20minutes-france', '20 Minutes - France', 'https://www.20minutes.fr/feeds/rss-france.xml', '20minutes.fr', 'fr', 'FR', 'fr_pers', 'pers', 'CONCEPT', 3, false, 48, 'Feed stilgevallen sinds ~10 juni 2026, hervalideren augustus 2026. (Validated 2026-07-06: 20 dated items, newest 2026-06-10; works technically but no fresh outp', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('actu-fr', 'actu.fr', 'https://actu.fr/rss.xml', 'actu.fr', 'fr', 'FR', 'fr_pers', 'pers', 'ACTIVE', 3, false, 48, 'URL correction: /feed -> HTTP 404; homepage advertises /rss.xml. Validated 2026-07-06: 30 dated items, newest same day.', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('economie-matin', 'Économie Matin', 'https://www.economiematin.fr/rss', 'economiematin.fr', 'fr', 'FR', 'fr_pers', 'pers', 'ACTIVE', 2, false, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('france24-france', 'France 24 - France', 'https://www.france24.com/fr/france/rss', 'france24.com', 'fr', 'FR', 'fr_pers', 'pers', 'ACTIVE', 2, false, 48, 'French-language France section feed. Validated 2026-07-06: 30 dated items, newest same day. Replaced English feed (/en/france/rss).', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('franceinfo-titres', 'Franceinfo — Titres', 'https://www.francetvinfo.fr/titres.rss', 'franceinfo.fr', 'fr', 'FR', 'fr_pers', 'pers', 'ACTIVE', 2, false, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('head-patrimoine', 'Head Patrimoine', 'https://www.headpatrimoine.fr/feed/', 'headpatrimoine.fr', 'fr', 'FR', 'fr_pers', 'pers', 'ACTIVE', 2, false, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('huffpost-fr', 'HuffPost France', 'https://www.huffingtonpost.fr/rss/all_headline.xml', 'huffingtonpost.fr', 'fr', 'FR', 'fr_pers', 'pers', 'ACTIVE', 3, false, 48, 'TESTBRON: trial source, evaluate before relying on it. URL correction: /rss/ -> HTTP 404; homepage advertises /rss/all_headline.xml. Validated 2026-07-06: 20 da', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('ici-france-bleu', 'ici (France Bleu / France 3)', 'https://www.ici.fr/rss', 'ici.fr', 'fr', 'FR', 'fr_pers', 'pers', 'CONCEPT', 3, false, 48, 'Uitgezet op verzoek: ici (France Bleu / France 3) hanteert een strikte auteursrechtelijke blokkade op hergebruik. Feed leverde bovendien 0 items. Niet gebruiken', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('le-figaro', 'Le Figaro — Actualités', 'https://www.lefigaro.fr/rss/figaro_actualites.xml', 'lefigaro.fr', 'fr', 'FR', 'fr_pers', 'pers', 'ACTIVE', 2, false, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('le-monde', 'Le Monde — À la une', 'https://www.lemonde.fr/rss/une.xml', 'lemonde.fr', 'fr', 'FR', 'fr_pers', 'pers', 'ACTIVE', 2, false, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('midi-libre', 'Midi Libre', 'https://www.midilibre.fr/rss.xml', 'midilibre.fr', 'fr', 'FR', 'fr_pers', 'pers', 'ACTIVE', 3, false, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('public-senat', 'Public Sénat', 'https://www.publicsenat.fr/feed', 'publicsenat.fr', 'fr', 'FR', 'fr_pers', 'pers', 'ACTIVE', 1, false, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('rfi-fr', 'RFI - France', 'https://www.rfi.fr/fr/france/rss', 'rfi.fr', 'fr', 'FR', 'fr_pers', 'pers', 'CONCEPT', 2, false, 48, 'Nieuw voorgesteld; feed-URL nog niet gecontroleerd, daarom CONCEPT.', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('sud-ouest', 'Sud Ouest', 'https://www.sudouest.fr/rss.xml', 'sudouest.fr', 'fr', 'FR', 'fr_pers', 'pers', 'ACTIVE', 3, false, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('nos-buitenland', 'NOS — Buitenland', 'https://feeds.nos.nl/nosnieuwsbuitenland', 'feeds.nos.nl', 'nl', 'NL', 'nl_vl_pers', 'pers', 'ACTIVE', 1, true, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('nu-nl-algemeen', 'NU.nl — Algemeen', 'https://www.nu.nl/rss/Algemeen', 'nu.nl', 'nl', 'NL', 'nl_vl_pers', 'pers', 'ACTIVE', 2, true, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('rtbf-info', 'RTBF Info', 'https://rss.rtbf.be/article/rss/rtbf_info_fil.xml', 'rtbf.be', 'fr', 'BE', 'nl_vl_pers', 'pers', 'CONCEPT', 2, true, 48, 'Nieuw voorgesteld; feed-URL nog niet gecontroleerd, daarom CONCEPT.', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('rtl-nieuws-buitenland', 'RTL Nieuws - Buitenland', 'https://www.rtl.nl/rss/buitenland.xml', 'rtl.nl', 'nl', 'NL', 'nl_vl_pers', 'pers', 'CONCEPT', 2, true, 48, 'Nieuw voorgesteld; feed-URL nog niet gecontroleerd, daarom CONCEPT.', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('vrt-nws', 'VRT NWS', 'https://www.vrt.be/vrtnws/nl.rss.articles.xml', 'vrt.be', 'nl', 'BE', 'nl_vl_pers', 'pers', 'ACTIVE', 3, true, 48, 'General news feed (Atom); france_title_filter keeps only items with Frankrijk/Frans(e)/Parijs/Macron in the title. Validated 2026-07-06: 50 dated items, newest ', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('ameli-assures', 'Ameli.fr - Assurés', 'https://www.ameli.fr/fil-rss.xml', 'ameli.fr', 'fr', 'FR', 'overheid', 'overheid', 'CONCEPT', 2, false, 48, 'Validated 2026-07-06: HTTP 403 (anti-bot) on /assure/actualites/rss, /rss/assure.xml, /fil-rss.xml and the actualites page itself. Pipeline cannot pass.', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('bercy-economie', 'Bercy — Ministère de l''Économie', 'https://www.economie.gouv.fr/rss/toutesactualites', 'economie.gouv.fr', 'fr', 'FR', 'overheid', 'overheid', 'ACTIVE', 1, false, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('bison-fute', 'Bison Futé', 'https://www.bison-fute.gouv.fr/rss.xml', 'bison-fute.gouv.fr', 'fr', 'FR', 'overheid', 'overheid', 'CONCEPT', 2, false, 48, 'Validated 2026-07-06: /rss.xml -> HTTP 404 and the homepage advertises no feed links. Could not be promoted to ACTIVE.', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('boss', 'BOSS — Bulletin Officiel de la Sécurité Sociale', 'https://boss.gouv.fr/portail/fil-rss/pagecontent/flux-actualites.rss', 'boss.gouv.fr', 'fr', 'FR', 'overheid', 'overheid', 'CONCEPT', 2, false, 48, 'Uitgezet: de feed gaf herhaaldelijk een timeout vanaf Vercel (bron-status http=timeout op 03-08-2026). Server-side niet betrouwbaar bereikbaar. Later opnieuw pr Opnieuw gecontroleerd 26-11-2026 vanaf de bouwomgeving: geen antwoord (verbinding afgebroken). Blijft CONCEPT.', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('douane', 'Douane — douane.gouv.fr', 'https://www.douane.gouv.fr/rss.xml', 'douane.gouv.fr', 'fr', 'FR', 'overheid', 'overheid', 'ACTIVE', 2, false, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('rijksoverheid-nl', 'Rijksoverheid — Nieuws', 'https://www.rijksoverheid.nl/api/rss?query=%7B%22filters%22%3A%5B%5D%2C%22resultSearchTerm%22%3A%22%22%7D', 'rijksoverheid.nl', 'nl', 'NL', 'overheid', 'overheid', 'ACTIVE', 3, false, 48, 'Overgenomen uit nlfr-menu (26-11-2026). Feed gecontroleerd op 26-11-2026: HTTP 200 en 20 geldige items. Nederlands binnenlands bestuur komt alleen door als het Nederlanders in Frankrijk of het buitenland raakt (regel R17, lib/motor/overheidpoort.ts); Caribisch Nederland nooit.', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('impots-gouv', 'impots.gouv.fr', 'https://www.impots.gouv.fr/rss.xml', 'impots.gouv.fr', 'fr', 'FR', 'overheid', 'overheid', 'CONCEPT', 2, false, 48, 'Validated 2026-07-06: no working feed found. /rss.xml and /actualites/rss -> HTTP 404; /portail/rss.xml redirects to /accueil (HTML); homepage advertises no RSS', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('info-gouv', 'info.gouv.fr — Gouvernement', 'https://www.info.gouv.fr/rss.xml', 'info.gouv.fr', 'fr', 'FR', 'overheid', 'overheid', 'CONCEPT', 2, false, 48, 'Uitgezet: info.gouv.fr zit achter Cloudflare-botbescherming die serverside fetches blokkeert (⚪ bevestigd op de preview). Geen bruikbare, niet-geblokkeerde publ Opnieuw gecontroleerd 26-11-2026: HTTP 403 (Cloudflare-controle). Blijft CONCEPT.', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('nederlandwereldwijd-frankrijk', 'Nederland Wereldwijd - Frankrijk', 'https://www.nederlandwereldwijd.nl/rss.xml', 'nederlandwereldwijd.nl', 'nl', 'NL', 'overheid', 'overheid', 'CONCEPT', 2, true, 48, 'Validated 2026-07-06: feeds.nederlandwereldwijd.nl does not resolve (DNS ENOTFOUND); www.nederlandwereldwijd.nl/rss -> 404; no RSS links on the Frankrijk reisad', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('ofb', 'OFB — Office français de la biodiversité', 'https://ofb.gouv.fr/rss.xml', 'ofb.gouv.fr', 'fr', 'FR', 'overheid', 'overheid', 'ACTIVE', 2, false, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('rvo-frankrijk', 'RVO - Frankrijk', 'https://www.rvo.nl/rss.xml', 'rvo.nl', 'nl', 'NL', 'overheid', 'overheid', 'CONCEPT', 3, true, 48, 'feed_url needs verification.', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('service-public-particuliers', 'Service-Public — particuliers', 'https://www.service-public.fr/abonnements/rss/actu-actualites-particuliers.rss', 'service-public.gouv.fr', 'fr', 'FR', 'overheid', 'overheid', 'ACTIVE', 1, false, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('service-public-pro', 'Service-Public — professionnels', 'https://www.service-public.fr/abonnements/rss/actu-actu-pro.rss', 'service-public.gouv.fr', 'fr', 'FR', 'overheid', 'overheid', 'ACTIVE', 2, false, 48, 'geverifieerd', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('vie-publique', 'vie-publique.fr', 'https://www.vie-publique.fr/actualites-feeds.xml', 'vie-publique.fr', 'fr', 'FR', 'overheid', 'overheid', 'ACTIVE', 3, false, 336, 'Actualités-feed (brèves, articles, dossiers). Juiste RSS-URL door Anton aangeleverd op 03-08-2026; de oude rss.xml gaf 0 items. Venster op 14 dagen (trage publi', 'nieuws', true, 'bronnen.json (eenmalige vulling)', null),
  ('connexion-radar', 'The Connexion (radar)', 'https://www.connexionfrance.com/tag/news?lab_viewport=newssitemap', 'connexionfrance.com', 'en', 'FR', 'buitenlandse_pers', 'pers', 'ACTIVE', 3, false, 72, 'Uitsluitend onderwerpsignaal voor de radar; nooit bron.', 'radar', true, 'bronnen.json (eenmalige vulling)', '[{"reden":"brexit","patroon":"\\bbrexit\\b|\\bpost-brexit\\b|withdrawal agreement","vlaggen":"i"},{"reden":"uk/brits","patroon":"\\bUK\\b|\\bU\\.K\\.|\\bbrit(?:ish|ons?|s|ain)\\b|\\bengland\\b|\\benglish\\b|\\bscot(?:land|tish)\\b|\\bwelsh\\b|\\banglo-","vlaggen":"i"},{"reden":"visa voor niet-eu","patroon":"\\bvisas?\\b|\\bnon-eu\\b|\\bthird[- ]country\\b","vlaggen":"i"},{"reden":"verblijfskaart voor britten","patroon":"carte de s[ée]jour|titre de s[ée]jour|residen(?:cy|ce) (?:card|permit|rules)","vlaggen":"i"},{"reden":"90/180-dagenregel","patroon":"\\b90\\s*(?:\\/|-|days? (?:in|out of))\\s*180\\b|\\b90-day rule\\b|\\b180-day\\b","vlaggen":"i"},{"reden":"ees/etias","patroon":"\\bEES\\b|\\bETIAS\\b|entry[/ -]exit system|travel authori[sz]ation","vlaggen":"i"},{"reden":"britse rijbewijzen","patroon":"driving licen[cs]e|permis de conduire britannique","vlaggen":"i"},{"reden":"uk-pensioenen","patroon":"state pension|\\bWASPI\\b|\\bS1 form\\b|\\bSERPS\\b","vlaggen":"i"},{"reden":"brits-franse verdragen","patroon":"le touquet|\\btreaty\\b.*\\b(?:france|uk|britain)\\b|\\b(?:france|uk|britain)\\b.*\\btreaty\\b|channel (?:crossing|tunnel deal)|small boats?","vlaggen":"i"},{"reden":"human interest/opinie","patroon":"\\bopinion\\b|\\bcolumn\\b|\\beditorial\\b|\\bletters?\\b|\\bobituary\\b|\\bin memoriam\\b|\\bmy (?:life|story)\\b|\\bmeet the\\b|\\bheart-?warming\\b|\\bviral\\b|\\bcelebrity\\b|\\bcouple (?:who|from)\\b","vlaggen":"i"},{"reden":"lifestyle/recept/reizen","patroon":"\\brecipes?\\b|\\bcooking\\b|\\bwines?\\b|\\bvineyards?\\b|\\blifestyle\\b|\\bhow to make\\b|\\bbest (?:places|villages|beaches|restaurants)\\b|\\bthings to do\\b|\\btravel tips?\\b|\\bweekend (?:in|break)\\b|\\bholiday (?:ideas|tips)\\b|\\bhoroscope\\b|\\bfashion\\b","vlaggen":"i"},{"reden":"sport","patroon":"\\brugby\\b|\\bfootball\\b|\\bsoccer\\b|\\bligue 1\\b|\\btour de france\\b|\\bcycling\\b|\\btennis\\b|\\broland[- ]garros\\b|\\bolympics?\\b|\\bparalympics?\\b|\\bformula (?:1|one)\\b|\\bgolf\\b|\\bmarathon\\b|\\bhandball\\b|\\bbasketball\\b|\\bsailing race\\b","vlaggen":"i"}]'::jsonb)
on conflict (id) do nothing;
