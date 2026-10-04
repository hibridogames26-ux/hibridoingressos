"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { btnPrimary, card } from "@/components/ui/styles";
import { chargeCents } from "@/config/fees";
import { MAX_TICKETS_PER_ORDER, serializeCart } from "@/lib/checkout";
import { formatBRL, formatEventDate } from "@/lib/format";
import type { CatalogItem } from "@/lib/catalog";

export function CartPicker({ groups }: { groups: [string, CatalogItem[]][] }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>({});
  const items = useMemo(() => groups.flatMap(([, rows]) => rows), [groups]);

  const totalQty = Object.values(qty).reduce((a, b) => a + b, 0);
  const subtotal = items.reduce((sum, t) => sum + (qty[t.id] ?? 0) * t.price_cents, 0);

  const change = (t: CatalogItem, delta: number) =>
    setQty((prev) => {
      const current = prev[t.id] ?? 0;
      const roomLeft = MAX_TICKETS_PER_ORDER - totalQty;
      const next = Math.max(0, Math.min(current + delta, t.available, current + Math.max(0, roomLeft)));
      return { ...prev, [t.id]: next };
    });

  const proceed = () => {
    const lines = items
      .filter((t) => (qty[t.id] ?? 0) > 0)
      .map((t) => ({ ticketTypeId: t.id, quantity: qty[t.id] }));
    router.push(`/checkout?itens=${serializeCart(lines)}`);
  };

  return (
    <>
      <div className="flex flex-col gap-8 pb-32">
        {groups.map(([date, rows]) => (
          <section key={date} className="flex flex-col gap-3">
            <h2 className="text-[22px] font-semibold capitalize leading-tight">{formatEventDate(date)}</h2>
            {rows.map((t) => {
              const soldOut = t.available === 0;
              const n = qty[t.id] ?? 0;
              return (
                <article key={t.id} className={`${card} flex items-center justify-between gap-4 p-5`}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <h3 className="text-base font-semibold">{t.name}</h3>
                    {t.description && <p className="text-sm text-cool-gray">{t.description}</p>}
                    <p className="mt-1 text-base font-semibold">{formatBRL(t.price_cents)}</p>
                    <p className="text-xs text-muted">ou {formatBRL(chargeCents("cartao", t.price_cents))} no cartão</p>
                  </div>
                  {soldOut ? (
                    <span className="shrink-0 rounded-md bg-danger/12 px-2 py-0.5 text-xs font-medium text-danger-ink">
                      Esgotado
                    </span>
                  ) : (
                    <div className="flex shrink-0 items-center gap-3" role="group" aria-label={`Quantidade de ${t.name}`}>
                      <button
                        type="button"
                        onClick={() => change(t, -1)}
                        disabled={n === 0}
                        className="size-10 rounded-xl border border-line text-lg font-semibold transition hover:border-brand-dark disabled:opacity-40"
                        aria-label="Diminuir"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-lg font-semibold tabular-nums" aria-live="polite">
                        {n}
                      </span>
                      <button
                        type="button"
                        onClick={() => change(t, 1)}
                        disabled={n >= t.available || totalQty >= MAX_TICKETS_PER_ORDER}
                        className="size-10 rounded-xl border border-line text-lg font-semibold transition hover:border-brand-dark disabled:opacity-40"
                        aria-label="Aumentar"
                      >
                        +
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <div className="flex flex-col">
            <span className="text-sm text-cool-gray">
              {totalQty} {totalQty === 1 ? "ingresso" : "ingressos"}
              {totalQty >= MAX_TICKETS_PER_ORDER && " (máximo por pedido)"}
            </span>
            <span className="text-xl font-bold tabular-nums">{formatBRL(subtotal)}</span>
          </div>
          <button className={btnPrimary} disabled={totalQty === 0} onClick={proceed}>
            Continuar
          </button>
        </div>
      </div>
    </>
  );
}
