import type { Metadata } from "next";
import Link from "next/link";
import { MigrationPending } from "@/components/admin/MigrationPending";
import { PageHeader } from "@/components/admin/PageHeader";
import { SHIRT_PATH, SHIRT_SLUG } from "@/config/shirts";
import { siteUrl } from "@/lib/env";
import { toCouponRow, couponStatus } from "@/lib/shirt-coupons";
import { computeTestFlow, type TestOrderInfo } from "@/lib/shirt-test-flow";
import { SHIRT_PRODUCT_COLUMNS, isMissingRelationError, missingConditions, type ShirtProduct } from "@/lib/shirts";
import { createClient } from "@/lib/supabase/server";
import { TestRoteiro, type RoteiroStep } from "./TestRoteiro";

export const metadata: Metadata = { title: "Teste de pagamento — Dashboard" };
export const dynamic = "force-dynamic";

export default async function TestePage() {
  const supabase = await createClient();
  const [productRes, couponRes, ordersRes] = await Promise.all([
    supabase.from("shirt_products").select(SHIRT_PRODUCT_COLUMNS).eq("slug", SHIRT_SLUG).maybeSingle<ShirtProduct>(),
    supabase.from("v_shirt_coupons").select("*").eq("is_test", true).order("created_at", { ascending: false }).limit(1).returns<Record<string, unknown>[]>(),
    supabase
      .from("shirt_orders")
      .select("id, code, size, status, payment_method, created_at")
      .eq("is_test", true)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<(TestOrderInfo & { code: string })[]>(),
  ]);

  const failed = [productRes, couponRes, ordersRes].find((r) => r.error);
  if (failed?.error) {
    if ([productRes, couponRes, ordersRes].some((r) => isMissingRelationError(r.error))) {
      return (
        <>
          <PageHeader title="Teste de pagamento" description="Compra real de valor mínimo antes de abrir ao público." />
          <MigrationPending />
        </>
      );
    }
    throw new Error(`Falha ao carregar o roteiro de teste: ${failed.error.message}`);
  }

  const product = productRes.data;
  if (!product) {
    return (
      <>
        <PageHeader title="Teste de pagamento" description="Compra real de valor mínimo antes de abrir ao público." />
        <MigrationPending />
      </>
    );
  }

  const couponRow = couponRes.data?.[0] ? toCouponRow(couponRes.data[0]) : null;
  const orders = ordersRes.data ?? [];
  const missing = missingConditions(product).length;
  const status = couponRow ? couponStatus(couponRow) : null;
  const flow = computeTestFlow({
    missingConditions: missing,
    mode: product.sales_mode,
    coupon: couponRow && status ? { code: couponRow.code, status } : null,
    orders,
    checkedAt: product.test_checked_at,
    refundsDoneAt: product.test_refunds_done_at,
  });

  const methods = [flow.methodsPaid.pix && "Pix", flow.methodsPaid.cartao && "cartão"].filter(Boolean).join(" e ");
  const defs: { title: string; text: string; done: string; optional?: boolean }[] = [
    {
      title: "Conferir as condições da venda",
      text: `Preço, tamanhos, lote, janela e textos precisam estar definidos. Faltam ${missing}.`,
      done: "9 de 9 condições definidas.",
    },
    {
      title: "Colocar a venda no modo Somente com cupom",
      text: "O público não consegue encomendar enquanto você testa.",
      done:
        product.sales_mode === "aberta"
          ? "A venda já está aberta ao público. O teste continua valendo."
          : "Modo Somente com cupom ativo. O público não encomenda sem cupom.",
    },
    {
      title: "Criar o cupom de teste",
      text: "Gera um código com 2 usos, um para o Pix e outro para o cartão.",
      done: couponRow ? `Cupom ${couponRow.code} criado: R$ 1,00, 2 usos, 24 horas.` : "Cupom de teste criado.",
    },
    {
      title: "Pagar com Pix e com cartão",
      text: "Compre a camisa com o cupom, primeiro no Pix e depois no cartão.",
      done: `Pagamento confirmado${methods ? `: ${methods}` : ""}.`,
    },
    {
      title: "Conferir as encomendas de teste",
      text: "Elas aparecem em Encomendas com o selo Teste. Confira nome, tamanho, valores e o e-mail de confirmação.",
      done: "Encomendas de teste conferidas.",
    },
    {
      title: "Estornar os pagamentos de teste",
      text: "Devolva os valores pelo painel do Mercado Pago. O sistema marca as encomendas como estornadas sozinho.",
      done: "Estornos registrados.",
      optional: true,
    },
    {
      title: "Abrir ao público",
      text: "Troque o Modo de venda para Aberta e confirme as checagens.",
      done: "Venda aberta ao público.",
    },
  ];

  const steps: RoteiroStep[] = defs.map((d, i) => ({
    n: i + 1,
    title: d.title,
    optional: !!d.optional,
    state: flow.states[i],
    text: flow.states[i] === "done" ? d.done : d.text,
  }));

  return (
    <>
      <nav aria-label="Navegação" className="text-sm text-muted">
        <Link href="/admin/camisas" className="inline-flex min-h-11 items-center hover:text-brand pointer-fine:min-h-0">
          Camisas
        </Link>{" "}
        › <span className="text-ink">Teste de pagamento</span>
      </nav>
      <PageHeader
        title="Teste de pagamento"
        description="Faça uma compra real de valor mínimo antes de abrir ao público. O roteiro avança sozinho conforme o pagamento é confirmado."
      />
      <TestRoteiro
        steps={steps}
        stage={flow.stage}
        methodsPaid={flow.methodsPaid}
        hasUnrefunded={flow.hasUnrefunded}
        coupon={
          couponRow
            ? {
                code: couponRow.code,
                status: status!,
                uses: couponRow.paid_uses + couponRow.pending_uses,
                maxUses: couponRow.max_uses,
                validUntil: couponRow.valid_until,
              }
            : null
        }
        purchaseUrl={couponRow ? `${siteUrl()}${SHIRT_PATH}?cupom=${couponRow.code}` : null}
        orders={orders.map((o) => ({ id: o.id, code: o.code, size: o.size, status: o.status, paymentMethod: o.payment_method }))}
      />
    </>
  );
}
