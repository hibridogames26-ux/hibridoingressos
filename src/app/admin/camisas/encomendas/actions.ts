"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";
import { SHIRT_FULFILLMENT_STATUSES, type ShirtFulfillment } from "@/lib/labels";
import { filtersToParams, parseShirtFilters } from "@/lib/shirt-orders";
import { createClient } from "@/lib/supabase/server";

const LIST = "/admin/camisas/encomendas";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server Actions são endpoints públicos: revalida o admin em toda chamada. */
async function assertAdmin() {
  const profile = await getCurrentProfile();
  if (!profile?.active || profile.role !== "admin") throw new Error("Não autorizado");
}

const isFulfillment = (value: unknown): value is ShirtFulfillment =>
  typeof value === "string" && (SHIRT_FULFILLMENT_STATUSES as string[]).includes(value);

/** Chama a função do banco, que confere is_admin() e só mexe em encomendas pagas. */
async function setFulfillment(ids: string[], to: ShirtFulfillment, allowBack: boolean) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_shirt_fulfillment", {
    p_ids: ids,
    p_to: to,
    p_allow_back: allowBack,
  });
  if (error) throw new Error(`Falha ao atualizar o andamento: ${error.message}`);
  return Number(data ?? 0);
}

/** Lista: avança as encomendas pagas selecionadas (nunca retrocede). */
export async function advanceSelected(formData: FormData) {
  await assertAdmin();

  const to = formData.get("to");
  const ids = formData.getAll("ids").filter((v): v is string => typeof v === "string" && UUID.test(v));
  // Só reaproveita filtros conhecidos: o retorno nunca vira um redirecionamento aberto.
  const filters = parseShirtFilters(Object.fromEntries(new URLSearchParams(String(formData.get("retorno") ?? ""))));
  const back = (extra: Record<string, string | number>) => `${LIST}?${filtersToParams(filters, extra)}`;

  if (!isFulfillment(to) || to === "aguardando_producao" || ids.length === 0) {
    redirect(back({ aviso: "selecione" }));
  }

  const updated = await setFulfillment(ids, to, false);
  revalidatePath(LIST);
  revalidatePath("/admin/camisas");
  redirect(back({ atualizadas: updated }));
}

/** Detalhe: avança uma encomenda ou corrige o andamento (permite voltar). */
export async function updateOne(formData: FormData) {
  await assertAdmin();

  const id = String(formData.get("id") ?? "");
  const to = formData.get("to");
  if (!UUID.test(id) || !isFulfillment(to)) throw new Error("Dados inválidos.");

  await setFulfillment([id], to, formData.get("corrigir") === "1");
  revalidatePath(`${LIST}/${id}`);
  revalidatePath(LIST);
  revalidatePath("/admin/camisas");
  redirect(`${LIST}/${id}?salvo=1`);
}
