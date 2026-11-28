import MiniBeeld from "./MiniBeeld";
import { CATEGORIE_VOL, aantalBronnen } from "@/lib/site";
import { miniBeeldUrl } from "@/lib/redactie-vandaag";
import type { OpgeslagenBericht } from "@/lib/motor/opslag";

/** Eén rij in de lijst: mini-beeld, kop, categorie en aantal bronnen, en eventueel een extra regel (bijvoorbeeld waarom iets niet is geplaatst). */
export default function Rij({ b, extra }: { b: OpgeslagenBericht; extra?: string | null }) {
  return (
    <a className="rij" href={`/redactie/bericht/${b.id}`}>
      <span className="mini"><MiniBeeld url={miniBeeldUrl(b)} /></span>
      <span className="info">
        <span className="rij-kop">{b.kop}</span>
        <span className="meta">{CATEGORIE_VOL[b.categorie]} · {aantalBronnen(b.bronnen.length)}</span>
        {extra && <span className="meta reden">{extra}</span>}
      </span>
    </a>
  );
}
