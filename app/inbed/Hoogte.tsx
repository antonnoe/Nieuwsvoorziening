"use client";
import { useEffect } from "react";

/** Hoogte van de inhoud. Niet documentElement.scrollHeight alleen: die is nooit kleiner dan het venster, dus de iframe kon nooit krimpen. */
export function meetHoogte(doc: Document = document): number {
  const root = doc.documentElement;
  const body = doc.body;
  const cs = body ? getComputedStyle(body) : null;
  const marges = cs ? (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0) : 0;
  const inhoud = body ? body.getBoundingClientRect().height + marges : 0;
  return Math.ceil(inhoud > 0 ? inhoud : root.scrollHeight);
}

/** Stuurt de hoogte van de pagina naar de omliggende site (window.parent): bij laden, na elk beeld (ook lazy), bij elke wijziging van de body en bij resize. Zonder ontvanger gebeurt er niets. */
export default function Hoogte({ ook = false }: { ook?: boolean }) {
  useEffect(() => {
    let laatste = -1;
    const stuur = () => {
      const hoogte = meetHoogte();
      if (hoogte === laatste) return;
      laatste = hoogte;
      try {
        window.parent.postMessage({ type: "nv-hoogte", hoogte }, "*");
        // Zijbalk: ook het oude bericht van nlfr-menu, zodat een bestaand script blijft werken zodra de origin klopt.
        if (ook) window.parent.postMessage({ nlfrNieuwsHeight: hoogte }, "*");
      } catch { /* geen ouder: niets doen */ }
    };
    stuur();
    window.addEventListener("load", stuur);
    window.addEventListener("resize", stuur);
    // load bubbelt niet: in de capture-fase luisteren vangt elk beeld, ook lazy, ook als het later laadt.
    document.addEventListener("load", stuur, true);
    document.addEventListener("error", stuur, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(stuur) : null;
    ro?.observe(document.body);
    const t1 = window.setTimeout(stuur, 500);
    const t2 = window.setTimeout(stuur, 2000);
    return () => {
      window.removeEventListener("load", stuur); window.removeEventListener("resize", stuur);
      document.removeEventListener("load", stuur, true); document.removeEventListener("error", stuur, true);
      ro?.disconnect(); window.clearTimeout(t1); window.clearTimeout(t2);
    };
  }, [ook]);
  return null;
}
