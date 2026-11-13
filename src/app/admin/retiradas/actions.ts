"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { displayName, fold, type Competition } from "@/lib/checkin/sheet";
import { competitionTitle } from "@/lib/checkin/terms";
import { sendShirtPickupEmail, type ShirtPickupRole } from "@/lib/email";
import { formatDateTime } from "@/lib/format";
import {
  isPickupId,
  joinNames,
  parseAthleteForm,
  parseConfirmForm,
  type AthleteFormErrors,
  type AthleteFormInput,
  type ConfirmFormErrors,
  type ConfirmFormInput,
} from "@/lib/pickups/form";
import { createClient } from "@/lib/supabase/server";

type DbError = { message: string; code?: string };
type Supabase = Awaited<ReturnType<typeof createClient>>;

const NOT_ALLOWED = "Sem permissão para esta ação. Entre com a conta de administrador.";
const NOT_FOUND = "Atleta não encontrado na lista de retirada. Atualize a página.";

/** Server Actions são endpoints públicos: confere o admin em toda chamada (o banco confere de novo). */
async function isAdmin() {
  const profile = await getCurrentProfile();
  return !!profile?.active && profile.role === "admin";
}

function explain(error: DbError): string {
  if (error.message.includes("not_authorized")) return NOT_ALLOWED;
  if (error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42883" || error.code === "42P01") {
    return "A migration da retirada de camisas ainda não foi aplicada neste banco (npm run db:push).";
  }
  if (error.message.includes("invalid_athlete")) return "O atleta escolhido em “Cadastro do check-in” não existe mais. Escolha outro.";
  if (error.message.includes("invalid_fields")) return "Informe o nome do atleta e o tamanho da camisa.";
  if (error.message.includes("name_required")) return "Informe o nome de quem está retirando.";
  if (error.message.includes("invalid_batch")) return "Só dá para confirmar juntas as camisas da mesma inscrição. Atualize a página.";
  if (error.code === "23514" || error.code === "23502") return "Algum valor está fora do permitido. Confira os campos e tente de novo.";
  console.error("Error in shirt pickup action:", error);
  return "Não foi possível salvar. Tente de novo.";
}

const refresh = () => revalidatePath("/admin/retiradas");

// ---------------------------------------------------------------------------
// Novo atleta e edição
// ---------------------------------------------------------------------------
export type SaveResult = { ok: true; message: string } | { ok: false; message: string; errors?: AthleteFormErrors };

/** `id` nulo cria um atleta na lista; com `id`, edita. */
export async function savePickupAthleteAction(id: string | null, input: AthleteFormInput): Promise<SaveResult> {
  try {
    if (!(await isAdmin())) return { ok: false, message: NOT_ALLOWED };
    if (id !== null && !isPickupId(id)) return { ok: false, message: NOT_FOUND };
    const parsed = parseAthleteForm(input);
    if (!parsed.ok) return { ok: false, message: "Confira os campos destacados.", errors: parsed.errors };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_save_shirt_pickup", { p_id: id, p_fields: parsed.fields });
    if (error) return { ok: false, message: explain(error) };

    const status = (data as { status?: string } | null)?.status;
    if (status === "not_found") return { ok: false, message: NOT_FOUND };
    if (status === "unchanged") return { ok: true, message: "Nada mudou: os dados já estavam assim." };
    if (status !== "ok") return { ok: false, message: "Não foi possível salvar. Tente de novo." };
    refresh();
    const name = displayName(parsed.fields.full_name);
    return { ok: true, message: id ? `Dados de ${name} atualizados.` : `${name} entrou na lista de retirada.` };
  } catch (error) {
    console.error("Error in savePickupAthleteAction:", error);
    return { ok: false, message: "Não foi possível salvar. Verifique a conexão e tente de novo." };
  }
}

// ---------------------------------------------------------------------------
// Excluir e desfazer
// ---------------------------------------------------------------------------
export type SimpleResult = { ok: true; message: string } | { ok: false; message: string };

export async function deletePickupAction(id: string): Promise<SimpleResult> {
  try {
    if (!(await isAdmin())) return { ok: false, message: NOT_ALLOWED };
    if (!isPickupId(id)) return { ok: false, message: NOT_FOUND };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_delete_shirt_pickup", { p_id: id });
    if (error) return { ok: false, message: explain(error) };

    const result = data as { status?: string; name?: string } | null;
    if (result?.status === "not_found") return { ok: false, message: NOT_FOUND };
    if (result?.status === "picked_up") {
      return { ok: false, message: "Esta camisa já foi retirada. Desfaça a retirada antes de excluir o atleta da lista." };
    }
    if (result?.status !== "ok") return { ok: false, message: "Não foi possível excluir. Tente de novo." };
    refresh();
    return { ok: true, message: `${displayName(result.name ?? "")} saiu da lista de retirada.` };
  } catch (error) {
    console.error("Error in deletePickupAction:", error);
    return { ok: false, message: "Não foi possível excluir. Verifique a conexão e tente de novo." };
  }
}

export async function undoPickupAction(id: string): Promise<SimpleResult> {
  try {
    if (!(await isAdmin())) return { ok: false, message: NOT_ALLOWED };
    if (!isPickupId(id)) return { ok: false, message: NOT_FOUND };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_undo_shirt_pickup", { p_id: id });
    if (error) return { ok: false, message: explain(error) };

    const result = data as { status?: string; name?: string } | null;
    if (result?.status === "not_found") return { ok: false, message: NOT_FOUND };
    if (result?.status === "none") return { ok: false, message: "Esta camisa não está marcada como retirada. Atualize a página." };
    if (result?.status !== "ok") return { ok: false, message: "Não foi possível desfazer. Tente de novo." };
    refresh();
    return { ok: true, message: `Retirada de ${displayName(result.name ?? "")} desfeita. A camisa voltou para Pendente.` };
  } catch (error) {
    console.error("Error in undoPickupAction:", error);
    return { ok: false, message: "Não foi possível desfazer. Verifique a conexão e tente de novo." };
  }
}

// ---------------------------------------------------------------------------
// E-mail da retirada: um por endereço, com todas as camisas entregues àquele e-mail.
// ---------------------------------------------------------------------------
type BatchRow = {
  id: string;
  competition: Competition;
  team_name: string;
  full_name: string;
  shirt_size: string;
  email: string;
  picked_up_at: string;
  delivered_size: string | null;
  picked_by_name: string | null;
  picked_by_self: boolean | null;
  picked_by_document: string | null;
  pickup_note: string | null;
  delivered_by_name: string | null;
};

type MailOutcome = { sent: string[]; failed: string[]; noProvider: boolean };

/** Envia os e-mails de um lote de retirada. `onlyEmail` limita a um endereço (reenvio). Nunca desfaz a retirada. */
async function sendBatchEmails(supabase: Supabase, batch: string, onlyEmail?: string): Promise<MailOutcome> {
  const outcome: MailOutcome = { sent: [], failed: [], noProvider: false };
  const { data, error } = await supabase
    .from("athlete_shirt_pickups")
    .select(
      "id, competition, team_name, full_name, shirt_size, email, picked_up_at, delivered_size, picked_by_name, picked_by_self, picked_by_document, pickup_note, delivered_by_name",
    )
    .eq("pickup_batch", batch)
    .not("picked_up_at", "is", null)
    .is("deleted_at", null)
    .order("full_name")
    .returns<BatchRow[]>();
  if (error) throw new Error(`Falha ao carregar a retirada para o e-mail: ${error.message}`);

  const groups = new Map<string, BatchRow[]>();
  for (const row of data ?? []) {
    const email = row.email.trim().toLowerCase();
    if (onlyEmail && email !== onlyEmail.trim().toLowerCase()) continue;
    groups.set(email, [...(groups.get(email) ?? []), row]);
  }

  // Atleta que retirou em pessoa (quando não foi outra pessoa).
  const picker = (data ?? []).find((r) => r.picked_by_self === true);

  for (const [email, rows] of groups) {
    const first = rows[0];
    const role: ShirtPickupRole = !picker ? "terceiro" : rows.length === 1 && first.id === picker.id ? "atleta" : "integrante";
    try {
      const sent = await sendShirtPickupEmail({
        to: email,
        competition: competitionTitle(first.competition),
        items: rows.map((r) => ({
          athleteName: displayName(r.full_name),
          teamName: fold(r.team_name) === fold(r.full_name) ? null : r.team_name,
          size: r.delivered_size ?? r.shirt_size,
        })),
        pickedByName: displayName(first.picked_by_name ?? ""),
        pickedByRole: role,
        document: first.picked_by_document,
        pickedAt: first.picked_up_at,
        deliveredByName: first.delivered_by_name,
        note: first.pickup_note,
      });
      if (!sent) {
        outcome.noProvider = true;
        continue;
      }
      outcome.sent.push(email);
      const { error: markError } = await supabase.rpc("admin_mark_shirt_pickup_emailed", { p_ids: rows.map((r) => r.id) });
      if (markError) console.error("Error marking shirt pickup e-mail as sent:", markError);
    } catch (mailError) {
      console.error("Error sending shirt pickup e-mail:", mailError);
      outcome.failed.push(email);
    }
  }
  return outcome;
}

/** Frase sobre o e-mail, depois de “Retirada confirmada.” ou sozinha no reenvio. */
function mailSentence(outcome: MailOutcome): { text: string; warn: boolean } {
  if (outcome.failed.length) {
    return {
      text: `O e-mail para ${joinNames(outcome.failed)} não foi enviado. Use “Reenviar e-mail” na linha do atleta.`,
      warn: true,
    };
  }
  if (outcome.noProvider) return { text: "O e-mail não foi enviado: nenhum provedor de e-mail está configurado.", warn: true };
  if (outcome.sent.length) return { text: `E-mail enviado para ${joinNames(outcome.sent)}.`, warn: false };
  return { text: "Nenhum e-mail para enviar.", warn: true };
}

// ---------------------------------------------------------------------------
// Confirmar retirada
// ---------------------------------------------------------------------------
export type ConfirmResult =
  | { ok: true; message: string; warn: boolean }
  | { ok: false; message: string; errors?: ConfirmFormErrors; refresh?: boolean };

type ConfirmItem = { name?: string; by?: string | null; at?: string; reason?: string };

export async function confirmPickupAction(input: ConfirmFormInput): Promise<ConfirmResult> {
  try {
    if (!(await isAdmin())) return { ok: false, message: NOT_ALLOWED };
    const parsed = parseConfirmForm(input);
    if (!parsed.ok) return { ok: false, message: parsed.message ?? "Confira os campos destacados.", errors: parsed.errors };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_confirm_shirt_pickup", { p_ids: parsed.ids, p_pickup: parsed.pickup });
    if (error) return { ok: false, message: explain(error) };

    const result = data as { status?: string; batch?: string; count?: number; items?: ConfirmItem[] } | null;
    const items = result?.items ?? [];
    if (result?.status === "not_found") return { ok: false, message: NOT_FOUND, refresh: true };
    if (result?.status === "already") {
      const lines = items.map(
        (i) => `${displayName(i.name ?? "")} (entregue${i.by ? ` por ${i.by}` : ""}${i.at ? ` em ${formatDateTime(i.at)}` : ""})`,
      );
      return { ok: false, message: `Camisa já retirada: ${joinNames(lines)}. Nada foi alterado.`, refresh: true };
    }
    if (result?.status === "blocked") {
      const lines = items.map(
        (i) => `${displayName(i.name ?? "")} (${i.reason === "sem_cadastro" ? "sem cadastro em Documentos" : "check-in pendente"})`,
      );
      return { ok: false, message: `A retirada só é liberada depois do check-in: ${joinNames(lines)}. Nada foi alterado.`, refresh: true };
    }
    if (result?.status !== "ok" || !result.batch) return { ok: false, message: "Não foi possível confirmar. Tente de novo." };
    refresh();

    const head = (result.count ?? 1) > 1 ? `${result.count} retiradas confirmadas.` : "Retirada confirmada.";
    try {
      const mail = mailSentence(await sendBatchEmails(supabase, result.batch));
      refresh();
      return { ok: true, message: `${head} ${mail.text}`, warn: mail.warn };
    } catch (mailError) {
      // A retirada já está gravada: a falha do e-mail só muda o aviso.
      console.error("Error sending shirt pickup e-mails:", mailError);
      return { ok: true, message: `${head} O e-mail não foi enviado. Use “Reenviar e-mail” na linha do atleta.`, warn: true };
    }
  } catch (error) {
    console.error("Error in confirmPickupAction:", error);
    return { ok: false, message: "Não foi possível confirmar. Verifique a conexão e tente de novo." };
  }
}

/** Reenvia o e-mail da retirada para o endereço do atleta desta linha. */
export async function resendPickupEmailAction(id: string): Promise<SimpleResult> {
  try {
    if (!(await isAdmin())) return { ok: false, message: NOT_ALLOWED };
    if (!isPickupId(id)) return { ok: false, message: NOT_FOUND };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("athlete_shirt_pickups")
      .select("email, pickup_batch, picked_up_at")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle<{ email: string; pickup_batch: string | null; picked_up_at: string | null }>();
    if (error) return { ok: false, message: explain(error) };
    if (!data) return { ok: false, message: NOT_FOUND };
    if (!data.picked_up_at || !data.pickup_batch) return { ok: false, message: "Esta camisa não está marcada como retirada. Atualize a página." };

    const mail = mailSentence(await sendBatchEmails(supabase, data.pickup_batch, data.email));
    refresh();
    return mail.warn ? { ok: false, message: mail.text } : { ok: true, message: mail.text };
  } catch (error) {
    console.error("Error in resendPickupEmailAction:", error);
    return { ok: false, message: "Não foi possível reenviar o e-mail. Tente de novo." };
  }
}
