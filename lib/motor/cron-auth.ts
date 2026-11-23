import { timingSafeEqual } from "node:crypto";

/** Alleen met Authorization: Bearer <CRON_SECRET>. Zonder ingestelde CRON_SECRET is de route dicht. */
export function cronToegestaan(req: Request): boolean {
  const geheim = process.env.CRON_SECRET;
  if (!geheim) return false;
  const h = req.headers.get("authorization") || "";
  const verwacht = Buffer.from(`Bearer ${geheim}`);
  const ontvangen = Buffer.from(h);
  return ontvangen.length === verwacht.length && timingSafeEqual(ontvangen, verwacht);
}
