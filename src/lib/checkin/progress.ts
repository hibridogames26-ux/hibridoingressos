// Progresso público do check-in: só números agregados saem do servidor (Story 4.3).
import type { Competition } from "./sheet";

export type ProgressCount = { total: number; confirmed: number };

export type CheckinProgress = ProgressCount & {
  /** Por competição, na ordem do evento; só competições com atletas. */
  byCompetition: (ProgressCount & { competition: Competition })[];
};

const ORDER: Competition[] = ["hibrido-games", "hibrido-race"];

export function summarizeProgress(registrations: { competition: Competition; athletes: { confirmed: boolean }[] }[]): CheckinProgress {
  const by = new Map<Competition, ProgressCount>(ORDER.map((c) => [c, { total: 0, confirmed: 0 }]));
  for (const r of registrations) {
    const count = by.get(r.competition);
    if (!count) continue;
    count.total += r.athletes.length;
    count.confirmed += r.athletes.filter((a) => a.confirmed).length;
  }
  const byCompetition = ORDER.map((competition) => ({ competition, ...by.get(competition)! })).filter((c) => c.total > 0);
  return {
    total: byCompetition.reduce((n, c) => n + c.total, 0),
    confirmed: byCompetition.reduce((n, c) => n + c.confirmed, 0),
    byCompetition,
  };
}

export const remaining = (p: ProgressCount) => Math.max(0, p.total - p.confirmed);

/** Fração de 0 a 1 para a barra. */
export const ratio = (p: ProgressCount) => (p.total ? Math.min(1, p.confirmed / p.total) : 0);
