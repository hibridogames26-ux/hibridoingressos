import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { PICKUP_HEADERS, cellText, parsePickupWorkbook, pickupSourceKey } from "./sheet";

type Line = (string | number | { text: string; hyperlink: string } | null)[];

/** Monta um .xlsx em memória com as abas dadas (cabeçalho da planilha de retirada + linhas). */
async function workbook(sheets: Record<string, Line[]>, headers: readonly string[] = PICKUP_HEADERS) {
  const wb = new ExcelJS.Workbook();
  for (const [name, lines] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    ws.addRow([...headers]);
    for (const line of lines) ws.addRow(line);
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("planilha de retirada", () => {
  it("lê as duas abas, com a competição pelo nome da aba", async () => {
    const { rows, warnings } = await parsePickupWorkbook(
      await workbook({
        "ATLETAS HIBRIDO GAMES": [
          ["100% malte", "  Paulo   Henrique ", "g", "Pulse Fit", "CAP@e.com", 83999990000],
          ["100% malte", "Thiago moura", "GG", "Pulse Fit", { text: "cap@e.com", hyperlink: "mailto:cap@e.com" }, "+55 83 9999-0000"],
        ],
        "ATLETAS HIBRIDO RACE": [["Tony e Rúbia", "Antonio Junior", "P", "", "tony@e.com", ""]],
      }),
    );
    expect(warnings).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      sourceKey: "planilha|hibrido-games|100% malte|paulo henrique|1",
      competition: "hibrido-games",
      teamName: "100% malte",
      fullName: "Paulo Henrique",
      shirtSize: "G",
      box: "Pulse Fit",
      email: "cap@e.com",
      phone: "83999990000",
      sheet: "ATLETAS HIBRIDO GAMES",
      line: 2,
    });
    // E-mail que o Excel transformou em link e telefone como texto.
    expect(rows[1]).toMatchObject({ email: "cap@e.com", phone: "+55 83 9999-0000" });
    expect(rows[2]).toMatchObject({ competition: "hibrido-race", teamName: "Tony e Rúbia", box: "", phone: "" });
  });

  it("nome repetido na mesma equipe vira outra camisa, com aviso", async () => {
    const { rows, warnings } = await parsePickupWorkbook(
      await workbook({
        "ATLETAS HIBRIDO GAMES": [
          ["Ctrl C + Ctrl V", "PAULO RODRIGO", "M", "CFBULL", "p@e.com", "1"],
          ["Ctrl C + Ctrl V", "Paulo Rodrigo", "M", "CFBULL", "p@e.com", "1"],
        ],
      }),
    );
    expect(rows.map((r) => r.sourceKey)).toEqual([
      "planilha|hibrido-games|ctrl c + ctrl v|paulo rodrigo|1",
      "planilha|hibrido-games|ctrl c + ctrl v|paulo rodrigo|2",
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("linha 3");
    expect(warnings[0]).toContain("nome repetido");
  });

  it("individual sem equipe leva o próprio nome; linhas vazias são ignoradas", async () => {
    const { rows } = await parsePickupWorkbook(
      await workbook({ "ATLETAS HIBRIDO GAMES": [["", "Asafe Alves", "M", "Clube", "a@e.com", ""], [null, null, null, null, null, null], ["", "", "M", "", "x@e.com", ""]] }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ teamName: "Asafe Alves", line: 2 });
  });

  it("linha sem tamanho ou com e-mail inválido fica de fora, com aviso", async () => {
    const { rows, warnings } = await parsePickupWorkbook(
      await workbook({
        "ATLETAS HIBRIDO GAMES": [
          ["T", "Sem Tamanho", "", "", "a@e.com", ""],
          ["T", "Sem Email", "M", "", "sem-arroba", ""],
          ["T", "Certo", "M", "", "c@e.com", ""],
        ],
      }),
    );
    expect(rows.map((r) => r.fullName)).toEqual(["Certo"]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toContain("sem tamanho");
    expect(warnings[1]).toContain("e-mail ausente ou inválido");
  });

  it("aba sem competição no nome é ignorada com aviso; coluna ausente é erro", async () => {
    const { rows, warnings } = await parsePickupWorkbook(await workbook({ Resumo: [["T", "X", "M", "", "x@e.com", ""]] }));
    expect(rows).toEqual([]);
    expect(warnings[0]).toContain("Resumo");

    await expect(
      parsePickupWorkbook(await workbook({ "ATLETAS HIBRIDO RACE": [] }, ["Inscrição/Equipe", "Atleta/Integrante", "Box/Academia"])),
    ).rejects.toThrow(/Colunas ausentes.*Tamanho da Camisa, E-mail, Telefone/);
  });

  it("chave e texto de célula", () => {
    expect(pickupSourceKey("hibrido-race", "Tony e  Rúbia", "ANTÔNIO Júnior", 1)).toBe("planilha|hibrido-race|tony e rubia|antonio junior|1");
    expect(cellText(null)).toBe("");
    expect(cellText(83999990000)).toBe("83999990000");
    expect(cellText({ richText: [{ text: "Ana " }, { text: " Souza" }] })).toBe("Ana Souza");
    expect(cellText({ formula: "A1", result: " x " })).toBe("x");
  });
});
