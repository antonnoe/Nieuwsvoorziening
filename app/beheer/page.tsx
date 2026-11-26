import { redirect } from "next/navigation";

// Gearchiveerd 26-11-2026 (besluit opdrachtgever: één redactietool). Het oude beheeroverzicht staat in archief/beheer;
// alles wat het liet zien (geplaatst, niet geplaatst met reden, laatste ronde) staat nu op /redactie in nlfr-menu.
export default function Beheer() {
  redirect("https://nlfr-menu.vercel.app/redactie");
}
