import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { formatDateTime } from "@/lib/format";
import { orderStatusLabel, paymentMethodLabel } from "@/lib/labels";
import { parseFilters, queryOrders } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";

const MAX_ROWS = 10000;

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile?.active || profile.role !== "admin") {
    return new NextResponse("Não autorizado", { status: 403 });
  }

  const filters = parseFilters(Object.fromEntries(request.nextUrl.searchParams));
  const supabase = await createClient();
  const { data, error } = await queryOrders(supabase, filters, 0, MAX_ROWS - 1);
  if (error) return new NextResponse(`Falha ao exportar: ${error.message}`, { status: 500 });

  const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const csv = toCsv(
    ["Pedido", "Comprador", "E-mail", "CPF", "Telefone", "Status", "Pagamento", "Total (R$)", "Taxas (R$)", "Líquido (R$)", "ID Mercado Pago", "Criado em", "Pago em"],
    (data ?? []).map((o) => [
      o.id,
      o.buyer_name,
      o.buyer_email,
      o.buyer_cpf,
      o.buyer_phone,
      orderStatusLabel[o.status],
      o.payment_method ? paymentMethodLabel[o.payment_method] : "",
      reais(o.total_cents),
      reais(o.fee_cents),
      reais(o.net_cents),
      o.mp_payment_id,
      formatDateTime(o.created_at),
      o.paid_at ? formatDateTime(o.paid_at) : "",
    ]),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedidos-hibrido-games-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
