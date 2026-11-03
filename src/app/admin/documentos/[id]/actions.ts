"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { parseEditForm, parseResetForm, resetReasonText, type EditErrors, type EditFormInput } from "@/lib/checkin/admin";
import { isUuid } from "@/lib/checkin/code";
import { displayName, type Competition } from "@/lib/checkin/sheet";
import { competitionTitle } from "@/lib/checkin/terms";
import { sendCheckinReopenedEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type DbError = { message: string; code?: string };

/** Server Actions são endpoints públicos: confere o admin em toda chamada (o banco confere de novo). */
async function isAdmin() {
  const profile = await getCurrentProfile();
  return !!profile?.active && profile.role === "admin";
}

function explain(error: DbError): string {
  if (error.message.includes("not_authorized")) return "Sem permissão para esta ação. Entre com a conta de administrador.";
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01") {
    return "As migrations do check-in ainda não foram aplicadas neste banco (npm run db:push).";
  }
  if (error.message.includes("note_required")) return "Escreva o motivo.";
  if (error.message.includes("invalid_reason")) return "Escolha o motivo.";
  if (error.code === "23514" || error.code === "23502") return "Algum valor está fora do permitido. Confira os campos e tente de novo.";
  console.error("Error in athlete admin action:", error);
  return "Não foi possível salvar. Tente de novo.";
}

const refresh = (athleteId: string) => {
  revalidatePath(`/admin/documentos/${athleteId}`);
  revalidatePath("/admin/documentos");
  revalidatePath("/check-in");
};

export type EditResult = { ok: true; message: string } | { ok: false; message: string; errors?: EditErrors };

export async function updateAthleteAction(athleteId: string, input: EditFormInput): Promise<EditResult> {
  try {
    if (!(await isAdmin())) return { ok: false, message: "Sem permissão para esta ação. Entre com a conta de administrador." };
    if (typeof athleteId !== "string" || !isUuid(athleteId)) return { ok: false, message: "Atleta não encontrado." };
    const parsed = parseEditForm(input);
    if (!parsed.ok) return { ok: false, message: "Confira os campos destacados.", errors: parsed.errors };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_update_athlete", {
      p_athlete: athleteId,
      p_athlete_fields: parsed.athlete,
      p_registration_fields: parsed.registration,
    });
    if (error) return { ok: false, message: explain(error) };

    const status = (data as { status?: string } | null)?.status;
    if (status === "not_found") return { ok: false, message: "Atleta não encontrado." };
    if (status === "unchanged") return { ok: true, message: "Nada mudou: o cadastro já estava assim." };
    refresh(athleteId);
    return { ok: true, message: "Cadastro salvo." };
  } catch (error) {
    console.error("Error in updateAthleteAction:", error);
    return { ok: false, message: "Não foi possível salvar. Verifique a conexão e tente de novo." };
  }
}

/** Como o aviso ao atleta terminou; a página mostra a frase correspondente. */
export type ResetNotice = "avisado" | "sem-aviso" | "sem-provedor" | "falhou";

export type ResetResult = { ok: true; notice: ResetNotice } | { ok: false; message: string; field?: "reason" | "note" };

export async function resetCheckinAction(athleteId: string, input: { reason: string; note: string; notify: boolean }): Promise<ResetResult> {
  try {
    if (!(await isAdmin())) return { ok: false, message: "Sem permissão para esta ação. Entre com a conta de administrador." };
    if (typeof athleteId !== "string" || !isUuid(athleteId)) return { ok: false, message: "Atleta não encontrado." };
    const parsed = parseResetForm(input);
    if (!parsed.ok) return parsed;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_reset_athlete_checkin", {
      p_athlete: athleteId,
      p_reason: parsed.reason,
      p_note: parsed.note,
    });
    if (error) return { ok: false, message: explain(error) };

    const status = (data as { status?: string } | null)?.status;
    if (status === "not_found") return { ok: false, message: "Atleta não encontrado." };
    if (status === "none") return { ok: false, message: "Este atleta não tem check-in para refazer. Atualize a página." };
    refresh(athleteId);

    if (!parsed.notify) return { ok: true, notice: "sem-aviso" };
    return { ok: true, notice: await notifyAthlete(athleteId, resetReasonText(parsed.reason, parsed.note)) };
  } catch (error) {
    console.error("Error in resetCheckinAction:", error);
    return { ok: false, message: "Não foi possível refazer o check-in. Verifique a conexão e tente de novo." };
  }
}

/** Avisa pelo e-mail da inscrição. Nunca desfaz o reset. */
async function notifyAthlete(athleteId: string, reason: string): Promise<ResetNotice> {
  try {
    const { data, error } = await createAdminClient()
      .from("athletes")
      .select("full_name, athlete_registrations!inner(email, competition)")
      .eq("id", athleteId)
      .single();
    if (error || !data) throw new Error(error?.message ?? "atleta não encontrado");
    const reg = (Array.isArray(data.athlete_registrations) ? data.athlete_registrations[0] : data.athlete_registrations) as {
      email: string;
      competition: Competition;
    };
    const sent = await sendCheckinReopenedEmail({
      to: reg.email,
      athleteName: displayName(data.full_name),
      competition: competitionTitle(reg.competition),
      reason,
      checkinUrl: `${siteUrl()}/check-in`,
    });
    return sent ? "avisado" : "sem-provedor";
  } catch (error) {
    console.error("Error sending check-in reopened email:", error);
    return "falhou";
  }
}
