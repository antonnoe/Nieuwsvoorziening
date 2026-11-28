import type { Toegang } from "@/lib/redactie-toegang";

type Nu = "nieuws" | "tips" | "bronnen" | "overig";

/** Onderaan elk hoofdscherm: Nieuws, Tips en Bronnen; voor de beheerder kleine links naar Mensen en uitloggen. */
export default function Onderbalk({ nu, toegang }: { nu: Nu; toegang: Toegang }) {
  const knop = (id: Exclude<Nu, "overig">, href: string, tekst: string) => (
    <a className={`rd-knop${nu === id ? " nu" : ""}`} href={href} aria-current={nu === id ? "page" : undefined}>{tekst}</a>
  );
  return (
    <>
      <nav className="onderbalk" aria-label="Hoofdmenu">
        {knop("nieuws", "/redactie", "Nieuws")}
        {knop("tips", "/redactie/radar", "Tips")}
        {knop("bronnen", "/redactie/bronnen", "Bronnen")}
      </nav>
      <div className="klein-menu">
        <span>{toegang.naam}</span>
        {toegang.rol === "beheerder" && <a href="/redactie/mensen">Mensen</a>}
        <form method="post" action="/redactie/uitloggen"><button type="submit">Uitloggen</button></form>
      </div>
    </>
  );
}
