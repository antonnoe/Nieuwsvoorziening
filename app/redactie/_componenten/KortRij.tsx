import Terugvelden from "./Terugvelden";
import type { OverheidKortRij } from "@/lib/motor/types";

/** Eén overheidsberichtje: titel en bron, met een knop Weg (of Terug als het is weggehaald). Gewoon formulier, werkt zonder JavaScript. */
export default function KortRij({ k }: { k: OverheidKortRij }) {
  const weg = k.redactie === "weg";
  return (
    <div className="rij-blok kort">
      <div className="rij">
        <span className="info">
          <span className="rij-kop">{k.titel}</span>
          <span className="meta">{k.bronNaam}{weg ? " · weggehaald" : ""}</span>
        </span>
      </div>
      <form method="post" action="/redactie/actie">
        <Terugvelden actie={weg ? "kort-terug" : "kort-weg"} id={k.id} terug="/redactie" />
        <button type="submit" className={weg ? "rd-knop hoofd plaats-knop" : "rd-knop zacht plaats-knop"}>{weg ? "Terug" : "Weg"}</button>
      </form>
    </div>
  );
}
