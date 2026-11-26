import test from "node:test";
import assert from "node:assert/strict";
import { kiesKandidaten, verwachteRelevantie } from "../lib/motor/kandidaten";
import { draaiOogst } from "../lib/motor/motor";
import { GeheugenOpslag } from "../lib/motor/opslag";
import { laadConfig } from "../lib/motor/config";
import { bron, item, klein, rss } from "./helpers";
import type { Cluster } from "../lib/motor/types";

const nu = Date.now();
const cl = (titel: string, bronnen: number, samenvatting = "", datum = new Date(nu - 3600_000).toISOString()): Cluster => ({
  sleutel: titel,
  items: Array.from({ length: bronnen }, (_, n) => item({ url: `https://x.test/${encodeURIComponent(titel)}/${n}`, bronId: `b${n}`, titel, samenvatting, gepubliceerdOp: datum })),
});

test("verwachte relevantie: gevolg voor de portemonnee scoort hoger dan landelijke politiek", () => {
  const prijs = verwachteRelevantie(cl("Hausse du prix du carburant et de l'électricité", 2));
  const politiek = verwachteRelevantie(cl("Motion de censure: l'Assemblée nationale vote, le gouvernement et le parti sondage", 6));
  assert.ok(prijs > politiek, `${prijs} > ${politiek}`);
});

test("kiesKandidaten: volgorde op verwachte relevantie, niet meer op aantal bronnen; afgekapt op max en ruimte", () => {
  const politiek = cl("Motion de censure à l'Assemblée nationale, le gouvernement sous pression", 7);
  const prijs = cl("Le prix de l'électricité augmente, nouvelle facture pour les ménages", 2);
  const gewoon = cl("Fête du village à Sarlat", 3);
  const lijst = kiesKandidaten([politiek, gewoon, prijs], 10, 20);
  assert.equal(lijst[0], prijs);
  assert.equal(lijst[2], politiek);
  assert.equal(kiesKandidaten([politiek, gewoon, prijs], 2, 20).length, 2);
  assert.equal(kiesKandidaten([politiek, gewoon, prijs], 10, 1).length, 1);
  assert.equal(kiesKandidaten([politiek, gewoon, prijs], 10, 0).length, 0);
});

test("kiesKandidaten: bij gelijke verwachting eerst meer bronnen, dan nieuwste", () => {
  const a = cl("Fête A à Sarlat", 2, "", new Date(nu - 5 * 3600_000).toISOString());
  const b = cl("Fête B à Sarlat", 2, "", new Date(nu - 1 * 3600_000).toISOString());
  const c = cl("Fête C à Sarlat", 3);
  assert.deepEqual(kiesKandidaten([a, b, c], 3, 3).map((x) => x.sleutel), ["Fête C à Sarlat", "Fête B à Sarlat", "Fête A à Sarlat"]);
});

test("configuratie: plafond per run is 10, de dagbovengrens en de drempels zijn ongewijzigd", () => {
  const c = laadConfig();
  assert.equal(c.maxSynthesesPerRun, 10);
  assert.equal(c.maxBerichtenPerDag, 20);
  assert.equal(c.publiceerDrempel, 55);
  assert.equal(c.minRelevantie, 60);
});

// ---- Tijdbudget in de motor ----------------------------------------------------------
const tekst = "De afvalophaal in Marseille ligt sinds maandag stil door een staking van de vuilnismensen. Op straat stapelen de zakken zich op en het gemeentebestuur zoekt naar een oplossing met de vakbonden. Bewoners en toeristen in de havenstad merken het vooral in de drukke wijken bij de haven, waar de hoeveelheid afval snel toeneemt. Wie er verblijft, kan het best de aanwijzingen van de gemeente volgen.";
const synthese = JSON.stringify({ publiceren: true, kop: "Staking vuilnisophaal legt Marseille lam", samenvatting: "De vuilnisophaal in Marseille ligt stil door een staking en de afvalbergen groeien snel.", tekst, categorie: "algemeen", relevantie: 80 });

function feeds(aantal: number) {
  const onderwerpen = ["marseille éboueurs grève ordures", "carburant prix essence hausse station", "inondation vigilance rouge Gard pluie", "retraite réforme pension calcul trimestres", "sncf tgv retard grève cheminots", "canicule chaleur vigilance orange départements", "fraude arnaque téléphone démarchage", "aéroport grève contrôleurs vols annulés", "logement loyer encadrement Paris hausse", "électricité tarif réglementé facture hiver"];
  const a = rss(onderwerpen.slice(0, aantal).map((t, n) => ({ titel: t + " à la une", url: `https://a.test/${n}`, datum: new Date(nu - 3600_000), omschrijving: t })));
  const b = rss(onderwerpen.slice(0, aantal).map((t, n) => ({ titel: t + " en direct", url: `https://b.test/${n}`, datum: new Date(nu - 2 * 3600_000), omschrijving: t })));
  return (async (u: string) => (String(u).includes("a.test") ? new Response(a) : String(u).includes("b.test") ? new Response(b) : new Response("x", { status: 500 }))) as unknown as typeof fetch;
}
const bronnen = [bron({ id: "a", naam: "Krant A", feed: "https://a.test/feed" }), bron({ id: "b", naam: "Krant B", feed: "https://b.test/feed" })];

test("motor: tot 10 kandidaten per run worden geschreven", async () => {
  const opslag = new GeheugenOpslag();
  const client = klein([(a) => (a.system.includes("groepeert") ? '{"groepen":[]}' : synthese)]);
  const r = await draaiOogst({ opslag, client, nu, config: laadConfig(), bronnen, fetchFn: feeds(10), peil: [], generator: null });
  assert.equal(r.aantallen.clustersGenoegBronnen, 10);
  assert.equal(r.aantallen.kandidaten, 10);
});

test("motor: een opgebruikt tijdbudget breekt de kandidatenlus netjes af; rest blijft open voor de volgende run", async () => {
  const opslag = new GeheugenOpslag();
  const client = klein([(a) => (a.system.includes("groepeert") ? '{"groepen":[]}' : synthese)]);
  const r = await draaiOogst({ opslag, client, nu, config: laadConfig(), bronnen, fetchFn: feeds(4), peil: [], generator: null, kandidaatBudgetMs: 0 });
  assert.equal(r.aantallen.kandidaten, 4);
  assert.equal(r.aantallen.kandidatenTijdOvergeslagen, 4);
  assert.equal(r.berichten.length, 0);
  assert.ok([...opslag.items.values()].every((i) => !i.verwerkt), "niets als verwerkt gemarkeerd");
  assert.ok(r.stappen.every((s) => s.ok), "geen foutstap");
});
