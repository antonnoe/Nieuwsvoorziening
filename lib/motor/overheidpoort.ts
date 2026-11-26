// Overheidsstroom: regel R17 en de harde uitsluiting, overgenomen uit nlfr-menu
// (lib/redactieregels.js en lib/overheidpoort.js, de goedgekeurde eindvariant van de
// rondes van 20 en 21 november 2026). In nlfr-menu staat alleen gelezen; hier is het
// een eigen, geteste kopie.
//
// Wat de eindvariant zegt (REGIE.md: "R17 streng", "Poort variant B", keuze A van 21-11-2026):
//  - Nederlands binnenlands bestuur (Rijksoverheid) komt alleen door als het Nederlanders in
//    Frankrijk of het buitenland raakt (`buitenlandKenmerk`); op de modelscore alleen komt het niet door.
//  - Caribisch Nederland komt nooit door (harde uitsluiting).
//  - Franse overheidsberichten en Nederlandse overheid die Nederlanders in het buitenland raakt gaan
//    zonder klik door; de gewone kwaliteitspoort en drempels van de motor blijven daarbovenop gelden.
// In nlfr-menu beslist de redactie met een klik; hier is die klik later de redactiebeslissing
// (`redactie = "weg"`), niet een onderdeel van de poort.
import { bevatWoord, normaliseer } from "./tekst";
import type { BronItem, Cluster } from "./types";

// ---- R17: kenmerken van "raakt het buitenland" (accent-ongevoelig, op woordbegin) ----
export const NL_BUITENLAND_RAAKT = [
  "nederlanders in het buitenland", "nederlander in het buitenland", "nederlanders in frankrijk", "nederlander in frankrijk",
  "emigr", "remigr", "expat", "frankrijk", "grensregeling", "grensarbeid", "woonland", "verdragsland",
  "kiezers in het buitenland", "briefstem",
  "vanuit het buitenland", "verdragsgerechtig",
];
// "in het buitenland" en "buiten Nederland" tellen alleen met een vorm van wonen in dezelfde zin,
// of (kaal) samen met een onderwerp uit NL_ALLEEN_MET_CONTEXT.
export const NL_BUITENLAND_PLAATS = ["in het buitenland", "buiten nederland"];
export const NL_WONEN = ["wonen", "woont", "woonachtig", "wonend"];
export const NL_ALLEEN_MET_CONTEXT = ["aow", "pensioen", "zorgverzekering", "paspoort", "rijbewijs", "verdrag", "belasting", "kinderbijslag", "erfbelasting", "uitkering", "stem", "kiezer", "digid", "studiefinanciering"];
const CONTEXT = [
  "in het buitenland", "buiten nederland", "woonachtig in", "wonen in het buitenland", "woont in het buitenland", "wonen in frankrijk",
  "emigr", "remigr", "frankrijk", "verdragsland", "woonland", "over de grens", "expat",
];
// Ambassade en consulaat tellen alleen samen met Parijs of Frankrijk (de ministerienaam "Buitenlandse Zaken" telt nooit).
export const NL_POST_FRANKRIJK = ["ambassade", "consula"];
const POST_CONTEXT = ["parijs", "frankrijk"];
export const R17_REDEN = "Nederlands binnenlands nieuws, raakt Nederlanders in het buitenland niet";

/** Harde uitsluiting: Caribisch Nederland (eigen regels, raakt de lezer in Frankrijk niet). */
export const NL_OVERHEID_NOOIT = [
  "caribisch nederland", "bonaire", "sint eustatius", "statia", "saba", "curacao", "aruba", "sint maarten", "bes-eilanden", "bes eilanden",
];
export function nlOverheidUitgesloten(tekst: string): boolean {
  const n = normaliseer(tekst);
  return NL_OVERHEID_NOOIT.some((w) => bevatWoord(n, w));
}

// Zinnen: afkortingen (o.a., ca., Zr.Ms., nr.) en datums met punten breken een zin niet.
function zinnen(n: string): string[] {
  const beschermd = n
    .replace(/\b(o\.a|d\.w\.z|m\.b\.t|t\.o\.v|i\.v\.m|zr\.ms|hr\.ms|mr|dr|drs|ir|prof|ca|nr|blz|bijv|etc|vs|a\.s|dhr|mevr|st|jr|sr)\./g, (m) => m.replace(/\./g, "\u0001"))
    .replace(/(\d)\.(?=\d)/g, "$1\u0001")
    .replace(/(\d)\.(?=\s*(jan|feb|mrt|maart|apr|mei|jun|jul|aug|sep|okt|nov|dec))/g, "$1\u0001");
  return beschermd.split(/[.!?;\n]+/).map((z) => z.replace(/\u0001/g, ".")).filter((z) => z.trim());
}

const heeft = (t: string, w: string) => new RegExp(`(^|[^a-z])${w}`).test(t);

/**
 * Geeft het kenmerk waarom een tekst Nederlanders in het buitenland raakt, of null.
 * Sterke kenmerken tellen in de hele tekst; de voorwaardelijke (wonen, onderwerp met context,
 * ambassade met Parijs) alleen als beide in DEZELFDE zin staan. De kop telt als begin van de
 * eerste zin van de samenvatting (tweede argument); een kop zonder samenvatting is één zin.
 */
export function buitenlandKenmerk(tekst: string, samenvatting?: string): string | null {
  const norm = (t: string) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const kop = samenvatting === undefined ? null : norm(tekst).trim().replace(/[.!?;:]+$/, "");
  const n = samenvatting === undefined ? norm(tekst) : `${kop}. ${norm(samenvatting)}`;
  const sterk = NL_BUITENLAND_RAAKT.find((w) => heeft(n, w));
  if (sterk) return sterk;
  let lijst = zinnen(n);
  if (kop != null) {
    const rest = zinnen(norm(samenvatting as string));
    lijst = [kop, ...rest];
    if (rest.length) lijst.push(`${kop} ${rest[0]}`);
  }
  for (const zin of lijst) {
    const h = (w: string) => heeft(zin, w);
    const plaats = NL_BUITENLAND_PLAATS.find(h);
    if (plaats && NL_WONEN.some(h)) return `${plaats} + wonen`;
    const post = NL_POST_FRANKRIJK.find(h);
    if (post && POST_CONTEXT.some(h)) return `${post} + parijs/frankrijk`;
    const onderwerp = NL_ALLEEN_MET_CONTEXT.find(h);
    if (onderwerp && CONTEXT.some(h)) return `${onderwerp} + buitenlandcontext`;
  }
  return null;
}
export const raaktBuitenland = (tekst: string, samenvatting?: string): boolean => buitenlandKenmerk(tekst, samenvatting) !== null;

/** Een Nederlands overheidsitem: overheidsregime en Nederland als land van de bron. */
export const isNlOverheid = (i: Pick<BronItem, "regime" | "land">): boolean => i.regime === "overheid" && String(i.land).toUpperCase() === "NL";

export interface OverheidUitslag {
  door: boolean;
  /** "r17" of "caribisch" als het onderwerp wordt tegengehouden. */
  reden?: "r17" | "caribisch";
  kenmerk?: string;
}

/**
 * De poort voor een cluster met overheidsberichten, vóór de synthese (spaart modelkosten).
 * Alleen clusters waarvan álle items Nederlandse overheid zijn worden getoetst; Franse
 * overheid en persclusters gaan ongemoeid door. Een cluster komt door als minstens één item
 * Nederlanders in het buitenland raakt en geen enkel item Caribisch Nederland betreft.
 */
export function overheidPoort(c: Cluster): OverheidUitslag {
  if (!c.items.length || !c.items.every(isNlOverheid)) return { door: true };
  if (c.items.some((i) => nlOverheidUitgesloten(`${i.titel} ${i.samenvatting}`))) return { door: false, reden: "caribisch" };
  for (const i of c.items) {
    const k = buitenlandKenmerk(i.titel, i.samenvatting);
    if (k) return { door: true, kenmerk: k };
  }
  return { door: false, reden: "r17" };
}
