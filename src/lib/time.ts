/** ISO de `hours` horas atrás. */
export function hoursAgoIso(hours: number, now = Date.now()) {
  return new Date(now - hours * 3600 * 1000).toISOString();
}

/** Início do dia em São Paulo (UTC−3, sem horário de verão desde 2019). */
export function startOfTodaySaoPaulo(now = Date.now()) {
  const offsetMs = 3 * 3600 * 1000;
  const local = new Date(now - offsetMs);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + offsetMs).toISOString();
}

/** Reserva vencida? (cartão em análise mantém a reserva). */
export function isReservationExpired(
  order: { expires_at: string | null; mp_status: string | null },
  now = Date.now(),
) {
  if (!order.expires_at) return false;
  if (order.mp_status === "in_process" || order.mp_status === "authorized") return false;
  return Date.parse(order.expires_at) < now;
}
