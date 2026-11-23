// De netwerkbalk van Communities Abroad: één bron voor namen, volgorde en adressen.
// Andere sites en tools kunnen dit bestand (of een kopie van de JSON-vorm) hergebruiken;
// per site verschilt alleen welke plek `hier` is. Richtlijn: docs/huisstijl/RICHTLIJNEN-huisstijl.md, regel 4.
export interface NetwerkLink { sleutel: string; naam: string; href: string }

export const NETWERK: NetwerkLink[] = [
  { sleutel: "infofrankrijk", naam: "Infofrankrijk", href: "https://infofrankrijk.com" },
  { sleutel: "nieuws", naam: "Nieuws", href: "https://nieuws.infofrankrijk.com" },
  { sleutel: "nederlanders", naam: "Nederlanders.fr", href: "https://www.nederlanders.fr" },
  { sleutel: "infopoche", naam: "Infopoche", href: "https://infopoche.fr" },
  { sleutel: "dossierfrankrijk", naam: "Dossier Frankrijk", href: "https://dossierfrankrijk.nl" },
  { sleutel: "cafeclaude", naam: "Café Claude", href: "https://www.cafeclaude.fr" },
  { sleutel: "nedergids", naam: "Nedergids", href: "https://nedergids.nl" },
];

export const NETWERK_RECHTS: NetwerkLink = { sleutel: "communitiesabroad", naam: "Communities Abroad", href: "https://www.communitiesabroad.com" };

export const NIEUWSBRIEF_URL = "https://laposta.nl/f/ssysinmqgflb";
