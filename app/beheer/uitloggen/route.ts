import { cookieKop } from "@/lib/beheer";

export const dynamic = "force-dynamic";

export async function POST() {
  return new Response(null, { status: 303, headers: { location: "/beheer", "set-cookie": cookieKop("", true), "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } });
}
