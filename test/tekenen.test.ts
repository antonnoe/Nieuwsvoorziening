// Een beeld laten tekenen (redactie-app): de controle van het modelantwoord is streng en getest met kwaadaardige en goede voorbeelden.
import test from "node:test";
import assert from "node:assert/strict";
import { MAX_SVG_BYTES, SYSTEEM_TEKENEN, TEKEN_MELDING, TEKEN_PALET, VOORBEELDEN, controleerSvg, leesTekenAntwoord, maakTekening, schoneNaam, svgDataAdres } from "../lib/redactie-tekenen";
import { BUCKET_INSTELLINGEN, bewaarSvg, publiekeUrl } from "../lib/tekeningen";
import { klein } from "./helpers";

const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675">';
const basis = (binnen: string) => `${OPEN}<rect width="1200" height="675" fill="#faf7f4"/><g stroke="#1f1a18" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">${binnen}</g></svg>`;
const GOED = basis('<rect x="100" y="400" width="300" height="200" fill="#efe8e1"/><circle cx="600" cy="300" r="80" fill="#800000"/><path d="M0 600 L1200 600" fill="none"/>');

test("goede tekeningen komen door: de voorbeelden uit de opdracht, plat palet, none en transparent", () => {
  for (const v of VOORBEELDEN) assert.deepEqual(controleerSvg(v), { ok: true, svg: v });
  assert.equal(controleerSvg(GOED).ok, true);
  assert.equal(controleerSvg(`\n  ${GOED}  \n`).ok, true, "witruimte eromheen wordt getrimd");
  assert.equal(controleerSvg(basis('<rect x="1" y="1" width="9" height="9" fill="transparent" stroke="none"/>')).ok, true);
  assert.equal(controleerSvg(basis('<polygon points="10,10 50,10 30,50" fill="#E3C26B"/>')).ok, true, "hoofdletters in hex zijn gelijk");
  assert.equal(controleerSvg(basis('<g transform="translate(10 20) scale(2)"><ellipse cx="5" cy="5" rx="3" ry="2" fill="#2f6b3a"/></g>')).ok, true);
  assert.ok(SYSTEEM_TEKENEN.includes("1200") && SYSTEEM_TEKENEN.includes("675") && SYSTEEM_TEKENEN.includes("Voorbeeld 1"));
  for (const hex of Object.values(TEKEN_PALET)) assert.ok(SYSTEEM_TEKENEN.includes(hex), hex);
});

const KWAAD: [string, string, RegExp][] = [
  ["script", basis("<script>alert(1)</script>"), /script/],
  ["script met spaties en hoofdletters", basis("< SCRIPT >x</ SCRIPT >"), /script|element/i],
  ["onload", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" onload="alert(1)"><rect width="9" height="9" fill="#800000"/><rect width="9" height="9" fill="#800000"/><rect width="9" height="9" fill="#800000"/></svg>`, /on\.\.\./],
  ["onclick op een vorm", basis('<rect x="1" y="1" width="9" height="9" fill="#800000" onclick="x()"/>'), /on\.\.\./],
  ["onmouseover met enkele quotes", basis("<rect width='9' height='9' fill='#800000' onmouseover='x()'/>"), /on\.\.\./],
  ["foreignObject", basis('<foreignObject width="10" height="10"><div>x</div></foreignObject>'), /foreignObject/],
  ["externe href", basis('<image href="https://evil.test/x.png" width="10" height="10"/>'), /href/],
  ["xlink:href", basis('<use xlink:href="#a"/>'), /href/],
  ["a href javascript", basis('<a href="javascript:alert(1)"><rect width="9" height="9" fill="#800000"/></a>'), /href/],
  ["url() in fill", basis('<rect width="9" height="9" fill="url(#a)"/>'), /url/],
  ["url() met extern adres", basis('<rect width="9" height="9" fill="url(https://evil.test/a)"/>'), /url/],
  ["text", basis('<text x="10" y="10">Hallo</text>'), /tekst/],
  ["tspan", basis("<tspan>x</tspan>"), /tekst/],
  ["style-element", basis("<style>rect{fill:red}</style>"), /stijl/],
  ["style-attribuut", basis('<rect width="9" height="9" fill="#800000" style="fill:red"/>'), /attribuut niet toegestaan: style/],
  ["image zonder href", basis('<image width="9" height="9"/>'), /element niet toegestaan: image/],
  ["use", basis('<use width="9"/>'), /element niet toegestaan: use/],
  ["kleur buiten palet (hex)", basis('<rect width="9" height="9" fill="#ff0000"/>'), /kleur buiten het palet/],
  ["kleur buiten palet (3 cijfers)", basis('<rect width="9" height="9" fill="#f00"/>'), /kleur buiten het palet/],
  ["kleur buiten palet (rgb)", basis('<rect width="9" height="9" fill="rgb(255,0,0)"/>'), /kleur buiten het palet/],
  ["kleur buiten palet (naam)", basis('<rect width="9" height="9" fill="red"/>'), /kleur buiten het palet/],
  ["zwart als naam", basis('<rect width="9" height="9" stroke="black" fill="#800000"/>'), /kleur buiten het palet/],
  ["kleur van de oude illustraties (#a8743f)", basis('<rect width="9" height="9" fill="#a8743f"/>'), /kleur buiten het palet/],
  ["achtergrondrechthoek met andere kleur", `${OPEN}<rect width="1200" height="675" fill="#ffffff"/><circle r="1" fill="#800000"/><circle r="1" fill="#800000"/><circle r="1" fill="#800000"/></svg>`, /kleur buiten het palet/],
  ["begint niet met <svg (tekst ervoor)", `Hier is je tekening: ${GOED}`, /begint niet/],
  ["begint met xml-declaratie", `<?xml version="1.0"?>${GOED}`, /begint niet/],
  ["doctype", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><!DOCTYPE x><rect fill="#800000"/></svg>`, /commentaar|doctype/],
  ["commentaar", basis("<!-- hallo --><rect width='9' height='9' fill='#800000'/>"), /commentaar|doctype/],
  ["eindigt niet met </svg>", GOED + " en tot slot dit", /eindigt/],
  ["tekst na de svg", GOED.replace("</svg>", "</svg> hallo") , /eindigt/],
  ["losse tekst tussen de elementen", basis("hallo<rect width='9' height='9' fill='#800000'/>"), /losse tekst/],
  ["ontbrekende viewBox", '<svg xmlns="http://www.w3.org/2000/svg"><rect width="9" height="9" fill="#800000"/><rect width="9" height="9" fill="#800000"/><rect width="9" height="9" fill="#800000"/></svg>', /viewBox/],
  ["verkeerde viewBox", GOED.replace('viewBox="0 0 1200 675"', 'viewBox="0 0 1600 900"'), /viewBox/],
  ["externe xmlns", GOED.replace("http://www.w3.org/2000/svg", "http://evil.test/svg"), /extern adres|xmlns/],
  ["extern adres in een waarde", basis('<rect width="9" height="9" fill="#800000" stroke-dasharray="http://x.test"/>'), /extern adres/],
  ["entiteit", basis('<rect width="9" height="9" fill="#800000" x="&#106;"/>'), /entiteit/],
  ["javascript: in transform", basis('<rect width="9" height="9" fill="#800000" transform="javascript:x"/>'), /script-adres/],
  ["geneste svg", basis('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><rect width="9" height="9" fill="#800000"/></svg>'), /meer dan één svg/],
  ["tags niet in evenwicht", basis('<g><rect width="9" height="9" fill="#800000"/>'), /evenwicht/],
  ["sluittag zonder open", basis('<rect width="9" height="9" fill="#800000"/></circle>'), /evenwicht/],
  ["tag niet afgesloten", `${OPEN}<rect width="9" height="9" fill="#800000"`, /eindigt|niet afgesloten/],
  ["onbekend attribuut", basis('<rect width="9" height="9" fill="#800000" class="x"/>'), /attribuut niet toegestaan: class/],
  ["padgegevens met rommel", basis('<path d="M0 0 L10 10 <script>" fill="#800000"/>'), /script|padgegevens|tag/],
  ["te weinig vormen", `${OPEN}<rect width="1200" height="675" fill="#faf7f4"/></svg>`, /te weinig/],
  ["dubbel attribuut", basis('<rect width="9" width="9" height="9" fill="#800000"/>'), /dubbel/],
];
for (const [naam, svg, reden] of KWAAD) {
  test(`kwaadaardig of fout wordt afgekeurd: ${naam}`, () => {
    const c = controleerSvg(svg);
    assert.equal(c.ok, false, "had afgekeurd moeten worden");
    if (!c.ok) assert.match(c.reden, reden);
  });
}

test("te groot (boven 60 kB) wordt afgekeurd; precies eronder mag", () => {
  const vorm = '<rect x="1" y="1" width="9" height="9" fill="#800000"/>';
  const veel = (n: number) => basis(vorm.repeat(n));
  const grens = Math.floor((MAX_SVG_BYTES - 400) / vorm.length);
  assert.equal(controleerSvg(veel(grens)).ok, true, `${veel(grens).length} bytes`);
  const groot = controleerSvg(veel(Math.ceil(MAX_SVG_BYTES / vorm.length) + 10));
  assert.deepEqual(groot.ok === false && groot.reden, "groter dan 60 kB");
  assert.equal(MAX_SVG_BYTES, 60_000);
  const meerBytes = basis('<rect x="1" y="1" width="9" height="9" fill="#800000"/>').replace("</svg>", "") + "é".repeat(31_000) + "</svg>";
  assert.equal(controleerSvg(meerBytes).ok, false, "bytes tellen, niet tekens");
});

test("de controle blijft snel bij vijandige invoer (geen vastlopen)", () => {
  const start = Date.now();
  for (const x of [
    `${OPEN}<rect ${'a="b" '.repeat(8000)}/></svg>`,
    `${OPEN}${"<g ".repeat(5000)}`,
    `${OPEN}<rect ${" ".repeat(50_000)}"`,
    `${OPEN}${"<g>".repeat(8000)}</svg>`,
    `${OPEN}<rect x="${"1 ".repeat(25_000)}" fill="#800000"/></svg>`,
  ]) controleerSvg(x);
  assert.ok(Date.now() - start < 3000, `duurde ${Date.now() - start} ms`);
});

test("modelantwoord lezen: naam en svg, ook met codehekken", () => {
  assert.deepEqual(leesTekenAntwoord(`NAAM: Huis met rood dak\n${GOED}`), { naam: "Huis met rood dak", svg: GOED });
  assert.deepEqual(leesTekenAntwoord("```svg\nNaam: \"Laadpaal\"\n" + GOED + "\n```"), { naam: "Laadpaal", svg: GOED });
  assert.equal(leesTekenAntwoord(GOED).naam, "Getekend beeld");
  assert.equal(schoneNaam("  <b>Vlag</b>  "), "bVlag/b");
  assert.equal(schoneNaam(""), "Getekend beeld");
  assert.ok(svgDataAdres(GOED).startsWith("data:image/svg+xml;charset=utf-8,%3Csvg"));
});

const invoer = { kop: "Nieuwe regels voor huurders van tweede woningen", samenvatting: "Huiseigenaren krijgen vanaf januari andere verplichtingen." };

test("maakTekening: goed antwoord komt door met naam; het synthesemodel krijgt kop en samenvatting en de strenge opdracht", async () => {
  const c = klein([`NAAM: Huis met rood dak\n${GOED}`]);
  const u = await maakTekening(c, invoer);
  assert.deepEqual(u, { ok: true, svg: GOED, naam: "Huis met rood dak" });
  assert.equal(c.aanroepen.length, 1);
  assert.equal(c.aanroepen[0].model, "claude-sonnet-5-5");
  assert.ok(c.aanroepen[0].user.includes(invoer.kop) && c.aanroepen[0].user.includes(invoer.samenvatting));
  assert.equal(c.aanroepen[0].system, SYSTEEM_TEKENEN);
});

test("maakTekening: afgekeurd, modelfout en geen model geven de nette melding en niets anders", async () => {
  for (const c of [klein([`NAAM: Fout\n${basis("<script>x</script>")}`]), klein(["Sorry, dat kan ik niet tekenen."]), klein([() => { throw new Error("tijdslimiet"); }]), null]) {
    const u = await maakTekening(c, invoer);
    assert.equal(u.ok, false);
    if (!u.ok) assert.equal(u.melding, TEKEN_MELDING);
  }
  assert.equal(TEKEN_MELDING, "Tekening mislukt, probeer opnieuw");
});

// ---- Storage ---------------------------------------------------------------------------------------------
test("tekening bewaren: SVG naar de bucket, publieke url terug, sleutel alleen in de headers", async () => {
  const log: { url: string; methode: string; headers: Record<string, string>; body: string }[] = [];
  const f = (async (u: string, init?: RequestInit) => {
    log.push({ url: String(u), methode: String(init?.method), headers: init?.headers as Record<string, string>, body: String(init?.body) });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const url = await bewaarSvg(GOED, { url: "https://p.supabase.co/", sleutel: "geheime-sleutel", fetchFn: f }, "2026-11-28-abc.svg");
  assert.equal(url, "https://p.supabase.co/storage/v1/object/public/nv-tekeningen/2026-11-28-abc.svg");
  assert.equal(url, publiekeUrl("https://p.supabase.co", "2026-11-28-abc.svg"));
  assert.equal(log.length, 1);
  assert.equal(log[0].url, "https://p.supabase.co/storage/v1/object/nv-tekeningen/2026-11-28-abc.svg");
  assert.equal(log[0].headers["content-type"], "image/svg+xml");
  assert.equal(log[0].body, GOED);
  assert.ok(!log[0].url.includes("geheime-sleutel") && !url.includes("geheime-sleutel"));
});

test("tekening bewaren: ontbreekt de bucket, dan wordt hij aangemaakt (publiek, alleen svg, 60 kB) en gaat de upload opnieuw", async () => {
  const log: string[] = [];
  let bucketBestaat = false;
  let gemaakt: unknown = null;
  const f = (async (u: string, init?: RequestInit) => {
    log.push(`${init?.method} ${String(u).replace("https://p.supabase.co", "")}`);
    if (String(u).endsWith("/storage/v1/bucket")) { bucketBestaat = true; gemaakt = JSON.parse(String(init?.body)); return new Response("{}", { status: 200 }); }
    return bucketBestaat ? new Response("{}", { status: 200 }) : new Response(JSON.stringify({ statusCode: "404", error: "Bucket not found", message: "Bucket not found" }), { status: 404 });
  }) as unknown as typeof fetch;
  const url = await bewaarSvg(GOED, { url: "https://p.supabase.co", sleutel: "s", fetchFn: f }, "a.svg");
  assert.deepEqual(log, ["POST /storage/v1/object/nv-tekeningen/a.svg", "POST /storage/v1/bucket", "POST /storage/v1/object/nv-tekeningen/a.svg"]);
  assert.deepEqual(gemaakt, BUCKET_INSTELLINGEN);
  assert.equal(BUCKET_INSTELLINGEN.public, true);
  assert.ok(url.endsWith("/a.svg"));
});

test("tekening bewaren: een andere fout geeft een nette Error zonder de sleutel", async () => {
  const f = (async () => new Response("kapot", { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(() => bewaarSvg(GOED, { url: "https://p.supabase.co", sleutel: "geheime-sleutel", fetchFn: f }, "a.svg"), (e: Error) => /HTTP 500/.test(e.message) && !/geheime-sleutel/.test(e.message));
  const geenBucketAanmaken = (async (u: string) => (String(u).endsWith("/bucket") ? new Response("nee", { status: 403 }) : new Response("Bucket not found", { status: 404 }))) as unknown as typeof fetch;
  await assert.rejects(() => bewaarSvg(GOED, { url: "https://p.supabase.co", sleutel: "s", fetchFn: geenBucketAanmaken }, "a.svg"), /aangemaakt/);
});
