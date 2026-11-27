// Signaal voor InfoPoche ("Let op"): een wetswijziging of een kans die de lezer kan raken (besluit 27-11-2026).
// De definitie staat hier op één plek: de synthese (schrijfopdracht) en de nalooprun gebruiken dezelfde tekst.
import { haalJson, type ModelClient } from "./ai";
import { modelGoedkoop } from "./config";
import { leesSignaal, type Signaal } from "./types";

export const DEFINITIE_SIGNAAL = `precies een van "wetswijziging", "kans" of null. Bij twijfel null.
- "wetswijziging": het bericht beschrijft een aangenomen, ingevoerde of definitief aangekondigde wijziging van een wet, regel, tarief, verplichting of verbod in Frankrijk (of een Nederlandse regel voor Nederlanders in Frankrijk) die particulieren, huiseigenaren, gepensioneerden, werkenden of ondernemers concreet raakt. Ook een geschrapte of uitgestelde regel telt (bijvoorbeeld een verhuurverbod dat wordt geschrapt). NIET: wetsvoorstellen in een vroeg stadium zonder besluit, politieke uitspraken, prijsontwikkelingen, statistiek, stakingen, weer.
- "kans": een regeling, subsidie, premie, vrijstelling of termijn waar de lezer zelf gebruik van kan maken of iets voor moet doen.
- anders null.`;

export const SYSTEEM_SIGNAAL = `Je beoordeelt een Nederlandstalig nieuwsbericht over Frankrijk voor Nederlanders en Belgen die daar wonen of er vaak komen. Bepaal het veld signaal: ${DEFINITIE_SIGNAAL}

Gebruik uitsluitend wat in het bericht staat. Antwoord uitsluitend met JSON: {"signaal":null}`;

/**
 * Beoordeelt een bestaand bericht (kop, samenvatting, tekst) met het goedkope model. Geeft `{signaal}` (ook null is een oordeel),
 * of null bij een modelfout of een antwoord zonder bruikbaar JSON-object met het veld signaal: dan blijft het bericht onbeoordeeld.
 */
export async function beoordeelSignaal(b: { kop: string; samenvatting: string; tekst: string }, client: ModelClient): Promise<{ signaal: Signaal | null } | null> {
  let antw: string;
  try {
    antw = await client.tekst({ model: modelGoedkoop(), system: SYSTEEM_SIGNAAL, user: `Kop: ${b.kop}\nSamenvatting: ${b.samenvatting}\n\n${b.tekst}`, maxTokens: 300 });
  } catch {
    return null;
  }
  const j = haalJson<Record<string, unknown>>(antw);
  if (!j || typeof j !== "object" || Array.isArray(j) || !("signaal" in j)) return null;
  return { signaal: leesSignaal(j.signaal) };
}
