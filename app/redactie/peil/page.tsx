import Melding from "../_componenten/Melding";
import Onderbalk from "../_componenten/Onderbalk";
import Terugvelden from "../_componenten/Terugvelden";
import { eisToegang, leesMelding } from "@/lib/redactie-pagina";
import { PEIL_KNOPPEN, PEIL_STORING, laadPeilVragen } from "@/lib/redactie-peil";

type SP = Promise<{ m?: string; ok?: string }>;

/** Alleen voor de beheerder: de open PEIL-vragen in gewone taal. Een antwoord verandert alleen de status van de vraag; PEIL zelf wordt nooit aangepast. */
export default async function PeilScherm({ searchParams }: { searchParams: SP }) {
  const { toegang, opslag } = await eisToegang({ beheerder: true });
  const melding = leesMelding(await searchParams);
  const vragen = opslag ? await laadPeilVragen(opslag) : null;
  return (
    <>
      <a className="terug" href="/redactie">‹ Terug naar de lijst</a>
      <h1>PEIL-vragen</h1>
      <p className="stil">Berichten waarin iets staat dat PEIL raakt. Uw antwoord verandert PEIL zelf niet.</p>
      <Melding melding={melding} />
      {vragen === null && <p className="melding fout">{PEIL_STORING}</p>}
      {vragen && vragen.length === 0 && <p className="stil">Er zijn nu geen open PEIL-vragen.</p>}
      {(vragen || []).map((v) => (
        <article key={v.id} className="tip">
          <h2>{v.titel}</h2>
          {v.verandert && <p>{v.verandert}</p>}
          {v.twijfel && <p className="stil">{v.twijfel}</p>}
          {v.citaat && <blockquote className="brontekst">{v.citaat}</blockquote>}
          <a className="rd-knop" href={`/redactie/bericht/${v.berichtId}`}>Bekijk het bericht{v.berichtKop ? `: ${v.berichtKop}` : ""}</a>
          {PEIL_KNOPPEN.map((k) => (
            <form key={k.keuze} method="post" action="/redactie/actie">
              <Terugvelden actie="peil" id={v.id} terug="/redactie/peil" extra={{ keuze: k.keuze }} />
              <button type="submit" className={`rd-knop${k.keuze === v.advies ? " hoofd" : ""}`}>{k.tekst}</button>
            </form>
          ))}
        </article>
      ))}
      <Onderbalk nu="overig" toegang={toegang} />
    </>
  );
}
