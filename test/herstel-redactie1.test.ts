// Herstelronde 1 van de redactie-app (28-11-2026): terugval van de motor bij 0 actieve nieuwsbronnen, de migratie voor de domeinscheiding op de feed,
// "Maak bericht" bij een tip (echte synthese en poort met een nep-model, nooit iets uit de tipgever), statusteksten en de plain-language meldingen.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GeheugenOpslag } from "../lib/motor/opslag";
import { actieveBronnen, laadConfig, zetRadarDomeinen } from "../lib/motor/config";
import { GEEN_ACTIEVE_BRONNEN_MELDING, bronKleur, kiesOogstBronnen, statusTekst, BRON_SOORT_TEKST } from "../lib/motor/bronnenlijst";
import { draaiOogst } from "../lib/motor/motor";
import { maakBerichtUitTip, isOverheidsLink, MELDING_AL_AFGEHANDELD, MELDING_GEEN_BRON, MELDING_GEEN_OVERHEIDSLINK, MELDING_LINK_ONLEESBAAR, MELDING_GEEN_BERICHT } from "../lib/redactie-maak-bericht";
import { voerActieUit, metMelding } from "../lib/redactie-acties";
import { TIJDELIJK_MELDING } from "../lib/redactie-melding";
import { item, klein, bron as testBron } from "./helpers";
import type { BronItem, BronRij, RadarRij } from "../lib/motor/types";

afterEach(() => zetRadarDomeinen([]));

const nu = Date.now();
const ID1 = "11111111-1111-1111-1111-111111111111";
const ID2 = "22222222-2222-2222-2222-222222222222";
const rij = (o: Partial<BronRij> = {}): BronRij => ({ ...testBron(), soort: "nieuws", actief: true, toegevoegdOp: null, toegevoegdDoor: null, laatstGelezen: null, laatstItems: null, laatsteFout: null, ...o });

// ---- 1. Motor: terugval bij 0 actieve nieuwsbronnen ---------------------------------------------------------
test("motor: geen actieve nieuwsbronnen in de tabel geeft de terugval op data/bronnen.json en een fout in de stapdetails", async () => {
  const opslag = new GeheugenOpslag();
  opslag.bronnenRijen.push(rij({ id: "uit", feed: "https://uit.test/feed", domein: "uit.test", actief: false }), rij({ id: "concept", feed: "https://c.test/feed", domein: "c.test", status: "CONCEPT" }));
  const aangevraagd: string[] = [];
  const f = (async (u: string) => (aangevraagd.push(String(u)), new Response("x", { status: 500 }))) as unknown as typeof fetch;
  const r = await draaiOogst({ opslag, client: null, config: laadConfig(), fetchFn: f, peil: [], generator: null });
  const stap = r.stappen.find((s) => s.stap === "bronnen");
  assert.equal(stap?.ok, false);
  assert.equal(stap?.fout, "geen actieve nieuwsbronnen in de database, terugval gebruikt");
  assert.equal(stap?.fout, GEEN_ACTIEVE_BRONNEN_MELDING);
  assert.ok(r.fouten.some((x) => x.includes("terugval gebruikt")));
  assert.equal(r.aantallen.bronnen, actieveBronnen().length);
  assert.deepEqual(new Set(aangevraagd), new Set(actieveBronnen().map((b) => b.feed)), "alleen de bronnen uit het bestand");
  assert.equal(opslag.bronnenRijen.every((b) => b.laatstGelezen === null), true, "de leesresultaten van het bestand worden niet in de tabel geschreven");
});

test("kiesOogstBronnen: tabel met actieve bronnen geen terugval; zonder tabel de gewone terugval zonder fout", () => {
  const goed = { rijen: [rij({ id: "a", feed: "https://a.test/f", domein: "a.test" })], uitTabel: true };
  assert.deepEqual(kiesOogstBronnen(goed).bronnen.map((b) => b.id), ["a"]);
  assert.equal(kiesOogstBronnen(goed).terugval, false);
  assert.equal(kiesOogstBronnen({ rijen: [], uitTabel: true }).terugval, true);
  assert.equal(kiesOogstBronnen({ rijen: [], uitTabel: false }).terugval, false);
});

// ---- 2. Migratie: domeinscheiding op de feed -------------------------------------------------------------------
test("migratie domeinscheiding: create or replace, toetst feed-host en domein, leeg domein is geen vrijbrief", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261128160000_nv_bronnen_domeinscheiding_feed.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.nv_bronnen_domeinscheiding\(\)/);
  assert.match(sql, /nv_host_van\(new\.feed\)/);
  assert.match(sql, /nv_host_van\(b\.feed\)/);
  assert.match(sql, /\^www\\\./, "host zonder www");
  assert.match(sql, /raise exception 'Een bron heeft een domein of een feed-adres nodig/);
  assert.ok(!/drop trigger/i.test(sql), "de trigger zelf blijft");
  assert.ok(!/if eigen = ''/.test(sql), "geen vrijbrief meer bij een leeg domein");
});

// ---- 7. Teksten ---------------------------------------------------------------------------------------------------
test("statusteksten in gewone taal en soortlabels", () => {
  const basis = { actief: true, status: "ACTIVE" as const, soort: "nieuws" as const, laatsteFout: null };
  assert.equal(statusTekst(basis, "groen"), "Leest goed");
  assert.equal(statusTekst(basis, "rood"), "Al 3 dagen niets binnengekomen");
  assert.equal(statusTekst({ ...basis, laatsteFout: "HTTP 503" }, "rood"), "Lukt even niet om te lezen", "nooit een technische fout voor de redacteur");
  assert.ok(!/503|HTTP/.test(statusTekst({ ...basis, laatsteFout: "HTTP 503" }, "rood")));
  assert.equal(statusTekst(basis, "grijs"), "Nieuw, wordt getest");
  assert.equal(statusTekst({ ...basis, actief: false }, "grijs"), "Staat uit");
  assert.deepEqual(BRON_SOORT_TEKST, { overheid: "overheid", pers: "krant of omroep", "NL-BE": "Nederland of België" });
  assert.equal(bronKleur({ ...basis, laatstGelezen: null, laatstItems: null }, nu), "grijs");
});

// ---- 4. Maak bericht --------------------------------------------------------------------------------------------
const TEKST = "De regels voor de energielabels van woningen in Frankrijk veranderen volgens de overheid met ingang van het nieuwe jaar. Eigenaars van een woning met een slecht label krijgen te maken met nieuwe verplichtingen bij verhuur en verkoop. De overheid wil zo het energieverbruik in woningen verlagen en de uitstoot beperken. Wie een woning verhuurt of wil verkopen, doet er goed aan nu te kijken welk label het huis heeft. Een energiedeskundige kan het label vaststellen en uitleggen welke verbeteringen het meeste opleveren.\n\nVoor huiseigenaren in Frankrijk betekent dit dat een renovatie eerder aan de orde kan komen dan gedacht. Er zijn subsidies en leningen die een deel van de kosten dekken, en de gemeente kan uitleggen welke regelingen er in de eigen streek gelden. Wie nu begint, houdt meer tijd om de werkzaamheden goed te plannen.";
const synthese = (o: Record<string, unknown> = {}) =>
  JSON.stringify({ publiceren: true, kop: "Nieuwe regels voor energielabels van woningen", samenvatting: "Eigenaars van woningen met een slecht energielabel krijgen nieuwe verplichtingen bij verhuur en verkoop.", tekst: TEKST, categorie: "economie en ondernemen", relevantie: 80, ...o });
const overheidsItem = (o: Partial<BronItem> = {}): BronItem => item({
  url: "https://www.service-public.fr/particuliers/actualites/A99999", bronId: "service-public", bronNaam: "Service-Public.fr", regime: "overheid", groep: "overheid",
  titel: "Diagnostic de performance énergétique: nouvelles règles pour les logements", samenvatting: "Les règles du DPE changent pour les logements.", gepubliceerdOp: new Date(nu - 3600_000).toISOString(), ...o,
});
const tip = (o: Partial<RadarRij> = {}): RadarRij => ({
  id: ID1, signaalUrl: "https://www.connexionfrance.com/news/dpe-changes", signaalDatum: new Date(nu - 7200_000).toISOString(), werktitel: "Nieuwe energielabels voor woningen", categorie: "Vastgoed", relevantie: "Raakt huiseigenaren.",
  status: "klaar voor redactie", primaireBron: [{ naam: "Service-Public.fr", url: "https://www.service-public.fr/particuliers/actualites/A99999", datum: new Date(nu - 3600_000).toISOString() }], berichtId: null,
  beoordeeldOp: new Date(nu - 3600_000).toISOString(), besluit: null, besluitOp: null, ...o,
});
const opzet = async (o: { tip?: Partial<RadarRij>; items?: BronItem[] } = {}) => {
  const opslag = new GeheugenOpslag();
  opslag.radarRijen.push(tip(o.tip));
  await opslag.upsertItems(o.items ?? [overheidsItem()]);
  return opslag;
};
const gebruikers = (c: ReturnType<typeof klein>) => c.aanroepen.filter((a) => !a.system.includes("groepeert"));
const NIETS = (async () => new Response("x", { status: 404 })) as unknown as typeof fetch;

test("Maak bericht: uit de overheidsbron van de tip, zelfde synthese en poort, tip wordt al gepubliceerd met bericht_id", async () => {
  const opslag = await opzet();
  const client = klein([synthese()]);
  const u = await maakBerichtUitTip({ opslag, client, fetchFn: NIETS, nu, peil: [], generator: null }, ID1);
  assert.ok(u.ok, u.ok ? "" : u.melding);
  if (!u.ok) return;
  assert.equal(u.status, "gepubliceerd");
  assert.equal(u.melding, "Bericht gemaakt");
  const b = await opslag.redactieBericht(u.berichtId);
  assert.equal(b?.status, "gepubliceerd");
  assert.equal(b?.regime, "overheid");
  assert.deepEqual(b?.bronnen.map((x) => x.url), ["https://www.service-public.fr/particuliers/actualites/A99999"]);
  assert.match(String(b?.beeldUrl), /illustraties/, "een eigen illustratie als beeld");
  const t = opslag.radarRijen[0];
  assert.equal(t.status, "al gepubliceerd");
  assert.equal(t.berichtId, u.berichtId);
  assert.ok(t.besluit, "de tip is niet meer open");
  assert.equal((await opslag.radarOpen(10)).length, 0);
  // Het bronitem is verwerkt: de gewone oogst maakt er geen tweede bericht van.
  assert.equal((await opslag.openItems(new Date(nu - 86400_000).toISOString())).length, 0);
});

test("Maak bericht: de werktitel en de signaal-url van de tip gaan nooit naar het model; niets uit de tipgever, geen tipgever in het bronnenblok", async () => {
  const opslag = await opzet();
  const client = klein([synthese()]);
  const aangevraagd: string[] = [];
  const f = (async (u: string) => (aangevraagd.push(String(u)), new Response("x", { status: 404 }))) as unknown as typeof fetch;
  const u = await maakBerichtUitTip({ opslag, client, fetchFn: f, nu, peil: [], generator: null }, ID1);
  assert.ok(u.ok);
  const syn = gebruikers(client)[0];
  const invoer = `${syn.system}\n${syn.user}`;
  assert.ok(!/Nieuwe energielabels/i.test(invoer) && !/energielabels voor woningen/i.test(invoer), "geen deel van de werktitel in de synthese-invoer");
  assert.ok(!/connexionfrance|news\/dpe-changes|dpe-changes/i.test(invoer), "de signaal-url staat niet in de synthese-invoer");
  assert.ok(!invoer.includes("Onderwerp van het bericht"), "geen onderwerpaanwijzing meer");
  assert.ok(!syn.user.includes("connexion") && !syn.user.includes("dpe-changes"), "niets uit de tipgever zelf");
  assert.ok(!aangevraagd.some((x) => /connexion/i.test(x)), "de tipgever wordt nooit opgehaald");
  assert.ok(syn.user.includes("Diagnostic de performance"), "de overheidsbron is wel het bronmateriaal");
  const b = opslag.berichtenLijst[0];
  assert.ok(!JSON.stringify(b.bronnen).match(/connexion|werktitel|energielabels voor woningen/i), "nooit in het bronnenblok");
});

test("Maak bericht: andere geschikte nieuwsitems gaan mee (nooit een verboden bron), de poort telt ze mee", async () => {
  const pers = item({ url: "https://persbron.test/dpe", bronId: "pers", bronNaam: "Persbron", titel: "Diagnostic de performance énergétique: les nouvelles règles pour les logements", samenvatting: "Le DPE change.", gepubliceerdOp: new Date(nu - 1800_000).toISOString() });
  const nietPas = item({ url: "https://persbron.test/staking", bronId: "pers2", bronNaam: "Persbron 2", titel: "Grève des éboueurs à Marseille", samenvatting: "x" });
  const verboden = item({ url: "https://www.connexionfrance.com/diagnostic-performance-energetique-logements", bronId: "x", bronNaam: "Connexion", titel: "Diagnostic de performance énergétique: nouvelles règles pour les logements", samenvatting: "x" });
  const opslag = await opzet({ items: [overheidsItem(), pers, nietPas, verboden] });
  const u = await maakBerichtUitTip({ opslag, client: klein([synthese()]), fetchFn: NIETS, nu, peil: [], generator: null }, ID1);
  assert.ok(u.ok);
  const urls = opslag.berichtenLijst[0].bronnen.map((x) => x.url).sort();
  assert.deepEqual(urls, ["https://persbron.test/dpe", "https://www.service-public.fr/particuliers/actualites/A99999"]);
});

test("Maak bericht: lage relevantie of poortreden geeft een concept met een reden in gewone taal; de tip is dan toch afgehandeld", async () => {
  const opslag = await opzet();
  const laag = await maakBerichtUitTip({ opslag, client: klein([synthese({ relevantie: 20 })]), fetchFn: NIETS, nu, peil: [], generator: null }, ID1);
  assert.ok(laag.ok);
  if (!laag.ok) return;
  assert.equal(laag.status, "concept");
  assert.equal(laag.melding, "Opgeslagen als concept: Te weinig van belang voor onze lezers.");
  assert.equal(opslag.radarRijen[0].berichtId, laag.berichtId);

  const o2 = await opzet();
  const slecht = synthese({ tekst: `${TEKST} Ik kreeg alleen de koppen.` });
  const poort = await maakBerichtUitTip({ opslag: o2, client: klein([slecht, slecht]), fetchFn: NIETS, nu, peil: [], generator: null }, ID1);
  assert.ok(poort.ok);
  if (!poort.ok) return;
  assert.equal(poort.status, "concept");
  assert.match(poort.melding, /^Opgeslagen als concept: De tekst praat over zijn eigen bronnen\.$/);
  assert.equal(o2.berichtenLijst[0].status, "concept");
});

test("Maak bericht: mislukt (model geeft niets, modelfout, geen model) laat de tip open met een duidelijke melding", async () => {
  const geen = await opzet();
  const a = await maakBerichtUitTip({ opslag: geen, client: klein([JSON.stringify({ publiceren: false })]), fetchFn: NIETS, nu, peil: [], generator: null }, ID1);
  assert.deepEqual(a, { ok: false, melding: MELDING_GEEN_BERICHT });
  assert.equal(geen.radarRijen[0].besluit, null);
  assert.equal(geen.berichtenLijst.length, 0);

  const kapot = await opzet();
  const stuk = { async tekst() { throw new Error("overbelast"); } };
  const b = await maakBerichtUitTip({ opslag: kapot, client: stuk, fetchFn: NIETS, nu, peil: [], generator: null }, ID1);
  assert.equal(b.ok, false);
  assert.match(b.ok ? "" : b.melding, /De tip blijft staan/);
  assert.equal(kapot.radarRijen[0].besluit, null);

  const zonder = await opzet();
  assert.deepEqual(await maakBerichtUitTip({ opslag: zonder, client: null, fetchFn: NIETS, nu, peil: [], generator: null }, ID1), { ok: false, melding: TIJDELIJK_MELDING });
});

test("Maak bericht: al afgehandelde of onbekende tip; tip met al een bericht gaat naar dat bericht", async () => {
  const klaar = await opzet({ tip: { besluit: "afgewezen" } });
  assert.deepEqual(await maakBerichtUitTip({ opslag: klaar, client: klein([synthese()]), fetchFn: NIETS, nu, peil: [], generator: null }, ID1), { ok: false, melding: MELDING_AL_AFGEHANDELD });
  assert.equal((await maakBerichtUitTip({ opslag: klaar, client: klein([synthese()]), fetchFn: NIETS, nu, peil: [], generator: null }, ID2)).ok, false);
  const bestaat = await opzet({ tip: { berichtId: ID2, status: "al gepubliceerd", primaireBron: null } });
  const u = await maakBerichtUitTip({ opslag: bestaat, client: klein([synthese()]), fetchFn: NIETS, nu, peil: [], generator: null }, ID1);
  assert.deepEqual(u, { ok: true, berichtId: ID2, status: "gepubliceerd", melding: "Dit onderwerp staat al in het nieuws." });
  assert.equal(bestaat.berichtenLijst.length, 0, "geen tweede bericht");
  assert.equal(bestaat.radarRijen[0].besluit, "geaccepteerd");
});

const PAGINA = (titel: string, tekst: string) => `<html><head><title>${titel}</title><meta name="description" content="Korte uitleg van de pagina."></head><body><article><p>${tekst}</p></article></body></html>`;
const LANG = "Les propriétaires de logements classés F ou G ne pourront plus mettre leur bien en location à partir du 1er janvier 2028 selon les nouvelles règles du diagnostic de performance énergétique.";

test("Maak bericht zonder overheidsbron: een geplakte link wordt gelezen met artikel.ts, als bronitem bewaard en gebruikt (tekst nooit bewaard)", async () => {
  const opslag = await opzet({ tip: { primaireBron: null, status: "handmatige broncheck vereist" }, items: [] });
  const client = klein([synthese()]);
  const f = (async (u: string) => (String(u).includes("service-public.fr/") ? new Response(PAGINA("DPE: nieuwe regels - Service-Public.fr", LANG), { headers: { "content-type": "text/html" } }) : new Response("x", { status: 404 }))) as unknown as typeof fetch;
  const zonderLink = await maakBerichtUitTip({ opslag, client, fetchFn: f, nu, peil: [], generator: null }, ID1);
  assert.deepEqual(zonderLink, { ok: false, melding: MELDING_GEEN_BRON });
  const u = await maakBerichtUitTip({ opslag, client, fetchFn: f, nu, peil: [], generator: null }, ID1, "service-public.fr/particuliers/vosdroits/F123#kop");
  assert.ok(u.ok, u.ok ? "" : u.melding);
  const b = opslag.berichtenLijst[0];
  assert.deepEqual(b.bronnen.map((x) => [x.url, x.origineleKop]), [["https://service-public.fr/particuliers/vosdroits/F123", "DPE: nieuwe regels - Service-Public.fr"]]);
  assert.equal(b.regime, "overheid");
  assert.ok(gebruikers(client)[0].user.includes("propriétaires de logements"), "de paginatekst is bronmateriaal");
  const bewaard = [...opslag.items.values()].find((i) => i.url.includes("F123"));
  assert.ok(bewaard);
  assert.ok(!JSON.stringify(bewaard).includes("propriétaires de logements"), "de paginatekst wordt nooit opgeslagen");
  assert.equal(opslag.radarRijen[0].berichtId, u.berichtId);
});

test("Maak bericht met een geplakte link: alleen overheid (gouv.fr, service-public, overheid.nl, rijksoverheid.nl), nooit een tipgever, onleesbaar geeft een melding", async () => {
  const opslag = await opzet({ tip: { primaireBron: null }, items: [] });
  const client = klein([synthese()]);
  const f = (async () => new Response("x", { status: 404 })) as unknown as typeof fetch;
  const probeer = (l: string) => maakBerichtUitTip({ opslag, client, fetchFn: f, nu, peil: [], generator: null }, ID1, l);
  assert.deepEqual(await probeer("https://www.lemonde.fr/a"), { ok: false, melding: MELDING_GEEN_OVERHEIDSLINK });
  assert.deepEqual(await probeer("https://www.connexionfrance.com/news/x"), { ok: false, melding: "Dit is een tipgever. Van een tipgever nemen we nooit iets over." });
  assert.equal((await probeer("geen link")).ok, false);
  assert.deepEqual(await probeer("https://www.impots.gouv.fr/pagina"), { ok: false, melding: MELDING_LINK_ONLEESBAAR });
  assert.equal(client.aanroepen.length, 0, "er is geen model aangeroepen");
  assert.equal(opslag.radarRijen[0].besluit, null, "de tip blijft open");
  for (const [url, ok] of [["https://www.impots.gouv.fr/x", true], ["https://www.service-public.fr/x", true], ["https://www.overheid.nl/x", true], ["https://www.rijksoverheid.nl/x", true], ["https://www.ameli.fr/x", true], ["https://www.lemonde.fr/x", false], ["https://www.connexionfrance.com/x", false]] as const) {
    assert.equal(isOverheidsLink(new URL(url)), ok, url);
  }
});

test("voerActieUit maak-bericht: gelukt gaat naar het bericht met melding, mislukt blijft op Tips met het adres in het veld", async () => {
  const opslag = await opzet();
  const redacteur = { rol: "redacteur" as const, naam: "Marijke", id: "x" };
  const goed = await voerActieUit(opslag, redacteur, { actie: "maak-bericht", id: ID1, terug: "/redactie/radar" }, NIETS, { client: klein([synthese()]), peil: [], generator: null, nu });
  assert.equal(goed.ok, true);
  assert.equal(goed.melding, "Bericht gemaakt");
  assert.match(goed.terug, /^\/redactie\/bericht\/[\w-]+$/);
  assert.equal(goed.terug, `/redactie/bericht/${opslag.berichtenLijst[0].id}`);

  const o2 = await opzet({ tip: { primaireBron: null } });
  const fout = await voerActieUit(o2, redacteur, { actie: "maak-bericht", id: ID1, link: "https://www.lemonde.fr/a", terug: "/redactie/radar" }, NIETS, { client: klein([synthese()]), peil: [], generator: null, nu });
  assert.equal(fout.ok, false);
  assert.equal(fout.terug, "/redactie/radar");
  assert.deepEqual(fout.terugExtra, { tip: ID1, link: "https://www.lemonde.fr/a" });
  const url = metMelding(fout.terug, fout.melding, fout.ok, fout.terugExtra);
  assert.match(url, /^\/redactie\/radar\?/);
  assert.equal(new URL(url, "https://x.test").searchParams.get("link"), "https://www.lemonde.fr/a");
  assert.equal((await voerActieUit(o2, redacteur, { actie: "maak-bericht", id: "geen-uuid" }, NIETS, { client: null })).melding, "Deze tip bestaat niet meer.");
  o2.radarTabelOntbreekt = true;
  assert.equal((await voerActieUit(o2, redacteur, { actie: "maak-bericht", id: ID1 }, NIETS, { client: null })).melding, TIJDELIJK_MELDING);
});

test("beeldkeuze en terugzetten sturen naar Vandaag; databasemeldingen zijn overal in gewone taal", async () => {
  const opslag = new GeheugenOpslag();
  const redacteur = { rol: "redacteur" as const, naam: "M", id: "x" };
  opslag.bronnenTabelOntbreekt = true;
  const u = await voerActieUit(opslag, redacteur, { actie: "bron-wijzig", id: "a", naam: "Nieuw" });
  assert.equal(u.melding, TIJDELIJK_MELDING);
  assert.ok(!/tabel|database|nv_/.test(u.melding));
});
