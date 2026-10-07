import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/PublicHeader";
import { textLink } from "@/components/ui/styles";
import { SHIRT_FEE_PASSED_TO_BUYER } from "@/config/shirts";
import { getShirtProduct } from "@/lib/shirt-catalog";
import { accessOf, quoteCoupon } from "@/lib/shirt-coupon-service";
import { parseSelectionParams, shirtAvailability, sizeStates } from "@/lib/shirts";
import { ShirtGallery } from "./ShirtGallery";
import { ShirtPurchase } from "./ShirtPurchase";

export const metadata: Metadata = {
  title: "Camisa oficial — Híbrido Games 2026",
  description: "Camisa oficial do Híbrido Games 2026, feita sob encomenda.",
};
export const dynamic = "force-dynamic";

export default async function CamisaPage({ searchParams }: PageProps<"/loja/camisa-hibrido-games">) {
  const params = await searchParams;
  const { product, usedUnits, usedBySize } = await getShirtProduct();

  // Cupom vindo do link (?cupom=CÓDIGO) ou do campo de acesso. Fechada ignora cupom.
  const wanted = parseSelectionParams(params).coupon;
  const quote = wanted && product.sales_mode !== "fechada" ? await quoteCoupon(wanted, 1) : null;
  const availability = shirtAvailability(product, usedUnits, accessOf(quote));

  return (
    <main className="flex flex-1 flex-col">
      <PublicHeader />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:py-8">
        <Link href="/" className={`${textLink} w-fit`}>
          ← Início
        </Link>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-start lg:gap-12">
          <div className="lg:sticky lg:top-4">
            <ShirtGallery />
          </div>
          <ShirtPurchase
            name={product.name}
            description={product.description}
            priceCents={product.price_cents}
            sizeStates={sizeStates(product, usedBySize)}
            sizeGuide={product.size_guide}
            composition={product.composition}
            fit={product.fit}
            leadTime={product.production_lead_time}
            receipt={product.receipt_details}
            salesEnd={product.sales_end}
            availability={availability.state}
            maxQuantity={availability.maxQuantity}
            mode={product.sales_mode}
            couponCode={quote?.ok ? quote.code : null}
            couponDescription={quote?.ok ? quote.description : null}
            couponError={quote && !quote.ok ? quote.message : null}
            cardFeeNote={SHIRT_FEE_PASSED_TO_BUYER.cartao}
          />
        </div>
      </div>
    </main>
  );
}
