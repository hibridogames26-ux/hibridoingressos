import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { FulfillmentBadge, OrderStatusBadge } from "@/components/admin/StatusBadges";
import { ProductionTracker } from "@/components/ProductionTracker";
import { btnOutline, btnPrimary, card, input } from "@/components/ui/styles";
import { formatCpf, formatPhone } from "@/lib/checkout";
import { formatBRL, formatDateTime } from "@/lib/format";
import {
  SHIRT_FULFILLMENT_STATUSES,
  nextShirtFulfillment,
  paymentMethodLabel,
  shirtFulfillmentLabel,
} from "@/lib/labels";
import type { ShirtOrderRow } from "@/lib/shirt-orders";
import { formatOrderCode, isFreeShirtOrder } from "@/lib/shirts";
import { createClient } from "@/lib/supabase/server";
import { updateOne } from "../actions";

export const metadata: Metadata = { title: "Encomenda — Dashboard" };
export const dynamic = "force-dynamic";

export default async function EncomendaPage({ params, searchParams }: PageProps<"/admin/camisas/encomendas/[id]">) {
  const { id } = await params;
  const { salvo } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: order, error } = await supabase.from("shirt_orders").select("*").eq("id", id).maybeSingle<ShirtOrderRow>();
  if (error) throw new Error(`Falha ao carregar a encomenda: ${error.message}`);
  if (!order) notFound();

  const paid = order.status === "pago";
  const next = nextShirtFulfillment(order.fulfillment_status);

  const facts: [string, React.ReactNode][] = [
    ["Pagamento", <OrderStatusBadge key="s" status={order.status} />],
    ["Encomenda de teste", order.is_test ? "Sim: fora de receita, lote e Excel" : "Não"],
    ["Andamento", paid && !order.is_test ? <FulfillmentBadge key="f" status={order.fulfillment_status} /> : "—"],
    ["E-mail", order.buyer_email],
    ["CPF", formatCpf(order.buyer_cpf)],
    ["Telefone", order.buyer_phone ? formatPhone(order.buyer_phone) : "—"],
    ["Produto", order.product_name],
    ["Tamanho", order.size],
    ["Quantidade", String(order.quantity)],
    ["Preço unitário", formatBRL(order.unit_price_cents)],
    ["Cupom", order.coupon_code ?? "—"],
    ["Desconto do cupom", order.discount_cents > 0 ? formatBRL(order.discount_cents) : "—"],
    ["Camisas (subtotal)", formatBRL(order.subtotal_cents)],
    ["Acréscimo do cartão", formatBRL(Math.max(0, order.total_cents - order.subtotal_cents))],
    ["Total cobrado", formatBRL(order.total_cents)],
    ["Taxas", paid || order.status === "estornado" ? formatBRL(order.fee_cents) : "—"],
    ["Líquido", paid || order.status === "estornado" ? formatBRL(order.net_cents) : "—"],
    [
      "Forma de pagamento",
      order.payment_method ? paymentMethodLabel[order.payment_method] : paid && isFreeShirtOrder(order) ? "Sem pagamento (cupom de 100%)" : "—",
    ],
    ["ID Mercado Pago", order.mp_payment_id ?? "—"],
    ["Status no Mercado Pago", order.mp_status ? `${order.mp_status}${order.mp_status_detail ? ` (${order.mp_status_detail})` : ""}` : "—"],
    ["Criada em", formatDateTime(order.created_at)],
    ["Paga em", formatDateTime(order.paid_at)],
    ...(order.status === "pendente" ? ([["Reserva até", formatDateTime(order.expires_at)]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <>
      <nav className="text-sm text-muted" aria-label="Navegação">
        <Link href="/admin/camisas/encomendas" className="inline-flex min-h-11 items-center hover:text-brand pointer-fine:min-h-0">
          Encomendas
        </Link>{" "}
        › <span className="text-ink">{order.buyer_name}</span>
      </nav>
      <PageHeader title={order.buyer_name} description={`Pedido ${formatOrderCode(order.code)} · ${order.id}`} />

      {salvo === "1" && (
        <p role="status" className="animate-message rounded-xl bg-success/16 px-4 py-3 text-sm text-success-ink">
          Andamento atualizado.
        </p>
      )}

      <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby="andamento">
        <h2 id="andamento" className="text-[22px] font-semibold leading-tight">
          Andamento da produção
        </h2>
        {paid && !order.is_test ? (
          <>
            <ProductionTracker status={order.fulfillment_status} />
            <div className="flex flex-wrap items-center gap-3">
              {next ? (
                <form action={updateOne}>
                  <input type="hidden" name="id" value={order.id} />
                  <input type="hidden" name="to" value={next} />
                  <button className={btnPrimary}>Marcar como {shirtFulfillmentLabel[next].toLowerCase()}</button>
                </form>
              ) : (
                <span className="text-sm text-cool-gray">Esta encomenda já foi entregue.</span>
              )}
              <form action={updateOne} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={order.id} />
                <input type="hidden" name="corrigir" value="1" />
                <label className="flex items-center gap-2 text-sm text-cool-gray">
                  Corrigir para
                  <select name="to" defaultValue={order.fulfillment_status} className={`${input} w-auto py-2 text-sm`}>
                    {SHIRT_FULFILLMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {shirtFulfillmentLabel[s]}
                      </option>
                    ))}
                  </select>
                </label>
                <button className={btnOutline}>Salvar</button>
              </form>
            </div>
          </>
        ) : (
          <p className="text-sm text-cool-gray">
            {order.is_test
              ? "Esta é uma encomenda de teste: não entra na produção, no lote nem nos relatórios."
              : `Esta encomenda está como “${order.status === "estornado" ? "estornada" : order.status}”. Só encomendas pagas têm andamento, e a estornada deixa de fazer parte do lote.`}
          </p>
        )}
      </section>

      <section className={`${card} grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:p-5 lg:grid-cols-3 lg:gap-x-8`}>
        {facts.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted">{k}</span>
            <span className="break-words text-sm font-medium [overflow-wrap:anywhere]">{v}</span>
          </div>
        ))}
      </section>

      <section className={`${card} flex flex-col gap-3 p-4 sm:p-5`} aria-labelledby="condicoes">
        <h2 id="condicoes" className="text-[22px] font-semibold leading-tight">
          Condições aceitas na compra
        </h2>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted">Prazo de produção</dt>
            <dd className="whitespace-pre-line font-medium">{order.production_lead_time}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted">Recebimento</dt>
            <dd className="whitespace-pre-line font-medium">{order.receipt_details}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted">Trocas, cancelamento e atendimento</dt>
            <dd className="whitespace-pre-line font-medium">{order.purchase_policy}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
