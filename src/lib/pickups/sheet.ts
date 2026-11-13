// Leitura da planilha de retirada de camisas (retirada-dos-atletas.xlsx): uma aba por competição.
// Sem imports com "@/": este arquivo também é usado pelo script de importação (Node puro).
import ExcelJS from "exceljs";
import { fold, parseCompetition } from "../checkin/sheet.ts";
import type { Competition } from "../checkin/sheet.ts";

export const PICKUP_HEADERS = [
  "Inscrição/Equipe",
  "Atleta/Integrante",
  "Tamanho da Camisa",
  "Box/Academia",
  "E-mail",
  "Telefone",
] as const;

type Header = (typeof PICKUP_HEADERS)[number];

export type PickupSheetRow = {
  /** Chave estável: competição + equipe + atleta + ordem da repetição. */
  sourceKey: string;
  competition: Competition;
  teamName: string;
  fullName: string;
  shirtSize: string;
  box: string;
  email: string;
  phone: string;
  /** Aba e linha de origem, para os avisos. */
  sheet: string;
  line: number;
};

export type ParsedPickupWorkbook = {
  rows: PickupSheetRow[];
  /** Linhas ignoradas e pontos de atenção, em português. */
  warnings: string[];
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Texto de uma célula: aceita texto, número, link (e-mail vira hiperlink no Excel) e texto formatado. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const v = value as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(v.richText)) return cellText(v.richText.map((t) => t.text).join(""));
    if (v.text !== undefined) return cellText(v.text);
    if (v.result !== undefined) return cellText(v.result);
    return "";
  }
  return String(value).replace(/\s+/g, " ").trim();
}

/** Chave de uma linha da planilha. `occurrence` distingue o mesmo nome repetido na mesma equipe. */
export const pickupSourceKey = (competition: Competition, teamName: string, fullName: string, occurrence: number) =>
  ["planilha", competition, fold(teamName), fold(fullName), occurrence].join("|");

/**
 * Lê as abas da planilha. O nome da aba define a competição ("ATLETAS HIBRIDO GAMES" / "ATLETAS HIBRIDO RACE").
 * Linhas sem nome são ignoradas em silêncio; sem tamanho ou com e-mail inválido, ignoradas com aviso.
 * Nome repetido na mesma equipe é importado e avisado: cada linha é uma camisa.
 */
export async function parsePickupWorkbook(data: Uint8Array | ArrayBuffer): Promise<ParsedPickupWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data as unknown as ArrayBuffer);

  const rows: PickupSheetRow[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();

  for (const sheet of workbook.worksheets) {
    const competition = parseCompetition(sheet.name);
    if (!competition) {
      warnings.push(`Aba “${sheet.name}” ignorada: o nome não indica a competição (Games ou Race).`);
      continue;
    }

    const header: string[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) header.push(cellText(sheet.getRow(1).getCell(c).value));
    const index = Object.fromEntries(PICKUP_HEADERS.map((h) => [h, header.indexOf(h) + 1])) as Record<Header, number>;
    const missing = PICKUP_HEADERS.filter((h) => index[h] < 1);
    if (missing.length) throw new Error(`Colunas ausentes na aba “${sheet.name}”: ${missing.join(", ")}.`);

    for (let line = 2; line <= sheet.rowCount; line++) {
      const row = sheet.getRow(line);
      const get = (h: Header) => cellText(row.getCell(index[h]).value);
      const fullName = get("Atleta/Integrante");
      if (!fullName) continue;

      const shirtSize = get("Tamanho da Camisa").toUpperCase();
      const email = get("E-mail").toLowerCase();
      const where = `${sheet.name}, linha ${line} (${fullName})`;
      if (!shirtSize) {
        warnings.push(`${where}: sem tamanho de camisa. Linha ignorada.`);
        continue;
      }
      if (!EMAIL.test(email)) {
        warnings.push(`${where}: e-mail ausente ou inválido. Linha ignorada.`);
        continue;
      }

      const teamName = get("Inscrição/Equipe") || fullName;
      const base = [competition, fold(teamName), fold(fullName)].join("|");
      const occurrence = (seen.get(base) ?? 0) + 1;
      seen.set(base, occurrence);
      if (occurrence > 1) warnings.push(`${where}: nome repetido na equipe “${teamName}”. Importado como outra camisa.`);

      rows.push({
        sourceKey: pickupSourceKey(competition, teamName, fullName, occurrence),
        competition,
        teamName,
        fullName,
        shirtSize,
        box: get("Box/Academia"),
        email,
        phone: get("Telefone"),
        sheet: sheet.name,
        line,
      });
    }
  }

  return { rows, warnings };
}
