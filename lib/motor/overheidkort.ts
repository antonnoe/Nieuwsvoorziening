// Overheidskort (besluit opdrachtgever 28-11-2026): voor elk nieuw item van een actieve overheidsbron laat het goedkope model uit kop en
// omschrijving van dat ene item een korte Nederlandse kaart maken (titel, één of twee zinnen, thema). Zo is het tabblad Overheid gevuld
// met de berichtjes die het oude venster van nlfr-menu toonde, zonder dat elk item een volledig bericht (synthese, poort) hoeft te worden.
// Regels: nooit een getal dat niet in kop of omschrijving staat, geen links, geen meta-taal; Nederlands binnenlands bestuur zonder
// buitenlandkenmerk (R17) en Caribisch Nederland komen vooraf, zonder model, buiten beeld (zelfde regels als overheidpoort.ts).
// De artikeltekst wordt niet gelezen en nooit opgeslagen. Zonder de tabel (migratie niet toegepast) slaat de stap over.
import { haalJson, type ModelClient } from "./ai";
import { kaleHost, modelGoedkoop } from "./config";
import { buitenlandKenmerk, isNlOverheid, nlOverheidUitgesloten } from "./overheidpoort";
import { META_ZINNEN, getallenIn } from "./poort";
import { TabelOntbreekt, isTabelFout, type Opslag } from "./opslag";
import { normaliseer } from "./tekst";
import { OVERHEID_THEMAS, isOverheidThema, type BronItem, type OverheidKortNieuw, type OverheidThema } from "./types";

export const OVERHEIDKORT_TABEL = "nv_overheid_kort";
export const MAX_OVERHEIDSKORT_PER_RUN = 20;
export const OVERHEIDKORT_BUDGET_MS = 60_000;
export const OVERHEIDKORT_VENSTER_DAGEN = 7;
export const OVERHEIDKORT_BEWAAR_DAGEN = 60;

export const SYSTEEM_OVERHEIDKORT = `Je maakt een korte kaart in gewoon Nederlands van één bericht van een overheidswebsite, voor Nederlanders en Belgen die in Frankrijk wonen of er ondernemen. Je krijgt alleen de kop en de omschrijving van dat ene bericht.
Antwoord uitsluitend met JSON: {"titel":"","samenvatting":"","thema":"","relevant":true}
- titel: Nederlandse titel van hooguit 10 woorden, kleine letters behalve het eerste woord en eigennamen.
- samenvatting: één of twee zinnen gewoon Nederlands, alleen wat in de kop of omschrijving staat. Neem bedragen, percentages en datums exact over; voeg geen getal, bedrag of datum toe en verander geen betekenis. Geen links, geen oordeel, geen advies, geen lange streepjes. Praat nooit over de aangeleverde tekst of de bron.
- thema: precies één van ${OVERHEID_THEMAS.join(", ")}.
- relevant: false bij puur interne overheidszaken (benoemingen, vergaderingen, organisatie) zonder belang voor particulieren of ondernemers, anders true.`;

/** Eerste reden waarom de kaart niet bruikbaar is, of null. De getallencontrole vergelijkt met kop en omschrijving van het item. */
export function kortAfkeurReden(titel: string, samenvatting: string, bron: string): string | null {
  const t = titel.trim(), s = samenvatting.trim();
  if (t.split(/\s+/).filter(Boolean).length < 2) return "titel te kort";
  if (t.split(/\s+/).length > 10) return "titel langer dan 10 woorden";
  if (t.length > 120) return "titel te lang";
  if (s.length < 20) return "samenvatting te kort";
  if (s.length > 360 || s.split(/\s+/).length > 60) return "samenvatting te lang";
  if ((s.match(/[.!?](\s|$)/g) || []).length > 3) return "samenvatting heeft meer dan twee zinnen";
  const alles = `${t} ${s}`;
  if (/https?:\/\/|www\./i.test(alles)) return "bevat een link";
  const n = normaliseer(alles);
  const meta = META_ZINNEN.find((z) => n.includes(normaliseer(z)));
  if (meta) return `meta-taal: ${meta}`;
  const nul = (g: string) => g.replace(/^0+(?=\d)/, "");
  const toegestaan = new Set<string>();
  for (const g of getallenIn(bron)) (toegestaan.add(g), toegestaan.add(nul(g)));
  for (const g of getallenIn(alles)) if (!toegestaan.has(g) && !toegestaan.has(nul(g))) return `getal niet in kop of omschrijving: ${g}`;
  return null;
}

export type KortUitslag =
  | { ok: true; titel: string; samenvatting: string; thema: OverheidThema; relevant: boolean }
  | { ok: false; reden: string; modelfout: boolean };

/** Vraagt het goedkope model om de kaart van één item en controleert het antwoord. */
export async function maakKort(item: Pick<BronItem, "titel" | "samenvatting" | "bronNaam">, client: ModelClient): Promise<KortUitslag> {
  let antw: string;
  try {
    antw = await client.tekst({ model: modelGoedkoop(), system: SYSTEEM_OVERHEIDKORT, maxTokens: 600, user: `Kop: ${item.titel}\nOmschrijving: ${item.samenvatting || "(geen)"}` });
  } catch (e) {
    return { ok: false, reden: `modelfout: ${(e instanceof Error ? e.message : String(e)).slice(0, 80)}`, modelfout: true };
  }
  const j = haalJson<{ titel?: unknown; samenvatting?: unknown; thema?: unknown; relevant?: unknown }>(antw);
  if (!j || typeof j !== "object" || Array.isArray(j)) return { ok: false, reden: "antwoord is geen JSON", modelfout: false };
  const schoon = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").replace(/^["'\s]+|["'\s]+$/g, "");
  const titel = schoon(j.titel), samenvatting = schoon(j.samenvatting);
  const relevant = j.relevant !== false && String(j.relevant).toLowerCase() !== "false";
  const thema = String(j.thema ?? "").trim().toLowerCase();
  if (!isOverheidThema(thema)) return { ok: false, reden: `onbekend thema: ${thema.slice(0, 30)}`, modelfout: false };
  const reden = kortAfkeurReden(titel, samenvatting, `${item.titel} ${item.samenvatting || ""}`);
  return reden ? { ok: false, reden, modelfout: false } : { ok: true, titel, samenvatting, thema, relevant };
}

export interface OverheidKortUitslag {
  ok: boolean;
  gemaakt: number;
  detail: Record<string, unknown>;
  fout?: string;
}

/**
 * De stap in de oogstrun. Faalt nooit naar buiten. Een modelfout laat het item voor de volgende run staan; een afgekeurd antwoord,
 * R17 en Caribisch Nederland worden bewaard als niet-relevant met een reden, zodat het item niet steeds opnieuw wordt gevraagd.
 */
export async function draaiOverheidKort(o: { opslag: Opslag; client: ModelClient | null; bronIds: string[]; nu?: number; budgetMs?: number; max?: number }): Promise<OverheidKortUitslag> {
  const nu = o.nu ?? Date.now();
  const start = Date.now();
  const budget = o.budgetMs ?? OVERHEIDKORT_BUDGET_MS;
  const max = o.max ?? MAX_OVERHEIDSKORT_PER_RUN;
  if (!o.client) return { ok: true, gemaakt: 0, detail: { overgeslagen: "geen modelsleutel" } };
  if (!o.bronIds.length) return { ok: true, gemaakt: 0, detail: { overgeslagen: "geen actieve overheidsbronnen" } };
  try {
    const sinds = new Date(nu - OVERHEIDKORT_VENSTER_DAGEN * 86400_000).toISOString();
    const teDoen = await o.opslag.overheidKortTeMaken(sinds, max, o.bronIds);
    const rijen: OverheidKortNieuw[] = [];
    let r17 = 0, caribisch = 0, nietRelevant = 0, afgekeurd = 0, uitgesteld = 0, getoond = 0;
    const redenen: string[] = [];
    const gemaaktOp = new Date(nu).toISOString();
    const basis = (i: BronItem) => ({ itemUrl: i.url, bronNaam: i.bronNaam, bronDomein: kaleHost(i.url), datum: i.gepubliceerdOp, gemaaktOp });
    for (const i of teDoen) {
      // R17 en Caribisch Nederland vooraf, zonder model.
      if (isNlOverheid(i)) {
        const vast = nlOverheidUitgesloten(`${i.titel} ${i.samenvatting}`) ? "caribisch" : buitenlandKenmerk(i.titel, i.samenvatting) ? null : "r17";
        if (vast) {
          if (vast === "r17") r17 += 1; else caribisch += 1;
          rijen.push({ ...basis(i), titel: i.titel, samenvatting: i.samenvatting, thema: null, relevant: false, reden: vast });
          continue;
        }
      }
      if (Date.now() - start >= budget) break;
      const u = await maakKort(i, o.client);
      if (!u.ok) {
        if (u.modelfout) { uitgesteld += 1; continue; }
        afgekeurd += 1;
        if (redenen.length < 20) redenen.push(`${kaleHost(i.url)}: ${u.reden}`);
        rijen.push({ ...basis(i), titel: i.titel, samenvatting: i.samenvatting, thema: null, relevant: false, reden: `afgekeurd: ${u.reden}`.slice(0, 200) });
        continue;
      }
      if (!u.relevant) nietRelevant += 1; else getoond += 1;
      rijen.push({ ...basis(i), titel: u.titel, samenvatting: u.samenvatting, thema: u.thema, relevant: u.relevant, reden: u.relevant ? null : "model: niet relevant" });
    }
    const bewaard = rijen.length ? await o.opslag.overheidKortOpslaan(rijen) : 0;
    return { ok: true, gemaakt: getoond, detail: { teDoen: teDoen.length, bewaard, getoond, nietRelevant, r17, caribisch, afgekeurd, uitgesteld, redenen } };
  } catch (e) {
    if (e instanceof TabelOntbreekt || isTabelFout(e, OVERHEIDKORT_TABEL)) return { ok: true, gemaakt: 0, detail: { overgeslagen: "tabel nv_overheid_kort ontbreekt (migratie nog niet toegepast)" } };
    return { ok: false, gemaakt: 0, detail: {}, fout: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
}
