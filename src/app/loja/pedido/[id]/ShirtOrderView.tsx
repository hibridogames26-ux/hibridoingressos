import Link from "next/link";
import { PaymentStep } from "@/app/pedido/[id]/PaymentStep";
import { ProductionTracker } from "@/components/ProductionTracker";
import { PublicHeader, Steps } from "@/components/PublicHeader";
import { card, textLink } from "@/components/ui/styles";
import { SHIRT_PATH, shirtChargeCents, shirtSurchargeCents } from "@/config/shirts";
import { formatBRL, formatDateTime } from "@/lib/format";
import { paymentMethodLabel, shirtFulfillmentLabel, type ShirtFulfillment } from "@/lib/labels";
import type { ShirtBuyerOrder } from "@/lib/shirt-order-service";
import { formatOrderCode, isFreeShirtOrder } from "@/lib/shirts";

const STEPS = ["Camisa", "Seus dados", "Pagamento"] as const;

const fulfillmentNote = (free: boolean): Record<ShirtFulfillment, string> => ({
  aguardando_producao: free
    ? "Sua encomenda foi confirmada e sua camisa aguarda o início da produção."
    : "Seu pagamento foi confirmado e sua camisa aguarda o início da produção.",
  em_producao: "Sua camisa está sendo produzida.",
  pronto: "Sua camisa está pronta. Confira abaixo como receber.",
  entregue: "Sua camisa foi entregue.",
});

function Summary({ order }: { order: ShirtBuyerOrder }) {
  return (
    <aside className={`${card} flex flex-col gap-3 p-4 sm:p-5`}>
      <h2 className="text-[22px] font-semibold leading-tight">Resumo</h2>
      <div className="flex justify-between gap-3 text-sm">
        <span>
          {order.quantity}× {order.product_name}
          <span className="block text-xs text-muted">Tamanho {order.size} · sob encomenda</span>
        </span>
        <span className="tabular-nums">{formatBRL(order.quantity * order.unit_price_cents)}</span>
      </div>
      {order.coupon_code && (
        <dl className="flex flex-col gap-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between gap-3 text-success-ink">
            <dt>
              Cupom <span className="font-mono font-semibold">{order.coupon_code}</span>
            </dt>
            <dd className="tabular-nums">−{formatBRL(order.discount_cents)}</dd>
          </div>
        </dl>
      )}
      {order.status === "pago" && (
        <dl className="flex flex-col gap-1 border-t border-line pt-3 text-sm">
          {order.total_cents > order.subtotal_cents && (
            <div className="flex justify-between gap-3">
              <dt className="text-cool-gray">Taxa da operadora do cartão</dt>
              <dd className="tabular-nums">{formatBRL(order.total_cents - order.subtotal_cents)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3 font-semibold">
            <dt>{isFreeShirtOrder(order) ? "Total" : "Total pago"}</dt>
            <dd className="tabular-nums">{formatBRL(order.total_cents)}</dd>
          </div>
        </dl>
      )}
      <dl className="flex flex-col gap-1 border-t border-line pt-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-cool-gray">Prazo de produção</dt>
          <dd className="max-w-[60%] text-right">{order.production_lead_time}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-cool-gray">Recebimento</dt>
          <dd className="max-w-[60%] text-right">{order.receipt_details}</dd>
        </div>
      </dl>
      <p className="border-t border-line pt-3 text-xs text-muted">
        Pedido {formatOrderCode(order.code)} · {order.buyer_name} · {order.buyer_email}
      </p>
    </aside>
  );
}

/** Página da encomenda: pagamento pendente, confirmação com andamento da produção, ou encerrada. */
export function ShirtOrderView({ order, publicKey }: { order: ShirtBuyerOrder; publicKey: string }) {
  // Cupom de 100%: encomenda confirmada sem pagamento.
  const free = order.status === "pago" && isFreeShirtOrder(order);
  return (
    <main className="flex flex-1 flex-col bg-muted/8">
      <PublicHeader />
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:gap-6 sm:py-8">
        <Steps current={3} steps={STEPS} />

        {order.is_test && (
          <p role="status" className="rounded-xl bg-brand-subtle px-4 py-3 text-sm">
            <strong className="font-semibold">Encomenda de teste.</strong> Ela não entra na produção, no lote nem nos relatórios.
          </p>
        )}

        {order.status === "pago" && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-cool-gray">
                {free ? "Encomenda confirmada · sem pagamento (cupom de 100%)" : "Pagamento confirmado"}
                {order.payment_method && ` · ${paymentMethodLabel[order.payment_method]}`}
                {` · Pedido ${formatOrderCode(order.code)}`}
              </span>
              <h1 className="font-display text-[28px] font-bold leading-[1.29] tracking-[-0.5px]">Sua encomenda</h1>
              <p className="text-sm text-cool-gray">
                {order.confirmation_email_sent_at
                  ? `Também enviamos o link desta página para ${order.buyer_email}.`
                  : "Guarde o link desta página: é por ele que você acompanha sua camisa."}
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
              <div className="flex flex-col gap-6">
                <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby="producao">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 id="producao" className="text-[22px] font-semibold leading-tight">
                      Andamento
                    </h2>
                    <span className="rounded-md bg-success/16 px-2 py-0.5 text-xs font-medium text-success-ink">
                      {free ? "Confirmada" : "Pago"} em {formatDateTime(order.paid_at)}
                    </span>
                  </div>
                  <ProductionTracker status={order.fulfillment_status} />
                  <p className="text-sm">
                    <span className="font-medium">{shirtFulfillmentLabel[order.fulfillment_status]}.</span>{" "}
                    {fulfillmentNote(free)[order.fulfillment_status]}
                  </p>
                  <p className="rounded-xl bg-brand-subtle p-3 text-sm">
                    {free
                      ? "Sob encomenda: encomenda confirmada não significa camisa pronta. Você acompanha a produção por esta página."
                      : "Sob encomenda: pagamento confirmado não significa camisa pronta. O pagamento e a produção são acompanhados separadamente."}
                  </p>
                </section>

                <section className={`${card} flex flex-col gap-3 p-4 sm:p-5`} aria-labelledby="condicoes">
                  <h2 id="condicoes" className="text-[22px] font-semibold leading-tight">
                    Condições aceitas
                  </h2>
                  <dl className="flex flex-col gap-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <dt className="font-medium">Prazo de produção</dt>
                      <dd className="whitespace-pre-line text-cool-gray">{order.production_lead_time}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="font-medium">Recebimento</dt>
                      <dd className="whitespace-pre-line text-cool-gray">{order.receipt_details}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="font-medium">Trocas, cancelamento e atendimento</dt>
                      <dd className="whitespace-pre-line text-cool-gray">{order.purchase_policy}</dd>
                    </div>
                  </dl>
                </section>
              </div>
              <Summary order={order} />
            </div>
          </>
        )}

        {order.status === "pendente" && (
          <>
            <h1 className="font-display text-[1.75rem] font-bold leading-[1.22] tracking-[-0.5px] sm:text-4xl">Pagamento</h1>
            <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
              <PaymentStep
                kind="shirt"
                orderId={order.id}
                accessKey={order.access_key}
                pixCents={shirtChargeCents("pix", order.subtotal_cents)}
                cardCents={shirtChargeCents("cartao", order.subtotal_cents)}
                surchargeCents={shirtSurchargeCents("cartao", order.subtotal_cents)}
                expiresAt={order.expires_at}
                inAnalysis={order.mp_status === "in_process" || order.mp_status === "authorized"}
                buyerEmail={order.buyer_email}
                buyerCpf={order.buyer_cpf}
                publicKey={publicKey}
              />
              <Summary order={order} />
            </div>
          </>
        )}

        {(order.status === "cancelado" || order.status === "estornado") && (
          <div className={`${card} flex animate-rise flex-col items-center gap-3 px-5 py-10 text-center sm:px-6 sm:py-12`}>
            <h1 className="text-balance text-[28px] font-bold leading-tight">
              {order.status === "cancelado" ? "Reserva expirada" : "Pagamento estornado"}
            </h1>
            <p className="max-w-md text-sm text-cool-gray">
              {order.status === "cancelado"
                ? "O tempo para pagamento acabou e a reserva foi liberada. Nenhuma cobrança foi feita."
                : "O pagamento desta encomenda foi devolvido e ela não faz mais parte da produção."}
            </p>
            <Link href={SHIRT_PATH} className={textLink}>
              Ver a camisa
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
