import type { OpgeslagenBericht } from "./opslag";

const x = (t: string) => String(t || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string);

/** RSS 2.0. De link wijst naar de publieke pagina (basis via NIEUWS_BASIS_URL); de GUID is het bericht-id. */
export function bouwRss(berichten: OpgeslagenBericht[], opt: { basis: string; titel: string; zelfUrl: string }): string {
  const basis = opt.basis.replace(/\/+$/, "");
  const items = berichten
    .map(
      (b) => `    <item>
      <title>${x(b.kop)}</title>
      <link>${x(`${basis}/bericht/${b.id}`)}</link>
      <guid isPermaLink="false">${x(String(b.id))}</guid>
      <pubDate>${new Date(b.gepubliceerdOp).toUTCString()}</pubDate>
      <category>${x(b.categorie)}</category>
      <description>${x(b.samenvatting)}</description>
    </item>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${x(opt.titel)}</title>
    <link>${x(basis)}</link>
    <description>Nederlandstalig nieuws over Frankrijk voor Nederlanders en Belgen.</description>
    <language>nl</language>
    <atom:link href="${x(opt.zelfUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
}
