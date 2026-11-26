import test from "node:test";
import assert from "node:assert/strict";
import { draaiOogst } from "../lib/motor/motor";
import { GeheugenOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import { laadConfig } from "../lib/motor/config";
import { kwaliteitsPoort } from "../lib/motor/poort";
import { leesSynthese, SYSTEEM_SYNTHESE } from "../lib/motor/synthese";
import { hashOmschrijving } from "../lib/motor/lezerszin";
import { laadActieveCategorieen, laadVerwant, laadVoorpagina } from "../lib/site";
import type { BeeldGenerator } from "../lib/motor/beeld";
import type { Cluster, Synthese } from "../lib/motor/types";
import { bron, item, klein, rss } from "./helpers";

const cfg = laadConfig();
const pcfg = { minTekstTekens: 280, minKopTekens: 15, minSamenvattingTekens: 40 };
const cluster: Cluster = { sleutel: "k", items: [item(), item({ url: "https://voorbeeld.test/b", bronId: "m" })] };
const alinea = "De prijs van diesel aan de Franse pomp stijgt deze week opnieuw en dat merkt iedereen die er woont of reist aan de maandelijkse kosten van de auto. ";
const lang = alinea.repeat(5).trim(); // ruim 120 woorden
const basis: Synthese = { kop: "Diesel in Frankrijk opnieuw duurder", samenvatting: "De dieselprijs loopt deze week verder op en dat merk je direct aan de pomp.", tekst: lang + "\n\n" + alinea, categorie: "reizen en verkeer", relevantie: 70 };

test("poort: 'volgens de bronnen' is meta-taal", () => {
  const u = kwaliteitsPoort({ ...basis, tekst: basis.tekst.replace("stijgt", "stijgt volgens de bronnen") }, cluster, pcfg);
  assert.equal(u.ok, false);
  assert.ok(u.redenen.some((r) => r.includes("volgens de bronnen")));
});

test("poort: meer dan 120 woorden vraagt minstens twee alinea's", () => {
  assert.equal(kwaliteitsPoort(basis, cluster, pcfg).ok, true);
  const een = kwaliteitsPoort({ ...basis, tekst: lang }, cluster, pcfg);
  assert.equal(een.ok, false);
  assert.ok(een.redenen.some((r) => r.includes("alinea")));
  const kort = kwaliteitsPoort({ ...basis, tekst: "De prijs van diesel aan de Franse pomp stijgt deze week opnieuw en dat merkt iedereen die er woont of reist aan de maandelijkse kosten van de auto, ook bij de supermarkten langs de snelweg en in de steden." }, cluster, pcfg);
  assert.ok(!kort.redenen.some((r) => r.includes("alinea")));
});

test("synthese: schrijfopdracht, taalregels, relevantie en portemonnee", () => {
  assert.ok(!/Schrijf "volgens de bronnen" of niets/.test(SYSTEEM_SYNTHESE));
  assert.match(SYSTEEM_SYNTHESE, /nooit "volgens de bronnen"/);
  assert.match(SYSTEEM_SYNTHESE, /volledig Nederlands/);
  assert.match(SYSTEEM_SYNTHESE, /49\.3/);
  assert.match(SYSTEEM_SYNTHESE, /Tijdloze uitleg zonder nieuwsfeit[^.]*publiceren=false/);
  assert.match(SYSTEEM_SYNTHESE, /regio Parijs/);
  assert.match(SYSTEEM_SYNTHESE, /"portemonnee":false/);
  assert.equal(laadConfig().minRelevantie, 60);
  const j = (o: object) => JSON.stringify({ publiceren: true, kop: "Kop", samenvatting: "S", tekst: "T", categorie: "algemeen", relevantie: 70, ...o });
  assert.equal(leesSynthese(j({ portemonnee: true }))!.portemonnee, true);
  assert.equal(leesSynthese(j({}))!.portemonnee, false);
  assert.equal(leesSynthese(j({ publiceren: false })), null);
});

const tekst = lang + "\n\n" + alinea;
const feedA = rss([{ titel: "Marseille: grève des éboueurs, les ordures s'accumulent", url: "https://a.test/1", datum: new Date(Date.now() - 3600_000) }]);
const feedB = rss([{ titel: "Grève des éboueurs à Marseille: les ordures s'entassent", url: "https://b.test/1", datum: new Date(Date.now() - 7200_000) }]);
const fetchFn = (async (u: string) => (String(u).includes("a.test") ? new Response(feedA) : String(u).includes("b.test") ? new Response(feedB) : new Response("x", { status: 500 }))) as unknown as typeof fetch;
const bronnen = [bron({ id: "a", naam: "Krant A", feed: "https://a.test/feed" }), bron({ id: "b", naam: "Krant B", feed: "https://b.test/feed" })];
const syn = (o: object = {}) => JSON.stringify({ publiceren: true, kop: "Staking vuilnisophaal legt Marseille lam", samenvatting: "De vuilnisophaal in Marseille ligt stil door een staking en de afvalbergen groeien snel.", tekst, categorie: "algemeen", relevantie: 80, portemonnee: true, ...o });

test("motor: portemonnee wordt bewaard, foto's van eerdere berichten worden vermeden en de gekozen foto telt direct mee", async () => {
  const opslag = new GeheugenOpslag();
  await opslag.slaBerichtOp({ ...b("oud", "algemeen"), beeldUrl: "https://images.unsplash.com/photo-oud?w=800" } as never);
  let gezien: string[] = [];
  const generator: BeeldGenerator = { naam: "nep", async genereer(inv) { gezien = [...(inv.vermijd || [])]; inv.vermijd?.add("images.unsplash.com/photo-nieuw"); return { url: "https://images.unsplash.com/photo-nieuw?w=1200&q=75" }; } };
  const r = await draaiOogst({ opslag, client: klein([(a) => (a.system.includes("groepeert") ? '{"groepen":[]}' : syn())]), config: cfg, bronnen, fetchFn, peil: [], generator });
  assert.equal(r.berichten[0].status, "gepubliceerd", r.berichten[0].blokkadeRedenen.join(";"));
  assert.equal(r.berichten[0].portemonnee, true);
  assert.deepEqual(gezien, ["images.unsplash.com/photo-oud"]);
  assert.ok((await opslag.recenteBeeldUrls(60)).length >= 2);
});

test("motor: lezerszinnen, mislukkingen tellen niet mee voor het plafond en de redenen staan in de stapdetails", async () => {
  const opslag = new GeheugenOpslag();
  const peil = Array.from({ length: 70 }, (_, n) => ({ id: `p${n}`, naam: `Parameter ${n}`, aangekondigd: { datum: "2027-01-01", omschrijving: `Tarief wordt ${n + 5} procent` } }));
  // p0..p9: afgekeurd (verzonnen getal), p10: GEEN, rest: goede zin met de datum
  const client = klein([(a) => {
    if (a.system.includes("groepeert")) return '{"groepen":[]}';
    const naam = /Onderwerp: Parameter (\d+)/.exec(a.user);
    if (!naam) return "{}";
    const n = Number(naam[1]);
    if (n < 10) return JSON.stringify({ titel: "Tarief wordt hoger", zin: "Het tarief wordt 999 procent voor iedereen vanaf nu." });
    if (n === 10) return "GEEN";
    return JSON.stringify({ titel: `Tarief wordt ${n + 5} procent`, zin: `Vanaf 1 januari 2027 wordt het tarief ${n + 5} procent voor iedereen.` });
  }]);
  const r = await draaiOogst({ opslag, client, config: cfg, bronnen: [], fetchFn, peil, generator: null });
  const stap = r.stappen.find((s) => s.stap === "peil_lezerszinnen")!;
  const d = stap.detail as { afgekeurd: number; geenGevolg: number; redenen: string[] };
  assert.equal(d.afgekeurd, 10);
  assert.equal(d.geenGevolg, 1);
  assert.equal(stap.aantal, 59, "59 zinnen + 1 GEEN = 60 gelukt, ondanks 10 afkeuringen vooraan (die tellen niet mee voor het plafond van 60)");
  assert.ok(d.redenen[0].startsWith("p0: getal niet in omschrijving"));
  assert.ok(!JSON.stringify(d).includes("sk-"));
  assert.equal((await opslag.lezerszinnen()).get("p10")!.zin, "GEEN");
  assert.equal((await opslag.lezerszinnen()).get("p0"), undefined);
  assert.equal((await opslag.lezerszinnen()).get("p20")!.hash, hashOmschrijving("Tarief wordt 25 procent"));
  assert.equal((await opslag.lezerszinnen()).get("p20")!.titel, "Tarief wordt 25 procent");
});

function b(id: string, categorie: OpgeslagenBericht["categorie"], extra: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht {
  return { id, kop: `Kop ${id}`, samenvatting: "s", tekst: "t", categorie, score: 70, regime: "pers", status: "gepubliceerd", blokkadeRedenen: [], beeldUrl: null, peil: { raakt: [], mogelijkGewijzigd: [] }, bronnen: [], gepubliceerdOp: "2026-11-23T08:00:00.000Z", ...extra };
}
async function vul(lijst: OpgeslagenBericht[]) {
  const o = new GeheugenOpslag();
  o.berichtenLijst.push(...lijst);
  return o;
}

test("voorpagina: pagina 2 en 3 geven de volgende berichten zonder dubbelen", async () => {
  const lijst = Array.from({ length: 30 }, (_, n) => b(`b${String(n).padStart(2, "0")}`, "algemeen", { gepubliceerdOp: new Date(Date.UTC(2026, 10, 23, 12, 0, 30 - n)).toISOString() }));
  const o = await vul([...lijst, b("concept", "algemeen", { status: "concept" })]);
  const p1 = await laadVoorpagina({ pagina: 1, opslag: o });
  const p2 = await laadVoorpagina({ pagina: 2, opslag: o });
  const p3 = await laadVoorpagina({ pagina: 3, opslag: o });
  assert.equal(p1.uitgelicht?.id, "b00");
  assert.equal(p1.kaarten.length, 12);
  assert.equal(p1.meer, true);
  assert.equal(p2.kaarten.length, 12);
  assert.equal(p2.kaarten[0].id, "b13");
  assert.equal(p2.meer, true);
  assert.equal(p3.kaarten.length, 5);
  assert.equal(p3.meer, false);
  const alle = [p1.uitgelicht!, ...p1.kaarten, ...p2.kaarten, ...p3.kaarten].map((x) => x.id);
  assert.equal(new Set(alle).size, 30);
});

test("filter portemonnee/PEIL: berichten die PEIL raken óf portemonnee true hebben", async () => {
  const o = await vul([b("a", "algemeen"), b("p", "algemeen", { peil: { raakt: [{ id: "x", naam: "X", zekerheid: "groen" as const }], mogelijkGewijzigd: [] } }), b("w", "algemeen", { portemonnee: true })]);
  const r = await laadVoorpagina({ pagina: 1, peil: true, opslag: o });
  assert.deepEqual([r.uitgelicht, ...r.kaarten].map((x) => x!.id).sort(), ["p", "w"]);
});

test("categorieknoppen: alleen categorieën met een bericht in de laatste 30 dagen; faalt de telling, dan alle knoppen (null)", async () => {
  const nu = Date.parse("2026-11-23T12:00:00Z");
  const o = await vul([b("a", "politiek", { gepubliceerdOp: "2026-11-20T10:00:00Z" }), b("b", "merkwaardig", { gepubliceerdOp: "2026-09-01T10:00:00Z" }), b("c", "reizen en verkeer", { gepubliceerdOp: "2026-11-01T10:00:00Z" })]);
  const s = await laadActieveCategorieen(o, nu);
  assert.deepEqual([...s!].sort(), ["politiek", "reizen en verkeer"]);
  o.tellingenSinds = async () => { throw new Error("stuk"); };
  assert.equal(await laadActieveCategorieen(o, nu), null);
  assert.equal(await laadActieveCategorieen(null, nu), null);
});

test("status: gepubliceerdTotaal telt alleen zichtbare berichten, berichtenTotaal alles", async () => {
  const o = await vul([b("a", "algemeen"), b("c", "algemeen", { status: "concept" }), b("g", "algemeen", { status: "geblokkeerd" })]);
  const n = await o.aantallen();
  assert.equal(n.berichtenTotaal, 3);
  assert.equal(n.gepubliceerdTotaal, 1);
  const urls: string[] = [];
  const { SupabaseOpslag } = await import("../lib/motor/opslag");
  const s = new SupabaseOpslag("https://p.supabase.co", "k", (async (u: string) => { urls.push(String(u)); return new Response("[]", { headers: { "content-range": "*/7" } }); }) as unknown as typeof fetch);
  const a = await s.aantallen();
  assert.equal(a.gepubliceerdTotaal, 7);
  assert.ok(urls.some((u) => u.includes("nv_berichten?status=eq.gepubliceerd&redactie=is.null&select=id")));
});

test("verder lezen: eerst dezelfde categorie, dan dezelfde PEIL-parameter, dan de nieuwste; nooit het bericht zelf", async () => {
  const t = (n: number) => new Date(Date.UTC(2026, 10, 23, 12, 0, 59 - n)).toISOString();
  const peilP = { raakt: [{ id: "pens", naam: "Pensioen", zekerheid: "groen" as const }], mogelijkGewijzigd: [] };
  const o = await vul([
    b("zelf", "politiek", { gepubliceerdOp: t(0), peil: peilP }),
    b("cat1", "politiek", { gepubliceerdOp: t(5) }),
    b("peilA", "algemeen", { gepubliceerdOp: t(1), peil: peilP }),
    b("nieuw", "algemeen", { gepubliceerdOp: t(2) }),
    b("peilB", "merkwaardig", { gepubliceerdOp: t(8), peil: peilP }),
    b("andere", "merkwaardig", { gepubliceerdOp: t(9), peil: { raakt: [{ id: "iets", naam: "Iets", zekerheid: "groen" as const }], mogelijkGewijzigd: [] } }),
  ]);
  const r = await laadVerwant({ id: "zelf", categorie: "politiek", peil: peilP }, o);
  assert.deepEqual(r.map((x) => x.id), ["cat1", "peilA", "peilB"], "categorie, dan PEIL-parameter (nieuwste eerst), niet 'nieuw' of zichzelf");
  const zonder = await laadVerwant({ id: "zelf", categorie: "politiek" }, o);
  assert.deepEqual(zonder.map((x) => x.id), ["cat1", "peilA", "nieuw"], "zonder PEIL: de nieuwste andere berichten");
  assert.ok(!zonder.some((x) => x.id === "zelf"));
  const alleen = await laadVerwant({ id: "x", categorie: "algemeen" }, await vul([b("x", "algemeen")]));
  assert.deepEqual(alleen, []);
});
