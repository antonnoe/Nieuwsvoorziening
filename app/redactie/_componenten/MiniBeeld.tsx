"use client";
import { useState } from "react";

/** Het mini-beeld in een lijstrij. Laadt het beeld niet, dan staat er "beeld laadt niet" (niet "geen beeld": het beeld bestaat wel). */
export default function MiniBeeld({ url }: { url: string | null }) {
  const [stuk, setStuk] = useState(false);
  if (!url) return <span className="geenbeeld">geen beeld</span>;
  if (stuk) return <span className="geenbeeld">beeld laadt niet</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" loading="lazy" onError={() => setStuk(true)} />;
}
