// Droge run: oogst en clustering echt, opslag in het geheugen (niets naar Supabase).
// Zonder ANTHROPIC_API_KEY wordt de synthese overgeslagen en clustert alleen de heuristiek.
import { maakModelClient } from "../lib/motor/ai";
import { draaiOogst } from "../lib/motor/motor";
import { GeheugenOpslag } from "../lib/motor/opslag";
import { clusterItems, aantalBronnen } from "../lib/motor/cluster";
import { clusterRegime } from "../lib/motor/score";
import { laadConfig } from "../lib/motor/config";

async function main() {
const opslag = new GeheugenOpslag();
const client = maakModelClient();
const r = await draaiOogst({ opslag, client, droog: true });
console.log(JSON.stringify({ aantallen: r.aantallen, stappen: r.stappen, fouten: r.fouten }, null, 1));
const cfg = laadConfig();
const pool = await opslag.openItems(new Date(Date.now() - cfg.venstersUren * 3600_000).toISOString());
const { clusters } = await clusterItems(pool, client);
const meer = clusters.filter((c) => c.items.length >= 2).sort((a, b) => b.items.length - a.items.length);
console.log(`\nClusters met >=2 items: ${meer.length}; geschikt (pers>=${cfg.minBronnenPers} bronnen of overheid): ${clusters.filter((c) => (clusterRegime(c) === "overheid" ? 1 : cfg.minBronnenPers) <= aantalBronnen(c)).length}`);
for (const c of meer.slice(0, 8)) console.log(`- [${aantalBronnen(c)} bronnen] ${c.items.map((i) => `${i.bronNaam.split(" ")[0]}: ${i.titel.slice(0, 70)}`).join(" | ")}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
