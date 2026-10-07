"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { badgeNeutral, badgeSuccess, card } from "@/components/ui/styles";
import { Switch } from "@/components/ui/Switch";
import { setSizeEnabledAction } from "./actions";

export type SizeRow = { size: string; enabled: boolean; paid: number; pending: number };

/** Lote por tamanho com interruptor: desligue quando o fornecedor deixar de atender o tamanho. */
export function SizesCard({ rows, ordersHref }: { rows: SizeRow[]; ordersHref: string }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const toggle = (row: SizeRow, enabled: boolean) => {
    setBusy(row.size);
    setMessage(null);
    start(async () => {
      const result = await setSizeEnabledAction(row.size, enabled);
      setBusy(null);
      setMessage(
        result.ok
          ? {
              tone: "success",
              text: enabled
                ? `Tamanho ${row.size} habilitado.`
                : `Tamanho ${row.size} desabilitado. Novas compras neste tamanho estão bloqueadas.`,
            }
          : { tone: "error", text: result.message },
      );
    });
  };

  const cautions = rows.filter((r) => !r.enabled && r.paid > 0);
  const total = rows.reduce((sum, r) => sum + r.paid, 0);

  return (
    <section className={`${card} flex flex-col gap-3 py-4 sm:py-5`} aria-labelledby="lote-tamanho">
      <div className="flex flex-col gap-1 px-4 sm:px-5">
        <h2 id="lote-tamanho" className="text-[22px] font-semibold leading-tight">
          Lote por tamanho
        </h2>
        <p className="text-sm text-cool-gray">
          Camisas pagas por tamanho. Desligue um tamanho quando o fornecedor deixar de atender: quem já comprou continua
          com a encomenda.{" "}
          <Link href="/admin/camisas/configuracoes?aba=tamanhos" className="font-semibold text-brand-dark underline-offset-4 hover:underline">
            Limites e mensagens por tamanho
          </Link>
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 text-sm text-muted sm:px-5">A grade de tamanhos ainda não foi definida. Use Editar configurações.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="text-xs font-medium uppercase tracking-wide text-muted">
                <th className="px-4 py-2 sm:pl-5">Aceitar</th>
                <th className="px-2 py-2">Tamanho</th>
                <th className="px-2 py-2 text-right">Pagas</th>
                <th className="px-2 py-2 text-right">Pendentes</th>
                <th className="px-4 py-2 sm:pr-5">Situação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.size} className="border-t border-line">
                  <td className="px-4 py-1 sm:pl-5">
                    <Switch
                      checked={r.enabled}
                      label={`Aceitar encomendas no tamanho ${r.size}`}
                      busy={pending && busy === r.size}
                      disabled={pending}
                      onChange={(next) => toggle(r, next)}
                    />
                  </td>
                  <td className="px-2 py-1 text-base font-semibold">{r.size}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{r.paid}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{r.pending}</td>
                  <td className="px-4 py-1 sm:pr-5">
                    <span className={r.enabled ? badgeSuccess : badgeNeutral}>
                      {r.enabled ? "Aceitando encomendas" : "Desabilitado"}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-line text-cool-gray">
                <td className="px-4 py-2 sm:pl-5" />
                <td className="px-2 py-2 font-medium">Total</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums text-ink">{total}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {cautions.length > 0 && (
        <div role="status" className="mx-4 flex flex-col gap-1.5 rounded-xl bg-cool-gray/12 px-4 py-3 text-sm leading-snug sm:mx-5">
          <strong className="font-semibold">Atenção: há encomendas pagas em tamanho desabilitado.</strong>
          {cautions.map((c) => (
            <span key={c.size}>
              {c.size}: {c.paid} {c.paid === 1 ? "encomenda paga continua válida" : "encomendas pagas continuam válidas"}. Novas
              compras ficam bloqueadas.
            </span>
          ))}
          <Link href={ordersHref} className="font-semibold text-brand-dark underline-offset-4 hover:underline">
            Ver essas encomendas
          </Link>
        </div>
      )}

      {message && (
        <div className="px-4 sm:px-5">
          <FormMessage tone={message.tone}>{message.text}</FormMessage>
        </div>
      )}
    </section>
  );
}
