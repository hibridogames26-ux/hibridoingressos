"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { parseCreateForm, type CreateErrors, type CreateFormInput } from "@/lib/checkin/admin";
import { displayName } from "@/lib/checkin/sheet";
import { competitionTitle } from "@/lib/checkin/terms";
import { sendCheckinAvailableEmail } from "@/lib/email";
import { siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

type DbError = { message: string; code?: string };

/** Server Actions são endpoints públicos: confere o admin em toda chamada (o banco confere de novo). */
async function isAdmin() {
  const profile = await getCurrentProfile();
  return !!profile?.active && profile.role === "admin";
}

function explain(error: DbError): string {
  if (error.message.includes("not_authorized")) return "Sem permissão para esta ação. Entre com a conta de administrador.";
  if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01" || error.code === "42703") {
    return "As migrations do check-in ainda não foram aplicadas neste banco (npm run db:push).";
  }
  if (error.message.includes("invalid_athletes")) return "Confira os atletas: 1 no individual, 2 na dupla, todos com nome.";
  if (error.code === "23514" || error.code === "23502") return "Algum valor está fora do permitido. Confira os campos e tente de novo.";
  console.error("Error in create registration action:", error);
  return "Não foi possível salvar. Tente de novo.";
}

/** Como o aviso por e-mail terminou; a página do atleta mostra a frase correspondente. */
export type CreateNotice = "avisado" | "sem-aviso" | "sem-provedor" | "falhou";

export type CreateResult =
  | { ok: true; athleteId: string; notice: CreateNotice }
  | { ok: false; message: string; errors?: CreateErrors; duplicate?: { athleteId: string; name: string } };

export async function createRegistrationAction(input: CreateFormInput & { notify?: boolean }): Promise<CreateResult> {
  try {
    if (!(await isAdmin())) return { ok: false, message: "Sem permissão para esta ação. Entre com a conta de administrador." };
    const parsed = parseCreateForm(input);
    if (!parsed.ok) return { ok: false, message: "Confira os campos destacados.", errors: parsed.errors };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_create_registration", {
      p_registration: parsed.registration,
      p_athletes: parsed.athletes,
    });
    if (error) return { ok: false, message: explain(error) };

    const result = data as { status?: string; athlete_ids?: string[]; athlete_id?: string; name?: string } | null;
    if (result?.status === "duplicate" && result.athlete_id) {
      const name = displayName(result.name ?? "");
      return {
        ok: false,
        message: `${name} já está cadastrado nesta competição com este e-mail.`,
        duplicate: { athleteId: result.athlete_id, name },
      };
    }
    const athleteId = result?.athlete_ids?.[0];
    if (result?.status !== "ok" || !athleteId) return { ok: false, message: "Não foi possível salvar. Tente de novo." };

    revalidatePath("/admin/documentos");
    revalidatePath("/check-in");

    if (input?.notify !== true) return { ok: true, athleteId, notice: "sem-aviso" };
    try {
      const sent = await sendCheckinAvailableEmail({
        to: parsed.registration.email,
        athletes: parsed.athletes.map((a) => displayName(a.full_name)),
        competition: competitionTitle(parsed.registration.competition),
        checkinUrl: `${siteUrl()}/check-in`,
      });
      return { ok: true, athleteId, notice: sent ? "avisado" : "sem-provedor" };
    } catch (mailError) {
      // O cadastro já foi criado: a falha do e-mail só muda o aviso.
      console.error("Error sending check-in available email:", mailError);
      return { ok: true, athleteId, notice: "falhou" };
    }
  } catch (error) {
    console.error("Error in createRegistrationAction:", error);
    return { ok: false, message: "Não foi possível salvar. Verifique a conexão e tente de novo." };
  }
}
