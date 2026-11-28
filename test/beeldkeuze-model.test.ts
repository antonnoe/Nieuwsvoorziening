import test from "node:test";
import assert from "node:assert/strict";
import { ILLUSTRATIES, modelKandidaten, kiesIllustratie, kiesIllustratieMetModel, illustratieResultaatMetModel } from "../lib/motor/illustraties";
import { beeldResultaat, actieveGenerator } from "../lib/motor/beeld";
import { draaiOogst } from "../lib/motor/motor";
import { GeheugenOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import { laadConfig } from "../lib/motor/config";
import type { ModelClient } from "../lib/motor/ai";
import type { BeeldCredit } from "../lib/motor/types";

const VN = {
  kop: "VN-organisaties waarschuwen voor toenemende honger in 16 regio's door oorlog en El Niño",
  samenvatting: "Twee voedselorganisaties van de Verenigde Naties verwachten dat de honger de komende zes maanden verergert, vooral in Afrika, door conflicten, minder hulp en een felle El Niño.",
  categorie: "algemeen" as const,
};
const HULP = "natuur-voedselhulp-zakken-fr";
const KOM = "natuur-lege-kom-droog-land-fr";
const nepClient = (antwoord: string | (() => string)): ModelClient & { n: number; laatste: string } => ({
  n: 0, laatste: "",
  async tekst(a) { this.n += 1; this.laatste = a.user; return typeof antwoord === "function" ? antwoord() : antwoord; },
});

test("VN-honger: de kandidatenlijst (max 12) bevat voedselhulp of lege kom", () => {
  const k = modelKandidaten(VN, []);
  console.log("kandidaten VN-bericht:", k.map((i) => i.id).join(", "));
  assert.ok(k.length > 0 && k.length <= 12);
  assert.ok(k.some((i) => i.id === HULP || i.id === KOM));
});

test("nep-model kiest een geldig id: dat beeld, keuze model, max 1 aanroep, lijst met id/naam/beschrijving/binding", async () => {
  const c = nepClient(`{"id":"${HULP}"}`);
  const r = await kiesIllustratieMetModel(VN, c, []);
  assert.equal(r?.illustratie.id, HULP);
  assert.equal(r?.keuze, "model");
  assert.equal(c.n, 1);
  assert.match(c.laatste, /id: natuur-voedselhulp-zakken-fr \| naam: Voedselhulp \| beschrijving: .+ \| binding: fr/);
  const res = await illustratieResultaatMetModel(VN, nepClient(`{"id":"${KOM}"}`), []);
  assert.equal(res?.credit.keuze, "model");
  assert.match(res!.url, new RegExp(`${KOM}\\.svg$`));
});

test("onzin-id, modelfout of geen client: trefwoordterugval", async () => {
  const verwacht = kiesIllustratie(VN, [])!.id;
  for (const c of [nepClient('{"id":"bestaat-niet"}'), nepClient("geen json"), nepClient(() => { throw new Error("stuk"); }), null]) {
    const r = await kiesIllustratieMetModel(VN, c, []);
    assert.equal(r?.keuze, "trefwoord");
    assert.equal(r?.illustratie.id, verwacht);
  }
});

test("standaardstand: geen Unsplash-aanroep (nep-fetch faalt bij aanroep)", async () => {
  const oud = { b: process.env.BEELD_BRON, g: process.env.BEELD_GENERATOR, k: process.env.UNSPLASH_ACCESS_KEY, f: globalThis.fetch };
  delete process.env.BEELD_BRON; process.env.UNSPLASH_ACCESS_KEY = "sleutel";
  let aangeroepen = 0;
  globalThis.fetch = (async () => { aangeroepen += 1; throw new Error("netwerk mag niet"); }) as typeof fetch;
  try {
    for (const g of [undefined, "uit", "unsplash"]) {
      if (g === undefined) delete process.env.BEELD_GENERATOR; else process.env.BEELD_GENERATOR = g;
      assert.equal(actieveGenerator(), null, `generator ${g}`);
    }
    const r = await beeldResultaat({ ...VN, client: nepClient(`{"id":"${HULP}"}`) }, actieveGenerator());
    assert.equal(r?.credit?.bron, "Illustratie");
    process.env.BEELD_BRON = "unsplash";
    assert.ok(actieveGenerator(), "met BEELD_BRON=unsplash wel actief");
    assert.equal(aangeroepen, 0);
  } finally {
    globalThis.fetch = oud.f;
    for (const [k, v] of [["BEELD_BRON", oud.b], ["BEELD_GENERATOR", oud.g], ["UNSPLASH_ACCESS_KEY", oud.k]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

const bericht = (id: string, credit: BeeldCredit | null, extra: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht => ({
  id, soort: "pers", kop: VN.kop, samenvatting: VN.samenvatting, tekst: "t", categorie: "algemeen", score: 80, regime: "pers", status: "gepubliceerd",
  blokkadeRedenen: [], portemonnee: false, signaal: null, signaalBeoordeeld: true, beeldUrl: credit ? "https://x.test/oud.svg" : null, beeldCredit: credit, peil: [], bronnen: [],
  gepubliceerdOp: new Date().toISOString(), regelversie: 2, ...extra,
} as OpgeslagenBericht);

test("stap 6b: vervangt Unsplash en illustratie zonder keuze model; laat keuze model en redactie weg met rust; max 25", async () => {
  const opslag = new GeheugenOpslag();
  opslag.berichtenLijst.push(
    bericht("u", { bron: "Unsplash", maker: "M" }),
    bericht("t", { bron: "Illustratie", maker: "Communities Abroad", naam: "oud" }),
    bericht("tw", { bron: "Illustratie", maker: "Communities Abroad", naam: "oud", keuze: "trefwoord" }),
    bericht("m", { bron: "Illustratie", maker: "Communities Abroad", naam: "oud", keuze: "model" }),
    bericht("w", { bron: "Unsplash", maker: "M" }, { redactie: "weg" }),
    bericht("oud", { bron: "Unsplash", maker: "M" }, { gepubliceerdOp: new Date(Date.now() - 40 * 864e5).toISOString() }),
  );
  // Het nep-model kiest steeds de eerste kandidaat uit zijn lijst; wat al bij een nieuw bericht staat valt door de harde uitsluiting af.
  const client: ModelClient = { async tekst(a) { return `{"id":"${(a.user.match(/id: (\S+) \|/) || [])[1]}"}`; } };
  const geenWeb = (async () => { throw new Error("geen web"); }) as unknown as typeof fetch;
  const r = await draaiOogst({ opslag, client, config: laadConfig(), bronnen: [], fetchFn: geenWeb, peil: [], generator: null });
  const per = (id: string) => opslag.berichtenLijst.find((b) => b.id === id)!;
  for (const id of ["u", "t", "tw"]) {
    assert.equal(per(id).beeldCredit?.keuze, "model", id);
    assert.match(String(per(id).beeldUrl), /\/illustraties\/.+\.svg$/);
  }
  assert.equal(new Set(["u", "t", "tw"].map((id) => per(id).beeldUrl)).size, 3, "geen dubbelen onder de herkozen berichten");
  assert.equal(per("m").beeldUrl, "https://x.test/oud.svg");
  assert.equal(per("w").beeldCredit?.bron, "Unsplash");
  assert.equal(per("oud").beeldCredit?.bron, "Unsplash");
  assert.equal(r.aantallen.beeldHerkozen, 3);
  // Max 25 per run.
  for (let i = 0; i < 30; i++) opslag.berichtenLijst.push(bericht(`x${i}`, { bron: "Unsplash", maker: "M" }));
  const r2 = await draaiOogst({ opslag, client, config: laadConfig(), bronnen: [], fetchFn: geenWeb, peil: [], generator: null });
  assert.equal(r2.aantallen.beeldHerkozen, 25);
});

test("illustratieset bevat de vaste beelden", () => {
  assert.ok(ILLUSTRATIES.beelden.some((i) => i.id === HULP));
});
