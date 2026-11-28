"use client";
import { useEffect } from "react";

/** Stuurt de hoogte van de pagina naar de omliggende site (window.parent), bij laden en bij elke wijziging. Zonder ontvanger gebeurt er niets. */
export default function Hoogte({ ook = false }: { ook?: boolean }) {
  useEffect(() => {
    const stuur = () => {
      const hoogte = Math.ceil(document.documentElement.scrollHeight);
      try {
        window.parent.postMessage({ type: "nv-hoogte", hoogte }, "*");
        // Zijbalk: ook het oude bericht van nlfr-menu, zodat een bestaand script blijft werken zodra de origin klopt.
        if (ook) window.parent.postMessage({ nlfrNieuwsHeight: hoogte }, "*");
      } catch { /* geen ouder: niets doen */ }
    };
    stuur();
    window.addEventListener("load", stuur);
    window.addEventListener("resize", stuur);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(stuur) : null;
    ro?.observe(document.body);
    return () => { window.removeEventListener("load", stuur); window.removeEventListener("resize", stuur); ro?.disconnect(); };
  }, [ook]);
  return null;
}
