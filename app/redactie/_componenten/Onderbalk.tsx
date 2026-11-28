import type { Toegang } from "@/lib/redactie-toegang";

/** Onderaan elk hoofdscherm: Nieuws en Bronnen; voor de beheerder kleine links naar Mensen en uitloggen. */
export default function Onderbalk({ nu, toegang }: { nu: "nieuws" | "bronnen" | "overig"; toegang: Toegang }) {
  return (
    <>
      <nav className="onderbalk" aria-label="Hoofdmenu">
        <a className={`rd-knop${nu === "nieuws" ? " nu" : ""}`} href="/redactie" aria-current={nu === "nieuws" ? "page" : undefined}>Nieuws</a>
        <a className={`rd-knop${nu === "bronnen" ? " nu" : ""}`} href="/redactie/bronnen" aria-current={nu === "bronnen" ? "page" : undefined}>Bronnen</a>
      </nav>
      <div className="klein-menu">
        <span>{toegang.naam}</span>
        {toegang.rol === "beheerder" && <a href="/redactie/mensen">Mensen</a>}
        <form method="post" action="/redactie/uitloggen"><button type="submit">Uitloggen</button></form>
      </div>
    </>
  );
}
