import { NIEUWSBRIEF_URL } from "@/lib/netwerkbalk";
import { PEIL_URL } from "@/lib/site";

/** Witte kop. Besluit opdrachtgever 23-11-2026: geen sitenaam en geen ondertitel; alleen het woord "Nieuws". */
export default function Kop({ klein = false }: { klein?: boolean }) {
  return (
    <header className={klein ? "kop klein" : "kop"}>
      <div className="wrap">
        <div>
          <h1><a href="/">Nieuws</a></h1>
        </div>
        <nav className="links" aria-label="Hulpmiddelen">
          <a href={PEIL_URL}>PEIL</a>
          <a href="https://www.nederlanders.fr">Forum</a>
          <a className="knop" href={NIEUWSBRIEF_URL}>Nieuwsbrief</a>
        </nav>
      </div>
    </header>
  );
}
