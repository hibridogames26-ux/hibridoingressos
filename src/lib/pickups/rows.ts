// Retirada de camisas dos atletas (Story 4.6): linhas da lista, filtros e totais.
import { displayName, fold, type Competition } from "@/lib/checkin/sheet";

/** Linha da visão `v_athlete_shirt_pickups`, como o banco devolve. */
export type PickupDbRow = {
  id: string;
  origin: string;
  competition: string;
  team_name: string;
  full_name: string;
  shirt_size: string;
  box: string | null;
  email: string;
  phone: string | null;
  athlete_id: string | null;
  linked_athlete_id: string | null;
  checkin_signed_at: string | null;
  picked_up_at: string | null;
  delivered_size: string | null;
  picked_by_name: string | null;
  picked_by_self: boolean | null;
  picked_by_document: string | null;
  pickup_note: string | null;
  delivered_by_name: string | null;
  pickup_batch: string | null;
  email_sent_at: string | null;
};

export type PickupInfo = {
  at: string;
  deliveredSize: string;
  byName: string;
  /** O próprio atleta desta linha retirou. */
  bySelf: boolean;
  document: string | null;
  note: string | null;
  deliveredByName: string | null;
  batch: string | null;
  emailSentAt: string | null;
};

export type PickupRow = {
  id: string;
  origin: "planilha" | "manual";
  competition: Competition;
  teamName: string;
  /** Nome para exibição. */
  name: string;
  /** Nome como está gravado (usado na edição). */
  fullName: string;
  shirtSize: string;
  box: string | null;
  email: string;
  phone: string | null;
  /** Vínculo escolhido no painel; nulo = automático pelo nome. */
  athleteId: string | null;
  /** Atleta de “Documentos” que vale para o check-in (escolhido ou automático). */
  linkedAthleteId: string | null;
  checkinAt: string | null;
  pickup: PickupInfo | null;
};

export function toPickupRow(r: PickupDbRow): PickupRow {
  return {
    id: r.id,
    origin: r.origin === "manual" ? "manual" : "planilha",
    competition: r.competition as Competition,
    teamName: r.team_name,
    name: displayName(r.full_name),
    fullName: r.full_name,
    shirtSize: r.shirt_size,
    box: r.box?.trim() || null,
    email: r.email,
    phone: r.phone?.trim() || null,
    athleteId: r.athlete_id,
    linkedAthleteId: r.linked_athlete_id,
    checkinAt: r.checkin_signed_at,
    pickup: r.picked_up_at
      ? {
          at: r.picked_up_at,
          deliveredSize: r.delivered_size ?? r.shirt_size,
          byName: displayName(r.picked_by_name ?? ""),
          bySelf: r.picked_by_self === true,
          document: r.picked_by_document,
          note: r.pickup_note,
          deliveredByName: r.delivered_by_name,
          batch: r.pickup_batch,
          emailSentAt: r.email_sent_at,
        }
      : null,
  };
}

/** Individual: a inscrição leva o nome do próprio atleta. */
export const isSolo = (r: Pick<PickupRow, "teamName" | "fullName">) => fold(r.teamName) === fold(r.fullName);

export const teamLabel = (r: Pick<PickupRow, "teamName" | "fullName">) => (isSolo(r) ? "Individual" : r.teamName);

/**
 * A retirada só é liberada para quem fez o check-in.
 * - `sem_checkin`: o atleta existe em “Documentos”, mas ainda não fez o check-in.
 * - `sem_cadastro`: ninguém com este nome em “Documentos” nesta competição.
 */
export type PickupGate = "liberado" | "sem_checkin" | "sem_cadastro";

export const pickupGate = (r: Pick<PickupRow, "checkinAt" | "linkedAthleteId">): PickupGate =>
  r.checkinAt ? "liberado" : r.linkedAthleteId ? "sem_checkin" : "sem_cadastro";

export const GATE_LABEL: Record<PickupGate, string> = {
  liberado: "Check-in feito",
  sem_checkin: "Check-in pendente",
  sem_cadastro: "Sem cadastro em Documentos",
};

const SIZE_ORDER = ["PP", "P", "M", "G", "GG", "XG", "XGG", "G1", "G2", "G3"];
const sizeRank = (size: string) => {
  const i = SIZE_ORDER.indexOf(size.toUpperCase());
  return i < 0 ? SIZE_ORDER.length : i;
};
export const compareSizes = (a: string, b: string) => sizeRank(a) - sizeRank(b) || a.localeCompare(b, "pt-BR");

/** Competição, equipe e nome: integrantes da mesma inscrição ficam juntos. */
export function sortPickups<T extends Pick<PickupRow, "competition" | "teamName" | "name">>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      a.competition.localeCompare(b.competition) ||
      fold(a.teamName).localeCompare(fold(b.teamName), "pt-BR") ||
      a.name.localeCompare(b.name, "pt-BR"),
  );
}

/** Outros atletas da mesma inscrição (mesma competição e mesma equipe). */
export function teammates(row: PickupRow, all: PickupRow[]): PickupRow[] {
  const team = fold(row.teamName);
  return all.filter((r) => r.id !== row.id && r.competition === row.competition && fold(r.teamName) === team);
}

// ---------------------------------------------------------------------------
// Filtros da lista
// ---------------------------------------------------------------------------
export type PickupStatusFilter = "pendente" | "retirada" | "sem-checkin";

export type PickupFilters = {
  q: string;
  competition: Competition | null;
  status: PickupStatusFilter | null;
  size: string | null;
};

export function parsePickupFilters(params: Record<string, string | string[] | undefined>): PickupFilters {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const competition = get("competicao");
  const status = get("situacao");
  const size = get("tamanho").trim().toUpperCase().slice(0, 12);
  return {
    q: get("q").trim().slice(0, 100),
    competition: competition === "hibrido-games" || competition === "hibrido-race" ? competition : null,
    status: status === "pendente" || status === "retirada" || status === "sem-checkin" ? status : null,
    size: size || null,
  };
}

export function pickupFiltersQuery(filters: PickupFilters) {
  const sp = new URLSearchParams();
  if (filters.q) sp.set("q", filters.q);
  if (filters.competition) sp.set("competicao", filters.competition);
  if (filters.status) sp.set("situacao", filters.status);
  if (filters.size) sp.set("tamanho", filters.size);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function filterPickups(rows: PickupRow[], filters: PickupFilters): PickupRow[] {
  const q = fold(filters.q);
  return rows.filter((r) => {
    if (filters.competition && r.competition !== filters.competition) return false;
    if (filters.status === "pendente" && r.pickup) return false;
    if (filters.status === "retirada" && !r.pickup) return false;
    if (filters.status === "sem-checkin" && (r.pickup || pickupGate(r) === "liberado")) return false;
    if (filters.size && (r.pickup?.deliveredSize ?? r.shirtSize).toUpperCase() !== filters.size) return false;
    if (q && !fold(`${r.name} ${r.teamName} ${r.box ?? ""} ${r.email}`).includes(q)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Totais
// ---------------------------------------------------------------------------
export type PickupStats = {
  total: number;
  picked: number;
  pending: number;
  /** Pendentes que ainda não podem retirar (sem check-in ou sem cadastro em Documentos). */
  blocked: number;
  /** Camisas ainda não entregues, por tamanho da inscrição. */
  pendingBySize: { size: string; count: number }[];
  /** Todos os tamanhos da lista, para o filtro. */
  sizes: string[];
};

export function pickupStats(rows: PickupRow[]): PickupStats {
  const pendingRows = rows.filter((r) => !r.pickup);
  const bySize = new Map<string, number>();
  for (const r of pendingRows) bySize.set(r.shirtSize, (bySize.get(r.shirtSize) ?? 0) + 1);
  const sizes = [...new Set(rows.flatMap((r) => [r.shirtSize, ...(r.pickup ? [r.pickup.deliveredSize] : [])]))].sort(compareSizes);
  return {
    total: rows.length,
    picked: rows.length - pendingRows.length,
    pending: pendingRows.length,
    blocked: pendingRows.filter((r) => pickupGate(r) !== "liberado").length,
    pendingBySize: [...bySize.entries()].map(([size, count]) => ({ size, count })).sort((a, b) => compareSizes(a.size, b.size)),
    sizes,
  };
}

/** “por Maria Souza” ou “pelo próprio atleta”. */
export const pickedByText = (p: Pick<PickupInfo, "bySelf" | "byName">) => (p.bySelf ? "pelo próprio atleta" : `por ${p.byName}`);
