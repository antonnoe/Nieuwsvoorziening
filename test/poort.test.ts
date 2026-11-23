import test from "node:test";
import assert from "node:assert/strict";
import { kwaliteitsPoort, bedragenIn, normaliseerGetal } from "../lib/motor/poort";
import type { Cluster, Synthese } from "../lib/motor/types";
import { item } from "./helpers";

const cfg = { minTekstTekens: 280, minKopTekens: 15, minSamenvattingTekens: 40 };
const cluster: Cluster = {
  sleutel: "k",
  items: [
    item({ titel: "Carburant: le gazole à 1,85 euro le litre", samenvatting: "Hausse de 5 centimes.", bronNaam: "Le Figaro — Actualités", bronId: "f" }),
    item({ url: "https://voorbeeld.test/b", bronId: "m", titel: "Prix du gazole en hausse", samenvatting: "Le litre atteint 1,85 euro." }),
  ],
};
const goedeTekst =
  "De prijs van diesel aan de Franse pomp stijgt deze week opnieuw. Een liter gazole kost gemiddeld 1,85 euro, vijf cent meer dan een week eerder. Voor wie met de auto door Frankrijk reist of er woont, werkt dat direct door in de maandelijkse kosten. Automobilisten kunnen de prijzen per station vergelijken voordat ze tanken, want de verschillen tussen snelwegstations en supermarkten blijven groot.";
const goed: Synthese = { kop: "Diesel in Frankrijk opnieuw duurder", samenvatting: "De dieselprijs loopt deze week verder op tot gemiddeld 1,85 euro per liter.", tekst: goedeTekst, categorie: "reizen en verkeer", relevantie: 70 };

test("goede synthese komt door de poort", () => {
  const u = kwaliteitsPoort(goed, cluster, cfg);
  assert.equal(u.ok, true, u.redenen.join(";"));
});

test("blokkeert meta-taal over de invoer", () => {
  for (const z of ["ik kreeg", "de tekst die ik", "beschikbare tekst", "is afgekapt", "het bericht noemt", "ik heb alleen", "geen details over"]) {
    const u = kwaliteitsPoort({ ...goed, tekst: `${goedeTekst} Verder ${z} iets.` }, cluster, cfg);
    assert.equal(u.ok, false, z);
    assert.ok(u.redenen.some((r) => r.includes("invoer")), z);
  }
});

test("blokkeert krantennamen buiten het bronnenblok, ook uit het cluster", () => {
  const a = kwaliteitsPoort({ ...goed, tekst: `${goedeTekst} Dat meldt Le Figaro.` }, cluster, cfg);
  assert.ok(a.redenen.some((r) => r.includes("krantennaam")));
  const b = kwaliteitsPoort({ ...goed, kop: "Volgens NOS wordt diesel duurder" }, cluster, cfg);
  assert.ok(b.redenen.some((r) => r.includes("krantennaam")));
  // Een woord dat toevallig een naam bevat is geen treffer.
  const c = kwaliteitsPoort({ ...goed, tekst: `${goedeTekst} De nostalgie van goedkope diesel.` }, cluster, cfg);
  assert.ok(!c.redenen.some((r) => r.includes("krantennaam")), c.redenen.join(";"));
});

test("blokkeert links en domeinnamen", () => {
  assert.ok(kwaliteitsPoort({ ...goed, tekst: `${goedeTekst} Zie https://example.com/x` }, cluster, cfg).redenen.some((r) => r.includes("link")));
  assert.ok(kwaliteitsPoort({ ...goed, tekst: `${goedeTekst} Lees meer op lemonde.fr` }, cluster, cfg).redenen.some((r) => r.includes("link")));
});

test("blokkeert lege of te korte teksten", () => {
  assert.equal(kwaliteitsPoort({ ...goed, tekst: "" }, cluster, cfg).ok, false);
  assert.ok(kwaliteitsPoort({ ...goed, tekst: "Te kort." }, cluster, cfg).redenen.includes("tekst te kort of leeg"));
  assert.ok(kwaliteitsPoort({ ...goed, kop: "Kort" }, cluster, cfg).redenen.includes("kop te kort of leeg"));
  assert.ok(kwaliteitsPoort({ ...goed, samenvatting: "" }, cluster, cfg).redenen.includes("samenvatting te kort of leeg"));
});

test("blokkeert verzonnen bedragen, laat bedragen uit de bron toe", () => {
  const fout = kwaliteitsPoort({ ...goed, tekst: `${goedeTekst} De overheid trekt 250 miljoen euro uit.` }, cluster, cfg);
  assert.ok(fout.redenen.some((r) => r.startsWith("bedrag niet in bron")), fout.redenen.join(";"));
  assert.ok(!kwaliteitsPoort(goed, cluster, cfg).redenen.some((r) => r.startsWith("bedrag")));
  const pct = kwaliteitsPoort({ ...goed, tekst: `${goedeTekst} Dat is 7 procent meer.` }, cluster, cfg);
  assert.ok(pct.redenen.some((r) => r.startsWith("bedrag niet in bron")));
});

test("bedragen worden genormaliseerd tussen Nederlandse en Franse notatie", () => {
  assert.equal(normaliseerGetal("1.234,56"), "1234.56");
  assert.equal(normaliseerGetal("1 234,5"), "1234.5");
  assert.equal(normaliseerGetal("1,50"), "1.5");
  assert.deepEqual(bedragenIn("Het kost 1.200 euro en 3,5 procent, ofwel € 40."), ["1200", "3.5", "40"]);
  const c: Cluster = { sleutel: "x", items: [item({ titel: "Aide de 1 200 euros", samenvatting: "" })] };
  assert.equal(kwaliteitsPoort({ ...goed, tekst: goedeTekst.replace("1,85 euro", "1.200 euro") }, c, cfg).redenen.some((r) => r.startsWith("bedrag")), true); // 1,85 elders in samenvatting niet in bron
});

test("blokkeert ook media die zelf onderwerp zijn (besluit 23-11-2026)", () => {
  const u = kwaliteitsPoort({ ...goed, tekst: `${goedeTekst} Ook France Télévisions en La Tribune moeten voorkomen.` }, cluster, cfg);
  assert.ok(u.redenen.some((r) => r.includes("france televisions")), u.redenen.join(";"));
  assert.ok(u.redenen.some((r) => r.includes("la tribune")), u.redenen.join(";"));
});

test("blokkeert letterlijk overgenomen tekst uit een artikel", () => {
  const zin = "de prefectuur heeft alle wegen in het noorden van het departement afgesloten tot zaterdag";
  const c2 = { ...cluster, items: cluster.items.map((i: any, k: number) => (k === 0 ? { ...i, artikelTekst: `Eerder vandaag meldde men dat ${zin}.` } : i)) };
  const u = kwaliteitsPoort({ ...goed, tekst: `${goedeTekst} Ook ${zin}.` }, c2 as any, cfg);
  assert.ok(u.redenen.some((r) => r.includes("letterlijk")), u.redenen.join(";"));
});
