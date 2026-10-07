import { formatBRL, formatDateTime } from "@/lib/format";
import { couponDescription, type CouponKind } from "@/lib/shirt-coupons";
import { salesModeLabel, type SalesMode } from "@/lib/shirts";

/** Linha de `shirt_audit_log`: gravada por gatilhos do banco, só leitura para o admin. */
export type ShirtAuditRow = {
  id: number;
  at: string;
  actor_name: string | null;
  kind: string;
  detail: Record<string, unknown>;
};

const text = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const mode = (v: unknown) => salesModeLabel[v as SalesMode] ?? text(v);
const money = (v: unknown) => (typeof v === "number" ? formatBRL(v) : "sem valor");
const when = (v: unknown) => (typeof v === "string" ? formatDateTime(v) : "sem data");
const count = (v: unknown) => (v === null || v === undefined ? "sem limite" : text(v));
const sizes = (v: unknown) => (Array.isArray(v) && v.length ? v.join(", ") : "nenhum");

const textFields: Record<string, string> = {
  lead_time: "Prazo de produção editado.",
  receipt: "Forma de recebimento editada.",
  policy: "Trocas, cancelamento e atendimento editados.",
  size_guide: "Guia de medidas editado.",
  composition: "Composição editada.",
  fit: "Modelagem editada.",
  description: "Descrição editada.",
  size_limits: "Limites por tamanho atualizados.",
  size_messages: "Mensagens por tamanho atualizadas.",
};

/** Frase em português para uma linha do histórico. */
export function describeAudit(row: Pick<ShirtAuditRow, "kind" | "detail">): string {
  const d = row.detail ?? {};
  switch (row.kind) {
    case "mode":
      return `Modo de venda alterado de ${mode(d.from)} para ${mode(d.to)}.`;
    case "size_disabled":
      return `Tamanho ${text(d.size)} desabilitado.`;
    case "size_enabled":
      return `Tamanho ${text(d.size)} habilitado.`;
    case "coupon_created": {
      const desc = couponDescription({ kind: d.kind as CouponKind, value: Number(d.value) });
      return `Cupom ${text(d.code)} criado (${desc}${d.is_test ? ", teste" : ""}).`;
    }
    case "coupon_enabled":
      return `Cupom ${text(d.code)} ativado.`;
    case "coupon_disabled":
      return `Cupom ${text(d.code)} desativado.`;
    case "coupon_updated":
      return `Cupom ${text(d.code)} editado.`;
    case "setting": {
      const field = text(d.field);
      if (field === "price") return `Preço alterado de ${money(d.from)} para ${money(d.to)}.`;
      if (field === "batch_limit") return `Limite do lote alterado de ${count(d.from)} para ${count(d.to)}.`;
      if (field === "max_per_order") return `Máximo por compra alterado de ${count(d.from)} para ${count(d.to)}.`;
      if (field === "sales_end") return `Data limite alterada de ${when(d.from)} para ${when(d.to)}.`;
      if (field === "sales_start") return `Abertura ao público alterada de ${when(d.from)} para ${when(d.to)}.`;
      if (field === "sizes") return `Grade de tamanhos alterada de ${sizes(d.from)} para ${sizes(d.to)}.`;
      return textFields[field] ?? `Configuração ${field} alterada.`;
    }
    default:
      return row.kind;
  }
}

/** Quem fez: o nome do admin, ou "Linha de comando" quando não houve sessão (ex.: npm run shirt:config). */
export const auditActor = (row: Pick<ShirtAuditRow, "actor_name">) => row.actor_name ?? "Linha de comando";

const SIZE_FIELDS = ["sizes", "size_limits", "size_messages"];

/** A alteração é sobre tamanhos (habilitar, desabilitar, grade, limites ou mensagens)? */
export const isSizeAudit = (row: Pick<ShirtAuditRow, "kind" | "detail">) =>
  row.kind === "size_enabled" ||
  row.kind === "size_disabled" ||
  (row.kind === "setting" && SIZE_FIELDS.includes(String((row.detail ?? {}).field)));
