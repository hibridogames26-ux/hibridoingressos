import Link from "next/link";
import { EmptyState, PageHeader, tableCls, tdCls, thCls, trCls } from "@/components/admin/PageHeader";
import { badgeBrand, badgeNeutral, badgeSuccess, card } from "@/components/ui/styles";
import { formatDateTime } from "@/lib/format";
import { auditActor, describeAudit, type ShirtAuditRow } from "@/lib/shirt-audit";
import { settingsInitial } from "@/lib/shirt-settings";
import type { ShirtLotRow } from "@/lib/shirt-orders";
import { enabledSizes, missingConditions, shirtConditionLabel, type ShirtProduct } from "@/lib/shirts";
import { SalesModeCard } from "../SalesModeCard";
import { SettingsSection } from "./SettingsSection";
import { SizesSettings, type SizeSettingsRow } from "./SizesSettings";

export const TABS = [
  ["venda", "Venda"],
  ["tamanhos", "Tamanhos"],
  ["textos", "Textos e medidas"],
  ["historico", "Histórico"],
] as const;
export type TabId = (typeof TABS)[number][0];

export type ConfigViewProps = {
  tab: TabId;
  product: ShirtProduct;
  lot: ShirtLotRow[];
  activeCoupons: number;
  testDone: boolean;
  /** Alterações já filtradas para a aba atual (as de tamanhos na aba Tamanhos, todas em Histórico). */
  audit: ShirtAuditRow[];
};

function AuditList({ rows, empty }: { rows: ShirtAuditRow[]; empty: string }) {
  if (!rows.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <table className={tableCls}>
        <thead>
          <tr>
            <th className={thCls}>Quando</th>
            <th className={thCls}>Quem</th>
            <th className={thCls}>Alteração</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={trCls}>
              <td className={`${tdCls} whitespace-nowrap text-cool-gray`}>{formatDateTime(r.at)}</td>
              <td data-label="Quem" className={`${tdCls} whitespace-nowrap`}>
                {auditActor(r)}
              </td>
              <td data-label="Alteração" className={tdCls}>
                {describeAudit(r)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Módulo Configurações da camisa, em abas: Venda · Tamanhos · Textos e medidas · Histórico. */
export function ConfigView({ tab, product, lot, activeCoupons, testDone, audit }: ConfigViewProps) {
  const mode = product.sales_mode;
  const missing = missingConditions(product).map((c) => shirtConditionLabel[c]);
  const initial = settingsInitial(product);
  const bySize = new Map(lot.map((r) => [r.size, r]));
  const sizeRows: SizeSettingsRow[] = product.sizes.map((size) => ({
    size,
    enabled: !product.disabled_sizes.includes(size),
    paid: Number(bySize.get(size)?.paid_units ?? 0),
    pending: Number(bySize.get(size)?.pending_units ?? 0),
    limit: product.size_limits[size] ?? null,
    message: product.size_messages[size] ?? "",
  }));
  const badge =
    mode === "fechada"
      ? (["Vendas fechadas", badgeNeutral] as const)
      : mode === "cupom"
        ? (["Somente com cupom", badgeBrand] as const)
        : (["Vendas abertas", badgeSuccess] as const);

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Venda, tamanhos, textos e histórico de alterações da camisa."
        actions={<span className={`${badge[1]} self-center`}>{badge[0]}</span>}
      />

      <nav aria-label="Seções das configurações" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {TABS.map(([id, text]) => {
          const active = tab === id;
          return (
            <Link
              key={id}
              href={id === "venda" ? "/admin/camisas/configuracoes" : `/admin/camisas/configuracoes?aba=${id}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-xl border px-4 text-sm font-medium transition duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                active ? "border-brand-dark bg-brand-subtle text-brand-dark" : "border-line bg-surface hover:border-muted"
              }`}
            >
              {text}
            </Link>
          );
        })}
      </nav>

      {tab === "venda" && (
        <>
          <SalesModeCard
            mode={mode}
            missing={missing}
            testDone={testDone}
            enabledSizes={enabledSizes(product)}
            windowText={product.sales_end ? `Encomendas até ${formatDateTime(product.sales_end)}` : "Sem data limite"}
            batchLimit={product.batch_limit}
            activeCoupons={activeCoupons}
          />
          <SettingsSection
            section="venda"
            initial={initial}
            title="Condições da venda"
            description="Preço, lote, máximo por compra e prazos. Com a venda aberta ou só com cupom, nenhuma condição pode ficar em branco."
          />
        </>
      )}

      {tab === "tamanhos" && (
        <>
          <SizesSettings rows={sizeRows} sizesText={initial.sizes} />
          <section className={`${card} overflow-hidden`} aria-labelledby="recentes">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5 sm:pt-5">
              <h2 id="recentes" className="text-[22px] font-semibold leading-tight">
                Alterações recentes de tamanhos
              </h2>
              <Link href="/admin/camisas/configuracoes?aba=historico" className="text-sm font-semibold text-brand-dark underline-offset-4 hover:underline">
                Ver histórico completo
              </Link>
            </div>
            <div className="mt-3">
              <AuditList rows={audit} empty="Nenhuma alteração de tamanhos registrada ainda." />
            </div>
          </section>
        </>
      )}

      {tab === "textos" && (
        <SettingsSection
          section="textos"
          initial={initial}
          title="Textos e medidas"
          description="O que o cliente lê na vitrine e no checkout. Mudar o texto não altera as encomendas já feitas."
        />
      )}

      {tab === "historico" && (
        <section className={`${card} overflow-hidden`} aria-labelledby="historico">
          <div className="flex flex-col gap-1 px-4 pt-4 sm:px-5 sm:pt-5">
            <h2 id="historico" className="text-[22px] font-semibold leading-tight">
              Histórico de alterações
            </h2>
            <p className="text-sm text-cool-gray">
              Modo de venda, tamanhos, preço, lote, textos e cupons. Registrado pelo banco, não pode ser editado. Mostra as últimas 200.
            </p>
          </div>
          <div className="mt-3">
            <AuditList rows={audit} empty="Nenhuma alteração registrada ainda." />
          </div>
        </section>
      )}
    </>
  );
}
