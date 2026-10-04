import Image from "next/image";
import QRCode from "qrcode";
import { event } from "@/config/event";
import { formatEventDateLong, formatHourMinute } from "@/lib/format";
import type { BuyerOrder } from "@/lib/order-service";

type Ticket = BuyerOrder["tickets"][number];

function StatusBadge({ ticket }: { ticket: Ticket }) {
  const styles = {
    valido: "bg-white/20 text-white",
    rasgado: "bg-ink/35 text-white",
    cancelado: "bg-danger text-white",
  } as const;
  const labels = { valido: "Válido", rasgado: "Utilizado", cancelado: "Cancelado" } as const;
  return (
    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${styles[ticket.status]}`}>
      {labels[ticket.status]}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-t border-[#f0f0f4] py-2.5 text-sm first:border-t-0">
      <dt className="text-cool-gray">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

/** Modelo "Carteira clean" (opção B): faixa roxa, QR central e dados do titular. */
function TicketCard({ ticket, qr, index, total }: { ticket: Ticket; qr: string; index: number; total: number }) {
  const valid = ticket.status === "valido";
  // Emissão em sequência, com o atraso total limitado para pedidos grandes.
  const delay = Math.min(index, 4) * 120;
  const overlay =
    ticket.status === "rasgado"
      ? `Ingresso rasgado${ticket.redeemed_at ? ` às ${formatHourMinute(ticket.redeemed_at)}` : ""}`
      : ticket.status === "cancelado"
        ? "Ingresso cancelado"
        : null;

  return (
    <article
      id={`ingresso-${index + 1}`}
      aria-label={`Ingresso ${index + 1} de ${total}: ${ticket.holder_name}`}
      style={{ animationDelay: `${delay}ms` }}
      className="flex scroll-mt-4 animate-issue flex-col overflow-hidden rounded-[20px] border border-line bg-surface shadow-whisper"
    >
      <header className="flex items-center gap-3 bg-brand px-[18px] py-4 text-white">
        <div className="flex rounded-xl bg-white p-1">
          <Image src="/logo-hibrido-games.png" alt="" width={36} height={40} className="h-10 w-9 object-contain" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-bold">
            {event.name} {event.year}
          </span>
          <span className="truncate text-xs text-white/85">{ticket.ticket_types?.name}</span>
        </div>
        <StatusBadge ticket={ticket} />
      </header>

      <div className="flex flex-col items-center gap-3 px-[18px] pb-[18px] pt-[22px]">
        <div className="relative rounded-2xl border border-line p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado no servidor */}
          <img
            src={qr}
            alt={valid ? `QR Code do ingresso de ${ticket.holder_name}` : ""}
            width={196}
            height={196}
            style={{ animationDelay: `${delay + 280}ms` }}
            className={`block size-[196px] animate-qr-focus ${valid ? "" : "opacity-15"}`}
          />
          {overlay && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <span className="rounded-[10px] bg-ink px-3.5 py-2 text-center text-sm font-semibold text-white">
                {overlay}
              </span>
            </div>
          )}
        </div>
        <span className="font-mono text-lg font-semibold tracking-[0.2em]">{ticket.short_code}</span>
        {total > 1 && (
          <span className="text-xs text-muted">
            Ingresso {index + 1} de {total}
          </span>
        )}
      </div>

      <dl className="border-t border-line px-[18px] py-1">
        <Row label="Titular" value={ticket.holder_name} />
        <Row label="Válido em" value={formatEventDateLong(ticket.ticket_types?.event_date)} />
        {event.venue && <Row label="Local" value={event.venue} />}
      </dl>
    </article>
  );
}

export async function Tickets({ order }: { order: BuyerOrder }) {
  const tickets = await Promise.all(
    order.tickets.map(async (t) => ({
      ticket: t,
      qr: await QRCode.toDataURL(t.token, { margin: 1, width: 392, errorCorrectionLevel: "M" }),
    })),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {tickets.map(({ ticket, qr }, i) => (
          <TicketCard key={ticket.id} ticket={ticket} qr={qr} index={i} total={tickets.length} />
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-[14px] bg-muted/8 p-3.5">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="mt-px size-5 shrink-0"
          fill="none"
          stroke="#5741d8"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16h.01" />
        </svg>
        <p className="text-[13px] leading-normal text-[#484b5e]">
          Na entrada, mostre o QR Code e receba sua pulseira. Cada ingresso é lido uma única vez — não compartilhe
          prints. Se a câmera falhar, o staff pode digitar o código abaixo do QR.
        </p>
      </div>
    </div>
  );
}
