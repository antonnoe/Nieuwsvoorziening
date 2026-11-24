import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { BEHEER_COOKIE, GELDIGE_DAG, bearerGeldig, conceptReden, cookieGeldig, dagVan, geheim, laatsteDagen, perDag } from "@/lib/beheer";
import { laadConfig } from "@/lib/motor/config";
import { maakOpslag, type OpgeslagenBericht, type RunRecord } from "@/lib/motor/opslag";
import { CATEGORIE_VOL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Beheer", robots: { index: false, follow: false, nocache: true } };

const tijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dagTekst = (dag: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${dag}T12:00:00Z`));
const verschuif = (dag: string, n: number) => new Date(Date.parse(`${dag}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

export default async function Beheer({ searchParams }: { searchParams: Promise<{ dag?: string; fout?: string }> }) {
  const sp = await searchParams;
  const h = await headers();
  const c = await cookies();

  if (!geheim()) {
    return (
      <main id="inhoud" className="wrap beheer"><h1 className="serif">Beheer</h1><p className="meta">Beheer is dicht: er is geen CRON_SECRET ingesteld.</p></main>
    );
  }
  if (!(bearerGeldig(h.get("authorization")) || cookieGeldig(c.get(BEHEER_COOKIE)?.value))) {
    return (
      <main id="inhoud" className="wrap beheer">
        <h1 className="serif">Beheer</h1>
        <form method="post" action="/beheer/inloggen" className="inlog">
          <label htmlFor="sleutel">Beheersleutel</label>
          <input id="sleutel" name="sleutel" type="password" autoComplete="current-password" required />
          <button className="knop" type="submit">Openen</button>
          {sp.fout === "onjuist" && <p className="fout" role="alert">Die sleutel klopt niet.</p>}
          {sp.fout === "te-vaak" && <p className="fout" role="alert">Te veel pogingen. Probeer het over tien minuten opnieuw.</p>}
        </form>
      </main>
    );
  }

  const cfg = laadConfig();
  const opslag = maakOpslag();
  if (!opslag) return <main id="inhoud" className="wrap beheer"><h1 className="serif">Beheer</h1><p className="meta">Opslag niet geconfigureerd.</p></main>;

  const dagen = laatsteDagen(8);
  const gekozen = sp.dag && GELDIGE_DAG.test(sp.dag) ? sp.dag : dagen[0];
  let berichten: OpgeslagenBericht[] = [], runs: RunRecord[] = [], storing = "";
  try {
    const sinds = new Date(Date.now() - 10 * 86400_000).toISOString();
    [berichten, runs] = await Promise.all([opslag.berichtenVoorBeheer(sinds, 1000), opslag.recenteRuns(60)]);
  } catch (e) {
    storing = e instanceof Error ? e.message.slice(0, 200) : "Onbekende fout";
  }
  const lijstDagen = dagen.includes(gekozen) ? dagen : [gekozen, ...dagen];
  const overzicht = perDag(berichten, runs, lijstDagen);
  const dag = overzicht.find((d) => d.dag === gekozen)!;
  const vandaag = dagVan(Date.now());

  const Rij = ({ b, soort }: { b: OpgeslagenBericht; soort: "geplaatst" | "concept" | "geblokkeerd" }) => (
    <li>
      <div className="rijkop">
        {soort === "geplaatst" ? <a href={`/bericht/${b.id}`}>{b.kop}</a> : <span>{b.kop}</span>}
      </div>
      <div className="meta">
        {tijd(b.gepubliceerdOp)} · {CATEGORIE_VOL[b.categorie] || b.categorie} · score {b.score} · {b.bronnen.length} {b.bronnen.length === 1 ? "bron" : "bronnen"}
        {b.portemonnee ? " · portemonnee" : ""}{b.regelversie ? ` · regelversie ${b.regelversie}` : ""}
      </div>
      {soort === "concept" && <div className="reden">Blijft concept: {conceptReden(b, cfg.publiceerDrempel, cfg.minRelevantie)}</div>}
      {soort === "geblokkeerd" && <div className="reden">Poortreden: {b.blokkadeRedenen.length ? b.blokkadeRedenen.join("; ") : "niet vastgelegd"}</div>}
    </li>
  );
  const Lijst = ({ titel, lijst, soort, leeg }: { titel: string; lijst: OpgeslagenBericht[]; soort: "geplaatst" | "concept" | "geblokkeerd"; leeg: string }) => (
    <section className="blok" aria-labelledby={`h-${soort}`}>
      <h2 id={`h-${soort}`} className="serif">{titel} <span className="telling">{lijst.length}</span></h2>
      {lijst.length ? <ul className="lijst">{lijst.map((b) => <Rij key={b.id} b={b} soort={soort} />)}</ul> : <p className="meta">{leeg}</p>}
    </section>
  );

  return (
    <main id="inhoud" className="wrap beheer">
      <div className="beheerkop">
        <h1 className="serif">Beheer</h1>
        <form method="post" action="/beheer/uitloggen"><button className="pil" type="submit">Uitloggen</button></form>
      </div>
      {storing && <p className="fout" role="alert">De opslag gaf een fout: {storing}</p>}

      <nav className="dagnav" aria-label="Dag kiezen">
        <a className="pil" href={`/beheer?dag=${verschuif(gekozen, -1)}`}>Vorige dag</a>
        <b className="serif">{dagTekst(gekozen)}</b>
        {gekozen < vandaag ? <a className="pil" href={`/beheer?dag=${verschuif(gekozen, 1)}`}>Volgende dag</a> : <span className="pil uit">Volgende dag</span>}
      </nav>

      <div className="dagen" role="table" aria-label="Laatste dagen">
        <div className="dagrij kopje" role="row"><span>Dag</span><span>Geplaatst</span><span>Concept</span><span>Geblokkeerd</span></div>
        {overzicht.map((d) => (
          <a key={d.dag} role="row" className={`dagrij${d.dag === gekozen ? " nu" : ""}`} href={`/beheer?dag=${d.dag}`}>
            <span>{d.dag === vandaag ? "Vandaag" : d.dag.slice(5).split("-").reverse().join("-")}</span>
            <span className={d.geplaatst.length >= 10 ? "goed" : ""}>{d.geplaatst.length}</span><span>{d.concept.length}</span><span>{d.geblokkeerd.length}</span>
          </a>
        ))}
      </div>
      <p className="meta">Doel: 10 tot 20 geplaatst per dag. Drempel {cfg.publiceerDrempel}, minimale relevantie {cfg.minRelevantie}, maximaal {cfg.maxBerichtenPerDag} per dag. Dagen volgens Europe/Amsterdam, naar tijdstip van de run.</p>

      <Lijst titel="Geplaatst" lijst={dag.geplaatst} soort="geplaatst" leeg="Niets geplaatst op deze dag." />
      <Lijst titel="Blijft concept" lijst={dag.concept} soort="concept" leeg="Geen concepten op deze dag." />
      <Lijst titel="Geblokkeerd door de poort" lijst={dag.geblokkeerd} soort="geblokkeerd" leeg="Niets geblokkeerd op deze dag." />

      <section className="blok" aria-labelledby="h-runs">
        <h2 id="h-runs" className="serif">Oogstruns op deze dag <span className="telling">{dag.runs.length}</span></h2>
        {dag.runs.length ? (
          <ul className="lijst">
            {dag.runs.map((r) => {
              const a = r.aantallen || {};
              return (
                <li key={r.gestartOp}>
                  <div className="rijkop">{tijd(r.gestartOp)}{r.droog ? " (droog)" : ""}{r.klaarOp ? "" : " · niet afgerond"}</div>
                  <div className="meta">
                    bronnen {a.bronnenOk ?? "?"}/{a.bronnen ?? "?"} · nieuwe items {a.itemsNieuw ?? "?"} · clusters {a.clusters ?? "?"} · met genoeg bronnen {a.clustersGenoegBronnen ?? "?"} · kandidaten {a.kandidaten ?? "?"} · geplaatst {a.gepubliceerd ?? 0} · concept {a.concept ?? 0} · geblokkeerd {a.geblokkeerd ?? 0} · synthese mislukt {a.syntheseMislukt ?? 0}
                  </div>
                  {r.fouten.length > 0 && <div className="reden">{r.fouten.length} {r.fouten.length === 1 ? "melding" : "meldingen"}: {r.fouten.slice(0, 3).join(" | ").slice(0, 300)}</div>}
                </li>
              );
            })}
          </ul>
        ) : <p className="meta">Geen run op deze dag.</p>}
      </section>
      <p className="meta">Oogstruns worden na 30 dagen opgeruimd.</p>
    </main>
  );
}
