"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnOutline, btnPrimary, card, input, label, textLink } from "@/components/ui/styles";
import { SHIRT_PATH, shirtChargeCents } from "@/config/shirts";
import { formatCpf } from "@/lib/checkout";
import { formatBRL } from "@/lib/format";
import { createShirtOrder, previewCoupon, type AppliedCoupon } from "./actions";

export type ShirtCheckoutProps = {
  productName: string;
  size: string;
  quantity: number;
  unitPriceCents: number;
  /** Cupom já conferido pelo servidor (vindo do link), ou null. */
  initialCoupon: AppliedCoupon | null;
  /** Modo "somente com cupom": o cupom é a chave de acesso e não pode ser removido. */
  couponRequired: boolean;
  leadTime: string;
  receipt: string;
  policy: string;
};

function FieldError({ message }: { message?: string }) {
  return message ? <span className="animate-message text-xs text-danger-ink">{message}</span> : null;
}

export function ShirtCheckoutForm(props: ShirtCheckoutProps) {
  const [state, action, pending] = useActionState(createShirtOrder, undefined);
  const [cpf, setCpf] = useState("");
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(props.initialCoupon);
  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  const errors = state?.fieldErrors ?? {};
  const values = state?.values ?? {};

  const listCents = props.quantity * props.unitPriceCents;
  const payCents = coupon ? coupon.finalCents : listCents;
  const pixCents = shirtChargeCents("pix", payCents);
  const cardCents = shirtChargeCents("cartao", payCents);
  const sameTotal = pixCents === cardCents;
  // Cupom de 100%: nada a pagar, a encomenda é confirmada ao enviar os dados.
  const free = payCents === 0;

  const applyCoupon = () => {
    setCouponError(null);
    startChecking(async () => {
      const result = await previewCoupon(couponInput, props.quantity);
      if (result.ok) {
        setCoupon(result.coupon);
        setCouponInput("");
      } else {
        setCouponError(result.message);
      }
    });
  };

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start" noValidate>
      <input type="hidden" name="tamanho" value={props.size} />
      <input type="hidden" name="qtd" value={props.quantity} />
      <input type="hidden" name="cupom" value={coupon?.code ?? ""} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <div className="flex flex-col gap-6">
        {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}

        <fieldset className={`${card} flex flex-col gap-4 p-4 sm:p-5`}>
          <legend className="sr-only">Dados do comprador</legend>
          <h2 className="text-[22px] font-semibold leading-tight">Dados do comprador</h2>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Nome completo</span>
            <input
              className={input}
              name="name"
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
              required
              defaultValue={values.name}
              aria-invalid={!!errors.name}
            />
            <FieldError message={errors.name} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>E-mail</span>
            <input
              className={input}
              type="email"
              name="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="next"
              required
              defaultValue={values.email}
              aria-invalid={!!errors.email}
            />
            <span className="text-xs text-muted">A confirmação e o acompanhamento da encomenda chegam neste e-mail.</span>
            <FieldError message={errors.email} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={label}>CPF</span>
              <input
                className={input}
                name="cpf"
                inputMode="numeric"
                enterKeyHint="next"
                required
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
                placeholder="000.000.000-00"
                aria-invalid={!!errors.cpf}
              />
              <FieldError message={errors.cpf} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={label}>Celular (com DDD)</span>
              <input
                className={input}
                type="tel"
                name="phone"
                autoComplete="tel"
                inputMode="tel"
                enterKeyHint="done"
                required
                placeholder="(83) 99999-0000"
                defaultValue={values.phone}
                aria-invalid={!!errors.phone}
              />
              <FieldError message={errors.phone} />
            </label>
          </div>
        </fieldset>

        <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby="condicoes">
          <h2 id="condicoes" className="text-[22px] font-semibold leading-tight">
            Condições da encomenda
          </h2>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium">Prazo de produção</dt>
              <dd className="whitespace-pre-line text-cool-gray">{props.leadTime}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium">Recebimento</dt>
              <dd className="whitespace-pre-line text-cool-gray">{props.receipt}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium">Trocas, cancelamento e atendimento</dt>
              <dd className="whitespace-pre-line text-cool-gray">{props.policy}</dd>
            </div>
          </dl>
          <label className="flex items-start gap-3 rounded-xl bg-brand-subtle p-3 text-sm">
            <input
              type="checkbox"
              name="aceite"
              required
              defaultChecked={values.aceite === "on"}
              aria-invalid={!!errors.aceite}
              className="mt-0.5 size-5 shrink-0"
            />
            <span>
              Li e aceito as condições desta encomenda. Entendo que a camisa é feita sob encomenda e não há pronta
              entrega.
            </span>
          </label>
          <FieldError message={errors.aceite} />
        </section>
      </div>

      <aside className={`${card} flex flex-col gap-4 p-4 sm:p-5 lg:sticky lg:top-4`}>
        <h2 className="text-[22px] font-semibold leading-tight">Resumo</h2>
        <ul className="flex flex-col gap-3 text-sm">
          <li className="flex justify-between gap-3">
            <span>
              {props.quantity}× {props.productName}
              <span className="block text-xs text-muted">Tamanho {props.size} · sob encomenda</span>
            </span>
            <span className="tabular-nums">{formatBRL(props.quantity * props.unitPriceCents)}</span>
          </li>
        </ul>
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          {coupon ? (
            <>
              <span className="text-sm font-medium">Cupom aplicado</span>
              <div role="status" className="flex items-center gap-2.5 rounded-xl bg-success/16 px-3 py-2.5 text-success-ink">
                <svg aria-hidden="true" viewBox="0 0 16 16" className="size-[18px] shrink-0">
                  <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="min-w-0 flex-1 text-sm leading-snug">
                  <div className="font-mono font-semibold">{coupon.code}</div>
                  <div>{coupon.isTest ? `Cupom de teste. ${coupon.description}` : coupon.description}</div>
                </div>
                {!props.couponRequired && (
                  <button
                    type="button"
                    onClick={() => {
                      setCoupon(null);
                      setCouponError(null);
                    }}
                    className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold underline focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    Remover
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <label htmlFor="cupom-digitado" className="text-sm font-medium">
                Cupom
              </label>
              <div className="flex gap-2">
                <input
                  id="cupom-digitado"
                  className={`${input} min-w-0 flex-1 uppercase`}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="Digite o código"
                  value={couponInput}
                  aria-invalid={!!couponError}
                  aria-describedby="cupom-msg"
                  onChange={(e) => {
                    setCouponInput(e.target.value);
                    setCouponError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyCoupon();
                    }
                  }}
                />
                <button type="button" className={btnOutline} onClick={applyCoupon} disabled={checking}>
                  {checking ? "Conferindo…" : "Aplicar"}
                </button>
              </div>
              <p id="cupom-msg" className="text-xs text-muted">
                Tem um cupom? Digite o código e toque em Aplicar.
              </p>
            </>
          )}
          {couponError && (
            <p role="alert" className="animate-message rounded-xl bg-danger/8 px-3 py-2.5 text-sm text-danger-ink">
              {couponError}
            </p>
          )}
        </div>
        <dl className="flex flex-col gap-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-cool-gray">Preço unitário</dt>
            <dd className="tabular-nums">{formatBRL(props.unitPriceCents)}</dd>
          </div>
          {coupon && coupon.discountCents > 0 && (
            <div className="flex justify-between gap-3 text-success-ink">
              <dt>Desconto do cupom</dt>
              <dd className="tabular-nums">−{formatBRL(coupon.discountCents)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-cool-gray">Prazo</dt>
            <dd className="max-w-[60%] text-right">{props.leadTime}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-cool-gray">Recebimento</dt>
            <dd className="max-w-[60%] text-right">{props.receipt}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <div className="flex justify-between text-base font-semibold">
            <span>{free ? "Total a pagar" : sameTotal ? "Total" : "Total no Pix"}</span>
            <span className="tabular-nums">{formatBRL(pixCents)}</span>
          </div>
          {free && <p className="text-xs text-muted">Com este cupom a encomenda não tem cobrança: ela é confirmada ao enviar seus dados.</p>}
          {!sameTotal && (
            <div className="flex justify-between text-sm text-cool-gray">
              <span>No cartão de crédito</span>
              <span className="tabular-nums">{formatBRL(cardCents)}</span>
            </div>
          )}
          {coupon && !sameTotal && (
            <p className="text-xs text-muted">A taxa da operadora do cartão é calculada sobre o valor já com desconto.</p>
          )}
        </div>
        <button className={btnPrimary} disabled={pending}>
          {pending ? (free ? "Confirmando…" : "Reservando…") : free ? "Confirmar encomenda" : "Ir para o pagamento"}
        </button>
        {!free && <p className="text-xs text-muted">Sua encomenda fica reservada por 30 minutos para o pagamento.</p>}
        <Link href={SHIRT_PATH} className={textLink}>
          Alterar tamanho ou quantidade
        </Link>
      </aside>
    </form>
  );
}
