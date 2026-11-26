// Opslag: Supabase via de REST-interface (geen extra afhankelijkheid), met een
// geheugenvariant voor tests en droge runs. Elke methode gooit bij een storing;
// de motor vangt dat per stap op.
import { leesKanalen, type BeeldCredit, type Bericht, type BronItem, type Kanaal, type PeilKoppeling } from "./types";
import { dagStart } from "./tijd";
import { REGELVERSIE } from "./config";

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

/** De migratie 20261126120000_nv_kanalen_redactie.sql is nog niet toegepast: de redactiekolommen bestaan niet. */
export class MigratieOntbreekt extends Error {
  constructor() {
    super("De migratie voor kanalen en redactie is nog niet toegepast.");
    this.name = "MigratieOntbreekt";
  }
}
/** Herkent de fout van Supabase bij een ontbrekende kolom (filter: 42703, schrijven: PGRST204) van de nieuwe kolommen. */
export function isKolomFout(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /(redactie|kanalen|soort|handmatig)/i.test(m) && /(42703|PGRST204|PGRST205|does not exist|Could not find)/i.test(m);
}

/** Afgeleid kenmerk: "overheid" of "pers" (ontbrekende waarde telt als pers, behalve bij een overheidsregime). */
export const soortVan = (b: { soort?: string | null; regime?: string }): "overheid" | "pers" => (b.soort === "overheid" || (!b.soort && b.regime === "overheid") ? "overheid" : "pers");

export interface BerichtHerschreven {
  kop: string;
  samenvatting: string;
  tekst: string;
  categorie: Bericht["categorie"];
  portemonnee: boolean;
  status: Bericht["status"];
  blokkadeRedenen: string[];
  regelversie: number;
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
  /** Gepubliceerde berichten zonder beeld (nieuwste eerst), om alsnog een beeld te geven. */
  zonderBeeld(limiet: number): Promise<OpgeslagenBericht[]>;
  zetBeeld(id: string, url: string, credit: BeeldCredit | null): Promise<void>;
  /** beeld_url's van de nieuwste gepubliceerde berichten (nieuwste eerst), zodat geen foto twee keer wordt gebruikt. */
  recenteBeeldUrls(limiet: number): Promise<string[]>;
  /** Gepubliceerde berichten sinds `sindsIso` met een lagere regelversie dan `versie` (nieuwste eerst), om opnieuw te schrijven. */
  teHerschrijven(sindsIso: string, versie: number, limiet: number): Promise<OpgeslagenBericht[]>;
  /** Werkt kop, samenvatting, tekst, categorie, portemonnee, status, blokkaderedenen en regelversie bij; id, foto en bronnen blijven. */
  werkBerichtBij(id: string, v: BerichtHerschreven): Promise<void>;
  /** Leesbare zinnen en korte titels per PEIL-parameter (met de hash van de omschrijving waaruit ze zijn gemaakt). */
  lezerszinnen(): Promise<Map<string, { hash: string; zin: string; titel?: string }>>;
  zetLezerszin(parameterId: string, hash: string, zin: string, titel?: string): Promise<void>;
  // lezen voor de API
  berichten(opt: { categorie?: string; limiet: number; offset?: number; peil?: boolean; kanaal?: Kanaal }): Promise<OpgeslagenBericht[]>;
  /** Redactie: één bericht ongeacht status of redactiebesluit (ook "weg"). */
  redactieBericht(id: string): Promise<OpgeslagenBericht | null>;
  /** Redactie: "weg" zetten of terughalen (null). Gooit MigratieOntbreekt zolang de migratie niet is toegepast. */
  zetRedactie(id: string, waarde: "weg" | null, nu?: number): Promise<void>;
  /** Redactie: één kanaal aan of uit. Gooit MigratieOntbreekt zolang de migratie niet is toegepast. */
  zetKanaal(id: string, kanaal: Kanaal, aan: boolean): Promise<void>;
  /** Redactie: status op gepubliceerd zetten (alleen na controle op poortblokkade door de aanroeper). */
  zetStatus(id: string, status: "gepubliceerd"): Promise<void>;
  /** Redactie: markeer voor herschrijven door stap 6a van de volgende oogst (regelversie 0). Gooit niets weg. */
  markeerHerschrijven(id: string): Promise<void>;
  /** Redactie: handmatige correctie; zet `handmatig_op`. Gooit MigratieOntbreekt zolang de migratie niet is toegepast. */
  bewerkBericht(id: string, v: { kop?: string; samenvatting?: string; tekst?: string; categorie?: Bericht["categorie"] }, nu?: number): Promise<void>;
  /** Redactie: alle berichten (elke status, ook "weg", zonder tekst) sinds `sindsIso`, nieuwste eerst. */
  berichtenVoorRedactie(sindsIso: string, limiet: number): Promise<OpgeslagenBericht[]>;
  bericht(id: string): Promise<(OpgeslagenBericht & { signalen: { parameterId: string; status: string }[] }) | null>;
  tellingenSinds(sindsIso: string): Promise<Record<string, number>>;
  /** Beheer: alle berichten (elke status, zonder tekst) sinds `sindsIso`, nieuwste eerst. */
  berichtenVoorBeheer(sindsIso: string, limiet: number): Promise<OpgeslagenBericht[]>;
  /** Beheer: de laatste oogstruns, nieuwste eerst. */
  recenteRuns(limiet: number): Promise<RunRecord[]>;
  aantallen(): Promise<{ berichtenTotaal: number; gepubliceerdTotaal: number; gepubliceerdVandaag: number; openItems: number; signalenGesignaleerd: number }>;
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
  private sleutelId = new Map<string, string>();
  async slaBerichtOp(b: Bericht) {
    // Handmatige correctie gaat voor: een bericht met handmatig_op of redactie wordt nooit overschreven.
    const bestaand = b.sleutel ? this.berichtenLijst.find((x) => x.id === this.sleutelId.get(b.sleutel!)) : undefined;
    if (bestaand && (bestaand.handmatigOp || bestaand.redactie)) return bestaand.id;
    const id = b.id || `mem-${(this.n += 1)}`;
    if (b.sleutel) this.sleutelId.set(b.sleutel, id);
    const { sleutel: _s, ...rest } = b;
    this.berichtenLijst.push({ ...rest, id, soort: soortVan({ soort: b.soort, regime: b.regime }), kanalen: leesKanalen(b.kanalen) });
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
  async zonderBeeld(limiet: number) {
    return this.berichtenLijst.filter((b) => b.status === "gepubliceerd" && !b.beeldUrl).sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp)).slice(0, limiet);
  }
  async recenteBeeldUrls(limiet: number) {
    return this.berichtenLijst.filter((b) => b.status === "gepubliceerd" && b.beeldUrl).sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp)).slice(0, limiet).map((b) => b.beeldUrl!);
  }
  async teHerschrijven(sinds: string, versie: number, limiet: number) {
    // Alles wat een beheerder handmatig corrigeerde (handmatigOp) of op "weg" zette, blijft buiten schot.
    // Een expliciete markering (regelversie 0, actie "herschrijf") telt ook voor concepten en buiten het venster.
    return this.berichtenLijst
      .filter((b) => !b.handmatigOp && b.redactie !== "weg" && ((b.status === "gepubliceerd" && b.gepubliceerdOp >= sinds && (b.regelversie ?? 1) < versie) || b.regelversie === 0))
      .sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp))
      .slice(0, limiet);
  }
  async werkBerichtBij(id: string, v: BerichtHerschreven) {
    const b = this.berichtenLijst.find((x) => x.id === id);
    if (b && !b.handmatigOp) Object.assign(b, v);
  }
  zinnen = new Map<string, { hash: string; zin: string; titel?: string }>();
  async lezerszinnen() {
    return new Map(this.zinnen);
  }
  async zetLezerszin(id: string, hash: string, zin: string, titel?: string) {
    this.zinnen.set(id, { hash, zin, titel });
  }
  async zetBeeld(id: string, url: string, credit: BeeldCredit | null) {
    const b = this.berichtenLijst.find((x) => x.id === id);
    if (b) ((b.beeldUrl = url), (b.beeldCredit = credit));
  }
  async redactieBericht(id: string) {
    return this.berichtenLijst.find((x) => x.id === id) || null;
  }
  async zetRedactie(id: string, waarde: "weg" | null, nu = Date.now()) {
    const b = this.berichtenLijst.find((x) => x.id === id);
    if (b) ((b.redactie = waarde), (b.redactieOp = new Date(nu).toISOString()));
  }
  async zetKanaal(id: string, kanaal: Kanaal, aan: boolean) {
    const b = this.berichtenLijst.find((x) => x.id === id);
    if (b) b.kanalen = { ...leesKanalen(b.kanalen), [kanaal]: aan };
  }
  async zetStatus(id: string, status: "gepubliceerd") {
    const b = this.berichtenLijst.find((x) => x.id === id);
    if (b) b.status = status;
  }
  async markeerHerschrijven(id: string) {
    const b = this.berichtenLijst.find((x) => x.id === id);
    if (b) b.regelversie = 0;
  }
  async bewerkBericht(id: string, v: { kop?: string; samenvatting?: string; tekst?: string; categorie?: Bericht["categorie"] }, nu = Date.now()) {
    const b = this.berichtenLijst.find((x) => x.id === id);
    if (b) Object.assign(b, v, { handmatigOp: new Date(nu).toISOString() });
  }
  async berichtenVoorRedactie(sinds: string, limiet: number) {
    return this.berichtenLijst.filter((b) => b.gepubliceerdOp >= sinds).sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp)).slice(0, limiet).map((b) => ({ ...b, tekst: "" }));
  }
  async berichten({ categorie, limiet, offset = 0, peil, kanaal }: { categorie?: string; limiet: number; offset?: number; peil?: boolean; kanaal?: Kanaal }) {
    return this.berichtenLijst
      .filter((b) => b.status === "gepubliceerd" && b.redactie !== "weg" && (!kanaal || leesKanalen(b.kanalen)[kanaal]) && (!categorie || b.categorie === categorie) && (!peil || b.peil.raakt.length > 0 || b.portemonnee === true))
      .sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp))
      .slice(offset, offset + limiet);
  }
  async bericht(id: string) {
    const b = this.berichtenLijst.find((x) => x.id === id && x.status === "gepubliceerd" && x.redactie !== "weg");
    return b ? { ...b, signalen: this.signalen.filter((s) => s.berichtId === id).map((s) => ({ parameterId: s.parameterId, status: s.status })) } : null;
  }
  async tellingenSinds(sinds: string) {
    const t: Record<string, number> = {};
    for (const b of this.berichtenLijst) if (b.status === "gepubliceerd" && b.redactie !== "weg" && b.gepubliceerdOp >= sinds) t[b.categorie] = (t[b.categorie] || 0) + 1;
    return t;
  }
  async berichtenVoorBeheer(sinds: string, limiet: number) {
    return this.berichtenLijst.filter((b) => b.gepubliceerdOp >= sinds).sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp)).slice(0, limiet).map((b) => ({ ...b, tekst: "" }));
  }
  async recenteRuns(limiet: number) {
    return [...this.runs].reverse().slice(0, limiet);
  }
  async aantallen() {
    return {
      berichtenTotaal: this.berichtenLijst.length,
      gepubliceerdTotaal: this.berichtenLijst.filter((b) => b.status === "gepubliceerd" && b.redactie !== "weg").length,
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
  /** Tot dit tijdstip (ms) werken we alsof de nieuwe kolommen ontbreken (migratie niet toegepast); daarna proberen we opnieuw. */
  private zonderKolommenTot = 0;
  private kolommenWeg = () => Date.now() < this.zonderKolommenTot;
  private markeerKolommenWeg() {
    this.zonderKolommenTot = Date.now() + 5 * 60_000;
  }
  /** Probeer met de nieuwe kolommen; ontbreken ze (migratie nog niet toegepast), dan de oude vorm. */
  private async metKolommen<T>(mooi: () => Promise<T>, oud: () => Promise<T>): Promise<T> {
    if (this.kolommenWeg()) return oud();
    try {
      return await mooi();
    } catch (e) {
      if (!isKolomFout(e)) throw e;
      this.markeerKolommenWeg();
      return oud();
    }
  }
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
    // Handmatige correctie gaat voor: bestaat het bericht al met handmatig_op of redactie, dan niet schrijven.
    if (b.sleutel) {
      const q = (sel: string) => this.lees(`nv_berichten?sleutel=eq.${encodeURIComponent(b.sleutel!)}&select=${sel}&limit=1`);
      let rij: Rij | undefined;
      if (!this.kolommenWeg()) {
        try {
          rij = (await q("id,handmatig_op,redactie"))[0];
        } catch (e) {
          if (!isKolomFout(e)) throw e; // zonder migratie bestaat er niets handmatigs: gewoon schrijven
        }
      }
      if (rij && (rij.handmatig_op || rij.redactie)) return String(rij.id);
    }
    const schrijf = async (metSoort: boolean) => this.vraag("nv_berichten?on_conflict=sleutel", {
      method: "POST", prefer: "resolution=merge-duplicates,return=representation",
      body: JSON.stringify({
        ...(metSoort ? { soort: soortVan({ soort: b.soort, regime: b.regime }) } : {}),
        sleutel: b.sleutel, kop: b.kop, samenvatting: b.samenvatting, tekst: b.tekst, categorie: b.categorie, score: b.score, regime: b.regime,
        status: b.status, blokkade_redenen: b.blokkadeRedenen, beeld_url: b.beeldUrl, beeld_credit: b.beeldCredit ?? null, portemonnee: b.portemonnee === true, regelversie: b.regelversie ?? REGELVERSIE, peil_raakt: b.peil.raakt, peil_mogelijk_gewijzigd: b.peil.mogelijkGewijzigd,
        model: process.env.NIEUWS_MODEL_SYNTHESE || null, gepubliceerd_op: b.gepubliceerdOp,
      }),
    });
    const r = await this.metKolommen(() => schrijf(true), () => schrijf(false));
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
  async zonderBeeld(limiet: number) {
    const rijen = await this.lees(`nv_berichten?status=eq.gepubliceerd&beeld_url=is.null&order=gepubliceerd_op.desc&limit=${limiet}&select=*,nv_bronnen_per_bericht(*)`);
    return rijen.map(naarBericht);
  }
  async recenteBeeldUrls(limiet: number) {
    const rijen = await this.lees(`nv_berichten?status=eq.gepubliceerd&beeld_url=not.is.null&order=gepubliceerd_op.desc&limit=${limiet}&select=beeld_url`);
    return rijen.map((r) => String(r.beeld_url));
  }
  async teHerschrijven(sinds: string, versie: number, limiet: number) {
    const wie = encodeURIComponent(`(and(status.eq.gepubliceerd,regelversie.lt.${versie},gepubliceerd_op.gte.${sinds}),regelversie.eq.0)`);
    const zoek = (extra: string) => this.lees(`nv_berichten?or=${wie}${extra}&order=gepubliceerd_op.desc&limit=${limiet}&select=*,nv_bronnen_per_bericht(*)`);
    // Handmatig gecorrigeerde en "weg"-berichten blijven buiten schot (zonder migratie bestaan die niet).
    const rijen = await this.metKolommen(() => zoek("&handmatig_op=is.null&redactie=is.null"), () => zoek(""));
    return rijen.map(naarBericht);
  }
  async zetStatus(id: string, status: "gepubliceerd") {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    await this.vraag(`nv_berichten?id=eq.${id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ status }) });
  }
  async markeerHerschrijven(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    await this.vraag(`nv_berichten?id=eq.${id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ regelversie: 0 }) });
  }
  async bewerkBericht(id: string, v: { kop?: string; samenvatting?: string; tekst?: string; categorie?: Bericht["categorie"] }, nu = Date.now()) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    try {
      await this.vraag(`nv_berichten?id=eq.${id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ ...v, handmatig_op: new Date(nu).toISOString() }) });
    } catch (e) {
      if (isKolomFout(e)) throw new MigratieOntbreekt();
      throw e;
    }
  }
  async werkBerichtBij(id: string, v: BerichtHerschreven) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    const patch = (extra: string) => this.vraag(`nv_berichten?id=eq.${id}${extra}`, {
      method: "PATCH", prefer: "return=minimal",
      body: JSON.stringify({ kop: v.kop, samenvatting: v.samenvatting, tekst: v.tekst, categorie: v.categorie, portemonnee: v.portemonnee, status: v.status, blokkade_redenen: v.blokkadeRedenen, regelversie: v.regelversie, model: process.env.NIEUWS_MODEL_SYNTHESE || null }),
    });
    // Een handmatig gecorrigeerd bericht wordt nooit overschreven (filter in de database, ook als het tussentijds is bewerkt).
    await this.metKolommen(() => patch("&handmatig_op=is.null"), () => patch(""));
  }
  async lezerszinnen() {
    const rijen = await this.lees("nv_peil_lezerszin?select=parameter_id,bron_hash,zin,titel&limit=2000");
    return new Map(rijen.map((r) => [String(r.parameter_id), { hash: String(r.bron_hash), zin: String(r.zin), titel: r.titel ? String(r.titel) : undefined }]));
  }
  async zetLezerszin(id: string, hash: string, zin: string, titel?: string) {
    await this.vraag("nv_peil_lezerszin?on_conflict=parameter_id", {
      method: "POST", prefer: "resolution=merge-duplicates,return=minimal",
      body: JSON.stringify({ parameter_id: id, bron_hash: hash, zin, titel: titel || null, model: process.env.NIEUWS_MODEL_GOEDKOOP || null, aangemaakt_op: new Date().toISOString() }),
    });
  }
  async zetBeeld(id: string, url: string, credit: BeeldCredit | null) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    await this.vraag(`nv_berichten?id=eq.${id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ beeld_url: url, beeld_credit: credit }) });
  }
  async berichten({ categorie, limiet, offset = 0, peil, kanaal }: { categorie?: string; limiet: number; offset?: number; peil?: boolean; kanaal?: Kanaal }) {
    const filter = (categorie ? `&categorie=eq.${encodeURIComponent(categorie)}` : "") + (peil ? `&or=${encodeURIComponent("(peil_raakt.neq.[],portemonnee.eq.true)")}` : "");
    const zoek = (extra: string) => this.lees(`nv_berichten?status=eq.gepubliceerd${extra}${filter}&order=gepubliceerd_op.desc&limit=${limiet}&offset=${offset}&select=*,nv_bronnen_per_bericht(*)`);
    // Zonder de migratie bestaan redactie en kanalen niet: alles staat dan "aan" en niets is "weg".
    const rijen = await this.metKolommen(
      () => zoek(`&redactie=is.null${kanaal ? `&kanalen->>${kanaal}=eq.true` : ""}`),
      () => zoek("")
    );
    return rijen.map(naarBericht);
  }
  async redactieBericht(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const rijen = await this.lees(`nv_berichten?id=eq.${id}&select=*,nv_bronnen_per_bericht(*)`);
    return rijen[0] ? naarBericht(rijen[0]) : null;
  }
  async zetRedactie(id: string, waarde: "weg" | null, nu = Date.now()) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    try {
      await this.vraag(`nv_berichten?id=eq.${id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ redactie: waarde, redactie_op: new Date(nu).toISOString() }) });
    } catch (e) {
      if (isKolomFout(e)) throw new MigratieOntbreekt();
      throw e;
    }
  }
  async zetKanaal(id: string, kanaal: Kanaal, aan: boolean) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    try {
      const rij = (await this.lees(`nv_berichten?id=eq.${id}&select=kanalen`))[0];
      if (!rij) return;
      const nieuw = { ...leesKanalen(rij.kanalen), [kanaal]: aan };
      await this.vraag(`nv_berichten?id=eq.${id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ kanalen: nieuw }) });
    } catch (e) {
      if (isKolomFout(e)) throw new MigratieOntbreekt();
      throw e;
    }
  }
  async berichtenVoorRedactie(sinds: string, limiet: number) {
    const basis = "id,kop,samenvatting,categorie,score,regime,status,blokkade_redenen,gepubliceerd_op,regelversie,portemonnee,beeld_url,nv_bronnen_per_bericht(bron_naam,originele_kop,datum,url,volgorde)";
    const zoek = (kolommen: string) => this.lees(`nv_berichten?gepubliceerd_op=gte.${encodeURIComponent(sinds)}&order=gepubliceerd_op.desc&limit=${limiet}&select=${kolommen}`);
    const rijen = await this.metKolommen(() => zoek(`${basis},soort,kanalen,redactie,redactie_op,handmatig_op`), () => zoek(basis));
    return rijen.map(naarBericht);
  }
  async bericht(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const zoek = (extra: string) => this.lees(`nv_berichten?id=eq.${id}&status=eq.gepubliceerd${extra}&select=*,nv_bronnen_per_bericht(*),nv_peil_signalen(parameter_id,status)`);
    const rijen = await this.metKolommen(() => zoek("&redactie=is.null"), () => zoek(""));
    if (!rijen[0]) return null;
    const sig = ((rijen[0].nv_peil_signalen as Rij[]) || []).map((s) => ({ parameterId: String(s.parameter_id), status: String(s.status) }));
    return { ...naarBericht(rijen[0]), signalen: sig };
  }
  async tellingenSinds(sinds: string) {
    const zoek = (extra: string) => this.lees(`nv_berichten?status=eq.gepubliceerd${extra}&gepubliceerd_op=gte.${encodeURIComponent(sinds)}&select=categorie&limit=2000`);
    const rijen = await this.metKolommen(() => zoek("&redactie=is.null"), () => zoek(""));
    const t: Record<string, number> = {};
    for (const r of rijen) t[String(r.categorie)] = (t[String(r.categorie)] || 0) + 1;
    return t;
  }
  async berichtenVoorBeheer(sinds: string, limiet: number) {
    const rijen = await this.lees(`nv_berichten?gepubliceerd_op=gte.${encodeURIComponent(sinds)}&order=gepubliceerd_op.desc&limit=${limiet}&select=id,kop,samenvatting,categorie,score,regime,status,blokkade_redenen,gepubliceerd_op,regelversie,portemonnee,peil_raakt,nv_bronnen_per_bericht(bron_naam,originele_kop,datum,url,volgorde)`);
    return rijen.map(naarBericht);
  }
  async recenteRuns(limiet: number) {
    const rijen = await this.lees(`nv_oogst_runs?order=gestart_op.desc&limit=${limiet}&select=gestart_op,klaar_op,droog,aantallen,fouten`);
    return rijen.map((r) => ({ gestartOp: String(r.gestart_op), klaarOp: r.klaar_op ? String(r.klaar_op) : undefined, droog: Boolean(r.droog), stappen: [], aantallen: (r.aantallen as Record<string, number>) || {}, fouten: (r.fouten as string[]) || [] }));
  }
  async aantallen() {
    const [berichtenTotaal, gepubliceerdTotaal, gepubliceerdVandaag, openItems, signalenGesignaleerd] = await Promise.all([
      this.tel("nv_berichten?select=id"),
      this.metKolommen(() => this.tel("nv_berichten?status=eq.gepubliceerd&redactie=is.null&select=id"), () => this.tel("nv_berichten?status=eq.gepubliceerd&select=id")),
      this.telGepubliceerdSinds(dagStart()),
      this.tel("nv_bron_items?verwerkt_op=is.null&select=id"),
      this.tel("nv_peil_signalen?status=eq.gesignaleerd&select=id"),
    ]);
    return { berichtenTotaal, gepubliceerdTotaal, gepubliceerdVandaag, openItems, signalenGesignaleerd };
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
    soort: soortVan({ soort: r.soort as string | null, regime: r.regime as string }), kanalen: leesKanalen(r.kanalen),
    redactie: r.redactie === "weg" ? "weg" : null, redactieOp: r.redactie_op ? String(r.redactie_op) : null, handmatigOp: r.handmatig_op ? String(r.handmatig_op) : null,
    id: String(r.id), kop: String(r.kop), samenvatting: String(r.samenvatting || ""), tekst: String(r.tekst || ""), categorie: r.categorie as OpgeslagenBericht["categorie"],
    score: Number(r.score), regime: r.regime as OpgeslagenBericht["regime"], status: r.status as OpgeslagenBericht["status"],
    blokkadeRedenen: (r.blokkade_redenen as string[]) || [], beeldUrl: (r.beeld_url as string) || null, beeldCredit: (r.beeld_credit as OpgeslagenBericht["beeldCredit"]) || null, portemonnee: r.portemonnee === true, regelversie: Number(r.regelversie ?? 1), peil, bronnen, gepubliceerdOp: String(r.gepubliceerd_op),
  };
}

/** Supabase als de sleutels er zijn, anders null (dan draait de motor droog). */
export function maakOpslag(): Opslag | null {
  const u = process.env.SUPABASE_URL;
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return u && k ? new SupabaseOpslag(u, k) : null;
}
