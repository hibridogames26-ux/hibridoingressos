import Link from "next/link";
import { EmptyState, PageHeader, Stat, tableCls, tdCls, thCls, trCls } from "@/components/admin/PageHeader";
import { SalesChart, type DailyPoint } from "@/components/admin/SalesChart";
import { badgeBrand, badgeNeutral, badgeSuccess, btnOutline, card } from "@/components/ui/styles";
import { feeRateLabel } from "@/config/fees";
import { formatBRL, formatDateTime } from "@/lib/format";
import { paymentMethodLabel, shirtFulfillmentLabel, type PaymentMethod } from "@/lib/labels";
import { couponStatus, type ShirtCouponRow } from "@/lib/shirt-coupons";
import type { ShirtLotRow } from "@/lib/shirt-orders";
import { settingsInitial } from "@/lib/shirt-settings";
import {
  enabledSizes,
  missingConditions,
  shirtAvailability,
  shirtConditionLabel,
  type ShirtProduct,
} from "@/lib/shirts";
import { CouponsCard } from "./CouponsCard";
import { SalesModeCard } from "./SalesModeCard";
import { SettingsDrawer } from "./SettingsDrawer";
import { SizesCard, type SizeRow } from "./SizesCard";

export type CamisasSummary = {
  gross_cents: number;
  fee_cents: number;
  net_cents: number;
  paid_orders: number;
  paid_units: number;
  pending_orders: number;
  pending_units: number;
  pending_cents: number;
  refunded_orders: number;
  refunded_units: number;
  refunded_cents: number;
};

export type ByMethod = {
  payment_method: PaymentMethod | null;
  orders: number;
  units: number;
  gross_cents: number;
  fee_cents: number;
  net_cents: number;
};

export type CamisasViewProps = {
  product: ShirtProduct | null;
  summary: CamisasSummary;
  dailyRows: DailyPoint[];
  lot: ShirtLotRow[];
  byMethod: ByMethod[];
  coupons: ShirtCouponRow[];
  /** Existe pagamento de teste concluído (encomenda de teste paga ou já estornada)? */
  testDone: boolean;
};

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className={`whitespace-pre-line break-words text-sm ${value ? "" : "text-cool-gray"}`}>{value ?? "A definir"}</dd>
    </div>
  );
}

/** Painel de vendas das camisas: modo de venda, tamanhos, cupons e números (sem as encomendas de teste). */
export function CamisasView({ product, summary, dailyRows, lot, byMethod, coupons, testDone }: CamisasViewProps) {
  const s = summary;
  const daily = dailyRows.map((d) => ({ ...d, gross_cents: Number(d.gross_cents) }));
  const lotBySize = new Map(lot.map((r) => [r.size, r]));
  const sizeRows: SizeRow[] = (product?.sizes ?? []).map((size) => ({
    size,
    enabled: !product!.disabled_sizes.includes(size),
    paid: Number(lotBySize.get(size)?.paid_units ?? 0),
    pending: Number(lotBySize.get(size)?.pending_units ?? 0),
  }));

  const sum = (pick: (r: ShirtLotRow) => number) => lot.reduce((total, r) => total + Number(pick(r)), 0);
  const production = [
    ["aguardando_producao", sum((r) => r.waiting_units)],
    ["em_producao", sum((r) => r.in_production_units)],
    ["pronto", sum((r) => r.ready_units)],
    ["entregue", sum((r) => r.delivered_units)],
  ] as const;

  const mode = product?.sales_mode ?? "fechada";
  const missing = product ? missingConditions(product) : [];
  // Fim do prazo ou lote cheio aparecem no selo mesmo com a venda aberta.
  const availability = product ? shirtAvailability(product, Number(s.paid_units) + Number(s.pending_units), { valid: true, isTest: false }) : null;
  const badge =
    mode === "fechada"
      ? (["Vendas fechadas", badgeNeutral] as const)
      : availability?.state === "ended"
        ? (["Encomendas encerradas", badgeNeutral] as const)
        : availability?.state === "sold_out"
          ? (["Lote esgotado", badgeNeutral] as const)
          : mode === "cupom"
            ? (["Somente com cupom", badgeBrand] as const)
            : (["Vendas abertas", badgeSuccess] as const);

  const activeCoupons = coupons.filter((c) => couponStatus(c) === "ativo").length;

  return (
    <>
      <PageHeader
        title="Camisas"
        description="Encomendas pagas pelo Mercado Pago. Não inclui ingressos nem encomendas de teste."
        actions={
          <>
            <span className={`${badge[1]} self-center`}>{badge[0]}</span>
            {product && <SettingsDrawer initial={settingsInitial(product)} />}
          </>
        }
      />

      {product ? (
        <SalesModeCard
          mode={mode}
          missing={missing.map((c) => shirtConditionLabel[c])}
          testDone={testDone}
          enabledSizes={enabledSizes(product)}
          windowText={product.sales_end ? `Encomendas até ${formatDateTime(product.sales_end)}` : "Sem data limite"}
          batchLimit={product.batch_limit}
          activeCoupons={activeCoupons}
        />
      ) : (
        <section className={`${card} p-5`}>
          <p className="text-sm text-cool-gray">
            O produto não está cadastrado no banco. Aplique as migrations (<code>npm run db:push</code>).
          </p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Receita bruta" value={formatBRL(s.gross_cents)} hint={`${s.paid_orders} encomendas pagas`} />
        <Stat label="Taxas Mercado Pago" value={formatBRL(s.fee_cents)} hint="Registradas em cada encomenda" />
        <Stat label="Receita líquida" value={formatBRL(s.net_cents)} />
        <Stat
          label="Camisas pagas"
          value={String(s.paid_units)}
          hint={product?.batch_limit ? `Limite do lote: ${product.batch_limit}` : "Limite do lote: a definir"}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Stat
          label="Aguardando pagamento"
          value={String(s.pending_orders)}
          hint={`${s.pending_units} ${Number(s.pending_units) === 1 ? "camisa" : "camisas"} · ${formatBRL(s.pending_cents)} fora do lote`}
        />
        <Stat label="Estornos" value={String(s.refunded_orders)} hint={`${formatBRL(s.refunded_cents)} devolvidos`} />
      </section>

      <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`}>
        <h2 className="text-[22px] font-semibold leading-tight">Vendas por dia</h2>
        {daily.length ? <SalesChart data={daily} /> : <EmptyState>Nenhuma encomenda paga ainda.</EmptyState>}
      </section>

      <section className={`${card} flex flex-col gap-3 p-4 sm:p-5`}>
        <div className="flex flex-col gap-1">
          <h2 className="text-[22px] font-semibold leading-tight">Andamento da produção</h2>
          <p className="text-sm text-cool-gray">Camisas pagas, separadas do status de pagamento.</p>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {production.map(([status, units]) => (
            <div key={status} className="flex flex-col gap-0.5 rounded-xl bg-muted/8 p-3">
              <dt className="text-sm text-cool-gray">{shirtFulfillmentLabel[status]}</dt>
              <dd className="text-[22px] font-bold leading-tight tabular-nums">{units}</dd>
            </div>
          ))}
        </dl>
      </section>

      <SizesCard rows={sizeRows} ordersHref="/admin/camisas/encomendas" />

      <section className={`${card} overflow-hidden`}>
        <h2 className="px-4 pt-4 text-[22px] font-semibold leading-tight sm:px-5 sm:pt-5">Por forma de pagamento</h2>
        {byMethod.length ? (
          <div className="overflow-x-auto">
            <table className={`${tableCls} mt-3`}>
              <thead>
                <tr>
                  <th className={thCls}>Forma</th>
                  <th className={`${thCls} text-right`}>Encomendas</th>
                  <th className={`${thCls} text-right`}>Bruto</th>
                  <th className={`${thCls} text-right`}>Taxas</th>
                  <th className={`${thCls} text-right`}>Líquido</th>
                </tr>
              </thead>
              <tbody>
                {byMethod.map((m) => (
                  <tr key={m.payment_method ?? "nd"} className={trCls}>
                    <td className={tdCls}>
                      <div className="font-medium">{m.payment_method ? paymentMethodLabel[m.payment_method] : "Sem pagamento (cupom de 100%)"}</div>
                      {m.payment_method && <div className="text-xs text-muted">Taxa MP {feeRateLabel(m.payment_method)}</div>}
                    </td>
                    <td data-label="Encomendas" className={`${tdCls} text-right tabular-nums`}>{m.orders}</td>
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
      </section>

      <CouponsCard coupons={coupons} mode={mode} manageHref="/admin/camisas/cupons" />

      {product && (
        <section className={`${card} flex flex-col gap-4 p-4 sm:p-5`} aria-labelledby="config-resumo">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="config-resumo" className="text-[22px] font-semibold leading-tight">
                Configurações da venda
              </h2>
              <p className="text-sm text-cool-gray">Resumo. A edição completa abre num painel lateral.</p>
            </div>
            <SettingsDrawer initial={settingsInitial(product)} buttonClassName={btnOutline} />
          </div>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Fact label="Preço" value={product.price_cents !== null ? formatBRL(product.price_cents) : null} />
            <Fact label="Limite do lote" value={product.batch_limit !== null ? `${product.batch_limit} camisas` : null} />
            <Fact label="Máximo por compra" value={product.max_per_order !== null ? String(product.max_per_order) : null} />
            <Fact label="Encomendas até" value={product.sales_end ? formatDateTime(product.sales_end) : null} />
            <Fact label="Abre ao público em" value={product.sales_start ? formatDateTime(product.sales_start) : null} />
            <Fact label="Prazo de produção" value={product.production_lead_time} />
            <Fact label="Recebimento" value={product.receipt_details} />
            <Fact label="Trocas e cancelamento" value={product.purchase_policy} />
            <Fact label="Medidas" value={product.size_guide ? "Definidas" : null} />
          </dl>
          <p className="text-xs text-muted">
            Também por linha de comando: <code>npm run shirt:config -- --show</code>. Teste de pagamento:{" "}
            <Link href="/admin/camisas/teste" className="font-medium text-brand-dark underline-offset-4 hover:underline">
              abrir o roteiro
            </Link>
            .
          </p>
        </section>
      )}
    </>
  );
}
