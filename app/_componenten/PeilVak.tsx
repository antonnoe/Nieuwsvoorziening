import type { Aankondiging } from "@/lib/peilvak";
import { PEIL_URL } from "@/lib/site";

const datum = (a: Aankondiging) =>
  a.datum ? new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(`${a.datum}T12:00:00Z`)) : a.inDiscussie ? "In discussie" : "Nog geen datum";

/** "Wat verandert er voor u": de eerstvolgende aangekondigde wijzigingen uit PEIL. Zonder gegevens geen vak. */
export default function PeilVak({ lijst, totaal }: { lijst: Aankondiging[]; totaal: number }) {
  if (!lijst.length) return null;
  return (
    <details className="peilvak">
      <summary>
        <span className="pk">Wat verandert er voor u</span>
        <span className="pa">· {lijst.length} aangekondigde {lijst.length === 1 ? "wijziging" : "wijzigingen"} in belastingen, uitkeringen en kosten</span>
        <span className="pijl" aria-hidden="true" />
      </summary>
      <p className="peiluitleg">Wat er de komende tijd verandert in belastingen, uitkeringen en kosten, bijgehouden in <a href={PEIL_URL}>PEIL</a></p>
      <ol>
        {lijst.map((a) => (
          <li key={a.id}>
            <time dateTime={a.datum || undefined}>{datum(a)}</time>
            <div>
              <b>{a.naam}</b>
              <p>{a.omschrijving}{a.voorlopig && !a.inDiscussie && " Nog niet definitief."}</p>
              {a.nieuws.length > 0 && (
                <small className="nieuws">
                  In het nieuws:{" "}
                  {a.nieuws.map((n, i) => (
                    <span key={n.id}>{i > 0 && " · "}<a href={`/bericht/${n.id}`}>{n.kop}</a></span>
                  ))}
                </small>
              )}
              {a.tools.length > 0 && (
                <small>
                  Reken het uit met:{" "}
                  {a.tools.map((t, i) => (
                    <span key={t.naam}>{i > 0 && ", "}{t.url ? <a href={t.url}>{t.naam}</a> : t.naam}</span>
                  ))}
                </small>
              )}
            </div>
          </li>
        ))}
      </ol>
      <a className="pil" href={PEIL_URL}>Alle aangekondigde wijzigingen ({totaal}) in PEIL</a>
    </details>
  );
}
