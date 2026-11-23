import type { Metadata } from "next";
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
    <main id="inhoud" className="binnen artikel">
      <p className="terug"><a href="/">← Terug naar het laatste nieuws</a></p>
      <h1 className="artikel-kop">Zo werken wij</h1>
      <div className="artikel-tekst">
        <h2>Eigen samenvattingen uit meerdere bronnen</h2>
        <p>Dagelijks lezen wij de nieuwsfeeds van Franse, Belgische en Nederlandse media en van Franse overheidssites. Over elk onderwerp schrijven wij een eigen samenvatting in gewoon Nederlands. Wij vertalen geen artikelen en nemen geen artikeltekst over. Voor een bericht gebruiken wij in de regel minstens twee onafhankelijke bronnen; bij een mededeling van de overheid zelf kan één bron genoeg zijn.</p>
        <p>Onder elk bericht staat een bronnenblok met per bron de naam, de oorspronkelijke kop, de datum en een link naar het origineel. Namen van kranten en sites staan alleen daar.</p>

        <h2>Controle vóór plaatsing</h2>
        <p>Elk bericht gaat door een automatische controle voordat het verschijnt. Die controle kijkt onder meer of de tekst compleet is, of er geen krantennamen of links in de lopende tekst staan en of een genoemd bedrag ook in een van de bronnen voorkomt. Een bericht dat de controle niet haalt, wordt niet geplaatst. Het is een geautomatiseerde controle: zij verkleint de kans op fouten, maar sluit ze niet uit.</p>

        <h2>Koppeling met PEIL</h2>
        <p>Raakt een bericht een financiële parameter uit <a href={PEIL_URL}>PEIL</a>, ons register van fiscale en sociale gegevens voor Nederlanders in Frankrijk, dan staat dat bij het bericht, met de tools die met die parameter rekenen. PEIL wordt niet door het nieuws aangepast. Lijkt een waarde door een bericht te kunnen veranderen, dan wordt die nagelopen en staat er bij het bericht dat dit gebeurt.</p>

        <h2 id="correcties">Een fout melden</h2>
        <p>Ziet u een fout of een onduidelijkheid? Mail ons via <a href="mailto:info@nederlanders.fr">info@nederlanders.fr</a>, met de kop van het bericht erbij. Wij kijken ernaar en passen het bericht zo nodig aan.</p>
      </div>
    </main>
  );
}
