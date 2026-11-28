// PEIL in de redactie-app (28-11-2026): blok per bericht, labels in de lijst, het scherm /redactie/peil en de besluiten. Geen netwerk.
import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GeheugenOpslag, type OpgeslagenBericht } from "../lib/motor/opslag";
import { PEIL_KNOPPEN, PEIL_URL, laadPeilBlok, laadPeilVragen, peilBlokData, peilVraag, rijLabels } from "../lib/redactie-peil";
import { voerActieUit } from "../lib/redactie-acties";
import Rij from "../app/redactie/_componenten/Rij";
import PeilBlok from "../app/redactie/_componenten/PeilBlok";
import Onderbalk from "../app/redactie/_componenten/Onderbalk";
import type { PeilSignaalRij } from "../lib/motor/types";

const nu = Date.now();
const ID = "00000001-1111-1111-1111-111111111111";
const bericht = (o: Partial<OpgeslagenBericht> = {}): OpgeslagenBericht => ({
  id: ID, soort: "pers", kop: "SMIC stijgt per 1 januari", samenvatting: "S.", tekst: "T.", categorie: "economie en ondernemen", score: 80, regime: "pers", status: "gepubliceerd",
  blokkadeRedenen: [], portemonnee: false, signaal: null, signaalBeoordeeld: true, beeldUrl: null, beeldCredit: null,
  peil: { raakt: [{ id: "arbeid.smic", naam: "SMIC uurloon bruto", zekerheid: "groen" }], mogelijkGewijzigd: [] },
  bronnen: [], gepubliceerdOp: new Date(nu).toISOString(), regelversie: 2, ...o,
} as OpgeslagenBericht);
const sig = (o: Partial<PeilSignaalRij> = {}): PeilSignaalRij => ({
  id: "11111111-aaaa-1111-1111-111111111111", berichtId: ID, parameterId: "arbeid.smic", parameterNaam: "SMIC uurloon bruto", toelichting: "t", soort: "wijziging", zekerheid: "groen", titel: "Minimumloon per uur",
  nieuweWaarde: "12,02 euro", huidigeWaarde: "11,88 euro", vanaf: "1 januari 2027", definitief: true, twijfel: null, citaat: "Het SMIC stijgt naar 12,02 euro per uur.", bronUrl: null,
  status: "gesignaleerd", aantal: 1, besluit: null, besluitOp: null, berichtKop: "SMIC stijgt per 1 januari", ...o,
});
const beheerder = { rol: "beheerder" as const, naam: "Anton", id: null };
const redacteur = { rol: "redacteur" as const, naam: "Marijke", id: "x" };

test("blok: groene koppeling toont lezerstitel (anders PEIL-naam), nieuwe waarde en datum; zonder koppeling geen blok", () => {
  const zinnen = new Map([["arbeid.smic", { titel: "Minimumloon" }]]);
  const d = peilBlokData(bericht(), [sig()], zinnen, false);
  assert.deepEqual(d.groen, [{ naam: "Minimumloon", nieuw: "12,02 euro", vanaf: "1 januari 2027" }]);
  assert.equal(peilBlokData(bericht(), [], new Map(), false).groen[0].naam, "SMIC uurloon bruto");
  assert.equal(peilBlokData(bericht(), [], new Map(), false).groen[0].nieuw, null);
  const h = renderToStaticMarkup(createElement(PeilBlok, { data: d }));
  assert.ok(h.includes("Raakt PEIL: Minimumloon (nieuwe waarde 12,02 euro, vanaf 1 januari 2027)"), h);
  assert.ok(h.includes(`href="${PEIL_URL}"`) && h.includes("Bekijk in PEIL") && h.includes("rd-knop"));
  assert.equal(renderToStaticMarkup(createElement(PeilBlok, { data: peilBlokData(bericht({ peil: { raakt: [], mogelijkGewijzigd: [] } }), [], new Map(), true) })), "");
});

test("blok: een koppeling zonder zekerheid is geen groene koppeling; oranje alleen voor de beheerder en met de vaste zin", () => {
  const oud = bericht({ peil: { raakt: [{ id: "arbeid.smic", naam: "SMIC" }], mogelijkGewijzigd: [] } });
  assert.equal(peilBlokData(oud, [], new Map(), true).groen.length, 0);
  const oranje = sig({ zekerheid: "oranje", titel: "Minimumloon" });
  const geenGroen = bericht({ peil: { raakt: [], mogelijkGewijzigd: [] } });
  assert.equal(peilBlokData(geenGroen, [oranje], new Map(), false).oranje.length, 0, "een redacteur ziet oranje niet");
  const d = peilBlokData(geenGroen, [oranje], new Map(), true);
  const h = renderToStaticMarkup(createElement(PeilBlok, { data: d }));
  assert.ok(h.includes("Mogelijk PEIL: Minimumloon") && h.includes("(niet zeker, wordt niet aan lezers getoond)"), h);
  // Een signaal van een ander bericht telt niet mee.
  assert.equal(peilBlokData(geenGroen, [sig({ zekerheid: "oranje", berichtId: "x" })], new Map(), true).oranje.length, 0);
});

test("laadPeilBlok: een storing in signalen of lezerszinnen laat het blok niet falen", async () => {
  const o = new GeheugenOpslag();
  o.peilSignalen = async () => { throw new Error("kapot"); };
  o.lezerszinnen = async () => { throw new Error("kapot"); };
  const d = await laadPeilBlok(o, bericht(), true);
  assert.equal(d.groen[0].naam, "SMIC uurloon bruto");
});

test("lijstrij: label PEIL bij een groene koppeling, € bij portemonnee, niets bij geen van beide", () => {
  assert.deepEqual(rijLabels(bericht()), ["PEIL"]);
  assert.deepEqual(rijLabels(bericht({ portemonnee: true })), ["PEIL", "€"]);
  assert.deepEqual(rijLabels(bericht({ portemonnee: true, peil: { raakt: [{ id: "a", naam: "n" }], mogelijkGewijzigd: [] } })), ["€"]);
  assert.deepEqual(rijLabels(bericht({ peil: { raakt: [], mogelijkGewijzigd: [] } })), []);
  const h = renderToStaticMarkup(createElement(Rij, { b: bericht({ portemonnee: true }) }));
  assert.ok(h.includes(">PEIL<") && h.includes(">€<"), h);
  assert.ok(!renderToStaticMarkup(createElement(Rij, { b: bericht({ peil: { raakt: [], mogelijkGewijzigd: [] } }) })).includes(">PEIL<"));
});

test("beheerdersmenu: link PEIL naast Mensen, alleen voor de beheerder", () => {
  const b = renderToStaticMarkup(createElement(Onderbalk, { nu: "overig", toegang: beheerder }));
  assert.ok(b.includes('href="/redactie/mensen"') && b.includes('href="/redactie/peil"'));
  const r = renderToStaticMarkup(createElement(Onderbalk, { nu: "overig", toegang: redacteur }));
  assert.ok(!r.includes("/redactie/peil"));
  assert.ok(b.includes('href="/redactie/radar"') && b.includes('href="/redactie/bronnen"'), "de onderbalk zelf is ongewijzigd");
});

test("scherm: vragen in gewone taal, vijf knoppen met de afgesproken teksten", async () => {
  assert.deepEqual(PEIL_KNOPPEN.map((k) => [k.keuze, k.tekst]), [
    ["vastgesteld", "Klopt, PEIL bijwerken"], ["verwacht", "Klopt, maar nog niet zeker"], ["raakt_niet", "Raakt PEIL niet"], ["lijst", "Op de lijst voor PEIL"], ["niet_nodig", "Niet nodig"],
  ]);
  const v = peilVraag(sig());
  assert.equal(v.titel, "Minimumloon per uur");
  assert.equal(v.verandert, "Volgens het bericht gaat het van 11,88 euro naar 12,02 euro, vanaf 1 januari 2027.");
  assert.equal(v.citaat, "Het SMIC stijgt naar 12,02 euro per uur.");
  assert.equal(v.advies, "vastgesteld");
  assert.equal(peilVraag(sig({ soort: "ontbreekt", definitief: null })).advies, "lijst");
  assert.equal(peilVraag(sig({ nieuweWaarde: null, huidigeWaarde: null, vanaf: null })).verandert, null);
  const o = new GeheugenOpslag();
  assert.deepEqual(await laadPeilVragen(o), []);
  o.peilSignalen = async () => { throw new Error("x"); };
  assert.equal(await laadPeilVragen(o), null);
});

async function opzet() {
  const o = new GeheugenOpslag();
  o.berichtenLijst.push(bericht());
  o.signalen.push(sig());
  return o;
}
const actie = (o: GeheugenOpslag, toegang: typeof beheerder | typeof redacteur, keuze: string, id = "11111111-aaaa-1111-1111-111111111111") =>
  voerActieUit(o, toegang, { actie: "peil", id, keuze, terug: "/redactie/peil" });

test("besluit: elke knop zet alleen de status van het signaal; PEIL zelf blijft ongemoeid; terug naar /redactie/peil", async () => {
  for (const k of PEIL_KNOPPEN) {
    const o = await opzet();
    const u = await actie(o, beheerder, k.keuze);
    assert.ok(u.ok, u.melding);
    assert.equal(u.terug, "/redactie/peil");
    assert.ok(/PEIL zelf is niet aangepast/.test(u.melding), u.melding);
    assert.equal(o.signalen[0].status, k.keuze);
    assert.equal(o.berichtenLijst[0].peil.raakt.length, k.keuze === "raakt_niet" ? 0 : 1, "alleen raakt_niet haalt de koppeling bij het bericht weg");
  }
});

test("besluit: een redacteur mag het niet; al beantwoord, onbekend en ongeldige keuze geven een gewone melding", async () => {
  const o = await opzet();
  const r = await actie(o, redacteur, "niet_nodig");
  assert.ok(!r.ok);
  assert.equal(o.signalen[0].status, "gesignaleerd");
  assert.ok(!(await actie(o, beheerder, "bestaat_niet")).ok);
  assert.ok((await actie(o, beheerder, "niet_nodig")).ok);
  const nog = await actie(o, beheerder, "lijst");
  assert.ok(!nog.ok && /al beantwoord/.test(nog.melding));
  const weg = await actie(o, beheerder, "lijst", "22222222-aaaa-1111-1111-111111111111");
  assert.ok(!weg.ok && /bestaat niet meer/.test(weg.melding));
});
