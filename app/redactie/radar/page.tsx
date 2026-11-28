import BezigFormulier from "../_componenten/BezigFormulier";
import Melding from "../_componenten/Melding";
import Onderbalk from "../_componenten/Onderbalk";
import Terugvelden from "../_componenten/Terugvelden";
import { laadBronnenLijst } from "@/lib/motor/bronnenlijst";
import { kaleHost } from "@/lib/motor/config";
import { eisToegang, leesMelding } from "@/lib/redactie-pagina";
import { toonLinkVeld } from "@/lib/redactie-maak-bericht";
import { TIJDELIJK_MELDING } from "@/lib/redactie-melding";
import { veiligeUrl } from "@/lib/site";

type SP = Promise<{ m?: string; ok?: string; tip?: string; link?: string }>;

const domeinVan = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Tips: onderwerpen die andere sites brengen en die wij nog niet hebben. De url van de tipgever staat ALLEEN hier, achter de inlog. */
export default async function Radar({ searchParams }: { searchParams: SP }) {
  const { toegang, opslag } = await eisToegang();
  const sp = await searchParams;
  const melding = leesMelding(sp);
  const tips = opslag ? await opslag.radarOpen(50).catch(() => null) : null;
  // De naam van de tipgever (uit de lijst met bronnen, soort tipgever), anders het domein.
  const lijst = await laadBronnenLijst(opslag);
  const tipgevers = lijst.rijen.filter((r) => r.soort === "radar");
  const tipgeverNaam = (signaalUrl: string) => {
    const host = kaleHost(signaalUrl);
    const r = tipgevers.find((x) => { const d = kaleHost(x.domein || x.feed); return d === host || host.endsWith(`.${d}`); });
    return (r?.naam || host || "een tipgever").replace(/\s*\(radar\)\s*$/i, "");
  };
  return (
    <>
      <a className="terug" href="/redactie">‹ Terug naar de lijst</a>
      <h1>Tips</h1>
      <p className="stil">Onderwerpen die andere sites brengen en die wij nog niet hebben. Maak er een bericht van, of leg de tip weg.</p>
      {!sp.tip && <Melding melding={melding} />}
      {tips === null && <p className="melding fout">{TIJDELIJK_MELDING}</p>}
      {tips && tips.length === 0 && <p className="stil">Er zijn nu geen open tips.</p>}
      {(tips || []).map((t) => {
        const bronnen = (t.primaireBron || []).filter((b) => veiligeUrl(b.url));
        const signaal = veiligeUrl(t.signaalUrl);
        const hier = sp.tip === t.id;
        return (
          <article key={t.id} className="tip">
            <h2>{t.werktitel}</h2>
            <p className="brontekst">Tip van {tipgeverNaam(t.signaalUrl)}</p>
            {signaal && <a className="rd-knop" href={signaal} target="_blank" rel="noopener noreferrer">Bekijk de tip</a>}
            {hier && <Melding melding={melding} />}
            {t.berichtId ? (
              <>
                <p>Dit onderwerp staat al in het nieuws.</p>
                <a className="rd-knop hoofd" href={`/redactie/bericht/${t.berichtId}`}>Bekijk het bericht</a>
              </>
            ) : bronnen.length > 0 ? (
              <>
                <p>Overheidsbron: <strong>{bronnen.map((b) => domeinVan(b.url) || b.naam).filter((d, n, a) => a.indexOf(d) === n).join(", ")}</strong></p>
                {bronnen.slice(0, 3).map((b) => <a key={b.url} className="rd-knop" href={veiligeUrl(b.url) || undefined} target="_blank" rel="noopener noreferrer">Bekijk de overheidsbron{bronnen.length > 1 ? ` (${domeinVan(b.url) || b.naam})` : ""}</a>)}
                <BezigFormulier actie="/redactie/actie" knop="Maak bericht" bezigTekst="Bezig, dit duurt een minuut…">
                  <Terugvelden actie="maak-bericht" id={t.id} terug="/redactie/radar" extra={{ tip: t.id }} />
                  {toonLinkVeld(bronnen.length, hier, melding?.tekst, sp.link) && (
                    <>
                      <p>Deze overheidsbron kon niet worden gelezen. Plak de link van een andere overheidspagina over hetzelfde onderwerp.</p>
                      <label htmlFor={`link-${t.id}`}>Plak de link van een overheidspagina</label>
                      <input id={`link-${t.id}`} type="text" name="link" inputMode="url" autoComplete="off" autoCapitalize="none" placeholder="bijvoorbeeld service-public.fr/…" defaultValue={sp.link || ""} required />
                    </>
                  )}
                </BezigFormulier>
              </>
            ) : (
              <BezigFormulier actie="/redactie/actie" knop="Maak bericht" bezigTekst="Bezig, dit duurt een minuut…">
                <Terugvelden actie="maak-bericht" id={t.id} terug="/redactie/radar" extra={{ tip: t.id }} />
                <p>Er is bij deze tip nog geen overheidsbron gevonden.</p>
                <label htmlFor={`link-${t.id}`}>Plak de link van een overheidspagina</label>
                <input id={`link-${t.id}`} type="text" name="link" inputMode="url" autoComplete="off" autoCapitalize="none" placeholder="bijvoorbeeld service-public.fr/…" defaultValue={hier ? sp.link || "" : ""} required />
              </BezigFormulier>
            )}
            <form method="post" action="/redactie/actie">
              <Terugvelden actie="radar" id={t.id} terug="/redactie/radar" extra={{ keuze: "afgewezen" }} />
              <button type="submit" className="rd-knop">Negeer</button>
            </form>
          </article>
        );
      })}
      <Onderbalk nu="tips" toegang={toegang} />
    </>
  );
}
