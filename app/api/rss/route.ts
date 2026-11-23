import { corsHeaders, geenOpslag, geldigeCategorie, jsonAntwoord, leesOpslag, opties } from "@/lib/motor/api";
import { bouwRss } from "@/lib/motor/rss";

export const dynamic = "force-dynamic";
export const OPTIONS = (req: Request) => opties(req);

export async function GET(req: Request) {
  const opslag = leesOpslag();
  if (!opslag) return geenOpslag(req);
  const u = new URL(req.url);
  const catRuw = u.searchParams.get("categorie");
  const categorie = geldigeCategorie(catRuw);
  if (catRuw && !categorie) return jsonAntwoord(req, { fout: "Onbekende categorie." }, 400);
  try {
    const lijst = await opslag.berichten({ categorie, limiet: 30 });
    const xml = bouwRss(lijst, {
      basis: process.env.NIEUWS_BASIS_URL || "https://nieuws.infofrankrijk.com",
      titel: categorie ? `Nieuws over Frankrijk: ${categorie}` : "Nieuws over Frankrijk",
      zelfUrl: u.toString(),
    });
    return new Response(xml, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, s-maxage=300, stale-while-revalidate=600", ...corsHeaders(req) } });
  } catch {
    return jsonAntwoord(req, { fout: "Feed kon niet worden gemaakt." }, 502);
  }
}
