// Insee als overheidsbron (28-11-2026): de officiele RSS (flux 3, Publications conjoncturelles) levert items; echte momentopname als fixture.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leesFeed } from "../lib/motor/feeds";
import { laadBronnen } from "../lib/motor/config";
import { isOverheidsUrl } from "../lib/motor/radar";

const xml = readFileSync(new URL("./fixtures/insee-flux-publications-conjoncturelles.xml", import.meta.url), "utf8");
const bron = () => laadBronnen().find((b) => b.id === "insee-conjoncture")!;

test("Insee: de bron staat ACTIVE als overheid in bronnen.json, met de officiele feed", () => {
  const b = bron();
  assert.ok(b);
  assert.equal(b.feed, "https://www.insee.fr/fr/flux/3");
  assert.equal(b.regime, "overheid");
  assert.equal(b.groep, "overheid");
  assert.equal(b.status, "ACTIVE");
  assert.equal(b.frankrijkFilter, false);
});

test("Insee: feeds.ts leest de feed (titel, url, datum), ook de prijsberichten", () => {
  const items = leesFeed(xml, bron());
  assert.ok(items.length >= 5, `items: ${items.length}`);
  assert.ok(items.every((i) => i.regime === "overheid" && isOverheidsUrl(i.url) && i.titel && Number.isFinite(Date.parse(i.gepubliceerdOp))));
  const prijzen = items.filter((i) => /prix à la consommation/.test(i.titel));
  assert.ok(prijzen.length >= 1, "minstens een IPC-bericht");
  assert.match(prijzen[0].url, /^https:\/\/www\.insee\.fr\/fr\/statistiques\/\d+/);
  assert.match(prijzen[0].titel, /\d,\d %/, "de kop draagt het cijfer; de omschrijving van de prijsberichten is leeg, de artikeltekst komt via artikel.ts");
});

test("Insee: de migratie voegt dezelfde bron toe, ACTIVE, en is herhaalbaar", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261128180000_nv_bronnen_insee.sql", import.meta.url), "utf8");
  assert.match(sql, /'insee-conjoncture'.*'https:\/\/www\.insee\.fr\/fr\/flux\/3'.*'overheid', 'overheid', 'ACTIVE'/);
  assert.match(sql, /on conflict \(id\) do nothing/);
});
