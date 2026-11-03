import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanCategory, displayName, fold, groupRegistrations, parseCompetition, parseRegistrationSheet, teamNameFrom } from "./sheet";

const header =
  "<tr><th>Evento</th><th>Categoria</th><th>Inscrição/Equipe</th><th>Tipo</th><th>Atleta/Integrante</th><th>Tamanho da Camisa</th><th>Instagram</th><th>Box/Academia</th><th>E-mail</th><th>Telefone</th><th>Status</th><th>Data</th><th>Adicional pago</th><th>Entrega</th></tr>";
const row = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
const sheet = (rows: string[][]) =>
  `<html><body><table border="1"><thead>${header}</thead><tbody>${rows.map(row).join("")}</tbody></table>
   <table><tbody><tr><td>P</td><td>12</td></tr></tbody></table></body></html>`;

const dupla = (name: string, status = "Aprovado", email = "cap@e.com") => [
  "Hibrido Games",
  "Dupla Rx Masculino",
  "Os Brabos (Ana Lima / Bia Souza)",
  "Integrante",
  name,
  "M",
  "@insta",
  "Box X",
  email,
  "83999990000",
  status,
  "08/10/2026",
  "",
  "Produzir",
];

describe("planilha de inscrições", () => {
  it("lê só a tabela de atletas, decodifica entidades e normaliza campos", () => {
    const rows = parseRegistrationSheet(
      sheet([dupla("Ana Lima"), ["Híbirdo Race", "Rx Individidual Masculino", "Zé &amp; Cia", "Atleta", "Zé", "G", "", "", "ZE@E.COM", "", "Aprovado", "", "", ""]]),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ competition: "hibrido-games", instagram: "insta", registeredOn: "2026-10-08", status: "aprovado" });
    expect(rows[1]).toMatchObject({ competition: "hibrido-race", category: "Rx Individual Masculino", registrationRaw: "Zé & Cia", email: "ze@e.com" });
  });

  it("recusa planilha sem as colunas esperadas", () => {
    expect(() => parseRegistrationSheet("<table><tr><th>Nome</th></tr></table>")).toThrow(/Colunas ausentes/);
  });

  it("agrupa a dupla, junta linhas repetidas e prefere o status aprovado", () => {
    const regs = groupRegistrations(
      parseRegistrationSheet(sheet([dupla("Ana Lima", "Cancelado"), dupla("Bia Souza", "Cancelado"), dupla("Ana Lima"), dupla("Bia Souza")])),
    );
    expect(regs).toHaveLength(1);
    expect(regs[0]).toMatchObject({ teamName: "Os Brabos", kind: "dupla", status: "aprovado", email: "cap@e.com" });
    expect(regs[0].athletes.map((a) => [a.fullName, a.position])).toEqual([
      ["Ana Lima", 1],
      ["Bia Souza", 2],
    ]);
  });

  it("mesma equipe com e-mails diferentes são inscrições diferentes", () => {
    const regs = groupRegistrations(parseRegistrationSheet(sheet([dupla("Ana Lima", "Cancelado", "a@e.com"), dupla("Ana Lima", "Aprovado", "b@e.com")])));
    expect(regs.map((r) => r.status)).toEqual(["cancelado", "aprovado"]);
  });

  it("planilhas reais: 51 inscrições aprovadas e 88 atletas", () => {
    const root = path.resolve(__dirname, "../../..");
    const files = ["camisas-hibrido-games.xls", "camisas-h-birdo-race.xls"].map((f) => path.join(root, f));
    if (!files.every((f) => fs.existsSync(f))) return;
    const regs = files.flatMap((f) => groupRegistrations(parseRegistrationSheet(fs.readFileSync(f, "utf8"))));
    const approved = regs.filter((r) => r.status === "aprovado");
    expect(approved).toHaveLength(51);
    expect(approved.reduce((n, r) => n + r.athletes.length, 0)).toBe(88);
    expect(approved.filter((r) => r.kind === "individual").every((r) => r.athletes.length === 1)).toBe(true);
    expect(new Set(approved.map((r) => r.competition))).toEqual(new Set(["hibrido-games", "hibrido-race"]));
  });
});

describe("helpers", () => {
  it("nome da equipe sem a lista de integrantes", () => {
    expect(teamNameFrom("TEAM CNBOX (Adson / Carlos)")).toBe("TEAM CNBOX");
    expect(teamNameFrom("EMPÓRIO / UBK (Júnior / Amauri)")).toBe("EMPÓRIO / UBK");
    expect(teamNameFrom("Luan Vilar")).toBe("Luan Vilar");
  });

  it("competição pela grafia da planilha", () => {
    expect(parseCompetition("Hibrido Games")).toBe("hibrido-games");
    expect(parseCompetition("Híbirdo Race")).toBe("hibrido-race");
    expect(parseCompetition("Outro")).toBeNull();
  });

  it("categoria e busca sem acento", () => {
    expect(cleanCategory("Rx Individidual  Masculino")).toBe("Rx Individual Masculino");
    expect(fold("  Estácio  RODRIGUES ")).toBe("estacio rodrigues");
  });

  it("nome de exibição corrige só caixa toda alta ou toda baixa", () => {
    expect(displayName("FELIPE ALEXANDRE LIMA NUNES")).toBe("Felipe Alexandre Lima Nunes");
    expect(displayName("Antonio do nascimento santos junior")).toBe("Antonio do Nascimento Santos Junior");
    expect(displayName("Nara Régia da silva DOS Santos")).toBe("Nara Régia da Silva dos Santos");
    expect(displayName("Paulo Rodrigo Lyra De Souza")).toBe("Paulo Rodrigo Lyra De Souza");
    expect(displayName("McDonald e silva")).toBe("McDonald e Silva");
  });
});
