import type { Metadata } from "next";
import Kaart from "./_componenten/Kaart";
import { CATEGORIEEN } from "@/lib/motor/types";
import { CATEGORIE_KNOP, CATEGORIE_VOL, categorieSlug, datumMetDag, laadStatus, laadVoorpagina, slugNaarCategorie } from "@/lib/site";

export const dynamic = "force-dynamic";

type SP = Promise<{ categorie?: string; peil?: string; pagina?: string }>;

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  const cat = slugNaarCategorie(sp.categorie);
  const titel = cat ? `${CATEGORIE_VOL[cat]}: nieuws uit Frankrijk` : sp.peil === "1" ? "Nieuws dat uw portemonnee raakt" : "Nieuws uit Frankrijk voor Nederlanders en Belgen";
  const omschrijving = "Dagelijks nieuws uit Frankrijk in gewoon Nederlands: eigen samenvattingen uit meerdere bronnen, met een controle vóór plaatsing en een koppeling met PEIL.";
  const filtered = Boolean(cat || sp.peil || (sp.pagina && sp.pagina !== "1"));
  return {
    title: { absolute: titel },
    description: omschrijving,
    alternates: { canonical: "/" },
    robots: filtered ? { index: false, follow: true } : undefined,
    openGraph: { title: titel, description: omschrijving, url: "/", type: "website", locale: "nl_NL" },
  };
}

function href(p: { categorie?: string; peil?: boolean; pagina?: number }) {
  const q = new URLSearchParams();
  if (p.categorie) q.set("categorie", p.categorie);
  if (p.peil) q.set("peil", "1");
  if (p.pagina && p.pagina > 1) q.set("pagina", String(p.pagina));
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

export default async function Voorpagina({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const categorie = slugNaarCategorie(sp.categorie);
  const peil = sp.peil === "1";
  const pagina = Math.max(1, Math.min(200, Number(sp.pagina) || 1));
  const [data, status] = await Promise.all([laadVoorpagina({ categorie, peil, pagina }), laadStatus()]);
  const filterActief = Boolean(categorie || peil);
  const leeg = !data.uitgelicht && data.kaarten.length === 0;
  const catSlug = categorie ? categorieSlug(categorie) : undefined;

  return (
    <>
      <div className="statusbalk">
        <div className="binnen statusrij">
          <ul className="statuslijst">
            {status.bijgewerkt && (
              <li><span className="stip" aria-hidden="true" /><strong>Bijgewerkt</strong> {datumMetDag(status.bijgewerkt)}</li>
            )}
            {status.vandaag !== undefined && <li><strong>{status.vandaag}</strong> {status.vandaag === 1 ? "bericht" : "berichten"} vandaag</li>}
            {status.bronnen !== undefined && <li><strong>{status.bronnen}</strong> {status.bronnen === 1 ? "bron" : "bronnen"} geraadpleegd</li>}
            <li>Elk bericht gecontroleerd vóór plaatsing</li>
          </ul>
          <a className="statuslink" href="/werkwijze">Zo werken wij</a>
        </div>
      </div>

      <main id="inhoud" className="binnen hoofd">
        <h1 className="sr-only">Nieuws uit Frankrijk</h1>
        <nav className="filters" aria-label="Categorieën">
          <ul>
            <li><a className={`knop-filter${!filterActief ? " actief" : ""}`} href="/" aria-current={!filterActief ? "page" : undefined}>Laatste nieuws</a></li>
            {CATEGORIEEN.map((c) => (
              <li key={c}>
                <a className={`knop-filter${categorie === c ? " actief" : ""}`} href={href({ categorie: categorieSlug(c) })} aria-current={categorie === c ? "page" : undefined}>
                  {CATEGORIE_KNOP[c]}
                </a>
              </li>
            ))}
          </ul>
          <a className={`knop-portemonnee${peil ? " actief" : ""}`} href={peil ? "/" : href({ peil: true })} aria-pressed={peil}>€ Raakt uw portemonnee</a>
        </nav>

        {leeg ? (
          <div className="leeg" role="status">
            {data.fout || !filterActief && pagina === 1 ? (
              <p>Het eerste nieuws verschijnt na de eerste oogst.</p>
            ) : (
              <p>Er zijn geen berichten gevonden voor deze keuze. <a href="/">Terug naar het laatste nieuws</a>.</p>
            )}
          </div>
        ) : (
          <>
            {data.uitgelicht && <Kaart b={data.uitgelicht} groot />}
            {data.kaarten.length > 0 && (
              <div className="raster">
                {data.kaarten.map((b) => <Kaart key={b.id} b={b} />)}
              </div>
            )}
            <div className="meer">
              {pagina > 1 && <a className="knop-omlijnd" href={href({ categorie: catSlug, peil, pagina: pagina - 1 })}>Vorige berichten</a>}
              {data.meer && <a className="knop-omlijnd" href={href({ categorie: catSlug, peil, pagina: pagina + 1 })}>Meer berichten</a>}
            </div>
          </>
        )}
      </main>
    </>
  );
}
