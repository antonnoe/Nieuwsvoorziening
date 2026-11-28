import { notFound } from "next/navigation";
import { Beeld } from "../../../_componenten/Kaart";
import Melding from "../../_componenten/Melding";
import Terugvelden from "../../_componenten/Terugvelden";
import Uitklap from "../../_componenten/Uitklap";
import TekenKnop from "./TekenKnop";
import { ID_VORM, beeldbankKeuzes } from "@/lib/redactie-acties";
import PeilBlok from "../../_componenten/PeilBlok";
import { laadPeilBlok } from "@/lib/redactie-peil";
import { eisToegang, leesMelding } from "@/lib/redactie-pagina";
import { UITLEG_VOORSTELLEN, magTochPlaatsen } from "@/lib/redactie-vandaag";
import { CATEGORIE_VOL, HERFORMULERING, aantalBronnen } from "@/lib/site";

type SP = Promise<{ m?: string; ok?: string }>;

export default async function BerichtScherm({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { opslag, toegang } = await eisToegang();
  const { id } = await params;
  const melding = leesMelding(await searchParams);
  if (!opslag || !ID_VORM.test(id)) notFound();
  const b = await opslag.redactieBericht(id).catch(() => null);
  if (!b) notFound();
  const pad = `/redactie/bericht/${id}`;
  const keuzes = await beeldbankKeuzes(opslag, b);
  const peilData = await laadPeilBlok(opslag, b, toegang.rol === "beheerder");
  const weg = b.redactie === "weg";
  const alinea = b.tekst.split(/\n{2,}/).map((a) => a.trim()).filter(Boolean);
  return (
    <>
      <a className="terug" href="/redactie">‹ Terug naar de lijst</a>
      <Melding melding={melding} />
      <Beeld b={b} />
      <p className="stil">
        {weg ? <span className="label weg">weg</span> : b.status !== "gepubliceerd" ? <span className="label">{b.status === "geblokkeerd" ? "tegengehouden" : "niet geplaatst"}</span> : null}
        {CATEGORIE_VOL[b.categorie]} · {aantalBronnen(b.bronnen.length)}
      </p>
      <h1>{b.kop}</h1>
      <p className="samenvatting">{b.samenvatting}</p>
      <details className="tekst">
        <summary>Tekst lezen</summary>
        {alinea.map((a, n) => <p key={n}>{a}</p>)}
        <p className="herformulering">{HERFORMULERING}</p>
      </details>
      <PeilBlok data={peilData} />

      {magTochPlaatsen(b) && (
        <form method="post" action="/redactie/actie">
          <Terugvelden actie="plaats" id={id} terug="/redactie" />
          <p className="stil">{UITLEG_VOORSTELLEN}</p>
          <button type="submit" className="rd-knop hoofd">Toch plaatsen</button>
        </form>
      )}
      <div className="knop-rij">
        <Uitklap titel="Ander beeld uit de beeldbank">
          {keuzes.length === 0 ? (
            <p className="stil">De beeldbank is nu niet beschikbaar.</p>
          ) : (
            <div className="keuzes">
              {keuzes.map((i) => (
                <form key={i.id} method="post" action="/redactie/actie">
                  <Terugvelden actie="beeld" id={id} terug={pad} extra={{ illustratie: i.id }} />
                  <button type="submit" aria-label={`Kies dit beeld: ${i.naam}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.svg} alt="" loading="lazy" />
                    <span>{i.naam}</span>
                  </button>
                </form>
              ))}
            </div>
          )}
        </Uitklap>
        <TekenKnop id={id} />
        <form method="post" action="/redactie/actie">
          <Terugvelden actie={weg ? "terug" : "weg"} id={id} terug={pad} />
          {weg ? <button type="submit" className="rd-knop hoofd">Terugzetten</button> : <button type="submit" className="rd-knop gevaar">Weg, nergens tonen</button>}
        </form>
      </div>
      <a className="terug" href="/redactie">‹ Terug naar de lijst</a>
    </>
  );
}
