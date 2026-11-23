/** Begin van de huidige dag in Europe/Amsterdam, als ISO-tijd (UTC). */
export function dagStart(nu = Date.now(), tz = "Europe/Amsterdam"): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p: Record<string, number> = {};
  for (const d of f.formatToParts(new Date(nu))) if (d.type !== "literal") p[d.type] = Number(d.value);
  const lokaalAlsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offset = lokaalAlsUtc - Math.floor(nu / 1000) * 1000;
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - offset).toISOString();
}
