import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PeilRegel from "../../_componenten/PeilRegel";
import Kaart, { Beeld } from "../../_componenten/Kaart";
import Kop from "../../_componenten/Kop";
import { NIEUWSBRIEF_URL } from "@/lib/netwerkbalk";
import { BASIS_URL, CATEGORIE_VOL, aantalBronnen, categorieSlug, datumLang, laadBericht, laadVerwant, leestijd, peilWeergave, veiligeUrl } from "@/lib/site";

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
  const verwant = await laadVerwant(b);
  const melding = `mailto:info@nederlanders.fr?subject=${encodeURIComponent(`Fout in bericht: ${b.kop}`)}`;
  const delen = `mailto:?subject=${encodeURIComponent(b.kop)}&body=${encodeURIComponent(`${BASIS_URL}/bericht/${b.id}`)}`;
  return (
    <>
      <Kop klein />
      <main id="inhoud" className="wrap">
        <div className="kruimel"><a href="/">Nieuws</a> › <a href={`/?categorie=${categorieSlug(b.categorie)}`}><b>{CATEGORIE_VOL[b.categorie]}</b></a></div>
        <div className="art">
          <article>
            <h2 className="titel">{b.kop}</h2>
            <span className="meta">
              <time dateTime={b.gepubliceerdOp}>{datumLang(b.gepubliceerdOp)}</time> · {leestijd(b)} min leestijd · {aantalBronnen(b.bronnen.length)} · gecontroleerd
            </span>
            <p className="intro">{b.samenvatting}</p>
            <Beeld b={b} klasse="groot" />
            <div className="tekst">
              {alinea.map((a, i) => <p key={i}>{a}</p>)}
              <PeilRegel peil={peilWeergave(b)} metLinks />
            </div>
            <div className="deel">
              <a className="pil" href={delen}>Deel dit bericht</a>
              <a className="pil" href="https://www.nederlanders.fr">Praat mee op het Forum</a>
              <a className="pil" href={melding}>Meld een fout</a>
            </div>
          </article>
          <aside className="zij">
            <div className="paneel">
              <h4>Open keuken</h4>
              <div className="rij"><span>Geplaatst</span><span>{datumLang(b.gepubliceerdOp)}</span></div>
              <div className="rij"><span>Gecontroleerd</span><span className="ja">✓ ja</span></div>
              <div className="rij"><span>Correcties</span><a href="/werkwijze#correcties">Zo melden</a></div>
              <a className="link" href="/werkwijze">Zo werken wij</a>
            </div>
            <div className="paneel">
              <h4>Bronnen</h4>
              <ol>
                {b.bronnen.map((x, i) => {
                  const u = veiligeUrl(x.url);
                  return (
                    <li key={i}>
                      {x.naam}
                      <small>{x.origineleKop}</small>
                      {x.datum && <small>{datumLang(x.datum)}</small>}
                      {u && <a className="link" href={u} rel="noopener noreferrer nofollow" target="_blank">Lees het origineel</a>}
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className="paneel">
              <h4>Elke ochtend in uw mailbox</h4>
              <p>Het nieuws uit Frankrijk, kort en gecontroleerd.</p>
              <a className="knop" href={NIEUWSBRIEF_URL}>Nieuwsbrief</a>
            </div>
          </aside>
        </div>
        {verwant.length > 0 && (
          <section className="verder" aria-labelledby="verder-kop">
            <h4 id="verder-kop">Verder lezen</h4>
            <div className="raster">{verwant.map((v) => <Kaart key={v.id} b={v} compact />)}</div>
          </section>
        )}
      </main>
    </>
  );
}
