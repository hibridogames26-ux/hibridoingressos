import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader, Steps } from "@/components/PublicHeader";
import { card } from "@/components/ui/styles";
import { getCatalog } from "@/lib/catalog";
import { parseCart, serializeCart } from "@/lib/checkout";
import { CheckoutForm, type CheckoutLine } from "./CheckoutForm";

export const metadata: Metadata = { title: "Seus dados — Híbrido Games 2026", robots: { index: false } };

function Problem({ message }: { message: string }) {
  return (
    <div className={`${card} flex flex-col items-center gap-3 px-6 py-12 text-center`}>
      <p className="text-base">{message}</p>
      <Link href="/ingressos" className="text-sm text-brand hover:underline">
        Escolher ingressos
      </Link>
    </div>
  );
}

export default async function CheckoutPage({ searchParams }: PageProps<"/checkout">) {
  const { itens } = await searchParams;
  const cart = parseCart(typeof itens === "string" ? itens : null);

  let lines: CheckoutLine[] = [];
  let problem: string | null = cart ? null : "Nenhum ingresso selecionado.";

  if (cart) {
    const catalog = await getCatalog(cart.map((l) => l.ticketTypeId));
    const byId = new Map(catalog.map((t) => [t.id, t]));
    for (const line of cart) {
      const t = byId.get(line.ticketTypeId);
      if (!t) {
        problem = "Um dos ingressos escolhidos não está mais à venda.";
        break;
      }
      if (t.available < line.quantity) {
        problem = `Restam apenas ${t.available} de “${t.name}”.`;
        break;
      }
      lines.push({
        ticketTypeId: t.id,
        name: t.name,
        eventDate: t.event_date,
        priceCents: t.price_cents,
        quantity: line.quantity,
      });
    }
    if (problem) lines = [];
  }

  return (
    <main className="flex flex-1 flex-col bg-muted/8">
      <PublicHeader />
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
        <Steps current={2} />
        <h1 className="font-display text-4xl font-bold leading-[1.22] tracking-[-0.5px]">Seus dados</h1>
        {problem || !cart ? (
          <Problem message={problem ?? "Nenhum ingresso selecionado."} />
        ) : (
          <CheckoutForm lines={lines} itens={serializeCart(cart)} />
        )}
      </section>
    </main>
  );
}
