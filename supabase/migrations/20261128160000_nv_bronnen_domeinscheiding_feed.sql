-- Domeinscheiding scherper (28-11-2026, herstelronde 1 redactie-app): de trigger op nv_bronnen toetst nu ook het domein van de `feed`
-- (host uit de feed-url, zonder www), en een leeg `domein` is geen vrijbrief meer: dan telt alleen de feed-host, en zonder beide wordt de rij geweigerd.
-- Een actief radardomein kan nooit nieuwsbron zijn en andersom (domein en subdomeinen, aan beide kanten, op domein en op feed-host).
-- `create or replace`: de bestaande trigger nv_bronnen_domeinscheiding blijft en gebruikt meteen de nieuwe functie. Veilig om opnieuw uit te voeren.
-- Wordt door de regisseur toegepast; de code-laag (isVerbodenBron, bronbeheer.ts) blijft zoals hij is.
create or replace function public.nv_host_van(t text) returns text language sql immutable as $f$
  select regexp_replace(
    lower(regexp_replace(regexp_replace(coalesce(t, ''), '^[A-Za-z][A-Za-z0-9+.-]*://', ''), '[/?#:].*$', '')),
    '^www\.', ''
  )
$f$;

create or replace function public.nv_bronnen_domeinscheiding() returns trigger language plpgsql as $f$
declare
  eigen text[] := array_remove(array[public.nv_host_van(new.domein), public.nv_host_van(new.feed)], '');
begin
  if coalesce(array_length(eigen, 1), 0) = 0 then
    raise exception 'Een bron heeft een domein of een feed-adres nodig.';
  end if;
  if exists (
    select 1
    from public.nv_bronnen b
    cross join lateral unnest(array_remove(array[public.nv_host_van(b.domein), public.nv_host_van(b.feed)], '')) as andere(h)
    cross join lateral unnest(eigen) as mijn(e)
    where b.id <> new.id
      and b.soort <> new.soort
      and (b.soort = 'radar' and b.actief or new.soort = 'radar' and new.actief)
      and (andere.h = mijn.e
        or right(andere.h, length(mijn.e) + 1) = '.' || mijn.e
        or right(mijn.e, length(andere.h) + 1) = '.' || andere.h)
  ) then
    raise exception 'Een domein dat radarbron is, kan niet ook nieuwsbron zijn (%).', array_to_string(eigen, ', ');
  end if;
  return new;
end
$f$;
