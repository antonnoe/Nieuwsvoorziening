import type { Metadata } from "next";
import "../inbed.css";
import Hoogte from "../Hoogte";
import Zijbalk from "./Zijbalk";
import { leesOpslag } from "@/lib/motor/api";
import { bijgewerktTekst, laadBijgewerkt } from "@/lib/inbed";
import { laadZijbalkItems, peilRegels, zijbalkKanaal } from "@/lib/inbed-zijbalk";
import { laadAankondigingen } from "@/lib/peilvak";
import { CATEGORIE_VOL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Nieuws over Frankrijk" },
  description: null,
  openGraph: null,
  robots: { index: false, follow: false, nocache: true },
};

const categorieNaam = (c: string) => (CATEGORIE_VOL as Record<string, string>)[c] || c;

export default async function InbedZijbalk({ searchParams }: { searchParams: Promise<{ kanaal?: string }> }) {
  const kanaal = zijbalkKanaal((await searchParams).kanaal);
  const opslag = leesOpslag();
  const [items, bijgewerkt, aankondigingen] = await Promise.all([
    laadZijbalkItems(opslag, kanaal, categorieNaam),
    laadBijgewerkt(opslag),
    laadAankondigingen(2).catch(() => ({ lijst: [], totaal: 0 })), // PEIL-storing: blok weg, de rest blijft
  ]);
  return (
    <main className="ib zb" id="inhoud">
      <Hoogte ook />
      <Zijbalk items={items} peil={peilRegels(aankondigingen.lijst)} bijgewerkt={bijgewerktTekst(bijgewerkt)} />
    </main>
  );
}
