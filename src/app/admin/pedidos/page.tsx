import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, tableCls, tdCls, thCls, trCls } from "@/components/admin/PageHeader";
import { OrderStatusBadge } from "@/components/admin/StatusBadges";
import { btnOutline, btnPrimary, card, input, textLink } from "@/components/ui/styles";
import { formatBRL, formatDateTime } from "@/lib/format";
import { orderStatusLabel, paymentMethodLabel } from "@/lib/labels";
import { ORDER_STATUSES, parseFilters, queryOrders } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pedidos — Dashboard" };

const PAGE_SIZE = 50;

export default async function PedidosPage({ searchParams }: PageProps<"/admin/pedidos">) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const page = Math.max(1, Number(params.pagina) || 1);

  const supabase = await createClient();
  const { data, count, error } = await queryOrders(
    supabase,
    filters,
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE - 1,
  );
  if (error) throw new Error(`Falha ao carregar pedidos: ${error.message}`);

  const orders = data ?? [];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (extra: Record<string, string | number | undefined>) => {
    const sp = new URLSearchParams();
    if (filters.q) sp.set("q", filters.q);
    if (filters.status) sp.set("status", filters.status);
    for (const [k, v] of Object.entries(extra)) if (v !== undefined) sp.set(k, String(v));
    const s = sp.toString();
    return s ? `?${s}` : "";
  };

  return (
    <>
      <PageHeader
        title="Pedidos"
        description={`${total} ${total === 1 ? "pedido encontrado" : "pedidos encontrados"}`}
        actions={
          <a href={`/admin/pedidos/exportar${qs({})}`} className={btnOutline}>
            Exportar CSV
          </a>
        }
      />

      <form className="grid gap-2 sm:flex" role="search">
        <input
          className={input}
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="Nome, e-mail, CPF ou código do ingresso"
          aria-label="Buscar pedidos"
          enterKeyHint="search"
        />
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className={`${input} sm:w-48`}
          aria-label="Filtrar por status"
        >
          <option value="">Todos os status</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {orderStatusLabel[s]}
            </option>
          ))}
        </select>
        <button className={btnPrimary}>Buscar</button>
      </form>

      <div className={`${card} overflow-hidden`}>
        {orders.length ? (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Comprador</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Pagamento</th>
                  <th className={`${thCls} text-right`}>Total</th>
                  <th className={thCls}>Criado em</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className={`${trCls} relative transition-colors hover:bg-muted/8 active:bg-muted/8`}>
                    <td className={tdCls}>
                      <Link
                        href={`/admin/pedidos/${o.id}`}
                        className="font-medium after:absolute after:inset-0 hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        {o.buyer_name}
                      </Link>
                      <div className="text-xs text-muted">{o.buyer_email}</div>
                    </td>
                    <td data-label="Status" className={tdCls}>
                      <OrderStatusBadge status={o.status} />
                    </td>
                    <td data-label="Pagamento" className={tdCls}>
                      {o.payment_method ? paymentMethodLabel[o.payment_method] : "—"}
                    </td>
                    <td data-label="Total" className={`${tdCls} text-right tabular-nums`}>{formatBRL(o.total_cents)}</td>
                    <td data-label="Criado em" className={`${tdCls} whitespace-nowrap text-cool-gray`}>
                      {formatDateTime(o.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Nenhum pedido encontrado.</EmptyState>
        )}
      </div>

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Paginação">
          {page > 1 ? (
            <Link href={`/admin/pedidos${qs({ pagina: page - 1 })}`} className={textLink}>
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted">
            Página {page} de {pages}
          </span>
          {page < pages ? (
            <Link href={`/admin/pedidos${qs({ pagina: page + 1 })}`} className={textLink}>
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
