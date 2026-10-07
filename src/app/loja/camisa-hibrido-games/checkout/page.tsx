import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader, Steps } from "@/components/PublicHeader";
import { card, textLink } from "@/components/ui/styles";
import { SHIRT_PATH } from "@/config/shirts";
import { getShirtProduct } from "@/lib/shirt-catalog";
import { accessOf, quoteCoupon } from "@/lib/shirt-coupon-service";
import { availabilityMessage, parseSelectionParams, shirtAvailability, sizeStates, validateSelection } from "@/lib/shirts";
import { ShirtCheckoutForm } from "./ShirtCheckoutForm";

export const metadata: Metadata = { title: "Seus dados — Camisa oficial", robots: { index: false } };
export const dynamic = "force-dynamic";

const STEPS = ["Camisa", "Seus dados", "Pagamento"] as const;

function Problem({ message }: { message: string }) {
  return (
    <div className={`${card} flex flex-col items-center gap-3 px-6 py-12 text-center`}>
      <p className="text-base">{message}</p>
      <Link href={SHIRT_PATH} className={textLink}>
        Voltar para a camisa
      </Link>
    </div>
  );
}

export default async function ShirtCheckoutPage({ searchParams }: PageProps<"/loja/camisa-hibrido-games/checkout">) {
  const params = await searchParams;
  const { product, usedUnits, usedBySize } = await getShirtProduct();
  const { size, quantity, coupon } = parseSelectionParams(params);

  // O cupom é conferido de novo no servidor (aqui e ao criar a encomenda).
  const quote =
    coupon && product.sales_mode !== "fechada" ? await quoteCoupon(coupon, Number.isInteger(quantity) ? quantity : 1) : null;
  const availability = shirtAvailability(product, usedUnits, accessOf(quote));

  let content: React.ReactNode;
  if (availability.state !== "open") {
    content = <Problem message={availabilityMessage[availability.state]} />;
  } else {
    const choosable = sizeStates(product, usedBySize).filter((s) => s.available).map((s) => s.size);
    const result = validateSelection(choosable, availability.maxQuantity, { size, quantity });
    if (!result.ok) {
      content = <Problem message={result.message} />;
    } else {
      content = (
        <ShirtCheckoutForm
          productName={product.name}
          size={result.selection.size}
          quantity={result.selection.quantity}
          unitPriceCents={product.price_cents!}
          initialCoupon={
            quote?.ok
              ? {
                  code: quote.code,
                  description: quote.description,
                  discountCents: quote.discountCents,
                  finalCents: quote.finalCents,
                  isTest: quote.isTest,
                }
              : null
          }
          couponRequired={product.sales_mode === "cupom"}
          leadTime={product.production_lead_time!}
          receipt={product.receipt_details!}
          policy={product.purchase_policy!}
        />
      );
    }
  }

  return (
    <main className="flex flex-1 flex-col bg-muted/8">
      <PublicHeader />
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 pb-[max(2rem,env(safe-area-inset-bottom))] sm:gap-6 sm:py-8">
        <Steps current={2} steps={STEPS} />
        <h1 className="font-display text-[1.75rem] font-bold leading-[1.22] tracking-[-0.5px] sm:text-4xl">Seus dados</h1>
        {content}
      </section>
    </main>
  );
}
