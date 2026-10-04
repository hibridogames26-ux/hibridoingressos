import { describe, expect, it } from "vitest";
import {
  formatBRL,
  formatDateTime,
  formatDayMonth,
  formatEventDate,
  formatEventDateLong,
  formatHourMinute,
  parseReaisToCents,
  percent,
} from "./format";

describe("format", () => {
  it("formata centavos em reais", () => {
    expect(formatBRL(12345).replace(/\s/g, " ")).toBe("R$ 123,45");
    expect(formatBRL(null).replace(/\s/g, " ")).toBe("R$ 0,00");
  });

  it("usa o fuso de São Paulo", () => {
    expect(formatDateTime("2026-11-21T11:30:00Z")).toBe("21/11/2026, 08:30");
  });

  it("formata dia/mês e percentuais", () => {
    expect(formatDayMonth("2026-11-21")).toBe("21/11");
    expect(percent(1, 3)).toBe("33%");
    expect(percent(1, 0)).toBe("0%");
  });

  it("formata a data do evento", () => {
    expect(formatEventDate("2026-11-21")).toBe("sáb, 21/11/2026");
    expect(formatEventDate("2026-11-22", false)).toBe("22/11/2026");
    expect(formatEventDate(null)).toBe("—");
  });

  it("converte reais em centavos", () => {
    expect(parseReaisToCents("150")).toBe(15000);
    expect(parseReaisToCents("150,5")).toBe(15050);
    expect(parseReaisToCents("1.500,50")).toBe(150050);
    expect(parseReaisToCents("R$ 89,90")).toBe(8990);
    expect(parseReaisToCents("89.90")).toBe(8990);
    expect(parseReaisToCents("0")).toBe(0);
    expect(parseReaisToCents("-5")).toBeNull();
    expect(parseReaisToCents("abc")).toBeNull();
    expect(parseReaisToCents("")).toBeNull();
  });

  it("data longa do evento e hora local", () => {
    expect(formatEventDateLong("2026-11-14")).toBe("Sábado, 14/11/2026");
    expect(formatEventDateLong("")).toBe("—");
    expect(formatHourMinute("2026-11-14T11:42:00Z")).toBe("08:42");
  });
});
