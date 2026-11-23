// De motor: oogst, groeperen, synthese, poort, score, PEIL, beeld, opslag.
// Elke stap faalt netjes: een fout wordt vastgelegd en de volgende stap gaat door
// met wat er wel is.
import type { ModelClient } from "./ai";
import { laadConfig, actieveBronnen, modelSynthese, type MotorConfig } from "./config";
import { aantalBronnen, clusterItems } from "./cluster";
import { oogstBronnen, type OogstBronResultaat } from "./feeds";
import { beeldVoor, type BeeldGenerator, actieveGenerator } from "./beeld";
import type { Opslag, RunRecord, PeilSignaalIn } from "./opslag";
import { laadPeil, peilKoppeling } from "./peil";
import { kwaliteitsPoort } from "./poort";
import { berekenScore, clusterRegime } from "./score";
import { synthetiseer, SYSTEEM_SYNTHESE, bouwInvoer, leesSynthese } from "./synthese";
import { overlap, hashId } from "./tekst";
import { dagStart } from "./tijd";
import type { Bericht, Bron, Cluster, PeilParameter, StapResultaat, Synthese } from "./types";

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
}

export interface RunUitslag {
  stappen: StapResultaat[];
  aantallen: Record<string, number>;
  berichten: Bericht[];
  fouten: string[];
}

const fout = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

export async function draaiOogst(o: RunOpties): Promise<RunUitslag> {
  const nu = o.nu ?? Date.now();
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

  // 1. Oogst
  let items: Awaited<ReturnType<typeof oogstBronnen>>["items"] = [];
  let bronResultaten: OogstBronResultaat[] = [];
  try {
    const bronnen = o.bronnen ?? actieveBronnen();
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
    const genoeg = clusters.filter((c) => (clusterRegime(c) === "overheid" ? aantalBronnen(c) >= cfg.minBronnenOverheid : aantalBronnen(c) >= cfg.minBronnenPers));
    aantallen.clustersGenoegBronnen = genoeg.length;
    const nietDubbel: Cluster[] = [];
    for (const c of genoeg) {
      const dubbel = bronKoppen.some((k) => c.items.some((i) => { const x = overlap(i.titel, k); return x.gedeeld >= 2 && x.verhouding >= 0.5; }));
      if (dubbel) await o.opslag.markeerVerwerkt(c.items.map((i) => i.url), null, "dubbel").catch(() => {});
      else nietDubbel.push(c);
    }
    const vandaag = await o.opslag.telGepubliceerdSinds(dagStart(nu)).catch(() => 0);
    const ruimte = Math.max(0, cfg.maxBerichtenPerDag - vandaag);
    nietDubbel.sort((a, b) => aantalBronnen(b) - aantalBronnen(a) || b.items[0].gepubliceerdOp.localeCompare(a.items[0].gepubliceerdOp));
    kandidaten = nietDubbel.slice(0, Math.min(cfg.maxSynthesesPerRun, ruimte));
    aantallen.kandidaten = kandidaten.length;
    noteer({ stap: "selecteer", ok: true, aantal: kandidaten.length, detail: { vandaagGepubliceerd: vandaag, ruimte } });
  } catch (e) {
    noteer({ stap: "selecteer", ok: false, fout: fout(e) });
  }

  // 6. Synthese, poort, score, PEIL, beeld, opslag
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
    let gepubliceerd = 0, geblokkeerd = 0, concept = 0, mislukt = 0, signalenAantal = 0;
    for (const c of kandidaten) {
      try {
        let s: Synthese | null = await synthetiseer(c, o.client);
        if (!s) {
          await o.opslag.markeerVerwerkt(c.items.map((i) => i.url), null, "te_weinig_inhoud");
          continue;
        }
        let uitslag = kwaliteitsPoort(s, c, cfg);
        if (!uitslag.ok) {
          // Eén herkansing met de redenen erbij.
          try {
            const antw = await o.client.tekst({
              model: modelSynthese(), system: SYSTEEM_SYNTHESE, maxTokens: 1400,
              user: `${bouwInvoer(c)}\n\nJe vorige versie werd afgekeurd om deze redenen: ${uitslag.redenen.join("; ")}. Schrijf opnieuw en vermijd precies deze fouten.`,
            });
            const s2 = leesSynthese(antw);
            if (s2) {
              const u2 = kwaliteitsPoort(s2, c, cfg);
              if (u2.ok || u2.redenen.length < uitslag.redenen.length) ((s = s2), (uitslag = u2));
            }
          } catch { /* eerste uitslag blijft staan */ }
        }
        const regime = clusterRegime(c);
        const score = berekenScore(c, s.relevantie, nu);
        const bronnen = [...new Map(c.items.map((i) => [i.url, i])).values()]
          .sort((a, b) => a.gepubliceerdOp.localeCompare(b.gepubliceerdOp))
          .map((i) => ({ naam: i.bronNaam, origineleKop: i.titel, datum: i.gepubliceerdOp, url: i.url }));
        const status: Bericht["status"] = !uitslag.ok ? "geblokkeerd" : score >= cfg.publiceerDrempel ? "gepubliceerd" : "concept";
        let koppeling = { raakt: [], mogelijkGewijzigd: [] } as Bericht["peil"];
        if (status === "gepubliceerd" && peil.length) {
          const p = await peilKoppeling({ kop: s.kop, tekst: s.tekst }, c.items.map((i) => `${i.titel} ${i.samenvatting}`).join("\n"), peil, o.client, cfg.peilKandidatenPerBericht);
          koppeling = p.koppeling;
          if (p.fout) noteer({ stap: "peil_oordeel", ok: false, fout: p.fout });
        }
        const beeldUrl = status === "gepubliceerd" ? await beeldVoor({ kop: s.kop, samenvatting: s.samenvatting, categorie: s.categorie }, generator) : null;
        const bericht: Bericht = {
          kop: s.kop, samenvatting: s.samenvatting, tekst: s.tekst, categorie: s.categorie, score, regime, status,
          blokkadeRedenen: uitslag.redenen, beeldUrl, peil: koppeling, bronnen, gepubliceerdOp: new Date(nu).toISOString(),
          sleutel: hashId(c.items.map((i) => i.url).sort().join("|")),
        };
        const id = await o.opslag.slaBerichtOp(bericht);
        bericht.id = id;
        berichten.push(bericht);
        await o.opslag.markeerVerwerkt(c.items.map((i) => i.url), id, status);
        const signalen: PeilSignaalIn[] = koppeling.mogelijkGewijzigd.map((g) => ({ berichtId: id, parameterId: g.id, parameterNaam: g.naam, toelichting: g.toelichting }));
        if (signalen.length) signalenAantal += await o.opslag.slaPeilSignalenOp(signalen).catch((e) => (noteer({ stap: "peil_signaal", ok: false, fout: fout(e) }), 0));
        if (status === "gepubliceerd") gepubliceerd += 1;
        else if (status === "geblokkeerd") geblokkeerd += 1;
        else concept += 1;
      } catch (e) {
        mislukt += 1;
        noteer({ stap: "synthese_cluster", ok: false, fout: fout(e) });
      }
    }
    Object.assign(aantallen, { gepubliceerd, geblokkeerd, concept, syntheseMislukt: mislukt, peilSignalen: signalenAantal });
    noteer({ stap: "synthese", ok: true, aantal: berichten.length, detail: { gepubliceerd, geblokkeerd, concept, mislukt } });
  } else {
    noteer({ stap: "synthese", ok: true, aantal: 0, detail: { reden: "geen kandidaten" } });
  }

  // 7. Opruimen: ruwe items ouder dan 30 dagen
  try {
    const n = await o.opslag.opruimen(new Date(nu - cfg.ruweItemsBewaarDagen * 86400_000).toISOString());
    aantallen.opgeruimd = n;
    noteer({ stap: "opruimen", ok: true, aantal: n });
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
