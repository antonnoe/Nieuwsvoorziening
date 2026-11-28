import type { Metadata } from "next";
import Kop from "../_componenten/Kop";
import { beeldmateriaalSecties } from "@/lib/beeldmateriaal";

const omschrijving = "De eigen illustraties van Communities Abroad bij het nieuws uit Frankrijk, per categorie, met downloads in SVG en PNG.";
export const metadata: Metadata = {
  title: "Beeldmateriaal",
  description: omschrijving,
  alternates: { canonical: "/beeldmateriaal" },
  openGraph: { title: "Beeldmateriaal", description: omschrijving, url: "/beeldmateriaal", type: "website", locale: "nl_NL" },
};

export default function Beeldmateriaal() {
  const secties = beeldmateriaalSecties();
  return (
    <>
      <Kop klein />
      <main id="inhoud" className="wrap">
        <div className="kruimel"><a href="/">Nieuws</a> › <b>Beeldmateriaal</b></div>
        <h2 className="titel">Beeldmateriaal</h2>
        <p className="rechten">
          Alle illustraties op deze pagina zijn eigen werk van Communities Abroad. Ze zijn vrij te gebruiken op de eigen platforms van Communities Abroad: Nederlanders.fr, Infofrankrijk, nieuws.infofrankrijk.com en Infopoche. Gebruik door anderen is alleen toegestaan met schriftelijke toestemming. Vermeld bij gebruik: &ldquo;illustratie Communities Abroad&rdquo;.
        </p>
        {secties.map((s) => (
          <section key={s.categorie} className="beeldsectie" aria-labelledby={`cat-${s.categorie.replace(/\s+/g, "-")}`}>
            <h3 id={`cat-${s.categorie.replace(/\s+/g, "-")}`}>
              {s.kop} <span className="aantal">({s.beelden.length} {s.beelden.length === 1 ? "beeld" : "beelden"})</span>
            </h3>
            <ul className="beeldraster">
              {s.beelden.map((b) => (
                <li key={b.id}>
                  <a className="beeldlink" href={b.svg} target="_blank" rel="noopener" aria-label={`${b.naam}, SVG op volle grootte openen`}>
                    <img src={b.svg} alt={b.naam} loading="lazy" width={240} height={180} />
                  </a>
                  <span className="bnaam">{b.naam}{b.binding === "nl" ? <span className="nlbe"> NL/BE</span> : null}</span>
                  <span className="bdl">
                    <a href={b.svg} download aria-label={`${b.naam} downloaden als SVG`}>SVG</a>
                    {" · "}
                    <a href={b.png} download aria-label={`${b.naam} downloaden als PNG`}>PNG</a>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}
