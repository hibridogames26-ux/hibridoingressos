"use server";

import { revalidatePath } from "next/cache";
import { SHIRT_SLUG } from "@/config/shirts";
import { getCurrentProfile } from "@/lib/auth";
import {
  generateBatchCodes,
  parseBatchForm,
  parseBrasiliaLocal,
  parseCouponForm,
  testCouponInsert,
  type BatchFormInput,
  type CouponFormInput,
  type CouponInsert,
} from "@/lib/shirt-coupons";
import { parseSettingsForm, type SettingsFormInput } from "@/lib/shirt-settings";
import { SALES_MODES, isMissingRelationError, type SalesMode } from "@/lib/shirts";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true; message?: string; code?: string; codes?: string[] } | { ok: false; message: string };

const fail = (message: string): ActionResult => ({ ok: false, message });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server Actions são endpoints públicos: revalida o admin em toda chamada (o banco confere de novo). */
async function assertAdmin() {
  const profile = await getCurrentProfile();
  if (!profile?.active || profile.role !== "admin") throw new Error("Não autorizado");
}

const refresh = () => {
  revalidatePath("/admin/camisas");
  revalidatePath("/admin/camisas/teste");
  revalidatePath("/admin/camisas/cupons");
  revalidatePath("/admin/camisas/configuracoes");
};

type DbError = { message: string; code?: string };

/** Traduz os erros das funções do banco para uma mensagem que o admin entende. */
function explain(error: DbError): string {
  const text = error.message;
  if (isMissingRelationError(error)) return "As migrations de camisa ainda não foram aplicadas neste banco (npm run db:push).";
  if (text.includes("not_authorized")) return "Sem permissão para esta ação.";
  if (text.includes("incomplete")) {
    return "Faltam condições da venda. Preencha todas (preço, tamanhos, medidas, prazo, recebimento, data limite, lote, máximo por compra e política) antes de abrir ou de editar com a venda aberta.";
  }
  const inUse = text.match(/size_in_use:(.+)$/);
  if (inUse) return `O tamanho ${inUse[1]} já tem encomendas. Desabilite o tamanho em vez de remover.`;
  if (text.includes("invalid_limits")) return "Limite inválido: use números inteiros maiores que zero, só para tamanhos da grade.";
  if (text.includes("invalid_messages")) return "Mensagem inválida: use até 200 caracteres, só para tamanhos da grade.";
  if (text.includes("invalid_sizes")) return "Grade inválida: há tamanhos repetidos, vazios ou com mais de 12 caracteres.";
  if (text.includes("invalid_size")) return "Esse tamanho não faz parte da grade.";
  if (error.code === "23505") return "Já existe um cupom com esse código.";
  if (text.includes("shirt_coupons_free_needs_limit")) {
    return "O cupom de 100% precisa de um limite de usos: cada uso é uma camisa sem pagamento.";
  }
  if (error.code === "23514") return "Algum valor está fora do permitido. Confira preço, lote, máximo por compra e as regras do cupom.";
  console.error("Error in shirt admin action:", error);
  return "Não foi possível salvar. Tente de novo.";
}

/** Modo de venda: fechada, somente com cupom ou aberta (só com todas as condições definidas). */
export async function setSalesModeAction(mode: string): Promise<ActionResult> {
  await assertAdmin();
  if (!(SALES_MODES as string[]).includes(mode)) return fail("Modo de venda inválido.");
  const { error } = await (await createClient()).rpc("set_shirt_sales_mode", { p_slug: SHIRT_SLUG, p_mode: mode as SalesMode });
  if (error) return fail(explain(error));
  refresh();
  return { ok: true };
}

/** Habilita ou desabilita um tamanho da grade (quem já comprou continua com a encomenda). */
export async function setSizeEnabledAction(size: string, enabled: boolean): Promise<ActionResult> {
  await assertAdmin();
  const { error } = await (await createClient()).rpc("set_shirt_size_enabled", {
    p_slug: SHIRT_SLUG,
    p_size: String(size ?? ""),
    p_enabled: !!enabled,
  });
  if (error) return fail(explain(error));
  refresh();
  return { ok: true };
}

async function insertCoupon(coupon: CouponInsert): Promise<ActionResult> {
  const { error } = await (await createClient()).from("shirt_coupons").insert(coupon);
  if (error) return fail(explain(error));
  refresh();
  revalidatePath("/admin/camisas/cupons");
  return { ok: true, code: coupon.code, message: `Cupom ${coupon.code} criado.` };
}

export async function createCouponAction(input: CouponFormInput): Promise<ActionResult> {
  await assertAdmin();
  const parsed = parseCouponForm(input);
  if (!parsed.ok) return fail(parsed.message);
  return insertCoupon(parsed.coupon);
}

/** Cupom de teste de pagamento: valor final R$ 1,00, 2 usos (Pix e cartão), 24 horas. */
export async function createTestCouponAction(): Promise<ActionResult> {
  await assertAdmin();
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await insertCoupon(testCouponInsert());
    if (result.ok || !result.message.includes("Já existe")) return result;
  }
  return fail("Não foi possível gerar um código novo. Tente de novo.");
}

export async function setCouponActiveAction(id: string, active: boolean): Promise<ActionResult> {
  await assertAdmin();
  if (!UUID.test(id)) return fail("Cupom inválido.");
  const { error } = await (await createClient()).from("shirt_coupons").update({ active: !!active }).eq("id", id);
  if (error) return fail(explain(error));
  refresh();
  revalidatePath("/admin/camisas/cupons");
  return { ok: true };
}

/** Preço, lote, janela, grade de tamanhos e textos. O banco recusa deixar a venda aberta incompleta. */
export async function updateSettingsAction(input: Partial<SettingsFormInput>): Promise<ActionResult> {
  await assertAdmin();
  const parsed = parseSettingsForm(input);
  if (!parsed.ok) return fail(parsed.message);
  const { error } = await (await createClient()).rpc("update_shirt_settings", { p_slug: SHIRT_SLUG, p_values: parsed.values });
  if (error) return fail(explain(error));
  refresh();
  revalidatePath("/admin/camisas/configuracoes");
  return { ok: true, message: "Configurações salvas." };
}

/** Marcas manuais do roteiro de teste: encomendas conferidas, estornos feitos ou pulados, recomeçar. */
export async function markTestStepAction(step: string): Promise<ActionResult> {
  await assertAdmin();
  if (!["checked", "refunds", "reset"].includes(step)) return fail("Passo inválido.");
  const { error } = await (await createClient()).rpc("mark_shirt_test_step", { p_slug: SHIRT_SLUG, p_step: step });
  if (error) return fail(explain(error));
  refresh();
  return { ok: true };
}

/** Gera vários códigos de uma vez (ex.: PARCEIRO-7K2P) com o mesmo desconto, limites e validade. */
export async function createBatchCouponsAction(input: BatchFormInput): Promise<ActionResult> {
  await assertAdmin();
  const parsed = parseBatchForm(input);
  if (!parsed.ok) return fail(parsed.message);

  const supabase = await createClient();
  for (let attempt = 0; attempt < 4; attempt++) {
    const codes = generateBatchCodes(parsed.prefix, parsed.count);
    if (codes.length < parsed.count) return fail("Não foi possível gerar tantos códigos com esse prefixo. Use um prefixo diferente.");
    const { error } = await supabase.from("shirt_coupons").insert(codes.map((code) => ({ ...parsed.template, code })));
    if (!error) {
      refresh();
      return { ok: true, codes, message: `${codes.length} ${codes.length === 1 ? "cupom criado" : "cupons criados"}.` };
    }
    // Código repetido com um já existente: sorteia de novo.
    if (error.code !== "23505") return fail(explain(error));
  }
  return fail("Não foi possível gerar códigos novos. Tente de novo.");
}

export type CouponEditInput = {
  maxUses: string;
  maxPerBuyer: string;
  validFrom: string;
  validUntil: string;
  campaign: string;
  notes: string;
};

/** Edita limites, validade e campanha de um cupom (código, tipo e valor não mudam depois de criado). */
export async function updateCouponAction(id: string, input: CouponEditInput): Promise<ActionResult> {
  await assertAdmin();
  if (!UUID.test(id)) return fail("Cupom inválido.");

  const int = (text: string, max: number) => {
    const t = text.trim();
    if (!t) return null;
    return /^\d{1,6}$/.test(t) && Number(t) >= 1 && Number(t) <= max ? Number(t) : undefined;
  };
  const maxUses = int(input.maxUses, 1_000_000);
  const maxPerBuyer = int(input.maxPerBuyer, 999);
  if (maxUses === undefined) return fail("O limite de usos precisa ser um número inteiro maior que zero.");
  if (maxPerBuyer === undefined) return fail("O limite por CPF precisa ser um número inteiro maior que zero.");

  const from = input.validFrom.trim() ? parseBrasiliaLocal(input.validFrom) : null;
  const until = input.validUntil.trim() ? parseBrasiliaLocal(input.validUntil, true) : null;
  if (input.validFrom.trim() && !from) return fail("Data de início inválida.");
  if (input.validUntil.trim() && !until) return fail("Data de término inválida.");
  if (from && until && Date.parse(until) <= Date.parse(from)) return fail("O término precisa ser depois do início.");

  const { error } = await (await createClient())
    .from("shirt_coupons")
    .update({
      max_uses: maxUses,
      max_per_buyer: maxPerBuyer,
      valid_from: from,
      valid_until: until,
      campaign: input.campaign.trim().slice(0, 80) || null,
      notes: input.notes.trim().slice(0, 500) || null,
    })
    .eq("id", id);
  if (error) return fail(explain(error));
  refresh();
  revalidatePath(`/admin/camisas/cupons/${id}`);
  return { ok: true, message: "Cupom atualizado." };
}

/** Limite de camisas e mensagem ao cliente por tamanho. Campo vazio remove o limite ou a mensagem. */
export async function updateSizeSettingsAction(input: {
  limits: Record<string, string>;
  messages: Record<string, string>;
}): Promise<ActionResult> {
  await assertAdmin();
  const { error } = await (await createClient()).rpc("update_shirt_size_settings", {
    p_slug: SHIRT_SLUG,
    p_limits: input.limits ?? {},
    p_messages: input.messages ?? {},
  });
  if (error) return fail(explain(error));
  refresh();
  return { ok: true, message: "Limites e mensagens salvos." };
}
