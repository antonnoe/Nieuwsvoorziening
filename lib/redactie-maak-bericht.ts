// "Maak bericht" bij een tip (redactie-app, 28-11-2026, herstelronde 1): uit de overheidsbron van de tip (die al in nv_bron_items staat, of een
// geplakte link van een overheidspagina) plus eventuele andere geschikte nieuwsitems schrijft de motor een echt bericht, met DEZELFDE synthese,
// kwaliteitspoort, PEIL-koppeling en beeldkeuze als de oogst (geen tweede schrijfopdracht).
// HARDE REGEL (besluit B, 28-11-2026): nooit iets uit de tipgever zelf: geen tekst, geen kop, en ook de werktitel van de tip gaat NIET meer naar het
// model. Het model schrijft alleen uit de overheidsbron en de gekoppelde nieuwsitems; werktitel en signaal_url blijven buiten de synthese-invoer.
import { normaliseerAdres } from "@/lib/bronontdekking";
import { regimeVoorDomein } from "@/lib/bronbeheer";
import { TIJDELIJK_MELDING, logReden } from "@/lib/redactie-melding";
import { redenTekst } from "@/lib/redactie";
import type { ModelClient } from "@/lib/motor/ai";
import { haalPagina, verrijkMetArtikelen } from "@/lib/motor/artikel";
import { laadBronnenLijst } from "@/lib/motor/bronnenlijst";
import { actieveGenerator, beeldResultaat, fotoSleutel, type BeeldGenerator } from "@/lib/motor/beeld";
import "@/lib/motor/beeld-unsplash";
import { REGELVERSIE, isVerbodenBron, laadConfig, type MotorConfig } from "@/lib/motor/config";
import { poortMetHerkansing } from "@/lib/motor/motor";
import type { Opslag } from "@/lib/motor/opslag";
import { laadPeil, peilKoppeling } from "@/lib/motor/peil";
import { isOverheidsUrl } from "@/lib/motor/radar";
import { berekenScore, clusterRegime } from "@/lib/motor/score";
import { synthetiseer } from "@/lib/motor/synthese";
import { hashId, overlap } from "@/lib/motor/tekst";
import { leesSignaal, type Bericht, type BronItem, type Cluster, type PeilKoppeling, type PeilParameter, type PeilSignaalIn, type PeilSignaalNieuw } from "@/lib/motor/types";

export const MELDING_GEEN_OVERHEIDSLINK = "Dit is geen overheidspagina. Gebruik een link van een .gouv.fr-site, service-public.fr, overheid.nl, rijksoverheid.nl of een andere publieke instelling.";
export const MELDING_LINK_ONLEESBAAR = "Deze pagina kon niet worden gelezen. Controleer de link, of probeer een andere pagina van de overheid.";
export const MELDING_GEEN_BRON = "Bij deze tip hoort nog geen overheidsbron. Plak de link van een overheidspagina.";
export const MELDING_AL_AFGEHANDELD = "Deze tip is al afgehandeld.";
export const MELDING_GEEN_BERICHT = "Er is geen bericht van te maken: de bronnen bevatten te weinig nieuws. De tip blijft staan.";
const OVERHEID_ITEMS_DAGEN = 35;
const MAX_EXTRA_ITEMS = 3;

/**
 * Moet bij een tip MET overheidsbron ook het veld "Plak de link van een overheidspagina" staan? Ja zodra een poging met die bron
 * is mislukt omdat de pagina niet te lezen was (of een geplakte link niet deugde): anders zit de redacteur vast.
 */
export function toonLinkVeld(aantalBronnen: number, isDezeTip: boolean, meldingTekst?: string | null, linkIngevuld?: string | null): boolean {
  if (aantalBronnen <= 0) return true;
  return isDezeTip && (meldingTekst === MELDING_LINK_ONLEESBAAR || !!(linkIngevuld && linkIngevuld.trim()));
}

export interface MaakOpties {
  opslag: Opslag;
  client: ModelClient | null;
  fetchFn?: typeof fetch;
  nu?: number;
  config?: MotorConfig;
  /** Voor tests: PEIL-parameters (anders gelezen van PEIL_URL; bij een storing geen koppeling). */
  peil?: PeilParameter[] | null;
  /** Voor tests: de beeldgenerator (null = geen Unsplash, wel een eigen illustratie). */
  generator?: BeeldGenerator | null;
}

export type MaakUitkomst =
  | { ok: true; berichtId: string; status: "gepubliceerd" | "concept"; melding: string }
  | { ok: false; melding: string };

/** Is dit een adres van de overheid of een publieke instelling (en nooit een tipgever)? */
export function isOverheidsLink(url: URL): boolean {
  if (isVerbodenBron(url.toString())) return false;
  return isOverheidsUrl(url.toString()) || regimeVoorDomein(url.hostname) === "overheid";
}

const bronNaamVan = (host: string) => host.replace(/^www\./, "");

/** Een geplakte link als bronitem: de pagina wordt gelezen met artikel.ts; de tekst wordt nooit bewaard, wel kop, korte omschrijving en url. */
async function itemUitLink(invoer: string, fetchFn: typeof fetch, nu: number): Promise<{ item: BronItem; tekst: string } | { fout: string }> {
  const u = normaliseerAdres(invoer);
  if (!u) return { fout: "Dit is geen geldige link. Plak het hele adres van de pagina." };
  u.hash = "";
  if (isVerbodenBron(u.toString())) return { fout: "Dit is een tipgever. Van een tipgever nemen we nooit iets over." };
  if (!isOverheidsLink(u)) return { fout: MELDING_GEEN_OVERHEIDSLINK };
  const p = await haalPagina(u.toString(), fetchFn);
  if (!p) return { fout: MELDING_LINK_ONLEESBAAR };
  // Het eindadres na redirects wordt opnieuw getoetst: een overheidslink mag niet bij een tipgever of een gewone site uitkomen.
  let eind: URL;
  try { eind = new URL(p.url || u.toString()); } catch { return { fout: MELDING_LINK_ONLEESBAAR }; }
  eind.hash = "";
  if (isVerbodenBron(eind.toString())) return { fout: "Dit is een tipgever. Van een tipgever nemen we nooit iets over." };
  if (!isOverheidsLink(eind)) return { fout: MELDING_GEEN_OVERHEIDSLINK };
  const host = bronNaamVan(eind.hostname);
  const nl = host === "overheid.nl" || host.endsWith(".overheid.nl") || host === "rijksoverheid.nl" || host.endsWith(".rijksoverheid.nl");
  return {
    tekst: p.tekst,
    item: {
      url: eind.toString(), bronId: `overheid-${host}`, bronNaam: host, regime: "overheid", groep: "overheid", taal: nl ? "nl" : "fr", land: nl ? "NL" : "FR",
      titel: p.titel, samenvatting: p.omschrijving, gepubliceerdOp: new Date(nu).toISOString(), opgehaaldOp: new Date(nu).toISOString(), prioriteit: 1,
    },
  };
}

/** Andere nieuwsitems uit de open pool die over hetzelfde gaan als de overheidsbron (overlap in de kop), nooit een verboden bron. */
function passendeExtraItems(pool: BronItem[], primair: BronItem[]): BronItem[] {
  const urls = new Set(primair.map((i) => i.url));
  const koppen = primair.map((i) => i.titel);
  return pool
    .filter((i) => !urls.has(i.url) && !isVerbodenBron(i.url) && !isVerbodenBron(i.bronId))
    .filter((i) => koppen.some((k) => { const x = overlap(i.titel, k); return x.gedeeld >= 2 && x.verhouding >= 0.5; }))
    .slice(0, MAX_EXTRA_ITEMS);
}

/**
 * Maakt een bericht bij een open tip. `link` is nodig als er bij de tip geen overheidsbron is.
 * Gelukt: bericht gepubliceerd, of concept (poort of relevantie); de tip krijgt status "al gepubliceerd" met het bericht-id.
 * Mislukt: een melding in gewone taal en de tip blijft open (er is dan ook niets gewijzigd aan de tip).
 */
export async function maakBerichtUitTip(o: MaakOpties, tipId: string, link?: string): Promise<MaakUitkomst> {
  const { opslag } = o;
  const nu = o.nu ?? Date.now();
  const fetchFn = o.fetchFn ?? fetch;
  const cfg = o.config ?? laadConfig();

  await laadBronnenLijst(opslag); // ververst de radardomeinen voor de harde regel (een tipgever is nooit bron)
  const tip = await opslag.radarRij(tipId);
  if (!tip) return { ok: false, melding: "Deze tip bestaat niet meer." };
  if (tip.besluit) return { ok: false, melding: MELDING_AL_AFGEHANDELD };
  if (tip.berichtId) {
    // Het onderwerp staat al in het nieuws: niets nieuws maken, de tip afsluiten en naar dat bericht.
    await opslag.zetRadarBesluit(tipId, "geaccepteerd", nu);
    return { ok: true, berichtId: tip.berichtId, status: "gepubliceerd", melding: "Dit onderwerp staat al in het nieuws." };
  }
  // 1. De overheidsbron: uit onze eigen opslag (de tip noemt de url), anders de geplakte link.
  let primair: BronItem[] = [];
  const nieuweItems: BronItem[] = [];
  const linkTeksten = new Map<string, string>();
  const bekend = tip.primaireBron?.filter((b) => b.url && !isVerbodenBron(b.url)) ?? [];
  if (bekend.length) {
    const items = await opslag.radarOverheidItems(new Date(nu - OVERHEID_ITEMS_DAGEN * 86400_000).toISOString()).catch(() => [] as BronItem[]);
    for (const b of bekend) {
      const i = items.find((x) => x.url === b.url);
      if (i) primair.push({ ...i });
      else {
        // De tip noemt een pagina die niet (meer) als item staat: lees de pagina zelf, dezelfde weg als bij een geplakte link.
        const r = await itemUitLink(b.url, fetchFn, nu);
        if (!("fout" in r)) { primair.push(r.item); nieuweItems.push(r.item); linkTeksten.set(r.item.url, r.tekst); }
      }
    }
  }
  if (!primair.length && link && link.trim()) {
    // Geen (leesbare) overheidsbron bij de tip: de geplakte link neemt het over.
    const r = await itemUitLink(link, fetchFn, nu);
    if ("fout" in r) return { ok: false, melding: r.fout };
    primair = [r.item];
    nieuweItems.push(r.item);
    linkTeksten.set(r.item.url, r.tekst);
  } else if (!bekend.length) {
    return { ok: false, melding: MELDING_GEEN_BRON };
  }
  if (!primair.length) return { ok: false, melding: MELDING_LINK_ONLEESBAAR };
  // Eerst de link, dan pas het model: een foute link krijgt altijd zijn eigen melding, ook als het model even niet beschikbaar is.
  if (!o.client) {
    logReden("maak bericht", "geen ANTHROPIC_API_KEY");
    return { ok: false, melding: TIJDELIJK_MELDING };
  }

  // 2. Een gelezen pagina wordt als bronitem bewaard (alleen kop, omschrijving en url; de tekst nooit).
  if (nieuweItems.length) await opslag.upsertItems(nieuweItems).catch((e) => logReden("bronitem bewaren", e));

  // 3. Eventuele andere geschikte nieuwsitems uit de open pool.
  const pool = await opslag.openItems(new Date(nu - cfg.venstersUren * 3600_000).toISOString()).catch(() => [] as BronItem[]);
  const extra = passendeExtraItems(pool, primair);
  const c: Cluster = { sleutel: "", items: [...primair, ...extra] };
  c.sleutel = hashId(c.items.map((i) => i.url).sort().join("|"));

  // 4. Schrijven: dezelfde synthese en poort als de motor.
  try {
    await verrijkMetArtikelen(c, fetchFn).catch(() => 0);
    for (const i of c.items) if (!i.artikelTekst && linkTeksten.has(i.url)) i.artikelTekst = linkTeksten.get(i.url);
    const eerste = await synthetiseer(c, o.client);
    if (!eerste) return { ok: false, melding: MELDING_GEEN_BERICHT };
    const { s, uitslag } = await poortMetHerkansing(eerste, c, o.client, cfg);

    const regime = clusterRegime(c);
    const bronnen = [...new Map(c.items.map((i) => [i.url, i])).values()]
      .sort((a, b) => a.gepubliceerdOp.localeCompare(b.gepubliceerdOp))
      .filter((i) => !isVerbodenBron(i.url))
      .map((i) => ({ naam: i.bronNaam, origineleKop: i.titel, datum: i.gepubliceerdOp, url: i.url }));
    const score = berekenScore(c, s.relevantie, nu);
    // De redactie koos zelf voor dit onderwerp: de poort en de relevantie beslissen, de scoredrempel niet.
    const status: Bericht["status"] = uitslag.ok && s.relevantie >= cfg.minRelevantie ? "gepubliceerd" : "concept";

    let koppeling: PeilKoppeling = { raakt: [], mogelijkGewijzigd: [] };
    let signalen: PeilSignaalNieuw[] = [];
    if (status === "gepubliceerd") {
      try {
        const peil = o.peil !== undefined ? o.peil ?? [] : await laadPeil(cfg.peilCacheMinuten, o.fetchFn);
        if (peil.length) {
          const p = await peilKoppeling({ kop: s.kop, samenvatting: s.samenvatting, tekst: s.tekst }, c.items.map((i) => `${i.titel} ${i.samenvatting}`).join("\n"), peil, o.client, cfg.peilKandidatenPerBericht, {
            publicatie: new Date(nu).toISOString(), bronUrl: bronnen[0]?.url ?? null, ontbreekt: s.portemonnee === true,
          });
          koppeling = p.koppeling;
          signalen = p.signalen;
        }
      } catch (e) {
        logReden("peil bij handmatig bericht", e); // geen koppeling; het bericht zelf gaat door
      }
    }

    let beeldUrl: string | null = null;
    let beeldCredit: Bericht["beeldCredit"] = null;
    if (status === "gepubliceerd") {
      try {
        const generator = o.generator === undefined ? actieveGenerator() : o.generator;
        generator?.startRun?.();
        const recent = await opslag.recenteBeeldUrls(100).catch(() => [] as string[]);
        const vermijd = new Set<string>(recent.slice(0, 60).map(fotoSleutel));
        const beeld = await beeldResultaat({ kop: s.kop, samenvatting: s.samenvatting, categorie: s.categorie, zoektermen: s.beeldZoektermen, zoekterm: s.beeldZoekterm, client: o.client, vermijd, recent }, generator);
        beeldUrl = beeld?.url ?? null;
        beeldCredit = beeld?.credit ?? null;
      } catch (e) {
        logReden("beeld bij handmatig bericht", e); // zonder beeld; de redactie kan een beeld kiezen
      }
    }

    const bericht: Bericht = {
      soort: regime, kop: s.kop, samenvatting: s.samenvatting, tekst: s.tekst, categorie: s.categorie, score, regime, status,
      blokkadeRedenen: uitslag.ok ? [] : uitslag.redenen, portemonnee: s.portemonnee === true, signaal: leesSignaal(s.signaal), signaalBeoordeeld: true, beeldUrl, beeldCredit,
      peil: koppeling, bronnen, gepubliceerdOp: new Date(nu).toISOString(), sleutel: c.sleutel, regelversie: REGELVERSIE,
    };
    const id = await opslag.slaBerichtOp(bericht);
    await opslag.markeerVerwerkt(c.items.map((i) => i.url), id, status).catch((e) => logReden("items markeren", e));
    if (signalen.length) await opslag.slaPeilSignalenOp(signalen.map((x): PeilSignaalIn => ({ ...x, berichtId: id }))).catch((e) => logReden("peil-signalen", e));
    await opslag.radarKoppelBericht(tipId, id, nu).catch((e) => logReden("tip koppelen", e));

    if (status === "gepubliceerd") return { ok: true, berichtId: id, status, melding: "Bericht gemaakt" };
    const bewaard = await opslag.redactieBericht(id).catch(() => null);
    const reden = (bewaard && redenTekst(bewaard)) || "Te weinig van belang voor onze lezers.";
    return { ok: true, berichtId: id, status, melding: `Opgeslagen als concept: ${reden}` };
  } catch (e) {
    logReden("maak bericht", e);
    return { ok: false, melding: "Het bericht maken is niet gelukt. De tip blijft staan, probeer het zo nog eens." };
  }
}
