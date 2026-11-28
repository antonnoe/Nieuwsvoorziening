import Melding from "./_componenten/Melding";
import Onderbalk from "./_componenten/Onderbalk";
import { CATEGORIE_VOL, aantalBronnen, veiligeUrl } from "@/lib/site";
import { eisToegang, leesMelding } from "@/lib/redactie-pagina";

type SP = Promise<{ m?: string; ok?: string }>;

const DAGEN = 2;

export default async function Vandaag({ searchParams }: { searchParams: SP }) {
  const { toegang, opslag } = await eisToegang();
  const melding = leesMelding(await searchParams);
  if (!opslag) return <p className="melding fout">De opslag is niet beschikbaar.</p>;
  const lijst = await opslag.berichtenVoorRedactie(new Date(Date.now() - DAGEN * 86400_000).toISOString(), 500).catch(() => null);
  const tips = (await opslag.radarOpen(50).catch(() => [])).length;
  const live = lijst ? lijst.filter((b) => b.status === "gepubliceerd" && b.redactie !== "weg").length : 0;
  return (
    <>
      <div className="kopregel">
        <h1>Nieuws vandaag</h1>
        {lijst && <span className="teller">{live} live</span>}
      </div>
      <p className="stil">Alles staat al live. Haal weg wat niet deugt.</p>
      <Melding melding={melding} />
      {!lijst && <p className="melding fout">De berichten konden niet worden gelezen. Probeer het zo opnieuw.</p>}
      {lijst && lijst.length === 0 && <p className="stil">De laatste twee dagen is er nog niets.</p>}
      <div className="lijst">
        {(lijst || []).map((b) => {
          const beeld = b.beeldUrl ? veiligeUrl(b.beeldUrl) : null;
          return (
            <a key={b.id} className="rij" href={`/redactie/bericht/${b.id}`}>
              <span className="mini">{/* eslint-disable-next-line @next/next/no-img-element */}{beeld && <img src={beeld} alt="" loading="lazy" />}</span>
              <span className="info">
                <span className="kop">{b.kop}</span>
                <span className="meta">
                  {CATEGORIE_VOL[b.categorie]} · {aantalBronnen(b.bronnen.length)}
                  {b.redactie === "weg" ? <span className="label weg">weg</span> : b.status !== "gepubliceerd" ? <span className="label">concept</span> : null}
                </span>
              </span>
            </a>
          );
        })}
      </div>
      {tips > 0 && (
        <a className="tips" href="/redactie/radar">
          <span>{tips === 1 ? "1 tip van de radar" : `${tips} tips van de radar`}</span>
          <span aria-hidden="true">›</span>
        </a>
      )}
      <Onderbalk nu="nieuws" toegang={toegang} />
    </>
  );
}
