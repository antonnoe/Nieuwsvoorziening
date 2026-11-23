// RSS 2.0 en Atom lezen en normaliseren naar BronItem. Eigen lichte lezer,
// zonder afhankelijkheid; faalt per bron zonder de rest te breken.
import { ontsnap } from "./tekst";
import type { Bron, BronItem } from "./types";
import { zeef } from "./zeef";

function tag(blok: string, naam: string): string {
  const m = blok.match(new RegExp(`<${naam}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${naam}>`, "i"));
  return m ? m[1] : "";
}

function linkVan(blok: string): string {
  const t = ontsnap(tag(blok, "link"));
  if (/^https?:\/\//.test(t)) return t;
  const alt = blok.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i) || blok.match(/<link[^>]*href="([^"]+)"/i);
  if (alt) return alt[1].replace(/&amp;/g, "&");
  const guid = ontsnap(tag(blok, "guid"));
  return /^https?:\/\//.test(guid) ? guid : "";
}

function iso(d: string): string | null {
  const t = Date.parse(ontsnap(d));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Schone url: tracking weg, fragment weg. Dient ook als ontdubbelingssleutel. */
export function schoneUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = "";
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|xtor|at_|fbclid|gclid|ns_|origin)/i.test(k)) x.searchParams.delete(k);
    return x.toString();
  } catch {
    return u;
  }
}

export function leesFeed(xml: string, bron: Bron, nu = Date.now()): BronItem[] {
  const uit: BronItem[] = [];
  const blokken = [...String(xml || "").matchAll(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  for (const blok of blokken) {
    const titel = ontsnap(tag(blok, "title"));
    const url = schoneUrl(linkVan(blok));
    if (!titel || !/^https?:\/\//.test(url)) continue;
    const datum = iso(tag(blok, "pubDate") || tag(blok, "published") || tag(blok, "updated") || tag(blok, "dc:date"));
    const samenvatting = ontsnap(tag(blok, "description") || tag(blok, "summary") || tag(blok, "content:encoded")).slice(0, 500);
    uit.push({
      url,
      bronId: bron.id,
      bronNaam: bron.naam,
      regime: bron.regime,
      groep: bron.groep,
      taal: bron.taal,
      land: bron.land,
      titel,
      samenvatting,
      gepubliceerdOp: datum || new Date(nu).toISOString(),
      prioriteit: bron.prioriteit,
    });
  }
  return uit;
}

export interface OogstBronResultaat {
  bronId: string;
  ok: boolean;
  gelezen: number;
  door: number;
  fout?: string;
  geweerd: Record<string, number>;
}

export async function haalFeed(bron: Bron, fetchFn: typeof fetch = fetch, timeoutMs = 9000): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchFn(bron.feed, {
      signal: ctl.signal,
      headers: { "user-agent": "Nieuwsvoorziening/0.1 (+https://www.communitiesabroad.com)", accept: "application/rss+xml, application/atom+xml, text/xml, */*" },
      redirect: "follow",
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

/** Oogst alle bronnen parallel (in kleine groepen); een mislukte bron breekt niets. */
export async function oogstBronnen(
  bronnen: Bron[],
  opties: { nu?: number; maxPerBron?: number; fetchFn?: typeof fetch } = {}
): Promise<{ items: BronItem[]; resultaten: OogstBronResultaat[] }> {
  const nu = opties.nu ?? Date.now();
  const max = opties.maxPerBron ?? 25;
  const items: BronItem[] = [];
  const resultaten: OogstBronResultaat[] = [];
  const groepGrootte = 6;
  for (let i = 0; i < bronnen.length; i += groepGrootte) {
    await Promise.all(
      bronnen.slice(i, i + groepGrootte).map(async (bron) => {
        const res: OogstBronResultaat = { bronId: bron.id, ok: false, gelezen: 0, door: 0, geweerd: {} };
        try {
          const xml = await haalFeed(bron, opties.fetchFn);
          const alle = leesFeed(xml, bron, nu)
            .filter((it) => nu - Date.parse(it.gepubliceerdOp) <= bron.vensterUren * 3600_000 && Date.parse(it.gepubliceerdOp) <= nu + 3600_000)
            .sort((a, b) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp))
            .slice(0, max);
          res.gelezen = alle.length;
          for (const it of alle) {
            const u = zeef(it, bron);
            if (!u.door) {
              res.geweerd[u.reden as string] = (res.geweerd[u.reden as string] || 0) + 1;
              continue;
            }
            items.push(it);
            res.door += 1;
          }
          res.ok = true;
        } catch (e) {
          res.fout = e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160);
        }
        resultaten.push(res);
      })
    );
  }
  // Ontdubbelen op url.
  const gezien = new Set<string>();
  const uniek = items.filter((it) => (gezien.has(it.url) ? false : (gezien.add(it.url), true)));
  return { items: uniek, resultaten };
}
