// Groeperen in onderwerpen binnen het venster (36 uur). Eerst een heuristiek op
// gedeelde kernwoorden (ook zonder model bruikbaar), daarna een goedkoop model
// dat ook over talen heen groepeert. Faalt het model, dan blijft de heuristiek.
import { haalJson, type ModelClient } from "./ai";
import { modelGoedkoop } from "./config";
import { hashId, overlap } from "./tekst";
import { isKanttekeningItem } from "./kanttekening";
import type { BronItem, Cluster } from "./types";

class Unie {
  p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  zoek(i: number): number {
    while (this.p[i] !== i) {
      this.p[i] = this.p[this.p[i]];
      i = this.p[i];
    }
    return i;
  }
  voeg(a: number, b: number) {
    this.p[this.zoek(a)] = this.zoek(b);
  }
}

export function clusterSleutel(items: BronItem[]): string {
  return hashId(items.map((i) => i.url).sort().join("|"));
}

function bouw(items: BronItem[], u: Unie): Cluster[] {
  const groepen = new Map<number, BronItem[]>();
  items.forEach((it, i) => {
    const r = u.zoek(i);
    (groepen.get(r) || groepen.set(r, []).get(r)!).push(it);
  });
  return [...groepen.values()].map((its) => ({ sleutel: clusterSleutel(its), items: its }));
}

export function clusterHeuristisch(items: BronItem[], u = new Unie(items.length)): Unie {
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (items[i].bronId === items[j].bronId) continue;
      const o = overlap(items[i].titel, items[j].titel);
      if (o.gedeeld >= 2 && o.verhouding >= 0.4) u.voeg(i, j);
      else if (o.gedeeld >= 3 && o.verhouding >= 0.3) u.voeg(i, j);
    }
  }
  return u;
}

const SYSTEEM = `Je groepeert nieuwskoppen uit Franse, Nederlandse, Vlaamse en andere kranten en overheidsbronnen per onderwerp. Koppen kunnen in verschillende talen staan. Twee koppen horen bij elkaar alleen als ze over exact dezelfde gebeurtenis of hetzelfde besluit gaan, niet alleen over hetzelfde thema. Antwoord uitsluitend met JSON: {"groepen":[[1,4],[2,9,12]]}. Neem alleen groepen van minstens twee koppen op, gebruik de nummers uit de lijst en zet elk nummer hooguit in één groep.`;

export async function clusterItems(
  items: BronItem[],
  client: ModelClient | null,
  maxModelItems = 120
): Promise<{ clusters: Cluster[]; gebruiktModel: boolean; fout?: string }> {
  const u = clusterHeuristisch(items);
  let gebruiktModel = false;
  let fout: string | undefined;
  if (client && items.length >= 2) {
    try {
      // Nieuwste eerst, begrensd.
      const volgorde = items.map((_, i) => i).sort((a, b) => items[b].gepubliceerdOp.localeCompare(items[a].gepubliceerdOp)).slice(0, maxModelItems);
      const lijst = volgorde.map((idx, n) => `${n + 1}. [${items[idx].taal}] ${items[idx].titel.slice(0, 160)}`).join("\n");
      const antw = await client.tekst({ model: modelGoedkoop(), system: SYSTEEM, user: lijst, maxTokens: 2500 });
      const j = haalJson<{ groepen?: unknown }>(antw);
      if (!j || !Array.isArray(j.groepen)) throw new Error("Clustering: antwoord is geen JSON met groepen.");
      for (const g of j.groepen) {
        if (!Array.isArray(g)) continue;
        const idxs = g.map((x) => volgorde[Number(x) - 1]).filter((x) => typeof x === "number");
        for (let k = 1; k < idxs.length; k += 1) u.voeg(idxs[0], idxs[k]);
      }
      gebruiktModel = true;
    } catch (e) {
      fout = e instanceof Error ? e.message.slice(0, 160) : String(e).slice(0, 160);
    }
  }
  return { clusters: bouw(items, u), gebruiktModel, fout };
}

/** Aantal onafhankelijke bronnen (verschillende bron-id's) in een cluster. */
export function aantalBronnen(c: Cluster): number {
  // Een kanttekening (NL/BE-item zonder Frankrijk-link) is geen onafhankelijke bron en telt niet mee.
  return new Set(c.items.filter((i) => !isKanttekeningItem(i)).map((i) => i.bronId)).size;
}
