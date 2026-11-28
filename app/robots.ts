import type { MetadataRoute } from "next";
import { BASIS_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/beheer", "/redactie"] }, sitemap: `${BASIS_URL}/sitemap.xml` };
}
