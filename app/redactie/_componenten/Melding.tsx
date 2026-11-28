export default function Melding({ melding }: { melding: { tekst: string; ok: boolean } | null }) {
  if (!melding) return null;
  return <p className={`melding${melding.ok ? "" : " fout"}`} role="status">{melding.tekst}</p>;
}
