export type OrderStatus = "pendente" | "pago" | "cancelado" | "estornado";
export type PaymentMethod = "pix" | "cartao";
export type TicketStatus = "valido" | "rasgado" | "cancelado";
export type ShirtFulfillment = "aguardando_producao" | "em_producao" | "pronto" | "entregue";
export type ScanResult = "ok" | "ja_utilizado" | "cancelado" | "invalido" | "data_errada";

export const orderStatusLabel: Record<OrderStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  cancelado: "Cancelado",
  estornado: "Estornado",
};

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  pix: "Pix",
  cartao: "Cartão",
};

export const ticketStatusLabel: Record<TicketStatus, string> = {
  valido: "Válido",
  rasgado: "Rasgado",
  cancelado: "Cancelado",
};

export const scanResultLabel: Record<ScanResult, string> = {
  ok: "Entrada liberada",
  ja_utilizado: "Já utilizado",
  cancelado: "Cancelado",
  invalido: "Código inválido",
  data_errada: "Outro dia",
};

export const SHIRT_FULFILLMENT_STATUSES: ShirtFulfillment[] = ["aguardando_producao", "em_producao", "pronto", "entregue"];

export const shirtFulfillmentLabel: Record<ShirtFulfillment, string> = {
  aguardando_producao: "Aguardando produção",
  em_producao: "Em produção",
  pronto: "Pronto",
  entregue: "Entregue",
};

/** Próxima etapa do andamento, ou null se já foi entregue. */
export function nextShirtFulfillment(status: ShirtFulfillment): ShirtFulfillment | null {
  return SHIRT_FULFILLMENT_STATUSES[SHIRT_FULFILLMENT_STATUSES.indexOf(status) + 1] ?? null;
}
