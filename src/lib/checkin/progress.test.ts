import { describe, expect, it } from "vitest";
import { ratio, remaining, summarizeProgress } from "./progress";

const reg = (competition: "hibrido-games" | "hibrido-race", ...confirmed: boolean[]) => ({
  competition,
  athletes: confirmed.map((c) => ({ confirmed: c })),
});

describe("summarizeProgress", () => {
  it("soma atletas e confirmados por competição, na ordem do evento", () => {
    const p = summarizeProgress([reg("hibrido-race", true, false), reg("hibrido-games", true, true), reg("hibrido-games", false)]);
    expect(p).toEqual({
      total: 5,
      confirmed: 3,
      byCompetition: [
        { competition: "hibrido-games", total: 3, confirmed: 2 },
        { competition: "hibrido-race", total: 2, confirmed: 1 },
      ],
    });
    expect(remaining(p)).toBe(2);
    expect(ratio(p)).toBeCloseTo(0.6);
  });

  it("omite competição sem atletas", () => {
    const p = summarizeProgress([reg("hibrido-games", true)]);
    expect(p.byCompetition.map((c) => c.competition)).toEqual(["hibrido-games"]);
  });

  it("lista vazia não divide por zero", () => {
    const p = summarizeProgress([]);
    expect(p).toEqual({ total: 0, confirmed: 0, byCompetition: [] });
    expect(ratio(p)).toBe(0);
    expect(remaining(p)).toBe(0);
  });
});
