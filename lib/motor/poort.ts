// Kwaliteitspoort vóór publicatie. Geeft alle redenen terug, niet alleen de eerste.
import { normaliseer } from "./tekst";
import { letterlijkeReeksen } from "./artikel";
import type { Cluster, Synthese } from "./types";
import type { MotorConfig } from "./config";

/** Zinnen waarmee het model over zijn eigen invoer praat. */
export const META_ZINNEN = [
  "ik kreeg", "de tekst die ik", "beschikbare tekst", "is afgekapt", "het bericht noemt", "ik heb alleen", "geen details over",
  "de aangeleverde", "aangeleverde bron", "de bronnen die ik", "ik heb geen", "ik kan niet", "als ai", "als taalmodel",
  "in de bron staat niet", "volgens de bronnen", "volgens de bron", "niet vermeld in de bron", "de koppen die", "bron 1", "bron 2", "bron 3", "publiceren=",
];

/** Namen van kranten, omroepen en persbureaus die nooit in kop of tekst horen. */
export const PERSNAMEN_EXTRA = [
  "le monde", "le figaro", "liberation", "le parisien", "la croix", "les echos", "ouest-france", "ouest france", "sud ouest", "midi libre",
  "la depeche", "la voix du nord", "franceinfo", "france info", "france 24", "france bleu", "huffpost", "huffington", "20 minutes", "20minutes",
  "actu.fr", "bfmtv", "bfm tv", "cnews", "tf1", "rtl", "europe 1", "rfi", "afp", "reuters", "associated press", "nos", "nu.nl", "nrc", "de volkskrant",
  "volkskrant", "trouw", "de telegraaf", "telegraaf", "ad.nl", "het parool", "rtl nieuws", "vrt", "vrt nws", "de standaard", "het laatste nieuws",
  "het nieuwsblad", "gazet van antwerpen", "rtbf", "bbc", "the guardian", "guardian", "deutsche welle", "public senat", "economie matin", "head patrimoine",
  "anp", "belga", "bnr", "de morgen", "l'express", "le point", "l'obs", "mediapart", "politico",
  "france televisions", "france 2", "france 3", "france 5", "radio france", "france inter", "la tribune", "arte", "m6", "canal+", "lci", "marianne",
  "valeurs actuelles", "le journal du dimanche", "jdd", "challenges", "l'equipe", "le canard enchaine", "nice-matin", "nice matin", "var-matin", "le progres", "le dauphine libere", "l'est republicain", "le telegramme", "la provence", "la montagne", "courrier international",
];

function woordRegex(naam: string): RegExp {
  const e = normaliseer(naam).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${e}([^a-z0-9]|$)`);
}

/** Bronnamen van pers in het cluster (kort en lang) + vaste lijst. Overheidsnamen mogen genoemd worden. */
export function persNamenVoor(c: Cluster | null): string[] {
  const uit = new Set(PERSNAMEN_EXTRA);
  if (c) {
    for (const i of c.items) {
      if (i.regime !== "pers") continue;
      const n = i.bronNaam.trim();
      uit.add(n.toLowerCase());
      const kort = n.split(/\s[—–-]\s/)[0].trim().toLowerCase();
      if (kort.length >= 4) uit.add(kort);
    }
  }
  return [...uit].filter((x) => x.length >= 3);
}

/** Bedragen en percentages in een tekst, genormaliseerd naar cijferreeksen. */
export function bedragenIn(tekst: string): string[] {
  const uit: string[] = [];
  const t = String(tekst || "");
  const re = /(\d{1,3}(?:[ .  ]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(?:€|euro|euros|eur\b|%|procent|pour cent|miljoen|miljard|million|millions|milliard|milliards|mln|mld)|(?:€)\s*(\d{1,3}(?:[ .  ]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)/gi;
  for (const m of t.matchAll(re)) {
    const ruw = m[1] || m[2];
    uit.push(normaliseerGetal(ruw));
  }
  return uit;
}

export function normaliseerGetal(g: string): string {
  let s = String(g).replace(/[\s  ]/g, "");
  // 1.234,56 of 1,234.56 of 1.234 (duizendtal) of 1,5 (decimaal)
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s;
}

/** Alle getallen in de bronnen (voor de vergelijking met bedragen in de tekst). */
export function getallenIn(tekst: string): Set<string> {
  const uit = new Set<string>();
  for (const m of String(tekst || "").matchAll(/\d{1,3}(?:[ .  ]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g)) uit.add(normaliseerGetal(m[0]));
  return uit;
}

export interface PoortUitslag {
  ok: boolean;
  redenen: string[];
}

export function kwaliteitsPoort(s: Synthese, c: Cluster | null, cfg: Pick<MotorConfig, "minTekstTekens" | "minKopTekens" | "minSamenvattingTekens">): PoortUitslag {
  const redenen: string[] = [];
  const kop = s.kop || "";
  const samenvatting = s.samenvatting || "";
  const tekst = s.tekst || "";
  if (kop.trim().length < cfg.minKopTekens) redenen.push("kop te kort of leeg");
  if (samenvatting.trim().length < cfg.minSamenvattingTekens) redenen.push("samenvatting te kort of leeg");
  if (tekst.trim().length < cfg.minTekstTekens) redenen.push("tekst te kort of leeg");

  const woorden = tekst.split(/\s+/).filter(Boolean).length;
  if (woorden > 120 && tekst.split(/\n\s*\n/).filter((a) => a.trim()).length < 2) redenen.push("tekst van meer dan 120 woorden heeft minstens twee alinea's (lege regel ertussen)");

  const alles = normaliseer(`${kop}\n${samenvatting}\n${tekst}`);
  for (const z of META_ZINNEN) if (alles.includes(normaliseer(z))) redenen.push(`model praat over invoer: "${z}"`);

  for (const naam of persNamenVoor(c)) if (woordRegex(naam).test(alles)) redenen.push(`krantennaam buiten bronnenblok: "${naam}"`);
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(?:fr|nl|be|com|org|info|eu)\b/i.test(`${kop} ${samenvatting} ${tekst}`)) redenen.push("link of domeinnaam in tekst");

  // Verzonnen bedragen: elk bedrag in de tekst moet in een bron voorkomen.
  const bronTekst = c ? c.items.map((i) => `${i.titel} ${i.samenvatting} ${i.artikelTekst || ""}`).join(" ") : "";
  const bronGetallen = getallenIn(bronTekst);
  const bron = new Set(bronGetallen);
  for (const b of bedragenIn(`${kop} ${samenvatting} ${tekst}`)) {
    if (!bron.has(b)) redenen.push(`bedrag niet in bron: ${b}`);
  }

  // Niets letterlijk overnemen: geen reeks van 10 woorden uit een artikeltekst.
  if (c) {
    const artikelen = c.items.map((i) => i.artikelTekst || "").join("\n");
    const reeksen = artikelen ? letterlijkeReeksen(`${samenvatting} ${tekst}`, artikelen, 10) : [];
    if (reeksen.length) redenen.push(`letterlijk overgenomen uit een bron: "${reeksen[0]}"`);
  }
  return { ok: redenen.length === 0, redenen: [...new Set(redenen)] };
}
