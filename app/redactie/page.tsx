import Melding from "./_componenten/Melding";
import Onderbalk from "./_componenten/Onderbalk";
import Rij from "./_componenten/Rij";
import { eisToegang, leesMelding } from "@/lib/redactie-pagina";
import { TIJDELIJK_MELDING } from "@/lib/redactie-melding";
import { redenTekst } from "@/lib/redactie";
import { UITLEG_NIET_GEPLAATST, VANDAAG_DAGEN, verdeelVandaag } from "@/lib/redactie-vandaag";

type SP = Promise<{ m?: string; ok?: string }>;

export default async function Vandaag({ searchParams }: { searchParams: SP }) {
  const { toegang, opslag } = await eisToegang();
  const melding = leesMelding(await searchParams);
  if (!opslag) return <p className="melding fout">{TIJDELIJK_MELDING}</p>;
  const lijst = await opslag.berichtenVoorRedactie(new Date(Date.now() - VANDAAG_DAGEN * 86400_000).toISOString(), 500).catch(() => null);
  const tips = (await opslag.radarOpen(50).catch(() => [])).length;
  const { live, nietGeplaatst, weg } = verdeelVandaag(lijst || []);
  return (
    <>
      <Melding melding={melding} />
      <div className="kopregel">
        <h1>Nieuws vandaag</h1>
        {lijst && <span className="teller">{live.length} live</span>}
      </div>
      <p className="stil">Alles staat al live. Haal weg wat niet deugt.</p>
      {!lijst && <p className="melding fout">De berichten konden niet worden gelezen. Probeer het zo opnieuw.</p>}
      {lijst && live.length === 0 && <p className="stil">De laatste twee dagen staat er nog niets live.</p>}
      <div className="lijst">{live.map((b) => <Rij key={b.id} b={b} />)}</div>
      {tips > 0 && (
        <a className="tips" href="/redactie/radar">
          <span>{tips === 1 ? "1 tip om te bekijken" : `${tips} tips om te bekijken`}</span>
          <span aria-hidden="true">›</span>
        </a>
      )}
      {nietGeplaatst.length > 0 && (
        <details className="weggehaald nietgeplaatst">
          <summary>Niet geplaatst door de machine ({nietGeplaatst.length})</summary>
          <p className="stil">{UITLEG_NIET_GEPLAATST}</p>
          <div className="lijst">{nietGeplaatst.map((b) => <Rij key={b.id} b={b} extra={redenTekst(b)} plaatsKnop />)}</div>
        </details>
      )}
      {weg.length > 0 && (
        <details className="weggehaald">
          <summary>Weggehaald ({weg.length})</summary>
          <div className="lijst">{weg.map((b) => <Rij key={b.id} b={b} />)}</div>
        </details>
      )}
      <Onderbalk nu="nieuws" toegang={toegang} />
    </>
  );
}
