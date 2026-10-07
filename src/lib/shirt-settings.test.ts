import { describe, expect, it } from "vitest";
import { FALLBACK_SHIRT_PRODUCT } from "./shirts";
import {
  SETTINGS_SECTIONS,
  parseSettingsForm,
  parseSizesText,
  settingsInitial,
  type SettingsFormInput,
} from "./shirt-settings";

const base: SettingsFormInput = {
  price: "89,90",
  batchLimit: "120",
  maxPerOrder: "2",
  salesEnd: "2026-11-10T23:59",
  salesStart: "",
  sizes: "p, m g  GG",
  description: "  Camisa oficial ",
  composition: "",
  fit: "",
  leadTime: "30 dias",
  receipt: "Retirada no evento",
  policy: "Sem troca",
  sizeGuide: "Tabela",
};

describe("parseSizesText", () => {
  it("separa por vírgula, ponto e vírgula ou espaço, em maiúsculas e sem repetidos", () => {
    expect(parseSizesText("p, m g  GG")).toEqual(["P", "M", "G", "GG"]);
    expect(parseSizesText("P;P;m")).toEqual(["P", "M"]);
    expect(parseSizesText("  ")).toEqual([]);
  });
});

describe("parseSettingsForm", () => {
  it("converte o formulário para o formato do banco", () => {
    const result = parseSettingsForm(base);
    expect(result).toEqual({
      ok: true,
      values: {
        price_cents: 8990,
        batch_limit: 120,
        max_per_order: 2,
        sales_end: "2026-11-11T02:59:00.000Z",
        sales_start: null,
        sizes: ["P", "M", "G", "GG"],
        description: "Camisa oficial",
        composition: null,
        fit: null,
        production_lead_time: "30 dias",
        receipt_details: "Retirada no evento",
        purchase_policy: "Sem troca",
        size_guide: "Tabela",
      },
    });
  });

  it("campo vazio limpa o valor (o banco recusa se a venda estiver aberta)", () => {
    const result = parseSettingsForm({ ...base, price: "", batchLimit: "", maxPerOrder: "", salesEnd: "", policy: "" });
    expect(result).toMatchObject({
      ok: true,
      values: { price_cents: null, batch_limit: null, max_per_order: null, sales_end: null, purchase_policy: null },
    });
  });

  it("recusa preço, lote e máximo inválidos", () => {
    expect(parseSettingsForm({ ...base, price: "abc" })).toMatchObject({ ok: false });
    expect(parseSettingsForm({ ...base, price: "0" })).toMatchObject({ ok: false });
    expect(parseSettingsForm({ ...base, batchLimit: "0" })).toMatchObject({ ok: false });
    expect(parseSettingsForm({ ...base, batchLimit: "1,5" })).toMatchObject({ ok: false });
    expect(parseSettingsForm({ ...base, maxPerOrder: "11" })).toMatchObject({ ok: false });
  });

  it("valida datas e a ordem entre abertura e prazo final", () => {
    expect(parseSettingsForm({ ...base, salesEnd: "amanhã" })).toMatchObject({ ok: false });
    expect(parseSettingsForm({ ...base, salesStart: "2026-11-20T10:00" })).toMatchObject({ ok: false });
    expect(parseSettingsForm({ ...base, salesStart: "2026-11-01T10:00" })).toMatchObject({ ok: true });
  });

  it("limita a grade", () => {
    expect(parseSettingsForm({ ...base, sizes: "A B C D E F G H I J K L M" })).toMatchObject({ ok: false });
    expect(parseSettingsForm({ ...base, sizes: "ABCDEFGHIJKLM" })).toMatchObject({ ok: false });
    expect(parseSettingsForm({ ...base, sizes: "" })).toMatchObject({ ok: true, values: { sizes: [] } });
  });
});

describe("settingsInitial", () => {
  it("produto fechado e vazio gera formulário vazio", () => {
    expect(settingsInitial(FALLBACK_SHIRT_PRODUCT)).toMatchObject({ price: "", batchLimit: "", maxPerOrder: "", salesEnd: "", sizes: "", leadTime: "" });
  });

  it("ida e volta: o que foi salvo volta igual ao reenviar o formulário", () => {
    const product = {
      ...FALLBACK_SHIRT_PRODUCT,
      price_cents: 8990,
      batch_limit: 120,
      max_per_order: 2,
      sales_end: "2026-11-11T02:59:00.000Z",
      sizes: ["P", "M", "G"],
      production_lead_time: "30 dias",
      receipt_details: "Retirada",
      purchase_policy: "Sem troca",
      size_guide: "Tabela",
    };
    const form = settingsInitial(product);
    expect(form).toMatchObject({ price: "89,90", salesEnd: "2026-11-10T23:59", sizes: "P, M, G" });
    expect(parseSettingsForm(form)).toMatchObject({
      ok: true,
      values: { price_cents: 8990, batch_limit: 120, max_per_order: 2, sales_end: "2026-11-11T02:59:00.000Z", sizes: ["P", "M", "G"] },
    });
  });
});

describe("parseSettingsForm por seção", () => {
  it("só devolve os campos enviados (a aba não sobrescreve o resto)", () => {
    expect(parseSettingsForm({ sizes: "p, m" })).toEqual({ ok: true, values: { sizes: ["P", "M"] } });
    expect(parseSettingsForm({ price: "", batchLimit: "50" })).toEqual({
      ok: true,
      values: { price_cents: null, batch_limit: 50 },
    });
    expect(parseSettingsForm({})).toEqual({ ok: true, values: {} });
  });

  it("valida apenas o que foi enviado", () => {
    expect(parseSettingsForm({ policy: "ok", price: "abc" })).toMatchObject({ ok: false });
    expect(parseSettingsForm({ policy: "x".repeat(3000) })).toMatchObject({ ok: true });
  });

  it("cada seção cobre campos distintos e todos os campos do formulário", () => {
    const keys = Object.values(SETTINGS_SECTIONS).flat();
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(Object.keys(base).sort());
  });
});
