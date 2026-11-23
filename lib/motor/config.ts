import bronnenBestand from "../../data/bronnen.json";
import configBestand from "../../data/config.json";
import type { Bron } from "./types";

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
  maxSynthesesPerRun: 6,
  maxBerichtenPerDag: 20,
  maxClusterItems: 150,
  ruweItemsBewaarDagen: 30,
  peilCacheMinuten: 360,
  peilKandidatenPerBericht: 6,
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

export function actieveBronnen(): Bron[] {
  return laadBronnen().filter((b) => b.status === "ACTIVE");
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
  } catch {
    /* ongeldige origin */
  }
  return null;
}
