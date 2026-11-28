// Meldingen van de redactie-app in gewone taal (28-11-2026, herstelronde 1). Technische redenen (tabel ontbreekt, HTTP 503) tonen we niet aan
// redacteurs; ze gaan naar het serverlog en de beheerder ziet ze ingeklapt onder "Technische details".
export const TIJDELIJK_MELDING = "Dit werkt tijdelijk niet. Anton is ingelicht.";

/** Schrijft de echte reden naar het serverlog (nooit naar de bezoeker). */
export function logReden(onderdeel: string, reden: unknown): void {
  const tekst = reden instanceof Error ? `${reden.name}: ${reden.message}` : String(reden);
  console.error(`[redactie] ${onderdeel}: ${tekst.slice(0, 300)}`);
}
