// Een beeld laten tekenen (redactie-app, 28-11-2026): het synthesemodel tekent één SVG bij kop en samenvatting. Wat terugkomt wordt
// STRENG gecontroleerd voor het ook maar getoond wordt, en bij "Gebruiken" nog eens (de browser is niet te vertrouwen).
// Afgekeurd is niets opgeslagen en de melding is altijd "Tekening mislukt, probeer opnieuw"; de reden staat alleen in het resultaat voor de logs en tests.
// De controle werkt met een lijst van toegestane elementen en attributen (geen verbodenlijst): wat niet op de lijst staat, valt af.
import type { ModelClient } from "@/lib/motor/ai";
import { modelSynthese } from "@/lib/motor/config";

export const TEKEN_MELDING = "Tekening mislukt, probeer opnieuw";
export const SVG_BREEDTE = 1200;
export const SVG_HOOGTE = 675;
export const MAX_SVG_BYTES = 60_000;
const MAX_ELEMENTEN = 1500;

/** Het palet van de beeldbank (zelfde kleuren als scripts/illustraties/teken.py en app/huisstijl.css). */
export const TEKEN_PALET = { M: "#800000", W: "#faf7f4", B: "#efe8e1", L: "#e7dfd8", I: "#1f1a18", G: "#2f6b3a", GR: "#6f6660", ZA: "#e3d6c6", OK: "#e3c26b" } as const;
const PALET_WAARDEN = new Set<string>(Object.values(TEKEN_PALET));
const KLEUR_NIKS = new Set(["none", "transparent"]);

const ELEMENTEN = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const ATTRIBUTEN = new Set([
  "xmlns", "viewbox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points", "transform",
  "fill", "stroke", "stroke-width", "stroke-linejoin", "stroke-linecap", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset",
  "fill-rule", "clip-rule", "opacity", "fill-opacity", "stroke-opacity", "preserveaspectratio", "version",
]);
const KLEURATTRIBUTEN = new Set(["fill", "stroke"]);
const SVG_NS = "http://www.w3.org/2000/svg";

export type Controle = { ok: true; svg: string } | { ok: false; reden: string };
const af = (reden: string): Controle => ({ ok: false, reden });

/** Controleert een SVG-tekst. Geeft de schone tekst (getrimd) of de reden van afkeuring. */
export function controleerSvg(invoer: string): Controle {
  if (typeof invoer !== "string") return af("geen tekst");
  const svg = invoer.trim();
  if (!svg.startsWith("<svg")) return af("begint niet met <svg");
  if (!svg.endsWith("</svg>")) return af("eindigt niet met </svg>");
  if (Buffer.byteLength(svg, "utf8") > MAX_SVG_BYTES) return af("groter dan 60 kB");

  // Benoemde verboden dingen eerst, zodat de reden duidelijk is (de lijst hieronder zou ze ook vangen).
  if (/<\s*script/i.test(svg)) return af("script");
  if (/<\s*foreignobject/i.test(svg)) return af("foreignObject");
  if (/<\s*(text|tspan|textpath)\b/i.test(svg)) return af("tekst");
  if (/<\s*style\b|@import/i.test(svg)) return af("stijlblok");
  if (/<[!?]/.test(svg)) return af("commentaar, doctype of xml-declaratie");
  if (/\bon[a-z]+\s*=/i.test(svg)) return af("gebeurtenis-attribuut (on...)");
  if (/(xlink:)?href\s*=/i.test(svg)) return af("href");
  if (/url\s*\(/i.test(svg)) return af("url()");
  if (/javascript:|data:|&#|&[a-z]+;/i.test(svg)) return af("script-adres of entiteit");
  // Alle adressen weg behalve de ene xmlns.
  if (/https?:\/\//i.test(svg.split(`xmlns="${SVG_NS}"`).join("").split(`xmlns='${SVG_NS}'`).join(""))) return af("extern adres");

  // Elke hexkleur (ook in een waarde die we niet als kleur herkennen) moet uit het palet komen.
  for (const m of svg.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) if (!PALET_WAARDEN.has(m[0].toLowerCase())) return af(`kleur buiten het palet: ${m[0]}`);

  // Structuur: alleen toegestane elementen en attributen, in evenwicht, geen losse tekst. Eigen scanner (geen ingewikkelde reguliere
  // expressie over de hele tekst, zodat een kwaadaardig antwoord de controle niet kan vastzetten).
  const stapel: string[] = [];
  let aantal = 0;
  let vorigeEinde = 0;
  let wortelGezien = false;
  let i = 0;
  while ((i = svg.indexOf("<", i)) >= 0) {
    if (svg.slice(vorigeEinde, i).trim() !== "") return af("losse tekst tussen de elementen");
    let j = i + 1;
    let aanhaling = "";
    for (; j < svg.length; j++) {
      const c = svg[j];
      if (aanhaling) {
        if (c === aanhaling) aanhaling = "";
      } else if (c === '"' || c === "'") aanhaling = c;
      else if (c === ">" || c === "<") break;
    }
    if (j >= svg.length || svg[j] !== ">") return af("tag niet afgesloten");
    const m = svg.slice(i + 1, j).match(/^(\/?)([a-zA-Z][\w:-]*)([\s\S]*?)(\/?)$/);
    if (!m) return af("tag niet te lezen");
    const [, sluit, naamRuw, attrTekst, zelfSluitend] = m;
    const naam = naamRuw.toLowerCase();
    if (!ELEMENTEN.has(naam)) return af(`element niet toegestaan: ${naam}`);
    if (sluit) {
      if (attrTekst.trim() || zelfSluitend || stapel.pop() !== naam) return af("tags niet in evenwicht");
    } else {
      aantal += 1;
      if (aantal > MAX_ELEMENTEN) return af("te veel elementen");
      if (naam === "svg") {
        if (wortelGezien || stapel.length) return af("meer dan één svg");
        wortelGezien = true;
      } else if (!stapel.length) return af("element buiten de svg");
      const attrFout = controleerAttributen(naam, attrTekst);
      if (attrFout) return af(attrFout);
      if (!zelfSluitend) stapel.push(naam);
    }
    vorigeEinde = j + 1;
    i = j + 1;
  }
  if (svg.slice(vorigeEinde).trim() !== "") return af("losse tekst na de svg");
  if (stapel.length) return af("tags niet in evenwicht");
  if (aantal < 4) return af("te weinig vormen");
  return { ok: true, svg };
}

function controleerAttributen(element: string, tekst: string): string | null {
  const gezien = new Set<string>();
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let rest = tekst;
  for (const m of tekst.matchAll(re)) {
    rest = rest.replace(m[0], " ");
    const naam = m[1].toLowerCase();
    const waarde = (m[3] ?? m[4] ?? "").trim();
    if (gezien.has(naam)) return `attribuut dubbel: ${naam}`;
    gezien.add(naam);
    if (!ATTRIBUTEN.has(naam)) return `attribuut niet toegestaan: ${naam}`;
    if (KLEURATTRIBUTEN.has(naam)) {
      const w = waarde.toLowerCase();
      if (!PALET_WAARDEN.has(w) && !KLEUR_NIKS.has(w)) return `kleur buiten het palet: ${waarde}`;
    } else if (naam === "d" || naam === "points") {
      if (!/^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-., \t\r\n]*$/.test(waarde)) return `ongeldige padgegevens (${naam})`;
    } else if (naam === "transform") {
      if (!/^[a-zA-Z0-9(),.\-+\s]*$/.test(waarde) || /url|script/i.test(waarde)) return "ongeldige transform";
    } else if (naam === "xmlns") {
      if (waarde !== SVG_NS) return "ongeldige xmlns";
    } else if (naam === "viewbox") {
      if (element !== "svg" || waarde.split(/[\s,]+/).join(" ") !== `0 0 ${SVG_BREEDTE} ${SVG_HOOGTE}`) return `viewBox moet 0 0 ${SVG_BREEDTE} ${SVG_HOOGTE} zijn`;
    } else if (naam === "preserveaspectratio" || naam === "version") {
      if (!/^[a-zA-Z0-9. ]*$/.test(waarde)) return `ongeldige ${naam}`;
    } else if (!/^[0-9a-zA-Z.%+\-, ]*$/.test(waarde)) {
      return `ongeldige waarde voor ${naam}`;
    }
  }
  if (rest.replace(/\s+/g, "") !== "") return "attributen niet te lezen";
  if (element === "svg") {
    if (!gezien.has("xmlns")) return "xmlns ontbreekt";
    if (!gezien.has("viewbox")) return "viewBox ontbreekt";
  }
  return null;
}

// ---- De opdracht aan het model ---------------------------------------------------------------------------
const VOORBEELD_HUIS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#faf7f4"/><g stroke="#1f1a18" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"><rect x="0" y="520" width="1200" height="155" fill="#efe8e1"/><rect x="380" y="270" width="440" height="250" fill="#e3d6c6"/><path d="M350 280 L600 110 L850 280 Z" fill="#800000"/><rect x="560" y="390" width="80" height="130" fill="#6f6660"/><rect x="430" y="330" width="90" height="80" fill="#e7dfd8"/><rect x="680" y="330" width="90" height="80" fill="#e7dfd8"/><circle cx="170" cy="470" r="70" fill="#2f6b3a"/><rect x="160" y="500" width="20" height="30" fill="#6f6660"/></g></svg>`;
const VOORBEELD_LAADPAAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#faf7f4"/><g stroke="#1f1a18" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"><rect x="0" y="540" width="1200" height="135" fill="#e7dfd8"/><rect x="250" y="200" width="150" height="340" rx="20" fill="#2f6b3a"/><rect x="285" y="240" width="80" height="70" rx="8" fill="#faf7f4"/><circle cx="325" cy="360" r="22" fill="#e3c26b"/><path d="M400 400 C520 400 520 520 640 500" fill="none" stroke-width="8"/><rect x="640" y="440" width="380" height="100" rx="30" fill="#800000"/><circle cx="720" cy="545" r="38" fill="#1f1a18"/><circle cx="940" cy="545" r="38" fill="#1f1a18"/></g></svg>`;

/** De twee voorbeelden uit de opdracht; ze moeten zelf door de controle komen (getest). */
export const VOORBEELDEN = [VOORBEELD_HUIS, VOORBEELD_LAADPAAL];

export const SYSTEEM_TEKENEN = `Je tekent een illustratie bij een Nederlandstalig nieuwsbericht over Frankrijk, in de vaste stijl van de beeldbank van Communities Abroad: platte, eenvoudige vormen met een donkere omlijning, rustig en duidelijk.

Antwoord in precies dit formaat, zonder uitleg en zonder codehekken:
NAAM: een korte Nederlandse naam voor het beeld van 2 tot 5 woorden (het onderwerp, geen eigennamen)
<svg ...>...</svg>

Harde regels voor de SVG (wat ervan afwijkt wordt automatisch afgekeurd):
- Eén SVG die begint met <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_BREEDTE} ${SVG_HOOGTE}"> en eindigt met </svg>. Hooguit 20 kB.
- Alleen deze elementen: svg, g, path, rect, circle, ellipse, line, polyline, polygon. Geen tekst, geen letters, geen cijfers, geen <text>, geen <style>, geen <defs>, geen <image>, geen <use>, geen gradienten.
- Geen script, geen on...-attributen, geen href, geen url(), geen externe adressen, geen commentaar.
- Alleen deze kleuren, als hexwaarde in de attributen fill en stroke (of none): rood-bruin #800000, wit #faf7f4, beige #efe8e1, lichtbeige #e7dfd8, bijna zwart #1f1a18, groen #2f6b3a, grijs #6f6660, zand #e3d6c6, geel #e3c26b. Geef elke vorm expliciet een fill.
- Begin met een rechthoek over de hele achtergrond (width 1200, height 675, fill #faf7f4) en zet daarna alle vormen in één <g stroke="#1f1a18" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">.
- Het beeld toont het ONDERWERP van het bericht als eenvoudig voorwerp of tafereel: gebouwen, voorwerpen, voertuigen, natuur, kaarten, documenten zonder tekst.
- Geen gezichten met details, geen echte personen, geen politici, geen logo's, geen merken, geen vlaggen met tekst, geen kranten of persfoto's.

Twee voorbeelden van de stijl:
Voorbeeld 1 (NAAM: Huis met rood dak):
${VOORBEELD_HUIS}

Voorbeeld 2 (NAAM: Laadpaal en auto):
${VOORBEELD_LAADPAAL}`;

export interface TekenInvoer {
  kop: string;
  samenvatting: string;
}
export type TekenUitkomst = { ok: true; svg: string; naam: string } | { ok: false; melding: string; reden: string };

/** Haalt naam en svg uit het modelantwoord: een regel "NAAM: ..." en daarna de svg (codehekken worden genegeerd). */
export function leesTekenAntwoord(antwoord: string): { naam: string; svg: string } {
  const t = String(antwoord || "").replace(/```(?:svg|xml)?/gi, "").trim();
  const m = t.match(/^\s*naam\s*:\s*([^\n\r<]*)/i);
  const start = t.indexOf("<svg");
  const naam = (m?.[1] || "").replace(/["'`*]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return { naam: naam.length >= 2 ? naam : "Getekend beeld", svg: start >= 0 ? t.slice(start) : t };
}

/** Eén aanroep van het synthesemodel; het antwoord wordt streng gecontroleerd. Faalt nooit: een fout is een nette melding. */
export async function maakTekening(client: ModelClient | null, b: TekenInvoer): Promise<TekenUitkomst> {
  if (!client) return { ok: false, melding: TEKEN_MELDING, reden: "geen model beschikbaar" };
  try {
    const antwoord = await client.tekst({
      model: modelSynthese(), maxTokens: 12000, system: SYSTEEM_TEKENEN,
      user: `Kop: ${String(b.kop || "").slice(0, 300)}\nSamenvatting: ${String(b.samenvatting || "").slice(0, 1200)}\n\nTeken het beeld.`,
    });
    const { naam, svg } = leesTekenAntwoord(antwoord);
    const c = controleerSvg(svg);
    return c.ok ? { ok: true, svg: c.svg, naam } : { ok: false, melding: TEKEN_MELDING, reden: c.reden };
  } catch (e) {
    return { ok: false, melding: TEKEN_MELDING, reden: `modelfout: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}` };
  }
}

/** De SVG als data-adres voor een <img> (scripts draaien in een img nooit; de controle blijft bovendien nodig voor opslag). */
export const svgDataAdres = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Schone korte naam voor opslag en onderschrift. */
export function schoneNaam(naam: unknown): string {
  const n = String(naam ?? "").replace(/[<>"`]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return n.length >= 2 ? n : "Getekend beeld";
}
