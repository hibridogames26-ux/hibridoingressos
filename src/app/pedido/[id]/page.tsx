import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicHeader, Steps } from "@/components/PublicHeader";
import { card, textLink } from "@/components/ui/styles";
import { chargeCents, surchargeCents } from "@/config/fees";
import { mercadoPagoPublicKey } from "@/lib/env";
import { formatBRL, formatEventDate } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/labels";
import { getOrderForBuyer, syncOrderWithMp, type BuyerOrder } from "@/lib/order-service";
import { createAdminClient } from "@/lib/supabase/server";
import { isReservationExpired } from "@/lib/time";
import { PaymentStep } from "./PaymentStep";
import { Tickets } from "./Tickets";

export const metadata: Metadata = { title: "Seu pedido — Híbrido Games 2026", robots: { index: false } };
export const dynamic = "force-dynamic";

function Summary({ order }: { order: BuyerOrder }) {
  return (
    <aside className={`${card} flex flex-col gap-3 p-4 sm:p-5`}>
      <h2 className="text-[22px] font-semibold leading-tight">Resumo</h2>
      <ul className="flex flex-col gap-3 text-sm">
        {order.order_items.map((item, i) => (
          <li key={i} className="flex flex-col gap-1">
            <div className="flex justify-between gap-3">
              <span>
                {item.quantity}× {item.ticket_types?.name}
                <span className="block text-xs text-muted">{formatEventDate(item.ticket_types?.event_date)}</span>
              </span>
              <span className="tabular-nums">{formatBRL(item.quantity * item.unit_price_cents)}</span>
            </div>
            <span className="break-words text-xs text-cool-gray">{item.holder_names.join(", ")}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line pt-3 text-xs text-muted">
        Comprador: {order.buyer_name} · {order.buyer_email}
      </p>
    </aside>
  );
}

export default async function PedidoPage({ params, searchParams }: PageProps<"/pedido/[id]">) {
  const { id } = await params;
  const { k } = await searchParams;
  const key = typeof k === "string" ? k : undefined;

  let order = await getOrderForBuyer(id, key);
  if (!order) notFound();

  if (order.status === "pendente") {
    // Confirma pagamentos feitos enquanto a página estava fechada.
    const synced = await syncOrderWithMp(id).catch((e) => {
      console.error("Error syncing order:", e);
      return null;
    });
    if (synced && synced !== "pendente") order = (await getOrderForBuyer(id, key))!;
    else if (isReservationExpired(order)) {
      await createAdminClient().rpc("release_expired_orders");
      order = (await getOrderForBuyer(id, key))!;
    }
  }

  return (
    <main className="flex flex-1 flex-col bg-muted/8">
      <PublicHeader />
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:gap-6 sm:py-8">
        <Steps current={3} />

        {order.status === "pago" && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-cool-gray">
                Pedido confirmado
                {order.payment_method && ` · ${paymentMethodLabel[order.payment_method]}`}
              </span>
              <h1 className="font-display text-[28px] font-bold leading-[1.29] tracking-[-0.5px]">Seus ingressos</h1>
              <p className="text-sm text-cool-gray">
                {order.tickets_email_sent_at
                  ? `Também enviamos o link desta página para ${order.buyer_email}.`
                  : "Guarde o link desta página: é por ele que você acessa seus ingressos."}
              </p>
            </div>
            <Tickets order={order} />
          </>
        )}

        {order.status === "pendente" && (
          <>
            <h1 className="font-display text-[1.75rem] font-bold leading-[1.22] tracking-[-0.5px] sm:text-4xl">Pagamento</h1>
            <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
              <PaymentStep
                orderId={order.id}
                accessKey={order.access_key}
                pixCents={chargeCents("pix", order.subtotal_cents)}
                cardCents={chargeCents("cartao", order.subtotal_cents)}
                surchargeCents={surchargeCents("cartao", order.subtotal_cents)}
                expiresAt={order.expires_at}
                inAnalysis={order.mp_status === "in_process" || order.mp_status === "authorized"}
                buyerEmail={order.buyer_email}
                buyerCpf={order.buyer_cpf}
                publicKey={mercadoPagoPublicKey()}
              />
              <Summary order={order} />
            </div>
          </>
        )}

        {(order.status === "cancelado" || order.status === "estornado") && (
          <div className={`${card} flex animate-rise flex-col items-center gap-3 px-5 py-10 text-center sm:px-6 sm:py-12`}>
            <h1 className="text-balance text-[28px] font-bold leading-tight">
              {order.status === "cancelado" ? "Reserva expirada" : "Pedido estornado"}
            </h1>
            <p className="max-w-md text-sm text-cool-gray">
              {order.status === "cancelado"
                ? "O tempo para pagamento acabou e os ingressos voltaram à venda. Nenhuma cobrança foi feita."
                : "O pagamento deste pedido foi devolvido e os ingressos foram cancelados."}
            </p>
            <Link href="/ingressos" className={textLink}>
              Fazer novo pedido
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
