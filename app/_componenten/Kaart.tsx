import type { OpgeslagenBericht } from "@/lib/motor/opslag";
import { CATEGORIE_VOL, aantalBronnen, datumKort, leestijd, peilWeergave, veiligeUrl } from "@/lib/site";
import PeilRegel from "./PeilRegel";

export function Beeld({ b }: { b: OpgeslagenBericht }) {
  const url = b.beeldUrl ? veiligeUrl(b.beeldUrl) : null;
  return (
    <div className="beeldvlak">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt={b.kop} loading="lazy" />}
    </div>
  );
}

export default function Kaart({ b, groot = false }: { b: OpgeslagenBericht; groot?: boolean }) {
  const Kop = groot ? "h2" : "h3";
  return (
    <article className={groot ? "kaart uitgelicht" : "kaart"}>
      <Beeld b={b} />
      <div className="kaart-tekst">
        <p className="eyebrow">{CATEGORIE_VOL[b.categorie]}</p>
        <Kop className="kaart-kop">
          <a href={`/bericht/${b.id}`}>{b.kop}</a>
        </Kop>
        <p className="meta">
          <time dateTime={b.gepubliceerdOp}>{datumKort(b.gepubliceerdOp)}</time> · {leestijd(b)} min leestijd
        </p>
        <p className="samenvatting">{b.samenvatting}</p>
        <PeilRegel peil={peilWeergave(b)} />
        <div className="kaart-voet">
          <strong className="bronnen">{aantalBronnen(b.bronnen.length)}</strong>
          <span className="gecontroleerd"><span aria-hidden="true">✓</span> Gecontroleerd</span>
        </div>
      </div>
    </article>
  );
}
