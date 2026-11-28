// Het scherm Vandaag van de redactie-app (28-11-2026): wat live staat, wat de machine niet plaatste en wat is weggehaald, plus het mini-beeld.
// Los van de pagina zodat het getest kan worden.
import type { OpgeslagenBericht } from "@/lib/motor/opslag";
import { poortBlokkade } from "@/lib/redactie";
import { veiligeUrl } from "@/lib/site";

export const VANDAAG_DAGEN = 2;
export const UITLEG_VOORSTELLEN = "De machine twijfelde over deze berichten. Tik op Plaatsen als u het de moeite waard vindt.";

const nieuwsteEerst = (a: OpgeslagenBericht, b: OpgeslagenBericht) => b.gepubliceerdOp.localeCompare(a.gepubliceerdOp);

/**
 * Live = gepubliceerd en niet weggehaald; voorstellen = concepten die de kwaliteitspoort niet tegenhield (redacteur mag plaatsen);
 * tegengehouden = niet geplaatst en door de poort tegengehouden (alleen voor de beheerder, zonder knop); weg = alles wat is weggehaald.
 */
export function verdeelVandaag(lijst: OpgeslagenBericht[]) {
  return {
    live: lijst.filter((b) => b.status === "gepubliceerd" && b.redactie !== "weg").sort(nieuwsteEerst),
    voorstellen: lijst.filter(magTochPlaatsen).sort(nieuwsteEerst),
    tegengehouden: lijst.filter((b) => b.status !== "gepubliceerd" && b.redactie !== "weg" && !magTochPlaatsen(b)).sort(nieuwsteEerst),
    weg: lijst.filter((b) => b.redactie === "weg").sort(nieuwsteEerst),
  };
}

/** Mag de redactie dit bericht alsnog plaatsen? Alleen een concept dat de kwaliteitspoort niet tegenhield en niet weg is. */
export const magTochPlaatsen = (b: Pick<OpgeslagenBericht, "status" | "blokkadeRedenen" | "redactie">) => b.status === "concept" && !poortBlokkade(b) && b.redactie !== "weg";

/** De url voor het mini-beeld: de opgeslagen beeld_url (ook als die relatief of met spaties is opgeslagen), anders de PNG van een illustratie; anders null. */
export function miniBeeldUrl(b: Pick<OpgeslagenBericht, "beeldUrl" | "beeldCredit">): string | null {
  const basis = (process.env.NIEUWS_BASIS_URL || "https://nieuws.infofrankrijk.com").replace(/\/+$/, "");
  const proef = (u: unknown): string | null => {
    if (typeof u !== "string" || !u.trim()) return null;
    const t = u.trim();
    return veiligeUrl(t.startsWith("/") ? `${basis}${t}` : t);
  };
  return proef(b.beeldUrl) ?? proef(b.beeldCredit?.png);
}
