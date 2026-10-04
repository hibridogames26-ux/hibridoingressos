const TZ = "America/Sao_Paulo";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRL(cents: number | string | null | undefined) {
  return brl.format(Number(cents ?? 0) / 100);
}

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  return dateTime.format(new Date(value));
}

const time = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function formatTime(value: string | Date) {
  return time.format(new Date(value));
}

/** "2026-11-21" → "21/11" (data sem fuso, vinda de coluna date). */
export function formatDayMonth(isoDate: string) {
  const [, m, d] = isoDate.split("-");
  return `${d}/${m}`;
}

export function percent(part: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-11-21" → "sáb, 21/11/2026" (coluna date, sem fuso). */
export function formatEventDate(isoDate: string | null | undefined, withWeekday = true) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "—";
  const [y, m, d] = isoDate.split("-").map(Number);
  const label = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  if (!withWeekday) return label;
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${label}`;
}

/** "1.500,50" | "1500.5" | "150" → centavos; null se inválido ou negativo. */
export function parseReaisToCents(input: string): number | null {
  let text = input.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!text) return null;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}
