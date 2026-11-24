import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/peil/teller/route";

test("route: zonder bekende stand en met falend PEIL een nette 503 in gewone taal", async () => {
  const echt = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("netwerk"); }) as typeof fetch;
  try {
    const r = await GET(new Request("https://x.test/api/peil/teller"));
    assert.equal(r.status, 503);
    const d = await r.json();
    assert.match(d.fout, /niet beschikbaar/);
    assert.ok(!/github/i.test(JSON.stringify(d)));
  } finally {
    globalThis.fetch = echt;
  }
});
