import { describe, expect, it } from "vitest";
import { ageOn, certificateProblem, emptyDraft, firstErrorStep, isMinor, maskEmail, parseCheckin, stepErrors } from "./form";
import { PARQ_QUESTIONS, TERMS_VERSION, termsSections, termsSnapshot } from "./terms";

const TODAY = "2026-11-02";
const valid = {
  fullName: "Ana Souza",
  birthDate: "1995-03-10",
  phone: "(83) 99999-0000",
  email: "Ana@E.com ",
  emergencyName: "Maria Souza",
  emergencyPhone: "83988880000",
  parq: PARQ_QUESTIONS.map(() => "nao"),
  imageConsent: true,
  guardianName: "",
  guardianRelation: "",
  guardianPhone: "",
  place: "João Pessoa – PB",
  agree: true,
};

describe("idade", () => {
  it("calcula a idade completa e recusa datas impossíveis", () => {
    expect(ageOn("2008-11-02", TODAY)).toBe(18);
    expect(ageOn("2008-11-03", TODAY)).toBe(17);
    expect(ageOn("2008-02-30", TODAY)).toBeNull();
    expect(ageOn("", TODAY)).toBeNull();
    expect(isMinor("2008-11-03", TODAY)).toBe(true);
    expect(isMinor("2008-11-02", TODAY)).toBe(false);
  });
});

describe("etapas", () => {
  it("dados: obrigatórios, telefone com DDD e contato de emergência diferente", () => {
    const e = stepErrors(0, emptyDraft(), TODAY);
    expect(Object.keys(e).sort()).toEqual(["birthDate", "email", "emergencyName", "emergencyPhone", "fullName", "phone"]);
    expect(stepErrors(0, emptyDraft({ ...valid, parq: [], emergencyPhone: valid.phone }), TODAY)).toEqual({
      emergencyPhone: "Use um telefone diferente do seu.",
    });
  });

  it("menor de idade precisa do responsável", () => {
    const e = stepErrors(0, emptyDraft({ ...valid, parq: [], birthDate: "2010-01-01" }), TODAY);
    expect(Object.keys(e).sort()).toEqual(["guardianName", "guardianPhone", "guardianRelation"]);
  });

  it("PAR-Q: as 10 perguntas respondidas", () => {
    const parq = PARQ_QUESTIONS.map(() => "nao" as const) as ("sim" | "nao" | "")[];
    parq[3] = "";
    expect(stepErrors(1, emptyDraft({ parq }), TODAY)).toEqual({ "parq.3": "Responda Sim ou Não." });
  });

  it("assinatura: local e declaração final", () => {
    expect(Object.keys(stepErrors(3, emptyDraft(), TODAY)).sort()).toEqual(["agree", "place"]);
  });

  it("leva o atleta à primeira etapa com erro", () => {
    expect(firstErrorStep({ "parq.2": "x", place: "y" })).toBe(1);
    expect(firstErrorStep({ certificate: "x" })).toBe(3);
    expect(firstErrorStep({ guardianName: "x" })).toBe(0);
    expect(firstErrorStep({})).toBeNull();
  });
});

describe("validação no servidor", () => {
  it("limpa e converte os dados", () => {
    const r = parseCheckin(valid, TODAY);
    expect(r).toMatchObject({
      ok: true,
      data: { phone: "83999990000", email: "ana@e.com", parqAnyYes: false, isMinor: false, guardianName: null, imageConsent: true },
    });
  });

  it("aceita Sim no PAR-Q e marca o alerta", () => {
    const parq = [...valid.parq];
    parq[5] = "sim";
    const r = parseCheckin({ ...valid, parq }, TODAY);
    expect(r.ok && r.data.parq[5] && r.data.parqAnyYes).toBe(true);
  });

  it("recusa dados forjados (tipos errados, respostas fora da lista, menor sem responsável)", () => {
    expect(parseCheckin({ ...valid, agree: "true", parq: ["talvez"] }, TODAY)).toMatchObject({ ok: false });
    expect(parseCheckin(null, TODAY)).toMatchObject({ ok: false });
    const minor = parseCheckin({ ...valid, birthDate: "2012-05-05" }, TODAY);
    expect(minor.ok).toBe(false);
    const ok = parseCheckin(
      { ...valid, birthDate: "2012-05-05", guardianName: "Maria Souza", guardianRelation: "mãe", guardianPhone: "83977770000" },
      TODAY,
    );
    expect(ok).toMatchObject({ ok: true, data: { isMinor: true, guardianName: "Maria Souza", guardianPhone: "83977770000" } });
  });
});

describe("arquivos e e-mail", () => {
  it("atestado: foto ou PDF de até 10 MB", () => {
    expect(certificateProblem({ type: "application/pdf", size: 1000 })).toBeNull();
    expect(certificateProblem({ type: "image/heic", size: 1000 })).toBeNull();
    expect(certificateProblem({ type: "application/zip", size: 1000 })).toMatch(/foto/);
    expect(certificateProblem({ type: "image/jpeg", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(certificateProblem({ type: "image/jpeg", size: 0 })).toMatch(/vazio/);
  });

  it("e-mail mascarado", () => {
    expect(maskEmail("antonio.s.jr@live.com")).toBe("an•••@live.com");
    expect(maskEmail("ze@e.com")).toBe("z•••@e.com");
  });
});

describe("termo", () => {
  it("usa o nome da competição, mantém os 18 artigos e não fala em GOV.BR nem FULL RACE", () => {
    const articles = termsSections("hibrido-race").flatMap((s) => s.articles);
    expect(articles).toHaveLength(18);
    expect(articles[0].text).toContain("Híbrido Race 2026");
    const text = termsSnapshot("hibrido-games", "Dupla Rx Masculino");
    expect(text).toContain(TERMS_VERSION);
    expect(text).toContain("Híbrido Games — Dupla Rx Masculino");
    expect(text).not.toMatch(/GOV\.BR|FULL RACE|Brizz/i);
  });
});
