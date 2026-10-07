"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { btnPrimary, btnSecondary, card } from "@/components/ui/styles";
import { SALES_MODES, salesModeLabel, salesModeText, type SalesMode } from "@/lib/shirts";
import { setSalesModeAction } from "./actions";

type Props = {
  mode: SalesMode;
  /** Rótulos das condições comerciais que ainda faltam. */
  missing: string[];
  /** Já existe pagamento de teste concluído? */
  testDone: boolean;
  enabledSizes: string[];
  windowText: string;
  batchLimit: number | null;
  activeCoupons: number;
};

const toast: Record<SalesMode, string> = {
  fechada: "Venda fechada. A vitrine mostra que as encomendas ainda não abriram.",
  cupom: "Modo Somente com cupom ativo. O público não consegue encomendar sem um cupom.",
  aberta: "Venda aberta ao público.",
};

function Mark({ ok }: { ok: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-[22px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
        ok ? "bg-success/16 text-success-ink" : "bg-cool-gray/20 text-ink"
      }`}
    >
      {ok ? "✓" : "!"}
    </span>
  );
}

/** Quem consegue encomendar agora. Abrir ao público pede confirmação com checagens. */
export function SalesModeCard(props: Props) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const blocked = props.missing.length > 0;
  const shown = confirming ? "aberta" : props.mode;

  const apply = (next: SalesMode) =>
    start(async () => {
      const result = await setSalesModeAction(next);
      setConfirming(false);
      setMessage(result.ok ? { tone: "success", text: toast[next] } : { tone: "error", text: result.message });
    });

  const choose = (next: SalesMode) => {
    setMessage(null);
    if (next === props.mode) return setConfirming(false);
    if (next === "aberta") return setConfirming(true);
    setConfirming(false);
    apply(next);
  };

  const checks = [
    { ok: !blocked, text: blocked ? `Faltam ${props.missing.length} condições da venda.` : "Condições da venda completas (9 de 9)." },
    {
      ok: props.testDone,
      text: props.testDone
        ? "Pagamento de teste concluído."
        : "Nenhum pagamento de teste concluído. Recomendamos testar antes de abrir.",
    },
    {
      ok: props.enabledSizes.length > 0,
      text: `Tamanhos aceitando encomendas: ${props.enabledSizes.length ? props.enabledSizes.join(", ") : "nenhum"}.`,
    },
    { ok: true, text: `${props.windowText}${props.batchLimit ? `, lote de ${props.batchLimit} camisas` : ""}.` },
  ];

  const note: Record<SalesMode, string> = {
    fechada: "A vitrine mostra que as encomendas ainda não abriram. Nenhum cupom libera a compra neste modo.",
    cupom: `Venda restrita: só quem tem um cupom ativo consegue encomendar. Cupons ativos agora: ${props.activeCoupons}.`,
    aberta: "Qualquer pessoa pode encomendar, dentro da janela, do lote e dos tamanhos habilitados.",
  };

  return (
    <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby="modo-venda">
      <div className="flex flex-col gap-1">
        <h2 id="modo-venda" className="text-[22px] font-semibold leading-tight">
          Modo de venda
        </h2>
        <p className="text-sm text-cool-gray">Controla quem consegue encomendar a camisa agora.</p>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-3" disabled={pending}>
        <legend className="sr-only">Modo de venda</legend>
        {SALES_MODES.map((m) => {
          const locked = m !== "fechada" && blocked && m !== props.mode;
          return (
            <label
              key={m}
              className={`flex items-start gap-3 rounded-xl border p-4 transition-colors duration-150 ${
                shown === m ? "border-brand-dark bg-brand-subtle" : "border-line bg-surface hover:border-muted"
              } ${locked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
            >
              <input
                type="radio"
                name="modo-venda"
                value={m}
                checked={shown === m}
                disabled={locked}
                onChange={() => choose(m)}
                className="mt-0.5 size-5 shrink-0"
              />
              <span className="flex flex-col gap-1">
                <strong className="text-base font-semibold">{salesModeLabel[m]}</strong>
                <span className="text-sm leading-snug text-cool-gray">{salesModeText[m]}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {blocked && (
        <p className="rounded-xl bg-cool-gray/12 px-4 py-3 text-sm">
          <strong className="font-semibold">Faltam {props.missing.length} condições para abrir a venda:</strong>{" "}
          {props.missing.join(", ")}. Preencha nas configurações da venda.
        </p>
      )}

      {confirming && (
        <div role="alertdialog" aria-labelledby="abrir-titulo" className="flex flex-col gap-3 rounded-xl bg-muted/8 p-4">
          <h3 id="abrir-titulo" className="text-lg font-semibold leading-snug">
            Abrir a venda ao público?
          </h3>
          <ul className="flex flex-col gap-2">
            {checks.map((c) => (
              <li key={c.text} className="flex items-start gap-2.5 text-sm leading-snug">
                <Mark ok={c.ok} />
                <span>
                  <span className="sr-only">{c.ok ? "Confere: " : "Atenção: "}</span>
                  {c.text}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={pending} onClick={() => apply("aberta")}>
              {pending ? "Abrindo…" : props.testDone ? "Confirmar e abrir ao público" : "Abrir mesmo assim"}
            </button>
            <button type="button" className={btnSecondary} onClick={() => setConfirming(false)}>
              Cancelar
            </button>
            <Link href="/admin/camisas/teste" className={btnSecondary}>
              Ver o roteiro de teste
            </Link>
          </div>
        </div>
      )}

      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}

      <p className="rounded-xl bg-brand-subtle px-4 py-3 text-sm leading-snug">
        {note[props.mode]}{" "}
        {props.mode === "cupom" && (
          <Link href="/admin/camisas/teste" className="font-semibold text-brand-dark underline-offset-4 hover:underline">
            Fazer o teste de pagamento
          </Link>
        )}
      </p>
    </section>
  );
}
