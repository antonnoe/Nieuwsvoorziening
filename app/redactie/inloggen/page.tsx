import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { leesOpslag } from "@/lib/motor/api";
import { REDACTIE_COOKIE, bepaalToegang } from "@/lib/redactie-toegang";
import { redactieGeheim } from "@/lib/redactie";

type SP = Promise<{ fout?: string }>;

const FOUTEN: Record<string, string> = {
  onjuist: "Dat is niet de juiste sleutel.",
  "te-vaak": "Te veel pogingen. Probeer het over tien minuten opnieuw.",
  dicht: "Inloggen met een sleutel is nog niet ingesteld.",
};

export default async function Inloggen({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  if (await bepaalToegang((await cookies()).get(REDACTIE_COOKIE)?.value, leesOpslag())) redirect("/redactie");
  const fout = sp.fout ? FOUTEN[sp.fout] : null;
  return (
    <>
      <h1>Redactie</h1>
      <p className="groot">Gebruik de link die u van Anton kreeg. Werkt die niet meer, vraag Anton om een nieuwe.</p>
      {redactieGeheim() && (
        <details className="beheerder" open={Boolean(fout)}>
          <summary>Inloggen als beheerder</summary>
          {fout && <p className="melding fout" role="alert">{fout}</p>}
          <form className="veld" method="post" action="/redactie/aanmelden">
            <div>
              <label htmlFor="sleutel">Sleutel van de beheerder</label>
              <input id="sleutel" name="sleutel" type="password" autoComplete="current-password" required />
            </div>
            <button className="rd-knop hoofd" type="submit">Inloggen</button>
          </form>
        </details>
      )}
    </>
  );
}
