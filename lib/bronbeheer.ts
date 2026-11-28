// Bronnen beheren vanuit de redactie-app: toevoegen (eerst testen, dan pas actief), hernoemen, soort aanpassen, weghalen.
// HARDE REGEL (afgedwongen in code en getest): een domein dat radarbron is, kan nooit nieuwsbron zijn, en omgekeerd.
// connexionfrance.com is altijd vast verboden als nieuwsbron, ook als de database onbereikbaar is (zie config.ts).
import { ontdekFeed } from "@/lib/bronontdekking";
import { BRON_SOORT_LABELS, laadBronnenLijst, soortVelden, type BronSoortLabel } from "@/lib/motor/bronnenlijst";
import { isVerbodenBron, kaleHost, zetRadarDomeinen } from "@/lib/motor/config";
import { TabelOntbreekt, type Opslag } from "@/lib/motor/opslag";
import type { BronRij, BronSoort } from "@/lib/motor/types";

export const MELDING_GEEN_FEED = "Geen feed gevonden op dit adres";
export const MELDING_GEEN_TABEL = "Bronnen aanpassen kan pas als de database is bijgewerkt (tabel nv_bronnen). Vraag de beheerder.";
export const MELDING_RADAR_NIET_NIEUWS = "Dit domein is een radarbron. Een radarbron geeft alleen onderwerpen aan en kan nooit ook nieuwsbron zijn.";
export const MELDING_NIEUWS_NIET_RADAR = "Dit domein is al een nieuwsbron. Een nieuwsbron kan niet ook radarbron zijn.";

export type BronUitkomst = { ok: true; melding: string; bron?: BronRij } | { ok: false; melding: string };

/** Regime volgens de afspraak: .gouv.fr, overheid.nl en rijksoverheid.nl zijn overheid, al het andere pers. */
export function regimeVoorDomein(domein: string): "overheid" | "pers" {
  const h = kaleHost(domein);
  return h === "gouv.fr" || h.endsWith(".gouv.fr") || h === "overheid.nl" || h.endsWith(".overheid.nl") || h === "rijksoverheid.nl" || h.endsWith(".rijksoverheid.nl") ? "overheid" : "pers";
}

/** Een redelijke eerste gok voor taal, land en groep op grond van het domein; de redactie kan de soort daarna aanpassen. */
export function raadBron(domein: string): { taal: string; land: string; groep: BronRij["groep"]; regime: "overheid" | "pers"; frankrijkFilter: boolean } {
  const h = kaleHost(domein);
  const regime = regimeVoorDomein(h);
  const eind = h.split(".").pop() || "";
  const [taal, land] = eind === "fr" ? ["fr", "FR"] : eind === "nl" ? ["nl", "NL"] : eind === "be" ? ["nl", "BE"] : ["en", eind.length === 2 ? eind.toUpperCase() : "GB"];
  if (regime === "overheid") return { taal, land, groep: "overheid", regime, frankrijkFilter: land !== "FR" };
  if (land === "NL" || land === "BE") return { taal, land, groep: "nl_vl_pers", regime, frankrijkFilter: true };
  if (land === "FR") return { taal, land, groep: "fr_pers", regime, frankrijkFilter: false };
  return { taal, land, groep: "buitenlandse_pers", regime, frankrijkFilter: true };
}

/** Een vrij id op basis van het domein ("lemonde.fr" wordt "lemonde-fr"); bij een bezet id komt er een nummer achter. */
export function maakBronId(domein: string, bestaand: string[], voorvoegsel = ""): string {
  const basis = `${voorvoegsel}${kaleHost(domein).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "bron"}`.slice(0, 60);
  if (!bestaand.includes(basis)) return basis;
  for (let n = 2; n < 100; n++) if (!bestaand.includes(`${basis}-${n}`)) return `${basis}-${n}`;
  return `${basis}-${Date.now()}`;
}

/** Leest de lijst en meldt of die uit de tabel komt (alleen dan kan er iets worden aangepast). */
async function lijstVoorSchrijven(opslag: Opslag): Promise<{ rijen: BronRij[] } | { melding: string }> {
  const l = await laadBronnenLijst(opslag);
  return l.uitTabel ? { rijen: l.rijen } : { melding: MELDING_GEEN_TABEL };
}

/** Voegt een bron toe na een test: lukt het lezen met minstens één item, dan staat de bron meteen actief in de lijst. */
export async function voegBronToe(opslag: Opslag, invoer: string, soort: BronSoort, door: string, fetchFn: typeof fetch = fetch, nu = Date.now()): Promise<BronUitkomst> {
  // Eerst de harde regel op het ingevoerde adres: voor een verboden domein gaat er geen enkele aanvraag uit.
  const huidig = await laadBronnenLijst(opslag);
  if (soort === "nieuws" && (isVerbodenBron(invoer) || isVerbodenBron(`https://${kaleHost(invoer)}`))) return { ok: false, melding: MELDING_RADAR_NIET_NIEUWS };
  if (soort === "radar" && huidig.rijen.some((r) => r.soort === "nieuws" && kaleHost(r.domein || r.feed) === kaleHost(invoer))) return { ok: false, melding: MELDING_NIEUWS_NIET_RADAR };
  if (!huidig.uitTabel) return { ok: false, melding: MELDING_GEEN_TABEL };

  const o = await ontdekFeed(invoer, soort, fetchFn);
  if (!o.ok) return { ok: false, melding: o.reden === "ongeldig" ? "Dit is geen geldig adres van een site of feed." : MELDING_GEEN_FEED };
  // Dezelfde regel nog eens op de gevonden feed (die kan op een ander domein staan).
  const domein = kaleHost(o.feed);
  if (soort === "nieuws" && isVerbodenBron(o.feed)) return { ok: false, melding: MELDING_RADAR_NIET_NIEUWS };
  if (soort === "radar" && huidig.rijen.some((r) => r.soort === "nieuws" && kaleHost(r.domein || r.feed) === domein)) return { ok: false, melding: MELDING_NIEUWS_NIET_RADAR };
  if (huidig.rijen.some((r) => r.feed === o.feed || (r.soort === soort && kaleHost(r.domein || r.feed) === domein && r.feed.replace(/\/+$/, "") === o.feed.replace(/\/+$/, "")))) return { ok: false, melding: "Deze bron staat er al." };

  const gok = raadBron(domein);
  const bron: BronRij = {
    id: maakBronId(domein, huidig.rijen.map((r) => r.id), soort === "radar" ? "radar-" : ""),
    naam: o.titel || domein, feed: o.feed, domein, taal: gok.taal, land: gok.land, groep: gok.groep, regime: gok.regime, status: "ACTIVE",
    prioriteit: 2, frankrijkFilter: soort === "radar" ? false : gok.frankrijkFilter, vensterUren: soort === "radar" ? 72 : 48,
    notitie: `Toegevoegd in de redactie-app; feed getest met ${o.aantalItems} items.`, soort, actief: true,
    toegevoegdOp: new Date(nu).toISOString(), toegevoegdDoor: door.slice(0, 80) || null,
    laatstGelezen: new Date(nu).toISOString(), laatstItems: new Date(nu).toISOString(), laatsteFout: null, uitsluit: null,
  };
  try {
    await opslag.bronOpslaan(bron);
  } catch (e) {
    if (e instanceof TabelOntbreekt) return { ok: false, melding: MELDING_GEEN_TABEL };
    return { ok: false, melding: "De bron kon niet worden bewaard. Probeer het later opnieuw." };
  }
  if (soort === "radar") zetRadarDomeinen([...huidig.rijen.filter((r) => r.soort === "radar" && r.actief).map((r) => r.domein || r.feed), bron.domein]);
  return { ok: true, melding: `Bron toegevoegd: ${bron.naam}`, bron };
}

/** Past de naam aan en, bij een nieuwsbron, de soort (overheid, pers of NL-BE). */
export async function wijzigBron(opslag: Opslag, id: string, v: { naam?: string; soort?: string }): Promise<BronUitkomst> {
  const l = await lijstVoorSchrijven(opslag);
  if ("melding" in l) return { ok: false, melding: l.melding };
  const rij = l.rijen.find((r) => r.id === id);
  if (!rij) return { ok: false, melding: "Deze bron bestaat niet meer." };
  const wijziging: Parameters<Opslag["bronWijzig"]>[1] = {};
  if (v.naam !== undefined) {
    const naam = v.naam.replace(/\s+/g, " ").trim();
    if (naam.length < 2 || naam.length > 80) return { ok: false, melding: "De naam moet tussen 2 en 80 tekens zijn." };
    wijziging.naam = naam;
  }
  if (v.soort !== undefined && rij.soort === "nieuws") {
    if (!(BRON_SOORT_LABELS as string[]).includes(v.soort)) return { ok: false, melding: "Onbekende soort." };
    Object.assign(wijziging, soortVelden(v.soort as BronSoortLabel, rij));
  }
  if (!Object.keys(wijziging).length) return { ok: false, melding: "Niets om te bewaren." };
  try {
    await opslag.bronWijzig(id, wijziging);
  } catch (e) {
    return { ok: false, melding: e instanceof TabelOntbreekt ? MELDING_GEEN_TABEL : "De wijziging kon niet worden bewaard." };
  }
  return { ok: true, melding: "Bewaard." };
}

/** Haalt een bron weg (uit de lijst; eerder opgehaalde items blijven staan). */
export async function verwijderBron(opslag: Opslag, id: string): Promise<BronUitkomst> {
  const l = await lijstVoorSchrijven(opslag);
  if ("melding" in l) return { ok: false, melding: l.melding };
  const rij = l.rijen.find((r) => r.id === id);
  if (!rij) return { ok: false, melding: "Deze bron bestond al niet meer." };
  try {
    await opslag.bronVerwijder(id);
  } catch (e) {
    return { ok: false, melding: e instanceof TabelOntbreekt ? MELDING_GEEN_TABEL : "Weghalen is niet gelukt." };
  }
  return { ok: true, melding: `Weggehaald: ${rij.naam}` };
}
