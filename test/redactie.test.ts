import test from "node:test";
import assert from "node:assert/strict";
import { draaiOogst } from "../lib/motor/motor";
import { laadConfig } from "../lib/motor/config";
import { klein } from "./helpers";
import { GeheugenOpslag, SupabaseOpslag, MigratieOntbreekt, type OpgeslagenBericht } from "../lib/motor/opslag";
import { wisOpslagCache } from "../lib/motor/api";
import { leesOpdracht, wisRem } from "../lib/redactie";
import { leesKanalen, STANDAARD_KANALEN } from "../lib/motor/types";
import { GET as nieuwsGET } from "../app/api/nieuws/route";
import { GET as nieuwsIdGET } from "../app/api/nieuws/[id]/route";
import { GET as rssGET } from "../app/api/rss/route";
import { GET as redGET, POST as redPOST, OPTIONS as redOPTIONS } from "../app/api/redactie/route";
import sitemap from "../app/sitemap";

const ID1 = "11111111-1111-1111-1111-111111111111";
const ID2 = "22222222-2222-2222-2222-222222222222";
const bericht = (id: string, o: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht => ({
  id, kop: `Kop ${id.slice(0, 2)}`, samenvatting: "S", tekst: "T", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd", blokkadeRedenen: [],
  beeldUrl: null, gepubliceerdOp: new Date().toISOString(), portemonnee: false, peil: { raakt: [], mogelijkGewijzigd: [] },
  bronnen: [{ naam: "Bron", origineleKop: "Titre", datum: "2026-11-26T07:00:00.000Z", url: "https://www.service-public.fr/a" }], ...o,
});

/** Zet env en fetch voor een Supabase-opslag die alleen in het geheugen praat; herstelt daarna. */
async function metSupabase<T>(fake: (u: string, init?: RequestInit) => Response | Promise<Response>, f: () => Promise<T>): Promise<T> {
  const echt = globalThis.fetch;
  const was = [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET];
  process.env.SUPABASE_URL = "https://p.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "dienstsleutel"; process.env.CRON_SECRET = "geheim-test";
  globalThis.fetch = (async (u: string, init?: RequestInit) => fake(String(u), init)) as typeof fetch;
  wisRem();
  wisOpslagCache();
  try {
    return await f();
  } finally {
    globalThis.fetch = echt;
    wisOpslagCache();
    [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET] = was;
    if (was[0] === undefined) delete process.env.SUPABASE_URL;
    if (was[1] === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (was[2] === undefined) delete process.env.CRON_SECRET;
  }
}

// ---- Geheugenopslag: weg, kanalen, soort ---------------------------------------------
test("kanalen: ontbrekend of kapot geeft alles aan; alleen booleans tellen", () => {
  assert.deepEqual(leesKanalen(undefined), STANDAARD_KANALEN);
  assert.deepEqual(leesKanalen({ zijbalk: false, nieuwsbrief: "nee", onzin: false }), { ...STANDAARD_KANALEN, zijbalk: false });
});

test("geheugenopslag: kanaalfilter en weg; weg verschijnt nergens (lijst, bericht, tellingen, totalen)", async () => {
  const g = new GeheugenOpslag();
  g.berichtenLijst.push(bericht(ID1), bericht(ID2, { kanalen: { ...STANDAARD_KANALEN, zijbalk: false } }));
  assert.equal((await g.berichten({ limiet: 10 })).length, 2);
  assert.deepEqual((await g.berichten({ limiet: 10, kanaal: "zijbalk" })).map((b) => b.id), [ID1]);
  await g.zetKanaal(ID1, "zijbalk", false);
  assert.equal((await g.berichten({ limiet: 10, kanaal: "zijbalk" })).length, 0);
  await g.zetRedactie(ID2, "weg");
  assert.deepEqual((await g.berichten({ limiet: 10 })).map((b) => b.id), [ID1]);
  assert.equal(await g.bericht(ID2), null);
  assert.equal((await g.tellingenSinds("2000-01-01")).algemeen, 1);
  assert.equal((await g.aantallen()).gepubliceerdTotaal, 1);
  assert.equal((await g.redactieBericht(ID2))?.redactie, "weg");
  await g.zetRedactie(ID2, null);
  assert.equal((await g.berichten({ limiet: 10 })).length, 2);
});

test("leesOpdracht: valideert id, actie, kanaal en aan", () => {
  assert.deepEqual(leesOpdracht({ id: ID1, actie: "weg" }), { opdracht: { id: ID1, actie: "weg" } });
  assert.deepEqual(leesOpdracht({ id: ID1, actie: "kanaal", kanaal: "zijbalk", aan: false }), { opdracht: { id: ID1, actie: "kanaal", kanaal: "zijbalk", aan: false } });
  for (const slecht of [null, "x", { actie: "weg" }, { id: "a b", actie: "weg" }, { id: ID1, actie: "wis" }, { id: ID1, actie: "kanaal", kanaal: "tv", aan: true }, { id: ID1, actie: "kanaal", kanaal: "zijbalk" }, { id: ID1, actie: "kanaal", kanaal: "zijbalk", aan: "ja" }])
    assert.ok("fout" in leesOpdracht(slecht), JSON.stringify(slecht));
});

// ---- Routes tegen een nagebootste Supabase --------------------------------------------
/** Een kleine nagebootste PostgREST voor één tabel, met of zonder de nieuwe kolommen. */
function nepSupabase(metKolommen: boolean) {
  const rij: Record<string, unknown> = {
    id: ID1, kop: "Kop", samenvatting: "S", tekst: "T", categorie: "algemeen", score: 80, regime: "overheid", status: "gepubliceerd", blokkade_redenen: [],
    gepubliceerd_op: "2026-11-26T08:00:00.000Z", portemonnee: false, peil_raakt: [], peil_mogelijk_gewijzigd: [], regelversie: 2,
    nv_bronnen_per_bericht: [{ bron_naam: "Service-Public", originele_kop: "T", datum: "2026-11-26", url: "https://www.service-public.fr/x", volgorde: 0 }],
    ...(metKolommen ? { soort: "overheid", kanalen: { ...STANDAARD_KANALEN }, redactie: null, redactie_op: null } : {}),
  };
  const log: { methode: string; url: string; body?: string }[] = [];
  const f = (u: string, init?: RequestInit) => {
    const d = decodeURIComponent(u);
    log.push({ methode: init?.method || "GET", url: d, body: init?.body as string | undefined });
    const nieuwGebruikt = /redactie|kanalen|soort|handmatig_op/.test(d.replace(/select=[^&]*/, (s) => (/redactie|kanalen|soort/.test(s) ? s : ""))) || (init?.body && /"(soort|redactie|kanalen|handmatig_op)"/.test(String(init.body)));
    if (!metKolommen && nieuwGebruikt) {
      const schrijven = init?.method === "POST" || init?.method === "PATCH";
      return new Response(JSON.stringify(schrijven ? { code: "PGRST204", message: "Could not find the 'soort' column of 'nv_berichten' in the schema cache" } : { code: "42703", message: "column nv_berichten.redactie does not exist" }), { status: 400 });
    }
    if (init?.method === "PATCH") {
      const b = JSON.parse(String(init.body));
      Object.assign(rij, b);
      return new Response("");
    }
    if (init?.method === "POST") return new Response(JSON.stringify([{ id: ID1 }]));
    if (d.includes("nv_oogst_runs")) return new Response(JSON.stringify([{ gestart_op: "2026-11-26T11:00:00.000Z", klaar_op: "2026-11-26T11:02:00.000Z", droog: false, stappen: [], aantallen: { gepubliceerd: 3 }, fouten: [] }]));
    if (d.includes("select=kanalen")) return new Response(JSON.stringify([{ kanalen: rij.kanalen }]));
    return new Response(JSON.stringify([rij]));
  };
  return { f, log, rij };
}
const bearer = { authorization: "Bearer geheim-test" };

test("API /api/nieuws: soort, domein en kanalen erbij; ?kanaal= en weg gaan als filter naar de database", async () => {
  const nep = nepSupabase(true);
  await metSupabase(nep.f, async () => {
    const r = await nieuwsGET(new Request("https://x.test/api/nieuws?kanaal=nieuwsbrief"));
    const j = (await r.json()) as { berichten: Record<string, unknown>[] };
    assert.equal(r.status, 200);
    assert.equal(j.berichten[0].soort, "overheid");
    assert.equal(j.berichten[0].domein, "service-public.fr");
    assert.deepEqual(j.berichten[0].kanalen, STANDAARD_KANALEN);
    assert.ok(nep.log[0].url.includes("redactie=is.null"));
    assert.ok(nep.log[0].url.includes("kanalen->>nieuwsbrief=eq.true"));
    assert.equal((await nieuwsGET(new Request("https://x.test/api/nieuws?kanaal=tv"))).status, 400);
    const n = await nieuwsIdGET(new Request("https://x.test/api/nieuws/" + ID1), { params: Promise.resolve({ id: ID1 }) });
    assert.equal(((await n.json()) as { soort: string }).soort, "overheid");
    assert.ok(nep.log.at(-1)!.url.includes("redactie=is.null"));
  });
});

test("zonder migratie: lijst, bericht, RSS en sitemap blijven werken met standaardwaarden", async () => {
  const nep = nepSupabase(false);
  await metSupabase(nep.f, async () => {
    const r = await nieuwsGET(new Request("https://x.test/api/nieuws?kanaal=zijbalk"));
    const j = (await r.json()) as { aantal: number; berichten: Record<string, unknown>[] };
    assert.equal(r.status, 200);
    assert.equal(j.aantal, 1);
    assert.deepEqual(j.berichten[0].kanalen, STANDAARD_KANALEN);
    // Zonder kolom: regime overheid telt als soort overheid (afgeleid).
    assert.equal(j.berichten[0].soort, "overheid");
    const n = await nieuwsIdGET(new Request("https://x.test/api/nieuws/" + ID1), { params: Promise.resolve({ id: ID1 }) });
    assert.equal(n.status, 200);
    assert.equal((await rssGET(new Request("https://x.test/api/rss"))).status, 200);
    assert.equal((await sitemap()).length > 0, true);
  });
});

test("zonder migratie: het opslaan van een bericht valt terug op de oude vorm (zonder soort)", async () => {
  const nep = nepSupabase(false);
  await metSupabase(nep.f, async () => {
    const o = new SupabaseOpslag("https://p.supabase.co", "k");
    const id = await o.slaBerichtOp({ kop: "Kop", samenvatting: "S", tekst: "T", categorie: "algemeen", score: 80, regime: "overheid", soort: "overheid", status: "gepubliceerd", blokkadeRedenen: [], beeldUrl: null, peil: { raakt: [], mogelijkGewijzigd: [] }, bronnen: [], gepubliceerdOp: "2026-11-26T08:00:00.000Z", sleutel: "s" });
    assert.equal(id, ID1);
    const posts = nep.log.filter((l) => l.methode === "POST");
    assert.equal(posts.length, 2);
    assert.ok(posts[0].body!.includes('"soort":"overheid"'));
    assert.ok(!posts[1].body!.includes('"soort"'));
    // Daarna (binnen vijf minuten) wordt de nieuwe vorm niet opnieuw geprobeerd.
    await o.slaBerichtOp({ kop: "Kop", samenvatting: "S", tekst: "T", categorie: "algemeen", score: 80, regime: "pers", status: "concept", blokkadeRedenen: [], beeldUrl: null, peil: { raakt: [], mogelijkGewijzigd: [] }, bronnen: [], gepubliceerdOp: "2026-11-26T08:00:00.000Z", sleutel: "t" });
    assert.equal(nep.log.filter((l) => l.methode === "POST").length, 3);
  });
});

test("POST /api/redactie: zonder sleutel dicht, met sleutel weg, terug en kanaal; bijgewerkt bericht komt terug", async () => {
  const nep = nepSupabase(true);
  await metSupabase(nep.f, async () => {
    const post = (body: unknown, headers: Record<string, string> = bearer) => redPOST(new Request("https://x.test/api/redactie", { method: "POST", headers: { "content-type": "application/json", origin: "https://nlfr-menu.vercel.app", ...headers }, body: JSON.stringify(body) }));
    const zonder = await post({ id: ID1, actie: "weg" }, {});
    assert.equal(zonder.status, 401);
    const w = await post({ id: ID1, actie: "weg" });
    const wj = (await w.json()) as { bericht: { redactie: string; redactieOp: string; soort: string } };
    assert.equal(w.status, 200);
    assert.equal(wj.bericht.redactie, "weg");
    assert.ok(wj.bericht.redactieOp);
    assert.equal(w.headers.get("access-control-allow-origin"), "https://nlfr-menu.vercel.app");
    const k = await post({ id: ID1, actie: "kanaal", kanaal: "zijbalk", aan: false });
    assert.equal(((await k.json()) as { bericht: { kanalen: Record<string, boolean> } }).bericht.kanalen.zijbalk, false);
    const t = await post({ id: ID1, actie: "terug" });
    assert.equal(((await t.json()) as { bericht: { redactie: string | null } }).bericht.redactie, null);
    assert.equal((await post({ id: ID1, actie: "wis" })).status, 400);
    assert.equal((await post({ id: ID2, actie: "weg" })).status, 200);
  });
});

test("redactie zonder CRON_SECRET is altijd dicht; fout geheim wordt geremd na 5 pogingen; sleutel staat nooit in het antwoord", async () => {
  await metSupabase(nepSupabase(true).f, async () => {
    const vraag = (h: Record<string, string>) => redGET(new Request("https://x.test/api/redactie?dagen=2", { headers: { "x-forwarded-for": "1.2.3.4", ...h } }));
    for (let i = 0; i < 5; i += 1) assert.equal((await vraag({ authorization: "Bearer fout" })).status, 401);
    const geremd = await vraag({ authorization: "Bearer fout" });
    assert.equal(geremd.status, 429);
    // Ook het goede geheim komt er dan niet doorheen tot de rem verloopt.
    assert.equal((await vraag(bearer)).status, 429);
    assert.ok(!(await geremd.text()).includes("geheim-test"));
    delete process.env.CRON_SECRET;
    wisRem();
    assert.equal((await vraag({ authorization: "Bearer geheim-test" })).status, 503);
  });
});

test("GET /api/redactie?dagen=2: alle statussen, ook weg, met score, status, soort en kanalen; CORS alleen nlfr-menu", async () => {
  const nep = nepSupabase(true);
  nep.rij.redactie = "weg"; nep.rij.status = "concept";
  await metSupabase(nep.f, async () => {
    const r = await redGET(new Request("https://x.test/api/redactie?dagen=2", { headers: { ...bearer, origin: "https://nlfr-menu.vercel.app" } }));
    const j = (await r.json()) as { dagen: number; berichten: Record<string, unknown>[] };
    assert.equal(r.status, 200);
    assert.equal(j.dagen, 2);
    assert.deepEqual([j.berichten[0].status, j.berichten[0].redactie, j.berichten[0].soort, j.berichten[0].score], ["concept", "weg", "overheid", 80]);
    assert.ok(j.berichten[0].kanalen && "tekst" in j.berichten[0] === false);
    assert.ok(!decodeURIComponent(nep.log[0].url).includes("status=eq"), "geen statusfilter");
    assert.equal(r.headers.get("cache-control"), "no-store");
    const vreemd = await redGET(new Request("https://x.test/api/redactie", { headers: { ...bearer, origin: "https://evil.test" } }));
    assert.equal(vreemd.headers.get("access-control-allow-origin"), null);
    const pre = redOPTIONS(new Request("https://x.test/api/redactie", { method: "OPTIONS", headers: { origin: "https://nlfr-menu.vercel.app" } }));
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get("access-control-allow-headers") || "", /authorization/);
  });
});

test("zonder migratie: GET /api/redactie werkt met standaardwaarden; POST geeft 503 met uitleg in plaats van een fout", async () => {
  const nep = nepSupabase(false);
  await metSupabase(nep.f, async () => {
    const g = await redGET(new Request("https://x.test/api/redactie", { headers: bearer }));
    assert.equal(g.status, 200);
    assert.deepEqual(((await g.json()) as { berichten: { kanalen: unknown }[] }).berichten[0].kanalen, STANDAARD_KANALEN);
    const p = await redPOST(new Request("https://x.test/api/redactie", { method: "POST", headers: { ...bearer, "content-type": "application/json" }, body: JSON.stringify({ id: ID1, actie: "weg" }) }));
    assert.equal(p.status, 503);
    assert.match(((await p.json()) as { fout: string }).fout, /migratie/);
    await assert.rejects(new SupabaseOpslag("https://p.supabase.co", "k", (async () => nep.f("x?redactie", { method: "PATCH", body: "{}" })) as unknown as typeof fetch).zetRedactie(ID1, "weg"), MigratieOntbreekt);
  });
});

// ---- Aanvulling regisseur: plaats, herschrijf, bewerk, niet-geplaatst, laatste run ------------
const post = (body: unknown) => redPOST(new Request("https://x.test/api/redactie", { method: "POST", headers: { ...bearer, "content-type": "application/json" }, body: JSON.stringify(body) }));

test("plaats: concept zonder poortblokkade wordt gepubliceerd; poortblokkade geeft een foutmelding in gewone taal", async () => {
  const nep = nepSupabase(true);
  nep.rij.status = "concept"; nep.rij.score = 48;
  await metSupabase(nep.f, async () => {
    const r = await post({ id: ID1, actie: "plaats" });
    assert.equal(r.status, 200);
    assert.equal(((await r.json()) as { bericht: { status: string; geplaatst: boolean } }).bericht.geplaatst, true);
    assert.equal(nep.rij.status, "gepubliceerd");
    assert.equal((await post({ id: ID1, actie: "plaats" })).status, 409, "al geplaatst");
    // geblokkeerd door de poort
    nep.rij.status = "geblokkeerd"; nep.rij.blokkade_redenen = ["krantennaam buiten bronnenblok: \"le monde\""];
    const g = await post({ id: ID1, actie: "plaats" });
    assert.equal(g.status, 409);
    assert.match(((await g.json()) as { fout: string }).fout, /kwaliteitspoort/);
    assert.equal(nep.rij.status, "geblokkeerd");
    // concept met een poortreden telt ook als blokkade; een reden van de herschrijfcontrole niet
    nep.rij.status = "concept";
    assert.equal((await post({ id: ID1, actie: "plaats" })).status, 409);
    nep.rij.blokkade_redenen = ["herschrijven: relevantie 22 onder 60"];
    assert.equal((await post({ id: ID1, actie: "plaats" })).status, 200);
  });
});

test("herschrijf: markeert alleen (regelversie 0), schrijft niet zelf; bewerk zet handmatig_op; herschrijf op handmatig bericht wordt geweigerd", async () => {
  const nep = nepSupabase(true);
  await metSupabase(nep.f, async () => {
    const h = await post({ id: ID1, actie: "herschrijf" });
    assert.equal(h.status, 200);
    assert.equal(nep.rij.regelversie, 0);
    assert.equal(nep.rij.kop, "Kop", "tekst is niet aangeraakt");
    assert.equal(((await h.json()) as { bericht: { herschrijfGemarkeerd: boolean } }).bericht.herschrijfGemarkeerd, true);
    const b = await post({ id: ID1, actie: "bewerk", kop: "Gecorrigeerde kop", categorie: "politiek" });
    const bj = (await b.json()) as { bericht: { kop: string; categorie: string; handmatigOp: string } };
    assert.deepEqual([b.status, bj.bericht.kop, bj.bericht.categorie, typeof bj.bericht.handmatigOp], [200, "Gecorrigeerde kop", "politiek", "string"]);
    assert.ok(nep.rij.handmatig_op);
    assert.equal((await post({ id: ID1, actie: "herschrijf" })).status, 409);
    assert.equal((await post({ id: ID1, actie: "bewerk" })).status, 400);
    assert.equal((await post({ id: ID1, actie: "bewerk", categorie: "onzin" })).status, 400);
    assert.equal((await post({ id: ID1, actie: "bewerk", kop: "ab" })).status, 400);
  });
});

test("zonder migratie: bewerk geeft 503 met uitleg", async () => {
  const nep = nepSupabase(false);
  await metSupabase(nep.f, async () => {
    const r = await post({ id: ID1, actie: "bewerk", kop: "Nieuwe kop hier" });
    assert.equal(r.status, 503);
  });
});

test("GET /api/redactie: niet-geplaatste berichten met reden, en de laatste oogstrun voor de statusregel", async () => {
  const nep = nepSupabase(true);
  nep.rij.status = "geblokkeerd"; nep.rij.blokkade_redenen = ["tekst te kort of leeg"];
  await metSupabase(nep.f, async () => {
    const j = (await (await redGET(new Request("https://x.test/api/redactie", { headers: bearer }))).json()) as { aantalNietGeplaatst: number; laatsteRun: { gestartOp: string; aantallen: Record<string, number> }; berichten: { reden: string; geplaatst: boolean; kanPlaatsen: boolean }[] };
    assert.equal(j.aantalNietGeplaatst, 1);
    assert.match(j.berichten[0].reden, /Kwaliteitspoort: tekst te kort/);
    assert.deepEqual([j.berichten[0].geplaatst, j.berichten[0].kanPlaatsen], [false, false]);
    assert.equal(j.laatsteRun.gestartOp, "2026-11-26T11:00:00.000Z");
    assert.equal(j.laatsteRun.aantallen.gepubliceerd, 3);
  });
});

// ---- De motor eerbiedigt handmatige correcties -------------------------------------------
const alinea = "De afvalophaal in Marseille ligt sinds maandag stil door een staking van de vuilnismensen en op straat stapelen de zakken zich op in de drukke wijken bij de haven. ";
const nieuwTekst = alinea.repeat(3).trim() + "\n\n" + alinea.trim();
const model = JSON.stringify({ publiceren: true, kop: "Vuilnisstaking legt Marseille lam", samenvatting: "De vuilnisophaal in Marseille ligt stil door een staking en de afvalbergen groeien snel.", tekst: nieuwTekst, categorie: "algemeen", relevantie: 80 });
const oudBericht = (id: string, o: Partial<OpgeslagenBericht> = {}) => bericht(id, {
  kop: "Oude kop " + id, regelversie: 1, tekst: "oude tekst", bronnen: [
    { naam: "Krant A", origineleKop: "Grève des éboueurs à Marseille", datum: new Date().toISOString(), url: `https://a.test/${id}` },
    { naam: "Krant B", origineleKop: "Marseille: les ordures s'entassent", datum: new Date().toISOString(), url: `https://b.test/${id}` },
  ], ...o,
});
const geenWeb = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
const draai = (opslag: GeheugenOpslag) => draaiOogst({ opslag, client: klein([(a) => (a.system.includes("groepeert") ? '{"groepen":[]}' : model)]), config: laadConfig(), bronnen: [], fetchFn: geenWeb, peil: [], generator: null });

test("motor: een bericht met handmatig_op wordt NOOIT herschreven of overschreven, ook niet na actie herschrijf of oude regelversie", async () => {
  const opslag = new GeheugenOpslag();
  opslag.berichtenLijst.push(oudBericht("h1", { handmatigOp: new Date().toISOString(), kop: "Door de beheerder gecorrigeerd" }), oudBericht("h2", { handmatigOp: new Date().toISOString(), regelversie: 0 }), oudBericht("g1"));
  const r = await draai(opslag);
  assert.equal(opslag.berichtenLijst[0].kop, "Door de beheerder gecorrigeerd");
  assert.equal(opslag.berichtenLijst[0].tekst, "oude tekst");
  assert.equal(opslag.berichtenLijst[1].tekst, "oude tekst");
  assert.equal(opslag.berichtenLijst[2].kop, "Vuilnisstaking legt Marseille lam", "gewoon oud bericht wordt wel herschreven");
  assert.equal(r.aantallen.herschreven, 1);
  // ook de opslaglaag zelf beschermt: werkBerichtBij op een handmatig bericht verandert niets
  await opslag.werkBerichtBij("h1", { kop: "x", samenvatting: "x", tekst: "x", categorie: "algemeen", portemonnee: false, status: "gepubliceerd", blokkadeRedenen: [], regelversie: 2 });
  assert.equal(opslag.berichtenLijst[0].kop, "Door de beheerder gecorrigeerd");
});

test("motor: actie herschrijf (regelversie 0) laat de volgende oogst het bericht opnieuw schrijven, ook een concept", async () => {
  const opslag = new GeheugenOpslag();
  opslag.berichtenLijst.push(oudBericht("c1", { status: "concept", regelversie: 2, score: 50 }));
  await opslag.markeerHerschrijven("c1");
  const r = await draai(opslag);
  assert.equal(r.aantallen.herschreven, 1);
  assert.equal(opslag.berichtenLijst[0].kop, "Vuilnisstaking legt Marseille lam");
  assert.equal(opslag.berichtenLijst[0].regelversie, 2);
});

test("Supabase: herschrijven en bijwerken sluiten handmatige berichten in de database uit; zonder migratie valt het terug", async () => {
  const urls: string[] = [];
  const o = new SupabaseOpslag("https://p.supabase.co", "k", (async (u: string) => { urls.push(decodeURIComponent(String(u))); return new Response("[]"); }) as unknown as typeof fetch);
  await o.teHerschrijven("2026-11-24T00:00:00.000Z", 2, 3);
  await o.werkBerichtBij(ID1, { kop: "k", samenvatting: "s", tekst: "t", categorie: "algemeen", portemonnee: false, status: "gepubliceerd", blokkadeRedenen: [], regelversie: 2 });
  assert.ok(urls[0].includes("handmatig_op=is.null") && urls[0].includes("regelversie.eq.0"));
  assert.ok(urls[1].includes("handmatig_op=is.null"));
});

const basisBericht = { kop: "Kop", samenvatting: "S", tekst: "T", categorie: "algemeen", score: 80, regime: "overheid", soort: "overheid", status: "gepubliceerd", blokkadeRedenen: [], beeldUrl: null, peil: { raakt: [], mogelijkGewijzigd: [] }, bronnen: [], gepubliceerdOp: "2026-11-26T08:00:00.000Z", sleutel: "s" } as const;

test("handmatige correctie gaat voor: geheugenopslag overschrijft een bericht met handmatig_op of redactie niet", async () => {
  const o = new GeheugenOpslag();
  const id = await o.slaBerichtOp({ ...basisBericht } as never);
  await o.bewerkBericht(id, { kop: "Handmatige kop" });
  const id2 = await o.slaBerichtOp({ ...basisBericht, kop: "Motor kop" } as never);
  assert.equal(id2, id);
  assert.equal((await o.redactieBericht(id))!.kop, "Handmatige kop");
  const idB = await o.slaBerichtOp({ ...basisBericht, sleutel: "b" } as never);
  await o.zetRedactie(idB, "weg");
  assert.equal(await o.slaBerichtOp({ ...basisBericht, sleutel: "b", kop: "Nieuw" } as never), idB);
  assert.notEqual((await o.redactieBericht(idB))!.kop, "Nieuw");
});

test("handmatige correctie gaat voor: Supabase-opslag schrijft niet als het bericht handmatig_op of redactie heeft", async () => {
  for (const [veld, waarde] of [["handmatig_op", "2026-11-26T09:00:00Z"], ["redactie", "weg"]] as const) {
    const nep = nepSupabase(true);
    nep.rij[veld] = waarde;
    await metSupabase(nep.f, async () => {
      const o = new SupabaseOpslag("https://p.supabase.co", "k");
      assert.equal(await o.slaBerichtOp({ ...basisBericht } as never), ID1);
      assert.equal(nep.log.filter((l) => l.methode === "POST").length, 0);
    });
  }
  const nep = nepSupabase(true);
  await metSupabase(nep.f, async () => {
    const o = new SupabaseOpslag("https://p.supabase.co", "k");
    await o.slaBerichtOp({ ...basisBericht } as never);
    assert.equal(nep.log.filter((l) => l.methode === "POST").length, 1);
  });
});

test("redenTekst: gewone taal per reden, null bij geplaatst", async () => {
  const { redenTekst } = await import("../lib/redactie");
  const c = (status: "concept" | "geblokkeerd", blokkadeRedenen: string[], extra: Partial<OpgeslagenBericht> = {}) => bericht(ID1, { status, blokkadeRedenen, ...extra });
  assert.equal(redenTekst(bericht(ID1)), null);
  assert.equal(redenTekst(c("geblokkeerd", ['krantennaam buiten bronnenblok: "X"'])), "De tekst noemt een krant.");
  assert.equal(redenTekst(c("geblokkeerd", ['letterlijk overgenomen uit een bron: "a b"'])), "De tekst lijkt te veel op het origineel.");
  assert.equal(redenTekst(c("geblokkeerd", ["tekst te kort of leeg"])), "De tekst is te kort.");
  assert.equal(redenTekst(c("geblokkeerd", ['model praat over invoer: "volgens de bronnen"'])), "De tekst praat over zijn eigen bronnen.");
  assert.equal(redenTekst(c("concept", ["herschrijven: relevantie 40 onder 60"])), "Te weinig van belang voor onze lezers.");
  const twee = [{ naam: "A", origineleKop: "k", datum: "2026-11-26", url: "https://a.fr/x" }, { naam: "B", origineleKop: "k", datum: "2026-11-26", url: "https://b.fr/x" }];
  assert.equal(redenTekst(c("concept", [], { regime: "pers", bronnen: twee })), "Te weinig van belang voor onze lezers.");
  assert.equal(redenTekst(c("concept", [], { regime: "pers", bronnen: [{ naam: "A", origineleKop: "k", datum: "2026-11-26", url: "https://a.fr/x" }] })), "Maar één bron gevonden.");
  assert.equal(redenTekst(c("geblokkeerd", ["bedrag niet in bron: 5"])), "Niet geplaatst door de controle.");
});
