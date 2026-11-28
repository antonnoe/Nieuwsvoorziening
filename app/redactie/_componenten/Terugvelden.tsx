/** Verborgen velden voor een formulier dat naar /redactie/actie gaat. */
export default function Terugvelden({ actie, id, terug, extra = {} }: { actie: string; id?: string; terug: string; extra?: Record<string, string> }) {
  return (
    <>
      <input type="hidden" name="actie" value={actie} />
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="terug" value={terug} />
      {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
    </>
  );
}
