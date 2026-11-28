import test from "node:test";
import assert from "node:assert/strict";
import { draaiOogst, clusterUitBericht } from "../lib/motor/motor";
import { GeheugenOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import { laadConfig, REGELVERSIE } from "../lib/motor/config";
import { klein } from "./helpers";

const nu = Date.now();
const cfg = laadConfig();
const alinea = "De afvalophaal in Marseille ligt sinds maandag stil door een staking van de vuilnismensen en op straat stapelen de zakken zich op in de drukke wijken bij de haven. ";
const tekst = alinea.repeat(3).trim() + "\n\n" + alinea.trim();
const nieuw = (o: object = {}) => JSON.stringify({ publiceren: true, kop: "Vuilnisstaking legt Marseille lam", samenvatting: "De vuilnisophaal in Marseille ligt stil door een staking en de afvalbergen groeien snel.", tekst, categorie: "algemeen", relevantie: 80, portemonnee: false, ...o });
const oud = (id: string, o: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht => ({
  id, kop: `Oude kop ${id}`, samenvatting: "oud", tekst: "volgens de bronnen kort", categorie: "politiek", score: 70, regime: "pers", status: "gepubliceerd", blokkadeRedenen: [],
  beeldUrl: "https://images.unsplash.com/foto-" + id, beeldCredit: null, peil: { raakt: [], mogelijkGewijzigd: [] }, portemonnee: false, regelversie: 1,
  bronnen: [
    { naam: "Krant A", origineleKop: "Grève des éboueurs à Marseille", datum: new Date(nu - 3600_000).toISOString(), url: `https://a.test/${id}` },
    { naam: "Krant B", origineleKop: "Marseille: les ordures s'entassent", datum: new Date(nu - 7200_000).toISOString(), url: `https://b.test/${id}` },
  ],
  gepubliceerdOp: new Date(nu - 5 * 3600_000).toISOString(), ...o,
});
const geenWeb = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
const draai = (opslag: GeheugenOpslag, client: ReturnType<typeof klein>, fetchFn = geenWeb) => draaiOogst({ opslag, client, nu, config: cfg, bronnen: [], fetchFn, peil: [], generator: null });
const zet = async (o: GeheugenOpslag, b: OpgeslagenBericht) => { o.berichtenLijst.push(b); };

test("herschrijven: oud bericht krijgt nieuwe tekst, regelversie 2, zelfde id en foto; artikeltekst wordt opnieuw opgehaald", async () => {
  const opslag = new GeheugenOpslag();
  await zet(opslag, oud("m1"));
  const html = "<article><p>Les éboueurs marseillais ont cessé le travail lundi matin pour réclamer de meilleures conditions, et les sacs-poubelle s'amoncellent dans plusieurs quartiers de la ville portuaire.</p></article>";
  const opgehaald: string[] = [];
  const fetchFn = (async (u: string) => (opgehaald.push(String(u)), new Response(html, { headers: { "content-type": "text/html" } }))) as unknown as typeof fetch;
  const client = klein([(a) => (a.system.includes("groepeert") ? '{"groepen":[]}' : nieuw({ portemonnee: true }))]);
  const r = await draai(opslag, client, fetchFn);
  const b = opslag.berichtenLijst[0];
  assert.equal(b.id, "m1");
  assert.equal(b.kop, "Vuilnisstaking legt Marseille lam");
  assert.equal(b.categorie, "algemeen");
  assert.equal(b.portemonnee, true);
  assert.equal(b.status, "gepubliceerd", b.blokkadeRedenen.join(";"));
  assert.equal(b.regelversie, REGELVERSIE);
  assert.equal(b.beeldUrl, "https://images.unsplash.com/foto-m1", "foto blijft");
  assert.equal(b.bronnen.length, 2);
  assert.ok(opgehaald.includes("https://a.test/m1") && opgehaald.includes("https://b.test/m1"));
  const aanroep = client.aanroepen.find((c) => c.system.includes("eindredacteur"))!;
  assert.match(aanroep.user, /Grève des éboueurs à Marseille/);
  assert.ok(!aanroep.user.split("Namen die u in de openingszin mag noemen")[0].includes("Krant A"), "bronnen blijven geanonimiseerd");
  assert.equal(r.aantallen.herschreven, 1);
  // tweede run: niets meer te doen
  const client2 = klein([nieuw()]);
  await draai(opslag, client2);
  assert.equal(client2.aanroepen.length, 0);
});

test("herschrijven: hooguit 3 per run, alleen laatste 48 uur, alleen gepubliceerd en lagere regelversie; nieuwe berichten hebben regelversie 2", async () => {
  const opslag = new GeheugenOpslag();
  for (const id of ["a", "b", "c", "d"]) await zet(opslag, oud(id, { gepubliceerdOp: new Date(nu - (Number(id.charCodeAt(0) - 96)) * 3600_000).toISOString() }));
  await zet(opslag, oud("te-oud", { gepubliceerdOp: new Date(nu - 60 * 3600_000).toISOString() }));
  await zet(opslag, oud("al-v2", { regelversie: 2 }));
  await zet(opslag, oud("concept", { status: "concept" }));
  const r = await draai(opslag, klein([(a) => (a.system.includes("groepeert") ? '{"groepen":[]}' : nieuw())]));
  const versie = (id: string) => opslag.berichtenLijst.find((x) => x.id === id)!.regelversie;
  assert.deepEqual(["a", "b", "c"].map(versie), [2, 2, 2]);
  assert.equal(versie("d"), 1, "de vierde wacht tot de volgende run");
  assert.equal(versie("te-oud"), 1);
  assert.equal(versie("concept"), 1);
  assert.equal(r.aantallen.herschreven, 3);
  assert.equal((await opslag.teHerschrijven(new Date(nu - 48 * 3600_000).toISOString(), REGELVERSIE, 10)).length, 1);
});

test("herschrijven: poort faalt na herkansing, publiceren=false of lage relevantie geven status concept (niet verwijderd)", async () => {
  const opslag = new GeheugenOpslag();
  for (const id of ["poort", "nee", "laag"]) await zet(opslag, oud(id));
  const run = async (id: string, antwoord: string) => {
    const o = new GeheugenOpslag();
    await zet(o, oud(id));
    await draai(o, klein([(a) => (a.system.includes("groepeert") ? '{"groepen":[]}' : antwoord)]));
    return o.berichtenLijst[0];
  };
  const slecht = await run("poort", nieuw({ tekst: "Kort. volgens de bronnen" }));
  assert.equal(slecht.status, "concept");
  assert.ok(slecht.blokkadeRedenen.length > 0);
  assert.equal(slecht.regelversie, REGELVERSIE, "geen eindeloze herkansing");
  const nee = await run("nee", JSON.stringify({ publiceren: false }));
  assert.equal(nee.status, "concept");
  assert.match(nee.blokkadeRedenen[0], /publiceren=false/);
  assert.equal(nee.kop, "Oude kop nee", "tekst blijft staan, bericht niet verwijderd");
  const laag = await run("laag", nieuw({ relevantie: 40 }));
  assert.equal(laag.status, "concept");
  assert.match(laag.blokkadeRedenen[0], /relevantie 40/);
  assert.equal(laag.kop, "Vuilnisstaking legt Marseille lam");
});

test("herschrijven: een modelfout laat het bericht staan voor de volgende run; zonder model geen herschrijven", async () => {
  const opslag = new GeheugenOpslag();
  await zet(opslag, oud("f"));
  const stuk = { tekst: async () => { throw new Error("overbelast"); } };
  const r = await draaiOogst({ opslag, client: stuk, nu, config: cfg, bronnen: [], fetchFn: geenWeb, peil: [], generator: null });
  assert.equal(opslag.berichtenLijst[0].regelversie, 1);
  assert.equal(opslag.berichtenLijst[0].status, "gepubliceerd");
  assert.equal(r.aantallen.herschrijfMislukt, 1);
  const r2 = await draaiOogst({ opslag, client: null, nu, config: cfg, bronnen: [], fetchFn: geenWeb, peil: [], generator: null });
  assert.ok(!r2.stappen.some((s) => s.stap === "herschrijven"));
});

test("clusterUitBericht: bronnen worden items met naam, originele kop, url en datum", () => {
  const c = clusterUitBericht(oud("z"));
  assert.equal(c.items.length, 2);
  assert.equal(c.items[0].titel, "Grève des éboueurs à Marseille");
  assert.equal(c.items[0].url, "https://a.test/z");
});
