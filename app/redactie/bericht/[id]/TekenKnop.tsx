"use client";
import { useState } from "react";

type Stand =
  | { s: "rust" }
  | { s: "bezig" }
  | { s: "voorbeeld"; svg: string; naam: string }
  | { s: "opslaan"; svg: string; naam: string }
  | { s: "klaar" }
  | { s: "fout"; melding: string };

const adres = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** "Nieuw beeld laten tekenen": vraagt een tekening, toont die als voorbeeld en bewaart hem pas bij "Gebruiken". */
export default function TekenKnop({ id }: { id: string }) {
  const [stand, setStand] = useState<Stand>({ s: "rust" });

  async function teken() {
    setStand({ s: "bezig" });
    try {
      const r = await fetch("/redactie/actie/teken", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const j = (await r.json()) as { ok?: boolean; svg?: string; naam?: string; melding?: string; fout?: string };
      if (r.ok && j.ok && j.svg) setStand({ s: "voorbeeld", svg: j.svg, naam: j.naam || "Getekend beeld" });
      else if (r.status === 401) window.location.href = "/redactie/inloggen";
      else setStand({ s: "fout", melding: j.melding || j.fout || "Tekening mislukt, probeer opnieuw" });
    } catch {
      setStand({ s: "fout", melding: "Tekening mislukt, probeer opnieuw" });
    }
  }

  async function gebruik(svg: string, naam: string) {
    setStand({ s: "opslaan", svg, naam });
    try {
      const r = await fetch("/redactie/actie/gebruik", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, svg, naam }) });
      const j = (await r.json()) as { ok?: boolean; melding?: string };
      if (r.ok && j.ok) {
        window.location.href = `/redactie/bericht/${id}?m=${encodeURIComponent(`Beeld gewijzigd: ${naam}`)}&ok=1`;
        setStand({ s: "klaar" });
      } else setStand({ s: "fout", melding: j.melding || "Dat is niet gelukt. Probeer het opnieuw." });
    } catch {
      setStand({ s: "fout", melding: "Dat is niet gelukt. Probeer het opnieuw." });
    }
  }

  if (stand.s === "voorbeeld" || stand.s === "opslaan") {
    const bezig = stand.s === "opslaan";
    return (
      <div className="knop-rij">
        <div className="voorbeeld">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={adres(stand.svg)} alt={`Voorbeeld: ${stand.naam}`} /></div>
        <p className="stil">{stand.naam} · illustratie Communities Abroad</p>
        <button type="button" className="rd-knop hoofd" disabled={bezig} onClick={() => gebruik(stand.svg, stand.naam)}>{bezig ? "Bezig met bewaren…" : "Gebruiken"}</button>
        <button type="button" className="rd-knop" disabled={bezig} onClick={teken}>Opnieuw</button>
      </div>
    );
  }
  return (
    <div className="knop-rij">
      <button type="button" className="rd-knop" disabled={stand.s === "bezig" || stand.s === "klaar"} onClick={teken}>
        {stand.s === "bezig" ? "Bezig met tekenen, dit duurt een minuut…" : "Nieuw beeld laten tekenen"}
      </button>
      {stand.s === "fout" && <p className="melding fout" role="alert">{stand.melding}</p>}
    </div>
  );
}
