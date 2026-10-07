import Link from "next/link";
import { EmptyState, PageHeader, tableCls, tdCls, thCls, trCls } from "@/components/admin/PageHeader";
import { OrderStatusBadge } from "@/components/admin/StatusBadges";
import { badgeBrand, badgeNeutral, badgeSuccess, card } from "@/components/ui/styles";
import { formatBRL, formatDateTime } from "@/lib/format";
import { paymentMethodLabel } from "@/lib/labels";
import {
  couponBuyerLimitText,
  couponDescription,
  couponStatus,
  couponStatusLabel,
  couponUsesText,
  couponValidityText,
  type ShirtCouponRow,
} from "@/lib/shirt-coupons";
import type { ShirtOrderRow } from "@/lib/shirt-orders";
import { CouponActiveButton, CouponEditForm } from "./CouponDetailActions";

export type CouponOrder = Pick<
  ShirtOrderRow,
  "id" | "code" | "buyer_name" | "buyer_email" | "size" | "quantity" | "total_cents" | "discount_cents" | "status" | "payment_method" | "created_at" | "is_test"
>;

/** Detalhe de um cupom: dados, edição de limites e quem usou. */
export function CouponDetailView({ coupon, orders }: { coupon: ShirtCouponRow; orders: CouponOrder[] }) {
  const status = couponStatus(coupon);
  const statusTone = status === "ativo" ? badgeSuccess : status === "agendado" ? badgeBrand : badgeNeutral;

  const facts: [string, React.ReactNode][] = [
    ["Desconto", couponDescription(coupon)],
    ["Situação", <span key="s" className={statusTone}>{couponStatusLabel[status]}</span>],
    ["Usos (pagos e reservas)", couponUsesText(coupon)],
    ["Limite por CPF", couponBuyerLimitText(coupon)],
    ["Validade", couponValidityText(coupon)],
    ["Campanha", coupon.campaign ?? "—"],
    ["Desconto concedido", coupon.is_test ? "—" : formatBRL(coupon.discount_given_cents)],
    ["Receita com o cupom", coupon.is_test ? "—" : formatBRL(coupon.revenue_cents)],
    ["Criado em", formatDateTime(coupon.created_at)],
  ];

  return (
    <>
      <nav aria-label="Navegação" className="text-sm text-muted">
        <Link href="/admin/camisas/cupons" className="inline-flex min-h-11 items-center hover:text-brand pointer-fine:min-h-0">
          Cupons
        </Link>{" "}
        › <span className="font-mono text-ink">{coupon.code}</span>
      </nav>

      <PageHeader
        title={coupon.code}
        description={coupon.is_test ? "Cupom de teste de pagamento: fica fora de receita, lote e Excel." : (coupon.campaign ?? "Cupom sem campanha")}
        actions={<CouponActiveButton id={coupon.id} active={coupon.active} />}
      />

      <section className={`${card} grid grid-cols-2 gap-x-6 gap-y-4 p-4 sm:p-5 lg:grid-cols-3 lg:gap-x-8`} aria-label="Dados do cupom">
        {facts.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted">{k}</span>
            <span className="break-words text-sm font-medium [overflow-wrap:anywhere]">{v}</span>
          </div>
        ))}
      </section>

      <CouponEditForm
        id={coupon.id}
        maxUses={coupon.max_uses}
        maxPerBuyer={coupon.max_per_buyer}
        validFrom={coupon.valid_from}
        validUntil={coupon.valid_until}
        campaign={coupon.campaign}
        notes={coupon.notes}
        usedNow={coupon.paid_uses + coupon.pending_uses}
      />

      <section className={`${card} overflow-hidden`} aria-labelledby="usos">
        <h2 id="usos" className="px-4 pt-4 text-[22px] font-semibold leading-tight sm:px-5 sm:pt-5">
          Quem usou
        </h2>
        {orders.length ? (
          <div className="overflow-x-auto">
            <table className={`${tableCls} mt-3`}>
              <thead>
                <tr>
                  <th className={thCls}>Comprador</th>
                  <th className={thCls}>Tamanho</th>
                  <th className={`${thCls} text-right`}>Desconto</th>
                  <th className={`${thCls} text-right`}>Total</th>
                  <th className={thCls}>Pagamento</th>
                  <th className={thCls}>Criada em</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className={`${trCls} relative transition-colors hover:bg-muted/8`}>
                    <td className={tdCls}>
                      <Link
                        href={`/admin/camisas/encomendas/${o.id}`}
                        className="font-medium after:absolute after:inset-0 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        {o.buyer_name}
                      </Link>
                      <div className="text-xs text-muted">
                        {o.buyer_email} · {o.code}
                      </div>
                    </td>
                    <td data-label="Tamanho" className={`${tdCls} whitespace-nowrap`}>{o.size} × {o.quantity}</td>
                    <td data-label="Desconto" className={`${tdCls} text-right tabular-nums`}>{formatBRL(o.discount_cents)}</td>
                    <td data-label="Total" className={`${tdCls} text-right tabular-nums`}>{formatBRL(o.total_cents)}</td>
                    <td data-label="Pagamento" className={tdCls}>
                      <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-start">
                        <OrderStatusBadge status={o.status} />
                        {o.payment_method && <span className="text-xs text-muted">{paymentMethodLabel[o.payment_method]}</span>}
                      </div>
                    </td>
                    <td data-label="Criada em" className={`${tdCls} whitespace-nowrap text-cool-gray`}>{formatDateTime(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Nenhuma encomenda usou este cupom ainda.</EmptyState>
        )}
      </section>
    </>
  );
}
