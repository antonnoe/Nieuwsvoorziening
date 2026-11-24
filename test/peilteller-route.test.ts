import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/peil/teller/route";

const req = () => new Request("https://x.test/api/peil/teller", { headers: { origin: "https://www.nederlanders.fr" } });
const echt = globalThis.fetch;

test("route: stand, cachekoppen en CORS; daarna verouderd bij storing; 503 zonder stand is niet te testen na eerste succes", async () => {
  const jaar = new Date().getUTCFullYear();
  globalThis.fetch = (async () => new Response(JSON.stringify({ stand: "2026-11-15", parameters: [{ id: "x", naam: "x", verificatiedatum: `${jaar}-01-02` }] }), { status: 200 })) as typeof fetch;
  try {
    const r = await GET(req());
    assert.equal(r.status, 200);
    assert.match(r.headers.get("cache-control")!, /s-maxage=3600/);
    assert.match(r.headers.get("cache-control")!, /stale-while-revalidate/);
    assert.equal(r.headers.get("access-control-allow-origin"), "https://www.nederlanders.fr");
    const d = await r.json();
    assert.equal(d.verouderd, false);
    assert.equal(d.jaar.bijgewerkt, 1);
    globalThis.fetch = (async () => new Response("x", { status: 500 })) as typeof fetch;
    const r2 = await GET(req());
    assert.equal(r2.status, 200);
    assert.equal((await r2.json()).verouderd, true);
  } finally {
    globalThis.fetch = echt;
  }
});
