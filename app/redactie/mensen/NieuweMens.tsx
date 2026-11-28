"use client";
import { useState } from "react";

/** Vrijwilliger toevoegen: toont de persoonlijke link eenmalig, met een kopieerknop. */
export default function NieuweMens() {
  const [naam, setNaam] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [uitkomst, setUitkomst] = useState<{ naam: string; link: string } | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);

  async function maak(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout("");
    try {
      const r = await fetch("/redactie/mensen/maak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ naam }) });
      const j = (await r.json()) as { ok?: boolean; naam?: string; token?: string; fout?: string };
      if (r.ok && j.ok && j.token) {
        setUitkomst({ naam: j.naam || naam, link: `${window.location.origin}/redactie/welkom#${j.token}` });
        setNaam("");
      } else setFout(j.fout || "Toevoegen is niet gelukt.");
    } catch {
      setFout("Geen verbinding. Probeer het opnieuw.");
    }
    setBezig(false);
  }

  async function kopieer() {
    if (!uitkomst) return;
    try {
      await navigator.clipboard.writeText(uitkomst.link);
      setGekopieerd(true);
    } catch {
      setGekopieerd(false);
    }
  }

  return (
    <>
      <form className="veld" onSubmit={maak}>
        <div>
          <label htmlFor="mensnaam">Naam van de vrijwilliger</label>
          <input id="mensnaam" type="text" value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={60} autoComplete="off" required />
        </div>
        <button type="submit" className="rd-knop hoofd" disabled={bezig}>{bezig ? "Bezig…" : "Vrijwilliger toevoegen"}</button>
      </form>
      {fout && <p className="melding fout" role="alert">{fout}</p>}
      {uitkomst && (
        <div className="linkvak" role="status">
          <strong>Link voor {uitkomst.naam}</strong>
          <code>{uitkomst.link}</code>
          <button type="button" className="rd-knop" onClick={kopieer}>{gekopieerd ? "Gekopieerd" : "Kopieer de link"}</button>
          <p>Stuur deze link zelf, per mail of WhatsApp.</p>
          <p className="stil">Deze link wordt maar één keer getoond. Sluit u dit scherm, dan moet u een nieuwe maken.</p>
        </div>
      )}
    </>
  );
}
