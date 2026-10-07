import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { mercadoPagoPublicKey } from "@/lib/env";
import { getShirtOrderForBuyer, syncShirtOrderWithMp } from "@/lib/shirt-order-service";
import { createAdminClient } from "@/lib/supabase/server";
import { isReservationExpired } from "@/lib/time";
import { ShirtOrderView } from "./ShirtOrderView";

export const metadata: Metadata = { title: "Sua encomenda — Camisa oficial", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ShirtOrderPage({ params, searchParams }: PageProps<"/loja/pedido/[id]">) {
  const { id } = await params;
  const { k } = await searchParams;
  const key = typeof k === "string" ? k : undefined;

  let order = await getShirtOrderForBuyer(id, key);
  if (!order) notFound();

  if (order.status === "pendente") {
    // Confirma pagamentos feitos enquanto a página estava fechada.
    const synced = await syncShirtOrderWithMp(id).catch((e) => {
      console.error("Error syncing shirt order:", e);
      return null;
    });
    if (synced && synced !== "pendente") order = (await getShirtOrderForBuyer(id, key))!;
    else if (isReservationExpired(order)) {
      await createAdminClient().rpc("release_expired_shirt_orders");
      order = (await getShirtOrderForBuyer(id, key))!;
    }
  }

  return <ShirtOrderView order={order} publicKey={mercadoPagoPublicKey()} />;
}
