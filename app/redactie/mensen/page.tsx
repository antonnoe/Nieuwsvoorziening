import Melding from "../_componenten/Melding";
import Onderbalk from "../_componenten/Onderbalk";
import Terugvelden from "../_componenten/Terugvelden";
import NieuweMens from "./NieuweMens";
import { eisToegang, leesMelding } from "@/lib/redactie-pagina";
import { TZ } from "@/lib/site";

type SP = Promise<{ m?: string; ok?: string }>;

const moment = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "nog niet";

/** Alleen voor de beheerder: vrijwilligers toevoegen (persoonlijke link) en intrekken. */
export default async function Mensen({ searchParams }: { searchParams: SP }) {
  const { toegang, opslag } = await eisToegang({ beheerder: true });
  const melding = leesMelding(await searchParams);
  let mensen: Awaited<ReturnType<NonNullable<typeof opslag>["redacteurLijst"]>> | null = null;
  let zonderTabel = false;
  try {
    mensen = opslag ? await opslag.redacteurLijst() : null;
  } catch (e) {
    zonderTabel = e instanceof Error && e.name === "TabelOntbreekt";
  }
  return (
    <>
      <a className="terug" href="/redactie">‹ Terug naar de lijst</a>
      <h1>Mensen</h1>
      <p className="stil">Wie meewerkt aan de redactie. Iedereen met een link kan alles doen behalve deze pagina.</p>
      <Melding melding={melding} />
      {zonderTabel ? (
        <p className="melding fout">Vrijwilligers toevoegen kan pas als de database is bijgewerkt (tabel nv_redacteuren).</p>
      ) : (
        <NieuweMens />
      )}
      {mensen === null && !zonderTabel && <p className="melding fout">De lijst kon niet worden gelezen.</p>}
      {(mensen || []).map((m) => (
        <article key={m.id} className="persoon">
          <strong>{m.naam}{m.ingetrokkenOp && <span className="label weg">ingetrokken</span>}</strong>
          <span className="stil">{m.rol === "beheerder" ? "Beheerder" : "Redacteur"} · laatst gezien: {moment(m.laatstGezien)}</span>
          {!m.ingetrokkenOp && (
            <form method="post" action="/redactie/actie">
              <Terugvelden actie="mens-intrek" id={m.id} terug="/redactie/mensen" />
              <button type="submit" className="rd-knop gevaar">Intrekken</button>
            </form>
          )}
        </article>
      ))}
      <Onderbalk nu="overig" toegang={toegang} />
    </>
  );
}
