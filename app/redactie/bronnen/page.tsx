import Melding from "../_componenten/Melding";
import Onderbalk from "../_componenten/Onderbalk";
import Terugvelden from "../_componenten/Terugvelden";
import { BRON_SOORT_LABELS, BRON_SOORT_TEKST, bronKleur, bronSoortLabel, laadBronnenLijst, statusTekst } from "@/lib/motor/bronnenlijst";
import { logReden, TIJDELIJK_MELDING } from "@/lib/redactie-melding";
import { eisToegang, leesMelding } from "@/lib/redactie-pagina";
import { TZ } from "@/lib/site";

type SP = Promise<{ tab?: string; weg?: string; m?: string; ok?: string; adres?: string }>;

const moment = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "nog niet gelezen";

export default async function Bronnen({ searchParams }: { searchParams: SP }) {
  const { toegang, opslag } = await eisToegang();
  const sp = await searchParams;
  const melding = leesMelding(sp);
  const tab = sp.tab === "radar" ? "radar" : "nieuws";
  const lijst = await laadBronnenLijst(opslag);
  if (!lijst.uitTabel) logReden("bronnen scherm", lijst.terugvalReden);
  const beheerder = toegang.rol === "beheerder";
  const rijen = lijst.rijen.filter((r) => r.soort === tab);
  const pad = `/redactie/bronnen${tab === "radar" ? "?tab=radar" : ""}`;
  const nu = Date.now();
  return (
    <>
      <h1>Bronnen</h1>
      <nav className="tabs" aria-label="Soort bron">
        <a href="/redactie/bronnen" aria-current={tab === "nieuws" ? "page" : undefined}>Nieuwsbronnen</a>
        <a href="/redactie/bronnen?tab=radar" aria-current={tab === "radar" ? "page" : undefined}>Tipgevers</a>
      </nav>
      <p className="stil">
        {tab === "nieuws"
          ? "Hieruit schrijft de nieuwsmotor zijn berichten."
          : "Een tipgever wijst alleen een onderwerp aan. Van een tipgever nemen we nooit iets over en hij is nooit bron van een bericht."}
      </p>
      {/* Invoerblok bovenaan, de melding direct erboven: de uitkomst van een poging staat bij het veld. */}
      {lijst.uitTabel && (
        <section className="invoerblok" aria-label="Bron toevoegen">
          <Melding melding={melding} />
          <form className="veld" method="post" action="/redactie/actie">
            <Terugvelden actie="bron-toevoegen" terug={pad} extra={{ soort: tab }} />
            <div>
              <label htmlFor="adres">{tab === "radar" ? "Plak het adres van de tipgever" : "Plak het adres van de nieuwssite"}</label>
              <input id="adres" type="text" name="adres" inputMode="url" autoComplete="off" autoCapitalize="none" placeholder="bijvoorbeeld krant.nl" defaultValue={(sp.adres || "").slice(0, 300)} required />
            </div>
            <button type="submit" className="rd-knop hoofd">{tab === "radar" ? "Tipgever toevoegen" : "Nieuwsbron toevoegen"}</button>
            <p className="stil">Wordt eerst getest, pas daarna in gebruik.{tab === "radar" ? " Voor een tipgever mag het ook een nieuwssitemap zijn." : ""}</p>
          </form>
        </section>
      )}
      {!lijst.uitTabel && (
        <>
          <Melding melding={melding} />
          <p className="melding fout">{TIJDELIJK_MELDING} U kunt de lijst nu alleen bekijken.</p>
          {beheerder && <details className="techniek"><summary>Technische details</summary><p>{lijst.terugvalReden}. Dit is de lijst uit het bestand data/bronnen.json.</p></details>}
        </>
      )}
      {rijen.length === 0 && <p className="stil">Nog geen bronnen op dit tabblad.</p>}
      {rijen.map((r) => {
        const kleur = bronKleur(r, nu);
        const bevestig = sp.weg === r.id;
        const anker = `bron-${r.id}`;
        return (
          <article key={r.id} id={anker} className="bron">
            <span className="naam">{r.naam}</span>
            <span className="regel">
              <span><span className={`stip ${kleur}`} aria-hidden="true" />{statusTekst(r, kleur)}</span>
              {tab === "nieuws" && <span>{BRON_SOORT_TEKST[bronSoortLabel(r)]}</span>}
              <span>Gelezen: {moment(r.laatstGelezen)}</span>
            </span>
            {beheerder && r.laatsteFout && <details className="techniek"><summary>Technische details</summary><p className="fout-tekst">Laatste fout: {r.laatsteFout}</p></details>}
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
                          {BRON_SOORT_LABELS.map((s) => <option key={s} value={s}>{BRON_SOORT_TEKST[s]}</option>)}
                        </select>
                      </div>
                    )}
                    <button type="submit" className="rd-knop hoofd">Bewaren</button>
                  </form>
                </details>
                {bevestig ? (
                  <div className="bevestig" role="alert">
                    <p><strong>Zeker {r.naam} weghalen?</strong></p>
                    <div className="acties">
                      <form method="post" action="/redactie/actie">
                        <Terugvelden actie="bron-weg" id={r.id} terug={pad} />
                        <button type="submit" className="rd-knop gevaar">Ja, weghalen</button>
                      </form>
                      <a className="rd-knop" href={`${pad}#${anker}`}>Nee, laten staan</a>
                    </div>
                  </div>
                ) : (
                  <a className="rd-knop zacht" href={`/redactie/bronnen?${tab === "radar" ? "tab=radar&" : ""}weg=${encodeURIComponent(r.id)}#${anker}`} aria-label={`Haal ${r.naam} weg`}>Prullenbak</a>
                )}
              </>
            )}
          </article>
        );
      })}
      <Onderbalk nu="bronnen" toegang={toegang} />
    </>
  );
}
