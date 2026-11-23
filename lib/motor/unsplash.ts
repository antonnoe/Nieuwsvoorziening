// Controle van de Unsplash-sleutel (UNSPLASH_ACCESS_KEY). De sleutel verlaat de
// server nooit; de uitkomst wordt een uur bewaard zodat /api/status de limiet
// (50 aanvragen per uur in de demomodus) niet opmaakt.
export interface UnsplashStatus {
  sleutel: boolean;
  werkt: boolean | null;
  httpStatus?: number;
  resterendPerUur?: number | null;
  gecontroleerdOp?: string;
}

let bewaard: { tot: number; status: UnsplashStatus } | null = null;

export async function controleerUnsplash(nu = Date.now()): Promise<UnsplashStatus> {
  const sleutel = String(process.env.UNSPLASH_ACCESS_KEY || "").trim();
  if (!sleutel) return { sleutel: false, werkt: null };
  if (bewaard && bewaard.tot > nu) return bewaard.status;
  let status: UnsplashStatus;
  try {
    const r = await fetch("https://api.unsplash.com/photos?per_page=1", {
      headers: { Authorization: `Client-ID ${sleutel}`, "Accept-Version": "v1" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    const rest = r.headers.get("x-ratelimit-remaining");
    status = { sleutel: true, werkt: r.ok, httpStatus: r.status, resterendPerUur: rest === null ? null : Number(rest), gecontroleerdOp: new Date(nu).toISOString() };
  } catch {
    status = { sleutel: true, werkt: false, gecontroleerdOp: new Date(nu).toISOString() };
  }
  bewaard = { tot: nu + (status.werkt ? 3600_000 : 300_000), status };
  return status;
}
