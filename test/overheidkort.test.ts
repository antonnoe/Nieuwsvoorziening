// Overheidskort (28-11-2026): model-JSON verwerken, getallencontrole, R17 en Caribisch Nederland vooraf zonder model, tab Overheid mengt
// korten en berichten, weg wordt niet getoond, zonder tabel geen fout. Nep-model en nep-fetch; geen netwerk.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GeheugenOpslag, SupabaseOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import { OVERHEIDKORT_BUDGET_MS, MAX_OVERHEIDSKORT_PER_RUN, draaiOverheidKort, kortAfkeurReden, maakKort } from "../lib/motor/overheidkort";
import { draaiOogst } from "../lib/motor/motor";
import { laadConfig } from "../lib/motor/config";
import { laadOverheidItems, OVERHEID_MAX } from "../lib/inbed";
import { voerActieUit } from "../lib/redactie-acties";
import { wisOpslagCache } from "../lib/motor/api";
import { GET } from "../app/api/overheid/route";
import { bron, item, klein } from "./helpers";
import type { OverheidKortRij } from "../lib/motor/types";

const nu = Date.parse("2026-11-28T09:00:00Z");
const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const goed = (o: Record<string, unknown> = {}) =>
  JSON.stringify({ titel: "Nieuwe regels voor de gîte-verhuur in 2027", samenvatting: "Wie een gîte verhuurt, krijgt vanaf 1 januari 2027 te maken met nieuwe regels. De maximale huuropbrengst blijft 15000 euro.", thema: "geld-belasting", relevant: true, ...o });
const FR = item({
  url: "https://www.service-public.fr/a", bronId: "sp", bronNaam: "Service-Public", regime: "overheid", groep: "overheid", taal: "fr", land: "FR",
  titel: "Meublés de tourisme: nouvelles règles au 1er janvier 2027", samenvatting: "Le plafond reste fixé à 15000 euros de recettes.", gepubliceerdOp: new Date(nu - 3600_000).toISOString(),
});
const NL = item({
  url: "https://www.rijksoverheid.nl/b", bronId: "rijk", bronNaam: "Rijksoverheid", regime: "overheid", groep: "overheid", taal: "nl", land: "NL",
  titel: "Kabinet verhoogt het tarief voor gemeentelijke afvalheffing", samenvatting: "De gemeenten krijgen meer ruimte voor de afvalheffing.", gepubliceerdOp: new Date(nu - 7200_000).toISOString(),
});
const NL_BUITENLAND = item({
  url: "https://www.rijksoverheid.nl/c", bronId: "rijk", bronNaam: "Rijksoverheid", regime: "overheid", groep: "overheid", taal: "nl", land: "NL",
  titel: "Nieuwe regels voor Nederlanders in Frankrijk met AOW", samenvatting: "Wie in Frankrijk woont en AOW ontvangt, krijgt een nieuw formulier.", gepubliceerdOp: new Date(nu - 5000_000).toISOString(),
});
const NL_CARIBISCH = item({
  url: "https://www.rijksoverheid.nl/d", bronId: "rijk", bronNaam: "Rijksoverheid", regime: "overheid", groep: "overheid", taal: "nl", land: "NL",
  titel: "Nieuwe regels voor Bonaire en Nederlanders in Frankrijk", samenvatting: "Caribisch Nederland krijgt een eigen regeling.", gepubliceerdOp: new Date(nu - 6000_000).toISOString(),
});
const BRONNEN = ["sp", "rijk"];

// ---- Model-JSON verwerken -------------------------------------------------------------------------------
test("maakKort: JSON (ook in code-hekken) wordt een kaart met thema en relevantie; model krijgt alleen kop en omschrijving", async () => {
  const c = klein(["```json\n" + goed() + "\n```"]);
  const u = await maakKort(FR, c);
  assert.ok(u.ok);
  if (u.ok) {
    assert.equal(u.thema, "geld-belasting");
    assert.equal(u.relevant, true);
    assert.match(u.titel, /gîte/);
  }
  assert.equal(c.aanroepen[0].model, "claude-haiku-4-5", "het goedkope model");
  assert.ok(c.aanroepen[0].user.includes("Meublés de tourisme") && c.aanroepen[0].user.includes("15000"));
  const nee = await maakKort(FR, klein([goed({ relevant: false })]));
  assert.ok(nee.ok && nee.relevant === false);
});

test("maakKort: geen JSON, onbekend thema en modelfout geven een reden; alleen de modelfout is tijdelijk", async () => {
  const a = await maakKort(FR, klein(["Het spijt me, dat kan ik niet."]));
  assert.ok(!a.ok && a.reden === "antwoord is geen JSON" && !a.modelfout);
  const b = await maakKort(FR, klein([goed({ thema: "sport" })]));
  assert.ok(!b.ok && /onbekend thema/.test(b.reden) && !b.modelfout);
  const kapot = { async tekst() { throw new Error("overbelast"); } };
  const c = await maakKort(FR, kapot);
  assert.ok(!c.ok && c.modelfout);
});

// ---- Controles -----------------------------------------------------------------------------------------
test("getallencontrole: elk getal moet in kop of omschrijving staan (ook 1 500 en 1er)", () => {
  const bronTekst = "Le plafond de 15 000 euros au 1er janvier 2027, soit 1,5 % de plus";
  assert.equal(kortAfkeurReden("Plafond van 15000 euro per 1 januari", "Het plafond wordt 15 000 euro per 1 januari 2027, ruim 1,5 procent hoger.", bronTekst), null);
  assert.match(kortAfkeurReden("Plafond van 20000 euro per 1 januari", "Het plafond wordt een stuk hoger voor de verhuurders.", bronTekst) || "", /getal niet in kop of omschrijving: 20000/);
  assert.match(kortAfkeurReden("Plafond stijgt per 1 januari", "Het plafond stijgt met 3 procent voor alle verhuurders.", bronTekst) || "", /getal niet in kop of omschrijving: 3/);
});

test("controles: geen link, geen meta-taal, titel hooguit 10 woorden, samenvatting niet te lang of leeg", () => {
  const b = "kop omschrijving";
  assert.match(kortAfkeurReden("Nieuwe regels voor huurders", "Lees meer op https://www.service-public.fr/a over de regels.", b) || "", /link/);
  assert.match(kortAfkeurReden("Nieuwe regels voor huurders", "Lees alles op www.service-public.fr over de regels voor huurders.", b) || "", /link/);
  assert.match(kortAfkeurReden("Nieuwe regels voor huurders", "Volgens de bron gelden er nieuwe regels voor huurders van woningen.", b) || "", /meta-taal/);
  assert.match(kortAfkeurReden("Een titel die veel te lang is voor deze kaart met elf woorden erin hier", "Gewone zin over de regels voor huurders van woningen.", b) || "", /langer dan 10/);
  assert.match(kortAfkeurReden("Nieuwe regels voor huurders", "Te kort.", b) || "", /te kort/);
  assert.match(kortAfkeurReden("Nieuwe regels voor huurders", "Eerste zin. Tweede zin. Derde zin. Vierde zin over regels.", b) || "", /meer dan twee zinnen/);
  assert.equal(kortAfkeurReden("Nieuwe regels voor huurders", "Huurders krijgen nieuwe regels. Verhuurders moeten ze volgen.", b), null);
});

// ---- De stap: R17 en Caribisch vooraf, afgekeurd, modelfout ---------------------------------------------
test("R17 en Caribisch Nederland vooraf zonder model; Franse overheid en NL met buitenlandkenmerk gaan naar het model", async () => {
  const opslag = new GeheugenOpslag();
  await opslag.upsertItems([FR, NL, NL_BUITENLAND, NL_CARIBISCH]);
  const c = klein([goed()]);
  const r = await draaiOverheidKort({ opslag, client: c, bronIds: BRONNEN, nu });
  assert.ok(r.ok);
  assert.equal(c.aanroepen.length, 2, "alleen FR en NL met buitenlandkenmerk gaan naar het model");
  assert.ok(c.aanroepen.every((a) => !a.user.includes("afvalheffing") && !a.user.includes("Bonaire")));
  assert.equal(r.detail.r17, 1);
  assert.equal(r.detail.caribisch, 1);
  assert.equal(opslag.overheidKorten.length, 4);
  const per = (u: string) => opslag.overheidKorten.find((k) => k.itemUrl === u)!;
  assert.equal(per(NL.url).relevant, false);
  assert.equal(per(NL.url).reden, "r17");
  assert.equal(per(NL_CARIBISCH.url).reden, "caribisch");
  assert.equal(per(FR.url).relevant, true);
  assert.equal(per(FR.url).bronDomein, "service-public.fr");
  assert.equal(per(FR.url).datum, FR.gepubliceerdOp);
  // Een tweede run doet niets meer: alles heeft een kaart (ook de niet-relevante).
  const c2 = klein([goed()]);
  const r2 = await draaiOverheidKort({ opslag, client: c2, bronIds: BRONNEN, nu });
  assert.equal(c2.aanroepen.length, 0);
  assert.equal(r2.detail.teDoen, 0);
});

test("afgekeurde kaart wordt niet getoond en niet opnieuw gevraagd; een modelfout laat het item voor de volgende run staan", async () => {
  const opslag = new GeheugenOpslag();
  await opslag.upsertItems([FR]);
  const slecht = klein([goed({ samenvatting: "Het plafond wordt 99999 euro voor alle verhuurders in Frankrijk." })]);
  const r = await draaiOverheidKort({ opslag, client: slecht, bronIds: BRONNEN, nu });
  assert.equal(r.gemaakt, 0);
  assert.equal(r.detail.afgekeurd, 1);
  assert.match(String((r.detail.redenen as string[])[0]), /getal niet in kop of omschrijving: 99999/);
  assert.equal(opslag.overheidKorten[0].relevant, false);
  assert.match(String(opslag.overheidKorten[0].reden), /^afgekeurd:/);
  assert.equal((await opslag.overheidKortLijst({ limiet: 10 })).length, 0);

  const opslag2 = new GeheugenOpslag();
  await opslag2.upsertItems([FR]);
  const kapot = { async tekst(): Promise<string> { throw new Error("overbelast"); } };
  const r2 = await draaiOverheidKort({ opslag: opslag2, client: kapot, bronIds: BRONNEN, nu });
  assert.equal(r2.detail.uitgesteld, 1);
  assert.equal(opslag2.overheidKorten.length, 0, "niets bewaard");
  const r3 = await draaiOverheidKort({ opslag: opslag2, client: klein([goed()]), bronIds: BRONNEN, nu });
  assert.equal(r3.gemaakt, 1, "de volgende run lukt het wel");
});

test("plafond per run, venster van 7 dagen en alleen actieve overheidsbronnen", async () => {
  assert.equal(MAX_OVERHEIDSKORT_PER_RUN, 20);
  assert.equal(OVERHEIDKORT_BUDGET_MS, 60_000);
  const opslag = new GeheugenOpslag();
  const veel = Array.from({ length: 25 }, (_, n) => item({ ...FR, url: `https://www.service-public.fr/n${n}`, titel: `Meublés ${n}`, gepubliceerdOp: new Date(nu - (n + 1) * 60_000).toISOString() }));
  await opslag.upsertItems([...veel, item({ ...FR, url: "https://www.service-public.fr/oud", gepubliceerdOp: new Date(nu - 8 * 86400_000).toISOString() }), item({ ...FR, url: "https://x.test/inactief", bronId: "uit" }), item({ url: "https://p.test/pers", regime: "pers" })]);
  const c = klein([goed({ titel: "Nieuwe regels voor de verhuur", samenvatting: "Er komen nieuwe regels voor verhuurders in Frankrijk." })]);
  const r = await draaiOverheidKort({ opslag, client: c, bronIds: ["sp"], nu });
  assert.equal(c.aanroepen.length, 20);
  assert.equal(r.gemaakt, 20);
  const urls = opslag.overheidKorten.map((k) => k.itemUrl);
  assert.ok(!urls.includes("https://www.service-public.fr/oud") && !urls.includes("https://x.test/inactief") && !urls.includes("https://p.test/pers"));
  assert.ok(urls.includes("https://www.service-public.fr/n0") && !urls.includes("https://www.service-public.fr/n24"), "nieuwste eerst");
});

test("tijdbudget: een verlopen budget stopt de lus netjes (wat voor het verlopen budget vooraf wordt afgewezen kost niets)", async () => {
  const opslag = new GeheugenOpslag();
  await opslag.upsertItems([FR, { ...NL, gepubliceerdOp: new Date(nu - 60_000).toISOString() }]);
  const c = klein([goed()]);
  const r = await draaiOverheidKort({ opslag, client: c, bronIds: BRONNEN, nu, budgetMs: 0 });
  assert.ok(r.ok);
  assert.equal(c.aanroepen.length, 0);
  assert.equal(opslag.overheidKorten.length, 1, "alleen de R17-afwijzing is bewaard");
  assert.equal(opslag.overheidKorten[0].reden, "r17");
});

// ---- Zonder tabel of zonder model -----------------------------------------------------------------------
test("zonder tabel: de stap slaat over, lezen geeft leeg en de redactie krijgt een nette melding; zonder model of bronnen ook geen fout", async () => {
  const opslag = new GeheugenOpslag();
  opslag.overheidKortTabelOntbreekt = true;
  await opslag.upsertItems([FR]);
  const r = await draaiOverheidKort({ opslag, client: klein([goed()]), bronIds: BRONNEN, nu });
  assert.ok(r.ok && !r.fout);
  assert.match(String(r.detail.overgeslagen), /nv_overheid_kort/);
  assert.deepEqual(await opslag.overheidKortLijst({ limiet: 5 }), []);
  assert.equal(await opslag.overheidKortOpruimen("2026-01-01"), 0);
  const u = await voerActieUit(opslag, { rol: "redacteur", naam: "M", id: "x" }, { actie: "kort-weg", id: U1 });
  assert.equal(u.ok, false);
  assert.ok(u.melding.length > 5);
  const geen = await draaiOverheidKort({ opslag: new GeheugenOpslag(), client: null, bronIds: BRONNEN, nu });
  assert.ok(geen.ok && /modelsleutel/.test(String(geen.detail.overgeslagen)));
  const geenBron = await draaiOverheidKort({ opslag: new GeheugenOpslag(), client: klein([goed()]), bronIds: [], nu });
  assert.ok(geenBron.ok && /overheidsbronnen/.test(String(geenBron.detail.overgeslagen)));
});

test("Supabase zonder tabel: lezen geeft leeg, schrijven geeft TabelOntbreekt, opruimen 0", async () => {
  const fout = (async () => new Response('{"code":"PGRST205","message":"Could not find the table \'public.nv_overheid_kort\' in the schema cache"}', { status: 404 })) as unknown as typeof fetch;
  const o = new SupabaseOpslag("https://p.supabase.co", "k", fout);
  assert.deepEqual(await o.overheidKortLijst({ limiet: 5 }), []);
  assert.equal(await o.overheidKortOpruimen("2026-01-01"), 0);
  await assert.rejects(() => o.overheidKortOpslaan([{ itemUrl: "https://a.test/1", bronNaam: "A", bronDomein: "a.test", datum: "2026-11-28T08:00:00Z", titel: "t", samenvatting: "s", thema: null, relevant: false, reden: "r17", gemaaktOp: "2026-11-28T09:00:00Z" }]), { name: "TabelOntbreekt" });
  await assert.rejects(() => o.overheidKortTeMaken("2026-11-21T00:00:00Z", 20, ["sp"]), { name: "TabelOntbreekt" });
  await assert.rejects(() => o.zetOverheidKortRedactie(U1, "weg"), { name: "TabelOntbreekt" });
});

test("Supabase: verzoeken voor lijst, weg en opslaan", async () => {
  const log: { url: string; method: string; body?: string }[] = [];
  const f = (async (u: string, i?: RequestInit) => {
    log.push({ url: String(u), method: String(i?.method || "GET"), body: typeof i?.body === "string" ? i.body : undefined });
    return new Response(String(u).includes("select=item_url") ? "[]" : String(u).includes("nv_bron_items") ? JSON.stringify([{ id: "1", url: FR.url, bron_id: "sp", bron_naam: "Service-Public", regime: "overheid", groep: "overheid", titel: "t", samenvatting: "s", gepubliceerd_op: FR.gepubliceerdOp }]) : "[{}]");
  }) as unknown as typeof fetch;
  const o = new SupabaseOpslag("https://p.supabase.co", "k", f);
  await o.overheidKortLijst({ limiet: 20 });
  await o.overheidKortLijst({ limiet: 20, metWeg: true, sindsIso: "2026-11-26T00:00:00Z" });
  assert.ok(log[0].url.includes("relevant=eq.true") && log[0].url.includes("redactie.neq.weg") && log[0].url.includes("order=datum.desc"));
  assert.ok(!log[1].url.includes("redactie.neq.weg") && log[1].url.includes("gemaakt_op=gte."));
  assert.equal((await o.overheidKortTeMaken("2026-11-21T00:00:00Z", 5, ["sp"])).length, 1);
  assert.equal((await o.overheidKortTeMaken("2026-11-21T00:00:00Z", 5, ["ander"])).length, 0);
  assert.equal(await o.zetOverheidKortRedactie("geen-uuid", "weg"), false);
  assert.equal(await o.zetOverheidKortRedactie(U1, "weg"), true);
  const patch = log.find((l) => l.method === "PATCH")!;
  assert.ok(patch.url.includes(`nv_overheid_kort?id=eq.${U1}`) && JSON.parse(patch.body!).redactie === "weg");
  assert.ok(log.every((l) => !l.url.includes("news_items")));
});

// ---- Tab Overheid mengt korten en berichten -------------------------------------------------------------
const kort = (n: number, o: Partial<OverheidKortRij> = {}): OverheidKortRij => ({
  id: `kort-${n}`, itemUrl: `https://www.service-public.fr/k${n}`, bronNaam: "Service-Public", bronDomein: "service-public.fr", datum: new Date(Date.UTC(2026, 10, 20, 10, n)).toISOString(),
  titel: `Kort ${n}`, samenvatting: `Samenvatting ${n}`, thema: "praktisch", relevant: true, reden: null, gemaaktOp: new Date(nu).toISOString(), redactie: null, ...o,
});
const bericht = (n: number, o: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht => ({
  id: `id-${n}`, soort: "overheid", kop: `Bericht ${n}`, samenvatting: `S ${n}`, tekst: "t", categorie: "algemeen", score: 80, regime: "overheid", status: "gepubliceerd", blokkadeRedenen: [],
  portemonnee: false, signaal: null, signaalBeoordeeld: true, beeldUrl: null, beeldCredit: null, peil: { raakt: [], mogelijkGewijzigd: [] }, bronnen: [],
  gepubliceerdOp: new Date(Date.UTC(2026, 10, 20, 10, n)).toISOString(), regelversie: 2, ...o,
} as OpgeslagenBericht);

test("tab Overheid: korten en berichten gemengd op datum, link naar de officiële pagina, bronnaam en thema-label", async () => {
  const o = new GeheugenOpslag();
  o.overheidKorten.push(kort(1), kort(3, { thema: "douane" }));
  o.berichtenLijst.push(bericht(2), bericht(4), bericht(9, { soort: "pers", regime: "pers" }));
  const r = (await laadOverheidItems(o, (c) => c))!;
  assert.deepEqual(r.map((i) => i.titel), ["Bericht 4", "Kort 3", "Bericht 2", "Kort 1"]);
  const k3 = r.find((i) => i.titel === "Kort 3")!;
  assert.equal(k3.url, "https://www.service-public.fr/k3", "naar de officiële pagina");
  assert.equal(k3.label, "Service-Public · Douane");
  assert.ok(r.find((i) => i.titel === "Bericht 2")!.url.startsWith("https://nieuws.infofrankrijk.com/bericht/"));
});

test("tab Overheid: weggehaald, niet relevant en een kort dat al als bron onder een bericht staat worden niet getoond; hooguit 20 korten", async () => {
  const o = new GeheugenOpslag();
  o.overheidKorten.push(kort(1, { redactie: "weg" }), kort(2, { relevant: false, reden: "r17" }), kort(3), kort(4));
  o.berichtenLijst.push(bericht(5, { bronnen: [{ naam: "SP", origineleKop: "x", datum: "", url: "https://www.service-public.fr/k4" }] }));
  const r = (await laadOverheidItems(o, (c) => c))!;
  assert.deepEqual(r.map((i) => i.titel).sort(), ["Bericht 5", "Kort 3"]);
  const veel = new GeheugenOpslag();
  for (let n = 0; n < 30; n++) veel.overheidKorten.push(kort(n));
  const lijst = (await laadOverheidItems(veel, (c) => c))!;
  assert.equal(lijst.length, 20);
  assert.ok(OVERHEID_MAX >= 20);
  assert.deepEqual(await laadOverheidItems(new GeheugenOpslag(), (c) => c), [], "leeg is leeg, geen fout");
  assert.equal(await laadOverheidItems(null, (c) => c), null);
});

test("tab Overheid zonder tabel: de berichten blijven; faalt het lezen van de berichten, dan blijven de korten", async () => {
  const o = new GeheugenOpslag();
  o.overheidKortTabelOntbreekt = true;
  o.berichtenLijst.push(bericht(1));
  assert.deepEqual((await laadOverheidItems(o, (c) => c))!.map((i) => i.titel), ["Bericht 1"]);
  const g = new GeheugenOpslag();
  g.overheidKorten.push(kort(1));
  g.berichten = (async () => { throw new Error("kapot"); }) as typeof g.berichten;
  assert.deepEqual((await laadOverheidItems(g, (c) => c))!.map((i) => i.titel), ["Kort 1"]);
  const beide = new GeheugenOpslag();
  beide.berichten = (async () => { throw new Error("kapot"); }) as typeof beide.berichten;
  beide.overheidKortLijst = (async () => { throw new Error("kapot"); }) as typeof beide.overheidKortLijst;
  assert.equal(await laadOverheidItems(beide, (c) => c), null);
});

// ---- Redactie: weg en terug ----------------------------------------------------------------------------
test("redactie: Weg zet redactie op weg (kort verdwijnt uit tab en API), Terug zet het terug", async () => {
  const o = new GeheugenOpslag();
  o.overheidKorten.push(kort(1, { id: U1 }), kort(2, { id: U2 }));
  const r = { rol: "redacteur" as const, naam: "Marijke", id: "x" };
  const weg = await voerActieUit(o, r, { actie: "kort-weg", id: U1, terug: "/redactie" });
  assert.ok(weg.ok && weg.terug === "/redactie");
  assert.equal(o.overheidKorten[0].redactie, "weg");
  assert.deepEqual((await laadOverheidItems(o, (c) => c))!.map((i) => i.titel), ["Kort 2"]);
  assert.equal((await o.overheidKortLijst({ limiet: 10 })).length, 1);
  assert.equal((await o.overheidKortLijst({ limiet: 10, metWeg: true })).length, 2, "de redactie ziet de weggehaalde nog, om terug te kunnen zetten");
  const terug = await voerActieUit(o, r, { actie: "kort-terug", id: U1 });
  assert.ok(terug.ok);
  assert.equal(o.overheidKorten[0].redactie, null);
  assert.equal((await voerActieUit(o, r, { actie: "kort-weg", id: "geen-uuid" })).ok, false);
  assert.equal((await voerActieUit(o, r, { actie: "kort-weg", id: "33333333-3333-3333-3333-333333333333" })).ok, false);
});

// ---- Publieke API ----------------------------------------------------------------------------------------
test("/api/overheid: alleen relevant en niet weg, publieke velden, CORS en korte cache; geen intern veld", async () => {
  const echt = globalThis.fetch;
  const was = [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY];
  process.env.SUPABASE_URL = "https://p.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  const urls: string[] = [];
  const rij = { id: U1, item_url: "https://www.service-public.fr/k1", bron_naam: "Service-Public", bron_domein: "service-public.fr", datum: "2026-11-27T08:00:00Z", titel: "Titel", samenvatting: "Zin.", thema: "douane", relevant: true, reden: null, gemaakt_op: "2026-11-28T08:00:00Z", redactie: null };
  globalThis.fetch = (async (u: string) => { urls.push(String(u)); return new Response(JSON.stringify([rij, { ...rij, id: U2, item_url: "javascript:alert(1)" }])); }) as typeof fetch;
  wisOpslagCache();
  try {
    const res = await GET(new Request("https://nieuws.infofrankrijk.com/api/overheid?limiet=5", { headers: { origin: "https://infopoche.fr" } }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), "https://infopoche.fr");
    assert.match(res.headers.get("cache-control") || "", /s-maxage=60/);
    assert.ok(urls[0].includes("limit=5") && urls[0].includes("relevant=eq.true") && urls[0].includes("redactie.neq.weg"));
    const j = await res.json();
    assert.equal(j.aantal, 1, "een onveilige url valt af");
    assert.deepEqual(Object.keys(j.items[0]), ["titel", "samenvatting", "thema", "themaNaam", "bron", "datum", "url"]);
    assert.equal(j.items[0].themaNaam, "Douane");
    assert.ok(!JSON.stringify(j).includes("reden") && !JSON.stringify(j).includes("redactie"));
  } finally {
    globalThis.fetch = echt;
    [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY] = was as [string, string];
    if (was[0] === undefined) delete process.env.SUPABASE_URL;
    if (was[1] === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    wisOpslagCache();
  }
});

// ---- In de oogstrun --------------------------------------------------------------------------------------
test("oogstrun: stap overheidkort draait na de oogst en werkt ook zonder tabel", async () => {
  const feed = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title><item><title><![CDATA[${FR.titel}]]></title><link>${FR.url}</link><pubDate>${new Date(nu - 3600_000).toUTCString()}</pubDate><description>${FR.samenvatting}</description></item></channel></rss>`;
  const fetchFn = (async () => new Response(feed)) as unknown as typeof fetch;
  const bronnen = [bron({ id: "sp", naam: "Service-Public", feed: "https://www.service-public.fr/feed", domein: "service-public.fr", regime: "overheid", groep: "overheid", land: "FR" })];
  const cfg = laadConfig();
  const opslag = new GeheugenOpslag();
  const run = await draaiOogst({ opslag, client: klein([(a) => (a.system.includes("kaart") ? goed() : '{"groepen":[]}')]), nu, config: cfg, bronnen, fetchFn, peil: [], generator: null });
  const stap = run.stappen.find((s) => s.stap === "overheidkort")!;
  assert.ok(stap && stap.ok, JSON.stringify(stap));
  assert.equal(opslag.overheidKorten.filter((k) => k.relevant).length, 1);
  const zonder = new GeheugenOpslag();
  zonder.overheidKortTabelOntbreekt = true;
  const run2 = await draaiOogst({ opslag: zonder, client: klein([(a) => (a.system.includes("kaart") ? goed() : '{"groepen":[]}')]), nu, config: cfg, bronnen, fetchFn, peil: [], generator: null });
  assert.ok(run2.stappen.find((s) => s.stap === "overheidkort")!.ok);
  assert.ok(!run2.fouten.some((f) => f.includes("overheidkort")));
});

test("migratie: tabel nv_overheid_kort met unieke item_url, RLS aan, alleen nv_-tabellen", () => {
  const sql = readFileSync("supabase/migrations/20261128170000_nv_overheid_kort.sql", "utf8");
  assert.ok(sql.includes("create table if not exists public.nv_overheid_kort"));
  assert.ok(/item_url text not null unique/.test(sql));
  assert.ok(sql.includes("alter table public.nv_overheid_kort enable row level security"));
  for (const t of ["geld-belasting", "praktisch", "ondernemen", "sociale-zekerheid", "douane", "economie", "wetgeving", "natuur-milieu"]) assert.ok(sql.includes(`'${t}'`), t);
  assert.ok(!/news_items/.test(sql.replace(/--.*$/gm, "")));
  assert.ok(!/create policy/i.test(sql));
});
