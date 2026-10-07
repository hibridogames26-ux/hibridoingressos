import Link from "next/link";
import { EmptyState, PageHeader, Stat, tableCls, tdCls, thCls, trCls } from "@/components/admin/PageHeader";
import { badgeBrand, badgeNeutral, badgeSuccess, card, input } from "@/components/ui/styles";
import { formatBRL } from "@/lib/format";
import {
  couponBuyerLimitText,
  couponDescription,
  couponStatus,
  couponStatusLabel,
  couponUsesText,
  couponValidityText,
  type CouponStatus,
  type ShirtCouponRow,
} from "@/lib/shirt-coupons";
import { CouponsToolbar } from "./CouponsToolbar";

export const FILTERS = [
  ["todos", "Todos"],
  ["ativo", "Ativos"],
  ["agendado", "Agendados"],
  ["encerrados", "Encerrados"],
] as const;
export type FilterId = (typeof FILTERS)[number][0];

/** "Encerrados" reúne tudo que já não vale: encerrado, esgotado e desativado. */
export const inFilter = (status: CouponStatus, filter: FilterId) =>
  filter === "todos" ? true : filter === "encerrados" ? ["encerrado", "esgotado", "desativado"].includes(status) : status === filter;

const tone: Record<CouponStatus, string> = {
  ativo: badgeSuccess,
  agendado: badgeBrand,
  encerrado: badgeNeutral,
  esgotado: badgeNeutral,
  desativado: badgeNeutral,
};

export type CouponsViewProps = {
  coupons: ShirtCouponRow[];
  filter: FilterId;
  query: string;
};

const qs = (filter: FilterId, query: string) => {
  const sp = new URLSearchParams();
  if (filter !== "todos") sp.set("situacao", filter);
  if (query) sp.set("q", query);
  const s = sp.toString();
  return s ? `?${s}` : "";
};

/** Módulo de cupons: números das campanhas, lista com filtros e atalhos para criar cupons. */
export function CouponsView({ coupons, filter, query }: CouponsViewProps) {
  const campaigns = coupons.filter((c) => !c.is_test);
  const statuses = new Map(coupons.map((c) => [c.id, couponStatus(c)]));
  const counts = Object.fromEntries(FILTERS.map(([id]) => [id, coupons.filter((c) => inFilter(statuses.get(c.id)!, id)).length]));
  const q = query.trim().toLowerCase();
  const rows = coupons.filter(
    (c) => inFilter(statuses.get(c.id)!, filter) && (!q || c.code.toLowerCase().includes(q) || (c.campaign ?? "").toLowerCase().includes(q)),
  );

  const sum = (pick: (c: ShirtCouponRow) => number) => campaigns.reduce((n, c) => n + pick(c), 0);

  return (
    <>
      <PageHeader title="Cupons" description="Cupons de campanha e de teste das camisas." actions={<CouponsToolbar />} />

      <section aria-label="Resumo dos cupons de campanha" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Campanhas ativas" value={String(campaigns.filter((c) => statuses.get(c.id) === "ativo").length)} hint="Cupons de teste não entram" />
        <Stat label="Usos pagos" value={String(sum((c) => c.paid_uses))} hint="Em todas as campanhas" />
        <Stat label="Desconto concedido" value={formatBRL(sum((c) => c.discount_given_cents))} hint="Soma dos descontos pagos" />
        <Stat label="Receita com cupom" value={formatBRL(sum((c) => c.revenue_cents))} hint="Já com o desconto aplicado" />
      </section>

      <section className={`${card} flex flex-col gap-4 py-4 sm:py-5`} aria-label="Lista de cupons">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5">
          <nav aria-label="Filtrar por situação" className="flex flex-wrap gap-2">
            {FILTERS.map(([id, text]) => {
              const active = filter === id;
              return (
                <Link
                  key={id}
                  href={`/admin/camisas/cupons${qs(id, query)}`}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 text-sm transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                    active ? "border-brand-dark bg-brand-subtle text-brand-dark" : "border-line bg-surface hover:border-muted"
                  }`}
                >
                  {text} <strong className="font-semibold tabular-nums">{counts[id]}</strong>
                </Link>
              );
            })}
          </nav>
          <form role="search" className="flex min-w-60 max-w-xs flex-1 gap-2">
            {filter !== "todos" && <input type="hidden" name="situacao" value={filter} />}
            <input className={input} type="search" name="q" defaultValue={query} placeholder="Buscar por código ou campanha" aria-label="Buscar cupom" enterKeyHint="search" />
          </form>
        </div>

        {rows.length ? (
          <div className="overflow-x-auto">
            <table className={`${tableCls} min-w-[980px]`}>
              <thead>
                <tr>
                  <th className={thCls}>Cupom</th>
                  <th className={thCls}>Desconto</th>
                  <th className={thCls}>Usos</th>
                  <th className={`${thCls} text-right`}>Desconto dado</th>
                  <th className={`${thCls} text-right`}>Receita</th>
                  <th className={thCls}>Validade</th>
                  <th className={thCls}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const status = statuses.get(c.id)!;
                  const meter = c.max_uses ? Math.min(100, ((c.paid_uses + c.pending_uses) / c.max_uses) * 100) : 0;
                  return (
                    <tr key={c.id} className={`${trCls} relative transition-colors hover:bg-muted/8`}>
                      <td className={tdCls}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/camisas/cupons/${c.id}`}
                            className="font-mono font-semibold after:absolute after:inset-0 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
                          >
                            {c.code}
                          </Link>
                          {c.is_test && <span className={badgeBrand}>Teste</span>}
                        </div>
                        <div className="text-xs text-muted">
                          {c.campaign ?? "Sem campanha"} · {couponBuyerLimitText(c)}
                        </div>
                      </td>
                      <td data-label="Desconto" className={tdCls}>{couponDescription(c)}</td>
                      <td data-label="Usos" className={tdCls}>
                        <div className="flex flex-col gap-1.5">
                          <span className="tabular-nums">{couponUsesText(c)}</span>
                          <span aria-hidden="true" className="block h-1.5 w-28 rounded bg-muted/20">
                            <i className="block h-full rounded bg-brand" style={{ width: `${meter}%` }} />
                          </span>
                        </div>
                      </td>
                      <td data-label="Desconto dado" className={`${tdCls} text-right tabular-nums`}>{c.is_test ? "—" : formatBRL(c.discount_given_cents)}</td>
                      <td data-label="Receita" className={`${tdCls} text-right tabular-nums`}>{c.is_test ? "—" : formatBRL(c.revenue_cents)}</td>
                      <td data-label="Validade" className={tdCls}>{couponValidityText(c)}</td>
                      <td data-label="Situação" className={tdCls}>
                        <span className={tone[status]}>{couponStatusLabel[status]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : coupons.length === 0 ? (
          <EmptyState>Nenhum cupom ainda. Crie um cupom de campanha ou um cupom de teste para conferir o pagamento.</EmptyState>
        ) : (
          <EmptyState>Nenhum cupom nesse filtro.</EmptyState>
        )}

        <p className="px-4 text-xs text-muted sm:px-5">
          Cupons de teste ficam fora de receita, lote e Excel. Clique em um cupom para ver quem usou.{" "}
          <Link href="/admin/camisas/teste" className="font-semibold text-brand-dark underline-offset-4 hover:underline">
            Roteiro de teste de pagamento
          </Link>
        </p>
      </section>
    </>
  );
}
