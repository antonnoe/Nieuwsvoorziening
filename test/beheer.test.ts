import { test } from "node:test";
import assert from "node:assert/strict";
import { GeheugenOpslag } from "../lib/motor/opslag";
import { bearerGeldig, conceptReden, cookieGeldig, cookieKop, dagVan, maakCookieWaarde, perDag, sleutelKlopt } from "../lib/beheer";
import { POST as inloggen } from "../app/beheer/inloggen/route";

const metGeheim = async (g: string | undefined, f: () => unknown | Promise<unknown>) => {
  const oud = process.env.CRON_SECRET;
  if (g === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = g;
  try { return await f(); } finally { if (oud === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = oud; }
};

test("zonder CRON_SECRET is alles dicht", async () => {
  await metGeheim(undefined, () => {
    assert.equal(sleutelKlopt(""), false);
    assert.equal(maakCookieWaarde(), null);
    assert.equal(cookieGeldig("1.abc"), false);
    assert.equal(bearerGeldig("Bearer "), false);
    assert.equal(bearerGeldig(""), false);
  });
});

test("cookie: geldig, verlopen, vervalst; bevat het geheim niet", async () => {
  await metGeheim("geheim-waarde", () => {
    const nu = Date.now();
    const w = maakCookieWaarde(nu)!;
    assert.ok(!w.includes("geheim-waarde"));
    assert.equal(cookieGeldig(w, nu), true);
    assert.equal(cookieGeldig(w, nu + 13 * 3600_000), false);
    assert.equal(cookieGeldig(w.replace(/.$/, "0"), nu), false);
    assert.equal(cookieGeldig("", nu), false);
    assert.equal(bearerGeldig("Bearer geheim-waarde"), true);
    assert.equal(bearerGeldig("Bearer anders"), false);
  });
});

test("cookiekop: httpOnly, Secure, SameSite=Strict", () => {
  const k = cookieKop("x");
  for (const d of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/beheer"]) assert.ok(k.includes(d), d);
  assert.ok(cookieKop("", true).includes("Max-Age=0"));
});

test("inloggen: goede sleutel zet cookie, foute niet, zonder geheim 503; sleutel in de URL telt niet", async () => {
  const post = (url: string, sleutel: string) => {
    const fd = new FormData(); fd.set("sleutel", sleutel);
    return inloggen(new Request(url, { method: "POST", body: fd, headers: { "x-forwarded-for": `t${Math.random()}` } }));
  };
  await metGeheim("s3cret", async () => {
    const goed = await post("https://x.test/beheer/inloggen", "s3cret");
    assert.equal(goed.status, 303);
    assert.match(goed.headers.get("set-cookie") || "", /HttpOnly; Secure; SameSite=Strict/);
    const fout = await post("https://x.test/beheer/inloggen?sleutel=s3cret", "nee");
    assert.equal(fout.headers.get("set-cookie"), null);
    assert.match(fout.headers.get("location") || "", /fout=onjuist/);
  });
  await metGeheim(undefined, async () => assert.equal((await post("https://x.test/beheer/inloggen", "x")).status, 503));
});

test("per dag in Europe/Amsterdam, drie lijsten en runs", async () => {
  assert.equal(dagVan("2026-11-23T23:30:00Z"), "2026-11-24"); // 00:30 in Amsterdam
  const o = new GeheugenOpslag();
  const b = (status: "gepubliceerd" | "concept" | "geblokkeerd", op: string, score = 50) => ({ kop: status, samenvatting: "", tekst: "", categorie: "algemeen" as const, score, regime: "pers" as const, status, blokkadeRedenen: status === "geblokkeerd" ? ["geen links"] : [], beeldUrl: null, peil: { raakt: [], mogelijkGewijzigd: [] }, bronnen: [], gepubliceerdOp: op, sleutel: op + status });
  await o.slaBerichtOp(b("gepubliceerd", "2026-11-24T10:00:00Z"));
  await o.slaBerichtOp(b("concept", "2026-11-24T11:00:00Z"));
  await o.slaBerichtOp(b("geblokkeerd", "2026-11-23T10:00:00Z"));
  await o.slaRunOp({ gestartOp: "2026-11-24T07:00:00Z", droog: false, stappen: [], aantallen: { gepubliceerd: 1 }, fouten: [] });
  const lijst = await o.berichtenVoorBeheer("2026-11-20T00:00:00Z", 100);
  assert.equal(lijst.length, 3);
  const [d24, d23] = perDag(lijst, await o.recenteRuns(10), ["2026-11-24", "2026-11-23"]);
  assert.deepEqual([d24.geplaatst.length, d24.concept.length, d24.geblokkeerd.length, d24.runs.length], [1, 1, 0, 1]);
  assert.deepEqual([d23.geplaatst.length, d23.concept.length, d23.geblokkeerd.length], [0, 0, 1]);
});

test("conceptreden", () => {
  assert.match(conceptReden({ score: 40, blokkadeRedenen: [] }, 55, 60), /onder drempel 55/);
  assert.match(conceptReden({ score: 70, blokkadeRedenen: [] }, 55, 60), /relevantie onder 60/);
  assert.equal(conceptReden({ score: 70, blokkadeRedenen: ["x"] }, 55, 60), "x");
});
