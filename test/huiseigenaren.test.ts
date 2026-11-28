// Doelgroep eigenaren van een (tweede) woning in Frankrijk (28-11-2026): één lijst (huiseigenaren.ts), voorrang in radar en relevantie, label in de app.
import test from "node:test";
import assert from "node:assert/strict";
import { HUISEIGENAREN_ONDERWERPEN, HUISEIGENAREN_MIN_RELEVANTIE, huiseigenarenRelevantie, raaktHuiseigenaren, huiseigenarenOnderwerpen, tipLabelHuiseigenaren } from "../lib/motor/huiseigenaren";
import { SYSTEEM_SYNTHESE, leesSynthese, synthetiseer } from "../lib/motor/synthese";
import { SYSTEEM_RADAR_SELECTIE, draaiRadar, RADAR_SITEMAP_URL } from "../lib/motor/radar";
import { laadConfig } from "../lib/motor/config";
import { GeheugenOpslag } from "../lib/motor/opslag";
import { item } from "./helpers";
import type { ModelClient } from "../lib/motor/ai";

test("de lijst raakt alle acht onderwerpen, in Frans en in Nederlands, en laat ander nieuws met rust", () => {
  const ja = [
    "taxe foncière verhoogd in 2027", "Grondbelasting stijgt volgend jaar", "Majoration de la taxe d'habitation sur les résidences secondaires", "Woonbelasting voor tweede woningen",
    "Revalorisation des valeurs locatives en 2027", "Kadastrale huurwaarde gaat omhoog", "Nieuw DPE: energielabel bepaalt verhuur", "Verhuurverbod voor woningen met label G uitgesteld",
    "Catastrophe naturelle: arrêté publié", "Natuurramp erkend, verzekering van de woning vergoedt", "TEOM stijgt in veel gemeenten", "Huisvuilbelasting omhoog",
    "Plus-value immobilière: nieuwe vrijstelling", "Vermogenswinst op vastgoed wordt anders belast", "Frais de notaire stijgen door hogere DMTO", "Notariskosten stijgen",
  ];
  for (const t of ja) assert.ok(raaktHuiseigenaren(t), t);
  const nee = ["Staking bij de spoorwegen", "Benzineprijs daalt", "Tour de France route bekend", "Nieuwe regels voor het rijbewijs", "Pensioenleeftijd blijft 64"];
  for (const t of nee) assert.equal(raaktHuiseigenaren(t), false, t);
  assert.equal(HUISEIGENAREN_ONDERWERPEN.length, 8);
  assert.deepEqual(huiseigenarenOnderwerpen("taxe foncière en DPE"), ["taxe foncière (onroerendgoedbelasting)", "DPE, energielabel en verhuurverbod"]);
});

test("relevantie: de kop 'taxe foncière verhoogd in 2027' haalt minRelevantie, ook als het model te laag zat; een irrelevant oordeel (onder 30) blijft staan", () => {
  const min = laadConfig().minRelevantie;
  assert.ok(HUISEIGENAREN_MIN_RELEVANTIE >= min);
  for (const laag of [35, 45, 55]) {
    const s = leesSynthese(JSON.stringify({ publiceren: true, kop: "taxe foncière verhoogd in 2027", samenvatting: "De belasting op woningen stijgt.", tekst: "Tekst.", categorie: "economie en ondernemen", relevantie: laag }));
    assert.ok(s && s.relevantie >= min, `model ${laag} geeft ${s?.relevantie}`);
  }
  assert.equal(huiseigenarenRelevantie(10, "taxe foncière verhoogd in 2027"), 10);
  assert.equal(huiseigenarenRelevantie(85, "taxe foncière"), 85);
  assert.equal(huiseigenarenRelevantie(45, "Staking bij de spoorwegen"), 45, "andere onderwerpen krijgen geen voorrang");
  // publiceren=false (tijdloze uitleg) blijft geen bericht.
  assert.equal(leesSynthese(JSON.stringify({ publiceren: false, kop: "taxe foncière", tekst: "x", relevantie: 50 })), null);
});

test("synthese met een bron: de kop over de taxe foncière haalt minRelevantie via synthetiseer", async () => {
  const c: ModelClient = { async tekst() { return JSON.stringify({ publiceren: true, kop: "Taxe foncière verhoogd in 2027", samenvatting: "De taxe foncière stijgt met de inflatie.", tekst: "De belasting stijgt.\n\nMeer tekst.", categorie: "economie en ondernemen", relevantie: 48 }); } };
  const s = await synthetiseer({ sleutel: "x", items: [item({ regime: "overheid", groep: "overheid", titel: "Taxe foncière : revalorisation des valeurs locatives en 2027" })] }, c);
  assert.ok(s && s.relevantie >= laadConfig().minRelevantie);
});

test("de opdrachten noemen dezelfde lijst (één plek)", () => {
  for (const o of HUISEIGENAREN_ONDERWERPEN) {
    assert.ok(SYSTEEM_SYNTHESE.includes(o.naam), `synthese: ${o.naam}`);
    assert.ok(SYSTEEM_RADAR_SELECTIE.includes(o.naam), `radar: ${o.naam}`);
  }
});

test("radar: titels over deze onderwerpen komen eerst in de selectie, ook als ze laat in de sitemap staan", async () => {
  const nu = Date.now();
  const rij = (n: number, titel: string) => `<url><loc>https://www.connexionfrance.com/n/${n}</loc><news:news><news:publication_date>${new Date(nu - n * 60_000).toISOString()}</news:publication_date><news:title>${titel}</news:title></news:news></url>`;
  const vul = Array.from({ length: 30 }, (_, n) => rij(n + 1, `Bakkerij opent nieuwe winkel nummer ${n}`));
  const xml = `<urlset>${[...vul, rij(40, "Taxe foncière to rise sharply in 2027")].join("")}</urlset>`;
  const f = (async (u: string) => (String(u) === RADAR_SITEMAP_URL ? new Response(xml) : new Response("x", { status: 500 }))) as unknown as typeof fetch;
  let eerste = "";
  const client: ModelClient = { async tekst(a) { if (a.system === SYSTEEM_RADAR_SELECTIE && !eerste) eerste = a.user; return "[]"; } };
  await draaiRadar({ opslag: new GeheugenOpslag(), client, fetchFn: f, nu });
  assert.match(eerste.split("\n")[0], /Taxe foncière/);
});

test("label in de app: alleen een tip over zo'n onderwerp zonder enige bron en zonder bericht", () => {
  const w = "taxe foncière wordt in 2027 fors verhoogd";
  assert.equal(tipLabelHuiseigenaren({ werktitel: w, primaireBron: null, berichtId: null }), true);
  assert.equal(tipLabelHuiseigenaren({ werktitel: w, primaireBron: [], persBronnen: [], berichtId: null }), true);
  assert.equal(tipLabelHuiseigenaren({ werktitel: w, primaireBron: [{ url: "https://x" }], berichtId: null }), false);
  assert.equal(tipLabelHuiseigenaren({ werktitel: w, primaireBron: null, persBronnen: [{ url: "https://x" }], berichtId: null }), false);
  assert.equal(tipLabelHuiseigenaren({ werktitel: w, primaireBron: null, berichtId: "abc" }), false);
  assert.equal(tipLabelHuiseigenaren({ werktitel: "staking bij de spoorwegen", primaireBron: null, berichtId: null }), false);
});
