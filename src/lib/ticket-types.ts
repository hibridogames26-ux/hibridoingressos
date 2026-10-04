export type TicketTypeRow = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  quantity: number;
  sort_order: number;
  event_date: string;
  active: boolean;
  /** Ingressos emitidos (exceto cancelados). */
  sold: number;
  redeemed: number;
  gross_cents: number;
  /** Contador de reservas usado pelo checkout. */
  reserved: number;
};

/** Mínimo permitido para o estoque total: nada já vendido ou reservado pode ficar de fora. */
export function minQuantity(t: Pick<TicketTypeRow, "sold" | "reserved">) {
  return Math.max(Number(t.sold), Number(t.reserved));
}

export function available(t: Pick<TicketTypeRow, "quantity" | "sold" | "reserved">) {
  return Math.max(0, t.quantity - minQuantity(t));
}

/** Agrupa por data do evento, mantendo a ordem. */
export function groupByDate<T extends { event_date: string }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.event_date) ?? [];
    list.push(row);
    groups.set(row.event_date, list);
  }
  return [...groups.entries()];
}
