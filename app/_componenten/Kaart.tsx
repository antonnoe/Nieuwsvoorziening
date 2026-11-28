import type { OpgeslagenBericht } from "@/lib/motor/opslag";
import { CATEGORIE_VOL, aantalBronnen, datumKort, leestijd, peilWeergave, veiligeUrl } from "@/lib/site";
import PeilRegel from "./PeilRegel";

const hoofdletter = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function Beeld({ b, klasse = "" }: { b: OpgeslagenBericht; klasse?: string }) {
  const url = b.beeldUrl ? veiligeUrl(b.beeldUrl) : null;
  return (
    <div className={`beeld ${klasse}`.trim()}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" loading="lazy" />}
      {url && b.beeldCredit?.bron === "Illustratie" && (
        <small className="credit illustratie">
          <span>{hoofdletter(b.beeldCredit.categorie || "")}{b.beeldCredit.naam ? ` · ${b.beeldCredit.naam}` : ""}</span>
          <span>Illustratie door {b.beeldCredit.maker || "Communities Abroad"}</span>
        </small>
      )}
      {url && b.beeldCredit && b.beeldCredit.bron !== "Illustratie" && (
        <small className="credit">
          Foto: <a href={veiligeUrl(b.beeldCredit.makerUrl || "") || undefined} rel="noopener">{b.beeldCredit.maker}</a> via{" "}
          <a href={veiligeUrl(b.beeldCredit.bronUrl || "") || undefined} rel="noopener">{b.beeldCredit.bron}</a>
        </small>
      )}
    </div>
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
