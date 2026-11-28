"use client";
import { useState, type ReactNode } from "react";

/**
 * Een formulier dat gewoon naar de server post (werkt ook zonder JavaScript), maar na het versturen de knoptekst verandert
 * (bijvoorbeeld "Bezig, dit duurt een minuut…") en de knop dichtzet, zodat er niet twee keer wordt gedrukt.
 */
export default function BezigFormulier({ actie, children, knop, bezigTekst, klasse = "rd-knop hoofd" }: { actie: string; children: ReactNode; knop: string; bezigTekst: string; klasse?: string }) {
  const [bezig, setBezig] = useState(false);
  return (
    <form method="post" action={actie} onSubmit={() => setBezig(true)}>
      {children}
      <button type="submit" className={klasse} disabled={bezig} aria-busy={bezig}>{bezig ? bezigTekst : knop}</button>
    </form>
  );
}
