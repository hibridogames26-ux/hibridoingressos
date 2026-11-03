import { describe, expect, it } from "vitest";
import {
  auditForAthlete,
  describeAthleteAudit,
  parseCreateForm,
  parseEditForm,
  parseResetForm,
  resetReasonText,
  type CreateFormInput,
  type EditFormInput,
} from "./admin";

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

  it("criação, exclusão e check-in presencial", () => {
    expect(describeAthleteAudit({ kind: "create", detail: { athletes: ["Ana", "Bia"] } })).toEqual({
      title: "Cadastro criado no painel",
      lines: ["Atletas: Ana e Bia."],
    });
    expect(describeAthleteAudit({ kind: "delete", detail: { athletes: ["Ana"] } })).toEqual({ title: "Cadastro excluído", lines: ["Atleta: Ana."] });
    expect(describeAthleteAudit({ kind: "checkin", detail: {} }).title).toBe("Check-in presencial registrado");
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

  it("a criação da dupla aparece para os dois integrantes", () => {
    const rows = [row(1, "a", "create", { athletes: ["A", "B"] }), row(2, "a", "checkin", {})];
    expect(auditForAthlete(rows, "b").map((r) => r.id)).toEqual([1]);
  });
});

describe("parseCreateForm", () => {
  const base: CreateFormInput = {
    competition: "hibrido-race",
    category: " Individual  Feminino ",
    kind: "individual",
    teamName: "",
    email: " Ana@Gmail.com ",
    phone: "(83) 99999-0000",
    box: "",
    athletes: [{ fullName: "  Ana   Souza ", instagram: "", shirtSize: "p" }],
  };

  it("individual: normaliza e usa o nome do atleta como inscrição", () => {
    expect(parseCreateForm(base)).toEqual({
      ok: true,
      registration: {
        competition: "hibrido-race",
        category: "Individual Feminino",
        team_name: "Ana Souza",
        kind: "individual",
        email: "ana@gmail.com",
        phone: "(83) 99999-0000",
        box: null,
      },
      athletes: [{ full_name: "Ana Souza", instagram: null, shirt_size: "P" }],
    });
  });

  it("individual ignora um segundo atleta enviado", () => {
    const r = parseCreateForm({ ...base, athletes: [...base.athletes, { fullName: "Outro", instagram: "", shirtSize: "" }] });
    expect(r.ok && r.athletes).toHaveLength(1);
  });

  it("dupla exige os dois atletas, nomes diferentes e o nome da equipe", () => {
    const r = parseCreateForm({ ...base, kind: "dupla", athletes: [{ fullName: "Ana Souza", instagram: "", shirtSize: "" }] });
    expect(r).toEqual({
      ok: false,
      errors: { "athletes.1.fullName": "Informe o nome do 2º atleta.", teamName: "Informe o nome da equipe." },
    });
    const same = parseCreateForm({
      ...base,
      kind: "dupla",
      teamName: "Equipe",
      athletes: [
        { fullName: "Ana Souza", instagram: "", shirtSize: "" },
        { fullName: "ana souza", instagram: "", shirtSize: "" },
      ],
    });
    expect(same.ok ? null : same.errors["athletes.1.fullName"]).toBe("Os dois atletas estão com o mesmo nome.");
  });

  it("recusa competição, tipo, categoria e e-mail inválidos", () => {
    const r = parseCreateForm({ ...base, competition: "x", kind: "trio", category: "", email: "ana", teamName: "Ana" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(["category", "competition", "email", "kind"]);
  });

  it("entrada vazia ou estranha não quebra", () => {
    expect(parseCreateForm(null).ok).toBe(false);
    expect(parseCreateForm({ athletes: "x" }).ok).toBe(false);
  });
});
