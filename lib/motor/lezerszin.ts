// Leesbare zin per aangekondigde PEIL-wijziging (besluit 23-11-2026, keuze A).
// Het schrijfmodel (Sonnet; Haiku veranderde soms de betekenis) herschrijft de omschrijving uit PEIL in lezerstaal. Elk
// getal in de zin moet letterlijk in de PEIL-omschrijving staan; anders wordt de
// zin niet gebruikt. De zin wordt bewaard en alleen opnieuw gemaakt als de
// omschrijving in PEIL verandert. PEIL zelf wordt nooit aangepast.
import { createHash } from "node:crypto";
import type { ModelClient } from "./ai";
import { modelSynthese } from "./config";
import { getallenIn } from "./poort";

export const SYSTEEM_LEZERSZIN = `Je herschrijft een technische notitie over een aangekondigde wijziging in een Franse of Nederlandse regel tot één of twee korte zinnen in gewoon Nederlands voor Nederlanders en Belgen die in Frankrijk wonen.
Regels: noem geen wetsartikelen, artikelnummers, kenmerken of afkortingen als PLF, CGI, NOR of JORF (zeg "de begroting voor 2027", "een nieuw besluit"); neem bedragen, percentages en datums exact over en verander hun betekenis niet (een tarief blijft een tarief, een plafond een plafond, een vrijstelling een vrijstelling) zoals ze in de notitie staan en voeg er geen toe; voeg geen informatie toe die niet in de notitie staat; geen oordeel, geen advies; schrijf Frankrijk en Nederland in het Nederlands (nooit "France"); schrijf niet dat iets een raming is (dat wordt apart vermeld); hooguit 40 woorden, geen lange streepjes.
Antwoord alleen met de zin of zinnen, zonder aanhalingstekens.`;

// Het voorvoegsel verandert als de schrijfopdracht verandert, zodat alle zinnen opnieuw worden gemaakt.
const VERSIE = "v2";
export const hashOmschrijving = (t: string) => createHash("sha1").update(`${VERSIE}:${String(t || "")}`).digest("hex").slice(0, 16);

/** Zin is bruikbaar als hij niet leeg is, niet te lang en geen getal bevat dat niet in de omschrijving staat. */
export function zinIsVeilig(zin: string, omschrijving: string): boolean {
  const z = String(zin || "").trim();
  if (z.length < 20 || z.length > 400) return false;
  const bron = getallenIn(omschrijving);
  for (const g of getallenIn(z)) if (!bron.has(g)) return false;
  return true;
}

export async function maakLezerszin(naam: string, omschrijving: string, client: ModelClient): Promise<string | null> {
  const antw = await client.tekst({ model: modelSynthese(), system: SYSTEEM_LEZERSZIN, maxTokens: 200, user: `Onderwerp: ${naam}\nNotitie: ${omschrijving}` });
  const zin = String(antw || "").replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s*\(raming\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  return zinIsVeilig(zin, omschrijving) ? zin : null;
}
