// Unsplash als beeldbron (besluit 23-11-2026, aangescherpt 23-11-2026 na de klacht
// over onpassende foto's). Werkwijze per bericht:
//  1. tot 3 zoektermen van specifiek naar algemeen; per term de top 10;
//  2. het goedkope model geeft elke foto een pasvorm 0-10 uit kop, samenvatting en
//     de beschrijving van de foto; vanaf PASVORM_DREMPEL wordt de beste gebruikt;
//  3. past niets, dan een vaste neutrale terugvalfoto per categorie (beeld-terugval.ts);
//  4. zonder sleutel, zonder model of bij een uitgeputte limiet: geen beeld.
// Regels van Unsplash: hotlinken (urls.regular), download-eindpunt aanroepen bij
// gebruik, fotograaf en Unsplash met link vermelden. De sleutel verlaat de server nooit.
// Limiet (demomodus 50 per uur): per run hooguit MAX_AANVRAGEN_PER_RUN aanvragen
// (zoeken, foto ophalen, download-melding); bij 403 of 429 stopt de run met Unsplash.
import { registreerGenerator, noemtPersoon, fotoSleutel, schoneZoektermen, type BeeldGenerator, type BeeldInvoer } from "./beeld";
import { TERUGVAL } from "./beeld-terugval";
import { haalJson } from "./ai";
import { modelGoedkoop } from "./config";
import type { BeeldCredit } from "./types";

const UTM = "utm_source=nieuwsvoorziening&utm_medium=referral";
export const PASVORM_DREMPEL = 6;
export const MAX_AANVRAGEN_PER_RUN = 36;
const MAX_ZOEKTERMEN = 3;

type Foto = {
  id: string;
  description?: string | null;
  alt_description?: string | null;
  urls?: { regular?: string };
  links?: { download_location?: string };
  user?: { name?: string; links?: { html?: string } };
};

class LimietBereikt extends Error {}

/** Lichtere versie van de foto: breedte 1200 en kwaliteit 75 (bestaande parameters worden vervangen, niet verdubbeld). */
export function lichteUrl(u: string): string {
  try {
    const x = new URL(u);
    x.searchParams.set("w", "1200");
    x.searchParams.set("q", "75");
    return x.toString();
  } catch {
    return u;
  }
}

const SYSTEEM_PASVORM = `Je kiest een nieuwsfoto. Je krijgt een nieuwsbericht (kop en samenvatting) en genummerde foto's met een korte beschrijving. Geef de foto die zichtbaar bij het onderwerp past en een cijfer 0 tot 10 voor de pasvorm.
Wees streng: 8 tot 10 = toont het onderwerp zelf (bij een overstroming een onder water staande straat); 6 tot 7 = past duidelijk bij het soort situatie of de plek; 0 tot 5 = andere plek, ander onderwerp, herkenbaar oriëntatiepunt van een andere streek, sfeerbeeld zonder verband, of een persoon. Twijfel je, geef dan een laag cijfer: liever geen foto dan een misleidende.
Antwoord uitsluitend met JSON: {"keuze":1,"cijfer":0}`;

export function maakUnsplashGenerator(fetchFn: typeof fetch = fetch, sleutel = () => String(process.env.UNSPLASH_ACCESS_KEY || "").trim(), maxAanvragen = MAX_AANVRAGEN_PER_RUN): BeeldGenerator & { aanvragen(): number } {
  let aanvragen = 0;
  let uitgeput = false;
  let terugvalCache = new Map<string, Foto | null>();

  /** Elke aanvraag aan Unsplash loopt hierlangs: telt, bewaakt de limiet. */
  async function vraag(url: string, uitleg: string): Promise<Response> {
    if (uitgeput || aanvragen >= maxAanvragen) throw new LimietBereikt(uitleg);
    aanvragen += 1;
    const r = await fetchFn(url, { headers: { Authorization: `Client-ID ${sleutel()}`, "Accept-Version": "v1" }, signal: AbortSignal.timeout(8000) });
    if (r.status === 403 || r.status === 429) {
      uitgeput = true;
      throw new LimietBereikt(`Unsplash HTTP ${r.status}`);
    }
    return r;
  }

  async function zoek(term: string): Promise<Foto[]> {
    const q = new URLSearchParams({ query: term, orientation: "landscape", per_page: "10", content_filter: "high" });
    const r = await vraag(`https://api.unsplash.com/search/photos?${q}`, "zoeken");
    if (!r.ok) throw new Error(`Unsplash HTTP ${r.status}`);
    const d = (await r.json()) as { results?: Foto[] };
    return (Array.isArray(d.results) ? d.results : []).filter((f) => f?.id && f.urls?.regular && f.user?.name && !noemtPersoon(`${f.alt_description || ""} ${f.description || ""}`));
  }

  async function haalFoto(id: string): Promise<Foto | null> {
    if (terugvalCache.has(id)) return terugvalCache.get(id)!;
    const r = await vraag(`https://api.unsplash.com/photos/${encodeURIComponent(id)}`, "foto ophalen");
    let f: Foto | null = null;
    if (r.ok) {
      const d = (await r.json()) as Foto;
      if (d?.id && d.urls?.regular && d.user?.name && !noemtPersoon(`${d.alt_description || ""} ${d.description || ""}`)) f = d;
    }
    terugvalCache.set(id, f);
    return f;
  }

  async function beoordeel(b: BeeldInvoer, fotos: Foto[]): Promise<{ foto: Foto; cijfer: number } | null> {
    if (!b.client || !fotos.length) return null;
    const lijst = fotos.map((f, n) => `${n + 1}. ${[f.alt_description, f.description].filter(Boolean).join(" | ").slice(0, 220) || "(geen beschrijving)"}`).join("\n");
    try {
      const antw = await b.client.tekst({ model: modelGoedkoop(), maxTokens: 60, system: SYSTEEM_PASVORM, user: `Bericht: ${b.kop}\n${b.samenvatting}\n\nFoto's:\n${lijst}` });
      const j = haalJson<{ keuze?: unknown; cijfer?: unknown }>(antw);
      const n = Math.round(Number(j?.keuze));
      const cijfer = Number(j?.cijfer);
      if (!j || !Number.isFinite(cijfer) || !Number.isInteger(n) || n < 1 || n > fotos.length) return null;
      return { foto: fotos[n - 1], cijfer };
    } catch {
      return null;
    }
  }

  /** Meldt het gebruik bij Unsplash (verplicht) en bouwt het resultaat; een fout bij de melding blokkeert het beeld niet. */
  async function gebruik(foto: Foto) {
    if (foto.links?.download_location) {
      try {
        await vraag(foto.links.download_location, "download-melding");
      } catch (e) {
        if (e instanceof LimietBereikt && uitgeput) throw e;
      }
    }
    const credit: BeeldCredit = {
      bron: "Unsplash",
      maker: String(foto.user!.name),
      makerUrl: `${foto.user?.links?.html || "https://unsplash.com"}?${UTM}`,
      bronUrl: `https://unsplash.com/?${UTM}`,
    };
    return { url: lichteUrl(String(foto.urls!.regular)), credit };
  }

  const gebruikt = (b: BeeldInvoer, f: Foto) => Boolean(b.vermijd?.has(fotoSleutel(String(f.urls?.regular || ""))));
  async function gekozen(b: BeeldInvoer, f: Foto) {
    const r = await gebruik(f);
    b.vermijd?.add(fotoSleutel(r.url));
    return r;
  }

  return {
    naam: "unsplash",
    aanvragen: () => aanvragen,
    startRun() {
      aanvragen = 0;
      uitgeput = false;
      terugvalCache = new Map();
    },
    async genereer(b: BeeldInvoer) {
      if (!sleutel()) return null;
      try {
        const termen = schoneZoektermen([...(b.zoektermen || []), ...(b.zoekterm ? [b.zoekterm] : [])]).slice(0, MAX_ZOEKTERMEN);
        for (const term of termen) {
          const kandidaten = (await zoek(term)).filter((f) => !gebruikt(b, f));
          const keuze = await beoordeel(b, kandidaten);
          if (keuze && keuze.cijfer >= PASVORM_DREMPEL) return await gekozen(b, keuze.foto);
        }
        // Niets past: vaste, neutrale terugval per categorie (afwisselend op de kop).
        const lijst = TERUGVAL[b.categorie] || TERUGVAL.algemeen;
        let h = 0;
        for (const ch of b.kop) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        for (let i = 0; i < lijst.length; i++) {
          const foto = await haalFoto(lijst[(h + i) % lijst.length].id);
          if (foto && !gebruikt(b, foto)) return await gekozen(b, foto);
        }
        return null;
      } catch (e) {
        if (e instanceof LimietBereikt) return null;
        throw e;
      }
    },
  };
}

registreerGenerator(maakUnsplashGenerator());
