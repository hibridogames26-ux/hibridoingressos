import { badgeBrand, badgeDanger, badgeNeutral, badgeSuccess } from "@/components/ui/styles";
import {
  orderStatusLabel,
  scanResultLabel,
  shirtFulfillmentLabel,
  ticketStatusLabel,
  type OrderStatus,
  type ScanResult,
  type ShirtFulfillment,
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

const fulfillmentTone: Record<ShirtFulfillment, string> = {
  aguardando_producao: badgeNeutral,
  em_producao: badgeBrand,
  pronto: badgeSuccess,
  entregue: badgeSuccess,
};

/** Andamento da produção da camisa (independente do status do pagamento). */
export function FulfillmentBadge({ status }: { status: ShirtFulfillment }) {
  return (
    <span className={fulfillmentTone[status]}>
      {status === "entregue" && <span aria-hidden="true">✓&nbsp;</span>}
      {shirtFulfillmentLabel[status]}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={orderTone[status]}>{orderStatusLabel[status]}</span>;
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <span className={ticketTone[status]}>{ticketStatusLabel[status]}</span>;
}

export function ScanResultBadge({ result }: { result: ScanResult }) {
  return <span className={scanTone[result]}>{scanResultLabel[result]}</span>;
}
