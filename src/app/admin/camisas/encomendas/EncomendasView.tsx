import Link from "next/link";
import { EmptyState, PageHeader, tableCls, tdCls, thCls, trCls } from "@/components/admin/PageHeader";
import { FulfillmentBadge, OrderStatusBadge } from "@/components/admin/StatusBadges";
import { badgeBrand, btnOutline, btnPrimary, card, input, textLink } from "@/components/ui/styles";
import { formatBRL, formatDateTime } from "@/lib/format";
import { SHIRT_FULFILLMENT_STATUSES, orderStatusLabel, paymentMethodLabel, shirtFulfillmentLabel } from "@/lib/labels";
import { ORDER_STATUSES } from "@/lib/orders";
import { filtersToParams, type ShirtLotRow, type ShirtOrderFilters, type ShirtOrderRow } from "@/lib/shirt-orders";
import { isFreeShirtOrder } from "@/lib/shirts";
import { advanceSelected } from "./actions";
import { SelectAll } from "./SelectAll";

const EXPORT = "/admin/camisas/encomendas/exportar";

export type EncomendasViewProps = {
  orders: ShirtOrderRow[];
  total: number;
  page: number;
  pages: number;
  filters: ShirtOrderFilters;
  /** Lote por tamanho já completo com todos os tamanhos da grade. */
  lot: ShirtLotRow[];
  /** Quantidade de encomendas atualizadas pela última ação em lote. */
  updated: number | null;
  warned: boolean;
};

/** Painel de dados das encomendas: lote por tamanho, lista com filtros, andamento em lote e exportação. */
export function EncomendasView({ orders, total, page, pages, filters, lot, updated, warned }: EncomendasViewProps) {
  const lotTotal = lot.reduce((sum, r) => sum + Number(r.paid_units), 0);

  const qs = (extra: Record<string, string | number | undefined>, f = filters) => {
    const s = filtersToParams(f, extra).toString();
    return s ? `?${s}` : "";
  };
  const returnTo = filtersToParams(filters, { pagina: page > 1 ? page : undefined }).toString();

  return (
    <>
      <PageHeader
        title="Encomendas"
        description={`${total} ${total === 1 ? "encomenda encontrada" : "encomendas encontradas"}`}
        actions={
          <>
            <a href={`${EXPORT}${qs({})}`} className={btnOutline}>
              Exportar Excel
            </a>
            <a href={`${EXPORT}?arquivo=lote`} className={btnOutline}>
              Exportar lote
            </a>
          </>
        }
      />

      {updated !== null && Number.isFinite(updated) && (
        <p role="status" className="animate-message rounded-xl bg-success/16 px-4 py-3 text-sm text-success-ink">
          {updated === 0
            ? "Nenhuma encomenda foi alterada: só encomendas pagas avançam, e nunca para uma etapa anterior."
            : `${updated} ${updated === 1 ? "encomenda atualizada" : "encomendas atualizadas"}.`}
        </p>
      )}
      {warned && (
        <p role="alert" className="animate-message rounded-xl bg-danger/8 px-4 py-3 text-sm text-danger-ink">
          Selecione ao menos uma encomenda e escolha o novo andamento.
        </p>
      )}

      {filters.test && (
        <p role="status" className="rounded-xl bg-brand-subtle px-4 py-3 text-sm">
          Mostrando só as encomendas de teste. Elas ficam fora de receita, lote e Excel.{" "}
          <Link
            href={`/admin/camisas/encomendas${qs({}, { ...filters, test: undefined })}`}
            className="font-semibold text-brand-dark underline-offset-4 hover:underline"
          >
            Ver todas
          </Link>
        </p>
      )}

      <form className="grid gap-2 sm:grid-cols-2 lg:flex" role="search">
        {filters.test && <input type="hidden" name="teste" value="1" />}
        <input
          className={`${input} sm:col-span-2 lg:flex-1`}
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="Nome, e-mail, CPF ou código do pedido"
          aria-label="Buscar encomendas"
          enterKeyHint="search"
        />
        <select name="status" defaultValue={filters.status ?? ""} className={`${input} lg:w-56`} aria-label="Filtrar por pagamento">
          <option value="">Todos os pagamentos</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {orderStatusLabel[s]}
            </option>
          ))}
        </select>
        <select name="andamento" defaultValue={filters.prod ?? ""} className={`${input} lg:w-56`} aria-label="Filtrar por andamento">
          <option value="">Todos os andamentos</option>
          {SHIRT_FULFILLMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {shirtFulfillmentLabel[s]}
            </option>
          ))}
        </select>
        <select name="tamanho" defaultValue={filters.size ?? ""} className={`${input} lg:w-52`} aria-label="Filtrar por tamanho">
          <option value="">Todos os tamanhos</option>
          {lot.map((r) => (
            <option key={r.size} value={r.size}>
              {r.size}
            </option>
          ))}
        </select>
        <button className={btnPrimary}>Buscar</button>
      </form>

      <section className={`${card} flex flex-col gap-3 p-4 sm:p-5`} aria-labelledby="lote">
        <div className="flex flex-col gap-1">
          <h2 id="lote" className="text-[22px] font-semibold leading-tight">
            Lote por tamanho
          </h2>
          <p className="text-sm text-cool-gray">Camisas pagas. Clique em um tamanho para filtrar a lista.</p>
        </div>
        {lot.length ? (
          <div className="flex flex-wrap gap-2">
            {lot.map((r) => {
              const active = filters.size === r.size;
              return (
                <Link
                  key={r.size}
                  href={`/admin/camisas/encomendas${qs({}, { ...filters, size: active ? undefined : r.size })}`}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                    active ? "border-brand-dark bg-brand-subtle text-brand-dark" : "border-line bg-surface hover:border-muted"
                  }`}
                >
                  {r.size} <b className="tabular-nums">{r.paid_units}</b>
                </Link>
              );
            })}
            <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-line px-3.5 text-sm">
              Total <b className="tabular-nums">{lotTotal}</b>
            </span>
          </div>
        ) : (
          <p className="text-sm text-muted">A grade de tamanhos ainda não foi definida.</p>
        )}
      </section>

      <form action={advanceSelected} className={`${card} overflow-hidden`}>
        <input type="hidden" name="retorno" value={returnTo} />
        {orders.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Novo andamento das encomendas selecionadas</span>
              <select name="to" className={`${input} w-auto py-2 text-sm`} defaultValue="em_producao" aria-label="Novo andamento">
                {SHIRT_FULFILLMENT_STATUSES.slice(1).map((s) => (
                  <option key={s} value={s}>
                    Marcar como {shirtFulfillmentLabel[s].toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <button className={btnOutline}>Aplicar às selecionadas</button>
            <span className="text-xs text-muted">Só encomendas pagas avançam; o andamento nunca volta por aqui.</span>
          </div>
        )}
        {orders.length ? (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={`${thCls} w-12`}>
                    <SelectAll label="Selecionar todas as encomendas pagas desta página" />
                  </th>
                  <th className={thCls}>Comprador</th>
                  <th className={thCls}>Tamanho</th>
                  <th className={`${thCls} text-right`}>Total</th>
                  <th className={thCls}>Pagamento</th>
                  <th className={thCls}>Andamento</th>
                  <th className={thCls}>Criada em</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className={`${trCls} relative transition-colors hover:bg-muted/8`}>
                    <td className={tdCls}>
                      <input
                        type="checkbox"
                        name="ids"
                        value={o.id}
                        disabled={o.status !== "pago" || o.is_test}
                        aria-label={`Selecionar ${o.buyer_name}`}
                        className="relative z-10 size-5 align-middle disabled:opacity-30"
                      />
                    </td>
                    <td className={tdCls}>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/camisas/encomendas/${o.id}`}
                          className="font-medium after:absolute after:inset-0 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
                        >
                          {o.buyer_name}
                        </Link>
                        {o.is_test && <span className={badgeBrand}>Teste</span>}
                      </div>
                      <div className="text-xs text-muted">
                        {o.buyer_email} · {o.code}
                        {o.coupon_code ? ` · cupom ${o.coupon_code}` : ""}
                      </div>
                    </td>
                    <td data-label="Tamanho" className={`${tdCls} whitespace-nowrap`}>
                      {o.size} × {o.quantity}
                    </td>
                    <td data-label="Total" className={`${tdCls} text-right tabular-nums`}>{formatBRL(o.total_cents)}</td>
                    <td data-label="Pagamento" className={tdCls}>
                      <div className="flex flex-wrap items-center justify-end gap-2 sm:justify-start">
                        <OrderStatusBadge status={o.status} />
                        {o.payment_method && <span className="text-xs text-muted">{paymentMethodLabel[o.payment_method]}</span>}
                        {o.status === "pago" && isFreeShirtOrder(o) && <span className="text-xs text-muted">Sem pagamento</span>}
                      </div>
                    </td>
                    <td data-label="Andamento" className={tdCls}>
                      {o.status === "pago" ? (
                        <FulfillmentBadge status={o.fulfillment_status} />
                      ) : (
                        <span className="text-muted" title="Só encomendas pagas têm andamento">
                          —
                        </span>
                      )}
                    </td>
                    <td data-label="Criada em" className={`${tdCls} whitespace-nowrap text-cool-gray`}>
                      {formatDateTime(o.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Nenhuma encomenda encontrada.</EmptyState>
        )}
      </form>

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Paginação">
          {page > 1 ? (
            <Link href={`/admin/camisas/encomendas${qs({ pagina: page - 1 })}`} className={textLink}>
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Página {page} de {pages}
          </span>
          {page < pages ? (
            <Link href={`/admin/camisas/encomendas${qs({ pagina: page + 1 })}`} className={textLink}>
              Próxima →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
