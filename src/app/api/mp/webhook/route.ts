import { NextResponse, type NextRequest } from "next/server";
import { getPayment } from "@/lib/mercadopago";
import { isValidMpSignature } from "@/lib/mp-signature";
import { applyMpPayment } from "@/lib/order-service";

// Notificações do Mercado Pago. Só confia no status após consultar a API.
export async function POST(request: NextRequest) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "";
  const body = (await request.json().catch(() => null)) as
    | { type?: string; action?: string; data?: { id?: string | number } }
    | null;

  const dataId = request.nextUrl.searchParams.get("data.id") ?? (body?.data?.id != null ? String(body.data.id) : null);
  const type = request.nextUrl.searchParams.get("type") ?? body?.type;

  const valid = isValidMpSignature({
    signature: request.headers.get("x-signature"),
    requestId: request.headers.get("x-request-id"),
    dataId,
    secret,
  });
  if (!valid) return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });

  if (type !== "payment" || !dataId) return NextResponse.json({ ok: true, ignored: true });

  try {
    const payment = await getPayment(dataId);
    const status = await applyMpPayment(payment);
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    console.error("Error in MP webhook:", error);
    // 500 faz o Mercado Pago reenviar a notificação.
    return NextResponse.json({ error: "falha ao processar" }, { status: 500 });
  }
}
