/** @type {import("next").NextConfig} */
const nextConfig = {
  async headers() {
    // Het beheeroverzicht is nooit voor zoekmachines of tussenopslag.
    return [{ source: "/beheer/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
            // De redactie-app (/redactie) is nooit voor zoekmachines of tussenopslag.
            { source: "/redactie/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
            { source: "/redactie", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] },
            { source: "/beheer", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "no-store" }] }];
  },
};
export default nextConfig;
