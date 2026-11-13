import { describe, expect, it } from "vitest";
import {
  filterPickups,
  isSolo,
  parsePickupFilters,
  pickedByText,
  pickupFiltersQuery,
  pickupGate,
  pickupStats,
  sortPickups,
  teamLabel,
  teammates,
  toPickupRow,
  type PickupDbRow,
} from "./rows";

const db = (over: Partial<PickupDbRow> = {}): PickupDbRow => ({
  id: "1",
  origin: "planilha",
  competition: "hibrido-games",
  team_name: "Equipe A",
  full_name: "PAULO henrique",
  shirt_size: "G",
  box: " Pulse Fit ",
  email: "cap@e.com",
  phone: null,
  athlete_id: null,
  linked_athlete_id: null,
  checkin_signed_at: null,
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

const picked = { picked_up_at: "2026-11-14T12:00:00Z", delivered_size: "GG", picked_by_name: "maria souza", picked_by_self: false, delivered_by_name: "Adm" };

const rows = [
  toPickupRow(db({ id: "1", linked_athlete_id: "a1", checkin_signed_at: "2026-11-10T10:00:00Z" })),
  toPickupRow(db({ id: "2", full_name: "Thiago Moura", shirt_size: "GG", linked_athlete_id: "a2" })),
  toPickupRow(db({ id: "3", team_name: "Ana Solo", full_name: "ana solo", shirt_size: "P", competition: "hibrido-race" })),
  toPickupRow(db({ id: "4", team_name: "equipe a", full_name: "Outra Competição", competition: "hibrido-race", shirt_size: "M", ...picked })),
];

describe("linhas da lista", () => {
  it("converte a linha do banco, com nome de exibição e retirada", () => {
    expect(rows[0]).toMatchObject({ name: "Paulo Henrique", fullName: "PAULO henrique", box: "Pulse Fit", pickup: null, checkinAt: "2026-11-10T10:00:00Z" });
    expect(rows[3].pickup).toMatchObject({ deliveredSize: "GG", byName: "Maria Souza", bySelf: false, deliveredByName: "Adm", emailSentAt: null });
  });

  it("sem tamanho entregue gravado, vale o da inscrição", () => {
    const r = toPickupRow(db({ picked_up_at: "2026-11-14T12:00:00Z", picked_by_name: "X", picked_by_self: true }));
    expect(r.pickup).toMatchObject({ deliveredSize: "G", bySelf: true });
  });

  it("individual: a inscrição leva o nome do atleta", () => {
    expect(isSolo(rows[2])).toBe(true);
    expect(teamLabel(rows[2])).toBe("Individual");
    expect(teamLabel(rows[0])).toBe("Equipe A");
  });

  it("a retirada só é liberada com check-in", () => {
    expect(rows.map(pickupGate)).toEqual(["liberado", "sem_checkin", "sem_cadastro", "sem_cadastro"]);
  });

  it("parceiros: mesma competição e mesma equipe, sem contar o próprio atleta", () => {
    expect(teammates(rows[0], rows).map((r) => r.id)).toEqual(["2"]);
    expect(teammates(rows[2], rows)).toEqual([]);
  });

  it("ordena por competição, equipe e nome", () => {
    expect(sortPickups([...rows].reverse()).map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("descreve quem retirou", () => {
    expect(pickedByText({ bySelf: true, byName: "X" })).toBe("pelo próprio atleta");
    expect(pickedByText({ bySelf: false, byName: "Maria Souza" })).toBe("por Maria Souza");
  });
});

describe("filtros", () => {
  it("lê os parâmetros da URL e descarta valores desconhecidos", () => {
    expect(parsePickupFilters({ q: "  ana ", competicao: "hibrido-race", situacao: "sem-checkin", tamanho: "gg" })).toEqual({
      q: "ana",
      competition: "hibrido-race",
      status: "sem-checkin",
      size: "GG",
    });
    expect(parsePickupFilters({ competicao: "x", situacao: ["a"], tamanho: "" })).toEqual({ q: "", competition: null, status: null, size: null });
  });

  it("monta a query do link de exportação", () => {
    expect(pickupFiltersQuery({ q: "", competition: null, status: null, size: null })).toBe("");
    expect(pickupFiltersQuery({ q: "ana b", competition: "hibrido-games", status: "retirada", size: "M" })).toBe(
      "?q=ana+b&competicao=hibrido-games&situacao=retirada&tamanho=M",
    );
  });

  const ids = (f: Partial<ReturnType<typeof parsePickupFilters>>) =>
    filterPickups(rows, { q: "", competition: null, status: null, size: null, ...f }).map((r) => r.id);

  it("filtra por situação, competição, tamanho e busca sem acento", () => {
    expect(ids({ status: "pendente" })).toEqual(["1", "2", "3"]);
    expect(ids({ status: "retirada" })).toEqual(["4"]);
    expect(ids({ status: "sem-checkin" })).toEqual(["2", "3"]);
    expect(ids({ competition: "hibrido-race" })).toEqual(["3", "4"]);
    // Camisa já retirada conta pelo tamanho entregue.
    expect(ids({ size: "GG" })).toEqual(["2", "4"]);
    expect(ids({ q: "competicao" })).toEqual(["4"]);
    expect(ids({ q: "pulse" })).toEqual(["1", "2", "3", "4"]);
  });
});

describe("totais", () => {
  it("conta retiradas, pendentes, bloqueadas e pendentes por tamanho", () => {
    expect(pickupStats(rows)).toEqual({
      total: 4,
      picked: 1,
      pending: 3,
      blocked: 2,
      pendingBySize: [
        { size: "P", count: 1 },
        { size: "G", count: 1 },
        { size: "GG", count: 1 },
      ],
      sizes: ["P", "M", "G", "GG"],
    });
  });

  it("lista vazia não quebra", () => {
    expect(pickupStats([])).toEqual({ total: 0, picked: 0, pending: 0, blocked: 0, pendingBySize: [], sizes: [] });
  });
});
