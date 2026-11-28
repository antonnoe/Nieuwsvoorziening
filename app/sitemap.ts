import type { MetadataRoute } from "next";
import { leesOpslag } from "@/lib/motor/api";
import { BASIS_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const vast: MetadataRoute.Sitemap = [{ url: `${BASIS_URL}/` }, { url: `${BASIS_URL}/werkwijze` }, { url: `${BASIS_URL}/beeldmateriaal` }];
  const opslag = leesOpslag();
  if (!opslag) return vast;
  try {
    const lijst = await opslag.berichten({ limiet: 500 });
    return [...vast, ...lijst.map((b) => ({ url: `${BASIS_URL}/bericht/${b.id}`, lastModified: new Date(b.gepubliceerdOp) }))];
  } catch {
    return vast;
  }
}
