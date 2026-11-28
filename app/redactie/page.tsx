import Melding from "./_componenten/Melding";
import Onderbalk from "./_componenten/Onderbalk";
import { CATEGORIE_VOL, aantalBronnen, veiligeUrl } from "@/lib/site";
import { eisToegang, leesMelding } from "@/lib/redactie-pagina";
import { TIJDELIJK_MELDING } from "@/lib/redactie-melding";
import type { OpgeslagenBericht } from "@/lib/motor/opslag";

type SP = Promise<{ m?: string; ok?: string }>;

const DAGEN = 2;

function Rij({ b }: { b: OpgeslagenBericht }) {
  const beeld = b.beeldUrl ? veiligeUrl(b.beeldUrl) : null;
  return (
    <a className="rij" href={`/redactie/bericht/${b.id}`}>
      <span className="mini">
        {beeld ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={beeld} alt="" loading="lazy" /> : <span className="geenbeeld">geen beeld</span>}
      </span>
      <span className="info">
        <span className="rij-kop">{b.kop}</span>
        <span className="meta">
          {CATEGORIE_VOL[b.categorie]} · {aantalBronnen(b.bronnen.length)}
          {b.redactie === "weg" ? <span className="label weg">weg</span> : b.status !== "gepubliceerd" ? <span className="label">concept</span> : null}
        </span>
      </span>
    </a>
  );
}

export default async function Vandaag({ searchParams }: { searchParams: SP }) {
  const { toegang, opslag } = await eisToegang();
  const melding = leesMelding(await searchParams);
  if (!opslag) return <p className="melding fout">{TIJDELIJK_MELDING}</p>;
  const lijst = await opslag.berichtenVoorRedactie(new Date(Date.now() - DAGEN * 86400_000).toISOString(), 500).catch(() => null);
  const tips = (await opslag.radarOpen(50).catch(() => [])).length;
  const live = lijst ? lijst.filter((b) => b.status === "gepubliceerd" && b.redactie !== "weg").length : 0;
  const staat = (lijst || []).filter((b) => b.redactie !== "weg");
  const weg = (lijst || []).filter((b) => b.redactie === "weg");
  return (
    <>
      <div className="kopregel">
        <h1>Nieuws vandaag</h1>
        {lijst && <span className="teller">{live} live</span>}
      </div>
      <Melding melding={melding} />
      <p className="stil">Alles staat al live. Haal weg wat niet deugt.</p>
      {!lijst && <p className="melding fout">De berichten konden niet worden gelezen. Probeer het zo opnieuw.</p>}
      {lijst && staat.length === 0 && <p className="stil">De laatste twee dagen is er nog niets.</p>}
      <div className="lijst">{staat.map((b) => <Rij key={b.id} b={b} />)}</div>
      {weg.length > 0 && (
        <details className="weggehaald">
          <summary>Weggehaald ({weg.length})</summary>
          <div className="lijst">{weg.map((b) => <Rij key={b.id} b={b} />)}</div>
        </details>
      )}
      {tips > 0 && (
        <a className="tips" href="/redactie/radar">
          <span>{tips === 1 ? "1 tip om te bekijken" : `${tips} tips om te bekijken`}</span>
          <span aria-hidden="true">›</span>
        </a>
      )}
      <Onderbalk nu="nieuws" toegang={toegang} />
    </>
  );
}
