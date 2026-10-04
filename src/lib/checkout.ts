export const MAX_TICKETS_PER_ORDER = 10;

/** Remove tudo que não é dígito. */
export const onlyDigits = (value: string) => value.replace(/\D/g, "");

/** Valida CPF pelos dígitos verificadores. */
export function isValidCpf(input: string) {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function formatCpf(input: string) {
  const d = onlyDigits(input).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

/** Celular/telefone BR com DDD: 10 ou 11 dígitos. */
export const isValidPhone = (value: string) => /^\d{10,11}$/.test(onlyDigits(value));

export type CartLine = { ticketTypeId: string; quantity: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "id:2,id2:1" → linhas válidas (ids únicos, quantidades 1..10, total ≤ 10). */
export function parseCart(param: string | undefined | null): CartLine[] | null {
  if (!param) return null;
  const lines: CartLine[] = [];
  const seen = new Set<string>();
  for (const part of param.split(",")) {
    const [id, qtyText] = part.split(":");
    const quantity = Number(qtyText);
    if (!id || !UUID.test(id) || seen.has(id)) return null;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_ORDER) return null;
    seen.add(id);
    lines.push({ ticketTypeId: id.toLowerCase(), quantity });
  }
  const total = lines.reduce((sum, l) => sum + l.quantity, 0);
  if (!lines.length || total > MAX_TICKETS_PER_ORDER) return null;
  return lines;
}

export const serializeCart = (lines: CartLine[]) =>
  lines.map((l) => `${l.ticketTypeId}:${l.quantity}`).join(",");

/** Normaliza nome: espaços únicos, até 80 caracteres. */
export const cleanName = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 80);

/** Nome completo = ao menos duas palavras. */
export const isFullName = (value: string) => cleanName(value).split(" ").filter((w) => w.length > 1).length >= 2;

export function splitName(full: string) {
  const parts = cleanName(full).split(" ");
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}
