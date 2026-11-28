import MiniBeeld from "./MiniBeeld";
import { CATEGORIE_VOL, aantalBronnen } from "@/lib/site";
import Terugvelden from "./Terugvelden";
import { rijLabels } from "@/lib/redactie-peil";
import { magTochPlaatsen, miniBeeldUrl } from "@/lib/redactie-vandaag";
import type { OpgeslagenBericht } from "@/lib/motor/opslag";

/** Eén rij in de lijst: mini-beeld, kop, categorie en aantal bronnen, en eventueel een extra regel (bijvoorbeeld waarom iets niet is geplaatst). */
export default function Rij({ b, extra, plaatsKnop }: { b: OpgeslagenBericht; extra?: string | null; plaatsKnop?: boolean }) {
  const rij = (
    <a className="rij" href={`/redactie/bericht/${b.id}`}>
      <span className="mini"><MiniBeeld url={miniBeeldUrl(b)} /></span>
      <span className="info">
        <span className="rij-kop">{b.kop}</span>
        {rijLabels(b).length > 0 && <span className="meta">{rijLabels(b).map((l) => <span key={l} className="label">{l}</span>)}</span>}
        <span className="meta">{CATEGORIE_VOL[b.categorie]} · {aantalBronnen(b.bronnen.length)}</span>
        {extra && <span className="meta reden">{extra}</span>}
      </span>
    </a>
  );
  if (!plaatsKnop || !magTochPlaatsen(b)) return rij;
  // Eigen knop onder de rij (POST-formulier, geen JavaScript); tik op de rij zelf opent nog steeds het bericht.
  return (
    <div className="rij-blok">
      {rij}
      <form method="post" action="/redactie/actie">
        <Terugvelden actie="plaats" id={b.id} terug="/redactie" />
        <button type="submit" className="rd-knop hoofd plaats-knop">Plaatsen</button>
      </form>
    </div>
  );
}
