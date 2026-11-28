// Redactie-app, herstelronde 2 (28-11-2026): het mini-beeld op Vandaag, Vandaag = alleen wat live staat, "Toch plaatsen", en de kleine punten
// uit de vorige keuring (link bij onleesbare overheidsbron, eindadres na redirects, link vóór model). Geen netwerk.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GeheugenOpslag, SupabaseOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import { UITLEG_NIET_GEPLAATST, magTochPlaatsen, miniBeeldUrl, verdeelVandaag } from "../lib/redactie-vandaag";
import { MELDING_GEEN_OVERHEIDSLINK, MELDING_LINK_ONLEESBAAR, maakBerichtUitTip, toonLinkVeld } from "../lib/redactie-maak-bericht";
import { voerActieUit } from "../lib/redactie-acties";
import { TIJDELIJK_MELDING } from "../lib/redactie-melding";
import Rij from "../app/redactie/_componenten/Rij";
import { klein } from "./helpers";
import type { RadarRij } from "../lib/motor/types";

const nu = Date.now();
const SVG = "https://nieuws.infofrankrijk.com/illustraties/verkeer-vliegveld-fr.svg";
const id = (n: number) => `${String(n).padStart(8, "0")}-1111-1111-1111-111111111111`;
const bericht = (n: number, o: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht => ({
  id: id(n), soort: "pers", kop: `Kop ${n}`, samenvatting: "Samenvatting.", tekst: "Tekst.", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd",
  blokkadeRedenen: [], portemonnee: false, signaal: null, signaalBeoordeeld: true, beeldUrl: null, beeldCredit: null, peil: { raakt: [], mogelijkGewijzigd: [] },
  bronnen: [{ naam: "Bron", origineleKop: "Titre", datum: "2026-11-26T07:00:00.000Z", url: "https://www.service-public.fr/a" }], gepubliceerdOp: new Date(nu - n * 60_000).toISOString(), regelversie: 2, ...o,
} as OpgeslagenBericht);
const redacteur = { rol: "redacteur" as const, naam: "Marijke", id: "x" };
const html = (b: OpgeslagenBericht) => renderToStaticMarkup(createElement(Rij, { b }));

// ---- 1. mini-beeld ----
test("mini-beeld: een bericht met een absolute SVG-url toont het beeld, nooit 'geen beeld'", () => {
  const h = html(bericht(1, { beeldUrl: SVG }));
  assert.ok(h.includes(`<img src="${SVG}"`), h);
  assert.ok(!h.includes("geen beeld"));
  assert.ok(html(bericht(2)).includes("geen beeld"), "zonder beeld_url blijft 'geen beeld' staan");
});

test("mini-beeld: relatieve of onhandig opgeslagen url's, en de PNG van een illustratie als terugval", () => {
  assert.equal(miniBeeldUrl({ beeldUrl: SVG, beeldCredit: null }), SVG);
  assert.equal(miniBeeldUrl({ beeldUrl: `  ${SVG}\n`, beeldCredit: null }), SVG);
  assert.equal(miniBeeldUrl({ beeldUrl: "/illustraties/verkeer-vliegveld-fr.svg", beeldCredit: null }), SVG);
  assert.equal(miniBeeldUrl({ beeldUrl: "javascript:alert(1)", beeldCredit: { bron: "Illustratie", maker: "Communities Abroad", png: "https://nieuws.infofrankrijk.com/x.png" } as never }), "https://nieuws.infofrankrijk.com/x.png");
  assert.equal(miniBeeldUrl({ beeldUrl: null, beeldCredit: null }), null);
  assert.equal(miniBeeldUrl({ beeldUrl: "", beeldCredit: null }), null);
});

test("de lijst voor de redactie levert beeld_url door, in het geheugen en uit Supabase (select bevat beeld_url, ook in de terugvalvorm)", async () => {
  const g = new GeheugenOpslag();
  g.berichtenLijst.push(bericht(1, { beeldUrl: SVG }));
  assert.equal((await g.berichtenVoorRedactie(new Date(nu - 86400_000).toISOString(), 10))[0].beeldUrl, SVG);
  const urls: string[] = [];
  const f = (async (u: string) => { urls.push(String(u)); return new Response(JSON.stringify([{ id: id(1), kop: "k", status: "gepubliceerd", categorie: "algemeen", beeld_url: SVG, gepubliceerd_op: new Date(nu).toISOString(), nv_bronnen_per_bericht: [] }]), { status: 200 }); }) as unknown as typeof fetch;
  const s = new SupabaseOpslag("https://x.supabase.co", "k", f);
  assert.equal((await s.berichtenVoorRedactie(new Date(nu - 86400_000).toISOString(), 10))[0].beeldUrl, SVG);
  assert.ok(urls.every((u) => decodeURIComponent(u).includes("beeld_url")));
});

// ---- 2. Vandaag = alleen wat live staat ----
test("Vandaag: live bevat alleen gepubliceerde, niet-weggehaalde berichten, nieuwste eerst; concept en geblokkeerd apart; weg apart", () => {
  const lijst = [
    bericht(5, { status: "concept" }), bericht(3, { status: "gepubliceerd" }), bericht(1, { status: "gepubliceerd" }), bericht(4, { status: "geblokkeerd", blokkadeRedenen: ["krantennaam"] }),
    bericht(2, { status: "gepubliceerd", redactie: "weg" }), bericht(6, { status: "concept", redactie: "weg" }),
  ];
  const v = verdeelVandaag(lijst);
  assert.deepEqual(v.live.map((b) => b.kop), ["Kop 1", "Kop 3"], "nieuwste eerst");
  assert.ok(v.live.every((b) => b.status === "gepubliceerd" && b.redactie !== "weg"));
  assert.deepEqual(v.nietGeplaatst.map((b) => b.kop), ["Kop 4", "Kop 5"]);
  assert.deepEqual(v.weg.map((b) => b.kop), ["Kop 2", "Kop 6"]);
  assert.equal(v.live.length + v.nietGeplaatst.length + v.weg.length, lijst.length);
  assert.equal(UITLEG_NIET_GEPLAATST, "Deze vond de machine niet goed of niet belangrijk genoeg. U hoeft hier niets mee.");
});

test("de rij toont geen label 'concept' meer, ook niet los achter '2 bronnen'", () => {
  const h = html(bericht(1, { status: "concept" }));
  assert.ok(!h.includes("concept"));
  assert.ok(!h.includes("label"));
});

test("Toch plaatsen: een concept wordt gepubliceerd; geblokkeerd, concept met poortreden, weg en al-live worden geweigerd", async () => {
  const opslag = new GeheugenOpslag();
  opslag.berichtenLijst.push(bericht(1, { status: "concept" }), bericht(2, { status: "geblokkeerd", blokkadeRedenen: ["tekst noemt krantennaam"] }), bericht(3, { status: "concept", blokkadeRedenen: ["tekst noemt krantennaam"] }), bericht(4, { status: "concept", redactie: "weg" }), bericht(5));
  const doe = (n: number) => voerActieUit(opslag, redacteur, { actie: "plaats", id: id(n), terug: `/redactie/bericht/${id(n)}` });
  const staat = (n: number) => opslag.berichtenLijst.find((b) => b.id === id(n))!.status;
  assert.equal(magTochPlaatsen(opslag.berichtenLijst[0]), true);
  assert.equal(magTochPlaatsen(opslag.berichtenLijst[1]), false, "geblokkeerd: geen knop");
  assert.equal(magTochPlaatsen(opslag.berichtenLijst[2]), false);
  const ok = await doe(1);
  assert.deepEqual([ok.ok, ok.terug, staat(1)], [true, "/redactie", "gepubliceerd"]);
  assert.match(ok.melding, /Geplaatst/);
  for (const n of [2, 3, 4]) { const u = await doe(n); assert.equal(u.ok, false, `bericht ${n}`); }
  assert.equal(staat(2), "geblokkeerd");
  assert.equal(staat(3), "concept");
  assert.equal(staat(4), "concept");
  assert.equal((await doe(5)).ok, false);
  assert.equal((await doe(9)).ok, false, "onbekend bericht");
});

// ---- 5. kleine punten ----
const ID1 = "11111111-1111-1111-1111-111111111111";
const BRON = "https://www.service-public.fr/particuliers/actualites/A99999";
const TEKST = "De regels voor de energielabels van woningen in Frankrijk veranderen volgens de overheid met ingang van het nieuwe jaar. Eigenaars van een woning met een slecht label krijgen te maken met nieuwe verplichtingen bij verhuur en verkoop. De overheid wil zo het energieverbruik in woningen verlagen en de uitstoot beperken. Wie een woning verhuurt of wil verkopen, doet er goed aan nu te kijken welk label het huis heeft. Een energiedeskundige kan het label vaststellen en uitleggen welke verbeteringen het meeste opleveren.\n\nVoor huiseigenaren in Frankrijk betekent dit dat een renovatie eerder aan de orde kan komen dan gedacht. Er zijn subsidies en leningen die een deel van de kosten dekken, en de gemeente kan uitleggen welke regelingen er in de eigen streek gelden. Wie nu begint, houdt meer tijd om de werkzaamheden goed te plannen.";
const synthese = () => JSON.stringify({ publiceren: true, kop: "Nieuwe regels voor energielabels van woningen", samenvatting: "Eigenaars van woningen met een slecht energielabel krijgen nieuwe verplichtingen bij verhuur en verkoop.", tekst: TEKST, categorie: "economie en ondernemen", relevantie: 80 });
const PAGINA = (titel: string, tekst: string) => `<html><head><title>${titel}</title><meta name="description" content="Korte uitleg."></head><body><article><p>${tekst}</p></article></body></html>`;
const LANG = "Les propriétaires de logements classés F ou G ne pourront plus mettre leur bien en location à partir du 1er janvier 2028 selon les nouvelles règles du diagnostic de performance énergétique.";
const tip = (o: Partial<RadarRij> = {}): RadarRij => ({
  id: ID1, signaalUrl: "https://www.connexionfrance.com/news/dpe-changes", signaalDatum: new Date(nu - 7200_000).toISOString(), werktitel: "Nieuwe energielabels voor woningen", categorie: "Vastgoed", relevantie: "Raakt huiseigenaren.",
  status: "klaar voor redactie", primaireBron: [{ naam: "Service-Public.fr", url: BRON, datum: new Date(nu - 3600_000).toISOString() }], berichtId: null,
  beoordeeldOp: new Date(nu - 3600_000).toISOString(), besluit: null, besluitOp: null, ...o,
});
/** Een antwoord met een eindadres (zoals na een redirect). */
const metEindadres = (r: Response, eind: string) => { Object.defineProperty(r, "url", { value: eind }); return r; };
const pagina = (eind?: string) => { const r = new Response(PAGINA("DPE: nieuwe regels - Service-Public.fr", LANG), { headers: { "content-type": "text/html" } }); return eind ? metEindadres(r, eind) : r; };

test("5a: bij een tip met een onleesbare overheidsbron verschijnt ook het veld voor een link; zonder mislukte poging niet", () => {
  assert.equal(toonLinkVeld(1, false), false);
  assert.equal(toonLinkVeld(1, true, "Gelukt"), false);
  assert.equal(toonLinkVeld(1, false, MELDING_LINK_ONLEESBAAR), false, "een melding bij een andere tip telt niet");
  assert.equal(toonLinkVeld(1, true, MELDING_LINK_ONLEESBAAR), true);
  assert.equal(toonLinkVeld(2, true, null, "https://www.lemonde.fr/a"), true, "een geplakte link die niet deugde blijft in het veld");
  assert.equal(toonLinkVeld(0, false), true, "zonder bron staat het veld er altijd");
});

test("5a: een onleesbare overheidsbron zonder link geeft de melding; mét link neemt de link het over", async () => {
  const opslag = new GeheugenOpslag();
  opslag.radarRijen.push(tip());
  const f = (async (u: string) => (String(u).includes("/vosdroits/F123") ? pagina() : new Response("x", { status: 404 }))) as unknown as typeof fetch;
  const client = klein([synthese()]);
  const zonder = await maakBerichtUitTip({ opslag, client, fetchFn: f, nu, peil: [], generator: null }, ID1);
  assert.deepEqual(zonder, { ok: false, melding: MELDING_LINK_ONLEESBAAR });
  assert.equal(opslag.radarRijen[0].besluit, null);
  const met = await maakBerichtUitTip({ opslag, client, fetchFn: f, nu, peil: [], generator: null }, ID1, "https://www.service-public.fr/particuliers/vosdroits/F123");
  assert.ok(met.ok, met.ok ? "" : met.melding);
  assert.deepEqual(opslag.berichtenLijst[0].bronnen.map((b) => b.url), ["https://www.service-public.fr/particuliers/vosdroits/F123"]);
});

test("5d: het eindadres na redirects wordt opnieuw getoetst (overheidsdomein en verboden bron) en is het adres dat als bron wordt bewaard", async () => {
  const probeer = async (eind: string, client = klein([synthese()])) => {
    const opslag = new GeheugenOpslag();
    opslag.radarRijen.push(tip({ primaireBron: null }));
    const f = (async () => pagina(eind)) as unknown as typeof fetch;
    return { u: await maakBerichtUitTip({ opslag, client, fetchFn: f, nu, peil: [], generator: null }, ID1, "https://www.impots.gouv.fr/doorverwijzing"), opslag, client };
  };
  const krant = await probeer("https://www.lemonde.fr/artikel");
  assert.deepEqual(krant.u, { ok: false, melding: MELDING_GEEN_OVERHEIDSLINK });
  assert.equal(krant.opslag.items.size, 0, "niets bewaard");
  assert.equal(krant.client.aanroepen.length, 0);
  const tipgever = await probeer("https://www.connexionfrance.com/news/x");
  assert.deepEqual(tipgever.u, { ok: false, melding: "Dit is een tipgever. Van een tipgever nemen we nooit iets over." });
  const goed = await probeer("https://www.service-public.fr/particuliers/vosdroits/F999?x=1#kop");
  assert.ok(goed.u.ok, goed.u.ok ? "" : goed.u.melding);
  assert.deepEqual(goed.opslag.berichtenLijst[0].bronnen.map((b) => b.url), ["https://www.service-public.fr/particuliers/vosdroits/F999?x=1"], "eindadres, zonder #kop");
});

test("5c: eerst de link, dan het model: een foute link krijgt zijn eigen melding ook zonder model; een goede link zonder model slaat niets op", async () => {
  const opslag = new GeheugenOpslag();
  opslag.radarRijen.push(tip({ primaireBron: null }));
  const f = (async () => pagina()) as unknown as typeof fetch;
  assert.deepEqual(await maakBerichtUitTip({ opslag, client: null, fetchFn: f, nu, peil: [], generator: null }, ID1, "https://www.lemonde.fr/a"), { ok: false, melding: MELDING_GEEN_OVERHEIDSLINK });
  assert.deepEqual(await maakBerichtUitTip({ opslag, client: null, fetchFn: f, nu, peil: [], generator: null }, ID1, "geen link"), { ok: false, melding: "Dit is geen geldige link. Plak het hele adres van de pagina." });
  assert.deepEqual(await maakBerichtUitTip({ opslag, client: null, fetchFn: f, nu, peil: [], generator: null }, ID1, "https://www.service-public.fr/x"), { ok: false, melding: TIJDELIJK_MELDING });
  assert.equal(opslag.items.size, 0, "zonder model wordt er niets bewaard");
  assert.equal(opslag.berichtenLijst.length, 0);
});

