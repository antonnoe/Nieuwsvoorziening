// Feed ontdekken bij een geplakt adres (redactie-app, scherm Bronnen, 28-11-2026). Geen netwerk in de tests: alles gaat via een
// injecteerbare fetch. Volgorde: het adres zelf (is het al een feed of sitemap?), daarna de <link rel="alternate"> in de pagina,
// daarna de gangbare paden. Een kandidaat telt alleen als hij met de bestaande lezer minstens één item oplevert.
import { leesFeed } from "@/lib/motor/feeds";
import { parseRadarTekst } from "@/lib/motor/radar";
import { ontsnap } from "@/lib/motor/tekst";
import { kaleHost } from "@/lib/motor/config";
import type { Bron } from "@/lib/motor/types";

export const FEED_PADEN = ["/feed", "/rss", "/rss.xml", "/atom.xml", "/sitemap-news.xml"];
const MAX_KANDIDATEN = 8;
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 9000;

/** Maakt van wat iemand plakt een geldig https-adres, of null (geen http(s), geen punt in de naam, of een intern adres). */
export function normaliseerAdres(invoer: string): URL | null {
  let s = String(invoer || "").trim();
  if (!s || s.length > 500 || /\s/.test(s)) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  return isOpenbaarHost(u.hostname) ? u : null;
}

/** Geen interne of numerieke adressen: alleen gewone domeinnamen. */
export function isOpenbaarHost(host: string): boolean {
  const h = String(host || "").toLowerCase();
  if (!h.includes(".") || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost") || h === "localhost") return false;
  if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return false;
  return /^[a-z0-9.-]+$/.test(h);
}

/** De feed-adressen uit <link rel="alternate" type="application/rss+xml|atom+xml"> in een html-pagina, absoluut gemaakt. */
export function vindFeedLinks(html: string, basis: URL): string[] {
  const uit: string[] = [];
  for (const m of String(html || "").matchAll(/<link\b[^>]*>/gi)) {
    const t = m[0];
    if (!/rel\s*=\s*["']?[^"'>]*alternate/i.test(t)) continue;
    if (!/type\s*=\s*["']?application\/(?:rss|atom)\+xml/i.test(t)) continue;
    const h = t.match(/href\s*=\s*"([^"]+)"|href\s*=\s*'([^']+)'/i);
    const href = (h?.[1] ?? h?.[2] ?? "").replace(/&amp;/g, "&").trim();
    if (!href) continue;
    try {
      const u = new URL(href, basis);
      if ((u.protocol === "https:" || u.protocol === "http:") && isOpenbaarHost(u.hostname)) uit.push(u.toString());
    } catch {
      /* ongeldige href */
    }
  }
  return uit;
}

/** Titel van de feed (kop van het kanaal, vóór het eerste item); leeg als er geen is. */
export function feedTitel(xml: string): string {
  const s = String(xml || "");
  const eerste = s.search(/<(item|entry)[\s>]/i);
  const kop = eerste > 0 ? s.slice(0, eerste) : s;
  const m = kop.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i);
  return m ? ontsnap(m[1]).slice(0, 80) : "";
}

/** Lijkt dit antwoord op xml (feed of sitemap) in plaats van een html-pagina? */
export const lijktOpXml = (t: string) => /^\s*(?:<\?xml|<rss[\s>]|<feed[\s>]|<urlset[\s>]|<rdf:RDF|<sitemapindex)/i.test(t);

async function haalTekst(url: string, fetchFn: typeof fetch): Promise<string | null> {
  try {
    const r = await fetchFn(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "Nieuwsvoorziening/1.0 (+https://nieuws.infofrankrijk.com/werkwijze)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5" },
      redirect: "follow",
    });
    if (!r.ok) return null;
    const t = await r.text();
    return t.length > MAX_BYTES ? t.slice(0, MAX_BYTES) : t;
  } catch {
    return null;
  }
}

const PROEFBRON: Bron = { id: "proef", naam: "proef", feed: "", domein: "", taal: "fr", land: "FR", groep: "fr_pers", regime: "pers", status: "ACTIVE", prioriteit: 2, frankrijkFilter: false, vensterUren: 48 };

export type Ontdekking =
  | { ok: true; feed: string; titel: string; aantalItems: number; domein: string }
  | { ok: false; reden: "ongeldig" | "geen-feed" };

/**
 * Zoekt de feed bij een adres. Voor een nieuwsbron moet de kandidaat met de bestaande feedlezer (`leesFeed`, RSS of Atom) minstens
 * één item opleveren; voor een radarbron mag het ook een nieuwssitemap zijn (alleen kop, datum en url worden gelezen).
 */
export async function ontdekFeed(invoer: string, soort: "nieuws" | "radar", fetchFn: typeof fetch = fetch): Promise<Ontdekking> {
  const adres = normaliseerAdres(invoer);
  if (!adres) return { ok: false, reden: "ongeldig" };
  const telItems = (xml: string) => (soort === "radar" ? parseRadarTekst(xml).length : leesFeed(xml, PROEFBRON).length);
  const gezien = new Set<string>();
  const proef = async (url: string, tekst?: string | null): Promise<Ontdekking | null> => {
    if (gezien.has(url)) return null;
    gezien.add(url);
    const xml = tekst ?? (await haalTekst(url, fetchFn));
    if (!xml || !lijktOpXml(xml)) return null;
    const n = telItems(xml);
    if (n < 1) return null;
    const host = kaleHost(url);
    return { ok: true, feed: url, titel: feedTitel(xml) || host, aantalItems: n, domein: host };
  };

  // 1. Het adres zelf.
  const eerste = await haalTekst(adres.toString(), fetchFn);
  if (eerste && lijktOpXml(eerste)) {
    const r = await proef(adres.toString(), eerste);
    if (r) return r;
  }
  // 2. Links in de pagina en 3. gangbare paden (maximaal MAX_KANDIDATEN in totaal).
  const links = eerste && !lijktOpXml(eerste) ? vindFeedLinks(eerste, adres) : [];
  const paden = FEED_PADEN.map((p) => new URL(p, adres.origin).toString());
  for (const url of [...links, ...paden].slice(0, MAX_KANDIDATEN)) {
    const r = await proef(url);
    if (r) return r;
  }
  return { ok: false, reden: "geen-feed" };
}
