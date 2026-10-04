import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader, Steps } from "@/components/PublicHeader";
import { card } from "@/components/ui/styles";
import { getCatalog } from "@/lib/catalog";
import { groupByDate } from "@/lib/ticket-types";
import { CartPicker } from "./CartPicker";

export const metadata: Metadata = { title: "Ingressos — Híbrido Games 2026" };
export const dynamic = "force-dynamic";

export default async function IngressosPage() {
  const catalog = await getCatalog();

  return (
    <main className="flex flex-1 flex-col">
      <PublicHeader />
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        <Steps current={1} />
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-4xl font-bold leading-[1.22] tracking-[-0.5px]">Ingressos</h1>
          <p className="text-sm text-cool-gray">
            Venda oficial. Pagamento por Pix ou cartão de crédito (no cartão há acréscimo da taxa da operadora).
          </p>
        </div>

        {catalog.length === 0 ? (
          <div className={`${card} flex flex-col items-center gap-3 px-6 py-12 text-center`}>
            <h2 className="text-[22px] font-semibold leading-tight">A venda oficial abre em breve</h2>
            <p className="text-sm text-cool-gray">Nenhum ingresso à venda no momento.</p>
            <Link href="/" className="text-sm text-brand hover:underline">
              Voltar ao início
            </Link>
          </div>
        ) : (
          <CartPicker groups={groupByDate(catalog)} />
        )}
      </section>
    </main>
  );
}
