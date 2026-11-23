import test from "node:test";
import assert from "node:assert/strict";
import { maakUnsplashGenerator } from "../lib/motor/beeld-unsplash";
import { beeldResultaat } from "../lib/motor/beeld";

const foto = { id: "a1", urls: { regular: "https://images.unsplash.com/photo-1?w=1080" }, links: { download_location: "https://api.unsplash.com/photos/a1/download" }, user: { name: "Marie Dupont", links: { html: "https://unsplash.com/@marie" } } };

test("Unsplash: zoekt, meldt het gebruik en geeft foto met bronvermelding", async () => {
  const aanroepen: string[] = [];
  const f = (async (u: string) => {
    aanroepen.push(String(u));
    if (String(u).includes("/search/photos")) return new Response(JSON.stringify({ results: [foto] }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const g = maakUnsplashGenerator(f, () => "test");
  const r = await beeldResultaat({ kop: "Overstroming", samenvatting: "s", categorie: "natuur en rampen", zoekterm: "flooded village france" }, g);
  assert.equal(r?.url, foto.urls.regular);
  assert.equal(r?.credit?.maker, "Marie Dupont");
  assert.match(String(r?.credit?.makerUrl), /utm_source=nieuwsvoorziening/);
  assert.ok(aanroepen.some((u) => u.includes("query=flooded+village+france")));
  assert.ok(aanroepen.some((u) => u.endsWith("/photos/a1/download")), "download-eindpunt moet worden aangeroepen");
});

test("Unsplash: valt terug op de categorie en faalt netjes", async () => {
  let n = 0;
  const f = (async (u: string) => {
    if (String(u).includes("/search/photos")) return new Response(JSON.stringify({ results: n++ === 0 ? [] : [foto] }), { status: 200 });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const r = await beeldResultaat({ kop: "k", samenvatting: "s", categorie: "politiek", zoekterm: "nothing" }, maakUnsplashGenerator(f, () => "test"));
  assert.ok(r?.url);
  const kapot = (async () => new Response("", { status: 403 })) as unknown as typeof fetch;
  assert.equal(await beeldResultaat({ kop: "k", samenvatting: "s", categorie: "politiek" }, maakUnsplashGenerator(kapot, () => "test")), null);
  assert.equal(await beeldResultaat({ kop: "k", samenvatting: "s", categorie: "politiek" }, maakUnsplashGenerator(kapot, () => "")), null);
});
