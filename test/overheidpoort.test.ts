import test from "node:test";
import assert from "node:assert/strict";
import { buitenlandKenmerk, isNlOverheid, nlOverheidUitgesloten, overheidPoort, raaktBuitenland } from "../lib/motor/overheidpoort";
import { draaiOogst } from "../lib/motor/motor";
import { GeheugenOpslag } from "../lib/motor/opslag";
import { laadConfig, laadBronnen } from "../lib/motor/config";
import { bron, item, klein, rss } from "./helpers";
import type { Cluster } from "../lib/motor/types";

const nl = (titel: string, samenvatting = "") => item({ url: `https://rijk.test/${encodeURIComponent(titel)}`, bronId: "rijksoverheid-nl", bronNaam: "Rijksoverheid", regime: "overheid", groep: "overheid", taal: "nl", land: "NL", titel, samenvatting });
const cl = (...items: ReturnType<typeof nl>[]): Cluster => ({ sleutel: "x", items });

// Toetsset uit nlfr-menu (REGIE.md, 20-11-2026): wat tegengehouden blijft en wat doorkomt.
const BLIJFT_WEG: [string, string][] = [
  ["Evertsen vaart door in de Rode Zee", "Het fregat Zr.Ms. Evertsen blijft ingezet bij de operatie in de Rode Zee."],
  ["Participatiewet wordt aangepast", "Het kabinet wil de regels voor bijstand in Nederlandse gemeenten wijzigen."],
  ["Nieuwe directeur-generaal Digitaliseringsbeleid", "De minister benoemt een nieuwe DG bij Binnenlandse Zaken."],
  ["Burgemeester van Lingewaard gezocht", "De vacature wordt open gesteld voor de gemeente Lingewaard."],
  ["Belastingplan 2027 gepresenteerd", "Het kabinet verhoogt de belasting in box 3 en verlaagt de zorgtoeslag."],
  ["Gesprek met Buitenlandse Zaken", "De minister van Buitenlandse Zaken bezoekt de Kamer."],
];
const KOMT_DOOR: [string, string][] = [
  ["Nederlanders in het buitenland kunnen weer briefstemmen", "Kiezers in het buitenland ontvangen hun stembiljet."],
  ["AOW voor wie in het buitenland woont", "Wie woont in het buitenland en AOW ontvangt, krijgt een nieuwe brief."],
  ["Zorgverzekering voor verdragsgerechtigden", "De regels voor verdragsgerechtigden veranderen."],
  ["Consulaat in Parijs sluit tijdelijk", "De ambassade in Parijs is dicht door werkzaamheden."],
  ["Nieuwe regels voor expats", "De regels voor expats veranderen."],
];

test("R17: Nederlands binnenlands nieuws blijft weg, ook een ministerienaam of een losse plaats", () => {
  for (const [kop, sam] of BLIJFT_WEG) assert.equal(buitenlandKenmerk(kop, sam), null, kop);
});

test("R17: wat Nederlanders in Frankrijk of het buitenland raakt komt door, met het kenmerk erbij", () => {
  for (const [kop, sam] of KOMT_DOOR) assert.ok(raaktBuitenland(kop, sam), kop);
  assert.equal(buitenlandKenmerk("Pensioen in het buitenland", ""), "pensioen + buitenlandcontext");
  // Voorwaardelijke kenmerken tellen alleen in dezelfde zin.
  assert.equal(buitenlandKenmerk("Kamerbrief over AOW", "Het kabinet past de AOW aan. Het schip is in het buitenland ingezet."), null);
});

test("Caribisch Nederland komt nooit door, ook niet met een buitenlandkenmerk", () => {
  assert.ok(nlOverheidUitgesloten("Nieuwe regels voor Bonaire en Sint Eustatius"));
  assert.ok(!nlOverheidUitgesloten("Nieuwe regels voor expats in Frankrijk"));
  const u = overheidPoort(cl(nl("Zorgverzekering Caribisch Nederland", "Ook voor wie in het buitenland woont.")));
  assert.deepEqual([u.door, u.reden], [false, "caribisch"]);
});

test("overheidPoort: alleen Nederlandse overheid wordt getoetst; Franse overheid en pers gaan ongemoeid door", () => {
  assert.equal(overheidPoort(cl(nl("Burgemeester van Lingewaard gezocht"))).reden, "r17");
  assert.equal(overheidPoort(cl(nl("Nieuwe regels voor expats"))).door, true);
  assert.equal(overheidPoort(cl(nl("Burgemeester van Lingewaard gezocht"), nl("Nederlanders in Frankrijk krijgen nieuwe brief"))).door, true);
  assert.ok(isNlOverheid(nl("x")));
  const fr = item({ regime: "overheid", groep: "overheid", land: "FR", titel: "Le gouvernement annonce une mesure", samenvatting: "" });
  assert.equal(overheidPoort({ sleutel: "f", items: [fr] }).door, true);
  assert.equal(overheidPoort({ sleutel: "p", items: [item({ land: "NL", regime: "pers", titel: "Kamerbrief" })] }).door, true);
});

// ---- Integratie in de motor ----------------------------------------------------------
const nu = Date.now();
const tekst = "Wie in Frankrijk woont en een Nederlandse AOW ontvangt, krijgt volgende maand een nieuwe brief van de Sociale Verzekeringsbank over de uitbetaling. De bank legt uit welke gegevens nodig zijn en wanneer de betaling wordt aangepast aan de nieuwe regels voor mensen die in het buitenland wonen en een uitkering krijgen. Controleer de brief goed en reageer op tijd.";
const synthese = JSON.stringify({ publiceren: true, kop: "Nieuwe brief over AOW voor Nederlanders in Frankrijk", samenvatting: "Wie in Frankrijk woont en AOW ontvangt, krijgt een nieuwe brief over de uitbetaling.", tekst, categorie: "algemeen", relevantie: 85 });

const rijk = (titels: [string, string][]) =>
  rss(titels.map(([titel, omschrijving], n) => ({ titel, url: `https://rijk.test/${n}`, datum: new Date(nu - 3600_000 - n * 1000), omschrijving })));

test("motor: Nederlands binnenlands bestuur wordt voor de synthese tegengehouden en als r17 verwerkt; AOW-bericht komt door met soort overheid", async () => {
  const opslag = new GeheugenOpslag();
  const client = klein([(a) => (a.system.includes("groepeert") ? '{"groepen":[]}' : synthese)]);
  const feed = rijk([
    ["Burgemeester van Lingewaard gezocht", "De vacature wordt open gesteld voor de gemeente Lingewaard in Gelderland."],
    ["Nieuwe brief over AOW voor wie in Frankrijk woont", "De SVB stuurt wie in Frankrijk woont een brief over de AOW."],
  ]);
  const fetchFn = (async () => new Response(feed)) as unknown as typeof fetch;
  const bronnen = [bron({ id: "rijksoverheid-nl", naam: "Rijksoverheid", feed: "https://rijk.test/feed", domein: "rijksoverheid.nl", taal: "nl", land: "NL", groep: "overheid", regime: "overheid" })];
  const r = await draaiOogst({ opslag, client, nu, config: laadConfig(), bronnen, fetchFn, peil: [], generator: null });
  assert.equal(r.aantallen.overheidR17, 1);
  assert.equal(r.berichten.length, 1);
  assert.equal(r.berichten[0].soort, "overheid");
  assert.equal(r.berichten[0].regime, "overheid");
  assert.equal(opslag.berichtenLijst[0].soort, "overheid");
  assert.equal(opslag.items.get("https://rijk.test/0")?.verwerkt, "r17");
  // Het model is nooit gevraagd om het Lingewaard-bericht te schrijven.
  assert.ok(client.aanroepen.filter((c) => !c.system.includes("groepeert")).every((c) => !c.user.includes("Lingewaard")));
});

test("bronnenlijst: Rijksoverheid NL is actief, BOSS en info.gouv blijven CONCEPT", () => {
  const b = laadBronnen();
  const rijks = b.find((x) => x.id === "rijksoverheid-nl")!;
  assert.deepEqual([rijks.status, rijks.regime, rijks.land, rijks.taal, rijks.domein], ["ACTIVE", "overheid", "NL", "nl", "rijksoverheid.nl"]);
  assert.equal(b.find((x) => x.id === "boss")!.status, "CONCEPT");
  assert.equal(b.find((x) => x.id === "info-gouv")!.status, "CONCEPT");
});
