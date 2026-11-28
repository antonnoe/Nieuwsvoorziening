/** @type {import("next").NextConfig} */
const nextConfig = {
  async headers() {
    // Het beheeroverzicht is nooit voor zoekmachines of tussenopslag.
    return [{ source: "/beheer/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
            // De redactie-app (/redactie) is nooit voor zoekmachines of tussenopslag.
            { source: "/redactie/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
            { source: "/redactie", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
            // Inbedvenster (/inbed): bewust in een iframe op de eigen sites; geen X-Frame-Options, wel frame-ancestors met alleen die sites.
            { source: "/inbed", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self' https://www.nederlanders.fr https://nederlanders.fr https://*.ning.com https://infofrankrijk.com https://*.infofrankrijk.com https://infopoche.fr" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
            { source: "/inbed/zijbalk", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self' https://www.nederlanders.fr https://nederlanders.fr https://*.ning.com https://infofrankrijk.com https://*.infofrankrijk.com https://infopoche.fr" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
            { source: "/beheer", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] }];
  },
};
export default nextConfig;
