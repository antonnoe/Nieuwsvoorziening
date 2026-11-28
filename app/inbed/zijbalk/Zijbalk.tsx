import type { ZijbalkItem, ZijbalkPeilRegel } from "@/lib/inbed-zijbalk";
import { MEER_NIEUWS_URL, ZIJBALK_LEEG } from "@/lib/inbed-zijbalk";
import { PEIL_URL } from "@/lib/site";

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", ...o });
const kort = (iso: string) => (iso && !Number.isNaN(new Date(iso).getTime()) ? fmt({ day: "numeric", month: "short" }).format(new Date(iso)) : "");
const peilDatum = (r: ZijbalkPeilRegel) => (r.datum ? fmt({ day: "numeric", month: "short", year: "numeric" }).format(new Date(`${r.datum}T12:00:00Z`)) : "In discussie");

/** De zijbalk zelf, zonder gegevens ophalen. `peil` null of leeg: blok weggelaten. `items` null: opslag niet bereikbaar. */
export default function Zijbalk({ items, peil, bijgewerkt }: { items: ZijbalkItem[] | null; peil: ZijbalkPeilRegel[] | null; bijgewerkt: string | null }) {
  return (
    <>
      <header className="zb-kop">
        <h1>Nieuws over Frankrijk</h1>
        {bijgewerkt && <span className="ib-tijd">{bijgewerkt}</span>}
      </header>
      {peil && peil.length > 0 && (
        <section className="zb-peil" aria-label="Wat verandert er voor u">
          <h2>Wat verandert er voor u</h2>
          <ol>
            {peil.map((r) => (
              <li key={r.id}>
                <span className="zb-datum">{peilDatum(r)}</span>
                <b>{r.titel}</b>
                <span className="zb-zin">{r.zin}</span>
                {r.tool && <span className="zb-tool">Reken het uit met: {r.tool.url ? <a href={r.tool.url} target="_blank" rel="noopener">{r.tool.naam}</a> : r.tool.naam}</span>}
              </li>
            ))}
          </ol>
          <p className="zb-peilalles"><a href={PEIL_URL} target="_blank" rel="noopener">Alles in PEIL →</a></p>
        </section>
      )}
      {items === null ? (
        <p className="ib-leeg">Even niet beschikbaar.</p>
      ) : items.length === 0 ? (
        <p className="ib-leeg">{ZIJBALK_LEEG}</p>
      ) : (
        <ul className="zb-lijst">
          {items.map((i) => (
            <li key={i.id}>
              <a href={i.url} target="_blank" rel="noopener">
                <span className="zb-beeld">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {i.beeld && <img src={i.beeld} alt="" loading="lazy" />}
                </span>
                <span className="ib-tekst">
                  <b>{i.titel}</b>
                  <span className="ib-meta">{[kort(i.datum), i.label].filter(Boolean).join(" · ")}</span>
                  {i.chips.map((c) => <span key={c.soort} className={`zb-chip zb-${c.soort}`}>{c.tekst}</span>)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="zb-meer"><a href={MEER_NIEUWS_URL} target="_blank" rel="noopener">Meer nieuws over Frankrijk →</a></p>
    </>
  );
}
