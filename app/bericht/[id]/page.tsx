import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PeilRegel from "../../_componenten/PeilRegel";
import { Beeld } from "../../_componenten/Kaart";
import { BASIS_URL, CATEGORIE_VOL, aantalBronnen, datumLang, laadBericht, leestijd, peilWeergave, veiligeUrl } from "@/lib/site";

export const dynamic = "force-dynamic";
type P = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: P }): Promise<Metadata> {
  const { id } = await params;
  const b = await laadBericht(id);
  if (!b) return { title: "Bericht niet gevonden", robots: { index: false } };
  const url = `${BASIS_URL}/bericht/${b.id}`;
  return {
    title: b.kop,
    description: b.samenvatting.slice(0, 200),
    alternates: { canonical: url },
    openGraph: {
      title: b.kop, description: b.samenvatting.slice(0, 200), url, type: "article", locale: "nl_NL",
      publishedTime: b.gepubliceerdOp, section: CATEGORIE_VOL[b.categorie], ...(b.beeldUrl ? { images: [b.beeldUrl] } : {}),
    },
  };
}

export default async function BerichtPagina({ params }: { params: P }) {
  const { id } = await params;
  const b = await laadBericht(id);
  if (!b) notFound();
  const alinea = b.tekst.split(/\n{2,}|\n/).map((x) => x.trim()).filter(Boolean);
  return (
    <main id="inhoud" className="binnen artikel">
      <p className="terug"><a href="/">← Terug naar het laatste nieuws</a></p>
      <article>
        <p className="eyebrow">{CATEGORIE_VOL[b.categorie]}</p>
        <h1 className="artikel-kop">{b.kop}</h1>
        <p className="meta">
          <time dateTime={b.gepubliceerdOp}>{datumLang(b.gepubliceerdOp)}</time> · {leestijd(b)} min leestijd
        </p>
        {b.beeldUrl && <div className="artikel-beeld"><Beeld b={b} /></div>}
        <p className="artikel-intro">{b.samenvatting}</p>
        <div className="artikel-tekst">{alinea.map((a, i) => <p key={i}>{a}</p>)}</div>
        <PeilRegel peil={peilWeergave(b)} metLinks />
        <p className="gecontroleerd groot"><span aria-hidden="true">✓</span> Gecontroleerd vóór plaatsing</p>

        <section className="bronnenblok" aria-labelledby="bronnen-kop">
          <h2 id="bronnen-kop">Bronnen ({b.bronnen.length})</h2>
          <p className="meta">Dit bericht is een eigen samenvatting van {aantalBronnen(b.bronnen.length)}.</p>
          <ul>
            {b.bronnen.map((x, i) => {
              const u = veiligeUrl(x.url);
              return (
                <li key={i}>
                  <strong>{x.naam}</strong>
                  <span className="bron-kop">{x.origineleKop}</span>
                  {x.datum && <span className="meta">{datumLang(x.datum)}</span>}
                  {u && <a href={u} rel="noopener noreferrer nofollow" target="_blank">Lees het origineel</a>}
                </li>
              );
            })}
          </ul>
        </section>
      </article>
    </main>
  );
}
