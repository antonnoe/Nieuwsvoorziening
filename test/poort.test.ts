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

// ---- Bronvermeldingszin (besluit 28-11-2026) ----
import { readFileSync } from "node:fs";
import { namenVoorOpeningszin } from "../lib/motor/poort";
import { namenRegel } from "../lib/motor/synthese";

const echt = JSON.parse(readFileSync(new URL("./fixtures/echte-berichten-2026-11.json", import.meta.url), "utf8")) as Record<string, { kop: string; samenvatting: string; tekst: string }>;
const echtBericht = Object.values(echt)[0];
const bron = (naam: string, id: string) => item({ bronNaam: naam, bronId: id, url: `https://voorbeeld.test/${id}`, regime: "pers" });
const drie: Cluster = { sleutel: "d", items: [bron("Le Monde — International", "a"), bron("Midi Libre", "b"), bron("Le Figaro", "c")] };
const echteTekst = echtBericht.tekst;
const met = (zin: string, tekst = echteTekst) => `${zin} ${tekst}`;
const echteSyn: Synthese = { kop: echtBericht.kop, samenvatting: echtBericht.samenvatting, tekst: echteTekst, categorie: "economie en ondernemen", relevantie: 70 };
const krant = (u: { redenen: string[] }) => u.redenen.filter((r) => r.includes("krantennaam"));

test("echte berichttekst zonder krantennaam komt door (basis voor de volgende tests)", () => {
  const u = kwaliteitsPoort(echteSyn, { ...drie, items: drie.items.map((i) => ({ ...i, artikelTekst: "" })) }, cfg);
  assert.deepEqual(krant(u), [], u.redenen.join(";"));
});

test("bronvermelding: twee of drie namen uit het bronnenblok in één melden-zin is toegestaan", () => {
  for (const zin of ["Le Monde, Midi Libre en Le Figaro melden dat de regering het besluit heeft gepubliceerd.", "Le Monde, Midi Libre en Le Figaro melden alle drie dat de regering het besluit heeft gepubliceerd.", "Midi Libre en Le Figaro melden dat de regering het besluit heeft gepubliceerd."]) {
    const u = kwaliteitsPoort({ ...echteSyn, tekst: met(zin) }, drie, cfg);
    assert.deepEqual(krant(u), [], zin + " " + u.redenen.join(";"));
  }
});

test("bronvermelding: één naam is een blokkade, ook in de vorm 'meldt dat'", () => {
  for (const zin of ["Le Monde meldt dat de regering het besluit heeft gepubliceerd.", "Dat meldt Le Figaro."]) {
    assert.ok(krant(kwaliteitsPoort({ ...echteSyn, tekst: met(zin) }, drie, cfg)).length > 0, zin);
  }
});

test("bronvermelding: twee namen waarvan één niet in het bronnenblok is een blokkade", () => {
  const u = kwaliteitsPoort({ ...echteSyn, tekst: met("Le Monde en Ouest-France melden dat de regering het besluit heeft gepubliceerd.") }, drie, cfg);
  assert.ok(krant(u).some((r) => r.includes("ouest")), u.redenen.join(";"));
  assert.deepEqual(krant(kwaliteitsPoort({ ...echteSyn, tekst: met("Le Monde en Midi Libre melden dat de regering het besluit heeft gepubliceerd.") }, drie, cfg)), [], "dezelfde zin met alleen namen uit het bronnenblok mag wel");
  // Zonder cluster (geen bronnenblok) is nooit een naam toegestaan.
  assert.ok(krant(kwaliteitsPoort({ ...echteSyn, tekst: met("Le Monde en Le Figaro melden dat het waar is.") }, null, cfg)).length > 0);
});

test("bronvermelding: een naam in kop of samenvatting is altijd een blokkade, ook bij een geldige openingszin", () => {
  const zin = "Le Monde, Midi Libre en Le Figaro melden dat de regering het besluit heeft gepubliceerd.";
  assert.ok(krant(kwaliteitsPoort({ ...echteSyn, kop: "Le Monde en Le Figaro melden hoger minimumloon", tekst: met(zin) }, drie, cfg)).length > 0);
  assert.ok(krant(kwaliteitsPoort({ ...echteSyn, samenvatting: `${echtBericht.samenvatting} Aldus Le Figaro.`, tekst: met(zin) }, drie, cfg)).length > 0);
});

test("bronvermelding: twee aparte zinnen met elk één naam, of twee vermeldingszinnen, zijn een blokkade", () => {
  const apart = kwaliteitsPoort({ ...echteSyn, tekst: met("Le Monde meldt dat het besluit is gepubliceerd. Midi Libre meldt hetzelfde.") }, drie, cfg);
  assert.ok(krant(apart).length >= 2, apart.redenen.join(";"));
  const dubbel = kwaliteitsPoort({ ...echteSyn, tekst: met("Le Monde en Midi Libre melden dat het besluit is gepubliceerd. Le Figaro en Midi Libre melden dat het in december ingaat.") }, drie, cfg);
  assert.ok(krant(dubbel).some((r) => r.includes("meer dan één")), dubbel.redenen.join(";"));
});

test("bronvermelding: een naam elders in dezelfde zin, of een andere vorm, is geen geldige vermelding", () => {
  for (const zin of [
    "Le Monde, Midi Libre en Le Figaro melden dat de regering het besluit heeft gepubliceerd, aldus Le Figaro.",
    "Volgens Le Monde en Le Figaro is het besluit gepubliceerd.",
    "Le Monde en Midi Libre schrijven dat het besluit is gepubliceerd.",
    "De regering meldt dat Le Monde en Midi Libre het besluit hebben gepubliceerd.",
  ]) assert.ok(krant(kwaliteitsPoort({ ...echteSyn, tekst: met(zin) }, drie, cfg)).length > 0, zin);
});

test("overheidsbronnen tellen niet als krant bij de namenlijst; één persbron geeft geen lijst", () => {
  const ov: Cluster = { sleutel: "o", items: [{ ...bron("Service-Public", "o1"), regime: "overheid" }, bron("Le Monde", "o2")] };
  assert.deepEqual(namenVoorOpeningszin(ov), []);
  assert.equal(namenRegel(ov), "");
  assert.deepEqual(namenVoorOpeningszin(drie), ["Le Monde", "Midi Libre", "Le Figaro"]);
  assert.equal(namenRegel(drie), "\n\nNamen die u in de openingszin mag noemen: Le Monde, Midi Libre, Le Figaro");
  assert.deepEqual(namenVoorOpeningszin({ sleutel: "x", items: [bron("Le Monde", "1"), bron("Le Monde — Economie", "2")] }), [], "twee items van hetzelfde medium zijn niet twee media");
});
