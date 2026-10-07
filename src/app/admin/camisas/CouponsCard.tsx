"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FormMessage } from "@/components/AuthShell";
import { badgeBrand, badgeNeutral, badgeSuccess, btnPrimary, btnSecondary, btnOutline, card, input, label } from "@/components/ui/styles";
import {
  couponDescription,
  couponKindLabel,
  couponStatus,
  couponStatusLabel,
  couponUsesText,
  generateCouponCode,
  type CouponKind,
  type CouponStatus,
  type ShirtCouponRow,
} from "@/lib/shirt-coupons";
import type { SalesMode } from "@/lib/shirts";
import { createCouponAction, setCouponActiveAction } from "./actions";

const tone: Record<CouponStatus, string> = {
  ativo: badgeSuccess,
  agendado: badgeBrand,
  encerrado: badgeNeutral,
  esgotado: badgeNeutral,
  desativado: badgeNeutral,
};

const VISIBLE = 6;

/** Cupons: lista compacta, criação de cupom de campanha e atalho para o teste de pagamento. */
export function CouponsCard({ coupons, mode, manageHref }: { coupons: ShirtCouponRow[]; mode: SalesMode; manageHref?: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<CouponKind>("percent");
  const [value, setValue] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [campaign, setCampaign] = useState("");

  const create = () => {
    setFormError(null);
    start(async () => {
      const result = await createCouponAction({ code, kind, value, maxUses, validUntil, campaign });
      if (!result.ok) return setFormError(result.message);
      setMessage({ tone: "success", text: result.message ?? "Cupom criado." });
      setOpen(false);
      setCode("");
      setValue("");
      setMaxUses("");
      setValidUntil("");
      setCampaign("");
    });
  };

  const toggle = (c: ShirtCouponRow) =>
    start(async () => {
      const result = await setCouponActiveAction(c.id, !c.active);
      setMessage(
        result.ok
          ? { tone: "success", text: `Cupom ${c.code} ${c.active ? "desativado" : "ativado"}.` }
          : { tone: "error", text: result.message },
      );
    });

  const shown = coupons.slice(0, VISIBLE);

  return (
    <section className={`${card} flex flex-col gap-4 py-4 sm:py-5`} aria-labelledby="cupons">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5">
        <div className="flex min-w-60 flex-1 flex-col gap-1">
          <h2 id="cupons" className="text-[22px] font-semibold leading-tight">
            Cupons
          </h2>
          <p className="text-sm text-cool-gray">
            {mode === "cupom"
              ? "No modo Somente com cupom, qualquer cupom ativo libera a compra."
              : "Códigos de desconto para campanhas e para testar o pagamento."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/camisas/teste" className={btnPrimary}>
            Criar cupom de teste
          </Link>
          <button type="button" className={btnOutline} aria-expanded={open} aria-controls="form-cupom" onClick={() => setOpen((v) => !v)}>
            {open ? "Fechar formulário" : "Novo cupom de campanha"}
          </button>
        </div>
      </div>

      {open && (
        <div id="form-cupom" className="mx-4 flex flex-col gap-4 rounded-xl bg-muted/8 p-4 sm:mx-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="c-codigo" className={label}>
                Código
              </label>
              <div className="flex gap-2">
                <input id="c-codigo" className={`${input} min-w-0 uppercase`} value={code} autoComplete="off" autoCapitalize="characters" spellCheck={false} onChange={(e) => setCode(e.target.value)} />
                <button type="button" className={btnSecondary} onClick={() => setCode(generateCouponCode("CUPOM"))}>
                  Gerar
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="c-tipo" className={label}>
                Tipo de desconto
              </label>
              <select id="c-tipo" className={input} value={kind} onChange={(e) => setKind(e.target.value as CouponKind)}>
                {(Object.keys(couponKindLabel) as CouponKind[]).map((k) => (
                  <option key={k} value={k}>
                    {couponKindLabel[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="c-valor" className={label}>
                {kind === "percent" ? "Percentual (1 a 100)" : kind === "amount" ? "Desconto (R$)" : "Valor final (R$)"}
              </label>
              <input id="c-valor" className={input} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
              {kind === "final" && <span className="text-xs text-muted">Valor total da encomenda. O mínimo é R$ 1,00.</span>}
              {kind === "percent" && value.trim() === "100" && (
                <span className="text-xs text-muted">Cupom de 100%: a encomenda é confirmada sem pagamento. Cada uso é uma camisa grátis; informe o limite de usos.</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="c-usos" className={label}>
                Limite de usos
              </label>
              <input id="c-usos" className={input} inputMode="numeric" placeholder="Sem limite" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="c-ate" className={label}>
                Válido até
              </label>
              <input id="c-ate" type="datetime-local" className={input} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              <span className="text-xs text-muted">Horário de Brasília. Vazio = sem prazo.</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="c-camp" className={label}>
                Campanha (opcional)
              </label>
              <input id="c-camp" className={input} placeholder="Ex.: Instagram" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
            </div>
          </div>
          {formError && <FormMessage tone="error">{formError}</FormMessage>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} disabled={pending} onClick={create}>
              {pending ? "Criando…" : "Criar cupom"}
            </button>
            <button type="button" className={btnSecondary} onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="px-4 sm:px-5">
          <FormMessage tone={message.tone}>{message.text}</FormMessage>
        </div>
      )}

      {shown.length === 0 ? (
        <p className="px-4 text-sm text-muted sm:px-5">Nenhum cupom ainda. Crie um cupom de teste para conferir o pagamento.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs font-medium uppercase tracking-wide text-muted">
                <th className="px-4 py-2 sm:pl-5">Código</th>
                <th className="px-2 py-2">Desconto</th>
                <th className="px-2 py-2">Usos</th>
                <th className="px-2 py-2">Situação</th>
                <th className="px-4 py-2 sm:pr-5" />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const status = couponStatus(c);
                return (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-4 py-2 sm:pl-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold">{c.code}</span>
                        {c.is_test && <span className={badgeBrand}>Teste</span>}
                      </div>
                      {c.campaign && <div className="text-xs text-muted">{c.campaign}</div>}
                    </td>
                    <td className="px-2 py-2">{couponDescription(c)}</td>
                    <td className="px-2 py-2 tabular-nums">{couponUsesText(c)}</td>
                    <td className="px-2 py-2">
                      <span className={tone[status]}>{couponStatusLabel[status]}</span>
                    </td>
                    <td className="px-4 py-1 text-right sm:pr-5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggle(c)}
                        className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-brand-dark underline-offset-4 hover:underline disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        {c.active ? "Desativar" : "Ativar"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {manageHref && coupons.length > 0 && (
        <p className="px-4 text-sm sm:px-5">
          <Link href={manageHref} className="font-semibold text-brand-dark underline-offset-4 hover:underline">
            Gerenciar todos os cupons ({coupons.length})
          </Link>
        </p>
      )}
    </section>
  );
}
