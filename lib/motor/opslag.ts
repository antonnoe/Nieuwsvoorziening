// Opslag: Supabase via de REST-interface (geen extra afhankelijkheid), met een
// geheugenvariant voor tests en droge runs. Elke methode gooit bij een storing;
// de motor vangt dat per stap op.
import type { Bericht, BronItem, PeilKoppeling } from "./types";
import { dagStart } from "./tijd";

export interface RunRecord {
  id?: string;
  gestartOp: string;
  klaarOp?: string;
  droog: boolean;
  stappen: unknown[];
  aantallen: Record<string, number>;
  fouten: string[];
}

export interface OpgeslagenBericht extends Omit<Bericht, "sleutel"> {
  id: string;
}

export interface PeilSignaalIn {
  berichtId: string;
  parameterId: string;
  parameterNaam: string;
  toelichting: string;
}

export interface Opslag {
  naam: string;
  upsertItems(items: BronItem[]): Promise<number>;
  openItems(sindsIso: string): Promise<BronItem[]>;
  markeerVerwerkt(urls: string[], berichtId: string | null, verwerking: string): Promise<void>;
  /** Originele bronkoppen van recent verwerkte berichten, om een tweede bericht over hetzelfde onderwerp te voorkomen. */
  recenteBronKoppen(sindsIso: string): Promise<string[]>;
  slaBerichtOp(b: Bericht): Promise<string>;
  slaPeilSignalenOp(s: PeilSignaalIn[]): Promise<number>;
  telGepubliceerdSinds(sindsIso: string): Promise<number>;
  slaRunOp(r: RunRecord): Promise<void>;
  laatsteRun(): Promise<RunRecord | null>;
  opruimen(olderThanIso: string): Promise<number>;
  // lezen voor de API
  berichten(opt: { categorie?: string; limiet: number; offset?: number }): Promise<OpgeslagenBericht[]>;
  bericht(id: string): Promise<(OpgeslagenBericht & { signalen: { parameterId: string; status: string }[] }) | null>;
  tellingenSinds(sindsIso: string): Promise<Record<string, number>>;
  aantallen(): Promise<{ berichtenTotaal: number; gepubliceerdVandaag: number; openItems: number; signalenGesignaleerd: number }>;
}

// ---- Geheugen -----------------------------------------------------------------
export class GeheugenOpslag implements Opslag {
  naam = "geheugen";
  items = new Map<string, BronItem & { verwerkt?: string; berichtId?: string | null }>();
  berichtenLijst: OpgeslagenBericht[] = [];
  signalen: (PeilSignaalIn & { status: string })[] = [];
  runs: RunRecord[] = [];
  private n = 0;
  async upsertItems(items: BronItem[]) {
    let nieuw = 0;
    for (const it of items) if (!this.items.has(it.url)) (this.items.set(it.url, { ...it, opgehaaldOp: new Date().toISOString() }), (nieuw += 1));
    return nieuw;
  }
  async openItems(sinds: string) {
    return [...this.items.values()].filter((i) => !i.verwerkt && i.gepubliceerdOp >= sinds);
  }
  async markeerVerwerkt(urls: string[], berichtId: string | null, verwerking: string) {
    for (const u of urls) {
      const i = this.items.get(u);
      if (i) ((i.verwerkt = verwerking), (i.berichtId = berichtId));
    }
  }
  async recenteBronKoppen(sinds: string) {
    return this.berichtenLijst.filter((b) => b.gepubliceerdOp >= sinds).flatMap((b) => b.bronnen.map((x) => x.origineleKop));
  }
  async slaBerichtOp(b: Bericht) {
    const id = b.id || `mem-${(this.n += 1)}`;
    const { sleutel: _s, ...rest } = b;
    this.berichtenLijst.push({ ...rest, id });
    return id;
  }
  async slaPeilSignalenOp(s: PeilSignaalIn[]) {
    for (const x of s) this.signalen.push({ ...x, status: "gesignaleerd" });
    return s.length;
  }
  async telGepubliceerdSinds(sinds: string) {
    return this.berichtenLijst.filter((b) => b.status === "gepubliceerd" && b.gepubliceerdOp >= sinds).length;
  }
  async slaRunOp(r: RunRecord) {
    this.runs.push(r);
  }
  async laatsteRun() {
    return this.runs[this.runs.length - 1] || null;
  }
  async opruimen(oud: string) {
    let n = 0;
    for (const [u, i] of this.items) if ((i.opgehaaldOp || "") < oud) (this.items.delete(u), (n += 1));
    return n;
  }
  async berichten({ categorie, limiet, offset = 0 }: { categorie?: string; limiet: number; offset?: number }) {
    return this.berichtenLijst
      .filter((b) => b.status === "gepubliceerd" && (!categorie || b.categorie === categorie))
      .sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp))
      .slice(offset, offset + limiet);
  }
  async bericht(id: string) {
    const b = this.berichtenLijst.find((x) => x.id === id && x.status === "gepubliceerd");
    return b ? { ...b, signalen: this.signalen.filter((s) => s.berichtId === id).map((s) => ({ parameterId: s.parameterId, status: s.status })) } : null;
  }
  async tellingenSinds(sinds: string) {
    const t: Record<string, number> = {};
    for (const b of this.berichtenLijst) if (b.status === "gepubliceerd" && b.gepubliceerdOp >= sinds) t[b.categorie] = (t[b.categorie] || 0) + 1;
    return t;
  }
  async aantallen() {
    return {
      berichtenTotaal: this.berichtenLijst.length,
      gepubliceerdVandaag: await this.telGepubliceerdSinds(dagStart()),
      openItems: [...this.items.values()].filter((i) => !i.verwerkt).length,
      signalenGesignaleerd: this.signalen.length,
    };
  }
}

// ---- Supabase (REST) ------------------------------------------------------------
type Rij = Record<string, unknown>;

export class SupabaseOpslag implements Opslag {
  naam = "supabase";
  constructor(
    private url: string,
    private sleutel: string,
    private fetchFn: typeof fetch = fetch
  ) {
    this.url = url.replace(/\/+$/, "");
  }

  private async vraag(pad: string, init: RequestInit & { prefer?: string } = {}): Promise<Response> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await this.fetchFn(`${this.url}/rest/v1/${pad}`, {
        ...init,
        signal: ctl.signal,
        headers: {
          apikey: this.sleutel,
          authorization: `Bearer ${this.sleutel}`,
          "content-type": "application/json",
          ...(init.prefer ? { prefer: init.prefer } : {}),
        },
      });
      if (!r.ok) throw new Error(`Supabase ${init.method || "GET"} ${pad.split("?")[0]}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
      return r;
    } finally {
      clearTimeout(t);
    }
  }
  private async lees(pad: string): Promise<Rij[]> {
    return (await (await this.vraag(pad)).json()) as Rij[];
  }
  private async tel(pad: string): Promise<number> {
    const r = await this.vraag(pad, { method: "HEAD", prefer: "count=exact" });
    const m = (r.headers.get("content-range") || "").match(/\/(\d+)$/);
    return m ? Number(m[1]) : 0;
  }

  async upsertItems(items: BronItem[]) {
    let nieuw = 0;
    for (let i = 0; i < items.length; i += 100) {
      const rijen = items.slice(i, i + 100).map((x) => ({
        url: x.url, bron_id: x.bronId, bron_naam: x.bronNaam, regime: x.regime, groep: x.groep, taal: x.taal, land: x.land,
        titel: x.titel, samenvatting: x.samenvatting, gepubliceerd_op: x.gepubliceerdOp,
      }));
      const r = await this.vraag("nv_bron_items?on_conflict=url", { method: "POST", prefer: "resolution=ignore-duplicates,return=representation", body: JSON.stringify(rijen) });
      nieuw += ((await r.json()) as Rij[]).length;
    }
    return nieuw;
  }
  async openItems(sinds: string) {
    const rijen = await this.lees(`nv_bron_items?verwerkt_op=is.null&gepubliceerd_op=gte.${encodeURIComponent(sinds)}&order=gepubliceerd_op.desc&limit=1000`);
    return rijen.map(naarItem);
  }
  async markeerVerwerkt(urls: string[], berichtId: string | null, verwerking: string) {
    for (let i = 0; i < urls.length; i += 40) {
      const lijst = urls.slice(i, i + 40).map((u) => `"${u.replace(/"/g, '\\"')}"`).join(",");
      await this.vraag(`nv_bron_items?url=in.(${encodeURIComponent(lijst)})`, {
        method: "PATCH", prefer: "return=minimal",
        body: JSON.stringify({ verwerkt_op: new Date().toISOString(), verwerking, bericht_id: berichtId && !berichtId.startsWith("mem-") ? berichtId : null }),
      });
    }
  }
  async recenteBronKoppen(sinds: string) {
    return (await this.lees(`nv_bronnen_per_bericht?datum=gte.${encodeURIComponent(sinds)}&select=originele_kop&limit=2000`)).map((r) => String(r.originele_kop));
  }
  async slaBerichtOp(b: Bericht) {
    const r = await this.vraag("nv_berichten?on_conflict=sleutel", {
      method: "POST", prefer: "resolution=merge-duplicates,return=representation",
      body: JSON.stringify({
        sleutel: b.sleutel, kop: b.kop, samenvatting: b.samenvatting, tekst: b.tekst, categorie: b.categorie, score: b.score, regime: b.regime,
        status: b.status, blokkade_redenen: b.blokkadeRedenen, beeld_url: b.beeldUrl, peil_raakt: b.peil.raakt, peil_mogelijk_gewijzigd: b.peil.mogelijkGewijzigd,
        model: process.env.NIEUWS_MODEL_SYNTHESE || null, gepubliceerd_op: b.gepubliceerdOp,
      }),
    });
    const id = String(((await r.json()) as Rij[])[0].id);
    if (b.bronnen.length) {
      await this.vraag("nv_bronnen_per_bericht?on_conflict=bericht_id,url", {
        method: "POST", prefer: "resolution=ignore-duplicates,return=minimal",
        body: JSON.stringify(b.bronnen.map((x, n) => ({ bericht_id: id, volgorde: n, bron_naam: x.naam, originele_kop: x.origineleKop, datum: x.datum, url: x.url }))),
      });
    }
    return id;
  }
  async slaPeilSignalenOp(s: PeilSignaalIn[]) {
    if (!s.length) return 0;
    await this.vraag("nv_peil_signalen?on_conflict=bericht_id,parameter_id", {
      method: "POST", prefer: "resolution=ignore-duplicates,return=minimal",
      body: JSON.stringify(s.map((x) => ({ bericht_id: x.berichtId, parameter_id: x.parameterId, parameter_naam: x.parameterNaam, toelichting: x.toelichting, status: "gesignaleerd" }))),
    });
    return s.length;
  }
  async telGepubliceerdSinds(sinds: string) {
    return this.tel(`nv_berichten?status=eq.gepubliceerd&gepubliceerd_op=gte.${encodeURIComponent(sinds)}&select=id`);
  }
  async slaRunOp(r: RunRecord) {
    await this.vraag("nv_oogst_runs", {
      method: "POST", prefer: "return=minimal",
      body: JSON.stringify({ gestart_op: r.gestartOp, klaar_op: r.klaarOp, droog: r.droog, stappen: r.stappen, aantallen: r.aantallen, fouten: r.fouten }),
    });
  }
  async laatsteRun() {
    const r = (await this.lees("nv_oogst_runs?order=gestart_op.desc&limit=1"))[0];
    return r ? { gestartOp: String(r.gestart_op), klaarOp: r.klaar_op ? String(r.klaar_op) : undefined, droog: Boolean(r.droog), stappen: (r.stappen as unknown[]) || [], aantallen: (r.aantallen as Record<string, number>) || {}, fouten: (r.fouten as string[]) || [] } : null;
  }
  async opruimen(oud: string) {
    const r = await this.vraag(`nv_bron_items?opgehaald_op=lt.${encodeURIComponent(oud)}`, { method: "DELETE", prefer: "return=representation" });
    // Oude oogstruns (ouder dan 30 dagen) gaan mee.
    await this.vraag(`nv_oogst_runs?gestart_op=lt.${encodeURIComponent(oud)}`, { method: "DELETE", prefer: "return=minimal" });
    return ((await r.json()) as Rij[]).length;
  }
  async berichten({ categorie, limiet, offset = 0 }: { categorie?: string; limiet: number; offset?: number }) {
    const filter = categorie ? `&categorie=eq.${encodeURIComponent(categorie)}` : "";
    const rijen = await this.lees(`nv_berichten?status=eq.gepubliceerd${filter}&order=gepubliceerd_op.desc&limit=${limiet}&offset=${offset}&select=*,nv_bronnen_per_bericht(*)`);
    return rijen.map(naarBericht);
  }
  async bericht(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const rijen = await this.lees(`nv_berichten?id=eq.${id}&status=eq.gepubliceerd&select=*,nv_bronnen_per_bericht(*),nv_peil_signalen(parameter_id,status)`);
    if (!rijen[0]) return null;
    const sig = ((rijen[0].nv_peil_signalen as Rij[]) || []).map((s) => ({ parameterId: String(s.parameter_id), status: String(s.status) }));
    return { ...naarBericht(rijen[0]), signalen: sig };
  }
  async tellingenSinds(sinds: string) {
    const rijen = await this.lees(`nv_berichten?status=eq.gepubliceerd&gepubliceerd_op=gte.${encodeURIComponent(sinds)}&select=categorie&limit=2000`);
    const t: Record<string, number> = {};
    for (const r of rijen) t[String(r.categorie)] = (t[String(r.categorie)] || 0) + 1;
    return t;
  }
  async aantallen() {
    const [berichtenTotaal, gepubliceerdVandaag, openItems, signalenGesignaleerd] = await Promise.all([
      this.tel("nv_berichten?select=id"),
      this.telGepubliceerdSinds(dagStart()),
      this.tel("nv_bron_items?verwerkt_op=is.null&select=id"),
      this.tel("nv_peil_signalen?status=eq.gesignaleerd&select=id"),
    ]);
    return { berichtenTotaal, gepubliceerdVandaag, openItems, signalenGesignaleerd };
  }
}

function naarItem(r: Rij): BronItem {
  return {
    id: String(r.id), url: String(r.url), bronId: String(r.bron_id), bronNaam: String(r.bron_naam), regime: (r.regime as "pers" | "overheid") || "pers",
    groep: (r.groep as BronItem["groep"]) || "fr_pers", taal: String(r.taal || ""), land: String(r.land || ""), titel: String(r.titel), samenvatting: String(r.samenvatting || ""),
    gepubliceerdOp: String(r.gepubliceerd_op),
  };
}

function naarBericht(r: Rij): OpgeslagenBericht {
  const bronnen = ((r.nv_bronnen_per_bericht as Rij[]) || [])
    .sort((a, b) => Number(a.volgorde) - Number(b.volgorde))
    .map((x) => ({ naam: String(x.bron_naam), origineleKop: String(x.originele_kop), datum: String(x.datum || ""), url: String(x.url) }));
  const peil: PeilKoppeling = { raakt: (r.peil_raakt as PeilKoppeling["raakt"]) || [], mogelijkGewijzigd: (r.peil_mogelijk_gewijzigd as PeilKoppeling["mogelijkGewijzigd"]) || [] };
  return {
    id: String(r.id), kop: String(r.kop), samenvatting: String(r.samenvatting || ""), tekst: String(r.tekst || ""), categorie: r.categorie as OpgeslagenBericht["categorie"],
    score: Number(r.score), regime: r.regime as OpgeslagenBericht["regime"], status: r.status as OpgeslagenBericht["status"],
    blokkadeRedenen: (r.blokkade_redenen as string[]) || [], beeldUrl: (r.beeld_url as string) || null, peil, bronnen, gepubliceerdOp: String(r.gepubliceerd_op),
  };
}

/** Supabase als de sleutels er zijn, anders null (dan draait de motor droog). */
export function maakOpslag(): Opslag | null {
  const u = process.env.SUPABASE_URL;
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return u && k ? new SupabaseOpslag(u, k) : null;
}
