import type { Metadata, Viewport } from "next";
import "./huisstijl.css";
import "./site.css";
import { BASIS_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(BASIS_URL),
  title: { default: "Nieuws uit Frankrijk voor Nederlanders en Belgen", template: "%s | Nieuws uit Frankrijk" },
  description: "Dagelijks nieuws uit Frankrijk in gewoon Nederlands: eigen samenvattingen uit meerdere bronnen, met een controle vóór plaatsing en een koppeling met PEIL.",
  openGraph: { type: "website", locale: "nl_NL", siteName: "Nieuws uit Frankrijk" },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const NETWERK = [
  { naam: "Infofrankrijk", href: "https://www.infofrankrijk.com" },
  { naam: "Nieuws", href: "/", actief: true },
  { naam: "Nederlanders.fr", href: "https://www.nederlanders.fr" },
  { naam: "Infopoche", href: "https://infopoche.fr" },
  { naam: "Dossier Frankrijk", href: "https://dossierfrankrijk.nl" },
  { naam: "Café Claude", href: "https://www.cafeclaude.fr" },
  { naam: "Nedergids", href: "https://nedergids.nl" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Source+Serif+4:wght@500;600;700&display=swap"
        />
      </head>
      <body>
        <a className="sla-over" href="#inhoud">Direct naar de inhoud</a>
        <div className="netwerkbalk">
          <nav className="binnen netwerk" aria-label="Netwerk van Communities Abroad">
            <ul>
              {NETWERK.map((n) => (
                <li key={n.naam}>
                  <a href={n.href} aria-current={n.actief ? "page" : undefined} className={n.actief ? "actief" : undefined}>{n.naam}</a>
                </li>
              ))}
            </ul>
            <a className="netwerk-rechts" href="https://www.communitiesabroad.com">Communities Abroad</a>
          </nav>
        </div>
        <header className="kop">
          <div className="binnen kop-binnen">
            <a className="kop-label" href="/">Nieuws uit Frankrijk</a>
            <nav className="kop-acties" aria-label="Hulpmiddelen">
              <a href="https://communitiesabroad.com/peil">PEIL</a>
              <a href="https://www.nederlanders.fr">Forum</a>
              <a className="knop-bordeaux" href="https://laposta.nl/f/ssysinmqgflb">Nieuwsbrief</a>
            </nav>
          </div>
        </header>
        {children}
        <footer className="voet">
          <div className="binnen voet-binnen">
            <span>Een uitgave van Communities Abroad</span>
            <nav aria-label="Voettekst">
              <a href="/werkwijze">Bronnen en werkwijze</a> · <a href="/werkwijze#correcties">Correcties</a> · <a href="mailto:info@nederlanders.fr">Contact</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
