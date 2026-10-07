"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { btnOutline, btnPrimary, card, input, label } from "@/components/ui/styles";
import { formatBRL, formatDateTime } from "@/lib/format";
import { availabilityMessage, shirtCheckoutHref, validateSelection, type SalesMode, type SizeState } from "@/lib/shirts";

export type ShirtPurchaseProps = {
  name: string;
  description: string | null;
  priceCents: number | null;
  /** Cada tamanho da grade e se dá para escolher (desabilitado pelo fornecedor ou esgotado). */
  sizeStates: SizeState[];
  sizeGuide: string | null;
  composition: string | null;
  fit: string | null;
  leadTime: string | null;
  receipt: string | null;
  salesEnd: string | null;
  availability: "open" | "closed" | "coupon_required" | "scheduled" | "ended" | "sold_out";
  maxQuantity: number;
  mode: SalesMode;
  /** Cupom válido vindo do link ou do campo de acesso, já normalizado. */
  couponCode: string | null;
  couponDescription: string | null;
  /** Mensagem quando o cupom informado não vale. */
  couponError: string | null;
  /** A taxa do cartão é repassada ao comprador? */
  cardFeeNote: boolean;
};

const TBD = "A definir";

function Fact({ label, value, fallback = TBD }: { label: string; value: string | null; fallback?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`whitespace-pre-line text-sm ${value ? "text-ink" : "text-cool-gray"}`}>{value ?? fallback}</dd>
    </div>
  );
}

export function ShirtPurchase(props: ShirtPurchaseProps) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [size, setSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const sizesRef = useRef<HTMLFieldSetElement>(null);
  const errorId = useId();
  const open = props.availability === "open";
  const unavailable = props.sizeStates.filter((s) => !s.available);
  const choosable = props.sizeStates.filter((s) => s.available).map((s) => s.size);

  const submit = () => {
    const result = validateSelection(choosable, props.maxQuantity, { size, quantity });
    if (!result.ok) {
      setError(result.message);
      if (result.field === "size") sizesRef.current?.querySelector("input")?.focus();
      return;
    }
    setError(null);
    startNavigation(() => router.push(shirtCheckoutHref(result.selection, props.couponCode ?? undefined)));
  };

  return (
    <div className="flex flex-col gap-6">
      {props.couponCode && (
        <p role="status" className="rounded-xl bg-brand-subtle px-4 py-3 text-sm">
          {props.mode === "cupom" ? (
            <>
              <strong className="font-semibold">Compra liberada pelo cupom {props.couponCode}.</strong> A venda ainda está
              fechada ao público.
            </>
          ) : (
            <>
              <strong className="font-semibold">Cupom {props.couponCode} reconhecido.</strong>{" "}
              {props.couponDescription ? `${props.couponDescription}, ` : ""}aplicado no pagamento.
            </>
          )}
        </p>
      )}
      <header className="flex flex-col gap-3">
        <span className="inline-flex w-fit items-center rounded-md bg-brand-subtle px-2 py-0.5 text-xs font-medium text-brand-dark">
          Sob encomenda
        </span>
        <h1 className="font-display text-balance text-[1.75rem] font-bold leading-[1.22] tracking-[-0.5px] sm:text-4xl">
          {props.name}
        </h1>
        <p className="font-display text-2xl font-bold tabular-nums tracking-[-0.5px]">
          {props.priceCents !== null ? (
            formatBRL(props.priceCents)
          ) : (
            <span className="text-cool-gray">Preço a definir</span>
          )}
        </p>
        {props.priceCents !== null && props.cardFeeNote && (
          <p className="-mt-1 text-sm text-cool-gray">Preço no Pix. No cartão de crédito há acréscimo da taxa da operadora.</p>
        )}
        {props.description && <p className="text-pretty text-base text-cool-gray">{props.description}</p>}
      </header>

      <section aria-labelledby="sob-encomenda" className="flex flex-col gap-3 rounded-2xl bg-brand-subtle p-4 sm:p-5">
        <h2 id="sob-encomenda" className="text-base font-semibold">
          Camisa feita sob encomenda
        </h2>
        <p className="text-sm">
          Não há pronta entrega. Depois do pagamento, você acompanha a produção e o recebimento na página do pedido.
        </p>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Fact label="Prazo de produção" value={props.leadTime} />
          <Fact label="Recebimento" value={props.receipt} />
          <Fact label="Encomendas até" value={props.salesEnd ? formatDateTime(props.salesEnd) : null} />
        </dl>
      </section>

      <dl className="grid gap-3 sm:grid-cols-2">
        <Fact label="Composição" value={props.composition} fallback="A confirmar" />
        <Fact label="Modelagem" value={props.fit} fallback="A confirmar" />
      </dl>

      <section className={`${card} flex flex-col gap-5 p-4 sm:p-5`} aria-label="Escolha da camisa">
        <fieldset
          ref={sizesRef}
          className="flex flex-col gap-3"
          aria-describedby={[error ? errorId : null, unavailable.length ? "tamanhos-indisponiveis" : null].filter(Boolean).join(" ") || undefined}
        >
          <legend className="text-base font-semibold">Tamanho</legend>
          {props.sizeStates.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {props.sizeStates.map(({ size: s, available }) => {
                const off = !available;
                return (
                  <label key={s} className="relative">
                    <input
                      type="radio"
                      name="tamanho"
                      value={s}
                      checked={size === s}
                      disabled={!open || off}
                      onChange={() => {
                        setSize(s);
                        setError(null);
                      }}
                      className="peer sr-only"
                    />
                    <span
                      className={`flex min-h-12 min-w-14 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface px-4 text-base font-medium transition-colors duration-150 hover:border-muted peer-checked:border-brand-dark peer-checked:bg-brand-subtle peer-checked:text-brand-dark peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand peer-disabled:cursor-not-allowed peer-disabled:opacity-60 ${
                        off ? "bg-muted/8 text-muted line-through" : ""
                      }`}
                    >
                      {s}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-cool-gray">A grade de tamanhos será divulgada antes da abertura das encomendas.</p>
          )}
          {unavailable.length > 0 && (
            <div id="tamanhos-indisponiveis" className="flex flex-col gap-1 rounded-xl bg-cool-gray/12 px-3 py-2.5 text-sm">
              {unavailable.map((u) => (
                <p key={u.size}>
                  <strong className="font-semibold">
                    {u.size} {u.reason === "sold_out" ? "esgotado" : "indisponível"} no momento.
                  </strong>{" "}
                  {u.reason === "disabled" ? u.message : ""}
                </p>
              ))}
            </div>
          )}
          <details className="group text-sm">
            <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand">
              Guia de medidas
            </summary>
            <p className="mt-1 whitespace-pre-line rounded-xl bg-muted/8 p-3 text-cool-gray">
              {props.sizeGuide ?? "As medidas serão informadas junto com a grade de tamanhos."}
            </p>
          </details>
        </fieldset>

        {open && props.maxQuantity > 1 && (
          <div className="flex items-center justify-between gap-3">
            <span id="qtd-label" className="text-base font-semibold">
              Quantidade
            </span>
            <div role="group" aria-labelledby="qtd-label" className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Diminuir quantidade"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="inline-flex size-11 items-center justify-center rounded-xl bg-muted/8 text-lg font-medium transition-colors hover:bg-muted/16 active:bg-muted/16 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand"
              >
                −
              </button>
              <span className="w-10 text-center text-base font-semibold tabular-nums" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="Aumentar quantidade"
                disabled={quantity >= props.maxQuantity}
                onClick={() => setQuantity((q) => Math.min(props.maxQuantity, q + 1))}
                className="inline-flex size-11 items-center justify-center rounded-xl bg-muted/8 text-lg font-medium transition-colors hover:bg-muted/16 active:bg-muted/16 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand"
              >
                +
              </button>
            </div>
          </div>
        )}

        {error && (
          <p id={errorId} role="alert" className="animate-message rounded-xl bg-danger/8 px-4 py-3 text-sm text-danger-ink">
            {error}
          </p>
        )}

        {props.availability === "coupon_required" && (
          <form method="get" className="flex flex-col gap-2 rounded-xl bg-muted/8 p-3">
            <label htmlFor="cupom-acesso" className={label}>
              Tem um cupom de acesso?
            </label>
            <div className="flex gap-2">
              <input
                id="cupom-acesso"
                name="cupom"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="Digite o código"
                defaultValue={props.couponError ? "" : undefined}
                aria-invalid={!!props.couponError}
                aria-describedby={props.couponError ? "cupom-acesso-erro" : undefined}
                className={`${input} min-w-0 flex-1 uppercase`}
              />
              <button className={btnOutline}>Usar cupom</button>
            </div>
            {props.couponError && (
              <p id="cupom-acesso-erro" role="alert" className="animate-message text-sm text-danger-ink">
                {props.couponError}
              </p>
            )}
          </form>
        )}

        <button type="button" className={`${btnPrimary} w-full`} onClick={submit} disabled={!open || navigating}>
          {navigating ? "Abrindo…" : "Encomendar minha camisa"}
        </button>
        {!open && (
          <p className="text-center text-sm text-cool-gray">{availabilityMessage[props.availability as Exclude<typeof props.availability, "open">]}</p>
        )}
      </section>
    </div>
  );
}
