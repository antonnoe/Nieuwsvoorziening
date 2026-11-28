// Tweede radarbron (28-11-2026): frankrijkactueel.nl, Nederlandstalige nieuwssitemap. Zelfde harde regels als The Connexion:
// uitsluitend onderwerpsignaal, nooit bron, nooit tekst of kop als bronmateriaal. Nep-fetch en nep-model; geen netwerk.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSitemap, uitgesloten, binnenVenster, leesSelectie, draaiRadar, radarVorm, signaalBronNaam, lijktOpKop, SYSTEEM_RADAR_SELECTIE, type SitemapItem } from "../lib/motor/radar";
import { GeheugenOpslag } from "../lib/motor/opslag";
import { isVerbodenBron, actieveBronnen } from "../lib/motor/config";
import { oogstBronnen } from "../lib/motor/feeds";
import { haalArtikelTekst } from "../lib/motor/artikel";
import { publiekBericht } from "../lib/motor/api";
import { bron, item } from "./helpers";
import type { ModelClient } from "../lib/motor/ai";
import type { BronRij } from "../lib/motor/types";

const FIX = readFileSync(join(__dirname, "fixtures/frankrijkactueel-news-sitemap.xml"), "utf8");
const FA_SITEMAP = "https://frankrijkactueel.nl/news-sitemap.xml";
// De fixture heeft vaste datums rond 27 november 2026.
const nu = Date.parse("2026-11-28T09:00:00Z");

test("NL-sitemap: alleen loc, datum en titel; CDATA en entiteiten kloppen; Nederlandse tekens blijven heel", () => {
  const r = parseSitemap(FIX);
  assert.equal(r.length, 5);
  assert.equal(r[0].titel, "Hogere belasting op tweede woningen in Frankrijk: wat verandert er voor eigenaren?");
  assert.equal(r[1].titel, "Huisartsbezoek in Frankrijk wordt duurder: vergoeding via de carte vitale & mutuelle");
  assert.equal(r[0].datum, "2026-11-27T07:15:00.000Z");
  assert.deepEqual(Object.keys(r[0]).sort(), ["datum", "titel", "url"]);
  assert.ok(r.every((i) => i.url.startsWith("https://frankrijkactueel.nl/")));
});

test("NL-titels: sport, recepten en Brexit/visum vallen af met de standaardlijst; praktisch nieuws blijft", () => {
  const r = parseSitemap(FIX);
  const uit = r.filter((i) => uitgesloten(i.titel) === null).map((i) => i.url);
  assert.deepEqual(uit, ["https://frankrijkactueel.nl/belasting/hogere-opslag-tweede-woning-2027/", "https://frankrijkactueel.nl/zorg/carte-vitale-huisarts/"]);
  assert.ok(uitgesloten("Voetbal: Frankrijk wint van Nederland"));
  assert.ok(uitgesloten("Mooiste dorpjes van de Dordogne"));
  assert.equal(uitgesloten("Energieprijzen voor huishoudens stijgen in januari"), null);
  assert.equal(binnenVenster(r, nu).length, 5);
});

test("selectie-opdracht neemt niet aan dat titels Engels zijn en verbiedt overname van een (Nederlandse) kop", () => {
  assert.ok(/Engels, Frans of Nederlands/.test(SYSTEEM_RADAR_SELECTIE));
  assert.ok(!/Engelstalig|titels in het Engels|vertaal/i.test(SYSTEEM_RADAR_SELECTIE.replace("nooit de kop overnemen of vertalen", "")));
  assert.ok(/nooit de kop overnemen/.test(SYSTEEM_RADAR_SELECTIE));
});

test("leesSelectie: een werktitel die de Nederlandse kop (bijna) letterlijk herhaalt valt af; een eigen formulering blijft", () => {
  const batch: SitemapItem[] = parseSitemap(FIX).slice(0, 2);
  const kies = (n: number, werktitel: string) => ({ n, werktitel, categorie: "Belastingen", relevantie: "Raakt eigenaren van een tweede huis in Frankrijk.", zoektermen: ["taxe d'habitation", "résidences secondaires"] });
  const r = leesSelectie(JSON.stringify([
    kies(1, "Hogere belasting op tweede woningen in Frankrijk: wat verandert er voor eigenaren?"),
    kies(2, "Eigen risico bij de huisarts stijgt"),
  ]), batch);
  assert.deepEqual(r.map((x) => x.werktitel), ["Eigen risico bij de huisarts stijgt"]);
  assert.ok(lijktOpKop("Hogere belasting op tweede woningen in Frankrijk", batch[0].titel));
  assert.ok(!lijktOpKop("Opslag op woonbelasting voor tweede huizen stijgt", batch[0].titel));
  // De naam van de tipgever mag nergens in de werktitel of toelichting staan.
  assert.deepEqual(leesSelectie(JSON.stringify([kies(1, "Frankrijk Actueel meldt hogere opslag op woonbelasting")]), batch), []);
  assert.deepEqual(leesSelectie(JSON.stringify([kies(1, "Opslag op woonbelasting volgens frankrijkactueel.nl")]), batch), []);
});

const rij = (id: string, naam: string, feed: string, domein: string, taal: "nl" | "en"): BronRij => ({
  id, naam, feed, domein, taal, land: taal === "nl" ? "NL" : "FR", groep: "buitenlandse_pers", regime: "pers", status: "ACTIVE", prioriteit: 3, frankrijkFilter: false, vensterUren: 72,
  soort: "radar", actief: true, toegevoegdOp: null, toegevoegdDoor: null, laatstGelezen: null, laatstItems: null, laatsteFout: null, uitsluit: null,
});

test("draaiRadar met de NL-sitemap: alleen titels naar het model, alleen de sitemap opgehaald, nooit een artikelpagina; de tip wordt een eigen onderwerp", async () => {
  const opslag = new GeheugenOpslag();
  const aangevraagd: string[] = [];
  const fetchFn = (async (u: string) => ((aangevraagd.push(String(u)), String(u) === FA_SITEMAP ? new Response(FIX) : new Response("x", { status: 500 })))) as unknown as typeof fetch;
  const modelAanroepen: { system: string; user: string }[] = [];
  const client: ModelClient = {
    async tekst(a) {
      modelAanroepen.push({ system: a.system, user: a.user });
      return JSON.stringify([{ n: 1, werktitel: "Opslag op woonbelasting voor tweede woningen stijgt", categorie: "Belastingen", relevantie: "Eigenaren van een tweede huis betalen meer.", zoektermen: ["taxe d'habitation", "résidences secondaires", "majoration"] }]);
    },
  };
  const u = await draaiRadar({ opslag, client, fetchFn, nu, radarBronnen: [rij("frankrijkactueel-radar", "Frankrijk Actueel (radar)", FA_SITEMAP, "frankrijkactueel.nl", "nl")] });
  assert.ok(u.ok, u.fout);
  assert.deepEqual(aangevraagd, [FA_SITEMAP], "één aanvraag, geen artikelpagina");
  assert.equal(modelAanroepen.length, 1);
  const sel = modelAanroepen[0];
  // Het model krijgt alleen de Nederlandse titels van de items die door het filter kwamen, geen url en geen bronnaam.
  assert.ok(sel.user.includes("Hogere belasting op tweede woningen") && sel.user.includes("Huisartsbezoek"));
  assert.ok(!/Tour de France|coq au vin|visumregels/.test(sel.user));
  assert.ok(!/https?:|frankrijkactueel/i.test(sel.user + sel.system));
  assert.equal(opslag.radarRijen.length, 1);
  assert.equal(opslag.radarRijen[0].werktitel, "Opslag op woonbelasting voor tweede woningen stijgt");
  assert.equal(opslag.radarRijen[0].status, "handmatige broncheck vereist");
  assert.equal(u.voorrangUrls.length, 0);
});

test("twee radarbronnen in één run (Connexion en Frankrijk Actueel): elk één aanvraag, beide titellijsten gaan mee", async () => {
  const opslag = new GeheugenOpslag();
  const CX = "https://www.connexionfrance.com/tag/news?lab_viewport=newssitemap";
  const cx = `<urlset xmlns:news="x"><url><loc>https://www.connexionfrance.com/n/1</loc><news:news><news:publication_date>2026-11-27T08:00:00Z</news:publication_date><news:title>Energy price cap changes for households</news:title></news:news></url></urlset>`;
  const aangevraagd: string[] = [];
  const fetchFn = (async (u: string) => ((aangevraagd.push(String(u)), String(u) === FA_SITEMAP ? new Response(FIX) : String(u) === CX ? new Response(cx) : new Response("x", { status: 500 })))) as unknown as typeof fetch;
  let user = "";
  const client: ModelClient = { async tekst(a) { user = a.user; return "[]"; } };
  await draaiRadar({ opslag, client, fetchFn, nu, radarBronnen: [rij("connexion-radar", "The Connexion (radar)", CX, "connexionfrance.com", "en"), rij("frankrijkactueel-radar", "Frankrijk Actueel (radar)", FA_SITEMAP, "frankrijkactueel.nl", "nl")] });
  assert.deepEqual(aangevraagd, [CX, FA_SITEMAP]);
  assert.ok(user.includes("Energy price cap") && user.includes("Hogere belasting op tweede woningen"));
});

test("harde regel: frankrijkactueel.nl is nooit bron (oogst, opslag, artikelophaling, publieke vorm)", async () => {
  for (const u of ["https://frankrijkactueel.nl/belasting/x/", "https://www.frankrijkactueel.nl/x", "frankrijkactueel.nl"]) assert.ok(isVerbodenBron(u), u);
  assert.ok(!isVerbodenBron("https://www.service-public.fr/x"));
  assert.ok(!actieveBronnen().some((b) => /frankrijkactueel/i.test(`${b.id} ${b.naam} ${b.feed} ${b.domein}`)));
  assert.ok(!/frankrijkactueel/i.test(readFileSync(join(__dirname, "../data/bronnen.json"), "utf8")));
  // Oogst: een item van dit domein in een gewone feed wordt geweerd.
  const feedXml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${["https://frankrijkactueel.nl/a", "https://a.test/ok"].map((u) => `<item><title>Marseille: grève des éboueurs, les ordures s'accumulent</title><link>${u}</link><pubDate>${new Date(nu - 3600_000).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;
  const r = await oogstBronnen([bron({ id: "a", feed: "https://a.test/feed" })], { nu, fetchFn: (async () => new Response(feedXml)) as unknown as typeof fetch });
  assert.deepEqual(r.items.map((i) => i.url), ["https://a.test/ok"]);
  const opslag = new GeheugenOpslag();
  assert.equal(await opslag.upsertItems([item({ url: "https://frankrijkactueel.nl/n/y" }), item({ url: "https://a.test/z" })]), 1);
  let n = 0;
  assert.equal(await haalArtikelTekst("https://frankrijkactueel.nl/n/y", (async () => ((n += 1), new Response("<p>x</p>"))) as unknown as typeof fetch), "");
  assert.equal(n, 0);
  const b = publiekBericht({ id: "b", kop: "k", samenvatting: "s", tekst: "T", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd", blokkadeRedenen: [], beeldUrl: null, gepubliceerdOp: new Date(nu).toISOString(), peil: { raakt: [], mogelijkGewijzigd: [] },
    bronnen: [{ naam: "x", origineleKop: "k", datum: "d", url: "https://frankrijkactueel.nl/n" }, { naam: "Service-Public.fr", origineleKop: "k", datum: "d", url: "https://www.service-public.fr/n" }] } as never, false);
  assert.deepEqual(b.bronnen.map((x) => x.url), ["https://www.service-public.fr/n"]);
});

test("signaalVan noemt de juiste tipgever, alleen voor de redactie", () => {
  assert.equal(signaalBronNaam("https://frankrijkactueel.nl/belasting/x/"), "Frankrijk Actueel");
  assert.equal(signaalBronNaam("https://www.connexionfrance.com/n/1"), "The Connexion");
  const v = radarVorm({ signaalUrl: "https://frankrijkactueel.nl/belasting/x/", id: "i", werktitel: "Opslag op woonbelasting stijgt", categorie: "Belastingen", signaalDatum: "2026-11-27T07:15:00.000Z", relevantie: "r", primaireBron: null, status: "handmatige broncheck vereist", berichtId: null });
  assert.equal(v.signaalVan, "Frankrijk Actueel (2026-11-27), uitsluitend gebruikt als onderwerpsignaal");
});

test("bronscan: frankrijkactueel komt alleen voor in radar, config en tests", () => {
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const root = join(__dirname, "..");
  const lijst: string[] = [];
  const loop = (map: string) => {
    for (const n of readdirSync(join(root, map))) {
      const p = join(map, n);
      if (statSync(join(root, p)).isDirectory()) { if (!["node_modules", ".next", "archief", "public"].includes(n)) loop(p); }
      else if (/\.(ts|tsx|json|css)$/.test(n)) lijst.push(p);
    }
  };
  for (const m of ["app", "lib", "data"]) loop(m);
  const noemt = lijst.filter((p) => /frankrijkactueel|frankrijk actueel/i.test(readFileSync(join(root, p), "utf8")));
  assert.deepEqual(noemt.sort(), ["lib/motor/config.ts", "lib/motor/radar.ts"]);
});
