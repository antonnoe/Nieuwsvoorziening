import test from "node:test";
import assert from "node:assert/strict";
import { haalTekstUitHtml, letterlijkeReeksen, verrijkMetArtikelen } from "../lib/motor/artikel";

const html = `<html><head><script>var x=1</script></head><body><nav><p>Menu menu menu menu menu menu menu menu menu menu menu menu menu</p></nav>
<article><h1>Titel</h1><p>Le gouvernement a annoncé mardi une hausse du prix du gazole de cinq centimes par litre à partir du premier janvier prochain.</p>
<p>Acceptez les cookies pour continuer votre lecture sur ce site et profiter de nos offres.</p>
<p>Les automobilistes des zones rurales seront les plus touchés, selon les associations de consommateurs interrogées.</p></article></body></html>`;

test("haalt alleen de echte alinea's uit het artikel", () => {
  const t = haalTekstUitHtml(html);
  assert.match(t, /hausse du prix du gazole/);
  assert.match(t, /zones rurales/);
  assert.doesNotMatch(t, /cookies/);
  assert.doesNotMatch(t, /Menu menu/);
});

test("vindt letterlijk overgenomen reeksen van 10 woorden, ook zonder accenten", () => {
  const bron = "De regering kondigde dinsdag een verhoging van de dieselprijs aan van vijf cent per liter vanaf januari.";
  assert.equal(letterlijkeReeksen("Volgens de bronnen kondigde de regering een verhoging aan.", bron).length, 0);
  assert.ok(letterlijkeReeksen("Nieuw: De regering kondigde dinsdag een verhoging van de dieselprijs aan van vijf cent.", bron).length > 0);
});

test("verrijken faalt netjes bij een fout of betaalmuur", async () => {
  const c = { sleutel: "x", items: [
    { url: "https://a.example/1", titel: "a", samenvatting: "", bronId: "a", bronNaam: "A", regime: "pers", groep: "fr", taal: "fr", land: "FR", gepubliceerdOp: "2026-11-23T10:00:00Z" },
    { url: "https://b.example/2", titel: "b", samenvatting: "", bronId: "b", bronNaam: "B", regime: "pers", groep: "fr", taal: "fr", land: "FR", gepubliceerdOp: "2026-11-23T10:00:00Z" },
  ] } as any;
  const f = (async (u: string) => {
    if (u.includes("a.example")) return new Response(html, { headers: { "content-type": "text/html" } });
    throw new Error("weg");
  }) as unknown as typeof fetch;
  assert.equal(await verrijkMetArtikelen(c, f), 1);
  assert.ok(c.items[0].artikelTekst);
  assert.equal(c.items[1].artikelTekst, undefined);
});
