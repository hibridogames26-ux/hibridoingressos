import type { Metadata } from "next";
import { EmptyState, PageHeader, Stat, tableCls, tdCls, thCls, trCls } from "@/components/admin/PageHeader";
import { SalesChart, type DailyPoint } from "@/components/admin/SalesChart";
import { card } from "@/components/ui/styles";
import { feeRateLabel } from "@/config/fees";
import { formatBRL, formatEventDate, percent } from "@/lib/format";
import { paymentMethodLabel, type PaymentMethod } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Visão geral — Dashboard" };

type Summary = {
  gross_cents: number;
  fee_cents: number;
  net_cents: number;
  paid_orders: number;
  pending_orders: number;
  pending_cents: number;
  refunded_orders: number;
  refunded_cents: number;
  tickets_sold: number;
  tickets_redeemed: number;
};

type ByType = {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  sold: number;
  redeemed: number;
  gross_cents: number;
  event_date: string;
};

type ByMethod = {
  payment_method: PaymentMethod | null;
  orders: number;
  gross_cents: number;
  fee_cents: number;
  net_cents: number;
};

export default async function AdminHome() {
  const supabase = await createClient();
  const [summaryRes, dailyRes, typeRes, methodRes] = await Promise.all([
    supabase.from("v_finance_summary").select("*").single<Summary>(),
    supabase.from("v_sales_daily").select("day, orders, gross_cents").returns<DailyPoint[]>(),
    supabase.from("v_sales_by_type").select("*").order("event_date").order("sort_order").returns<ByType[]>(),
    supabase.from("v_sales_by_method").select("*").returns<ByMethod[]>(),
  ]);

  const failed = [summaryRes, dailyRes, typeRes, methodRes].find((r) => r.error);
  if (failed?.error) {
    throw new Error(`Falha ao carregar o financeiro: ${failed.error.message}`);
  }

  const s = summaryRes.data!;
  const daily = (dailyRes.data ?? []).map((d) => ({ ...d, gross_cents: Number(d.gross_cents) }));
  const byType = typeRes.data ?? [];
  const byMethod = methodRes.data ?? [];

  return (
    <>
      <PageHeader title="Visão geral" description="Vendas confirmadas pelo Mercado Pago." />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Receita bruta" value={formatBRL(s.gross_cents)} hint={`${s.paid_orders} pedidos pagos`} />
        <Stat
          label="Taxas Mercado Pago"
          value={formatBRL(s.fee_cents)}
          hint={`Cartão ${feeRateLabel("cartao")} (repassada ao cliente) · Pix ${feeRateLabel("pix")}`}
        />
        <Stat label="Receita líquida" value={formatBRL(s.net_cents)} />
        <Stat
          label="Entradas"
          value={`${s.tickets_redeemed} / ${s.tickets_sold}`}
          hint={`${percent(Number(s.tickets_redeemed), Number(s.tickets_sold))} dos ingressos já rasgados`}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Stat
          label="Pedidos pendentes"
          value={String(s.pending_orders)}
          hint={`${formatBRL(s.pending_cents)} aguardando pagamento`}
        />
        <Stat
          label="Estornos"
          value={String(s.refunded_orders)}
          hint={`${formatBRL(s.refunded_cents)} devolvidos`}
        />
      </section>

      <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`}>
        <h2 className="text-[22px] font-semibold leading-tight">Vendas por dia</h2>
        {daily.length ? <SalesChart data={daily} /> : <EmptyState>Nenhuma venda confirmada ainda.</EmptyState>}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className={`${card} overflow-hidden`}>
          <h2 className="px-4 pt-4 text-[22px] font-semibold leading-tight sm:px-5 sm:pt-5">Por tipo de ingresso</h2>
          {byType.length ? (
            <div className="overflow-x-auto">
              <table className={`${tableCls} mt-3`}>
                <thead>
                  <tr>
                    <th className={thCls}>Ingresso</th>
                    <th className={`${thCls} text-right`}>Vendidos</th>
                    <th className={`${thCls} text-right`}>Rasgados</th>
                    <th className={`${thCls} text-right`}>Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {byType.map((t) => (
                    <tr key={t.id} className={trCls}>
                      <td className={tdCls}>
                        <div className="font-medium">{t.name}</div>
                        <div className="text-xs text-muted">
                          {formatEventDate(t.event_date)} · {formatBRL(t.price_cents)}
                        </div>
                      </td>
                      <td data-label="Vendidos" className={`${tdCls} text-right tabular-nums`}>
                        {t.sold} / {t.quantity}
                      </td>
                      <td data-label="Rasgados" className={`${tdCls} text-right tabular-nums`}>{t.redeemed}</td>
                      <td data-label="Receita" className={`${tdCls} text-right tabular-nums`}>{formatBRL(t.gross_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>Nenhum ingresso cadastrado. Cadastre na aba Ingressos.</EmptyState>
          )}
        </div>

        <div className={`${card} overflow-hidden`}>
          <h2 className="px-4 pt-4 text-[22px] font-semibold leading-tight sm:px-5 sm:pt-5">Por forma de pagamento</h2>
          {byMethod.length ? (
            <div className="overflow-x-auto">
              <table className={`${tableCls} mt-3`}>
                <thead>
                  <tr>
                    <th className={thCls}>Forma</th>
                    <th className={`${thCls} text-right`}>Pedidos</th>
                    <th className={`${thCls} text-right`}>Bruto</th>
                    <th className={`${thCls} text-right`}>Taxas</th>
                    <th className={`${thCls} text-right`}>Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {byMethod.map((m) => (
                    <tr key={m.payment_method ?? "nd"} className={trCls}>
                      <td className={tdCls}>
                        <div className="font-medium">
                          {m.payment_method ? paymentMethodLabel[m.payment_method] : "Não informado"}
                        </div>
                        {m.payment_method && (
                          <div className="text-xs text-muted">Taxa {feeRateLabel(m.payment_method)}</div>
                        )}
                      </td>
                      <td data-label="Pedidos" className={`${tdCls} text-right tabular-nums`}>{m.orders}</td>
                      <td data-label="Bruto" className={`${tdCls} text-right tabular-nums`}>{formatBRL(m.gross_cents)}</td>
                      <td data-label="Taxas" className={`${tdCls} text-right tabular-nums`}>{formatBRL(m.fee_cents)}</td>
                      <td data-label="Líquido" className={`${tdCls} text-right tabular-nums`}>{formatBRL(m.net_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState>Nenhum pagamento confirmado ainda.</EmptyState>
          )}
        </div>
      </section>
    </>
  );
}
