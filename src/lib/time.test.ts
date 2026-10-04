import { describe, expect, it } from "vitest";
import { hoursAgoIso, isRecent, startOfTodaySaoPaulo } from "./time";

describe("time", () => {
  it("início do dia em São Paulo", () => {
    // 01:30 UTC = 22:30 do dia anterior em SP
    expect(startOfTodaySaoPaulo(Date.parse("2026-11-21T01:30:00Z"))).toBe("2026-11-20T03:00:00.000Z");
    expect(startOfTodaySaoPaulo(Date.parse("2026-11-21T15:00:00Z"))).toBe("2026-11-21T03:00:00.000Z");
  });

  it("recente", () => {
    const now = Date.parse("2026-11-21T12:00:10Z");
    expect(isRecent("2026-11-21T12:00:05Z", 10_000, now)).toBe(true);
    expect(isRecent("2026-11-21T11:59:59Z", 10_000, now)).toBe(false);
  });

  it("horas atrás", () => {
    expect(hoursAgoIso(24, Date.parse("2026-11-21T12:00:00Z"))).toBe("2026-11-20T12:00:00.000Z");
  });
});
