import type { Metadata } from "next";
import { EmptyState, PageHeader, Stat } from "@/components/admin/PageHeader";
import { badgeDanger, badgeNeutral, badgeSuccess, card } from "@/components/ui/styles";
import { chargeCents, feeRateLabel, organizerReceivesCents } from "@/config/fees";
import { formatBRL, formatEventDate, percent } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { available, groupByDate, minQuantity, type TicketTypeRow } from "@/lib/ticket-types";
import { StockActions } from "./StockActions";
import { TicketTypeForm } from "./TicketTypeForm";

export const metadata: Metadata = { title: "Ingressos — Dashboard" };

function Situation({ t }: { t: TicketTypeRow }) {
  if (!t.active) return <span className={badgeNeutral}>Fora de venda</span>;
  if (available(t) === 0) return <span className={badgeDanger}>Esgotado</span>;
  return <span className={badgeSuccess}>À venda</span>;
}

export default async function IngressosAdminPage({ searchParams }: PageProps<"/admin/ingressos">) {
  const { editar } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_sales_by_type")
    .select("*")
    .order("event_date")
    .order("sort_order")
    .order("name")
    .returns<TicketTypeRow[]>();
  if (error) throw new Error(`Falha ao carregar ingressos: ${error.message}`);

  const types = (data ?? []).map((t) => ({ ...t, sold: Number(t.sold), redeemed: Number(t.redeemed) }));
  const editing = typeof editar === "string" ? types.find((t) => t.id === editar) : undefined;

  const totalStock = types.reduce((sum, t) => sum + t.quantity, 0);
  const totalSold = types.reduce((sum, t) => sum + t.sold, 0);
  const potentialCents = types.reduce((sum, t) => sum + t.quantity * t.price_cents, 0);
  const potentialNet = (method: "pix" | "cartao") =>
    types.reduce((sum, t) => sum + t.quantity * organizerReceivesCents(method, t.price_cents), 0);

  return (
    <>
      <PageHeader title="Ingressos" description="Estoque à venda por tipo de ingresso e dia do evento." />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Estoque total" value={String(totalStock)} />
        <Stat label="Vendidos" value={String(totalSold)} hint={`${percent(totalSold, totalStock)} do estoque`} />
        <Stat label="Disponíveis" value={String(types.reduce((sum, t) => sum + available(t), 0))} />
        <Stat
          label="Potencial do estoque"
          value={formatBRL(potentialCents)}
          hint={`Você recebe: ${formatBRL(potentialNet("pix"))} se tudo no Pix · ${formatBRL(potentialNet("cartao"))} se tudo no cartão`}
        />
      </section>

      <p className="text-sm text-cool-gray">
        Taxas do Mercado Pago: cartão de crédito {feeRateLabel("cartao")}, <strong className="font-medium text-ink">repassada ao cliente</strong>{" "}
        (você recebe o valor cheio do ingresso) · Pix {feeRateLabel("pix")}, absorvida.
      </p>

      <TicketTypeForm editing={editing} minQuantity={editing ? minQuantity(editing) : 0} />

      {types.length === 0 ? (
        <div className={card}>
          <EmptyState>Nenhum ingresso cadastrado. Use o formulário acima para criar o primeiro.</EmptyState>
        </div>
      ) : (
        groupByDate(types).map(([date, rows]) => (
          <section key={date} className="flex flex-col gap-3">
            <h2 className="text-[22px] font-semibold capitalize leading-tight">{formatEventDate(date)}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {rows.map((t) => {
                const sold = minQuantity(t);
                const pct = t.quantity ? Math.min(100, Math.round((sold / t.quantity) * 100)) : 0;
                return (
                  <article key={t.id} className={`${card} flex flex-col gap-4 p-5`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-col gap-0.5">
                        <h3 className="text-base font-semibold">{t.name}</h3>
                        {t.description && <p className="text-sm text-cool-gray">{t.description}</p>}
                        <p className="text-sm font-medium">{formatBRL(t.price_cents)}</p>
                        <table className="mt-1 text-xs">
                          <thead>
                            <tr className="text-muted">
                              <th className="pr-4 text-left font-normal">
                                <span className="sr-only">Forma de pagamento</span>
                              </th>
                              <th className="pr-4 text-left font-normal">Cliente paga</th>
                              <th className="text-left font-normal">Você recebe</th>
                            </tr>
                          </thead>
                          <tbody className="tabular-nums">
                            {(["pix", "cartao"] as const).map((method) => (
                              <tr key={method}>
                                <th scope="row" className="pr-4 text-left font-normal text-muted">
                                  {method === "pix" ? "Pix" : "Cartão"}
                                </th>
                                <td className="pr-4">{formatBRL(chargeCents(method, t.price_cents))}</td>
                                <td>{formatBRL(organizerReceivesCents(method, t.price_cents))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Situation t={t} />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-cool-gray">
                          <strong className="text-ink tabular-nums">{sold}</strong> vendidos de{" "}
                          <strong className="text-ink tabular-nums">{t.quantity}</strong>
                        </span>
                        <span className="tabular-nums text-cool-gray">
                          {available(t)} disponíveis
                        </span>
                      </div>
                      <div
                        className="h-2 overflow-hidden rounded-full bg-muted/16"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Ocupação do estoque"
                      >
                        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                      {t.redeemed > 0 && (
                        <span className="text-xs text-muted">{t.redeemed} já entraram (rasgados)</span>
                      )}
                    </div>

                    <StockActions id={t.id} active={t.active} canDelete={sold === 0} />
                  </article>
                );
              })}
            </div>
          </section>
        ))
      )}
    </>
  );
}
