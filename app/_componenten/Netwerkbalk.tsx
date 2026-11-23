import { NETWERK, NETWERK_RECHTS } from "@/lib/netwerkbalk";

export default function Netwerkbalk({ hier = "nieuws" }: { hier?: string }) {
  return (
    <div className="net">
      <div className="wrap">
        <nav aria-label="Netwerk van Communities Abroad">
          {NETWERK.map((n) => (
            <a key={n.sleutel} href={n.sleutel === hier ? "/" : n.href} className={n.sleutel === hier ? "hier" : undefined} aria-current={n.sleutel === hier ? "page" : undefined}>
              {n.naam}
            </a>
          ))}
        </nav>
        <a className="ca" href={NETWERK_RECHTS.href}>{NETWERK_RECHTS.naam}</a>
      </div>
    </div>
  );
}
