import type { Metadata, Viewport } from "next";
import "./redactie.css";

export const metadata: Metadata = {
  title: { absolute: "Redactie" },
  robots: { index: false, follow: false, nocache: true },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export const dynamic = "force-dynamic";

export default function RedactieLayout({ children }: { children: React.ReactNode }) {
  return <main id="inhoud" className="rd">{children}</main>;
}
