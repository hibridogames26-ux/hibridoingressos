import ExcelJS from "exceljs";
import { COMPETITION_LABEL } from "@/lib/checkin/terms";
import { safeText, toSheetDate } from "@/lib/shirt-xlsx";
import { GATE_LABEL, isSolo, pickupGate, pickupStats, type PickupRow } from "./rows";

const DATE_TIME = "dd/mm/yyyy hh:mm";
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDF3" } } as const;

export const PICKUPS_SHEET = "Retiradas";
export const PICKUP_SIZES_SHEET = "Pendentes por tamanho";

type Column = { header: string; width: number; value: (r: PickupRow) => string | Date | null; format?: string };

const COLUMNS: Column[] = [
  { header: "Competição", width: 16, value: (r) => COMPETITION_LABEL[r.competition] },
  { header: "Inscrição/Equipe", width: 28, value: (r) => safeText(isSolo(r) ? r.name : r.teamName) },
  { header: "Atleta/Integrante", width: 32, value: (r) => safeText(r.name) },
  { header: "Tamanho da Camisa", width: 12, value: (r) => safeText(r.shirtSize) },
  { header: "Box/Academia", width: 22, value: (r) => safeText(r.box) || null },
  { header: "E-mail", width: 30, value: (r) => safeText(r.email) },
  { header: "Telefone", width: 17, value: (r) => safeText(r.phone) || null },
  { header: "Check-in", width: 26, value: (r) => GATE_LABEL[pickupGate(r)] },
  { header: "Situação", width: 12, value: (r) => (r.pickup ? "Retirada" : "Pendente") },
  { header: "Tamanho entregue", width: 12, value: (r) => safeText(r.pickup?.deliveredSize) || null },
  { header: "Retirado por", width: 30, value: (r) => safeText(r.pickup?.byName) || null },
  { header: "Quem retirou", width: 16, value: (r) => (r.pickup ? (r.pickup.bySelf ? "O próprio atleta" : "Outra pessoa") : null) },
  { header: "Documento", width: 18, value: (r) => safeText(r.pickup?.document) || null },
  { header: "Retirado em", width: 17, value: (r) => toSheetDate(r.pickup?.at), format: DATE_TIME },
  { header: "Entregue por", width: 24, value: (r) => safeText(r.pickup?.deliveredByName) || null },
  { header: "Observação", width: 32, value: (r) => safeText(r.pickup?.note) || null },
  { header: "E-mail enviado em", width: 17, value: (r) => toSheetDate(r.pickup?.emailSentAt), format: DATE_TIME },
];

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 22;
}

export type PickupWorkbookInput = {
  /** Linhas já filtradas, na ordem da tela. */
  rows: PickupRow[];
  /** Lista inteira, para o resumo por tamanho (independe dos filtros). */
  all: PickupRow[];
  generatedAt?: Date;
};

/** Monta o .xlsx: aba "Retiradas" (as colunas da planilha de origem + a situação) e resumo de pendentes por tamanho. */
export async function buildPickupWorkbook({ rows, all, generatedAt = new Date() }: PickupWorkbookInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Híbrido Games";
  workbook.created = generatedAt;

  const sheet = workbook.addWorksheet(PICKUPS_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  styleHeader(sheet.getRow(1));
  for (const r of rows) {
    const row = sheet.addRow(COLUMNS.map((c) => c.value(r)));
    COLUMNS.forEach((c, i) => {
      if (c.format) row.getCell(i + 1).numFmt = c.format;
    });
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  const stats = pickupStats(all);
  const sizes = workbook.addWorksheet(PICKUP_SIZES_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  sizes.columns = [
    { header: "Tamanho", width: 14 },
    { header: "Camisas pendentes", width: 20 },
  ];
  styleHeader(sizes.getRow(1));
  for (const s of stats.pendingBySize) {
    const row = sizes.addRow([safeText(s.size), s.count]);
    row.getCell(2).numFmt = "0";
  }
  const total = sizes.addRow(["Total", stats.pending]);
  total.font = { bold: true };
  total.fill = HEADER_FILL;
  total.getCell(2).numFmt = "0";
  sizes.addRow([]);
  const note = sizes.addRow([`Retiradas: ${stats.picked} de ${stats.total}. Soma a lista inteira, independentemente dos filtros usados na tela.`]);
  note.font = { italic: true, color: { argb: "FF686B82" } };
  const stamp = sizes.addRow([`Gerado em ${toSheetDate(generatedAt.toISOString())!.toISOString().slice(0, 16).replace("T", " ")}`]);
  stamp.font = { italic: true, color: { argb: "FF686B82" } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
