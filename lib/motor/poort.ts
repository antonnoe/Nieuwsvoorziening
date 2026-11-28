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

/** Namen (genormaliseerd, kort en lang) van de persbronnen die echt in het bronnenblok van dit cluster staan. */
export function bronnenblokPersNamen(c: Cluster | null): Set<string> {
  const uit = new Set<string>();
  if (!c) return uit;
  for (const i of c.items) {
    if (i.regime !== "pers") continue;
    const n = i.bronNaam.trim();
    if (n.length >= 3) uit.add(normaliseer(n));
    const kort = n.split(/\s[—–-]\s/)[0].trim();
    if (kort.length >= 4) uit.add(normaliseer(kort));
  }
  return uit;
}

/**
 * Namen die het model in de openingszin mag noemen (besluit 28-11-2026): de korte namen van de persbronnen in het bronnenblok,
 * alleen bij minstens twee verschillende media; anders een lege lijst. Overheidsbronnen tellen niet.
 */
export function namenVoorOpeningszin(c: Cluster | null): string[] {
  if (!c) return [];
  const gezien = new Set<string>();
  const uit: string[] = [];
  for (const i of c.items) {
    if (i.regime !== "pers") continue;
    const n = i.bronNaam.trim();
    const kort = n.split(/\s[—–-]\s/)[0].trim();
    const naam = kort.length >= 4 ? kort : n;
    const sleutel = normaliseer(naam);
    if (naam.length < 3 || gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push(naam);
  }
  return uit.length >= 2 ? uit : [];
}

/** Alle persnamen die in een (genormaliseerde) zin staan; een naam die in een andere gevonden naam zit telt niet apart. */
function persNamenInZin(zin: string, namen: string[]): string[] {
  const gevonden = namen.map(normaliseer).filter((n, i, a) => a.indexOf(n) === i && woordRegex(n).test(zin));
  return gevonden.filter((n) => !gevonden.some((m) => m !== n && m.includes(n)));
}

/**
 * De ene toegestane bronvermeldingszin: "<Naam>, <Naam> en <Naam> melden dat ...": minstens twee namen, allemaal media uit het
 * bronnenblok, samen vóór "melden dat" (komma's, "en" voor de laatste), geen naam erna.
 */
export function isBronvermelding(zin: string, gevonden: string[], bronnenblok: Set<string>): boolean {
  if (gevonden.length < 2) return false;
  if (!gevonden.every((n) => bronnenblok.has(n))) return false;
  const m = /\bmelden (?:alle (?:twee|drie|vier) )?dat\b/.exec(zin);
  if (!m) return false;
  let voor = zin.slice(0, m.index).trim();
  const erna = zin.slice(m.index);
  if (gevonden.some((n) => woordRegex(n).test(erna))) return false;
  for (const n of [...gevonden].sort((a, b) => b.length - a.length)) {
    const e = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    voor = voor.replace(new RegExp(`(^|[^a-z0-9])${e}(?=[^a-z0-9]|$)`, "g"), "$1N");
  }
  return /^N(, N)* en N$/.test(voor);
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

  // Kop en samenvatting: nooit een krantennaam. Tekst: één losse naam blokkeert; alleen één bronvermeldingszin met twee of meer
  // media uit het bronnenblok mag (besluit 28-11-2026).
  const alleNamen = persNamenVoor(c);
  const kopEnSamenvatting = normaliseer(`${kop}\n${samenvatting}`);
  for (const naam of alleNamen) if (woordRegex(naam).test(kopEnSamenvatting)) redenen.push(`krantennaam buiten bronnenblok: "${naam}"`);
  const bronnenblok = bronnenblokPersNamen(c);
  let bronvermeldingen = 0;
  for (const zin of tekst.split(/(?<=[.!?])\s+|\n+/)) {
    const z = normaliseer(zin);
    const gevonden = persNamenInZin(z, alleNamen);
    if (!gevonden.length) continue;
    if (isBronvermelding(z, gevonden, bronnenblok)) { bronvermeldingen++; continue; }
    for (const naam of gevonden) redenen.push(`krantennaam buiten bronnenblok: "${naam}"`);
  }
  if (bronvermeldingen > 1) redenen.push("krantennaam buiten bronnenblok: meer dan één bronvermeldingszin");
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
