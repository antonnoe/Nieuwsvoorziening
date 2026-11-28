// Radar (28-11-2026): The Connexion is UITSLUITEND een onderwerpsignaal, nooit een bron. Nep-fetch en nep-model; geen netwerk.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  parseSitemap, uitgesloten, binnenVenster, leesSelectie, leesBevestiging, draaiRadar, isOverheidsUrl, overheidKandidaten, zoekOverheidsItems, zoekBestaandBericht,
  radarVorm, isRadarFout, RADAR_SITEMAP_URL, GEEN_BRON_TEKST, RADAR_UITSLUIT, RadarOntbreekt, RADAR_MAX_SELECTIE_AANROEPEN, RADAR_MAX_BEVESTIG_AANROEPEN, SYSTEEM_RADAR_SELECTIE,
  type SitemapItem,
} from "../lib/motor/radar";
import { draaiOogst } from "../lib/motor/motor";
import { kiesKandidaten } from "../lib/motor/kandidaten";
import { GeheugenOpslag, SupabaseOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import { laadConfig, laadBronnen, actieveBronnen, isVerbodenBron } from "../lib/motor/config";
import { oogstBronnen } from "../lib/motor/feeds";
import { haalArtikelTekst, verrijkMetArtikelen } from "../lib/motor/artikel";
import { publiekBericht, wisOpslagCache } from "../lib/motor/api";
import { wisRem } from "../lib/redactie";
import { GET as nieuwsGET } from "../app/api/nieuws/route";
import { GET as rssGET } from "../app/api/rss/route";
import { GET as redGET, POST as redPOST } from "../app/api/redactie/route";
import sitemapPagina from "../app/sitemap";
import { bron, item, klein, rss } from "./helpers";
import type { ModelClient } from "../lib/motor/ai";
import type { BronItem, Cluster } from "../lib/motor/types";

const nu = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const DAG = 86400_000;

// ---- Hulpmiddelen ---------------------------------------------------------------------------------------
const sitemapXml = (rijen: { url: string; datum: number; titel: string; kaal?: boolean }[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${rijen
    .map((r) => `<url><loc>${r.url}</loc><news:news><news:publication><news:name>Voorbeeld</news:name><news:language>en</news:language></news:publication><news:publication_date>${iso(r.datum)}</news:publication_date><news:title>${r.kaal ? r.titel : r.titel.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</news:title></news:news></url>`)
    .join("")}</urlset>`;

const SIG1 = { url: "https://www.connexionfrance.com/news/second-home-tax", datum: nu - 1 * DAG, titel: "Second-home owners face higher tax bill in France" };
const SIG2 = { url: "https://www.connexionfrance.com/news/health-card", datum: nu - 1 * DAG, titel: "New rules for carte vitale and doctor fees" };
const SIG_UK = { url: "https://www.connexionfrance.com/news/brexit-visa", datum: nu - 1 * DAG, titel: "Brexit: British residents must renew visa documents" };
const SIG_OUD = { url: "https://www.connexionfrance.com/news/oud", datum: nu - 5 * DAG, titel: "Landlords must change rent rules" };

/** Een fetch die alleen de sitemap kent en bijhoudt hoe vaak hij is aangeroepen en welke adressen. */
function sitemapFetch(rijen: Parameters<typeof sitemapXml>[0], status = 200) {
  const aangevraagd: string[] = [];
  const f = (async (u: string) => {
    aangevraagd.push(String(u));
    return String(u) === RADAR_SITEMAP_URL ? new Response(sitemapXml(rijen), { status }) : new Response("x", { status: 500 });
  }) as unknown as typeof fetch;
  return { f, aangevraagd };
}

const gouv = (o: Partial<BronItem> = {}): BronItem =>
  item({ url: "https://www.service-public.fr/particuliers/actualites/A1", bronId: "service-public", bronNaam: "Service-Public.fr", regime: "overheid", groep: "overheid",
    titel: "Taxe d'habitation sur les résidences secondaires: nouvelle majoration", samenvatting: "La majoration de la taxe d'habitation est relevée.", gepubliceerdOp: iso(nu - 2 * 3600_000), ...o });

type Antwoord = string | ((a: { system: string; user: string; model: string }) => string);
/** Nep-model dat op de systeemopdracht dispatcht (selectie, bevestiging, rest). */
function model(selectie: Antwoord, bevestig: Antwoord, rest: Antwoord = '{"groepen":[]}') {
  const aanroepen: { system: string; user: string; model: string }[] = [];
  const c: ModelClient & { aanroepen: typeof aanroepen; selectie: () => number; bevestig: () => number } = {
    aanroepen,
    selectie: () => aanroepen.filter((a) => a.system.startsWith("Je bent redacteur van een Nederlandstalige")).length,
    bevestig: () => aanroepen.filter((a) => a.system.startsWith("Je controleert of Franse overheidsberichten")).length,
    async tekst(a) {
      aanroepen.push({ system: a.system, user: a.user, model: a.model });
      const x = a.system.startsWith("Je bent redacteur van een Nederlandstalige") ? selectie : a.system.startsWith("Je controleert of Franse overheidsberichten") ? bevestig : rest;
      return typeof x === "function" ? x(a) : x;
    },
  };
  return c;
}
const kies = (n: number, o: Record<string, unknown> = {}) => ({
  n, werktitel: "Tweede woningen: hogere belasting in Frankrijk", categorie: "Belastingen",
  relevantie: "Bezitters van een tweede huis in Frankrijk betalen meer. Dit raakt veel Nederlanders en Belgen.", zoektermen: ["taxe d'habitation", "résidences secondaires", "majoration"], ...o,
});

const bericht = (id: string, o: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht => ({
  id, kop: "Hogere taxe d'habitation voor résidences secondaires", samenvatting: "De majoration van de taxe d'habitation geldt voor résidences secondaires.", tekst: "T", categorie: "economie en ondernemen", score: 80,
  regime: "pers", status: "gepubliceerd", blokkadeRedenen: [], beeldUrl: null, gepubliceerdOp: iso(nu - 3600_000), peil: { raakt: [], mogelijkGewijzigd: [] }, bronnen: [], ...o,
});

// ---- 1. Sitemap-parsing ---------------------------------------------------------------------------------
test("parseSitemap: alleen loc, publicatiedatum en titel; entiteiten en CDATA worden gedecodeerd; onvolledige items vallen af", () => {
  const xml = `<urlset xmlns:news="x">
    <url><loc>https://www.connexionfrance.com/a</loc><news:news><news:publication_date>2026-11-27T08:00:00+01:00</news:publication_date><news:title>Taxes &amp; fees: what&#39;s &quot;new&quot; &#233;t&#xE9;</news:title></news:news></url>
    <url><loc>https://www.connexionfrance.com/b</loc><news:news><news:publication_date>2026-11-26T08:00:00Z</news:publication_date><news:title><![CDATA[Landlords & tenants: rent <rules>]]></news:title></news:news></url>
    <url><loc>https://www.connexionfrance.com/zonder-titel</loc><news:news><news:publication_date>2026-11-26T08:00:00Z</news:publication_date></news:news></url>
    <url><loc>https://www.connexionfrance.com/zonder-datum</loc><news:news><news:title>x</news:title></news:news></url>
    <url><loc>niet-een-url</loc><news:news><news:publication_date>2026-11-26T08:00:00Z</news:publication_date><news:title>x</news:title></news:news></url>
  </urlset>`;
  const r = parseSitemap(xml);
  assert.equal(r.length, 2);
  assert.equal(r[0].titel, `Taxes & fees: what's "new" été`);
  assert.equal(r[0].datum, "2026-11-27T07:00:00.000Z");
  assert.equal(r[1].titel, "Landlords & tenants: rent <rules>");
  assert.deepEqual(Object.keys(r[0]).sort(), ["datum", "titel", "url"]);
  assert.deepEqual(parseSitemap(""), []);
  assert.deepEqual(parseSitemap("<html>geen sitemap</html>"), []);
});

// ---- 2. Uitsluitfilter en venster -------------------------------------------------------------------------
test("uitsluitfilter: Brexit-, UK- en Britse titels vallen af; praktisch nieuws blijft", () => {
  for (const t of [
    "Brexit: what changes for residents in 2027", "UK pensioners in France to get new healthcare card", "British expats face new carte de séjour renewal",
    "Britons must respect the 90/180 days rule", "How the EES and ETIAS will work", "Visa rules for non-EU buyers of French property", "UK driving licence exchange deadline",
    "State pension uprating for British retirees", "Anglo-French treaty on small boats", "Britain and France sign new agreement",
  ]) assert.ok(uitgesloten(t), t);
  for (const t of ["Second-home owners face higher tax bill in France", "New rules for carte vitale and doctor fees", "Energy price cap changes for households", "Taxe foncière deadline moved"]) assert.equal(uitgesloten(t), null, t);
  assert.ok(RADAR_UITSLUIT.length >= 10, "de uitsluitlijst is een vaste constante");
});

test("uitsluitfilter: opinie, lifestyle, sport, recepten en reistips vallen af", () => {
  for (const t of ["Opinion: why I love living in France", "Easy recipe for tarte tatin", "Rugby: France beat Ireland", "Best villages to visit in Brittany", "Tour de France route announced", "Travel tips for a weekend in Lyon", "My life in a Normandy village"]) assert.ok(uitgesloten(t), t);
});

test("venster: alleen de laatste 3 dagen, ontdubbeld, nieuwste eerst", () => {
  const items: SitemapItem[] = [SIG1, SIG_OUD, SIG2, { ...SIG1 }].map((s) => ({ url: s.url, datum: iso(s.datum), titel: s.titel }));
  const v = binnenVenster(items, nu);
  assert.deepEqual(v.map((x) => x.url), [SIG1.url, SIG2.url]);
});

// ---- 3. Selectie ------------------------------------------------------------------------------------------
test("leesSelectie: valideert nummer, titel, categorie en zoektermen; onbekende categorie wordt Overig; de signaalbron mag niet in de tekst staan", () => {
  const batch: SitemapItem[] = [SIG1, SIG2].map((s) => ({ url: s.url, datum: iso(s.datum), titel: s.titel }));
  const antw = JSON.stringify([
    kies(1, { categorie: "Onzin" }), kies(2, { werktitel: "Kosten bij de huisarts veranderen", zoektermen: ["carte vitale"] }), kies(9), kies(1), { n: 2 },
    kies(2, { werktitel: "Nieuws van The Connexion over huisartsen" }),
  ]);
  const r = leesSelectie("```json\n" + antw + "\n```", batch);
  assert.equal(r.length, 2);
  assert.equal(r[0].categorie, "Overig");
  assert.equal(r[0].item.url, SIG1.url);
  assert.equal(r[1].werktitel, "Kosten bij de huisarts veranderen");
  assert.deepEqual(leesSelectie("geen json", batch), []);
  assert.deepEqual(leesBevestiging('{"matches":[2,2,9,"x",1]}', 3), [1, 2]);
  assert.deepEqual(leesBevestiging("nee", 3), []);
});

// ---- 4. De radarstap ----------------------------------------------------------------------------------------
test("draaiRadar: één aanvraag, het model krijgt alleen titels, match met overheidsitem geeft 'klaar voor redactie' en voorrang", async () => {
  const opslag = new GeheugenOpslag();
  const g = gouv();
  opslag.items.set(g.url, g);
  const { f, aangevraagd } = sitemapFetch([SIG1, SIG_UK, SIG_OUD]);
  const m = model(JSON.stringify([kies(1)]), '{"matches":[1]}');
  const r = await draaiRadar({ opslag, client: m, fetchFn: f, nu });
  assert.equal(r.ok, true, r.fout);
  assert.deepEqual(aangevraagd, [RADAR_SITEMAP_URL], "hooguit één aanvraag, alleen de sitemap (geen artikelpagina's)");
  // Filter: het Brexit-item en het item van 5 dagen oud gaan niet naar het model; het model ziet alleen de titel van SIG1.
  const sel = m.aanroepen.find((a) => a.system.startsWith("Je bent redacteur"))!;
  assert.equal(sel.user, `1. ${SIG1.titel}`);
  assert.ok(!/http|connexion/i.test(sel.user) && !/connexion/i.test(sel.system));
  assert.equal(sel.model, "claude-haiku-4-5");
  assert.equal(opslag.radarRijen.length, 1);
  const rij = opslag.radarRijen[0];
  assert.equal(rij.status, "klaar voor redactie");
  assert.equal(rij.signaalUrl, SIG1.url);
  assert.equal(rij.categorie, "Belastingen");
  assert.deepEqual(rij.primaireBron, [{ naam: "Service-Public.fr", url: g.url, datum: g.gepubliceerdOp }]);
  assert.deepEqual(r.voorrangUrls, [g.url]);
  // Bevestiging: kop/omschrijving van de kandidaat, niet de signaaltitel en geen signaal-url.
  const bev = m.aanroepen.find((a) => a.system.startsWith("Je controleert"))!;
  assert.ok(bev.user.includes("Taxe d'habitation") && !bev.user.includes(SIG1.titel) && !/connexion/i.test(bev.user));
});

test("draaiRadar: geen overheidsmatch of twijfel van het model geeft 'handmatige broncheck vereist' met de vaste tekst", async () => {
  const opslag = new GeheugenOpslag();
  const { f } = sitemapFetch([SIG1]);
  // 1. geen overheidsitems in de opslag: geen bevestigingsaanroep nodig
  const m1 = model(JSON.stringify([kies(1)]), '{"matches":[1]}');
  await draaiRadar({ opslag, client: m1, fetchFn: f, nu });
  assert.equal(opslag.radarRijen[0].status, "handmatige broncheck vereist");
  assert.equal(opslag.radarRijen[0].primaireBron, null);
  assert.equal(m1.bevestig(), 0);
  // 2. wel een kandidaat, maar het model twijfelt: ook geen match
  const o2 = new GeheugenOpslag();
  const g = gouv();
  o2.items.set(g.url, g);
  const m2 = model(JSON.stringify([kies(1)]), '{"matches":[]}');
  const r2 = await draaiRadar({ opslag: o2, client: m2, fetchFn: f, nu });
  assert.equal(o2.radarRijen[0].status, "handmatige broncheck vereist");
  assert.deepEqual(r2.voorrangUrls, []);
  assert.equal(m2.bevestig(), 1);
  // 3. een modelfout bij de bevestiging telt als twijfel
  const o3 = new GeheugenOpslag();
  o3.items.set(g.url, g);
  const m3 = model(JSON.stringify([kies(1)]), () => { throw new Error("stuk"); });
  await draaiRadar({ opslag: o3, client: m3, fetchFn: f, nu });
  assert.equal(o3.radarRijen[0].status, "handmatige broncheck vereist");
  // De vorm voor de redactie bevat de vaste tekst.
  const v = radarVorm(opslag.radarRijen[0]);
  assert.equal(v.opmerking, GEEN_BRON_TEKST);
  assert.equal(GEEN_BRON_TEKST, "Primaire bron niet beschikbaar — handmatige controle vereist");
  assert.deepEqual(v.primaireBronnen, []);
});

test("draaiRadar: een item van een niet-overheidsdomein (pers, of een ander domein) is nooit primaire bron", async () => {
  const opslag = new GeheugenOpslag();
  const pers = gouv({ url: "https://www.lemonde.fr/a", regime: "pers", groep: "fr_pers", bronNaam: "Le Monde" });
  const regimeOverheidMaarGeenOverheidsdomein = gouv({ url: "https://www.rijksoverheid.nl/a", bronNaam: "Rijksoverheid" });
  opslag.items.set(pers.url, pers);
  opslag.items.set(regimeOverheidMaarGeenOverheidsdomein.url, regimeOverheidMaarGeenOverheidsdomein);
  const { f } = sitemapFetch([SIG1]);
  const m = model(JSON.stringify([kies(1)]), '{"matches":[1]}');
  await draaiRadar({ opslag, client: m, fetchFn: f, nu });
  assert.equal(opslag.radarRijen[0].status, "handmatige broncheck vereist");
  assert.equal(m.bevestig(), 0, "geen kandidaten voor het model");
  assert.ok(isOverheidsUrl("https://www.impots.gouv.fr/x") && isOverheidsUrl("https://www.service-public.fr/x") && isOverheidsUrl("https://boss.gouv.fr/x") && isOverheidsUrl("https://www.ameli.fr/x"));
  assert.ok(!isOverheidsUrl("https://www.connexionfrance.com/x") && !isOverheidsUrl("https://www.lemonde.fr/x") && !isOverheidsUrl("niet-een-url"));
  assert.deepEqual(overheidKandidaten([pers, regimeOverheidMaarGeenOverheidsdomein, gouv()]).length, 1);
});

test("draaiRadar: onderwerp bestaat al als gepubliceerd bericht: status 'al gepubliceerd' met het bericht-id, zonder bevestigingsaanroep", async () => {
  const opslag = new GeheugenOpslag();
  opslag.berichtenLijst.push(bericht("b-1"), bericht("b-weg", { redactie: "weg" }), bericht("b-concept", { status: "concept" }));
  const g = gouv();
  opslag.items.set(g.url, g);
  const { f } = sitemapFetch([SIG1]);
  const m = model(JSON.stringify([kies(1)]), '{"matches":[1]}');
  const r = await draaiRadar({ opslag, client: m, fetchFn: f, nu });
  assert.equal(opslag.radarRijen[0].status, "al gepubliceerd");
  assert.equal(opslag.radarRijen[0].berichtId, "b-1");
  assert.equal(m.bevestig(), 0);
  assert.deepEqual(r.voorrangUrls, []);
  assert.equal(zoekBestaandBericht(["heel iets anders", "niets gedeeld"], opslag.berichtenLijst), null);
});

test("draaiRadar: dedup op signaal_url: tweede run gebruikt geen model en maakt geen tweede rij", async () => {
  const opslag = new GeheugenOpslag();
  const { f } = sitemapFetch([SIG1]);
  const m = model(JSON.stringify([kies(1)]), '{"matches":[]}');
  await draaiRadar({ opslag, client: m, fetchFn: f, nu });
  const na1 = m.aanroepen.length;
  const r2 = await draaiRadar({ opslag, client: m, fetchFn: f, nu });
  assert.equal(opslag.radarRijen.length, 1);
  assert.equal(m.aanroepen.length, na1, "al beoordeeld: geen nieuwe modelaanroepen");
  assert.equal(r2.nieuw, 0);
  // Ook de opslag zelf ontdubbelt op signaal_url.
  assert.equal(await opslag.radarOpslaan([{ ...opslag.radarRijen[0] }]), 0);
});

test("draaiRadar: budget: hooguit 3 selectie-aanroepen (batches van 20) en 10 bevestigingen per run", async () => {
  const opslag = new GeheugenOpslag();
  const rijen = Array.from({ length: 70 }, (_, i) => ({ url: `https://www.connexionfrance.com/n/${i}`, datum: nu - 3600_000 - i * 1000, titel: `Rent rule number ${i} changes for landlords` }));
  const { f } = sitemapFetch(rijen);
  // Elk antwoord kiest alle titels van de batch, met een eigen overheidsitem per titel, zodat er 20+ kandidaten voor bevestiging zijn.
  const m = model((a) => JSON.stringify(a.user.split("\n").map((_, k) => kies(k + 1, { werktitel: `Huurregel ${a.user.length}-${k} verandert`, zoektermen: [`regel ${a.user.length} ${k}`, `huur ${k}`] }))), '{"matches":[]}');
  const r = await draaiRadar({ opslag, client: m, fetchFn: f, nu });
  assert.equal(m.selectie(), RADAR_MAX_SELECTIE_AANROEPEN);
  assert.ok(m.aanroepen.filter((a) => a.system.startsWith("Je bent redacteur")).every((a) => a.user.split("\n").length <= 20));
  assert.ok(m.bevestig() <= RADAR_MAX_BEVESTIG_AANROEPEN);
  assert.ok(opslag.radarRijen.length <= 60);
  assert.equal(r.ok, true);
  // Ook de 10 bevestigingen: 25 kandidaten die allemaal een overheidsmatch vragen.
  const o2 = new GeheugenOpslag();
  for (let k = 0; k < 25; k += 1) o2.items.set(`https://www.service-public.fr/a${k}`, gouv({ url: `https://www.service-public.fr/a${k}`, titel: `Taxe d'habitation sur les résidences secondaires ${k}` }));
  const sm = sitemapFetch(Array.from({ length: 20 }, (_, i) => ({ url: `https://www.connexionfrance.com/m/${i}`, datum: nu - 3600_000 - i * 1000, titel: `Second home levy ${i}` })));
  const m2 = model((a) => JSON.stringify(a.user.split("\n").map((_, k) => kies(k + 1))), '{"matches":[1]}');
  await draaiRadar({ opslag: o2, client: m2, fetchFn: sm.f, nu });
  assert.equal(m2.bevestig(), RADAR_MAX_BEVESTIG_AANROEPEN);
  assert.equal(o2.radarRijen.length, 20);
});

test("draaiRadar: tijdbudget: een opgebruikt budget stopt netjes voor de modelaanroepen", async () => {
  const opslag = new GeheugenOpslag();
  const { f } = sitemapFetch([SIG1]);
  const m = model(JSON.stringify([kies(1)]), '{"matches":[]}');
  const r = await draaiRadar({ opslag, client: m, fetchFn: f, nu, budgetMs: 0 });
  assert.equal(r.ok, true);
  assert.equal(m.aanroepen.length, 0);
  assert.equal(opslag.radarRijen.length, 0);
});

test("draaiRadar: faalt netjes: sitemap stuk, time-out, kapotte XML, geen model; selectiefout laat niets achter", async () => {
  const opslag = new GeheugenOpslag();
  const m = model(JSON.stringify([kies(1)]), '{"matches":[]}');
  const stuk = sitemapFetch([SIG1], 503);
  const r1 = await draaiRadar({ opslag, client: m, fetchFn: stuk.f, nu });
  assert.equal(r1.ok, true, "een storing bij de signaalbron is geen fout van de motor");
  assert.match(String(r1.detail.sitemapFout), /503/);
  const werpt = (async () => { throw new Error("timeout"); }) as unknown as typeof fetch;
  const r2 = await draaiRadar({ opslag, client: m, fetchFn: werpt, nu });
  assert.equal(r2.ok, true);
  assert.match(String(r2.detail.sitemapFout), /timeout/);
  const kapot = (async () => new Response("<html>nee</html>")) as unknown as typeof fetch;
  const r3 = await draaiRadar({ opslag, client: m, fetchFn: kapot, nu });
  assert.equal(r3.ok, true);
  assert.equal(m.aanroepen.length, 0);
  const r4 = await draaiRadar({ opslag, client: null, fetchFn: stuk.f, nu });
  assert.equal(r4.ok, true);
  const modelStuk = model(() => { throw new Error("overbelast"); }, "{}");
  const ok = sitemapFetch([SIG1]);
  const r5 = await draaiRadar({ opslag, client: modelStuk, fetchFn: ok.f, nu });
  assert.equal(r5.ok, true);
  assert.equal(opslag.radarRijen.length, 0, "niet bewaard: komt de volgende run opnieuw aan de beurt");
  // De sitemapaanvraag heeft een timeout van 10 s.
  let signaal: AbortSignal | undefined;
  const spion = (async (_u: string, init?: RequestInit) => ((signaal = init?.signal as AbortSignal), new Response(sitemapXml([])))) as unknown as typeof fetch;
  await draaiRadar({ opslag, client: m, fetchFn: spion, nu });
  assert.ok(signaal, "de aanvraag heeft een afbreeksignaal (time-out)");
});

test("tabel ontbreekt: de radar slaat over zonder aanvraag of modelkosten, en de motor draait gewoon door", async () => {
  const opslag = new GeheugenOpslag();
  opslag.radarTabelOntbreekt = true;
  const { f, aangevraagd } = sitemapFetch([SIG1]);
  const m = model(JSON.stringify([kies(1)]), "{}");
  const r = await draaiRadar({ opslag, client: m, fetchFn: f, nu });
  assert.equal(r.ok, true);
  assert.match(String(r.detail.overgeslagen), /nv_radar/);
  assert.equal(aangevraagd.length, 0);
  assert.equal(m.aanroepen.length, 0);
  // Volledige run met een feed en een ontbrekende tabel: nog steeds een bericht.
  const tekst = "De afvalophaal in Marseille ligt sinds maandag stil door een staking van de vuilnismensen. Op straat stapelen de zakken zich op en het gemeentebestuur zoekt naar een oplossing met de vakbonden. Bewoners en toeristen in de havenstad merken het vooral in de drukke wijken bij de haven, waar de hoeveelheid afval snel toeneemt. Wie er verblijft, kan het best de aanwijzingen van de gemeente volgen.";
  const feed = rss([{ titel: "Marseille: grève des éboueurs, les ordures s'accumulent", url: "https://a.test/1", datum: new Date(nu - 3600_000), omschrijving: "Les éboueurs de Marseille sont en grève depuis lundi." }, ]);
  const feedB = rss([{ titel: "Grève des éboueurs à Marseille: les ordures s'entassent", url: "https://b.test/1", datum: new Date(nu - 7200_000), omschrijving: "La grève des éboueurs paralyse Marseille." }]);
  const fetchFn = (async (u: string) => (String(u).includes("a.test") ? new Response(feed) : String(u).includes("b.test") ? new Response(feedB) : new Response("x", { status: 500 }))) as unknown as typeof fetch;
  const client = klein([(a) => (a.system.includes("groepeert") ? '{"groepen":[]}' : JSON.stringify({ publiceren: true, kop: "Staking vuilnisophaal legt Marseille lam", samenvatting: "De vuilnisophaal in Marseille ligt stil door een staking en de afvalbergen groeien snel.", tekst, categorie: "algemeen", relevantie: 80 }))]);
  const uit = await draaiOogst({ opslag, client, nu, config: laadConfig(), bronnen: [bron({ id: "a", feed: "https://a.test/feed" }), bron({ id: "b", naam: "Sud Ouest", feed: "https://b.test/feed" })], fetchFn, peil: [], generator: null });
  assert.equal(uit.berichten.length, 1);
  const stap = uit.stappen.find((s) => s.stap === "radar")!;
  assert.equal(stap.ok, true);
  assert.ok(!uit.fouten.some((x) => x.startsWith("radar")));
});

test("SupabaseOpslag: een ontbrekende tabel nv_radar wordt herkend (RadarOntbreekt) en radarOpen/radarOpruimen geven leeg", async () => {
  assert.ok(isRadarFout(new Error('Supabase GET nv_radar: HTTP 404 {"code":"PGRST205","message":"Could not find the table \'public.nv_radar\' in the schema cache"}')));
  assert.ok(isRadarFout(new Error('Supabase POST nv_radar: HTTP 404 {"code":"42P01","message":"relation \\"public.nv_radar\\" does not exist"}')));
  assert.ok(!isRadarFout(new Error("Supabase GET nv_berichten: HTTP 500")));
  const fake = (async () => new Response('{"code":"PGRST205","message":"Could not find the table \'public.nv_radar\' in the schema cache"}', { status: 404 })) as unknown as typeof fetch;
  const s = new SupabaseOpslag("https://p.supabase.co", "sleutel", fake);
  await assert.rejects(() => s.radarBekend("2026-01-01T00:00:00.000Z"), RadarOntbreekt);
  await assert.rejects(() => s.radarOpslaan([{ signaalUrl: "https://x", signaalDatum: "2026-11-28T00:00:00.000Z", werktitel: "Titel van de radar", categorie: "Overig", relevantie: "r", status: "handmatige broncheck vereist", primaireBron: null, berichtId: null, beoordeeldOp: "2026-11-28T00:00:00.000Z" }]), RadarOntbreekt);
  await assert.rejects(() => s.zetRadarBesluit("11111111-1111-1111-1111-111111111111", "afgewezen"), RadarOntbreekt);
  assert.deepEqual(await s.radarOpen(50), []);
  assert.equal(await s.radarOpruimen("2026-01-01T00:00:00.000Z"), 0);
});

test("opruimen na 30 dagen", async () => {
  const opslag = new GeheugenOpslag();
  opslag.radarRijen.push(
    { id: "r1", signaalUrl: "https://x/1", signaalDatum: iso(nu - 40 * DAG), werktitel: "Oud onderwerp", categorie: "Overig", relevantie: "r", status: "handmatige broncheck vereist", primaireBron: null, berichtId: null, beoordeeldOp: iso(nu - 31 * DAG), besluit: null, besluitOp: null },
    { id: "r2", signaalUrl: "https://x/2", signaalDatum: iso(nu - DAG), werktitel: "Nieuw onderwerp", categorie: "Overig", relevantie: "r", status: "handmatige broncheck vereist", primaireBron: null, berichtId: null, beoordeeldOp: iso(nu - DAG), besluit: null, besluitOp: null },
  );
  const r = await draaiOogst({ opslag, client: null, nu, config: laadConfig(), bronnen: [], peil: [], generator: null });
  assert.equal(r.aantallen.radarOpgeruimd, 1);
  assert.deepEqual(opslag.radarRijen.map((x) => x.id), ["r2"]);
});

// ---- 5. Voorrang in de kandidaatvolgorde, alleen met overheidsbronnen --------------------------------------
test("voorrang: een overheidsonderwerp met radarmatch gaat voor in de kandidaatvolgorde; de volgorde is het enige dat verandert", () => {
  const x = gouv();
  const y = gouv({ url: "https://www.service-public.fr/y", titel: "Prix de l'électricité: nouveau tarif et aide pour la facture", samenvatting: "" });
  const cl = (i: BronItem): Cluster => ({ sleutel: i.url, items: [i] });
  assert.equal(kiesKandidaten([cl(x), cl(y)], 1, 5)[0].items[0].url, y.url, "zonder voorrang wint het onderwerp met het grootste gevolg");
  assert.equal(kiesKandidaten([cl(x), cl(y)], 1, 5, new Set([x.url]))[0].items[0].url, x.url);
  // Een pers-cluster krijgt nooit voorrang, ook niet als de url toevallig in de set staat.
  const p = item({ url: "https://www.lemonde.fr/p", regime: "pers", titel: "Autre sujet" });
  assert.notEqual(kiesKandidaten([cl(p), cl(y)], 1, 5, new Set([p.url]))[0].items[0].url, p.url);
});

test("integratie: radarmatch geeft het overheidsonderwerp voorrang; het bericht heeft alleen de overheidsbron en nergens connexionfrance.com", async () => {
  const opslag = new GeheugenOpslag();
  const tekst = "Wie een tweede huis in Frankrijk bezit, krijgt te maken met een hogere heffing op de woning. De overheid verhoogt de opslag voor woningen die niet als hoofdverblijf dienen, en gemeenten mogen die opslag zelf vaststellen. Eigenaren ontvangen daarover een aanslag met de nieuwe berekening en kunnen nagaan of hun gemeente de opslag toepast. Controleer de aanslag goed en vraag zo nodig uitleg bij de gemeente zelf.";
  const gouvFeed = rss([
    { titel: "Taxe d'habitation sur les résidences secondaires: nouvelle majoration", url: "https://www.service-public.fr/particuliers/actualites/X1", datum: new Date(nu - 2 * 3600_000), omschrijving: "La majoration de la taxe d'habitation est relevée." },
    { titel: "Prix de l'électricité: nouveau tarif et aide pour la facture", url: "https://www.service-public.fr/particuliers/actualites/Y1", datum: new Date(nu - 1 * 3600_000), omschrijving: "Le tarif change." },
  ]);
  const persFeed = rss([{ titel: "Quelque chose", url: "https://www.connexionfrance.com/news/niet-in-een-feed", datum: new Date(nu - 3600_000), omschrijving: "x" }]);
  const aangevraagd: string[] = [];
  const fetchFn = (async (u: string) => {
    aangevraagd.push(String(u));
    if (String(u) === RADAR_SITEMAP_URL) return new Response(sitemapXml([SIG1]));
    if (String(u).includes("gouv.test")) return new Response(gouvFeed);
    if (String(u).includes("pers.test")) return new Response(persFeed);
    return new Response("x", { status: 500 });
  }) as unknown as typeof fetch;
  const bronnen = [
    bron({ id: "sp", naam: "Service-Public.fr", feed: "https://gouv.test/feed", domein: "service-public.fr", groep: "overheid", regime: "overheid" }),
    bron({ id: "pers", naam: "Verkeerd gekozen bron", feed: "https://pers.test/feed", domein: "connexionfrance.com" }),
  ];
  const m = model(JSON.stringify([kies(1)]), '{"matches":[1]}', (a) =>
    a.system.includes("groepeert") ? '{"groepen":[]}' : JSON.stringify({ publiceren: true, kop: "Hogere opslag op tweede woningen in Frankrijk", samenvatting: "Eigenaren van een tweede huis betalen meer, omdat de opslag op de woonbelasting stijgt.", tekst, categorie: "economie en ondernemen", relevantie: 85 }));
  const cfg = { ...laadConfig(), maxSynthesesPerRun: 1 };
  const uit = await draaiOogst({ opslag, client: m, nu, config: cfg, bronnen, fetchFn, peil: [], generator: null });
  assert.equal(opslag.radarRijen.length, 1);
  assert.equal(opslag.radarRijen[0].status, "klaar voor redactie");
  assert.equal(uit.berichten.length, 1, uit.fouten.join(";"));
  const b = uit.berichten[0];
  assert.deepEqual(b.bronnen.map((x) => x.url), ["https://www.service-public.fr/particuliers/actualites/X1"], "alleen het radaronderwerp met zijn overheidsbron kwam aan de beurt");
  assert.equal(uit.aantallen.radarVoorrang, 1);
  // Nergens connexionfrance.com in opslag, bronnen of gepubliceerde tekst; het feedadres van de verkeerde bron is nooit opgehaald.
  assert.ok(![...opslag.items.keys()].some((u) => /connexionfrance/i.test(u)));
  assert.ok(!aangevraagd.includes("https://pers.test/feed"), "een bron met een verboden domein wordt niet opgehaald");
  assert.ok(!aangevraagd.some((u) => /connexionfrance/i.test(u) && u !== RADAR_SITEMAP_URL), "alleen de sitemap, geen artikelpagina");
  assert.ok(!JSON.stringify(opslag.berichtenLijst).match(/connexion/i));
  assert.ok(!m.aanroepen.some((a) => a.system.startsWith("Je schrijft") && /connexion/i.test(a.user)));
});

// ---- 6. Redactie-API --------------------------------------------------------------------------------------
const ID = "33333333-3333-3333-3333-333333333333";

test("radarVorm: exact het afgesproken formaat; The Connexion staat alleen in signaalVan", () => {
  const v = radarVorm({ id: ID, werktitel: "Tweede woningen: hogere belasting", categorie: "Belastingen", signaalDatum: "2026-11-27T08:00:00.000Z", relevantie: "Raakt bezitters van een tweede huis.",
    primaireBron: [{ naam: "Service-Public.fr", url: "https://www.service-public.fr/x", datum: "2026-11-26T07:00:00.000Z" }], status: "klaar voor redactie", berichtId: null });
  assert.equal(v.onderwerp, "Tweede woningen: hogere belasting");
  assert.equal(v.categorie, "Belastingen");
  assert.equal(v.signaalVan, "The Connexion (2026-11-27), uitsluitend gebruikt als onderwerpsignaal");
  assert.equal(v.relevantie, "Raakt bezitters van een tweede huis.");
  assert.deepEqual(v.primaireBronnen, [{ naam: "Service-Public.fr", url: "https://www.service-public.fr/x", datum: "2026-11-26T07:00:00.000Z" }]);
  assert.equal(v.status, "klaar voor redactie");
  assert.equal(v.opmerking, null);
  assert.ok(!/connexion/i.test(JSON.stringify({ ...v, signaalVan: "" })));
});

test("opslag: radar open (nieuwste eerst, max 50) en besluit", async () => {
  const opslag = new GeheugenOpslag();
  for (let i = 0; i < 55; i += 1) opslag.radarRijen.push({ id: `r${i}`, signaalUrl: `https://x/${i}`, signaalDatum: iso(nu - i * 3600_000), werktitel: `Onderwerp ${i} in Frankrijk`, categorie: "Overig", relevantie: "r", status: "handmatige broncheck vereist", primaireBron: null, berichtId: null, beoordeeldOp: iso(nu), besluit: null, besluitOp: null });
  const open = await opslag.radarOpen(50);
  assert.equal(open.length, 50);
  assert.equal(open[0].id, "r0");
  assert.deepEqual(open.map((r) => r.signaalDatum), [...open.map((r) => r.signaalDatum)].sort().reverse());
  await opslag.zetRadarBesluit("r0", "geaccepteerd");
  assert.equal((await opslag.radarOpen(50))[0].id, "r1", "met besluit niet meer open");
  assert.equal(await opslag.radarRij("bestaat-niet"), null);
});

// ---- 7. Harde regel: The Connexion komt nergens als bron terecht --------------------------------------------
test("harde regel: isVerbodenBron, actieve bronnen en bronnenlijst bevatten The Connexion niet", () => {
  for (const u of ["https://www.connexionfrance.com/a", "https://connexionfrance.com", "http://news.connexionfrance.com/x", "connexionfrance.com/x"]) assert.ok(isVerbodenBron(u), u);
  for (const u of ["https://www.service-public.fr/x", "https://www.lemonde.fr/x", "", null, undefined]) assert.ok(!isVerbodenBron(u as string), String(u));
  assert.ok(![...laadBronnen(), ...actieveBronnen()].some((b) => /connexion/i.test(`${b.id} ${b.naam} ${b.feed} ${b.domein}`)));
  assert.ok(!/connexion/i.test(readFileSync(join(__dirname, "../data/bronnen.json"), "utf8")));
});

test("harde regel: items van het verboden domein komen niet in de oogst, niet in nv_bron_items en niet in artikelophaling", async () => {
  // Feed van een gewone bron die toevallig een Connexion-url bevat.
  const feed = rss([
    { titel: "Marseille: grève des éboueurs, les ordures s'accumulent", url: "https://www.connexionfrance.com/news/x", datum: new Date(nu - 3600_000) },
    { titel: "Marseille: grève des éboueurs, les ordures s'accumulent", url: "https://a.test/ok", datum: new Date(nu - 3600_000) },
  ]);
  const r = await oogstBronnen([bron({ id: "a", feed: "https://a.test/feed" })], { nu, fetchFn: (async () => new Response(feed)) as unknown as typeof fetch });
  assert.deepEqual(r.items.map((i) => i.url), ["https://a.test/ok"]);
  assert.equal(r.resultaten[0].geweerd.verboden_bron, 1);
  // De opslag zelf weigert het ook, voor het geval een item langs de oogst komt.
  const opslag = new GeheugenOpslag();
  assert.equal(await opslag.upsertItems([item({ url: "https://www.connexionfrance.com/news/y" }), item({ url: "https://a.test/z" })]), 1);
  assert.deepEqual([...opslag.items.keys()], ["https://a.test/z"]);
  const rijen: string[] = [];
  const s = new SupabaseOpslag("https://p.supabase.co", "sleutel", (async (_u: string, init?: RequestInit) => ((rijen.push(String(init?.body || "")), new Response("[]"))) ) as unknown as typeof fetch);
  await s.upsertItems([item({ url: "https://www.connexionfrance.com/news/y" })]);
  assert.ok(!rijen.some((b) => /connexion/i.test(b)), "geen enkele rij naar Supabase");
  // Artikelophaling: geen aanvraag naar het verboden domein.
  let aanvragen = 0;
  const spion = (async () => ((aanvragen += 1), new Response("<p>x</p>"))) as unknown as typeof fetch;
  assert.equal(await haalArtikelTekst("https://www.connexionfrance.com/news/y", spion), "");
  const c: Cluster = { sleutel: "c", items: [item({ url: "https://www.connexionfrance.com/news/y" })] };
  assert.equal(await verrijkMetArtikelen(c, spion), 0);
  assert.equal(aanvragen, 0);
});

test("harde regel: ook een bericht met zo'n bron in de opslag toont die niet in de publieke API-vorm", () => {
  const b = bericht("b-9", { bronnen: [{ naam: "x", origineleKop: "k", datum: "d", url: "https://www.connexionfrance.com/n" }, { naam: "Service-Public.fr", origineleKop: "k", datum: "d", url: "https://www.service-public.fr/n" }] });
  const p = publiekBericht(b, false);
  assert.deepEqual(p.bronnen.map((x) => x.url), ["https://www.service-public.fr/n"]);
});

test("harde regel: publieke API, RSS en sitemap tonen niets van de radar; de redactie-API wel", async () => {
  const opslag = new GeheugenOpslag();
  opslag.berichtenLijst.push(bericht(ID));
  opslag.radarRijen.push({ id: "r1", signaalUrl: SIG1.url, signaalDatum: iso(SIG1.datum), werktitel: "Tweede woningen: hogere belasting", categorie: "Belastingen", relevantie: "Raakt tweede-huisbezitters.", status: "handmatige broncheck vereist", primaireBron: null, berichtId: null, beoordeeldOp: iso(nu), besluit: null, besluitOp: null });
    const echt = globalThis.fetch;
  const was = [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET];
  process.env.SUPABASE_URL = "https://p.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "dienstsleutel"; process.env.CRON_SECRET = "geheim-test";
  const radarRij = { id: "33333333-3333-3333-3333-333333333330", signaal_url: SIG1.url, signaal_datum: iso(SIG1.datum), werktitel: "Tweede woningen: hogere belasting", categorie: "Belastingen", relevantie: "Raakt tweede-huisbezitters.", status: "handmatige broncheck vereist", primaire_bron: null, bericht_id: null, beoordeeld_op: iso(nu), besluit: null, besluit_op: null };
  const nepBericht = { id: ID, kop: "Kop", samenvatting: "S", tekst: "T", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd", blokkade_redenen: [], beeld_url: null, gepubliceerd_op: iso(nu - 3600_000), peil_raakt: [], peil_mogelijk_gewijzigd: [], nv_bronnen_per_bericht: [{ volgorde: 0, bron_naam: "Service-Public.fr", originele_kop: "k", datum: iso(nu), url: "https://www.service-public.fr/x" }] };
  const patches: string[] = [];
  globalThis.fetch = (async (u: string, init?: RequestInit) => {
    const url = String(u);
    if (init?.method === "PATCH" && url.includes("nv_radar")) { patches.push(String(init.body)); return new Response(null, { status: 204 }); }
    if (url.includes("nv_radar")) return new Response(JSON.stringify([radarRij]));
    if (url.includes("nv_berichten")) return new Response(JSON.stringify([nepBericht]));
    if (url.includes("nv_oogst_runs")) return new Response("[]");
    return new Response("[]");
  }) as typeof fetch;
  wisRem();
  wisOpslagCache();
  try {
    const bearer = { authorization: "Bearer geheim-test", "x-forwarded-for": "9.9.9.9" };
    const publiek = [await nieuwsGET(new Request("https://x.test/api/nieuws")), await rssGET(new Request("https://x.test/api/rss"))];
    for (const r of publiek) {
      const t = await r.text();
      assert.ok(!/connexion|onderwerpsignaal|Tweede woningen|radar/i.test(t), t.slice(0, 200));
    }
    assert.ok(!/connexion|radar/i.test(JSON.stringify(await sitemapPagina())));
    const g = await redGET(new Request("https://x.test/api/redactie?dagen=2", { headers: bearer }));
    assert.equal(g.status, 200);
    const j = (await g.json()) as { radar: Record<string, unknown>[] };
    assert.equal(j.radar.length, 1);
    assert.equal(j.radar[0].onderwerp, "Tweede woningen: hogere belasting");
    assert.equal(j.radar[0].signaalVan, `The Connexion (${iso(SIG1.datum).slice(0, 10)}), uitsluitend gebruikt als onderwerpsignaal`);
    assert.equal(j.radar[0].status, "handmatige broncheck vereist");
    assert.equal(j.radar[0].opmerking, GEEN_BRON_TEKST);
    const post = (body: unknown) => redPOST(new Request("https://x.test/api/redactie", { method: "POST", headers: { ...bearer, "content-type": "application/json" }, body: JSON.stringify(body) }));
    assert.equal((await post({ actie: "radar", id: radarRij.id, keuze: "onzin" })).status, 400);
    assert.equal((await post({ actie: "radar", id: radarRij.id })).status, 400);
    const ok = await post({ actie: "radar", id: radarRij.id, keuze: "afgewezen" });
    assert.equal(ok.status, 200);
    assert.deepEqual((await ok.json()) as unknown, { radar: { id: radarRij.id, besluit: "afgewezen" } });
    assert.ok(patches.some((p) => p.includes('"besluit":"afgewezen"') && p.includes("besluit_op")));
    // Zonder sleutel blijft alles dicht.
    const zonderSleutel = await redGET(new Request("https://x.test/api/redactie", { headers: { "x-forwarded-for": "8.8.8.8" } }));
    assert.equal(zonderSleutel.status, 401);
  } finally {
    globalThis.fetch = echt;
    wisOpslagCache();
    [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET] = was;
    if (was[0] === undefined) delete process.env.SUPABASE_URL;
    if (was[1] === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (was[2] === undefined) delete process.env.CRON_SECRET;
  }
});

test("redactie-API: POST radar met ontbrekende tabel geeft 503; onbekend of al beslist geeft 404 of 409", async () => {
  const echt = globalThis.fetch;
  const was = [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET];
  process.env.SUPABASE_URL = "https://p.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "dienstsleutel"; process.env.CRON_SECRET = "geheim-test";
  const id = "44444444-4444-4444-4444-444444444444";
  let stand: "weg" | "leeg" | "beslist" = "weg";
  globalThis.fetch = (async (u: string) => {
    if (!String(u).includes("nv_radar")) return new Response("[]");
    if (stand === "weg") return new Response('{"code":"PGRST205","message":"Could not find the table \'public.nv_radar\' in the schema cache"}', { status: 404 });
    if (stand === "leeg") return new Response("[]");
    return new Response(JSON.stringify([{ id, signaal_url: "https://x", signaal_datum: iso(nu), werktitel: "Titel van de radar", categorie: "Overig", relevantie: "r", status: "al gepubliceerd", primaire_bron: null, bericht_id: null, beoordeeld_op: iso(nu), besluit: "afgewezen", besluit_op: iso(nu) }]));
  }) as typeof fetch;
  wisRem();
  wisOpslagCache();
  try {
    const bearer = { authorization: "Bearer geheim-test", "x-forwarded-for": "7.7.7.7" };
    const post = () => redPOST(new Request("https://x.test/api/redactie", { method: "POST", headers: { ...bearer, "content-type": "application/json" }, body: JSON.stringify({ actie: "radar", id, keuze: "geaccepteerd" }) }));
    assert.equal((await post()).status, 503);
    stand = "leeg";
    assert.equal((await post()).status, 404);
    stand = "beslist";
    assert.equal((await post()).status, 409);
    // GET met ontbrekende tabel: geen fout, lege radar.
    stand = "weg";
    const g = await redGET(new Request("https://x.test/api/redactie", { headers: bearer }));
    assert.equal(g.status, 200);
    assert.deepEqual(((await g.json()) as { radar: unknown[] }).radar, []);
  } finally {
    globalThis.fetch = echt;
    wisOpslagCache();
    [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET] = was;
    if (was[0] === undefined) delete process.env.SUPABASE_URL;
    if (was[1] === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (was[2] === undefined) delete process.env.CRON_SECRET;
  }
});

test("harde regel (bronscan): alleen de radar, de redactie en de tests noemen The Connexion; publieke code en gegevens niet", () => {
  const root = join(__dirname, "..");
  const toegestaan = new Set(["lib/motor/radar.ts", "lib/motor/bronnenlijst.ts", "lib/bronbeheer.ts", "lib/motor/config.ts", "lib/motor/types.ts", "lib/motor/opslag.ts", "lib/motor/motor.ts", "lib/redactie.ts", "app/api/redactie/route.ts"]);
  const lijst: string[] = [];
  const loop = (map: string) => {
    for (const n of readdirSync(join(root, map))) {
      const p = join(map, n);
      const st = statSync(join(root, p));
      if (st.isDirectory()) { if (!["node_modules", ".next", "archief", "public"].includes(n)) loop(p); }
      else if (/\.(ts|tsx|json|css)$/.test(n)) lijst.push(p);
    }
  };
  for (const m of ["app", "lib", "data"]) loop(m);
  const noemt = lijst.filter((p) => /connexion/i.test(readFileSync(join(root, p), "utf8")));
  assert.deepEqual(noemt.filter((p) => !toegestaan.has(p)), [], "deze bestanden noemen The Connexion buiten de toegestane plekken");
  // Publieke uitvoer: nooit in api.ts, rss.ts, site.ts of de pagina's onder app/ (buiten de redactie-route).
  for (const p of ["lib/motor/api.ts", "lib/motor/rss.ts", "lib/site.ts"]) assert.ok(!/connexion/i.test(readFileSync(join(root, p), "utf8")), p);
});
