import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { LOT_SHEET, ORDERS_SHEET, buildShirtWorkbook, safeText, toSheetDate } from "./shirt-xlsx";
import type { ShirtLotRow, ShirtOrderRow } from "./shirt-orders";

const order = (over: Partial<ShirtOrderRow> = {}): ShirtOrderRow => ({
  id: "3f0c2a52-9d3e-4c1e-8f55-0a6d9b1c7e21",
  code: "K7M2P9QA",
  buyer_name: "Ana Souza",
  buyer_email: "ana@example.com",
  buyer_cpf: "52998224725",
  buyer_phone: "83999990000",
  size: "M",
  quantity: 2,
  product_name: "Camisa oficial Híbrido Games",
  unit_price_cents: 8000,
  production_lead_time: "30 dias",
  receipt_details: "Retirada no evento",
  purchase_policy: "Sem troca",
  subtotal_cents: 16000,
  total_cents: 16000,
  fee_cents: 159,
  net_cents: 15841,
  status: "pago",
  fulfillment_status: "em_producao",
  payment_method: "pix",
  mp_payment_id: "123456",
  mp_status: "approved",
  mp_status_detail: "accredited",
  paid_at: "2026-10-20T15:30:00Z",
  expires_at: null,
  created_at: "2026-10-20T15:20:00Z",
  coupon_code: null,
  discount_cents: 0,
  is_test: false,
  ...over,
});

const lotRow = (size: string, over: Partial<ShirtLotRow> = {}): ShirtLotRow => ({
  size,
  paid_units: 0,
  paid_orders: 0,
  pending_units: 0,
  waiting_units: 0,
  in_production_units: 0,
  ready_units: 0,
  delivered_units: 0,
  gross_cents: 0,
  ...over,
});

async function load(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

describe("safeText", () => {
  it("neutraliza fórmulas", () => {
    expect(safeText("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(safeText("+55")).toBe("'+55");
    expect(safeText("-1")).toBe("'-1");
    expect(safeText("@cmd")).toBe("'@cmd");
    expect(safeText("\tx")).toBe("'\tx");
  });

  it("mantém texto comum e trata nulos", () => {
    expect(safeText("Ana Souza")).toBe("Ana Souza");
    expect(safeText(null)).toBe("");
  });
});

describe("toSheetDate", () => {
  it("converte para o horário de São Paulo (UTC−3)", () => {
    expect(toSheetDate("2026-10-20T15:30:00Z")!.toISOString()).toBe("2026-10-20T12:30:00.000Z");
  });

  it("aceita vazio e inválido", () => {
    expect(toSheetDate(null)).toBeNull();
    expect(toSheetDate("não é data")).toBeNull();
  });
});

describe("buildShirtWorkbook", () => {
  const lot = [lotRow("M", { paid_units: 5, waiting_units: 3, in_production_units: 2 }), lotRow("G", { paid_units: 2, ready_units: 2 })];

  it("gera as duas abas na ordem esperada", async () => {
    const wb = await load(await buildShirtWorkbook({ orders: [order()], lot, sizeGrid: ["P", "M", "G"] }));
    expect(wb.worksheets.map((s) => s.name)).toEqual([ORDERS_SHEET, LOT_SHEET]);
  });

  it("grava valores como números e datas, não como texto", async () => {
    const wb = await load(await buildShirtWorkbook({ orders: [order()], lot, sizeGrid: [] }));
    const sheet = wb.getWorksheet(ORDERS_SHEET)!;
    const headers = (sheet.getRow(1).values as string[]).slice(1);
    const cell = (header: string) => sheet.getRow(2).getCell(headers.indexOf(header) + 1);

    expect(cell("Qtd").value).toBe(2);
    expect(cell("Preço unit. (R$)").value).toBe(80);
    expect(cell("Acréscimo cartão (R$)").value).toBe(0);
    expect(cell("Total (R$)").value).toBe(160);
    expect(cell("Total (R$)").numFmt).toBe('"R$" #,##0.00');
    expect(cell("Taxas (R$)").value).toBeCloseTo(1.59);
    expect(cell("Líquido (R$)").value).toBeCloseTo(158.41);
    expect(cell("Criado em").value).toBeInstanceOf(Date);
    expect((cell("Criado em").value as Date).toISOString()).toBe("2026-10-20T12:20:00.000Z");
    expect(cell("Pedido").value).toBe("K7M2-P9QA");
    expect(cell("CPF").value).toBe("529.982.247-25");
    expect(cell("Telefone").value).toBe("(83) 99999-0000");
    expect(cell("Status").value).toBe("Pago");
    expect(cell("Andamento").value).toBe("Em produção");
  });

  it("mostra o acréscimo da taxa repassada no cartão", async () => {
    const card = order({ payment_method: "cartao", subtotal_cents: 16000, total_cents: 16842 });
    const wb = await load(await buildShirtWorkbook({ orders: [card], lot, sizeGrid: [] }));
    const sheet = wb.getWorksheet(ORDERS_SHEET)!;
    const headers = (sheet.getRow(1).values as string[]).slice(1);
    const value = (header: string) => sheet.getRow(2).getCell(headers.indexOf(header) + 1).value;
    expect(value("Acréscimo cartão (R$)")).toBeCloseTo(8.42);
    expect(value("Total (R$)")).toBeCloseTo(168.42);
  });

  it("mostra o cupom e o desconto concedido", async () => {
    const coupon = order({ coupon_code: "CAMPANHA10", discount_cents: 1600, subtotal_cents: 14400, total_cents: 14400 });
    const plain = order();
    const wb = await load(await buildShirtWorkbook({ orders: [coupon, plain], lot, sizeGrid: [] }));
    const sheet = wb.getWorksheet(ORDERS_SHEET)!;
    const headers = (sheet.getRow(1).values as string[]).slice(1);
    const value = (row: number, header: string) => sheet.getRow(row).getCell(headers.indexOf(header) + 1).value;
    expect(value(2, "Cupom")).toBe("CAMPANHA10");
    expect(value(2, "Desconto (R$)")).toBe(16);
    expect(value(3, "Cupom")).toBeNull();
    expect(value(3, "Desconto (R$)")).toBeNull();
  });

  it("encomenda gratuita (cupom de 100%): total zero, desconto cheio e pagamento marcado como ausente", async () => {
    const free = order({
      coupon_code: "CORTESIA100",
      discount_cents: 16000,
      subtotal_cents: 0,
      total_cents: 0,
      fee_cents: 0,
      net_cents: 0,
      payment_method: null,
      mp_payment_id: null,
      mp_status: null,
      mp_status_detail: null,
    });
    const pending = order({ status: "pendente", payment_method: null, total_cents: 16000, paid_at: null });
    const wb = await load(await buildShirtWorkbook({ orders: [free, pending], lot, sizeGrid: [] }));
    const sheet = wb.getWorksheet(ORDERS_SHEET)!;
    const headers = (sheet.getRow(1).values as string[]).slice(1);
    const value = (row: number, header: string) => sheet.getRow(row).getCell(headers.indexOf(header) + 1).value;
    expect(value(2, "Total (R$)")).toBe(0);
    expect(value(2, "Desconto (R$)")).toBe(160);
    expect(value(2, "Taxas (R$)")).toBe(0);
    expect(value(2, "Pagamento")).toBe("Sem pagamento");
    expect(value(2, "Status")).toBe("Pago");
    expect(value(2, "ID Mercado Pago")).toBeNull();
    // Pendente sem forma de pagamento escolhida continua em branco (não é gratuita).
    expect(value(3, "Pagamento")).toBeNull();
  });

  it("deixa em branco o que não se aplica a encomendas não pagas", async () => {
    const pending = order({ status: "pendente", payment_method: null, fee_cents: 0, net_cents: 0, paid_at: null, mp_payment_id: null });
    const wb = await load(await buildShirtWorkbook({ orders: [pending], lot, sizeGrid: [] }));
    const sheet = wb.getWorksheet(ORDERS_SHEET)!;
    const headers = (sheet.getRow(1).values as string[]).slice(1);
    const value = (header: string) => sheet.getRow(2).getCell(headers.indexOf(header) + 1).value;
    expect(value("Status")).toBe("Pendente");
    expect(value("Andamento")).toBeNull();
    expect(value("Taxas (R$)")).toBeNull();
    expect(value("Pagamento")).toBeNull();
    expect(value("Pago em")).toBeNull();
  });

  it("neutraliza fórmulas digitadas pelo comprador", async () => {
    const evil = order({ buyer_name: '=HYPERLINK("http://x")', buyer_email: "+x@e.com" });
    const wb = await load(await buildShirtWorkbook({ orders: [evil], lot, sizeGrid: [] }));
    const sheet = wb.getWorksheet(ORDERS_SHEET)!;
    expect(sheet.getRow(2).getCell(3).value).toBe(`'=HYPERLINK("http://x")`);
    expect(sheet.getRow(2).getCell(4).value).toBe("'+x@e.com");
  });

  it("congela o cabeçalho e ativa o filtro", async () => {
    const wb = await load(await buildShirtWorkbook({ orders: [order()], lot, sizeGrid: [] }));
    const sheet = wb.getWorksheet(ORDERS_SHEET)!;
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.autoFilter).toBeTruthy();
  });

  it("aba do lote lista toda a grade, soma o total e não traz dados pessoais", async () => {
    const wb = await load(await buildShirtWorkbook({ orders: [order()], lot, sizeGrid: ["P", "M", "G"] }));
    const sheet = wb.getWorksheet(LOT_SHEET)!;
    const rows = [2, 3, 4, 5].map((n) => (sheet.getRow(n).values as unknown[]).slice(1));
    expect(rows[0]).toEqual(["P", 0, 0, 0, 0, 0]);
    expect(rows[1]).toEqual(["M", 5, 3, 2, 0, 0]);
    expect(rows[2]).toEqual(["G", 2, 0, 0, 2, 0]);
    expect(rows[3]).toEqual(["Total", 7, 3, 2, 2, 0]);

    const text = JSON.stringify(sheet.getSheetValues());
    expect(text).not.toContain("Ana");
    expect(text).not.toContain("529.982");
  });

  it("sem encomendas, o arquivo do lote tem só a aba do lote", async () => {
    const wb = await load(await buildShirtWorkbook({ lot, sizeGrid: ["M"] }));
    expect(wb.worksheets.map((s) => s.name)).toEqual([LOT_SHEET]);
  });
});
