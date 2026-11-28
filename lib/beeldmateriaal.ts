// Gegevens voor de pagina /beeldmateriaal: alle illustraties uit public/illustraties/index.json (één plek), per categorie.
import { ILLUSTRATIES, type Illustratie } from "./motor/illustraties";
import { CATEGORIEEN } from "./motor/types";

export interface BeeldGroep {
  groep: string;
  kop: string;
  beelden: Illustratie[];
}

export interface BeeldSectie {
  categorie: string;
  kop: string;
  beelden: Illustratie[];
  /** Onderverdeling per groep, in volgorde van eerste voorkomen; beelden zonder groep komen in "Overig". */
  groepen: BeeldGroep[];
}

/** Verdeelt beelden per groep in volgorde van eerste voorkomen; niets gaat verloren. */
export function groepeerPerGroep(beelden: Illustratie[]): BeeldGroep[] {
  const volgorde: string[] = [];
  for (const b of beelden) {
    const g = b.groep || "overig";
    if (!volgorde.includes(g)) volgorde.push(g);
  }
  return volgorde.map((groep) => ({ groep, kop: hoofdletter(groep), beelden: beelden.filter((b) => (b.groep || "overig") === groep) }));
}

export function hoofdletter(t: string): string {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/** Groepeert per categorie in de vaste volgorde; onbekende categorieën komen erachter, niets gaat verloren. */
export function groepeerBeelden(beelden: Illustratie[]): BeeldSectie[] {
  const volgorde: string[] = [...CATEGORIEEN];
  for (const b of beelden) if (!volgorde.includes(b.categorie)) volgorde.push(b.categorie);
  return volgorde
    .map((categorie) => {
      const lijst = beelden.filter((b) => b.categorie === categorie);
      return { categorie, kop: hoofdletter(categorie), beelden: lijst, groepen: groepeerPerGroep(lijst) };
    })
    .filter((s) => s.beelden.length > 0);
}

export function beeldmateriaalSecties(): BeeldSectie[] {
  return groepeerBeelden(ILLUSTRATIES.beelden);
}

/** De rechtenzin op /beeldmateriaal en op elke detailpagina: één plek. */
export const RECHTEN_TEKST = "Alle illustraties zijn eigen werk van Communities Abroad. Ze zijn vrij te gebruiken op de eigen platforms van Communities Abroad: Nederlanders.fr, Infofrankrijk, nieuws.infofrankrijk.com en Infopoche. Gebruik door anderen is alleen toegestaan met schriftelijke toestemming. Vermeld bij gebruik: \u201cillustratie Communities Abroad\u201d.";

/** Een beeld voor de detailpagina /beeldmateriaal/[id]: server-side uit index.json; onbekend id geeft null (de pagina geeft dan 404). */
export function beeldDetail(id: string): (Illustratie & { categorieKop: string; groepKop: string }) | null {
  const b = ILLUSTRATIES.beelden.find((x) => x.id === id);
  if (!b) return null;
  return { ...b, categorieKop: hoofdletter(b.categorie), groepKop: hoofdletter(b.groep || "overig") };
}

/** Alle id's met een detailpagina (voor generateStaticParams en de sitemap). */
export const beeldIds = (): string[] => ILLUSTRATIES.beelden.map((b) => b.id);
