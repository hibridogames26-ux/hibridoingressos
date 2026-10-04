import { describe, expect, it } from "vitest";
import { getCountdown } from "./countdown";

const target = "2026-11-21T08:00:00-03:00";
const t0 = Date.parse(target);

describe("getCountdown", () => {
  it("decompõe o tempo restante", () => {
    const now = t0 - ((2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000);
    expect(getCountdown(target, now)).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
    });
  });

  it("retorna null quando o evento já começou", () => {
    expect(getCountdown(target, t0)).toBeNull();
    expect(getCountdown(target, t0 + 1000)).toBeNull();
  });

  it("retorna null para data inválida", () => {
    expect(getCountdown("não é data", 0)).toBeNull();
  });
});
