import type { OpgeslagenBericht } from "@/lib/motor/opslag";
import { CATEGORIE_VOL, aantalBronnen, datumKort, leestijd, onderschrift, peilWeergave, veiligeUrl } from "@/lib/site";
import PeilRegel from "./PeilRegel";

export function Beeld({ b, klasse = "" }: { b: OpgeslagenBericht; klasse?: string }) {
  const url = b.beeldUrl ? veiligeUrl(b.beeldUrl) : null;
  const os = url ? onderschrift(b.beeldCredit) : null;
  const illustratie = os?.soort === "illustratie";
  return (
    <figure className="beeldblok">
      <div className={`beeld ${illustratie ? "illu " : ""}${klasse}`.trim()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url && <img src={url} alt="" loading="lazy" />}
      </div>
      {os?.soort === "illustratie" && <figcaption className="credit">{os.tekst}</figcaption>}
      {os?.soort === "foto" && b.beeldCredit && (
        <figcaption className="credit">
          Foto: <a href={veiligeUrl(b.beeldCredit.makerUrl || "") || undefined} rel="noopener">{os.maker}</a> via{" "}
          <a href={veiligeUrl(b.beeldCredit.bronUrl || "") || undefined} rel="noopener">{os.bron}</a>
        </figcaption>
      )}
    </figure>
  );
}

/** Kaart op de voorpagina (`groot` = hoofdbericht) of, compact, onder "Verder lezen". */
export default function Kaart({ b, groot = false, compact = false }: { b: OpgeslagenBericht; groot?: boolean; compact?: boolean }) {
  const Kop = groot ? "h2" : "h3";
  const voet = (
    <div className="voet">
      <span className="bron">{aantalBronnen(b.bronnen.length)}</span>
      <span className="ok">{groot ? `Gecontroleerd ${datumKort(b.gepubliceerdOp)}` : "Gecontroleerd"}</span>
    </div>
  );
  const kop = <Kop><a href={`/bericht/${b.id}`}>{b.kop}</a></Kop>;
  const meta = (
    <span className="meta"><time dateTime={b.gepubliceerdOp}>{datumKort(b.gepubliceerdOp)}</time> · {leestijd(b)} min leestijd</span>
  );
  return (
    <article className={groot ? "hoofd" : "kaart"}>
      <Beeld b={b} />
      <div className="tekst">
        <span className="rubriek">{CATEGORIE_VOL[b.categorie]}</span>
        {kop}
        {meta}
        {!compact && (groot ? <p className="intro">{b.samenvatting}</p> : <p>{b.samenvatting}</p>)}
        {!compact && <PeilRegel peil={peilWeergave(b)} />}
        <span className="leesmeer" aria-hidden="true">Lees meer …</span>
        {voet}
      </div>
    </article>
  );
}
