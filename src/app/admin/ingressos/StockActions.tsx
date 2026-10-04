"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { btnSecondary } from "@/components/ui/styles";
import { addStock, deleteTicketType, setTicketTypeActive } from "./actions";

export function StockActions({
  id,
  active,
  canDelete,
}: {
  id: string;
  active: boolean;
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = (fn: () => Promise<string | void>) =>
    startTransition(async () => {
      try {
        setMessage((await fn()) ?? null);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Algo deu errado.");
      }
    });

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(amount);
          run(async () => {
            const msg = await addStock(id, n);
            setAmount("");
            return msg;
          });
        }}
      >
        <input
          className="w-28 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand-subtle"
          type="number"
          min={1}
          step={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="+ qtd"
          aria-label="Quantidade a adicionar ao estoque"
          required
        />
        <button className={`${btnSecondary} whitespace-nowrap`} disabled={pending}>
          Adicionar estoque
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/ingressos?editar=${id}`} className={btnSecondary}>
          Editar
        </Link>
        <button
          className={btnSecondary}
          disabled={pending}
          onClick={() => run(() => setTicketTypeActive(id, !active))}
        >
          {active ? "Tirar de venda" : "Colocar à venda"}
        </button>
        {canDelete &&
          (confirmDelete ? (
            <button
              className={`${btnSecondary} text-danger-ink`}
              disabled={pending}
              onClick={() => run(() => deleteTicketType(id))}
            >
              Confirmar exclusão
            </button>
          ) : (
            <button className={`${btnSecondary} text-danger-ink`} onClick={() => setConfirmDelete(true)}>
              Excluir
            </button>
          ))}
      </div>
      {message && (
        <p role="status" className="text-xs text-cool-gray">
          {message}
        </p>
      )}
    </div>
  );
}
