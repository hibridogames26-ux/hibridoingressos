import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { filtersToParams, parseShirtFilters } = await import("./shirt-orders");

describe("parseShirtFilters", () => {
  it("lê busca, status, andamento e tamanho", () => {
    expect(parseShirtFilters({ q: "  Ana  ", status: "pago", andamento: "em_producao", tamanho: "M" })).toEqual({
      q: "Ana",
      status: "pago",
      prod: "em_producao",
      size: "M",
    });
  });

  it("ignora valores inválidos", () => {
    expect(parseShirtFilters({ status: "hackeado", andamento: "x", q: "", tamanho: "" })).toEqual({
      q: undefined,
      status: undefined,
      prod: undefined,
      size: undefined,
    });
    expect(parseShirtFilters({ q: ["a", "b"], status: ["pago"] })).toEqual({
      q: undefined,
      status: undefined,
      prod: undefined,
      size: undefined,
    });
  });

  it("lê o filtro de encomendas de teste", () => {
    expect(parseShirtFilters({ teste: "1" }).test).toBe(true);
    expect(parseShirtFilters({ teste: "0" }).test).toBeUndefined();
    expect(filtersToParams({ test: true }).toString()).toBe("teste=1");
  });

  it("limita o tamanho dos textos", () => {
    expect(parseShirtFilters({ q: "x".repeat(300) }).q).toHaveLength(100);
    expect(parseShirtFilters({ tamanho: "y".repeat(40) }).size).toHaveLength(12);
  });

  it("ida e volta pelos parâmetros da URL", () => {
    const filters = { q: "Ana", status: "pago" as const, prod: "pronto" as const, size: "GG" };
    const sp = filtersToParams(filters, { pagina: 2, vazio: undefined });
    expect(sp.toString()).toBe("q=Ana&status=pago&andamento=pronto&tamanho=GG&pagina=2");
    expect(parseShirtFilters(Object.fromEntries(sp))).toEqual(filters);
  });
});
