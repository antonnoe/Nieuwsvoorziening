"use client";
import { useEffect, useState } from "react";

/** Leest het token uit het #-deel van de link (dat nooit naar de server gaat), activeert het en gaat naar de redactie. */
export default function WelkomClient() {
  const [stand, setStand] = useState<"bezig" | "mislukt" | "geen">("bezig");
  const [fout, setFout] = useState("");
  useEffect(() => {
    const token = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim();
    if (!token) {
      setStand("geen");
      return;
    }
    // Het token uit de adresbalk halen, voor het naar de server gaat.
    window.history.replaceState(null, "", window.location.pathname);
    fetch("/redactie/welkom/activeer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (r) => {
        if (r.ok) {
          window.location.replace("/redactie");
          return;
        }
        const j = (await r.json().catch(() => ({}))) as { fout?: string };
        setFout(j.fout || "Deze link werkt niet meer. Vraag Anton om een nieuwe.");
        setStand("mislukt");
      })
      .catch(() => {
        setFout("Geen verbinding. Probeer het zo nog eens.");
        setStand("mislukt");
      });
  }, []);
  if (stand === "bezig") return <p role="status">Even kijken of uw link klopt…</p>;
  if (stand === "geen") return <p className="melding fout">Deze link is niet compleet. Tik nog eens op de link die u van Anton kreeg, of vraag Anton om een nieuwe.</p>;
  return <p className="melding fout" role="alert">{fout}</p>;
}
