// Nederlandse PEIL-parameters tonen we alleen als ze Nederlanders in Frankrijk echt raken (besluit 24-11-2026, keuze A in de
// nieuwsbrief). Letterlijk overgenomen positieve lijst uit repo antonnoe/nlfr-nieuwsbrief, lib/nieuwsbrief/peil.ts
// (`NL_RAAKT_FRANKRIJK`, `peilRaaktNlInFrankrijk`); wijzigt die lijst, pas dan ook deze aan. Franse en overige items gaan ongemoeid door.
// Niet: eigen risico Zvw, hoge Zvw-percentage, box 1, 2 en 3, hypotheekrente, overdrachtsbelasting, btw.
const NL_RAAKT_FRANKRIJK = [/^p\.nl\.aow\./, /^p\.nl\.ib\.aow_leeftijd$/, /^p\.nl\.zvw\.percentage_laag$/, /^p\.nl\.zvw\.max_bijdrage_inkomen$/, /^p\.nl\.wlz\./, /^p\.nl\.zorg\.nominale_premie/, /^p\.nl\.zorgtoeslag\./, /^p\.nl\.erf\./, /^p\.nl\.schenk\./, /^p\.nl\.leges\./];

export function peilRaaktNlInFrankrijk(id: string): boolean {
  if (id.split(".")[1] !== "nl") return true;
  return NL_RAAKT_FRANKRIJK.some((re) => re.test(id));
}
