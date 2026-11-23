import { PEIL_URL, type PeilWeergave, uniekeTools } from "@/lib/site";

/** Groene PEIL-melding. Met links = op de berichtpagina; zonder links = op kaarten (de kaart is zelf een link). */
export default function PeilRegel({ peil, metLinks = false }: { peil: PeilWeergave[]; metLinks?: boolean }) {
  if (!peil.length) return null;
  const tools = uniekeTools(peil);
  const nagelopen = peil.some((p) => p.wordtNagelopen);
  return (
    <div className="peil">
      <i aria-hidden="true">€</i>
      <span>
        Raakt PEIL: {peil.map((p) => p.naam).join(", ")}
        {tools.length > 0 && (
          <>
            , rekent mee in{" "}
            {tools.map((t, i) => (
              <span key={t.naam}>
                {i > 0 && ", "}
                {metLinks && t.url ? <a className="inline" href={t.url}>{t.naam}</a> : t.naam}
              </span>
            ))}
          </>
        )}
        {nagelopen && " (wordt nagelopen)"}
        {metLinks && <a href={PEIL_URL}>Bekijk wat dit voor uw berekening betekent</a>}
      </span>
    </div>
  );
}
