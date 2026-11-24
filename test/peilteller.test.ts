import test from "node:test";
import assert from "node:assert/strict";
import { telPeil, amsterdamJaarMaand } from "../lib/peilteller";
import type { PeilParameter } from "../lib/motor/types";

const p = (id: string, verificatiedatum?: string): PeilParameter => ({ id, naam: id, verificatiedatum });
const data = [
  p("a", "2026-11-15"), p("b", "2026-11-01"), p("c", "2026-11-30"),
  p("d", "2026-10-31"), p("e", "2026-01-02"), p("f", "2025-11-20"),
  p("g"), p("h", "onzin"),
];

test("telt kalendermaand en kalenderjaar op verificatiedatum", () => {
  const t = telPeil(data, Date.parse("2026-11-24T12:00:00Z"), "2026-11-15");
  assert.equal(t.maand.bijgewerkt, 3);
  assert.equal(t.maand.periode, "2026-11");
  assert.equal(t.jaar.bijgewerkt, 5);
  assert.equal(t.jaar.periode, "2026");
  assert.equal(t.totaalParameters, 8);
  assert.equal(t.peilStand, "2026-11-15");
  assert.equal(t.geteldOp, "2026-11-24T12:00:00.000Z");
});

test("kalendermaand volgt Europe/Amsterdam, niet UTC", () => {
  // 31 oktober 23:30 UTC is in Amsterdam al 1 november 00:30 (wintertijd, UTC+1)
  assert.deepEqual(amsterdamJaarMaand(Date.parse("2026-10-31T23:30:00Z")), { jaar: "2026", maand: "11" });
  // 31 december 23:30 UTC is in Amsterdam al 1 januari
  assert.deepEqual(amsterdamJaarMaand(Date.parse("2026-12-31T23:30:00Z")), { jaar: "2027", maand: "01" });
  const t = telPeil(data, Date.parse("2026-10-31T23:30:00Z"));
  assert.equal(t.maand.periode, "2026-11");
  assert.equal(t.maand.bijgewerkt, 3);
});

test("uitvoer heeft geen veld toegevoegd en geen GitHub-adres", () => {
  const s = JSON.stringify(telPeil(data, Date.parse("2026-11-24T12:00:00Z")));
  assert.ok(!/toegevoegd/.test(s.replace(/wat nieuw is toegevoegd is niet te tellen/, "")));
  assert.ok(!/github/i.test(s));
});

test("lege lijst geeft nullen", () => {
  const t = telPeil([], Date.parse("2026-11-24T12:00:00Z"));
  assert.equal(t.maand.bijgewerkt, 0);
  assert.equal(t.jaar.bijgewerkt, 0);
});
