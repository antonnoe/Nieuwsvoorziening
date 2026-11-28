// Doelgroep eigenaren van een (tweede) woning in Frankrijk (besluit opdrachtgever 28-11-2026). De lijst met onderwerpen die deze lezers
// financieel raken staat HIER en nergens anders; de radarselectie, de synthese-opdracht, de relevantiescore en het label in de redactie-app
// gebruiken allemaal deze lijst. Nieuwe onderwerpen: hier toevoegen, met een test in test/huiseigenaren.test.ts.
import { normaliseer } from "./tekst";

export interface HuiseigenarenOnderwerp {
  /** Naam in gewone taal (voor de opdrachten en de tests). */
  naam: string;
  /** Patroon op genormaliseerde tekst (kleine letters, zonder accenten); Frans en Nederlands. */
  patroon: RegExp;
}

export const HUISEIGENAREN_ONDERWERPEN: HuiseigenarenOnderwerp[] = [
  { naam: "taxe foncière (onroerendgoedbelasting)", patroon: /\btaxe fonciere\b|\bgrondbelasting\b|\bonroerendgoedbelasting\b|\bonroerende zaakbelasting\b|\bfoncier bati\b/ },
  { naam: "taxe d'habitation op tweede woningen en de majoration", patroon: /\btaxe d.habitation\b|\bwoonbelasting\b|\bmajoration\b.*\bresidences? secondaires?\b|\bresidences? secondaires?\b.*\bmajoration\b|\bopslag\b.*\btweede (?:woning|huis)\b/ },
  { naam: "valeurs locatives (kadastrale huurwaarde, revalorisatie)", patroon: /\bvaleurs? locatives?\b|\bkadastrale huurwaarde\b|\b1518 bis\b|\brevalorisation forfaitaire\b/ },
  { naam: "DPE, energielabel en verhuurverbod", patroon: /\bdpe\b|\bdiagnostic de performance\b|\benergielabel\b|\benergielabels\b|\bverhuurverbod\b|\bpassoires? thermiques?\b|\binterdiction de (?:louer|location)\b|\bgel des loyers\b/ },
  { naam: "catastrophe naturelle en verzekering van de woning", patroon: /\bcatastrophes? naturelles?\b|\bcatnat\b|\bnatuurramp(?:en)?\b|\brampstatus\b|\bassurance habitation\b|\bwoningverzekering\b|\bverzekering van (?:de |uw )?woning\b/ },
  { naam: "ordures ménagères (TEOM, huisvuilbelasting)", patroon: /\bteom\b|\bordures menageres\b|\bhuisvuilbelasting\b|\bafvalbelasting\b|\bafvalstoffenheffing\b/ },
  { naam: "plus-value immobilière (vermogenswinst op vastgoed)", patroon: /\bplus-?values? immobilieres?\b|\bvermogenswinst\w*\b.*\b(?:vastgoed|woning|onroerend)\b|\b(?:vastgoed|woning|onroerend)\w*\b.*\bvermogenswinst\b/ },
  { naam: "frais de notaire en DMTO (notariskosten, overdrachtsrechten)", patroon: /\bfrais de notaire\b|\bdmto\b|\bdroits de mutation\b|\bnotariskosten\b|\bnotaris(?:honoraria|kosten)\b|\boverdrachtsrechten\b|\boverdrachtsbelasting\b/ },
];

/** Een onderwerp-tekst (kop, samenvatting, werktitel, zoektermen) raakt eigenaren van een woning in Frankrijk financieel. */
export function raaktHuiseigenaren(tekst: string): boolean {
  const t = normaliseer(tekst);
  return HUISEIGENAREN_ONDERWERPEN.some((o) => o.patroon.test(t));
}

/** Namen van de onderwerpen die in de tekst voorkomen. */
export function huiseigenarenOnderwerpen(tekst: string): string[] {
  const t = normaliseer(tekst);
  return HUISEIGENAREN_ONDERWERPEN.filter((o) => o.patroon.test(t)).map((o) => o.naam);
}

/** De lijst als lopende tekst voor de opdrachten aan het model (één plek). */
export const HUISEIGENAREN_LIJST_TEKST = HUISEIGENAREN_ONDERWERPEN.map((o) => o.naam).join("; ");

/** Minimale relevantie voor een bericht over zo'n onderwerp (alleen als het model het bericht zelf publiceerbaar vond, relevantie vanaf 30). */
export const HUISEIGENAREN_MIN_RELEVANTIE = 70;
export const HUISEIGENAREN_ONDERGRENS_MODEL = 30;

/** Voorrang in de relevantiescore: een onderwerp uit de lijst krijgt minstens `HUISEIGENAREN_MIN_RELEVANTIE`, tenzij het model het zelf als irrelevant zag (onder 30). */
export function huiseigenarenRelevantie(relevantie: number, tekst: string): number {
  if (relevantie >= HUISEIGENAREN_MIN_RELEVANTIE || relevantie < HUISEIGENAREN_ONDERGRENS_MODEL) return relevantie;
  return raaktHuiseigenaren(tekst) ? HUISEIGENAREN_MIN_RELEVANTIE : relevantie;
}

export const HUISEIGENAREN_LABEL = "Belangrijk voor huiseigenaren";

/** Label "Belangrijk voor huiseigenaren" in de redactie-app: een tip over zo'n onderwerp zonder enige bron (overheid of pers) en nog niet in het nieuws. */
export function tipLabelHuiseigenaren(t: { werktitel: string; primaireBron: unknown[] | null; persBronnen?: unknown[] | null; berichtId: string | null }): boolean {
  return !t.berichtId && !(t.primaireBron || []).length && !(t.persBronnen || []).length && raaktHuiseigenaren(t.werktitel);
}
