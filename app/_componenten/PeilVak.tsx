import type { Aankondiging } from "@/lib/peilvak";
import { PEIL_URL } from "@/lib/site";

const datum = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(`${iso}T12:00:00Z`)) : "Nog geen datum";

/** "Wat verandert er voor u": de eerstvolgende aangekondigde wijzigingen uit PEIL. Zonder gegevens geen vak. */
export default function PeilVak({ lijst, totaal }: { lijst: Aankondiging[]; totaal: number }) {
  if (!lijst.length) return null;
  return (
    <section className="peilvak" aria-labelledby="peilvak-kop">
      <div className="peilkop">
        <h2 id="peilvak-kop">Wat verandert er voor u</h2>
        <span>Aangekondigde wijzigingen in financiële parameters, uit <a href={PEIL_URL}>PEIL</a></span>
      </div>
      <ol>
        {lijst.map((a) => (
          <li key={a.id}>
            <time dateTime={a.datum || undefined}>{datum(a.datum)}</time>
            <div>
              <b>{a.naam}</b>
              <p>{a.omschrijving}{a.voorlopig && " Nog niet definitief."}</p>
              {a.tools.length > 0 && (
                <small>
                  Rekent mee in:{" "}
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
    </section>
  );
}
