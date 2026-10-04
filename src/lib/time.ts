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
