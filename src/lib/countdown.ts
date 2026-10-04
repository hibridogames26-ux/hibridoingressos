export type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

/** Tempo restante até `target`; `null` se a data for inválida ou já passou. */
export function getCountdown(target: string, now: number): Countdown | null {
  const end = Date.parse(target);
  if (Number.isNaN(end)) return null;
  const diff = end - now;
  if (diff <= 0) return null;

  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}
