// NL/BE-kijk op Frans en Europees nieuws (28-11-2026): zeef, koppelregel, synthese-opdracht en poort. Nep-model, geen netwerk.
import test from "node:test";
import assert from "node:assert/strict";
import { oogstBronnen } from "../lib/motor/feeds";
import { draaiOogst } from "../lib/motor/motor";
import { GeheugenOpslag } from "../lib/motor/opslag";
import { laadConfig } from "../lib/motor/config";
import { aantalBronnen } from "../lib/motor/cluster";
import { kwaliteitsPoort } from "../lib/motor/poort";
import { SYSTEEM_SYNTHESE, REGEL_NL_BE, bouwInvoer, systeemSynthese } from "../lib/motor/synthese";
import {
  isKanttekeningItem, isEuGrens, clusterIsEuropees, onafhankelijkeFrBronnen, heeftNlBeBron, koppelKanttekeningen, splitsKanttekeningen, leesKanttekeningAntwoord,
  SYSTEEM_KANTTEKENING, MAX_KANTTEKENING_PER_CLUSTER,
} from "../lib/motor/kanttekening";
import { bron, item, klein, rss } from "./helpers";
import type { BronItem, Cluster, Synthese } from "../lib/motor/types";

const nu = Date.now();
const uur = (n: number) => new Date(nu - n * 3600_000);

// Realistische koppen.
const NL_EU = "Europese Commissie wil strengere controles aan de binnengrenzen van Schengen";
const NL_EU_SAMENV = "Brussel stelt voor om het Schengengebied beter te bewaken; lidstaten zouden vaker grenscontroles mogen invoeren.";
const FR1 = "La Commission européenne propose des contrôles renforcés aux frontières de Schengen";
const FR2 = "Schengen: Bruxelles veut renforcer les contrôles aux frontières intérieures";

const nlBron = (o = {}) => bron({ id: "nos", naam: "NOS — Buitenland", feed: "https://nos.test/feed", domein: "nos.test", taal: "nl", land: "NL", groep: "nl_vl_pers", frankrijkFilter: true, ...o });
const frItem = (n: number, o: Partial<BronItem> = {}) => item({ url: `https://fr${n}.test/a`, bronId: `fr${n}`, bronNaam: n === 1 ? "Le Monde" : "Le Figaro", titel: n === 1 ? FR1 : FR2, samenvatting: "", gepubliceerdOp: uur(2).toISOString(), ...o });
const nlItem = (o: Partial<BronItem> = {}) => item({ url: "https://nos.test/eu", bronId: "nos", bronNaam: "NOS", groep: "nl_vl_pers", taal: "nl", land: "NL", titel: NL_EU, samenvatting: NL_EU_SAMENV, gepubliceerdOp: uur(1).toISOString(), ...o });
const cl = (...items: BronItem[]): Cluster => ({ sleutel: "c", items });

// ---- 1. Zeef ---------------------------------------------------------------------------------------------
test("zeef: NL-item over een EU-besluit zonder Frankrijk komt in de kanttekening-bak; sport, binnenland en Frankrijk-items gaan hun gewone weg", async () => {
  const feed = rss([
    { titel: NL_EU, url: "https://nos.test/eu", datum: uur(1), omschrijving: NL_EU_SAMENV },
    { titel: "Eredivisie: Ajax wint met 3-0 van Feyenoord", url: "https://nos.test/sport", datum: uur(1), omschrijving: "Voetbal." },
    { titel: "Gemeente Utrecht verhoogt het parkeertarief in de binnenstad", url: "https://nos.test/binnenland", datum: uur(1), omschrijving: "Lokaal nieuws." },
    { titel: "Franse boeren blokkeren snelwegen om handelsakkoord", url: "https://nos.test/fr", datum: uur(1), omschrijving: "Boeren in Frankrijk protesteren." },
  ]);
  const r = await oogstBronnen([nlBron()], { nu, fetchFn: (async () => new Response(feed)) as unknown as typeof fetch });
  assert.deepEqual(r.items.map((i) => i.url).sort(), ["https://nos.test/eu", "https://nos.test/fr"]);
  assert.equal(r.resultaten[0].kanttekening, 1);
  assert.equal(r.resultaten[0].geweerd.sport, 1);
  assert.equal(r.resultaten[0].geweerd.geen_frankrijk, 1, "binnenland zonder EU of grens vervalt zoals voorheen");
  const { hoofd, kanttekeningen } = splitsKanttekeningen(r.items);
  assert.deepEqual(hoofd.map((i) => i.url), ["https://nos.test/fr"]);
  assert.deepEqual(kanttekeningen.map((i) => i.url), ["https://nos.test/eu"]);
});

test("zeef: een Franse bron of een bron zonder Frankrijkfilter verandert niet; alleen NL/BE-pers met filter levert kanttekeningen", async () => {
  const feed = rss([{ titel: NL_EU, url: "https://x.test/eu", datum: uur(1), omschrijving: NL_EU_SAMENV }]);
  const f = (async () => new Response(feed)) as unknown as typeof fetch;
  const bel = await oogstBronnen([bron({ id: "buitenland", groep: "buitenlandse_pers", frankrijkFilter: true, feed: "https://x.test/f" })], { nu, fetchFn: f });
  assert.equal(bel.items.length, 0, "buitenlandse pers blijft zoals voorheen");
  assert.equal(bel.resultaten[0].geweerd.geen_frankrijk, 1);
});

test("herkennen: kanttekening is af te leiden uit groep en tekst; ze telt niet als onafhankelijke bron", () => {
  assert.ok(isKanttekeningItem(nlItem()));
  assert.ok(!isKanttekeningItem(nlItem({ titel: "Franse boeren blokkeren snelwegen" })), "noemt Frankrijk: gewone bron");
  assert.ok(!isKanttekeningItem(frItem(1)));
  assert.equal(aantalBronnen(cl(frItem(1), frItem(2), nlItem())), 2);
  assert.ok(isEuGrens(NL_EU) && isEuGrens("Belgische grens: nieuwe controles") && isEuGrens("De ECB verlaagt de rente") && isEuGrens("Zone euro: hogere inflatie"));
  assert.ok(!isEuGrens("Gemeente Utrecht verhoogt het parkeertarief") && !isEuGrens("Eredivisie: Ajax wint"));
});

// ---- 2. Koppelregel --------------------------------------------------------------------------------------
const jaModel = (antw: string) => klein([antw]);

test("koppelregel: alleen bij minstens 2 Franse of overheidsbronnen en een Europees of grensoverschrijdend onderwerp", async () => {
  const k = nlItem();
  // Eén Franse bron: geen aanroep.
  let m = jaModel('{"ja":[1]}');
  let u = await koppelKanttekeningen([cl(frItem(1))], [k], m);
  assert.equal(m.aanroepen.length, 0);
  assert.equal(u.gekoppeld, 0);
  // Twee Franse bronnen maar geen Europees onderwerp en geen NL/BE-vermelding: geen aanroep.
  const lokaal1 = frItem(1, { titel: "Marseille: grève des éboueurs, les ordures s'accumulent" });
  const lokaal2 = frItem(2, { titel: "Grève des éboueurs à Marseille: les ordures s'entassent" });
  m = jaModel('{"ja":[1]}');
  u = await koppelKanttekeningen([cl(lokaal1, lokaal2)], [k], m);
  assert.equal(m.aanroepen.length, 0);
  // Twee Franse bronnen en een EU-onderwerp: aanroep en koppeling bij "ja".
  m = jaModel('{"ja":[1]}');
  u = await koppelKanttekeningen([cl(frItem(1), frItem(2))], [k], m);
  assert.equal(m.aanroepen.length, 1);
  assert.equal(u.gekoppeld, 1);
  assert.deepEqual(u.clusters[0].items.map((i) => i.url), ["https://fr1.test/a", "https://fr2.test/a", "https://nos.test/eu"]);
  assert.equal(aantalBronnen(u.clusters[0]), 2, "de kanttekening telt niet als bron");
  // Dezelfde twee Franse bronnen, maar de Franse kant noemt Nederland of België: ook in aanmerking.
  const nlbe1 = frItem(1, { titel: "Taxe sur les transactions: la Belgique et les Pays-Bas s'opposent à Paris" });
  const nlbe2 = frItem(2, { titel: "Paris isole face aux Pays-Bas sur la taxe sur les transactions" });
  assert.ok(clusterIsEuropees(cl(nlbe1, nlbe2)));
  // Overheidsbronnen tellen als Frans.
  const g1 = item({ url: "https://g1.test", bronId: "g1", regime: "overheid", groep: "overheid", titel: "Schengen: nouvelles règles aux frontières" });
  const g2 = item({ url: "https://g2.test", bronId: "g2", regime: "overheid", groep: "overheid", titel: "Frontières: la Commission européenne précise les règles" });
  assert.equal(onafhankelijkeFrBronnen(cl(g1, g2)), 2);
});

test("koppelregel: nee, twijfel, modelfout en onbruikbaar antwoord geven geen koppeling; maximaal 2 per cluster; een item hooguit in één cluster", async () => {
  const k = nlItem();
  for (const antw of ['{"ja":[]}', "ik weet het niet", '{"ja":["x",9,0]}', ""]) {
    const u = await koppelKanttekeningen([cl(frItem(1), frItem(2))], [k], jaModel(antw));
    assert.equal(u.gekoppeld, 0, antw);
    assert.equal(u.clusters[0].items.length, 2);
  }
  const kapot = { async tekst() { throw new Error("storing"); } };
  assert.equal((await koppelKanttekeningen([cl(frItem(1), frItem(2))], [k], kapot)).gekoppeld, 0);
  assert.equal((await koppelKanttekeningen([cl(frItem(1), frItem(2))], [k], null)).gekoppeld, 0, "zonder model niets");
  const drie = [1, 2, 3].map((n) => nlItem({ url: `https://nos.test/${n}`, titel: `${NL_EU} ${n}`, gepubliceerdOp: uur(n).toISOString() }));
  const u = await koppelKanttekeningen([cl(frItem(1), frItem(2))], drie, jaModel('{"ja":[1,2,3]}'));
  assert.equal(u.gekoppeld, MAX_KANTTEKENING_PER_CLUSTER);
  // Twee clusters en één kanttekening: het item gaat hooguit in één cluster.
  const a1 = frItem(1), a2 = frItem(2);
  const b1 = item({ url: "https://fr3.test/a", bronId: "fr3", titel: "Eurozone: la BCE maintient ses taux directeurs" }), b2 = item({ url: "https://fr4.test/a", bronId: "fr4", titel: "BCE: les taux directeurs inchangés dans la zone euro" });
  const m = klein(['{"ja":[1]}', '{"ja":[1]}']);
  const v = await koppelKanttekeningen([cl(a1, a2), cl(b1, b2)], [k], m);
  assert.equal(v.gekoppeld, 1);
  assert.equal(m.aanroepen.length, 1, "geen kandidaten meer na de eerste koppeling: geen tweede aanroep");
  assert.deepEqual(leesKanttekeningAntwoord('{"ja":[2,1,2]}', 3), [1, 2]);
});

test("koppelregel: de vraag aan het model is ja of nee over precies hetzelfde onderwerp, met bij twijfel nee", async () => {
  assert.ok(/precies hetzelfde onderwerp/.test(SYSTEEM_KANTTEKENING) && /Bij twijfel nee/.test(SYSTEEM_KANTTEKENING) && /ja of nee/.test(SYSTEEM_KANTTEKENING));
  const m = jaModel('{"ja":[]}');
  await koppelKanttekeningen([cl(frItem(1), frItem(2))], [nlItem()], m);
  assert.ok(m.aanroepen[0].user.includes(FR1) && m.aanroepen[0].user.includes(`1. ${NL_EU}`));
  assert.ok(!m.aanroepen[0].user.includes(NL_EU_SAMENV), "alleen de kop, geen tekst");
});

// ---- 3. Synthese-opdracht --------------------------------------------------------------------------------
test("synthese-opdracht: de NL/BE-regel staat er alleen als het cluster een Nederlandse of Belgische bron heeft; de bron is herkenbaar in de invoer", () => {
  const zonder = cl(frItem(1), frItem(2));
  assert.equal(systeemSynthese(zonder), SYSTEEM_SYNTHESE);
  assert.ok(!systeemSynthese(zonder).includes("In Nederland"));
  const met = cl(frItem(1), frItem(2), nlItem());
  const s = systeemSynthese(met);
  assert.ok(s.includes(REGEL_NL_BE) && s.includes('begint met "In Nederland", "In België" of "In Nederland en België"'));
  assert.ok(/MAG/.test(REGEL_NL_BE) && /nooit een eigen mening/.test(REGEL_NL_BE) && /geen alinea/.test(REGEL_NL_BE), "mag, niet moet; geen eigen mening; anders geen alinea");
  assert.ok(s.trimEnd().endsWith('"beeldZoektermen":["","",""]}') && s.indexOf(REGEL_NL_BE) < s.indexOf("Antwoord uitsluitend met JSON"), "de JSON-opdracht blijft laatste");
  assert.ok(heeftNlBeBron(met) && !heeftNlBeBron(zonder));
  const invoer = bouwInvoer(met);
  assert.ok(invoer.includes("Nederlandse bron") && !invoer.includes("NOS"), "geanonimiseerd: geen krantennaam");
  assert.ok(bouwInvoer(cl(frItem(1), item({ land: "BE", groep: "nl_vl_pers", bronId: "vrt", url: "https://vrt.test" }))).includes("Belgische bron"));
});

// ---- 4. Poort --------------------------------------------------------------------------------------------
const basisTekst = "De Europese Commissie wil dat lidstaten vaker tijdelijke controles aan de binnengrenzen van het Schengengebied mogen invoeren. Het voorstel past in een bredere herziening van de regels, die nu nog moet worden besproken met de lidstaten en het Europees Parlement.\n\nVoor reizigers in Frankrijk verandert voorlopig niets, omdat het voorstel nog geen wet is. Frankrijk voert al langer controles uit aan een deel van de grens.";
const syn = (tekst: string): Synthese => ({ kop: "Brussel wil meer controles aan binnengrenzen", samenvatting: "De Europese Commissie stelt strengere controles aan de binnengrenzen voor.", tekst, categorie: "politiek", relevantie: 80, portemonnee: false, signaal: null, beeldZoekterm: "", beeldZoektermen: [] });
const cfg = laadConfig();

test("poort: een alinea 'In Nederland/België' zonder NL/BE-bron is een poortreden; met zo'n bron niet; bedragen in die alinea moeten in een bron staan", () => {
  const nlAlinea = "\n\nIn Nederland wordt vooral benadrukt dat het voorstel de vrije doorgang voor pendelaars kan raken.";
  const zonder = kwaliteitsPoort(syn(basisTekst + nlAlinea), cl(frItem(1), frItem(2)), cfg);
  assert.ok(zonder.redenen.includes("alinea over Nederland of België zonder Nederlandse of Belgische bron"), zonder.redenen.join(";"));
  const beX = kwaliteitsPoort(syn(basisTekst + "\n\nIn België en Nederland ligt de nadruk op de grensstreek."), cl(frItem(1), frItem(2)), cfg);
  assert.ok(beX.redenen.some((r) => r.startsWith("alinea over Nederland of België")));
  const met = kwaliteitsPoort(syn(basisTekst + nlAlinea), cl(frItem(1), frItem(2), nlItem()), cfg);
  assert.ok(!met.redenen.some((r) => r.startsWith("alinea over Nederland")), met.redenen.join(";"));
  // Een zin die niet aan het begin van een alinea staat, valt er niet onder.
  assert.ok(!kwaliteitsPoort(syn(basisTekst.replace("Frankrijk voert al", "In Nederland gelden andere regels. Frankrijk voert al")), cl(frItem(1), frItem(2)), cfg).redenen.some((r) => r.startsWith("alinea over Nederland")));
  // Bedragen: bestaande regel geldt ook in de NL/BE-alinea.
  const bedrag = kwaliteitsPoort(syn(basisTekst + "\n\nIn Nederland zou het pendelaars 450 euro per jaar kosten."), cl(frItem(1), frItem(2), nlItem()), cfg);
  assert.ok(bedrag.redenen.includes("bedrag niet in bron: 450"), bedrag.redenen.join(";"));
  const bedragOk = kwaliteitsPoort(syn(basisTekst + "\n\nIn Nederland zou het pendelaars 450 euro per jaar kosten."), cl(frItem(1), frItem(2), nlItem({ samenvatting: "Pendelaars betalen mogelijk 450 euro per jaar extra." })), cfg);
  assert.ok(!bedragOk.redenen.some((r) => r.startsWith("bedrag")), bedragOk.redenen.join(";"));
});

// ---- 5. Integratie ---------------------------------------------------------------------------------------
const tekstMetNl = `${basisTekst}\n\nIn Nederland ligt de nadruk op de gevolgen voor grensstreken en pendelaars, die nu vaker te maken kunnen krijgen met controles.`;
const synJson = (tekst: string) => JSON.stringify({ publiceren: true, kop: "Brussel wil meer controles aan binnengrenzen", samenvatting: "De Europese Commissie stelt strengere controles aan de binnengrenzen voor.", tekst, categorie: "politiek", relevantie: 90 });

async function integratie(nlAntwoord: string, schrijf: (a: { system: string; user: string }) => string) {
  const feeds: Record<string, string> = {
    "fr1.test": rss([{ titel: FR1, url: "https://fr1.test/a", datum: uur(3), omschrijving: "La Commission propose de renforcer les contrôles aux frontières." }]),
    "fr2.test": rss([{ titel: FR2, url: "https://fr2.test/a", datum: uur(2), omschrijving: "Bruxelles veut des contrôles renforcés." }]),
    "nos.test": rss([{ titel: NL_EU, url: "https://nos.test/eu", datum: uur(1), omschrijving: NL_EU_SAMENV }]),
  };
  const fetchFn = (async (u: string) => (feeds[new URL(String(u)).host] ? new Response(feeds[new URL(String(u)).host]) : new Response("x", { status: 500 }))) as unknown as typeof fetch;
  const bronnen = [bron({ id: "fr1", naam: "Le Monde", feed: "https://fr1.test/feed" }), bron({ id: "fr2", naam: "Le Figaro", feed: "https://fr2.test/feed" }), nlBron({ feed: "https://nos.test/feed" })];
  const opslag = new GeheugenOpslag();
  const client = klein([(a) => (a.system.includes("groepeert") ? '{"groepen":[]}' : a.system.startsWith("Je controleert of Nederlandse") ? nlAntwoord : a.system.startsWith("Je bent eindredacteur") ? schrijf(a) : "[]")]);
  const r = await draaiOogst({ opslag, client, nu, config: { ...cfg, maxSynthesesPerRun: 1 }, bronnen, fetchFn, peil: [], generator: null });
  return { r, client, opslag };
}

test("integratie: twee Franse bronnen en een NL-krant over hetzelfde EU-besluit; de NL-bron staat in het bronnenblok en de alinea 'In Nederland' wordt toegelaten", async () => {
  const { r, client } = await integratie('{"ja":[1]}', () => synJson(tekstMetNl));
  assert.equal(r.aantallen.kanttekeningGekoppeld, 1);
  assert.equal(r.berichten.length, 1, r.fouten.join(";"));
  const b = r.berichten[0];
  assert.equal(b.status, "gepubliceerd", b.blokkadeRedenen.join(";"));
  assert.deepEqual(b.bronnen.map((x) => x.url).sort(), ["https://fr1.test/a", "https://fr2.test/a", "https://nos.test/eu"]);
  assert.ok(b.tekst.includes("In Nederland ligt de nadruk"));
  const s = client.aanroepen.find((a) => a.system.startsWith("Je bent eindredacteur"))!;
  assert.ok(s.system.includes(REGEL_NL_BE) && s.user.includes("Nederlandse bron"));
  assert.ok(!s.user.includes("NOS — Buitenland") || s.user.includes("Namen die u"), "bronnen anoniem");
});

test("integratie: zegt het model nee, dan is er geen NL-bron en blokkeert de poort een 'In Nederland'-alinea; zonder NL-bron staat de regel niet in de opdracht", async () => {
  const { r, client } = await integratie('{"ja":[]}', () => synJson(tekstMetNl));
  assert.equal(r.aantallen.kanttekeningGekoppeld, 0);
  const b = r.berichten[0];
  assert.deepEqual(b.bronnen.map((x) => x.url).sort(), ["https://fr1.test/a", "https://fr2.test/a"]);
  assert.equal(b.status, "geblokkeerd");
  assert.ok(b.blokkadeRedenen.includes("alinea over Nederland of België zonder Nederlandse of Belgische bron"), b.blokkadeRedenen.join(";"));
  assert.ok(client.aanroepen.filter((a) => a.system.startsWith("Je bent eindredacteur")).every((a) => !a.system.includes(REGEL_NL_BE)));
});

test("integratie: een kanttekening is nooit een eigen onderwerp, ook niet met twee NL-bronnen", async () => {
  const feed = (n: number) => rss([{ titel: `${NL_EU} (${n})`, url: `https://nl${n}.test/eu`, datum: uur(1), omschrijving: NL_EU_SAMENV }]);
  const fetchFn = (async (u: string) => (String(u).includes("nl1") ? new Response(feed(1)) : String(u).includes("nl2") ? new Response(feed(2)) : new Response("x", { status: 500 }))) as unknown as typeof fetch;
  const bronnen = [nlBron({ id: "nl1", feed: "https://nl1.test/feed" }), nlBron({ id: "nl2", naam: "VRT NWS", feed: "https://nl2.test/feed", land: "BE" })];
  const opslag = new GeheugenOpslag();
  const r = await draaiOogst({ opslag, client: klein(['{"groepen":[[1,2]]}']), nu, config: cfg, bronnen, fetchFn, peil: [], generator: null });
  assert.equal(r.berichten.length, 0);
  assert.equal(r.aantallen.kanttekeningenOpen, 2);
});
