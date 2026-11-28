// Genereert de INSERT-regels voor de migratie 20261128130000_nv_bronnen.sql uit data/bronnen.json en The Connexion als radarbron.
// Gebruik: npx tsx scripts/genereer-bronnen-migratie.ts > /tmp/inserts.sql  (de uitvoer staat al in de migratie; draai opnieuw bij wijziging van het bestand).
import { terugvalBronnen } from "../lib/motor/bronnenlijst";
import { RADAR_UITSLUIT } from "../lib/motor/radar";
import type { BronRij } from "../lib/motor/types";

const q = (v: string | null | undefined) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const b = (v: boolean) => (v ? "true" : "false");

const rijen: BronRij[] = terugvalBronnen().map((r) =>
  r.soort === "radar" ? { ...r, uitsluit: RADAR_UITSLUIT.map((u) => ({ reden: u.reden, patroon: u.patroon.source, vlaggen: u.patroon.flags })) } : r
);

console.log("insert into public.nv_bronnen (id, naam, feed, domein, taal, land, groep, regime, status, prioriteit, frankrijk_filter, venster_uren, notitie, soort, actief, toegevoegd_door, uitsluit) values");
console.log(
  rijen
    .map((r) =>
      `  (${[q(r.id), q(r.naam), q(r.feed), q(r.domein), q(r.taal), q(r.land), q(r.groep), q(r.regime), q(r.status), r.prioriteit, b(r.frankrijkFilter), r.vensterUren, q(r.notitie), q(r.soort), b(r.actief), q("bronnen.json (eenmalige vulling)"), r.uitsluit ? `${q(JSON.stringify(r.uitsluit))}::jsonb` : "null"].join(", ")})`
    )
    .join(",\n")
);
console.log("on conflict (id) do nothing;");
