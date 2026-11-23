import type { Cluster } from "./types";
import { aantalBronnen } from "./cluster";

export function clusterRegime(c: Cluster): "pers" | "overheid" {
  return c.items.every((i) => i.regime === "overheid") ? "overheid" : "pers";
}

/** Score 0..100: 50% relevantie (model), 30% bronnen, 20% versheid. */
export function berekenScore(c: Cluster, relevantie: number, nu = Date.now()): number {
  const n = aantalBronnen(c);
  const bron = clusterRegime(c) === "overheid" ? (n >= 2 ? 90 : 60) : n >= 3 ? 90 : n === 2 ? 65 : 35;
  const nieuwste = Math.max(...c.items.map((i) => Date.parse(i.gepubliceerdOp) || 0));
  const uren = Math.max(0, (nu - nieuwste) / 3600_000);
  const vers = Math.max(0, Math.min(100, 100 - (uren / 36) * 100));
  const rel = Math.max(0, Math.min(100, Number.isFinite(relevantie) ? relevantie : 0));
  return Math.round(0.5 * rel + 0.3 * bron + 0.2 * vers);
}
