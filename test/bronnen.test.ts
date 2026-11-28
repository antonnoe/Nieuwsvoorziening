// Bronnen in de database (28-11-2026): terugval op data/bronnen.json, radar generiek over meerdere bronnen, harde scheiding radar/nieuws,
// feed-ontdekking (met fixtures, geen netwerk) en het toevoegen/weghalen van bronnen. Geen netwerk: alles gaat via een nep-fetch.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { GeheugenOpslag, TabelOntbreekt, type Opslag } from "../lib/motor/opslag";
import { actieveBronnen, isVerbodenBron, radarDomeinen, zetRadarDomeinen, laadBronnen } from "../lib/motor/config";
import { actieveNieuwsBronnen, actieveRadarBronnen, bronKleur, bronSoortLabel, connexionRadarbron, laadBronnenLijst, soortVelden, terugvalBronnen } from "../lib/motor/bronnenlijst";
import { oogstBronnen } from "../lib/motor/feeds";
import { draaiOogst } from "../lib/motor/motor";
import { draaiRadar, leesSelectie, uitsluitLijstVan, RADAR_UITSLUIT } from "../lib/motor/radar";
import { FEED_PADEN, feedTitel, normaliseerAdres, ontdekFeed, vindFeedLinks } from "../lib/bronontdekking";
import { MELDING_GEEN_FEED, MELDING_GEEN_TABEL, MELDING_NIEUWS_NIET_RADAR, MELDING_RADAR_NIET_NIEUWS, maakBronId, raadBron, regimeVoorDomein, verwijderBron, voegBronToe, wijzigBron } from "../lib/bronbeheer";
import { bron, klein, rss } from "./helpers";
import type { BronRij } from "../lib/motor/types";
import { laadConfig } from "../lib/motor/config";

afterEach(() => zetRadarDomeinen([]));

const nu = Date.now();
const DAG = 86400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const rij = (o: Partial<BronRij> = {}): BronRij => ({ ...bron(), soort: "nieuws", actief: true, toegevoegdOp: null, toegevoegdDoor: null, laatstGelezen: null, laatstItems: null, laatsteFout: null, ...o });
const radarRij = (o: Partial<BronRij> = {}) => rij({ id: "radar-x", naam: "Radar X", feed: "https://radar.example/news-sitemap.xml", domein: "radar.example", soort: "radar", groep: "buitenlandse_pers", ...o });

/** Nep-fetch: url (zonder fragment) naar tekst of status. Houdt de aangevraagde adressen bij. */
function nepFetch(kaart: Record<string, string | number>) {
  const aangevraagd: string[] = [];
  const f = (async (u: string) => {
    aangevraagd.push(String(u));
    const x = kaart[String(u)];
    if (x === undefined) return new Response("niet gevonden", { status: 404 });
    if (typeof x === "number") return new Response("fout", { status: x });
    return new Response(x, { status: 200 });
  }) as unknown as typeof fetch;
  return { f, aangevraagd };
}
const sitemap = (rijen: { url: string; datum: number; titel: string }[]) =>
  `<?xml version="1.0"?><urlset xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${rijen.map((r) => `<url><loc>${r.url}</loc><news:news><news:publication_date>${iso(r.datum)}</news:publication_date><news:title>${r.titel}</news:title></news:news></url>`).join("")}</urlset>`;

// ---- Terugval op data/bronnen.json -----------------------------------------------------------------------
test("terugval: ontbrekende tabel, storing of lege tabel geven data/bronnen.json plus The Connexion als radarbron", async () => {
  const ontbreekt = new GeheugenOpslag();
  ontbreekt.bronnenTabelOntbreekt = true;
  const kapot = { bronnenLijst: async () => { throw new Error("netwerk weg"); } } as unknown as Opslag;
  for (const [opslag, reden] of [[ontbreekt, /bestaat nog niet/], [kapot, /kon niet worden gelezen/], [new GeheugenOpslag(), /leeg/], [null, /geen opslag/]] as const) {
    const l = await laadBronnenLijst(opslag);
    assert.equal(l.uitTabel, false);
    assert.match(String(l.terugvalReden), reden);
    assert.deepEqual(actieveNieuwsBronnen(l.rijen).map((b) => b.id), actieveBronnen().map((b) => b.id), "dezelfde actieve bronnen als het bestand");
    assert.equal(l.rijen.filter((r) => r.soort === "nieuws").length, laadBronnen().length);
    assert.deepEqual(actieveRadarBronnen(l.rijen).map((r) => r.id), ["connexion-radar"]);
  }
});

test("terugval: de motor oogst de bronnen uit data/bronnen.json zonder tabel (geen verzoek naar de radarbron, geen fout)", async () => {
  const opslag = new GeheugenOpslag();
  opslag.bronnenTabelOntbreekt = true;
  const { f, aangevraagd } = nepFetch({});
  const r = await draaiOogst({ opslag, client: null, config: laadConfig(), fetchFn: f, peil: [], generator: null });
  assert.deepEqual(new Set(aangevraagd), new Set(actieveBronnen().map((b) => b.feed)));
  assert.equal(r.aantallen.bronnen, actieveBronnen().length);
  assert.equal(r.aantallen.bronnenUitTerugval, 1);
  assert.ok(!aangevraagd.some((u) => /connexion/i.test(u)));
  assert.deepEqual(r.fouten.filter((x) => !/bronnen_mislukt/.test(x)), []);
});

test("uit de tabel: alleen actieve ACTIVE nieuwsbronnen worden geoogst; per bron komt laatst gelezen, items en fout in de tabel", async () => {
  const opslag = new GeheugenOpslag();
  opslag.bronnenRijen.push(
    rij({ id: "goed", feed: "https://goed.test/feed", domein: "goed.test" }),
    rij({ id: "stuk", feed: "https://stuk.test/feed", domein: "stuk.test" }),
    rij({ id: "leeg", feed: "https://leeg.test/feed", domein: "leeg.test" }),
    rij({ id: "concept", feed: "https://concept.test/feed", domein: "concept.test", status: "CONCEPT" }),
    rij({ id: "uit", feed: "https://uit.test/feed", domein: "uit.test", actief: false }),
    radarRij(),
  );
  const feed = rss([{ titel: "Prix du carburant en hausse cette semaine", url: "https://goed.test/a", datum: new Date(nu - 3600_000) }]);
  const { f, aangevraagd } = nepFetch({ "https://goed.test/feed": feed, "https://stuk.test/feed": 500, "https://leeg.test/feed": rss([]) });
  const r = await draaiOogst({ opslag, client: null, config: laadConfig(), fetchFn: f, peil: [], generator: null, nu });
  assert.deepEqual(new Set(aangevraagd), new Set(["https://goed.test/feed", "https://stuk.test/feed", "https://leeg.test/feed"]));
  assert.equal(r.aantallen.bronnen, 3);
  const per = (id: string) => opslag.bronnenRijen.find((x) => x.id === id)!;
  assert.equal(per("goed").laatstGelezen, iso(nu));
  assert.equal(per("goed").laatstItems, iso(nu));
  assert.equal(per("goed").laatsteFout, null);
  assert.equal(per("stuk").laatstGelezen, iso(nu));
  assert.equal(per("stuk").laatstItems, null);
  assert.match(String(per("stuk").laatsteFout), /HTTP 500/);
  assert.equal(per("leeg").laatstItems, null);
  assert.equal(per("leeg").laatsteFout, null);
  assert.equal(per("concept").laatstGelezen, null);
  assert.equal(per("uit").laatstGelezen, null);
});

test("een fout bij het bewaren van de leesgegevens breekt de oogst niet", async () => {
  const opslag = new GeheugenOpslag();
  opslag.bronnenRijen.push(rij({ id: "goed", feed: "https://goed.test/feed", domein: "goed.test" }));
  opslag.bronGelezen = async () => { throw new Error("schrijffout"); };
  const { f } = nepFetch({ "https://goed.test/feed": rss([]) });
  const r = await draaiOogst({ opslag, client: null, config: laadConfig(), fetchFn: f, peil: [], generator: null, nu });
  assert.equal(r.aantallen.bronnenOk, 1);
});

// ---- Radar generiek en de harde scheiding ----------------------------------------------------------------
test("harde regel: connexionfrance.com is altijd verboden, ook als de database onbereikbaar is; radardomeinen uit de database komen erbij", async () => {
  zetRadarDomeinen([]);
  assert.ok(isVerbodenBron("https://www.connexionfrance.com/news/x"));
  const kapot = { bronnenLijst: async () => { throw new Error("db weg"); } } as unknown as Opslag;
  await laadBronnenLijst(kapot);
  assert.ok(isVerbodenBron("https://www.connexionfrance.com/news/x"), "na een mislukte lezing");
  assert.ok(radarDomeinen().includes("connexionfrance.com"));
  assert.ok(!isVerbodenBron("https://radar.example/a"));
  const opslag = new GeheugenOpslag();
  opslag.bronnenRijen.push(radarRij(), rij({ id: "gewoon", feed: "https://gewoon.test/f", domein: "gewoon.test" }));
  await laadBronnenLijst(opslag);
  for (const u of ["https://radar.example/a", "https://www.radar.example/a", "https://nieuws.radar.example/a", "radar.example"]) assert.ok(isVerbodenBron(u), u);
  assert.ok(!isVerbodenBron("https://gewoon.test/a") && !isVerbodenBron("https://nietradar.example/a") && !isVerbodenBron("https://example.com/radar.example"));
  // Een uitgeschakelde radarbron blokkeert niets meer.
  opslag.bronnenRijen[0].actief = false;
  await laadBronnenLijst(opslag);
  assert.ok(!isVerbodenBron("https://radar.example/a"));
});

test("harde regel: een nieuwsbron met een radardomein wordt niet geoogst, niet opgeslagen en komt niet in de actieve lijst", async () => {
  const opslag = new GeheugenOpslag();
  opslag.bronnenRijen.push(radarRij(), rij({ id: "dubbel", feed: "https://radar.example/rss", domein: "radar.example" }), rij({ id: "ok", feed: "https://ok.test/rss", domein: "ok.test" }));
  const l = await laadBronnenLijst(opslag);
  assert.deepEqual(actieveNieuwsBronnen(l.rijen).map((b) => b.id), ["ok"]);
  const { f, aangevraagd } = nepFetch({ "https://radar.example/rss": rss([{ titel: "Een titel van de radarbron", url: "https://radar.example/a", datum: new Date() }]) });
  const r = await oogstBronnen([bron({ id: "dubbel", feed: "https://radar.example/rss", domein: "radar.example" })], { nu, fetchFn: f });
  assert.equal(aangevraagd.length, 0, "geen aanvraag naar een verboden domein");
  assert.equal(r.items.length, 0);
  await opslag.upsertItems([{ url: "https://radar.example/a", bronId: "x", bronNaam: "x", regime: "pers", groep: "fr_pers", taal: "fr", land: "FR", titel: "x", samenvatting: "", gepubliceerdOp: iso(nu) }]);
  assert.equal(opslag.items.size, 0, "nooit in nv_bron_items");
});

test("radar over meerdere bronnen: sitemap en feed, eigen uitsluitlijst per bron, een stuk gaande bron breekt niets, leesgegevens per bron", async () => {
  const opslag = new GeheugenOpslag();
  const eigen = [{ reden: "eigen regel", patroon: "\\bvoetbal\\b", vlaggen: "i" }];
  opslag.bronnenRijen.push(
    radarRij({ id: "r1", feed: "https://r1.test/sitemap.xml", domein: "r1.test", naam: "Radar Een" }),
    radarRij({ id: "r2", feed: "https://r2.test/feed.xml", domein: "r2.test", naam: "Radar Twee", uitsluit: eigen }),
    radarRij({ id: "r3", feed: "https://r3.test/stuk.xml", domein: "r3.test", naam: "Radar Drie" }),
  );
  const { f, aangevraagd } = nepFetch({
    "https://r1.test/sitemap.xml": sitemap([
      { url: "https://r1.test/belasting", datum: nu - DAG, titel: "Second-home owners face higher tax bill" },
      { url: "https://r1.test/brexit", datum: nu - DAG, titel: "Brexit rules for British residents change" },
    ]),
    "https://r2.test/feed.xml": rss([
      { titel: "New rules for doctor fees in France", url: "https://r2.test/huisarts", datum: new Date(nu - DAG) },
      { titel: "Voetbal club bankrupt in France", url: "https://r2.test/voetbal", datum: new Date(nu - DAG) },
      { titel: "Brexit rules apply again", url: "https://r2.test/brexit", datum: new Date(nu - DAG) },
    ]),
    "https://r3.test/stuk.xml": 503,
  });
  const antwoorden: string[] = [];
  const client = klein([(a) => { antwoorden.push(a.user); return JSON.stringify([1, 2, 3].map((n) => ({ n, werktitel: `Werktitel nummer ${n} voor test`, categorie: "Overig", relevantie: "Raakt lezers.", zoektermen: ["a b c", "d e f"] }))); }, '{"matches":[]}']);
  const r = await draaiRadar({ opslag, client, fetchFn: f, nu });
  assert.equal(r.ok, true, r.fout);
  assert.deepEqual(aangevraagd, ["https://r1.test/sitemap.xml", "https://r2.test/feed.xml", "https://r3.test/stuk.xml"]);
  const titels = antwoorden[0];
  assert.ok(titels.includes("Second-home owners") && titels.includes("doctor fees"));
  assert.ok(!titels.includes("Voetbal"), "eigen uitsluitlijst van bron 2");
  assert.ok(titels.includes("Brexit rules apply again"), "bron 2 heeft een eigen lijst: Brexit is daar niet uitgesloten");
  assert.ok(!titels.includes("Brexit rules for British"), "standaardlijst van bron 1");
  assert.equal((r.detail as { radarBronnen: number }).radarBronnen, 3);
  const per = (id: string) => opslag.bronnenRijen.find((x) => x.id === id)!;
  assert.equal(per("r1").laatstItems, iso(nu));
  assert.equal(per("r2").laatstItems, iso(nu));
  assert.match(String(per("r3").laatsteFout), /HTTP 503/);
  assert.equal(per("r3").laatstItems, null);
  assert.equal(opslag.radarRijen.length, 3);
});

test("radar: alle bronnen stuk geeft een nette melding; geen radarbronnen geeft overgeslagen; zonder tabel de terugval The Connexion", async () => {
  const opslag = new GeheugenOpslag();
  opslag.bronnenRijen.push(radarRij({ feed: "https://r.test/s.xml" }));
  const { f } = nepFetch({ "https://r.test/s.xml": 500 });
  const m = klein(["[]"]);
  const r = await draaiRadar({ opslag, client: m, fetchFn: f, nu });
  assert.equal(r.ok, true);
  assert.equal((r.detail as { sitemapFout: string }).sitemapFout, "HTTP 500");
  const geen = new GeheugenOpslag();
  geen.bronnenRijen.push(rij());
  assert.match(String((await draaiRadar({ opslag: geen, client: m, fetchFn: f, nu })).detail.overgeslagen), /geen radarbronnen/);
  const zonder = new GeheugenOpslag();
  zonder.bronnenTabelOntbreekt = true;
  const n = nepFetch({});
  await draaiRadar({ opslag: zonder, client: m, fetchFn: n.f, nu });
  assert.deepEqual(n.aangevraagd, [connexionRadarbron().feed]);
});

test("radar: de naam of het domein van een radarbron komt nooit in een werktitel of relevantie", () => {
  const batch = [{ url: "https://r.test/a", datum: iso(nu), titel: "Tax on second homes rises" }];
  const goed = JSON.stringify([{ n: 1, werktitel: "Hogere belasting op tweede woningen", categorie: "Belastingen", relevantie: "Raakt huiseigenaren.", zoektermen: ["taxe habitation", "résidence secondaire"] }]);
  const fout = JSON.stringify([{ n: 1, werktitel: "Volgens Radar Twee stijgt de belasting", categorie: "Belastingen", relevantie: "Raakt huiseigenaren.", zoektermen: ["taxe habitation", "résidence secondaire"] }]);
  assert.equal(leesSelectie(goed, batch, ["Radar Twee", "r2"]).length, 1);
  assert.equal(leesSelectie(fout, batch, ["Radar Twee"]).length, 0);
  assert.equal(uitsluitLijstVan(null), RADAR_UITSLUIT);
  assert.equal(uitsluitLijstVan([{ reden: "kapot", patroon: "(" }]), RADAR_UITSLUIT, "alleen ongeldige regels: standaardlijst");
  assert.equal(uitsluitLijstVan([{ reden: "x", patroon: "abc", vlaggen: "i" }]).length, 1);
});

// ---- Feed-ontdekking (fixtures, geen netwerk) ---------------------------------------------------------------
const HTML_MET_LINK = `<html><head><title>Krant</title><link rel="stylesheet" href="/x.css"><link rel="alternate" type="application/rss+xml" title="Alles" href="/feeds/alles.xml"><link rel="alternate" type="application/atom+xml" href="https://krant.test/atom"></head><body>Hallo</body></html>`;
const RSS_KRANT = rss([{ titel: "Een eerste bericht over Frankrijk", url: "https://krant.test/1", datum: new Date(nu) }]).replace("<title>x</title>", "<title>De Krant &amp; Co</title>");

test("adres normaliseren: https erbij, alleen http(s), geen interne of numerieke adressen", () => {
  assert.equal(normaliseerAdres("krant.test/nieuws")?.toString(), "https://krant.test/nieuws");
  assert.equal(normaliseerAdres("  http://krant.test ")?.protocol, "http:");
  for (const slecht of ["", "ftp://krant.test", "javascript:alert(1)", "localhost", "http://127.0.0.1/x", "https://192.168.1.1", "http://[::1]/", "intern.local", "een woord", "https://user:pw@krant.test", "file:///etc/passwd"])
    assert.equal(normaliseerAdres(slecht), null, slecht);
});

test("links in een pagina en de titel van een feed", () => {
  assert.deepEqual(vindFeedLinks(HTML_MET_LINK, new URL("https://krant.test/nieuws/")), ["https://krant.test/feeds/alles.xml", "https://krant.test/atom"]);
  assert.deepEqual(vindFeedLinks("<link rel='alternate' type='application/rss+xml' href='//evil.local/x'>", new URL("https://krant.test/")), []);
  assert.equal(feedTitel(RSS_KRANT), "De Krant & Co");
  assert.equal(feedTitel("<feed><title>Atomtitel</title><entry><title>Item</title></entry></feed>"), "Atomtitel");
});

test("ontdekken: het adres is zelf een feed", async () => {
  const { f, aangevraagd } = nepFetch({ "https://krant.test/rss": RSS_KRANT });
  const o = await ontdekFeed("krant.test/rss", "nieuws", f);
  assert.deepEqual(o, { ok: true, feed: "https://krant.test/rss", titel: "De Krant & Co", aantalItems: 1, domein: "krant.test" });
  assert.equal(aangevraagd.length, 1);
});

test("ontdekken: link rel=alternate in de pagina gaat voor de gangbare paden", async () => {
  const { f, aangevraagd } = nepFetch({ "https://krant.test/": HTML_MET_LINK, "https://krant.test/feeds/alles.xml": RSS_KRANT, "https://krant.test/feed": RSS_KRANT });
  const o = await ontdekFeed("https://krant.test/", "nieuws", f);
  assert.equal(o.ok && o.feed, "https://krant.test/feeds/alles.xml");
  assert.deepEqual(aangevraagd, ["https://krant.test/", "https://krant.test/feeds/alles.xml"]);
});

test("ontdekken: zonder link de gangbare paden in vaste volgorde; een pad zonder items telt niet", async () => {
  assert.deepEqual(FEED_PADEN, ["/feed", "/rss", "/rss.xml", "/atom.xml", "/sitemap-news.xml"]);
  const { f, aangevraagd } = nepFetch({ "https://krant.test/": "<html>geen links</html>", "https://krant.test/feed": rss([]), "https://krant.test/rss.xml": RSS_KRANT });
  const o = await ontdekFeed("krant.test", "nieuws", f);
  assert.equal(o.ok && o.feed, "https://krant.test/rss.xml");
  assert.deepEqual(aangevraagd, ["https://krant.test/", "https://krant.test/feed", "https://krant.test/rss", "https://krant.test/rss.xml"]);
});

test("ontdekken: een nieuwssitemap is bruikbaar voor de radar maar niet voor een nieuwsbron", async () => {
  const kaart = { "https://krant.test/": "<html></html>", "https://krant.test/sitemap-news.xml": sitemap([{ url: "https://krant.test/a", datum: nu, titel: "Een titel uit de sitemap" }]) };
  const radar = await ontdekFeed("https://krant.test/", "radar", nepFetch(kaart).f);
  assert.equal(radar.ok && radar.feed, "https://krant.test/sitemap-news.xml");
  const nieuws = await ontdekFeed("https://krant.test/", "nieuws", nepFetch(kaart).f);
  assert.deepEqual(nieuws, { ok: false, reden: "geen-feed" });
});

test("ontdekken: niets gevonden en ongeldige adressen geven nette uitkomsten", async () => {
  assert.deepEqual(await ontdekFeed("krant.test", "nieuws", nepFetch({}).f), { ok: false, reden: "geen-feed" });
  const n = nepFetch({});
  assert.deepEqual(await ontdekFeed("http://127.0.0.1/", "nieuws", n.f), { ok: false, reden: "ongeldig" });
  assert.equal(n.aangevraagd.length, 0, "geen aanvraag naar een intern adres");
  const stuk = (async () => { throw new Error("netwerk"); }) as unknown as typeof fetch;
  assert.deepEqual(await ontdekFeed("krant.test", "nieuws", stuk), { ok: false, reden: "geen-feed" });
});

// ---- Toevoegen, aanpassen, weghalen ---------------------------------------------------------------------------
const metTabel = () => {
  const o = new GeheugenOpslag();
  o.bronnenRijen.push(rij({ id: "le-monde", feed: "https://www.lemonde.fr/rss/une.xml", domein: "lemonde.fr" }), radarRij());
  return o;
};

test("toevoegen: gevonden feed met items wordt meteen actief en groen; naam is de feedtitel; soort uit het domein", async () => {
  const opslag = metTabel();
  const { f } = nepFetch({ "https://krant.test/rss": RSS_KRANT });
  const u = await voegBronToe(opslag, "https://krant.test/rss", "nieuws", "Anna", f, nu);
  assert.ok(u.ok && u.bron);
  const b = opslag.bronnenRijen.find((x) => x.id === "krant-test")!;
  assert.equal(b.naam, "De Krant & Co");
  assert.equal(b.status, "ACTIVE");
  assert.equal(b.actief, true);
  assert.equal(b.soort, "nieuws");
  assert.equal(b.toegevoegdDoor, "Anna");
  assert.equal(bronKleur(b, nu), "groen");
  assert.equal(b.regime, "pers");
  const l = await laadBronnenLijst(opslag);
  assert.ok(actieveNieuwsBronnen(l.rijen).some((x) => x.id === "krant-test"), "meteen actief voor de motor");
  // Zelfde feed nog eens: al aanwezig.
  assert.deepEqual(await voegBronToe(opslag, "https://krant.test/rss", "nieuws", "Anna", f, nu), { ok: false, melding: "Deze bron staat er al." });
});

test("toevoegen: geen feed gevonden slaat niets op en meldt dat", async () => {
  const opslag = metTabel();
  const voor = opslag.bronnenRijen.length;
  assert.deepEqual(await voegBronToe(opslag, "krant.test", "nieuws", "Anna", nepFetch({}).f, nu), { ok: false, melding: MELDING_GEEN_FEED });
  assert.equal(MELDING_GEEN_FEED, "Geen feed gevonden op dit adres. Probeer het adres van de nieuwspagina zelf, of vraag Anton.");
  assert.equal((await voegBronToe(opslag, "http://127.0.0.1", "nieuws", "Anna", nepFetch({}).f, nu)).ok, false);
  assert.equal(opslag.bronnenRijen.length, voor);
});

test("toevoegen: overheid en pers volgens het domein (.gouv.fr, overheid.nl, rijksoverheid.nl)", async () => {
  for (const d of ["economie.gouv.fr", "www.service-public.gouv.fr", "rijksoverheid.nl", "www.overheid.nl", "nederlandwereldwijd.nl"]) assert.equal(regimeVoorDomein(d), d === "nederlandwereldwijd.nl" ? "pers" : "overheid", d);
  const opslag = metTabel();
  const feed = rss([{ titel: "Communiqué du ministère", url: "https://www.economie.gouv.fr/a", datum: new Date(nu) }]);
  assert.ok((await voegBronToe(opslag, "https://www.economie.gouv.fr/rss", "nieuws", "A", nepFetch({ "https://www.economie.gouv.fr/rss": feed }).f, nu)).ok);
  const b = opslag.bronnenRijen.find((x) => x.domein === "economie.gouv.fr")!;
  assert.equal(b.regime, "overheid");
  assert.equal(b.groep, "overheid");
  assert.equal(bronSoortLabel(b), "overheid");
  assert.deepEqual(raadBron("vrt.be"), { taal: "nl", land: "BE", groep: "nl_vl_pers", regime: "pers", frankrijkFilter: true });
});

test("HARDE REGEL toevoegen: een radardomein of connexionfrance.com kan nooit nieuwsbron worden, zonder één aanvraag", async () => {
  const opslag = metTabel();
  const n = nepFetch({ "https://radar.example/rss": RSS_KRANT, "https://www.connexionfrance.com/feed": RSS_KRANT });
  for (const adres of ["https://radar.example/rss", "radar.example", "https://nieuws.radar.example/", "https://www.connexionfrance.com/feed", "connexionfrance.com"]) {
    const u = await voegBronToe(opslag, adres, "nieuws", "A", n.f, nu);
    assert.deepEqual(u, { ok: false, melding: MELDING_RADAR_NIET_NIEUWS }, adres);
  }
  assert.equal(n.aangevraagd.length, 0);
  assert.equal(opslag.bronnenRijen.filter((x) => x.soort === "nieuws").length, 1);
  // Ook als de database onbereikbaar is: connexionfrance.com blijft geweigerd (eerst de regel, dan de melding over de tabel).
  const weg = new GeheugenOpslag();
  weg.bronnenTabelOntbreekt = true;
  assert.deepEqual(await voegBronToe(weg, "connexionfrance.com", "nieuws", "A", n.f, nu), { ok: false, melding: MELDING_RADAR_NIET_NIEUWS });
  assert.deepEqual(await voegBronToe(weg, "krant.test", "nieuws", "A", n.f, nu), { ok: false, melding: MELDING_GEEN_TABEL });
});

test("HARDE REGEL toevoegen: een domein dat al nieuwsbron is, kan geen radarbron worden", async () => {
  const opslag = metTabel();
  const n = nepFetch({ "https://www.lemonde.fr/sitemap-news.xml": sitemap([{ url: "https://www.lemonde.fr/a", datum: nu, titel: "Een titel van Le Monde" }]) });
  assert.deepEqual(await voegBronToe(opslag, "https://www.lemonde.fr/", "radar", "A", n.f, nu), { ok: false, melding: MELDING_NIEUWS_NIET_RADAR });
  assert.equal(n.aangevraagd.length, 0);
});

test("radarbron toevoegen: sitemap gevonden, soort radar, daarna is het domein verboden als nieuwsbron", async () => {
  const opslag = metTabel();
  const n = nepFetch({ "https://nieuw.test/": "<html></html>", "https://nieuw.test/sitemap-news.xml": sitemap([{ url: "https://nieuw.test/a", datum: nu, titel: "Een titel voor de radar" }]) });
  const u = await voegBronToe(opslag, "nieuw.test", "radar", "Anna", n.f, nu);
  assert.ok(u.ok);
  const b = opslag.bronnenRijen.find((x) => x.id === "radar-nieuw-test")!;
  assert.equal(b.soort, "radar");
  assert.ok(isVerbodenBron("https://nieuw.test/artikel"));
  assert.deepEqual(await voegBronToe(opslag, "https://nieuw.test/rss", "nieuws", "A", nepFetch({}).f, nu), { ok: false, melding: MELDING_RADAR_NIET_NIEUWS });
});

test("toevoegen zonder tabel (terugval): nette melding, niets bewaard", async () => {
  const opslag = new GeheugenOpslag();
  opslag.bronnenTabelOntbreekt = true;
  assert.deepEqual(await voegBronToe(opslag, "krant.test/rss", "nieuws", "A", nepFetch({ "https://krant.test/rss": RSS_KRANT }).f, nu), { ok: false, melding: MELDING_GEEN_TABEL });
  assert.deepEqual(await verwijderBron(opslag, "x"), { ok: false, melding: MELDING_GEEN_TABEL });
  assert.deepEqual(await wijzigBron(opslag, "x", { naam: "Nieuw" }), { ok: false, melding: MELDING_GEEN_TABEL });
  await assert.rejects(() => opslag.bronnenLijst(), TabelOntbreekt);
});

test("aanpassen en weghalen: naam, soort (overheid, pers, NL-BE) en prullenbak", async () => {
  const opslag = metTabel();
  assert.deepEqual(await wijzigBron(opslag, "le-monde", { naam: "  Le Monde   voorpagina " }), { ok: true, melding: "Bewaard." });
  assert.equal(opslag.bronnenRijen[0].naam, "Le Monde voorpagina");
  assert.equal((await wijzigBron(opslag, "le-monde", { naam: "x" })).ok, false);
  assert.equal((await wijzigBron(opslag, "le-monde", { soort: "geheim" })).ok, false);
  assert.ok((await wijzigBron(opslag, "le-monde", { soort: "NL-BE" })).ok);
  assert.equal(bronSoortLabel(opslag.bronnenRijen[0]), "NL-BE");
  assert.equal(opslag.bronnenRijen[0].frankrijkFilter, true);
  assert.ok((await wijzigBron(opslag, "le-monde", { soort: "overheid" })).ok);
  assert.equal(opslag.bronnenRijen[0].regime, "overheid");
  assert.equal((await wijzigBron(opslag, "bestaat-niet", { naam: "Nieuwe naam" })).ok, false);
  // De laatste actieve nieuwsbron blijft: weghalen en uitzetten worden geweigerd, ook als de motor dan terugvalt op het bestand.
  assert.deepEqual(await verwijderBron(opslag, "le-monde"), { ok: false, melding: "Er moet minstens één nieuwsbron aan blijven." });
  assert.deepEqual(await wijzigBron(opslag, "le-monde", { actief: false }), { ok: false, melding: "Er moet minstens één nieuwsbron aan blijven." });
  assert.equal(opslag.bronnenRijen.find((r) => r.id === "le-monde")?.actief, true);
  opslag.bronnenRijen.push(rij({ id: "tweede", feed: "https://tweede.test/rss", domein: "tweede.test" }));
  assert.ok((await wijzigBron(opslag, "le-monde", { actief: false })).ok, "met een tweede actieve bron mag het wel");
  assert.deepEqual(await verwijderBron(opslag, "tweede"), { ok: false, melding: "Er moet minstens één nieuwsbron aan blijven." }, "nu is tweede de laatste");
  await wijzigBron(opslag, "le-monde", { actief: true });
  assert.ok((await verwijderBron(opslag, "tweede")).ok);
  assert.equal(opslag.bronnenRijen.length, 2);
  opslag.bronnenRijen.push(rij({ id: "concept", feed: "https://concept.test/rss", domein: "concept.test", status: "CONCEPT" }));
  assert.deepEqual(await verwijderBron(opslag, "le-monde"), { ok: false, melding: "Er moet minstens één nieuwsbron aan blijven." }, "een conceptbron telt niet als actieve nieuwsbron");
  assert.ok((await verwijderBron(opslag, "concept")).ok, "een bron die toch niet wordt geoogst mag weg");
  assert.equal((await verwijderBron(opslag, "bestaat-niet")).ok, false);
  assert.deepEqual(soortVelden("pers", { taal: "fr", land: "FR" }).groep, "fr_pers");
});

test("bron-id: uit het domein, uniek, met voorvoegsel voor radar", () => {
  assert.equal(maakBronId("www.lemonde.fr", []), "lemonde-fr");
  assert.equal(maakBronId("lemonde.fr", ["lemonde-fr"]), "lemonde-fr-2");
  assert.equal(maakBronId("x.test", [], "radar-"), "radar-x-test");
});

test("kleur: groen met items binnen 3 dagen, rood bij fout of 3 dagen niets, grijs bij concept, uit of nog nooit gelezen", () => {
  const b = (o: Partial<BronRij>) => rij({ laatstGelezen: iso(nu - 3600_000), laatstItems: iso(nu - 3600_000), ...o });
  assert.equal(bronKleur(b({}), nu), "groen");
  assert.equal(bronKleur(b({ laatsteFout: "HTTP 500" }), nu), "rood");
  assert.equal(bronKleur(b({ laatstItems: iso(nu - 3 * DAG - 1000) }), nu), "rood");
  assert.equal(bronKleur(b({ laatstItems: null }), nu), "rood");
  assert.equal(bronKleur(b({ laatstItems: iso(nu - 2 * DAG) }), nu), "groen");
  assert.equal(bronKleur(b({ status: "CONCEPT" }), nu), "grijs");
  assert.equal(bronKleur(b({ actief: false }), nu), "grijs");
  assert.equal(bronKleur(b({ laatstGelezen: null, laatstItems: null }), nu), "grijs");
  assert.equal(bronKleur(radarRij({ laatstGelezen: iso(nu), laatstItems: iso(nu) }), nu), "groen");
  assert.ok(terugvalBronnen().length > 30);
});
