import type { Metadata } from "next";
import Kaart from "./_componenten/Kaart";
import Kop from "./_componenten/Kop";
import PeilVak from "./_componenten/PeilVak";
import { laadAankondigingen } from "@/lib/peilvak";
import { CATEGORIEEN } from "@/lib/motor/types";
import { CATEGORIE_KNOP, CATEGORIE_VOL, categorieSlug, datumMetDag, laadActieveCategorieen, laadStatus, laadVoorpagina, slugNaarCategorie } from "@/lib/site";

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
  const toonPeilVak = pagina === 1 && !categorie;
  const [data, status, actief, aankondigingen] = await Promise.all([laadVoorpagina({ categorie, peil, pagina }), laadStatus(), laadActieveCategorieen(), toonPeilVak ? laadAankondigingen(4) : Promise.resolve({ lijst: [], totaal: 0 })]);
  const filterActief = Boolean(categorie || peil);
  const leeg = !data.uitgelicht && data.kaarten.length === 0;
  const catSlug = categorie ? categorieSlug(categorie) : undefined;

  return (
    <>
      <Kop />
      <div className="keuken">
        <div className="wrap">
          {status.bijgewerkt && (
            <span><span className="stip" aria-hidden="true" /><b>Bijgewerkt</b> {datumMetDag(status.bijgewerkt)}</span>
          )}
          {status.vandaag !== undefined && <span><b>{status.vandaag}</b> {status.vandaag === 1 ? "bericht" : "berichten"} vandaag</span>}
          {status.bronnen !== undefined && <span><b>{status.bronnen}</b> {status.bronnen === 1 ? "bron" : "bronnen"} geraadpleegd</span>}
          <span>Elk bericht gecontroleerd vóór plaatsing</span>
          <a href="/werkwijze">Zo werken wij</a>
        </div>
      </div>

      <main id="inhoud" className="wrap">
        <nav className="rubrieken" aria-label="Categorieën">
          <a className={`pil${!filterActief ? " aan" : ""}`} href="/" aria-current={!filterActief ? "page" : undefined}>Laatste nieuws</a>
          {CATEGORIEEN.filter((c) => !actief || actief.has(c) || categorie === c).map((c) => (
            <a key={c} className={`pil${categorie === c ? " aan" : ""}`} href={href({ categorie: categorieSlug(c) })} aria-current={categorie === c ? "page" : undefined}>
              {CATEGORIE_KNOP[c]}
            </a>
          ))}
          <a className="pil geld" href={peil ? "/" : href({ peil: true })} aria-pressed={peil}>€ Raakt uw portemonnee</a>
        </nav>

        <PeilVak lijst={aankondigingen.lijst} totaal={aankondigingen.totaal} />

        {leeg ? (
          <div className="leeg" role="status">
            {data.fout || !filterActief && pagina === 1 ? (
              <p>Het eerste nieuws verschijnt na de eerste oogst.</p>
            ) : (
              <p>{peil && toonPeilVak && aankondigingen.lijst.length ? "Er is nu geen nieuws dat direct uw portemonnee raakt. Hierboven ziet u wat er de komende tijd verandert." : peil && !categorie && pagina === 1 ? "Er is nu geen nieuws dat direct uw portemonnee raakt." : "Er zijn geen berichten gevonden voor deze keuze."} <a href="/">Terug naar het laatste nieuws</a>.</p>
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
              {pagina > 1 && <a href={href({ categorie: catSlug, peil, pagina: pagina - 1 })}>Vorige berichten</a>}
              {data.meer && <a href={href({ categorie: catSlug, peil, pagina: pagina + 1 })}>Meer berichten</a>}
            </div>
          </>
        )}
      </main>
    </>
  );
}
