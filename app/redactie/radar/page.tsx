import Melding from "../_componenten/Melding";
import Onderbalk from "../_componenten/Onderbalk";
import Terugvelden from "../_componenten/Terugvelden";
import { eisToegang, leesMelding } from "@/lib/redactie-pagina";
import { veiligeUrl } from "@/lib/site";

type SP = Promise<{ m?: string; ok?: string }>;

const domeinVan = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Tips van de radar: onderwerpen die elders in het nieuws zijn en nog geen bericht hebben. De radar-url staat ALLEEN hier, achter de inlog. */
export default async function Radar({ searchParams }: { searchParams: SP }) {
  const { toegang, opslag } = await eisToegang();
  const melding = leesMelding(await searchParams);
  const tips = opslag ? await opslag.radarOpen(50).catch(() => null) : null;
  return (
    <>
      <a className="terug" href="/redactie">‹ Terug naar de lijst</a>
      <h1>Tips van de radar</h1>
      <p className="stil">Onderwerpen die elders in het nieuws zijn. Maak er een bericht van, of negeer de tip.</p>
      <Melding melding={melding} />
      {tips === null && <p className="melding fout">De tips konden niet worden gelezen.</p>}
      {tips && tips.length === 0 && <p className="stil">Er zijn nu geen open tips.</p>}
      {(tips || []).map((t) => {
        const bron = t.primaireBron?.[0];
        const signaal = veiligeUrl(t.signaalUrl);
        return (
          <article key={t.id} className="tip">
            <h2>{t.werktitel}</h2>
            <p className="brontekst">Gevonden via radar{signaal && <> · <a href={signaal} target="_blank" rel="noopener noreferrer">bekijk de link</a></>}</p>
            <p>{bron ? <>Primaire bron: <a href={veiligeUrl(bron.url) || undefined} target="_blank" rel="noopener noreferrer"><strong>{domeinVan(bron.url) || bron.naam}</strong></a></> : "Geen overheidsbron gevonden, zelf bron zoeken"}</p>
            <form method="post" action="/redactie/actie">
              <Terugvelden actie="radar" id={t.id} terug="/redactie/radar" extra={{ keuze: "geaccepteerd" }} />
              <button type="submit" className="rd-knop hoofd">Maak bericht</button>
            </form>
            <form method="post" action="/redactie/actie">
              <Terugvelden actie="radar" id={t.id} terug="/redactie/radar" extra={{ keuze: "afgewezen" }} />
              <button type="submit" className="rd-knop">Negeer</button>
            </form>
          </article>
        );
      })}
      <Onderbalk nu="overig" toegang={toegang} />
    </>
  );
}
