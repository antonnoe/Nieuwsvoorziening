// Vaste terugvalfoto's per categorie (Unsplash, op id). Rustig, neutraal en Frans:
// dorpsstraten en landschap zonder herkenbare personen, plekken of gebeurtenissen,
// zodat ze nooit misleiden. Dit is de ENIGE plek waar de ids staan.
// Bij gebruik wordt de foto opgehaald via GET /photos/:id (bronvermelding en
// download-melding zoals Unsplash vereist); is een foto weg of noemt de
// omschrijving een persoon, dan gaat de generator naar de volgende.
import type { Categorie } from "./types";

export interface TerugvalFoto {
  id: string;
  /** Alleen voor beheerders: wat staat erop. */
  omschrijving: string;
}

const STRAAT_EGUISHEIM: TerugvalFoto = { id: "wtlSHRt9uRc", omschrijving: "Straat tussen kleurrijke huizen, Eguisheim (Elzas)" };
const STRAAT_ARLES: TerugvalFoto = { id: "x_ygSp07hGM", omschrijving: "Lege straat tussen gebouwen, Arles" };
const STRAAT_CIRQ: TerugvalFoto = { id: "wLAha23bB80", omschrijving: "Kasseienstraat tussen oude stenen huizen, Saint-Cirq-Lapopie" };
const STRAAT_EZE: TerugvalFoto = { id: "6jCNzTD-2no", omschrijving: "Smalle straat met stenen huizen, Èze" };
const DORP_COTIGNAC: TerugvalFoto = { id: "CXde3DEyWjY", omschrijving: "Dorp gezien van een afstand, Cotignac" };
const DORP_MOUSTIERS: TerugvalFoto = { id: "Rffvl8zvPRI", omschrijving: "Dorp tussen heuvels en rotsen, Moustiers-Sainte-Marie" };
const WIJNGAARD_HEUVELS: TerugvalFoto = { id: "vKfVbeulcmA", omschrijving: "Groen wijngaardlandschap met heuvels, Frankrijk" };
const WIJNGAARD_DORP: TerugvalFoto = { id: "dKCQ-nJRWwU", omschrijving: "Wijngaardrijen met dorp in de verte" };
const VELD_HEUVELS: TerugvalFoto = { id: "rlfNgRZJu7g", omschrijving: "Groen veld met bomen en heuvels, Salles-la-Source" };

export const TERUGVAL: Record<Categorie, TerugvalFoto[]> = {
  algemeen: [STRAAT_EGUISHEIM, STRAAT_ARLES],
  politiek: [STRAAT_ARLES, STRAAT_CIRQ],
  "economie en ondernemen": [STRAAT_CIRQ, STRAAT_EZE],
  "reizen en verkeer": [STRAAT_EZE, STRAAT_ARLES],
  "natuur en rampen": [WIJNGAARD_HEUVELS, VELD_HEUVELS, WIJNGAARD_DORP],
  "toerisme en evenementen": [DORP_MOUSTIERS, DORP_COTIGNAC, STRAAT_CIRQ],
  merkwaardig: [WIJNGAARD_DORP, DORP_COTIGNAC],
};
