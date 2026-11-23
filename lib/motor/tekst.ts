export function normaliseer(t: string): string {
  return String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function ontsnap(t: string): string {
  return String(t || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(
  ("le la les un une des de du et en au aux pour par sur dans avec est sont qui que quoi ce cette ces son sa ses leur leurs pas plus ou ne se il elle ils elles a ont ete etre fait apres avant contre entre sans sous vers chez the and for with from that this has have was were are is of to in on at by an as it its " +
    "de het een en van in op te voor met is zijn was dat die dit deze aan bij om ook als naar uit over door niet nog meer maar werd wordt worden heeft hebben hij zij we er tot dan nieuwe").split(" ")
);

export function kernwoorden(t: string): string[] {
  return normaliseer(t)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

/** Gedeelde kernwoorden en verhouding tot de kortste lijst. */
export function overlap(a: string, b: string): { gedeeld: number; verhouding: number } {
  const A = new Set(kernwoorden(a));
  const B = new Set(kernwoorden(b));
  if (!A.size || !B.size) return { gedeeld: 0, verhouding: 0 };
  let g = 0;
  for (const w of A) if (B.has(w)) g += 1;
  return { gedeeld: g, verhouding: g / Math.min(A.size, B.size) };
}

export function hashId(t: string): string {
  let h = 5381;
  const s = String(t || "");
  for (let i = 0; i < s.length; i += 1) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function bevatWoord(genormaliseerd: string, w: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(genormaliseerd);
}
