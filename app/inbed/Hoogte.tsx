"use client";
import { useEffect } from "react";

/** Stuurt de hoogte van de pagina naar de omliggende site (window.parent), bij laden en bij elke wijziging. Zonder ontvanger gebeurt er niets. */
export default function Hoogte() {
  useEffect(() => {
    const stuur = () => {
      try { window.parent.postMessage({ type: "nv-hoogte", hoogte: Math.ceil(document.documentElement.scrollHeight) }, "*"); } catch { /* geen ouder: niets doen */ }
    };
    stuur();
    window.addEventListener("load", stuur);
    window.addEventListener("resize", stuur);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(stuur) : null;
    ro?.observe(document.body);
    return () => { window.removeEventListener("load", stuur); window.removeEventListener("resize", stuur); ro?.disconnect(); };
  }, []);
  return null;
}
