// Toegang tot de redactie-app (/redactie), zonder mailservice (28-11-2026).
//  - Beheerder (Anton): de sleutel REDACTIE_SECRET (terugval CRON_SECRET) in een POST-formulier; daarna een HMAC-cookie
//    (httpOnly, Secure, SameSite=Strict, Path=/redactie). Het geheim staat nooit in de cookie of de url.
//  - Redacteur (vrijwilliger): een persoonlijke link /redactie/welkom#<token>. Het token is 32 willekeurige bytes; in de database staat alleen de
//    SHA-256-hash (tabel nv_redacteuren). Openen van de link zet een cookie van 90 dagen (verlengd bij gebruik, zie proxy.ts); intrekken sluit hem.
//  - Rem: hooguit 5 foute pogingen per 10 minuten per afzender.
//  - Zonder geheim én zonder tabel is alles dicht.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { redactieGeheim } from "@/lib/redactie";
import { TIJDELIJK_MELDING, logReden } from "@/lib/redactie-melding";
import { TabelOntbreekt, type Opslag } from "@/lib/motor/opslag";
import type { Redacteur, RedacteurRol } from "@/lib/motor/types";

export const REDACTIE_COOKIE = "nv_redactie";
export const BEHEERDER_GELDIG_SECONDEN = 7 * 86400;
export const REDACTEUR_GELDIG_SECONDEN = 90 * 86400;
export const TOKEN_LENGTE = 43; // 32 bytes in base64url

export interface Toegang {
  rol: RedacteurRol;
  naam: string;
  /** Id in nv_redacteuren; null voor de beheerder met de sleutel. */
  id: string | null;
}

const gelijk = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const teken = (geheim: string, exp: string) => createHmac("sha256", geheim).update(`nv-redactie:b:${exp}`).digest("hex");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const maakToken = () => randomBytes(32).toString("base64url");
export const isTokenVorm = (t: unknown): t is string => typeof t === "string" && t.length === TOKEN_LENGTE && /^[A-Za-z0-9_-]+$/.test(t);

/** Klopt de ingevulde beheerderssleutel? */
export function beheerderSleutelKlopt(ingevuld: string): boolean {
  const g = redactieGeheim();
  return Boolean(g) && gelijk(ingevuld, g as string);
}

export function maakBeheerderCookie(nu = Date.now()): string | null {
  const g = redactieGeheim();
  if (!g) return null;
  const exp = String(Math.floor(nu / 1000) + BEHEERDER_GELDIG_SECONDEN);
  return `b.${exp}.${teken(g, exp)}`;
}

export const maakRedacteurCookie = (token: string) => `r.${token}`;

export function cookieKop(waarde: string, maxAge: number): string {
  return `${REDACTIE_COOKIE}=${waarde}; Path=/redactie; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
export const wisCookieKop = () => cookieKop("", 0);

/** De waarde van ons cookie uit een Cookie-header. */
export function leesCookie(header: string | null | undefined): string | undefined {
  for (const stuk of String(header || "").split(";")) {
    const i = stuk.indexOf("=");
    if (i > 0 && stuk.slice(0, i).trim() === REDACTIE_COOKIE) return stuk.slice(i + 1).trim();
  }
  return undefined;
}

function beheerderCookieGeldig(waarde: string, nu: number): boolean {
  const g = redactieGeheim();
  if (!g) return false;
  const [, exp, sig] = waarde.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) * 1000 < nu) return false;
  return gelijk(sig, teken(g, exp));
}

/** Een redacteur bij dit token, alleen als hij bestaat en niet is ingetrokken. Zonder tabel of bij een storing: null (dicht). */
export async function redacteurVoorToken(token: unknown, opslag: Opslag | null): Promise<Redacteur | null> {
  if (!opslag || !isTokenVorm(token)) return null;
  try {
    const r = await opslag.redacteurPerHash(hashToken(token));
    return r && !r.ingetrokkenOp ? r : null;
  } catch {
    return null;
  }
}

/**
 * Wat doet de proxy met het cookie? "verleng": geldige, niet ingetrokken redacteur. "wis": het token bestaat niet (meer) of is ingetrokken.
 * "laat": geen redacteurscookie, of de opslag is onbereikbaar (dan wissen we niets: een storing mag niemand uitloggen).
 */
export async function cookieVerlenging(cookie: string | undefined, opslag: Opslag | null): Promise<"verleng" | "wis" | "laat"> {
  if (!cookie || !cookie.startsWith("r.")) return "laat";
  const token = cookie.slice(2);
  if (!isTokenVorm(token)) return "wis";
  if (!opslag) return "laat";
  try {
    const r = await opslag.redacteurPerHash(hashToken(token));
    return r && !r.ingetrokkenOp ? "verleng" : "wis";
  } catch {
    return "laat";
  }
}

/** Wie is dit? Null betekent: dicht. Werkt `laatst_gezien` bij (hooguit een keer per uur, zonder te falen). */
export async function bepaalToegang(cookie: string | undefined, opslag: Opslag | null, nu = Date.now()): Promise<Toegang | null> {
  if (!cookie) return null;
  if (cookie.startsWith("b.")) return beheerderCookieGeldig(cookie, nu) ? { rol: "beheerder", naam: "Beheerder", id: null } : null;
  if (cookie.startsWith("r.")) {
    const r = await redacteurVoorToken(cookie.slice(2), opslag);
    if (!r) return null;
    const gezien = r.laatstGezien ? Date.parse(r.laatstGezien) : 0;
    if (!gezien || nu - gezien > 3600_000) await opslag!.redacteurGezien(r.id, nu).catch(() => {});
    return { rol: r.rol, naam: r.naam, id: r.id };
  }
  return null;
}

// ---- Rem op foute pogingen -------------------------------------------------------------------------------
const pogingen = new Map<string, number[]>();
export const wisRedactieRem = () => pogingen.clear();
export const afzender = (req: Request) => (req.headers.get("x-forwarded-for") || "onbekend").split(",")[0].trim();
/** True als deze afzender nu geen nieuwe poging mag doen. */
export function teVaak(wie: string, nu = Date.now()): boolean {
  return (pogingen.get(wie) || []).filter((t) => nu - t < 600_000).length >= 5;
}
export function noteerFout(wie: string, nu = Date.now()) {
  pogingen.set(wie, [...(pogingen.get(wie) || []).filter((t) => nu - t < 600_000), nu]);
}
export const wisFouten = (wie: string) => pogingen.delete(wie);

// ---- Vrijwilligers --------------------------------------------------------------------------------------
export const MAX_NAAM = 60;

/** Maakt een redacteur met een nieuw token. Het token wordt alleen hier teruggegeven en nergens bewaard (alleen de hash). */
export async function maakVrijwilliger(opslag: Opslag, naamRuw: string, nu = Date.now()): Promise<{ ok: true; redacteur: Redacteur; token: string } | { ok: false; melding: string }> {
  const naam = String(naamRuw || "").replace(/[<>"`]/g, "").replace(/\s+/g, " ").trim();
  if (naam.length < 2 || naam.length > MAX_NAAM) return { ok: false, melding: "Geef een naam van 2 tot 60 tekens." };
  const token = maakToken();
  try {
    const redacteur = await opslag.redacteurMaak({ naam, hash: hashToken(token), rol: "redacteur" }, nu);
    return { ok: true, redacteur, token };
  } catch (e) {
    logReden("vrijwilliger toevoegen", e);
    return { ok: false, melding: e instanceof TabelOntbreekt ? TIJDELIJK_MELDING : "Toevoegen is niet gelukt. Probeer het later opnieuw." };
  }
}
