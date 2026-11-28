// De motor: oogst, groeperen, synthese, poort, score, PEIL, beeld, opslag.
// Elke stap faalt netjes: een fout wordt vastgelegd en de volgende stap gaat door
// met wat er wel is.
import { haalJson, type ModelClient } from "./ai";
import { laadConfig, modelSynthese, REGELVERSIE, MAX_HERSCHRIJVEN_PER_RUN, EENMALIGE_PEIL_HERTOETS, SIGNAAL_NALOOP_DAGEN, MAX_SIGNAAL_NALOOP_PER_RUN, type MotorConfig } from "./config";
import { aantalBronnen, clusterItems } from "./cluster";
import { oogstBronnen, type OogstBronResultaat } from "./feeds";
import { schoneZoektermen, beeldResultaat, fotoSleutel, type BeeldGenerator, actieveGenerator } from "./beeld";
import "./beeld-unsplash";
import { illustratieResultaatMetModel, dubbeleBeelden, pad, HARDE_UITSLUITING } from "./illustraties";

/** Stap 6b: hooguit zoveel dubbele illustraties op de eerste pagina per run herkiezen. */
export const MAX_DUBBEL_HERSTELLEN_PER_RUN = 3;
/** Stap 6b: hooguit zoveel berichten per run krijgen een nieuw beeld (Unsplash of trefwoordkeuze vervangen door modelkeuze). */
export const MAX_BEELD_HERKIEZEN_PER_RUN = 25;
export const BEELD_HERKIES_DAGEN = 30;
import type { Opslag, RunRecord, PeilSignaalIn, OpgeslagenBericht, BerichtHerschreven } from "./opslag";
import { laadPeil, peilKoppeling, type PeilOordeelLog } from "./peil";
import { kwaliteitsPoort, type PoortUitslag } from "./poort";
import { berekenScore, clusterRegime } from "./score";
import { synthetiseer, SYSTEEM_SYNTHESE, bouwInvoer, leesSynthese } from "./synthese";
import { verrijkMetArtikelen } from "./artikel";
import { modelGoedkoop } from "./config";
import { GEEN_ZIN, hashOmschrijving, maakLezerszin } from "./lezerszin";

export const MAX_LEZERSZINNEN_PER_RUN = 60;
export const MAX_LEZERSZIN_POGINGEN = 120;
import { overlap, hashId } from "./tekst";
import { kiesKandidaten } from "./kandidaten";
import { overheidPoort } from "./overheidpoort";
import { dagStart } from "./tijd";
import { leesSignaal, type Bericht, type Bron, type Cluster, type PeilParameter, type PeilSignaalNieuw, type StapResultaat, type Synthese } from "./types";
import { beoordeelSignaal } from "./signaal";
import { draaiRadar, RADAR_BEWAAR_DAGEN } from "./radar";
import { laadBronnenLijst, actieveNieuwsBronnen, actieveRadarBronnen } from "./bronnenlijst";
import { isVerbodenBron } from "./config";

export interface RunOpties {
  opslag: Opslag;
  client: ModelClient | null;
  droog?: boolean; // droog = niets naar Supabase (opslag is dan een geheugenopslag)
  nu?: number;
  config?: MotorConfig;
  bronnen?: Bron[];
  fetchFn?: typeof fetch;
  peil?: PeilParameter[] | null; // voor tests; anders gelezen van PEIL_URL
  generator?: BeeldGenerator | null;
  /** Tijdbudget (ms) voor het schrijven van kandidaten; daarna stopt de lus netjes (rest komt in de volgende run). */
  kandidaatBudgetMs?: number;
}

export interface RunUitslag {
  stappen: StapResultaat[];
  aantallen: Record<string, number>;
  berichten: Bericht[];
  fouten: string[];
}

const ZOEKTERMEN_SYSTEEM = `Geef een JSON-lijst van 3 Engelse zoektermen van 2 tot 4 woorden om een foto te zoeken die zichtbaar bij dit nieuwsbericht past, van specifiek naar algemeen. Zoek het onderwerp zelf, letterlijk en concreet (bijvoorbeeld "flooded street", "airplane factory", "fuel pump prices"), niet de streek of een beroemde plek. Nooit een persoon of naam. Alleen de JSON-lijst.`;

/** Poort met één herkansing (met de redenen erbij). Geeft de beste synthese en haar uitslag. */
async function poortMetHerkansing(s: Synthese, c: Cluster, client: ModelClient, cfg: MotorConfig): Promise<{ s: Synthese; uitslag: PoortUitslag }> {
  let uitslag = kwaliteitsPoort(s, c, cfg);
  if (!uitslag.ok) {
    try {
      const antw = await client.tekst({
        model: modelSynthese(), system: SYSTEEM_SYNTHESE, maxTokens: 2200,
        user: `${bouwInvoer(c)}\n\nJe vorige versie werd afgekeurd om deze redenen: ${uitslag.redenen.join("; ")}. Schrijf opnieuw en vermijd precies deze fouten.`,
      });
      const s2 = leesSynthese(antw);
      if (s2) {
        const u2 = kwaliteitsPoort(s2, c, cfg);
        if (u2.ok || u2.redenen.length < uitslag.redenen.length) ((s = s2), (uitslag = u2));
      }
    } catch { /* eerste uitslag blijft staan */ }
  }
  return { s, uitslag };
}

/** De opgeslagen bronnen van een bericht als cluster (naam, originele kop, url, datum); de omschrijving is niet bewaard. */
export function clusterUitBericht(b: OpgeslagenBericht): Cluster {
  return {
    sleutel: b.id,
    items: b.bronnen.map((x) => ({
      url: x.url, bronId: x.naam, bronNaam: x.naam, regime: b.regime, groep: b.regime === "overheid" ? "overheid" : "fr_pers",
      taal: "", land: "", titel: x.origineleKop, samenvatting: "", gepubliceerdOp: x.datum || b.gepubliceerdOp,
    })),
  };
}

const VENSTER_HERSCHRIJVEN_UREN = 48;

const fout = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/** Tijdsbudget van een run: de functie mag 800 s duren; na dit budget slaan de optionele stappen (6a, 6b, 6c) over, zodat de run altijd wordt opgeslagen. */
export const RUN_BUDGET_MS = 480_000;
/**
 * Tijdbudget voor de kandidatenlus (besluit 26-11-2026, plafond per run 10). De functie mag 800 s duren (maxDuration);
 * gemeten kost een run met 6 kandidaten ongeveer 2 minuten in totaal (docs/drempelanalyse.md), dus circa 15 tot 20 s
 * per kandidaat. Bij 10 kandidaten is dat ruim onder het budget; een trage dag (herkansing, artikelen, Unsplash) breekt
 * de lus na dit budget netjes af. Wat niet is verwerkt blijft open en komt in de volgende run terug. De optionele
 * stappen 6a, 6b en 6c houden zo minstens RUN_BUDGET_MS min dit budget over.
 */
export const KANDIDAAT_BUDGET_MS = 330_000;

export async function draaiOogst(o: RunOpties): Promise<RunUitslag> {
  const nu = o.nu ?? Date.now();
  const startTijd = Date.now();
  const tijdOver = () => Date.now() - startTijd < RUN_BUDGET_MS;
  const cfg = o.config ?? laadConfig();
  const stappen: StapResultaat[] = [];
  const aantallen: Record<string, number> = {};
  const berichten: Bericht[] = [];
  const fouten: string[] = [];
  const gestart = new Date(nu).toISOString();
  const noteer = (s: StapResultaat) => {
    stappen.push(s);
    if (!s.ok && s.fout) fouten.push(`${s.stap}: ${s.fout}`);
  };

  // 0. Bronnenlijst (28-11-2026): uit de tabel nv_bronnen, anders (tabel ontbreekt, leeg of storing) uit data/bronnen.json.
  // Deze stap zet ook de radardomeinen, zodat een radardomein nooit als nieuwsbron kan worden geoogst.
  const lijst = await laadBronnenLijst(o.opslag);
  if (!lijst.uitTabel) aantallen.bronnenUitTerugval = 1;

  // 1. Oogst
  let items: Awaited<ReturnType<typeof oogstBronnen>>["items"] = [];
  let bronResultaten: OogstBronResultaat[] = [];
  try {
    const bronnen = o.bronnen ?? actieveNieuwsBronnen(lijst.rijen);
    const r = await oogstBronnen(bronnen, { nu, maxPerBron: cfg.maxItemsPerBron, fetchFn: o.fetchFn });
    items = r.items;
    bronResultaten = r.resultaten;
    const geweerd: Record<string, number> = {};
    for (const b of r.resultaten) for (const [k, v] of Object.entries(b.geweerd)) geweerd[k] = (geweerd[k] || 0) + v;
    aantallen.bronnen = bronnen.length;
    aantallen.bronnenOk = r.resultaten.filter((x) => x.ok).length;
    aantallen.itemsGelezen = r.resultaten.reduce((a, b) => a + b.gelezen, 0);
    aantallen.itemsNaZeef = items.length;
    const mislukt = r.resultaten.filter((x) => !x.ok);
    aantallen.bronnenMislukt = mislukt.length;
    noteer({ stap: "oogst", ok: true, aantal: items.length, detail: { geweerd, mislukteBronnen: mislukt.map((x) => `${x.bronId}: ${x.fout}`) } });
    // Leesresultaat per bron bewaren voor het scherm Bronnen (kleur, laatste leesmoment); een storing of ontbrekende tabel breekt niets.
    if (lijst.uitTabel) {
      const gelezenOp = new Date(nu).toISOString();
      await o.opslag.bronGelezen(r.resultaten.map((x) => ({ id: x.bronId, gelezenOp, items: x.ok && x.gelezen > 0, fout: x.ok ? null : x.fout ?? "Onbekende fout" }))).catch(() => {});
    }
    if (mislukt.length) noteer({ stap: "bronnen_mislukt", ok: false, aantal: mislukt.length, fout: mislukt.map((x) => `${x.bronId} (${x.fout})`).join(", ").slice(0, 400) });
  } catch (e) {
    noteer({ stap: "oogst", ok: false, fout: fout(e) });
  }

  // 2. Opslaan van ruwe items (ontdubbeld op url)
  try {
    const nieuw = await o.opslag.upsertItems(items);
    aantallen.itemsNieuw = nieuw;
    noteer({ stap: "bewaar_items", ok: true, aantal: nieuw });
  } catch (e) {
    noteer({ stap: "bewaar_items", ok: false, fout: fout(e) });
  }

  // 2b. Radar (28-11-2026): onderwerpsignalen uit de nieuws-sitemap van een Engelstalig medium. UITSLUITEND signaal, nooit bron:
  // alleen titels gaan naar het goedkope model, er wordt geen artikel opgehaald, niets komt in items, bronnen of publicaties.
  // Een signaal dat bij een Franse overheidsbron in onze eigen opslag past, geeft dat overheidsonderwerp voorrang in stap 5.
  // Faalt de radar (of ontbreekt de tabel nv_radar), dan gaat de motor gewoon door.
  const voorrang = new Set<string>();
  try {
    const r = await draaiRadar({ opslag: o.opslag, client: o.client, fetchFn: o.fetchFn, nu, radarBronnen: actieveRadarBronnen(lijst.rijen), bronnenUitTabel: lijst.uitTabel });
    for (const u of r.voorrangUrls) voorrang.add(u);
    aantallen.radarNieuw = r.nieuw;
    noteer({ stap: "radar", ok: r.ok, aantal: r.nieuw, fout: r.fout, detail: r.detail });
  } catch (e) {
    noteer({ stap: "radar", ok: false, fout: fout(e) });
  }

  // 3. Open pool binnen het venster
  const sinds = new Date(nu - cfg.venstersUren * 3600_000).toISOString();
  let pool = items;
  try {
    pool = await o.opslag.openItems(sinds);
    aantallen.poolOpen = pool.length;
  } catch (e) {
    noteer({ stap: "lees_pool", ok: false, fout: `${fout(e)} (terugval: alleen items van deze run)` });
  }
  pool = pool.slice(0, cfg.maxClusterItems);

  // 4. Groeperen
  let clusters: Cluster[] = [];
  try {
    const r = await clusterItems(pool, o.client);
    clusters = r.clusters;
    aantallen.clusters = clusters.length;
    noteer({ stap: "clusteren", ok: !r.fout, aantal: clusters.length, fout: r.fout, detail: { model: r.gebruiktModel } });
  } catch (e) {
    noteer({ stap: "clusteren", ok: false, fout: fout(e) });
  }

  // 5. Kandidaten: genoeg bronnen, geen dubbel van een recent bericht, ruimte per dag
  let kandidaten: Cluster[] = [];
  try {
    const bronKoppen = await o.opslag.recenteBronKoppen(new Date(nu - 48 * 3600_000).toISOString()).catch(() => [] as string[]);
    const genoegBronnen = clusters.filter((c) => (clusterRegime(c) === "overheid" ? aantalBronnen(c) >= cfg.minBronnenOverheid : aantalBronnen(c) >= cfg.minBronnenPers));
    aantallen.clustersGenoegBronnen = genoegBronnen.length;
    // Overheidsstroom: Nederlands binnenlands bestuur (R17) en Caribisch Nederland komen niet door, vóór de synthese.
    const genoeg: Cluster[] = [];
    let r17 = 0, caribisch = 0;
    for (const c of genoegBronnen) {
      const u = overheidPoort(c);
      if (u.door) { genoeg.push(c); continue; }
      if (u.reden === "caribisch") caribisch += 1; else r17 += 1;
      await o.opslag.markeerVerwerkt(c.items.map((i) => i.url), null, u.reden as string).catch(() => {});
    }
    aantallen.overheidR17 = r17;
    aantallen.overheidCaribisch = caribisch;
    const nietDubbel: Cluster[] = [];
    for (const c of genoeg) {
      const dubbel = bronKoppen.some((k) => c.items.some((i) => { const x = overlap(i.titel, k); return x.gedeeld >= 2 && x.verhouding >= 0.5; }));
      if (dubbel) await o.opslag.markeerVerwerkt(c.items.map((i) => i.url), null, "dubbel").catch(() => {});
      else nietDubbel.push(c);
    }
    const vandaag = await o.opslag.telGepubliceerdSinds(dagStart(nu)).catch(() => 0);
    const ruimte = Math.max(0, cfg.maxBerichtenPerDag - vandaag);
    // Volgorde op verwachte relevantie (niet meer alleen op aantal bronnen), binnen de ruimte van vandaag.
    kandidaten = kiesKandidaten(nietDubbel, cfg.maxSynthesesPerRun, ruimte, voorrang);
    aantallen.radarVoorrang = kandidaten.filter((c) => c.items.some((i) => voorrang.has(i.url))).length;
    aantallen.kandidaten = kandidaten.length;
    noteer({ stap: "selecteer", ok: true, aantal: kandidaten.length, detail: { vandaagGepubliceerd: vandaag, ruimte } });
  } catch (e) {
    noteer({ stap: "selecteer", ok: false, fout: fout(e) });
  }

  // 6. Synthese, poort, score, PEIL, beeld, opslag
  const beeldGen = o.generator === undefined ? actieveGenerator() : o.generator;
  beeldGen?.startRun?.(); // Unsplash-aanvraagbudget per run
  // Nooit dezelfde foto bij twee berichten: de foto's van de laatste 60 berichten worden vermeden, ook binnen deze run.
  const vermijd = new Set<string>();
  // Recente beeld-urls, nieuwste eerst: voor "langst niet gebruikt" bij de eigen illustraties (hergebruik is toegestaan).
  const recent: string[] = [];
  try {
    const urls = await o.opslag.recenteBeeldUrls(100);
    recent.push(...urls);
    for (const u of urls.slice(0, 60)) vermijd.add(fotoSleutel(u));
  } catch (e) {
    noteer({ stap: "beeld_vermijden", ok: false, fout: fout(e) });
  }
  if (!o.client) {
    noteer({ stap: "synthese", ok: true, aantal: 0, detail: { overgeslagen: "geen ANTHROPIC_API_KEY (synthese ongetest in deze run)" } });
  } else if (kandidaten.length) {
    let peil: PeilParameter[] = o.peil ?? [];
    if (!o.peil) {
      try {
        peil = await laadPeil(cfg.peilCacheMinuten, o.fetchFn);
        aantallen.peilParameters = peil.length;
      } catch (e) {
        noteer({ stap: "peil_laden", ok: false, fout: fout(e) });
      }
    }
    const generator = o.generator === undefined ? actieveGenerator() : o.generator;
    let gepubliceerd = 0, geblokkeerd = 0, concept = 0, mislukt = 0, signalenAantal = 0, artikelen = 0, peilAanroepen = 0;
    const kandidaatBudget = o.kandidaatBudgetMs ?? KANDIDAAT_BUDGET_MS;
    let overgeslagenTijd = 0;
    for (const c of kandidaten) {
      if (Date.now() - startTijd >= kandidaatBudget) { overgeslagenTijd += 1; continue; }
      try {
        artikelen += await verrijkMetArtikelen(c, o.fetchFn ?? fetch).catch(() => 0);
        let s: Synthese | null = await synthetiseer(c, o.client);
        let uitslag: PoortUitslag;
        if (!s) {
          await o.opslag.markeerVerwerkt(c.items.map((i) => i.url), null, "te_weinig_inhoud");
          continue;
        }
        ({ s, uitslag } = await poortMetHerkansing(s, c, o.client, cfg));
        const regime = clusterRegime(c);
        const score = berekenScore(c, s.relevantie, nu);
        const bronnen = [...new Map(c.items.map((i) => [i.url, i])).values()]
          .sort((a, b) => a.gepubliceerdOp.localeCompare(b.gepubliceerdOp))
          .filter((i) => !isVerbodenBron(i.url)) // harde regel: een verboden brondomein staat nooit in het bronnenblok
          .map((i) => ({ naam: i.bronNaam, origineleKop: i.titel, datum: i.gepubliceerdOp, url: i.url }));
        const status: Bericht["status"] = !uitslag.ok ? "geblokkeerd" : score >= cfg.publiceerDrempel && s.relevantie >= cfg.minRelevantie ? "gepubliceerd" : "concept";
        let koppeling = { raakt: [], mogelijkGewijzigd: [] } as Bericht["peil"];
        let peilSignalen: PeilSignaalNieuw[] = [];
        let peilLog: PeilOordeelLog[] = [];
        if (status === "gepubliceerd" && peil.length) {
          const p = await peilKoppeling({ kop: s.kop, samenvatting: s.samenvatting, tekst: s.tekst }, c.items.map((i) => `${i.titel} ${i.samenvatting}`).join("\n"), peil, o.client, cfg.peilKandidatenPerBericht, {
            publicatie: new Date(nu).toISOString(), bronUrl: bronnen[0]?.url ?? null, ontbreekt: s.portemonnee === true,
          });
          koppeling = p.koppeling;
          peilSignalen = p.signalen;
          peilAanroepen += p.aanroepen;
          peilLog = p.oordelen;
          if (p.fout) noteer({ stap: "peil_oordeel", ok: false, fout: p.fout });
        }
        const beeld = status === "gepubliceerd" ? await beeldResultaat({ kop: s.kop, samenvatting: s.samenvatting, categorie: s.categorie, zoektermen: s.beeldZoektermen, zoekterm: s.beeldZoekterm, client: o.client, vermijd, recent }, generator) : null;
        const beeldUrl = beeld?.url ?? null;
        const beeldCredit = beeld?.credit ?? null;
        const bericht: Bericht = {
          soort: regime, kop: s.kop, samenvatting: s.samenvatting, tekst: s.tekst, categorie: s.categorie, score, regime, status,
          blokkadeRedenen: uitslag.redenen, portemonnee: s.portemonnee === true, signaal: leesSignaal(s.signaal), signaalBeoordeeld: true, beeldUrl, beeldCredit, peil: koppeling, bronnen, gepubliceerdOp: new Date(nu).toISOString(),
          sleutel: hashId(c.items.map((i) => i.url).sort().join("|")), regelversie: REGELVERSIE,
        };
        const id = await o.opslag.slaBerichtOp(bericht);
        bericht.id = id;
        berichten.push(bericht);
        await o.opslag.markeerVerwerkt(c.items.map((i) => i.url), id, status);
        if (peilLog.length) noteer({ stap: "peil_oordeel", ok: true, detail: { bericht: id.slice(0, 8), kandidaten: peilLog.filter((l) => l.p !== "ontbreekt").map((l) => l.p), oordelen: peilLog } });
        const signalen: PeilSignaalIn[] = peilSignalen.map((x) => ({ ...x, berichtId: id }));
        if (signalen.length) signalenAantal += await o.opslag.slaPeilSignalenOp(signalen).catch((e) => (noteer({ stap: "peil_signaal", ok: false, fout: fout(e) }), 0));
        if (status === "gepubliceerd") gepubliceerd += 1;
        else if (status === "geblokkeerd") geblokkeerd += 1;
        else concept += 1;
      } catch (e) {
        mislukt += 1;
        noteer({ stap: "synthese_cluster", ok: false, fout: fout(e) });
      }
    }
    Object.assign(aantallen, { gepubliceerd, geblokkeerd, concept, syntheseMislukt: mislukt, peilSignalen: signalenAantal, peilModelAanroepen: peilAanroepen, artikelenGelezen: artikelen, kandidatenTijdOvergeslagen: overgeslagenTijd });
    noteer({ stap: "synthese", ok: true, aantal: berichten.length, detail: { gepubliceerd, geblokkeerd, concept, mislukt, ...(overgeslagenTijd ? { tijdbudgetBereikt: overgeslagenTijd } : {}) } });
  } else {
    noteer({ stap: "synthese", ok: true, aantal: 0, detail: { reden: "geen kandidaten" } });
  }

  // 6a. Herschrijven: gepubliceerde berichten van de laatste 48 uur die met oudere schrijfregels zijn gemaakt (regelversie < REGELVERSIE)
  // worden opnieuw geschreven uit de opgeslagen bronnen (artikeltekst opnieuw opgehaald), hooguit MAX_HERSCHRIJVEN_PER_RUN per run.
  // Zelfde id, foto en bronnen blijven. Poort of relevantie faalt, of het model geeft publiceren=false: status concept (niet verwijderd).
  // Een fout bij het model of de opslag laat het bericht staan voor de volgende run.
  if (o.client) {
    try {
      const lijst = await o.opslag.teHerschrijven(new Date(nu - VENSTER_HERSCHRIJVEN_UREN * 3600_000).toISOString(), REGELVERSIE, MAX_HERSCHRIJVEN_PER_RUN);
      let herschreven = 0, naarConcept = 0, mislukt = 0;
      for (const b of lijst) {
        if (!tijdOver()) break;
        if (b.handmatigOp) continue; // een correctie van de beheerder gaat voor: nooit herschrijven
        try {
          const c = clusterUitBericht(b);
          if (!c.items.length) { mislukt += 1; continue; }
          await verrijkMetArtikelen(c, o.fetchFn ?? fetch).catch(() => 0);
          const eerste = await synthetiseer(c, o.client);
          let v: BerichtHerschreven;
          if (!eerste) {
            v = { kop: b.kop, samenvatting: b.samenvatting, tekst: b.tekst, categorie: b.categorie, portemonnee: b.portemonnee === true, status: "concept", blokkadeRedenen: ["herschrijven: model gaf geen bericht (publiceren=false)"], regelversie: REGELVERSIE };
          } else {
            const { s, uitslag } = await poortMetHerkansing(eerste, c, o.client, cfg);
            const goed = uitslag.ok && s.relevantie >= cfg.minRelevantie;
            v = {
              kop: s.kop, samenvatting: s.samenvatting, tekst: s.tekst, categorie: s.categorie, portemonnee: s.portemonnee === true, signaal: leesSignaal(s.signaal), signaalBeoordeeld: true,
              status: goed ? "gepubliceerd" : "concept",
              blokkadeRedenen: uitslag.ok ? (goed ? [] : [`herschrijven: relevantie ${s.relevantie} onder ${cfg.minRelevantie}`]) : uitslag.redenen,
              regelversie: REGELVERSIE,
            };
          }
          await o.opslag.werkBerichtBij(b.id, v);
          if (v.status === "gepubliceerd") herschreven += 1;
          else naarConcept += 1;
        } catch (e) {
          mislukt += 1;
          noteer({ stap: "herschrijf_bericht", ok: false, fout: fout(e) });
        }
      }
      Object.assign(aantallen, { herschreven, herschrevenNaarConcept: naarConcept, herschrijfMislukt: mislukt });
      noteer({ stap: "herschrijven", ok: true, aantal: herschreven, detail: { teHerschrijven: lijst.length, naarConcept, mislukt } });
    } catch (e) {
      noteer({ stap: "herschrijven", ok: false, fout: fout(e) });
    }
  }

  // 6b. Beeld aanvullen: gepubliceerde berichten zonder beeld krijgen er alsnog een (hooguit 10 per run;
  // de generator bewaakt zelf het aanvraagbudget en stopt netjes bij een uitgeputte limiet).
  {
    const generator = o.generator === undefined ? actieveGenerator() : o.generator;
    {
      try {
        let aangevuld = 0;
        for (const b of await o.opslag.zonderBeeld(10)) {
          if (!tijdOver()) break;
          let zoektermen: string[] | undefined;
          if (o.client && generator) {
            const antw = await o.client
              .tekst({ model: modelGoedkoop(), maxTokens: 100, system: ZOEKTERMEN_SYSTEEM, user: `${b.kop}\n${b.samenvatting}` })
              .catch(() => "");
            zoektermen = schoneZoektermen(haalJson<unknown>(antw) ?? []);
          }
          const r = await beeldResultaat({ kop: b.kop, samenvatting: b.samenvatting, categorie: b.categorie, zoektermen, client: o.client, vermijd, recent }, generator);
          if (r) (await o.opslag.zetBeeld(b.id, r.url, r.credit ?? null), (aangevuld += 1));
        }
        aantallen.beeldAangevuld = aangevuld;
        // Herkiezen (besluit 28-11-2026): Unsplash-foto's en illustraties zonder modelkeuze, laatste 30 dagen, nieuwste eerst.
        let herkozen = 0;
        for (const b of await o.opslag.teHerkiezenBeeld(new Date(nu - BEELD_HERKIES_DAGEN * 864e5).toISOString(), MAX_BEELD_HERKIEZEN_PER_RUN)) {
          if (!tijdOver()) break;
          try {
            const r = await illustratieResultaatMetModel({ kop: b.kop, samenvatting: b.samenvatting, categorie: b.categorie }, o.client, recent);
            if (!r) continue;
            await o.opslag.zetBeeld(b.id, r.url, r.credit);
            recent.unshift(r.url);
            herkozen += 1;
          } catch (e) {
            noteer({ stap: "beeld_herkiezen", ok: false, fout: fout(e) });
          }
        }
        aantallen.beeldHerkozen = herkozen;
        // Dubbelen op de eerste pagina (besluit 28-11-2026): dezelfde illustratie bij twee van de 13 nieuwste zichtbare berichten.
        // Het oudere bericht krijgt een nieuwe keuze met de andere 12 als harde uitsluiting; handmatige keuzes blijven staan.
        let dubbelHersteld = 0;
        try {
          const eerste = await o.opslag.berichten({ limiet: HARDE_UITSLUITING });
          for (const b of dubbeleBeelden(eerste).slice(0, MAX_DUBBEL_HERSTELLEN_PER_RUN)) {
            if (!tijdOver()) break;
            const uitsluit = eerste.filter((x) => x.id !== b.id && x.beeldUrl).map((x) => x.beeldUrl as string);
            const r = await illustratieResultaatMetModel({ kop: b.kop, samenvatting: b.samenvatting, categorie: b.categorie }, o.client, recent, undefined, uitsluit);
            if (!r || pad(r.url) === pad(b.beeldUrl || "")) continue;
            await o.opslag.zetBeeld(b.id, r.url, r.credit);
            recent.unshift(r.url);
            dubbelHersteld += 1;
          }
        } catch (e) {
          noteer({ stap: "beeld_dubbel", ok: false, fout: fout(e) });
        }
        aantallen.beeldDubbelHersteld = dubbelHersteld;
        noteer({ stap: "beeld_aanvullen", ok: true, aantal: aangevuld, detail: { herkozen, dubbelHersteld } });
      } catch (e) {
        noteer({ stap: "beeld_aanvullen", ok: false, fout: fout(e) });
      }
    }
  }

  // 6c. Leesbare zinnen voor de aangekondigde PEIL-wijzigingen. Plafond: 60 gelukte zinnen per run (een zin of GEEN);
  // een modelfout of afkeuring telt daar niet voor mee (anders blokkeren steeds dezelfde mislukkingen het werk), maar er is
  // wel een harde bovengrens van 120 modelaanroepen per run. Redenen van afkeuring komen in de stapdetails (zonder sleutelwaarden).
  if (o.client) {
    try {
      const parameters = o.peil ?? (await laadPeil(cfg.peilCacheMinuten, o.fetchFn));
      const bestaand = await o.opslag.lezerszinnen();
      let gemaakt = 0, geen = 0, afgekeurd = 0, pogingen = 0;
      const redenen: string[] = [];
      for (const p of parameters) {
        if (!tijdOver()) break;
        const om = p.aangekondigd?.omschrijving;
        if (!om) continue;
        const h = hashOmschrijving(om);
        if (bestaand.get(p.id)?.hash === h) continue;
        if (gemaakt + geen >= MAX_LEZERSZINNEN_PER_RUN || pogingen >= MAX_LEZERSZIN_POGINGEN) break;
        pogingen += 1;
        const u = await maakLezerszin(p.naam, om, o.client, p.aangekondigd?.datum ?? null);
        if (u.zin === null) {
          afgekeurd += 1;
          if (redenen.length < 30) redenen.push(`${p.id}: ${u.reden}`);
          continue;
        }
        await o.opslag.zetLezerszin(p.id, h, u.zin, u.titel);
        if (u.zin === GEEN_ZIN) geen += 1;
        else gemaakt += 1;
      }
      aantallen.lezerszinnen = gemaakt;
      noteer({ stap: "peil_lezerszinnen", ok: true, aantal: gemaakt, detail: { geenGevolg: geen, afgekeurd, pogingen, redenen } });
    } catch (e) {
      noteer({ stap: "peil_lezerszinnen", ok: false, fout: fout(e) });
    }
  }

  // 6d. Eenmalig: oude PEIL-koppelingen (zonder zekerheid, van vóór "PEIL streng", 26-11-2026) van de laatste 14 dagen
  // opnieuw toetsen met twee controles; hooguit 10 berichten per run. Faalt een controle door een modelfout, dan blijft het
  // bericht staan voor de volgende run (lezers zien oude koppelingen sowieso niet meer). Oude signalen worden gesloten.
  if (o.client) {
    try {
      const parameters = o.peil ?? (await laadPeil(cfg.peilCacheMinuten, o.fetchFn));
      const lijst = await o.opslag.teToetsenPeil(new Date(nu - 14 * 86400_000).toISOString(), 10, EENMALIGE_PEIL_HERTOETS);
      let getoetst = 0, behouden = 0, gewist = 0, uitgesteld = 0, signalen = 0;
      const perBericht: Record<string, unknown>[] = [];
      for (const b of lijst) {
        if (!tijdOver()) break;
        // Zoals de gewone oogst: bronkop en bronsamenvatting (de samenvatting komt uit de opgeslagen bronitems, voor zover die er nog zijn).
        const samenv = await o.opslag.bronSamenvattingen(b.bronnen.map((x) => x.url)).catch(() => new Map<string, string>());
        const t = await peilKoppeling({ kop: b.kop, samenvatting: b.samenvatting, tekst: b.tekst }, b.bronnen.map((x) => `${x.origineleKop} ${samenv.get(x.url) || ""}`.trim()).join("\n"), parameters, o.client, cfg.peilKandidatenPerBericht, {
          publicatie: b.gepubliceerdOp, bronUrl: b.bronnen[0]?.url ?? null, ontbreekt: false,
        });
        perBericht.push({ bericht: b.id.slice(0, 8), kandidaten: t.kandidaten.map((k) => k.id), oordelen: t.oordelen, ...(t.fout ? { uitgesteld: true } : {}) });
        if (t.fout) { uitgesteld += 1; noteer({ stap: "peil_hertoets_fout", ok: false, fout: t.fout }); continue; }
        await o.opslag.zetPeilKoppeling(b.id, t.koppeling);
        await o.opslag.sluitOudePeilSignalen(b.id);
        if (t.signalen.length) signalen += await o.opslag.slaPeilSignalenOp(t.signalen.map((x) => ({ ...x, berichtId: b.id })));
        getoetst += 1;
        if (t.koppeling.raakt.length) behouden += 1;
        else gewist += 1;
      }
      Object.assign(aantallen, { peilHertoetst: getoetst, peilSignalenHertoets: signalen, peilSignalen: Number(aantallen.peilSignalen || 0) + signalen });
      noteer({ stap: "peil_hertoets", ok: true, aantal: getoetst, detail: { teToetsen: lijst.length, behouden, gewist, uitgesteld, signalen, berichten: perBericht } });
    } catch (e) {
      noteer({ stap: "peil_hertoets", ok: false, fout: fout(e) });
    }
  }

  // 6e. Eenmalige nalooprun signaal (27-11-2026): gepubliceerde berichten van de laatste 14 dagen zonder signaal-oordeel
  // (kolom signaal_beoordeeld) laat het goedkope model beoordelen op kop, samenvatting en tekst; hooguit 15 per run.
  // Bij een modelfout wordt niets gezet en komt het bericht de volgende run opnieuw aan de beurt. Zonder de signaalkolommen
  // (migratie nog niet toegepast) levert de opslag een lege lijst en gebeurt er niets.
  if (o.client) {
    try {
      const lijst = await o.opslag.teBeoordelenSignaal(new Date(nu - SIGNAAL_NALOOP_DAGEN * 86400_000).toISOString(), MAX_SIGNAAL_NALOOP_PER_RUN);
      let beoordeeld = 0, metSignaal = 0, uitgesteld = 0;
      for (const b of lijst) {
        if (!tijdOver()) break;
        const r = await beoordeelSignaal(b, o.client);
        if (!r) { uitgesteld += 1; continue; }
        await o.opslag.zetSignaal(b.id, r.signaal);
        beoordeeld += 1;
        if (r.signaal) metSignaal += 1;
      }
      Object.assign(aantallen, { signaalBeoordeeld: beoordeeld, signaalGezet: metSignaal });
      if (lijst.length) noteer({ stap: "signaal_naloop", ok: true, aantal: beoordeeld, detail: { teBeoordelen: lijst.length, metSignaal, uitgesteld } });
    } catch (e) {
      noteer({ stap: "signaal_naloop", ok: false, fout: fout(e) });
    }
  }

  // 7. Opruimen: ruwe items ouder dan 30 dagen
  try {
    const n = await o.opslag.opruimen(new Date(nu - cfg.ruweItemsBewaarDagen * 86400_000).toISOString());
    aantallen.opgeruimd = n;
    noteer({ stap: "opruimen", ok: true, aantal: n });
    // Radarsignalen ouder dan 30 dagen (ontbreekt de tabel, dan 0).
    aantallen.radarOpgeruimd = await o.opslag.radarOpruimen(new Date(nu - RADAR_BEWAAR_DAGEN * 86400_000).toISOString()).catch(() => 0);
  } catch (e) {
    noteer({ stap: "opruimen", ok: false, fout: fout(e) });
  }

  const run: RunRecord = { gestartOp: gestart, klaarOp: new Date().toISOString(), droog: o.droog ?? o.opslag.naam !== "supabase", stappen, aantallen, fouten };
  try {
    await o.opslag.slaRunOp({ ...run, stappen: stappen.map((s) => ({ ...s })) });
  } catch (e) {
    fouten.push(`bewaar_run: ${fout(e)}`);
  }
  void bronResultaten;
  return { stappen, aantallen, berichten, fouten };
}
