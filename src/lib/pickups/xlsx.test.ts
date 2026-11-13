import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { toPickupRow, type PickupDbRow } from "./rows";
import { PICKUPS_SHEET, PICKUP_SIZES_SHEET, buildPickupWorkbook } from "./xlsx";

const db = (over: Partial<PickupDbRow> = {}): PickupDbRow => ({
  id: "1",
  origin: "planilha",
  competition: "hibrido-games",
  team_name: "Equipe A",
  full_name: "Paulo Henrique",
  shirt_size: "G",
  box: "Pulse Fit",
  email: "cap@e.com",
  phone: "83999990000",
  athlete_id: null,
  linked_athlete_id: "a1",
  checkin_signed_at: "2026-11-10T10:00:00Z",
  picked_up_at: null,
  delivered_size: null,
  picked_by_name: null,
  picked_by_self: null,
  picked_by_document: null,
  pickup_note: null,
  delivered_by_name: null,
  pickup_batch: null,
  email_sent_at: null,
  ...over,
});

const pending = toPickupRow(db());
const picked = toPickupRow(
  db({
    id: "2",
    full_name: "=cmd|calc",
    team_name: "=cmd|calc",
    shirt_size: "M",
    picked_up_at: "2026-11-14T15:30:00Z",
    delivered_size: "G",
    picked_by_name: "Maria Souza",
    picked_by_self: false,
    picked_by_document: "123.456.789-00",
    pickup_note: "trocou",
    delivered_by_name: "Adm Teste",
    email_sent_at: "2026-11-14T15:31:00Z",
  }),
);
const blocked = toPickupRow(db({ id: "3", full_name: "Sem Cadastro", shirt_size: "P", linked_athlete_id: null, checkin_signed_at: null }));

async function load(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb;
}

const values = (ws: ExcelJS.Worksheet, row: number) => (ws.getRow(row).values as unknown[]).slice(1);

describe("exportação da lista de retirada", () => {
  it("aba Retiradas: colunas da planilha de origem primeiro, depois a situação", async () => {
    const wb = await load(await buildPickupWorkbook({ rows: [pending, picked], all: [pending, picked, blocked], generatedAt: new Date("2026-11-14T16:00:00Z") }));
    const ws = wb.getWorksheet(PICKUPS_SHEET)!;
    expect(values(ws, 1).slice(0, 9)).toEqual([
      "Competição",
      "Inscrição/Equipe",
      "Atleta/Integrante",
      "Tamanho da Camisa",
      "Box/Academia",
      "E-mail",
      "Telefone",
      "Check-in",
      "Situação",
    ]);
    expect(ws.rowCount).toBe(3);

    const first = values(ws, 2);
    expect(first.slice(0, 9)).toEqual(["Híbrido Games", "Equipe A", "Paulo Henrique", "G", "Pulse Fit", "cap@e.com", "83999990000", "Check-in feito", "Pendente"]);

    const second = values(ws, 3);
    // Texto que começa com "=" é neutralizado.
    expect(second[1]).toBe("'=cmd|calc");
    expect(second[2]).toBe("'=cmd|calc");
    expect(second.slice(8, 13)).toEqual(["Retirada", "G", "Maria Souza", "Outra pessoa", "123.456.789-00"]);
    // 15:30 UTC = 12:30 em São Paulo.
    expect((second[13] as Date).toISOString()).toBe("2026-11-14T12:30:00.000Z");
    expect(second.slice(14, 16)).toEqual(["Adm Teste", "trocou"]);
  });

  it("resumo de pendentes por tamanho soma a lista inteira, não só o filtro", async () => {
    const wb = await load(await buildPickupWorkbook({ rows: [picked], all: [pending, picked, blocked], generatedAt: new Date("2026-11-14T16:00:00Z") }));
    const ws = wb.getWorksheet(PICKUP_SIZES_SHEET)!;
    expect(values(ws, 2)).toEqual(["P", 1]);
    expect(values(ws, 3)).toEqual(["G", 1]);
    expect(values(ws, 4)).toEqual(["Total", 2]);
    expect(String(values(ws, 6)[0])).toContain("Retiradas: 1 de 3");
    expect(String(values(ws, 7)[0])).toBe("Gerado em 2026-11-14 13:00");
  });

  it("individual exporta o nome do atleta na coluna da inscrição", async () => {
    const solo = toPickupRow(db({ team_name: "paulo henrique" }));
    const wb = await load(await buildPickupWorkbook({ rows: [solo], all: [solo] }));
    expect(values(wb.getWorksheet(PICKUPS_SHEET)!, 2)[1]).toBe("Paulo Henrique");
  });
});
