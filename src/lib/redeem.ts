type TicketInfo = {
  holder_name: string;
  ticket_type: string | null;
  /** Dia do evento em que o ingresso vale (YYYY-MM-DD). */
  event_date: string | null;
  short_code: string;
};

export type RedeemResult =
  | ({ result: "ok" | "cancelado" | "data_errada" } & TicketInfo)
  | ({ result: "ja_utilizado"; redeemed_at: string; redeemed_by: string | null } & TicketInfo)
  | { result: "invalido" }
  | { result: "erro"; message: string };

/** Extrai o código lido: aceita o token puro, o código curto ou uma URL terminando no token. */
export function normalizeCode(raw: string): string {
  const trimmed = raw.trim();
  const lastSegment = trimmed.split(/[/?#=]/).filter(Boolean).pop() ?? "";
  return lastSegment.replace(/[\s-]/g, "").slice(0, 128);
}
