import test from "node:test";
import assert from "node:assert/strict";
import { draaiOogst } from "../lib/motor/motor";
import { GeheugenOpslag } from "../lib/motor/opslag";
import { laadConfig, laadBronnen } from "../lib/motor/config";
import { leesSynthese } from "../lib/motor/synthese";
import { beeldVoor } from "../lib/motor/beeld";
import { bron, klein, rss } from "./helpers";

const nu = Date.now();
const cfg = laadConfig();
const tekst =
  "De afvalophaal in Marseille ligt sinds maandag stil door een staking van de vuilnismensen. Op straat stapelen de zakken zich op en het gemeentebestuur zoekt naar een oplossing met de vakbonden. Bewoners en toeristen in de havenstad merken het vooral in de drukke wijken bij de haven, waar de hoeveelheid afval snel toeneemt. Wie er verblijft, kan het best de aanwijzingen van de gemeente volgen.";
const synthese = (o: Record<string, unknown> = {}) =>
  JSON.stringify({ publiceren: true, kop: "Staking vuilnisophaal legt Marseille lam", samenvatting: "De vuilnisophaal in Marseille ligt stil door een staking en de afvalbergen groeien snel.", tekst, categorie: "algemeen", relevantie: 80, ...o });

const feedA = rss([{ titel: "Marseille: grève des éboueurs, les ordures s'accumulent", url: "https://a.test/1", datum: new Date(nu - 3600_000), omschrijving: "Les éboueurs de Marseille sont en grève depuis lundi." }]);
const feedB = rss([{ titel: "Grève des éboueurs à Marseille: les ordures s'entassent", url: "https://b.test/1", datum: new Date(nu - 2 * 3600_000), omschrijving: "La grève des éboueurs paralyse Marseille." }]);
const fetchFn = (async (u: string) => (String(u).includes("a.test") ? new Response(feedA) : String(u).includes("b.test") ? new Response(feedB) : new Response("x", { status: 500 }))) as unknown as typeof fetch;
const bronnen = [
  bron({ id: "a", naam: "Le Monde — À la une", feed: "https://a.test/feed" }),
  bron({ id: "b", naam: "Sud Ouest", feed: "https://b.test/feed" }),
  bron({ id: "kapot", naam: "Kapotte krant", feed: "https://kapot.test/feed" }),
];

test("volledige run: oogst, cluster, synthese, poort, publicatie, bronnenblok", async () => {
  const opslag = new GeheugenOpslag();
  const client = klein([(a) => (a.system.includes("groepeert") ? '{"groepen":[]}' : synthese())]);
  const r = await draaiOogst({ opslag, client, nu, config: cfg, bronnen, fetchFn, peil: [], generator: null });
  assert.equal(r.aantallen.itemsNaZeef, 2);
  assert.equal(r.berichten.length, 1);
  const b = r.berichten[0];
  assert.equal(b.status, "gepubliceerd", b.blokkadeRedenen.join(";"));
  assert.equal(b.bronnen.length, 2);
  assert.deepEqual(b.bronnen.map((x) => x.naam).sort(), ["Le Monde — À la une", "Sud Ouest"]);
  assert.ok(b.bronnen.every((x) => x.url && x.origineleKop && x.datum));
  assert.equal(b.beeldUrl, null);
  // Het model kreeg geanonimiseerde bronnen: geen krantennaam in de invoer.
  const syn = client.aanroepen.find((c) => !c.system.includes("groepeert"))!;
  assert.ok(!syn.user.includes("Sud Ouest") && !syn.user.includes("Le Monde"));
  assert.equal(syn.model, "claude-sonnet-5-5");
  assert.equal(client.aanroepen.find((c) => c.system.includes("groepeert"))!.model, "claude-haiku-4-5");
  // Fout van een bron is gemeld, maar de run ging door.
  assert.ok(r.fouten.some((f) => f.includes("kapot")));
  // Items zijn verwerkt: een tweede run maakt geen tweede bericht.
  const r2 = await draaiOogst({ opslag, client: klein([synthese()]), nu, config: cfg, bronnen, fetchFn, peil: [], generator: null });
  assert.equal(r2.berichten.length, 0);
  assert.equal(opslag.berichtenLijst.length, 1);
});

test("poort blokkeert en herkans: eerst meta-taal, dan een goede versie", async () => {
  const opslag = new GeheugenOpslag();
  let n = 0;
  const client = klein([(a) => (a.system.includes("groepeert") ? '{"groepen":[]}' : (n += 1) === 1 ? synthese({ tekst: tekst + " Ik kreeg alleen de koppen." }) : synthese())]);
  const r = await draaiOogst({ opslag, client, nu, config: cfg, bronnen, fetchFn, peil: [], generator: null });
  assert.equal(r.berichten[0].status, "gepubliceerd");
  assert.equal(client.aanroepen.filter((c) => !c.system.includes("groepeert")).length, 2);
});

test("blijvend slechte tekst wordt geblokkeerd en niet gepubliceerd", async () => {
  const opslag = new GeheugenOpslag();
  const slecht = synthese({ tekst: tekst + " Ik kreeg alleen de koppen." });
  const r = await draaiOogst({ opslag, client: klein([slecht]), nu, config: cfg, bronnen, fetchFn, peil: [], generator: null });
  assert.equal(r.berichten[0].status, "geblokkeerd");
  assert.equal((await opslag.berichten({ limiet: 10 })).length, 0);
});

test("score onder de drempel wordt concept, niet gepubliceerd", async () => {
  const opslag = new GeheugenOpslag();
  const r = await draaiOogst({ opslag, client: klein([synthese({ relevantie: 0 })]), nu, config: { ...cfg, publiceerDrempel: 95 }, bronnen, fetchFn, peil: [], generator: null });
  assert.equal(r.berichten[0].status, "concept");
});

test("zonder model: geen synthese, wel oogst en clustering; zonder bron-fouten breekt niets", async () => {
  const opslag = new GeheugenOpslag();
  const r = await draaiOogst({ opslag, client: null, nu, config: cfg, bronnen, fetchFn, peil: [], generator: null });
  assert.equal(r.berichten.length, 0);
  assert.equal(r.aantallen.kandidaten, 1);
  assert.ok(r.stappen.find((s) => s.stap === "synthese")?.detail?.overgeslagen);
});

test("opslagstoring in één stap breekt de run niet", async () => {
  const opslag = new GeheugenOpslag();
  opslag.opruimen = async () => { throw new Error("db weg"); };
  opslag.slaRunOp = async () => { throw new Error("db weg"); };
  const r = await draaiOogst({ opslag, client: klein([synthese()]), nu, config: cfg, bronnen, fetchFn, peil: [], generator: null });
  assert.equal(r.berichten.length, 1);
  assert.ok(r.fouten.some((f) => f.startsWith("opruimen")));
});

test("PEIL-signaal: mogelijk gewijzigde waarde wordt gesignaleerd, PEIL niet aangepast", async () => {
  const opslag = new GeheugenOpslag();
  const peil = [{ id: "p.test.afval", naam: "Afvalheffing marseille tarief", trefwoorden: "marseille afvalheffing vuilnisophaal", waarde_weergave: "5 procent" }];
  const client = klein([(a) => (a.system.includes("groepeert") ? '{"groepen":[]}' : a.system.includes("PEIL") ? '{"raakt":["p.test.afval"],"mogelijkGewijzigd":[{"id":"p.test.afval","toelichting":"Afwijkende waarde genoemd."}]}' : synthese())]);
  const r = await draaiOogst({ opslag, client, nu, config: cfg, bronnen, fetchFn, peil, generator: null });
  assert.equal(r.berichten[0].peil.raakt.length, 1);
  assert.equal(opslag.signalen.length, 1);
  assert.equal(opslag.signalen[0].status, "gesignaleerd");
  assert.deepEqual(peil[0].waarde_weergave, "5 procent");
});

test("maxBerichtenPerDag en opruimregel", async () => {
  const opslag = new GeheugenOpslag();
  const r = await draaiOogst({ opslag, client: klein([synthese()]), nu, config: { ...cfg, maxBerichtenPerDag: 0 }, bronnen, fetchFn, peil: [], generator: null });
  assert.equal(r.berichten.length, 0);
  const oud = new GeheugenOpslag();
  await oud.upsertItems([{ url: "https://oud/1", bronId: "x", bronNaam: "x", regime: "pers", groep: "fr_pers", taal: "fr", land: "FR", titel: "t", samenvatting: "", gepubliceerdOp: "2020-01-01T00:00:00Z" }]);
  oud.items.get("https://oud/1")!.opgehaaldOp = new Date(nu - 31 * 86400_000).toISOString();
  assert.equal(await oud.opruimen(new Date(nu - 30 * 86400_000).toISOString()), 1);
});

test("synthese-uitvoer: ongeldige categorie wordt algemeen, publiceren=false geeft niets", () => {
  assert.equal(leesSynthese(synthese({ categorie: "sport" }))!.categorie, "algemeen");
  assert.equal(leesSynthese(JSON.stringify({ publiceren: false })), null);
  assert.equal(leesSynthese("geen json"), null);
});

test("beeld staat standaard uit en faalt nooit", async () => {
  assert.equal(await beeldVoor({ kop: "k", samenvatting: "s", categorie: "algemeen" }), null);
  assert.equal(await beeldVoor({ kop: "k", samenvatting: "s", categorie: "algemeen" }, { naam: "x", genereer: async () => { throw new Error("boem"); } }), null);
  assert.equal(await beeldVoor({ kop: "k", samenvatting: "s", categorie: "algemeen" }, { naam: "x", genereer: async () => "https://beeld.test/1.jpg" }), "https://beeld.test/1.jpg");
  assert.equal(await beeldVoor({ kop: "k", samenvatting: "s", categorie: "algemeen" }, { naam: "x", genereer: async () => "http://onveilig/1.jpg" }), null);
});

test("bronnenlijst en config zijn geldig", () => {
  const lijst = laadBronnen();
  assert.ok(lijst.length > 15);
  assert.ok(lijst.every((b) => ["ACTIVE", "CONCEPT"].includes(b.status) && /^https:\/\//.test(b.feed)));
  assert.equal(new Set(lijst.map((b) => b.id)).size, lijst.length);
  for (const g of ["fr_pers", "nl_vl_pers", "buitenlandse_pers", "overheid"]) assert.ok(lijst.some((b) => b.groep === g), g);
  assert.ok(lijst.some((b) => b.groep === "overheid" && b.domein.endsWith(".gouv.fr") && b.status === "ACTIVE"));
  assert.equal(cfg.minBronnenPers, 2);
});
