export type EventLink = {
  label: string;
  description?: string;
  /** Vazio = ainda não definido; o botão aparece desabilitado ("Em breve"). */
  href: string;
  /** Miniatura à esquerda do texto (imagem decorativa; o rótulo já descreve o link). */
  thumbnail?: string;
  /** Selo ao lado da seta, ex.: "Sob encomenda". */
  badge?: string;
  /** Destaque visual (botão cheio na cor da marca), reservado à ação principal. */
  primary?: boolean;
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

/** Endereço do local do evento, usado na rota do Waze. */
export const venueAddress =
  "R. Jose de Almeida Noronha, Quadra 155 - Lote 14 - Portal do Sol, João Pessoa - PB, 58046-503";

/** Link universal do Waze: abre o app (ou o site) já com a navegação até o endereço. */
export const wazeHref = `https://waze.com/ul?q=${encodeURIComponent(venueAddress)}&navigate=yes`;

/** Lista única da home (estilo "link na bio"), na ordem de exibição. */
// TODO(links reais): WhatsApp.
export const links: EventLink[] = [
  {
    label: "Comprar ingresso",
    description: "Garanta seu lugar no evento",
    href: ticketsHref,
    primary: true,
  },
  { label: "Check-in do atleta", description: "Confirme sua presença no evento", href: "/check-in" },
  {
    label: "Ranking Híbrido Race",
    description: "Classificação no WodArena",
    href: "https://www.wodarena.com.br/pt-br/event/evt-org-1-hibirdo-race-mto5ilom-9odh15/leaderboard",
  },
  {
    label: "Ranking Híbrido Games",
    description: "Classificação no WodArena",
    href: "https://www.wodarena.com.br/pt-br/event/evt-org-1-luan-angelino-vilar-ms7btfwf-nu0307/leaderboard",
  },
  {
    label: "Regulamento",
    description: "Regras e categorias da competição",
    href: "https://fpf3.com.br/regulamento-hibrido-games-26-2",
  },
  { label: "FPF3", description: "Funcional Fitness da Paraíba", href: "https://fpf3.com.br/" },
  { label: "WhatsApp", description: "Fale com a organização", href: "" },
  { label: "Como chegar", description: "Abrir rota no Waze", href: wazeHref },
];
