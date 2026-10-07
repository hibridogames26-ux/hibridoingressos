import { describe, expect, it } from "vitest";
import { auditActor, describeAudit, isSizeAudit } from "./shirt-audit";

const d = (kind: string, detail: Record<string, unknown> = {}) => describeAudit({ kind, detail });

describe("describeAudit", () => {
  it("modo de venda", () => {
    expect(d("mode", { from: "fechada", to: "cupom" })).toBe("Modo de venda alterado de Fechada para Somente com cupom.");
  });

  it("tamanhos", () => {
    expect(d("size_disabled", { size: "XG" })).toBe("Tamanho XG desabilitado.");
    expect(d("size_enabled", { size: "XG" })).toBe("Tamanho XG habilitado.");
  });

  it("configurações numéricas, datas e grade", () => {
    expect(d("setting", { field: "price", from: 9000, to: 9500 })).toMatch(/^Preço alterado de .*90,00 para .*95,00\.$/);
    expect(d("setting", { field: "price", from: null, to: 9500 })).toMatch(/de sem valor para/);
    expect(d("setting", { field: "batch_limit", from: 50, to: 60 })).toBe("Limite do lote alterado de 50 para 60.");
    expect(d("setting", { field: "batch_limit", from: null, to: 60 })).toBe("Limite do lote alterado de sem limite para 60.");
    expect(d("setting", { field: "max_per_order", from: 2, to: 3 })).toBe("Máximo por compra alterado de 2 para 3.");
    expect(d("setting", { field: "sales_end", from: null, to: "2026-11-11T02:59:00Z" })).toMatch(/^Data limite alterada de sem data para 10\/11\/2026/);
    expect(d("setting", { field: "sizes", from: ["P", "M"], to: ["P", "M", "G"] })).toBe("Grade de tamanhos alterada de P, M para P, M, G.");
  });

  it("textos e mapas por tamanho só dizem que mudaram", () => {
    expect(d("setting", { field: "policy" })).toBe("Trocas, cancelamento e atendimento editados.");
    expect(d("setting", { field: "size_limits" })).toBe("Limites por tamanho atualizados.");
    expect(d("setting", { field: "algo_novo" })).toBe("Configuração algo_novo alterada.");
  });

  it("cupons", () => {
    expect(d("coupon_created", { code: "CAMP10", kind: "percent", value: 10, is_test: false })).toBe("Cupom CAMP10 criado (10% de desconto).");
    expect(d("coupon_created", { code: "TESTE-AAAA", kind: "final", value: 100, is_test: true })).toMatch(/^Cupom TESTE-AAAA criado \(Valor final .*1,00, teste\)\.$/);
    expect(d("coupon_enabled", { code: "X1" })).toBe("Cupom X1 ativado.");
    expect(d("coupon_disabled", { code: "X1" })).toBe("Cupom X1 desativado.");
    expect(d("coupon_updated", { code: "X1" })).toBe("Cupom X1 editado.");
  });

  it("tipo desconhecido devolve o próprio tipo", () => {
    expect(d("outra_coisa")).toBe("outra_coisa");
  });

  it("autor: nome ou linha de comando", () => {
    expect(auditActor({ actor_name: "Ana" })).toBe("Ana");
    expect(auditActor({ actor_name: null })).toBe("Linha de comando");
  });

  it("isSizeAudit reconhece só alterações de tamanho", () => {
    expect(isSizeAudit({ kind: "size_disabled", detail: { size: "XG" } })).toBe(true);
    expect(isSizeAudit({ kind: "size_enabled", detail: { size: "XG" } })).toBe(true);
    expect(isSizeAudit({ kind: "setting", detail: { field: "sizes" } })).toBe(true);
    expect(isSizeAudit({ kind: "setting", detail: { field: "size_limits" } })).toBe(true);
    expect(isSizeAudit({ kind: "setting", detail: { field: "size_messages" } })).toBe(true);
    expect(isSizeAudit({ kind: "setting", detail: { field: "price" } })).toBe(false);
    expect(isSizeAudit({ kind: "mode", detail: {} })).toBe(false);
    expect(isSizeAudit({ kind: "coupon_created", detail: {} })).toBe(false);
  });
});
