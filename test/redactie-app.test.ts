// Redactie-app (/redactie, 28-11-2026): inloggen met sleutel of persoonlijke link, tokens (alleen de hash wordt bewaard), handelingen
// (weg, beeldbank, tekening, radar, bronnen) en de routes. Geen netwerk: nep-Supabase en nep-fetch.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { GeheugenOpslag, SupabaseOpslag, TabelOntbreekt, type OpgeslagenBericht } from "../lib/motor/opslag";
import { wisOpslagCache, publiekBericht } from "../lib/motor/api";
import { wisRem as wisApiRem } from "../lib/redactie";
import {
  REDACTIE_COOKIE, bepaalToegang, beheerderSleutelKlopt, hashToken, isTokenVorm, leesCookie, maakBeheerderCookie, maakRedacteurCookie, maakToken, maakVrijwilliger,
  redacteurVoorToken, teVaak, noteerFout, wisRedactieRem, cookieKop, cookieVerlenging,
} from "../lib/redactie-toegang";
import { beeldbankKeuzes, gebruikTekening, kiesBeeldUitBeeldbank, metMelding, tekenVoorBericht, veiligTerug, voerActieUit } from "../lib/redactie-acties";
import { ILLUSTRATIES, pad } from "../lib/motor/illustraties";
import { VOORBEELDEN, TEKEN_MELDING } from "../lib/redactie-tekenen";
import { klein } from "./helpers";
import { POST as aanmelden } from "../app/redactie/aanmelden/route";
import { POST as uitloggen } from "../app/redactie/uitloggen/route";
import { POST as activeer } from "../app/redactie/welkom/activeer/route";
import { POST as maakMens } from "../app/redactie/mensen/maak/route";
import { POST as actie } from "../app/redactie/actie/route";
import { POST as tekenRoute } from "../app/redactie/actie/teken/route";
import { POST as gebruikRoute } from "../app/redactie/actie/gebruik/route";
import { proxy } from "../proxy";
import { NextRequest } from "next/server";

const ID1 = "11111111-1111-1111-1111-111111111111";
const ID2 = "22222222-2222-2222-2222-222222222222";
const GEHEIM = "test-sleutel-voor-de-redactie";
const bericht = (id: string, o: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht => ({
  id, soort: "pers", kop: "Nieuwe regels voor huurders van tweede woningen", samenvatting: "Huiseigenaren krijgen andere verplichtingen.", tekst: "Eerste alinea.\n\nTweede alinea.", categorie: "economie en ondernemen",
  score: 80, regime: "pers", status: "gepubliceerd", blokkadeRedenen: [], portemonnee: false, signaal: null, signaalBeoordeeld: true, beeldUrl: null, beeldCredit: null,
  peil: { raakt: [], mogelijkGewijzigd: [] }, bronnen: [{ naam: "Bron", origineleKop: "Titre", datum: "2026-11-26T07:00:00.000Z", url: "https://www.service-public.fr/a" }], gepubliceerdOp: new Date().toISOString(), regelversie: 2, ...o,
} as OpgeslagenBericht);

const omg = { r: process.env.REDACTIE_SECRET, c: process.env.CRON_SECRET };
function zetGeheim(v: string | undefined) {
  if (v === undefined) { delete process.env.REDACTIE_SECRET; delete process.env.CRON_SECRET; } else { process.env.REDACTIE_SECRET = v; delete process.env.CRON_SECRET; }
}
afterEach(() => {
  [process.env.REDACTIE_SECRET, process.env.CRON_SECRET] = [omg.r, omg.c];
  if (omg.r === undefined) delete process.env.REDACTIE_SECRET;
  if (omg.c === undefined) delete process.env.CRON_SECRET;
  wisRedactieRem();
  wisApiRem();
});

// ---- Tokens en cookies -------------------------------------------------------------------------------------
test("vrijwilliger toevoegen: token van 32 bytes, in de opslag alleen de SHA-256-hash", async () => {
  const opslag = new GeheugenOpslag();
  const u = await maakVrijwilliger(opslag, "  Marijke  ");
  assert.ok(u.ok);
  if (!u.ok) return;
  assert.equal(Buffer.from(u.token, "base64url").length, 32);
  assert.ok(isTokenVorm(u.token));
  assert.equal(u.redacteur.naam, "Marijke");
  assert.equal(u.redacteur.rol, "redacteur");
  const opgeslagen = JSON.stringify(opslag.redacteuren);
  assert.ok(!opgeslagen.includes(u.token), "het token zelf staat nergens in de opslag");
  assert.equal(opslag.redacteuren[0].hash, createHash("sha256").update(u.token).digest("hex"));
  assert.equal(opslag.redacteuren[0].hash, hashToken(u.token));
  assert.ok(!JSON.stringify(await opslag.redacteurLijst()).includes(hashToken(u.token)), "ook de hash komt niet in de lijst voor het scherm");
  assert.notEqual(maakToken(), maakToken());
});

test("vrijwilliger toevoegen: naam gecontroleerd; zonder tabel een nette melding", async () => {
  const opslag = new GeheugenOpslag();
  for (const naam of ["", "x", "a".repeat(61)]) assert.equal((await maakVrijwilliger(opslag, naam)).ok, false);
  assert.equal((await maakVrijwilliger(opslag, "<b>Jan</b>")).ok && opslag.redacteuren[0].naam, "bJan/b");
  const weg = new GeheugenOpslag();
  weg.redacteurenTabelOntbreekt = true;
  const u = await maakVrijwilliger(weg, "Piet");
  assert.equal(u.ok, false);
  if (!u.ok) assert.equal(u.melding, "Dit werkt tijdelijk niet. Anton is ingelicht.");
});

test("persoonlijke link: geldig token geeft toegang als redacteur; ingetrokken is dicht; onbekend of kapot is dicht", async () => {
  zetGeheim(undefined);
  const opslag = new GeheugenOpslag();
  const u = await maakVrijwilliger(opslag, "Marijke");
  assert.ok(u.ok);
  if (!u.ok) return;
  const cookie = maakRedacteurCookie(u.token);
  assert.deepEqual(await bepaalToegang(cookie, opslag), { rol: "redacteur", naam: "Marijke", id: u.redacteur.id });
  assert.ok(opslag.redacteuren[0].laatstGezien, "laatst gezien is bijgewerkt");
  assert.equal((await redacteurVoorToken(u.token, opslag))?.naam, "Marijke");
  await opslag.redacteurIntrekken(u.redacteur.id);
  assert.equal(await bepaalToegang(cookie, opslag), null, "ingetrokken = dicht");
  assert.equal(await redacteurVoorToken(u.token, opslag), null);
  for (const slecht of [`r.${maakToken()}`, "r.kort", "r.", "x.abc", "", undefined, "b.1.2"]) assert.equal(await bepaalToegang(slecht, opslag), null, String(slecht));
});

test("zonder geheim én zonder tabel is alles dicht; zonder tabel werkt de beheerder met de sleutel nog wel", async () => {
  const geenTabel = new GeheugenOpslag();
  geenTabel.redacteurenTabelOntbreekt = true;
  zetGeheim(undefined);
  assert.equal(maakBeheerderCookie(), null);
  assert.equal(beheerderSleutelKlopt(""), false);
  assert.equal(beheerderSleutelKlopt("iets"), false);
  assert.equal(await bepaalToegang(`b.${Math.floor(Date.now() / 1000) + 1000}.abc`, geenTabel), null);
  assert.equal(await bepaalToegang(`r.${maakToken()}`, geenTabel), null);
  assert.equal(await bepaalToegang(`r.${maakToken()}`, null), null);
  zetGeheim(GEHEIM);
  assert.equal((await bepaalToegang(maakBeheerderCookie()!, geenTabel))?.rol, "beheerder");
});

test("beheerder: sleutel REDACTIE_SECRET (terugval CRON_SECRET); het cookie bevat nooit het geheim; verlopen of geknoeid cookie is dicht", async () => {
  zetGeheim(GEHEIM);
  assert.equal(beheerderSleutelKlopt(GEHEIM), true);
  assert.equal(beheerderSleutelKlopt(GEHEIM + "x"), false);
  const nu = Date.now();
  const c = maakBeheerderCookie(nu)!;
  assert.ok(c.startsWith("b.") && !c.includes(GEHEIM));
  assert.deepEqual(await bepaalToegang(c, null, nu + 3600_000), { rol: "beheerder", naam: "Beheerder", id: null });
  assert.equal(await bepaalToegang(c, null, nu + 8 * 86400_000), null, "na 7 dagen verlopen");
  const [b, exp, sig] = c.split(".");
  assert.equal(await bepaalToegang(`${b}.${Number(exp) + 99999}.${sig}`, null, nu), null, "verlengd zonder geldige handtekening");
  assert.equal(await bepaalToegang(`${b}.${exp}.${sig.slice(0, -1)}${sig.endsWith("0") ? "1" : "0"}`, null, nu), null);
  delete process.env.REDACTIE_SECRET;
  process.env.CRON_SECRET = "terugval-geheim";
  assert.equal(beheerderSleutelKlopt("terugval-geheim"), true);
  assert.equal(await bepaalToegang(c, null, nu), null, "een cookie met een ander geheim klopt niet");
});

test("cookie: httpOnly, Secure, SameSite=Strict, Path=/redactie; Cookie-header lezen", () => {
  const k = cookieKop("b.1.2", 604800);
  assert.match(k, new RegExp(`^${REDACTIE_COOKIE}=b\\.1\\.2; Path=/redactie; HttpOnly; Secure; SameSite=Strict; Max-Age=604800$`));
  assert.equal(leesCookie("a=1; nv_redactie=r.abc; b=2"), "r.abc");
  assert.equal(leesCookie("nv_redactie_x=1"), undefined);
  assert.equal(leesCookie(null), undefined);
});

test("rem: na 5 foute pogingen binnen 10 minuten is het dicht, daarna weer open", () => {
  const nu = 1_000_000;
  for (let i = 0; i < 5; i++) { assert.equal(teVaak("a", nu + i), false); noteerFout("a", nu + i); }
  assert.equal(teVaak("a", nu + 10), true);
  assert.equal(teVaak("b", nu + 10), false);
  assert.equal(teVaak("a", nu + 601_000), false);
});

test("proxy: verlengt het cookie alleen als het token geldig is; ingetrokken of onbekend wordt gewist; bij een storing blijft het staan", async () => {
  const opslag = new GeheugenOpslag();
  const u = await maakVrijwilliger(opslag, "Marijke");
  assert.ok(u.ok);
  if (!u.ok) return;
  const geldig = maakRedacteurCookie(u.token);
  assert.equal(await cookieVerlenging(geldig, opslag), "verleng");
  assert.equal(await cookieVerlenging(maakRedacteurCookie(maakToken()), opslag), "wis", "onbekend token");
  assert.equal(await cookieVerlenging("r.abc", opslag), "wis", "geen tokenvorm");
  assert.equal(await cookieVerlenging("b.1.2", opslag), "laat", "nooit het cookie van de beheerder");
  assert.equal(await cookieVerlenging(undefined, opslag), "laat");
  const stuk = { redacteurPerHash: async () => { throw new Error("storing"); } } as unknown as GeheugenOpslag;
  assert.equal(await cookieVerlenging(geldig, stuk), "laat", "een storing logt niemand uit");
  assert.equal(await cookieVerlenging(geldig, null), "laat");
  await opslag.redacteurIntrekken(opslag.redacteuren[0].id);
  assert.equal(await cookieVerlenging(geldig, opslag), "wis", "ingetrokken");
});

test("proxy: zet bij een geldig token 90 dagen (httpOnly, Secure, strict, Path /redactie) en wist een ongeldig token; niets zonder cookie", async () => {
  const opslag = new GeheugenOpslag();
  const u = await maakVrijwilliger(opslag, "Marijke");
  assert.ok(u.ok);
  if (!u.ok) return;
  const voor = { REDACTIE_SECRET: process.env.REDACTIE_SECRET };
  void voor;
  // De proxy leest de opslag via leesOpslag(); hier een nep-Supabase die alleen de redacteur-opvraging beantwoordt.
  const rij = { id: ID1, naam: "Marijke", token_hash: hashToken(u.token), rol: "redacteur", aangemaakt_op: new Date().toISOString(), laatst_gezien: null, ingetrokken_op: null };
  const env = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, f: globalThis.fetch };
  process.env.SUPABASE_URL = "https://p.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sleutel";
  let ingetrokken = false;
  globalThis.fetch = (async (url: string) => new Response(JSON.stringify(String(url).includes("nv_redacteuren") ? (ingetrokken ? [{ ...rij, ingetrokken_op: new Date().toISOString() }] : [rij]) : []), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  wisOpslagCache();
  try {
    const maak = (c?: string, pad = "/redactie") => new NextRequest(`https://nieuws.test${pad}`, { headers: c ? { cookie: `nv_redactie=${c}` } : {} });
    const gezet = (await proxy(maak(maakRedacteurCookie(u.token)))).headers.get("set-cookie") || "";
    assert.match(gezet, /Max-Age=7776000/);
    assert.match(gezet, /HttpOnly/i);
    assert.match(gezet, /Secure/i);
    assert.match(gezet, /SameSite=strict/i);
    assert.match(gezet, /Path=\/redactie/);
    assert.equal((await proxy(maak(undefined))).headers.get("set-cookie"), null);
    assert.equal((await proxy(maak("b.1.2"))).headers.get("set-cookie"), null);
    ingetrokken = true;
    const gewist = (await proxy(maak(maakRedacteurCookie(u.token)))).headers.get("set-cookie") || "";
    assert.match(gewist, /Max-Age=0/);
    assert.equal((await proxy(maak(maakRedacteurCookie(u.token), "/redactie/welkom/activeer"))).headers.get("set-cookie"), null, "routes die zelf een cookie zetten blijven met rust");
  } finally {
    globalThis.fetch = env.f;
    if (env.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = env.url;
    if (env.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = env.key;
    wisOpslagCache();
  }
});

// ---- Handelingen -------------------------------------------------------------------------------------------
const redacteur = { rol: "redacteur" as const, naam: "Marijke", id: "x" };
const beheerder = { rol: "beheerder" as const, naam: "Beheerder", id: null };

test("terug-pad: alleen binnen /redactie; melding wordt aan het pad gehangen", () => {
  assert.equal(veiligTerug("/redactie/bericht/abc-1?tab=radar"), "/redactie/bericht/abc-1?tab=radar");
  for (const slecht of ["https://evil.test", "//evil.test", "/api/redactie", "/redactie/../x", "javascript:x", "/redactie?x=<script>", undefined, 5]) assert.equal(veiligTerug(slecht), "/redactie", String(slecht));
  assert.equal(metMelding("/redactie/bronnen?tab=radar", "Klaar & gedaan", true), "/redactie/bronnen?tab=radar&m=Klaar+%26+gedaan&ok=1");
  assert.equal(metMelding("/redactie?m=oud&ok=0", "Nieuw", false), "/redactie?m=Nieuw&ok=0");
});

test("weg en terugzetten gebruiken de bestaande redactie-logica (redactie = weg); onbekend bericht geeft een melding", async () => {
  const opslag = new GeheugenOpslag();
  opslag.berichtenLijst.push(bericht(ID1));
  const weg = await voerActieUit(opslag, redacteur, { actie: "weg", id: ID1, terug: `/redactie/bericht/${ID1}` });
  assert.equal(weg.ok, true);
  assert.equal(weg.terug, "/redactie", "na weghalen terug naar de lijst Vandaag");
  assert.equal((await opslag.redactieBericht(ID1))?.redactie, "weg");
  assert.equal((await opslag.berichten({ limiet: 10 })).length, 0, "weg verschijnt nergens");
  const terugzet = await voerActieUit(opslag, redacteur, { actie: "terug", id: ID1, terug: `/redactie/bericht/${ID1}` });
  assert.equal(terugzet.ok, true);
  assert.equal(terugzet.terug, "/redactie");
  assert.equal((await opslag.redactieBericht(ID1))?.redactie ?? null, null);
  assert.equal((await voerActieUit(opslag, redacteur, { actie: "weg", id: ID2 })).ok, false);
  assert.equal((await voerActieUit(opslag, redacteur, { actie: "weg", id: "geen-uuid" })).ok, false);
  assert.equal((await voerActieUit(opslag, redacteur, { actie: "onzin" })).ok, false);
});

test("ander beeld uit de beeldbank: zes kandidaten, kiezen slaat url en credit op met keuze redactie en blijft buiten de automatische herkeuze", async () => {
  const opslag = new GeheugenOpslag();
  opslag.berichtenLijst.push(bericht(ID1));
  const keuzes = await beeldbankKeuzes(opslag, (await opslag.redactieBericht(ID1))!);
  assert.equal(keuzes.length, 6);
  assert.equal(new Set(keuzes.map((k) => k.id)).size, 6);
  const gekozen = keuzes[2];
  const u = await voerActieUit(opslag, redacteur, { actie: "beeld", id: ID1, illustratie: gekozen.id, terug: "/redactie" });
  assert.equal(u.ok, true);
  const b = (await opslag.redactieBericht(ID1))!;
  assert.equal(b.beeldUrl, `https://nieuws.infofrankrijk.com${gekozen.svg}`);
  assert.deepEqual(b.beeldCredit, { bron: "Illustratie", maker: "Communities Abroad", categorie: gekozen.categorie, naam: gekozen.naam, png: `https://nieuws.infofrankrijk.com${gekozen.png}`, keuze: "redactie" });
  assert.deepEqual(await opslag.teHerkiezenBeeld("2000-01-01", 10), [], "stap 6b laat een redactiekeuze staan");
  assert.equal((await kiesBeeldUitBeeldbank(opslag, ID1, "bestaat-niet")).ok, false);
  assert.equal((await kiesBeeldUitBeeldbank(opslag, ID2, gekozen.id)).ok, false);
});

test("beeldbankkeuzes sluiten de beelden van de 13 nieuwste berichten uit", async () => {
  const opslag = new GeheugenOpslag();
  const nu = Date.now();
  for (let n = 0; n < 13; n++) opslag.berichtenLijst.push(bericht(`${String(n).padStart(8, "0")}-1111-1111-1111-111111111111`, { beeldUrl: `https://nieuws.infofrankrijk.com${ILLUSTRATIES.beelden[n].svg}`, gepubliceerdOp: new Date(nu - n * 60000).toISOString() }));
  opslag.berichtenLijst.push(bericht(ID1, { gepubliceerdOp: new Date(nu - 99 * 60000).toISOString() }));
  const bezet = new Set(ILLUSTRATIES.beelden.slice(0, 13).map((i) => i.svg));
  const keuzes = await beeldbankKeuzes(opslag, (await opslag.redactieBericht(ID1))!);
  assert.ok(keuzes.every((k) => !bezet.has(k.svg)));
});

test("tip negeren: melding Tip weggelegd, tweede keer en ontbrekende tabel in gewone taal; Maak bericht gaat via maak-bericht", async () => {
  const opslag2 = new GeheugenOpslag();
  opslag2.radarRijen.push({ id: ID1, signaalUrl: "https://radar.example/a", signaalDatum: "2026-11-27T00:00:00.000Z", werktitel: "Hogere belasting", categorie: "Belastingen", relevantie: "x", status: "klaar voor redactie", primaireBron: null, berichtId: null, beoordeeldOp: "2026-11-27T00:00:00.000Z", besluit: null, besluitOp: null });
  assert.equal((await voerActieUit(opslag2, redacteur, { actie: "radar", id: "geen-uuid", keuze: "afgewezen" })).ok, false);
  assert.equal((await voerActieUit(opslag2, redacteur, { actie: "radar", id: ID1, keuze: "geaccepteerd" })).ok, false, "accepteren kan alleen met Maak bericht");
  const eerst = await voerActieUit(opslag2, redacteur, { actie: "radar", id: ID1, keuze: "afgewezen", terug: "/redactie/radar" });
  assert.deepEqual([eerst.ok, eerst.melding], [true, "Tip weggelegd."]);
  assert.equal(opslag2.radarRijen[0].besluit, "afgewezen");
  const nogeens = await voerActieUit(opslag2, redacteur, { actie: "radar", id: ID1, keuze: "afgewezen" });
  assert.deepEqual([nogeens.ok, nogeens.melding], [false, "Deze tip is al afgehandeld."]);
  assert.equal((await voerActieUit(opslag2, redacteur, { actie: "radar", id: ID1, keuze: "verwijder" })).melding, "Dit kan niet.");
  opslag2.radarTabelOntbreekt = true;
  assert.equal((await voerActieUit(opslag2, redacteur, { actie: "radar", id: ID2, keuze: "afgewezen" })).melding, "Dit werkt tijdelijk niet. Anton is ingelicht.");
});

test("mensen intrekken: alleen de beheerder", async () => {
  const opslag = new GeheugenOpslag();
  const u = await maakVrijwilliger(opslag, "Marijke");
  assert.ok(u.ok);
  if (!u.ok) return;
  opslag.redacteuren[0].id = ID1;
  assert.equal((await voerActieUit(opslag, redacteur, { actie: "mens-intrek", id: ID1 })).ok, false);
  assert.equal(opslag.redacteuren[0].ingetrokkenOp, null);
  const g = await voerActieUit(opslag, beheerder, { actie: "mens-intrek", id: ID1 });
  assert.equal(g.ok, true);
  assert.equal(g.terug, "/redactie/mensen");
  assert.ok(opslag.redacteuren[0].ingetrokkenOp);
  assert.equal(await bepaalToegang(maakRedacteurCookie(u.token), opslag), null);
});

test("bronnen via de handelingen: toevoegen met melding, redacteur mag, weghalen en aanpassen", async () => {
  const opslag = new GeheugenOpslag();
  opslag.bronnenRijen.push({ id: "a", naam: "A", feed: "https://a.test/f", domein: "a.test", taal: "fr", land: "FR", groep: "fr_pers", regime: "pers", status: "ACTIVE", prioriteit: 1, frankrijkFilter: false, vensterUren: 48, soort: "nieuws", actief: true, toegevoegdOp: null, toegevoegdDoor: null, laatstGelezen: null, laatstItems: null, laatsteFout: null });
  const geenFeed = (async () => new Response("nee", { status: 404 })) as unknown as typeof fetch;
  const u = await voerActieUit(opslag, redacteur, { actie: "bron-toevoegen", adres: "krant.test", soort: "nieuws", terug: "/redactie/bronnen" }, geenFeed);
  assert.deepEqual([u.ok, u.melding], [false, "Geen feed gevonden op dit adres. Probeer het adres van de nieuwspagina zelf, of vraag Anton."]);
  assert.equal(u.terugExtra?.adres, "krant.test", "het geplakte adres blijft in het veld staan");
  assert.equal((await voerActieUit(opslag, redacteur, { actie: "bron-wijzig", id: "a", naam: "Krant A", soort: "NL-BE" })).ok, true);
  assert.equal(opslag.bronnenRijen[0].naam, "Krant A");
  const laatste = await voerActieUit(opslag, redacteur, { actie: "bron-weg", id: "a" });
  assert.deepEqual([laatste.ok, laatste.melding], [false, "Er moet minstens één nieuwsbron aan blijven."], "de laatste actieve nieuwsbron blijft");
  opslag.bronnenRijen.push({ ...opslag.bronnenRijen[0], id: "b", naam: "B", feed: "https://b.test/f", domein: "b.test" });
  assert.equal((await voerActieUit(opslag, redacteur, { actie: "bron-weg", id: "a" })).ok, true);
  assert.equal(opslag.bronnenRijen.length, 1);
});

// ---- Tekening gebruiken -------------------------------------------------------------------------------------
const stor = () => {
  const aanroepen: { url: string; body: string }[] = [];
  const fetchFn = (async (u: string, init?: RequestInit) => { aanroepen.push({ url: String(u), body: String(init?.body) }); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
  return { aanroepen, instellingen: { url: "https://p.supabase.co", sleutel: "s", fetchFn } };
};

test("tekening gebruiken: gecontroleerd, in Storage, beeld_url en credit (getekend, png null), lijst in nv_tekeningen; onderschrift en API", async () => {
  const opslag = new GeheugenOpslag();
  opslag.berichtenLijst.push(bericht(ID1));
  const s = stor();
  const u = await gebruikTekening(opslag, ID1, VOORBEELDEN[0], "  Huis met rood dak ", s.instellingen);
  assert.ok(u.ok);
  if (!u.ok) return;
  assert.match(u.url, /^https:\/\/p\.supabase\.co\/storage\/v1\/object\/public\/nv-tekeningen\/\d{4}-\d{2}-\d{2}-[0-9a-f-]{36}\.svg$/);
  assert.equal(s.aanroepen.length, 1);
  assert.equal(s.aanroepen[0].body, VOORBEELDEN[0]);
  const b = (await opslag.redactieBericht(ID1))!;
  assert.equal(b.beeldUrl, u.url);
  assert.deepEqual(b.beeldCredit, { bron: "Illustratie", maker: "Communities Abroad", naam: "Huis met rood dak", keuze: "getekend", png: null });
  assert.equal(opslag.tekeningen.length, 1);
  assert.deepEqual({ ...opslag.tekeningen[0], gemaaktOp: "x", id: "x" }, { berichtId: ID1, url: u.url, naam: "Huis met rood dak", gemaaktOp: "x", id: "x" });
  // De nieuwsbrief verwacht beeldPng: null is toegestaan; de rest van de vorm blijft gelijk.
  const p = publiekBericht(b, false) as unknown as Record<string, unknown>;
  assert.equal(p.beeldPng, null);
  assert.equal((p.beeldCredit as { keuze: string }).keuze, "getekend");
  assert.deepEqual(await opslag.teHerkiezenBeeld("2000-01-01", 10), []);
  assert.equal(pad(b.beeldUrl!).endsWith(".svg"), true);
});

test("tekening gebruiken: een kwaadaardige SVG (ook vanuit een geknoeide browser) wordt afgekeurd en er wordt niets opgeslagen", async () => {
  const opslag = new GeheugenOpslag();
  opslag.berichtenLijst.push(bericht(ID1));
  const s = stor();
  for (const svg of ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><script>x</script></svg>', "<svg onload='x'>", "", 5, null]) {
    const u = await gebruikTekening(opslag, ID1, svg, "Naam", s.instellingen);
    assert.deepEqual(u, { ok: false, melding: TEKEN_MELDING });
  }
  assert.equal(s.aanroepen.length, 0);
  assert.equal((await opslag.redactieBericht(ID1))?.beeldUrl, null);
  assert.equal(opslag.tekeningen.length, 0);
  assert.equal((await gebruikTekening(opslag, ID2, VOORBEELDEN[0], "x", s.instellingen)).ok, false);
  assert.equal((await gebruikTekening(opslag, ID1, VOORBEELDEN[0], "x", null)).ok, false);
});

test("tekening gebruiken: een mislukte upload laat het bericht ongemoeid; een mislukte lijst laat het beeld wel staan", async () => {
  const opslag = new GeheugenOpslag();
  opslag.berichtenLijst.push(bericht(ID1));
  const stuk = { url: "https://p.supabase.co", sleutel: "geheim", fetchFn: (async () => new Response("kapot", { status: 500 })) as unknown as typeof fetch };
  const u = await gebruikTekening(opslag, ID1, VOORBEELDEN[1], "Laadpaal", stuk);
  assert.equal(u.ok, false);
  assert.ok(!JSON.stringify(u).includes("geheim"));
  assert.equal((await opslag.redactieBericht(ID1))?.beeldUrl, null);
  opslag.tekeningNoteer = async () => { throw new TabelOntbreekt("nv_tekeningen"); };
  const s = stor();
  const g = await gebruikTekening(opslag, ID1, VOORBEELDEN[1], "Laadpaal", s.instellingen);
  assert.deepEqual(g.ok && g.lijstBewaard, false);
  assert.ok((await opslag.redactieBericht(ID1))?.beeldUrl);
});

test("tekenen: het model krijgt kop en samenvatting van het bericht; niets wordt opgeslagen; afkeuring geeft de nette melding", async () => {
  const opslag = new GeheugenOpslag();
  opslag.berichtenLijst.push(bericht(ID1));
  const goed = klein([`NAAM: Huis met rood dak\n${VOORBEELDEN[0]}`]);
  const u = await tekenVoorBericht(opslag, goed, ID1);
  assert.deepEqual(u, { ok: true, svg: VOORBEELDEN[0], naam: "Huis met rood dak" });
  assert.ok(goed.aanroepen[0].user.includes("Nieuwe regels voor huurders"));
  assert.equal((await opslag.redactieBericht(ID1))?.beeldUrl, null);
  const slecht = await tekenVoorBericht(opslag, klein(["<svg><script>x</script></svg>"]), ID1);
  assert.deepEqual(slecht, { ok: false, melding: "Het tekenen is niet gelukt. Tik nog eens op Nieuw beeld laten tekenen." });
  assert.equal((await tekenVoorBericht(opslag, goed, ID2)).ok, false);
});

// ---- Routes tegen een nagebootste Supabase --------------------------------------------------------------------
async function metSupabase<T>(fake: (u: string, init?: RequestInit) => Response | Promise<Response>, f: () => Promise<T>): Promise<T> {
  const echt = globalThis.fetch;
  const was = [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY];
  process.env.SUPABASE_URL = "https://p.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "dienstsleutel";
  globalThis.fetch = (async (u: string, init?: RequestInit) => fake(String(u), init)) as typeof fetch;
  wisOpslagCache();
  wisRedactieRem();
  try {
    return await f();
  } finally {
    globalThis.fetch = echt;
    wisOpslagCache();
    [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY] = was;
    if (was[0] === undefined) delete process.env.SUPABASE_URL;
    if (was[1] === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}
const post = (pad: string, o: { body?: BodyInit; json?: unknown; cookie?: string; ip?: string; origin?: string } = {}) =>
  new Request(`https://nieuws.test${pad}`, {
    method: "POST", body: o.json !== undefined ? JSON.stringify(o.json) : o.body,
    headers: { ...(o.json !== undefined ? { "content-type": "application/json" } : {}), ...(o.cookie ? { cookie: `${REDACTIE_COOKIE}=${o.cookie}` } : {}), ...(o.origin ? { origin: o.origin } : {}), host: "nieuws.test", "x-forwarded-for": o.ip || "1.2.3.4" },
  });
const form = (d: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(d)) f.set(k, v); return f; };

test("route aanmelden: juiste sleutel zet het cookie (zonder geheim erin), foute sleutel en de rem sturen terug naar het formulier", async () => {
  zetGeheim(GEHEIM);
  const goed = await aanmelden(post("/redactie/aanmelden", { body: form({ sleutel: GEHEIM }) }));
  assert.equal(goed.status, 303);
  assert.equal(goed.headers.get("location"), "/redactie");
  const c = goed.headers.get("set-cookie") || "";
  assert.match(c, /^nv_redactie=b\.\d+\.[0-9a-f]{64}; Path=\/redactie; HttpOnly; Secure; SameSite=Strict; Max-Age=604800$/);
  assert.ok(!c.includes(GEHEIM));
  for (let i = 0; i < 5; i++) assert.equal((await aanmelden(post("/redactie/aanmelden", { body: form({ sleutel: "fout" }), ip: "9.9.9.9" }))).headers.get("location"), "/redactie/inloggen?fout=onjuist");
  const geremd = await aanmelden(post("/redactie/aanmelden", { body: form({ sleutel: GEHEIM }), ip: "9.9.9.9" }));
  assert.equal(geremd.headers.get("location"), "/redactie/inloggen?fout=te-vaak");
  assert.equal(geremd.headers.get("set-cookie"), null);
  // Een andere afzender is niet geremd.
  assert.equal((await aanmelden(post("/redactie/aanmelden", { body: form({ sleutel: GEHEIM }), ip: "8.8.8.8" }))).headers.get("location"), "/redactie");
  // Een vreemde herkomst wordt geweigerd; zonder geheim is het dicht.
  assert.equal((await aanmelden(post("/redactie/aanmelden", { body: form({ sleutel: GEHEIM }), origin: "https://evil.test" }))).status, 403);
  zetGeheim(undefined);
  assert.equal((await aanmelden(post("/redactie/aanmelden", { body: form({ sleutel: "x" }) }))).headers.get("location"), "/redactie/inloggen?fout=dicht");
  const uit = await uitloggen(post("/redactie/uitloggen"));
  assert.match(uit.headers.get("set-cookie") || "", /^nv_redactie=; .*Max-Age=0$/);
});

/** Nep-Supabase voor nv_redacteuren (en een paar andere tabellen). */
function nepRedacteuren() {
  const rijen: Record<string, unknown>[] = [];
  const log: { methode: string; url: string; body?: string }[] = [];
  const f = (u: string, init?: RequestInit) => {
    const d = decodeURIComponent(u);
    const methode = init?.method || "GET";
    log.push({ methode, url: d, body: init?.body as string | undefined });
    if (d.includes("nv_redacteuren")) {
      if (methode === "POST") {
        const b = JSON.parse(String(init!.body));
        const r = { id: ID1, laatst_gezien: null, ingetrokken_op: null, ...b };
        rijen.push(r);
        return new Response(JSON.stringify([r]), { status: 201 });
      }
      if (methode === "PATCH") return new Response("");
      const m = d.match(/hash=eq\.([0-9a-f]+)/);
      return new Response(JSON.stringify(m ? rijen.filter((r) => r.hash === m[1]) : rijen));
    }
    return new Response("[]");
  };
  return { f, rijen, log };
}

test("routes: een persoonlijke link maken, activeren en gebruiken; alleen de hash gaat naar de database; intrekken sluit hem", async () => {
  zetGeheim(GEHEIM);
  const nep = nepRedacteuren();
  await metSupabase(nep.f, async () => {
    const beheer = maakBeheerderCookie()!;
    // Zonder cookie of als redacteur kan het niet.
    assert.equal((await maakMens(post("/redactie/mensen/maak", { json: { naam: "Marijke" } }))).status, 401);
    const gemaakt = await maakMens(post("/redactie/mensen/maak", { json: { naam: "Marijke" }, cookie: beheer }));
    assert.equal(gemaakt.status, 200);
    const j = (await gemaakt.json()) as { ok: boolean; token: string; naam: string };
    assert.ok(j.ok && isTokenVorm(j.token));
    const postBody = JSON.parse(nep.log.find((l) => l.methode === "POST")!.body!);
    assert.equal(postBody.hash, hashToken(j.token));
    assert.ok(!JSON.stringify(nep.log).includes(j.token), "het token zelf is nooit naar de database gegaan");
    assert.match(postBody.hash, /^[0-9a-f]{64}$/);
    assert.equal(postBody.rol, "redacteur");
    // Activeren.
    const act = await activeer(post("/redactie/welkom/activeer", { json: { token: j.token } }));
    assert.equal(act.status, 200);
    const cookie = act.headers.get("set-cookie") || "";
    assert.match(cookie, new RegExp(`^nv_redactie=r\\.${j.token}; Path=/redactie; HttpOnly; Secure; SameSite=Strict; Max-Age=7776000$`));
    // Met dit cookie komt een redacteur binnen, maar niet bij /mensen/maak.
    const metCookie = `r.${j.token}`;
    assert.equal((await maakMens(post("/redactie/mensen/maak", { json: { naam: "Piet" }, cookie: metCookie }))).status, 403);
    const act2 = await actie(post("/redactie/actie", { body: form({ actie: "onzin", terug: "/redactie" }), cookie: metCookie }));
    assert.equal(act2.status, 303);
    assert.match(act2.headers.get("location") || "", /^\/redactie\?m=Onbekende\+handeling\.&ok=0$/);
    // Intrekken sluit de link.
    nep.rijen[0].ingetrokken_op = new Date().toISOString();
    assert.equal((await activeer(post("/redactie/welkom/activeer", { json: { token: j.token } }))).status, 401);
    assert.equal((await actie(post("/redactie/actie", { body: form({ actie: "weg", id: ID2 }), cookie: metCookie }))).headers.get("location"), "/redactie/inloggen");
  });
});

test("routes: activeren met een verkeerd token geeft 401 en telt mee voor de rem; zonder tabel blijft alles dicht", async () => {
  zetGeheim(undefined);
  const nep = nepRedacteuren();
  await metSupabase(nep.f, async () => {
    for (let i = 0; i < 5; i++) assert.equal((await activeer(post("/redactie/welkom/activeer", { json: { token: maakToken() }, ip: "7.7.7.7" }))).status, 401);
    assert.equal((await activeer(post("/redactie/welkom/activeer", { json: { token: maakToken() }, ip: "7.7.7.7" }))).status, 429);
    assert.equal((await activeer(post("/redactie/welkom/activeer", { json: { token: 5 }, ip: "6.6.6.6" }))).status, 401);
  });
  await metSupabase(() => new Response(JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.nv_redacteuren' in the schema cache" }), { status: 404 }), async () => {
    assert.equal((await activeer(post("/redactie/welkom/activeer", { json: { token: maakToken() } }))).status, 401);
    assert.equal((await maakMens(post("/redactie/mensen/maak", { json: { naam: "Piet" } }))).status, 401);
  });
});

test("routes: tekenen en gebruiken vragen een geldig cookie; zonder cookie 401; een kwaadaardige SVG levert 422 zonder opslag", async () => {
  zetGeheim(GEHEIM);
  const log: string[] = [];
  await metSupabase((u, init) => { log.push(`${init?.method || "GET"} ${u}`); return new Response("[]"); }, async () => {
    const c = maakBeheerderCookie()!;
    assert.equal((await tekenRoute(post("/redactie/actie/teken", { json: { id: ID1 } }))).status, 401);
    assert.equal((await gebruikRoute(post("/redactie/actie/gebruik", { json: { id: ID1, svg: "x" } }))).status, 401);
    const r = await gebruikRoute(post("/redactie/actie/gebruik", { json: { id: ID1, svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><script>x</script></svg>', naam: "x" }, cookie: c }));
    // Het bericht bestaat in de nep-opslag niet; de SVG wordt eerst gecontroleerd, dus 422 met de nette melding.
    assert.equal(r.status, 422);
    assert.deepEqual(await r.json(), { ok: false, melding: TEKEN_MELDING });
    assert.ok(!log.some((l) => l.includes("storage")), "niets naar Storage");
  });
});
