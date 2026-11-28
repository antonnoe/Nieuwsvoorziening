import type { Metadata } from "next";
import "./inbed.css";
import Hoogte from "./Hoogte";
import { leesOpslag } from "@/lib/motor/api";
import { AANTAL, LEEG, NLFR_FOUT, TABS, TAB_NAAM, bijgewerktTekst, datumItem, laadBerichtItems, laadBijgewerkt, laadNlfr, leesTab, type InbedItem } from "@/lib/inbed";
import { BASIS_URL, CATEGORIE_VOL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Nieuws uit Frankrijk" },
  description: null,
  openGraph: null,
  robots: { index: false, follow: false, nocache: true },
};

const categorieNaam = (c: string) => (CATEGORIE_VOL as Record<string, string>)[c] || c;

export default async function Inbed({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = leesTab((await searchParams).tab);
  const opslag = leesOpslag();
  const [items, bijgewerkt] = await Promise.all([
    tab === "nlfr" ? laadNlfr() : laadBerichtItems(opslag, tab === "overheid" ? "overheid" : "pers", categorieNaam),
    laadBijgewerkt(opslag),
  ]);
  const tekst = bijgewerktTekst(bijgewerkt);
  return (
    <main className="ib" id="inhoud">
      <Hoogte />
      <header className="ib-kop">
        <nav aria-label="Onderdelen">
          {TABS.map((t) => (
            <a key={t} href={`/inbed?tab=${t}`} className={t === tab ? "aan" : undefined} aria-current={t === tab ? "page" : undefined}>{TAB_NAAM[t]}</a>
          ))}
        </nav>
        {tekst && <span className="ib-tijd">{tekst}</span>}
      </header>
      {items === null ? (
        <p className="ib-leeg">{tab === "nlfr" ? NLFR_FOUT : "Even niet beschikbaar."}</p>
      ) : items.length === 0 ? (
        <p className="ib-leeg">{LEEG}</p>
      ) : (
        <ul className="ib-lijst">
          {items.slice(0, AANTAL).map((i: InbedItem) => (
            <li key={i.sleutel}>
              <a href={i.url} target="_blank" rel="noopener">
                {i.beeld && (
                  <span className="ib-beeld">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.beeld} alt="" loading="lazy" />
                  </span>
                )}
                <span className="ib-tekst">
                  <b>{i.titel}</b>
                  {i.samenvatting && <span className="ib-sam">{i.samenvatting}</span>}
                  <span className="ib-meta">{[datumItem(i.datum), i.label].filter(Boolean).join(" · ")}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {tab !== "nlfr" && items !== null && (
        <p className="ib-alles"><a href={BASIS_URL} target="_blank" rel="noopener">Al het nieuws</a></p>
      )}
    </main>
  );
}
