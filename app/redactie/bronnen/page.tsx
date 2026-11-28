import Melding from "../_componenten/Melding";
import Onderbalk from "../_componenten/Onderbalk";
import Terugvelden from "../_componenten/Terugvelden";
import { BRON_SOORT_LABELS, bronKleur, bronSoortLabel, laadBronnenLijst } from "@/lib/motor/bronnenlijst";
import { eisToegang, leesMelding } from "@/lib/redactie-pagina";
import { TZ } from "@/lib/site";

type SP = Promise<{ tab?: string; weg?: string; m?: string; ok?: string }>;

const KLEUR_TEKST = { groen: "Leest goed", rood: "Geen nieuws of een fout", grijs: "Nog niet in gebruik of net toegevoegd" } as const;
const moment = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "nog niet gelezen";

export default async function Bronnen({ searchParams }: { searchParams: SP }) {
  const { toegang, opslag } = await eisToegang();
  const sp = await searchParams;
  const melding = leesMelding(sp);
  const tab = sp.tab === "radar" ? "radar" : "nieuws";
  const lijst = await laadBronnenLijst(opslag);
  const rijen = lijst.rijen.filter((r) => r.soort === tab);
  const pad = `/redactie/bronnen${tab === "radar" ? "?tab=radar" : ""}`;
  const nu = Date.now();
  return (
    <>
      <h1>Bronnen</h1>
      <nav className="tabs" aria-label="Soort bron">
        <a href="/redactie/bronnen" aria-current={tab === "nieuws" ? "page" : undefined}>Nieuwsbronnen</a>
        <a href="/redactie/bronnen?tab=radar" aria-current={tab === "radar" ? "page" : undefined}>Radar</a>
      </nav>
      <p className="stil">
        {tab === "nieuws"
          ? "Hieruit schrijft de nieuwsmotor zijn berichten."
          : "De radar geeft alleen onderwerpen aan. Van een radarbron wordt nooit iets overgenomen en hij is nooit bron van een bericht."}
      </p>
      <Melding melding={melding} />
      {!lijst.uitTabel && <p className="melding fout">Alleen kijken: de database is nog niet bijgewerkt voor bronnen ({lijst.terugvalReden}). Dit is de lijst uit het bestand; aanpassen kan later.</p>}
      {rijen.length === 0 && <p className="stil">Nog geen bronnen op dit tabblad.</p>}
      {rijen.map((r) => {
        const kleur = bronKleur(r, nu);
        const bevestig = sp.weg === r.id;
        return (
          <article key={r.id} className="bron">
            <span className="naam">{r.naam}</span>
            <span className="regel">
              <span><span className={`stip ${kleur}`} aria-hidden="true" />{KLEUR_TEKST[kleur]}</span>
              {tab === "nieuws" && <span>{bronSoortLabel(r)}</span>}
              <span>Gelezen: {moment(r.laatstGelezen)}</span>
            </span>
            {r.laatsteFout && <span className="fout-tekst">Laatste fout: {r.laatsteFout}</span>}
            {lijst.uitTabel && (
              <>
                <details>
                  <summary>Aanpassen</summary>
                  <form className="veld" method="post" action="/redactie/actie">
                    <Terugvelden actie="bron-wijzig" id={r.id} terug={pad} />
                    <div>
                      <label htmlFor={`naam-${r.id}`}>Naam</label>
                      <input id={`naam-${r.id}`} type="text" name="naam" defaultValue={r.naam} maxLength={80} required />
                    </div>
                    {tab === "nieuws" && (
                      <div>
                        <label htmlFor={`soort-${r.id}`}>Soort</label>
                        <select id={`soort-${r.id}`} name="soort" defaultValue={bronSoortLabel(r)}>
                          {BRON_SOORT_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    )}
                    <button type="submit" className="rd-knop hoofd">Bewaren</button>
                  </form>
                </details>
                {bevestig ? (
                  <div className="acties">
                    <form method="post" action="/redactie/actie">
                      <Terugvelden actie="bron-weg" id={r.id} terug={pad} />
                      <button type="submit" className="rd-knop gevaar">Zeker weghalen?</button>
                    </form>
                    <a className="rd-knop" href={pad}>Nee, laten staan</a>
                  </div>
                ) : (
                  <a className="rd-knop zacht" href={`/redactie/bronnen?${tab === "radar" ? "tab=radar&" : ""}weg=${encodeURIComponent(r.id)}`} aria-label={`Haal ${r.naam} weg`}>Prullenbak</a>
                )}
              </>
            )}
          </article>
        );
      })}
      {lijst.uitTabel && (
        <form className="veld" method="post" action="/redactie/actie">
          <Terugvelden actie="bron-toevoegen" terug={pad} extra={{ soort: tab }} />
          <div>
            <label htmlFor="adres">Plak adres van site of feed</label>
            <input id="adres" type="text" name="adres" inputMode="url" autoComplete="off" autoCapitalize="none" placeholder="bijvoorbeeld krant.nl" required />
          </div>
          <button type="submit" className="rd-knop hoofd">Bron toevoegen</button>
          <p className="stil">Wordt eerst getest, pas daarna actief.{tab === "radar" ? " Voor de radar mag het ook een nieuwssitemap zijn." : ""}</p>
        </form>
      )}
      <Onderbalk nu="bronnen" toegang={toegang} />
    </>
  );
}
