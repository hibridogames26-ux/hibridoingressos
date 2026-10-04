const SEPARATOR = ";"; // padrão do Excel em pt-BR

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Evita injeção de fórmula ao abrir no Excel/Sheets.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** CSV com BOM UTF-8 para acentuação correta no Excel. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) =>
    row.map(escapeCell).join(SEPARATOR),
  );
  return "﻿" + lines.join("\r\n");
}
