// Bronkoppeling van tips met het model (28-11-2026): echte gegevens van de kerstpremie (Prime de Noël, service-public A14502, NL-titel uit nv_overheid_kort)
// en de rampstatus Pas-de-Calais (geen overheidsbron: terugval persbronnen, Légifrance-link in de app). Nep-model, geen netwerk.
import test from "node:test";
import assert from "node:assert/strict";
import { GeheugenOpslag } from "../lib/motor/opslag";
import {
  zoekOverheidsItems, termTreffers, koppelBronnen, herkoppelOpenTips, persKandidaten, zoekPersItems, isRampTip, LEGIFRANCE_ZOEKLINK, radarVorm,
  leesBronKeuze, leesPersKeuze, overheidKandidaten, SYSTEEM_RADAR_BRONKEUZE, SYSTEEM_RADAR_PERSKEUZE, RADAR_HERKOPPEL_VOOR, type KoppelContext,
} from "../lib/motor/radar";
import { maakBerichtUitTip, MELDING_PERSBRONNEN_WEG } from "../lib/redactie-maak-bericht";
import { item } from "./helpers";
import type { ModelClient } from "../lib/motor/ai";
import type { BronItem, RadarRij } from "../lib/motor/types";

const nu = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const WERKTITEL = "kerstpremie voor RSA-ontvangers vanaf 15 december beschikbaar";
// Zoals de selectie ze geeft: Frans, maar in andere woorden dan de overheidskop.
const ZOEKTERMEN = ["prime de Noël", "RSA", "bonus décembre allocataires"];

// Echte gegevens uit nv_bron_items en nv_overheid_kort (28-11-2026).
const KERST: BronItem = item({
  url: "https://www.service-public.gouv.fr/particuliers/actualites/A14502", bronId: "service-public-particuliers", bronNaam: "Service-Public.fr", regime: "overheid", groep: "overheid",
  titel: "Prime de Noël 2026 : quel montant et quelle date de versement ?",
  samenvatting: "<p>La prime de Noël est une aide exceptionnelle attribuée à certains bénéficiaires de minima sociaux (revenu de solidarité active, allocation de solidarité spécifique, allocation équivalent retraite). Cette année, il est prévu qu’elle soit versée à ces foyers modestes à partir du 15 décembre.</p>",
  gepubliceerdOp: "2026-11-26T23:00:00.000Z",
});
const ANDER = (n: number): BronItem => item({
  url: `https://www.service-public.gouv.fr/particuliers/actualites/B${n}`, bronId: "service-public-particuliers", bronNaam: "Service-Public.fr", regime: "overheid", groep: "overheid",
  titel: `Actualité numéro ${n}: démarches administratives`, samenvatting: `<p>Texte ${n}.</p>`, gepubliceerdOp: iso(nu - n * 3600_000),
});
const NL_TITELS = new Map([[KERST.url, "Kerstuitkering 2026: bedrag en betaaldatum"]]);

type Antwoord = (a: { system: string; user: string }) => string;
function model(f: Antwoord): ModelClient & { aanroepen: { system: string; user: string }[] } {
  const aanroepen: { system: string; user: string }[] = [];
  return { aanroepen, async tekst(a) { aanroepen.push({ system: a.system, user: a.user }); return f(a); } };
}
/** Zoekt in de gebruikerstekst het id dat bij de regel met `deel` hoort. */
const idVan = (user: string, deel: string) => user.split("\n").find((r) => r.includes(deel))!.split(" | ")[0];

const ctx = (client: ModelClient, o: Partial<KoppelContext> = {}): KoppelContext => ({
  client, overheid: [ANDER(1), KERST, ANDER(2)], pers: [], nlTitels: NL_TITELS, klaar: () => false,
  budget: { bevestig: 10, bronkeuze: 10, perskeuze: 10 }, gebruikt: { bevestig: 0, bronkeuze: 0, perskeuze: 0 }, ...o,
});

test("reproductie: de trefwoordvoorselectie mist de kerstpremie (drempel van twee treffers, alleen een deel van de woorden komt overeen)", () => {
  const tekst = `${KERST.titel} ${KERST.samenvatting}`;
  // De zoektermen van de tip zijn niet bewaard; dit zijn plausibele termen. Alleen "prime de Noël" raakt: "RSA" is korter dan 4 letters en
  // telt nooit mee, "bonus décembre allocataires" komt in de tekst niet voor. Eén treffer is onder de drempel van twee, dus geen match.
  assert.equal(termTreffers(ZOEKTERMEN, tekst), 1);
  assert.deepEqual(zoekOverheidsItems(ZOEKTERMEN, [KERST], 5), [], "voorselectie vindt niets, dus status handmatig");
  assert.deepEqual(zoekOverheidsItems(["prime de Noël", "RSA"], [KERST], 5).length, 0, "RSA is korter dan 4 letters en telt nooit mee");
});

test("koppelBronnen: het model kiest de kerstpremie uit de lijst, met Franse kop en Nederlandse titel; de tipgever komt er nooit in", async () => {
  const c = model((a) => a.system === SYSTEEM_RADAR_BRONKEUZE ? JSON.stringify({ id: idVan(a.user, "Prime de Noël") }) : "{}");
  const k = await koppelBronnen({ werktitel: WERKTITEL, zoektermen: ZOEKTERMEN }, ctx(c));
  assert.deepEqual(k.overheid.map((i) => i.url), [KERST.url]);
  assert.equal(k.pers.length, 0);
  const u = c.aanroepen.find((a) => a.system === SYSTEEM_RADAR_BRONKEUZE)!.user;
  assert.match(u, /Prime de Noël 2026 : quel montant/);
  assert.match(u, /NL: Kerstuitkering 2026: bedrag en betaaldatum/);
  assert.match(u, new RegExp(`Onderwerp: ${WERKTITEL}`));
  assert.ok(!/connexion|frankrijkactueel|frankrijk actueel/i.test(u));
});

test("koppelBronnen: bij twijfel (null), onbekend id of modelfout geen match; de trefwoordmatch gaat eerst en houdt het model weg", async () => {
  for (const antw of ['{"id": null}', '{"id": "verzonnen"}', "geen json"]) {
    const k = await koppelBronnen({ werktitel: WERKTITEL, zoektermen: ZOEKTERMEN }, ctx(model(() => antw)));
    assert.equal(k.overheid.length, 0, antw);
  }
  const stuk: ModelClient = { async tekst() { throw new Error("storing"); } };
  assert.equal((await koppelBronnen({ werktitel: WERKTITEL, zoektermen: ZOEKTERMEN }, ctx(stuk))).overheid.length, 0);
  // Trefwoordmatch: genoeg treffers en het model bevestigt: de modelstap over 60 items draait niet.
  const c = model((a) => a.system.includes("DEZELFDE maatregel") && !a.system.includes("precies één") ? '{"matches":[1]}' : '{"id": null}');
  const k = await koppelBronnen({ werktitel: "kerstuitkering", zoektermen: ["prime de Noël", "date de versement"] }, ctx(c));
  assert.deepEqual(k.overheid.map((i) => i.url), [KERST.url]);
  assert.equal(c.aanroepen.some((a) => a.system === SYSTEEM_RADAR_BRONKEUZE), false);
});

test("koppelBronnen: hooguit 10 modelaanroepen van de bronkeuze per run, en alleen de laatste 60 items in de lijst", async () => {
  const c = model(() => '{"id": null}');
  const veel = Array.from({ length: 80 }, (_, n) => ANDER(n + 1));
  const x = ctx(c, { overheid: veel });
  for (let n = 0; n < 14; n += 1) await koppelBronnen({ werktitel: `onderwerp ${n}`, zoektermen: [] }, x);
  assert.equal(c.aanroepen.filter((a) => a.system === SYSTEEM_RADAR_BRONKEUZE).length, 10);
  assert.equal(x.gebruikt.bronkeuze, 10);
  assert.equal(c.aanroepen[0].user.split("\n").filter((r) => / \| Actualité/.test(r)).length, 60);
});

test("leesBronKeuze en leesPersKeuze: het id moet in de lijst staan", () => {
  const ids = new Set(["a", "b"]);
  assert.equal(leesBronKeuze('{"id":"a"}', ids), "a");
  assert.equal(leesBronKeuze('{"id":"c"}', ids), null);
  assert.equal(leesBronKeuze('{"id":null}', ids), null);
  assert.deepEqual(leesPersKeuze('{"ids":["a","c","a","b"]}', ids), ["a", "b"]);
  assert.deepEqual(leesPersKeuze("nee", ids), []);
});

// ---- Terugval persbronnen: de rampstatus Pas-de-Calais ---------------------------------------------------------
const RAMP_TIP = "rampstatus erkend na overstromingen in Pas-de-Calais, schadeclaim tot 28 december mogelijk";
const persItem = (bronId: string, naam: string, n: number, titel: string, o: Partial<BronItem> = {}): BronItem =>
  item({ url: `https://${bronId}.test/ramp-${n}`, bronId, bronNaam: naam, regime: "pers", groep: "fr_pers", titel, samenvatting: "Les communes touchées peuvent déclarer leurs dégâts.", gepubliceerdOp: iso(nu - n * 3600_000), ...o });
const PERS_A = persItem("lemonde", "Le Monde", 1, "Inondations dans le Pas-de-Calais: l'état de catastrophe naturelle reconnu");
const PERS_B = persItem("francebleu", "France Bleu", 2, "Pas-de-Calais: catastrophe naturelle reconnue après les inondations, déclarer ses dégâts avant le 28 décembre");
const PERS_C = persItem("lemonde", "Le Monde", 3, "Pas-de-Calais: nouvelles inondations, catastrophe naturelle");
const PERS_X = persItem("voorbeeld", "Andere zaak", 4, "Football: résultats du week-end");

test("terugval persbronnen: model kiest twee items van verschillende bronnen, de tipgevers zijn nooit kandidaat", async () => {
  const c = model((a) => a.system === SYSTEEM_RADAR_PERSKEUZE ? JSON.stringify({ ids: [idVan(a.user, "déclarer ses dégâts"), idVan(a.user, "l'état de catastrophe")] }) : '{"id": null}');
  const verboden = persItem("connexionfrance", "The Connexion", 5, "Pas-de-Calais floods: natural disaster status", { url: "https://www.connexionfrance.com/news/x" });
  const nl = persItem("fa", "Frankrijk Actueel", 6, "Rampstatus Pas-de-Calais erkend", { url: "https://frankrijkactueel.nl/x" });
  const pers = persKandidaten([PERS_A, PERS_B, PERS_C, PERS_X, verboden, nl]);
  assert.deepEqual(pers.map((i) => i.bronId).sort(), ["francebleu", "lemonde", "lemonde", "voorbeeld"]);
  const k = await koppelBronnen({ werktitel: RAMP_TIP, zoektermen: ["catastrophe naturelle", "inondations Pas-de-Calais"] }, ctx(c, { overheid: [KERST], pers }));
  assert.equal(k.overheid.length, 0);
  assert.deepEqual(new Set(k.pers.map((i) => i.bronId)), new Set(["lemonde", "francebleu"]));
  assert.ok(!c.aanroepen.some((a) => /Football/.test(a.user)), "sport valt al in de voorselectie af");
});

test("terugval persbronnen: twee items van dezelfde bron tellen als één; geen model-id's, geen match", async () => {
  const dubbel = model((a) => JSON.stringify({ ids: [idVan(a.user, "l'état de catastrophe"), idVan(a.user, "nouvelles inondations")] }));
  assert.equal((await koppelBronnen({ werktitel: RAMP_TIP, zoektermen: ["catastrophe naturelle"] }, ctx(dubbel, { overheid: [], pers: [PERS_A, PERS_C] }))).pers.length, 0);
});

test("een overheidsbron heeft altijd voorrang op persbronnen", async () => {
  const c = model((a) => a.system === SYSTEEM_RADAR_BRONKEUZE ? JSON.stringify({ id: idVan(a.user, "Prime de Noël") }) : '{"ids":[]}');
  const kerstPers = persItem("lemonde", "Le Monde", 1, "Prime de Noël: versement dès le 15 décembre");
  const k = await koppelBronnen({ werktitel: WERKTITEL, zoektermen: ZOEKTERMEN }, ctx(c, { pers: [kerstPers, persItem("francebleu", "France Bleu", 2, "Prime de Noël pour les allocataires du RSA")] }));
  assert.equal(k.overheid.length, 1);
  assert.equal(k.pers.length, 0);
  assert.ok(!c.aanroepen.some((a) => a.system === SYSTEEM_RADAR_PERSKEUZE));
});

test("zoekPersItems: werktitel-woorden als terugval, hooguit 30, sport en niet-passende items vallen af", () => {
  const veel = Array.from({ length: 50 }, (_, n) => persItem(`b${n}`, `B${n}`, n + 1, `Inondations Pas-de-Calais ${n}`));
  assert.equal(zoekPersItems("overstromingen Pas-de-Calais rampstatus", [], veel).length, 30);
  assert.deepEqual(zoekPersItems("overstromingen Pas-de-Calais rampstatus", [], [PERS_X]), []);
});

test("isRampTip en de Légifrance-link", () => {
  assert.equal(isRampTip(RAMP_TIP), true);
  assert.equal(isRampTip("natuurramp erkend in Occitanië"), true);
  assert.equal(isRampTip("Arrêté de catastrophe naturelle publié"), true);
  assert.equal(isRampTip(WERKTITEL), false);
  assert.equal(LEGIFRANCE_ZOEKLINK, "https://www.legifrance.gouv.fr/search/jorf?query=catastrophe%20naturelle");
});

// ---- Eenmalige herkoppeling van open tips ----------------------------------------------------------------------
const tipRij = (o: Partial<RadarRij> = {}): RadarRij => ({
  id: "11111111-1111-1111-1111-111111111111", signaalUrl: "https://www.connexionfrance.com/news/x", signaalDatum: iso(nu - 3600_000), werktitel: WERKTITEL, categorie: "Belastingen",
  relevantie: "Raakt RSA-ontvangers.", status: "handmatige broncheck vereist", primaireBron: null, berichtId: null, beoordeeldOp: iso(Date.parse(RADAR_HERKOPPEL_VOOR) - 3600_000), besluit: null, besluitOp: null, ...o,
});

test("herkoppelOpenTips: een open tip zonder bron krijgt de overheidsbron, één keer; afgehandelde en nieuwe tips blijven met rust", async () => {
  const opslag = new GeheugenOpslag();
  await opslag.upsertItems([{ ...KERST, gepubliceerdOp: iso(nu - 2 * 86400_000) }]);
  opslag.radarRijen.push(
    tipRij(),
    tipRij({ id: "22222222-2222-2222-2222-222222222222", signaalUrl: "https://x.test/2", besluit: "afgewezen" }),
    tipRij({ id: "33333333-3333-3333-3333-333333333333", signaalUrl: "https://x.test/3", beoordeeldOp: iso(Date.parse(RADAR_HERKOPPEL_VOOR) + 3600_000) }),
  );
  const c = model((a) => a.system === SYSTEEM_RADAR_BRONKEUZE ? JSON.stringify({ id: idVan(a.user, "Prime de Noël") }) : '{"ids":[]}');
  const r = await herkoppelOpenTips({ opslag, client: c, nu });
  assert.deepEqual(r, { bekeken: 1, overheid: 1, pers: 0, geen: 0 });
  const t = opslag.radarRijen[0];
  assert.equal(t.status, "klaar voor redactie");
  assert.deepEqual(t.primaireBron?.map((b) => b.url), [KERST.url]);
  assert.equal(opslag.radarRijen[1].status, "handmatige broncheck vereist");
  // Tweede run: niets meer te doen (beoordeeld_op is bijgewerkt).
  assert.deepEqual(await herkoppelOpenTips({ opslag, client: c, nu: nu + 1000 }), { bekeken: 0, overheid: 0, pers: 0, geen: 0 });
});

test("herkoppelOpenTips: zonder match blijft de tip handmatig maar komt niet elke run terug; hooguit 20 per run", async () => {
  const opslag = new GeheugenOpslag();
  for (let n = 0; n < 25; n += 1) opslag.radarRijen.push(tipRij({ id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`, signaalUrl: `https://x.test/${n}` }));
  const c = model(() => '{"id": null}');
  assert.equal((await herkoppelOpenTips({ opslag, client: c, nu })).bekeken, 20);
  assert.equal((await herkoppelOpenTips({ opslag, client: c, nu })).bekeken, 5);
  assert.equal((await herkoppelOpenTips({ opslag, client: c, nu })).bekeken, 0);
  assert.ok(opslag.radarRijen.every((t) => t.status === "handmatige broncheck vereist"));
});

test("herkoppelOpenTips: ontbrekende tabel geeft niets en geen fout", async () => {
  const opslag = new GeheugenOpslag();
  opslag.radarTabelOntbreekt = true;
  assert.equal((await herkoppelOpenTips({ opslag, client: model(() => "{}"), nu })).bekeken, 0);
});

// ---- Maak bericht uit persbronnen ----------------------------------------------------------------------------------
const TEKST = "In het Pas-de-Calais is na de overstromingen de status van natuurramp erkend. Inwoners en eigenaars van een woning in de getroffen gemeenten kunnen daardoor hun schade melden bij hun verzekeraar. De termijn om de schade te melden loopt tot eind december, dus wie getroffen is, doet er goed aan snel te handelen. De gemeente kan uitleggen welke stukken nodig zijn en waar de aangifte kan worden ingediend.\n\nVoor bezitters van een tweede huis in de streek is het verstandig na te gaan of de woning tot de erkende gemeenten behoort. Een verzekeraar vergoedt de schade alleen als de polis natuurrampen dekt en als de aangifte op tijd binnen is. Foto's van de schade en een lijst van beschadigde spullen helpen bij de afhandeling van de claim.";
const synthese = JSON.stringify({ publiceren: true, kop: "Natuurramp erkend in het Pas-de-Calais", samenvatting: "Inwoners van getroffen gemeenten kunnen hun schade tot eind december melden bij de verzekeraar.", tekst: TEKST, categorie: "natuur en rampen", relevantie: 80 });

test("Maak bericht uit persbronnen: dezelfde synthese en poort, werktitel en tipgever niet naar het model, tip wordt al gepubliceerd", async () => {
  const opslag = new GeheugenOpslag();
  await opslag.upsertItems([PERS_A, PERS_B]);
  opslag.radarRijen.push(tipRij({ id: "11111111-1111-1111-1111-111111111111", werktitel: RAMP_TIP, status: "klaar voor redactie", persBronnen: [PERS_A, PERS_B].map((i) => ({ naam: i.bronNaam, url: i.url, datum: i.gepubliceerdOp })) }));
  const c = model((a) => (a.system.includes("groepeert") ? '{"groepen":[]}' : synthese));
  const NIETS = (async () => new Response("x", { status: 404 })) as unknown as typeof fetch;
  const u = await maakBerichtUitTip({ opslag, client: c, fetchFn: NIETS, nu, peil: [], generator: null }, "11111111-1111-1111-1111-111111111111");
  assert.ok(u.ok, u.ok ? "" : u.melding);
  if (!u.ok) return;
  const b = await opslag.redactieBericht(u.berichtId);
  assert.equal(b?.regime, "pers");
  assert.deepEqual(new Set(b?.bronnen.map((x) => x.url)), new Set([PERS_A.url, PERS_B.url]));
  const invoer = c.aanroepen.map((a) => `${a.system}\n${a.user}`).join("\n");
  assert.ok(!invoer.includes(RAMP_TIP) && !/rampstatus erkend/.test(invoer), "werktitel gaat niet naar het model");
  assert.ok(!/connexion|frankrijkactueel/i.test(invoer));
  assert.equal(opslag.radarRijen[0].status, "al gepubliceerd");
});

test("Maak bericht uit persbronnen: zijn er niet meer twee verschillende bronnen beschikbaar, dan een melding en blijft de tip open", async () => {
  const opslag = new GeheugenOpslag();
  await opslag.upsertItems([PERS_A, PERS_C]); // beide Le Monde
  opslag.radarRijen.push(tipRij({ status: "klaar voor redactie", persBronnen: [PERS_A, PERS_C].map((i) => ({ naam: i.bronNaam, url: i.url, datum: i.gepubliceerdOp })) }));
  const u = await maakBerichtUitTip({ opslag, client: model(() => synthese), fetchFn: (async () => new Response("x", { status: 404 })) as unknown as typeof fetch, nu, peil: [], generator: null }, "11111111-1111-1111-1111-111111111111");
  assert.equal(u.ok, false);
  assert.equal(u.ok ? "" : u.melding, MELDING_PERSBRONNEN_WEG);
  assert.equal(opslag.radarRijen[0].besluit, null);
});

test("radarVorm: persbronnen alleen als ze er zijn; overheidskandidaten blijven overheid", () => {
  const basis = { id: "i", werktitel: RAMP_TIP, categorie: "Overig", signaalDatum: "2026-11-27T08:00:00.000Z", relevantie: "r", primaireBron: null, status: "klaar voor redactie" as const, berichtId: null };
  assert.equal("persbronnen" in radarVorm(basis), false);
  assert.deepEqual(radarVorm({ ...basis, persBronnen: [{ naam: "Le Monde", url: "https://lemonde.test/x", datum: "2026-11-27" }] }).persbronnen, [{ naam: "Le Monde", url: "https://lemonde.test/x", datum: "2026-11-27" }]);
  assert.equal(overheidKandidaten([KERST, PERS_A]).length, 1);
});
