// Opslag: Supabase via de REST-interface (geen extra afhankelijkheid), met een
// geheugenvariant voor tests en droge runs. Elke methode gooit bij een storing;
// de motor vangt dat per stap op.
import { leesKanalen, leesSignaal, groenePeil, type Signaal, type BeeldCredit, type Bericht, type BronItem, type Kanaal, type PeilBesluit, type PeilKoppeling, type PeilSignaalIn, type PeilSignaalRij } from "./types";
import { zoekSamenvoeging } from "./peilbeoordeling";
import { dagStart } from "./tijd";
import { REGELVERSIE, isVerbodenBron } from "./config";
import { RadarOntbreekt, isRadarFout } from "./radar";
import type { RadarBesluit, RadarNieuw, RadarRij, RadarBron } from "./types";

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

/** Herkent de fout van Supabase bij ontbrekende signaalkolommen (migratie 20261127120000_nv_signaal.sql nog niet toegepast). */
export function isSignaalKolomFout(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /signaal/i.test(m) && /(42703|PGRST204|PGRST205|does not exist|Could not find)/i.test(m);
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
  /** Alleen meegeven als het model een oordeel gaf; ontbreekt = signaal ongemoeid laten. */
  signaal?: Signaal | null;
  signaalBeoordeeld?: boolean;
}

export type { PeilSignaalIn, PeilSignaalRij };

/** De migratie 20261126190000_nv_peil_streng.sql is nog niet toegepast: de nieuwe signaalkolommen of statuswaarden bestaan niet. */
export function isPeilKolomFout(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /(zekerheid|soort|nieuwe_waarde|huidige_waarde|vanaf|definitief|twijfel|citaat|bron_url|titel|aantal|besluit)/i.test(m) && /(42703|PGRST204|PGRST205|does not exist|Could not find)/i.test(m)
    || /(23514|check constraint)/i.test(m) && /nv_peil_signalen/i.test(m);
}

/**
 * Een bestaand signaal mag opnieuw worden beoordeeld (overschreven) zolang de redactie er niets over heeft besloten:
 * zonder besluit_op en met status gesignaleerd, raakt_niet of afgewezen. Een besluit van de redactie blijft altijd staan.
 */
export const signaalOverschrijfbaar = (r: { status: string; besluitOp?: string | null }) => !r.besluitOp && ["gesignaleerd", "raakt_niet", "afgewezen"].includes(r.status);

export interface Opslag {
  naam: string;
  upsertItems(items: BronItem[]): Promise<number>;
  openItems(sindsIso: string): Promise<BronItem[]>;
  markeerVerwerkt(urls: string[], berichtId: string | null, verwerking: string): Promise<void>;
  /** Originele bronkoppen van recent verwerkte berichten, om een tweede bericht over hetzelfde onderwerp te voorkomen. */
  recenteBronKoppen(sindsIso: string): Promise<string[]>;
  slaBerichtOp(b: Bericht): Promise<string>;
  /**
   * Slaat signalen op; "ontbreekt"-signalen over hetzelfde onderwerp worden samengevoegd (aantal). Een bestaande rij voor
   * dezelfde (bericht, parameter) zonder redactiebesluit wordt overschreven (signaalOverschrijfbaar), een rij met besluit blijft staan.
   * Geeft het werkelijk bewaarde aantal (nieuw of overschreven). Zonder migratie: niets bewaard (0).
   */
  slaPeilSignalenOp(s: PeilSignaalIn[]): Promise<number>;
  /** Open signalen (status gesignaleerd, getoetst) voor de redactie, nieuwste eerst. Zonder migratie: leeg. */
  peilSignalen(limiet?: number): Promise<PeilSignaalRij[]>;
  peilSignaal(id: string): Promise<PeilSignaalRij | null>;
  /** Zet de status volgens het besluit van de redactie. Gooit MigratieOntbreekt zolang de migratie niet is toegepast. */
  zetPeilBesluit(id: string, keuze: PeilBesluit, nu?: number): Promise<void>;
  /** Vervangt de PEIL-koppeling van een bericht (peil_raakt en peil_mogelijk_gewijzigd). */
  zetPeilKoppeling(berichtId: string, koppeling: PeilKoppeling): Promise<void>;
  /**
   * Gepubliceerde berichten sinds `sindsIso` met een oude, ongetoetste PEIL-koppeling (zonder zekerheid), of met een oud signaal
   * zonder zekerheid en status raakt_niet zonder redactiebesluit (door een eerdere hertoets leeggemaakt), met tekst.
   */
  teToetsenPeil(sindsIso: string, limiet: number, eenmalig?: string[]): Promise<OpgeslagenBericht[]>;
  /** Sluit oude signalen zonder zekerheid (van vóór PEIL streng) en zonder redactiebesluit van een bericht af (status afgewezen), zodat het bericht niet opnieuw wordt getoetst. */
  sluitOudePeilSignalen(berichtId: string): Promise<void>;
  /** Samenvattingen van de bronitems (op url), voor de hertoets; ontbrekende urls komen niet in de map. */
  bronSamenvattingen(urls: string[]): Promise<Map<string, string>>;
  telGepubliceerdSinds(sindsIso: string): Promise<number>;
  slaRunOp(r: RunRecord): Promise<void>;
  laatsteRun(): Promise<RunRecord | null>;
  opruimen(olderThanIso: string): Promise<number>;
  /** Gepubliceerde berichten zonder beeld (nieuwste eerst), om alsnog een beeld te geven. */
  zonderBeeld(limiet: number): Promise<OpgeslagenBericht[]>;
  zetBeeld(id: string, url: string, credit: BeeldCredit | null): Promise<void>;
  /**
   * Gepubliceerde berichten sinds `sindsIso` (niet redactie "weg", nieuwste eerst) waarvan het beeld herkozen moet worden:
   * beeld_credit.bron "Unsplash", of bron "Illustratie" zonder keuze "model" (besluit 28-11-2026).
   */
  teHerkiezenBeeld(sindsIso: string, limiet: number): Promise<OpgeslagenBericht[]>;
  /** beeld_url's van de nieuwste gepubliceerde berichten (nieuwste eerst), zodat geen foto twee keer wordt gebruikt. */
  recenteBeeldUrls(limiet: number): Promise<string[]>;
  /** Gepubliceerde berichten sinds `sindsIso` met een lagere regelversie dan `versie` (nieuwste eerst), om opnieuw te schrijven. */
  teHerschrijven(sindsIso: string, versie: number, limiet: number): Promise<OpgeslagenBericht[]>;
  /** Werkt kop, samenvatting, tekst, categorie, portemonnee, status, blokkaderedenen en regelversie bij; id, foto en bronnen blijven. */
  werkBerichtBij(id: string, v: BerichtHerschreven): Promise<void>;
  /** Gepubliceerde berichten sinds `sindsIso` zonder signaal-oordeel (nieuwste eerst, met tekst). Zonder de signaalkolommen: leeg. */
  teBeoordelenSignaal(sindsIso: string, limiet: number): Promise<OpgeslagenBericht[]>;
  /** Zet het signaal-oordeel van een bericht (null is ook een oordeel). Zonder de signaalkolommen: niets. */
  zetSignaal(id: string, signaal: Signaal | null): Promise<void>;
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
  // ---- Radar (28-11-2026): onderwerpsignalen in nv_radar; nooit bron. Ontbreekt de tabel, dan gooien radarBekend, radarOpslaan en
  // zetRadarBesluit RadarOntbreekt; radarOpen en radarOpruimen geven dan leeg/0.
  /** Signaal-urls sinds `sindsIso` (dedup: al beoordeeld). */
  radarBekend(sindsIso: string): Promise<string[]>;
  /** Overheidsitems (regime overheid, ook verwerkte) sinds `sindsIso`, nieuwste eerst, voor de bronkoppeling. */
  radarOverheidItems(sindsIso: string): Promise<BronItem[]>;
  /** Slaat signalen op, ontdubbeld op signaal_url; geeft het aantal nieuw bewaarde rijen. */
  radarOpslaan(rijen: RadarNieuw[]): Promise<number>;
  /** Open signalen (zonder besluit), nieuwste eerst. */
  radarOpen(limiet: number): Promise<RadarRij[]>;
  radarRij(id: string): Promise<RadarRij | null>;
  zetRadarBesluit(id: string, keuze: RadarBesluit, nu?: number): Promise<void>;
  /** Ruimt signalen op die voor `oudIso` zijn beoordeeld. */
  radarOpruimen(oudIso: string): Promise<number>;
}

// ---- Geheugen -----------------------------------------------------------------
export class GeheugenOpslag implements Opslag {
  naam = "geheugen";
  items = new Map<string, BronItem & { verwerkt?: string; berichtId?: string | null }>();
  berichtenLijst: OpgeslagenBericht[] = [];
  signalen: PeilSignaalRij[] = [];
  runs: RunRecord[] = [];
  radarRijen: RadarRij[] = [];
  /** Voor tests: doet alsof de tabel nv_radar ontbreekt. */
  radarTabelOntbreekt = false;
  private n = 0;
  private radarCheck() {
    if (this.radarTabelOntbreekt) throw new RadarOntbreekt();
  }
  async radarBekend(sinds: string) {
    this.radarCheck();
    return this.radarRijen.filter((r) => r.beoordeeldOp >= sinds).map((r) => r.signaalUrl);
  }
  async radarOverheidItems(sinds: string) {
    return [...this.items.values()].filter((i) => i.regime === "overheid" && i.gepubliceerdOp >= sinds).sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp));
  }
  async radarOpslaan(rijen: RadarNieuw[]) {
    this.radarCheck();
    let n = 0;
    for (const r of rijen) {
      if (this.radarRijen.some((x) => x.signaalUrl === r.signaalUrl)) continue;
      this.radarRijen.push({ ...r, id: `radar-${(this.n += 1)}`, besluit: null, besluitOp: null });
      n += 1;
    }
    return n;
  }
  async radarOpen(limiet: number) {
    if (this.radarTabelOntbreekt) return [];
    return this.radarRijen.filter((r) => !r.besluit).sort((a, b) => b.signaalDatum.localeCompare(a.signaalDatum)).slice(0, limiet);
  }
  async radarRij(id: string) {
    if (this.radarTabelOntbreekt) throw new RadarOntbreekt();
    return this.radarRijen.find((r) => r.id === id) || null;
  }
  async zetRadarBesluit(id: string, keuze: RadarBesluit, nu = Date.now()) {
    this.radarCheck();
    const r = this.radarRijen.find((x) => x.id === id);
    if (r) Object.assign(r, { besluit: keuze, besluitOp: new Date(nu).toISOString() });
  }
  async radarOpruimen(oud: string) {
    if (this.radarTabelOntbreekt) return 0;
    const voor = this.radarRijen.length;
    this.radarRijen = this.radarRijen.filter((r) => r.beoordeeldOp >= oud);
    return voor - this.radarRijen.length;
  }
  async upsertItems(items: BronItem[]) {
    let nieuw = 0;
    for (const it of items) if (!isVerbodenBron(it.url) && !this.items.has(it.url)) (this.items.set(it.url, { ...it, opgehaaldOp: new Date().toISOString() }), (nieuw += 1));
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
    let n = 0;
    for (const x of s) {
      let doel: PeilSignaalRij | undefined;
      if (x.soort === "ontbreekt") {
        const m = zoekSamenvoeging(x.titel, x.parameterId, this.signalen.filter((y) => y.soort === "ontbreekt"));
        if (m && m.berichtId !== x.berichtId) {
          m.aantal += 1;
          continue;
        }
        doel = m ?? undefined;
      } else doel = this.signalen.find((y) => y.berichtId === x.berichtId && y.parameterId === x.parameterId);
      if (doel) {
        if (!signaalOverschrijfbaar(doel)) continue;
        Object.assign(doel, { ...x, parameterId: doel.parameterId, status: "gesignaleerd", besluit: null, besluitOp: null });
        n += 1;
        continue;
      }
      this.signalen.push({ ...x, id: `sig-${(this.n += 1)}`, status: "gesignaleerd", aantal: 1, besluit: null, besluitOp: null, berichtKop: this.berichtenLijst.find((b) => b.id === x.berichtId)?.kop || "" });
      n += 1;
    }
    return n;
  }
  async peilSignalen(limiet = 200) {
    return this.signalen.filter((x) => x.status === "gesignaleerd" && x.zekerheid).slice(-limiet).reverse();
  }
  async peilSignaal(id: string) {
    return this.signalen.find((x) => x.id === id) || null;
  }
  async zetPeilBesluit(id: string, keuze: PeilBesluit, nu = Date.now()) {
    const x = this.signalen.find((y) => y.id === id);
    if (x) Object.assign(x, { status: keuze, besluit: keuze, besluitOp: new Date(nu).toISOString() });
  }
  async zetPeilKoppeling(berichtId: string, koppeling: PeilKoppeling) {
    const b = this.berichtenLijst.find((x) => x.id === berichtId);
    if (b) b.peil = koppeling;
  }
  async teToetsenPeil(sinds: string, limiet: number, eenmalig: string[] = []) {
    return this.berichtenLijst
      .filter((b) => b.status === "gepubliceerd" && (b.gepubliceerdOp >= sinds && (b.peil.raakt.some((r) => !r.zekerheid) || this.signalen.some((x) => x.berichtId === b.id && !x.zekerheid && x.status === "raakt_niet" && !x.besluitOp)) || (eenmalig.includes(b.id || "") && !this.signalen.some((x) => x.berichtId === b.id && x.zekerheid))))
      .sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp))
      .slice(0, limiet);
  }
  async sluitOudePeilSignalen(berichtId: string) {
    for (const x of this.signalen) if (x.berichtId === berichtId && !x.zekerheid && !x.besluitOp && (x.status === "gesignaleerd" || x.status === "raakt_niet")) x.status = "afgewezen";
  }
  async bronSamenvattingen(urls: string[]) {
    return new Map(urls.flatMap((u) => (this.items.get(u) ? [[u, this.items.get(u)!.samenvatting] as [string, string]] : [])));
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
  async teHerkiezenBeeld(sinds: string, limiet: number) {
    return this.berichtenLijst
      .filter((b) => b.status === "gepubliceerd" && b.redactie !== "weg" && b.gepubliceerdOp >= sinds && b.beeldCredit
        && (b.beeldCredit.bron === "Unsplash" || (b.beeldCredit.bron === "Illustratie" && b.beeldCredit.keuze !== "model")))
      .sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp))
      .slice(0, limiet);
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
  async teBeoordelenSignaal(sinds: string, limiet: number) {
    return this.berichtenLijst
      .filter((b) => b.status === "gepubliceerd" && b.redactie !== "weg" && b.gepubliceerdOp >= sinds && b.signaalBeoordeeld !== true)
      .sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp))
      .slice(0, limiet);
  }
  async zetSignaal(id: string, signaal: Signaal | null) {
    const b = this.berichtenLijst.find((x) => x.id === id);
    if (b) ((b.signaal = signaal), (b.signaalBeoordeeld = true));
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
      .filter((b) => b.status === "gepubliceerd" && b.redactie !== "weg" && (!kanaal || leesKanalen(b.kanalen)[kanaal]) && (!categorie || b.categorie === categorie) && (!peil || groenePeil(b.peil.raakt).length > 0 || b.portemonnee === true))
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
      signalenGesignaleerd: this.signalen.filter((x) => x.status === "gesignaleerd").length,
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
  /** Idem voor de signaalkolommen (eigen vlag, zodat een ontbrekende signaalmigratie de redactiekolommen niet uitschakelt). */
  private zonderSignaalTot = 0;
  private signaalWeg = () => Date.now() < this.zonderSignaalTot;
  /** Probeer met de signaalvelden; ontbreken de kolommen, dan zonder (en 5 minuten niet meer proberen). */
  private async metSignaal<T>(mooi: () => Promise<T>, oud: () => Promise<T>): Promise<T> {
    if (this.signaalWeg()) return oud();
    try {
      return await mooi();
    } catch (e) {
      if (!isSignaalKolomFout(e)) throw e;
      this.zonderSignaalTot = Date.now() + 5 * 60_000;
      return oud();
    }
  }
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

  // ---- Radar: tabel nv_radar (migratie 20261128120000_nv_radar.sql, door de regisseur toe te passen) ----
  private async radarVraag<T>(f: () => Promise<T>): Promise<T> {
    try {
      return await f();
    } catch (e) {
      if (isRadarFout(e)) throw new RadarOntbreekt();
      throw e;
    }
  }
  private naarRadar(r: Rij): RadarRij {
    const t = (v: unknown) => (v == null ? null : String(v));
    const pb = r.primaire_bron;
    const lijst = (Array.isArray(pb) ? pb : pb && typeof pb === "object" ? [pb] : []) as Rij[];
    const bronnen: RadarBron[] = lijst.filter((x) => x && x.url).map((x) => ({ naam: String(x.naam || ""), url: String(x.url), datum: String(x.datum || "") }));
    return {
      id: String(r.id), signaalUrl: String(r.signaal_url), signaalDatum: String(r.signaal_datum), werktitel: String(r.werktitel), categorie: r.categorie as RadarRij["categorie"],
      relevantie: String(r.relevantie || ""), status: r.status as RadarRij["status"], primaireBron: bronnen.length ? bronnen : null, berichtId: t(r.bericht_id),
      beoordeeldOp: String(r.beoordeeld_op), besluit: r.besluit === "geaccepteerd" || r.besluit === "afgewezen" ? r.besluit : null, besluitOp: t(r.besluit_op),
    };
  }
  async radarBekend(sinds: string) {
    return this.radarVraag(async () => (await this.lees(`nv_radar?beoordeeld_op=gte.${encodeURIComponent(sinds)}&select=signaal_url&limit=5000`)).map((r) => String(r.signaal_url)));
  }
  async radarOverheidItems(sinds: string) {
    const rijen = await this.lees(`nv_bron_items?regime=eq.overheid&gepubliceerd_op=gte.${encodeURIComponent(sinds)}&order=gepubliceerd_op.desc&limit=2000`);
    return rijen.map(naarItem);
  }
  async radarOpslaan(rijen: RadarNieuw[]) {
    if (!rijen.length) return 0;
    return this.radarVraag(async () => {
      const r = await this.vraag("nv_radar?on_conflict=signaal_url", {
        method: "POST", prefer: "resolution=ignore-duplicates,return=representation",
        body: JSON.stringify(rijen.map((x) => ({
          signaal_url: x.signaalUrl, signaal_datum: x.signaalDatum, werktitel: x.werktitel, categorie: x.categorie, relevantie: x.relevantie, status: x.status,
          primaire_bron: x.primaireBron, bericht_id: x.berichtId && /^[0-9a-f-]{36}$/i.test(x.berichtId) ? x.berichtId : null, beoordeeld_op: x.beoordeeldOp,
        }))),
      });
      return ((await r.json()) as Rij[]).length;
    });
  }
  async radarOpen(limiet: number) {
    try {
      return (await this.lees(`nv_radar?besluit=is.null&order=signaal_datum.desc&limit=${Math.max(1, Math.min(200, limiet))}`)).map((r) => this.naarRadar(r));
    } catch (e) {
      if (isRadarFout(e)) return [];
      throw e;
    }
  }
  async radarRij(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return this.radarVraag(async () => {
      const r = (await this.lees(`nv_radar?id=eq.${id}&limit=1`))[0];
      return r ? this.naarRadar(r) : null;
    });
  }
  async zetRadarBesluit(id: string, keuze: RadarBesluit, nu = Date.now()) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    await this.radarVraag(() => this.vraag(`nv_radar?id=eq.${id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ besluit: keuze, besluit_op: new Date(nu).toISOString() }) }));
  }
  async radarOpruimen(oud: string) {
    try {
      const r = await this.vraag(`nv_radar?beoordeeld_op=lt.${encodeURIComponent(oud)}`, { method: "DELETE", prefer: "return=representation" });
      return ((await r.json()) as Rij[]).length;
    } catch (e) {
      if (isRadarFout(e)) return 0;
      throw e;
    }
  }

  async upsertItems(items: BronItem[]) {
    let nieuw = 0;
    items = items.filter((x) => !isVerbodenBron(x.url)); // harde regel: een verboden brondomein komt nooit in nv_bron_items
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
    const schrijf = async (metSoort: boolean, metSignaal = true) => this.vraag("nv_berichten?on_conflict=sleutel", {
      method: "POST", prefer: "resolution=merge-duplicates,return=representation",
      body: JSON.stringify({
        ...(metSoort ? { soort: soortVan({ soort: b.soort, regime: b.regime }) } : {}),
        ...(metSignaal ? { signaal: leesSignaal(b.signaal), signaal_beoordeeld: b.signaalBeoordeeld === true } : {}),
        sleutel: b.sleutel, kop: b.kop, samenvatting: b.samenvatting, tekst: b.tekst, categorie: b.categorie, score: b.score, regime: b.regime,
        status: b.status, blokkade_redenen: b.blokkadeRedenen, beeld_url: b.beeldUrl, beeld_credit: b.beeldCredit ?? null, portemonnee: b.portemonnee === true, regelversie: b.regelversie ?? REGELVERSIE, peil_raakt: b.peil.raakt, peil_mogelijk_gewijzigd: b.peil.mogelijkGewijzigd,
        model: process.env.NIEUWS_MODEL_SYNTHESE || null, gepubliceerd_op: b.gepubliceerdOp,
      }),
    });
    const r = await this.metSignaal(
      () => this.metKolommen(() => schrijf(true), () => schrijf(false)),
      () => this.metKolommen(() => schrijf(true, false), () => schrijf(false, false))
    );
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
    try {
      type Bestaand = { id: string; parameterId: string; titel: string; berichtId: string; aantal: number; status: string; besluitOp: string | null };
      const naarBestaand = (r: Rij): Bestaand => ({ id: String(r.id), parameterId: String(r.parameter_id), titel: String(r.titel || ""), berichtId: String(r.bericht_id), aantal: Number(r.aantal || 1), status: String(r.status), besluitOp: r.besluit_op ? String(r.besluit_op) : null });
      const kolommen = "id,parameter_id,titel,bericht_id,aantal,status,besluit_op";
      // Bestaande rijen van de betrokken berichten: dezelfde (bericht, parameter) wordt overschreven of laat staan, nooit stil genegeerd.
      const ids = [...new Set(s.map((x) => x.berichtId))].filter((i) => /^[0-9a-f-]{36}$/i.test(i));
      const perPaar = new Map<string, Bestaand>();
      if (ids.length) for (const r of await this.lees(`nv_peil_signalen?bericht_id=in.(${ids.join(",")})&select=${kolommen}&limit=1000`)) { const b = naarBestaand(r); perPaar.set(`${b.berichtId}|${b.parameterId}`, b); }
      let ontbreekt: Bestaand[] | null = null;
      const veld = (x: PeilSignaalIn) => ({
        parameter_naam: x.parameterNaam, toelichting: x.toelichting, status: "gesignaleerd", soort: x.soort, zekerheid: x.zekerheid, titel: x.titel, nieuwe_waarde: x.nieuweWaarde,
        huidige_waarde: x.huidigeWaarde, vanaf: x.vanaf, definitief: x.definitief, twijfel: x.twijfel, citaat: x.citaat, bron_url: x.bronUrl,
      });
      const nieuw: PeilSignaalIn[] = [];
      let bewaard = 0;
      const overschrijf = async (b: Bestaand, x: PeilSignaalIn) => {
        const r = await this.vraag(`nv_peil_signalen?id=eq.${b.id}`, {
          method: "PATCH", prefer: "return=representation",
          body: JSON.stringify({ ...veld(x), besluit: null, besluit_op: null, aangemaakt_op: new Date().toISOString() }),
        });
        bewaard += ((await r.json()) as Rij[]).length;
      };
      for (const x of s) {
        let doel: Bestaand | undefined;
        if (x.soort === "ontbreekt") {
          ontbreekt ??= (await this.lees(`nv_peil_signalen?soort=eq.ontbreekt&select=${kolommen}&limit=500`)).map(naarBestaand);
          const m = zoekSamenvoeging(x.titel, x.parameterId, ontbreekt);
          if (m && m.berichtId !== x.berichtId) {
            m.aantal += 1;
            if (m.id) await this.vraag(`nv_peil_signalen?id=eq.${m.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ aantal: m.aantal }) });
            continue;
          }
          doel = m ?? undefined;
          if (!doel) ontbreekt.push({ id: "", parameterId: x.parameterId, titel: x.titel, berichtId: x.berichtId, aantal: 1, status: "gesignaleerd", besluitOp: null });
        } else doel = perPaar.get(`${x.berichtId}|${x.parameterId}`);
        if (doel) {
          if (doel.id && signaalOverschrijfbaar(doel)) await overschrijf(doel, x);
          continue; // een besluit van de redactie blijft staan
        }
        nieuw.push(x);
      }
      if (nieuw.length) {
        const r = await this.vraag("nv_peil_signalen?on_conflict=bericht_id,parameter_id", {
          method: "POST", prefer: "resolution=ignore-duplicates,return=representation",
          body: JSON.stringify(nieuw.map((x) => ({ bericht_id: x.berichtId, parameter_id: x.parameterId, ...veld(x) }))),
        });
        bewaard += ((await r.json()) as Rij[]).length; // het werkelijke aantal, niet het aantal dat we probeerden
      }
      return bewaard;
    } catch (e) {
      if (isPeilKolomFout(e)) return 0; // migratie nog niet toegepast: geen signalen bewaard, de koppeling zelf werkt wel
      throw e;
    }
  }
  private naarSignaal(r: Rij): PeilSignaalRij {
    const t = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
    return {
      id: String(r.id), berichtId: String(r.bericht_id), parameterId: String(r.parameter_id), parameterNaam: String(r.parameter_naam || ""), toelichting: String(r.toelichting || ""),
      soort: r.soort === "ontbreekt" ? "ontbreekt" : "wijziging", zekerheid: r.zekerheid === "groen" ? "groen" : r.zekerheid === "oranje" ? "oranje" : (null as unknown as "oranje"),
      titel: String(r.titel || r.parameter_naam || ""), nieuweWaarde: t(r.nieuwe_waarde), huidigeWaarde: t(r.huidige_waarde), vanaf: t(r.vanaf),
      definitief: typeof r.definitief === "boolean" ? r.definitief : null, twijfel: t(r.twijfel), citaat: t(r.citaat), bronUrl: t(r.bron_url),
      status: String(r.status), aantal: Number(r.aantal || 1), besluit: t(r.besluit), besluitOp: t(r.besluit_op),
      berichtKop: String((r.nv_berichten as Rij | null)?.kop || ""),
    };
  }
  async peilSignalen(limiet = 200) {
    try {
      const rijen = await this.lees(`nv_peil_signalen?status=eq.gesignaleerd&zekerheid=not.is.null&order=aangemaakt_op.desc&limit=${limiet}&select=*,nv_berichten(kop)`);
      return rijen.map((r) => this.naarSignaal(r));
    } catch (e) {
      if (isPeilKolomFout(e)) return [];
      throw e;
    }
  }
  async peilSignaal(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    try {
      const r = (await this.lees(`nv_peil_signalen?id=eq.${id}&select=*,nv_berichten(kop)`))[0];
      return r ? this.naarSignaal(r) : null;
    } catch (e) {
      if (isPeilKolomFout(e)) throw new MigratieOntbreekt();
      throw e;
    }
  }
  async zetPeilBesluit(id: string, keuze: PeilBesluit, nu = Date.now()) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    try {
      await this.vraag(`nv_peil_signalen?id=eq.${id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ status: keuze, besluit: keuze, besluit_op: new Date(nu).toISOString() }) });
    } catch (e) {
      if (isPeilKolomFout(e)) throw new MigratieOntbreekt();
      throw e;
    }
  }
  async zetPeilKoppeling(berichtId: string, koppeling: PeilKoppeling) {
    if (!/^[0-9a-f-]{36}$/i.test(berichtId)) return;
    await this.vraag(`nv_berichten?id=eq.${berichtId}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ peil_raakt: koppeling.raakt, peil_mogelijk_gewijzigd: koppeling.mogelijkGewijzigd }) });
  }
  async teToetsenPeil(sinds: string, limiet: number, eenmalig: string[] = []) {
    const sel = "select=*,nv_bronnen_per_bericht(*)";
    const rijen = await this.lees(`nv_berichten?status=eq.gepubliceerd&gepubliceerd_op=gte.${encodeURIComponent(sinds)}&peil_raakt=neq.[]&order=gepubliceerd_op.desc&limit=100&${sel}`);
    const lijst = rijen.map(naarBericht).filter((b) => b.peil.raakt.some((r) => !r.zekerheid));
    // Berichten die een eerdere hertoets leeggemaakt heeft: oud signaal zonder zekerheid, raakt_niet, zonder redactiebesluit.
    try {
      const sig = await this.lees("nv_peil_signalen?zekerheid=is.null&status=eq.raakt_niet&besluit_op=is.null&select=bericht_id&limit=200");
      const ids = [...new Set(sig.map((r) => String(r.bericht_id)))].filter((i) => /^[0-9a-f-]{36}$/i.test(i) && !lijst.some((b) => b.id === i)).slice(0, 60);
      if (ids.length) {
        const extra = await this.lees(`nv_berichten?id=in.(${ids.join(",")})&status=eq.gepubliceerd&gepubliceerd_op=gte.${encodeURIComponent(sinds)}&order=gepubliceerd_op.desc&limit=100&${sel}`);
        lijst.push(...extra.map(naarBericht));
      }
    } catch (e) {
      if (!isPeilKolomFout(e)) throw e; // zonder migratie bestaan zekerheid en besluit_op niet: dan geen oude signalen om te onderscheiden
    }
    // Eenmalige hertoets: opgegeven berichten zonder enig signaal met zekerheid (zie EENMALIGE_PEIL_HERTOETS in config.ts).
    const ids = eenmalig.filter((i) => /^[0-9a-f-]{36}$/i.test(i) && !lijst.some((b) => b.id === i));
    if (ids.length) {
      try {
        const met = new Set((await this.lees(`nv_peil_signalen?bericht_id=in.(${ids.join(",")})&zekerheid=not.is.null&select=bericht_id&limit=200`)).map((r) => String(r.bericht_id)));
        const open = ids.filter((i) => !met.has(i));
        if (open.length) lijst.push(...(await this.lees(`nv_berichten?id=in.(${open.join(",")})&status=eq.gepubliceerd&limit=20&${sel}`)).map(naarBericht));
      } catch (e) {
        if (!isPeilKolomFout(e)) throw e;
      }
    }
    // Eenmalig opgegeven berichten gaan voor, daarna de nieuwste.
    return lijst.sort((a, b) => Number(eenmalig.includes(b.id || "")) - Number(eenmalig.includes(a.id || "")) || b.gepubliceerdOp.localeCompare(a.gepubliceerdOp)).slice(0, limiet);
  }
  async sluitOudePeilSignalen(berichtId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(berichtId)) return;
    try {
      // Status afgewezen = automatisch afgesloten na de hertoets, zonder redactiebesluit (besluit_op blijft leeg); komt niet meer terug als kandidaat.
      await this.vraag(`nv_peil_signalen?bericht_id=eq.${berichtId}&zekerheid=is.null&besluit_op=is.null&status=in.(gesignaleerd,raakt_niet)`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ status: "afgewezen" }) });
    } catch (e) {
      if (!isPeilKolomFout(e)) throw e; // zonder migratie bestaan er geen oude signalen om te sluiten die we kunnen onderscheiden
    }
  }
  async bronSamenvattingen(urls: string[]) {
    const uit = new Map<string, string>();
    for (let i = 0; i < urls.length; i += 40) {
      const lijst = urls.slice(i, i + 40).map((u) => `"${u.replace(/"/g, '\\"')}"`).join(",");
      for (const r of await this.lees(`nv_bron_items?url=in.(${encodeURIComponent(lijst)})&select=url,samenvatting`)) uit.set(String(r.url), String(r.samenvatting || ""));
    }
    return uit;
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
  async teHerkiezenBeeld(sinds: string, limiet: number) {
    const wie = encodeURIComponent("(beeld_credit->>bron.eq.Unsplash,and(beeld_credit->>bron.eq.Illustratie,beeld_credit->>keuze.is.null),and(beeld_credit->>bron.eq.Illustratie,beeld_credit->>keuze.neq.model))");
    const zoek = (extra: string) => this.lees(`nv_berichten?status=eq.gepubliceerd&gepubliceerd_op=gte.${encodeURIComponent(sinds)}&or=${wie}${extra}&order=gepubliceerd_op.desc&limit=${limiet}&select=*,nv_bronnen_per_bericht(*)`);
    // "weg"-berichten blijven buiten schot (zonder migratie bestaat die kolom niet).
    const rijen = await this.metKolommen(() => zoek("&redactie=is.null"), () => zoek(""));
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
    const patch = (extra: string, metSignaal = true) => this.vraag(`nv_berichten?id=eq.${id}${extra}`, {
      method: "PATCH", prefer: "return=minimal",
      body: JSON.stringify({ ...(metSignaal && v.signaalBeoordeeld ? { signaal: leesSignaal(v.signaal), signaal_beoordeeld: true } : {}), kop: v.kop, samenvatting: v.samenvatting, tekst: v.tekst, categorie: v.categorie, portemonnee: v.portemonnee, status: v.status, blokkade_redenen: v.blokkadeRedenen, regelversie: v.regelversie, model: process.env.NIEUWS_MODEL_SYNTHESE || null }),
    });
    // Een handmatig gecorrigeerd bericht wordt nooit overschreven (filter in de database, ook als het tussentijds is bewerkt).
    await this.metSignaal(
      () => this.metKolommen(() => patch("&handmatig_op=is.null"), () => patch("")),
      () => this.metKolommen(() => patch("&handmatig_op=is.null", false), () => patch("", false))
    );
  }
  async teBeoordelenSignaal(sinds: string, limiet: number) {
    if (this.signaalWeg()) return [];
    try {
      const rijen = await this.lees(`nv_berichten?status=eq.gepubliceerd&signaal_beoordeeld=eq.false&gepubliceerd_op=gte.${encodeURIComponent(sinds)}&order=gepubliceerd_op.desc&limit=${limiet}&select=*,nv_bronnen_per_bericht(*)`);
      return rijen.map(naarBericht).filter((b) => b.redactie !== "weg");
    } catch (e) {
      if (!isSignaalKolomFout(e)) throw e;
      this.zonderSignaalTot = Date.now() + 5 * 60_000;
      return [];
    }
  }
  async zetSignaal(id: string, signaal: Signaal | null) {
    if (!/^[0-9a-f-]{36}$/i.test(id) || this.signaalWeg()) return;
    try {
      await this.vraag(`nv_berichten?id=eq.${id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ signaal: leesSignaal(signaal), signaal_beoordeeld: true }) });
    } catch (e) {
      if (!isSignaalKolomFout(e)) throw e;
      this.zonderSignaalTot = Date.now() + 5 * 60_000;
    }
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
    const cat = categorie ? `&categorie=eq.${encodeURIComponent(categorie)}` : "";
    // Lezers zien alleen groene koppelingen (besluit 26-11-2026): het filter eist een groene koppeling of portemonnee=true.
    // Valt de database over de syntaxis, dan het oude filter, met het groen-filter achteraf (groenePeil).
    const filterGroen = cat + (peil ? `&or=${encodeURIComponent('(peil_raakt.cs."[{\\"zekerheid\\":\\"groen\\"}]",portemonnee.eq.true)')}` : "");
    const filterOud = cat + (peil ? `&or=${encodeURIComponent("(peil_raakt.neq.[],portemonnee.eq.true)")}` : "");
    const zoek = async (extra: string) => {
      const pad = (f: string) => `nv_berichten?status=eq.gepubliceerd${extra}${f}&order=gepubliceerd_op.desc&limit=${limiet}&offset=${offset}&select=*,nv_bronnen_per_bericht(*)`;
      if (!peil) return this.lees(pad(filterGroen));
      try {
        return await this.lees(pad(filterGroen));
      } catch (e) {
        if (isKolomFout(e) || isPeilKolomFout(e)) throw e;
        return (await this.lees(pad(filterOud))).filter((r) => r.portemonnee === true || groenePeil((r.peil_raakt as PeilKoppeling["raakt"]) || []).length > 0);
      }
    };
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
    blokkadeRedenen: (r.blokkade_redenen as string[]) || [], beeldUrl: (r.beeld_url as string) || null, beeldCredit: (r.beeld_credit as OpgeslagenBericht["beeldCredit"]) || null, portemonnee: r.portemonnee === true, signaal: leesSignaal(r.signaal), signaalBeoordeeld: r.signaal_beoordeeld === true, regelversie: Number(r.regelversie ?? 1), peil, bronnen, gepubliceerdOp: String(r.gepubliceerd_op),
  };
}

/** Supabase als de sleutels er zijn, anders null (dan draait de motor droog). */
export function maakOpslag(): Opslag | null {
  const u = process.env.SUPABASE_URL;
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return u && k ? new SupabaseOpslag(u, k) : null;
}
