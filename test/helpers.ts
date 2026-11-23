import type { ModelClient } from "../lib/motor/ai";
import type { Bron, BronItem } from "../lib/motor/types";

export const bron = (o: Partial<Bron> = {}): Bron => ({
  id: "bron-a", naam: "Le Monde — À la une", feed: "https://voorbeeld.test/feed", domein: "voorbeeld.test", taal: "fr", land: "FR",
  groep: "fr_pers", regime: "pers", status: "ACTIVE", prioriteit: 1, frankrijkFilter: false, vensterUren: 48, ...o,
});

export const item = (o: Partial<BronItem> = {}): BronItem => ({
  url: "https://voorbeeld.test/a", bronId: "bron-a", bronNaam: "Le Monde — À la une", regime: "pers", groep: "fr_pers", taal: "fr", land: "FR",
  titel: "Prix du carburant: hausse de 5 centimes cette semaine", samenvatting: "Le litre de gazole grimpe de 5 centimes.",
  gepubliceerdOp: new Date().toISOString(), ...o,
});

export const klein = (antwoorden: (string | ((a: { system: string; user: string; model: string }) => string))[]): ModelClient & { aanroepen: { system: string; user: string; model: string }[] } => {
  const aanroepen: { system: string; user: string; model: string }[] = [];
  let n = 0;
  return {
    aanroepen,
    async tekst(a) {
      aanroepen.push({ system: a.system, user: a.user, model: a.model });
      const x = antwoorden[Math.min(n, antwoorden.length - 1)];
      n += 1;
      return typeof x === "function" ? x(a) : x;
    },
  };
};

export const rss = (items: { titel: string; url: string; datum: Date; omschrijving?: string }[]) =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${items
    .map((i) => `<item><title><![CDATA[${i.titel}]]></title><link>${i.url}?utm_source=x</link><pubDate>${i.datum.toUTCString()}</pubDate><description>${i.omschrijving || ""}</description></item>`)
    .join("")}</channel></rss>`;
