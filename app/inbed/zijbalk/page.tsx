import type { Metadata } from "next";
import "../inbed.css";
import Hoogte from "../Hoogte";
import Zijbalk from "./Zijbalk";
import { leesOpslag } from "@/lib/motor/api";
import { bijgewerktTekst, laadBijgewerkt } from "@/lib/inbed";
import { laadZijbalkItems, peilRegels, zijbalkAantal, zijbalkKanaal, zijbalkPeilAantal } from "@/lib/inbed-zijbalk";
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

export default async function InbedZijbalk({ searchParams }: { searchParams: Promise<{ kanaal?: string; aantal?: string; peil?: string }> }) {
  const q = await searchParams;
  const kanaal = zijbalkKanaal(q.kanaal);
  const aantal = zijbalkAantal(q.aantal);
  const peilAantal = zijbalkPeilAantal(q.peil);
  const opslag = leesOpslag();
  const [items, bijgewerkt, aankondigingen] = await Promise.all([
    laadZijbalkItems(opslag, kanaal, categorieNaam, aantal),
    laadBijgewerkt(opslag),
    (peilAantal > 0 ? laadAankondigingen(peilAantal) : Promise.resolve({ lijst: [], totaal: 0 })).catch(() => ({ lijst: [], totaal: 0 })), // PEIL-storing: blok weg, de rest blijft
  ]);
  return (
    <main className="ib zb" id="inhoud">
      <Hoogte ook />
      <Zijbalk items={items} peil={peilRegels(aankondigingen.lijst, peilAantal)} bijgewerkt={bijgewerktTekst(bijgewerkt)} />
    </main>
  );
}
