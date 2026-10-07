"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { FormMessage } from "@/components/AuthShell";
import { OrderStatusBadge } from "@/components/admin/StatusBadges";
import { badgeBrand, badgeNeutral, badgeSuccess, btnOutline, btnPrimary, btnSecondary, card } from "@/components/ui/styles";
import { formatDateTime } from "@/lib/format";
import { paymentMethodLabel, type OrderStatus, type PaymentMethod } from "@/lib/labels";
import { couponStatusLabel, type CouponStatus } from "@/lib/shirt-coupons";
import type { TestStepState } from "@/lib/shirt-test-flow";
import { createTestCouponAction, markTestStepAction } from "../actions";

export type RoteiroStep = { n: number; title: string; text: string; state: TestStepState; optional: boolean };

type Props = {
  steps: RoteiroStep[];
  stage: number;
  methodsPaid: { pix: boolean; cartao: boolean };
  hasUnrefunded: boolean;
  coupon: { code: string; status: CouponStatus; uses: number; maxUses: number | null; validUntil: string | null } | null;
  purchaseUrl: string | null;
  orders: { id: string; code: string; size: string; status: OrderStatus; paymentMethod: PaymentMethod | null }[];
};

const stateBadge: Record<TestStepState, [string, string]> = {
  done: ["Concluído", badgeSuccess],
  current: ["Agora", badgeBrand],
  pending: ["Pendente", badgeNeutral],
};

function Marker({ n, state }: { n: number; state: TestStepState }) {
  const style =
    state === "done"
      ? "border-brand bg-brand text-white"
      : state === "current"
        ? "border-brand-dark bg-brand-subtle text-brand-dark"
        : "border-line bg-surface text-cool-gray";
  return (
    <span aria-hidden="true" className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold ${style}`}>
      {state === "done" ? (
        <svg viewBox="0 0 16 16" className="size-4">
          <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        n
      )}
    </span>
  );
}

function MethodChip({ label, paid }: { label: string; paid: boolean }) {
  return <span className={paid ? badgeSuccess : badgeNeutral}>{label}: {paid ? "pago" : "aguardando"}</span>;
}

/** Roteiro guiado do teste de pagamento: cada passo avança sozinho conforme os dados do banco. */
export function TestRoteiro({ steps, stage, methodsPaid, hasUnrefunded, coupon, purchaseUrl, orders }: Props) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const run = (job: () => Promise<{ ok: boolean; message?: string }>, success: string) =>
    start(async () => {
      const result = await job();
      setMessage(result.ok ? { tone: "success", text: result.message ?? success } : { tone: "error", text: result.message ?? "Não foi possível concluir." });
    });

  const copy = async () => {
    if (!purchaseUrl) return;
    try {
      await navigator.clipboard.writeText(purchaseUrl);
      setCopied("Link copiado.");
    } catch {
      setCopied("Não foi possível copiar. Selecione o link e copie.");
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-6">
      {stage === 4 && <AutoRefresh seconds={5} />}

      <section className={`${card} flex min-w-0 flex-[999_1_34rem] flex-col gap-4 p-4 sm:p-5`} aria-labelledby="passos">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="passos" className="text-[22px] font-semibold leading-tight">
            Passo a passo
          </h2>
          <button
            type="button"
            className={btnSecondary}
            disabled={pending}
            onClick={() => run(() => markTestStepAction("reset"), "Marcas de conferência e estorno limpas.")}
          >
            Recomeçar marcas
          </button>
        </div>

        {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}

        <ol className="flex flex-col">
          {steps.map((s) => {
            const current = s.state === "current";
            const [badgeText, badgeClass] = stateBadge[s.state];
            return (
              <li key={s.n} aria-current={current ? "step" : undefined} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3.5 border-t border-line py-4">
                <Marker n={s.n} state={s.state} />
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className={`text-base font-semibold leading-snug ${s.state === "pending" ? "text-cool-gray" : ""}`}>{s.title}</h3>
                    <span className={badgeClass}>
                      <span className="sr-only">Situação: </span>
                      {badgeText}
                    </span>
                    {s.optional && <span className="text-xs text-muted">Opcional</span>}
                  </div>
                  <p className="text-sm leading-relaxed text-cool-gray">{s.text}</p>

                  {current && s.n === 1 && (
                    <div>
                      <Link href="/admin/camisas" className={btnOutline}>
                        Completar as condições
                      </Link>
                    </div>
                  )}
                  {current && s.n === 2 && (
                    <div>
                      <Link href="/admin/camisas" className={btnOutline}>
                        Ir para o Modo de venda
                      </Link>
                    </div>
                  )}
                  {current && s.n === 3 && (
                    <div className="flex flex-col items-start gap-2">
                      <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => createTestCouponAction(), "Cupom de teste criado.")}>
                        {pending ? "Criando…" : "Criar cupom de teste"}
                      </button>
                      <span className="text-xs text-muted">
                        Valor final R$ 1,00, 2 usos (Pix e cartão), 24 horas. Libera a compra no modo Somente com cupom e fica fora de
                        receita, lote e Excel.
                      </span>
                    </div>
                  )}
                  {current && s.n === 4 && (
                    <div className="flex flex-col gap-3">
                      <ol className="list-decimal pl-5 text-sm leading-relaxed">
                        <li>Abra o link do cupom (ao lado) em uma janela anônima.</li>
                        <li>Escolha um tamanho e confira o valor: R$ 1,00 no Pix e R$ 1,05 no cartão.</li>
                        <li>Pague uma vez no Pix e outra no cartão, com o mesmo cupom.</li>
                      </ol>
                      <div className="flex flex-wrap gap-2">
                        <MethodChip label="Pix" paid={methodsPaid.pix} />
                        <MethodChip label="Cartão" paid={methodsPaid.cartao} />
                      </div>
                      <p role="status" className="rounded-xl bg-brand-subtle px-3 py-2.5 text-sm">
                        Aguardando o Mercado Pago confirmar o pagamento. Esta página atualiza sozinha.
                      </p>
                    </div>
                  )}
                  {current && s.n === 5 && (
                    <div className="flex flex-wrap gap-2">
                      <Link href="/admin/camisas/encomendas?teste=1" className={btnOutline}>
                        Abrir as encomendas de teste
                      </Link>
                      <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => markTestStepAction("checked"), "Encomendas marcadas como conferidas.")}>
                        Marcar como conferidas
                      </button>
                    </div>
                  )}
                  {current && s.n === 6 && (
                    <div className="flex flex-col gap-2">
                      {hasUnrefunded && <p className="text-sm">Ainda há pagamento de teste sem estorno no Mercado Pago.</p>}
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => markTestStepAction("refunds"), "Estornos marcados como feitos.")}>
                          Estornos feitos
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => markTestStepAction("refunds"), "Etapa pulada.")}
                          className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-brand-dark underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand"
                        >
                          Pular esta etapa
                        </button>
                      </div>
                    </div>
                  )}
                  {current && s.n === 7 && (
                    <div>
                      <Link href="/admin/camisas" className={btnPrimary}>
                        Ir para o Modo de venda
                      </Link>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <aside className={`${card} flex min-w-0 flex-[1_1_20rem] flex-col gap-4 p-4 sm:p-5`} aria-labelledby="cupom-teste">
        <h2 id="cupom-teste" className="text-[22px] font-semibold leading-tight">
          Cupom de teste
        </h2>
        {coupon ? (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Código</span>
              <span className="select-all font-mono text-2xl font-semibold leading-tight">{coupon.code}</span>
            </div>
            {purchaseUrl && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">Link da compra</span>
                <span className="select-all break-all rounded-xl bg-muted/8 px-3 py-2.5 font-mono text-[13px] leading-relaxed">{purchaseUrl}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={btnOutline} onClick={copy}>
                    Copiar link
                  </button>
                  {copied && (
                    <span role="status" className="text-xs text-cool-gray">
                      {copied}
                    </span>
                  )}
                </div>
              </div>
            )}
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-cool-gray">Valor final</dt>
                <dd className="font-semibold">R$ 1,00</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-cool-gray">Usos</dt>
                <dd className="font-semibold tabular-nums">
                  {coupon.uses} / {coupon.maxUses ?? "sem limite"}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-cool-gray">Validade</dt>
                <dd className="font-semibold">{coupon.validUntil ? `Até ${formatDateTime(coupon.validUntil)}` : "Sem prazo"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-cool-gray">Situação</dt>
                <dd>
                  <span className={coupon.status === "ativo" ? badgeSuccess : badgeNeutral}>{couponStatusLabel[coupon.status]}</span>
                </dd>
              </div>
            </dl>
            {coupon.status !== "ativo" && (
              <p className="text-xs text-muted">Este cupom não vale mais. Se precisar testar de novo, crie outro no passo 3.</p>
            )}
            {coupon.status !== "ativo" && stage !== 3 && (
              <button type="button" className={btnPrimary} disabled={pending} onClick={() => run(() => createTestCouponAction(), "Cupom de teste criado.")}>
                Criar outro cupom de teste
              </button>
            )}
          </>
        ) : (
          <p className="text-sm leading-relaxed text-cool-gray">O cupom aparece aqui depois de criado, com o link pronto para abrir a compra.</p>
        )}

        {orders.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <h3 className="text-base font-semibold">Encomendas de teste</h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/admin/camisas/encomendas/${o.id}`} className="font-medium text-brand-dark underline-offset-4 hover:underline">
                    {o.code} · {o.size}
                    {o.paymentMethod ? ` · ${paymentMethodLabel[o.paymentMethod]}` : ""}
                  </Link>
                  <OrderStatusBadge status={o.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
