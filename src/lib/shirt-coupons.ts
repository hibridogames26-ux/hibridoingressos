import { formatBRL, formatDateTime, parseReaisToCents } from "@/lib/format";

export type CouponKind = "percent" | "amount" | "final";

/**
 * Nenhum cupom deixa o total da encomenda entre R$ 0,01 e R$ 0,99 (o mínimo do Mercado Pago, também o valor
 * usado nos testes de pagamento). A única exceção é o cupom de 100%, que zera o total e dispensa o pagamento.
 */
export const MIN_FINAL_CENTS = 100;
export const FREE_PERCENT = 100;
export const COUPON_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
export const COUPON_INVALID_MESSAGE = "Cupom inválido, expirado ou esgotado.";

export const couponKindLabel: Record<CouponKind, string> = {
  percent: "Percentual (%)",
  amount: "Desconto em reais (R$)",
  final: "Valor final fixo (R$)",
};

export type ShirtCoupon = {
  id: string;
  code: string;
  kind: CouponKind;
  /** percent: pontos percentuais (1..100; 100 = cortesia); amount e final: centavos. */
  value: number;
  max_uses: number | null;
  valid_from: string | null;
  valid_until: string | null;
  active: boolean;
  is_test: boolean;
  campaign: string | null;
  notes: string | null;
  created_at: string;
  /** Quantas vezes o mesmo CPF pode usar o cupom (null = sem limite por CPF). */
  max_per_buyer: number | null;
};

/** Linha da visão `v_shirt_coupons`: cupom com o uso, o desconto concedido e a receita. */
export type ShirtCouponRow = ShirtCoupon & {
  paid_uses: number;
  pending_uses: number;
  discount_given_cents: number;
  revenue_cents: number;
};

/** O que o banco devolve (contagens bigint podem vir como texto). */
export function toCouponRow(raw: Record<string, unknown>): ShirtCouponRow {
  const num = (v: unknown) => Number(v ?? 0);
  return {
    ...(raw as unknown as ShirtCoupon),
    value: num(raw.value),
    max_uses: raw.max_uses === null || raw.max_uses === undefined ? null : num(raw.max_uses),
    max_per_buyer: raw.max_per_buyer === null || raw.max_per_buyer === undefined ? null : num(raw.max_per_buyer),
    paid_uses: num(raw.paid_uses),
    pending_uses: num(raw.pending_uses),
    discount_given_cents: num(raw.discount_given_cents),
    revenue_cents: num(raw.revenue_cents),
  };
}

/** "  campanha 10 " → "CAMPANHA10" (maiúsculas, sem espaços, até 32 caracteres). */
export const normalizeCouponCode = (input: string | null | undefined) =>
  String(input ?? "").toUpperCase().replace(/\s+/g, "").slice(0, 32);

export const isValidCouponCode = (code: string) => COUPON_CODE_RE.test(code);

/** Cupom de 100%: a encomenda sai sem pagamento (cortesia). */
export const isFreeCoupon = (kind: CouponKind, value: number) => kind === "percent" && value === FREE_PERCENT;

/** Valor final da encomenda com o cupom. Espelha `public.shirt_coupon_final_cents`. */
export function couponFinalCents(kind: CouponKind, value: number, listCents: number) {
  if (isFreeCoupon(kind, value)) return 0;
  const raw =
    kind === "percent"
      ? listCents - Math.round((listCents * value) / 100)
      : kind === "amount"
        ? listCents - value
        : value;
  return Math.min(listCents, Math.max(MIN_FINAL_CENTS, raw));
}

export const couponDiscountCents = (kind: CouponKind, value: number, listCents: number) =>
  listCents - couponFinalCents(kind, value, listCents);

export function couponDescription(c: Pick<ShirtCoupon, "kind" | "value">) {
  if (isFreeCoupon(c.kind, c.value)) return "100% de desconto (sem pagamento)";
  if (c.kind === "percent") return `${c.value}% de desconto`;
  if (c.kind === "amount") return `${formatBRL(c.value)} de desconto`;
  return `Valor final ${formatBRL(c.value)}`;
}

export type CouponStatus = "ativo" | "agendado" | "encerrado" | "esgotado" | "desativado";

export const couponStatusLabel: Record<CouponStatus, string> = {
  ativo: "Ativo",
  agendado: "Agendado",
  encerrado: "Encerrado",
  esgotado: "Esgotado",
  desativado: "Desativado",
};

export function couponStatus(
  c: Pick<ShirtCouponRow, "active" | "valid_from" | "valid_until" | "max_uses" | "paid_uses" | "pending_uses">,
  now = Date.now(),
): CouponStatus {
  if (!c.active) return "desativado";
  if (c.valid_until && Date.parse(c.valid_until) < now) return "encerrado";
  if (c.max_uses !== null && c.paid_uses + c.pending_uses >= c.max_uses) return "esgotado";
  if (c.valid_from && Date.parse(c.valid_from) > now) return "agendado";
  return "ativo";
}

export const couponUsesText = (c: Pick<ShirtCouponRow, "max_uses" | "paid_uses" | "pending_uses">) =>
  `${c.paid_uses + c.pending_uses} / ${c.max_uses ?? "sem limite"}`;

/** "1 uso por CPF" / "Sem limite por CPF". */
export const couponBuyerLimitText = (c: Pick<ShirtCoupon, "max_per_buyer">) =>
  c.max_per_buyer === null ? "Sem limite por CPF" : `${c.max_per_buyer} ${c.max_per_buyer === 1 ? "uso" : "usos"} por CPF`;

export function couponValidityText(c: Pick<ShirtCoupon, "valid_from" | "valid_until">) {
  if (c.valid_from && c.valid_until) return `${formatDateTime(c.valid_from)} a ${formatDateTime(c.valid_until)}`;
  if (c.valid_until) return `Até ${formatDateTime(c.valid_until)}`;
  if (c.valid_from) return `A partir de ${formatDateTime(c.valid_from)}`;
  return "Sem prazo";
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** "TESTE-7K2P": prefixo e 4 caracteres sem ambiguidade (sem 0, O, 1, I, L). */
export function generateCouponCode(prefix = "CUPOM", random: () => number = Math.random) {
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return `${prefix}-${suffix}`;
}

/** "2026-11-10T23:59" ou "2026-11-10" (fim do dia), sempre no horário de Brasília (UTC−3), para ISO. */
export function parseBrasiliaLocal(text: string | null | undefined, endOfDay = false): string | null {
  const m = String(text ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?$/);
  if (!m) return null;
  const date = new Date(`${m[1]}T${m[2] ?? (endOfDay ? "23:59" : "00:00")}:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** ISO → "2026-11-10T23:59" no horário de Brasília (para preencher um campo datetime-local). */
export function toBrasiliaLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  return Number.isNaN(time) ? "" : new Date(time - 3 * 3600 * 1000).toISOString().slice(0, 16);
}

export type CouponInsert = {
  code: string;
  kind: CouponKind;
  value: number;
  max_uses: number | null;
  valid_from: string | null;
  valid_until: string | null;
  campaign: string | null;
  is_test: boolean;
  max_per_buyer: number | null;
};

export type CouponFormInput = {
  code: string;
  kind: string;
  value: string;
  maxUses?: string;
  validFrom?: string;
  validUntil?: string;
  campaign?: string;
  isTest?: boolean;
  /** Vazio = sem limite por CPF. */
  maxPerBuyer?: string;
};

const KINDS: CouponKind[] = ["percent", "amount", "final"];

/** Valida o formulário de cupom e converte para o que o banco guarda. */
export function parseCouponForm(input: CouponFormInput): { ok: true; coupon: CouponInsert } | { ok: false; message: string } {
  const code = normalizeCouponCode(input.code);
  if (!code) return { ok: false, message: "Informe o código do cupom." };
  if (!isValidCouponCode(code)) {
    return { ok: false, message: "Código inválido: use de 3 a 32 letras, números, hífen ou sublinhado." };
  }

  const kind = input.kind as CouponKind;
  if (!KINDS.includes(kind)) return { ok: false, message: "Escolha o tipo de desconto." };

  let value: number;
  const text = String(input.value ?? "").trim();
  if (kind === "percent") {
    if (!/^\d{1,3}$/.test(text) || Number(text) < 1 || Number(text) > FREE_PERCENT) {
      return { ok: false, message: "O percentual precisa ser um número inteiro de 1 a 100." };
    }
    value = Number(text);
  } else {
    const cents = parseReaisToCents(text);
    if (cents === null || cents < 1) {
      return { ok: false, message: kind === "amount" ? "Informe o desconto em reais." : "Informe o valor final em reais." };
    }
    if (kind === "final" && cents < MIN_FINAL_CENTS) return { ok: false, message: "O valor final mínimo é R$ 1,00." };
    value = cents;
  }

  const maxText = String(input.maxUses ?? "").trim();
  let max_uses: number | null = null;
  if (maxText) {
    if (!/^\d{1,6}$/.test(maxText) || Number(maxText) < 1) {
      return { ok: false, message: "O limite de usos precisa ser um número inteiro maior que zero." };
    }
    max_uses = Number(maxText);
  }

  // Cada uso de um cupom de 100% é uma camisa de graça: sem limite de usos não há controle.
  if (isFreeCoupon(kind, value) && max_uses === null) {
    return { ok: false, message: "O cupom de 100% precisa de um limite de usos: cada uso é uma camisa sem pagamento." };
  }

  const buyerText = String(input.maxPerBuyer ?? "").trim();
  let max_per_buyer: number | null = null;
  if (buyerText) {
    if (!/^\d{1,3}$/.test(buyerText) || Number(buyerText) < 1) {
      return { ok: false, message: "O limite por CPF precisa ser um número inteiro maior que zero." };
    }
    max_per_buyer = Number(buyerText);
  }

  const fromText = String(input.validFrom ?? "").trim();
  const untilText = String(input.validUntil ?? "").trim();
  const valid_from = fromText ? parseBrasiliaLocal(fromText) : null;
  const valid_until = untilText ? parseBrasiliaLocal(untilText, true) : null;
  if (fromText && !valid_from) return { ok: false, message: "Data de início inválida." };
  if (untilText && !valid_until) return { ok: false, message: "Data de término inválida." };
  if (valid_from && valid_until && Date.parse(valid_until) <= Date.parse(valid_from)) {
    return { ok: false, message: "O término precisa ser depois do início." };
  }

  const campaign = String(input.campaign ?? "").trim().slice(0, 80) || null;
  return { ok: true, coupon: { code, kind, value, max_uses, valid_from, valid_until, campaign, is_test: !!input.isTest, max_per_buyer } };
}

/** Cupom de teste de pagamento: valor final R$ 1,00, 2 usos (Pix e cartão) e 24 horas. */
export function testCouponInsert(now = Date.now(), random: () => number = Math.random): CouponInsert {
  return {
    code: generateCouponCode("TESTE", random),
    kind: "final",
    value: MIN_FINAL_CENTS,
    max_uses: 2,
    valid_from: null,
    valid_until: new Date(now + 24 * 3600 * 1000).toISOString(),
    campaign: "Teste de pagamento",
    is_test: true,
    max_per_buyer: null,
  };
}

export const MAX_BATCH = 200;

export type BatchFormInput = {
  prefix: string;
  count: string;
  kind: string;
  value: string;
  /** Usos de cada código (padrão 1). */
  maxUses?: string;
  maxPerBuyer?: string;
  validUntil?: string;
  campaign?: string;
};

/** Valida o formulário de "gerar vários códigos" e devolve o prefixo, a quantidade e o modelo do cupom. */
export function parseBatchForm(
  input: BatchFormInput,
): { ok: true; prefix: string; count: number; template: Omit<CouponInsert, "code"> } | { ok: false; message: string } {
  const prefix = normalizeCouponCode(input.prefix);
  if (!/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(prefix)) {
    return { ok: false, message: "O prefixo precisa ter de 2 a 20 letras, números, hífen ou sublinhado." };
  }
  const countText = String(input.count ?? "").trim();
  if (!/^\d{1,3}$/.test(countText) || Number(countText) < 1 || Number(countText) > MAX_BATCH) {
    return { ok: false, message: `Informe de 1 a ${MAX_BATCH} códigos.` };
  }
  // Reaproveita as regras do cupom individual com um código provisório válido.
  const parsed = parseCouponForm({
    code: `${prefix}-AAAA`,
    kind: input.kind,
    value: input.value,
    maxUses: String(input.maxUses ?? "").trim() || "1",
    maxPerBuyer: input.maxPerBuyer,
    validUntil: input.validUntil,
    campaign: input.campaign,
  });
  if (!parsed.ok) return parsed;
  const { code: _code, ...template } = parsed.coupon;
  void _code;
  return { ok: true, prefix, count: Number(countText), template };
}

/** N códigos únicos "PREFIXO-XXXX" (sem repetir entre si nem com os já existentes). */
export function generateBatchCodes(prefix: string, count: number, taken: Iterable<string> = [], random: () => number = Math.random) {
  const used = new Set(taken);
  const codes: string[] = [];
  let guard = count * 50;
  while (codes.length < count && guard-- > 0) {
    const code = generateCouponCode(prefix, random);
    if (used.has(code)) continue;
    used.add(code);
    codes.push(code);
  }
  return codes;
}
