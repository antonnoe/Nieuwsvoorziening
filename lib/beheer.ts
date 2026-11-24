// Beheeroverzicht (/beheer): toegang achter CRON_SECRET en groepering per dag (Europe/Amsterdam).
// Toegang: Authorization: Bearer <CRON_SECRET>, of een cookie die het inlogveld zet (httpOnly, Secure,
// SameSite=Strict). Nooit via de URL. Zonder CRON_SECRET is alles dicht. Het cookie bevat nooit het geheim zelf,
// alleen een vervaldatum en een HMAC daarover.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { OpgeslagenBericht, RunRecord } from "@/lib/motor/opslag";

export const BEHEER_COOKIE = "nv_beheer";
export const BEHEER_GELDIG_SECONDEN = 12 * 3600;

const gelijk = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const teken = (geheim: string, exp: string) => createHmac("sha256", geheim).update(`nv-beheer:${exp}`).digest("hex");

export function geheim(): string | null {
  const g = process.env.CRON_SECRET;
  return g && g.length > 0 ? g : null;
}

/** Klopt het ingevulde geheim? */
export function sleutelKlopt(ingevuld: string): boolean {
  const g = geheim();
  return Boolean(g) && gelijk(ingevuld, g as string);
}

export function maakCookieWaarde(nu = Date.now()): string | null {
  const g = geheim();
  if (!g) return null;
  const exp = String(Math.floor(nu / 1000) + BEHEER_GELDIG_SECONDEN);
  return `${exp}.${teken(g, exp)}`;
}

export function cookieGeldig(waarde: string | undefined | null, nu = Date.now()): boolean {
  const g = geheim();
  if (!g || !waarde) return false;
  const [exp, sig] = waarde.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) * 1000 < nu) return false;
  return gelijk(sig, teken(g, exp));
}

export function bearerGeldig(authorization: string | null | undefined): boolean {
  const g = geheim();
  return Boolean(g) && gelijk(authorization || "", `Bearer ${g}`);
}

export function cookieKop(waarde: string, verwijder = false): string {
  return `${BEHEER_COOKIE}=${verwijder ? "" : waarde}; Path=/beheer; HttpOnly; Secure; SameSite=Strict; Max-Age=${verwijder ? 0 : BEHEER_GELDIG_SECONDEN}`;
}

// ---- per dag ---------------------------------------------------------------------
/** Kalenderdag (jjjj-mm-dd) in Europe/Amsterdam. */
export function dagVan(iso: string | number | Date, tz = "Europe/Amsterdam"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export interface DagOverzicht {
  dag: string;
  geplaatst: OpgeslagenBericht[];
  concept: OpgeslagenBericht[];
  geblokkeerd: OpgeslagenBericht[];
  runs: RunRecord[];
}

export function perDag(berichten: OpgeslagenBericht[], runs: RunRecord[], dagen: string[]): DagOverzicht[] {
  return dagen.map((dag) => {
    const b = berichten.filter((x) => dagVan(x.gepubliceerdOp) === dag);
    return {
      dag,
      geplaatst: b.filter((x) => x.status === "gepubliceerd"),
      concept: b.filter((x) => x.status === "concept"),
      geblokkeerd: b.filter((x) => x.status === "geblokkeerd"),
      runs: runs.filter((r) => dagVan(r.gestartOp) === dag),
    };
  });
}

/** De laatste `n` kalenderdagen, vandaag eerst. */
export function laatsteDagen(n: number, nu = Date.now()): string[] {
  return Array.from({ length: n }, (_, i) => dagVan(nu - i * 86400_000));
}

/** Waarom blijft dit bericht concept? De motor bewaart de relevantie niet apart, dus onder voorbehoud. */
export function conceptReden(b: Pick<OpgeslagenBericht, "score" | "blokkadeRedenen">, drempel: number, minRelevantie: number): string {
  if (b.blokkadeRedenen.length) return b.blokkadeRedenen.join("; ");
  if (b.score < drempel) return `score ${b.score} onder drempel ${drempel}`;
  return `score ${b.score} boven drempel ${drempel}, dus waarschijnlijk relevantie onder ${minRelevantie} (niet bewaard)`;
}

export const GELDIGE_DAG = /^\d{4}-\d{2}-\d{2}$/;
