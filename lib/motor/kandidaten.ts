// Kandidaatkeuze (besluit 26-11-2026): per run meer bruikbare kandidaten schrijven, en de volgorde op
// verwachte relevantie in plaats van alleen op het aantal bronnen. Het aantal bronnen bleek een slechte
// voorspeller: clusters met veel bronnen zijn vaak landelijke politiek, die het model bewust laag zet
// (docs/drempelanalyse.md). De drempels en de poort veranderen hierdoor niet.
import { normaliseer } from "./tekst";
import { aantalBronnen } from "./cluster";
import type { Cluster } from "./types";

/** Financieel of praktisch gevolg voor een lezer in Frankrijk: dit voorspelt een hoge relevantie. */
const GEVOLG = [
  "prix", "tarif", "impot", "taxe", "retraite", "pension", "allocation", "aide", "prime", "remboursement", "assurance", "mutuelle", "sante",
  "loyer", "logement", "carburant", "essence", "gazole", "electricite", "gaz ", "energie", "facture", "cotisation", "urssaf", "caf ", "cpam",
  "permis", "passeport", "visa", "douane", "frontiere", "greve", "sncf", "tgv", "aeroport", "autoroute", "peage", "vigilance", "canicule",
  "tempete", "inondation", "incendie", "rappel", "arnaque", "fraude", "euro", "pouvoir d'achat", "smic", "salaire",
  "prijs", "tarief", "belasting", "pensioen", "uitkering", "premie", "zorgverzekering", "huur", "woning", "brandstof", "energie", "factuur",
  "rijbewijs", "paspoort", "grens", "staking", "luchthaven", "snelweg", "tol", "hittegolf", "storm", "overstroming", "terugroep", "oplichting",
  "inkomen", "minimumloon", "salaris", "toerist", "vakantie", "verkeer",
];
/** Landelijke politiek en lokale affaires: het model zet die bewust laag; ze krijgen geen voorrang meer op hun bronnental. */
const POLITIEK = [
  "assemblee nationale", "motion de censure", "49.3", "remaniement", "election", "elections", "sondage", "candidat", "presidentielle", "legislative",
  "municipale", "parti", "rassemblement national", "insoumise", "les republicains", "premier ministre", "gouvernement", "depute", "senateur",
  "verkiezing", "peiling", "kandidaat", "regering", "premier", "kamerlid", "senator", "partij",
  "mis en examen", "proces", "tribunal", "condamne", "affaire", "rechtbank", "veroordeeld", "aanklacht", "onderzoek naar",
];

function bevatTerm(n: string, w: string): boolean {
  return w.endsWith(" ") ? n.includes(` ${w}`) : n.includes(w);
}

/**
 * Verwachte relevantie 0..100 van een cluster, uit titel en omschrijving (zonder model).
 * Bewust een eenvoudige heuristiek: ze bepaalt alleen de VOLGORDE waarin kandidaten aan bod komen;
 * het modeloordeel en de drempels beslissen daarna over publicatie.
 */
export function verwachteRelevantie(c: Cluster): number {
  const n = ` ${c.items.map((i) => normaliseer(`${i.titel} ${i.samenvatting}`)).join(" | ")} `;
  const gevolg = new Set(GEVOLG.filter((w) => bevatTerm(n, w))).size;
  const politiek = new Set(POLITIEK.filter((w) => bevatTerm(n, w))).size;
  const overheid = c.items.every((i) => i.regime === "overheid");
  const bronnen = aantalBronnen(c);
  let s = 40;
  s += Math.min(3, gevolg) * 14;
  s -= Math.min(3, politiek) * 10;
  if (overheid) s += 10;
  // Twee tot drie bronnen is genoeg om te vertrouwen; veel bronnen wijst op landelijke ophef, niet op nut.
  s += bronnen >= 2 && bronnen <= 3 ? 5 : 0;
  return Math.max(0, Math.min(100, s));
}

/**
 * Kies de kandidaten: volgorde op verwachte relevantie (hoogste eerst), dan aantal bronnen, dan nieuwste.
 * Afgekapt op `max` en de ruimte die vandaag nog over is.
 */
export function kiesKandidaten(clusters: Cluster[], max: number, ruimte: number, voorrang?: ReadonlySet<string>): Cluster[] {
  const nieuwste = (c: Cluster) => c.items.reduce((m, i) => (i.gepubliceerdOp > m ? i.gepubliceerdOp : m), "");
  // Radar (28-11-2026): een overheidsonderwerp dat bij een radarsignaal past gaat voor. Alleen een cluster dat volledig uit
  // overheidsbronnen bestaat telt; de volgorde is het enige dat verandert (bronnen, synthese en poort blijven gelijk).
  const eerst = (c: Cluster) => (voorrang && voorrang.size && c.items.length > 0 && c.items.every((i) => i.regime === "overheid") && c.items.some((i) => voorrang.has(i.url)) ? 1 : 0);
  const rij = clusters.map((c) => ({ c, v: verwachteRelevantie(c), r: eerst(c) }));
  rij.sort((a, b) => b.r - a.r || b.v - a.v || aantalBronnen(b.c) - aantalBronnen(a.c) || nieuwste(b.c).localeCompare(nieuwste(a.c)));
  return rij.slice(0, Math.max(0, Math.min(max, ruimte))).map((x) => x.c);
}
