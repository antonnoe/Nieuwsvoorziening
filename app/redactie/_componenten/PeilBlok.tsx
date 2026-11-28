import { PEIL_URL, groeneRegelTekst, heeftPeilBlok, oranjeRegelTekst, type PeilBlokData } from "@/lib/redactie-peil";

/** Het blok PEIL onder de tekst van een bericht. Zonder koppeling geen blok. Oranje staat er alleen voor de beheerder (de data bevat dan al niets voor een redacteur). */
export default function PeilBlok({ data }: { data: PeilBlokData }) {
  if (!heeftPeilBlok(data)) return null;
  return (
    <section className="peilblok" aria-label="PEIL">
      <h2>PEIL</h2>
      {data.groen.map((r) => <p key={`g-${r.naam}`} className="peil-groen">{groeneRegelTekst(r)}</p>)}
      {data.oranje.map((r) => <p key={`o-${r.naam}`} className="peil-oranje">{oranjeRegelTekst(r)}</p>)}
      <a className="rd-knop" href={PEIL_URL} target="_blank" rel="noopener noreferrer">Bekijk in PEIL</a>
    </section>
  );
}
