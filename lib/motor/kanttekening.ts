// NL/BE-kijk op Frans en Europees nieuws (wens opdrachtgever 28-11-2026): een Nederlandse of Belgische krant die over hetzelfde
// Europese besluit schrijft als twee Franse bronnen, wordt herkend en meegenomen; de synthese mag dan een korte alinea toevoegen
// ("In Nederland ...") met wat die kranten anders benadrukken. Een NL/BE-item zonder Frankrijk-link is een "kanttekening":
//  - het wordt alleen bewaard als het over de EU of de grens gaat (zeef, `kanttekeningToegestaan`), anders vervalt het zoals voorheen;
//  - het is geen eigen onderwerp en telt niet als onafhankelijke bron (`aantalBronnen`);
//  - het wordt alleen aan een cluster gekoppeld dat al minstens 2 onafhankelijke Franse of overheidsbronnen heeft én Europees of
//    grensoverschrijdend is, en alleen als het goedkope model "ja" zegt op "precies hetzelfde onderwerp?" (bij twijfel nee).
// Geen vlag in de database nodig: een kanttekening is af te leiden uit groep (nl_vl_pers) en tekst (noemt Frankrijk niet).
import { haalJson, type ModelClient } from "./ai";
import { modelGoedkoop } from "./config";
import { gaatOverFrankrijk } from "./zeef";
import { bevatWoord, hashId, normaliseer } from "./tekst";
import type { Bron, BronItem, Cluster } from "./types";

/** Termen (genormaliseerd) die een onderwerp Europees of grensoverschrijdend maken. Korte afkortingen als hele woorden. */
const EU_GRENS = [
  "eu", "europese unie", "europese commissie", "europees parlement", "europese raad", "europese", "europees", "europeen", "europeenne", "eurozone", "ecb", "schengen", "grens", "grenzen",
  "brussel", "navo", "union europeenne", "commission europeenne", "parlement europeen", "bruxelles", "otan", "zone euro", "frontiere", "frontieres",
];
/** Termen die verwijzen naar Nederland of België, voor de Franse kant van het cluster. */
const NL_BE = ["nederland", "nederlands", "nederlandse", "pays-bas", "pays bas", "neerlandais", "belgie", "belgique", "belgisch", "belgische", "belge", "belges", "vlaanderen", "wallonie"];

const heeftTerm = (n: string, lijst: string[]) => lijst.some((w) => bevatWoord(n, w));

/** Gaat de tekst over de EU of de grens? */
export const isEuGrens = (tekst: string) => heeftTerm(normaliseer(tekst), EU_GRENS);

/** Is dit een kanttekening-item: een NL/BE-persitem dat Frankrijk niet noemt? Af te leiden uit de opgeslagen velden. */
export const isKanttekeningItem = (i: Pick<BronItem, "groep" | "titel" | "samenvatting">): boolean =>
  i.groep === "nl_vl_pers" && !gaatOverFrankrijk(`${i.titel} ${i.samenvatting || ""}`);

/** Mag de oogst dit item bewaren als kanttekening? Alleen een NL/BE-bron met Frankrijkfilter, en alleen als het over de EU of de grens gaat. */
export const kanttekeningToegestaan = (item: { titel: string; samenvatting?: string }, bron: Pick<Bron, "groep" | "frankrijkFilter" | "regime">): boolean =>
  bron.groep === "nl_vl_pers" && bron.regime === "pers" && bron.frankrijkFilter && !gaatOverFrankrijk(`${item.titel} ${item.samenvatting || ""}`) && isEuGrens(`${item.titel} ${item.samenvatting || ""}`);

/** Heeft het cluster een Nederlandse of Belgische bron? (land NL of BE; geldt voor de synthese-opdracht en de poort) */
export const heeftNlBeBron = (c: Cluster | null | undefined): boolean => !!c && c.items.some((i) => i.land === "NL" || i.land === "BE");

/** De Franse of overheidsbronnen (verschillende bron-id's) van een cluster, zonder kanttekeningen. */
export function onafhankelijkeFrBronnen(c: Cluster): number {
  return new Set(c.items.filter((i) => !isKanttekeningItem(i) && (i.groep === "fr_pers" || i.regime === "overheid")).map((i) => i.bronId)).size;
}

/** Is het onderwerp van dit cluster Europees of grensoverschrijdend? (EU-termen in het cluster, of de Franse kant noemt Nederland of België) */
export function clusterIsEuropees(c: Cluster): boolean {
  const tekst = normaliseer(c.items.filter((i) => !isKanttekeningItem(i)).map((i) => `${i.titel} ${i.samenvatting || ""}`).join(" \n "));
  return heeftTerm(tekst, EU_GRENS) || heeftTerm(tekst, NL_BE);
}

/** Verdeelt de pool in gewone items en kanttekening-items. */
export function splitsKanttekeningen(pool: BronItem[]): { hoofd: BronItem[]; kanttekeningen: BronItem[] } {
  const hoofd: BronItem[] = [], kanttekeningen: BronItem[] = [];
  for (const i of pool) (isKanttekeningItem(i) ? kanttekeningen : hoofd).push(i);
  return { hoofd, kanttekeningen };
}

export const MAX_KANTTEKENING_AANROEPEN = 8;
export const MAX_KANTTEKENING_KANDIDATEN = 12;
export const MAX_KANTTEKENING_PER_CLUSTER = 2;

export const SYSTEEM_KANTTEKENING = `Je controleert of Nederlandse of Belgische nieuwsberichten over PRECIES hetzelfde onderwerp gaan als een groep Franse berichten: dezelfde gebeurtenis of hetzelfde besluit, niet alleen hetzelfde thema. Je krijgt de koppen van de Franse berichten en daarna genummerde koppen van Nederlandse of Belgische berichten. Beantwoord per genummerd bericht: gaat dit NL/BE-bericht over precies hetzelfde onderwerp? ja of nee. Bij twijfel nee.
Antwoord uitsluitend met JSON: {"ja":[nummers]} met alleen de nummers waarop het antwoord ja is (een lege lijst bij nee of twijfel).`;

export function leesKanttekeningAntwoord(antwoord: string, aantal: number): number[] {
  const o = haalJson<{ ja?: unknown }>(antwoord);
  if (!o || !Array.isArray(o.ja)) return [];
  const uit = new Set<number>();
  for (const x of o.ja) {
    const n = Number(x);
    if (Number.isInteger(n) && n >= 1 && n <= aantal) uit.add(n);
  }
  return [...uit].sort((a, b) => a - b).slice(0, MAX_KANTTEKENING_PER_CLUSTER);
}

export interface KoppelUitslag {
  clusters: Cluster[];
  gekoppeld: number;
  aanroepen: number;
  /** Clusters die aan de voorwaarden voldeden (minstens 2 Franse of overheidsbronnen, Europees of grensoverschrijdend). */
  inAanmerking: number;
}

/**
 * Koppelt kanttekening-items aan clusters. Zonder model of zonder kanttekeningen verandert er niets. Een item gaat hooguit in één cluster,
 * en een cluster krijgt er hooguit twee. Een modelfout of onbruikbaar antwoord geeft geen koppeling.
 */
export async function koppelKanttekeningen(clusters: Cluster[], kanttekeningen: BronItem[], client: ModelClient | null, maxAanroepen = MAX_KANTTEKENING_AANROEPEN): Promise<KoppelUitslag> {
  const uit: KoppelUitslag = { clusters, gekoppeld: 0, aanroepen: 0, inAanmerking: 0 };
  if (!client || !kanttekeningen.length) return uit;
  const inAanm = clusters.filter((c) => onafhankelijkeFrBronnen(c) >= 2 && clusterIsEuropees(c));
  uit.inAanmerking = inAanm.length;
  if (!inAanm.length) return uit;
  const vrij = [...kanttekeningen].sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp)).slice(0, MAX_KANTTEKENING_KANDIDATEN * 2);
  const toegevoegd = new Map<Cluster, BronItem[]>();
  const gebruikt = new Set<string>();
  // Clusters met de meeste Franse bronnen eerst.
  for (const c of [...inAanm].sort((a, b) => onafhankelijkeFrBronnen(b) - onafhankelijkeFrBronnen(a))) {
    if (uit.aanroepen >= maxAanroepen) break;
    const kand = vrij.filter((i) => !gebruikt.has(i.url)).slice(0, MAX_KANTTEKENING_KANDIDATEN);
    if (!kand.length) break;
    uit.aanroepen += 1;
    try {
      const fr = c.items.filter((i) => !isKanttekeningItem(i)).map((i) => `- ${i.titel.slice(0, 160)}`).join("\n");
      const antw = await client.tekst({
        model: modelGoedkoop(), maxTokens: 200, system: SYSTEEM_KANTTEKENING,
        user: `Franse berichten:\n${fr}\n\nNederlandse of Belgische berichten:\n${kand.map((k, n) => `${n + 1}. ${k.titel.slice(0, 160)}`).join("\n")}`,
      });
      const gekozen = leesKanttekeningAntwoord(antw, kand.length).map((n) => kand[n - 1]);
      if (gekozen.length) {
        toegevoegd.set(c, gekozen);
        for (const g of gekozen) gebruikt.add(g.url);
        uit.gekoppeld += gekozen.length;
      }
    } catch {
      /* modelfout: geen koppeling, het cluster blijft zoals het was */
    }
  }
  uit.clusters = clusters.map((c) => {
    const extra = toegevoegd.get(c);
    if (!extra) return c;
    const items = [...c.items, ...extra];
    return { ...c, sleutel: hashId(items.map((i) => i.url).sort().join("|")), items };
  });
  return uit;
}
