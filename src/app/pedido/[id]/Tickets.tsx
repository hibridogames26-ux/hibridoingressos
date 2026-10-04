import QRCode from "qrcode";
import { badgeBrand, badgeDanger, badgeSuccess, card } from "@/components/ui/styles";
import { formatEventDate } from "@/lib/format";
import type { BuyerOrder } from "@/lib/order-service";

const statusBadge = {
  valido: <span className={badgeSuccess}>Válido</span>,
  rasgado: <span className={badgeBrand}>Utilizado</span>,
  cancelado: <span className={badgeDanger}>Cancelado</span>,
};

export async function Tickets({ order }: { order: BuyerOrder }) {
  const tickets = await Promise.all(
    order.tickets.map(async (t) => ({
      ...t,
      qr: await QRCode.toDataURL(t.token, { margin: 1, width: 320, errorCorrectionLevel: "M" }),
    })),
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {tickets.map((t) => (
        <article key={t.id} className={`${card} flex flex-col items-center gap-3 p-5 text-center`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado no servidor */}
          <img
            src={t.qr}
            alt={`QR Code do ingresso de ${t.holder_name}`}
            width={220}
            height={220}
            className={t.status === "valido" ? "" : "opacity-30"}
          />
          <span className="font-mono text-xl font-semibold tracking-[0.2em]">{t.short_code}</span>
          <div className="flex flex-col gap-0.5">
            <span className="text-base font-semibold">{t.holder_name}</span>
            <span className="text-sm text-cool-gray">
              {t.ticket_types?.name} · {formatEventDate(t.ticket_types?.event_date)}
            </span>
          </div>
          {statusBadge[t.status]}
        </article>
      ))}
    </div>
  );
}
