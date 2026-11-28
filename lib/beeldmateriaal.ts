// Gegevens voor de pagina /beeldmateriaal: alle illustraties uit public/illustraties/index.json (één plek), per categorie.
import { ILLUSTRATIES, type Illustratie } from "./motor/illustraties";
import { CATEGORIEEN } from "./motor/types";

export interface BeeldSectie {
  categorie: string;
  kop: string;
  beelden: Illustratie[];
}

export function hoofdletter(t: string): string {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Groepeert per categorie in de vaste volgorde; onbekende categorieën komen erachter, niets gaat verloren. */
export function groepeerBeelden(beelden: Illustratie[]): BeeldSectie[] {
  const volgorde: string[] = [...CATEGORIEEN];
  for (const b of beelden) if (!volgorde.includes(b.categorie)) volgorde.push(b.categorie);
  return volgorde
    .map((categorie) => ({ categorie, kop: hoofdletter(categorie), beelden: beelden.filter((b) => b.categorie === categorie) }))
    .filter((s) => s.beelden.length > 0);
}

export function beeldmateriaalSecties(): BeeldSectie[] {
  return groepeerBeelden(ILLUSTRATIES.beelden);
}
