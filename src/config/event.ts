import { SHIRT_PATH, SHIRT_PHOTOS } from "@/config/shirts";

export type EventLink = {
  label: string;
  description?: string;
  /** Vazio = ainda não definido; o botão aparece desabilitado ("Em breve"). */
  href: string;
  /** Miniatura à esquerda do texto (imagem decorativa; o rótulo já descreve o link). */
  thumbnail?: string;
  /** Selo ao lado da seta, ex.: "Sob encomenda". */
  badge?: string;
};

export const event = {
  name: "Híbrido Games",
  year: 2026,
  tagline: "Evento de Funcional Fitness",
  endorsement: "Chancelado por FPF3",
  // TODO(dados do evento): preencher quando confirmados. Vazio esconde o item.
  /** ISO 8601 com fuso, ex.: "2026-11-21T08:00:00-03:00". */
  startsAt: "",
  /** Ex.: "Nome do local — Cidade, UF". */
  venue: "",
  /** Texto de data exibido, ex.: "21 e 22 de Nov". */
  dateLabel: "",
} as const;

export const ticketsHref = "/ingressos";

// TODO(links reais): Instagram, WhatsApp, regulamento, mapa, FPF3.
export const links: EventLink[] = [
  {
    label: "Camisa oficial do evento",
    description: "Veja as fotos e escolha seu tamanho",
    href: SHIRT_PATH,
    thumbnail: SHIRT_PHOTOS[0].src,
    badge: "Sob encomenda",
  },
  { label: "Instagram", description: "Acompanhe os bastidores", href: "" },
  { label: "WhatsApp", description: "Fale com a organização", href: "" },
  { label: "Regulamento", description: "Regras e categorias", href: "" },
  { label: "Como chegar", description: "Local e mapa", href: "" },
  { label: "FPF3", description: "Chancela oficial", href: "" },
];
