"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnPrimary, card, input, label, textLink } from "@/components/ui/styles";
import { chargeCents } from "@/config/fees";
import { formatCpf } from "@/lib/checkout";
import { formatBRL, formatEventDate } from "@/lib/format";
import { createOrder } from "./actions";

export type CheckoutLine = {
  ticketTypeId: string;
  name: string;
  eventDate: string;
  priceCents: number;
  quantity: number;
};

function FieldError({ message }: { message?: string }) {
  return message ? <span className="animate-message text-xs text-danger-ink">{message}</span> : null;
}

export function CheckoutForm({ lines, itens }: { lines: CheckoutLine[]; itens: string }) {
  const [state, action, pending] = useActionState(createOrder, undefined);
  const [buyerName, setBuyerName] = useState("");
  const [cpf, setCpf] = useState("");
  const errors = state?.fieldErrors ?? {};
  const values = state?.values ?? {};
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.priceCents, 0);
  let holderIndex = 0;

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start" noValidate>
      <input type="hidden" name="itens" value={itens} />
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
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
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
            <span className="text-xs text-muted">Os ingressos serão enviados para este e-mail.</span>
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
                enterKeyHint="next"
                required
                placeholder="(83) 99999-0000"
                defaultValue={values.phone}
                aria-invalid={!!errors.phone}
              />
              <FieldError message={errors.phone} />
            </label>
          </div>
        </fieldset>

        <fieldset className={`${card} flex flex-col gap-4 p-4 sm:p-5`}>
          <legend className="sr-only">Titulares dos ingressos</legend>
          <div className="flex flex-col gap-1">
            <h2 className="text-[22px] font-semibold leading-tight">Quem vai usar cada ingresso</h2>
            <p className="text-sm text-cool-gray">O nome aparece na leitura da portaria.</p>
          </div>
          {lines.map((line) =>
            Array.from({ length: line.quantity }, (_, i) => {
              const field = `holder_${line.ticketTypeId}_${i}`;
              const isFirst = holderIndex++ === 0;
              return (
                <label key={field} className="flex flex-col gap-1.5">
                  <span className={label}>
                    {line.name} · {formatEventDate(line.eventDate)}
                    {line.quantity > 1 && ` (${i + 1}/${line.quantity})`}
                  </span>
                  <input
                    className={input}
                    name={field}
                    autoCapitalize="words"
                    required
                    placeholder="Nome e sobrenome"
                    {...(isFirst
                      ? { value: buyerName, onChange: (e) => setBuyerName(e.target.value) }
                      : { defaultValue: values[field] })}
                    aria-invalid={!!errors[field]}
                  />
                  <FieldError message={errors[field]} />
                </label>
              );
            }),
          )}
        </fieldset>
      </div>

      <aside className={`${card} flex flex-col gap-4 p-4 sm:p-5 lg:sticky lg:top-4`}>
        <h2 className="text-[22px] font-semibold leading-tight">Resumo</h2>
        <ul className="flex flex-col gap-3 text-sm">
          {lines.map((l) => (
            <li key={l.ticketTypeId} className="flex justify-between gap-3">
              <span>
                {l.quantity}× {l.name}
                <span className="block text-xs text-muted">{formatEventDate(l.eventDate)}</span>
              </span>
              <span className="tabular-nums">{formatBRL(l.quantity * l.priceCents)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <div className="flex justify-between text-base font-semibold">
            <span>Total no Pix</span>
            <span className="tabular-nums">{formatBRL(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm text-cool-gray">
            <span>No cartão de crédito</span>
            <span className="tabular-nums">{formatBRL(chargeCents("cartao", subtotal))}</span>
          </div>
        </div>
        <button className={btnPrimary} disabled={pending}>
          {pending ? "Reservando…" : "Ir para o pagamento"}
        </button>
        <p className="text-xs text-muted">Seus ingressos ficam reservados por 30 minutos.</p>
        <Link href="/ingressos" className={textLink}>
          Alterar ingressos
        </Link>
      </aside>
    </form>
  );
}
