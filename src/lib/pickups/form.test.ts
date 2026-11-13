import { describe, expect, it } from "vitest";
import { joinNames, parseAthleteForm, parseConfirmForm, sizeOptions } from "./form";

const ID = "3f0c2a52-9d3e-4c1e-8f55-0a6d9b1c7e21";
const ID2 = "7a1d5c3e-2b4f-4e6a-9c8d-1f2e3a4b5c6d";

const athlete = {
  competition: "hibrido-games",
  fullName: "  Ana   Souza ",
  teamName: "",
  shirtSize: "m",
  box: " CT 249 ",
  email: " Ana@E.com ",
  phone: "",
  athleteId: "",
};

describe("novo atleta e edição", () => {
  it("normaliza e usa o nome do atleta quando a equipe fica em branco", () => {
    const parsed = parseAthleteForm(athlete);
    expect(parsed).toEqual({
      ok: true,
      fields: {
        competition: "hibrido-games",
        full_name: "Ana Souza",
        team_name: "Ana Souza",
        shirt_size: "M",
        box: "CT 249",
        email: "ana@e.com",
        phone: null,
        athlete_id: null,
      },
    });
  });

  it("mantém equipe e vínculo informados", () => {
    const parsed = parseAthleteForm({ ...athlete, teamName: "Dupla X", athleteId: ID });
    expect(parsed.ok && parsed.fields).toMatchObject({ team_name: "Dupla X", athlete_id: ID });
  });

  it("aponta cada campo com problema", () => {
    const parsed = parseAthleteForm({ ...athlete, competition: "outra", fullName: " ", shirtSize: "", email: "sem-arroba", athleteId: "abc" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(Object.keys(parsed.errors).sort()).toEqual(["athleteId", "competition", "email", "fullName", "shirtSize"]);
    expect(parsed.errors.email).toContain("E-mail inválido");
  });

  it("e-mail é obrigatório: é para ele que vai o aviso", () => {
    const parsed = parseAthleteForm({ ...athlete, email: "" });
    expect(!parsed.ok && parsed.errors.email).toContain("aviso da retirada");
  });

  it("entrada que não é objeto vira erros, sem exceção", () => {
    expect(parseAthleteForm(null).ok).toBe(false);
    expect(parseAthleteForm("x").ok).toBe(false);
  });
});

describe("confirmar retirada", () => {
  const confirm = { primaryId: ID, mateIds: [], self: true, name: "", document: "", deliveredSize: "m", note: "" };

  it("o próprio atleta: ignora nome e documento digitados", () => {
    const parsed = parseConfirmForm({ ...confirm, name: "Alguém", document: "123" });
    expect(parsed).toEqual({
      ok: true,
      ids: [ID],
      pickup: { primary_id: ID, self: true, name: "", document: "", delivered_size: "M", note: "" },
    });
  });

  it("outra pessoa: nome obrigatório, documento opcional", () => {
    const missing = parseConfirmForm({ ...confirm, self: false });
    expect(!missing.ok && missing.errors.name).toBe("Informe o nome de quem está retirando.");

    const ok = parseConfirmForm({ ...confirm, self: false, name: " Maria   Souza ", document: " 123 ", note: " ok " });
    expect(ok.ok && ok.pickup).toMatchObject({ self: false, name: "Maria Souza", document: "123", note: "ok" });
  });

  it("junta os parceiros sem repetir ids", () => {
    const parsed = parseConfirmForm({ ...confirm, mateIds: [ID2, ID, ID2] });
    expect(parsed.ok && parsed.ids).toEqual([ID, ID2]);
  });

  it("recusa ids inválidos, lote grande e tamanho vazio", () => {
    expect(parseConfirmForm({ ...confirm, primaryId: "x" })).toMatchObject({ ok: false, message: expect.stringContaining("não encontrado") });
    expect(parseConfirmForm({ ...confirm, mateIds: ["x"] }).ok).toBe(false);
    const many = Array.from({ length: 25 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    expect(parseConfirmForm({ ...confirm, mateIds: many })).toMatchObject({ ok: false, message: expect.stringContaining("até 20") });
    const size = parseConfirmForm({ ...confirm, deliveredSize: " " });
    expect(!size.ok && size.errors.deliveredSize).toBeTruthy();
  });

  it("`self` só vale quando é exatamente true", () => {
    const parsed = parseConfirmForm({ ...confirm, self: "true" });
    expect(!parsed.ok && parsed.errors.name).toBeTruthy();
  });
});

describe("utilitários", () => {
  it("lista de tamanhos inclui o valor atual fora da grade", () => {
    expect(sizeOptions("M")).toEqual(["P", "M", "G", "GG"]);
    expect(sizeOptions("xg")).toEqual(["P", "M", "G", "GG", "XG"]);
    expect(sizeOptions(null)).toEqual(["P", "M", "G", "GG"]);
  });

  it("junta nomes em português", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B"])).toBe("A e B");
    expect(joinNames(["A", "B", "C"])).toBe("A, B e C");
  });
});
