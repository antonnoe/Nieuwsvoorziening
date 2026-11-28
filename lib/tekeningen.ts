// Getekende beelden bewaren in Supabase Storage (bucket nv-tekeningen, publiek leesbaar). De bucket wordt door de migratie
// 20261128150000_nv_tekeningen.sql gemaakt; ontbreekt hij nog, dan maakt deze code hem bij het eerste gebruik zelf via de Storage-API
// met de service-role-sleutel (dezelfde sleutel als de rest van de opslag; nooit in de code of in antwoorden).
import { randomUUID } from "node:crypto";

export const TEKENING_BUCKET = "nv-tekeningen";
export const BUCKET_INSTELLINGEN = { id: TEKENING_BUCKET, name: TEKENING_BUCKET, public: true, file_size_limit: 61440, allowed_mime_types: ["image/svg+xml"] };

export interface StorageInstellingen {
  url: string;
  sleutel: string;
  fetchFn?: typeof fetch;
}

/** Leest SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY; null als een van beide ontbreekt. */
export function storageUitOmgeving(): StorageInstellingen | null {
  const url = process.env.SUPABASE_URL;
  const sleutel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && sleutel ? { url: url.replace(/\/+$/, ""), sleutel } : null;
}

export const publiekeUrl = (url: string, pad: string) => `${url.replace(/\/+$/, "")}/storage/v1/object/public/${TEKENING_BUCKET}/${pad}`;

/** Bewaart een (al gecontroleerde) SVG en geeft de publieke url. Gooit een Error zonder gevoelige gegevens bij een storing. */
export async function bewaarSvg(svg: string, s: StorageInstellingen, bestandsnaam = `${new Date().toISOString().slice(0, 10)}-${randomUUID()}.svg`): Promise<string> {
  const f = s.fetchFn ?? fetch;
  s = { ...s, url: s.url.replace(/\/+$/, "") };
  const kop = { apikey: s.sleutel, authorization: `Bearer ${s.sleutel}` };
  const upload = () => f(`${s.url}/storage/v1/object/${TEKENING_BUCKET}/${bestandsnaam}`, {
    method: "POST", signal: AbortSignal.timeout(20000), body: svg,
    headers: { ...kop, "content-type": "image/svg+xml", "x-upsert": "false", "cache-control": "max-age=31536000" },
  });
  let r = await upload();
  if (!r.ok && (r.status === 404 || r.status === 400)) {
    const tekst = await r.text().catch(() => "");
    if (/bucket not found/i.test(tekst)) {
      const maak = await f(`${s.url}/storage/v1/bucket`, { method: "POST", signal: AbortSignal.timeout(20000), headers: { ...kop, "content-type": "application/json" }, body: JSON.stringify(BUCKET_INSTELLINGEN) });
      if (!maak.ok && maak.status !== 409) throw new Error(`De opslag voor tekeningen kon niet worden aangemaakt (HTTP ${maak.status}).`);
      r = await upload();
    } else {
      throw new Error(`Tekening bewaren mislukt (HTTP ${r.status}).`);
    }
  }
  if (!r.ok) throw new Error(`Tekening bewaren mislukt (HTTP ${r.status}).`);
  return publiekeUrl(s.url, bestandsnaam);
}
