"use client";
import type { ReactNode } from "react";

/** Een uitklapblok dat na het openen in beeld scrolt (op een telefoon staat de inhoud anders onder het scherm). */
export default function Uitklap({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <details onToggle={(e) => { const d = e.currentTarget; if (d.open) d.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
      <summary className="rd-knop">{titel}</summary>
      {children}
    </details>
  );
}
