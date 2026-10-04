"use client";

import { useSyncExternalStore } from "react";
import { getCountdown } from "@/lib/countdown";

const units = [
  ["days", "dias"],
  ["hours", "horas"],
  ["minutes", "min"],
  ["seconds", "seg"],
] as const;

function subscribe(onTick: () => void) {
  const id = setInterval(onTick, 1000);
  return () => clearInterval(id);
}

const getNow = () => Math.floor(Date.now() / 1000) * 1000;
// null no servidor evita divergência de hidratação; preenche após montar.
const getServerNow = () => null;

export function Countdown({ target }: { target: string }) {
  const now = useSyncExternalStore(subscribe, getNow, getServerNow);

  const value = now === null ? null : getCountdown(target, now);
  // Evento já começou: some depois de montar. Antes disso, reserva o espaço.
  if (now !== null && !value) return null;

  return (
    <div
      className="grid w-full max-w-md grid-cols-4 gap-2"
      role="timer"
      aria-label="Contagem regressiva para o evento"
    >
      {units.map(([key, label]) => {
        const digits = value ? String(value[key]).padStart(2, "0") : "––";
        return (
          <div key={key} className="rounded-xl bg-muted/8 py-3 text-center">
            <div className="overflow-hidden font-display text-[26px] font-bold leading-tight tracking-[-0.5px] tabular-nums sm:text-[28px]">
              {/* A chave muda junto com o valor: só a unidade que virou anima. */}
              <span key={digits} className={`inline-block ${value ? "animate-digit" : "text-muted"}`}>
                {digits}
              </span>
            </div>
            <div className="text-xs font-medium text-muted">{label}</div>
          </div>
        );
      })}
    </div>
  );
}
