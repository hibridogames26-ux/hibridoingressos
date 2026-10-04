"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { btnPrimary } from "@/components/ui/styles";
import { chargeCents } from "@/config/fees";
import { MAX_TICKETS_PER_ORDER, serializeCart } from "@/lib/checkout";
import { formatBRL, formatEventDate } from "@/lib/format";
import type { CatalogItem } from "@/lib/catalog";

type Direction = 1 | -1;

/** Odômetro: ao somar o número novo sobe por baixo; ao tirar, desce por cima. */
const rollClass = (dir: Direction | undefined) => (dir === 1 ? "animate-digit-up" : "animate-digit");

/** Entrada da lista em sequência curta; o atraso total fica limitado a 200ms. */
const listDelay = (index: number) => ({ animationDelay: `${Math.min(index, 4) * 50}ms` });

export function CartPicker({ groups }: { groups: [string, CatalogItem[]][] }) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [dir, setDir] = useState<Record<string, Direction>>({});
  const [lastDir, setLastDir] = useState<Direction>(1);
  const items = useMemo(() => groups.flatMap(([, rows]) => rows), [groups]);

  const totalQty = Object.values(qty).reduce((a, b) => a + b, 0);
  const subtotal = items.reduce((sum, t) => sum + (qty[t.id] ?? 0) * t.price_cents, 0);
  const atLimit = totalQty >= MAX_TICKETS_PER_ORDER;

  const change = (t: CatalogItem, delta: Direction) => {
    const current = qty[t.id] ?? 0;
    const roomLeft = MAX_TICKETS_PER_ORDER - totalQty;
    const next = Math.max(0, Math.min(current + delta, t.available, current + Math.max(0, roomLeft)));
    if (next === current) return;
    setQty((prev) => ({ ...prev, [t.id]: next }));
    setDir((prev) => ({ ...prev, [t.id]: delta }));
    setLastDir(delta);
  };

  const proceed = () => {
    const lines = items
      .filter((t) => (qty[t.id] ?? 0) > 0)
      .map((t) => ({ ticketTypeId: t.id, quantity: qty[t.id] }));
    startNavigation(() => router.push(`/checkout?itens=${serializeCart(lines)}`));
  };

  return (
    <>
      <div className="flex flex-col gap-8 pb-[calc(8rem+env(safe-area-inset-bottom))]">
        {groups.map(([date, rows]) => (
          <section key={date} className="flex flex-col gap-3">
            <h2
              style={listDelay(items.indexOf(rows[0]))}
              className="animate-rise text-[22px] font-semibold capitalize leading-tight"
            >
              {formatEventDate(date)}
            </h2>
            {rows.map((t) => {
              const soldOut = t.available === 0;
              const n = qty[t.id] ?? 0;
              return (
                <article
                  key={t.id}
                  style={listDelay(items.indexOf(t))}
                  className={`grid animate-rise grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 rounded-2xl border p-4 shadow-whisper transition-[border-color,background-color] duration-300 ease-out-expo sm:gap-y-1 sm:p-5 ${
                    n > 0 ? "border-brand/50 bg-brand-subtle/40" : "border-line bg-surface"
                  }`}
                >
                  <div className="col-span-2 flex min-w-0 flex-col gap-0.5 sm:col-span-1">
                    <h3 className="text-base font-semibold">{t.name}</h3>
                    {t.description && <p className="text-pretty text-sm text-cool-gray">{t.description}</p>}
                  </div>
                  <div className="flex flex-col sm:col-start-1">
                    <p className="text-base font-semibold">{formatBRL(t.price_cents)}</p>
                    <p className="text-xs text-muted">ou {formatBRL(chargeCents("cartao", t.price_cents))} no cartão</p>
                  </div>
                  {soldOut ? (
                    <span className="shrink-0 justify-self-end rounded-md bg-danger/12 px-2 py-0.5 text-xs font-medium text-danger-ink sm:col-start-2 sm:row-span-2 sm:row-start-1">
                      Esgotado
                    </span>
                  ) : (
                    <div
                      className="flex shrink-0 items-center gap-2 justify-self-end sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:gap-3"
                      role="group"
                      aria-label={`Quantidade de ${t.name}`}
                    >
                      <button
                        type="button"
                        onClick={() => change(t, -1)}
                        disabled={n === 0}
                        className={stepperBtn}
                        aria-label="Diminuir"
                      >
                        <StepIcon kind="minus" />
                      </button>
                      <span className="w-7 overflow-hidden text-center text-lg font-semibold tabular-nums" aria-live="polite">
                        <span key={n} className={`inline-block ${n === 0 && !dir[t.id] ? "" : rollClass(dir[t.id])}`}>
                          {n}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => change(t, 1)}
                        disabled={n >= t.available || atLimit}
                        className={stepperBtn}
                        aria-label="Aumentar"
                      >
                        <StepIcon kind="plus" />
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:py-4">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm text-cool-gray">
              <span className="inline-flex overflow-hidden align-bottom tabular-nums">
                <span key={totalQty} className={`inline-block ${totalQty ? rollClass(lastDir) : ""}`}>
                  {totalQty}
                </span>
              </span>{" "}
              {totalQty === 1 ? "ingresso" : "ingressos"}
              {atLimit && <span className="inline-block animate-message"> (máximo por pedido)</span>}
            </span>
            <span className="overflow-hidden text-xl font-bold tabular-nums">
              <span key={subtotal} className={`inline-block ${subtotal ? rollClass(lastDir) : ""}`}>
                {formatBRL(subtotal)}
              </span>
            </span>
          </div>
          <button
            className={`${btnPrimary} relative shrink-0 overflow-hidden px-6`}
            disabled={totalQty === 0 || navigating}
            aria-busy={navigating}
            onClick={proceed}
          >
            {/* Momento do carrinho pronto: um brilho atravessa o botão quando ele acende. */}
            {totalQty > 0 && <span aria-hidden="true" className="pointer-events-none absolute inset-0 animate-sweep bg-[linear-gradient(110deg,transparent_25%,rgb(255_255_255/0.35)_50%,transparent_75%)]" />}
            {navigating && <Spinner />}
            Continuar
          </button>
        </div>
      </div>
    </>
  );
}

const stepperBtn =
  "flex size-10 items-center justify-center rounded-xl border border-line text-ink transition duration-150 hover:border-brand-dark active:scale-90 active:border-brand active:bg-brand-subtle pointer-coarse:size-11 disabled:opacity-40 disabled:active:scale-100 disabled:active:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function StepIcon({ kind }: { kind: "plus" | "minus" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5">
      <path
        d={kind === "plus" ? "M10 4.5v11M4.5 10h11" : "M4.5 10h11"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 animate-spin motion-reduce:animate-pulse">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
      <path d="M17.5 10A7.5 7.5 0 0 0 10 2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
