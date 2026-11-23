// De zeef vóór clustering: sport, pure misdaad (faits divers) en buitenlands
// nieuws zonder band met Frankrijk. Herschreven naar het model van de persketen
// in nlfr-menu (alleen gelezen); lijsten zijn compact gehouden.
import { normaliseer, bevatWoord } from "./tekst";
import type { Bron } from "./types";

const SPORT_UIT = [
  "eredivisie", "knvb", "jupiler pro league", "football", "ligue 1", "ligue 2", "ligue des champions", "champions league",
  "europa league", "mercato", "coupe du monde", "ballon d'or", "selectionneur", "les bleus", "buteur", "match amical",
  "olympique de marseille", "olympique lyonnais", "paris sg", "psg", "gardien de but", "voetbal", "wedstrijd", "transfer",
  "tour de france", "etape du tour", "maillot jaune", "peloton", "cyclisme", "wielren", "paris-roubaix", "vuelta", "contre-la-montre",
  "roland-garros", "roland garros", "wimbledon", "open d'australie", "tournoi atp", "tournoi wta", "tennis",
  "rugby", "top 14", "xv de france", "six nations", "athletisme", "atletiek", "semi-marathon",
  "formule 1", "formula 1", "grand prix", "motogp", "24 heures du mans", "jeux olympiques", "olympische spelen", "paralympi",
];
// Praktische gevolgen voor de lezer: dan blijft een sportkop staan.
const SPORT_INCIDENT_IN = [
  "bousculade", "mouvement de foule", "effondrement", "hooligan", "affrontement", "emeute", "envahissement", "tribune",
  "circulation", "barree", "deviation", "stationnement", "fermeture", "perturbations", "wegafsluiting", "afgesloten", "greve", "vigilance",
];
// Pure misdaad: weg, tenzij de kop ook een insluitterm bevat.
const FAITS_UIT = [
  "viol", "meurtre", "meurtrier", "cadavre", "poignarde", "agression", "garde a vue", "drogue", "cocaine", "cannabis",
  "stupefiant", "cambriolage", "interpelle", "homicide", "feminicide", "fusillade", "braquage", "overdose", "pedophil",
  "coups de couteau", "sequestration", "enlevement", "assassinat", "par balle", "reglement de compte", "narcotrafic", "rixe",
  "noyade", "corps sans vie", "retrouve mort", "verkrachting", "moord", "doodgestoken", "neergestoken", "inbraak", "aangehouden",
];
const FAITS_IN = [
  "gouvernement", "ministre", "loi ", "decret", "impot", "taxe", "retraite", "sante", "assurance", "euro", "prix", "greve",
  "incendie", "tempete", "inondation", "canicule", "meteo", "vigilance", "rappel", "fraude", "arnaque", "regering", "wet ",
  "belasting", "pensioen", "stakingen", "brand", "storm", "overstroming", "hittegolf", "waarschuwing", "terugroep", "oplichting",
  "toerist", "touris", "vakantie", "verkeer", "trafic", "autoroute", "snelweg", "tgv", "sncf", "aeroport", "luchthaven",
];
// Buitenlands nieuws zonder Frankrijk-band.
const BUITENLAND = [
  "etats-unis", "trump", "israel", "gaza", "hamas", "ukraine", "russie", "poutine", "chine", "taiwan", "iran", "syrie",
  "venezuela", "bresil", "inde ", "pakistan", "afghanistan", "soudan", "ceuta", "oekraine", "rusland", "verenigde staten", "midden-oosten",
];
export const FRANKRIJK_WOORDEN = [
  "frankrijk", "frans", "franse", "fransen", "france", "francais", "francaise", "paris", "parijs", "macron", "elysee",
  "matignon", "assemblee nationale", "senat", "marseille", "lyon", "toulouse", "bordeaux", "nantes", "nice", "lille", "strasbourg",
  "montpellier", "rennes", "provence", "bretagne", "normandie", "occitanie", "dordogne", "bourgogne", "alsace", "corse", "corsica",
  "cote d'azur", "dom-tom", "sncf", "tgv", "urssaf", "caf ", "cpam", "dgfip", "service-public", "bercy", "gouv.fr", "hexagone",
];

function bevat(n: string, lijst: string[]): boolean {
  return lijst.some((w) => (w.endsWith(" ") ? n.includes(w) : w.length <= 5 ? bevatWoord(n, w) : n.includes(w)));
}

export function gaatOverFrankrijk(tekst: string): boolean {
  const n = ` ${normaliseer(tekst)} `;
  return FRANKRIJK_WOORDEN.some((w) => (w.endsWith(" ") ? n.includes(` ${w}`) : bevatWoord(n, w) || (w.length >= 7 && n.includes(w))));
}

export function sportDoorlaat(titel: string): boolean {
  const n = normaliseer(titel);
  if (!bevat(n, SPORT_UIT)) return true;
  return bevat(n, SPORT_INCIDENT_IN);
}

export function faitsDiversDoorlaat(titel: string): boolean {
  const n = normaliseer(titel);
  if (bevat(n, FAITS_IN)) return true;
  return !bevat(n, FAITS_UIT);
}

export function buitenlandDoorlaat(titel: string): boolean {
  const n = normaliseer(titel);
  if (!bevat(n, BUITENLAND)) return true;
  return gaatOverFrankrijk(titel);
}

export interface ZeefUitslag {
  door: boolean;
  reden?: "sport" | "faits_divers" | "buitenland" | "geen_frankrijk";
}

/** Zeef voor één item. Overheid: alleen sport weg; pers: alles. */
export function zeef(item: { titel: string; samenvatting?: string }, bron: Pick<Bron, "regime" | "frankrijkFilter">): ZeefUitslag {
  const t = item.titel;
  if (!sportDoorlaat(t)) return { door: false, reden: "sport" };
  if (bron.regime === "overheid") return { door: true };
  if (!faitsDiversDoorlaat(t)) return { door: false, reden: "faits_divers" };
  if (!buitenlandDoorlaat(t)) return { door: false, reden: "buitenland" };
  if (bron.frankrijkFilter && !gaatOverFrankrijk(`${t} ${item.samenvatting || ""}`)) return { door: false, reden: "geen_frankrijk" };
  return { door: true };
}
