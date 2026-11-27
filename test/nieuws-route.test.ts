import test from "node:test";
import assert from "node:assert/strict";
import { GeheugenOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import { publiekBericht } from "../lib/motor/api";
import { GET } from "../app/api/nieuws/route";

const basis: OpgeslagenBericht = {
  id: "11111111-1111-1111-1111-111111111111", kop: "Kop", samenvatting: "S", tekst: "T", categorie: "economie en ondernemen", score: 88, regime: "pers", status: "gepubliceerd",
  blokkadeRedenen: ["intern"], beeldUrl: null, gepubliceerdOp: "2026-11-23T08:00:00.000Z", portemonnee: true,
  peil: { raakt: [{ id: "p1", naam: "Drempel", zekerheid: "groen" }], mogelijkGewijzigd: [{ id: "p1", naam: "Drempel", toelichting: "geheime toelichting" }] },
  bronnen: [{ naam: "Bron", origineleKop: "Titre", datum: "2026-11-23T07:00:00.000Z", url: "https://a.test/1" }],
};

test("publieke vorm: portemonnee erbij, bestaande velden onveranderd, niets intern", () => {
  const p = publiekBericht(basis, false) as Record<string, unknown>;
  assert.equal(p.portemonnee, true);
  assert.deepEqual(Object.keys(p), ["id", "kop", "samenvatting", "categorie", "portemonnee", "gepubliceerdOp", "beeldUrl", "beeldCredit", "bronnen", "peil", "soort", "domein", "kanalen", "signaal"]);
  const j = JSON.stringify(p);
  assert.ok(!j.includes("geheime") && !j.includes("score") && !j.includes("blokkade") && !j.includes("github"));
  assert.equal(publiekBericht({ ...basis, portemonnee: undefined as unknown as boolean }, false).portemonnee, false);
});

test("geheugenopslag: ?peil=1-filter levert portemonnee-berichten en PEIL-berichten", async () => {
  const g = new GeheugenOpslag();
  const leeg = { raakt: [], mogelijkGewijzigd: [] };
  const { id: _i, ...rest } = basis;
  await g.slaBerichtOp({ ...rest, sleutel: "a", portemonnee: false, peil: leeg });
  await g.slaBerichtOp({ ...rest, sleutel: "b", portemonnee: true, peil: leeg });
  await g.slaBerichtOp({ ...rest, sleutel: "c", portemonnee: false });
  assert.equal((await g.berichten({ limiet: 10 })).length, 3);
  assert.equal((await g.berichten({ limiet: 10, peil: true })).length, 2);
});

test("route /api/nieuws: ?peil=1 gaat naar de opslag, CORS voor infopoche.fr", async () => {
  const echt = globalThis.fetch;
  const wasU = process.env.SUPABASE_URL, wasK = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://p.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  const urls: string[] = [];
  globalThis.fetch = (async (u: string) => { urls.push(String(u)); return new Response("[]"); }) as typeof fetch;
  try {
    const r = await GET(new Request("https://x.test/api/nieuws?peil=1", { headers: { origin: "https://infopoche.fr" } }));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("access-control-allow-origin"), "https://infopoche.fr");
    await GET(new Request("https://x.test/api/nieuws"));
    assert.ok(decodeURIComponent(urls[0]).includes("portemonnee.eq.true"));
    assert.ok(!decodeURIComponent(urls[1]).includes("portemonnee.eq.true"));
    const x = await GET(new Request("https://x.test/api/nieuws", { headers: { origin: "https://evil.test" } }));
    assert.equal(x.headers.get("access-control-allow-origin"), null);
  } finally {
    globalThis.fetch = echt;
    if (wasU === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = wasU;
    if (wasK === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = wasK;
  }
});
