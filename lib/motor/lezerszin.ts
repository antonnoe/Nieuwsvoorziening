// Leesbare zin per aangekondigde PEIL-wijziging (besluit 23-11-2026, keuze A).
// Het schrijfmodel (Sonnet; Haiku veranderde soms de betekenis) herschrijft de omschrijving uit PEIL in lezerstaal. Elk
// getal in de zin moet letterlijk in de PEIL-omschrijving staan; anders wordt de
// zin niet gebruikt. De zin wordt bewaard en alleen opnieuw gemaakt als de
// omschrijving in PEIL verandert. PEIL zelf wordt nooit aangepast.
import { createHash } from "node:crypto";
import { haalJson, type ModelClient } from "./ai";
import { modelSynthese } from "./config";
import { getallenIn } from "./poort";

export const SYSTEEM_LEZERSZIN = `Je herschrijft een technische notitie over een aangekondigde wijziging in een Franse of Nederlandse regel tot één of twee korte zinnen in gewoon Nederlands voor Nederlanders en Belgen die in Frankrijk wonen.
Regels: noem geen wetsartikelen, artikelnummers, kenmerken of afkortingen als PLF, CGI, NOR of JORF (zeg "de begroting voor 2027", "een nieuw besluit"); neem bedragen, percentages en datums exact over en verander hun betekenis niet (een tarief blijft een tarief, een plafond een plafond, een vrijstelling een vrijstelling) zoals ze in de notitie staan en voeg er geen toe; voeg geen informatie toe die niet in de notitie staat; geen oordeel, geen advies; schrijf Frankrijk en Nederland in het Nederlands (nooit "France"); schrijf niet dat iets een raming is (dat wordt apart vermeld); hooguit 40 woorden, geen lange streepjes.
Zegt de notitie dat iets officieel vastgesteld of bekendgemaakt is, zeg dat dan ook ("Dit is officieel vastgesteld."); noemt de notitie een reeks jaren ("tot en met 2032"), neem het laatste jaar exact over; schrijf het zo dat een lezer niet denkt dat er iets mis is of dat dit nieuw is als de notitie zegt dat het al langer bekend is.
Zegt de notitie voor wie de wijziging geldt (bijvoorbeeld wie een gîte verhuurt, gepensioneerden, eigenaren van een tweede huis), noem dat dan in de zin ("Voor wie een gîte verhuurt ..."); verzin geen doelgroep.
Maak daarnaast een korte titel: hooguit 7 woorden, gewone Nederlandse taal, geen afkortingen behalve bekende Nederlandse als AOW of WOZ, geen Franse woorden en geen jargon, zeg wat er verandert (bijvoorbeeld "10%-aftrek op pensioen ter discussie" of "Vereenvoudigd btw-stelsel verdwijnt"). Een getal in de titel moet in de notitie of de naam van het onderwerp staan.
Verandert er voor een lezer niets (bijvoorbeeld "de grenzen veranderen niet") of is de notitie een interne werknotitie zonder gevolg voor wie in Frankrijk woont, antwoord dan alleen met het woord GEEN.
Antwoord anders uitsluitend met JSON: {"titel":"","zin":""}, of alleen het woord GEEN.`;

// Het voorvoegsel verandert als de schrijfopdracht verandert, zodat alle zinnen opnieuw worden gemaakt.
const VERSIE = "v4";
export const hashOmschrijving = (t: string) => createHash("sha1").update(`${VERSIE}:${String(t || "")}`).digest("hex").slice(0, 16);

/** Marker die we bewaren als het voor een lezer niets verandert; zo wordt het niet steeds opnieuw gevraagd en nooit getoond. */
export const GEEN_ZIN = "GEEN";

const zonderNullen = (g: string) => g.replace(/^0+(?=\d)/, "");

/** Getallen uit de omschrijving, de naam van de parameter en de datum van de aankondiging (ook zonder voorloopnullen: "01" is "1"). */
function toegestaneGetallen(omschrijving: string, extra: string[]): Set<string> {
  const uit = new Set<string>();
  for (const g of getallenIn([omschrijving, ...extra].join(" | "))) (uit.add(g), uit.add(zonderNullen(g)));
  return uit;
}

/** Eerste reden waarom een zin niet bruikbaar is, of null als hij bruikbaar is. Geen inhoud van sleutels, wel het afwijkende getal. */
export function zinAfkeurReden(zin: string, omschrijving: string, extra: string[] = []): string | null {
  const z = String(zin || "").trim();
  if (z.length < 20) return "te kort";
  if (z.length > 400) return "te lang";
  const toegestaan = toegestaneGetallen(omschrijving, extra);
  for (const g of getallenIn(z)) if (!toegestaan.has(g) && !toegestaan.has(zonderNullen(g))) return `getal niet in omschrijving, naam of datum: ${g}`;
  return null;
}

/** Zin is bruikbaar als hij niet leeg is, niet te lang en geen getal bevat dat niet in de omschrijving, de naam of de datum staat. */
export function zinIsVeilig(zin: string, omschrijving: string, extra: string[] = []): boolean {
  return zinAfkeurReden(zin, omschrijving, extra) === null;
}

const FRANSE_WOORDEN = /\b(régime|regime simplifié|abattement|valeur locative|taxe|impôt|impots|prélèvement|seuil|barème|cotisation|redevance|déclaration|loi|décret|france)\b/i;

/** Eerste reden waarom een titel niet bruikbaar is, of null. Zelfde getallencontrole als de zin. */
export function titelAfkeurReden(titel: string, omschrijving: string, extra: string[] = []): string | null {
  const t = String(titel || "").trim();
  if (t.length < 8) return "titel te kort";
  if (t.length > 80) return "titel te lang";
  if (t.split(/\s+/).length > 7) return "titel langer dan 7 woorden";
  // Bekende Nederlandse afkortingen die lezers kennen mogen; andere afkortingen in hoofdletters niet.
  const BEKEND = new Set(["AOW", "WOZ", "CAK", "BTW", "EU", "IB", "NL", "AOW-uitkering"]);
  const afk = (t.match(/\b[A-ZÀ-Ý]{2,}\b/g) || []).filter((x) => !BEKEND.has(x));
  if (afk.length) return "titel bevat een afkorting";
  if (FRANSE_WOORDEN.test(t)) return "titel bevat een Frans woord";
  if (/[()]|\bFrance\b/.test(t)) return "titel bevat haakjes of France";
  const toegestaan = toegestaneGetallen(omschrijving, extra);
  for (const g of getallenIn(t)) if (!toegestaan.has(g) && !toegestaan.has(zonderNullen(g))) return `getal in titel niet in omschrijving, naam of datum: ${g}`;
  return null;
}

export type LezerszinUitslag = { zin: string; titel?: string; reden?: undefined } | { zin: null; reden: string };

/** Vraagt het model om een zin. `zin` is een zin, GEEN_ZIN (niets voor de lezer) of null met een reden (afgekeurd of modelfout). */
export async function maakLezerszin(naam: string, omschrijving: string, client: ModelClient, datum?: string | null): Promise<LezerszinUitslag> {
  let antw: string;
  try {
    antw = await client.tekst({ model: modelSynthese(), system: SYSTEEM_LEZERSZIN, maxTokens: 4000, user: `Onderwerp: ${naam}${datum ? `\nDatum van de aankondiging: ${datum}` : ""}\nNotitie: ${omschrijving}` });
  } catch (e) {
    return { zin: null, reden: `modelfout: ${(e instanceof Error ? e.message : String(e)).slice(0, 80)}` };
  }
  const ruw = String(antw || "").trim();
  if (/^["'\s]*GEEN\.?["'\s]*$/i.test(ruw)) return { zin: GEEN_ZIN };
  const j = haalJson<{ titel?: unknown; zin?: unknown }>(ruw);
  if (!j || typeof j !== "object") return { zin: null, reden: "antwoord is geen JSON" };
  const schoon = (x: unknown) => String(x ?? "").replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s*\(raming\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  const zin = schoon(j.zin);
  const titel = schoon(j.titel);
  if (/^GEEN\.?$/i.test(zin)) return { zin: GEEN_ZIN };
  const extra = [naam, datum || ""];
  const reden = zinAfkeurReden(zin, omschrijving, extra) ?? titelAfkeurReden(titel, omschrijving, extra);
  return reden ? { zin: null, reden } : { zin, titel };
}
