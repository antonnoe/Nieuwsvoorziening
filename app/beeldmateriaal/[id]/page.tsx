import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Kop from "../../_componenten/Kop";
import { RECHTEN_TEKST, beeldDetail, beeldIds } from "@/lib/beeldmateriaal";

// Alleen de id's uit public/illustraties/index.json hebben een pagina; een onbekend id is een 404.
export const dynamicParams = false;
export const generateStaticParams = () => beeldIds().map((id) => ({ id }));
type P = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const b = beeldDetail((await params).id);
  if (!b) return { title: "Beeld niet gevonden", robots: { index: false } };
  return {
    title: `${b.naam} · Beeldmateriaal`,
    description: b.beschrijving || `Illustratie ${b.naam} van Communities Abroad.`,
    alternates: { canonical: `/beeldmateriaal/${b.id}` },
  };
}

/** Eén illustratie groot, met de rechten en downloads; de terugknop komt op dezelfde plek in het raster uit. */
export default async function BeeldDetail({ params }: { params: P }) {
  const b = beeldDetail((await params).id);
  if (!b) notFound();
  return (
    <>
      <Kop klein />
      <main id="inhoud" className="wrap beelddetail">
        <a className="bm-knop terugknop" href={`/beeldmateriaal#${b.id}`}>Terug naar beeldmateriaal</a>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="groot" src={b.svg} alt={b.naam} width={800} height={600} />
        <h2>{b.naam}{b.binding === "nl" ? <span className="nlbe">NL/BE</span> : null}</h2>
        <p className="meta">{b.categorieKop} · {b.groepKop}</p>
        {b.beschrijving ? <p>{b.beschrijving}</p> : null}
        <p className="rechten">{RECHTEN_TEKST}</p>
        <div className="downloads">
          <a className="bm-knop hoofd" href={b.svg} download>Download SVG</a>
          <a className="bm-knop hoofd" href={b.png} download>Download PNG</a>
        </div>
      </main>
    </>
  );
}
