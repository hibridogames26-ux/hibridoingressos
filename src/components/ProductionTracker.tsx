import { SHIRT_FULFILLMENT_STATUSES, shirtFulfillmentLabel, type ShirtFulfillment } from "@/lib/labels";

/** Andamento da produção em etapas. Independente do status do pagamento. */
export function ProductionTracker({ status }: { status: ShirtFulfillment }) {
  const current = SHIRT_FULFILLMENT_STATUSES.indexOf(status);
  return (
    <ol aria-label="Andamento da produção" className="grid gap-3 sm:grid-cols-4 sm:gap-2">
      {SHIRT_FULFILLMENT_STATUSES.map((step, i) => {
        const state = i < current ? "done" : i === current ? "current" : "next";
        return (
          <li
            key={step}
            aria-current={state === "current" ? "step" : undefined}
            className={`flex items-center gap-3 rounded-xl border px-3 py-3 sm:flex-col sm:items-start sm:gap-2 ${
              state === "current" ? "border-brand-dark bg-brand-subtle" : "border-line bg-surface"
            }`}
          >
            <span
              aria-hidden="true"
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                state === "next" ? "bg-muted/16 text-cool-gray" : "bg-brand text-white"
              }`}
            >
              {state === "done" ? (
                <svg viewBox="0 0 16 16" className="size-3.5">
                  <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span className={`text-sm ${state === "next" ? "text-cool-gray" : "font-medium text-ink"}`}>
              {shirtFulfillmentLabel[step]}
              {state === "done" && <span className="sr-only"> (concluída)</span>}
              {state === "current" && <span className="sr-only"> (etapa atual)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
