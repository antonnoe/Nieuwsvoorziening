// De handelingen van de redactie-app (28-11-2026), los van de pagina's zodat ze getest kunnen worden: weg en terugzetten, ander beeld
// uit de beeldbank, een beeld laten tekenen, radartips afhandelen en bronnen beheren. Elke handeling geeft een melding in gewoon Nederlands.
import { maakModelClient, type ModelClient } from "@/lib/motor/ai";
import { illustratieKeuzeRedactie, illustratieMetId, modelKandidaten, type Illustratie } from "@/lib/motor/illustraties";
import { MigratieOntbreekt, type Opslag, type OpgeslagenBericht } from "@/lib/motor/opslag";
import { RadarOntbreekt } from "@/lib/motor/radar";
import { MELDING_AL_AFGEHANDELD } from "@/lib/redactie-maak-bericht";
import type { BeeldCredit, BronSoort } from "@/lib/motor/types";
import { voegBronToe, verwijderBron, wijzigBron } from "@/lib/bronbeheer";
import { TIJDELIJK_MELDING, logReden } from "@/lib/redactie-melding";
import { maakBerichtUitTip, type MaakOpties } from "@/lib/redactie-maak-bericht";
import { radarBesluitUitvoeren } from "@/lib/redactie";
import type { Toegang } from "@/lib/redactie-toegang";
import { TEKEN_MELDING, controleerSvg, maakTekening, schoneNaam } from "@/lib/redactie-tekenen";
import { bewaarSvg, storageUitOmgeving, type StorageInstellingen } from "@/lib/tekeningen";

export const GEEN_MIGRATIE_REDACTIE = TIJDELIJK_MELDING;
export const ID_VORM = /^[0-9a-f-]{36}$/i;

export interface ActieUitkomst {
  ok: boolean;
  melding: string;
  /** Pad waar de bezoeker na de handeling heen gaat (altijd binnen /redactie). */
  terug: string;
  /** Extra waarden die met de melding meegaan in de url (bijvoorbeeld het adres dat niet lukte, om het in het veld te laten staan). */
  terugExtra?: Record<string, string>;
}

/** Voor de handelingen die een model of de database nodig hebben (alleen tests geven iets mee; anders de gewone instellingen). */
export interface ActieOpties {
  client?: ModelClient | null;
  peil?: MaakOpties["peil"];
  generator?: MaakOpties["generator"];
  nu?: number;
}

/** Alleen paden binnen /redactie, zonder rare tekens; anders de beginpagina. */
export function veiligTerug(pad: unknown): string {
  const p = typeof pad === "string" ? pad : "";
  return /^\/redactie(\/[A-Za-z0-9_-]+)*(\?[A-Za-z0-9=&_-]*)?$/.test(p) ? p : "/redactie";
}

/** Zet een melding aan een pad vast (voor de redirect), zonder vorige meldingen. */
export function metMelding(pad: string, melding: string, ok: boolean, extra: Record<string, string> = {}): string {
  const [basis, query = ""] = veiligTerug(pad).split("?");
  const q = new URLSearchParams(query);
  q.delete("m");
  q.delete("ok");
  q.set("m", melding.slice(0, 200));
  q.set("ok", ok ? "1" : "0");
  for (const [k, v] of Object.entries(extra)) if (/^[a-z]+$/.test(k) && v) q.set(k, v.slice(0, 300));
  return `${basis}?${q.toString()}`;
}

/** De zes best passende beelden uit de beeldbank voor dit bericht (modelKandidaten: score op kop en samenvatting, 13 nieuwste uitgesloten). */
export async function beeldbankKeuzes(opslag: Opslag, b: Pick<OpgeslagenBericht, "kop" | "samenvatting" | "categorie">): Promise<Illustratie[]> {
  const recent = await opslag.recenteBeeldUrls(100).catch(() => [] as string[]);
  return modelKandidaten({ kop: b.kop, samenvatting: b.samenvatting, categorie: b.categorie }, recent).slice(0, 6);
}

export async function kiesBeeldUitBeeldbank(opslag: Opslag, id: string, illustratieId: string): Promise<{ ok: boolean; melding: string }> {
  if (!ID_VORM.test(id)) return { ok: false, melding: "Dit bericht bestaat niet." };
  const i = illustratieMetId(illustratieId);
  if (!i) return { ok: false, melding: "Dit beeld staat niet in de beeldbank." };
  const b = await opslag.redactieBericht(id);
  if (!b) return { ok: false, melding: "Dit bericht bestaat niet." };
  const r = illustratieKeuzeRedactie(i);
  await opslag.zetBeeld(id, r.url, r.credit);
  return { ok: true, melding: `Beeld gewijzigd: ${i.naam}` };
}

/** Vraagt het synthesemodel een tekening bij dit bericht. Niets wordt opgeslagen. */
export async function tekenVoorBericht(opslag: Opslag, client: ModelClient | null, id: string): Promise<{ ok: true; svg: string; naam: string } | { ok: false; melding: string }> {
  if (!ID_VORM.test(id)) return { ok: false, melding: "Dit bericht bestaat niet." };
  const b = await opslag.redactieBericht(id);
  if (!b) return { ok: false, melding: "Dit bericht bestaat niet." };
  const u = await maakTekening(client, { kop: b.kop, samenvatting: b.samenvatting });
  return u.ok ? { ok: true, svg: u.svg, naam: u.naam } : { ok: false, melding: u.melding };
}

/** "Gebruiken": de SVG wordt opnieuw gecontroleerd, in Storage gezet, aan het bericht gehangen en op de lijst gezet. */
export async function gebruikTekening(opslag: Opslag, id: string, svgRuw: unknown, naamRuw: unknown, storage: StorageInstellingen | null = storageUitOmgeving()): Promise<{ ok: true; url: string; lijstBewaard: boolean } | { ok: false; melding: string }> {
  if (!ID_VORM.test(id)) return { ok: false, melding: "Dit bericht bestaat niet." };
  const c = controleerSvg(typeof svgRuw === "string" ? svgRuw : "");
  if (!c.ok) return { ok: false, melding: TEKEN_MELDING };
  const b = await opslag.redactieBericht(id);
  if (!b) return { ok: false, melding: "Dit bericht bestaat niet." };
  if (!storage) {
    logReden("tekening bewaren", "storage niet geconfigureerd");
    return { ok: false, melding: TIJDELIJK_MELDING };
  }
  const naam = schoneNaam(naamRuw);
  let url: string;
  try {
    url = await bewaarSvg(c.svg, storage);
  } catch (e) {
    logReden("tekening bewaren", e);
    return { ok: false, melding: "De tekening kon niet worden bewaard. Probeer het opnieuw." };
  }
  const credit: BeeldCredit = { bron: "Illustratie", maker: "Communities Abroad", naam, keuze: "getekend", png: null };
  await opslag.zetBeeld(id, url, credit);
  let lijstBewaard = true;
  try {
    await opslag.tekeningNoteer({ berichtId: id, url, naam, gemaaktOp: new Date().toISOString() });
  } catch {
    lijstBewaard = false; // het beeld staat er al; alleen de lijst voor de beeldbank mist (tabel nv_tekeningen)
  }
  return { ok: true, url, lijstBewaard };
}

/** Eén handeling uit een formulier. `f` bevat de velden als tekst. */
export async function voerActieUit(opslag: Opslag, toegang: Toegang, f: Record<string, string>, fetchFn: typeof fetch = fetch, opties: ActieOpties = {}): Promise<ActieUitkomst> {
  const terug = veiligTerug(f.terug);
  const klaar = (ok: boolean, melding: string, naar = terug, terugExtra?: Record<string, string>): ActieUitkomst => ({ ok, melding, terug: naar, ...(terugExtra ? { terugExtra } : {}) });
  const id = String(f.id || "").trim();
  try {
    switch (f.actie) {
      case "weg":
      case "terug": {
        if (!ID_VORM.test(id) || !(await opslag.redactieBericht(id))) return klaar(false, "Dit bericht bestaat niet.");
        await opslag.zetRedactie(id, f.actie === "weg" ? "weg" : null);
        // Na weghalen of terugzetten terug naar de lijst Vandaag, met de melding bovenaan.
        return klaar(true, f.actie === "weg" ? "Weggehaald: het bericht staat nergens meer." : "Teruggezet: het bericht staat er weer.", "/redactie");
      }
      case "beeld": {
        const u = await kiesBeeldUitBeeldbank(opslag, id, String(f.illustratie || ""));
        return klaar(u.ok, u.melding, u.ok ? "/redactie" : terug);
      }
      case "radar": {
        // Alleen "Negeer": een tip wordt een bericht via "Maak bericht" (maak-bericht), nooit met alleen een vinkje.
        if (!ID_VORM.test(id) || f.keuze !== "afgewezen") return klaar(false, "Dit kan niet.");
        const u = await radarBesluitUitvoeren(opslag, id, "afgewezen");
        if (!u.ok) return klaar(false, u.status === 409 ? MELDING_AL_AFGEHANDELD : "Deze tip bestaat niet meer.");
        return klaar(true, "Tip weggelegd.");
      }
      case "maak-bericht": {
        if (!ID_VORM.test(id)) return klaar(false, "Deze tip bestaat niet meer.");
        const client = opties.client !== undefined ? opties.client : maakModelClient(90_000);
        const u = await maakBerichtUitTip({ opslag, client, fetchFn, peil: opties.peil, generator: opties.generator, nu: opties.nu }, id, f.link);
        if (!u.ok) return klaar(false, u.melding, terug, { tip: id, ...(f.link ? { link: f.link } : {}) });
        return klaar(true, u.melding, `/redactie/bericht/${u.berichtId}`);
      }
      case "bron-toevoegen": {
        const soort: BronSoort = f.soort === "radar" ? "radar" : "nieuws";
        const u = await voegBronToe(opslag, String(f.adres || ""), soort, toegang.naam, fetchFn);
        return klaar(u.ok, u.melding, terug, !u.ok && f.adres ? { adres: f.adres } : undefined);
      }
      case "bron-wijzig": {
        const u = await wijzigBron(opslag, id, { naam: f.naam, soort: f.soort });
        return klaar(u.ok, u.melding);
      }
      case "bron-weg": {
        const u = await verwijderBron(opslag, id);
        return klaar(u.ok, u.melding);
      }
      case "mens-intrek": {
        if (toegang.rol !== "beheerder") return klaar(false, "Alleen de beheerder kan dit.", "/redactie");
        if (!ID_VORM.test(id)) return klaar(false, "Deze persoon bestaat niet.");
        await opslag.redacteurIntrekken(id);
        return klaar(true, "Ingetrokken: de link werkt niet meer.", "/redactie/mensen");
      }
      default:
        return klaar(false, "Onbekende handeling.");
    }
  } catch (e) {
    // De echte reden gaat naar het serverlog; de redacteur ziet alleen een zin in gewone taal.
    logReden(`actie ${f.actie}`, e);
    if (e instanceof MigratieOntbreekt || e instanceof RadarOntbreekt || (e instanceof Error && e.name === "TabelOntbreekt")) return klaar(false, TIJDELIJK_MELDING);
    return klaar(false, "Dat is niet gelukt. Probeer het later opnieuw.");
  }
}

/** De modelclient voor de tekenopdracht: ruim 100 seconden, want een tekening is een lang antwoord. */
export const tekenClient = () => maakModelClient(110_000);
