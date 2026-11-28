import Melding from "./_componenten/Melding";
import Onderbalk from "./_componenten/Onderbalk";
import Rij from "./_componenten/Rij";
import KortRij from "./_componenten/KortRij";
import { eisToegang, leesMelding } from "@/lib/redactie-pagina";
import { TIJDELIJK_MELDING } from "@/lib/redactie-melding";
import { laadPeilVragen } from "@/lib/redactie-peil";
import { redenTekst } from "@/lib/redactie";
import { UITLEG_VOORSTELLEN, VANDAAG_DAGEN, verdeelVandaag } from "@/lib/redactie-vandaag";

type SP = Promise<{ m?: string; ok?: string }>;

export default async function Vandaag({ searchParams }: { searchParams: SP }) {
  const { toegang, opslag } = await eisToegang();
  const melding = leesMelding(await searchParams);
  if (!opslag) return <p className="melding fout">{TIJDELIJK_MELDING}</p>;
  const lijst = await opslag.berichtenVoorRedactie(new Date(Date.now() - VANDAAG_DAGEN * 86400_000).toISOString(), 500).catch(() => null);
  const tips = (await opslag.radarOpen(50).catch(() => [])).length;
  const peilVragen = toegang.rol === "beheerder" ? ((await laadPeilVragen(opslag)) || []).length : 0;
  const korten = await opslag.overheidKortLijst({ limiet: 100, sindsIso: new Date(Date.now() - VANDAAG_DAGEN * 86400_000).toISOString(), metWeg: true }).catch(() => []);
  const kortenLive = korten.filter((k) => k.redactie !== "weg");
  const { live, voorstellen, tegengehouden, weg } = verdeelVandaag(lijst || []);
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
      {voorstellen.length > 0 && (
        <section className="voorstellen">
          <h2>Voorstellen ({voorstellen.length})</h2>
          <p className="stil">{UITLEG_VOORSTELLEN}</p>
          <div className="lijst">{voorstellen.map((b) => <Rij key={b.id} b={b} plaatsKnop />)}</div>
        </section>
      )}
      {korten.length > 0 && (
        <details className="weggehaald overheidkort">
          <summary>Overheidsberichtjes vandaag ({kortenLive.length})</summary>
          <p className="stil">Korte berichtjes van overheidssites. Ze staan al live op het tabblad Overheid. Haal weg wat niet deugt.</p>
          <div className="lijst">{korten.map((k) => <KortRij key={k.id} k={k} />)}</div>
        </details>
      )}
      {tips > 0 && (
        <a className="tips" href="/redactie/radar">
          <span>{tips === 1 ? "1 tip om te bekijken" : `${tips} tips om te bekijken`}</span>
          <span aria-hidden="true">›</span>
        </a>
      )}
      {peilVragen > 0 && (
        <a className="tips" href="/redactie/peil">
          <span>{peilVragen === 1 ? "1 PEIL-vraag" : `${peilVragen} PEIL-vragen`}</span>
          <span aria-hidden="true">›</span>
        </a>
      )}
      {toegang.rol === "beheerder" && tegengehouden.length > 0 && (
        <details className="weggehaald nietgeplaatst">
          <summary>Tegengehouden door de controle ({tegengehouden.length})</summary>
          <div className="lijst">{tegengehouden.map((b) => <Rij key={b.id} b={b} extra={redenTekst(b)} />)}</div>
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
