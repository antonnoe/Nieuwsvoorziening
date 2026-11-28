import type { Metadata, Viewport } from "next";
import "./huisstijl.css";
import "./site.css";
import Netwerkbalk from "./_componenten/Netwerkbalk";
import { BASIS_URL } from "@/lib/site";

// Precies de URL uit de kop van huisstijl.css.
const LETTERS_URL = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&display=swap";

export const metadata: Metadata = {
  metadataBase: new URL(BASIS_URL),
  title: { default: "Nieuws uit Frankrijk voor Nederlanders en Belgen", template: "%s | Nieuws uit Frankrijk" },
  description: "Dagelijks nieuws uit Frankrijk in gewoon Nederlands: eigen samenvattingen uit meerdere bronnen, met een controle vóór plaatsing en een koppeling met PEIL.",
  openGraph: { type: "website", locale: "nl_NL", siteName: "Nieuws uit Frankrijk" },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={LETTERS_URL} />
      </head>
      <body>
        <a className="sla-over" href="#inhoud">Direct naar de inhoud</a>
        <Netwerkbalk hier="nieuws" />
        {children}
        <footer>
          <div className="wrap">
            <span>Een uitgave van Communities Abroad</span>
            <span>
              <a href="/werkwijze">Bronnen en werkwijze</a> · <a href="/beeldmateriaal">Beeldmateriaal</a> · <a href="/werkwijze#correcties">Correcties</a> · <a href="mailto:info@nederlanders.fr">Contact</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
