import { describe, expect, it } from "vitest";
import { available, groupByDate, minQuantity } from "./ticket-types";

describe("ticket-types", () => {
  it("estoque mínimo considera vendidos e reservados", () => {
    expect(minQuantity({ sold: 10, reserved: 12 })).toBe(12);
    expect(minQuantity({ sold: 10, reserved: 0 })).toBe(10);
  });

  it("disponível nunca é negativo", () => {
    expect(available({ quantity: 100, sold: 30, reserved: 32 })).toBe(68);
    expect(available({ quantity: 10, sold: 12, reserved: 0 })).toBe(0);
  });

  it("agrupa por data preservando a ordem", () => {
    const groups = groupByDate([
      { id: "a", event_date: "2026-11-21" },
      { id: "b", event_date: "2026-11-22" },
      { id: "c", event_date: "2026-11-21" },
    ]);
    expect(groups.map(([d, r]) => [d, r.map((x) => x.id)])).toEqual([
      ["2026-11-21", ["a", "c"]],
      ["2026-11-22", ["b"]],
    ]);
  });
});
