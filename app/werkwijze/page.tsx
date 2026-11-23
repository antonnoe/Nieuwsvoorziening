import type { Metadata } from "next";
import Kop from "../_componenten/Kop";
import { PEIL_URL } from "@/lib/site";

const omschrijving = "Hoe het nieuws uit Frankrijk tot stand komt: eigen samenvattingen uit meerdere bronnen, automatische controle vóór plaatsing en een koppeling met PEIL.";
export const metadata: Metadata = {
  title: "Zo werken wij",
  description: omschrijving,
  alternates: { canonical: "/werkwijze" },
  openGraph: { title: "Zo werken wij", description: omschrijving, url: "/werkwijze", type: "article", locale: "nl_NL" },
};

export default function Werkwijze() {
  return (
    <>
      <Kop klein />
      <main id="inhoud" className="wrap">
        <div className="kruimel"><a href="/">Nieuws</a> › <b>Zo werken wij</b></div>
        <div className="art">
          <article>
            <h2 className="titel">Zo werken wij</h2>
            <div className="tekst">
              <h3>Eigen samenvattingen uit meerdere bronnen</h3>
        <p>Dagelijks lezen wij de nieuwsfeeds van Franse, Belgische en Nederlandse media en van Franse overheidssites. Over elk onderwerp schrijven wij een eigen samenvatting in gewoon Nederlands. Wij vertalen geen artikelen en nemen geen artikeltekst over. Voor een bericht gebruiken wij in de regel minstens twee onafhankelijke bronnen; bij een mededeling van de overheid zelf kan één bron genoeg zijn.</p>
        <p>Onder elk bericht staat een bronnenblok met per bron de naam, de oorspronkelijke kop, de datum en een link naar het origineel. Namen van kranten en sites staan alleen daar.</p>

        <h3>Controle vóór plaatsing</h3>
        <p>Elk bericht gaat door een automatische controle voordat het verschijnt. Die controle kijkt onder meer of de tekst compleet is, of er geen krantennamen of links in de lopende tekst staan en of een genoemd bedrag ook in een van de bronnen voorkomt. Een bericht dat de controle niet haalt, wordt niet geplaatst. Het is een geautomatiseerde controle: zij verkleint de kans op fouten, maar sluit ze niet uit.</p>

        <h3>Koppeling met PEIL</h3>
        <p>Raakt een bericht een financiële parameter uit <a href={PEIL_URL}>PEIL</a>, ons register van fiscale en sociale gegevens voor Nederlanders in Frankrijk, dan staat dat bij het bericht, met de tools die met die parameter rekenen. PEIL wordt niet door het nieuws aangepast. Lijkt een waarde door een bericht te kunnen veranderen, dan wordt die nagelopen en staat er bij het bericht dat dit gebeurt.</p>

        <h3 id="correcties">Een fout melden</h3>
        <p>Ziet u een fout of een onduidelijkheid? Mail ons via <a href="mailto:info@nederlanders.fr">info@nederlanders.fr</a>, met de kop van het bericht erbij. Wij kijken ernaar en passen het bericht zo nodig aan.</p>
            </div>
          </article>
        </div>
      </main>
    </>
  );
}
