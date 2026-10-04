import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { PageHeader } from "@/components/admin/PageHeader";
import { OrderStatusBadge, TicketStatusBadge } from "@/components/admin/StatusBadges";
import { card } from "@/components/ui/styles";
import { formatBRL, formatDateTime, formatEventDate } from "@/lib/format";
import type { TicketStatus } from "@/lib/labels";
import { paymentMethodLabel } from "@/lib/labels";
import type { OrderRow } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pedido — Dashboard" };

type TicketRow = {
  id: string;
  holder_name: string;
  token: string;
  short_code: string;
  status: TicketStatus;
  redeemed_at: string | null;
  ticket_types: { name: string; event_date: string } | null;
  redeemer: { name: string } | null;
};

export default async function PedidoPage({ params }: PageProps<"/admin/pedidos/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [orderRes, ticketsRes] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).maybeSingle<OrderRow>(),
    supabase
      .from("tickets")
      .select(
        "id, holder_name, token, short_code, status, redeemed_at, ticket_types(name, event_date), redeemer:profiles!tickets_redeemed_by_fkey(name)",
      )
      .eq("order_id", id)
      .order("created_at")
      .returns<TicketRow[]>(),
  ]);
  if (orderRes.error) throw new Error(`Falha ao carregar o pedido: ${orderRes.error.message}`);
  if (ticketsRes.error) throw new Error(`Falha ao carregar ingressos: ${ticketsRes.error.message}`);
  const order = orderRes.data;
  if (!order) notFound();

  const tickets = await Promise.all(
    (ticketsRes.data ?? []).map(async (t) => ({
      ...t,
      qr: await QRCode.toDataURL(t.token, { margin: 1, width: 240 }),
    })),
  );

  const facts: [string, React.ReactNode][] = [
    ["Status", <OrderStatusBadge key="s" status={order.status} />],
    ["E-mail", order.buyer_email],
    ["CPF", order.buyer_cpf],
    ["Telefone", order.buyer_phone ?? "—"],
    ["Pagamento", order.payment_method ? paymentMethodLabel[order.payment_method] : "—"],
    ["ID Mercado Pago", order.mp_payment_id ?? "—"],
    ["Status no Mercado Pago", order.mp_status ? `${order.mp_status}${order.mp_status_detail ? ` (${order.mp_status_detail})` : ""}` : "—"],
    ["Ingressos (subtotal)", formatBRL(order.subtotal_cents)],
    ["Acréscimo do cartão", formatBRL(Math.max(0, order.total_cents - order.subtotal_cents))],
    ["Total cobrado", formatBRL(order.total_cents)],
    ["Taxas", formatBRL(order.fee_cents)],
    ["Líquido", formatBRL(order.net_cents)],
    ["Criado em", formatDateTime(order.created_at)],
    ["Pago em", formatDateTime(order.paid_at)],
    ...(order.status === "pendente" ? ([["Reserva até", formatDateTime(order.expires_at)]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <>
      <nav className="text-sm text-muted" aria-label="Navegação">
        <Link href="/admin/pedidos" className="hover:text-brand">
          Pedidos
        </Link>{" "}
        › <span className="text-ink">{order.buyer_name}</span>
      </nav>
      <PageHeader title={order.buyer_name} description={`Pedido ${order.id}`} />

      <section className={`${card} grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3`}>
        {facts.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted">{k}</span>
            <span className="break-all text-sm font-medium">{v}</span>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[22px] font-semibold leading-tight">Ingressos ({tickets.length})</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tickets.map((t) => (
            <article key={t.id} className={`${card} flex flex-col items-center gap-3 p-5 text-center`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URI gerada no servidor */}
              <img src={t.qr} alt={`QR do ingresso ${t.short_code}`} width={160} height={160} />
              <div className="font-mono text-lg font-semibold tracking-widest">{t.short_code}</div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{t.holder_name}</span>
                <span className="text-xs text-muted">
                  {t.ticket_types?.name} · {formatEventDate(t.ticket_types?.event_date)}
                </span>
              </div>
              <TicketStatusBadge status={t.status} />
              {t.redeemed_at && (
                <p className="text-xs text-cool-gray">
                  Rasgado em {formatDateTime(t.redeemed_at)}
                  {t.redeemer ? ` por ${t.redeemer.name}` : ""}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
