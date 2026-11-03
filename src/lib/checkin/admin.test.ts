import { describe, expect, it } from "vitest";
import { auditForAthlete, describeAthleteAudit, parseEditForm, parseResetForm, resetReasonText, type EditFormInput } from "./admin";

const valid: EditFormInput = {
  fullName: "  Mariana   Alves ",
  instagram: "@mari",
  shirtSize: "m",
  email: " Mariana@Gmail.com ",
  phone: "",
  teamName: "Equipe Exemplo",
  box: "",
  competition: "hibrido-games",
  category: "Dupla Mista",
  status: "aprovado",
};

describe("parseEditForm", () => {
  it("normaliza e separa campos do atleta e da inscrição", () => {
    expect(parseEditForm(valid)).toEqual({
      ok: true,
      athlete: { full_name: "Mariana Alves", instagram: "@mari", shirt_size: "M" },
      registration: {
        email: "mariana@gmail.com",
        phone: null,
        team_name: "Equipe Exemplo",
        box: null,
        competition: "hibrido-games",
        category: "Dupla Mista",
        status: "aprovado",
      },
    });
  });

  it("aponta cada campo obrigatório ou inválido", () => {
    const result = parseEditForm({ ...valid, fullName: " ", email: "mariana.gmail.com", teamName: "", competition: "x", category: "", status: "?" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["category", "competition", "email", "fullName", "status", "teamName"]);
    expect(result.errors.email).toMatch(/@/);
  });

  it("limita tamanhos", () => {
    const result = parseEditForm({ ...valid, fullName: "a".repeat(121), shirtSize: "x".repeat(13) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toMatchObject({ fullName: expect.any(String), shirtSize: expect.any(String) });
  });

  it("entrada que não é objeto vira erros, não exceção", () => {
    expect(parseEditForm(null).ok).toBe(false);
  });
});

describe("parseResetForm", () => {
  it("exige motivo conhecido e texto para “outro”; aviso por e-mail ligado por padrão", () => {
    expect(parseResetForm({ reason: "atestado" })).toEqual({ ok: true, reason: "atestado", note: null, notify: true });
    expect(parseResetForm({ reason: "dados", note: "  CPF ", notify: false })).toEqual({ ok: true, reason: "dados", note: "CPF", notify: false });
    expect(parseResetForm({ reason: "outro", note: " " })).toEqual({ ok: false, message: "Escreva o motivo.", field: "note" });
    expect(parseResetForm({ reason: "xyz" })).toMatchObject({ ok: false, field: "reason" });
  });

  it("texto do motivo para o atleta", () => {
    expect(resetReasonText("atestado", null)).toBe("Atestado ilegível ou inválido");
    expect(resetReasonText("dados", "nome errado")).toBe("Dados do cadastro estavam errados: nome errado");
    expect(resetReasonText("outro", "Categoria trocada")).toBe("Categoria trocada");
  });
});

describe("describeAthleteAudit", () => {
  it("edição lista os campos na ordem do formulário, com rótulos legíveis", () => {
    const d = describeAthleteAudit({
      kind: "edit",
      detail: {
        changes: {
          status: { from: "aprovado", to: "cancelado" },
          full_name: { from: "Marianna", to: "Mariana" },
          competition: { from: "hibrido-games", to: "hibrido-race" },
          box: { from: null, to: "CT 249" },
        },
      },
    });
    expect(d.title).toBe("Cadastro editado");
    expect(d.lines).toEqual([
      "Nome: Marianna → Mariana",
      "Box: vazio → CT 249",
      "Competição: Híbrido Games → Híbrido Race",
      "Situação: Aprovada → Cancelada",
    ]);
  });

  it("reset mostra motivo e observação", () => {
    const d = describeAthleteAudit({ kind: "reset", detail: { reason: "atestado", note: "foto cortada" } });
    expect(d).toEqual({ title: "Check-in refeito", lines: ["Motivo: Atestado ilegível ou inválido (foto cortada)."] });
  });
});

describe("auditForAthlete", () => {
  const row = (id: number, athlete_id: string | null, kind: string, detail: Record<string, unknown>) => ({
    id,
    at: "2026-11-03T12:00:00Z",
    actor_name: "Adm",
    kind,
    detail,
    athlete_id,
  });

  it("mantém o histórico do atleta e só as mudanças da inscrição feitas no parceiro", () => {
    const rows = [
      row(1, "a", "edit", { changes: { full_name: { from: "x", to: "y" } } }),
      row(2, "b", "edit", { changes: { full_name: { from: "p", to: "q" }, email: { from: "o@e.com", to: "n@e.com" } } }),
      row(3, "b", "edit", { changes: { instagram: { from: null, to: "@b" } } }),
      row(4, "b", "reset", { reason: "dados" }),
    ];
    const result = auditForAthlete(rows, "a");
    expect(result.map((r) => r.id)).toEqual([1, 2]);
    expect(Object.keys((result[1].detail as { changes: object }).changes)).toEqual(["email"]);
  });
});
