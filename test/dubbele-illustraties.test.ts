// Geen dubbele illustratie op de eerste pagina (besluit 28-11-2026): de 13 nieuwste zichtbare berichten sluiten hun beeld
// uit bij een nieuwe keuze (harde uitsluiting); stap 6b herkiest bestaande dubbelen, handmatige keuzes blijven staan.
import test from "node:test";
import assert from "node:assert/strict";
import { ILLUSTRATIES, kiesIllustratie, modelKandidaten, dubbeleBeelden, pad, HARDE_UITSLUITING, type IllustratieLijst } from "../lib/motor/illustraties";
import { draaiOogst } from "../lib/motor/motor";
import { GeheugenOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import { laadConfig } from "../lib/motor/config";
import type { BeeldCredit } from "../lib/motor/types";

const KOPPEN: [string, string][] = [
  ["Sarkozy, Bruni en Marchand in 2027 voor de rechter", "politiek"],
  ["Macron reist naar China voor staatsbezoek", "politiek"],
  ["Cyberaanval treft Frans persbureau, platform voor foto's en video's offline", "algemeen"],
  ["Gestrand vrachtschip bij Lit-et-Mixe moet dinsdag vlot worden getrokken", "natuur en rampen"],
  ["Nederlanders in Frankrijk moeten pensioenbrief uit twee landen controleren", "economie en ondernemen"],
  ["Nederlandse kampeerders met caravan vast op de A7", "reizen en verkeer"],
  ["Nederlanders vieren Koningsdag op een terras in de Dordogne", "merkwaardig"],
  ["VN-organisaties waarschuwen voor toenemende honger in 16 regio's door oorlog en El Niño", "algemeen"],
  ["Staking bij SNCF legt treinverkeer plat", "reizen en verkeer"],
  ["Tol op de snelweg wordt duurder", "reizen en verkeer"],
  ["Storm treft de kust van Bretagne", "natuur en rampen"],
  ["Nieuwe regels voor huurders van tweede woningen", "economie en ondernemen"],
  ["Prijs van brandstof stijgt opnieuw", "economie en ondernemen"],
  ["Pensioenen worden verhoogd in januari", "economie en ondernemen"],
  ["Weer een staking bij SNCF legt treinverkeer plat", "reizen en verkeer"],
  ["Nog een staking bij SNCF legt treinverkeer plat", "reizen en verkeer"],
];

test("echte koppen achter elkaar: in elk venster van 13 opeenvolgende berichten staat geen beeld dubbel (ook bij bijna gelijke koppen)", () => {
  const recent: string[] = []; // nieuwste eerst, zoals de motor ze bijhoudt
  const gekozen: string[] = [];
  for (let ronde = 0; ronde < 3; ronde++) {
    for (const [kop, categorie] of KOPPEN) {
      const i = kiesIllustratie({ kop, samenvatting: "", categorie }, recent);
      assert.ok(i, kop);
      gekozen.push(i!.svg);
      recent.unshift(`https://nieuws.infofrankrijk.com${i!.svg}`);
    }
  }
  for (let n = 0; n + HARDE_UITSLUITING <= gekozen.length; n++) {
    const venster = gekozen.slice(n, n + HARDE_UITSLUITING);
    assert.equal(new Set(venster).size, venster.length, `venster vanaf ${n} heeft een dubbel beeld`);
  }
});

test("harde uitsluiting: precies de eerste 13 van recent; het 14e beeld en daarna mogen weer (voorkeur langst niet gebruikt)", () => {
  const kop = { kop: "Staking bij SNCF legt treinverkeer plat", samenvatting: "", categorie: "reizen en verkeer" };
  const top = kiesIllustratie(kop, [])!;
  const u = (p: string) => `https://nieuws.infofrankrijk.com${p}`;
  const vul = Array.from({ length: 12 }, (_, n) => u(`/illustraties/vulling-${n}.svg`));
  // Op plaats 13 (index 12) staat het beste beeld: uitgesloten.
  assert.notEqual(kiesIllustratie(kop, [...vul, u(top.svg)])?.id, top.id);
  // Op plaats 14 (index 13): weer toegestaan.
  assert.equal(kiesIllustratie(kop, [...vul, u("/illustraties/vulling-x.svg"), u(top.svg)])?.id, top.id);
  // Ook de modelkandidaten bevatten het uitgesloten beeld niet.
  assert.ok(!modelKandidaten(kop, [...vul, u(top.svg)]).some((i) => i.id === top.id));
  assert.ok(modelKandidaten(kop, []).some((i) => i.id === top.id));
});

test("is alles uitgesloten (heel kleine set), dan vervalt de uitsluiting: liever een herhaling dan geen beeld", () => {
  const l: IllustratieLijst = { afkomst: "x", beelden: [{ id: "a", categorie: "algemeen", naam: "a", binding: "fr", trefwoorden: [], svg: "/illustraties/a.svg", png: "/illustraties/a.png" }] };
  assert.equal(kiesIllustratie({ kop: "x", samenvatting: "", categorie: "algemeen" }, ["https://x.test/illustraties/a.svg"], l)?.id, "a");
});

test("de echte set is groot genoeg voor 13 verschillende beelden per categorie-mix", () => {
  assert.ok(ILLUSTRATIES.beelden.length > 2 * HARDE_UITSLUITING);
});

// ---- bestaande dubbelen ---------------------------------------------------------------------------------
const cred = (keuze?: BeeldCredit["keuze"]): BeeldCredit => ({ bron: "Illustratie", maker: "Communities Abroad", naam: "oud", ...(keuze ? { keuze } : {}) });
let teller = 0;
const bericht = (id: string, beeld: string, credit: BeeldCredit | null, minutenGeleden: number, extra: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht => ({
  id, soort: "pers", kop: "Staking bij SNCF legt treinverkeer plat", samenvatting: "Treinen rijden niet.", tekst: "t", categorie: "reizen en verkeer", score: 80, regime: "pers", status: "gepubliceerd",
  blokkadeRedenen: [], portemonnee: false, signaal: null, signaalBeoordeeld: true, beeldUrl: beeld ? `https://nieuws.infofrankrijk.com/illustraties/${beeld}.svg` : null, beeldCredit: credit,
  peil: { raakt: [], mogelijkGewijzigd: [] }, bronnen: [], gepubliceerdOp: new Date(Date.now() - minutenGeleden * 60_000 - teller++).toISOString(), regelversie: 2, ...extra,
} as OpgeslagenBericht);

test("dubbeleBeelden: het oudere bericht van een paar, tenzij handmatig; foto's tellen niet", () => {
  const nieuw = bericht("nieuw", "x", cred("model"), 1);
  const oud = bericht("oud", "x", cred("model"), 5);
  assert.deepEqual(dubbeleBeelden([nieuw, oud]).map((b) => b.id), ["oud"]);
  const oudHand = bericht("oud", "x", cred("redactie"), 5);
  assert.deepEqual(dubbeleBeelden([nieuw, oudHand]).map((b) => b.id), ["nieuw"], "handmatig oud blijft, het nieuwere wijkt");
  const nieuwGetekend = bericht("nieuw", "x", cred("getekend"), 1);
  assert.deepEqual(dubbeleBeelden([nieuwGetekend, oudHand]), []);
  const foto = bericht("f", "x", { bron: "Unsplash", maker: "M" }, 6);
  assert.deepEqual(dubbeleBeelden([nieuw, foto]), []);
  assert.equal(pad("https://a.test/x.svg?w=1"), "/x.svg");
});

test("stap 6b herkiest een bestaand dubbel op de voorpagina; handmatige keuzes en andere beelden blijven", async () => {
  const opslag = new GeheugenOpslag();
  opslag.berichtenLijst.push(
    bericht("a", "algemeen-apotheek-fr", cred("model"), 1),
    bericht("b", "algemeen-apotheek-fr", cred("model"), 2), // dubbel van a: dit oudere bericht wordt herkozen
    bericht("c", "algemeen-arc-de-triomphe-fr", cred("redactie"), 3),
    bericht("d", "algemeen-arc-de-triomphe-fr", cred("redactie"), 4), // handmatig dubbel: blijft
  );
  const geenWeb = (async () => { throw new Error("geen web"); }) as unknown as typeof fetch;
  const r = await draaiOogst({ opslag, client: { async tekst() { return "{}"; } }, config: laadConfig(), bronnen: [], fetchFn: geenWeb, peil: [], generator: null });
  const per = (id: string) => opslag.berichtenLijst.find((x) => x.id === id)!;
  assert.equal(per("a").beeldUrl, "https://nieuws.infofrankrijk.com/illustraties/algemeen-apotheek-fr.svg");
  assert.notEqual(pad(per("b").beeldUrl!), "/illustraties/algemeen-apotheek-fr.svg");
  assert.equal(per("c").beeldUrl, "https://nieuws.infofrankrijk.com/illustraties/algemeen-arc-de-triomphe-fr.svg");
  assert.equal(per("d").beeldUrl, "https://nieuws.infofrankrijk.com/illustraties/algemeen-arc-de-triomphe-fr.svg");
  assert.equal(per("c").beeldCredit?.keuze, "redactie");
  assert.equal(r.aantallen.beeldDubbelHersteld, 1);
  const urls = (await opslag.berichten({ limiet: 13 })).map((x) => pad(x.beeldUrl!));
  assert.equal(new Set(urls).size - 1, 2, "alleen het handmatige paar blijft dubbel");
});

test("recenteBeeldUrls telt berichten met redactie weg niet mee", async () => {
  const opslag = new GeheugenOpslag();
  opslag.berichtenLijst.push(bericht("a", "een", cred("model"), 1), bericht("w", "twee", cred("model"), 2, { redactie: "weg" }));
  assert.deepEqual(await opslag.recenteBeeldUrls(10), ["https://nieuws.infofrankrijk.com/illustraties/een.svg"]);
});
