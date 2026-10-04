"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnPrimary, card, input, label } from "@/components/ui/styles";
import type { TicketTypeRow } from "@/lib/ticket-types";
import { saveTicketType } from "./actions";

const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function TicketTypeForm({
  editing,
  minQuantity = 0,
}: {
  editing?: TicketTypeRow;
  minQuantity?: number;
}) {
  const [state, action, pending] = useActionState(saveTicketType, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success && !editing) formRef.current?.reset();
  }, [state, editing]);

  return (
    <form
      ref={formRef}
      action={action}
      key={editing?.id ?? "novo"}
      className={`${card} flex flex-col gap-4 p-5`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-[22px] font-semibold leading-tight">
            {editing ? `Editar “${editing.name}”` : "Cadastrar ingresso"}
          </h2>
          <p className="text-sm text-cool-gray">
            Cada ingresso vale para um dia do evento. O estoque total é a quantidade disponível à venda.
          </p>
        </div>
        {editing && (
          <Link href="/admin/ingressos" className="text-sm text-brand hover:underline">
            Cancelar edição
          </Link>
        )}
      </div>

      {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {state?.success && <FormMessage tone="success">{state.success}</FormMessage>}

      {editing && <input type="hidden" name="id" value={editing.id} />}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className={label}>Nome</span>
          <input
            className={input}
            name="name"
            required
            maxLength={80}
            defaultValue={editing?.name}
            placeholder="Ex.: Espectador — Sábado"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Data do evento</span>
          <input className={input} type="date" name="event_date" required defaultValue={editing?.event_date} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Preço (R$)</span>
          <input
            className={input}
            name="price"
            inputMode="decimal"
            required
            placeholder="0,00"
            defaultValue={editing ? centsToInput(editing.price_cents) : undefined}
          />
        </label>
        <label className="flex flex-col gap-1.5 lg:col-span-2">
          <span className={label}>Descrição (opcional)</span>
          <input className={input} name="description" maxLength={200} defaultValue={editing?.description ?? ""} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Estoque total</span>
          <input
            className={input}
            type="number"
            name="quantity"
            required
            min={minQuantity}
            max={100000}
            step={1}
            defaultValue={editing?.quantity}
          />
          {editing && minQuantity > 0 && (
            <span className="text-xs text-muted">Mínimo {minQuantity} (já vendidos)</span>
          )}
        </label>
        <label className="flex items-center gap-2 self-center pt-6">
          <input
            type="checkbox"
            name="active"
            defaultChecked={editing?.active ?? true}
            className="size-5 accent-brand"
          />
          <span className="text-sm font-medium">À venda</span>
        </label>
      </div>

      <div>
        <button className={btnPrimary} disabled={pending}>
          {pending ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar ingresso"}
        </button>
      </div>
    </form>
  );
}
