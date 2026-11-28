import bronnenBestand from "../../data/bronnen.json";
import configBestand from "../../data/config.json";
import type { Bron } from "./types";

/** Versie van de schrijfregels. Berichten met een lagere regelversie worden (laatste 48 uur) opnieuw geschreven. */
export const REGELVERSIE = 2;
/** Hooguit zoveel berichten per oogstrun herschrijven. */
export const MAX_HERSCHRIJVEN_PER_RUN = 3;

/**
 * Eenmalige hertoets (PEIL streng, herstelronde 2): berichten die opnieuw door de PEIL-controle moeten, ook al hebben ze geen oude
 * koppeling meer. Een id valt vanzelf af zodra het bericht een signaal met zekerheid heeft; levert de toets niets op, haal het id dan
 * uit deze lijst (het bericht komt anders elke run terug, hooguit binnen het plafond van 10 hertoetsen).
 */
export const EENMALIGE_PEIL_HERTOETS: string[] = ["55fdeaca-d7e7-4973-bb23-e4086fbbd107"];

/** Nalooprun signaal (27-11-2026): gepubliceerde berichten van de laatste 14 dagen zonder signaal-oordeel, hooguit 15 per run. */
export const SIGNAAL_NALOOP_DAGEN = 14;
export const MAX_SIGNAAL_NALOOP_PER_RUN = 15;

export interface MotorConfig {
  publiceerDrempel: number;
  minRelevantie: number;
  venstersUren: number;
  minBronnenPers: number;
  voorkeurBronnenPers: number;
  minBronnenOverheid: number;
  maxItemsPerBron: number;
  maxSynthesesPerRun: number;
  maxBerichtenPerDag: number;
  maxClusterItems: number;
  ruweItemsBewaarDagen: number;
  peilCacheMinuten: number;
  peilKandidatenPerBericht: number;
  minTekstTekens: number;
  minKopTekens: number;
  minSamenvattingTekens: number;
}

const STANDAARD: MotorConfig = {
  publiceerDrempel: 55,
  minRelevantie: 60,
  venstersUren: 36,
  minBronnenPers: 2,
  voorkeurBronnenPers: 3,
  minBronnenOverheid: 1,
  maxItemsPerBron: 25,
  maxSynthesesPerRun: 10,
  maxBerichtenPerDag: 20,
  maxClusterItems: 150,
  ruweItemsBewaarDagen: 30,
  peilCacheMinuten: 360,
  peilKandidatenPerBericht: 8,
  minTekstTekens: 280,
  minKopTekens: 15,
  minSamenvattingTekens: 40,
};

export function laadConfig(): MotorConfig {
  const bestand = configBestand as unknown as Partial<MotorConfig>;
  const uit: Record<string, unknown> = { ...STANDAARD };
  for (const [k, v] of Object.entries(bestand)) if (k in STANDAARD && typeof v === "number") uit[k] = v;
  // Env mag de drempel overrulen, zonder herbouw.
  const envDrempel = Number(process.env.PUBLICEER_DREMPEL);
  if (process.env.PUBLICEER_DREMPEL && Number.isFinite(envDrempel)) uit.publiceerDrempel = envDrempel;
  return uit as unknown as MotorConfig;
}

export function laadBronnen(): Bron[] {
  const d = bronnenBestand as unknown as { bronnen?: Bron[] };
  return Array.isArray(d.bronnen) ? d.bronnen : [];
}

/** Nieuwssitemap van The Connexion: de eerste radarbron (besluit 28-11-2026). */
export const CONNEXION_SITEMAP_URL = "https://www.connexionfrance.com/tag/news?lab_viewport=newssitemap";

/**
 * Harde regel (besluit 28-11-2026): deze domeinen zijn NOOIT bron. The Connexion is uitsluitend onderwerpsignaal voor de
 * radar (lib/motor/radar.ts) en komt nergens in bronnen, bronnenblok, nv_bron_items, clustering, synthese, artikelophaling,
 * beeld of publicatie. Deze controle staat op elke plek waar een bron-url de motor in komt of eruit gaat.
 * Dit is de vaste lijst: ze geldt altijd, ook als de database onbereikbaar is.
 */
export const VERBODEN_BRONDOMEINEN = ["connexionfrance.com"];

// Radar-domeinen uit de database (tabel nv_bronnen, soort 'radar'): een domein dat radarbron is, kan nooit nieuwsbron zijn.
// Wordt gezet door `zetRadarDomeinen` zodra de bronnenlijst is gelezen (oogstrun, redactiepagina's). Faalt de lezing, dan blijft
// de laatst bekende stand en altijd de vaste lijst hierboven.
let radarDomeinenUitDatabase: string[] = [];
/** Kale hostnaam in kleine letters, zonder www. Werkt voor een url of een kaal domein. */
export function kaleHost(invoer: string | null | undefined): string {
  const s = String(invoer || "").trim().toLowerCase();
  if (!s) return "";
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, "");
  } catch {
    return s.replace(/^www\./, "");
  }
}
export function zetRadarDomeinen(domeinen: string[]) {
  radarDomeinenUitDatabase = [...new Set(domeinen.map(kaleHost).filter(Boolean))];
}
export function radarDomeinen(): string[] {
  return [...new Set([...VERBODEN_BRONDOMEINEN, ...radarDomeinenUitDatabase])];
}
const hoortBij = (h: string, d: string) => h === d || h.endsWith(`.${d}`);
export function isVerbodenBron(url: string | null | undefined): boolean {
  const s = String(url || "").trim();
  if (!s) return false;
  let h = "";
  try {
    h = new URL(s).hostname.toLowerCase();
  } catch {
    h = s.toLowerCase();
  }
  if (VERBODEN_BRONDOMEINEN.some((d) => h === d || h.endsWith(`.${d}`) || h.includes(d))) return true;
  const kaal = h.replace(/^www\./, "");
  return radarDomeinenUitDatabase.some((d) => hoortBij(kaal, d));
}

/** Nieuwsbronnen uit het terugvalbestand die geoogst mogen worden (zonder database). Zie ook `bronnenlijst.ts`. */
export function actieveBronnen(): Bron[] {
  return laadBronnen().filter((b) => b.status === "ACTIVE" && !isVerbodenBron(b.feed) && !isVerbodenBron(b.domein));
}

// ---- Modellen (via env, met veilige standaard) --------------------------------
const MODELNAAM = /^[A-Za-z0-9._:-]{3,80}$/;
function model(env: string | undefined, standaard: string): string {
  const v = String(env || "").trim();
  return MODELNAAM.test(v) ? v : standaard;
}
export const modelSynthese = () => model(process.env.NIEUWS_MODEL_SYNTHESE, "claude-sonnet-5-5");
export const modelGoedkoop = () => model(process.env.NIEUWS_MODEL_GOEDKOOP, "claude-haiku-4-5");

export const PEIL_URL = process.env.PEIL_URL || "https://communitiesabroad.com/manifest/peil-zoek.json";

/** Toegestane herkomsten voor CORS. */
export function corsToegestaan(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const h = new URL(origin).hostname.toLowerCase();
    if (h === "nederlanders.fr" || h === "www.nederlanders.fr" || h === "infofrankrijk.com" || h.endsWith(".infofrankrijk.com")) return origin;
    // Infopoche (repo if-mobiel) leest /api/nieuws vanuit de browser; alleen https en de kale host (www.infopoche.fr is niet bevestigd).
    if (h === "infopoche.fr" && new URL(origin).protocol === "https:") return origin;
  } catch {
    /* ongeldige origin */
  }
  return null;
}
