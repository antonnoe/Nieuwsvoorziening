// Artikeltekst als bronmateriaal voor de synthese (besluit 23-11-2026, punt 1A).
// De tekst wordt alleen gelezen en nooit opgeslagen of letterlijk overgenomen;
// de kwaliteitspoort blokkeert lange letterlijke reeksen. Faalt altijd netjes:
// bij een fout, betaalmuur of time-out blijft alleen kop en omschrijving over.
import { ontsnap } from "./tekst";
import type { Cluster } from "./types";

const MAX_TEKENS = 4000;

export function haalTekstUitHtml(html: string): string {
  let h = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|header|footer|aside|form|figure)[\s\S]*?<\/\1>/gi, " ");
  const art = h.match(/<article[\s\S]*?<\/article>/i);
  if (art) h = art[0];
  const alineas = [...h.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => ontsnap(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 60 && !/cookie|abonn|newsletter|inscri|connectez|javascript/i.test(p));
  let uit = "";
  for (const p of alineas) {
    if (uit.length + p.length > MAX_TEKENS) break;
    uit += (uit ? "\n" : "") + p;
  }
  return uit;
}

export async function haalArtikelTekst(url: string, fetchFn: typeof fetch = fetch, timeoutMs = 7000): Promise<string> {
  try {
    const r = await fetchFn(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "Mozilla/5.0 (compatible; Nieuwsvoorziening/1.0; +https://nieuws.infofrankrijk.com/werkwijze)", accept: "text/html" },
      redirect: "follow",
    });
    if (!r.ok) return "";
    const type = r.headers.get("content-type") || "";
    if (type && !type.includes("html")) return "";
    return haalTekstUitHtml(await r.text());
  } catch {
    return "";
  }
}

/** Vult artikelTekst voor hooguit `max` bronnen per cluster, parallel. Geeft het aantal gelukte terug. */
export async function verrijkMetArtikelen(c: Cluster, fetchFn: typeof fetch = fetch, max = 4): Promise<number> {
  const items = c.items.slice(0, max);
  const teksten = await Promise.all(items.map((i) => haalArtikelTekst(i.url, fetchFn)));
  let n = 0;
  items.forEach((i, k) => {
    if (teksten[k]) {
      i.artikelTekst = teksten[k];
      n += 1;
    }
  });
  return n;
}

/** Reeksen van `lengte` woorden die letterlijk uit een bron in de tekst staan. */
export function letterlijkeReeksen(tekst: string, bron: string, lengte = 10): string[] {
  const woorden = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  const b = woorden(bron);
  if (b.length < lengte) return [];
  const set = new Set<string>();
  for (let i = 0; i + lengte <= b.length; i++) set.add(b.slice(i, i + lengte).join(" "));
  const t = woorden(tekst);
  const uit = new Set<string>();
  for (let i = 0; i + lengte <= t.length; i++) {
    const r = t.slice(i, i + lengte).join(" ");
    if (set.has(r)) uit.add(r);
  }
  return [...uit];
}
