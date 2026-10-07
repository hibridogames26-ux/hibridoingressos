import ExcelJS from "exceljs";
import { formatCpf, formatPhone } from "@/lib/checkout";
import { orderStatusLabel, paymentMethodLabel, shirtFulfillmentLabel } from "@/lib/labels";
import type { ShirtLotRow, ShirtOrderRow } from "@/lib/shirt-orders";
import { formatOrderCode, withAllSizes } from "@/lib/shirts";

const MONEY = '"R$" #,##0.00';
const DATE_TIME = "dd/mm/yyyy hh:mm";
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDF3" } } as const;

/** Neutraliza células de texto que o Excel/Sheets poderia interpretar como fórmula. */
export function safeText(value: string | null | undefined): string {
  const text = value ?? "";
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** Data/hora de São Paulo (UTC−3, sem horário de verão) como instante "ingênuo" para a planilha. */
export function toSheetDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : new Date(time - 3 * 3600 * 1000);
}

const cents = (value: number | null | undefined) => (value === null || value === undefined ? null : value / 100);

export const ORDERS_SHEET = "Encomendas";
export const LOT_SHEET = "Lote por tamanho";

type Column = { header: string; width: number; value: (o: ShirtOrderRow) => string | number | Date | null; format?: string; align?: "right" };

const settled = (o: ShirtOrderRow) => o.status === "pago" || o.status === "estornado";

const ORDER_COLUMNS: Column[] = [
  { header: "Pedido", width: 12, value: (o) => formatOrderCode(o.code) },
  { header: "Criado em", width: 17, value: (o) => toSheetDate(o.created_at), format: DATE_TIME },
  { header: "Comprador", width: 28, value: (o) => safeText(o.buyer_name) },
  { header: "E-mail", width: 30, value: (o) => safeText(o.buyer_email) },
  { header: "CPF", width: 16, value: (o) => formatCpf(o.buyer_cpf) },
  { header: "Telefone", width: 17, value: (o) => (o.buyer_phone ? formatPhone(o.buyer_phone) : null) },
  { header: "Produto", width: 28, value: (o) => safeText(o.product_name) },
  { header: "Tamanho", width: 10, value: (o) => safeText(o.size) },
  { header: "Qtd", width: 7, value: (o) => o.quantity, format: "0", align: "right" },
  { header: "Preço unit. (R$)", width: 16, value: (o) => cents(o.unit_price_cents), format: MONEY, align: "right" },
  { header: "Cupom", width: 16, value: (o) => safeText(o.coupon_code) || null },
  { header: "Desconto (R$)", width: 14, value: (o) => (o.discount_cents > 0 ? cents(o.discount_cents) : null), format: MONEY, align: "right" },
  { header: "Acréscimo cartão (R$)", width: 20, value: (o) => cents(Math.max(0, o.total_cents - o.subtotal_cents)), format: MONEY, align: "right" },
  { header: "Total (R$)", width: 14, value: (o) => cents(o.total_cents), format: MONEY, align: "right" },
  { header: "Taxas (R$)", width: 13, value: (o) => (settled(o) ? cents(o.fee_cents) : null), format: MONEY, align: "right" },
  { header: "Líquido (R$)", width: 14, value: (o) => (settled(o) ? cents(o.net_cents) : null), format: MONEY, align: "right" },
  {
    header: "Pagamento",
    width: 14,
    value: (o) => (o.payment_method ? paymentMethodLabel[o.payment_method] : o.status === "pago" && o.total_cents === 0 ? "Sem pagamento" : null),
  },
  { header: "Status", width: 12, value: (o) => orderStatusLabel[o.status] },
  // O andamento só tem significado para encomendas pagas.
  { header: "Andamento", width: 20, value: (o) => (o.status === "pago" ? shirtFulfillmentLabel[o.fulfillment_status] : null) },
  { header: "Pago em", width: 17, value: (o) => toSheetDate(o.paid_at), format: DATE_TIME },
  { header: "ID Mercado Pago", width: 18, value: (o) => safeText(o.mp_payment_id) || null },
  { header: "Prazo informado", width: 30, value: (o) => safeText(o.production_lead_time) },
  { header: "Recebimento", width: 30, value: (o) => safeText(o.receipt_details) },
];

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 22;
}

function addOrdersSheet(workbook: ExcelJS.Workbook, orders: ShirtOrderRow[]) {
  const sheet = workbook.addWorksheet(ORDERS_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = ORDER_COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  styleHeader(sheet.getRow(1));

  for (const order of orders) {
    const row = sheet.addRow(ORDER_COLUMNS.map((c) => c.value(order)));
    ORDER_COLUMNS.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.format) cell.numFmt = c.format;
      if (c.align) cell.alignment = { horizontal: c.align };
    });
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ORDER_COLUMNS.length } };
}

const LOT_HEADERS = ["Tamanho", "Pagas (lote)", "Aguardando produção", "Em produção", "Pronto", "Entregue"] as const;

function addLotSheet(workbook: ExcelJS.Workbook, lot: ShirtLotRow[], sizeGrid: string[], generatedAt: Date) {
  const sheet = workbook.addWorksheet(LOT_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = LOT_HEADERS.map((header, i) => ({ header, width: i === 0 ? 14 : 20 }));
  styleHeader(sheet.getRow(1));

  const empty = (size: string): ShirtLotRow => ({
    size,
    paid_units: 0,
    paid_orders: 0,
    pending_units: 0,
    waiting_units: 0,
    in_production_units: 0,
    ready_units: 0,
    delivered_units: 0,
    gross_cents: 0,
  });
  const rows = withAllSizes(lot, sizeGrid, empty);
  const totals = [0, 0, 0, 0, 0];

  for (const r of rows) {
    const values = [r.paid_units, r.waiting_units, r.in_production_units, r.ready_units, r.delivered_units].map(Number);
    values.forEach((v, i) => (totals[i] += v));
    const row = sheet.addRow([safeText(r.size), ...values]);
    for (let c = 2; c <= 6; c++) {
      row.getCell(c).numFmt = "0";
      row.getCell(c).alignment = { horizontal: "right" };
    }
  }

  const total = sheet.addRow(["Total", ...totals]);
  total.font = { bold: true };
  total.fill = HEADER_FILL;
  for (let c = 2; c <= 6; c++) {
    total.getCell(c).numFmt = "0";
    total.getCell(c).alignment = { horizontal: "right" };
  }

  sheet.addRow([]);
  const note = sheet.addRow(["Soma todas as encomendas pagas, independentemente dos filtros usados na tela. Pendentes, canceladas e estornadas ficam de fora."]);
  note.font = { italic: true, color: { argb: "FF686B82" } };
  const stamp = sheet.addRow([`Gerado em ${toSheetDate(generatedAt.toISOString())!.toISOString().slice(0, 16).replace("T", " ")}`]);
  stamp.font = { italic: true, color: { argb: "FF686B82" } };
}

export type ShirtWorkbookInput = {
  /** Encomendas já filtradas. Se omitido, o arquivo traz só a aba do lote. */
  orders?: ShirtOrderRow[];
  lot: ShirtLotRow[];
  /** Grade de tamanhos do produto, para listar também os tamanhos sem encomendas. */
  sizeGrid: string[];
  generatedAt?: Date;
};

/** Monta o .xlsx: aba "Encomendas" (opcional) e aba "Lote por tamanho" (sem dados pessoais). */
export async function buildShirtWorkbook({ orders, lot, sizeGrid, generatedAt = new Date() }: ShirtWorkbookInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Híbrido Games";
  workbook.created = generatedAt;
  if (orders) addOrdersSheet(workbook, orders);
  addLotSheet(workbook, lot, sizeGrid, generatedAt);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
