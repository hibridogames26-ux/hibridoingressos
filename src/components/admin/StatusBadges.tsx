import { badgeBrand, badgeDanger, badgeNeutral, badgeSuccess } from "@/components/ui/styles";
import {
  orderStatusLabel,
  scanResultLabel,
  ticketStatusLabel,
  type OrderStatus,
  type ScanResult,
  type TicketStatus,
} from "@/lib/labels";

const orderTone: Record<OrderStatus, string> = {
  pago: badgeSuccess,
  pendente: badgeNeutral,
  estornado: badgeDanger,
  cancelado: badgeNeutral,
};

const ticketTone: Record<TicketStatus, string> = {
  valido: badgeSuccess,
  rasgado: badgeBrand,
  cancelado: badgeDanger,
};

const scanTone: Record<ScanResult, string> = {
  ok: badgeSuccess,
  ja_utilizado: badgeDanger,
  cancelado: badgeDanger,
  invalido: badgeNeutral,
  data_errada: badgeDanger,
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={orderTone[status]}>{orderStatusLabel[status]}</span>;
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <span className={ticketTone[status]}>{ticketStatusLabel[status]}</span>;
}

export function ScanResultBadge({ result }: { result: ScanResult }) {
  return <span className={scanTone[result]}>{scanResultLabel[result]}</span>;
}
