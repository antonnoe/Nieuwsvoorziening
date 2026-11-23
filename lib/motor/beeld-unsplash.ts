// Unsplash als beeldbron (besluit 23-11-2026). Regels van Unsplash: de foto
// wordt gehotlinkt (urls.regular), het download-eindpunt wordt aangeroepen
// wanneer een foto wordt gebruikt, en de fotograaf en Unsplash worden met een
// link vermeld. De sleutel (UNSPLASH_ACCESS_KEY) verlaat de server nooit.
import { registreerGenerator, type BeeldGenerator, type BeeldInvoer } from "./beeld";
import type { BeeldCredit, Categorie } from "./types";

const UTM = "utm_source=nieuwsvoorziening&utm_medium=referral";

/** Terugval per categorie als de zoekterm niets oplevert. */
export const STANDAARD_ZOEKTERM: Record<Categorie, string> = {
  algemeen: "france town street",
  politiek: "paris france government building",
  "economie en ondernemen": "france business market",
  "reizen en verkeer": "france road travel",
  "natuur en rampen": "france landscape weather",
  "toerisme en evenementen": "france village tourism",
  merkwaardig: "france countryside",
};

type Foto = { id: string; urls?: { regular?: string }; links?: { download_location?: string; html?: string }; user?: { name?: string; links?: { html?: string } } };

function kies(fotos: Foto[], sleutel: string): Foto | null {
  const bruikbaar = fotos.filter((f) => f.urls?.regular && f.user?.name);
  if (!bruikbaar.length) return null;
  let h = 0;
  for (const ch of sleutel) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return bruikbaar[h % Math.min(bruikbaar.length, 5)];
}

export function maakUnsplashGenerator(fetchFn: typeof fetch = fetch, sleutel = () => String(process.env.UNSPLASH_ACCESS_KEY || "").trim()): BeeldGenerator {
  async function zoek(term: string): Promise<Foto[]> {
    const q = new URLSearchParams({ query: term, orientation: "landscape", per_page: "10", content_filter: "high" });
    const r = await fetchFn(`https://api.unsplash.com/search/photos?${q}`, {
      headers: { Authorization: `Client-ID ${sleutel()}`, "Accept-Version": "v1" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`Unsplash HTTP ${r.status}`);
    const d = (await r.json()) as { results?: Foto[] };
    return Array.isArray(d.results) ? d.results : [];
  }
  return {
    naam: "unsplash",
    async genereer(b: BeeldInvoer) {
      if (!sleutel()) return null;
      const termen = [b.zoekterm?.trim(), STANDAARD_ZOEKTERM[b.categorie] || "france"].filter(Boolean) as string[];
      for (const term of termen) {
        const foto = kies(await zoek(term), b.kop);
        if (!foto) continue;
        // Verplicht: het gebruik melden bij Unsplash. Een fout hierbij blokkeert het beeld niet.
        if (foto.links?.download_location) {
          await fetchFn(foto.links.download_location, { headers: { Authorization: `Client-ID ${sleutel()}` }, signal: AbortSignal.timeout(5000) }).catch(() => undefined);
        }
        const url = `${foto.urls!.regular}`;
        const credit: BeeldCredit = {
          bron: "Unsplash",
          maker: String(foto.user!.name),
          makerUrl: `${foto.user?.links?.html || "https://unsplash.com"}?${UTM}`,
          bronUrl: `https://unsplash.com/?${UTM}`,
        };
        return { url, credit };
      }
      return null;
    },
  };
}

registreerGenerator(maakUnsplashGenerator());
